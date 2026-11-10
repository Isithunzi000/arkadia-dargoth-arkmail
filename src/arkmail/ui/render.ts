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
  isValidPersonName,
  validateSearchDraft,
  type ListingSearch,
} from '../core/protocol/commands.js';
import {
  filterVisibleArchive,
  type ArchiveFilter,
  type ArchiveLetter,
} from '../core/archive.js';
import {
  liveArchiveGroups,
  totalLive,
} from '../core/archiveStats.js';
import { parseMailDate } from '../core/protocol/parser.js';
import { archiveExportStats } from '../core/exportTxt.js';
import { viewContacts, type ContactSort } from '../core/contacts.js';
import {
  parseAddressBookExport,
  groupAliasConflict,
  type AddressBookExport,
  type ContactGroup,
  type ImportMode,
} from '../core/addressBook.js';
import {
  clampLineWidth,
  renderLetter,
  type LetterTemplate,
} from '../core/letterRender.js';
import { validateCompose, type ComposeSendInput } from '../core/composeValidation.js';
import {
  buildReplyAllPrefill,
  knownRecipientNames,
  type ReplyAllPrefill,
} from '../core/replyRecipients.js';
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
  /** Pusty wynik reply-all wymaga komunikatu z warstwy integracyjnej. */
  onReplyAllEmpty?(): void;
  /**
   * Reply-all z Archiwum uzywa aktualnego rekordu. Brak kompletu moze
   * wymagac jednego odczytu; apply odrzuca nadpisanie zmienionego draftu.
   */
  onReplyAllArchive?(
    archiveId: string,
    apply: (prefill: ReplyAllPrefill) => boolean,
  ): void;
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
  /**
   * Import osob z gry (Fala UI-2): zapamietani lub przedstawieni.
   * Dopisuje nowe osoby do istniejacej puli, nie tworzy grup - z bazy
   * gracz sklada grupy recznie. Opcjonalny: starsze montaze go nie podaja.
   */
  onImportPeople?(kind: 'zapamietani' | 'przedstawieni'): void;
  /**
   * Import aliasow pocztowych z gry (Fala UI-2): tylko odczyt;
   * rozstrzyga je serwer przy wysylce, czlonkowie aliasow dolaczaja
   * do bazy osob. Opcjonalny: starsze montaze testowe go nie podaja.
   */
  onImportAliases?(): void;
  /**
   * Zapis listy grup recznych (Fala UI-2 krok 3): wywolywany po kazdej
   * mutacji CRUD (utworzenie, zmiana nazwy, czlonkowie, usuniecie).
   * Opcjonalny: starsze montaze testowe go nie podaja.
   */
  onSaveGroups?(groups: ContactGroup[]): void;
  /** Jedna operacja dopisania czlonka do grupy i Ksiazki. Zwraca blad walidacji. */
  onAddGroupMember?(groupName: string, name: string): string | null;
  /**
   * Zapis plaskiej ksiazki imion (Fala UI-2 krok 3): wywolywany po
   * kazdej mutacji CRUD (dodanie, usuniecie pojedyncze, usuniecie
   * zaznaczonych). Jak onSaveGroups - storage + stan UI w jednym
   * przebiegu. Opcjonalny: starsze montaze testowe go nie podaja.
   */
  onSavePeople?(people: string[]): void;
  /**
   * Import ksiazki adresowej z pliku JSON (Fala UI-2 krok 3): dane
   * zwalidowane i wyczyszczone, bez suffixow (kolizje grup scala
   * mergeAddressBook albo tryb zastap). Tryb dolacz domyslny.
   * Aliasy sa lustrem z gry - import pliku ich nie rusza.
   * Opcjonalny: starsze montaze testowe go nie podaja.
   */
  onImportAddressBook?(data: AddressBookExport, mode?: ImportMode): void;
  /**
   * Eksport ksiazki adresowej do pliku JSON (zgloszenie 2026-11-05):
   * pobranie pliku + komunikat (status + toast) robi index.ts, jak
   * przy eksporcie listu - UI nie pobiera pliku bez potwierdzenia.
   * Opcjonalny: starsze montaze testowe go nie podaja.
   */
  onExportAddressBook?(): void;
  /**
   * Czyszczenie lokalnego lustra aliasow (zgloszenie 2026-11-05):
   * kasuje zaimportowane aliasy i przebudowuje kontakty; na serwerze
   * Arkadii nic nie znika - aliasy pobiera sie z gry ponownie.
   * Opcjonalny: starsze montaze testowe go nie podaja.
   */
  onClearAliases?(): void;
  /**
   * Czyszczenie calej ksiazki adresowej (zgloszenie 2026-11-05):
   * imiona + grupy + aliasy lokalnie; serwer nietkniety. Opcjonalny.
   */
  onClearAddressBook?(): void;
  /**
   * Dopisanie wszystkich osob zebranych z listow do ksiazki adresowej
   * (zgloszenie 2026-11-05): dedup bez wielkosci liter, nigdy nic
   * nie kasuje. Opcjonalny: starsze montaze testowe go nie podaja.
   */
  onAddAllContacts?(): void;
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
// Zgloszenie 2026-11-05 (F4c): pola tekstowe na natywnych klasach klienta
// (popup-input popup-input--control) - wyglad, fokus i placeholder pilnuje
// motyw klienta. Checkboxy i radioboxy z wyjatkiem (accent-color u nas).
const nativeFieldClass = (el: HTMLElement): void => {
  el.classList.add('popup-input', 'popup-input--control');
};

  const style = doc.createElement('style');
  style.textContent = STYLES;
  container.appendChild(style);
  const root = doc.createElement('div') as HTMLDivElement;
  container.appendChild(root);

  /** Filtr archiwum: lokalny (poza store) - input zachowuje fokus. */
  const archFilter: ArchiveFilter = {};
  /** Filtr i sort kontaktow: lokalne (poza store) - ten sam powod co wyzej.
   *  Fala UI-2 krok 4: sub-pigulka Osoby ustapila miejsca panelowi
   *  osob w Archiwum (indeks osob mieszka tam), wiec w Kontaktach
   *  zostaly dwie pigulki i domyslnie Ksiazka adresowa. */
  const contactView: {
    filter: string;
    sort: ContactSort;
    sub: 'ksiazka' | 'aliasy' | 'grupy' | 'importeksport';
  } = {
    filter: '',
    sort: 'nazwa',
    sub: 'ksiazka',
  };
  /** Zwijanie panelu "Osoby z listow" w Archiwum (Fala UI-2 krok 4):
   *  lokalne (poza store) jak filtry - toggle nie traca stanu przy
   *  repaint. Zgloszenie 2026-11-05 (A1): domyslnie ZWINIETY - lista
   *  listow ma byc od razu na widoku; skok z osoby rozwija panel z
   *  powrotem (kontekst osoby ma byc widoczny przy przefiltrowanej
   *  liscie) i przewija widok do listy listow (A2). */
  // Wydanie 1.30.1 (zgloszenie 6): Archiwum na chipsy jak Kontakty -
  // 'listy' (domyslnie) albo 'osoby'. Stan lokalny, repaint przez
  // store.refresh(), jak sub-pigulki Kontaktow.
  const archView = { sub: 'listy' as 'listy' | 'osoby' };
  const ARCHIVE_CLEAR_TITLE =
    'Czysci filtry Archiwum i Osob z listow oraz przywraca sortowanie osob: Nazwa A-Z.';
  const archiveFiltersDirty = (): boolean =>
    Object.values(archFilter).some((value) => value !== undefined && value !== '') ||
    contactView.filter !== '' ||
    contactView.sort !== 'nazwa';
  const clearArchiveFilters = (): boolean => {
    if (!archiveFiltersDirty()) return false;
    for (const key of ['osoba', 'temat', 'tresc', 'odDaty', 'doDaty', 'skrzynka'] as const) {
      archFilter[key] = undefined;
    }
    contactView.filter = '';
    contactView.sort = 'nazwa';
    return true;
  };
  const wireArchiveClearButton = (button: HTMLButtonElement): (() => void) => {
    button.textContent = 'Wyczysc filtry';
    button.setAttribute('title', ARCHIVE_CLEAR_TITLE);
    const sync = (): void => {
      if (archiveFiltersDirty()) button.removeAttribute('disabled');
      else button.setAttribute('disabled', '1');
    };
    button.addEventListener('click', () => {
      if (clearArchiveFilters()) store.refresh();
    });
    sync();
    return sync;
  };
  /** Tryb importu pliku ksiazki (Fala UI-2 krok 3): lokalny jak
   *  contactView - domyslnie dolacz; "zastap" podmienia imiona i grupy. */
  let bookImportMode: ImportMode = 'dolacz';
  let bookImportSelection = 0;
  let pendingBookReplace: {
    selection: number;
    fileName: string;
    data: AddressBookExport;
  } | null = null;
  /** Zaznaczenie w widoku ksiazki adresowej (Fala UI-2 krok 3): lokalne
   *  (jak filtry). Zerowane przy kazdej zmianie listy imion - porownanie
   *  referencji tablicy w store, wiec importy/dodanie/usuniecie kasuja
   *  zaznaczenie deterministycznie. */
  const bookSelection = new Set<string>();
  let bookPeopleRef: readonly string[] | null = null;
  // Zgloszenie 2026-11-05: filtry list (stan lokalny, jak bookImportMode).
  let bookFilter = '';
  let groupFilter = '';
  // Zgloszenie 2026-11-05 (D3): grupy zwijane - w zbiorze nazwy grup
  // rozwinietych; brak wpisu = zwiniete (domyslnie wszystkie zwiniete).
  const expandedGroups = new Set<string>();
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
  const SEARCH_GO_TITLE =
    'Szuka listow po wpisanych filtrach. Przy pustych filtrach odswieza wybrana skrzynke.';

  // --- Guard dwukliku klawiszy usuwajacych (zgloszenie 2026-11-05):
  // jeden wzorzec dla calego UI. Pierwszy klik uzbraja na 3 s
  // (data-armed="1", czerwone tlo daje regula w styles.ts), drugi w tym
  // czasie kasuje; wygasniecie albo ESC rozbraja. Stan w zamknieciu
  // modulu: uzbrojony element ginie z kazdym repaintem, timer sprzata
  // rejestr. Klawisze z napisem dostaja etykiete "Na pewno usunac?",
  // klawisze X zostaja "x" - ich uzbrojenie widac kolorem.
  const GUARD_ARM_MS = 3000;
  const ERROR_LABEL_MS = 3000;

// Wspolny neutralny wariant wylacznie dla czyszczenia filtrow.
const filterClearClass = (viewClass?: string): string =>
  `${viewClass ? `${viewClass} ` : ''}arkmail-filter-clear popup-btn popup-btn--control popup-btn--ghost`;
  interface ArmedButton {
    el: HTMLButtonElement;
    timer: ReturnType<typeof setTimeout> | null;
    baseText: string;
    baseTitle: string;
    baseAriaLabel: string | null;
  }
  const armedButtons = new Set<ArmedButton>();
  const disarmButton = (g: ArmedButton): void => {
    if (g.timer !== null) clearTimeout(g.timer);
    g.timer = null;
    g.el.removeAttribute('data-armed');
    g.el.textContent = g.baseText;
    g.el.setAttribute('title', g.baseTitle);
    if (g.baseAriaLabel === null) g.el.removeAttribute('aria-label');
    else g.el.setAttribute('aria-label', g.baseAriaLabel);
    armedButtons.delete(g);
  };
  const disarmAllButtons = (): void => {
    for (const g of [...armedButtons]) disarmButton(g);
  };
  const guardDeleteButton = (
    btn: HTMLButtonElement,
    onConfirm: () => void,
    opts: { armedLabel?: string; armedTitle?: string } = {},
  ): void => {
    // Ikony bez widocznego tekstu dostaja nazwe dostepnosci z title.
    if (!btn.getAttribute('aria-label')) {
      btn.setAttribute('aria-label', btn.getAttribute('title') ?? btn.textContent ?? 'Usun');
    }
    const g: ArmedButton = {
      el: btn,
      timer: null,
      baseText: btn.textContent ?? '',
      baseTitle: btn.getAttribute('title') ?? '',
      baseAriaLabel: btn.getAttribute('aria-label'),
    };
    btn.addEventListener('click', () => {
      if (g.timer === null) {
        g.timer = setTimeout(() => disarmButton(g), GUARD_ARM_MS);
        btn.setAttribute('data-armed', '1');
        if (opts.armedLabel !== undefined) btn.textContent = opts.armedLabel;
        const armedTitle = opts.armedTitle ?? 'Kliknij ponownie, aby usunac.';
        btn.setAttribute('title', armedTitle);
        btn.setAttribute('aria-label', opts.armedLabel ?? armedTitle);
        armedButtons.add(g);
        return;
      }
      disarmButton(g);
      onConfirm();
    });
  };
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
    focusKey: { attribute: string; value: string } | null;
    /** Wartosc aktywnego pola: draft aktualizuje sie na 'input', ale
     *  wpis bez zdarzenia (i tak trafia tu zawsze najswiezszy tekst z DOM). */
    focusValue: string | null;
    caret: [number, number] | null;
    scroll: Record<string, number>;
  }
  // Zgloszenie 2026-11-05 (Etap 10): klikalny wiersz dziala tez z
  // klawiatury - role, tabindex i Enter/Spacja jak przy klawiszu.
  const makeClickable = (el: HTMLElement, onActivate: () => void): void => {
    el.setAttribute('role', 'button');
    el.setAttribute('tabindex', '0');
    el.addEventListener('click', onActivate);
    el.addEventListener('keydown', (ev: KeyboardEvent) => {
      if (ev.key === 'Enter' || ev.key === ' ') {
        ev.preventDefault();
        onActivate();
      }
    });
  };
  const submitOnEnter = (input: HTMLInputElement, activate: () => void): void => {
    input.addEventListener('keydown', (ev: KeyboardEvent) => {
      if (ev.key !== 'Enter' || ev.repeat || ev.isComposing) return;
      ev.preventDefault();
      activate();
    });
  };
  const wireTabKeyboard = (
    bar: HTMLElement,
    buttons: readonly HTMLButtonElement[],
    activate: (index: number) => void,
  ): void => {
    bar.addEventListener('keydown', (ev: KeyboardEvent) => {
      const current = buttons.indexOf(ev.target as HTMLButtonElement);
      if (current < 0) return;
      let next: number;
      if (ev.key === 'ArrowRight') next = (current + 1) % buttons.length;
      else if (ev.key === 'ArrowLeft') next = (current - 1 + buttons.length) % buttons.length;
      else if (ev.key === 'Home') next = 0;
      else if (ev.key === 'End') next = buttons.length - 1;
      else return;
      ev.preventDefault();
      activate(next);
    });
  };
  const focusKeyOf = (el: Element | null): { attribute: string; value: string } | null => {
    if (!el || typeof (el as HTMLElement).getAttribute !== 'function') return null;
    if (!root.contains(el)) return null;
    for (const attr of [
      'data-search',
      'data-field',
      'data-filter',
      'data-deletion-filter',
      'data-deletion-number',
      'data-book-check',
      'data-book-filter',
      'data-book-new',
      'data-group-filter',
      'data-group-add',
      'data-group-rename',
      'data-member-add',
    ]) {
      const value = (el as HTMLElement).getAttribute(attr);
      if (value !== null) return { attribute: attr, value };
    }
    return null;
  };
  const snapshotView = (): ViewSnap => {
    const snap: ViewSnap = { focusKey: null, focusValue: null, caret: null, scroll: {} };
    const active = doc.activeElement as Element | null;
    const key = focusKeyOf(active);
    if (key) {
      snap.focusKey = key;
      const inp = active as HTMLInputElement;
      // Etap 10: checkbox oddaje stan zaznaczenia, pole - wpisana wartosc.
      snap.focusValue =
        inp.getAttribute('type') === 'checkbox'
          ? inp.checked
            ? '1'
            : '0'
          : ((active as HTMLInputElement).value ?? null);
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
      // Wartosc atrybutu nigdy nie trafia do selektora: znaki specjalne
      // w nazwach nie moga zepsuc przywracania fokusu.
      const el = Array.from(root.querySelectorAll(`[${snap.focusKey.attribute}]`)).find(
        (candidate) => candidate.getAttribute(snap.focusKey!.attribute) === snap.focusKey!.value,
      ) as HTMLInputElement | undefined;
      if (el) {
        if (el.getAttribute('type') === 'checkbox') {
          el.checked = snap.focusValue === '1';
        } else if (snap.focusValue !== null) {
          el.value = snap.focusValue;
        }
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
    // Fala UI-2: ksiazka adresowa imion + aliasy jako tokeny.
    for (const name of store.state.people) push(name);
    for (const alias of store.state.importedAliases) push(alias.name);
    return out;
  };
  // Fala UI-2 krok 4: zrodlo pol wieloodbiorczych (adresat/DW) - baza
  // osob + grupy. Grupa podpowiada po nazwie, ale akceptacja wstawia
  // ROZWINIETA liste czlonkow (Arkadia nie zna grup pluginu - w polu
  // musza stanac imiona), nigdy samej nazwy grupy.
  const adresatSource: GhostSource = () => [
    ...personSource(),
    ...store.state.groups
      .filter((g) => g.members.length > 0 && !groupAliasConflict(g.name, store.state.importedAliases))
      .map((g) => ({ text: g.name, expand: g.members.join(', ') })),
  ];
  // Filtr grup: nazwy grup z ksiazki (zgloszenie 2026-11-05, K8).
  const groupNameSource: GhostSource = () => store.state.groups.map((g) => g.name);
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

  /**
   * Fala UI-1 (zgloszenie 2026-11-03): pasek statusu na DOLE okna,
   * ZAWSZE zamontowany - pojawienie sie i zakonczenie statusu nie
   * przesuwa reszty UI (kontrakt: busy istnieje z pustym tekstem na
   * idle, test tests/busyStrip.test.ts). Na idle pole busy ma
   * visibility:hidden (zajmuje miejsce, nie zasmieca okna pustym
   * obramowaniem).
   */
  const renderStatusFooter = (state: MailUiState): HTMLElement => {
    const footer = doc.createElement('footer');
    footer.className = 'arkmail-status';
    const busyEl = doc.createElement('div');
    busyEl.className = 'arkmail-busy' + (state.busy !== null ? '' : ' arkmail-busy-empty');
    busyEl.setAttribute('role', 'status');
    busyEl.setAttribute('aria-live', 'polite');
    busyEl.setAttribute('aria-atomic', 'true');
    const label = doc.createElement('span');
    // Fala 18d: ETA przy petli pobierania tresci (od 3 ukonczonych).
    const dl = state.archiveDownload;
    label.textContent =
      `${state.busy ?? ''}` +
      (dl !== null && dl.etaMs !== null ? ` (${formatEta(dl.etaMs)})` : '');
    busyEl.appendChild(label);
    if (dl !== null && dl.total > 0) {
      const pct = Math.min(100, Math.round((dl.done / dl.total) * 100));
      const track = doc.createElement('div');
      track.className = 'arkmail-busy-track';
      track.setAttribute('role', 'progressbar');
      track.setAttribute('aria-valuemin', '0');
      track.setAttribute('aria-valuemax', '100');
      track.setAttribute('aria-valuenow', String(pct));
      track.setAttribute('aria-valuetext', `${dl.done} z ${dl.total}`);
      const bar = doc.createElement('div');
      bar.className = 'arkmail-busy-bar';
      bar.style.width = `${pct}%`;
      track.appendChild(bar);
      busyEl.appendChild(track);
    }
    footer.appendChild(busyEl);
    const version = doc.createElement('span');
    version.className = 'arkmail-version-footer';
    version.textContent = `v${PLUGIN_VERSION} | ${PLUGIN_BUILD_DATE}`;
    footer.appendChild(version);
    return footer;
  };

  const render = (state: MailUiState) => {
    const snap = snapshotView();
    root.className = 'arkmail-root' + (state.wide ? ' arkmail-wide' : '');
    composePreview = null; // nowe drzewo = nowy <pre> podgladu
    // Fala 12d: pelny podglad zyje tylko na zakladce napisz - zmiana
    // zakladki zamyka overlay (powrot do napisz = formularz).
    if (state.tab !== 'napisz') previewFull = false;
    const selectedTab: UiTab | null = state.tab === 'list' ? null : state.tab;
    const nodes: Node[] = [renderTabs(state)];
    let panel: HTMLElement;
    if (state.tab === 'napisz' && previewFull) {
      // Fala 12d: podglad na cale okno popupu (oba tryby szerokosci).
      panel = renderPreviewFull();
    } else if (state.wide && state.tab === 'listy') {
      // Fala 10: na szerokim zakladka 'listy' to ZAWSZE split (klasyczny
      // klient poczty) - bez otwartego listu prawy panel ma placeholder.
      const split = doc.createElement('div');
      split.className = 'arkmail-split';
      split.appendChild(renderListy(state));
      split.appendChild(renderList(state));
      panel = split;
    } else if (state.wide && state.tab === 'napisz') {
      // Fala 11d: compose dwupanelowy - formularz z lewej, zywy podglad
      // wysylanego listu z prawej (konwencja podgladu /list w kliencie).
      const split = doc.createElement('div');
      split.className = 'arkmail-split arkmail-split-compose';
      split.appendChild(renderNapisz(state));
      split.appendChild(renderComposePreview());
      panel = split;
    } else {
      panel = renderPane(state);
    }
    panel.id = `arkmail-panel-${state.tab}`;
    panel.setAttribute('role', 'tabpanel');
    if (selectedTab === null) panel.setAttribute('aria-label', 'List');
    else panel.setAttribute('aria-labelledby', `arkmail-tab-${selectedTab}`);
    nodes.push(panel);
    nodes.push(renderStatusFooter(state));
    root.replaceChildren(...nodes);
    fillButtonTitles(root);
    restoreView(snap);
  };

  const renderTabs = (state: MailUiState): HTMLElement => {
    const selectedTab: UiTab | null = state.tab === 'list' ? null : state.tab;
    const bar = doc.createElement('div');
    bar.className = 'arkmail-tabs dialog-tabs';
    bar.setAttribute('role', 'tablist');
    bar.setAttribute('aria-label', 'ArkMail');
    const buttons: HTMLButtonElement[] = [];
    for (const [id, label] of TABS) {
      const btn = doc.createElement('button');
      btn.className =
        'arkmail-tab dialog-tab' +
        (selectedTab === id ? ' is-active' : '') +
        // Fala 14b: flash po odlozeniu listu w niewyslanych (compose
        // poza poczta zawsze kolejkuje) - gracz widzi, gdzie kliknac.
        (state.unsentFlash && id === 'listy' ? ' arkmail-flash' : '');
      btn.setAttribute('data-tab', id);
      btn.id = `arkmail-tab-${id}`;
      btn.setAttribute('role', 'tab');
      btn.setAttribute('aria-selected', selectedTab === id ? 'true' : 'false');
      btn.setAttribute('aria-controls', `arkmail-panel-${id}`);
      btn.tabIndex = selectedTab === id || (selectedTab === null && id === 'listy') ? 0 : -1;
      // Fala 14d: '(u)' albo '(u/n)' - nieprzeczytane/niewyslane.
      btn.textContent =
        id === 'listy' ? label + formatBadgeSuffix(state.badge, state.badgeUnsent) : label;
      btn.addEventListener('click', () => store.setTab(id));
      bar.appendChild(btn);
      buttons.push(btn);
    }
    wireTabKeyboard(bar, buttons, (index) => {
      const id = TABS[index]![0];
      store.setTab(id);
      (root.querySelector(`[data-tab="${id}"]`) as HTMLButtonElement | null)?.focus();
    });
    return bar;
  };

  /** Fala 18d: ETA w ludzkiej formie - sekundy <45 s, potem minuty. */
  const formatEta = (ms: number): string =>
    ms < 45_000
      ? `zostalo ok. ${Math.max(1, Math.round(ms / 1000))} s`
      : `zostalo ok. ${Math.max(1, Math.round(ms / 60000))} min`;

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
    nativeFieldClass(box);
    box.classList.add('arkmail-deletion-box');
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
    search.className = 'arkmail-deletion-search popup-btn popup-btn--control popup-btn--solid';
    setButtonLabel(search, SEARCH_GO_LABEL, SEARCH_GO_TITLE);
    let searchErrorTimer: ReturnType<typeof setTimeout> | null = null;
    const showSearchError = (message: string): void => {
      if (searchErrorTimer) clearTimeout(searchErrorTimer);
      setButtonLabel(search, message);
      searchErrorTimer = setTimeout(
        () => setButtonLabel(search, SEARCH_GO_LABEL, SEARCH_GO_TITLE),
        ERROR_LABEL_MS,
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
    clearFilters.className = filterClearClass('arkmail-deletion-clear-filters');
    clearFilters.textContent = 'Wyczysc filtry';
    clearFilters.addEventListener('click', () => {
      for (const key of ['osoba', 'temat', 'tresc', 'odDaty', 'doDaty'] as const) {
        deletionDraft[key] = '';
      }
      filterRow.querySelectorAll('[data-deletion-filter]').forEach((el) => {
        (el as HTMLInputElement).value = '';
      });
      store.setDeletionFilters(emptyDeletionFilters());
      // Fala 40: filtr usuwania jest serwerowy - po wyczyszczeniu pol
      // trzeba pobrac listing jeszcze raz (parzystosc z Archiwum),
      // inaczej stary, przefiltrowany wynik zostaje na ekranie.
      handlers.onDeletionSearch?.(store.state.deletion.box, {});
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
      nativeFieldClass(field);
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
      submitOnEnter(field, () => search.click());
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
    selectAll.className = 'arkmail-deletion-select-all popup-btn popup-btn--control';
    selectAll.textContent = 'Zaznacz wszystkie';
    if (entries.length === 0) selectAll.setAttribute('disabled', '');
    selectAll.addEventListener('click', () => store.selectAllDeletionEntries());
    selectionOps.appendChild(selectAll);
    const clearSelection = doc.createElement('button');
    clearSelection.className = 'arkmail-deletion-clear-selection popup-btn popup-btn--control';
    clearSelection.textContent = 'Odznacz wszystkie';
    if (state.deletion.selected.length === 0) clearSelection.setAttribute('disabled', '');
    clearSelection.addEventListener('click', () => store.clearDeletionSelection());
    selectionOps.appendChild(clearSelection);

    const remove = doc.createElement('button');
    remove.className = 'arkmail-deletion-delete popup-btn popup-btn--control popup-btn--danger popup-btn--ghost';
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
    // Fala UI-1 (zgloszenie 2026-11-03): panel w trybie kolumnowym -
    // naglowek (skrzynki, operacje, szukajka) stoi na stale, scrolluje
    // sie tylko lista w .arkmail-list-scroll (sugestia 3 z Discorda).
    pane.className = 'arkmail-pane arkmail-listy';
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
    const view0 = state.boxes[state.activeBox];
    const searchMode0 = state.search && state.search.box === state.activeBox ? state.search : null;
    const loopHere = state.loadAll !== null && state.loadAll.box === state.activeBox;
    const loadAllBtn = doc.createElement('button');
    loadAllBtn.className = 'arkmail-older-all popup-btn popup-btn--control';
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
    clearBtn.className = 'arkmail-cache-clear popup-btn popup-btn--control popup-btn--danger popup-btn--ghost';
    clearBtn.textContent = 'Wyczysc zapisane dane';
    // Fala 24h (zgloszenie 2026-10-21): zakres czyszczenia w tooltipie
    // przycisku zamiast stalego napisu pod paskiem operacji (napis
    // wisualnie zasmiecal kazda skrzynke).
    const clearTitle = 'Kasuje lokalnie listy, archiwum, kontakty i indeksy. Na serwerze Arkadii nic nie znika - skrzynki pobierzesz od nowa. Ustawienia, grupy i ksiazka adresowa zostaja. Aliasy pobierzesz z gry ponownie.';
    clearBtn.setAttribute('title', clearTitle);
    // 1.30.2 (Etap 5): wspolny guard - uzbrojenie widac kolorem
    // (data-armed), ESC rozbraja (disarmAllButtons na dokumencie).
    guardDeleteButton(clearBtn, () => handlers.onClearCache?.(), {
      armedLabel: 'Na pewno? Kliknij ponownie',
      armedTitle: 'Kliknij ponownie, aby wyczyscic zapisane dane.',
    });
    ops.appendChild(clearBtn);
    pane.appendChild(ops);
    // Fala 21b/24h: zakres czyszczenia wyjasniony w tooltipie przycisku
    // (powyzej), bez stalego napisu w panelu.

    // Dwa niezalezne ustawienia. Tooltip jest takze na samym polu,
    // wiec opis pozostaje powiazany z kontrolka dostepna z klawiatury.
    const notifyTitle =
      'Pokazuje komunikat o nowej poczcie. To ustawienie nie wplywa na automatyczne odswiezanie skrzynek.';
    const notifyRow = doc.createElement('label');
    notifyRow.className = 'arkmail-dim';
    notifyRow.setAttribute('title', notifyTitle);
    const chk = doc.createElement('input');
    chk.setAttribute('type', 'checkbox');
    chk.className = 'arkmail-notify-toggle';
    chk.setAttribute('title', notifyTitle);
    chk.checked = state.notifyEnabled;
    chk.addEventListener('click', () => store.setNotifyEnabled(!store.state.notifyEnabled));
    notifyRow.appendChild(chk);
    notifyRow.appendChild(doc.createTextNode(' Powiadomienia o nowej poczcie'));
    pane.appendChild(notifyRow);

    const autoRefreshTitle =
      'Po nowej poczcie i innych zdarzeniach pocztowych ArkMail automatycznie sprawdza skrzynki oraz aktualizuje archiwum, kontakty i liczniki. Wylaczenie tej opcji zatrzymuje odswiezanie w tle, ale nie wylacza powiadomien. Dane moga byc nieaktualne do czasu recznego odswiezenia. Uzyj przycisku Odswiez, aby pobrac aktualne dane.';
    const autoRefreshRow = doc.createElement('label');
    autoRefreshRow.className = 'arkmail-dim';
    autoRefreshRow.setAttribute('title', autoRefreshTitle);
    const autoRefreshToggle = doc.createElement('input');
    autoRefreshToggle.setAttribute('type', 'checkbox');
    autoRefreshToggle.className = 'arkmail-auto-refresh-toggle';
    autoRefreshToggle.setAttribute('title', autoRefreshTitle);
    autoRefreshToggle.checked = state.autoRefreshEnabled;
    autoRefreshToggle.addEventListener('click', () =>
      store.setAutoRefreshEnabled(!store.state.autoRefreshEnabled));
    autoRefreshRow.appendChild(autoRefreshToggle);
    autoRefreshRow.appendChild(doc.createTextNode(' Automatyczne odswiezanie poczty'));
    pane.appendChild(autoRefreshRow);
    if (!state.autoRefreshEnabled) {
      const warning = doc.createElement('div');
      warning.className = 'arkmail-dim arkmail-auto-refresh-warning';
      warning.setAttribute('role', 'status');
      warning.textContent =
        'Automatyczne odswiezanie jest wylaczone. Archiwum, kontakty i liczniki moga byc nieaktualne. Uzyj przycisku Odswiez, aby pobrac aktualne dane.';
      pane.appendChild(warning);
    }

    // Pasek szukania serwerowego (komenda "listy" z filtrami, skladnia
    // ?listy). Pola niekontrolowane (bez rerendera przy pisaniu).
    // Puste pola odswiezaja aktywna skrzynke.
    const searchRow = doc.createElement('div');
    searchRow.className = 'arkmail-search-row';
    const mkSearch = (key: string, placeholder: string, type = 'text') => {
      const input = doc.createElement('input');
      nativeFieldClass(input);
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
    sOsoba.setAttribute('title', 'Wpisz szukana fraze w dopelniaczu (kogo? czego?).');
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
    sTresc.classList.add('arkmail-search-wide');
    const sOd = mkSearch('odDaty', 'Od dnia', 'date');
    const sDo = mkSearch('doDaty', 'Do dnia', 'date');
    const sOdF = mkDateField(doc, sOd, 'Od dnia (wlacznie)', 'Szukanie zwroci listy wyslane od tego dnia WLACZNIE.');
    const sDoF = mkDateField(doc, sDo, 'Do dnia (wlacznie)', 'Szukanie zwroci listy wyslane do tego dnia WLACZNIE.');
    const go = doc.createElement('button');
    go.className = 'arkmail-search-go popup-btn popup-btn--control popup-btn--solid';
    setButtonLabel(go, SEARCH_GO_LABEL, SEARCH_GO_TITLE);
    let searchErrorTimer: ReturnType<typeof setTimeout> | null = null;
    const showSearchError = (message: string): void => {
      if (searchErrorTimer) clearTimeout(searchErrorTimer);
      setButtonLabel(go, message);
      searchErrorTimer = setTimeout(() => setButtonLabel(go, SEARCH_GO_LABEL, SEARCH_GO_TITLE), ERROR_LABEL_MS);
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

    // Kontener scrollujacy: wiersze listow i ich stany puste. Klucz
    // migawki scrolla (Fala 11c) mieszka na nim, nie na panelu.
    const scroll = doc.createElement('div');
    scroll.className = 'arkmail-list-scroll';
    scroll.setAttribute('data-pane-key', `listy:${state.activeBox}`);
    pane.appendChild(scroll);

    // Tryb wynikow: banner z opisem zapytania + Wyczysc (restore pelnego
    // widoku z pamieci, bez strzalu do serwera).
    const searchMode = state.search && state.search.box === state.activeBox ? state.search : null;
    if (searchMode) {
      const banner = doc.createElement('div');
      banner.className = 'arkmail-search-banner';
      banner.appendChild(doc.createTextNode(`Wyniki szukania: ${searchMode.label}`));
      const clear = doc.createElement('button');
      clear.className = filterClearClass('arkmail-search-clear');
      clear.textContent = 'Wyczysc wyniki i filtry';
      clear.setAttribute(
        'title',
        'Usuwa wyniki szukania, czysci wszystkie pola i przywraca pelny widok skrzynki.',
      );
      clear.addEventListener('click', () => {
        // Fala 16g: Wyczysc kasuje tez pola szukajki (zgloszenie pkt 11)
        // - wyniki znikaly, ale frazy zostawaly w polach i mylily.
        for (const key of ['osoba', 'temat', 'tresc', 'odDaty', 'doDaty']) searchDraft[key] = '';
        for (const el of [sOsoba, sTemat, sTresc, sOd, sDo]) (el as HTMLInputElement).value = '';
        handlers.onClearSearch(state.activeBox);
      });
      banner.appendChild(clear);
      scroll.appendChild(banner);
    }

    const view = state.boxes[state.activeBox];
    if (!view) {
      scroll.appendChild(dim('Skrzynka nie zaladowana - kliknij jej nazwe, aby ja pobrac.'));
      return pane;
    }
    if (view.empty !== null) {
      scroll.appendChild(dim(view.empty === 'puste' ? 'Skrzynka jest pusta.' : 'Brak pasujacych listow.'));
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
      makeClickable(row, () => handlers.onOpenLetter(state.activeBox, e));
      scroll.appendChild(row);
    }
    if (searchMode) {
      // Wyniki szukania sa renumerowane wewnatrz selekcji - paginacja
      // wstecz nie ma tu sensu (kotwica liczona z pelnego listingu).
    } else if (view.truncated && !state.loadAll) {
      // Fala 11e: na dole tylko Wczytaj starsze; zbiorcze Wczytaj
      // wszystkie/Przerwij siedzi na pasku nad lista. Petla na innej
      // skrzynce chowa paginacje (blokada sesji).
      const btn = doc.createElement('button');
      btn.className = 'arkmail-older popup-btn popup-btn--control';
      btn.textContent = 'Wczytaj starsze';
      btn.addEventListener('click', () => handlers.onLoadOlder(state.activeBox));
      scroll.appendChild(btn);
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
    const heading = doc.createElement('div');
    heading.className = 'arkmail-letter-heading';
    head.appendChild(heading);
    if (state.wide) {
      // W podziale lista jest zawsze widoczna po lewej - zamiast przycisku
      // powrotu ("Zamknij list") jest Zamknij czyszczace podglad.
      const close = doc.createElement('button');
      close.className = 'arkmail-letter-close popup-btn popup-btn--control';
      close.textContent = 'Zamknij';
      close.addEventListener('click', () => handlers.onCloseLetter());
      head.appendChild(close);
    }
    const subj = doc.createElement('div');
    subj.className = 'arkmail-letter-subject';
    subj.textContent = l.subject;
    heading.appendChild(subj);
    const meta = doc.createElement('div');
    meta.className = 'arkmail-letter-meta';
    // Fala 9e: czytelne pary pole-wartosc; serwerowy numer listu nic
    // nie mowi graczowi (kontekstowy), puste "Do" pomijamy (list na DW).
    const parts = [`Od: ${l.from}`];
    if (l.to) parts.push(`Do: ${l.to}`);
    if (l.cc) parts.push(`DW: ${l.cc}`);
    if (l.date) parts.push(l.date);
    meta.textContent = parts.join(' | ');
    heading.appendChild(meta);
    pane.appendChild(head);
    const body = doc.createElement('div');
    body.className = 'arkmail-letter-body';
    body.textContent = l.body.join('\n');
    pane.appendChild(body);

    // Operacje pagerowe: kasowanie i przekazanie (sesje w index.ts).
    // Wymagaja wpisu-zrodla (re-kotwiczenie numeru); bez zrodla wylaczone.
    const ops = doc.createElement('div');
    ops.className = 'arkmail-letter-ops arkmail-action-row';
    const replies = doc.createElement('div');
    replies.className = 'arkmail-action-group arkmail-letter-replies';
    ops.appendChild(replies);
    const forward = doc.createElement('div');
    forward.className = 'arkmail-action-group arkmail-letter-forward';
    ops.appendChild(forward);
    const danger = doc.createElement('div');
    danger.className = 'arkmail-action-group arkmail-letter-danger';
    ops.appendChild(danger);
    const source = l.source;
    // Fala 15a: Odpowiedz / Odpowiedz wszystkim - pierwsze w pasku.
    // Zwykla odpowiedz zachowuje stary, jednoadresowy kontrakt.
    // Pelny rekord daje lokalny prefill; stary rekord Archiwum przechodzi
    // przez integracje, ktora moze najpierw odzyskac pelne naglowki.
    const replyTo = (all: boolean): void => {
      const received = l.box === 'odebrane' || l.box === 'nieprzeczytane';
      if (all) {
        if (l.archiveId && handlers.onReplyAllArchive) {
          const before = { ...composeDraft };
          handlers.onReplyAllArchive(l.archiveId, (prefill) => {
            if (
              composeDraft.adresat !== before.adresat ||
              composeDraft.temat !== before.temat ||
              composeDraft.dw !== before.dw ||
              composeDraft.tresc !== before.tresc
            ) {
              return false;
            }
            composeDraft.adresat = prefill.adresat;
            composeDraft.dw = prefill.dw;
            composeDraft.temat = '';
            composeDraft.tresc = '';
            store.setTab('napisz');
            return true;
          });
          return;
        }
        const prefill = buildReplyAllPrefill(
          l,
          store.state.characterName,
          knownRecipientNames(store.state),
        );
        if (!prefill) {
          handlers.onReplyAllEmpty?.();
          return;
        }
        composeDraft.adresat = prefill.adresat;
        composeDraft.dw = prefill.dw;
      } else {
        composeDraft.adresat = received ? l.from : l.to || l.cc || '';
        composeDraft.dw = '';
      }
      composeDraft.temat = '';
      composeDraft.tresc = '';
      store.setTab('napisz');
    };
    const reply = doc.createElement('button');
    reply.className = 'arkmail-reply popup-btn popup-btn--control';
    reply.textContent = 'Odpowiedz';
    reply.addEventListener('click', () => replyTo(false));
    replies.appendChild(reply);
    const replyAll = doc.createElement('button');
    replyAll.className = 'arkmail-reply-all popup-btn popup-btn--control';
    replyAll.textContent = 'Odpowiedz wszystkim';
    replyAll.addEventListener('click', () => replyTo(true));
    replies.appendChild(replyAll);
    // Fala 28c (decyzja 2026-10-22): Odpowiedz z cytowaniem. Adresat jak
    // przy zwyklym Odpowiedz (bez DW), temat = "Odp: <oryginalny temat>"
    // DOSLOWNIE - temat "--" to swiadomie wpisane "--", nie marker
    // pustego tematu (pusty temat jest niemozliwy: serwer go nie
    // przyjmuje, plugin blokuje twardo). Tresc: dwie puste linie, "---",
    // oryginalna tresc, "---". Przy liscie bez tresci przycisk
    // nieaktywny - nie ma czego cytowac.
    const replyQuote = doc.createElement('button');
    replyQuote.className = 'arkmail-reply-quote popup-btn popup-btn--control';
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
    replies.appendChild(replyQuote);
    const del = doc.createElement('button');
    del.className = 'arkmail-del popup-btn popup-btn--control popup-btn--danger popup-btn--ghost';
    del.textContent = 'Usun';
    if (source) {
      // Fala 14e: kasowanie z dwuklikowym potwierdzeniem (zgloszenie
      // 2026-10-19, pkt 7). 1.30.2 (Etap 5): wspolny guard - jawny
      // title przed uzbrojeniem, zeby rozbrojenie nie gubilo podpowiedzi.
      del.setAttribute('title', 'Usun ten list. Tej operacji nie mozna cofnac.');
      guardDeleteButton(del, () => handlers.onDeleteLetter(l.box, source), {
        armedLabel: 'Na pewno? Kliknij ponownie',
      });
    } else {
      del.setAttribute('disabled', '');
      del.setAttribute('title', 'Otworz list z zakladki Listy, aby go usunac.');
    }
    danger.appendChild(del);
    const fwdInput = doc.createElement('input');
    nativeFieldClass(fwdInput);
    fwdInput.setAttribute('data-field', 'forward');
    fwdInput.setAttribute('placeholder', 'Przekaz do (gracz lub alias)');
    if (!source) fwdInput.setAttribute('disabled', '');
    forward.appendChild(fwdInput);
    attachGhost(doc, fwdInput, personSource);
    const fwd = doc.createElement('button');
    fwd.className = 'arkmail-fwd popup-btn popup-btn--control';
    fwd.textContent = 'Przekaz';
    if (source) {
      fwd.addEventListener('click', () => {
        const adresat = fwdInput.value.trim();
        if (adresat) handlers.onForwardLetter(l.box, source, adresat);
      });
      submitOnEnter(fwdInput, () => fwd.click());
    } else {
      fwd.setAttribute('disabled', '');
      fwd.setAttribute('title', 'Otworz list z zakladki Listy, aby go przekazac.');
    }
    forward.appendChild(fwd);
    // Fala 17g: eksport listu do TXT (zgloszenie 2026-10-19/20 pkt 7).
    // Operacja lokalna (dane z cache widoku) - bez dwukliku. Na koncu
    // paska: pin kolejnosci rezerwuje poczatek dla Odpowiedz/Usun.
    const exp = doc.createElement('button');
    exp.className = 'arkmail-export-letter popup-btn popup-btn--control';
    exp.textContent = 'Zapisz list jako TXT';
    exp.addEventListener('click', () => handlers.onExportLetter?.());
    forward.appendChild(exp);
    pane.appendChild(ops);

    if (!state.wide) {
      const back = doc.createElement('button');
      back.className = 'arkmail-older popup-btn popup-btn--control';
      back.textContent = 'Zamknij list';
      back.addEventListener('click', () => handlers.onCloseLetter());
      pane.appendChild(back);
    }
    return pane;
  };

  /** Robocza tresc compose: poza store, przetrwa pelne rerendery
   *  (zmiana szablonu/szerokosci nie kasuje wpisanego listu). */
  const composeDraft = { adresat: '', temat: '', dw: '', tresc: '' };
  // Fala UI-2 krok 5: pisanie z ksiazki adresowej i grup. Precedens:
  // Odpowiedz/Przekaz - czysta operacja UI (zero komend do serwera):
  // prefill composeDraft + przejscie na zakladke Napisz. Temat, tresc
  // i DW zawsze puste (gracz pisze od zera).
  const writeTo = (adresat: string): void => {
    composeDraft.adresat = adresat;
    composeDraft.dw = '';
    composeDraft.temat = '';
    composeDraft.tresc = '';
    store.setTab('napisz');
  };
  // Rozwiniecie lokalnej grupy ma staly format "A, B, C". Zgodnie z
  // PROTOCOL.md serwer akceptuje przecinki i spacje jako separatory.
  // Spojnik " i " zostaje wylacznie dla parsowania listingow
  // (splitParty). Jedna osoba = samo imie. Pusta lista nie wystepuje -
  // przyciski sa wylaczone.
  const partyLabel = (names: readonly string[]): string => names.join(', ');

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
    btn.className = 'arkmail-preview-open popup-btn popup-btn--control';
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
    close.className = 'arkmail-preview-close popup-btn popup-btn--control';
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
      lab.htmlFor = `arkmail-compose-${field}`;
      pane.appendChild(lab);
      const input = doc.createElement('input');
      nativeFieldClass(input);
      input.id = `arkmail-compose-${field}`;
      input.setAttribute('data-field', field);
      input.value = composeDraft[field as 'adresat' | 'temat' | 'dw'];
      input.addEventListener('input', () => {
        composeDraft[field as 'adresat' | 'temat' | 'dw'] = input.value;
      });
      pane.appendChild(input);
      // Ghost (Fala 9g): adresat/DW -> kontakty+aliasy+grupy (tryb
      // segmentu po przecinku, Fala UI-2 krok 4), temat -> archiwum.
      if (field === 'temat') attachGhost(doc, input, subjectSource);
      else attachGhost(doc, input, adresatSource, { segment: true });
    }

    // Szablon ramki + szerokosc linii (trzymane w store, trwale).
    const settings = doc.createElement('div');
    settings.className = 'arkmail-compose-settings';
    const templateSetting = doc.createElement('div');
    templateSetting.className = 'arkmail-compose-setting';
    const widthSetting = doc.createElement('div');
    widthSetting.className = 'arkmail-compose-setting';
    settings.appendChild(templateSetting);
    settings.appendChild(widthSetting);
    pane.appendChild(settings);
    const labSz = doc.createElement('label');
    labSz.textContent = 'Szablon';
    labSz.htmlFor = 'arkmail-compose-szablon';
    templateSetting.appendChild(labSz);
    const sel = doc.createElement('select');
    nativeFieldClass(sel);
    sel.id = 'arkmail-compose-szablon';
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
    templateSetting.appendChild(sel);

    const labW = doc.createElement('label');
    labW.textContent = 'Szerokosc linii (20-120)';
    labW.htmlFor = 'arkmail-compose-szerokosc';
    widthSetting.appendChild(labW);
    const width = doc.createElement('input');
    nativeFieldClass(width);
    width.id = 'arkmail-compose-szerokosc';
    width.setAttribute('data-field', 'szerokosc');
    width.setAttribute('inputmode', 'numeric');
    width.setAttribute('aria-describedby', 'arkmail-compose-szerokosc-error');
    width.value = String(state.composeWidth);
    const widthError = doc.createElement('div');
    widthError.id = 'arkmail-compose-szerokosc-error';
    widthError.className = 'arkmail-dim arkmail-compose-width-error';
    widthError.setAttribute('data-compose-width-error', '');
    widthError.setAttribute('role', 'alert');
    width.addEventListener('change', () => {
      if (!/^\d+$/.test(width.value)) {
        width.setAttribute('aria-invalid', 'true');
        widthError.textContent = 'Podaj liczbe calkowita od 20 do 120.';
        return;
      }
      const parsed = Number(width.value);
      if (parsed < 20 || parsed > 120) {
        width.setAttribute('aria-invalid', 'true');
        widthError.textContent = 'Podaj liczbe calkowita od 20 do 120.';
        return;
      }
      width.removeAttribute('aria-invalid');
      widthError.textContent = '';
      store.setCompose({ width: clampLineWidth(parsed) });
    });
    widthSetting.appendChild(width);
    widthSetting.appendChild(widthError);

    const lab = doc.createElement('label');
    lab.textContent = 'Tresc';
    lab.htmlFor = 'arkmail-compose-tresc';
    pane.appendChild(lab);
    const tresc = doc.createElement('textarea');
    nativeFieldClass(tresc);
    tresc.id = 'arkmail-compose-tresc';
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

    const actions = doc.createElement('div');
    actions.className = 'arkmail-compose-actions arkmail-action-row';
    const send = doc.createElement('button');
    send.className = 'arkmail-send popup-btn popup-btn--control popup-btn--solid';
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
        sendTimer = setTimeout(disarmSend, ERROR_LABEL_MS);
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
    actions.appendChild(send);

    // Fala 14b: czyszczenie pol compose z dwuklikowym potwierdzeniem
    // (uzbrojenie wygasa po 3 s; wzorzec "Wyczysc zapisane dane").
    // Czysci pola LISTU (adresat/temat/dw/tresc) - szablon i szerokosc
    // to ustawienia, zostaja. Stan uzbrojenia lokalny - kazdy rerender
    // wraca do stanu poczatkowego.
    const clearCompose = doc.createElement('button');
    clearCompose.className = 'arkmail-compose-clear popup-btn popup-btn--control popup-btn--danger popup-btn--ghost';
    clearCompose.textContent = 'Wyczysc pola listu';
    // 1.30.2 (Etap 5): wspolny guard (jak "Wyczysc zapisane dane").
    clearCompose.setAttribute('title', 'Czysci pola listu: adresat, temat, DW i tresc.');
    guardDeleteButton(clearCompose, () => {
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
    }, {
      armedLabel: 'Na pewno? Kliknij ponownie',
      armedTitle: 'Kliknij ponownie, aby wyczyscic pola listu.',
    });
    actions.appendChild(clearCompose);
    pane.appendChild(actions);
    return pane;
  };

  /**
   * Podpanel Grupy (Fala UI-2 krok 3): pelny CRUD grup recznych.
   * Grupa skladana z bazy osob (kontakty + importy); nazwa unikalna
   * bez wzgledu na wielkosc liter. Usuwanie uzbrojone - pierwszy
   * klik uzbraja, drugi kasuje (przelaczenie sub-pigulki rozbraja,
   * bo render buduje przyciski od nowa).
   */
  const renderGrupy = (state: MailUiState, pane: HTMLElement): void => {
    const error = doc.createElement('div');
    error.className = 'arkmail-dim arkmail-group-error';
    error.setAttribute('data-group-error', '');
    const showError = (msg: string): void => {
      error.textContent = msg;
    };
    const save = (groups: ContactGroup[]): void => {
      showError('');
      handlers.onSaveGroups?.(groups);
    };
    // Nazwa niepusta i unikalna (poza opcjonalnie ignorowana grupa
    // przy zmianie nazwy) - bez wzgledu na wielkosc liter.
    const nameTaken = (name: string, ignore?: string): boolean =>
      state.groups.some(
        (g) => g.name !== ignore && g.name.toLowerCase() === name.toLowerCase(),
      );

    // Zgloszenie 2026-11-05 pkt 5: reczne tworzenie grupy mieszka
    // w Grupach (ponizej komunikatu bledu); ta pigulka to lista grup
    // i ich czlonkow.
    pane.appendChild(error);

    // --- tworzenie grupy
    const groupAddRow = doc.createElement('div');
    groupAddRow.className = 'arkmail-group-add arkmail-field-action';
    const groupAddInput = doc.createElement('input');
    nativeFieldClass(groupAddInput);
    groupAddInput.setAttribute('data-group-add', '');
    groupAddInput.setAttribute('placeholder', 'Nazwa nowej grupy');
    const groupAddBtn = doc.createElement('button');
    groupAddBtn.className = 'popup-btn popup-btn--control';
    groupAddBtn.textContent = 'Utworz grupe';
    groupAddBtn.setAttribute('data-group-create', '');
    groupAddBtn.setAttribute('title', 'Tworzy pusta grupe. Czlonkow dolaczysz po utworzeniu.');
    groupAddBtn.addEventListener('click', () => {
      const name = groupAddInput.value.trim();
      if (!name) {
        showError('Podaj nazwe grupy.');
        return;
      }
      if (state.groups.some((g) => g.name.toLowerCase() === name.toLowerCase())) {
        showError(`Grupa "${name}" juz istnieje.`);
        return;
      }
      if (groupAliasConflict(name, state.importedAliases)) {
        showError(`Nazwa grupy "${name}" koliduje z aliasem pocztowym z gry. Wybierz inna nazwe.`);
        return;
      }
      groupAddInput.value = '';
      handlers.onSaveGroups?.([...state.groups, { name, members: [] }]);
    });
    submitOnEnter(groupAddInput, () => groupAddBtn.click());
    groupAddRow.appendChild(groupAddInput);
    groupAddRow.appendChild(groupAddBtn);
    pane.appendChild(groupAddRow);

    // --- filtr nazw grup z przyciskiem czyszczenia
    // Zgloszenie 2026-11-05. Repaint dotyka tylko listy - pole filtra
    // zachowuje fokus i wpisana wartosc.
    const filterRow = doc.createElement('div');
    filterRow.className = 'arkmail-group-filter arkmail-field-action';
    const filterInput = doc.createElement('input');
    nativeFieldClass(filterInput);
    filterInput.setAttribute('data-group-filter', '');
    filterInput.setAttribute('placeholder', 'Filtruj grupy');
    filterInput.setAttribute('title', 'Pokazuje tylko grupy z nazwa zawierajaca wpisany fragment.');
    filterInput.value = groupFilter;
    const filterClear = doc.createElement('button');
    filterClear.className = filterClearClass();
    filterClear.textContent = 'Wyczysc filtr';
    filterClear.setAttribute('data-group-filter-clear', '');
    filterClear.setAttribute('title', 'Czysci filtr grup i pokazuje wszystkie grupy.');
    if (!groupFilter) filterClear.setAttribute('disabled', '1');
    filterClear.addEventListener('click', () => {
      groupFilter = '';
      filterInput.value = '';
      filterClear.setAttribute('disabled', '1');
      paintGroups();
    });
    filterInput.addEventListener('input', () => {
      groupFilter = filterInput.value;
      if (groupFilter) filterClear.removeAttribute('disabled');
      else filterClear.setAttribute('disabled', '1');
      paintGroups();
    });
    filterRow.appendChild(filterInput);
    filterRow.appendChild(filterClear);
    // Zgloszenie 2026-11-05 (K8): filtr grup z podpowiedziami nazw grup.
    attachGhost(doc, filterInput, groupNameSource);
    pane.appendChild(filterRow);

    // --- lista grup
    // Zgloszenie 2026-11-05 (Etap 8): lista scrolluje sie wlasnym
    // kontenerem (jak w Ksiazce) - naglowek sekcji stoi na stale.
    const list = doc.createElement('div');
    const groupScroll = doc.createElement('div');
    groupScroll.className = 'arkmail-list-scroll';
    groupScroll.setAttribute('data-pane-key', 'kontakty:grupy');
    groupScroll.appendChild(list);
    pane.appendChild(groupScroll);
    const paintGroups = (): void => {
      const needle = groupFilter.trim().toLowerCase();
      const shown = needle
        ? state.groups.filter((g) => g.name.toLowerCase().includes(needle))
        : state.groups;
      list.replaceChildren();
      for (const group of shown) {
      const row = doc.createElement('div');
      row.className = 'arkmail-group';

      // Zgloszenie 2026-11-05 (D3): naglowek grupy - znak stanu ASCII
      // (">" zwiniety, "v" rozwiniety) + nazwa + liczba czlonkow.
      // Klik rozwija/zwija; domyslnie zwiniete - lista grup jest
      // czytelna bez otwartych formularzy.
      const expanded = expandedGroups.has(group.name);
      const toggle = doc.createElement('button');
      toggle.className = 'arkmail-group-toggle popup-btn popup-btn--control popup-btn--sm';
      toggle.setAttribute('data-group-toggle', '');
      toggle.textContent = `${expanded ? 'v' : '>'} ${group.name} (${group.members.length})`;
      toggle.setAttribute(
        'title',
        expanded
          ? 'Zwija grupe.'
          : 'Rozwija grupe: edycja nazwy, czlonkowie, pisanie do grupy.',
      );
      toggle.addEventListener('click', () => {
        if (expandedGroups.has(group.name)) expandedGroups.delete(group.name);
        else expandedGroups.add(group.name);
        store.refresh();
      });
      const groupHeader = doc.createElement('div');
      groupHeader.className = 'arkmail-group-header';
      groupHeader.appendChild(toggle);
      row.appendChild(groupHeader);

      if (groupAliasConflict(group.name, state.importedAliases)) {
        const warning = doc.createElement('div');
        warning.className = 'arkmail-dim arkmail-group-alias-conflict';
        warning.textContent = 'Nazwa koliduje z aliasem pocztowym. Grupa nie jest rozwijana w podpowiedziach. Zmien nazwe albo usun grupe.';
        row.appendChild(warning);
      }

      if (expanded) {
      const body = doc.createElement('div');
      body.className = 'arkmail-group-body';
      row.appendChild(body);
      const head = doc.createElement('div');
      head.className = 'arkmail-group-head arkmail-group-rename arkmail-field-action';
      const groupActions = doc.createElement('div');
      groupActions.className = 'arkmail-group-actions arkmail-action-row';
      const rename = doc.createElement('input');
      nativeFieldClass(rename);
      rename.setAttribute('data-group-rename', group.name);
      rename.value = group.name;
      rename.setAttribute('title', 'Nazwa grupy - zapisz obok.');
      const renameOk = doc.createElement('button');
      renameOk.className = 'popup-btn popup-btn--control';
      renameOk.textContent = 'Zapisz nazwe';
      renameOk.setAttribute('data-group-rename-ok', '');
      renameOk.setAttribute('title', 'Zapisuje nowa nazwe grupy.');
      renameOk.addEventListener('click', () => {
        const name = rename.value.trim();
        if (!name) {
          showError('Podaj nazwe grupy.');
          return;
        }
        if (nameTaken(name, group.name)) {
          showError(`Grupa "${name}" juz istnieje.`);
          return;
        }
        if (groupAliasConflict(name, state.importedAliases)) {
          showError(`Nazwa grupy "${name}" koliduje z aliasem pocztowym z gry. Wybierz inna nazwe.`);
          return;
        }
        if (expandedGroups.has(group.name)) {
          expandedGroups.delete(group.name);
          expandedGroups.add(name);
        }
        save(state.groups.map((g) => (g.name === group.name ? { ...g, name } : g)));
      });
      submitOnEnter(rename, () => renameOk.click());
      // Zgloszenie 2026-11-05: poziom danger + wspolny guard dwukliku.
      const del = doc.createElement('button');
      del.className = 'popup-btn popup-btn--control popup-btn--danger popup-btn--ghost';
      del.textContent = 'Usun grupe';
      del.setAttribute('data-group-delete', '');
      del.setAttribute('title', 'Dwuklik: pierwszy klik pyta o potwierdzenie, drugi kasuje grupe.');
      guardDeleteButton(
        del,
        () => save(state.groups.filter((g) => g.name !== group.name)),
        { armedLabel: 'Na pewno usunac?' },
      );
      head.appendChild(rename);
      head.appendChild(renameOk);
      groupActions.appendChild(del);
      // Fala UI-2 krok 5: pisanie do calej grupy jednym klikiem.
      // Pusta grupa = brak adresatow - przycisk wylaczony.
      const write = doc.createElement('button');
      write.className = 'popup-btn popup-btn--control';
      write.textContent = 'Napisz do grupy';
      write.setAttribute('data-group-write', '');
      if (group.members.length === 0) {
        write.setAttribute('disabled', '1');
        write.setAttribute('title', 'Pusta grupa - najpierw dodaj czlonkow.');
      } else {
        write.setAttribute('title', 'Otwiera zakladke Napisz list z czlonkami grupy jako adresatami.');
        write.addEventListener('click', () => writeTo(partyLabel(group.members)));
      }
      groupActions.appendChild(write);
      body.appendChild(head);
      body.appendChild(groupActions);

      const members = doc.createElement('div');
      members.className = 'arkmail-group-members';
      for (const member of group.members) {
        const chip = doc.createElement('span');
        chip.className = 'arkmail-group-member';
        chip.textContent = member;
        // Zgloszenie 2026-11-05: X czlonka to klawisz usuwajacy -
        // poziom danger i guard dwukliku (pierwszy klik uzbraja).
        const x = doc.createElement('button');
        x.className = 'popup-btn popup-btn--control popup-btn--danger popup-btn--ghost popup-btn--sm popup-btn--icon';
        x.textContent = 'x';
        x.setAttribute('data-member-remove', '');
        x.setAttribute('title', `Usuwa ${member} z grupy.`);
        guardDeleteButton(
          x,
          () =>
            save(
              state.groups.map((g) =>
                g.name === group.name
                  ? { ...g, members: g.members.filter((m) => m !== member) }
                  : g,
              ),
            ),
          { armedTitle: `Kliknij ponownie, aby usunac ${member} z grupy.` },
        );
        chip.appendChild(x);
        members.appendChild(chip);
      }
      body.appendChild(members);
      // Dokladanie czlonka z bazy osob (ghost: strzalka w prawo
      // wpisuje kanoniczna forme z kontaktow i importow).
      const addMemberRow = doc.createElement('div');
      addMemberRow.className = 'arkmail-group-member-add arkmail-field-action';
      const addMember = doc.createElement('input');
      nativeFieldClass(addMember);
      addMember.setAttribute('data-member-add', group.name);
      addMember.setAttribute('placeholder', 'Dodaj osobe');
      const addMemberOk = doc.createElement('button');
      addMemberOk.className = 'popup-btn popup-btn--control';
      addMemberOk.textContent = 'Dodaj';
      addMemberOk.setAttribute('data-member-add-ok', '');
      addMemberOk.setAttribute('title', 'Dodaje osobe do grupy (podpowiedz: strzalka w prawo).');
      addMemberOk.addEventListener('click', () => {
        const name = addMember.value.trim();
        if (!name) return;
        if (!isValidPersonName(name)) {
          showError('Imie: tylko litery.');
          return;
        }
        if (group.members.some((m) => m.toLowerCase() === name.toLowerCase())) {
          showError(`${name} juz jest w tej grupie.`);
          return;
        }
        const error = handlers.onAddGroupMember?.(group.name, name);
        if (error) showError(error);
      });
      submitOnEnter(addMember, () => addMemberOk.click());
      // 1.30.2 (Etap 2): attachGhost dopiero po podpieciu inputu do
      // rodzica - wrap liczy na parentNode (jak w Ksiazce, bookAddRow).
      addMemberRow.appendChild(addMember);
      attachGhost(doc, addMember, personSource);
      addMemberRow.appendChild(addMemberOk);
      body.appendChild(addMemberRow);
      }
      list.appendChild(row);
      }
      if (shown.length === 0 && state.groups.length > 0) {
        const empty = doc.createElement('div');
        empty.className = 'arkmail-dim';
        empty.textContent = 'Brak grup pasujacych do filtra.';
        list.appendChild(empty);
      }
      if (state.groups.length === 0) {
        const empty = doc.createElement('div');
        empty.className = 'arkmail-dim';
        empty.textContent = 'Brak grup - utworz pierwsza grupe.';
        list.appendChild(empty);
      }
    };
    paintGroups();

    // --- operacje zbiorcze + eksport/import ksiazki adresowej
    const ops = doc.createElement('div');
    ops.className = 'arkmail-box-ops arkmail-destructive-zone';
    const delAll = doc.createElement('button');
    delAll.className = 'popup-btn popup-btn--control popup-btn--danger popup-btn--ghost';
    delAll.textContent = 'Usun wszystkie grupy';
    delAll.setAttribute('data-groups-delete-all', '');
    delAll.setAttribute('title', 'Dwuklik: pierwszy klik pyta o potwierdzenie, drugi kasuje wszystkie grupy.');
    if (state.groups.length === 0) delAll.setAttribute('disabled', '1');
    guardDeleteButton(delAll, () => save([]), {
      armedLabel: 'Na pewno usunac wszystkie?',
    });
    // Eksport/import ksiazki przeniesiony do pigulki Import i eksport
    // (zgloszenie 2026-11-05): operacja dotyka calej ksiazki, nie grup.
    ops.appendChild(delAll);
    pane.appendChild(ops);
    fillButtonTitles(pane);
  };

  const renderKsiazka = (state: MailUiState, pane: HTMLElement): void => {
    // Reset zaznaczenia przy kazdej zmianie listy imion (import z gry,
    // import pliku, dodanie, usuniecie): setPeople zawsze daje nowa
    // tablice, wiec porownanie referencji zeruje zaznaczenie zawsze
    // gdy dane sie zmienily, i tylko wtedy.
    if (bookPeopleRef !== state.people) {
      bookPeopleRef = state.people;
      bookSelection.clear();
    }
    const save = (people: string[]): void => handlers.onSavePeople?.(people);

    // Zgloszenie 2026-11-05 pkt 4: reczne dodawanie imion mieszka w
    // Ksiazce (ponizej klawiszy zbiorczych); import z gry i eksport
    // zostaly w pigulce Import i eksport. Ta pigulka to lista imion
    // z operacjami zbiorczymi i filtrem.

    const selectionActions = doc.createElement('div');
    selectionActions.className = 'arkmail-book-selection-actions arkmail-action-row';
    pane.appendChild(selectionActions);
    const checkedActions = doc.createElement('div');
    checkedActions.className = 'arkmail-book-checked-actions arkmail-action-row';
    pane.appendChild(checkedActions);

    // --- usuwanie zaznaczonych (uzbrojony dwuklik, jak w Grupy)
    // Zgloszenie 2026-11-05: poziom danger - kazde usuwanie danych
    // dzieli jedna kolorystyke w calym UI.
    const bulk = doc.createElement('button');
    bulk.className = 'popup-btn popup-btn--control popup-btn--danger popup-btn--ghost';
    bulk.textContent = 'Usun zaznaczone imiona';
    bulk.setAttribute('data-book-delete-checked', '');
    bulk.setAttribute(
      'title',
      'Dwuklik: pierwszy klik pyta o potwierdzenie, drugi kasuje zaznaczone imiona.',
    );
    if (bookSelection.size === 0) bulk.setAttribute('disabled', '1');
    guardDeleteButton(
      bulk,
      () => save(state.people.filter((p) => !bookSelection.has(p))),
      { armedLabel: `Na pewno usunac zaznaczone (${bookSelection.size})?` },
    );
    checkedActions.appendChild(bulk);

    // --- lista imion A-Z (bez wielkosci liter, stabilnie)
    const sorted = [...state.people].sort((a, b) => {
      const la = a.toLowerCase();
      const lb = b.toLowerCase();
      if (la === lb) return 0;
      return la < lb ? -1 : 1;
    });
    // Zgloszenie 2026-11-05: filtr listy imion (podlancuch bez
    // wielkosci liter). Zaznacz/odznacz wszystkie operuje na widocznej
    // (przefiltrowanej) liscie - ukrytych imion nie zaznacza.
    const currentVisible = (): string[] => {
      const needle = bookFilter.trim().toLowerCase();
      return needle ? sorted.filter((p) => p.toLowerCase().includes(needle)) : sorted;
    };
    const visible = currentVisible();
    // Fala UI-2 krok 5: zbiorcze pisanie do zaznaczonych. Kolejnosc
    // adresatow = kolejnosc listy A-Z; po uzyciu zaznaczenie kasuje
    // sie (jak po kazdej zmianie listy - powrot nie trzyma stanu).
    const writeBulk = doc.createElement('button');
    writeBulk.className = 'popup-btn popup-btn--control';
    writeBulk.textContent = `Napisz list do zaznaczonych (${bookSelection.size})`;
    writeBulk.setAttribute('data-book-write-checked', '');
    writeBulk.setAttribute(
      'title',
      'Otwiera zakladke Napisz list z zaznaczonymi osobami jako adresatami.',
    );
    if (bookSelection.size === 0) writeBulk.setAttribute('disabled', '1');
    writeBulk.addEventListener('click', () => {
      if (bookSelection.size === 0) return;
      const party = partyLabel(sorted.filter((p) => bookSelection.has(p)));
      bookSelection.clear();
      writeTo(party);
    });
    checkedActions.appendChild(writeBulk);
    // Zgloszenie 2026-11-05 pkt 1: zaznaczanie zbiorcze jednym klikiem
    // (precedens: zakladka Usuwanie). Zaznacz wszystkie = cala lista
    // A-Z; odznacz wszystkie czysci zaznaczenie. Niedestrukcyjne -
    // poziom action.
    const selectAllBtn = doc.createElement('button');
    selectAllBtn.className = 'popup-btn popup-btn--control';
    selectAllBtn.textContent = 'Zaznacz wszystkie';
    selectAllBtn.setAttribute('data-book-select-all', '');
    selectAllBtn.setAttribute('title', 'Zaznacza wszystkie imiona na liscie.');
    if (visible.length === 0) selectAllBtn.setAttribute('disabled', '1');
    selectAllBtn.addEventListener('click', () => {
      for (const p of visible) bookSelection.add(p);
      store.refresh();
    });
    selectionActions.appendChild(selectAllBtn);
    const deselectAllBtn = doc.createElement('button');
    deselectAllBtn.className = 'popup-btn popup-btn--control';
    deselectAllBtn.textContent = 'Odznacz wszystkie';
    deselectAllBtn.setAttribute('data-book-deselect-all', '');
    deselectAllBtn.setAttribute('title', 'Czysci zaznaczenie imion.');
    if (visible.length === 0) deselectAllBtn.setAttribute('disabled', '1');
    deselectAllBtn.addEventListener('click', () => {
      bookSelection.clear();
      store.refresh();
    });
    selectionActions.appendChild(deselectAllBtn);

    // --- reczne dodawanie imienia (zgloszenie 2026-11-05 pkt 4:
    // mieszka w Ksiazce, nie w Import i eksport). Pole z ghost-
    // podpowiedziami (jak pole adresata): kontakty + aliasy,
    // strzalka w prawo wpisuje kanoniczna forme kandydata.
    // --- dodawanie imienia do ksiazki
    const bookAddRow = doc.createElement('div');
    bookAddRow.className = 'arkmail-book-add arkmail-field-action';
    const addInput = doc.createElement('input');
    nativeFieldClass(addInput);
    addInput.setAttribute('data-book-new', '');
    addInput.setAttribute('placeholder', 'Imie nowej osoby');
    const addBtn = doc.createElement('button');
    addBtn.className = 'popup-btn popup-btn--control';
    addBtn.textContent = 'Dodaj';
    addBtn.setAttribute('data-book-add', '');
    addBtn.setAttribute('title', 'Dodaje imie do ksiazki adresowej.');
    const addErr = doc.createElement('span');
    addErr.className = 'arkmail-group-error';
    const showAddError = (msg: string): void => {
      addErr.textContent = msg;
      addErr.setAttribute('data-book-error', '');
    };
    const clearAddError = (): void => {
      addErr.textContent = '';
      addErr.removeAttribute('data-book-error');
    };
    const tryAdd = (): void => {
      const name = addInput.value.trim();
      if (!name) {
        showAddError('Podaj imie.');
        return;
      }
      if (!isValidPersonName(name)) {
        showAddError('Imie: tylko litery.');
        return;
      }
      if (state.people.some((p) => p.toLowerCase() === name.toLowerCase())) {
        showAddError('To imie juz jest w ksiazce.');
        return;
      }
      clearAddError();
      addInput.value = '';
      // Dopisanie na koniec; deduplikacje robi savePeople w index.ts.
      handlers.onSavePeople?.([...state.people, name]);
    };
    addBtn.addEventListener('click', tryAdd);
    addInput.addEventListener('keydown', (ev) => {
      if ((ev as KeyboardEvent).key === 'Enter') tryAdd();
    });
    bookAddRow.appendChild(addInput);
    bookAddRow.appendChild(addBtn);
    bookAddRow.appendChild(addErr);
    // Pole nowej osoby z ghost-podpowiedziami (jak pole adresata):
    // kontakty + aliasy, strzalka w prawo wpisuje kanoniczna forme
    // kandydata. Attach dopiero po podpieciu inputu do rodzica - ghost
    // wrapuje element w miejscu w drzewie.
    attachGhost(doc, addInput, personSource);
    pane.appendChild(bookAddRow);

    // --- filtr listy imion z przyciskiem czyszczenia
    // Zgloszenie 2026-11-05. Filtr jest czescia .arkmail-list-scroll:
    // repaint listy nie odbiera mu fokusu ani wpisanej wartosci.
    const filterRow = doc.createElement('div');
    filterRow.className = 'arkmail-book-filter arkmail-field-action';
    const filterInput = doc.createElement('input');
    nativeFieldClass(filterInput);
    filterInput.setAttribute('data-book-filter', '');
    filterInput.setAttribute('placeholder', 'Filtruj imiona');
    filterInput.setAttribute('title', 'Pokazuje tylko imiona zawierajace wpisany fragment.');
    filterInput.value = bookFilter;
    const filterClear = doc.createElement('button');
    filterClear.className = filterClearClass();
    filterClear.textContent = 'Wyczysc filtr';
    filterClear.setAttribute('data-book-filter-clear', '');
    filterClear.setAttribute('title', 'Czysci filtr imion i pokazuje cala ksiazke adresowa.');
    if (!bookFilter) filterClear.setAttribute('disabled', '1');
    filterClear.addEventListener('click', () => {
      bookFilter = '';
      filterInput.value = '';
      filterClear.setAttribute('disabled', '1');
      paintList();
    });
    filterInput.addEventListener('input', () => {
      bookFilter = filterInput.value;
      if (bookFilter) filterClear.removeAttribute('disabled');
      else filterClear.setAttribute('disabled', '1');
      paintList();
    });
    filterRow.appendChild(filterInput);
    filterRow.appendChild(filterClear);
    // Zgloszenie 2026-11-05 (K8): filtr imion z podpowiedziami osob
    // i aliasow (jak pole Osoba w Archiwum).
    attachGhost(doc, filterInput, personSource);

    // Kontener scrollujacy (D9): filtr i lista imion; naglowek (sub-
    // pigulki, klawisze zbiorcze) zostaje na stale. Klucz migawki
    // scrolla jak w zakladce Listy - pozycja przetrwa rerender.
    const scroll = doc.createElement('div');
    scroll.className = 'arkmail-list-scroll';
    scroll.setAttribute('data-pane-key', 'kontakty:ksiazka');
    scroll.appendChild(filterRow);
    const listWrap = doc.createElement('div');
    const paintList = (): void => {
      const shown = currentVisible();
      listWrap.replaceChildren();
      // Zgloszenie 2026-11-05 (K3): total ksiazki nad lista; przy
      // aktywnym filtrze dopisuje liczbe widocznych pozycji.
      const count = doc.createElement('div');
      count.className = 'arkmail-dim';
      count.setAttribute('data-book-count', '');
      const lastTwo = sorted.length % 100;
      const last = sorted.length % 10;
      const noun =
        sorted.length === 1
          ? 'imie'
          : last >= 2 && last <= 4 && (lastTwo < 12 || lastTwo > 14)
            ? 'imiona'
            : 'imion';
      count.textContent =
        `Ksiazka: ${sorted.length} ${noun}` +
        (bookFilter.trim() ? ` (widoczne: ${shown.length})` : '');
      listWrap.appendChild(count);
      if (sorted.length === 0) {
        listWrap.appendChild(
          dim('Ksiazka adresowa jest pusta - zaimportuj osoby z gry albo dodaj recznie.'),
        );
        return;
      }
      if (shown.length === 0) {
        listWrap.appendChild(dim('Brak imion pasujacych do filtra.'));
        return;
      }
      for (const name of shown) {
        const row = doc.createElement('div');
      row.className = 'arkmail-book-row';
      row.setAttribute('data-book-row', '');
      const check = doc.createElement('input');
      check.setAttribute('type', 'checkbox');
      // Etap 10: klucz fokusu - zaznaczenie wraca po repaint.
      check.setAttribute('data-book-check', name);
      check.checked = bookSelection.has(name);
      check.addEventListener('change', () => {
        if (check.checked) bookSelection.add(name);
        else bookSelection.delete(name);
        // Pelny repaint odswieza stan przycisku zbiorczego; zaznaczenie
        // zyje w stanie modulowym, wiec przetrwa repaint.
        store.refresh();
      });
      const nameEl = doc.createElement('span');
      nameEl.className = 'arkmail-book-name';
      nameEl.setAttribute('data-book-name', '');
      nameEl.textContent = name;
      // Zgloszenie 2026-11-05: X jest klawiszem usuwajacym - poziom
      // danger (wyraznie widac, ze kasuje) i guard dwukliku: pierwszy
      // klik uzbraja (czerwone tlo przez regule [data-armed]), drugi
      // kasuje. Bez guarda jeden przypadkowy klik niszczyl ksiazke.
      const remove = doc.createElement('button');
      remove.className = 'arkmail-book-remove popup-btn popup-btn--control popup-btn--danger popup-btn--ghost popup-btn--sm popup-btn--icon';
      remove.setAttribute('data-book-remove', '');
      remove.textContent = 'x';
      remove.setAttribute('title', `Usuwa ${name} z ksiazki adresowej.`);
      guardDeleteButton(remove, () => save(state.people.filter((p) => p !== name)), {
        armedTitle: `Kliknij ponownie, aby usunac ${name} z ksiazki adresowej.`,
      });
      row.appendChild(check);
      row.appendChild(nameEl);
      row.appendChild(remove);
      // Fala UI-2 krok 5: pisanie bez przepisywania - prefill adresata.
      const write = doc.createElement('button');
      write.className = 'arkmail-book-write popup-btn popup-btn--control';
      write.setAttribute('data-book-write', '');
      write.textContent = 'Napisz';
      write.setAttribute('title', `Otwiera zakladke Napisz list z adresem: ${name}.`);
      write.addEventListener('click', () => writeTo(name));
      row.appendChild(write);
      listWrap.appendChild(row);
    }
    };
    paintList();
    scroll.appendChild(listWrap);
    pane.appendChild(scroll);

    // --- aliasy pocztowe: lustro z gry przeniesione do pigulki
    // "Aliasy pocztowe" (zgloszenie 2026-11-05).
    fillButtonTitles(pane);
  };

  const renderKontakty = (state: MailUiState): HTMLElement => {
    const pane = doc.createElement('div');
    pane.className = 'arkmail-pane arkmail-listy';
    pane.setAttribute('data-pane-key', 'kontakty');
    const subRow = doc.createElement('div');
    subRow.className = 'arkmail-boxes';
    subRow.setAttribute('role', 'tablist');
    subRow.setAttribute('aria-label', 'Kontakty');
    const SUBPILLS: Array<[typeof contactView.sub, string]> = [
      ['ksiazka', 'Ksiazka adresowa'],
      ['aliasy', 'Aliasy pocztowe'],
      ['grupy', 'Grupy'],
      ['importeksport', 'Import i eksport'],
    ];
    const subPanel = doc.createElement('div');
    subPanel.className =
      contactView.sub === 'ksiazka' || contactView.sub === 'grupy'
        ? 'arkmail-contact-subpanel arkmail-listy'
        : 'arkmail-contact-subpanel arkmail-contact-subpanel-scroll';
    subPanel.id = `arkmail-contact-panel-${contactView.sub}`;
    subPanel.setAttribute('role', 'tabpanel');
    subPanel.setAttribute('aria-labelledby', `arkmail-contact-tab-${contactView.sub}`);
    const buttons: HTMLButtonElement[] = [];
    for (const [sub, label] of SUBPILLS) {
      const pill = doc.createElement('button');
      pill.className =
        'arkmail-subpill dialog-tab' + (contactView.sub === sub ? ' is-active' : '');
      pill.id = `arkmail-contact-tab-${sub}`;
      pill.setAttribute('data-contact-tab', sub);
      pill.setAttribute('role', 'tab');
      pill.setAttribute('aria-selected', contactView.sub === sub ? 'true' : 'false');
      pill.setAttribute('aria-controls', `arkmail-contact-panel-${sub}`);
      pill.tabIndex = contactView.sub === sub ? 0 : -1;
      pill.textContent = label;
      pill.addEventListener('click', () => {
        contactView.sub = sub;
        store.refresh();
      });
      subRow.appendChild(pill);
      buttons.push(pill);
    }
    wireTabKeyboard(subRow, buttons, (index) => {
      const sub = SUBPILLS[index]![0];
      contactView.sub = sub;
      store.refresh();
      (root.querySelector(`[data-contact-tab="${sub}"]`) as HTMLButtonElement | null)?.focus();
    });
    pane.appendChild(subRow);
    pane.appendChild(subPanel);
    if (contactView.sub === 'grupy') {
      renderGrupy(state, subPanel);
      return pane;
    }
    if (contactView.sub === 'aliasy') {
      renderAliasy(state, subPanel);
      return pane;
    }
    if (contactView.sub === 'importeksport') {
      renderImportEksport(state, subPanel);
      return pane;
    }
    if (contactView.sub === 'ksiazka') {
      renderKsiazka(state, subPanel);
      return pane;
    }
    return pane;
  };

  /**
   * Sekcja "Aliasy pocztowe" (zgloszenie 2026-11-05): lustro aliasow
   * z gry wydzielone z ksiazki adresowej do wlasnej pigulki. Aliasy
   * nie sa edytowalne (rozstrzyga je serwer przy wysylce), ale lustro
   * lokalne da sie wyczyscic - po czyszczeniu aliasy pobiera sie z
   * gry ponownie. Czyszczenie pod guardem dwukliku, poziom danger.
   */
  const renderAliasy = (state: MailUiState, pane: HTMLElement): void => {
    const aliasSec = doc.createElement('div');
    aliasSec.className = 'arkmail-book-aliases';
    aliasSec.setAttribute('data-book-aliases', '');
    const aliasNote = doc.createElement('div');
    aliasNote.className = 'arkmail-dim';
    aliasNote.textContent =
      'Aliasy pocztowe z gry sa w ArkMailu tylko do odczytu. Sa zapisane lokalnie jako lustro, ale nie trafiaja do eksportu JSON. Aliasy edytujesz i usuwasz w grze.';
    aliasSec.appendChild(aliasNote);
    if (state.importedAliases.length === 0) {
      aliasSec.appendChild(dim('Brak zapisanych aliasow. Pobierz je z gry przyciskiem Importuj aliasy pocztowe.'));
    } else {
      for (const alias of state.importedAliases) {
        const row = doc.createElement('div');
        row.className = 'arkmail-book-alias';
        const text = doc.createElement('span');
        text.className = 'arkmail-book-alias-text';
        text.textContent = `${alias.name} -> ${alias.targets.join(', ')}`;
        row.appendChild(text);
        // Zgloszenie 2026-11-05: pisanie do aliasu jednym klikiem.
        // Serwer sam rozwija aliasy przy wysylce, wiec na linie idzie
        // sama nazwa aliasu (jak w polu adresata).
        const write = doc.createElement('button');
        write.className = 'arkmail-book-write popup-btn popup-btn--control';
        write.setAttribute('data-alias-write', '');
        write.textContent = 'Napisz';
        write.setAttribute('title', `Otwiera zakladke Napisz list z adresem: ${alias.name}.`);
        write.addEventListener('click', () => writeTo(alias.name));
        row.appendChild(write);
        aliasSec.appendChild(row);
      }
    }
    const importRow = doc.createElement('div');
    importRow.className = 'arkmail-alias-import arkmail-action-row';
    const importAliases = doc.createElement('button');
    importAliases.className = 'arkmail-import-btn popup-btn popup-btn--control';
    importAliases.setAttribute('data-import', 'aliasy');
    importAliases.textContent = 'Importuj aliasy pocztowe';
    importAliases.setAttribute(
      'title',
      'Pobiera z gry aliasy pocztowe i dopisuje ich odbiorcow do ksiazki. W ArkMailu aliasy sa tylko do odczytu; edytujesz i usuwasz je w grze. Rozwija je serwer.',
    );
    importAliases.addEventListener('click', () => handlers.onImportAliases?.());
    importRow.appendChild(importAliases);
    aliasSec.appendChild(importRow);
    pane.appendChild(aliasSec);
    const zone = doc.createElement('div');
    zone.className = 'arkmail-box-ops arkmail-destructive-zone';
    const clearBtn = doc.createElement('button');
    clearBtn.className = 'popup-btn popup-btn--control popup-btn--danger popup-btn--ghost';
    clearBtn.textContent = 'Wyczysc zapisane aliasy';
    clearBtn.setAttribute('data-aliases-clear', '');
    clearBtn.setAttribute(
      'title',
      'Usuwa lokalne lustro aliasow. Na serwerze Arkadii nic nie znika. Aliasy pobierzesz z gry ponownie.',
    );
    if (state.importedAliases.length === 0) clearBtn.setAttribute('disabled', '1');
    guardDeleteButton(clearBtn, () => handlers.onClearAliases?.(), {
      armedLabel: 'Na pewno usunac aliasy?',
    });
    zone.appendChild(clearBtn);
    pane.appendChild(zone);
    fillButtonTitles(pane);
  };

  /**
   * Sekcja "Import i eksport" (zgloszenie 2026-11-05): eksport/import
   * ksiazki JSON przeniesione z sekcji Grupy (operacja dotyka calej
   * ksiazki, nie grup), czyszczenie calej ksiazki (imiona + grupy +
   * aliasy, guard dwukliku) i dopisanie wszystkich osob zebranych z
   * listow jednym klikiem (klawisz aktywny tylko gdy baza istnieje).
   */
  const renderImportEksport = (state: MailUiState, pane: HTMLElement): void => {
    const error = doc.createElement('div');
    error.className = 'arkmail-dim arkmail-group-error';
    error.setAttribute('data-group-error', '');
    const showError = (msg: string): void => {
      error.textContent = msg;
    };

    const importRow = doc.createElement('div');
    importRow.className = 'arkmail-import-row arkmail-book-import-people arkmail-action-row';

    // Dopisanie wszystkich osob zebranych z listow (dedup robi
    // handler w index.ts przez unionPeople).
    const addAll = doc.createElement('button');
    addAll.className = 'popup-btn popup-btn--control';
    addAll.textContent = 'Dopisz wszystkie osoby z listow';
    addAll.setAttribute('data-book-add-all-contacts', '');
    addAll.setAttribute(
      'title',
      'Dopisuje do ksiazki wszystkie osoby zebrane z listow. Bez wzgledu na wielkosc liter nic nie duplikuje.',
    );
    if (state.contacts.length === 0) addAll.setAttribute('disabled', '1');
    addAll.addEventListener('click', () => handlers.onAddAllContacts?.());
    importRow.appendChild(addAll);

    // --- import bazy osob z gry (Fala UI-2 krok 4: przeniesione z
    // sub-pigulki Osoby w Kontaktach - indeks osob przeniesiony do
    // panelu Archiwum, a import jest czynnoscia ksiazki adresowej).
    // Import DOPISUJE nowe osoby do istniejacej puli, nie tworzy grup -
    // z bazy gracz sklada grupy recznie (widok Grupy).
    const IMPORT_BTNS: Array<[string, string, string]> = [
      [
        'zapamietani',
        'Importuj zapamietanych',
        'Pobiera z gry osoby zapamietane i dopisuje nowe do ksiazki adresowej. Istniejacych osob nie usuwa. Grup nie tworzy.',
      ],
      [
        'przedstawieni',
        'Importuj przedstawionych',
        'Pobiera z gry osoby, ktore zostaly ci ostatnio przedstawione, i dopisuje nowe do ksiazki adresowej. Istniejacych osob nie usuwa. Grup nie tworzy.',
      ],
    ];
    for (const [kind, label, title] of IMPORT_BTNS) {
      const btn = doc.createElement('button');
      btn.className = 'arkmail-import-btn popup-btn popup-btn--control';
      btn.setAttribute('data-import', kind);
      btn.textContent = label;
      btn.setAttribute('title', title);
      btn.addEventListener('click', () => {
        handlers.onImportPeople?.(kind as 'zapamietani' | 'przedstawieni');
      });
      importRow.appendChild(btn);
    }
    pane.appendChild(importRow);

    pane.appendChild(doc.createElement('hr'));

    // Eksport: imiona + grupy do pliku JSON (aliasy nie wchodza -
    // pobiera sie je z gry). Zgloszenie 2026-11-05: przez handler -
    // pobranie pliku + komunikat robi index.ts (jak eksport listu).
    const transferActions = doc.createElement('div');
    transferActions.className = 'arkmail-book-transfer-actions arkmail-action-row';
    const expBtn = doc.createElement('button');
    // 1.30.2 (Etap 1): klasy natywne jak przy kazdym eksporcie akcji
    // (solid - pobranie pliku to operacja glowna sekcji).
    expBtn.className = 'popup-btn popup-btn--control popup-btn--solid';
    expBtn.textContent = 'Eksportuj ksiazke';
    expBtn.setAttribute('data-book-export', '');
    expBtn.setAttribute('title', 'Pobiera plik JSON: imiona i grupy. Aliasy pocztowe nie wchodza do pliku - pobierasz je z gry.');
    expBtn.addEventListener('click', () => handlers.onExportAddressBook?.());
    transferActions.appendChild(expBtn);

    // Import: tryb dolacz/zastap (stan lokalny jak dotad).
    // Zgloszenie 2026-11-05 (Etap 9): import to prawdziwy klawisz;
    // pole wyboru pliku jest niewidoczne i otwiera je klawisz.
    const modeRow = doc.createElement('div');
    modeRow.className = 'arkmail-boxes';
    modeRow.setAttribute('data-book-import-mode', '');
    const MODES: Array<[ImportMode, string, string]> = [
      [
        'dolacz',
        'Dolacz do ksiazki',
        'Dolacza imiona i nowe grupy z pliku. Grupe o tej samej nazwie scala z istniejaca. Nie usuwa obecnych danych.',
      ],
      [
        'zastap',
        'Zastap cala ksiazke',
        'Kasuje obecne imiona i grupy, a na ich miejsce wczytuje zawartosc pliku. Aliasy zostaja bez zmian.',
      ],
    ];
    for (const [mode, label, title] of MODES) {
      const lab = doc.createElement('label');
      const radio = doc.createElement('input');
      radio.setAttribute('type', 'radio');
      radio.setAttribute('name', 'arkmail-import-mode');
      radio.setAttribute('title', title);
      radio.checked = bookImportMode === mode;
      radio.addEventListener('click', () => {
        bookImportMode = mode;
      });
      lab.appendChild(radio);
      lab.appendChild(doc.createTextNode(label));
      modeRow.appendChild(lab);
    }
    const impInput = doc.createElement('input');
    nativeFieldClass(impInput);
    impInput.setAttribute('type', 'file');
    impInput.setAttribute('data-book-import', '');
    impInput.setAttribute('accept', '.json,application/json');
    impInput.setAttribute(
      'title',
      'Wczytuje imiona i grupy z pliku JSON. Sposob zalezy od trybu: dolacz albo zastap. Aliasy pobierasz z gry.',
    );
    const paintReplaceConfirmation = (): void => {
      pane.querySelector('[data-book-replace-confirm]')?.remove();
      const pending = pendingBookReplace;
      if (!pending || pending.selection !== bookImportSelection) return;
      const panel = doc.createElement('div');
      panel.className = 'arkmail-box-ops arkmail-book-replace-confirm';
      panel.setAttribute('data-book-replace-confirm', '');
      const description = doc.createElement('div');
      description.className = 'arkmail-dim';
      description.textContent = `Zastapic cala ksiazke plikiem ${pending.fileName}? Plik: ${pending.data.people.length} imion, ${pending.data.groups.length} grup. Aliasy pocztowe zostana bez zmian.`;
      const confirm = doc.createElement('button');
      confirm.className = 'popup-btn popup-btn--control popup-btn--danger';
      confirm.setAttribute('data-book-replace-ok', '');
      confirm.textContent = 'Zastap cala ksiazke';
      confirm.addEventListener('click', () => {
        const current = pendingBookReplace;
        if (!current || current.selection !== bookImportSelection) return;
        pendingBookReplace = null;
        handlers.onImportAddressBook?.(current.data, 'zastap');
      });
      const cancel = doc.createElement('button');
      cancel.className = 'popup-btn popup-btn--control';
      cancel.setAttribute('data-book-replace-cancel', '');
      cancel.textContent = 'Anuluj';
      cancel.addEventListener('click', () => {
        pendingBookReplace = null;
        paintReplaceConfirmation();
      });
      panel.appendChild(description);
      panel.appendChild(confirm);
      panel.appendChild(cancel);
      error.before(panel);
    };
    impInput.addEventListener('change', () => {
      const selection = ++bookImportSelection;
      const selectedMode = bookImportMode;
      const file = impInput.files?.[0];
      pendingBookReplace = null;
      paintReplaceConfirmation();
      showError('');
      if (!file) {
        impInput.value = '';
        return;
      }
      void (async () => {
        try {
          const content = await file.text();
          if (selection !== bookImportSelection) return;
          const parsed = parseAddressBookExport(content);
          if (!parsed) {
            showError('Niepoprawny plik ksiazki adresowej.');
            return;
          }
          if (selectedMode === 'zastap') {
            pendingBookReplace = { selection, fileName: file.name, data: parsed };
            paintReplaceConfirmation();
          } else {
            handlers.onImportAddressBook?.(parsed, selectedMode);
          }
        } catch {
          if (selection === bookImportSelection) showError('Nie udalo sie odczytac pliku.');
        } finally {
          impInput.value = '';
        }
      })();
    });
    const impBtn = doc.createElement('button');
    impBtn.className = 'popup-btn popup-btn--control';
    impBtn.textContent = 'Importuj ksiazke';
    impBtn.setAttribute('data-book-import-trigger', '');
    impBtn.setAttribute(
      'title',
      'Wybiera plik JSON z imionami i grupami, a potem wczytuje go w wybranym trybie.',
    );
    impBtn.addEventListener('click', () => impInput.click());
    transferActions.appendChild(impBtn);
    pane.appendChild(transferActions);
    pane.appendChild(impInput);
    pane.appendChild(modeRow);
    pane.appendChild(error);
    pane.appendChild(doc.createElement('hr'));

    // Czyszczenie calej ksiazki: imiona + grupy + aliasy lokalnie.
    const clearAll = doc.createElement('button');
    clearAll.className = 'popup-btn popup-btn--control popup-btn--danger popup-btn--ghost';
    clearAll.textContent = 'Wyczysc cala ksiazke i aliasy';
    clearAll.setAttribute('data-book-clear-all', '');
    clearAll.setAttribute(
      'title',
      'Kasuje lokalnie wszystkie imiona, grupy i aliasy. Na serwerze Arkadii nic nie znika - ksiazke zbudujesz od nowa.',
    );
    guardDeleteButton(clearAll, () => handlers.onClearAddressBook?.(), {
      armedLabel: 'Na pewno wyczyscic cala ksiazke?',
    });
    const clearZone = doc.createElement('div');
    clearZone.className = 'arkmail-box-ops arkmail-destructive-zone';
    clearZone.appendChild(clearAll);
    pane.appendChild(clearZone);
    fillButtonTitles(pane);
  };

  /**
   * Panel "Osoby z listow" zakladki Archiwum (Fala UI-2 krok 4).
   * Wydanie 1.30.1 (zgloszenie 6): panel mieszka pod chipem
   * "Osoby z listow" - osoby i listy nie stoja jedno nad drugim.
   * Indeks osob zebranych z listow - wczesniej sub-pigulka "Osoby"
   * w Kontaktach (usunieta w Fala UI-2). Panel stoi w Archiwum, bo
   * osoby i ich liczniki stoja na lokalnej bazie listow - skok z
   * osoby filtruje dokladnie te liste listow. Zachowuje brame
   * indeksacji (wskazowka) i notke o lukach; stopka ze statusem
   * indeksacji ustapila miejsca krokowi 1 Archiwum.
   */
  const renderArchPeople = (state: MailUiState): HTMLElement => {
    const panel = doc.createElement('div');
    panel.setAttribute('data-arch-people', '');
    panel.className = 'arkmail-arch-people-panel';
    // Wydanie 1.30.1 (zgloszenie 6): panel mieszka pod chipem
    // "Osoby z listow" - zwijanie ustapilo chipsom.
    // Zgloszenie 2026-11-05: klawisz indeksowania znika z panelu osob -
    // zostaje dokladnie jeden, w kroku 1 Archiwum. Wskazowka o budowie
    // bazy zostaje (kontekst listy), bez klawisza.
    if (!allBoxesIndexed(state.indexMeta) || state.indexRun) {
      panel.appendChild(
        dim('Osoby z listow powstaja z listow zebranych ze wszystkich skrzynek.'),
      );
    }
    const gaps = INDEX_BOXES.flatMap((box) =>
      (state.archiveGaps[box] ?? []).map((day) => `${box}: ${day}`),
    );
    if (gaps.length > 0) {
      const gapNote = doc.createElement('div');
      gapNote.className = 'arkmail-dim arkmail-index-gaps';
      gapNote.textContent = `Brakuje danych z dni: ${gaps.join(', ')}`;
      panel.appendChild(gapNote);
    }
    // Filtr i sort sa lokalne (poza store, jak filtr archiwum):
    // repaint dotyczy tylko listy, input nie traci fokusu przy pisaniu.
    const controls = doc.createElement('div');
    controls.className = 'arkmail-contact-controls';
    const input = doc.createElement('input');
    input.className = 'arkmail-contact-filter popup-input popup-input--control';
    input.setAttribute('data-filter', 'kontakty');
    input.setAttribute('placeholder', 'Filtr: nazwa lub alias');
    input.value = contactView.filter;
    const sel = doc.createElement('select');
    sel.className = 'arkmail-contact-sort popup-input popup-input--control';
    const SORT_OPTS: Array<[ContactSort, string]> = [
      ['nazwa', 'Nazwa A-Z'],
      ['liczba', 'Liczba listow'],
      ['ostatni', 'Ostatni list'],
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
    const clearFilters = doc.createElement('button');
    clearFilters.className = filterClearClass('arkmail-arch-clear');
    clearFilters.setAttribute('data-arch-people-clear', '');
    const syncClear = wireArchiveClearButton(clearFilters);
    controls.appendChild(clearFilters);
    panel.appendChild(controls);
    // Fala 40: filtr z ghostem jak pole Osoba w Archiwum - kandydaci
    // z kontaktow + aliasow, strzalka w prawo wpisuje kanoniczna forme.
    // Akceptacja dispatchuje 'input', wiec repaint listy odpala sie sam.
    attachGhost(doc, input, personSource);
    const list = doc.createElement('div');
    // Zgloszenie 2026-11-05 (A1): rozwineta lista osob scrolluje sie
    // wlasnym kontenerem (max-height + overflow w styles.ts), zamiast
    // pchac cala zakladke w dol.
    list.className = 'arkmail-arch-people-list';
    panel.appendChild(list);
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
          // odebrane OD osoby czy wyslane DO niej.
          // Fala 26b (zgloszenie 2026-10-22): skok filtruje LOKALNE
          // archiwum (zakladka Archiwum), zamiast strzelac szukaniem
          // do serwera; skok jest deterministyczny: osoba + skrzynka,
          // reszta filtrow archiwum czyszczona.
          // Wydanie 1.30.1: skok przelacza chips na liste listow
          // (kontekst osoby = filtr osoby na liscie).
          const jumpTo = (box: MailBox) => {
            archFilter.osoba = c.name;
            archFilter.skrzynka = box;
            archFilter.temat = undefined;
            archFilter.tresc = undefined;
            archFilter.odDaty = undefined;
            archFilter.doDaty = undefined;
            // Wydanie 1.30.1 (zgloszenie 6): skok przelacza chips na
            // "Archiwum listow" - osoby i listy nie stoja jedno nad
            // drugim. Kolejnosc: sub -> filtr -> scroll (deterministyczna).
            archView.sub = 'listy';
            store.setTab('archiwum');
            // Zgloszenie 2026-11-05 (A2): po skoku przewijamy widok do
            // listy listow - panel osob (teraz rozwiniety) nie wymusza
            // dlugiego recznego scrolla. Guard na wypadek braku metody
            // w starszym srodowisku.
            const target = doc.querySelector('.arkmail-arch-list');
            (target as { scrollIntoView?: () => void } | null)?.scrollIntoView?.();
          };
          // Klik w imie = kierunek domyslny: odebrane, gdy sa.
          name.setAttribute('title', 'Pokaz listy tej osoby w archiwum.');
          makeClickable(name, () => {
            if (c.lettersReceived > 0) jumpTo('odebrane');
            else if (c.lettersSent > 0) jumpTo('wyslane');
          });
          row.appendChild(name);
          const stats = doc.createElement('span');
          stats.className = 'arkmail-contact-stats';
          stats.textContent =
            `(odebrane: ${c.lettersReceived}, wyslane: ${c.lettersSent})` +
            (c.mailAlias ? ` | alias: ${c.mailAlias}` : '');
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
            btn.className = 'arkmail-contact-dir popup-btn popup-btn--control';
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
          // Fala UI-2 krok 4: dopisanie osoby do ksiazki adresowej
          // jednym klikiem ("Do ksiazki"). Wylaczony, gdy imie juz
          // jest w ksiazce (bez wzgledu na wielkosc liter) - brak
          // listenera, wiec klikniecie nie zapisuje.
          const addBook = doc.createElement('button');
          addBook.className = 'arkmail-contact-addbook popup-btn popup-btn--control';
          addBook.setAttribute('data-arch-add-book', '');
          addBook.textContent = 'Do ksiazki';
          if (state.people.some((p) => p.toLowerCase() === c.name.toLowerCase())) {
            addBook.setAttribute('disabled', '1');
            addBook.setAttribute('title', 'Juz w ksiazce.');
          } else {
            addBook.setAttribute('title', `Dopisuje ${c.name} do ksiazki adresowej.`);
            addBook.addEventListener('click', () =>
              handlers.onSavePeople?.([...state.people, c.name]),
            );
          }
          row.appendChild(addBook);
          return row;
        }),
      );
      if (rows.length === 0) {
        list.replaceChildren(
          dim(
            state.contacts.length === 0
              ? 'Brak osob z listow - pojawia sie po pobraniu skrzynek.'
              : 'Zadna osoba nie pasuje do filtra.',
          ),
        );
      }
      fillButtonTitles(list);
    };
    input.addEventListener('input', () => {
      contactView.filter = input.value;
      repaint();
      syncClear();
    });
    sel.addEventListener('change', () => {
      contactView.sort = sel.value as ContactSort;
      repaint();
      syncClear();
    });
    repaint();
    return panel;
  };

  const renderArchiwum = (state: MailUiState): HTMLElement => {
    const pane = doc.createElement('div');
    pane.className = archView.sub === 'osoby' ? 'arkmail-pane arkmail-listy' : 'arkmail-pane';
    pane.setAttribute('data-pane-key', 'archiwum');
    // Wydanie 1.30.1 (zgloszenie 6): chipsy jak w Kontaktach - lista
    // listow i osoby jako osobne widoki, nie jedno nad drugim.
    const subRow = doc.createElement('div');
    subRow.className = 'arkmail-boxes';
    subRow.setAttribute('role', 'tablist');
    subRow.setAttribute('aria-label', 'Archiwum');
    const ARCH_SUBS: Array<[typeof archView.sub, string]> = [
      ['listy', 'Archiwum listow'],
      ['osoby', 'Osoby z listow'],
    ];
    const subPanel = doc.createElement('div');
    subPanel.className = 'arkmail-subpanel';
    subPanel.id = `arkmail-archive-panel-${archView.sub}`;
    subPanel.setAttribute('role', 'tabpanel');
    subPanel.setAttribute('aria-labelledby', `arkmail-archive-tab-${archView.sub}`);
    const buttons: HTMLButtonElement[] = [];
    for (const [sub, label] of ARCH_SUBS) {
      const pill = doc.createElement('button');
      pill.className =
        'arkmail-subpill dialog-tab' + (archView.sub === sub ? ' is-active' : '');
      pill.id = `arkmail-archive-tab-${sub}`;
      pill.setAttribute('data-archive-tab', sub);
      pill.setAttribute('role', 'tab');
      pill.setAttribute('aria-selected', archView.sub === sub ? 'true' : 'false');
      pill.setAttribute('aria-controls', `arkmail-archive-panel-${sub}`);
      pill.tabIndex = archView.sub === sub ? 0 : -1;
      pill.textContent = label;
      pill.addEventListener('click', () => {
        archView.sub = sub;
        store.refresh();
      });
      subRow.appendChild(pill);
      buttons.push(pill);
    }
    wireTabKeyboard(subRow, buttons, (index) => {
      const sub = ARCH_SUBS[index]![0];
      archView.sub = sub;
      store.refresh();
      (root.querySelector(`[data-archive-tab="${sub}"]`) as HTMLButtonElement | null)?.focus();
    });
    pane.appendChild(subRow);
    pane.appendChild(subPanel);
    if (archView.sub === 'osoby') {
      subPanel.appendChild(renderArchPeople(state));
      return pane;
    }
    // Wszystkie filtry lokalne (poza store): repaint tylko listy,
    // input nie traci fokusu przy pisaniu.
    const controls = doc.createElement('div');
    controls.className = 'arkmail-arch-controls';
    let syncClear: () => void = () => {};
    const mkText = (key: 'osoba' | 'temat' | 'tresc' | 'odDaty' | 'doDaty', placeholder: string, type = 'text') => {
      const input = doc.createElement('input');
      nativeFieldClass(input);
      input.setAttribute('data-filter', key);
      input.setAttribute('type', type);
      input.setAttribute('placeholder', placeholder);
      input.value = archFilter[key] ?? '';
      input.addEventListener('input', () => {
        archFilter[key] = input.value === '' ? undefined : input.value;
        repaint();
        syncClear();
      });
      return input;
    };
    const aOsoba = mkText('osoba', 'Osoba (nadawca lub odbiorca)');
    controls.appendChild(aOsoba);
    attachGhost(doc, aOsoba, personSource);
    const skr = doc.createElement('select');
    nativeFieldClass(skr);
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
      syncClear();
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
    clearFilters.className = filterClearClass('arkmail-arch-clear');
    syncClear = wireArchiveClearButton(clearFilters);
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
    // Fala UI-2 krok 4: status kompletu dostaje najwczesniejsza date
    // indeksacji (dawniej data mieszkala w stopce sub-pigulki Osoby,
    // stopce sub-pigulki Osoby, ktora ustapila miejsca panelowi).
    // Pusta przy nieindeksowanym archiwum - uzywana
    // tylko w galezi kompletu, wiec pustka nigdy nie trafia na ekran.
    const indexDates = INDEX_BOXES.map((box) => state.indexMeta[box])
      .filter((d): d is string => d !== undefined)
      .sort();
    const earliestIndexDate = indexDates.length > 0 ? indexDates[0]!.slice(0, 10) : '';
    // Fala 31e: mowimy, czego brakuje ("brakuje danych z N dni").
    // Liczebnik dni: 1 dnia / 2 dni / 5 dni.
    const gapPhrase = (days: number): string =>
      days === 1 ? 'brakuje danych z 1 dnia' : `brakuje danych z ${days} dni`;
    const indexStatus = state.indexRun
      ? `W toku: skrzynka ${state.indexRun.box}. Liczba stron: ${state.indexRun.pages}.`
      : allBoxesIndexed(state.indexMeta)
        ? gapCount > 0
          ? `Gotowe, ale ${gapPhrase(gapCount)}.`
          : `Wszystkie skrzynki zapisane. Najstarszy zapis: ${earliestIndexDate}.`
        : indexedCount > 0 || gapCount > 0
          ? `Czesciowo: ${indexedCount} z ${INDEX_BOXES.length} skrzynek${gapCount > 0 ? ` (${gapPhrase(gapCount)})` : ''}.`
          : 'Jeszcze nie zaczeto.';
    // Fala 28: grupy przez core/archiveStats - jedna miara "total"
    // dla paska, stopki indeksacji i komunikatow. Rekordow nieobecnych
    // na serwerze w bazie nie ma wcale (fizyczny purge), wiec zywosc
    // nie jest sprawdzana.
    const archiveGroups = liveArchiveGroups(state.archive);
    // Liczniki kroku 2 licza REKORDY, nie grupy kluczy: dwa wpisy tej
    // samej strony listingu bez tresci to dwa listy do pobrania, a
    // pobieranie (runArchiveDownload) kandyduje rekordami. Definicje
    // identyczne z tamta petla: z trescia / bez tresci z data /
    // bez tresci bez daty.
    let withBody = 0;
    let pendingBody = 0;
    let undatedBody = 0;
    for (const letter of state.archive) {
      if (letter.body.length > 0) {
        withBody += 1;
        continue;
      }
      const dateRaw = letter.dateRaw;
      if (dateRaw !== null && parseMailDate(dateRaw) !== null) pendingBody += 1;
      else undatedBody += 1;
    }
    const downloadStatus = state.archiveDownload
      ? `Pobieram tresci: ${state.archiveDownload.done} z ${state.archiveDownload.total}.`
      : state.archive.length === 0
        ? 'Jeszcze nie pobrano.'
        : pendingBody > 0
          ? `Czesciowo: liczba listow z trescia ${withBody}. Do pobrania: ${pendingBody}. Bez tresci i bez prawidlowej daty: ${undatedBody}.`
          : `Liczba listow z trescia: ${withBody}. Do pobrania nie nadaja sie: ${undatedBody} (brak prawidlowej daty).`;
    // Podglad potrzebuje tylko licznikow. Pelne nazwy i tresci TXT
    // powstaja dopiero po poleceniu eksportu w runExportArchive().
    const exportable = archiveExportStats(state.archive);
    const exportStatus =
      exportable.count === 0
        ? 'Brak listow z trescia - nie ma czego zapisywac.'
        : `Do zapisu: ${exportable.count}. Pominiete bez tresci: ${exportable.skipped}.`;
    // Fala 31d/28: agregat nad lista - globalny (nie zalezy od filtra),
    // Agregat = totalLive (suma MAX na klucz tresci w kazdej skrzynce),
    // a nie liczba grup kluczy: dwa rekordy tej samej skrzynki o
    // identycznym kluczu to dwa listy i agregat ma je liczyc osobno.
    // Skrzynki z zerem pomijane. Kazdy rekord jest zywy (fizyczny purge
    // Fala 28), wiec zywosc nie jest sprawdzana.
    let countsStrip: HTMLElement | null = null;
    if (archiveGroups.length > 0) {
      countsStrip = doc.createElement('p');
      countsStrip.className = 'arkmail-dim arkmail-arch-counts';
      countsStrip.textContent = `Liczba listow w bazie: ${totalLive(state.archive)}.`;
    }
    const indexStep = makeStep('1. Indeksacja', indexStatus, state.indexRun ? 'active' : allBoxesIndexed(state.indexMeta) ? (gapCount > 0 ? 'warning' : 'done') : indexedCount > 0 || gapCount > 0 ? 'incomplete' : 'idle');
    const downloadStep = makeStep('2. Pobranie tresci', downloadStatus, state.archiveDownload ? 'active' : pendingBody > 0 ? 'incomplete' : undatedBody > 0 ? 'warning' : withBody > 0 ? 'done' : 'idle');
    const exportStep = makeStep('3. Zapis ZIP', exportStatus, exportable.count > 0 ? (exportable.skipped > 0 ? 'warning' : 'done') : 'idle');

    // Fala 18c (zgloszenie 2026-10-20 pkt 1): indeksacja wszystkich
    // skrzynek - pelny listing kazdej (z paginacja kotwicowa) = kompletna
    // baza dla kontaktow i eksportow. Operacja tylko czyta (jak Wczytaj
    // wszystkie) - bez dwukliku; w trakcie petli drugi klik = Przerwij.
    const idxBtn = doc.createElement('button');
    idxBtn.className = 'arkmail-index-all popup-btn popup-btn--control';
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
    dlBtn.className = 'arkmail-arch-download popup-btn popup-btn--control';
    dlBtn.textContent = state.archiveDownload
      ? `Przerwij (${state.archiveDownload.done}/${state.archiveDownload.total})`
      : 'Pobierz tresci do archiwum';
    if (state.archiveDownload) {
      // Petla w toku = Przerwij (bez uzbrajania, jak dotad).
      dlBtn.addEventListener('click', () => handlers.onDownloadArchiveBodies?.());
    } else {
      // 1.30.2 (Etap 5): wspolny guard - uzbrojenie widac kolorem.
      dlBtn.setAttribute('title', 'Pobiera brakujace tresci listow do archiwum. Moze potrwac dlugo.');
      guardDeleteButton(dlBtn, () => handlers.onDownloadArchiveBodies?.(), {
        armedLabel: 'Potwierdz dlugie pobieranie',
        armedTitle: 'Kliknij ponownie, aby rozpoczac pobieranie.',
      });
    }
    downloadStep.appendChild(dlBtn);
    // Fala 17g: eksport calego archiwum do ZIP z TXT per list.
    // Operacja lokalna (tylko listy z trescia w cache) - bez dwukliku.
    const expBtn = doc.createElement('button');
    expBtn.className = 'arkmail-arch-export popup-btn popup-btn--control popup-btn--solid';
    // Fala 18e (zgloszenie 2026-10-20 pkt 5): zapisuje ZIP z TXT per
    // list - etykieta mowi o formacie archiwum, nie o pojedynczym TXT.
    expBtn.textContent = 'Zapisz wszystkie (ZIP)';
    expBtn.addEventListener('click', () => handlers.onExportArchive?.());
    exportStep.appendChild(expBtn);
    subPanel.appendChild(steps);
    subPanel.appendChild(controls);
    if (countsStrip) subPanel.appendChild(countsStrip);
    const list = doc.createElement('div');
    // Zgloszenie 2026-11-05 (A2): klasa = punkt przewijania po skoku
    // z osoby (jumpTo w renderArchPeople).
    list.className = 'arkmail-arch-list';
    subPanel.appendChild(list);
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
      const oldErr = subPanel.querySelector('.arkmail-dates-error');
      if (oldErr) oldErr.remove();
      if (datesInvalid || datesClash) {
        const err = doc.createElement('div');
        err.className = 'arkmail-dates-error';
        err.textContent = datesInvalid
          ? 'Nieprawidlowa data - oba filtry dat zostaly pominiete.'
          : "Data 'Od dnia' jest pozniejsza niz 'Do dnia' - oba filtry dat zostaly pominiete.";
        subPanel.insertBefore(err, list);
      }
      // Fala 41: jeden wiersz na rekord, nieobecne ukryte (core).
      const rows = filterVisibleArchive(state.archive, effFilter);
      // Podpis filtra tresci: tresc zna tylko pobrane listy - bez
      // podpowiedzi filtr "milczaco" nic nie znajdowal (zgloszenie
      // 2026-10-20 pkt 3).
      const oldNote = subPanel.querySelector('.arkmail-tresc-note');
      if (oldNote) oldNote.remove();
      if (archFilter.tresc !== undefined) {
        const base = filterVisibleArchive(state.archive, { ...effFilter, tresc: undefined });
        const withBody = base.filter((l) => l.body.length > 0).length;
        const note = doc.createElement('div');
        note.className = 'arkmail-dim arkmail-tresc-note';
        note.textContent = `Filtr tresci obejmuje tylko listy z pobrana trescia (${withBody} z ${base.length}).`;
        subPanel.insertBefore(note, list);
      }
      list.replaceChildren(
        ...rows.flatMap((l, idx) => {
          const row = doc.createElement('div');
          row.className = 'arkmail-arch-entry';
          const subj = doc.createElement('span');
          subj.className = 'arkmail-arch-subject';
          subj.setAttribute('title', l.subject);
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
          const date = doc.createElement('span');
          date.className = 'arkmail-arch-date';
          // Pelne oryginalne dateRaw; biale znaki nie tworza sztucznej daty.
          date.textContent = l.dateRaw && l.dateRaw.trim().length > 0 ? l.dateRaw : 'brak daty';
          row.appendChild(date);
          // Fala 16h: archiwum klikalne (zgloszenie pkt 9) - tresc
          // z cache albo doczyt z serwera po re-kotwicy (index.ts).
          makeClickable(row, () => handlers.onOpenArchiveLetter?.(l));
          return [row];
        }),
      );
      if (rows.length === 0) {
        list.replaceChildren(dim('Archiwum jest puste albo zaden list nie pasuje do filtra.'));
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
    const wasArmed = armedButtons.size > 0 || store.state.deletion.armedAt !== 0;
    if (!wasArmed) return;
    // Pierwszy ESC nalezy do aktywnego guarda. Bez zatrzymania propagacji
    // klient rowniez go obsluzy i zamknie caly popup zamiast tylko rozbroic
    // operacje. Kolejny ESC, juz bez uzbrojenia, przechodzi do klienta.
    event.preventDefault();
    event.stopPropagation();
    // Zgloszenie 2026-11-05: ESC rozbraja kazde uzbrojenie w oknie -
    // guard klawiszy usuwajacych (X, Na pewno usunac?) i guard sesji
    // usuwania w zakladce Usuwanie.
    disarmAllButtons();
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
