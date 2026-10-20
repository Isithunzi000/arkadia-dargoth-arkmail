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
import { filterVisibleArchive, type ArchiveFilter, type ArchiveLetter } from '../core/archive.js';
import { viewContacts, type ContactSort } from '../core/contacts.js';
import {
  clampLineWidth,
  renderLetter,
  type LetterTemplate,
} from '../core/letterRender.js';
import type { MailUiState, MailUiStore, UiTab } from './store.js';
import { allBoxesIndexed, formatBadgeSuffix, INDEX_BOXES } from './store.js';
import { STYLES } from './styles.js';
import { attachGhost, type GhostSource } from './ghost.js';

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
];

const BOXES: Array<[MailBox, string]> = [
  ['odebrane', 'Odebrane'],
  ['nieprzeczytane', 'Nieprzeczytane'],
  ['wyslane', 'Wyslane'],
  ['niewyslane', 'Niewyslane'],
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
  /** Pelnoekranowy podglad compose (Fala 12d): czysto prezentacyjny stan,
   *  lokalny jak contactView; tresc listu zyje w composeDraft (nic nie ginie). */
  let previewFull = false;
  /** Draft pol szukajki: lokalny (jak filtr archiwum) - rerender nie kasuje
   *  wpisanego zapytania. */
  const searchDraft: Record<string, string> = { osoba: '', temat: '', odDaty: '', doDaty: '' };

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
    for (const attr of ['data-search', 'data-field', 'data-filter']) {
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
    root.replaceChildren(...nodes);
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
    }
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

    // Fala 11e: zbiorcze operacje na AKTYWNEJ skrzynce (zamiast
    // per-skrzynka): Odswiez + Wczytaj wszystkie/Przerwij.
    const ops = doc.createElement('div');
    ops.className = 'arkmail-box-ops';
    const refreshAll = doc.createElement('button');
    refreshAll.className = 'arkmail-refresh-global';
    refreshAll.textContent = 'Odswiez';
    refreshAll.addEventListener('click', () => handlers.onRefreshBox(state.activeBox));
    ops.appendChild(refreshAll);
    // Fala 13b: wyslanie zwierzecia pocztowego (send/receive w jednym) -
    // komenda "wyslij zwierze". Nieaktywny w trakcie lotu (roundtrip
    // 20-50 s wg logow); koniec lotu: linia ladowania albo timeout.
    const animalBtn = doc.createElement('button');
    animalBtn.className = 'arkmail-animal-send';
    animalBtn.textContent = state.animalFlying ? 'Zwierze w drodze...' : 'Wyslij Zwierze';
    if (state.animalFlying) animalBtn.setAttribute('disabled', '');
    animalBtn.addEventListener('click', () => handlers.onSendAnimal?.());
    ops.appendChild(animalBtn);
    const view0 = state.boxes[state.activeBox];
    const searchMode0 = state.search && state.search.box === state.activeBox ? state.search : null;
    const loopHere = state.loadAll !== null && state.loadAll.box === state.activeBox;
    const loadAllBtn = doc.createElement('button');
    loadAllBtn.className = 'arkmail-older-all';
    loadAllBtn.textContent = loopHere
      ? `Przerwij · ${state.loadAll!.pages}`
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
    clearBtn.textContent = 'Wyczysc pamiec podreczna';
    let clearArmed = false;
    let clearTimer: ReturnType<typeof setTimeout> | null = null;
    clearBtn.addEventListener('click', () => {
      if (!clearArmed) {
        clearArmed = true;
        clearBtn.textContent = 'Na pewno? Kliknij ponownie';
        clearTimer = setTimeout(() => {
          clearArmed = false;
          clearBtn.textContent = 'Wyczysc pamiec podreczna';
        }, 3000);
        return;
      }
      if (clearTimer) clearTimeout(clearTimer);
      clearArmed = false;
      clearBtn.textContent = 'Wyczysc pamiec podreczna';
      handlers.onClearCache?.();
    });
    ops.appendChild(clearBtn);
    pane.appendChild(ops);

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
    // ?listy). Pola niekontrolowane (bez rerendera przy pisaniu);
    // puste zapytanie nie strzela.
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
    // Ghost-podpowiedzi (Fala 9g) - po appendChild, wrap wymaga rodzica.
    attachGhost(doc, sOsoba as HTMLInputElement, personSource);
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
        for (const key of ['osoba', 'temat', 'odDaty', 'doDaty']) searchDraft[key] = '';
        for (const el of [sOsoba, sTemat, sOd, sDo]) (el as HTMLInputElement).value = '';
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
        dim(state.wide ? 'Wybierz list z listy, aby go przeczytac.' : 'Nie otwarto zadnego listu.'),
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
    const del = doc.createElement('button');
    del.className = 'arkmail-del';
    del.textContent = 'Usun';
    if (source) {
      // Fala 14e: kasowanie z dwuklikowym potwierdzeniem (uzbrojenie
      // wygasa po 3 s, wzorzec jak "Wyczysc pamiec podreczna") -
      // pojedynczy przypadkowy klik nie kasuje listu (zgloszenie
      // 2026-10-19, pkt 7).
      let delArmed = false;
      let delTimer: ReturnType<typeof setTimeout> | null = null;
      del.addEventListener('click', () => {
        if (!delArmed) {
          delArmed = true;
          del.textContent = 'Na pewno? Kliknij ponownie';
          delTimer = setTimeout(() => {
            delArmed = false;
            del.textContent = 'Usun';
          }, 3000);
          return;
        }
        if (delTimer) clearTimeout(delTimer);
        delArmed = false;
        del.textContent = 'Usun';
        handlers.onDeleteLetter(l.box, source);
      });
    } else {
      del.setAttribute('disabled', '');
      del.setAttribute('title', 'Otworz list z zakladki Listy, aby go skasowac.');
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
    lab.textContent = 'Podglad - tak list zostanie wyslany';
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
    lab.textContent = 'Podglad - tak list zostanie wyslany';
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
      labP.textContent = 'Podglad - tak list zostanie wyslany';
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
    send.textContent = 'Zapisz w kolejce do wyslania';
    // Fala 15b: walidacja przed zapisem do kolejki. Pusty adresat =
    // twarda blokada (serwer wymaga >= 1 adresata - "musimy podac
    // przynajmniej jednego"); pusty temat = dwuklikowe uzbrojenie jak
    // Wyczysc/Usun (temat bywa celowo pusty, ale najczesciej to
    // przeoczenie - bez walidacji pusta linia rozbijala rozmowe compose
    // w cisze do timeoutu). Stan lokalny - rerender wraca do etykiety.
    const SEND_LABEL = 'Zapisz w kolejce do wyslania';
    let sendArmed = false;
    let sendTimer: ReturnType<typeof setTimeout> | null = null;
    const disarmSend = (): void => {
      sendArmed = false;
      send.textContent = SEND_LABEL;
    };
    send.addEventListener('click', () => {
      const st = store.state;
      const rendered = renderLetter(tresc.value, st.composeTemplate, st.composeWidth);
      if (!rendered.hasContent) {
        // Fala 16d: pusta tresc = twarda blokada z komunikatem na
        // przycisku, jak adresat (zgloszenie pkt 4). Cichy return z 15b
        // zostawial gracza bez informacji, czemu klikniecie nic nie daje.
        if (sendTimer) clearTimeout(sendTimer);
        sendArmed = false;
        send.textContent = 'Brak tresci listu.';
        sendTimer = setTimeout(disarmSend, 3000);
        return;
      }
      const val = (f: string) =>
        (pane.querySelector(`[data-field="${f}"]`) as HTMLInputElement | HTMLTextAreaElement).value;
      if (!val('adresat').trim()) {
        if (sendTimer) clearTimeout(sendTimer);
        sendArmed = false;
        send.textContent = 'Podaj adresata.';
        sendTimer = setTimeout(disarmSend, 3000);
        return;
      }
      if (!val('temat').trim() && !sendArmed) {
        sendArmed = true;
        send.textContent = 'Temat pusty - na pewno? Kliknij ponownie';
        if (sendTimer) clearTimeout(sendTimer);
        sendTimer = setTimeout(disarmSend, 3000);
        return;
      }
      if (sendTimer) clearTimeout(sendTimer);
      disarmSend();
      handlers.onSendCompose({
        adresat: val('adresat'),
        temat: val('temat'),
        dw: val('dw'),
        linie: rendered.lines,
      });
    });
    pane.appendChild(send);

    // Fala 14b: czyszczenie pol compose z dwuklikowym potwierdzeniem
    // (uzbrojenie wygasa po 3 s; wzorzec "Wyczysc pamiec podreczna").
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
        clearCompose.textContent = 'Na pewno? Kliknij ponownie';
        clearTimer = setTimeout(() => {
          clearArmed = false;
          clearCompose.textContent = 'Wyczysc';
        }, 3000);
        return;
      }
      if (clearTimer) clearTimeout(clearTimer);
      clearArmed = false;
      clearCompose.textContent = 'Wyczysc';
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
    // Fala 18c (zgloszenie 2026-10-20 pkt 1): kontakty liczone z
    // archiwum sa kompletne dopiero po pelnej indeksacji wszystkich
    // skrzynek - wczesniej (baza = pierwsze 50 wpisow) liczniki
    // klamaly, wiec zamiast nich brama z przyciskiem indeksacji.
    if (!allBoxesIndexed(state.indexMeta)) {
      pane.appendChild(
        dim(
          'Kontakty liczone sa z calej bazy listow, nie z pierwszych 50. ' +
            'Zindeksuj wszystkie skrzynki, aby zobaczyc kompletne liczniki.',
        ),
      );
      const gate = doc.createElement('button');
      gate.className = 'arkmail-index-all';
      gate.textContent = state.indexRun
        ? `Przerwij indeksowanie (${state.indexRun.boxIndex + 1}/${INDEX_BOXES.length})`
        : 'Indeksuj wszystkie skrzynki';
      gate.addEventListener('click', () => handlers.onIndexAll?.());
      pane.appendChild(gate);
      return pane;
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
          const jumpTo = (box: MailBox) => {
            searchDraft.osoba = c.name;
            store.setActiveBox(box);
            store.setTab('listy');
            handlers.onSearch(box, { osoba: c.name });
          };
          // Klik w imie = kierunek domyslny: odebrane, gdy sa.
          name.setAttribute('title', 'Pokaz listy tej osoby (domyslnie: odebrane)');
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
              btn.setAttribute('title', 'Brak listow w tym kierunku');
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
              ? 'Brak kontaktow - pojawia sie po pobraniu listingow.'
              : 'Zaden kontakt nie pasuje do filtra.',
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
    // Stopka bramy (Fala 18c): data najstarszej flagi (konserwatywna
    // prawda o kompletnosci) + rozmiar bazy bedacej podstawa licznikow.
    const foot = doc.createElement('div');
    foot.className = 'arkmail-dim arkmail-index-foot';
    const dates = INDEX_BOXES.map((b) => state.indexMeta[b])
      .filter((d): d is string => d !== undefined)
      .sort();
    foot.textContent =
      `Zindeksowano ${(dates[0] ?? '').slice(0, 10)}; ` +
      `listow w bazie: ${state.archive.length}`;
    pane.appendChild(foot);
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
    controls.appendChild(mkText('odDaty', 'Od daty', 'date'));
    controls.appendChild(mkText('doDaty', 'Do daty', 'date'));
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
    // Fala 18c (zgloszenie 2026-10-20 pkt 1): indeksacja wszystkich
    // skrzynek - pelny listing kazdej (z paginacja kotwicowa) = kompletna
    // baza dla kontaktow i eksportow. Operacja tylko czyta (jak Wczytaj
    // wszystkie) - bez dwukliku; w trakcie petli drugi klik = Przerwij.
    const idxBtn = doc.createElement('button');
    idxBtn.className = 'arkmail-index-all';
    idxBtn.textContent = state.indexRun
      ? `Przerwij indeksowanie (${state.indexRun.boxIndex + 1}/${INDEX_BOXES.length})`
      : 'Indeksuj wszystkie';
    idxBtn.addEventListener('click', () => handlers.onIndexAll?.());
    controls.appendChild(idxBtn);
    // Fala 16i: masowe pobieranie tresci do archiwum (zgloszenie
    // pkt 10). Dwuklikowe uzbrojenie z ostrzezeniem o dlugim czasie
    // (precedens: Wyczysc pamiec podreczna); w trakcie petli przycisk
    // zamienia sie w Przerwij z postepem (precedens: Wczytaj wszystkie).
    const dlBtn = doc.createElement('button');
    dlBtn.className = 'arkmail-arch-download';
    dlBtn.textContent = state.archiveDownload
      ? `Przerwij · ${state.archiveDownload.done}/${state.archiveDownload.total}`
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
        dlBtn.textContent = 'Pobieranie potrwa dlugo - kliknij ponownie';
        dlTimer = setTimeout(() => {
          dlArmed = false;
          dlBtn.textContent = 'Pobierz tresci do archiwum';
        }, 3000);
        return;
      }
      if (dlTimer) clearTimeout(dlTimer);
      dlArmed = false;
      dlBtn.textContent = 'Pobierz tresci do archiwum';
      handlers.onDownloadArchiveBodies?.();
    });
    controls.appendChild(dlBtn);
    // Fala 17g: eksport calego archiwum do ZIP z TXT per list.
    // Operacja lokalna (tylko listy z trescia w cache) - bez dwukliku.
    const expBtn = doc.createElement('button');
    expBtn.className = 'arkmail-arch-export';
    // Fala 18e (zgloszenie 2026-10-20 pkt 5): zapisuje ZIP z TXT per
    // list - etykieta mowi o formacie archiwum, nie o pojedynczym TXT.
    expBtn.textContent = 'Zapisz wszystkie (ZIP)';
    expBtn.addEventListener('click', () => handlers.onExportArchive?.());
    controls.appendChild(expBtn);
    pane.appendChild(controls);
    const list = doc.createElement('div');
    pane.appendChild(list);
    const repaint = () => {
      // Fala 18a: blizniaki jednym wierszem, znikniete ukryte (core).
      const rows = filterVisibleArchive(state.archive, archFilter);
      // Podpis filtra tresci: tresc zna tylko pobrane listy - bez
      // podpowiedzi filtr "milczaco" nic nie znajdowal (zgloszenie
      // 2026-10-20 pkt 3).
      const oldNote = pane.querySelector('.arkmail-tresc-note');
      if (oldNote) oldNote.remove();
      if (archFilter.tresc !== undefined) {
        const base = filterVisibleArchive(state.archive, { ...archFilter, tresc: undefined });
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

  const off = store.subscribe(render);
  render(store.state);
  return () => {
    off();
    container.replaceChildren();
  };
}
