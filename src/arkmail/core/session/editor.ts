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
      let bodyStarted = false;
      const dw = input.dw ?? '';
      let cancelUnsub: () => void = () => {};
      let transition: Promise<void> = Promise.resolve();

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
      const fail = (error: unknown) => {
        if (done) return;
        cleanup();
        reject(error);
      };
      const enqueue = (job: () => Promise<void>) => {
        transition = transition.then(job);
        transition.catch(fail);
      };
      const sendLine = async (line: string): Promise<void> => {
        if (!done) await this.transport.send(line, true);
      };

      const timer = setTimeout(() => {
        cleanup();
        resolve({ result: 'blad', error: { kind: 'timeout' } });
      }, this.opts.timeoutMs);

      /** Wysyla odpowiedzi na wszystkie potwierdzone prompty. */
      const flush = async (confirmed: Stage[]): Promise<void> => {
        const order: Stage[] = ['adresat', 'temat', 'dw'];
        for (const c of confirmed) {
          if (done) return;
          const idx = order.indexOf(c);
          const cur = order.indexOf(stage);
          if (idx < cur) continue;
          stage = order[idx + 1] ?? 'tresc';
          if (c === 'temat') await sendLine(input.temat);
          else if (c === 'dw') await sendLine(dw);
        }
      };

      const sendBody = async (): Promise<void> => {
        if (done || bodyStarted || stage !== 'tresc' || !editorReady) return;
        bodyStarted = true;
        stage = 'tresc-wyslana';
        for (const linia of input.linie) {
          if (done) return;
          await sendLine(linia);
        }
        if (!done) await sendLine('**');
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

        // Prompt i gotowosc moga przyjsc w tej samej linii. Obie czynnosci
        // wykonuje jedna kolejka, wiec tresc nie wyprzedzi tematu ani DW.
        const prompts = parseComposeEcho(line.text);
        if (prompts) {
          enqueue(async () => {
            await flush(prompts as Stage[]);
            await sendBody();
          });
        } else if (editorReady) {
          enqueue(sendBody);
        }
      });

      cancelUnsub = this.opts.onCancel?.(() => {
        cleanup();
        reject(new Error('operacja anulowana'));
      }) ?? (() => {});
      if (!done) {
        // Adapter zachowuje kolejnosc tych dwoch komend. Testowy transport
        // nadal moze zapisac je synchronicznie, jak dotychczas.
        const first = this.transport.send('napisz list', true);
        const second = this.transport.send(input.adresat, true);
        transition = Promise.all([first, second]).then(() => {});
        transition.catch(fail);
      }
    });
  }
}
