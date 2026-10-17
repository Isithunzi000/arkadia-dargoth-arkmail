/**
 * MailboxSession: pobranie listing skrzynki jako transakcja.
 * Wysyla "listy <skrzynka>", zbiera wpisy do linii promptu, obsluguje
 * warianty puste ("Nie masz zadnych...", "Nie znaleziono zadnych takich...").
 * Echo wlasnych komend (klasa 'command') jest ignorowane.
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
import type { ProtoLine, Transport } from './transport.js';

export interface SessionOptions {
  timeoutMs: number;
}

export interface MailboxEntry extends ListingEntry {
  /** Surowa strona listu: nadawca (odebrane) lub odbiorcy (wyslane). */
  party: string;
  partyKind: 'nadawca' | 'odbiorcy' | null;
  date: MailDate | null;
}

export type MailboxResult =
  | { kind: 'lista'; header: ListingHeader; entries: MailboxEntry[] }
  | { kind: 'pusta'; box: MailBox; reason: 'puste' | 'filtr' };

export class MailboxSession {
  constructor(
    private readonly transport: Transport,
    private readonly opts: SessionOptions,
  ) {}

  fetch(box: MailBox): Promise<MailboxResult> {
    return new Promise((resolve, reject) => {
      let header: ListingHeader | null = null;
      const entries: MailboxEntry[] = [];
      let done = false;

      const cleanup = () => {
        done = true;
        clearTimeout(timer);
        unsub();
      };
      const finish = (r: MailboxResult) => {
        cleanup();
        resolve(r);
      };

      const timer = setTimeout(() => {
        cleanup();
        reject(new Error(`timeout: mailbox fetch ${box}`));
      }, this.opts.timeoutMs);

      const unsub = this.transport.subscribe((line: ProtoLine) => {
        if (done) return;

        if (!header) {
          if (line.cls === 'command') return; // echo wlasnej komendy
          const empty = parseEmptyListing(line.text);
          if (empty) {
            finish({ kind: 'pusta', box: empty.box, reason: empty.reason });
            return;
          }
          const h = parseListingHeader(line.text);
          if (h) header = h;
          return;
        }

        // Koniec listingu: prompt albo echo kolejnej komendy gracza
        // (w logach prompt bywa skonsumowany przed nastepna komenda).
        if (line.cls === 'prompt' || line.cls === 'command') {
          finish({ kind: 'lista', header, entries });
          return;
        }
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

      this.transport.send(`listy ${box}`);
    });
  }
}
