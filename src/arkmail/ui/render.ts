/**
 * Render UI ArkMail: cienka powloka DOM nad MailUiStore.
 * Vanilla DOM (zero React w bundle), elementy tworzone przez
 * container.ownerDocument (wtyka: document przegladarki; testy: happy-dom).
 *
 * Przerenderowanie przy kazdej zmianie store; WYJATEK: filtr archiwum
 * trzymany lokalnie w tej powloce (input nie traci fokusu przy pisaniu).
 */

import type { MailBox } from '../core/protocol/types.js';
import type { MailboxEntry } from '../core/session/mailbox.js';
import { fromISODate, type ListingSearch } from '../core/protocol/commands.js';
import { filterLetters, type ArchiveFilter } from '../core/archive.js';
import { viewContacts, type ContactSort } from '../core/contacts.js';
import {
  clampLineWidth,
  renderLetter,
  type LetterTemplate,
} from '../core/letterRender.js';
import type { MailUiState, MailUiStore, UiTab } from './store.js';
import { STYLES } from './styles.js';

export interface MailUiHandlers {
  /**
   * Handlery dostaja WPIS listingu (tozsamosc), nie surowy numer - numer
   * serwera zyje w kontekscie ostatniego listingu, wiec index.ts przed
   * kazda operacja pagerowa re-kotwiczy wpis na swiezy listing (Fala 9a).
   */
  onOpenLetter(box: MailBox, entry: MailboxEntry): void;
  onSendCompose(input: { adresat: string; temat: string; dw: string; linie: string[] }): void;
  onCloseLetter(): void;
  onRefreshBox(box: MailBox): void;
  onLoadOlder(box: MailBox): void;
  /** Start petli "Wczytaj wszystkie"; w trakcie petli = Przerwij. */
  onLoadAll(box: MailBox): void;
  /** Szukanie serwerowe (komenda "listy" z filtrami). */
  onSearch(box: MailBox, query: ListingSearch): void;
  /** Koniec trybu wynikow szukania (restore pelnego widoku, bez refetchu). */
  onClearSearch(box: MailBox): void;
  onDeleteLetter(box: MailBox, entry: MailboxEntry): void;
  onForwardLetter(box: MailBox, entry: MailboxEntry, adresat: string): void;
}

const TEMPLATES: Array<[LetterTemplate, string]> = [
  ['none', 'Bez ramki'],
  ['plain', 'Prosta ramka'],
  ['parchment', 'Pergamin'],
  ['parchment2', 'Pergamin II'],
  ['parchment3', 'Pergamin III'],
  ['raw', 'Surowy (jak wpisane)'],
];

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
  /** Filtr i sort kontaktow: lokalne (poza store) - ten sam powod co wyzej. */
  const contactView: { filter: string; sort: ContactSort } = { filter: '', sort: 'nazwa' };

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
        return renderNapisz(state);
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
        // Fala 9b: pobieramy tylko przy pierwszym wejsciu na skrzynke;
        // wczytane strony zostaja (reczne odswiezanie = przycisk obok).
        if (!state.boxes[box]) handlers.onRefreshBox(box);
      });
      boxes.appendChild(btn);
      // Osobny przycisk odswiezania danej skrzynki (bez zmiany zakladki).
      const refresh = doc.createElement('button');
      refresh.className = 'arkmail-refresh';
      refresh.setAttribute('data-box', box);
      refresh.setAttribute('title', `Odśwież: ${label}`);
      refresh.textContent = '↻';
      refresh.addEventListener('click', () => handlers.onRefreshBox(box));
      boxes.appendChild(refresh);
    }
    pane.appendChild(boxes);

    // Przelacznik powiadomien o nowej poczcie (trwale w storage).
    const notifyRow = doc.createElement('label');
    notifyRow.className = 'arkmail-dim';
    const chk = doc.createElement('input');
    chk.setAttribute('type', 'checkbox');
    chk.className = 'arkmail-notify-toggle';
    chk.checked = state.notifyEnabled;
    chk.addEventListener('click', () => store.setNotifyEnabled(!store.state.notifyEnabled));
    notifyRow.appendChild(chk);
    notifyRow.appendChild(doc.createTextNode(' Powiadom o nowej poczcie (tost)'));
    pane.appendChild(notifyRow);

    // Pasek szukania serwerowego (komenda "listy" z filtrami, skladnia
    // ?listy). Pola niekontrolowane (bez rerendera przy pisaniu);
    // puste zapytanie nie strzela.
    const searchRow = doc.createElement('div');
    searchRow.className = 'arkmail-search-row';
    const mkSearch = (key: string, placeholder: string, type = 'text') => {
      const input = doc.createElement('input');
      input.setAttribute('data-search', key);
      input.setAttribute('type', type);
      input.setAttribute('placeholder', placeholder);
      return input;
    };
    const sOsoba = mkSearch('osoba', 'Osoba');
    const sTemat = mkSearch('temat', 'Temat');
    const sOd = mkSearch('odDaty', 'Od dnia', 'date');
    const sDo = mkSearch('doDaty', 'Do dnia', 'date');
    const go = doc.createElement('button');
    go.className = 'arkmail-search-go';
    go.textContent = 'Szukaj';
    go.addEventListener('click', () => {
      const osoba = (sOsoba as HTMLInputElement).value.trim();
      const temat = (sTemat as HTMLInputElement).value.trim();
      const odDaty = fromISODate((sOd as HTMLInputElement).value) ?? undefined;
      const doDaty = fromISODate((sDo as HTMLInputElement).value) ?? undefined;
      const query: ListingSearch = {
        ...(osoba !== '' ? { osoba } : {}),
        ...(odDaty ? { odDaty } : {}),
        ...(doDaty ? { doDaty } : {}),
        ...(temat !== '' ? { temat } : {}),
      };
      if (Object.keys(query).length === 0) return;
      handlers.onSearch(state.activeBox, query);
    });
    searchRow.appendChild(sOsoba);
    searchRow.appendChild(sTemat);
    searchRow.appendChild(sOd);
    searchRow.appendChild(sDo);
    searchRow.appendChild(go);
    pane.appendChild(searchRow);

    // Tryb wynikow: banner z opisem zapytania + Wyczysc (restore pelnego
    // widoku z pamieci, bez strzalu do serwera).
    const searchMode = state.search && state.search.box === state.activeBox ? state.search : null;
    if (searchMode) {
      const banner = doc.createElement('div');
      banner.className = 'arkmail-search-banner';
      banner.appendChild(doc.createTextNode(`Wyniki szukania: ${searchMode.label}`));
      const clear = doc.createElement('button');
      clear.className = 'arkmail-search-clear';
      clear.textContent = 'Wyczysc';
      clear.addEventListener('click', () => handlers.onClearSearch(state.activeBox));
      banner.appendChild(clear);
      pane.appendChild(banner);
    }

    const view = state.boxes[state.activeBox];
    if (!view) {
      pane.appendChild(dim('Skrzynka nie zaladowana - kliknij jej nazwe, aby pobrac.'));
      return pane;
    }
    if (view.empty !== null) {
      pane.appendChild(dim(view.empty === 'puste' ? 'Skrzynka pusta.' : 'Brak pasujacych listow.'));
      return pane;
    }
    // Serwer podaje najstarszy->najnowszy; wyswietlamy najnowszy->najstarszy.
    const displayed = [...view.entries].reverse();
    for (const [idx, e] of displayed.entries()) {
      // Wiersz w stylu nowoczesnej poczty: numer | nadawca | temat | data.
      // Numer WYSWIETLANY jest nasz, ciagly 1..N (Fala 9a): serwerowe numery
      // sa kontekstowe (renumeracja per listing), pokazywanie ich mylilo
      // ("1-50 i znowu 1-50"). Serwerowy numer zostaje w data-number.
      const row = doc.createElement('div');
      row.className = 'arkmail-entry' + (e.isRead ? '' : ' arkmail-unread');
      row.setAttribute('data-number', String(e.number));
      const num = doc.createElement('span');
      num.className = 'arkmail-entry-num';
      num.textContent = `${idx + 1}.`;
      row.appendChild(num);
      const party = doc.createElement('span');
      party.className = 'arkmail-entry-party';
      party.textContent = e.party || '—';
      row.appendChild(party);
      const subject = doc.createElement('span');
      subject.className = 'arkmail-entry-subject';
      subject.textContent = e.subject + (e.forwarded ? ' (forwardowany)' : '');
      row.appendChild(subject);
      const date = doc.createElement('span');
      date.className = 'arkmail-entry-date';
      date.textContent = e.date ? e.date.raw : '';
      row.appendChild(date);
      row.addEventListener('click', () => handlers.onOpenLetter(state.activeBox, e));
      pane.appendChild(row);
    }
    if (searchMode) {
      // Wyniki szukania sa renumerowane wewnatrz selekcji - paginacja
      // wstecz nie ma tu sensu (kotwica liczona z pelnego listingu).
    } else if (state.loadAll && state.loadAll.box === state.activeBox) {
      // Petla "Wczytaj wszystkie" w toku na tej skrzynce: jedyny przycisk
      // to Przerwij z numerem biezacej strony.
      const cancel = doc.createElement('button');
      cancel.className = 'arkmail-older-all';
      cancel.textContent = `Przerwij (strona ${state.loadAll.pages})`;
      cancel.addEventListener('click', () => handlers.onLoadAll(state.activeBox));
      pane.appendChild(cancel);
    } else if (view.truncated && !state.loadAll) {
      // Petla na innej skrzynce chowa przyciski paginacji (blokada sesji).
      const row = doc.createElement('div');
      row.className = 'arkmail-older-row';
      const btn = doc.createElement('button');
      btn.className = 'arkmail-older';
      btn.textContent = 'Wczytaj starsze';
      btn.addEventListener('click', () => handlers.onLoadOlder(state.activeBox));
      row.appendChild(btn);
      const all = doc.createElement('button');
      all.className = 'arkmail-older-all';
      all.textContent = 'Wczytaj wszystkie';
      all.addEventListener('click', () => handlers.onLoadAll(state.activeBox));
      row.appendChild(all);
      pane.appendChild(row);
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
    const subj = doc.createElement('div');
    subj.className = 'arkmail-letter-subject';
    subj.textContent = l.subject;
    head.appendChild(subj);
    const meta = doc.createElement('div');
    meta.className = 'arkmail-letter-meta';
    meta.textContent =
      `List ${l.number} — Od: ${l.from} — Do: ${l.to}` +
      (l.cc ? ` — DW: ${l.cc}` : '') +
      (l.date ? ` — ${l.date}` : '');
    head.appendChild(meta);
    pane.appendChild(head);
    const body = doc.createElement('div');
    body.className = 'arkmail-letter-body';
    body.textContent = l.body.join('\n');
    pane.appendChild(body);

    // Operacje pagerowe: kasowanie i przekazanie (sesje w index.ts).
    // Wymagaja wpisu-zrodla (re-kotwiczenie numeru); bez zrodla wylaczone.
    const ops = doc.createElement('div');
    ops.className = 'arkmail-letter-ops';
    const source = l.source;
    const del = doc.createElement('button');
    del.className = 'arkmail-del';
    del.textContent = 'Usuń';
    if (source) {
      del.addEventListener('click', () => handlers.onDeleteLetter(l.box, source));
    } else {
      del.setAttribute('disabled', '');
      del.setAttribute('title', 'Otworz list z zakladki Listy, aby go skasowac.');
    }
    ops.appendChild(del);
    const fwdInput = doc.createElement('input');
    fwdInput.setAttribute('data-field', 'forward');
    fwdInput.setAttribute('placeholder', 'Przekaż do (gracz/alias)');
    if (!source) fwdInput.setAttribute('disabled', '');
    ops.appendChild(fwdInput);
    const fwd = doc.createElement('button');
    fwd.className = 'arkmail-fwd';
    fwd.textContent = 'Przekaż';
    if (source) {
      fwd.addEventListener('click', () => {
        const adresat = fwdInput.value.trim();
        if (adresat) handlers.onForwardLetter(l.box, source, adresat);
      });
    } else {
      fwd.setAttribute('disabled', '');
      fwd.setAttribute('title', 'Otworz list z zakladki Listy, aby go przekazac.');
    }
    ops.appendChild(fwd);
    pane.appendChild(ops);

    if (!state.wide) {
      const back = doc.createElement('button');
      back.className = 'arkmail-older';
      back.textContent = 'Zamknij list';
      back.addEventListener('click', () => handlers.onCloseLetter());
      pane.appendChild(back);
    }
    return pane;
  };

  /** Robocza tresc compose: poza store, przetrwa pelne rerendery
   *  (zmiana szablonu/szerokosci nie kasuje wpisanego listu). */
  const composeDraft = { adresat: '', temat: '', dw: '', tresc: '' };

  const renderNapisz = (state: MailUiState): HTMLElement => {
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
      input.value = composeDraft[field as 'adresat' | 'temat' | 'dw'];
      input.addEventListener('input', () => {
        composeDraft[field as 'adresat' | 'temat' | 'dw'] = input.value;
      });
      pane.appendChild(input);
    }

    // Szablon ramki + szerokosc linii (trzymane w store, trwale).
    const labSz = doc.createElement('label');
    labSz.textContent = 'Szablon';
    pane.appendChild(labSz);
    const sel = doc.createElement('select');
    sel.setAttribute('data-field', 'szablon');
    for (const [value, label] of TEMPLATES) {
      const opt = doc.createElement('option');
      opt.setAttribute('value', value);
      opt.textContent = label;
      sel.appendChild(opt);
    }
    sel.value = state.composeTemplate;
    sel.addEventListener('change', () => {
      store.setCompose({ template: sel.value as LetterTemplate });
    });
    pane.appendChild(sel);

    const labW = doc.createElement('label');
    labW.textContent = 'Szerokość linii (20-120)';
    pane.appendChild(labW);
    const width = doc.createElement('input');
    width.setAttribute('data-field', 'szerokosc');
    width.value = String(state.composeWidth);
    width.addEventListener('change', () => {
      const parsed = Number.parseInt(width.value, 10);
      store.setCompose({
        width: Number.isFinite(parsed) ? clampLineWidth(parsed) : 60,
      });
    });
    pane.appendChild(width);

    const lab = doc.createElement('label');
    lab.textContent = 'Treść';
    pane.appendChild(lab);
    const tresc = doc.createElement('textarea');
    tresc.setAttribute('data-field', 'tresc');
    tresc.value = composeDraft.tresc;
    pane.appendChild(tresc);

    const labP = doc.createElement('label');
    labP.textContent = 'Podgląd (tak list wyjedzie do gry)';
    pane.appendChild(labP);
    const preview = doc.createElement('pre');
    preview.className = 'arkmail-preview';
    pane.appendChild(preview);

    const repaint = () => {
      const st = store.state;
      preview.textContent = renderLetter(
        tresc.value,
        st.composeTemplate,
        st.composeWidth,
      ).lines.join('\n');
    };
    tresc.addEventListener('input', () => {
      composeDraft.tresc = tresc.value;
      repaint();
    });
    repaint();

    const send = doc.createElement('button');
    send.className = 'arkmail-send';
    send.textContent = 'Wyślij';
    send.addEventListener('click', () => {
      const st = store.state;
      const rendered = renderLetter(tresc.value, st.composeTemplate, st.composeWidth);
      if (!rendered.hasContent) return; // pusty list nie wylatuje
      const val = (f: string) =>
        (pane.querySelector(`[data-field="${f}"]`) as HTMLInputElement | HTMLTextAreaElement).value;
      handlers.onSendCompose({
        adresat: val('adresat'),
        temat: val('temat'),
        dw: val('dw'),
        linie: rendered.lines,
      });
    });
    pane.appendChild(send);
    return pane;
  };

  const renderKontakty = (state: MailUiState): HTMLElement => {
    const pane = doc.createElement('div');
    pane.className = 'arkmail-pane';
    // Filtr i sort sa lokalne (poza store, jak filtr archiwum):
    // repaint dotyczy tylko listy, input nie traci fokusu przy pisaniu.
    const controls = doc.createElement('div');
    controls.className = 'arkmail-contact-controls';
    const input = doc.createElement('input');
    input.className = 'arkmail-contact-filter';
    input.setAttribute('placeholder', 'Filtr: nazwa lub alias');
    input.value = contactView.filter;
    const sel = doc.createElement('select');
    sel.className = 'arkmail-contact-sort';
    const SORT_OPTS: Array<[ContactSort, string]> = [
      ['nazwa', 'Nazwa A-Z'],
      ['liczba', 'Liczba listow'],
      ['ostatni', 'Ostatni kontakt'],
    ];
    for (const [value, label] of SORT_OPTS) {
      const o = doc.createElement('option');
      o.setAttribute('value', value);
      o.textContent = label;
      sel.appendChild(o);
    }
    sel.value = contactView.sort;
    controls.appendChild(input);
    controls.appendChild(sel);
    pane.appendChild(controls);
    const list = doc.createElement('div');
    pane.appendChild(list);
    const repaint = () => {
      const rows = viewContacts(state.contacts, contactView);
      list.replaceChildren(
        ...rows.map((c) => {
          const row = doc.createElement('div');
          row.className = 'arkmail-contact';
          const name = doc.createElement('span');
          name.className = 'arkmail-contact-name';
          name.textContent = c.name;
          row.appendChild(name);
          const stats = doc.createElement('span');
          stats.className = 'arkmail-contact-stats';
          stats.textContent =
            `(odebrane: ${c.lettersReceived}, wyslane: ${c.lettersSent})` +
            (c.mailAlias ? ` alias: ${c.mailAlias}` : '');
          row.appendChild(stats);
          if (c.lastContactRaw) {
            const last = doc.createElement('span');
            last.className = 'arkmail-contact-last';
            last.textContent = c.lastContactRaw;
            row.appendChild(last);
          }
          return row;
        }),
      );
      if (rows.length === 0) {
        list.replaceChildren(
          dim(
            state.contacts.length === 0
              ? 'Brak kontaktow - pojawia sie po pobraniu listingow.'
              : 'Filtr niczego nie trafia.',
          ),
        );
      }
    };
    input.addEventListener('input', () => {
      contactView.filter = input.value;
      repaint();
    });
    sel.addEventListener('change', () => {
      contactView.sort = sel.value as ContactSort;
      repaint();
    });
    repaint();
    return pane;
  };

  const renderArchiwum = (state: MailUiState): HTMLElement => {
    const pane = doc.createElement('div');
    pane.className = 'arkmail-pane';
    // Wszystkie filtry lokalne (poza store): repaint tylko listy,
    // input nie traci fokusu przy pisaniu.
    const controls = doc.createElement('div');
    controls.className = 'arkmail-arch-controls';
    const mkText = (key: 'osoba' | 'temat' | 'tresc' | 'odDaty' | 'doDaty', placeholder: string, type = 'text') => {
      const input = doc.createElement('input');
      input.setAttribute('data-filter', key);
      input.setAttribute('type', type);
      input.setAttribute('placeholder', placeholder);
      input.value = archFilter[key] ?? '';
      input.addEventListener('input', () => {
        archFilter[key] = input.value === '' ? undefined : input.value;
        repaint();
      });
      return input;
    };
    controls.appendChild(mkText('osoba', 'Osoba (nadawca lub odbiorca)'));
    const skr = doc.createElement('select');
    skr.setAttribute('data-filter', 'skrzynka');
    const SKR_OPTS: Array<[MailBox | '', string]> = [
      ['', 'Wszystkie skrzynki'],
      ['odebrane', 'Odebrane'],
      ['nieprzeczytane', 'Nieprzeczytane'],
      ['wyslane', 'Wysłane'],
      ['niewyslane', 'Niewysłane'],
    ];
    for (const [value, label] of SKR_OPTS) {
      const o = doc.createElement('option');
      o.setAttribute('value', value);
      o.textContent = label;
      skr.appendChild(o);
    }
    skr.value = archFilter.skrzynka ?? '';
    skr.addEventListener('change', () => {
      archFilter.skrzynka = skr.value === '' ? undefined : (skr.value as MailBox);
      repaint();
    });
    controls.appendChild(skr);
    controls.appendChild(mkText('temat', 'Temat'));
    controls.appendChild(mkText('tresc', 'Tresc listu'));
    controls.appendChild(mkText('odDaty', 'Od daty', 'date'));
    controls.appendChild(mkText('doDaty', 'Do daty', 'date'));
    pane.appendChild(controls);
    const list = doc.createElement('div');
    pane.appendChild(list);
    const repaint = () => {
      const rows = filterLetters(state.archive, archFilter);
      list.replaceChildren(
        ...rows.map((l, idx) => {
          const row = doc.createElement('div');
          row.className = 'arkmail-arch-entry';
          const subj = doc.createElement('span');
          // Numer wyswietlany ciagly (Fala 9a) - numer z listingu serwera
          // jest kontekstowy i po scaleniu stron nic nie znaczy.
          subj.textContent = `${idx + 1}. ${l.subject}`;
          row.appendChild(subj);
          const meta = doc.createElement('span');
          meta.className = 'arkmail-arch-meta';
          meta.textContent = `— ${l.party} [${l.box}]`;
          row.appendChild(meta);
          return row;
        }),
      );
      if (rows.length === 0) {
        list.replaceChildren(dim('Archiwum puste albo filtr niczego nie trafia.'));
      }
    };
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
