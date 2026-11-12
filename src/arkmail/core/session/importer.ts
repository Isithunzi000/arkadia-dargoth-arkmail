/**
 * ImportSession: transakcja odczytu ksiazki adresowej z gry.
 * Wysyla komende, zbiera linie do promptu lub echa i parsuje:
 *  - "zapamietani" / "przedstawieni" -> lista imion z jednej linii,
 *  - "aliasy pocztowe" -> blok naglowka (parseAliasesBlock).
 * Odpowiedzi to pojedyncze linie - bez pagera; koniec po promptzie
 * ("> ") albo echu komendy gracza. Cisza nie rozstrzyga operacji;
 * brak zakonczenia odrzuca dopiero pelny limit czasu.
 */
import {
  parseAliasesBlock,
  parseIntroducedLine,
  parseRememberedLine,
} from '../protocol/parser.js';
import type { MailAliasDef } from '../protocol/types.js';
import { isEchoLine, isPromptLine } from './lines.js';
import type { ProtoLine, Transport } from './transport.js';

export interface ImportSessionOptions {
  timeoutMs: number;
  /** Zachowane dla zgodnosci wywolan; cisza nie rozstrzyga importu. */
  idleMs?: number;
  onCancel?: (cb: () => void) => () => void;
}

export type PeopleImportKind = 'zapamietani' | 'przedstawieni';

const IMPORT_COMMANDS: Record<PeopleImportKind, string> = {
  zapamietani: 'zapamietani',
  przedstawieni: 'przedstawieni',
};

export class ImportSession {
  constructor(
    private readonly transport: Transport,
    private readonly opts: ImportSessionOptions,
  ) {}

  private collect(command: string): Promise<string[]> {
    return new Promise<string[]>((resolve, reject) => {
      const session = this.transport.openSession();
      const lines: string[] = [];
      let done = false;
      let cleaned = false;
      let cancelUnsub: (() => void) | undefined;
      const cleanup = (): void => {
        if (cleaned) return;
        cleaned = true;
        clearTimeout(timeout);
        unsubscribe();
        cancelUnsub?.();
        session.close();
      };
      const finish = (): void => {
        if (done) return;
        done = true;
        cleanup();
        resolve(lines);
      };
      const fail = (err: Error): void => {
        if (done) return;
        done = true;
        cleanup();
        reject(err);
      };

      const unsubscribe = session.subscribe((line: ProtoLine) => {
        if (done) return;
        const text = line.text;
        if (isPromptLine(text) || (isEchoLine(text) && !line.own)) {
          finish();
          return;
        }
        // Echo wlasnej komendy otwiera transakcje, nie domyka jej.
        lines.push(text);
      });
      const timeout = setTimeout(() => {
        this.transport.beginRecovery();
        fail(new Error(`import ${command}: timeout`));
      }, this.opts.timeoutMs);
      cancelUnsub = this.opts.onCancel?.(() => {
        fail(new Error(`import ${command}: przerwano`));
      });

      void Promise.resolve(this.transport.send(command)).catch((err: unknown) => {
        fail(err instanceof Error ? err : new Error(String(err)));
      });
    });
  }

  /** Osoby zapamietane lub ostatnio przedstawione; pula pusta = []. */
  async fetchPeople(kind: PeopleImportKind): Promise<string[]> {
    const lines = await this.collect(IMPORT_COMMANDS[kind]);
    const parse = kind === 'zapamietani' ? parseRememberedLine : parseIntroducedLine;
    for (const line of lines) {
      const names = parse(line);
      if (names !== null) return names;
    }
    return [];
  }

  /** Alias pocztowe z gry (tylko odczyt; rozstrzyga je serwer). */
  async fetchAliases(): Promise<MailAliasDef[]> {
    const lines = await this.collect('aliasy pocztowe');
    // Blok zaczyna sie naglowkiem; wczesniej moze lezec echo komendy.
    const start = lines.findIndex((l) => l.startsWith('Posiadasz nastepujace'));
    return parseAliasesBlock(start === -1 ? [] : lines.slice(start));
  }
}
