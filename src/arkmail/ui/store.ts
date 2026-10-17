/**
 * MailUiStore: czysty view-model UI ArkMail (zero DOM, zero PluginApi).
 * Render (ui/render.ts) subskrybuje stan i maluje; wiring (index.ts)
 * odpala akcje. Badge = liczba nieprzeczytanych: listing skrzynki
 * 'nieprzeczytane' ma pierwszenstwo, fallback to nieprzeczytane
 * z 'odebrane'.
 */

import type { MailBox } from '../core/protocol/types.js';
import type { MailboxEntry, MailboxResult } from '../core/session/mailbox.js';
import type { LetterContent } from '../core/session/pager.js';
import type { Contact } from '../core/contacts.js';
import type { ArchiveLetter } from '../core/archive.js';
import type { LetterTemplate } from '../core/letterRender.js';

export type UiTab = 'listy' | 'list' | 'napisz' | 'kontakty' | 'archiwum';

export interface BoxView {
  entries: MailboxEntry[];
  truncated: boolean;
  /** znacznik wariantu pustego; null gdy listing niepusty */
  empty: 'puste' | 'filtr' | null;
}

export interface OpenLetter extends LetterContent {
  box: MailBox;
}

export interface MailUiState {
  tab: UiTab;
  /** szeroki podzial (popup >= 900px): list obok listingu */
  wide: boolean;
  activeBox: MailBox;
  boxes: Partial<Record<MailBox, BoxView>>;
  badge: number;
  /** opis operacji pocztowej w toku (pasek); null = wolne */
  busy: string | null;
  letter: OpenLetter | null;
  contacts: Contact[];
  archive: ArchiveLetter[];
  notifyEnabled: boolean;
  /** Preferencje compose: szablon ramki i szerokosc linii (20..120). */
  composeTemplate: LetterTemplate;
  composeWidth: number;
}

const DEFAULT_STATE: MailUiState = {
  tab: 'listy',
  wide: false,
  activeBox: 'odebrane',
  boxes: {},
  badge: 0,
  busy: null,
  letter: null,
  contacts: [],
  archive: [],
  notifyEnabled: false,
  composeTemplate: 'plain',
  composeWidth: 60,
};

export class MailUiStore {
  private current: MailUiState;
  private readonly listeners = new Set<(s: MailUiState) => void>();

  constructor(initial?: Partial<MailUiState>) {
    this.current = { ...DEFAULT_STATE, ...initial };
  }

  get state(): Readonly<MailUiState> {
    return this.current;
  }

  subscribe(cb: (s: MailUiState) => void): () => void {
    this.listeners.add(cb);
    return () => {
      this.listeners.delete(cb);
    };
  }

  setTab(tab: UiTab): void {
    this.update({ tab });
  }

  setWide(wide: boolean): void {
    this.update({ wide });
  }

  setActiveBox(box: MailBox): void {
    this.update({ activeBox: box });
  }

  applyMailbox(box: MailBox, result: MailboxResult): void {
    const view: BoxView =
      result.kind === 'lista'
        ? { entries: result.entries, truncated: result.header.truncated, empty: null }
        : { entries: [], truncated: false, empty: result.reason };
    const boxes = { ...this.current.boxes, [box]: view };
    this.update({ boxes, badge: computeBadge(boxes) });
  }

  setBusy(label: string | null): void {
    this.update({ busy: label });
  }

  /** Otwiera list: waski -> zakladka 'list', szeroki -> zostaje w podziale. */
  openLetter(box: MailBox, letter: LetterContent): void {
    const next: Partial<MailUiState> = { letter: { ...letter, box } };
    if (!this.current.wide) next.tab = 'list';
    this.update(next);
  }

  closeLetter(): void {
    this.update({ letter: null, tab: 'listy' });
  }

  setContacts(contacts: Contact[]): void {
    this.update({ contacts });
  }

  setArchive(archive: ArchiveLetter[]): void {
    this.update({ archive });
  }

  setNotifyEnabled(notifyEnabled: boolean): void {
    this.update({ notifyEnabled });
  }

  setCompose(prefs: { template?: LetterTemplate; width?: number }): void {
    const patch: Partial<MailUiState> = {};
    if (prefs.template !== undefined) patch.composeTemplate = prefs.template;
    if (prefs.width !== undefined) patch.composeWidth = prefs.width;
    this.update(patch);
  }

  private update(patch: Partial<MailUiState>): void {
    this.current = { ...this.current, ...patch };
    for (const cb of [...this.listeners]) cb(this.current);
  }
}

function computeBadge(boxes: Partial<Record<MailBox, BoxView>>): number {
  const unread = boxes.nieprzeczytane;
  if (unread) return unread.entries.length;
  const odebrane = boxes.odebrane;
  if (odebrane) return odebrane.entries.filter((e) => !e.isRead).length;
  return 0;
}
