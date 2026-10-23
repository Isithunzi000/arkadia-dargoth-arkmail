/**
 * MailboxSession: pobranie listing skrzynki jako transakcja.
 * Wysyla "listy <skrzynka>", zbiera wpisy do linii promptu, obsluguje
 * warianty puste ("Nie masz zadnych...", "Nie znaleziono zadnych takich...").
 *
 * Przenosnosc: zywy PluginApi daje triggerom SAM tekst linii (bez klas
 * gmcp_msgs), wiec koniec listingu wykrywamy tez po samej tresci:
 * echo komendy ("→ ..."), prompt ("> ") oraz idle-flush (bezpiecznik,
 * gdy prompt w ogole nie dojdzie do triggerow).
 */

import {
  extractPagerPrompt,
  LISTS_LOADING_RE,
  parseEmptyListing,
  parseListingEntry,
  parseListingHeader,
  parseListingParty,
} from '../protocol/parser.js';
import type {
  ListingEntry,
  ListingHeader,
  MailBox,
  MailDate,
} from '../protocol/types.js';
import { isEchoLine, isPromptLine } from './lines.js';
import { clearPagerOrphan, suspectPagerOrphan } from './orphanPager.js';
import type { ProtoLine, Transport } from './transport.js';

/** Linie-bledy serwera przerywajace transakcje (log 2026-10-17/18). */
const MAIL_ERROR_RE = /^Data zostala podana w zlym formacie\./;

export interface SessionOptions {
  timeoutMs: number;
  /** Idle-flush po ciszy; bezpiecznik, gdy prompt nie dociera. */
  idleMs?: number;
  /** Rejestracja natychmiastowego anulowania przy zmianie polaczenia. */
  onCancel?: (cb: () => void) => () => void;
}

/**
 * Kontekst listingu serwera (Fala 14f): skrzynka + znacznik kolejnosci.
 * Serwer ma JEDEN globalny "biezacy listing" - kazda komenda listujaca
 * go nadpisuje, takze pusta; stamp rosnie przy kazdym listingu pluginu.
 */
export interface ListingCtx {
  box: MailBox;
  stamp: number;
}

export interface MailboxEntry extends ListingEntry {
  /** Surowa strona listu: nadawca (odebrane) lub odbiorcy (wyslane). */
  party: string;
  partyKind: 'nadawca' | 'odbiorcy' | null;
  date: MailDate | null;
  /**
   * Wewnetrzne (Fala 9a/14f): kontekst listingu serwera, z ktorego
   * pochodzi wpis. Serwer rozumie "przeczytaj list N" wzgledem
   * OSTATNIEGO listingu - numer jest wazny tylko, gdy ctx == biezacy
   * kontekst; inaczej wpis wymaga re-kotwiczenia (patrz index.ts
   * resolveEntry). Nie trafia do archiwum ani storage.
   */
  ctx?: ListingCtx;
}

export type MailboxResult =
  | { kind: 'lista'; header: ListingHeader; entries: MailboxEntry[] }
  | { kind: 'pusta'; box: MailBox; reason: 'puste' | 'filtr' };

export class MailboxSession {
  constructor(
    private readonly transport: Transport,
    private readonly opts: SessionOptions,
  ) {}

  /**
   * Pobiera listing skrzynki. command: wlasna komenda (paginacja wstecz
   * "listy <skrzynka> przed <data>", patrz protocol/commands.ts);
   * domyslnie "listy <skrzynka>".
   */
  fetch(box: MailBox, command?: string): Promise<MailboxResult> {
    return new Promise((resolve, reject) => {
      const cmd = command ?? `listy ${box}`;
      let header: ListingHeader | null = null;
      const entries: MailboxEntry[] = [];
      let done = false;
      /** Fala 16b: jeden retry po linii throttle "Listy sa w tej chwili
       *  ladowane." (serwer nie zdazyl zbudowac listingu). */
      let loadRetried = false;
      let loadRetryTimer: ReturnType<typeof setTimeout> | null = null;
      /** Fala 17a: jeden retry po sierocym pagerze (zgloszenie pkt 4).
       *  Pager konsumuje nasza komende i odpowiada wlasnym promptem
       *  "[1-50 ...] -- " - domykamy go "q" i po prompcie gry powtarzamy
       *  komende. Powtorka promptu = pager przetrwal "q" - blad. */
      let pagerRetried = false;
      let awaitingPromptAfterQ = false;
      const idleMs = this.opts.idleMs ?? 600;
      let idleTimer: ReturnType<typeof setTimeout> | null = null;
      let cancelUnsub: () => void = () => {};

      const cleanup = () => {
        done = true;
        clearTimeout(timer);
        if (idleTimer) clearTimeout(idleTimer);
        if (loadRetryTimer) clearTimeout(loadRetryTimer);
        cancelUnsub();
        unsub();
      };
      const finish = (r: MailboxResult) => {
        cleanup();
        // Fala 24g: listing doszedl = komendy docieraja do serwera,
        // sieroty nie ma - zdejmij podejrzenie straznika.
        clearPagerOrphan();
        resolve(r);
      };

      /** Bezpiecznik: cisza po naglowku = koniec listingu. */
      const armIdle = () => {
        if (idleTimer) clearTimeout(idleTimer);
        idleTimer = setTimeout(() => {
          if (done || !header) return;
          finish({ kind: 'lista', header, entries });
        }, idleMs);
      };

      const timer = setTimeout(() => {
        // Fala 24g: timeout w stanie awaitingPromptAfterQ = wyslalismy
        // "q" do sieroty i nie doczekalismy sie potwierdzenia - pager
        // moze trwac. Podejrzenie dla straznika.
        if (awaitingPromptAfterQ) suspectPagerOrphan();
        cleanup();
        reject(new Error(`timeout: mailbox fetch ${box}`));
      }, this.opts.timeoutMs);

      const unsub = this.transport.subscribe((line: ProtoLine) => {
        if (done) return;

        // Linia-blad serwera (np. "Data zostala podana w zlym formacie...")
        // konczy transakcje od razu - bez cichego czekania na timeout.
        if (MAIL_ERROR_RE.test(line.text)) {
          cleanup();
          reject(new Error(line.text.trim()));
          return;
        }

        // Fala 16b: throttle serwera "Listy sa w tej chwili ladowane."
        // (log 2026-10-19 17:25:10). Stary kod tej linii nie znal -
        // fetch wisial w ciszy do timeoutu ~8 s (zgloszenie pkt 3/13:
        // "klikam i nic sie nie dzieje"). Jeden retry komendy po ~2 s;
        // powtorka = blad od razu, bez cichego czekania.
        if (LISTS_LOADING_RE.test(line.text)) {
          if (loadRetried) {
            cleanup();
            reject(new Error('Listy sa w tej chwili ladowane.'));
            return;
          }
          loadRetried = true;
          loadRetryTimer = setTimeout(() => {
            if (!done) this.transport.send(cmd);
          }, 2000);
          return;
        }

        if (!header) {
          // Echo wlasnej komendy: po klasie albo po samej tresci.
          if (line.cls === 'command' || isEchoLine(line.text)) return;
          // Fala 17a: prompt gry po naszym "q" = sieroca domknieta;
          // powtarzamy komende listingu (zobacz pagerRetried nizej).
          if (awaitingPromptAfterQ) {
            if (line.cls === 'prompt' || isPromptLine(line.text)) {
              awaitingPromptAfterQ = false;
              this.transport.send(cmd);
            }
            return;
          }
          // Fala 17a: sierocy pager (po przerwanej petli / timeoutcie
          // sesji) zjadl komende "listy" - odpowiada wlasnym promptem.
          // extractPagerPrompt znajduje tez prompt sklejony z inna
          // trescia w jednej linii (klient trzyma linie bez \n).
          if (extractPagerPrompt(line.text)) {
            if (pagerRetried) {
              // Fala 24g: sierota przetrwala pierwsze "q" i odpowiedziala
              // kolejnym promptem - trwa nadal. Podejrzenie dla
              // straznika (domknie ja przy kolejnym promptcie).
              suspectPagerOrphan();
              cleanup();
              reject(new Error(`sierocy pager podczas fetch ${box}`));
              return;
            }
            pagerRetried = true;
            awaitingPromptAfterQ = true;
            this.transport.send('q');
            return;
          }
          const empty = parseEmptyListing(line.text);
          if (empty) {
            // Fala 14d: fail-fast, gdy serwer odpowiada za INNA skrzynke
            // (desynchronizacja). Stary kod przyjmowal cudzy komunikat
            // po cichu - listing 50 odebranych ladowal jako "nieprzeczytane"
            // i badge pokazywal 50 (zgloszenie 2026-10-19, pkt 6).
            // Fala 17b: straznik odrzuca tylko JEDNOZNACZNY mismatch -
            // genityw "otrzymanych" pasuje do odebranych i nieprzeczytanych
            // (parser zwraca zbior; zgloszenie pkt 5/6).
            if (!empty.boxes.includes(box)) {
              cleanup();
              reject(new Error(`pusta ${empty.boxes.join('/')} podczas fetch ${box}`));
              return;
            }
            // Zaakceptowany pusty wynik raportuje skrzynke ZADANA.
            finish({ kind: 'pusta', box, reason: empty.reason });
            return;
          }
          const h = parseListingHeader(line.text);
          if (h) {
            if (h.box !== box) {
              cleanup();
              reject(new Error(`listing ${h.box} podczas fetch ${box}`));
              return;
            }
            // Fala 20a: serwer dostarczyl listing mimo throttle'u -
            // rozbrajamy odroczone retry, inaczej dosyla komende w
            // polowie strony (duplikat wpisow; zgloszenie 2026-10-21
            // "pominiete wyslane / kotwica bez postepu / 3-4").
            if (loadRetryTimer) {
              clearTimeout(loadRetryTimer);
              loadRetryTimer = null;
            }
            header = h;
            armIdle();
          }
          return;
        }

        // Koniec listingu: prompt albo echo kolejnej komendy gracza
        // (w logach prompt bywa skonsumowany przed nastepna komenda).
        // Klasa albo sama tresc - zaleznie od tego, co daje klient.
        if (
          line.cls === 'prompt' ||
          line.cls === 'command' ||
          isPromptLine(line.text) ||
          isEchoLine(line.text)
        ) {
          finish({ kind: 'lista', header, entries });
          return;
        }
        armIdle();
        const entry = parseListingEntry(line.text);
        if (entry) {
          entries.push({ ...entry, party: '', partyKind: null, date: null });
          return;
        }
        const party = parseListingParty(line.text);
        if (party && entries.length > 0) {
          const last = entries[entries.length - 1];
          last.party = party.names;
          last.partyKind = party.kind;
          last.date = party.date;
        }
      });

      cancelUnsub = this.opts.onCancel?.(() => {
        cleanup();
        reject(new Error('operacja anulowana'));
      }) ?? (() => {});
      if (!done) this.transport.send(cmd);
    });
  }
}
