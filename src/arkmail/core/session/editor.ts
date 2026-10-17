/**
 * EditorSession: compose listu jako transakcja etapowana.
 * Etapy: adresat -> temat -> dw -> tresc + "**". Kolejny etap wysylamy
 * dopiero po potwierdzeniu poprzedniego echem promptu (pipelining serwera
 * skleja echo: "Adresat: Temat: DW: " potwierdza wszystkie naraz).
 * Blad adresata na starcie przerywa compose - tresc NIE wycieka do gry.
 */

import {
  parseComposeEcho,
  parseComposeResult,
  parseEditorEcho,
  parseMailError,
} from '../protocol/parser.js';
import type { MailError } from '../protocol/types.js';
import type { ProtoLine, Transport } from './transport.js';
import type { SessionOptions } from './mailbox.js';

export interface ComposeInput {
  adresat: string;
  temat: string;
  dw?: string;
  linie: string[];
}

export type ComposeOutcome =
  | { result: 'wyslany' | 'gotowy' }
  | { result: 'blad'; error: MailError | { kind: 'timeout' } };

type Stage = 'adresat' | 'temat' | 'dw' | 'tresc' | 'tresc-wyslana';

export class EditorSession {
  constructor(
    private readonly transport: Transport,
    private readonly opts: SessionOptions,
  ) {}

  send(input: ComposeInput): Promise<ComposeOutcome> {
    return new Promise((resolve) => {
      let stage: Stage = 'adresat';
      let done = false;
      const dw = input.dw ?? '';

      const cleanup = () => {
        done = true;
        clearTimeout(timer);
        unsub();
      };
      const finish = (r: ComposeOutcome) => {
        cleanup();
        resolve(r);
      };

      const timer = setTimeout(() => {
        cleanup();
        resolve({ result: 'blad', error: { kind: 'timeout' } });
      }, this.opts.timeoutMs);

      /** Wysyla odpowiedzi na wszystkie potwierdzone prompty. */
      const flush = (confirmed: Stage[]) => {
        const order: Stage[] = ['adresat', 'temat', 'dw'];
        for (const c of confirmed) {
          const idx = order.indexOf(c);
          const cur = order.indexOf(stage);
          if (idx < cur) continue; // juz potwierdzone wczesniej
          if (c === 'adresat') {
            // adresat juz wyslany wraz z "napisz list"
          } else if (c === 'temat') {
            this.transport.send(input.temat);
          } else if (c === 'dw') {
            this.transport.send(dw);
          }
          stage = order[idx + 1] ?? 'tresc';
        }
        if (stage === 'tresc') {
          for (const linia of input.linie) this.transport.send(linia);
          this.transport.send('**');
          stage = 'tresc-wyslana'; // tresc wysylamy dokladnie raz
        }
      };

      const unsub = this.transport.subscribe((line: ProtoLine) => {
        if (done || line.cls === 'command') return;

        // Blad (np. adresata) - w kazdym stanie przerywa compose.
        const err = parseMailError(line.text);
        if (err) {
          finish({ result: 'blad', error: err });
          return;
        }

        // Wynik samodzielny albo doklejony do numeracji edytora.
        const standalone = parseComposeResult(line.text);
        if (standalone) {
          finish({ result: standalone });
          return;
        }
        const echo = parseEditorEcho(line.text);
        if (echo?.result) {
          finish({ result: echo.result });
          return;
        }

        if (stage === 'tresc-wyslana') return;

        // Echo promptow compose (moze byc sklejone).
        const prompts = parseComposeEcho(line.text);
        if (prompts) {
          flush(prompts as Stage[]);
        }
      });

      this.transport.send('napisz list');
      this.transport.send(input.adresat);
    });
  }
}
