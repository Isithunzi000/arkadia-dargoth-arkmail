/**
 * PagerSession: efemeryczne transakcje pagerowe.
 * Pager konsumuje WSZYSTKIE linie wejscia gracza az do "q" - dlatego
 * sesja jest krotka: otworz (przeczytaj list N) -> akcja -> q -> prompt.
 * Wszystkie operacje pagerowe (delete/forward/read) dziela ten szkielet.
 *
 * Przenosnosc: koniec transakcji wykrywamy po klasie 'prompt' ALBO po
 * samej tresci ("> "). Cisza moze pomoc wykryc niewidoczny prompt pagera
 * i wyslac q, ale nigdy nie potwierdza zamkniecia transakcji.
 */

import {
  extractPagerPrompt,
  LISTS_LOADING_RE,
  parseLetterHeaderLine,
  parseMailError,
} from '../protocol/parser.js';
import type { MailError, PagerPrompt } from '../protocol/types.js';
import { isEchoLine, isPromptLine } from './lines.js';
import { clearPagerOrphan, suspectPagerOrphan } from './orphanPager.js';
import { AmbiguousResponseError } from './errors.js';
import type { ProtoLine, Transport } from './transport.js';
import type { SessionOptions } from './mailbox.js';
import { DEFAULT_IDLE_FLUSH_MS, LISTS_LOADING_RETRY_MS } from './mailbox.js';

/** Minimalny czas grace przy zamykaniu sesji pagera (ms). */
const CLOSE_GRACE_MS = 400;

export interface LetterContent {
  number: number;
  from: string;
  subject: string;
  to: string;
  cc: string | null;
  date: string | null;
  body: string[];
}

export interface ReadResult {
  letter: LetterContent;
  pager: PagerPrompt;
}

export type DeleteStatus = 'complete' | 'partial' | 'none' | 'unknown';

export interface DeleteResult {
  status: DeleteStatus;
  deleted: boolean;
  /** Fizyczne potwierdzenia "Kasuje: N." z zakresu zadania. */
  deletedNumbers: number[];
  /** Numery z odpowiedzi "Zaznaczono do skasowania". */
  selectedNumbers: number[];
  /** Fizyczne potwierdzenia spoza zakresu zadania. */
  unexpectedNumbers: number[];
}

const numbersInRange = (range: string): number[] => {
  const out = new Set<number>();
  for (const part of range.split(',')) {
    const m = part.trim().match(/^(\d+)(?:-(\d+))?$/);
    if (!m) continue;
    const from = Number(m[1]);
    const to = m[2] === undefined ? from : Number(m[2]);
    const step = from <= to ? 1 : -1;
    for (let n = from; step > 0 ? n <= to : n >= to; n += step) out.add(n);
  }
  return [...out].sort((a, b) => a - b);
};

const rangeOf = (numbers: readonly number[]): string => {
  const sorted = [...new Set(numbers)].sort((a, b) => a - b);
  const parts: string[] = [];
  for (let i = 0; i < sorted.length; ) {
    const from = sorted[i]!;
    let to = from;
    while (i + 1 < sorted.length && sorted[i + 1] === to + 1) to = sorted[++i]!;
    parts.push(from === to ? String(from) : `${from}-${to}`);
    i++;
  }
  return parts.join(',');
};

const sameNumbers = (a: readonly number[], b: readonly number[]): boolean =>
  a.length === b.length && a.every((n, i) => n === b[i]);

/**
 * Numery z potwierdzenia readera ("Zaznaczono do skasowania: ...",
 * "Kasuje: ..."). Serwer LACZY numery spojnikiem " i " i rozwija zakresy
 * (log 2026-10-30: "d 1,4" -> "Zaznaczono do skasowania: 1 i 4.",
 * wyjscie -> "Kasuje: 1 i 4."), wiec bierzemy wszystkie liczby z
 * odebranej czesci linii, bez narzucania separatora.
 */
const numbersOfConfirmation = (text: string): number[] =>
  [...text.matchAll(/\d+/g)].map((m) => Number(m[0]));

export interface ForwardResult {
  /** true = list w kolejce niewyslanych ("List jest gotowy do wyslania."). */
  queued: boolean;
  error: MailError | null;
}

type State = 'letter' | 'pager' | 'dw-subdialog' | 'closing' | 'recovering';

/** Odrzucenie komendy przez OBCY pager (sierota po timeoutcie sesji,
 *  log 2026-10-18): pager konsumuje wszystko az do "q".
 *  Fala 12a: bez kotwic - klient skleja odrzucenie z promptem pagera
 *  w jednej linii ("[1-50 ...] -- Nie ma takiej komendy. ..."). */
const PAGER_REJECTION_RE = /Nie ma takiej komendy\./;

/** Szkielet transakcji pagerowej; handler akcji podpiety miedzy
 *  otwarciem a zamknieciem. */

/** Liczba kolejnych prob advance (pusty Enter na more-prompt) po ciszy
 *  w stanie 'letter'. Wyczerpanie = dawne zachowanie: domkniecie "q".
 *  More-prompt na ekranie to samotne ">", nierozroznialne od innych
 *  linii, wiec strone wykrywamy po MILCZENIU serwera po burstcie tresci. */
const ADVANCE_MAX_TRIES = 3;

export class PagerSession {
  constructor(
    private readonly transport: Transport,
    private readonly opts: SessionOptions,
  ) {}

  /**
   * Odczyt listu. shouldAbort (Fala 17a, zgloszenie pkt 4): Przerwij
   * petli pobierania w trakcie odczytu - sesja domyka pager od razu
   * ("q" tylko gdy pager faktycznie otwarty albo naglowki kompletne;
   * przed otwarciem zadnego smieciowego "q") i odrzuca "przerwano",
   * zamiast wisiec do timeoutu z otwartym pagerem serwera.
   */
  readLetter(numer: number, shouldAbort?: () => boolean): Promise<ReadResult> {
    return this.run(numer, () => null, (letter, pager) => ({ letter, pager }), shouldAbort);
  }

  deleteLetters(numer: number, zakres: string, shouldAbort?: () => boolean): Promise<DeleteResult> {
    const requested = numbersInRange(zakres);
    let selectedNumbers: number[] = [];
    let confirmed: number[] = [];
    let deleteSent = false;
    let selectionAccepted = false;
    let uncertain = false;
    const build = (): DeleteResult => {
      const deletedNumbers = [...new Set(confirmed)]
        .filter((n) => requested.includes(n))
        .sort((a, b) => a - b);
      const unexpectedNumbers = [...new Set(confirmed)]
        .filter((n) => !requested.includes(n))
        .sort((a, b) => a - b);
      const complete = requested.length > 0 && unexpectedNumbers.length === 0 &&
        requested.every((n) => deletedNumbers.includes(n));
      const status: DeleteStatus = uncertain
        ? 'unknown'
        : complete
          ? 'complete'
          : deletedNumbers.length > 0
            ? 'partial'
            : selectionAccepted
              ? 'unknown'
              : 'none';
      return { status, deleted: deletedNumbers.length > 0, deletedNumbers, selectedNumbers, unexpectedNumbers };
    };
    return this.run(
      numer,
      (ctx) => {
        const withdraw = (): void => {
          if (deleteSent && !selectionAccepted) ctx.send(`u ${rangeOf([...requested, ...selectedNumbers])}`);
        };
        return {
          onPager: () => {
            deleteSent = true;
            ctx.send(`d ${zakres}`);
          },
          onLine: (line: ProtoLine) => {
            const m = line.text.match(/^Zaznaczono do skasowania: (.+)\.$/);
            if (m) {
              selectedNumbers = [...new Set(numbersOfConfirmation(m[1]))].sort((a, b) => a - b);
              if (!sameNumbers(selectedNumbers, requested)) {
                withdraw();
                return 'close';
              }
              selectionAccepted = true;
              return 'close';
            }
            return parseMailError(line.text) ? 'close' : undefined;
          },
          onClosingLine: (line: ProtoLine) => {
            const m = line.text.match(/^Kasuje: (.+)\.$/);
            if (m) {
              for (const n of numbersOfConfirmation(m[1])) confirmed.push(n);
            }
          },
          onAbort: withdraw,
          onTimeout: withdraw,
          onCancel: () => {
            if (!deleteSent) return;
            withdraw();
            ctx.send('q');
          },
        };
      },
      build,
      shouldAbort,
    ).catch((error: unknown) => {
      if (!deleteSent) throw error;
      uncertain = true;
      return build();
    });
  }

  forwardLetter(numer: number, adresat: string): Promise<ForwardResult> {
    let queued = false;
    let error: MailError | null = null;
    let dwAnswered = false;
    return this.run(
      numer,
      (ctx) => ({
        onPager: () => ctx.send(`f ${adresat}`),
        onLine: (line: ProtoLine) => {
          const err = parseMailError(line.text);
          if (err && err.kind === 'brak-adresata') {
            // Blad w subdialogu DW (albo glownego adresata) - serwer
            // bedzie powtarzal DW:; odpowiadamy raz pusta linia.
            if (!error) error = err;
            return undefined;
          }
          if (/^DW: *$/.test(line.text)) {
            if (!dwAnswered) {
              dwAnswered = true;
              ctx.send('');
            }
            return undefined;
          }
          if (line.text === 'List jest gotowy do wyslania.') {
            queued = true;
            return 'close';
          }
          return undefined;
        },
      }),
      () => ({ queued, error }),
    );
  }

  /**
   * Otwiera pager na liscie `numer`, wykonuje akcje, zamyka "q".
   * onPager: odpalane przy pierwszym pager prompt (wyslij akcje).
   * onLine: moze zwrocic 'close' -> wysylamy "q" przy najblizszym
   * pager prompcie. Konczy sie wylacznie na zwyklym promptcie gry
   * (klasa albo tresc); brak promptu odrzuca dopiero pelny limit czasu.
   */
  private run<T>(
    numer: number,
    makeActions: (ctx: { send: (l: string) => void }) => {
      onPager?: () => void;
      onLine?: (line: ProtoLine) => 'close' | undefined;
      onClosingLine?: (line: ProtoLine) => void;
      onAbort?: () => void;
      onTimeout?: () => void;
      onCancel?: () => void;
    } | null,
    build: (letter: LetterContent, pager: PagerPrompt) => T,
    shouldAbort?: () => boolean,
  ): Promise<T> {
    return new Promise((resolve, reject) => {
      const session = this.transport.openSession();
      const letter: LetterContent = {
        number: numer, from: '', subject: '', to: '', cc: null, date: null, body: [],
      };
      let pager: PagerPrompt = { lo: 0, hi: 0, current: numer };
      let state: State = 'letter';
      let headersDone = false;
      let wantClose = false;
      let pagerFired = false;
      /** Fala 12a: akcja odpalona z idle-completion (prompt nie doszedl). */
      let idleOpened = false;
      let retried = false;
      /** Fala 16b: jeden retry odczytu po throttle "Listy sa w tej
       *  chwili ladowane." (jak w mailbox). */
      let loadRetried = false;
      let loadRetryTimer: ReturnType<typeof setTimeout> | null = null;
      let done = false;
      let ambiguous: string | null = null;
      /** Kolejne proby advance po ciszy; zeruje kazda linia body albo
       *  prompt pagera (serwer odpowiada = strona nie czeka). */
      let advances = 0;
      const idleMs = this.opts.idleMs ?? DEFAULT_IDLE_FLUSH_MS;
      let quietTimer: ReturnType<typeof setTimeout> | null = null;
      let graceTimer: ReturnType<typeof setTimeout> | null = null;
      let cancelUnsub: () => void = () => {};
      const cleanup = () => {
        done = true;
        clearTimeout(timer);
        if (quietTimer) clearTimeout(quietTimer);
        if (graceTimer) clearTimeout(graceTimer);
        if (loadRetryTimer) clearTimeout(loadRetryTimer);
        cancelUnsub();
        session.close();
      };
      const fail = (error: unknown): void => {
        if (done) return;
        cleanup();
        reject(error instanceof Error ? error : new Error(String(error)));
      };
      /** Wszystkie komendy transakcji, takze akcje i q, maja obsluge
       *  odrzucenia i wspolne, jednokrotne sprzatanie. */
      const send = (line: string): void => {
        if (done) return;
        try {
          void Promise.resolve(this.transport.send(line)).catch(fail);
        } catch (error: unknown) {
          fail(error);
        }
      };
      const actions = makeActions({ send });

      /** Fala 17a: Przerwij w trakcie sesji (shouldAbort z zewnnatrz). */
      let aborted = false;
      const finish = (confirmed = true) => {
        cleanup();
        if (aborted) {
          reject(new Error(`pager session list ${numer}: przerwano`));
          return;
        }
        if (ambiguous !== null) {
          if (confirmed) clearPagerOrphan();
          else suspectPagerOrphan();
          reject(new AmbiguousResponseError(ambiguous));
          return;
        }
        // Fala 24g: czyste zamkniecie transakcji = komendy dochodza,
        // sieroty po nas nie ma - zdejmij podejrzenie straznika.
        if (confirmed) clearPagerOrphan();
        else suspectPagerOrphan();
        resolve(build(letter, pager));
      };

      /**
       * Fala 17a: sprawdzenie abortu na kazdej linii i przy ciszy.
       * Pager otwarty (albo naglowki kompletne - protokol zawsze otwiera
       * pager po odczycie) = domykamy "q" i odrzucamy po domknieciu.
       * Pager nieotwarty = odrzucamy od razu, BEZ smieciowego "q"
       * (q bez pagera = "Slucham?" i smieciowa komenda w grze).
       */
      const checkAbort = (): void => {
        if (done || aborted || !shouldAbort || !shouldAbort()) return;
        aborted = true;
        actions?.onAbort?.();
        if (state === 'pager' || pagerFired || idleOpened || headersDone) {
          if (state !== 'closing') enterClosing();
          return;
        }
        cleanup();
        reject(new Error(`pager session list ${numer}: przerwano`));
      };

      /**
       * Fala 12a: cisza po naglowku "Data:" = body kompletne, nawet gdy
       * prompt pagera nie dojdzie jako linia (klient trzyma linie bez
       * znaku nowej linii - log 2026-10-18, odczyt wisial do timeoutu).
       * Protokol gry ZAWSZE otwiera pager po odczycie, wiec przy ciszy
       * dzialamy tak, jakby prompt przyszedl: odpalamy akcje albo
       * zamykamy "q". Cisza w stanie 'pager' z wantClose/idleOpened
       * tez domyka - drugi prompt pagera bywa rownie niewidoczny.
       */
      const onQuiet = () => {
        if (done) return;
        checkAbort(); // Fala 17a: cisza po Przerwij tez domyka sesje
        if (done || aborted) return;
        if (state === 'letter' && headersDone) {
          if (advances < ADVANCE_MAX_TRIES) {
            // Cisza po burstcie tresci: serwer moze stronicowac list i
            // czekac na more-prompt (samotne ">" na ekranie, niewidoczne
            // w triggerach). Wysylamy advance i czekamy dalej; kazda
            // odpowiedz serwera zeruje licznik. Po wyczerpaniu prob
            // wracamy do dawnego zachowania (Fala 12a): cisza = body
            // kompletne.
            advances++;
            send('');
            if (!done) armQuiet();
            return;
          }
          state = 'pager';
          pagerFired = true;
          idleOpened = true;
          if (actions && actions.onPager) {
            actions.onPager();
            if (!done) armQuiet(); // potwierdzenie akcji albo domkniecie po ciszy
          } else {
            enterClosing();
          }
          return;
        }
        if (state === 'pager' && (wantClose || idleOpened)) enterClosing();
      };
      const armQuiet = () => {
        if (quietTimer) clearTimeout(quietTimer);
        quietTimer = setTimeout(onQuiet, idleMs);
      };

      /**
       * Fala 12a: timeout najpierw UBIA ewentualny pager ("q" + krotka
       * grace na jego domkniecie), dopiero potem reject. Sierocy pager
       * konsumowalby kolejne komendy gracza ("Nie ma takiej komendy").
       * Prompt gry w grace = serwer jednak odpowiedzial -> finish().
       */
      const timer = setTimeout(() => {
        actions?.onTimeout?.();
        // Fala 24g: timeout z pagerem (byc moze) otwartym na serwerze -
        // "q" wyslane, ale bez potwierdzenia. Straznik dostaje
        // podejrzenie: przy najblizszym promptcie pagera poza sesja
        // domknie sierote (bez podejrzenia prompt = sesja gracza).
        if (state === 'closing') {
          this.transport.beginRecovery();
          suspectPagerOrphan();
          cleanup();
          reject(new Error(`timeout: pager session list ${numer}`));
          return;
        }
        state = 'closing';
        wantClose = false;
        idleOpened = false;
        send('q');
        if (!done) {
          graceTimer = setTimeout(() => {
            this.transport.beginRecovery();
            suspectPagerOrphan();
            cleanup();
            reject(new Error(`timeout: pager session list ${numer}`));
          }, Math.max(idleMs, CLOSE_GRACE_MS));
        }
      }, this.opts.timeoutMs);

      const enterClosing = () => {
        wantClose = false;
        idleOpened = false;
        state = 'closing';
        if (quietTimer) clearTimeout(quietTimer);
        send('q');
      };

      session.subscribe((line: ProtoLine) => {
        // Echo wlasnych komend: po klasie albo po samej tresci.
        if (done || line.cls === 'command' || isEchoLine(line.text)) return;

        checkAbort(); // Fala 17a: Przerwij petli domyka pager w toku
        if (done) return;

        if (state === 'closing') {
          if (line.cls === 'prompt' || isPromptLine(line.text)) {
            finish();
            return;
          }
          actions?.onClosingLine?.(line);
          return;
        }

        // Fala 11g: odbudowa po odrzuceniu przez sierocy pager. Czekamy
        // na prompt gry po naszym "q" i ponawiamy komende odczytu.
        if (state === 'recovering') {
          if (line.cls === 'prompt' || isPromptLine(line.text)) {
            state = 'letter';
            send(`przeczytaj list ${numer}`);
          }
          return;
        }
        if (state === 'letter' && !headersDone && PAGER_REJECTION_RE.test(line.text)) {
          // Kazde odrzucenie zamykamy "q" - sierota nie zostaje po nas.
          send('q');
          if (done) return;
          if (retried) {
            // Fala 24g: drugie odrzucenie = pager przetrwal pierwsze
            // "q"; drugie wlasnie poszlo bez potwierdzenia - sierota
            // moze trwac. Podejrzenie dla straznika.
            suspectPagerOrphan();
            cleanup();
            reject(new Error(`pager session list ${numer}: odrzucono przez sierocy pager`));
            return;
          }
          retried = true;
          state = 'recovering';
          return;
        }

        // Fala 14f: linia-blad serwera na "przeczytaj list N" (np. "Zly
        // numer listu: N." po zmianie kontekstu listingu, albo "Zadne
        // listy nie zostaly wybrane." po pustym listingu - log
        // 2026-10-19 04:22:39). Pager NIE zostal otwarty, wiec odrzucamy
        // od razu i BEZ "q" (q bez pagera = smieciowa komenda; stary kod
        // ignorowal te linie i sesja wisiala do timeoutu ~8 s).
        if (state === 'letter' && !headersDone) {
          // Fala 16b: throttle serwera "Listy sa w tej chwili ladowane."
          // tez przy odczycie (klik w list zaraz po logowaniu - cisza
          // do timeoutu, zgloszenie pkt 3). Jeden retry komendy po
          // ~2 s; powtorka = blad od razu (bez "q" - pager nieotwarty).
          if (LISTS_LOADING_RE.test(line.text)) {
            if (loadRetried) {
              cleanup();
              reject(new Error(`pager session list ${numer}: Listy sa w tej chwili ladowane.`));
              return;
            }
            loadRetried = true;
            loadRetryTimer = setTimeout(() => {
              if (!done && state === 'letter') {
                send(`przeczytaj list ${numer}`);
              }
            }, LISTS_LOADING_RETRY_MS);
            return;
          }
          const mailErr = parseMailError(line.text);
          if (mailErr) {
            cleanup();
            reject(new Error(`pager session list ${numer}: ${line.text.trim()}`));
            return;
          }
        }

        // Fala 12a: extractPagerPrompt znajduje tez prompt sklejony
        // z inna trescia w jednej linii (isPagerPrompt bylby slepy).
        const pp = extractPagerPrompt(line.text);
        if (pp) {
          if (pp.current !== numer) {
            ambiguous = `prompt pagera list ${pp.current} podczas odczytu ${numer}`;
            enterClosing();
            return;
          }
          advances = 0; // prompt pagera = serwer odpowiedzial
          if (quietTimer) clearTimeout(quietTimer);
          pager = pp;
          state = 'pager';
          if (pagerFired && wantClose) {
            enterClosing();
            return;
          }
          if (!pagerFired) {
            pagerFired = true;
            if (actions && actions.onPager) {
              actions.onPager();
              return;
            }
            // brak akcji: czytamy i zamykamy
            enterClosing();
            return;
          }
          return;
        }

        if (state === 'letter' && !headersDone) {
          const h = parseLetterHeaderLine(line.text);
          if (h) {
            if (h.field === 'numer') {
              const received = Number(h.value);
              if (received !== numer) {
                ambiguous = `naglowek list ${h.value} podczas odczytu ${numer}`;
                enterClosing();
                return;
              }
              letter.number = received;
            } else if (h.field === 'od') letter.from = h.value;
            else if (h.field === 'temat') letter.subject = h.value;
            else if (h.field === 'do') letter.to = h.value;
            else if (h.field === 'dw') letter.cc = h.value;
            else if (h.field === 'data') {
              letter.date = h.value;
              headersDone = true;
              // Body moze byc puste (pusta linia i koniec) - cisza po
              // naglowkach tez ma domknac sesje (prompt nie musi dojsc).
              armQuiet();
            }
            return;
          }
          return;
        }

        if (state === 'letter') {
          letter.body.push(line.text);
          advances = 0; // serwer odpowiada = strona nie czeka na advance
          armQuiet(); // kazda linia body odracza idle-completion
          return;
        }

        // state 'pager': obsluga linii akcji (potwierdzenia, subdialogi, bledy)
        if (actions && actions.onLine) {
          const verdict = actions.onLine(line);
          if (verdict === 'close') wantClose = true;
        }
        armQuiet(); // cisza po akcji tez domyka (drugi prompt bywa niewidoczny)
      });

      cancelUnsub = this.opts.onCancel?.(() => {
        actions?.onCancel?.();
        cleanup();
        reject(new Error('operacja anulowana'));
      }) ?? (() => {});
      if (!done) send(`przeczytaj list ${numer}`);
    });
  }
}
