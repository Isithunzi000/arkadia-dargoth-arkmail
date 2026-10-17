/**
 * PagerSession: efemeryczne transakcje pagerowe.
 * Pager konsumuje WSZYSTKIE linie wejscia gracza az do "q" - dlatego
 * sesja jest krotka: otworz (przeczytaj list N) -> akcja -> q -> prompt.
 * Wszystkie operacje pagerowe (delete/forward/read) dziela ten szkielet.
 *
 * Przenosnosc: koniec transakcji wykrywamy po klasie 'prompt' ALBO po
 * samej tresci ("> "), a gdy prompt w ogole nie dojdzie do triggerow -
 * idle-flush po wejsciu w stan 'closing'.
 */

import {
  isPagerPrompt,
  parseLetterHeaderLine,
  parseMailError,
} from '../protocol/parser.js';
import type { MailError, PagerPrompt } from '../protocol/types.js';
import { isEchoLine, isPromptLine } from './lines.js';
import type { ProtoLine, Transport } from './transport.js';
import type { SessionOptions } from './mailbox.js';

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

export interface DeleteResult {
  deleted: boolean;
  deletedNumbers: number[];
}

export interface ForwardResult {
  /** true = list w kolejce niewyslanych ("List jest gotowy do wyslania."). */
  queued: boolean;
  error: MailError | null;
}

type State = 'letter' | 'pager' | 'dw-subdialog' | 'closing';

/** Szkielet transakcji pagerowej; handler akcji podpiety miedzy
 *  otwarciem a zamknieciem. */
export class PagerSession {
  constructor(
    private readonly transport: Transport,
    private readonly opts: SessionOptions,
  ) {}

  readLetter(numer: number): Promise<ReadResult> {
    return this.run(numer, () => null, (letter, pager) => ({ letter, pager }));
  }

  deleteLetters(numer: number, zakres: string): Promise<DeleteResult> {
    let deletedNumbers: number[] = [];
    return this.run(
      numer,
      (ctx) => ({
        onPager: () => ctx.send(`d ${zakres}`),
        onLine: (line: ProtoLine) => {
          const m = line.text.match(/^Zaznaczono do skasowania: ([\d, ]+)\.$/);
          if (m) {
            deletedNumbers = m[1].split(',').map((s) => Number(s.trim())).filter((n) => !Number.isNaN(n));
          }
          // Po potwierdzeniu zaznaczenia wracamy do pagera i zamykamy.
          return m ? 'close' : undefined;
        },
      }),
      () => ({ deleted: deletedNumbers.length > 0, deletedNumbers }),
    );
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
   * pager prompcie. Konczy sie na linii promptu (klasa albo tresc)
   * albo idle-flush po "q".
   */
  private run<T>(
    numer: number,
    makeActions: (ctx: { send: (l: string) => void }) => {
      onPager?: () => void;
      onLine?: (line: ProtoLine) => 'close' | undefined;
    } | null,
    build: (letter: LetterContent, pager: PagerPrompt) => T,
  ): Promise<T> {
    return new Promise((resolve, reject) => {
      const letter: LetterContent = {
        number: numer, from: '', subject: '', to: '', cc: null, date: null, body: [],
      };
      let pager: PagerPrompt = { lo: 0, hi: 0, current: numer };
      let state: State = 'letter';
      let headersDone = false;
      let wantClose = false;
      let pagerFired = false;
      let done = false;
      const idleMs = this.opts.idleMs ?? 600;
      let idleTimer: ReturnType<typeof setTimeout> | null = null;
      const actions = makeActions({ send: (l) => this.transport.send(l) });

      const cleanup = () => {
        done = true;
        clearTimeout(timer);
        if (idleTimer) clearTimeout(idleTimer);
        unsub();
      };
      const finish = () => {
        cleanup();
        resolve(build(letter, pager));
      };

      /** Bezpiecznik: cisza po wyslaniu "q" = transakcja zakonczona. */
      const armIdle = () => {
        if (idleTimer) clearTimeout(idleTimer);
        idleTimer = setTimeout(() => {
          if (!done && state === 'closing') finish();
        }, idleMs);
      };

      const timer = setTimeout(() => {
        cleanup();
        reject(new Error(`timeout: pager session list ${numer}`));
      }, this.opts.timeoutMs);

      const enterClosing = () => {
        wantClose = false;
        state = 'closing';
        this.transport.send('q');
        armIdle();
      };

      const unsub = this.transport.subscribe((line: ProtoLine) => {
        // Echo wlasnych komend: po klasie albo po samej tresci.
        if (done || line.cls === 'command' || isEchoLine(line.text)) return;

        if (state === 'closing') {
          if (line.cls === 'prompt' || isPromptLine(line.text)) {
            finish();
            return;
          }
          armIdle();
          return;
        }

        const pp = isPagerPrompt(line.text);
        if (pp) {
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
            if (h.field === 'numer') letter.number = Number(h.value);
            else if (h.field === 'od') letter.from = h.value;
            else if (h.field === 'temat') letter.subject = h.value;
            else if (h.field === 'do') letter.to = h.value;
            else if (h.field === 'dw') letter.cc = h.value;
            else if (h.field === 'data') {
              letter.date = h.value;
              headersDone = true;
            }
            return;
          }
          return;
        }

        if (state === 'letter') {
          letter.body.push(line.text);
          return;
        }

        // state 'pager': obsluga linii akcji (potwierdzenia, subdialogi, bledy)
        if (actions && actions.onLine) {
          const verdict = actions.onLine(line);
          if (verdict === 'close') wantClose = true;
        }
      });

      this.transport.send(`przeczytaj list ${numer}`);
    });
  }
}
