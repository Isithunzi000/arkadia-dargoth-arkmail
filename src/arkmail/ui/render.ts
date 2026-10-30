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
import {
  fromISODate,
  validateSearchDraft,
  type ListingSearch,
} from '../core/protocol/commands.js';
import {
  contentKeyOf,
  filterVisibleArchive,
  type ArchiveFilter,
  type ArchiveLetter,
} from '../core/archive.js';
import { parseMailDate } from '../core/protocol/parser.js';
import { archiveExportEntries } from '../core/exportTxt.js';
import { viewContacts, type ContactSort } from '../core/contacts.js';
import {
  clampLineWidth,
  renderLetter,
  type LetterTemplate,
} from '../core/letterRender.js';
import { validateCompose, type ComposeSendInput } from '../core/composeValidation.js';
import type { MailUiState, MailUiStore, UiTab } from './store.js';
import { allBoxesIndexed, formatBadgeSuffix, INDEX_BOXES } from './store.js';
import { STYLES } from './styles.js';
import { attachGhost, type GhostSource } from './ghost.js';
import { emptyDeletionFilters, formatListCount } from './deletion.js';
import type { DeletionFilters } from './deletion.js';
import { PLUGIN_BUILD_DATE, PLUGIN_VERSION } from '../meta.js';

export interface MailUiHandlers {
  /**
   * Handlery dostaja WPIS listingu (tozsamosc), nie surowy numer - numer
   * serwera zyje w kontekscie ostatniego listingu, wiec index.ts przed
   * kazda operacja pagerowa re-kotwiczy wpis na swiezy listing (Fala 9a).
   */
  onOpenLetter(box: MailBox, entry: MailboxEntry): void;
  onSendCompose(input: ComposeSendInput): void;
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
  /**
   * Klik w wpis archiwum (Fala 16h): wpis z trescia w cache otwiera
   * sie z pamieci (zero komend); bez tresci - re-kotwica po dacie
   * i odczyt z serwera (index.ts buduje pseudo-wpis). Opcjonalny:
   * starsze montaze testowe go nie podaja (jak onClearCache).
   */
  onOpenArchiveLetter?(letter: ArchiveLetter): void;
  /**
   * Masowe pobieranie tresci do archiwum (Fala 16h). Start petli; w
   * trakcie petli drugi klik = Przerwij (jak onLoadAll). Opcjonalny:
   * starsze montaze testowe go nie podaja (jak onClearCache).
   */
  onDownloadArchiveBodies?(): void;
  /**
   * Czyszczenie pamieci podrecznej (Fala 12e). Opcjonalny: starsze
   * montaze testowe go nie podaja - przycisk wtedy po prostu nic nie
   * robi po potwierdzeniu.
   */
  onClearCache?(): void;
  /**
   * Wyslanie zwierzecia pocztowego (Fala 13b): komenda "wyslij zwierze"
   * - zwierze samo wysyla niewyslane i odbiera nowa poczte. Opcjonalny
   *  jak onClearCache.
   */
  onSendAnimal?(): void;
  /**
   * Eksport otwartego listu do pliku TXT (Fala 17g, zgloszenie
   * 2026-10-19/20 pkt 7). Opcjonalny: starsze montaze testowe go nie
   * podaja (jak onClearCache).
   */
  onExportLetter?(): void;
  /**
   * Eksport calego archiwum do ZIP z plikami TXT (Fala 17g).
   * Opcjonalny: starsze montaze testowe go nie podaja.
   */
  onExportArchive?(): void;
  /**
   * Indeksacja wszystkich skrzynek (Fala 18c, zgloszenie 2026-10-20
   * pkt 1): pelny listing kazdej skrzynki = kompletna baza dla
   * kontaktow i eksportow. W trakcie petli drugi klik = Przerwij.
   * Opcjonalny: starsze montaze testowe go nie podaja.
   */
  onIndexAll?(): void;
  /** Reczne wyszukanie jednej strony w zakladce usuwania. */
  onDeletionSearch?(box: MailBox, query: ListingSearch): void;
  /** Zbiorcze usuniecie po potwierdzeniu w interfejsie. */
  onDeletionDelete?(): void;
}

const TEMPLATES: Array<[LetterTemplate, string]> = [
  ['none', 'Bez ramki'],
  ['plain', 'Prosta ramka'],
  ['parchment', 'Pergamin'],
  ['parchment2', 'Pergamin II'],
  ['parchment3', 'Pergamin III'],
  ['raw', 'Surowy (jak wpisane)'],
];

// Fala 11b: 'list' NIE jest zakladka - to wewnetrzny stan widoku
// (otwarty list). Na pasku "Listy" obok "List" mylilo gracza; powrot
// z widoku listu robi 'Zamknij list' (waski) albo 'Zamknij' (wide).
const TABS: Array<[UiTab, string]> = [
  ['listy', 'Listy'],
  ['napisz', 'Napisz list'],
  ['kontakty', 'Kontakty'],
  ['archiwum', 'Archiwum'],
  ['usuwanie', 'Usuwanie listow'],
];

const BOXES: Array<[MailBox, string]> = [
  ['odebrane', 'Odebrane'],
  ['nieprzeczytane', 'Nieprzeczytane'],
  ['wyslane', 'Wyslane'],
  ['niewyslane', 'Niewyslane'],
];

/**
 * Okno dwuklikowego potwierdzenia zbiorczego usuwania (zgloszenie
 * 2026-10-30): drugi klik w tym czasie kasuje, ESC w tym czasie
 * anuluje uzbrojenie. Wyeksportowane na potrzeby testow (jeden
 * punkt prawdy dla renderu i asercji).
 */
export const DELETION_ARM_MS = 5000;

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
  /** Pelnoekranowy podglad compose (Fala 12d): czysto prezentacyjny stan,
   *  lokalny jak contactView; tresc listu zyje w composeDraft (nic nie ginie). */
  let previewFull = false;
  /** Draft pol szukajki: lokalny (jak filtr archiwum) - rerender nie kasuje
   *  wpisanego zapytania. */
  const searchDraft: Record<string, string> = { osoba: '', temat: '', tresc: '', odDaty: '', doDaty: '' };
  /** Draft filtrow zakladki usuwanie - lokalny (jak searchDraft): kazda
   *  litera nie kasowala wynikow i zaznaczenia (zgloszenie 2026-10-30),
   *  commit do store dopiero na klik "Szukaj / Odswiez". */
  const deletionDraft = emptyDeletionFilters();

  const setButtonLabel = (
    button: HTMLButtonElement,
    label: string,
    title = label,
  ): void => {
    button.textContent = label;
    button.setAttribute('title', title);
  };
  // Wspolny klawisz szukania/odswiezania (zgloszenie 2026-10-30): jedna
  // rola w obu zakladkach - puste filtry odswiezaja skrzynke, wypelnione
  // szukaja. Zakladka Listy juz tak dzialala; usuwanie dojrzewalo do
  // tej samej semantyki (osobny "Odswiez" byl redundantny).
  const SEARCH_GO_LABEL = 'Szukaj / Odswiez';
  const SEARCH_GO_TITLE = 'Szuka po wpisanych filtrach; przy pustych filtrach odswieza skrzynke';
  const fillButtonTitles = (scope: ParentNode): void => {
    scope.querySelectorAll('button').forEach((element) => {
      const button = element as HTMLButtonElement;
      if ((button.getAttribute('title') ?? '').trim()) return;
      const label = (button.textContent ?? '').trim();
      if (label) button.setAttribute('title', label);
    });
  };

  // Fala 11c: migawka widoku na czas pelnego rerenderu. Bez niej kazda
  // zmiana store (strona loadAll co ~400 ms, merge notyfikacji) niszczyla
  // DOM i gubila focus/karet/scroll - litera po literze wywalalo z pola.
  interface ViewSnap {
    focusKey: string | null;
    /** Wartosc aktywnego pola: draft aktualizuje sie na 'input', ale
     *  wpis bez zdarzenia (i tak trafia tu zawsze najswiezszy tekst z DOM). */
    focusValue: string | null;
    caret: [number, number] | null;
    scroll: Record<string, number>;
  }
  const focusKeyOf = (el: Element | null): string | null => {
    if (!el || typeof (el as HTMLElement).getAttribute !== 'function') return null;
    if (!root.contains(el)) return null;
    for (const attr of ['data-search', 'data-field', 'data-filter', 'data-deletion-filter']) {
      const v = (el as HTMLElement).getAttribute(attr);
      if (v !== null) return `[${attr}="${v}"]`;
    }
    return null;
  };
  const snapshotView = (): ViewSnap => {
    const snap: ViewSnap = { focusKey: null, focusValue: null, caret: null, scroll: {} };
    const active = doc.activeElement as Element | null;
    const key = focusKeyOf(active);
    if (key) {
      snap.focusKey = key;
      snap.focusValue = (active as HTMLInputElement).value ?? null;
      const inp = active as HTMLInputElement;
      try {
        if (typeof inp.selectionStart === 'number') {
          snap.caret = [inp.selectionStart, inp.selectionEnd ?? inp.selectionStart];
        }
      } catch {
        /* np. input[type=date] bez karetki */
      }
    }
    for (const pane of Array.from(root.querySelectorAll('[data-pane-key]'))) {
      const k = (pane as HTMLElement).getAttribute('data-pane-key');
      if (k !== null) snap.scroll[k] = (pane as HTMLElement).scrollTop;
    }
    return snap;
  };
  const restoreView = (snap: ViewSnap): void => {
    for (const pane of Array.from(root.querySelectorAll('[data-pane-key]'))) {
      const k = (pane as HTMLElement).getAttribute('data-pane-key');
      if (k !== null && snap.scroll[k] !== undefined) {
        (pane as HTMLElement).scrollTop = snap.scroll[k];
      }
    }
    if (snap.focusKey) {
      const el = root.querySelector(snap.focusKey) as HTMLInputElement | null;
      if (el) {
        if (snap.focusValue !== null) el.value = snap.focusValue;
        el.focus();
        if (snap.caret) {
          try {
            el.setSelectionRange(snap.caret[0], snap.caret[1]);
          } catch {
            /* input[type=date] */
          }
        }
      }
    }
  };

  // Fala 9g: zrodla ghost-podpowiedzi, liczone na biezaco ze store.
  // Pola osobowe: kontakty (najswiezsze najpierw) + ich aliasy.
  // Dedup bez wielkosci liter; wygrywa forma kanoniczna ze zrodla.
  const personSource: GhostSource = () => {
    const seen = new Set<string>();
    const out: string[] = [];
    const push = (v: string | undefined): void => {
      if (!v) return;
      const k = v.toLowerCase();
      if (seen.has(k)) return;
      seen.add(k);
      out.push(v);
    };
    const contacts = [...store.state.contacts].sort(
      (a, b) => (b.lastContactKey ?? -1) - (a.lastContactKey ?? -1),
    );
    for (const c of contacts) {
      push(c.name);
      push(c.mailAlias);
    }
    return out;
  };
  // Pola tematu: tematy z archiwum (archiwum jest najnowsze->najstarsze).
  const subjectSource: GhostSource = () => {
    const seen = new Set<string>();
    const out: string[] = [];
    for (const l of store.state.archive) {
      if (!l.subject) continue;
      const k = l.subject.toLowerCase();
      if (seen.has(k)) continue;
      seen.add(k);
      out.push(l.subject);
    }
    return out;
  };

  const renderVersionFooter = (): HTMLElement => {
    const footer = doc.createElement('footer');
    footer.className = 'arkmail-version-footer';
    footer.textContent = `v${PLUGIN_VERSION} | ${PLUGIN_BUILD_DATE}`;
    return footer;
  };

  const render = (state: MailUiState) => {
    const snap = snapshotView();
    root.className = 'arkmail-root' + (state.wide ? ' arkmail-wide' : '');
    composePreview = null; // nowe drzewo = nowy <pre> podgladu
    // Fala 12d: pelny podglad zyje tylko na zakladce napisz - zmiana
    // zakladki zamyka overlay (powrot do napisz = formularz).
    if (state.tab !== 'napisz') previewFull = false;
    const nodes: Node[] = [renderTabs(state)];
    if (state.busy !== null) nodes.push(renderBusy(state));
    if (state.tab === 'napisz' && previewFull) {
      // Fala 12d: podglad na cale okno popupu (oba tryby szerokosci).
      nodes.push(renderPreviewFull());
    } else if (state.wide && state.tab === 'listy') {
      // Fala 10: na szerokim zakladka 'listy' to ZAWSZE split (klasyczny
      // klient poczty) - bez otwartego listu prawy panel ma placeholder.
      const split = doc.createElement('div');
      split.className = 'arkmail-split';
      split.appendChild(renderListy(state));
      split.appendChild(renderList(state));
      nodes.push(split);
    } else if (state.wide && state.tab === 'napisz') {
      // Fala 11d: compose dwupanelowy - formularz z lewej, zywy podglad
      // wysylanego listu z prawej (konwencja podgladu /list w kliencie).
      const split = doc.createElement('div');
      split.className = 'arkmail-split arkmail-split-compose';
      split.appendChild(renderNapisz(state));
      split.appendChild(renderComposePreview());
      nodes.push(split);
    } else {
      nodes.push(renderPane(state));
    }
    nodes.push(renderVersionFooter());
    root.replaceChildren(...nodes);
    fillButtonTitles(root);
    restoreView(snap);
  };

  const renderTabs = (state: MailUiState): HTMLElement => {
    const bar = doc.createElement('div');
    bar.className = 'arkmail-tabs';
    for (const [id, label] of TABS) {
      const btn = doc.createElement('button');
      btn.className =
        'arkmail-tab' +
        (state.tab === id ? ' arkmail-tab-active' : '') +
        // Fala 14b: flash po odlozeniu listu w niewyslanych (compose
        // poza poczta zawsze kolejkuje) - gracz widzi, gdzie kliknac.
        (state.unsentFlash && id === 'listy' ? ' arkmail-flash' : '');
      btn.setAttribute('data-tab', id);
      // Fala 14d: '(u)' albo '(u/n)' - nieprzeczytane/niewyslane.
      btn.textContent =
        id === 'listy' ? label + formatBadgeSuffix(state.badge, state.badgeUnsent) : label;
      btn.addEventListener('click', () => store.setTab(id));
      bar.appendChild(btn);
    }
    return bar;
  };

  /** Fala 18d: ETA w ludzkiej formie - sekundy <45 s, potem minuty. */
  const formatEta = (ms: number): string =>
    ms < 45_000
      ? `zostalo ok. ${Math.max(1, Math.round(ms / 1000))} s`
      : `zostalo ok. ${Math.max(1, Math.round(ms / 60000))} min`;

  const renderBusy = (state: MailUiState): HTMLElement => {
    const el = doc.createElement('div');
    el.className = 'arkmail-busy';
    const label = doc.createElement('span');
    // Fala 18d (zgloszenie pkt 2): przy petli pobierania tresci ETA
    // doklejane do opisu (od 3 ukonczonych) + pasek procentowy pod
    // tekstem. Petle bez znanego total (Wczytaj wszystkie, indeksacja)
    // zostaja przy samym liczniku.
    const dl = state.archiveDownload;
    label.textContent =
      `${state.busy ?? ''}` +
      (dl !== null && dl.etaMs !== null ? ` (${formatEta(dl.etaMs)})` : '');
    el.appendChild(label);
    if (dl !== null && dl.total > 0) {
      const track = doc.createElement('div');
      track.className = 'arkmail-busy-track';
      const bar = doc.createElement('div');
      bar.className = 'arkmail-busy-bar';
      const pct = Math.min(100, Math.round((dl.done / dl.total) * 100));
      bar.style.width = `${pct}%`;
      track.appendChild(bar);
      el.appendChild(track);
    }
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
      case 'usuwanie':
        return renderUsuwanie(state);
    }
  };

  const renderUsuwanie = (state: MailUiState): HTMLElement => {
    const pane = doc.createElement('div');
    pane.className = 'arkmail-pane arkmail-deletion';
    pane.setAttribute('data-pane-key', 'usuwanie');

    const intro = doc.createElement('p');
    intro.className = 'arkmail-deletion-intro';
    intro.textContent =
      'Wybierz skrzynke i kliknij Szukaj / Odswiez. Zaznacz listy, ktore chcesz usunac, i potwierdz operacje. ' +
      'Wyniki nie odswiezaja sie automatycznie. Wyjscie z zakladki czysci wyniki i zaznaczenie.';
    pane.appendChild(intro);

    const controls = doc.createElement('div');
    controls.className = 'arkmail-deletion-controls';
    const box = doc.createElement('select');
    box.className = 'arkmail-deletion-box';
    box.setAttribute('title', 'Wybierz skrzynke');
    for (const [id, label] of BOXES) {
      const option = doc.createElement('option');
      option.value = id;
      option.textContent = label;
      option.selected = state.deletion.box === id;
      box.appendChild(option);
    }
    box.value = state.deletion.box;
    controls.appendChild(box);

    const search = doc.createElement('button');
    search.className = 'arkmail-deletion-search';
    setButtonLabel(search, SEARCH_GO_LABEL, SEARCH_GO_TITLE);
    let searchErrorTimer: ReturnType<typeof setTimeout> | null = null;
    const showSearchError = (message: string): void => {
      if (searchErrorTimer) clearTimeout(searchErrorTimer);
      setButtonLabel(search, message);
      searchErrorTimer = setTimeout(
        () => setButtonLabel(search, SEARCH_GO_LABEL, SEARCH_GO_TITLE),
        3000,
      );
    };
    // Jedna akcja dla klawisza i zmiany skrzynki (parzystosc z Listy:
    // klik w skrzynke od razu pokazuje jej listing). Draft lokalny -
    // commit do store dopiero tu.
    const fireSearch = () => {
      const current = store.state.deletion;
      const osoba = deletionDraft.osoba.trim();
      const temat = deletionDraft.temat.trim();
      const tresc = deletionDraft.tresc.trim();
      const validationError = validateSearchDraft({
        osoba,
        temat,
        tresc,
        odDaty: deletionDraft.odDaty,
        doDaty: deletionDraft.doDaty,
      });
      if (validationError) {
        showSearchError(validationError);
        return;
      }
      if (searchErrorTimer) clearTimeout(searchErrorTimer);
      setButtonLabel(search, SEARCH_GO_LABEL, SEARCH_GO_TITLE);
      store.setDeletionFilters({ ...deletionDraft });
      const query: ListingSearch = {};
      if (osoba) query.osoba = osoba;
      if (temat) query.temat = temat;
      if (tresc) query.tresc = tresc;
      const odDaty = fromISODate(deletionDraft.odDaty);
      const doDaty = fromISODate(deletionDraft.doDaty);
      if (odDaty) query.odDaty = odDaty;
      if (doDaty) query.doDaty = doDaty;
      handlers.onDeletionSearch?.(current.box, query);
    };
    search.addEventListener('click', fireSearch);
    box.addEventListener('change', () => {
      store.setDeletionBox(box.value as MailBox);
      fireSearch();
    });
    controls.appendChild(search);

    const clearFilters = doc.createElement('button');
    clearFilters.className = 'arkmail-deletion-clear-filters';
    clearFilters.textContent = 'Wyczysc filtry';
    clearFilters.addEventListener('click', () => {
      for (const key of ['osoba', 'temat', 'tresc', 'odDaty', 'doDaty'] as const) {
        deletionDraft[key] = '';
      }
      filterRow.querySelectorAll('[data-deletion-filter]').forEach((el) => {
        (el as HTMLInputElement).value = '';
      });
      store.setDeletionFilters(emptyDeletionFilters());
    });
    controls.appendChild(clearFilters);
    pane.appendChild(controls);

    const filterRow = doc.createElement('div');
    filterRow.className = 'arkmail-deletion-filters';
    const fields: Array<[keyof DeletionFilters, string, string]> = [
      ['osoba', 'Osoba (kogo? czego?)', 'Wpisz imie w dopelniaczu'],
      ['temat', 'Temat', 'Fragment tematu'],
      ['tresc', 'Tresc', 'Fragment tresci'],
      ['odDaty', 'Od daty', ''],
      ['doDaty', 'Do daty', ''],
    ];
    for (const [key, label, placeholder] of fields) {
      const wrap = doc.createElement('label');
      wrap.className = 'arkmail-deletion-filter';
      const caption = doc.createElement('span');
      caption.textContent = label;
      wrap.appendChild(caption);
      const field = doc.createElement('input');
      field.type = key === 'odDaty' || key === 'doDaty' ? 'date' : 'text';
      field.value = deletionDraft[key];
      field.setAttribute('data-deletion-filter', key);
      if (placeholder) field.setAttribute('placeholder', placeholder);
      // Pola pisza tylko do lokalnego szkicu. Gasic repaint przy kazdym
      // znaku psuloby fokus i skakaloby czapeczka; commit dopiero na klik
      // 'Szukaj / Odswiez' (fireSearch), a clearFilters czysci oba konce.
      field.addEventListener('input', () => {
        deletionDraft[key] = field.value;
      });
      wrap.appendChild(field);
      filterRow.appendChild(wrap);
    }
    pane.appendChild(filterRow);

    if (state.deletion.message !== null) {
      const message = doc.createElement('p');
      message.className = 'arkmail-deletion-message';
      message.textContent = state.deletion.message;
      pane.appendChild(message);
    }
    const result = state.deletion.result;
    const entries = result?.kind === 'lista' ? result.entries : [];
    if (result !== null) {
      const summary = doc.createElement('p');
      summary.className = 'arkmail-deletion-summary';
      summary.textContent = result.kind === 'lista'
        ? `Wyniki: ${formatListCount(entries.length)}.`
        : 'Brak listow dla podanych filtrow.';
      pane.appendChild(summary);
      if (result.kind === 'lista' && result.header.truncated) {
        const limit = doc.createElement('p');
        limit.className = 'arkmail-dim arkmail-deletion-limit';
        limit.textContent = 'Serwer pokazuje maksymalnie 50 wynikow.';
        pane.appendChild(limit);
      }
    }

    const selectionOps = doc.createElement('div');
    selectionOps.className = 'arkmail-deletion-selection-ops';
    const selectAll = doc.createElement('button');
    selectAll.className = 'arkmail-deletion-select-all';
    selectAll.textContent = 'Zaznacz wszystkie';
    if (entries.length === 0) selectAll.setAttribute('disabled', '');
    selectAll.addEventListener('click', () => store.selectAllDeletionEntries());
    selectionOps.appendChild(selectAll);
    const clearSelection = doc.createElement('button');
    clearSelection.className = 'arkmail-deletion-clear-selection';
    clearSelection.textContent = 'Odznacz wszystkie';
    if (state.deletion.selected.length === 0) clearSelection.setAttribute('disabled', '');
    clearSelection.addEventListener('click', () => store.clearDeletionSelection());
    selectionOps.appendChild(clearSelection);

    const remove = doc.createElement('button');
    remove.className = 'arkmail-deletion-delete';
    // Uzbrojenie dwukliku zyje w store (deletion.armedAt), nie w tym
    // zamknieciu: kazdy repaint odtwarza drzewo i zjadal stan lokalny
    // (zgloszenie 2026-10-30: drugi klik uzbrajal od nowa zamiast kasowac).
    const selectedCount = state.deletion.selected.length;
    const armedAt = state.deletion.armedAt;
    const armed = armedAt !== 0 && Date.now() - armedAt < DELETION_ARM_MS;
    if (armed) {
      setButtonLabel(
        remove,
        `Potwierdz usuniecie: ${formatListCount(selectedCount)}`,
        `Usunac zaznaczone listy (liczba: ${selectedCount})? Tej operacji nie mozna cofnac. Kliknij ponownie, aby potwierdzic. ESC anuluje.`,
      );
    } else {
      setButtonLabel(remove, 'Usun zaznaczone', 'Usun zaznaczone listy. Tej operacji nie mozna cofnac.');
    }
    if (selectedCount === 0) remove.setAttribute('disabled', '');
    remove.addEventListener('click', () => {
      if (!armed) {
        store.armDeletionConfirm();
        const armedStamp = store.state.deletion.armedAt;
        // Po DELETION_ARM_MS rozbrojenie - tylko gdy nikt w miedzyczasie
        // nie uzbroil ponownie (np. klik na swiezym przycisku po repaint).
        setTimeout(() => {
          if (store.state.deletion.armedAt === armedStamp) store.disarmDeletionConfirm();
        }, DELETION_ARM_MS);
        return;
      }
      store.disarmDeletionConfirm();
      handlers.onDeletionDelete?.();
    });
    selectionOps.appendChild(remove);
    pane.appendChild(selectionOps);

    if (selectedCount > 0) {
      const selected = doc.createElement('p');
      selected.className = 'arkmail-deletion-selected';
      selected.textContent = `Zaznaczono: ${formatListCount(selectedCount)}.`;
      pane.appendChild(selected);
    }

    if (entries.length > 0) {
      const list = doc.createElement('div');
      list.className = 'arkmail-deletion-results';
      // Najnowsze na gorze - identycznie jak w zakladce Listy
      // (zgloszenie 2026-10-30).
      for (const entry of [...entries].reverse()) {
        const row = doc.createElement('label');
        row.className = 'arkmail-deletion-entry';
        const checkbox = doc.createElement('input');
        checkbox.type = 'checkbox';
        checkbox.checked = state.deletion.selected.includes(entry.number);
        checkbox.setAttribute('data-deletion-number', String(entry.number));
        checkbox.addEventListener('change', () => store.toggleDeletionEntry(entry.number));
        row.appendChild(checkbox);
        const text = doc.createElement('span');
        const date = entry.date?.raw ? ` | ${entry.date.raw}` : '';
        text.textContent = `${entry.party} | ${entry.subject}${date}`;
        row.appendChild(text);
        list.appendChild(row);
      }
      pane.appendChild(list);
    }
    return pane;
  };

  const renderListy = (state: MailUiState): HTMLElement => {
    const pane = doc.createElement('div');
    pane.className = 'arkmail-pane';
    // Klucz panelu dla migawki scrolla (Fala 11c).
    pane.setAttribute('data-pane-key', `listy:${state.activeBox}`);
    const boxes = doc.createElement('div');
    boxes.className = 'arkmail-boxes';
    for (const [box, label] of BOXES) {
      const btn = doc.createElement('button');
      btn.className =
        'arkmail-box' +
        (state.activeBox === box ? ' arkmail-box-active' : '') +
        // Fala 14b: flash celu kolejki niewyslanych (jak zakladka Listy).
        (state.unsentFlash && box === 'niewyslane' ? ' arkmail-flash' : '') +
        // Fala 16f: trwala obwodka akcentu, gdy licznik skrzynki > 0
        // (zgloszenie pkt 5/8: "zaznaczone, ze cos jest w niewyslanych").
        (state.badge > 0 && box === 'nieprzeczytane' ? ' arkmail-box-attention' : '') +
        (state.badgeUnsent > 0 && box === 'niewyslane' ? ' arkmail-box-attention' : '');
      btn.setAttribute('data-box', box);
      btn.textContent = label;
      btn.addEventListener('click', () => {
        store.setActiveBox(box);
        // Fala 11e: klik w skrzynke ZAWSZE odswieza najnowsza strone
        // (replace) - gracz nie moze utknac na nieodswiezonym cache.
        handlers.onRefreshBox(box);
      });
      boxes.appendChild(btn);
    }
    pane.appendChild(boxes);

    // Operacje na aktywnej skrzynce.
    const ops = doc.createElement('div');
    ops.className = 'arkmail-box-ops';
    // Fala 13b: wyslanie zwierzecia pocztowego (send/receive w jednym) -
    // komenda "wyslij zwierze". Nieaktywny w trakcie lotu (roundtrip
    // 20-50 s wg logow); koniec lotu: linia ladowania albo timeout.
    const animalBtn = doc.createElement('button');
    animalBtn.className = 'arkmail-animal-send';
    animalBtn.textContent = state.animalFlying ? 'Zwierze w drodze...' : 'Wyslij zwierze';
    if (state.animalFlying) animalBtn.setAttribute('disabled', '');
    animalBtn.addEventListener('click', () => handlers.onSendAnimal?.());
    ops.appendChild(animalBtn);
    const view0 = state.boxes[state.activeBox];
    const searchMode0 = state.search && state.search.box === state.activeBox ? state.search : null;
    const loopHere = state.loadAll !== null && state.loadAll.box === state.activeBox;
    const loadAllBtn = doc.createElement('button');
    loadAllBtn.className = 'arkmail-older-all';
    loadAllBtn.textContent = loopHere
      ? `Przerwij (${state.loadAll!.pages})`
      : 'Wczytaj wszystkie';
    // Wylaczony, gdy nie ma czego doczytywac: tryb wynikow, skrzynka
    // pusta/niezaladowana lub w calosci, petla na innej skrzynce.
    const nothingToLoad =
      !loopHere &&
      (searchMode0 !== null ||
        !view0 ||
        view0.empty !== null ||
        !view0.truncated ||
        state.loadAll !== null);
    if (nothingToLoad) loadAllBtn.setAttribute('disabled', '');
    loadAllBtn.addEventListener('click', () => handlers.onLoadAll(state.activeBox));
    ops.appendChild(loadAllBtn);
    // Fala 12e: czyszczenie pamieci podrecznej z dwuklikowym
    // potwierdzeniem (uzbrojenie wygasa po 3 s). Stan uzbrojenia lokalny
    // dla przycisku - kazdy rerender wraca do stanu poczatkowego.
    const clearBtn = doc.createElement('button');
    clearBtn.className = 'arkmail-cache-clear';
    clearBtn.textContent = 'Wyczysc zapisane dane';
    // Fala 24h (zgloszenie 2026-10-21): zakres czyszczenia w tooltipie
    // przycisku zamiast stalego napisu pod paskiem operacji (napis
    // wisualnie zasmiecal kazda skrzynke).
    const clearTitle = 'Kasuje listy i kontakty. Ustawienia zostaja.';
    clearBtn.setAttribute('title', clearTitle);
    let clearArmed = false;
    let clearTimer: ReturnType<typeof setTimeout> | null = null;
    clearBtn.addEventListener('click', () => {
      if (!clearArmed) {
        clearArmed = true;
        setButtonLabel(clearBtn, 'Na pewno? Kliknij ponownie');
        clearTimer = setTimeout(() => {
          clearArmed = false;
          setButtonLabel(clearBtn, 'Wyczysc zapisane dane', clearTitle);
        }, 3000);
        return;
      }
      if (clearTimer) clearTimeout(clearTimer);
      clearArmed = false;
      setButtonLabel(clearBtn, 'Wyczysc zapisane dane', clearTitle);
      handlers.onClearCache?.();
    });
    ops.appendChild(clearBtn);
    pane.appendChild(ops);
    // Fala 21b/24h: zakres czyszczenia wyjasniony w tooltipie przycisku
    // (powyzej), bez stalego napisu w panelu.

    // Przelacznik powiadomien o nowej poczcie (trwale w storage).
    const notifyRow = doc.createElement('label');
    notifyRow.className = 'arkmail-dim';
    const chk = doc.createElement('input');
    chk.setAttribute('type', 'checkbox');
    chk.className = 'arkmail-notify-toggle';
    chk.checked = state.notifyEnabled;
    chk.addEventListener('click', () => store.setNotifyEnabled(!store.state.notifyEnabled));
    notifyRow.appendChild(chk);
    notifyRow.appendChild(doc.createTextNode(' Powiadom o nowej poczcie'));
    pane.appendChild(notifyRow);

    // Pasek szukania serwerowego (komenda "listy" z filtrami, skladnia
    // ?listy). Pola niekontrolowane (bez rerendera przy pisaniu).
    // Puste pola odswiezaja aktywna skrzynke.
    const searchRow = doc.createElement('div');
    searchRow.className = 'arkmail-search-row';
    const mkSearch = (key: string, placeholder: string, type = 'text') => {
      const input = doc.createElement('input');
      input.setAttribute('data-search', key);
      input.setAttribute('type', type);
      input.setAttribute('placeholder', placeholder);
      // Draft lokalny (Fala 11c): rerender store nie kasuje wpisanej frazy.
      input.value = searchDraft[key] ?? '';
      input.addEventListener('input', () => {
        searchDraft[key] = input.value;
      });
      return input;
    };
    const sOsoba = mkSearch('osoba', 'Osoba (kogo? czego?)');
    sOsoba.setAttribute('title', 'Wpisz imie w dopelniaczu.');
    const sTemat = mkSearch('temat', 'Temat');
    // Fala 28a: szukanie po tresci - serwer wspiera "o tresci"
    // (?listy, help w grze), builder komendy obslugiwal od zawsze,
    // brakowalo tylko pola w UI. Bez ghosta (podpowiedzi z tematow
    // archiwum nie maja sensu dla frazy z tresci).
    const sTresc = mkSearch('tresc', 'Tresc');
    // Fala 30a: Tresc na calej szerokosci, pola dat jako para Od|Do
    // (lewo-prawo) z WIDOCZNYMI etykietami - placeholder na
    // input[type=date] jest ignorowany przez przegladarke i pole bylo
    // anonimowe (zgloszenie 2026-10-23 pkt 1).
    sTresc.className = 'arkmail-search-wide';
    const sOd = mkSearch('odDaty', 'Od dnia', 'date');
    const sDo = mkSearch('doDaty', 'Do dnia', 'date');
    const sOdF = mkDateField(doc, sOd, 'Od dnia (wlacznie)', 'Szukanie zwroci listy wyslane od tego dnia WLACZNIE.');
    const sDoF = mkDateField(doc, sDo, 'Do dnia (wlacznie)', 'Szukanie zwroci listy wyslane do tego dnia WLACZNIE.');
    const go = doc.createElement('button');
    go.className = 'arkmail-search-go';
    setButtonLabel(go, SEARCH_GO_LABEL, SEARCH_GO_TITLE);
    let searchErrorTimer: ReturnType<typeof setTimeout> | null = null;
    const showSearchError = (message: string): void => {
      if (searchErrorTimer) clearTimeout(searchErrorTimer);
      setButtonLabel(go, message);
      searchErrorTimer = setTimeout(() => setButtonLabel(go, SEARCH_GO_LABEL, SEARCH_GO_TITLE), 3000);
    };
    const fireSearch = () => {
      const osoba = (sOsoba as HTMLInputElement).value.trim();
      const temat = (sTemat as HTMLInputElement).value.trim();
      const tresc = (sTresc as HTMLInputElement).value.trim();
      const isoOd = (sOd as HTMLInputElement).value;
      const isoDo = (sDo as HTMLInputElement).value;
      const validationError = validateSearchDraft({
        osoba,
        temat,
        tresc,
        odDaty: isoOd,
        doDaty: isoDo,
      });
      if (validationError) {
        showSearchError(validationError);
        return;
      }
      if (searchErrorTimer) clearTimeout(searchErrorTimer);
      setButtonLabel(go, SEARCH_GO_LABEL, SEARCH_GO_TITLE);
      const odDaty = fromISODate(isoOd) ?? undefined;
      const doDaty = fromISODate(isoDo) ?? undefined;
      const query: ListingSearch = {
        ...(osoba !== '' ? { osoba } : {}),
        ...(odDaty ? { odDaty } : {}),
        ...(doDaty ? { doDaty } : {}),
        ...(temat !== '' ? { temat } : {}),
        ...(tresc !== '' ? { tresc } : {}),
      };
      if (Object.keys(query).length === 0) {
        handlers.onRefreshBox(state.activeBox);
        return;
      }
      handlers.onSearch(state.activeBox, query);
    };
    go.addEventListener('click', fireSearch);
    // Fala 26a (zgloszenie 2026-10-22): Enter w dowolnym polu szukajki
    // = Szukaj (dotychczas Enter nie mial handlera i "nic nie robil").
    for (const el of [sOsoba, sTemat, sTresc, sOd, sDo]) {
      el.addEventListener('keydown', (ev) => {
        if ((ev as KeyboardEvent).key === 'Enter') {
          ev.preventDefault();
          fireSearch();
        }
      });
    }
    searchRow.appendChild(sOsoba);
    searchRow.appendChild(sTemat);
    searchRow.appendChild(sTresc);
    searchRow.appendChild(sOdF);
    searchRow.appendChild(sDoF);
    searchRow.appendChild(go);
    pane.appendChild(searchRow);
    // Temat zachowuje podpowiedzi. Pole osoby wymaga dopelniacza,
    // dlatego nie podpowiada zapisanych form w mianowniku.
    attachGhost(doc, sTemat as HTMLInputElement, subjectSource);

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
      clear.addEventListener('click', () => {
        // Fala 16g: Wyczysc kasuje tez pola szukajki (zgloszenie pkt 11)
        // - wyniki znikaly, ale frazy zostawaly w polach i mylily.
        for (const key of ['osoba', 'temat', 'tresc', 'odDaty', 'doDaty']) searchDraft[key] = '';
        for (const el of [sOsoba, sTemat, sTresc, sOd, sDo]) (el as HTMLInputElement).value = '';
        handlers.onClearSearch(state.activeBox);
      });
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
      // Fala 14c: kropka nieprzeczytania TYLKO w skrzynkach przychodzacych.
      // Listingi wyslane/niewyslane nie maja znacznika *R* (serwer go tam
      // nie drukuje), wiec parser daje isRead=false i kazdy wiersz dostawal
      // kropke w skrzynce, gdzie stan "nieprzeczytany" nie ma sensu
      // (zgloszenie 2026-10-19, pkty 4 i 5).
      const unreadMark =
        !e.isRead && (state.activeBox === 'odebrane' || state.activeBox === 'nieprzeczytane');
      row.className = 'arkmail-entry' + (unreadMark ? ' arkmail-unread' : '');
      row.setAttribute('data-number', String(e.number));
      const num = doc.createElement('span');
      num.className = 'arkmail-entry-num';
      num.textContent = `${idx + 1}.`;
      row.appendChild(num);
      const party = doc.createElement('span');
      party.className = 'arkmail-entry-party';
      party.textContent = e.party || '(brak)';
      row.appendChild(party);
      const subject = doc.createElement('span');
      subject.className = 'arkmail-entry-subject';
      // Flaga forwarded pochodzi z parsera (serwer dokleja do tematu
      // "(forwardowany)"); graczowi pokazujemy po polsku i spojnie
      // z przyciskiem Przekaz (Fala 21b).
      subject.textContent = e.subject + (e.forwarded ? ' (przekazany)' : '');
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
    } else if (view.truncated && !state.loadAll) {
      // Fala 11e: na dole tylko Wczytaj starsze; zbiorcze Wczytaj
      // wszystkie/Przerwij siedzi na pasku nad lista. Petla na innej
      // skrzynce chowa paginacje (blokada sesji).
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
    // Klucz per list (Fala 11c): inny list = inny klucz = scroll od gory;
    // ten sam list przy tle-rerenderze zachowuje pozycje.
    pane.setAttribute('data-pane-key', l ? `list:${l.box}:${l.number}` : 'list:brak');
    if (!l) {
      // W split (wide) to placeholder prawego panelu; solo (waski) to
      // pusta zakladka 'list'.
      pane.appendChild(
        dim(state.wide ? 'Wybierz list, aby go przeczytac.' : 'Nie otwarto zadnego listu.'),
      );
      return pane;
    }
    const head = doc.createElement('div');
    head.className = 'arkmail-letter-head';
    if (state.wide) {
      // W podziale lista jest zawsze widoczna po lewej - zamiast przycisku
      // powrotu ("Zamknij list") jest Zamknij czyszczace podglad.
      const close = doc.createElement('button');
      close.className = 'arkmail-letter-close';
      close.textContent = 'Zamknij';
      close.addEventListener('click', () => handlers.onCloseLetter());
      head.appendChild(close);
    }
    const subj = doc.createElement('div');
    subj.className = 'arkmail-letter-subject';
    subj.textContent = l.subject;
    head.appendChild(subj);
    const meta = doc.createElement('div');
    meta.className = 'arkmail-letter-meta';
    // Fala 9e: czytelne pary pole-wartosc; serwerowy numer listu nic
    // nie mowi graczowi (kontekstowy), puste "Do" pomijamy (list na DW).
    const parts = [`Od: ${l.from}`];
    if (l.to) parts.push(`Do: ${l.to}`);
    if (l.cc) parts.push(`DW: ${l.cc}`);
    if (l.date) parts.push(l.date);
    meta.textContent = parts.join(' | ');
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
    // Fala 15a: Odpowiedz / Odpowiedz wszystkim - pierwsze w pasku.
    // Czysta operacja UI: prefill composeDraft + przelaczenie na Napisz,
    // zero komend do serwera, wiec dziala tez bez wpisu-zrodla.
    // Adresat: odebrane -> nadawca; wyslane -> odbiorca (puste "Do" =
    // list tylko na DW -> adresat = DW). Reply-all doklada oryginalne
    // DW; brak DW -> jak zwykle Odpowiedz. Temat i tresc puste.
    const replyTo = (all: boolean): void => {
      const received = l.box === 'odebrane' || l.box === 'nieprzeczytane';
      composeDraft.adresat = received ? l.from : l.to || l.cc || '';
      composeDraft.dw = all && l.cc ? l.cc : '';
      composeDraft.temat = '';
      composeDraft.tresc = '';
      store.setTab('napisz');
    };
    const reply = doc.createElement('button');
    reply.className = 'arkmail-reply';
    reply.textContent = 'Odpowiedz';
    reply.addEventListener('click', () => replyTo(false));
    ops.appendChild(reply);
    const replyAll = doc.createElement('button');
    replyAll.className = 'arkmail-reply-all';
    replyAll.textContent = 'Odpowiedz wszystkim';
    replyAll.addEventListener('click', () => replyTo(true));
    ops.appendChild(replyAll);
    // Fala 28c (decyzja 2026-10-22): Odpowiedz z cytowaniem. Adresat jak
    // przy zwyklym Odpowiedz (bez DW), temat = "Odp: <oryginalny temat>"
    // DOSLOWNIE - temat "--" to swiadomie wpisane "--", nie marker
    // pustego tematu (pusty temat jest niemozliwy: serwer go nie
    // przyjmuje, plugin blokuje twardo). Tresc: dwie puste linie, "---",
    // oryginalna tresc, "---". Przy liscie bez tresci przycisk
    // nieaktywny - nie ma czego cytowac.
    const replyQuote = doc.createElement('button');
    replyQuote.className = 'arkmail-reply-quote';
    replyQuote.textContent = 'Odpowiedz z cytowaniem';
    if (l.body.some((line) => line.trim() !== '')) {
      replyQuote.addEventListener('click', () => {
        const received = l.box === 'odebrane' || l.box === 'nieprzeczytane';
        composeDraft.adresat = received ? l.from : l.to || l.cc || '';
        composeDraft.dw = '';
        composeDraft.temat = `Odp: ${l.subject}`;
        composeDraft.tresc = `\n\n---\n${l.body.join('\n')}\n---`;
        store.setTab('napisz');
      });
    } else {
      replyQuote.setAttribute('disabled', '');
      replyQuote.setAttribute('title', 'List bez tresci - nie ma czego cytowac.');
    }
    ops.appendChild(replyQuote);
    const del = doc.createElement('button');
    del.className = 'arkmail-del';
    del.textContent = 'Usun';
    if (source) {
      // Fala 14e: kasowanie z dwuklikowym potwierdzeniem (uzbrojenie
      // wygasa po 3 s, wzorzec jak "Wyczysc zapisane dane") -
      // pojedynczy przypadkowy klik nie kasuje listu (zgloszenie
      // 2026-10-19, pkt 7).
      let delArmed = false;
      let delTimer: ReturnType<typeof setTimeout> | null = null;
      del.addEventListener('click', () => {
        if (!delArmed) {
          delArmed = true;
          setButtonLabel(del, 'Na pewno? Kliknij ponownie');
          delTimer = setTimeout(() => {
            delArmed = false;
            setButtonLabel(del, 'Usun');
          }, 3000);
          return;
        }
        if (delTimer) clearTimeout(delTimer);
        delArmed = false;
        setButtonLabel(del, 'Usun');
        handlers.onDeleteLetter(l.box, source);
      });
    } else {
      del.setAttribute('disabled', '');
      del.setAttribute('title', 'Otworz list z zakladki Listy, aby go usunac.');
    }
    ops.appendChild(del);
    const fwdInput = doc.createElement('input');
    fwdInput.setAttribute('data-field', 'forward');
    fwdInput.setAttribute('placeholder', 'Przekaz do (gracz lub alias)');
    if (!source) fwdInput.setAttribute('disabled', '');
    ops.appendChild(fwdInput);
    attachGhost(doc, fwdInput, personSource);
    const fwd = doc.createElement('button');
    fwd.className = 'arkmail-fwd';
    fwd.textContent = 'Przekaz';
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
    // Fala 17g: eksport listu do TXT (zgloszenie 2026-10-19/20 pkt 7).
    // Operacja lokalna (dane z cache widoku) - bez dwukliku. Na koncu
    // paska: pin kolejnosci rezerwuje poczatek dla Odpowiedz/Usun.
    const exp = doc.createElement('button');
    exp.className = 'arkmail-export-letter';
    exp.textContent = 'Zapisz list TXT';
    exp.addEventListener('click', () => handlers.onExportLetter?.());
    ops.appendChild(exp);
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

  // Fala 11d: podglad compose w wide to OSOBNY prawy panel (jak /list
  // w kliencie), wiec <pre> zyje poza formularzem - referencja i repaint
  // wspoldzielone miedzy panelami.
  let composePreview: HTMLPreElement | null = null;
  const repaintCompose = (): void => {
    if (!composePreview) return;
    const st = store.state;
    composePreview.textContent = renderLetter(
      composeDraft.tresc,
      st.composeTemplate,
      st.composeWidth,
    ).lines.join('\n');
  };

  /** Przycisk otwierajacy pelnoekranowy podglad compose (Fala 12d). */
  const previewOpenBtn = (): HTMLElement => {
    const btn = doc.createElement('button');
    btn.className = 'arkmail-preview-open';
    btn.textContent = 'Pelne okno';
    btn.addEventListener('click', () => {
      previewFull = true;
      render(store.state);
    });
    return btn;
  };

  /**
   * Podglad compose na cale okno popupu (Fala 12d): pre w naturalnym
   * rozmiarze, bez obcinania - widac caly szablon pergaminu. Tresc
   * zyje w composeDraft, wiec powrot do formularza nic nie gubi.
   */
  const renderPreviewFull = (): HTMLElement => {
    const pane = doc.createElement('div');
    pane.className = 'arkmail-pane arkmail-preview-full-pane';
    pane.setAttribute('data-pane-key', 'napisz:podglad-full');
    const bar = doc.createElement('div');
    bar.className = 'arkmail-preview-bar';
    const lab = doc.createElement('label');
    lab.textContent = 'Podglad wysylanego listu';
    bar.appendChild(lab);
    const close = doc.createElement('button');
    close.className = 'arkmail-preview-close';
    close.textContent = 'Zamknij podglad';
    close.addEventListener('click', () => {
      previewFull = false;
      render(store.state);
    });
    bar.appendChild(close);
    pane.appendChild(bar);
    const pre = doc.createElement('pre');
    pre.className = 'arkmail-preview';
    pane.appendChild(pre);
    composePreview = pre;
    repaintCompose();
    return pane;
  };

  /** Prawy panel compose w wide: zywy podglad wysylanego listu. */
  const renderComposePreview = (): HTMLElement => {
    const pane = doc.createElement('div');
    pane.className = 'arkmail-pane';
    pane.setAttribute('data-pane-key', 'napisz:podglad');
    // Fala 12d: belka z przyciskiem pelnego okna; pre rozciaga sie na
    // pelna wysokosc panelu (style: flex + max-height:none).
    const bar = doc.createElement('div');
    bar.className = 'arkmail-preview-bar';
    const lab = doc.createElement('label');
    lab.textContent = 'Podglad wysylanego listu';
    bar.appendChild(lab);
    bar.appendChild(previewOpenBtn());
    pane.appendChild(bar);
    const pre = doc.createElement('pre');
    pre.className = 'arkmail-preview';
    pane.appendChild(pre);
    composePreview = pre;
    repaintCompose();
    return pane;
  };

  /** Fala 16e: obsluzony licznik clearCompose (zerowanie draftu raz
   *  na sygnal, nie przy kazdym renderze - inaczej pisanicie byloby
   *  kasowane przy kazdej zmianie stanu). */
  let seenComposeClearSeq = 0;

  const renderNapisz = (state: MailUiState): HTMLElement => {
    // Fala 16e: po udanym zapisie/wyslaniu pola compose sie czyscza
    // (zgloszenie pkt 12). Sygnal ze store -> zerujemy draft PRZED
    // zbudowaniem pol (input.value czyta composeDraft).
    if (state.composeClearSeq !== seenComposeClearSeq) {
      seenComposeClearSeq = state.composeClearSeq;
      composeDraft.adresat = '';
      composeDraft.temat = '';
      composeDraft.dw = '';
      composeDraft.tresc = '';
    }
    const pane = doc.createElement('div');
    pane.className = 'arkmail-pane arkmail-form';
    pane.setAttribute('data-pane-key', 'napisz');
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
      // Ghost (Fala 9g): adresat/DW -> kontakty+aliasy, temat -> archiwum.
      if (field === 'temat') attachGhost(doc, input, subjectSource);
      else attachGhost(doc, input, personSource);
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
    labW.textContent = 'Szerokosc linii (20-120)';
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
    lab.textContent = 'Tresc';
    pane.appendChild(lab);
    const tresc = doc.createElement('textarea');
    tresc.setAttribute('data-field', 'tresc');
    tresc.value = composeDraft.tresc;
    pane.appendChild(tresc);

    // Podglad: waski - pod forma w tym samym panelu; wide - osobny
    // prawy panel (renderComposePreview, Fala 11d).
    if (!state.wide) {
      // Fala 12d: waski tez ma przycisk pelnego okna.
      const barP = doc.createElement('div');
      barP.className = 'arkmail-preview-bar';
      const labP = doc.createElement('label');
      labP.textContent = 'Podglad wysylanego listu';
      barP.appendChild(labP);
      barP.appendChild(previewOpenBtn());
      pane.appendChild(barP);
      const preview = doc.createElement('pre');
      preview.className = 'arkmail-preview';
      pane.appendChild(preview);
      composePreview = preview;
      repaintCompose();
    }
    tresc.addEventListener('input', () => {
      composeDraft.tresc = tresc.value;
      repaintCompose();
    });

    const send = doc.createElement('button');
    send.className = 'arkmail-send';
    // Fala 14b: poza poczta compose ZAWSZE laduje w kolejce niewyslanych
    // ("List jest gotowy do wyslania.") - przycisk "Wyslij" mylil gracza
    // (zgloszenie 2026-10-19). Etykieta mowi, co naprawde sie stanie.
    send.textContent = 'Zapisz w niewyslanych';
    // Fala 15b: walidacja przed zapisem do kolejki. Pusty adresat =
    // twarda blokada (serwer wymaga >= 1 adresata - "musimy podac
    // przynajmniej jednego"). Fala 28g: pusty temat tez TWARDA blokada
    // ("Podaj temat.") - serwer pustego tematu nie przyjmuje, a handler
    // w index.ts i tak odrzucal go toastem, wiec dwuklikowe uzbrojenie
    // z 15b obiecywalo wysylke, ktora nigdy nie nastepowala. Stan
    // lokalny - rerender wraca do etykiety.
    const SEND_LABEL = 'Zapisz w niewyslanych';
    let sendTimer: ReturnType<typeof setTimeout> | null = null;
    const disarmSend = (): void => {
      setButtonLabel(send, SEND_LABEL);
    };
    send.addEventListener('click', () => {
      const st = store.state;
      const val = (f: string) =>
        (pane.querySelector(`[data-field="${f}"]`) as HTMLInputElement | HTMLTextAreaElement).value;
      const input = {
        adresat: val('adresat'),
        temat: val('temat'),
        dw: val('dw'),
        tresc: tresc.value,
      };
      const validationError = validateCompose(input);
      if (validationError) {
        if (sendTimer) clearTimeout(sendTimer);
        setButtonLabel(send, validationError);
        sendTimer = setTimeout(disarmSend, 3000);
        return;
      }
      const rendered = renderLetter(input.tresc, st.composeTemplate, st.composeWidth);
      if (sendTimer) clearTimeout(sendTimer);
      disarmSend();
      handlers.onSendCompose({
        ...input,
        linie: rendered.lines,
      });
    });
    pane.appendChild(send);

    // Fala 14b: czyszczenie pol compose z dwuklikowym potwierdzeniem
    // (uzbrojenie wygasa po 3 s; wzorzec "Wyczysc zapisane dane").
    // Czysci pola LISTU (adresat/temat/dw/tresc) - szablon i szerokosc
    // to ustawienia, zostaja. Stan uzbrojenia lokalny - kazdy rerender
    // wraca do stanu poczatkowego.
    const clearCompose = doc.createElement('button');
    clearCompose.className = 'arkmail-compose-clear';
    clearCompose.textContent = 'Wyczysc';
    let clearArmed = false;
    let clearTimer: ReturnType<typeof setTimeout> | null = null;
    clearCompose.addEventListener('click', () => {
      if (!clearArmed) {
        clearArmed = true;
        setButtonLabel(clearCompose, 'Na pewno? Kliknij ponownie');
        clearTimer = setTimeout(() => {
          clearArmed = false;
          setButtonLabel(clearCompose, 'Wyczysc');
        }, 3000);
        return;
      }
      if (clearTimer) clearTimeout(clearTimer);
      clearArmed = false;
      setButtonLabel(clearCompose, 'Wyczysc');
      composeDraft.adresat = '';
      composeDraft.temat = '';
      composeDraft.dw = '';
      composeDraft.tresc = '';
      for (const f of ['adresat', 'temat', 'dw', 'tresc']) {
        const el = pane.querySelector(`[data-field="${f}"]`) as
          | HTMLInputElement
          | HTMLTextAreaElement
          | null;
        if (el) el.value = '';
      }
      repaintCompose(); // podglad tez sie czysci
    });
    pane.appendChild(clearCompose);
    return pane;
  };

  const renderKontakty = (state: MailUiState): HTMLElement => {
    const pane = doc.createElement('div');
    pane.className = 'arkmail-pane';
    pane.setAttribute('data-pane-key', 'kontakty');
    const foot = doc.createElement('div');
    foot.className = 'arkmail-dim arkmail-index-foot';
    const dates = INDEX_BOXES.map((b) => state.indexMeta[b])
      .filter((d): d is string => d !== undefined)
      .sort();
    foot.textContent = allBoxesIndexed(state.indexMeta)
      ? `Kompletna indeksacja od: ${dates[0]!.slice(0, 10)} | listow w bazie: ${state.archive.length}`
      : `Indeksacja niekompletna | listow w bazie: ${state.archive.length}`;
    pane.appendChild(foot);
    const gaps = INDEX_BOXES.flatMap((box) =>
      (state.archiveGaps[box] ?? []).map((day) => `${box}: ${day}`),
    );
    if (gaps.length > 0) {
      const gapNote = doc.createElement('div');
      gapNote.className = 'arkmail-dim arkmail-index-gaps';
      gapNote.textContent = `Niedostepne przez limit serwera - ${gaps.join(', ')}`;
      pane.appendChild(gapNote);
    }
    // Fala 18c (zgloszenie 2026-10-20 pkt 1): kontakty liczone z
    // archiwum sa kompletne dopiero po pelnej indeksacji wszystkich
    // skrzynek - wczesniej (baza = pierwsze 50 wpisow) liczniki
    // klamaly, wiec zamiast nich brama z przyciskiem indeksacji.
    // Fala 19b (zgloszenie 2026-10-20): tekst bramy bez szczegolow
    // technicznych - gracz ma wiedziec tylko, po co indeksowanie.
    // Fala 24a (zgloszenie 2026-10-21): kontakty sa widoczne ZAWSZE -
    // brama to wskazowka + przycisk NAD lista, nie zamiast niej
    // (gracz z pelnym archiwum po "Wczytaj wszystkie" nie widzial
    // kontaktow, bo brama wisala na fladze indeksu, nie na danych).
    // Dopisek "(jednorazowo)" usuniety - indeksowanie nie jest
    // jednorazowe (Fala 24e: incrementalna, przeczes co 7 dni).
    if (!allBoxesIndexed(state.indexMeta)) {
      pane.appendChild(
        dim('Kontakty powstaja z listow zebranych ze wszystkich skrzynek.'),
      );
      const gate = doc.createElement('button');
      gate.className = 'arkmail-index-all';
      gate.textContent = state.indexRun
        ? `Przerwij indeksowanie (${state.indexRun.boxIndex + 1}/${INDEX_BOXES.length})`
        : 'Indeksuj wszystkie skrzynki';
      gate.addEventListener('click', () => handlers.onIndexAll?.());
      pane.appendChild(gate);
    }
    // Filtr i sort sa lokalne (poza store, jak filtr archiwum):
    // repaint dotyczy tylko listy, input nie traci fokusu przy pisaniu.
    const controls = doc.createElement('div');
    controls.className = 'arkmail-contact-controls';
    const input = doc.createElement('input');
    input.className = 'arkmail-contact-filter';
    input.setAttribute('data-filter', 'kontakty');
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
          // Fala 12c: jawny wybor kierunku - gracz decyduje, czy pokazac
          // odebrane OD osoby czy wyslane DO niej (wczesniej klik szukal
          // na aktywnej skrzynce, czyli "gdzie popadnie").
          // Fala 26b (zgloszenie 2026-10-22): skok filtruje LOKALNE
          // archiwum (zakladka Archiwum), zamiast strzelac szukaniem
          // do serwera. Liczniki kontaktow stoja na archiwum i licza
          // listy wieloodbiorcze KAZDEMU odbiorcy (splitParty), a
          // serwerowy filtr od/do lapie dokladnie jedna osobe, wiec
          // listow grupowych nie widzi - stad licznik > 0 przy pustym
          // wyniku serwera. Filtr osoby w archiwum to podciag po
          // party, wiec listy wieloodbiorcze tez trafiaja.
          // (Fala 26d: korekta uzasadnienia - skrzynki serwerowe sa
          // pelne od zawsze, nikt ich nie sprzata.)
          // Skok jest deterministyczny: osoba + skrzynka, reszta
          // filtrow archiwum czyszczona.
          const jumpTo = (box: MailBox) => {
            archFilter.osoba = c.name;
            archFilter.skrzynka = box;
            archFilter.temat = undefined;
            archFilter.tresc = undefined;
            archFilter.odDaty = undefined;
            archFilter.doDaty = undefined;
            store.setTab('archiwum');
          };
          // Klik w imie = kierunek domyslny: odebrane, gdy sa.
          name.setAttribute('title', 'Pokaz listy tej osoby w archiwum (domyslnie: odebrane)');
          name.addEventListener('click', () => {
            if (c.lettersReceived > 0) jumpTo('odebrane');
            else if (c.lettersSent > 0) jumpTo('wyslane');
          });
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
          // Przyciski kierunku (Fala 12c); wylaczone, gdy licznik = 0.
          const dirs = doc.createElement('span');
          dirs.className = 'arkmail-contact-dirs';
          const DIR_OPTS: Array<[MailBox, string, number]> = [
            ['odebrane', 'Odebrane', c.lettersReceived],
            ['wyslane', 'Wyslane', c.lettersSent],
          ];
          for (const [box, label, count] of DIR_OPTS) {
            const btn = doc.createElement('button');
            btn.className = 'arkmail-contact-dir';
            btn.setAttribute('data-dir', box);
            btn.textContent = label;
            if (count === 0) {
              btn.setAttribute('disabled', '1');
              btn.setAttribute('title', 'Brak listow.');
            } else {
              btn.addEventListener('click', () => jumpTo(box));
            }
            dirs.appendChild(btn);
          }
          row.appendChild(dirs);
          return row;
        }),
      );
      if (rows.length === 0) {
        list.replaceChildren(
          dim(
            state.contacts.length === 0
              ? 'Brak kontaktow - pojawia sie po pobraniu skrzynek.'
              : 'Zaden kontakt nie pasuje do filtra.',
          ),
        );
      }
      fillButtonTitles(list);
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
    pane.setAttribute('data-pane-key', 'archiwum');
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
    const aOsoba = mkText('osoba', 'Osoba (nadawca lub odbiorca)');
    controls.appendChild(aOsoba);
    attachGhost(doc, aOsoba, personSource);
    const skr = doc.createElement('select');
    skr.setAttribute('data-filter', 'skrzynka');
    const SKR_OPTS: Array<[MailBox | '', string]> = [
      ['', 'Wszystkie skrzynki'],
      ['odebrane', 'Odebrane'],
      ['nieprzeczytane', 'Nieprzeczytane'],
      ['wyslane', 'Wyslane'],
      ['niewyslane', 'Niewyslane'],
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
    const aTemat = mkText('temat', 'Temat');
    controls.appendChild(aTemat);
    attachGhost(doc, aTemat, subjectSource);
    controls.appendChild(mkText('tresc', 'Tresc listu'));
    // Fala 28d: "Od dnia"/"Do dnia" jak w szukajce serwerowej - jedno
    // nazewnictwo na te sama granice w calym oknie (audyt stringow).
    // Fala 30a: widoczne etykiety + tooltipy (placeholder na dacie
    // jest ignorowany przez przegladarke).
    controls.appendChild(
      mkDateField(doc, mkText('odDaty', 'Od dnia', 'date'), 'Od dnia (wlacznie)', 'Archiwum pokaze listy od tego dnia WLACZNIE.'),
    );
    controls.appendChild(
      mkDateField(doc, mkText('doDaty', 'Do dnia', 'date'), 'Do dnia (wlacznie)', 'Archiwum pokaze listy do tego dnia WLACZNIE.'),
    );
    // Fala 16g: czyszczenie wszystkich filtrow archiwum jednym klikiem
    // (zgloszenie pkt 11). Niedestrukcyjne (dane zostaja) - bez dwukliku.
    const clearFilters = doc.createElement('button');
    clearFilters.className = 'arkmail-arch-clear';
    clearFilters.textContent = 'Wyczysc filtry';
    clearFilters.addEventListener('click', () => {
      for (const key of ['osoba', 'temat', 'tresc', 'odDaty', 'doDaty'] as const) {
        archFilter[key] = undefined;
      }
      archFilter.skrzynka = undefined;
      controls.querySelectorAll('[data-filter]').forEach((el) => {
        (el as HTMLInputElement | HTMLSelectElement).value = '';
      });
      repaint();
    });
    controls.appendChild(clearFilters);

    const steps = doc.createElement('div');
    steps.className = 'arkmail-archive-steps';
    steps.setAttribute('aria-label', 'Kolejne kroki pracy z archiwum');
    const makeStep = (title: string, status: string, tone: string): HTMLElement => {
      const step = doc.createElement('section');
      step.className = `arkmail-archive-step arkmail-step-${tone}`;
      const heading = doc.createElement('div');
      heading.className = 'arkmail-archive-step-title';
      heading.textContent = title;
      const description = doc.createElement('div');
      description.className = 'arkmail-archive-step-status';
      description.textContent = status;
      step.appendChild(heading);
      step.appendChild(description);
      steps.appendChild(step);
      return step;
    };
    const indexedCount = INDEX_BOXES.filter((box) => state.indexMeta[box] !== undefined).length;
    const gapCount = Object.values(state.archiveGaps).reduce((sum, days) => sum + days.length, 0);
    // Fala 31e: mowimy, czego brakuje ("brakuje danych z N dni").
    // Liczebnik dni: 1 dnia / 2 dni / 5 dni.
    const gapPhrase = (days: number): string =>
      days === 1 ? 'brakuje danych z 1 dnia' : `brakuje danych z ${days} dni`;
    const indexStatus = state.indexRun
      ? `W toku: ${state.indexRun.box}, stron: ${state.indexRun.pages}.`
      : allBoxesIndexed(state.indexMeta)
        ? gapCount > 0
          ? `Gotowe, ale ${gapPhrase(gapCount)}.`
          : 'Gotowe: wszystkie skrzynki zapisane.'
        : indexedCount > 0 || gapCount > 0
          ? `Czesciowo: ${indexedCount} z ${INDEX_BOXES.length} skrzynek${gapCount > 0 ? ` (${gapPhrase(gapCount)})` : ''}.`
          : 'Jeszcze nie zaczeto.';
    const archiveGroups = new Map<string, ArchiveLetter[]>();
    for (const letter of state.archive) {
      const key = contentKeyOf(letter);
      const group = archiveGroups.get(key);
      if (group) group.push(letter);
      else archiveGroups.set(key, [letter]);
    }
    let withBody = 0;
    let pendingBody = 0;
    let undatedBody = 0;
    let unavailableBody = 0;
    for (const group of archiveGroups.values()) {
      const live = group.filter((letter) => letter.missingOnServer !== true);
      if (live.length === 0) {
        unavailableBody += 1;
        continue;
      }
      if (live.some((letter) => letter.body.length > 0)) {
        withBody += 1;
        continue;
      }
      const dateRaw = live[0]!.dateRaw;
      if (dateRaw !== null && parseMailDate(dateRaw) !== null) pendingBody += 1;
      else undatedBody += 1;
    }
    // Fala 31e: szczegoly w nawiasie, liczebnik przodem
    // ("1 bez daty", "2 nie ma juz w skrzynce").
    const bodyWarnings = [
      undatedBody > 0 ? `${undatedBody} bez daty` : '',
      unavailableBody > 0 ? `${unavailableBody} nie ma juz w skrzynce` : '',
    ].filter((text) => text !== '');
    const warningSuffix = bodyWarnings.length > 0 ? ` (${bodyWarnings.join(', ')})` : '';
    const downloadStatus = state.archiveDownload
      ? `Pobieram tresci: ${state.archiveDownload.done} z ${state.archiveDownload.total}.`
      : state.archive.length === 0
        ? 'Jeszcze nie pobrano.'
        : pendingBody > 0
          ? `Czesciowo: ${formatListCount(withBody)} z trescia. Do pobrania: ${pendingBody}${warningSuffix}.`
          : bodyWarnings.length > 0
            ? `Gotowe: ${formatListCount(withBody)} z trescia${warningSuffix}.`
            : `Gotowe: ${formatListCount(withBody)} z trescia.`;
    const exportable = archiveExportEntries(state.archive);
    const exportStatus =
      exportable.entries.length === 0
        ? 'Brak listow z trescia - nie ma czego zapisywac.'
        : exportable.skipped > 0
          ? `Gotowe: ${formatListCount(exportable.entries.length)} do zapisu (${exportable.skipped} bez tresci).`
          : `Gotowe: ${formatListCount(exportable.entries.length)} do zapisu.`;
    // Fala 31d: agregat nad lista - globalny (nie zalezy od filtra),
    // po deduplikacji blizniakow (contentKeyOf) i bez listow, ktorych
    // juz nie ma na serwerze; skrzynki z zerem pomijane.
    const liveGroups = [...archiveGroups.values()].filter((group) =>
      group.some((letter) => letter.missingOnServer !== true),
    );
    const perBoxCounts = new Map<MailBox, number>();
    for (const group of liveGroups) {
      const countedBoxes = new Set<MailBox>();
      for (const letter of group) {
        if (letter.missingOnServer === true || countedBoxes.has(letter.box)) continue;
        countedBoxes.add(letter.box);
        perBoxCounts.set(letter.box, (perBoxCounts.get(letter.box) ?? 0) + 1);
      }
    }
    let countsStrip: HTMLElement | null = null;
    if (liveGroups.length > 0) {
      const parts: string[] = [];
      for (const box of INDEX_BOXES) {
        const count = perBoxCounts.get(box);
        if (count !== undefined) parts.push(`${box}: ${formatListCount(count)}`);
      }
      countsStrip = doc.createElement('p');
      countsStrip.className = 'arkmail-dim arkmail-arch-counts';
      countsStrip.textContent = `Listow w bazie: ${formatListCount(liveGroups.length)}${parts.length > 0 ? ` (${parts.join(', ')})` : ''}.`;
    }
    const indexStep = makeStep('1. Indeksacja', indexStatus, state.indexRun ? 'active' : allBoxesIndexed(state.indexMeta) ? (gapCount > 0 ? 'warning' : 'done') : indexedCount > 0 || gapCount > 0 ? 'incomplete' : 'idle');
    const downloadStep = makeStep('2. Pobranie tresci', downloadStatus, state.archiveDownload ? 'active' : pendingBody > 0 ? 'incomplete' : bodyWarnings.length > 0 ? 'warning' : withBody > 0 ? 'done' : 'idle');
    const exportStep = makeStep('3. Zapis ZIP', exportStatus, exportable.entries.length > 0 ? (exportable.skipped > 0 ? 'warning' : 'done') : 'idle');

    // Fala 18c (zgloszenie 2026-10-20 pkt 1): indeksacja wszystkich
    // skrzynek - pelny listing kazdej (z paginacja kotwicowa) = kompletna
    // baza dla kontaktow i eksportow. Operacja tylko czyta (jak Wczytaj
    // wszystkie) - bez dwukliku; w trakcie petli drugi klik = Przerwij.
    const idxBtn = doc.createElement('button');
    idxBtn.className = 'arkmail-index-all';
    idxBtn.textContent = state.indexRun
      ? `Przerwij indeksowanie (${state.indexRun.boxIndex + 1}/${INDEX_BOXES.length})`
      : 'Indeksuj wszystkie skrzynki';
    idxBtn.addEventListener('click', () => handlers.onIndexAll?.());
    indexStep.appendChild(idxBtn);
    // Fala 16i: masowe pobieranie tresci do archiwum (zgloszenie
    // pkt 10). Dwuklikowe uzbrojenie z ostrzezeniem o dlugim czasie
    // (precedens: Wyczysc zapisane dane); w trakcie petli przycisk
    // zamienia sie w Przerwij z postepem (precedens: Wczytaj wszystkie).
    const dlBtn = doc.createElement('button');
    dlBtn.className = 'arkmail-arch-download';
    dlBtn.textContent = state.archiveDownload
      ? `Przerwij (${state.archiveDownload.done}/${state.archiveDownload.total})`
      : 'Pobierz tresci do archiwum';
    let dlArmed = false;
    let dlTimer: ReturnType<typeof setTimeout> | null = null;
    dlBtn.addEventListener('click', () => {
      if (state.archiveDownload) {
        handlers.onDownloadArchiveBodies?.(); // petla w toku = Przerwij
        return;
      }
      if (!dlArmed) {
        dlArmed = true;
        setButtonLabel(dlBtn, 'Pobieranie potrwa dlugo - kliknij ponownie');
        dlTimer = setTimeout(() => {
          dlArmed = false;
          setButtonLabel(dlBtn, 'Pobierz tresci do archiwum');
        }, 3000);
        return;
      }
      if (dlTimer) clearTimeout(dlTimer);
      dlArmed = false;
      setButtonLabel(dlBtn, 'Pobierz tresci do archiwum');
      handlers.onDownloadArchiveBodies?.();
    });
    downloadStep.appendChild(dlBtn);
    // Fala 17g: eksport calego archiwum do ZIP z TXT per list.
    // Operacja lokalna (tylko listy z trescia w cache) - bez dwukliku.
    const expBtn = doc.createElement('button');
    expBtn.className = 'arkmail-arch-export';
    // Fala 18e (zgloszenie 2026-10-20 pkt 5): zapisuje ZIP z TXT per
    // list - etykieta mowi o formacie archiwum, nie o pojedynczym TXT.
    expBtn.textContent = 'Zapisz wszystkie (ZIP)';
    expBtn.addEventListener('click', () => handlers.onExportArchive?.());
    exportStep.appendChild(expBtn);
    pane.appendChild(steps);
    pane.appendChild(controls);
    if (countsStrip) pane.appendChild(countsStrip);
    const list = doc.createElement('div');
    pane.appendChild(list);
    const repaint = () => {
      // Fala 30a: sprzeczny zakres dat (Od pozniej niz Do) = komunikat
      // i POMINIECIE filtrow dat, zamiast milczaco pustej listy
      // (filtr lokalny, nie ma przycisku Szukaj - sygnalizacja inline).
      const datesInvalid =
        (archFilter.odDaty !== undefined && fromISODate(archFilter.odDaty) === null) ||
        (archFilter.doDaty !== undefined && fromISODate(archFilter.doDaty) === null);
      const datesClash =
        !datesInvalid &&
        archFilter.odDaty !== undefined &&
        archFilter.doDaty !== undefined &&
        archFilter.odDaty > archFilter.doDaty;
      const effFilter = datesInvalid || datesClash
        ? { ...archFilter, odDaty: undefined, doDaty: undefined }
        : archFilter;
      const oldErr = pane.querySelector('.arkmail-dates-error');
      if (oldErr) oldErr.remove();
      if (datesInvalid || datesClash) {
        const err = doc.createElement('div');
        err.className = 'arkmail-dates-error';
        err.textContent = datesInvalid
          ? 'Nieprawidlowa data - filtry dat pomijane.'
          : 'Od dnia pozniej niz Do dnia - daty pomijane.';
        pane.insertBefore(err, list);
      }
      // Fala 18a: blizniaki jednym wierszem, nieobecne ukryte (core).
      const rows = filterVisibleArchive(state.archive, effFilter);
      // Podpis filtra tresci: tresc zna tylko pobrane listy - bez
      // podpowiedzi filtr "milczaco" nic nie znajdowal (zgloszenie
      // 2026-10-20 pkt 3).
      const oldNote = pane.querySelector('.arkmail-tresc-note');
      if (oldNote) oldNote.remove();
      if (archFilter.tresc !== undefined) {
        const base = filterVisibleArchive(state.archive, { ...effFilter, tresc: undefined });
        const withBody = base.filter((l) => l.body.length > 0).length;
        const note = doc.createElement('div');
        note.className = 'arkmail-dim arkmail-tresc-note';
        note.textContent = `Filtr tresci obejmuje tylko listy z pobrana trescia (${withBody} z ${base.length}).`;
        pane.insertBefore(note, list);
      }
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
          // Fala 9e: "od/do" zamiast nawiasow technicznych; skrzynka
          // po ludzku, z kierunkiem strony listu.
          const dir = l.box === 'odebrane' || l.box === 'nieprzeczytane' ? 'od' : 'do';
          meta.textContent = `${dir} ${l.party} | ${l.box}`;
          row.appendChild(meta);
          // Fala 16h: archiwum klikalne (zgloszenie pkt 9) - tresc
          // z cache albo doczyt z serwera po re-kotwicy (index.ts).
          row.addEventListener('click', () => handlers.onOpenArchiveLetter?.(l));
          return row;
        }),
      );
      if (rows.length === 0) {
        list.replaceChildren(dim('Archiwum puste albo zaden list nie pasuje do filtra.'));
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

  /**
   * Pole daty z WIDOCZNA etykieta nad inputem i tooltipem (Fala 30a).
   * Placeholder na input[type=date] jest ignorowany przez przegladarke,
   * wiec bez etykiety pole bylo anonimowe. Wspoldzielone: szukajka
   * serwerowa i filtry archiwum.
   */
  const mkDateField = (
    docRef: Document,
    input: HTMLElement,
    label: string,
    tooltip: string,
  ): HTMLElement => {
    const field = docRef.createElement('label');
    field.className = 'arkmail-date-field';
    const caption = docRef.createElement('span');
    caption.className = 'arkmail-date-label';
    caption.textContent = label;
    input.setAttribute('title', tooltip);
    field.appendChild(caption);
    field.appendChild(input);
    return field;
  };

  const off = store.subscribe(render);
  render(store.state);
  // ESC w oknie potwierdzania usuwania (zgloszenie 2026-10-30):
  // anuluje uzbrojenie bez kasowania. Jeden listener na mount, nie na
  // repaint - przycisk odtwarza sie z kazdym renderem, listener nie.
  // Guard na addEventListener: dymkowe srodowiska smoke daja okrojony
  // document bez API zdarzen (smoke-load: doc.addEventListener is not
  // a function).
  const onEscape = (event: Event): void => {
    if ((event as KeyboardEvent).key !== 'Escape') return;
    if (store.state.deletion.armedAt !== 0) store.disarmDeletionConfirm();
  };
  const canListen = typeof (doc as Document).addEventListener === 'function';
  if (canListen) doc.addEventListener('keydown', onEscape);
  return () => {
    off();
    if (canListen) doc.removeEventListener('keydown', onEscape);
    container.replaceChildren();
  };
}
