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
import type { ProtoLine, Transport } from './transport.js';

/** Linie-bledy serwera przerywajace transakcje (log 2026-10-17/18). */
const MAIL_ERROR_RE = /^Data zostala podana w zlym formacie\./;

export interface SessionOptions {
  timeoutMs: number;
  /**
   * Idle-flush: koniec transakcji po tylu ms ciszy (bezpiecznik, gdy
   * prompt nie dojdzie do triggerow pluginu). Domyslnie 600.
   */
  idleMs?: number;
}

export interface MailboxEntry extends ListingEntry {
  /** Surowa strona listu: nadawca (odebrane) lub odbiorcy (wyslane). */
  party: string;
  partyKind: 'nadawca' | 'odbiorcy' | null;
  date: MailDate | null;
  /**
   * Wewnetrzne (Fala 9a): kontekst listingu serwera, z ktorego pochodzi
   * wpis. Serwer rozumie "przeczytaj list N" wzgledem OSTATNIEGO listingu
   * - numer jest wazny tylko, gdy ctx == biezacy kontekst; inaczej wpis
   * wymaga re-kotwiczenia (patrz index.ts resolveEntry). Nie trafia do
   * archiwum ani storage.
   */
  ctx?: number;
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
      let header: ListingHeader | null = null;
      const entries: MailboxEntry[] = [];
      let done = false;
      const idleMs = this.opts.idleMs ?? 600;
      let idleTimer: ReturnType<typeof setTimeout> | null = null;

      const cleanup = () => {
        done = true;
        clearTimeout(timer);
        if (idleTimer) clearTimeout(idleTimer);
        unsub();
      };
      const finish = (r: MailboxResult) => {
        cleanup();
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

        if (!header) {
          // Echo wlasnej komendy: po klasie albo po samej tresci.
          if (line.cls === 'command' || isEchoLine(line.text)) return;
          const empty = parseEmptyListing(line.text);
          if (empty) {
            // Fala 14d: fail-fast, gdy serwer odpowiada za INNA skrzynke
            // (desynchronizacja). Stary kod przyjmowal cudzy komunikat
            // po cichu - listing 50 odebranych ladowal jako "nieprzeczytane"
            // i badge pokazywal 50 (zgloszenie 2026-10-19, pkt 6).
            if (empty.box !== box) {
              cleanup();
              reject(new Error(`pusta ${empty.box} podczas fetch ${box}`));
              return;
            }
            finish({ kind: 'pusta', box: empty.box, reason: empty.reason });
            return;
          }
          const h = parseListingHeader(line.text);
          if (h) {
            if (h.box !== box) {
              cleanup();
              reject(new Error(`listing ${h.box} podczas fetch ${box}`));
              return;
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

      this.transport.send(command ?? `listy ${box}`);
    });
  }
}
