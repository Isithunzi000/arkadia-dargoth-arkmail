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
import { letterId } from '../core/archive.js';
import type { LetterTemplate } from '../core/letterRender.js';
import { emptyDeletionFilters } from './deletion.js';
import type { DeletionFilters } from './deletion.js';

export type UiTab = 'listy' | 'list' | 'napisz' | 'kontakty' | 'archiwum' | 'usuwanie';

export interface DeletionState {
  box: MailBox;
  filters: DeletionFilters;
  command: string | null;
  result: MailboxResult | null;
  selected: number[];
  message: string | null;
  revision: number;
  /**
   * Uzbrojenie dwuklikowego potwierdzenia usuwania (timestamp, 0 = nie).
   * Zyje w store, nie w DOM: na zywym kliencie popup przemalowuje sie
   * przy kazdym badge/busy/GMCP, a stan trzymany w zamknieciu renderu
   * ginie razem z przyciskiem (zgloszenie 2026-10-30: drugi klik
   * uzbrajal od nowa zamiast kasowac). Bez podbicia revision - uzbrojenie
   * nie wolno uniewazniac guardow w toku sesji usuwania.
   */
  armedAt: number;
}


/**
 * Fala 34: klucz TRESCI wpisu widoku (bez boxa - widok jest per
 * skrzynka; bez numeru - numeracja listingu jest kontekstowa).
 * Uzywany WYLACZNIE do parowania wielozbiorowego (sync) i zdejmowania
 * ponownie pokazanych listow (sonda sciany paginacji) - NIGDY do
 * sklejania wierszy: serwer wylistowal N wpisow = widok pokazuje
 * N wierszy (blizniaki o identycznych metadanych to osobne wiersze).
 */
function contentKeyOfEntry(e: MailboxEntry): string {
  return [e.party, e.subject, e.forwarded ? 'f' : '', e.date?.raw ?? ''].join('|');
}

function deletionState(revision: number): DeletionState {
  return {
    box: 'odebrane',
    filters: emptyDeletionFilters(),
    command: null,
    result: null,
    selected: [],
    message: null,
    revision,
    armedAt: 0,
  };
}

export interface BoxView {
  entries: MailboxEntry[];
  truncated: boolean;
  /** znacznik wariantu pustego; null gdy listing niepusty */
  empty: 'puste' | 'filtr' | null;
  /**
   * Fala 34: liczba wpisow NA KONCU tablicy nalezaca do ostatniego
   * listingu pierwszej strony (blok glowy). Starsze strony doklejone
   * PRZODEM poza ten blok; sync paruje swieza strone tylko z blokiem
   * glowy (numeracja stron jest wzgledna - wpis z innego listingu
   * o tym samym numerze to INNY list). Wpisy nieparujace w obrebie
   * bloku glowy przy kompletnym listingu wypadaja z widoku.
   */
  headCount: number;
}

export interface OpenLetter extends LetterContent {
  box: MailBox;
  /**
   * Wpis listingu, z ktorego otwarto list (Fala 9a) - tozsamosc do
   * re-kotwiczenia operacji pagerowych (Usun/Przekaz). Brak = list bez
   * zrodla (operacje wylaczone w UI).
   */
  source?: MailboxEntry;
}

export interface MailUiState {
  tab: UiTab;
  /** szeroki podzial (popup >= 900px): list obok listingu */
  wide: boolean;
  activeBox: MailBox;
  boxes: Partial<Record<MailBox, BoxView>>;
  badge: number;
  /**
   * Liczba listow w niewyslanych z ostatniego listingu (Fala 14d).
   * GMCP Mail.State daje tylko booleany - licznik pochodzi z listingow;
   * etykieta '(u/n)' przez formatBadgeSuffix.
   */
  badgeUnsent: number;
  /** opis operacji pocztowej w toku (pasek); null = wolne */
  busy: string | null;
  /** petla "Wczytaj wszystkie" w toku: skrzynka + liczba pobranych stron */
  loadAll: { box: MailBox; pages: number } | null;
  /**
   * petla "Pobierz tresci do archiwum" w toku: przetworzone / razem
   * + ETA w ms (Fala 18d; null = za wczesnie na sensowne ETA,
   * pokazywane od 3 ukonczonych).
   */
  archiveDownload: { done: number; total: number; etaMs: number | null } | null;
  /** tryb wynikow szukania serwerowego: skrzynka + opis zapytania */
  search: { box: MailBox; label: string } | null;
  letter: OpenLetter | null;
  contacts: Contact[];
  archive: ArchiveLetter[];
  notifyEnabled: boolean;
  /** Lot zwierzecia pocztowego w toku (Fala 13b): przycisk nieaktywny. */
  animalFlying: boolean;
  /**
   * Flash "list odlozony w niewyslanych" (Fala 14b): zakladka Listy
   * i skrzynka Niewyslane migaja ~3 s po compose/Przekaz. Compose poza
   * poczta ZAWSZE kolejkuje ("List jest gotowy do wyslania."), wiec
   * gracz musi widziec, gdzie list wyladowal.
   */
  unsentFlash: boolean;
  /** Preferencje compose: szablon ramki i szerokosc linii (20..120). */
  composeTemplate: LetterTemplate;
  composeWidth: number;
  /**
   * Licznik sygnalu "wyczysc compose" (Fala 16e): po udanym zapisie/
   * wyslaniu listu index.ts podbija licznik, a render przy najblizszym
   * renderze zeruje roboczy draft i pola formularza.
   */
  composeClearSeq: number;
  /**
   * Daty ISO ostatniej KOMPLETNEJ indeksacji per skrzynka (Fala 18c,
   * zgloszenie 2026-10-20 pkt 1). Flaga stawiana wylacznie po pelnym
   * przejsciu skrzynki (listing bez uciecia az do konca paginacji) -
   * dopiero wtedy archiwum jest pelna podstawa licznikow kontaktow.
   */
  indexMeta: Partial<Record<MailBox, string>>;
  /** Dni, ktorych czesci serwer nie pokazuje przez limit 50 wynikow. */
  archiveGaps: Partial<Record<MailBox, string[]>>;
  /**
   * Petla "Indeksuj wszystkie skrzynki" w toku (Fala 18c): indeks
   * biezacej skrzynki (0..3 wg INDEX_BOXES) + liczba pobranych stron.
   */
  indexRun: { boxIndex: number; box: MailBox; pages: number } | null;
  /** Tymczasowy stan zakladki usuwania; nie jest zapisywany. */
  deletion: DeletionState;
}

/** Kolejnosc petli "Indeksuj wszystkie skrzynki" (Fala 18c). */
export const INDEX_BOXES: MailBox[] = ['odebrane', 'nieprzeczytane', 'wyslane', 'niewyslane'];

/** Pelny indeks = flaga kompletnej indeksacji na kazdej z 4 skrzynek. */
export const allBoxesIndexed = (meta: Partial<Record<MailBox, string>>): boolean =>
  INDEX_BOXES.every((b) => meta[b] !== undefined);

const DEFAULT_STATE: MailUiState = {
  tab: 'listy',
  wide: false,
  activeBox: 'odebrane',
  boxes: {},
  badge: 0,
  badgeUnsent: 0,
  busy: null,
  loadAll: null,
  archiveDownload: null,
  search: null,
  letter: null,
  contacts: [],
  archive: [],
  notifyEnabled: true,
  animalFlying: false,
  unsentFlash: false,
  composeTemplate: 'plain',
  composeWidth: 60,
  composeClearSeq: 0,
  indexMeta: {},
  archiveGaps: {},
  indexRun: null,
  deletion: deletionState(0),
};

export class MailUiStore {
  private current: MailUiState;
  private readonly listeners = new Set<(s: MailUiState) => void>();
  /** Schowek pelnych widokow skrzynek na czas trybu wynikow szukania. */
  private readonly stashedViews: Partial<Record<MailBox, BoxView>> = {};

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
    const patch: Partial<MailUiState> = { tab };
    if (this.current.tab === 'usuwanie' && tab !== 'usuwanie') {
      patch.deletion = deletionState(this.current.deletion.revision + 1);
    }
    this.update(patch);
  }

  /**
   * Flip szerokosci w trakcie czytania nie gubi listu (Fala 10):
   * wide->waski przenosi otwarty list do pelnego panelu (zakladka
   * 'list'), waski->wide wraca do podzialu (zakladka 'listy').
   * Bez otwartego listu zakladka zostaje jak jest.
   */
  setWide(wide: boolean): void {
    const patch: Partial<MailUiState> = { wide };
    if (this.current.letter) {
      if (!wide && this.current.tab === 'listy') patch.tab = 'list';
      else if (wide && this.current.tab === 'list') patch.tab = 'listy';
    }
    this.update(patch);
  }

  setActiveBox(box: MailBox): void {
    this.update({ activeBox: box });
  }

  applyMailbox(box: MailBox, result: MailboxResult): void {
    const view: BoxView =
      result.kind === 'lista'
        ? // Fala 34: listing 1:1 - para blizniakow (identyczne
          // metadane, rozne numery) to DWA wiersze. Cala strona =
          // blok glowy (sync paruje z nim, nie ze starszymi stronami).
          {
            entries: result.entries,
            truncated: result.header.truncated,
            empty: null,
            headCount: result.entries.length,
          }
        : { entries: [], truncated: false, empty: result.reason, headCount: 0 };
    const boxes = { ...this.current.boxes, [box]: view };
    const b = computeBadges(boxes);
    this.update({ boxes, badge: b.unread, badgeUnsent: b.unsent });
  }

  /**
   * Dokleja strone starszych listow (paginacja "Wybrane listy") PRZED
   * istniejace wpisy - widok trzyma kolejnosc serwera (najstarszy
   * pierwszy). Fala 34: w obrebie strony NIC nie deduplikujemy;
   * filtrem klucza tresci zdejmujemy jedynie wpisy juz widoczne
   * (sonda sciany paginacji odpytuje ponownie dzien graniczny - to
   * te same fizyczne listy; blizniaki z innego dnia nie koliduja).
   * truncated=false oznacza koniec starszych (przycisk znika).
   */
  /** Dokleja strone starszych wpisow; zwraca liczbe NOWYCH wierszy. */
  appendMailboxPage(box: MailBox, entries: MailboxEntry[], truncated: boolean): number {
    const view = this.current.boxes[box];
    if (!view) return 0;
    const known = new Set(view.entries.map(contentKeyOfEntry));
    const fresh = entries.filter((e) => !known.has(contentKeyOfEntry(e)));
    const next: BoxView = {
      entries: [...fresh, ...view.entries],
      truncated,
      empty: null,
      headCount: view.headCount,
    };
    const boxes = { ...this.current.boxes, [box]: next };
    const b = computeBadges(boxes);
    this.update({ boxes, badge: b.unread, badgeUnsent: b.unsent });
    return fresh.length;
  }

  /**
   * Sync najnowszej strony z widokiem (Fala 12b; zastepuje "replace"
   * z Fali 11e jako domyslny tryb odswiezania). Wczytane starsze strony
   * ("Wczytaj starsze" / "Wczytaj wszystkie") NIE znikaja przy
   * odswiezeniu - gracz nie wraca do domyslnych 50 wpisow.
   *
   * - Fala 34: parowanie wielozbiorowe (multiset) W OBREBIE bloku
   *   glowy - wpisy swiezej strony parowane po kluczu tresci ze
   *   starymi wpisami bloku glowy i aktualizowane W MIEJSCU (np.
   *   znacznik *R*); drugi blizniak na swiezej stronie = DOKLADANY
   *   wiersz (blizniaki nigdy nie sa sklejane);
   * - nowe listy doklejane sa NA KONCU tablicy (koniec najnowszy; UI
   *   renderuje odwrotnie, wiec laduja na gorze ekranu);
   * - znacznik uciecia odpowiada najswiezszemu listingowi: komplet go
   *   zdejmuje, a pozniejszy limit ustawia go ponownie;
   * - usuwanie wpisow TYLKO gdy swiezy listing jest kompletny (bez
   *   uciecia): wtedy serwer raportuje pelna prawde (np. przeczytany
   *   list znika z 'nieprzeczytane'). Przy ucietych listingach brak
   *   wpisu moze byc wypchnieciem poza pierwsza strone - nic nie
   *   usuwamy.
   *
   * Fala 30b: przy UCIETYM listingu opcjonalna granica dnia
   * (pruneNewerThan, ISO YYYY-MM-DD = najstarszy dzien swiezej strony).
   * Strona jest ciagla od najnowszego, wiec wpis SCISELE NOWSZY niz
   * granica, nieobecny na stronie, na pewno nie ma go juz w skrzynce -
   * usuwamy. Dzien graniczny, starsze i wpisy bez daty zostaja
   * (strona moze byc ucieta w polowie dnia).
   *
   * Zwraca null, gdy brak widoku lub widok pusty - caller powinien
   * zrobic applyMailbox. Zwraca liczby {updated, added, removed}.
   */
  syncMailboxPage(
    box: MailBox,
    entries: MailboxEntry[],
    truncated: boolean,
    pruneNewerThan?: string,
  ): { updated: number; added: number; removed: number } | null {
    const view = this.current.boxes[box];
    if (!view || view.empty !== null) return null;
    const key = contentKeyOfEntry;
    const isoDay = (e: MailboxEntry): string | null => {
      if (!e.date) return null;
      const p = (n: number) => String(n).padStart(2, '0');
      return `${e.date.year}-${p(e.date.month)}-${p(e.date.day)}`;
    };
    // Fala 34: parowanie WYLACZNIE w obrebie bloku glowy (wpisy z
    // ostatniego listingu pierwszej strony, NA KONCU tablicy). Starsze
    // strony doklejone PRZODEM sa z innych dni - nie biora udzialu w
    // parowaniu (numeracja stron jest wzgledna, wpis z innego
    // listingu o tym samym numerze to INNY list). Blizniaki paruja
    // dowolnie (sa nierozroznialne), ale liczba wierszy zalezy od
    // liczby wystapien na swiezej stronie.
    const all = view.entries;
    const headCount = Math.min(view.headCount, all.length);
    const older = all.slice(0, all.length - headCount);
    const head = all.slice(all.length - headCount);
    const headSlots = new Map<string, number[]>();
    head.forEach((e, i) => {
      const k = key(e);
      const list = headSlots.get(k);
      if (list) list.push(i);
      else headSlots.set(k, [i]);
    });
    const used = new Set<number>();
    // newHead[i] = null: stary wpis nieparujacy (kandydat do usuniecia)
    const newHead: Array<MailboxEntry | null> = head.map(() => null);
    let updated = 0;
    let added = 0;
    for (const e of entries) {
      const free = headSlots.get(key(e))?.find((i) => !used.has(i));
      if (free === undefined) {
        newHead.push(e);
        added += 1;
      } else {
        used.add(free);
        newHead[free] = e;
        updated += 1;
      }
    }
    // Nieparujace wpisy bloku glowy: kompletny listing = pelna prawda
    // serwera (wypadaja); przy ucieciu wypadaja tylko wpisy SCISLE
    // nowsze niz granica dnia (strona ciagla od najnowszego - brak =
    // pewne skasowanie); dzien graniczny, starsze i wpisy bez daty
    // zostaja (strona moze byc ucieta w polowie dnia).
    let removed = 0;
    let keptHead: MailboxEntry[];
    if (!truncated) {
      removed += newHead.filter((e) => e === null).length;
      keptHead = newHead.filter((e): e is MailboxEntry => e !== null);
    } else if (pruneNewerThan !== undefined) {
      keptHead = [];
      for (let i = 0; i < newHead.length; i++) {
        const slot = newHead[i];
        if (slot === null) {
          const day = isoDay(head[i]!);
          if (day !== null && day > pruneNewerThan) {
            removed += 1;
            continue;
          }
          keptHead.push(head[i]!);
        } else {
          keptHead.push(slot);
        }
      }
    } else {
      keptHead = newHead.map((e, i) => e ?? head[i]!);
    }
    let next = [...older, ...keptHead];
    if (!truncated) {
      // Kompletny listing raportuje CALA skrzynke: starsze strony tez
      // podlegaja prawdzie serwera - wypadki ponad liczbe wystapien
      // z listingu (np. blizniak skasowany na serwerze).
      const freshCounts = new Map<string, number>();
      for (const e of entries) {
        const k = key(e);
        freshCounts.set(k, (freshCounts.get(k) ?? 0) + 1);
      }
      const keptOlder = older.filter((e) => {
        const c = freshCounts.get(key(e)) ?? 0;
        if (c > 0) {
          freshCounts.set(key(e), c - 1);
          return true;
        }
        return false;
      });
      removed += older.length - keptOlder.length;
      next = [...keptOlder, ...keptHead];
    }
    const nextView: BoxView = {
      entries: next,
      truncated,
      empty: null,
      headCount: keptHead.length,
    };
    const boxes = { ...this.current.boxes, [box]: nextView };
    const b = computeBadges(boxes);
    this.update({ boxes, badge: b.unread, badgeUnsent: b.unsent });
    return { updated, added, removed };
  }

  /**
   * Usuwa z widoku skrzynki wpisy, ktorych rekord archiwum oznaczono
   * jako nieobecny na serwerze (Fala 30c). Gone-marking dotyka archiwum;
   * bez tego widoku martwy wpis zostawal klikalny ("Nie ma tego listu
   * na liscie"). Lokalne, zero komend; zwraca liczbe usunietych.
   */
  pruneMailboxEntries(box: MailBox, goneIds: Set<string>): number {
    const view = this.current.boxes[box];
    if (!view || view.empty !== null || goneIds.size === 0) return 0;
    const id = (e: MailboxEntry): string =>
      letterId(box, e.party, e.subject, e.forwarded, e.date?.raw ?? null);
    const kept = view.entries.filter((e) => !goneIds.has(id(e)));
    const removed = view.entries.length - kept.length;
    if (removed === 0) return 0;
    // Fala 34: wypadki moga nalezec do bloku glowy - korekta licznika,
    // zeby sync nie traktowal pozycji ze starszych stron jak glowy.
    const headCount = Math.min(view.headCount, view.entries.length);
    const removedFromHead = view.entries
      .slice(view.entries.length - headCount)
      .filter((e) => goneIds.has(id(e))).length;
    const boxes = {
      ...this.current.boxes,
      [box]: { ...view, entries: kept, headCount: Math.max(0, headCount - removedFromHead) },
    };
    const b = computeBadges(boxes);
    this.update({ boxes, badge: b.unread, badgeUnsent: b.unsent });
    return removed;
  }

  setDeletionBox(box: MailBox): void {
    this.update({
      deletion: {
        ...this.current.deletion,
        box,
        command: null,
        result: null,
        selected: [],
        message: null,
        revision: this.current.deletion.revision + 1,
        armedAt: 0,
      },
    });
  }

  // Commit filtrow z ekranu (przycisk 'Szukaj / Odswiez'). Celowo NIE kasuje
  // wyniku / zaznaczenia / polecenia: wpisanie litery w pole nie jest
  // 'szukaj', a repaint po kazdym znaku skasowalby liste pod palcem.
  // Stare wyniki nadal wisza az do skonczonego wyszukiwania
  // (applyDeletionResult / clearDeletionResult z osobna garda rewizji).
  // armedAt: 0 - nowy draft = nowa intencja, zamknieta potwierdzanie.
  setDeletionFilters(filters: DeletionFilters): void {
    this.update({
      deletion: {
        ...this.current.deletion,
        filters: { ...filters },
        revision: this.current.deletion.revision + 1,
        armedAt: 0,
      },
    });
  }

  applyDeletionResult(box: MailBox, command: string, result: MailboxResult): void {
    const limited = result.kind === 'lista'
      ? { ...result, entries: result.entries.slice(0, 50) }
      : result;
    this.update({
      deletion: {
        ...this.current.deletion,
        box,
        command,
        result: limited,
        selected: [],
        message: null,
        revision: this.current.deletion.revision + 1,
        armedAt: 0,
      },
    });
  }

  /** Uzbrojenie potwierdzenia usuwania (zgloszenie 2026-10-30). Bez
   *  podbicia revision: to stan czysto UI, nie sygnal nieaktualnosci
   *  wynikow - guardy sesji usuwania maja zostac nietknięte. */
  armDeletionConfirm(): void {
    this.update({ deletion: { ...this.current.deletion, armedAt: Date.now() } });
  }

  disarmDeletionConfirm(): void {
    if (this.current.deletion.armedAt === 0) return;
    this.update({ deletion: { ...this.current.deletion, armedAt: 0 } });
  }

  toggleDeletionEntry(number: number): void {
    const current = this.current.deletion;
    if (current.result?.kind !== 'lista') return;
    if (!current.result.entries.some((entry) => entry.number === number)) return;
    const selected = current.selected.includes(number)
      ? current.selected.filter((value) => value !== number)
      : [...current.selected, number];
    this.update({ deletion: { ...current, selected } });
  }

  selectAllDeletionEntries(): void {
    const current = this.current.deletion;
    if (current.result?.kind !== 'lista') return;
    this.update({
      deletion: {
        ...current,
        selected: current.result.entries.map((entry) => entry.number),
      },
    });
  }

  clearDeletionSelection(): void {
    const current = this.current.deletion;
    if (current.selected.length === 0) return;
    this.update({ deletion: { ...current, selected: [] } });
  }

  clearDeletionResult(message: string | null): void {
    const current = this.current.deletion;
    this.update({
      deletion: {
        ...current,
        result: null,
        selected: [],
        message,
        revision: current.revision + 1,
        armedAt: 0,
      },
    });
  }

  resetDeletion(): void {
    this.update({ deletion: deletionState(this.current.deletion.revision + 1) });
  }

  setBusy(label: string | null): void {
    this.update({ busy: label });
  }

  setLoadAll(loadAll: { box: MailBox; pages: number } | null): void {
    this.update({ loadAll });
  }

  setArchiveDownload(
    archiveDownload: { done: number; total: number; etaMs: number | null } | null,
  ): void {
    this.update({ archiveDownload });
  }

  setIndexMeta(indexMeta: Partial<Record<MailBox, string>>): void {
    this.update({ indexMeta });
  }

  setIndexRun(indexRun: { boxIndex: number; box: MailBox; pages: number } | null): void {
    this.update({ indexRun });
  }

  setArchiveGaps(archiveGaps: Partial<Record<MailBox, string[]>>): void {
    this.update({ archiveGaps });
  }

  setSearch(search: { box: MailBox; label: string } | null): void {
    this.update({ search });
  }

  /**
   * Wpisy wynikow szukania ZASTEPUJA widok skrzynki; pelny widok
   * chowany jest do schowka (pierwszy raz na skrzynke - powtorne
   * szukanie nie nadpisuje schowka wynikami). Przywrocenie przez
   * clearSearch - bez strzalu do serwera.
   */
  applySearchResults(box: MailBox, result: MailboxResult): void {
    if (!(box in this.stashedViews)) {
      const current = this.current.boxes[box];
      if (current) this.stashedViews[box] = current;
    }
    this.applyMailbox(box, result);
  }

  /** Przywraca schowany pelny widok skrzynki i konczy tryb szukania. */
  clearSearch(box: MailBox): void {
    const stashed = this.stashedViews[box];
    delete this.stashedViews[box];
    const patch: Partial<MailUiState> = { search: null };
    if (stashed) {
      const boxes = { ...this.current.boxes, [box]: stashed };
      patch.boxes = boxes;
      const b = computeBadges(boxes);
      patch.badge = b.unread;
      patch.badgeUnsent = b.unsent;
    }
    this.update(patch);
  }

  /**
   * Kasuje tryb szukania BEZ przywracania schowka - dla swiezego
   * refresha skrzynki (nowy listing i tak nadpisze widok).
   */
  clearSearchBoxes(boxes: MailBox[]): void {
    for (const b of boxes) delete this.stashedViews[b];
    if (this.current.search && boxes.includes(this.current.search.box)) {
      this.update({ search: null });
    }
  }

  /**
   * Zakladka, do ktorej wraca Zamknij list (Fala 17d, zgloszenie
   * pkt 2): list otwarty z Archiwum zamyka sie DO Archiwum, nie na
   * Listy. Zapisywana przy openLetter z zakladki innej niz 'list'
   * (openLetter nad otwartym listem nie nadpisuje pierwszego zrodla).
   */
  private letterReturnTab: UiTab | null = null;

  /**
   * Otwiera list i ZAWSZE go pokazuje (Fala 17d): waski -> zakladka
   * 'list', szeroki -> 'listy' (split: listing + list obok). Stary
   * kod w trybie szerokim zostawial zakladke bez zmian - klik w wpis
   * archiwum ladowal list niewidoczny dla gracza (zgloszenie pkt 2).
   */
  openLetter(box: MailBox, letter: LetterContent, source?: MailboxEntry): void {
    if (this.current.tab !== 'list') this.letterReturnTab = this.current.tab;
    const next: Partial<MailUiState> = { letter: { ...letter, box, source } };
    next.tab = this.current.wide ? 'listy' : 'list';
    this.update(next);
  }

  closeLetter(): void {
    // Fala 17d: powrot do zakladki zrodlowej (archiwum -> archiwum).
    const tab = this.letterReturnTab ?? 'listy';
    this.letterReturnTab = null;
    this.update({ letter: null, tab });
  }

  /**
   * Czysci pamiec podreczna pluginu (Fala 12e): widoki skrzynek,
   * archiwum (RAM; storage kasuje caller), kontakty, schowek wynikow
   * szukania i tryb szukania. ZACHOWUJE ustawienia (powiadomienia,
   * szablon/szerokosc compose) i otwarty list.
   */
  clearCacheData(): void {
    for (const b of Object.keys(this.stashedViews)) {
      delete this.stashedViews[b as MailBox];
    }
    this.update({
      boxes: {},
      archive: [],
      contacts: [],
      badge: 0,
      badgeUnsent: 0,
      indexMeta: {},
      archiveGaps: {},
      search: null,
      unsentFlash: false,
    });
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

  setAnimalFlying(animalFlying: boolean): void {
    this.update({ animalFlying });
  }

  setUnsentFlash(unsentFlash: boolean): void {
    this.update({ unsentFlash });
  }

  setCompose(prefs: { template?: LetterTemplate; width?: number }): void {
    const patch: Partial<MailUiState> = {};
    if (prefs.template !== undefined) patch.composeTemplate = prefs.template;
    if (prefs.width !== undefined) patch.composeWidth = prefs.width;
    this.update(patch);
  }

  /** Fala 16e: wyczyszczenie formularza compose po udanym zapisie/
   *  wyslaniu (render zeruje draft przy najblizszym renderze). */
  clearCompose(): void {
    this.update({ composeClearSeq: this.current.composeClearSeq + 1 });
  }

  private update(patch: Partial<MailUiState>): void {
    this.current = { ...this.current, ...patch };
    for (const cb of [...this.listeners]) cb(this.current);
  }
}

function computeBadges(boxes: Partial<Record<MailBox, BoxView>>): {
  unread: number;
  unsent: number;
} {
  const unreadBox = boxes.nieprzeczytane;
  const unread = unreadBox
    ? unreadBox.entries.length
    : (boxes.odebrane?.entries.filter((e) => !e.isRead).length ?? 0);
  const unsent = boxes.niewyslane?.entries.length ?? 0;
  return { unread, unsent };
}

/**
 * Fala 14d: suffix licznika dla zakladki Listy i klawisza stopki.
 * '(u)' gdy sa same nieprzeczytane, '(u/n)' gdy sa tez niewyslane,
 * '' gdy zero i zero. Liczby z listingow (GMCP daje tylko booleany).
 */
export function formatBadgeSuffix(unread: number, unsent: number): string {
  if (unread <= 0 && unsent <= 0) return '';
  return unsent > 0 ? ` (${unread}/${unsent})` : ` (${unread})`;
}
