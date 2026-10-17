/**
 * Render UI ArkMail: cienka powloka DOM nad MailUiStore.
 * Vanilla DOM (zero React w bundle), elementy tworzone przez
 * container.ownerDocument (wtyka: document przegladarki; testy: happy-dom).
 *
 * Przerenderowanie przy kazdej zmianie store; WYJATEK: filtr archiwum
 * trzymany lokalnie w tej powloce (input nie traci fokusu przy pisaniu).
 */

import type { MailBox } from '../core/protocol/types.js';
import { filterLetters, type ArchiveFilter } from '../core/archive.js';
import type { MailUiState, MailUiStore, UiTab } from './store.js';
import { STYLES } from './styles.js';

export interface MailUiHandlers {
  onOpenLetter(box: MailBox, number: number): void;
  onSendCompose(input: { adresat: string; temat: string; dw: string; linie: string[] }): void;
  onCloseLetter(): void;
  onRefreshBox(box: MailBox): void;
  onLoadOlder(box: MailBox): void;
}

const TABS: Array<[UiTab, string]> = [
  ['listy', 'Listy'],
  ['list', 'List'],
  ['napisz', 'Napisz list'],
  ['kontakty', 'Kontakty'],
  ['archiwum', 'Archiwum'],
];

const BOXES: Array<[MailBox, string]> = [
  ['odebrane', 'Odebrane'],
  ['nieprzeczytane', 'Nieprzeczytane'],
  ['wyslane', 'Wysłane'],
  ['niewyslane', 'Niewysłane'],
];

export function mountMailUi(
  container: HTMLElement,
  store: MailUiStore,
  handlers: MailUiHandlers,
): () => void {
  const doc = container.ownerDocument;
  const style = doc.createElement('style');
  style.textContent = STYLES;
  container.appendChild(style);
  const root = doc.createElement('div') as HTMLDivElement;
  container.appendChild(root);

  /** Filtr archiwum: lokalny (poza store) - input zachowuje fokus. */
  const archFilter: ArchiveFilter = {};

  const render = (state: MailUiState) => {
    root.className = 'arkmail-root' + (state.wide ? ' arkmail-wide' : '');
    const nodes: Node[] = [renderTabs(state)];
    if (state.busy !== null) nodes.push(renderBusy(state.busy));
    if (state.wide && state.tab === 'listy' && state.letter) {
      const split = doc.createElement('div');
      split.className = 'arkmail-split';
      split.appendChild(renderListy(state));
      split.appendChild(renderList(state));
      nodes.push(split);
    } else {
      nodes.push(renderPane(state));
    }
    root.replaceChildren(...nodes);
  };

  const renderTabs = (state: MailUiState): HTMLElement => {
    const bar = doc.createElement('div');
    bar.className = 'arkmail-tabs';
    for (const [id, label] of TABS) {
      const btn = doc.createElement('button');
      btn.className = 'arkmail-tab' + (state.tab === id ? ' arkmail-tab-active' : '');
      btn.setAttribute('data-tab', id);
      btn.textContent = id === 'listy' && state.badge > 0 ? `${label} (${state.badge})` : label;
      btn.addEventListener('click', () => store.setTab(id));
      bar.appendChild(btn);
    }
    return bar;
  };

  const renderBusy = (label: string): HTMLElement => {
    const el = doc.createElement('div');
    el.className = 'arkmail-busy';
    el.textContent = `Operacja pocztowa w toku: ${label}`;
    return el;
  };

  const renderPane = (state: MailUiState): HTMLElement => {
    switch (state.tab) {
      case 'listy':
        return renderListy(state);
      case 'list':
        return renderList(state);
      case 'napisz':
        return renderNapisz();
      case 'kontakty':
        return renderKontakty(state);
      case 'archiwum':
        return renderArchiwum(state);
    }
  };

  const renderListy = (state: MailUiState): HTMLElement => {
    const pane = doc.createElement('div');
    pane.className = 'arkmail-pane';
    const boxes = doc.createElement('div');
    boxes.className = 'arkmail-boxes';
    for (const [box, label] of BOXES) {
      const btn = doc.createElement('button');
      btn.className = 'arkmail-box' + (state.activeBox === box ? ' arkmail-box-active' : '');
      btn.setAttribute('data-box', box);
      btn.textContent = label;
      btn.addEventListener('click', () => {
        store.setActiveBox(box);
        handlers.onRefreshBox(box);
      });
      boxes.appendChild(btn);
    }
    pane.appendChild(boxes);

    const view = state.boxes[state.activeBox];
    if (!view) {
      pane.appendChild(dim('Skrzynka nie zaladowana - kliknij jej nazwe, aby pobrac.'));
      return pane;
    }
    if (view.empty !== null) {
      pane.appendChild(dim(view.empty === 'puste' ? 'Skrzynka pusta.' : 'Brak pasujacych listow.'));
      return pane;
    }
    for (const e of view.entries) {
      const row = doc.createElement('div');
      row.className = 'arkmail-entry' + (e.isRead ? '' : ' arkmail-unread');
      row.setAttribute('data-number', String(e.number));
      const dateTxt = e.date ? ` [${e.date.raw}]` : '';
      row.textContent = `${e.number}. ${e.subject} `;
      const party = doc.createElement('span');
      party.className = 'arkmail-entry-party';
      party.textContent = `— ${e.party}${dateTxt}`;
      row.appendChild(party);
      row.addEventListener('click', () => handlers.onOpenLetter(state.activeBox, e.number));
      pane.appendChild(row);
    }
    if (view.truncated) {
      const btn = doc.createElement('button');
      btn.className = 'arkmail-older';
      btn.textContent = 'Wczytaj starsze';
      btn.addEventListener('click', () => handlers.onLoadOlder(state.activeBox));
      pane.appendChild(btn);
    }
    return pane;
  };

  const renderList = (state: MailUiState): HTMLElement => {
    const pane = doc.createElement('div');
    pane.className = 'arkmail-pane';
    const l = state.letter;
    if (!l) {
      pane.appendChild(dim('Nie otwarto zadnego listu.'));
      return pane;
    }
    const head = doc.createElement('div');
    head.className = 'arkmail-letter-head';
    head.textContent =
      `List ${l.number} — Od: ${l.from} — Do: ${l.to}` +
      (l.cc ? ` — DW: ${l.cc}` : '') +
      (l.date ? ` — ${l.date}` : '') +
      ` — Temat: ${l.subject}`;
    pane.appendChild(head);
    const body = doc.createElement('div');
    body.className = 'arkmail-letter-body';
    body.textContent = l.body.join('\n');
    pane.appendChild(body);
    if (!state.wide) {
      const back = doc.createElement('button');
      back.className = 'arkmail-older';
      back.textContent = 'Zamknij list';
      back.addEventListener('click', () => handlers.onCloseLetter());
      pane.appendChild(back);
    }
    return pane;
  };

  const renderNapisz = (): HTMLElement => {
    const pane = doc.createElement('div');
    pane.className = 'arkmail-pane arkmail-form';
    const fields: Array<[string, string]> = [
      ['adresat', 'Adresat'],
      ['temat', 'Temat'],
      ['dw', 'DW (opcjonalnie)'],
    ];
    for (const [field, label] of fields) {
      const lab = doc.createElement('label');
      lab.textContent = label;
      pane.appendChild(lab);
      const input = doc.createElement('input');
      input.setAttribute('data-field', field);
      pane.appendChild(input);
    }
    const lab = doc.createElement('label');
    lab.textContent = 'Treść';
    pane.appendChild(lab);
    const tresc = doc.createElement('textarea');
    tresc.setAttribute('data-field', 'tresc');
    pane.appendChild(tresc);
    const send = doc.createElement('button');
    send.className = 'arkmail-send';
    send.textContent = 'Wyślij';
    send.addEventListener('click', () => {
      const val = (f: string) =>
        (pane.querySelector(`[data-field="${f}"]`) as HTMLInputElement | HTMLTextAreaElement).value;
      handlers.onSendCompose({
        adresat: val('adresat'),
        temat: val('temat'),
        dw: val('dw'),
        linie: val('tresc').split('\n'),
      });
    });
    pane.appendChild(send);
    return pane;
  };

  const renderKontakty = (state: MailUiState): HTMLElement => {
    const pane = doc.createElement('div');
    pane.className = 'arkmail-pane';
    if (state.contacts.length === 0) {
      pane.appendChild(dim('Brak kontaktow - pojawia sie po pobraniu listingow.'));
      return pane;
    }
    for (const c of state.contacts) {
      const row = doc.createElement('div');
      row.className = 'arkmail-contact';
      const stats = `(odebrane: ${c.lettersReceived}, wyslane: ${c.lettersSent})`;
      row.textContent = `${c.name} ${stats}${c.mailAlias ? ` alias: ${c.mailAlias}` : ''}`;
      pane.appendChild(row);
    }
    return pane;
  };

  const renderArchiwum = (state: MailUiState): HTMLElement => {
    const pane = doc.createElement('div');
    pane.className = 'arkmail-pane';
    const lab = doc.createElement('label');
    lab.textContent = 'Filtr tematu';
    pane.appendChild(lab);
    const input = doc.createElement('input');
    input.setAttribute('data-filter', 'temat');
    input.value = archFilter.temat ?? '';
    const list = doc.createElement('div');
    pane.appendChild(input);
    pane.appendChild(list);
    const repaint = () => {
      const rows = filterLetters(state.archive, archFilter);
      list.replaceChildren(
        ...rows.map((l) => {
          const row = doc.createElement('div');
          row.className = 'arkmail-arch-entry';
          row.textContent = `${l.number}. ${l.subject} — ${l.party} [${l.box}]`;
          return row;
        }),
      );
      if (rows.length === 0) {
        list.replaceChildren(dim('Archiwum puste albo filtr niczego nie trafia.'));
      }
    };
    input.addEventListener('input', () => {
      archFilter.temat = input.value === '' ? undefined : input.value;
      repaint();
    });
    repaint();
    return pane;
  };

  const dim = (text: string): HTMLElement => {
    const el = doc.createElement('div');
    el.className = 'arkmail-dim';
    el.textContent = text;
    return el;
  };

  const off = store.subscribe(render);
  render(store.state);
  return () => {
    off();
    container.replaceChildren();
  };
}
