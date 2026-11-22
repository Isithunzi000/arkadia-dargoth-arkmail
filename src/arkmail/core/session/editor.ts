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
import { isEchoLine, isPromptLine } from './lines.js';
import type { ProtoLine, Transport } from './transport.js';
import type { SessionOptions } from './mailbox.js';

export interface ComposeInput {
  adresat: string;
  temat: string;
  dw?: string;
  linie: string[];
}

export type ComposeOutcome =
  | { result: 'wyslany' | 'gotowy' | 'zaniechany' }
  | { result: 'blad'; error: MailError | { kind: 'timeout' } };

type Stage = 'adresat' | 'temat' | 'dw' | 'tresc' | 'tresc-wyslana';

/** Krotkie oczekiwanie na "Zaniechane." i zwykly prompt po naszym ~q. */
const EDITOR_CLOSE_GRACE_MS = 400;

export class EditorSession {
  constructor(
    private readonly transport: Transport,
    private readonly opts: SessionOptions,
  ) {}

  send(input: ComposeInput): Promise<ComposeOutcome> {
    return new Promise((resolve, reject) => {
      const session = this.transport.openSession();
      let stage: Stage = 'adresat';
      let done = false;
      let startAccepted = false;
      let editorReady = false;
      let bodyStarted = false;
      let closingEditor = false;
      let editorAbandoned = false;
      let closeTimer: ReturnType<typeof setTimeout> | null = null;
      const dw = input.dw ?? '';
      let cancelUnsub: () => void = () => {};
      let transition: Promise<void> = Promise.resolve();

      const cleanup = () => {
        done = true;
        clearTimeout(timer);
        if (closeTimer) clearTimeout(closeTimer);
        closeTimer = null;
        cancelUnsub();
        unsub();
        session.close();
      };
      const finish = (r: ComposeOutcome) => {
        cleanup();
        resolve(r);
      };
      const fail = (error: unknown) => {
        if (done) return;
        // Przyjecie "napisz list" oznacza, ze kolejne odrzucenie moze
        // zostawic nierozstrzygniety edytor. Przed tym nie zgadujemy recovery.
        if (startAccepted) this.transport.beginRecovery();
        cleanup();
        reject(error);
      };
      const enqueue = (job: () => Promise<void>) => {
        transition = transition.then(job);
        transition.catch(fail);
      };
      const sendLine = async (line: string): Promise<void> => {
        if (!done && !closingEditor) await this.transport.send(line, true);
      };
      const finishTimeout = () => {
        if (done) return;
        this.transport.beginRecovery();
        finish({ result: 'blad', error: { kind: 'timeout' } });
      };
      const closeConfirmedEditor = async (): Promise<void> => {
        try {
          await this.transport.send('~q', true);
        } catch {
          finishTimeout();
          return;
        }
        if (done) return;
        closeTimer = setTimeout(finishTimeout, EDITOR_CLOSE_GRACE_MS);
        (closeTimer as unknown as { unref?: () => void }).unref?.();
      };

      const timer = setTimeout(() => {
        if (done) return;
        // Bez odpowiedzi serwera nie wiadomo, czy nasz edytor istnieje.
        // Wyslanie ~q mogloby trafic do zwyklego trybu gry albo cudzej sesji.
        const confirmedEditor = editorReady || bodyStarted || stage === 'tresc-wyslana';
        if (!confirmedEditor) {
          finishTimeout();
          return;
        }
        // Potwierdzony edytor dostaje jedno ~q. Od tej chwili zadna linia
        // tresci nie moze juz wyjsc, nawet gdy wczesniejsza wysylka sie konczy.
        closingEditor = true;
        void closeConfirmedEditor();
      }, this.opts.timeoutMs);

      /** Wysyla odpowiedzi na wszystkie potwierdzone prompty. */
      const flush = async (confirmed: Stage[]): Promise<void> => {
        const order: Stage[] = ['adresat', 'temat', 'dw'];
        for (const c of confirmed) {
          if (done || closingEditor) return;
          const idx = order.indexOf(c);
          const cur = order.indexOf(stage);
          if (idx < cur) continue;
          stage = order[idx + 1] ?? 'tresc';
          if (c === 'temat') await sendLine(input.temat);
          else if (c === 'dw') await sendLine(dw);
        }
      };

      const sendBody = async (): Promise<void> => {
        if (done || closingEditor || bodyStarted || stage !== 'tresc' || !editorReady) return;
        bodyStarted = true;
        stage = 'tresc-wyslana';
        for (const linia of input.linie) {
          if (done || closingEditor) return;
          await sendLine(linia);
        }
        if (!done && !closingEditor) await sendLine('**');
      };

      const unsub = session.subscribe((line: ProtoLine) => {
        // Echo wlasnych komend: po klasie albo po samej tresci
        // (przenosnosc: zywy PluginApi nie daje klas gmcp_msgs).
        if (done || line.cls === 'command' || isEchoLine(line.text)) return;

        if (closingEditor) {
          // Po timeoutcie sukces wysylki ani sam prompt nie rozstrzygaja
          // zamkniecia. Potwierdzeniem jest dopiero zwykly prompt otrzymany
          // po "Zaniechane."; wczesniejszy prompt nie zostaje zapamietany.
          if (line.text === 'Zaniechane.') {
            editorAbandoned = true;
            return;
          }
          if (editorAbandoned && (line.cls === 'prompt' || isPromptLine(line.text))) {
            finish({ result: 'zaniechany' });
          }
          return;
        }

        // Fala UI-2 krok 5: gracz przerywa compose w grze klawiszem ~q -
        // serwer odpowiada "Zaniechane.". Konczymy od razu, bez czekania
        // na watchdog-timeout i bez ogolnego bledu wysylki.
        if (line.text === 'Zaniechane.') {
          finish({ result: 'zaniechany' });
          return;
        }

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
        // Adresat wchodzi do kolejki dopiero po przyjeciu "napisz list".
        // Odrzucenie pierwszej komendy nie moze zwolnic go jako zwyklego
        // polecenia do gry.
        transition = (async () => {
          await this.transport.send('napisz list', true);
          startAccepted = true;
          if (!done) await this.transport.send(input.adresat, true);
        })();
        transition.catch(fail);
      }
    });
  }
}
