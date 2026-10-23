/**
 * ArkMail - kompleksowy system pocztowy dla klienta Dargoth (Arkadia MUD).
 * Alias: /arkmail (otwiera/zamyka okno). Menu wtyczek: "ArkMail".
 * Klawisz w stopce klienta: ArkMail (badge z liczba nieprzeczytanych).
 *
 * Fala 4c: wiring - UI (MailUiStore + render) polaczone z sesjami
 * protokolu przez DargothTransport i SessionLock. Powiadomienie
 * "[ POCZTA ] Masz nowa poczte..." odswieza odebrane/nieprzeczytane.
 * Archiwum i ustawienia trwale w localStorage per postac.
 */

import type PluginApi from "plugin-api";
import type { PersistentPopupHandle, PopupMenuEntryHandle, FooterButtonHandle } from "plugin-api";
import {
  PLUGIN_VERSION,
  PLUGIN_BUILD_DATE,
  PLUGIN_NAME,
  PLUGIN_AUTHOR,
  PLUGIN_DESCRIPTION,
} from "./meta";
import type { MailBox } from "./core/protocol/types";
import { parseNotification, extractPagerPrompt, parseMailDate } from "./core/protocol/parser";
import { isEchoLine } from "./core/session/lines";
import { clearPagerOrphan, isPagerOrphanSuspected } from "./core/session/orphanPager";
import {
  olderListingCommand,
  nextDay,
  searchListingCommand,
  searchDescription,
} from "./core/protocol/commands";
import type { LetterTemplate } from "./core/letterRender";
import { contactsFromArchive } from "./core/contacts";
import {
  contentKeyOf,
  fromMailboxEntry,
  fromOpenedLetter,
  upsertLetters,
  type ArchiveLetter,
} from "./core/archive";
import { MailboxSession, type ListingCtx, type MailboxEntry } from "./core/session/mailbox";
import { humanizeMailError } from "./core/errors";
import { archiveExportEntries, letterTxt, txtFileName } from "./core/exportTxt";
import { buildZip } from "./core/zipStore";
import { downloadBlob } from "./ui/download";
import { PagerSession } from "./core/session/pager";
import { EditorSession } from "./core/session/editor";
import { SessionLock } from "./core/sessionLock";
import { DargothTransport } from "./adapters/dargothTransport";
import { CharStorage, type KVLike } from "./adapters/storage";
import { notify } from "./adapters/notify";
import { allBoxesIndexed, INDEX_BOXES, MailUiStore, formatBadgeSuffix } from "./ui/store";
import { mountMailUi, type MailUiHandlers } from "./ui/render";

const POPUP_ID = "arkmail";
const FOOTER_BUTTON_ID = "arkmail";
const FOOTER_STATE = "arkmail-poczta";
const ALIAS_REGEX = /^\/arkmail$/i;
const SESSION_OPTS = { timeoutMs: 8000, idleMs: 400 };
/** Bezpieczniki petli "Wczytaj wszystkie" (Fala 8e): twardy limit stron
 *  na jedno klikniecie i pauza miedzy stronami (grzecznosc wobec serwera). */
export const LOAD_ALL_MAX_PAGES = 40;
/** Prog szerokosci popupu dla ukladu dwupanelowego (Fala 10): >= 900px
 *  lista z lewej + podglad z prawej, nizej jeden panel (komorka). */
export const WIDE_MIN_WIDTH = 900;
export const LOAD_ALL_PACE_MS = 400;
/**
 * Fala 20d podniosla tempo stron w INDEKSACJI do 800 ms (zgloszenie
 * 2026-10-21: 400 ms/strone mlocilo wolny serwer - throttle "Listy
 * sa w tej chwili ladowane."). Fala 24d zdejmuje przyczyne: duplikat
 * strony dostaje proby z klepnieciem (INDEX_ANCHOR_RETRY_WAITS_MS),
 * wiec tempo wraca do 400 ms - tyle co reczne loadAll.
 */
export const INDEX_PACE_MS = 400;
/**
 * Fala 24d: proby powtorki kotwicy po duplikacie strony w indeksacji
 * (zgloszenie 2026-10-21 "pominiete wyslane / 3-4"). Kazda proba:
 * pauza (2,5 s, potem 4 s) + klepniecie listingu bazowego (odswieza
 * kontekst listingu serwera, Fala 14f: jeden globalny listing) i
 * dopiero powtorka kotwicy. Duplikat po wyczerpaniu prob = serwer
 * muli, skrzynka pomijana.
 */
export const INDEX_ANCHOR_RETRY_WAITS_MS = [2500, 4000, 4000];
/**
 * Fala 24f2: bezczynnosc w recznym trybie poczty gracza, po ktorej
 * tryb wygasa (gracz mogl przerwac sesje bez q/x). Aktywnosc =
 * prompt pagera albo kolejna komenda pocztowa.
 */
export const PLAYER_MAIL_MODE_IDLE_MS = 180_000;
/**
 * Fala 24e: wiek stampa indexMeta, po ktorym skrzynke przeczesujemy
 * znowu w calosci. Swiezszy stamp = przeczes incrementalny do klamry
 * (strony w calosci znanej z archiwum) - pelny przeces 4 skrzynek
 * mieli serwer i trwa minuty, a swieza baza go nie wymaga.
 */
export const INDEX_FULL_SWEEP_AGE_MS = 7 * 24 * 60 * 60 * 1000;
/**
 * Tryb przeczesu skrzynki w indeksacji (Fala 24e): 'full' gdy brak
 * stampa, stamp uszkodzony albo starszy niz INDEX_FULL_SWEEP_AGE_MS;
 * inaczej 'incremental' (stop na klamrze).
 */
export const indexSweepMode = (
  meta: Partial<Record<MailBox, string>>,
  box: MailBox,
  now: number,
): "full" | "incremental" => {
  const stamp = meta[box];
  if (stamp === undefined) return "full";
  const t = Date.parse(stamp);
  if (Number.isNaN(t)) return "full";
  return now - t > INDEX_FULL_SWEEP_AGE_MS ? "full" : "incremental";
};
/**
 * Odmowa guarda blokady sesji (Fala 21a): jedna stala zamiast 13
 * kopii zdania. Krotko i po ludzku.
 */
const SESSION_BUSY_MSG = "Poczekaj, az skoncze biezaca operacje.";

/**
 * Fala 24g: komendy gracza wchodzace w tryb poczty (ich pager jest
 * legalny - straznik sierot go nie rusza). Wersje skrocone obslugiwane
 * przez serwer: "list N" (log 2026-10-21), "listy <skrzynka>",
 * "przeczytaj list N", "poczta". Dopasowanie po prefiksie slowa.
 */
const MAIL_ENTRY_CMD_RE = /^\s*(?:list\b|listy\b|przec\w*|poczt\w*)/i;
/**
 * Timingu lotu zwierzecia pocztowego (Fala 13b). Obiekt (nie const
 * skalarne), zeby testy mogly podmienic wartosci przed init -
 * eksport ESM jest read-only z zewnatrz, wlasciwosci obiektu nie.
 * flightTimeoutMs: bezpiecznik konca lotu (roundtrip wg logow 20-50 s,
 * wiec 60 s z zapasem); sluchamWindowMs: okno na "Slucham?" po naszym
 * wyslaniu (Fala 13d).
 */
export const ANIMAL_TIMING = { flightTimeoutMs: 60000, sluchamWindowMs: 2000 };
/**
 * Kontekst listingu serwera (Fala 9a/14f): serwer ma JEDEN globalny
 * "biezacy listing" i interpretuje "przeczytaj list N" / "d N"
 * wzgledem niego. KAZDA komenda listujaca go nadpisuje - takze PUSTA
 * ("Nie masz zadnych..."; dowod: log 2026-10-19 04:22 - po pustym
 * listingu nieprzeczytanych "d N" dostalo "Zadne listy nie zostaly
 * wybrane."). Znacznik rosnie przy kazdym listingu pluginu; wpis jest
 * aktualny tylko, gdy jego ctx rowna sie biezacemu.
 */
let listingCtxSeq = 0;
let listingCtx: ListingCtx | null = null;
const ARCHIVE_KEY = "archiwum";
const NOTIFY_KEY = "powiadomienia";
const COMPOSE_KEY = "compose";
const INDEX_KEY = "indeks";

/** localStorage moze nie istniec (testy, starsze srodowiska) - awaria do RAM. */
function memoryKv(): KVLike {
  const map = new Map<string, string>();
  return {
    getItem: (k) => (map.has(k) ? map.get(k)! : null),
    setItem: (k, v) => void map.set(k, v),
    removeItem: (k) => void map.delete(k),
  };
}

let apiRef: PluginApi | null = null;
let popup: PersistentPopupHandle | null = null;
let menuHandle: PopupMenuEntryHandle | null = null;
let footerHandle: FooterButtonHandle | null = null;
let aliasId: string | null = null;
let transport: DargothTransport | null = null;
let store: MailUiStore | null = null;
let unmount: (() => void) | null = null;
let unsubBadge: (() => void) | null = null;
let wideObserver: ResizeObserver | null = null;
/** Timer bezpiecznika lotu zwierzecia (Fala 13b) - czyszczony w destroy. */
let animalTimer: ReturnType<typeof setTimeout> | null = null;
/** Timer okna "Slucham?" po naszym wyslaniu (Fala 13d) - czyszczony w destroy. */
let sluchamTimer: ReturnType<typeof setTimeout> | null = null;
/** Timer pulsowania Listy/Niewyslane po odlozeniu listu (Fala 14b) - czyszczony w destroy. */
let unsentFlashTimer: ReturnType<typeof setTimeout> | null = null;
/**
 * Fala 16a: opoznione retry odswiezenia odebranych po nowej poczcie.
 * Serwer aktualizuje skrzynke z lagiem po powiadomieniu (log 2026-10-19:
 * listing 2 s po "[ POCZTA ]" jeszcze bez listu, dopiero reczny refresh
 * ~22 s pozniej go mial) - natychmiastowy refresh dostaje stary stan,
 * a zadne kolejne zdarzenie nie strzela. Retry po 10 s i 25 s lapia lag.
 * Timery czyszczone w destroy; seria powiadomien restartuje sekwencje.
 */
let delayedInboxTimers: ReturnType<typeof setTimeout>[] = [];
const DELAYED_INBOX_RETRY_MS = [10_000, 25_000];

function createContent(): HTMLDivElement {
  const root = document.createElement("div");
  // Fala 11c: lancuch wysokosci od popupu (klient daje .plugin-popup-content
  // flex:1 min-height:0) - bez tego .arkmail-root height:100% nie trzyma
  // i panele nie scrolluja sie niezaleznie.
  root.style.height = "100%";
  root.style.minHeight = "0";
  if (unmount) {
    unmount();
    unmount = null;
  }
  if (wideObserver) {
    wideObserver.disconnect();
    wideObserver = null;
  }
  if (store && handlersRef) {
    unmount = mountMailUi(root, store, handlersRef);
    // Szerokosc popupu -> uklad (Fala 10): >= WIDE_MIN_WIDTH dwa panele,
    // nizej jeden. ResizeObserver strzela od razu po observe, wiec uklad
    // startuje poprawny. Srodowisko bez ResizeObserver zostaje na waskim.
    if (typeof ResizeObserver !== "undefined") {
      const s = store;
      wideObserver = new ResizeObserver((entries) => {
        const w = entries[0]?.contentRect.width ?? 0;
        s.setWide(w >= WIDE_MIN_WIDTH);
      });
      wideObserver.observe(root);
    }
  }
  return root;
}

let handlersRef: MailUiHandlers | null = null;

export async function init(api: PluginApi) {
  apiRef = api;

  const kv: KVLike = typeof localStorage !== "undefined" ? localStorage : memoryKv();
  const storage = new CharStorage(kv);
  transport = new DargothTransport(api);
  const lock = new SessionLock();
  // Fala 16j: linie pocztowe (cls 'mail') przychodzace pod blokada sesji
  // to odpowiedzi na komendy pluginu - tlumione w glownym oknie gry.
  // Reczne "listy" gracza i powiadomienia POCZTA przychodza poza
  // blokada i zostaja widoczne.
  // Fala 28h: WYJATEK compose - krotki dialog (prompty Adresat:/Temat:/
  // DW:, numeracja, wynik ok/blad), nie spam. Pod compose linie mail
  // przechodza do okna, zeby gracz widzial, co pisze i co odpowiedzial
  // serwer. Listingi/tresci (spam) gagowane jak dotychczas.
  let composeVisible = false;
  transport.setGagPredicate(() => lock.locked && !composeVisible);
  const composePrefs = storage.getJSON<{ template?: LetterTemplate; width?: number }>(COMPOSE_KEY);
  store = new MailUiStore({
    notifyEnabled: storage.getJSON<boolean>(NOTIFY_KEY) ?? false,
    archive: storage.getJSON<ArchiveLetter[]>(ARCHIVE_KEY) ?? [],
    composeTemplate: composePrefs?.template ?? "plain",
    composeWidth: composePrefs?.width ?? 60,
    // Fala 18c: flagi kompletnej indeksacji skrzynek (brama Kontaktow).
    indexMeta: storage.getJSON<Partial<Record<MailBox, string>>>(INDEX_KEY) ?? {},
  });
  const ui = store;
  const mailbox = new MailboxSession(transport, SESSION_OPTS);
  const pager = new PagerSession(transport, SESSION_OPTS);
  const editor = new EditorSession(transport, SESSION_OPTS);

  // Nazwa postaci -> przestrzen kluczy storage.
  api.events.on("gmcp.char.info", (d) => {
    if (d?.name) storage.setCharacter(d.name);
  });

  /**
   * Kontakty WYLACZNIE z korespondencji (nadawcy/adresaci) - bez
   * doklejania calej bazy znanych osob klienta. (Decyzja uzytkownika,
   * Fala 7b: zakladka Kontakty ma pokazywac tylko osoby, z ktorymi jest
   * realna poczta.)
   * Fala 14a: liczniki z ARCHIWUM, nie z zaladowanych widokow - widok
   * skrzynki to domyslnie pierwsze 50 wpisow i licznik skakal/znikal
   * po refreshu (zgloszenie 2026-10-19); archiwum kumuluje kazdy
   * pobrany listing i przetrwa refresh oraz restart.
   */
  const rebuildContacts = (): void => {
    ui.setContacts(contactsFromArchive(ui.state.archive));
  };

  /**
   * Fala 14b: po odlozeniu listu w niewyslanych (compose poza poczta lub
   * przekazanie) pulsuja zakladka Listy i skrzynka Niewyslane (~3 s), zeby
   * uzytkownik widzial, GDZIE list trafil. Ponowne odlozenie przedluza
   * pulsowanie (restart timera).
   */
  const flashUnsent = (): void => {
    ui.setUnsentFlash(true);
    if (unsentFlashTimer !== null) clearTimeout(unsentFlashTimer);
    unsentFlashTimer = setTimeout(() => {
      unsentFlashTimer = null;
      ui.setUnsentFlash(false);
    }, 3000);
  };

  /**
   * Pobranie skrzynek. Tryb "sync" (domyslny, Fala 12b): swieza strona
   * SYNCHRONIZUJE sie z widokiem - znane wpisy aktualizowane w miejscu,
   * nowe doklejane na koncu (najnowszy), wczytane starsze strony
   * ZOSTAJA. Tryb "replace": pelna wymiana widoku (po skasowaniu listu
   * - lista ma zniknac natychmiast, nawet z ucietych listingow).
   * Kontrakt sync: ui/store.ts syncMailboxPage, tests/syncMailbox.test.ts.
   */
  /** Wnetrze refreshBoxes: pobranie i zastosowanie listingow (pod lockiem). */
  const fetchBoxes = async (boxes: MailBox[], mode: "sync" | "replace"): Promise<void> => {
    for (const box of boxes) {
      ui.setBusy(`Pobieram skrzynke ${box}...`);
      const res = await mailbox.fetch(box);
      // Fala 14f: pusty listing TEZ nadpisuje biezacy kontekst serwera.
      if (res.kind === "lista") stampEntries(box, res.entries);
      else bumpCtx(box);
      // Fala 30b: granica dnia strony (najstarszy dzien swiezego
      // listingu) - przy UCIETYM listingu wpisy scisle nowsze, ktorych
      // strona nie raportuje, na pewno zniknely z serwera (strona jest
      // ciagla od najnowszego). Usuwamy je z widoku i oznaczamy w
      // archiwum. Dzien graniczny nietkniety (strona moze byc ucieta
      // w polowie dnia) - wzorzec zakresowy jak w Fali 24e.
      const boundaryDay = ((): string | undefined => {
        if (res.kind !== "lista") return undefined;
        const oldest = oldestEntry(res.entries);
        if (!oldest?.date) return undefined;
        const p = (n: number): string => String(n).padStart(2, "0");
        return `${oldest.date.year}-${p(oldest.date.month)}-${p(oldest.date.day)}`;
      })();
      if (res.kind === "lista" && mode === "sync") {
        // null = brak widoku / widok pusty -> pelne zastosowanie.
        const synced = ui.syncMailboxPage(box, res.entries, res.header.truncated, boundaryDay);
        if (!synced) ui.applyMailbox(box, res);
      } else {
        ui.applyMailbox(box, res);
      }
      if (res.kind === "lista") {
        // Cache (Fala 8f): KAZDE pobranie listingu dokleja wpisy do
        // archiwum (cicho, bez notify). Widok skrzynki NIE jest
        // hydratowany z cache - numery zyja w kontekscie ostatniego
        // listingu serwera.
        const freshIds = new Set(res.entries.map((e) => fromMailboxEntry(box, e).id));
        const merged = upsertLetters(
          ui.state.archive,
          res.entries.map((e) => fromMailboxEntry(box, e)),
        );
        ui.setArchive(merged.letters);
        // Fala 18a: KOMPLTNY listing (bez uciecia) = pelna prawda o
        // skrzynce (jak syncMailboxPage dla widoku, Fala 14f). Rekordy
        // nieobecne oznaczamy jako znikniete - znikaja z widoku
        // archiwum i licznikow kontaktow. Tylko tutaj: to jedyna
        // sciezka z NIEfiltrowana komenda "listy <skrzynka>" (szukanie,
        // re-kotwice i paginacje maja wlasne komendy i call-site'y).
        if (!res.header.truncated) {
          markGoneFromServer(box, freshIds);
        } else if (boundaryDay !== undefined) {
          // Fala 30b: przy ucietym listingu oznaczamy zakresowo -
          // tylko rekordy scisle nowsze niz granica dnia strony.
          markGoneFromServerNewerThan(box, freshIds, boundaryDay);
        }
      } else if (res.reason === "puste") {
        // Pusta skrzynka (reason "puste", nie "filtr") = pelna prawda:
        // wszystkie jej rekordy zniknely z serwera.
        markGoneFromServer(box, new Set());
      }
    }
  };

  /**
   * Fala 18a: oznacza rekordy archiwum danej skrzynki nieobecne
   * w freshIds jako znikniete z serwera (cicho, jak upsert). Wywolywane
   * WYLACZNIE przy pewnoscia kompletnego listingu (patrz fetchBoxes).
   */
  const markGoneFromServer = (box: MailBox, freshIds: Set<string>): void => {
    let changed = false;
    const marked = ui.state.archive.map((l) => {
      if (l.box !== box || l.missingOnServer === true || freshIds.has(l.id)) return l;
      changed = true;
      return { ...l, missingOnServer: true };
    });
    if (changed) {
      ui.setArchive(marked);
      persistArchive();
    }
  };

  /**
   * Fala 24e: gone-marking ZAKRESOWY po klamrze przeczesu
   * incrementalnego. Klamra zatrzymuje przeces na przecieciu z baza,
   * wiec pelny markGoneFromServer oznaczylby niesprawdzone rekordy.
   * Oznaczamy tylko rekordy NOWSZE niz boundaryDay (najstarszy dzien
   * widziany w tej petli): strony listingu sa ciagle od najnowszego,
   * wiec wszystko nowsze musialo przejsc przez pobrane strony. Dzien
   * graniczny (<= boundaryDay) nietkniety - klamra mogla uciac go
   * w polowie strony.
   */
  const markGoneFromServerNewerThan = (
    box: MailBox,
    freshIds: Set<string>,
    boundaryDay: string,
  ): void => {
    let changed = false;
    const marked = ui.state.archive.map((l) => {
      if (l.box !== box || l.missingOnServer === true || freshIds.has(l.id)) return l;
      if (l.sortKey.slice(0, 10) <= boundaryDay) return l;
      changed = true;
      return { ...l, missingOnServer: true };
    });
    if (changed) {
      ui.setArchive(marked);
      persistArchive();
    }
  };

  const refreshBoxes = (boxes: MailBox[], mode: "sync" | "replace" = "sync"): void => {
    // Swiezy listing nadpisuje widok - tryb wynikow szukania na tych
    // skrzynkach przestaje obowiazywac (bez przywracania schowka).
    ui.clearSearchBoxes(boxes);
    void lock
      .runExclusive(() => fetchBoxes(boxes, mode))
      .catch(() => {})
      .finally(() => {
        ui.setBusy(null);
        rebuildContacts();
        persistArchive();
      });
  };

  // Fala 16c: reconnect/re-login uniewaznia kontekst listingu serwera.
  // Nowa sesja serwera NIE MA "biezacego listingu" - wpisy sprzed
  // polaczenia musza przejsc re-kotwice, inaczej "przeczytaj list N"
  // leci na pusto ("Zadne listy nie zostaly wybrane.", log 2026-10-19
  // 17:13:14; zgloszenie pkt 3/13 "klikam i nie moge wyswietlic listu").
  // Po uniewaznieniu auto-refresh daje widokowi swieze stemple.
  const invalidateOnReconnect = (): void => {
    listingCtx = null;
    refreshBoxes(["odebrane", "nieprzeczytane", "wyslane", "niewyslane"]);
  };
  api.events.on("client.connect", invalidateOnReconnect);
  // Disconnect: listing serwera i tak nie przetrwa - samo uniewaznienie.
  api.events.on("client.disconnect", () => {
    listingCtx = null;
    // Fala 24f2: rozlaczenie konczy tez reczny tryb poczty (bez
    // drenazu - i tak nie ma polaczenia).
    playerMailMode = false;
    clearPlayerMailModeTimer();
  });

  /**
   * Koalescencja odswiezen ze zdarzen zewnetrznych (Fala 13a): powiadomienie
   * tekstowe i GMCP Mail.State zwykle przychodza RAZEM (to samo zdarzenie
   * serwera) - bez zbiornika kazde zrodlo kolejkowaloby osobny refresh,
   * marnujac komendy i blokade. Skrzynki laduja w zbiorniku; jedna sesja
   * drenażuja pobiera caly aktywny zbior; zdarzenia naplywajace w trakcie
   * drenażu odpalaja dokladnie jedna kolejna ture.
   */
  const pendingRefresh = new Set<MailBox>();
  let drainScheduled = false;
  /**
   * Fala 24f2: reczny tryb czytania poczty gracza (zgloszenie
   * 2026-10-21: "ArkMail blokowal wpisywanie komend jak sie wyswietla
   * list recznie"). Wejscie: echo komendy pocztowej gracza poza
   * blokada; wyjscie: echo q/x albo bezczynnosc
   * (PLAYER_MAIL_MODE_IDLE_MS). W trakcie trybu scheduleRefresh
   * PARKUJE - pager gracza zjadlby komende listujaca, a straznik
   * desynchronizacji moglby odpowiedziec "q" i zabic jego sesje
   * (mechanika Fali 17a/24g).
   */
  let playerMailMode = false;
  let playerMailModeTimer: ReturnType<typeof setTimeout> | null = null;
  const scheduleRefresh = (boxes: MailBox[]): void => {
    for (const b of boxes) pendingRefresh.add(b);
    // Fala 24f2: w recznym trybie poczty gracza zadna komenda pluginu
    // nie wychodzi - parkujemy do jego wyjscia z trybu.
    if (playerMailMode) return;
    if (drainScheduled) return;
    drainScheduled = true;
    void lock
      .runExclusive(async () => {
        const batch = [...pendingRefresh];
        pendingRefresh.clear();
        ui.clearSearchBoxes(batch);
        await fetchBoxes(batch, "sync");
      })
      .catch(() => {})
      .finally(() => {
        ui.setBusy(null);
        rebuildContacts();
        persistArchive();
        drainScheduled = false;
        if (pendingRefresh.size > 0) scheduleRefresh([]);
      });
  };

  const clearPlayerMailModeTimer = (): void => {
    if (playerMailModeTimer !== null) {
      clearTimeout(playerMailModeTimer);
      playerMailModeTimer = null;
    }
  };
  const exitPlayerMailMode = (): void => {
    if (!playerMailMode) return;
    playerMailMode = false;
    clearPlayerMailModeTimer();
    // Fala 24f2: po sesji gracza inbox na pewno wymaga weryfikacji
    // (mogl czytac/kasowac) + drenaz wszystkiego, co zaparkowane
    // (pendingRefresh zbiera tez skrzynki z Fali 24f3).
    scheduleRefresh(["odebrane", "nieprzeczytane"]);
  };
  const armPlayerMailModeIdle = (): void => {
    clearPlayerMailModeTimer();
    playerMailModeTimer = setTimeout(() => {
      playerMailModeTimer = null;
      exitPlayerMailMode();
    }, PLAYER_MAIL_MODE_IDLE_MS);
  };
  const enterPlayerMailMode = (): void => {
    playerMailMode = true;
    armPlayerMailModeIdle();
  };

  /** Fala 16a: retry refreshu odebranych po lagu serwera (szczegoly przy
   *  DELAYED_INBOX_RETRY_MS). Koalescencja przez sam scheduleRefresh. */
  const scheduleDelayedInboxRefresh = (): void => {
    for (const t of delayedInboxTimers) clearTimeout(t);
    delayedInboxTimers = DELAYED_INBOX_RETRY_MS.map((ms) =>
      setTimeout(() => scheduleRefresh(["odebrane", "nieprzeczytane"]), ms),
    );
  };

  /**
   * GMCP Mail.State (Fala 13a): deklaratywne zrodlo prawdy o skrzynkach.
   * Serwer wysyla je po zalogowaniu oraz przy otrzymywaniu i czytaniu
   * poczty; klient emituje jako "gmcp.mail.state" (path lowercasowany
   * w gmcp.ts). Po co, skoro sa linie tekstowe: one potrafia sie rozjechac
   * ze stanem (log 2026-01-04 01:03 - "Masz nowa poczte od Bar.", a 15 s
   * pozniej przy ladowaniu zwierzecia "Nie masz zadnych nieprzeczytanych
   * listow.", choć list byl w skrzynce). GMCP jest WYZWALACZEM odswiezenia;
   * badge nadal liczy sie z listingow (computeBadge).
   *
   * Kontrakt: pierwsza ramka po starcie odswieza tylko grupy z flaga true;
   * kolejne ramki reaguja na ZMIANE pola (obie strony: true->false tez,
   * bo poczte mozna przeczytac na fizycznej poczcie); identyczna ramka
   * nic nie robi; ramka bez trzech booleanow jest ignorowana.
   */
  let lastMailState: { unread: boolean; unreceived: boolean; unsent: boolean } | null = null;
  api.events.on("gmcp.mail.state", (d) => {
    if (!d || typeof d !== "object") return;
    const s = d as { unread?: unknown; unreceived?: unknown; unsent?: unknown };
    if (
      typeof s.unread !== "boolean" ||
      typeof s.unreceived !== "boolean" ||
      typeof s.unsent !== "boolean"
    ) {
      return;
    }
    const cur = { unread: s.unread, unreceived: s.unreceived, unsent: s.unsent };
    const prev = lastMailState;
    if (
      prev &&
      cur.unread === prev.unread &&
      cur.unreceived === prev.unreceived &&
      cur.unsent === prev.unsent
    ) {
      return;
    }
    lastMailState = cur;
    const boxes = new Set<MailBox>();
    const inboxTouched = prev
      ? cur.unread !== prev.unread || cur.unreceived !== prev.unreceived
      : cur.unread || cur.unreceived;
    if (inboxTouched) {
      boxes.add("odebrane");
      boxes.add("nieprzeczytane");
    }
    if (prev ? cur.unsent !== prev.unsent : cur.unsent) {
      boxes.add("niewyslane");
      boxes.add("wyslane");
    }
    if (boxes.size > 0) scheduleRefresh([...boxes]);
  });

  const persistArchive = (): void => {
    storage.setJSON(ARCHIVE_KEY, ui.state.archive);
  };

  /** Fala 18c: flagi kompletnej indeksacji skrzynek (brama Kontaktow). */
  const persistIndexMeta = (): void => {
    storage.setJSON(INDEX_KEY, ui.state.indexMeta);
  };

  /**
   * Najstarszy wpis widoku: listing idzie od NAJSTARSZEGO listu (gora)
   * do najnowszego (dol), ale liczymy minimum po dacie - odporne na
   * kolejnosc wpisow. Dowod: log sesji 2026-10-17.
   */
  const oldestEntry = (entries: MailboxEntry[]): MailboxEntry | null => {
    let oldest: MailboxEntry | null = null;
    for (const e of entries) {
      if (!e.date) continue;
      if (
        !oldest ||
        e.date.year < oldest.date!.year ||
        (e.date.year === oldest.date!.year &&
          (e.date.month < oldest.date!.month ||
            (e.date.month === oldest.date!.month &&
              (e.date.day < oldest.date!.day ||
                (e.date.day === oldest.date!.day &&
                  e.date.time < oldest.date!.time)))))
      ) {
        oldest = e;
      }
    }
    return oldest;
  };

  /** Klucz tozsamosci wpisu - BEZ numeru (serwer renumeruje strony). */
  const entryKey = (e: MailboxEntry): string =>
    [e.party, e.subject, e.forwarded ? "f" : "", e.date?.raw ?? ""].join("|");

  /**
   * Bump kontekstu po KAZDYM listingu (Fala 14f) - takze pustym, bo
   * serwer nadpisuje swoj biezacy listing kazda komenda listujaca.
   */
  const bumpCtx = (box: MailBox): void => {
    listingCtxSeq += 1;
    listingCtx = { box, stamp: listingCtxSeq };
  };

  /** Nadaje wpisom kontekst biezacego listingu serwera (Fala 9a). */
  const stampEntries = (box: MailBox, entries: MailboxEntry[]): void => {
    bumpCtx(box);
    for (const e of entries) e.ctx = { box, stamp: listingCtxSeq };
  };

  /**
   * Swiezy wpis do operacji pagerowej (Fala 9a). Wpis z biezacego
   * kontekstu idzie od razu; stary -> re-kotwica: listing po dacie listu
   * (serwerowe "przed" wyklucza dzien graniczny, wiec dzien PO dacie)
   * i odnalezienie wpisu po tozsamosci. Numer NIGDY nie leci do serwera
   * bezposrednio z UI - zawsze z tego tlumaczenia. Null = nie znaleziono
   * (komunikat dla gracza, zadna komenda nie wylatuje na slepo).
   */
  const resolveEntry = async (box: MailBox, entry: MailboxEntry): Promise<MailboxEntry | null> => {
    if (
      entry.ctx !== undefined &&
      listingCtx !== null &&
      entry.ctx.stamp === listingCtx.stamp &&
      entry.ctx.box === listingCtx.box
    ) {
      return entry;
    }
    if (!entry.date) {
      notify(api, "Nie moge znalezc tego listu - odswiez skrzynke.");
      return null;
    }
    const res = await mailbox.fetch(box, olderListingCommand(box, nextDay(entry.date)));
    // Fala 14f: takze pusta re-kotwica nadpisuje biezacy listing serwera.
    if (res.kind !== "lista") bumpCtx(box);
    if (res.kind === "lista") {
      stampEntries(box, res.entries);
      // Jak kazde pobranie listingu: cicho do archiwum.
      const merged = upsertLetters(
        ui.state.archive,
        res.entries.map((e) => fromMailboxEntry(box, e)),
      );
      ui.setArchive(merged.letters);
      persistArchive();
      const fresh = res.entries.find((e) => entryKey(e) === entryKey(entry));
      if (fresh) return fresh;
    }
    notify(api, "Nie ma tego listu na liscie - odswiez skrzynke.");
    return null;
  };

  /** Paginacja wstecz: jedna starsza strona listingow do archiwum. */
  const loadOlder = (box: MailBox): void => {
    ui.setBusy("Wczytuje starsze listy...");
    void lock
      .runExclusive(async () => {
        // Fala 20e: kotwica liczona POD blokada, ze swiezego widoku
        // (porzadek jeden: stan czytamy po wejsciu do sesji, nie przed).
        const view = ui.state.boxes[box];
        const oldest = oldestEntry(view?.entries ?? []);
        if (!oldest?.date) {
          notify(api, "Nie mozna wczytac starszych - najpierw pobierz skrzynke.");
          return;
        }
        // Kotwica: najstarsza data + 1 dzien ("przed" wyklucza caly
        // dzien graniczny; nakladanie zamiast dziur, dedup zdejmuje
        // duplikaty).
        const res = await mailbox.fetch(box, olderListingCommand(box, nextDay(oldest.date)));
        if (res.kind === "lista") {
          stampEntries(box, res.entries);
          ui.appendMailboxPage(box, res.entries, res.header.truncated);
          const incoming = res.entries.map((e) => fromMailboxEntry(box, e));
          const merged = upsertLetters(ui.state.archive, incoming);
          ui.setArchive(merged.letters);
          persistArchive();
          notify(api, `Wczytano starsze listy (nowych: ${merged.added}).`);
        } else {
          bumpCtx(box); // Fala 14f: pusta strona tez nadpisuje kontekst
          ui.appendMailboxPage(box, [], false);
          notify(api, "Brak starszych listow.");
        }
      })
      .catch((err: unknown) =>
        // Fala 17f: technikalia sesji przez mapper na ludzki polski.
        notify(api, `Blad wczytywania starszych: ${humanizeMailError(err instanceof Error ? err.message : String(err))}`),
      )
      .finally(() => {
        ui.setBusy(null);
        // Fala 24b: doczytana strona = nowe osoby w archiwum - kontakty
        // odbudowujemy od razu, nie dopiero przy refreshu/indeksacji.
        rebuildContacts();
      });
  };

  /** Flaga biezacej petli "Wczytaj wszystkie" (jedna na raz; null = brak). */
  let loadAllFlag: { cancelled: boolean } | null = null;

  /** Pauza miedzy stronami, przerywalna flaga (plastry po 50 ms). */
  const sleepOrCancel = async (ms: number, flag: { cancelled: boolean }): Promise<void> => {
    const step = 50;
    for (let t = 0; t < ms && !flag.cancelled; t += step) {
      await new Promise((r) => setTimeout(r, Math.min(step, ms - t)));
    }
  };

  /**
   * Petla "Wczytaj wszystkie": kolejne strony starszych listingow pod
   * JEDNA blokada sesji. Koniec: strona niepelna / pusta, limit stron
   * albo Przerwij (drugi klik tego samego przycisku). Kazda strona
   * doklejana jest przez appendMailboxPage (dedup), archiwum zapisywane
   * po kazdej stronie.
   */
  const loadAll = (box: MailBox): void => {
    if (loadAllFlag) {
      loadAllFlag.cancelled = true;
      return;
    }
    // Fala 20e: guard PO fladze cancel - drugi klik wlasnej petli to
    // Przerwij, nie odmowa. Przy cudzej sesji: odmowa zamiast cichego
    // zakolejkowania ciezkiej petli (40 stron ruszaloby "znikad",
    // audyt race-condition 2026-10-21).
    if (lock.locked) {
      notify(api, SESSION_BUSY_MSG);
      return;
    }
    const flag = { cancelled: false };
    loadAllFlag = flag;
    ui.setLoadAll({ box, pages: 0 });
    void lock
      .runExclusive(async () => {
        let pages = 0;
        let added = 0;
        try {
          for (;;) {
            const view = ui.state.boxes[box];
            if (!view || !view.truncated) break;
            if (pages >= LOAD_ALL_MAX_PAGES) break;
            if (flag.cancelled) break;
            const oldest = oldestEntry(view.entries);
            if (!oldest?.date) break;
            // Kotwica jak w loadOlder: najstarsza data + 1 dzien.
            const res = await mailbox.fetch(box, olderListingCommand(box, nextDay(oldest.date)));
            pages += 1;
            let more = false;
            if (res.kind === "lista") {
              stampEntries(box, res.entries);
              const freshCount = ui.appendMailboxPage(box, res.entries, res.header.truncated);
              const merged = upsertLetters(
                ui.state.archive,
                res.entries.map((e) => fromMailboxEntry(box, e)),
              );
              ui.setArchive(merged.letters);
              persistArchive();
              added += merged.added;
              // Fala 9d (straznik mielenia): strona bez NOWYCH wpisow =
              // kotwica stoi w miejscu (np. ogon ponad 50 listow jednego
              // dnia) - dalsze strony bylyby identyczne, petla staje mimo
              // suffixu uciecia.
              more = res.header.truncated && freshCount > 0;
            } else {
              bumpCtx(box); // Fala 14f: pusta strona tez nadpisuje kontekst
              ui.appendMailboxPage(box, [], false);
            }
            ui.setLoadAll({ box, pages });
            // Fala 28d: wielokropek jak w "Wczytuje starsze listy..." -
            // to postep operacji w toku, nie komunikat zamkniety.
            ui.setBusy(`Wczytuje wszystkie (${box}): strona ${pages}...`);
            if (!more || flag.cancelled) break;
            await sleepOrCancel(LOAD_ALL_PACE_MS, flag);
          }
          if (flag.cancelled) {
            notify(api, `Przerwano (nowych listow: ${added}).`);
          } else if (pages >= LOAD_ALL_MAX_PAGES && ui.state.boxes[box]?.truncated) {
            notify(
              api,
              `Limit ${LOAD_ALL_MAX_PAGES} stron (listow: ${added}) - kliknij ponownie, aby kontynuowac.`,
            );
          } else {
            // Fala 24c: petla zatrzymana naturalnie (widok bez suffixu
            // uciecia, bez Przerwij i bez limitu stron) = kompletny
            // listing skrzynki - ta sama pewnosc co przy pelnej
            // indeksacji (Fala 18a): gone-marking z widoku + stamp
            // indexMeta (brama Kontaktow moze odpasc bez indeksacji).
            const done = ui.state.boxes[box];
            if (done && !done.truncated) {
              markGoneFromServer(
                box,
                new Set(done.entries.map((e) => fromMailboxEntry(box, e).id)),
              );
              ui.setIndexMeta({ ...ui.state.indexMeta, [box]: new Date().toISOString() });
              persistIndexMeta();
            }
            notify(api, `Wczytano wszystkie (nowych listow: ${added}).`);
          }
        } finally {
          loadAllFlag = null;
          ui.setLoadAll(null);
        }
      })
      .catch((err: unknown) =>
        notify(api, `Blad wczytywania: ${humanizeMailError(err instanceof Error ? err.message : String(err))}`),
      )
      .finally(() => {
        ui.setBusy(null);
        // Fala 24b: jak wyzej - petla dopisala listy do archiwum,
        // kontakty maja odzwierciedlac baze bez dodatkowego kliku.
        rebuildContacts();
      });
  };

  /** Flaga biezacej petli "Indeksuj wszystkie skrzynki" (null = brak). */
  let indexFlag: { cancelled: boolean } | null = null;
  /**
   * Kontynuacja po pelnej indeksacji (Fala 18c): guardy przyciskow
   * przy pustej niezindeksowanej bazie odpalaja indeksacje, a po niej
   * automatycznie wlasciwa akcje ('download') albo wskazowke ('export').
   */
  let indexContinuation: null | "download" | "export" = null;

  /**
   * Petla "Indeksuj wszystkie skrzynki" (Fala 18c, zgloszenie
   * 2026-10-20 pkt 1): pelny listing KAZDEJ skrzynki (kotwice
   * paginacji jak loadAll, tempo INDEX_PACE_MS - Fala 20d), kazda
   * strona doklejana do archiwum. Po KOMPLETNYM przejsciu skrzynki:
   * gone-marking (markGoneFromServer - ta sama pewnosco kompletnej
   * prawdy co przy nieobcietym listingu w fetchBoxes) i flaga
   * indexMeta[box]. Dopiero pelny indeks czyni archiwum kompletna
   * podstawa licznikow kontaktow (brama Kontaktow w render.ts).
   * Widoku skrzynek NIE dotyka (badge'y zyja z listingow
   * jednostronicowych). Drugi klik przycisku = Przerwij. Skrzynka
   * niedomknieta (mielenie kotwicy / limit stron / Przerwij) = stop
   * calej petli bez flagi dla niej.
   */
  const indexAllBoxes = (): void => {
    if (indexFlag) {
      indexFlag.cancelled = true;
      return;
    }
    if (lock.locked) {
      notify(api, SESSION_BUSY_MSG);
      return;
    }
    const flag = { cancelled: false };
    indexFlag = flag;
    let done = 0;
    // Fala 19a: skrzynki pominiete (kotwica bez postepu / limit stron)
    // z powodem - petla jedzie dalej, raport koncowy je wymienia.
    const skipped: string[] = [];
    void lock
      .runExclusive(async () => {
        try {
          for (let i = 0; i < INDEX_BOXES.length; i++) {
            const box = INDEX_BOXES[i]!;
            if (flag.cancelled) break;
            ui.setIndexRun({ boxIndex: i, box, pages: 0 });
            ui.setBusy(`Indeksuje skrzynke ${box} (${i + 1}/${INDEX_BOXES.length})...`);
            const seen = new Set<string>();
            const all: MailboxEntry[] = [];
            let pages = 0;
            let complete = false;
            let skipWhy: string | null = null;
            // Fala 24e: tryb przeczesu ze stampa (swiezy = incrementalny
            // do klamry) + dzien najstarszego wpisu widzianego w petli
            // (granica zakresowego gone-markingu po klamrze).
            const sweepMode = indexSweepMode(ui.state.indexMeta, box, Date.now());
            let oldestSeenDay: string | null = null;
            let clamped = false;
            // Fala 24d: duplikat strony to zwykle incydent (powtorka
            // odpowiedzi serwera albo zdewanieowany kontekst listingu),
            // nie trwale mielenie - kotwice powtarzamy do 3 razy, przed
            // kazda proba pauza i klepniecie listingu bazowego
            // (INDEX_ANCHOR_RETRY_WAITS_MS). Dopiero duplikat po
            // wyczerpaniu prob potwierdza mielenie.
            let anchorRetries = 0;
            // Fala 26c: znacznik sondy sciany granulacji dziennej
            // (jedna sonda na epizod duplikatow; reset przy stronie
            // ze swiezymi wpisami).
            let wallProbed = false;
            let res = await mailbox.fetch(box);
            for (;;) {
              if (res.kind === "lista") {
                pages += 1;
                ui.setIndexRun({ boxIndex: i, box, pages });
                const entries = res.entries.map((e) => fromMailboxEntry(box, e));
                // Straznik mielenia jak w loadAll (Fala 9d): strona bez
                // NOWYCH wpisow = kotwica stoi w miejscu - stop bez flagi.
                const freshCount = entries.filter((e) => !seen.has(e.id)).length;
                for (const e of entries) seen.add(e.id);
                for (const e of entries) {
                  const day = e.sortKey.slice(0, 10);
                  if (oldestSeenDay === null || day < oldestSeenDay) oldestSeenDay = day;
                }
                all.push(...res.entries);
                const merged = upsertLetters(ui.state.archive, entries);
                ui.setArchive(merged.letters);
                persistArchive();
                if (!res.header.truncated) {
                  complete = true;
                  break;
                }
                if (freshCount === 0) {
                  const oldestDup = oldestEntry(all);
                  if (!oldestDup?.date) {
                    skipWhy = "brak daty w wpisach";
                    break;
                  }
                  const attempt = anchorRetries;
                  if (attempt < INDEX_ANCHOR_RETRY_WAITS_MS.length) {
                    anchorRetries += 1;
                    await sleepOrCancel(INDEX_ANCHOR_RETRY_WAITS_MS[attempt]!, flag);
                    if (flag.cancelled) break;
                    // Fala 24d: klepniecie - swiezy listing bazowy
                    // odswieza kontekst listingu serwera (Fala 14f),
                    // dopiero potem powtorka kotwicy. Wynik pomijany.
                    await mailbox.fetch(box);
                    if (flag.cancelled) break;
                    res = await mailbox.fetch(
                      box,
                      olderListingCommand(box, nextDay(oldestDup.date)),
                    );
                    continue;
                  }
                  // Fala 26c (zgloszenie 2026-10-22): zanim uznamy
                  // mielenie, sonda kotwica WYKLUCZAJACA dzien graniczny
                  // ("przed D" zamiast "przed D+1"). Strona jednodniowa
                  // ucieta strukturalnie zwraca duplikat na kotwice
                  // z nextDay (serwer wyklucza tylko dzien graniczny),
                  // co NIE jest mieleniem - sonda rozroznia: swieze
                  // starsze wpisy = sciana pokonana i paginacja jedzie
                  // dalej; pusto = skrzynka kompletna (Fala 19a);
                  // zwrot dnia D mimo wykluczenia = serwer lamie filtr
                  // daty i dopiero to jest trwale mielenie. Koszt
                  // sondy przy prawdziwej scianie: ogien dnia D ponad
                  // limit strony jest i tak nieosiagalny kotwicami
                  // dziennymi.
                  if (!wallProbed) {
                    wallProbed = true;
                    res = await mailbox.fetch(box, olderListingCommand(box, oldestDup.date));
                    continue;
                  }
                  // Fala 20c/24d: powod pomieciecia PO LUDZKU - gracz
                  // nie zna "kotwic" ani "postepu". Mielenie potwierdza
                  // dopiero duplikat po wyczerpaniu prob z klepnieciem
                  // ORAZ odpowiedz sondy z dniem wykluczonym (Fala 26c).
                  skipWhy = "serwer chwilowo muli - sprobuj ponownie za chwile";
                  break;
                }
                anchorRetries = 0;
                wallProbed = false;
                // Fala 24e: tryb incrementalny - strona W CALOSCI
                // znana z archiwum (upsert bez nowych), a NIE
                // powtorzona z tej petli (powtorki wylapuje straznik
                // mielenia wyzej: freshCount === 0) = KLAMRA.
                // Dotarlismy do przeciecia z posiadana baza - dalszy
                // przeces jest zbedny.
                if (sweepMode === "incremental" && merged.added === 0) {
                  clamped = true;
                  break;
                }
                if (pages >= LOAD_ALL_MAX_PAGES) {
                  skipWhy = `limit ${LOAD_ALL_MAX_PAGES} stron`;
                  break;
                }
                if (flag.cancelled) break;
                const oldest = oldestEntry(all);
                if (!oldest?.date) {
                  skipWhy = "brak daty w wpisach";
                  break;
                }
                await sleepOrCancel(INDEX_PACE_MS, flag);
                if (flag.cancelled) break;
                res = await mailbox.fetch(box, olderListingCommand(box, nextDay(oldest.date)));
              } else {
                // Fala 19a (zgloszenie 2026-10-20): KAZDA zaakceptowana
                // pusta odpowiedz = kompletna prawda o skrzynce. Wariant
                // 'puste' ("Nie masz zadnych ... listow.") na pustej
                // skrzynce; wariant 'filtr' ("Nie znaleziono zadnych
                // takich ...") na pustej skrzynce wyslanych (serwer
                // traktuje wyslane jako selekcje - fixture z loga
                // 2026-10-18) ORAZ na pustej stronie kotwicowej (brak
                // starszych = koniec paginacji, jak w loadAll). Straznik
                // desynchronizacji w mailbox.fetch odfiltrowal odpowiedzi
                // za inne skrzynki - tu dociera tylko odpowiedz za
                // zadana. Przed Fala 19a 'filtr' zabijal petle bez flagi
                // ("2 z 4" i martwa petla).
                complete = true;
                break;
              }
            }
            if ((complete || clamped) && !flag.cancelled) {
              if (clamped) {
                // Fala 24e: klamra = przeces do przeciecia z baza.
                // Gone-marking ZAKRESOWY (tylko nowsze niz najstarszy
                // widziany dzien) i BEZ stampa - stamp to pelna
                // weryfikacja, daje ja dopiero naturalny koniec stron
                // (pelny przeces) albo loadAll (Fala 24c).
                markGoneFromServerNewerThan(box, seen, oldestSeenDay ?? "");
              } else {
                markGoneFromServer(box, seen);
                ui.setIndexMeta({ ...ui.state.indexMeta, [box]: new Date().toISOString() });
                persistIndexMeta();
              }
              done += 1;
            } else if (flag.cancelled) {
              break;
            } else {
              // Fala 19a: skrzynka niedomknieta nie zabija petli -
              // jedziemy dalej, raport koncowy ja wymieni.
              skipped.push(`${box} (${skipWhy ?? "niekompletne"})`);
            }
          }
          if (flag.cancelled) {
            notify(
              api,
              `Przerwano indeksowanie (zindeksowane skrzynki: ${done} z ${INDEX_BOXES.length}).`,
            );
          } else if (skipped.length === 0) {
            rebuildContacts();
            notify(
              api,
              `Zindeksowano wszystkie skrzynki (listow w bazie: ${ui.state.archive.length}).`,
            );
          } else {
            rebuildContacts(); // czesciowy indeks tez odswieza liczniki
            notify(
              api,
              `Indeksowanie niekompletne - pominiete: ${skipped.join(", ")}. ` +
                `Pozostale skrzynki zindeksowane.`,
            );
          }
        } finally {
          indexFlag = null;
          ui.setIndexRun(null);
          ui.setBusy(null);
        }
      })
      .catch((err: unknown) =>
        notify(api, `Blad indeksowania: ${humanizeMailError(err instanceof Error ? err.message : String(err))}`),
      )
      .finally(() => {
        // Kontynuacja guardow PO zwolnieniu blokady sesji (finally
        // runExclusive wykonuje sie po release). Tylko przy pelnym
        // indeksie - przerwana petla nie odpala akcji nastepczej.
        const cont = indexContinuation;
        indexContinuation = null;
        if (!allBoxesIndexed(ui.state.indexMeta)) return;
        if (cont === "download") downloadArchiveBodies();
        else if (cont === "export") {
          notify(api, "Indeksacja zakonczona - kliknij ponownie Zapisz wszystkie (ZIP).");
        }
      });
  };

  /**
   * Maszyna lotu zwierzecia pocztowego (Fala 13b). Lot = blokada przycisku
   * do ladowania albo timeoutu. Start: klik (onSendAnimal) albo linia
   * 'wysylasz' z gry (gracz wpisal komende recznie). Koniec: linia
   * 'powrot-zwierzecia' albo ANIMAL_TIMING.flightTimeoutMs (bezpiecznik;
   * serwerowy cooldown przy spamie nie jest znany - brak dowodu w logach).
   */
  let animalFlight = false;
  /**
   * Okno "Slucham?" (Fala 13d): uzbrojone tylko po NASZYM wyslaniu
   * "wyslij zwierze" i tylko do potwierdzenia linia 'wysylasz' albo
   * konca okna. "Slucham?" to generyczny blad parsera serwera (~250x
   * rozmaitych komend w jednej sesji logow) - globalna reakcja na nie
   * łapalaby cudze bledy.
   */
  let sluchamArmed = false;
  const disarmSlucham = (): void => {
    sluchamArmed = false;
    if (sluchamTimer !== null) {
      clearTimeout(sluchamTimer);
      sluchamTimer = null;
    }
  };
  const armSluchamWindow = (): void => {
    sluchamArmed = true;
    if (sluchamTimer !== null) clearTimeout(sluchamTimer);
    sluchamTimer = setTimeout(() => {
      sluchamTimer = null;
      sluchamArmed = false;
    }, ANIMAL_TIMING.sluchamWindowMs);
  };
  const endAnimalFlight = (): void => {
    animalFlight = false;
    if (animalTimer !== null) {
      clearTimeout(animalTimer);
      animalTimer = null;
    }
    ui.setAnimalFlying(false);
  };
  const startAnimalFlight = (): void => {
    animalFlight = true;
    if (animalTimer !== null) clearTimeout(animalTimer);
    animalTimer = setTimeout(() => {
      animalTimer = null;
      if (animalFlight) endAnimalFlight();
    }, ANIMAL_TIMING.flightTimeoutMs);
    ui.setAnimalFlying(true);
  };

  /**
   * Odczyt listu przez re-kotwice (Fala 9a) z druga szansa po zniknieciu
   * listingu (Fala 16c). Wspolna sciezka dla kliku w liste skrzynki
   * i w wpis archiwum bez tresci (Fala 16h). WYMAGA locka (caller).
   */
  const openWithResolve = async (box: MailBox, entry: MailboxEntry): Promise<void> => {
    // Fala 16c: blad "listing serwera zniknal" (re-login, cudzy
    // listing gracza miedzy operacjami - log 2026-10-19 17:13:14)
    // dostaje JEDNA druga szanse: wymuszamy re-kotwice (bumpCtx
    // uniewaznia dopasowanie kontekstu) i ponawiamy odczyt.
    // Powtorka bledu = toast, bez trzeciej proby.
    for (let attempt = 0; attempt < 2; attempt++) {
      // Re-kotwiczenie (Fala 9a): numer serwera dopiero ze swiezego
      // kontekstu; brak wpisu = zadna komenda nie wylatuje.
      const fresh = await resolveEntry(box, entry);
      if (!fresh) return;
      transport!.beginModal();
      try {
        const res = await pager.readLetter(fresh.number);
        ui.openLetter(box, res.letter, fresh);
        // Cache (Fala 8f): tresc listu do archiwum. Swiezy wpis
        // daje zgodnosc id (flaga forwarded) z rekordem z listingu.
        const merged = upsertLetters(ui.state.archive, [
          fromOpenedLetter(box, res.letter, fresh),
        ]);
        ui.setArchive(merged.letters);
        persistArchive();
        // Fala 11f: po odczycie swiezy listing skrzynki - znacznik
        // przeczytania i badge to prawda serwerowa (plugin niczego
        // nie zaznacza lokalnie). W trybie wynikow szukania pomijamy:
        // refresh czysci selekcje i wywalilby gracza z wynikow.
        if (ui.state.search?.box !== box) refreshBoxes([box]);
        return;
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        const listingGone =
          /nie zostaly wybrane|Zly numer listu/.test(msg);
        if (attempt === 0 && listingGone) {
          bumpCtx(box); // wymuszenie re-kotwicy w drugiej probie
          continue;
        }
        throw err;
      } finally {
        transport!.endModal();
      }
    }
  };

  /**
   * Pseudo-wpis skrzynki z rekordu archiwum (Fala 16h): ctx undefined
   * -> resolveEntry zawsze idzie przez re-kotwice po dacie. Wspolne
   * dla kliku w wpis archiwum i petli pobierania tresci (Fala 16i).
   */
  const archivePseudoEntry = (letter: ArchiveLetter, box?: MailBox): MailboxEntry => ({
    number: letter.number,
    isRead: letter.read,
    subject: letter.subject,
    forwarded: letter.forwarded === true,
    party: letter.party,
    partyKind:
      (box ?? letter.box) === "odebrane" || (box ?? letter.box) === "nieprzeczytane"
        ? "nadawca"
        : "odbiorcy",
    date: letter.dateRaw ? parseMailDate(letter.dateRaw) : null,
  });

  /**
   * Wynik doczytu tresci (Fala 17c): 'ok' = tresc pobrana; 'missing' =
   * listu nie ma na swiezym listingu (zniknal z serwera - caller
   * oznacza rekord i pomija go w kolejnych uruchomieniach); 'error' =
   * porazka przejsciowa (timeout, sierocy pager, przerwanie).
   */
  type FetchBodyResult =
    | { kind: "ok"; body: string[] }
    | { kind: "missing" }
    | { kind: "error" };

  /**
   * Doczyt tresci jednego rekordu archiwum (Fala 16i): ta sama sciezka
   * co openWithResolve (re-kotwica + druga szansa 16c), ale BEZ
   * otwierania listu w UI. WYMAGA locka (caller).
   * Fala 17a (zgloszenie pkt 4): resolveEntry W try - wyjatek z
   * re-kotwicy (timeout, sierocy pager, linia-blad serwera) jest
   * pojedyncza porazka listu, NIE smiercia calej petli pobierania.
   * shouldAbort: Przerwij domyka pager w toku (patrz pager.readLetter).
   * Fala 17c (zgloszenie pkt 3): opcjonalny override skrzynki - petla
   * pobiera blizniaki przez skrzynke kanoniczna (odebrane), bo rekord
   * "nieprzeczytane" znika z listingu po przeczytaniu.
   */
  const fetchArchiveBody = async (
    letter: ArchiveLetter,
    opts?: { shouldAbort?: () => boolean; box?: MailBox },
  ): Promise<FetchBodyResult> => {
    const box = opts?.box ?? letter.box;
    const pseudo = archivePseudoEntry(letter, box);
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const fresh = await resolveEntry(box, pseudo);
        if (!fresh) return { kind: "missing" };
        transport!.beginModal();
        try {
          const res = await pager.readLetter(fresh.number, opts?.shouldAbort);
          const merged = upsertLetters(ui.state.archive, [
            fromOpenedLetter(box, res.letter, fresh),
          ]);
          ui.setArchive(merged.letters);
          persistArchive();
          return { kind: "ok", body: res.letter.body };
        } finally {
          transport!.endModal();
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        const listingGone = /nie zostaly wybrane|Zly numer listu/.test(msg);
        if (attempt === 0 && listingGone) {
          bumpCtx(box); // wymuszenie re-kotwicy w drugiej probie
          continue;
        }
        return { kind: "error" };
      }
    }
    return { kind: "error" };
  };

  /** Flaga biezacej petli pobierania tresci (jedna na raz; null = brak). */
  let archiveDownloadFlag: { cancelled: boolean } | null = null;

  /**
   * Petla "Pobierz tresci do archiwum" (Fala 16i, zgloszenie pkt 10):
   * kolejne listy bez tresci pod JEDNA blokada sesji, tempo jak loadAll.
   * Drugi klik przycisku = Przerwij. Blad pojedynczego listu nie zabija
   * petli - liczony i podsumowany na koncu.
   * Fala 17c (zgloszenie pkt 3): petla jest IDEMPOTENTNA - kandydaci
   * grupowani po kluczu tresci (blizniak pobierany raz), rekordy
   * znikniete z serwera oznaczane i pomijane przy restarcie.
   */
  const downloadArchiveBodies = (): void => {
    if (archiveDownloadFlag) {
      archiveDownloadFlag.cancelled = true;
      return;
    }
    if (lock.locked) {
      notify(api, SESSION_BUSY_MSG);
      return;
    }
    // Fala 18c (guard, zgloszenie 2026-10-20): pusta baza BEZ kompletnego
    // indeksu = najpierw indeksacja wszystkich skrzynek (mozliwe, ze
    // poczta w ogole nie byla pobierana), potem automatycznie pobieranie.
    if (ui.state.archive.length === 0 && !allBoxesIndexed(ui.state.indexMeta)) {
      notify(api, "Archiwum puste - najpierw kliknij Indeksuj wszystkie skrzynki.");
      indexContinuation = "download";
      indexAllBoxes();
      return;
    }
    // Bez daty nie ma re-kotwicy (Fala 16h) - takie listy zostaja.
    // Fala 17c: pomijamy tez rekordy oznaczone jako znikniete z serwera
    // (bez znacznika kazdy restart mielil zombie-wpisy do timeoutu).
    // Grupowanie po kluczu TRESCI (bez skrzynki): list nieprzeczytany
    // ma w archiwum blizniaka (nieprzeczytane + odebrane) - pobieramy
    // go RAZ, przez skrzynke kanoniczna.
    const groups = new Map<string, ArchiveLetter[]>();
    for (const l of ui.state.archive) {
      if (l.body.length > 0 || l.dateRaw === null || l.missingOnServer === true) continue;
      const key = contentKeyOf(l);
      const arr = groups.get(key);
      if (arr) arr.push(l);
      else groups.set(key, [l]);
    }
    const candidates = [...groups.values()];
    if (candidates.length === 0) {
      // Fala 18c: rozroznienie stanu "nic do pobrania" - kompletna baza
      // z tresciami vs faktycznie puste skrzynki (po pelnej indeksacji).
      // Pusta baza bez indeksu odfiltrowana wyzej przez guard.
      notify(
        api,
        ui.state.archive.length > 0
          ? "Wszystkie listy w bazie maja tresci."
          : "Skrzynki sa puste - nie ma czego pobierac.",
      );
      return;
    }
    const flag = { cancelled: false };
    archiveDownloadFlag = flag;
    const total = candidates.length;
    // Fala 18d (zgloszenie pkt 2): ETA z EMA po czasach ukonczen
    // kolejnych listow (fetch + pacing = realne tempo petli); alpha
    // 0.3 laguje pojedyncze dlugie odczyty. Pokazywane od 3
    // ukonczonych - wczesniej jest losowe.
    let emaMs: number | null = null;
    let lastAt = Date.now();
    ui.setArchiveDownload({ done: 0, total, etaMs: null });
    ui.setBusy(`Pobieram tresci do archiwum (0/${total})...`);
    void lock
      .runExclusive(async () => {
        let done = 0;
        let failed = 0;
        let missing = 0;
        try {
          for (const group of candidates) {
            if (flag.cancelled) break;
            // Kolejnosc prob: przychodzace przez "odebrane" (rekord
            // "nieprzeczytane" znika z listingu po przeczytaniu),
            // wychodzace przez "wyslane"; tylko skrzynki obecne
            // w grupie blizniakow.
            const present = new Set(group.map((l) => l.box));
            const order = (
              ["odebrane", "nieprzeczytane", "wyslane", "niewyslane"] as MailBox[]
            ).filter((b) => present.has(b));
            let result: FetchBodyResult = { kind: "error" };
            for (const box of order) {
              if (flag.cancelled) break;
              // Fala 17a: Przerwij domyka tez pager w toku (shouldAbort).
              result = await fetchArchiveBody(group[0], {
                shouldAbort: () => flag.cancelled,
                box,
              });
              if (result.kind === "ok") break;
            }
            if (result.kind === "ok") {
              done += 1;
              // Tresc do WSZYSTKICH rekordow blizniaczych grupy.
              const fill = group
                .filter((l) => l.body.length === 0)
                .map((l) => ({ ...l, body: result.body }));
              if (fill.length > 0) {
                const merged = upsertLetters(ui.state.archive, fill);
                ui.setArchive(merged.letters);
                persistArchive();
              }
            } else if (result.kind === "missing" && !flag.cancelled) {
              missing += 1;
              // Znacznik na calej grupie: restart petli je pomija.
              const marked = group.map((l) => ({ ...l, missingOnServer: true }));
              const merged = upsertLetters(ui.state.archive, marked);
              ui.setArchive(merged.letters);
              persistArchive();
            } else if (!flag.cancelled) {
              failed += 1;
            }
            const processed = done + failed + missing;
            const now = Date.now();
            const dt = now - lastAt;
            lastAt = now;
            emaMs = emaMs === null ? dt : 0.3 * dt + 0.7 * emaMs;
            const etaMs =
              processed >= 3 && emaMs !== null
                ? Math.max(1000, Math.round(emaMs * (total - processed)))
                : null;
            ui.setArchiveDownload({ done: processed, total, etaMs });
            ui.setBusy(
              `Pobieram tresci do archiwum (${processed}/${total})...`,
            );
            if (flag.cancelled) break;
            await sleepOrCancel(LOAD_ALL_PACE_MS, flag);
          }
          if (flag.cancelled) {
            notify(api, `Przerwano pobieranie tresci (pobrano: ${done} z ${total}).`);
          } else if (failed === 0 && missing === 0) {
            notify(api, `Pobrano tresci do archiwum (listow: ${done}).`);
          } else {
            const parts: string[] = [];
            if (failed > 0) parts.push(`nieudane: ${failed}`);
            if (missing > 0) parts.push(`zniknely z serwera: ${missing}`);
            notify(api, `Pobrano tresci (${done} z ${total}; ${parts.join("; ")}).`);
          }
        } finally {
          archiveDownloadFlag = null;
          ui.setArchiveDownload(null);
          ui.setBusy(null);
        }
      })
      .catch(() => notify(api, "Blad pobierania tresci do archiwum."));
  };

  handlersRef = {
    onSendAnimal: () => {
      // Jak przy innych operacjach (Fala 12a): zero cichego kolejkowania.
      if (lock.locked) {
        notify(api, SESSION_BUSY_MSG);
        return;
      }
      if (animalFlight) {
        notify(api, "Zwierze jest juz w drodze - poczekaj na jego powrot.");
        return;
      }
      startAnimalFlight();
      // Fala 28h: z echem - gracz widzi komende jak przy recznym
      // wpisaniu. Linie lotu (wyslanie/powrot/dostawa) i tak nie sa
      // gagowane - lot zwierzecia nie bierze blokady sesji.
      transport!.send("wyslij zwierze", true);
      armSluchamWindow();
    },
    onOpenLetter: (box, entry) => {
      // Fala 12a: sesje modalne NIE kolejkuja klikow - w trakcie wiszacej
      // operacji kolejna komenda odczytu wpadalaby w sierocy pager
      // ("Nie ma takiej komendy", log 2026-10-18). Komunikat zamiast kolejki.
      if (lock.locked) {
        notify(api, SESSION_BUSY_MSG);
        return;
      }
      ui.setBusy(`Czytam list: ${entry.subject}...`);
      void lock
        .runExclusive(() => openWithResolve(box, entry))
        .catch(() => notify(api, "Nie udalo sie odczytac listu."))
        .finally(() => ui.setBusy(null));
    },
    onOpenArchiveLetter: (letter) => {
      // Fala 16h: klikalne archiwum (zgloszenie pkt 9). Wpis z trescia
      // w cache otwiera sie z pamieci - ZERO komend do serwera.
      if (letter.body.length > 0) {
        const senderBox = letter.box === "odebrane" || letter.box === "nieprzeczytane";
        ui.openLetter(letter.box, {
          number: letter.number,
          from: senderBox ? letter.party : "",
          subject: letter.subject,
          to: senderBox ? "" : letter.party,
          cc: null,
          date: letter.dateRaw,
          body: letter.body,
        });
        return;
      }
      // Bez tresci: pseudo-wpis (ctx undefined -> zawsze re-kotwica po
      // dacie) i ta sama sciezka odczytu co klik w liste skrzynki.
      if (lock.locked) {
        notify(api, SESSION_BUSY_MSG);
        return;
      }
      ui.setBusy(`Czytam list: ${letter.subject}...`);
      const pseudo = archivePseudoEntry(letter);
      void lock
        .runExclusive(() => openWithResolve(letter.box, pseudo))
        .catch(() => notify(api, "Nie udalo sie odczytac listu."))
        .finally(() => ui.setBusy(null));
    },
    onDownloadArchiveBodies: () => downloadArchiveBodies(),
    // Fala 18c: indeksacja wszystkich skrzynek (brama Kontaktow,
    // guardy pobierania/eksportu).
    onIndexAll: () => indexAllBoxes(),
    // Fala 17g: eksporty TXT/ZIP - operacje czysto lokalne (dane
    // z cache), bez locka i bez komend do serwera.
    onExportLetter: () => {
      const l = ui.state.letter;
      if (!l) return;
      const sender = l.box === "odebrane" || l.box === "nieprzeczytane";
      const party = sender ? l.from : l.to || l.cc || "";
      const txt = letterTxt({
        subject: l.subject,
        from: l.from,
        to: l.to,
        cc: l.cc,
        date: l.date,
        box: l.box,
        body: l.body,
      });
      const blob = new Blob([txt], { type: "text/plain" });
      const ok = downloadBlob(txtFileName(party, l.subject, l.date), blob);
      notify(
        api,
        ok
          ? "Zapisano list do pliku TXT."
          : "Nie udalo sie zapisac pliku - klient nie obsluguje pobierania.",
      );
    },
    onExportArchive: () => {
      const { entries, skipped } = archiveExportEntries(ui.state.archive);
      if (entries.length === 0) {
        // Fala 18c (guard, zgloszenie 2026-10-20): pusta baza BEZ
        // kompletnego indeksu = najpierw indeksacja (mozliwe, ze poczta
        // w ogole nie byla pobierana); po pelnym indeksie "pusto"
        // znaczy faktycznie puste skrzynki.
        if (ui.state.archive.length === 0 && !allBoxesIndexed(ui.state.indexMeta)) {
          notify(api, "Archiwum puste - najpierw kliknij Indeksuj wszystkie skrzynki.");
          indexContinuation = "export";
          indexAllBoxes();
          return;
        }
        notify(
          api,
          ui.state.archive.length === 0
            ? "Skrzynki sa puste - nie ma czego zapisywac."
            : "Brak listow z tresci w archiwum - najpierw pobierz tresci.",
        );
        return;
      }
      const enc = new TextEncoder();
      const zip = buildZip(entries.map((e) => ({ name: e.name, data: enc.encode(e.txt) })));
      const now = new Date();
      const p2 = (n: number) => String(n).padStart(2, "0");
      const name =
        `arkmail_listy_${now.getFullYear()}-${p2(now.getMonth() + 1)}-${p2(now.getDate())}` +
        `_${p2(now.getHours())}${p2(now.getMinutes())}.zip`;
      // buildZip alokuje bufor dokladnie na wynik - buffer jest ArrayBuffer.
      const ok = downloadBlob(name, new Blob([zip.buffer as ArrayBuffer], { type: "application/zip" }));
      notify(
        api,
        ok
          ? `Zapisano listy do ZIP (plikow: ${entries.length})` +
              (skipped > 0 ? `; pominietych bez tresci: ${skipped}` : "") +
              "."
          : "Nie udalo sie zapisac pliku - klient nie obsluguje pobierania.",
      );
    },
    onSendCompose: (input) => {
      if (!input.adresat.trim() || !input.temat.trim()) {
        notify(api, "Adresat i temat sa wymagane.");
        return;
      }
      // Fala 12a: jak przy odczycie - zero cichego kolejkowania sesji.
      if (lock.locked) {
        notify(api, SESSION_BUSY_MSG);
        return;
      }
      ui.setBusy("Wysylam list...");
      void lock
        .runExclusive(async () => {
          transport!.beginModal();
          // Fala 28h: compose odgagowany na czas dialogu (patrz
          // setGagPredicate wyzej); finally przywraca gag nawet przy
          // bledzie/timeoutcie.
          composeVisible = true;
          try {
            const out = await editor.send({
              adresat: input.adresat.trim(),
              temat: input.temat,
              dw: input.dw.trim() === "" ? undefined : input.dw.trim(),
              linie: input.linie,
            });
            if (out.result === "wyslany") {
              notify(api, "List zostal wyslany.");
              refreshBoxes(["wyslane"]);
              // Fala 16e: po udanej wysylce formularz sie czysci
              // (zgloszenie pkt 12) - kolejny list zaczyna sie od zera.
              ui.clearCompose();
            } else if (out.result === "gotowy") {
              // Fala 16e: "zapisany", nie "odlozony" (zgloszenie pkt 1).
              notify(api, "List zapisany w niewyslanych.");
              refreshBoxes(["niewyslane"]);
              flashUnsent();
              ui.clearCompose();
            } else {
              notify(api, "Blad wysylki - sprawdz adresata.");
            }
          } finally {
            composeVisible = false;
            transport!.endModal();
          }
        })
        .catch(() => notify(api, "Blad wysylki listu."))
        .finally(() => ui.setBusy(null));
    },
    onCloseLetter: () => ui.closeLetter(),
    // Fala 20e: guardy w handlerach, NIE w refreshBoxes - wewnetrzny
    // refresh po wysylce/kasowaniu kolejkuje celowo (wołany z wnetrza
    // sesji). Klik gracza przy zajetej blokadzie: odmowa z toastem,
    // zero cichego kolejkowania komend (audyt race 2026-10-21).
    onRefreshBox: (box) => {
      if (lock.locked) {
        notify(api, SESSION_BUSY_MSG);
        return;
      }
      refreshBoxes([box]);
    },
    onLoadOlder: (box) => {
      if (lock.locked) {
        notify(api, SESSION_BUSY_MSG);
        return;
      }
      loadOlder(box);
    },
    onLoadAll: (box) => loadAll(box),
    onSearch: (box, query) => {
      if (lock.locked) {
        notify(api, SESSION_BUSY_MSG);
        return;
      }
      ui.setBusy(`Szukam w skrzynce ${box}...`);
      void lock
        .runExclusive(async () => {
          const res = await mailbox.fetch(box, searchListingCommand(box, query));
          // Fala 14f: puste wyniki szukania tez nadpisuja kontekst serwera.
          if (res.kind === "lista") stampEntries(box, res.entries);
          else bumpCtx(box);
          ui.setSearch({ box, label: searchDescription(box, query) });
          ui.applySearchResults(box, res);
          if (res.kind === "lista") {
            // Cache (jak przy kazdym listingu): wyniki tez do archiwum.
            const merged = upsertLetters(
              ui.state.archive,
              res.entries.map((e) => fromMailboxEntry(box, e)),
            );
            ui.setArchive(merged.letters);
            persistArchive();
            notify(api, `Wyniki szukania (listow: ${res.entries.length}).`);
          } else {
            notify(api, "Brak pasujacych listow.");
          }
        })
        .catch((err: unknown) =>
          notify(api, `Blad szukania: ${humanizeMailError(err instanceof Error ? err.message : String(err))}`),
        )
        .finally(() => ui.setBusy(null));
    },
    onClearSearch: (box) => ui.clearSearch(box),
    // Fala 12e: czyszczenie pamieci podrecznej na zadanie gracza.
    // Kasuje archiwum (storage + RAM), widoki skrzynek i kontakty;
    // ZACHOWUJE ustawienia (powiadomienia, szablon compose) - one nie
    // sa cache, tylko preferencje.
    onClearCache: () => {
      if (lock.locked) {
        notify(api, SESSION_BUSY_MSG);
        return;
      }
      storage.remove(ARCHIVE_KEY);
      ui.clearCacheData();
      notify(api, "Zapisane dane wyczyszczone.");
    },
    onDeleteLetter: (box, entry) => {
      // Fala 12a: zero cichego kolejkowania sesji modalnych.
      if (lock.locked) {
        notify(api, SESSION_BUSY_MSG);
        return;
      }
      ui.setBusy(`Usuwam list: ${entry.subject}...`);
      void lock
        .runExclusive(async () => {
          const fresh = await resolveEntry(box, entry);
          if (!fresh) return;
          transport!.beginModal();
          try {
            const res = await pager.deleteLetters(fresh.number, String(fresh.number));
            if (res.deleted) {
              // Fala 14e: sesja pagera (d N -> q) kasuje list FAKTYCZNIE
              // przy wyjsciu ("Kasuje: N.") - toast mowi o skutku.
              notify(api, "List zostal usuniety.");
              ui.closeLetter();
              // Replace (Fala 12b): skasowany list ma zniknac z widoku
              // natychmiast, nawet gdy listing jest uciety (sync bez
              // pelnego listingu nie usuwa wpisow).
              refreshBoxes([box], "replace");
            } else {
              notify(api, "Nie udalo sie skasowac listu.");
            }
          } finally {
            transport!.endModal();
          }
        })
        .catch(() => notify(api, "Blad kasowania listu."))
        .finally(() => ui.setBusy(null));
    },
    onForwardLetter: (box, entry, adresat) => {
      // Fala 12a: zero cichego kolejkowania sesji modalnych.
      if (lock.locked) {
        notify(api, SESSION_BUSY_MSG);
        return;
      }
      ui.setBusy(`Przekazuje list: ${entry.subject}...`);
      void lock
        .runExclusive(async () => {
          const fresh = await resolveEntry(box, entry);
          if (!fresh) return;
          transport!.beginModal();
          try {
            const res = await pager.forwardLetter(fresh.number, adresat);
            if (res.queued) {
              notify(api, "List przekazany - czeka w niewyslanych.");
              refreshBoxes(["niewyslane"]);
              flashUnsent();
            } else {
              notify(api, "Blad przekazania - sprawdz adresata.");
            }
          } finally {
            transport!.endModal();
          }
        })
        .catch(() => notify(api, "Blad przekazania listu."))
        .finally(() => ui.setBusy(null));
    },
  };

  // Straznik sierocych pagerow (Fala 11g, przebudowa Fala 24g).
  // Sierocy pager (po awarii NASZEJ sesji) konsumuje WSZYSTKIE komendy
  // gracza az do "q" - zamykamy go automatycznie. Ale prompt pagera
  // serwera jest identyczny z promptem trybu czytania poczty otwartego
  // RECZNIE przez gracza ("[1-50 ...] (aktualny: N) -- ") - Fala 11g
  // strzelala "q" na sam widok promptu i zabijala reczne sesje (log
  // 2026-10-21: "d" ladowalo jako ruch na dol, "?" dawalo pomoc gry
  // zamiast pomocy edytora; gracz musial odinstalowac wtyczke, zeby
  // skasowac list). Dlatego straznik odpala "q" WYLACZNIE przy
  // pozytywnym podejrzeniu (core/session/orphanPager.ts): flage stawiaja
  // awaryjne konce wlasnych sesji, zdejmuje kazda udana transakcja,
  // echo komendy pocztowej gracza i wyslanie "q" przez straznika.
  let lastWatchdogQ = 0;
  transport.subscribe((line) => {
    if (line.cls === "command" || isEchoLine(line.text)) {
      // Komenda gracza wchodzaca w tryb poczty: jego pager jest legalny
      // (a gdyby sierota istniala, zjadlaby te komende i straznik
      // domknie ja przy promptcie - tutaj czyscimy tylko prewencyjnie).
      const cmd = isEchoLine(line.text) ? line.text.replace(/^→\s*/, "") : line.text;
      if (MAIL_ENTRY_CMD_RE.test(cmd)) {
        clearPagerOrphan();
        // Fala 24f2: gracz wchodzi w poczte recznie - jego pager jest
        // legalny, plugin parkuje odswiezenia do wyjscia z trybu.
        // Pod blokada to nasza wlasna komenda - nie tryb gracza.
        if (!lock.locked) enterPlayerMailMode();
      } else if (playerMailMode && !lock.locked && /^(?:q|x)$/i.test(cmd.trim())) {
        // Fala 24f2: q/x konczy reczny tryb poczty gracza.
        exitPlayerMailMode();
      }
      return;
    }
    if (!extractPagerPrompt(line.text)) return;
    // Fala 24f2: prompt pagera w trybie gracza = aktywnosc, przedluza
    // wygasanie trybu (timer uzbroila juz komenda wejsciowa).
    if (playerMailMode) armPlayerMailModeIdle();
    if (lock.locked) return; // legalna sesja pagerowa pod blokada
    if (!isPagerOrphanSuspected()) return; // sesja gracza - nietknieta
    const now = Date.now();
    if (now - lastWatchdogQ < 2000) return; // cooldown: jedno q na serie
    lastWatchdogQ = now;
    transport!.send("q");
    // "q" to komenda-wyjscie pagera - po jej wyslaniu sieroty nie ma.
    clearPagerOrphan();
  });

  // Powiadomienia pocztowe: odswiezenie + opcjonalny tost.
  // Fala 13a: przez scheduleRefresh (koalescencja z GMCP Mail.State,
  // ktore zwykle przychodzi w parze z linia tekstowa).
  transport.subscribe((line) => {
    const n = parseNotification(line.text);
    if (!n) return;
    if (n.kind === "nowa-poczte") {
      if (ui.state.notifyEnabled) notify(api, `Masz nowa poczte od ${n.nadawca}.`);
      scheduleRefresh(["odebrane", "nieprzeczytane"]);
      scheduleDelayedInboxRefresh();
    } else if (n.kind === "goniec") {
      scheduleRefresh(["odebrane", "nieprzeczytane"]);
      scheduleDelayedInboxRefresh();
    } else if (n.kind === "wysylasz") {
      // Fala 13b: gracz wyslal zwierze recznie (komenda w gre) -
      // uzbrajamy lot, zeby przycisk nie zrobil duplikatu w locie.
      if (!animalFlight) startAnimalFlight();
      // Fala 13d: serwer potwierdzil wyslanie - okno "Slucham?" zamykane.
      disarmSlucham();
    } else if (n.kind === "slucham") {
      // Fala 13d: "Slucham?" w oknie po naszym wyslaniu = serwer nie zna
      // komendy, czyli brak zwierzecia pocztowego (log 2025-12-21).
      if (sluchamArmed) {
        disarmSlucham();
        endAnimalFlight();
        notify(api, "Zwierze nie odpowiada - sprawdz, czy masz zwierze pocztowe.");
      }
    } else if (n.kind === "powrot-zwierzecia") {
      // Fala 13b: powrot zwierzecia konczy lot; serwer przy ladowaniu
      // sam sprawdza nieprzeczytane, wiec inbox mogl sie zmienic.
      disarmSlucham();
      endAnimalFlight();
      // Fala 24f1: zwierze moglo dostarczyc niewyslane (przechodza do
      // wyslanych) i przyniesc nowe - odswiezamy wszystkie 4 skrzynki.
      scheduleRefresh(["odebrane", "nieprzeczytane", "niewyslane", "wyslane"]);
    } else if (n.kind === "list-wyslany") {
      // Fala 13c: dostawa niewyslanych przez zwierze (poza compose).
      // Pod lockiem pomijamy - sesja compose/edytora sama odswieza
      // skrzynki na koncu (inaczej kazdy compose mialby dodatkowy
      // dwa listingi z tej samej linii).
      if (!lock.locked) scheduleRefresh(["niewyslane", "wyslane"]);
    } else if (n.kind === "kasowanie") {
      // Fala 24f3: gracz kasuje listy RECZNIE (serwer przy zamykaniu
      // zaznaczonych) - wszystkie skrzynki moga sie zmienic. Pod
      // lockiem pomijamy (wlasne kasowanie z UI odswieza samo);
      // w recznym trybie poczty parkuje (Fala 24f2).
      if (!lock.locked)
        scheduleRefresh(["odebrane", "nieprzeczytane", "wyslane", "niewyslane"]);
    }
  });

  // Badge na klawiszu stopki.
  unsubBadge = ui.subscribe((s) => {
    // Fala 14d: '(u)' albo '(u/n)' (nieprzeczytane/niewyslane);
    // podswietlenie, gdy cokolwiek czeka.
    footerHandle?.update({ label: PLUGIN_NAME + formatBadgeSuffix(s.badge, s.badgeUnsent) });
    api.ui.setFooterButtonState(FOOTER_STATE, s.badge > 0 || s.badgeUnsent > 0);
    storage.setJSON(COMPOSE_KEY, { template: s.composeTemplate, width: s.composeWidth });
    storage.setJSON(NOTIFY_KEY, s.notifyEnabled);
  });

  popup = await api.ui.registerPersistentPopup({
    id: POPUP_ID,
    title: PLUGIN_NAME,
    // Start: szeroki dwupanelowy na normalnym ekranie, waski na komorce
    // (85vw). Rozmiar ustawiony przez gracza zawsze wygrywa z tymi
    // wartosciami - po zmianie domyslnego pomocny jest reset rozmiaru.
    initialWidth: "min(1400px, 85vw)",
    initialHeight: "min(850px, 80vh)",
    createContent,
  });

  const toggle = (): boolean => {
    if (!popup) return true;
    if (popup.isOpen) popup.close();
    else void popup.open();
    return true;
  };

  aliasId = api.aliases.register(ALIAS_REGEX, toggle);
  menuHandle = api.ui.addPopupMenuEntry(PLUGIN_NAME, () => {
    if (popup && !popup.isOpen) void popup.open();
  });
  footerHandle = api.ui.registerFooterButton(FOOTER_BUTTON_ID, {
    label: PLUGIN_NAME,
    command: "/arkmail",
    state: FOOTER_STATE,
  });

  return {
    name: PLUGIN_NAME,
    version: PLUGIN_VERSION,
    // Literal wymagany przez katalog dargoth-plugins (metadata.test.mjs
    // czyta author regexem, nie rozwinie const-ref); zgodnosc z meta.ts
    // pilnuje tests/version.test.mjs (Fala 22a).
    author: "Isithunzi000",
    description: PLUGIN_DESCRIPTION,
  };
}

export async function destroy() {
  if (animalTimer !== null) {
    clearTimeout(animalTimer);
    animalTimer = null;
  }
  if (sluchamTimer !== null) {
    clearTimeout(sluchamTimer);
    sluchamTimer = null;
  }
  if (unsentFlashTimer !== null) {
    clearTimeout(unsentFlashTimer);
    unsentFlashTimer = null;
  }
  for (const t of delayedInboxTimers) clearTimeout(t);
  delayedInboxTimers = [];
  if (unsubBadge) {
    unsubBadge();
    unsubBadge = null;
  }
  if (unmount) {
    unmount();
    unmount = null;
  }
  if (wideObserver) {
    wideObserver.disconnect();
    wideObserver = null;
  }
  if (transport) {
    transport.dispose();
    transport = null;
  }
  handlersRef = null;
  store = null;
  if (aliasId !== null && apiRef) {
    apiRef.aliases.remove(aliasId);
    aliasId = null;
  }
  if (footerHandle) {
    footerHandle.remove();
    footerHandle = null;
  }
  if (menuHandle) {
    menuHandle.remove();
    menuHandle = null;
  }
  if (popup) {
    popup.close();
    popup = null;
  }
  apiRef = null;
}
