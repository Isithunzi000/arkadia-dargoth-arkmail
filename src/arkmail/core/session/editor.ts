/**
 * EditorSession: compose listu jako transakcja etapowana.
 * Etapy: adresat -> temat -> dw -> tresc + "**". Kolejny etap wysylamy
 * dopiero po potwierdzeniu poprzedniego echem promptu (pipelining serwera
 * skleja echo: "Adresat: Temat: DW: " potwierdza wszystkie naraz).
 * Tresc i "**" wysylamy dopiero po komunikacie gotowosci edytora.
 * Blad adresata na starcie przerywa compose - tresc NIE wycieka do gry.
 * Fala 28h: wszystkie wysylki composera z echem - gracz widzi w oknie
 * gry dokladnie to, co przy recznym pisaniu listu.
 */

import {
  isEditorReady,
  parseComposeEcho,
  parseComposeResult,
  parseEditorEcho,
  parseMailError,
} from '../protocol/parser.js';
import type { MailError } from '../protocol/types.js';
import { isEchoLine } from './lines.js';
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
    return new Promise((resolve, reject) => {
      let stage: Stage = 'adresat';
      let done = false;
      let editorReady = false;
      const dw = input.dw ?? '';
      let cancelUnsub: () => void = () => {};

      const cleanup = () => {
        done = true;
        clearTimeout(timer);
        cancelUnsub();
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
            this.transport.send(input.temat, true);
          } else if (c === 'dw') {
            this.transport.send(dw, true);
          }
          stage = order[idx + 1] ?? 'tresc';
        }
      };

      const sendBody = (): void => {
        if (stage !== 'tresc' || !editorReady) return;
        for (const linia of input.linie) this.transport.send(linia, true);
        this.transport.send('**', true);
        stage = 'tresc-wyslana';
      };

      const unsub = this.transport.subscribe((line: ProtoLine) => {
        // Echo wlasnych komend: po klasie albo po samej tresci
        // (przenosnosc: zywy PluginApi nie daje klas gmcp_msgs).
        if (done || line.cls === 'command' || isEchoLine(line.text)) return;

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

        if (isEditorReady(line.text)) editorReady = true;

        // Echo promptow compose (moze byc sklejone).
        const prompts = parseComposeEcho(line.text);
        if (prompts) {
          flush(prompts as Stage[]);
        }
        sendBody();
      });

      cancelUnsub = this.opts.onCancel?.(() => {
        cleanup();
        reject(new Error('operacja anulowana'));
      }) ?? (() => {});
      if (!done) {
        this.transport.send('napisz list', true);
        this.transport.send(input.adresat, true);
      }
    });
  }
}
