/**
 * ArkMail - kompleksowy system pocztowy dla klienta Dargoth (Arkadia MUD).
 * Alias: /arkmail (otwiera/zamyka okno). Menu wtyczek: "ArkMail".
 * Klawisz w stopce klienta: ArkMail (badge z liczba nieprzeczytanych).
 *
 * Fala 4c: wiring - UI (MailUiStore + render) polaczone z sesjami
 * protokolu przez DargothTransport i SessionLock. Powiadomienie
 * "[ POCZTA ] Masz nowa poczte..." odswieza odebrane/nieprzeczytane.
 * Archiwum i ustawienia trwale w IndexedDB per postac.
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
  validateListingSearch,
} from "./core/protocol/commands";
import type { LetterTemplate } from "./core/letterRender";
import { validateCompose } from "./core/composeValidation";
import {
  ANCHOR_RETRY_WAITS_MS,
  PAGE_PACE_MS,
  entryKey,
  oldestEntry,
  scanMailboxPages,
} from "./core/pagination";
import { contactsFromArchive } from "./core/contacts";
import {
  bodiesOf,
  contentKeyOf,
  fromMailboxEntry,
  fromOpenedLetter,
  normalizeArchive,
  occurrenceCount,
  purgeGoneLetters,
  purgeGoneLettersNewerThan,
  setOccurrences,
  upsertLetters,
  withOccurrenceBodies,
  type ArchiveLetter,
} from "./core/archive";
import { totalLive } from "./core/archiveStats";
import { MailboxSession, type ListingCtx, type MailboxEntry, type MailboxResult } from "./core/session/mailbox";
import { humanizeMailError, isOperationCancelled } from "./core/errors";
import { archiveExportEntries, letterTxt, txtFileName } from "./core/exportTxt";
import { buildZip } from "./core/zipStore";
import { downloadBlob } from "./ui/download";
import { PagerSession } from "./core/session/pager";
import { EditorSession } from "./core/session/editor";
import { SessionLock } from "./core/sessionLock";
import { DargothTransport } from "./adapters/dargothTransport";
import { cleanupLegacyStorage, openCharStorage, type CharStorage } from "./adapters/storage";
import { STORAGE_WRITE_ERROR } from "./adapters/writeThroughStorage";
import { notify } from "./adapters/notify";
import { INDEX_BOXES, MailUiStore, formatBadgeSuffix } from "./ui/store";
import { mountMailUi, type MailUiHandlers } from "./ui/render";
import { applyConfirmedDeletions, matchSelectionOnFreshListing } from "./core/bulkDelete";
import { formatListCount } from "./ui/deletion";

const POPUP_ID = "arkmail";
const FOOTER_BUTTON_ID = "arkmail";
const FOOTER_STATE = "arkmail-poczta";
const ALIAS_REGEX = /^\/arkmail$/i;
const SESSION_OPTS = { timeoutMs: 8000, idleMs: 400 };
/** Prog szerokosci popupu dla ukladu dwupanelowego (Fala 10): >= 900px
 *  lista z lewej + podglad z prawej, nizej jeden panel (komorka). */
export const WIDE_MIN_WIDTH = 900;
export const LOAD_ALL_PACE_MS = PAGE_PACE_MS;
/**
 * Fala 20d podniosla tempo stron w INDEKSACJI do 800 ms (zgloszenie
 * 2026-10-21: 400 ms/strone mlocilo wolny serwer - throttle "Listy
 * sa w tej chwili ladowane."). Fala 24d zdejmuje przyczyne: duplikat
 * strony dostaje proby z klepnieciem (INDEX_ANCHOR_RETRY_WAITS_MS),
 * wiec tempo wraca do 400 ms - tyle co reczne loadAll.
 */
export const INDEX_PACE_MS = PAGE_PACE_MS;
/**
 * Fala 24d: proby powtorki kotwicy po duplikacie strony w indeksacji
 * (zgloszenie 2026-10-21 "pominiete wyslane / 3-4"). Kazda proba:
 * pauza (2,5 s, potem 4 s) + klepniecie listingu bazowego (odswieza
 * kontekst listingu serwera, Fala 14f: jeden globalny listing) i
 * dopiero powtorka kotwicy. Duplikat po wyczerpaniu prob = serwer
 * odpowiada wolno, skrzynka pomijana.
 */
export const INDEX_ANCHOR_RETRY_WAITS_MS = ANCHOR_RETRY_WAITS_MS;
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
const NOTIFY_KEY = "powiadomienia";
const COMPOSE_KEY = "compose";
const INDEX_KEY = "indeks";
const ARCHIVE_GAPS_KEY = "luki-archiwum";

let apiRef: PluginApi | null = null;
let storageRef: CharStorage | null = null;
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
let playerMailModeTimer: ReturnType<typeof setTimeout> | null = null;
let deactivateActiveCharacter: (() => Promise<void>) | null = null;
let unsubscribeCharacter: (() => void) | null = null;
let lifecycleDestroyed = false;

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
  lifecycleDestroyed = false;
  cleanupLegacyStorage();

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
  popup.onClose(() => store?.resetDeletion());

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

  let requestedName = api.character.getName();
  let activeName: string | null = null;
  let switchQueue: Promise<void> = Promise.resolve();
  const refreshPopup = (): void => {
    if (popup?.isOpen) popup.setBody(createContent());
  };
  const deactivateCurrent = async (): Promise<void> => {
    const deactivate = deactivateActiveCharacter;
    deactivateActiveCharacter = null;
    if (deactivate) await deactivate();
    activeName = null;
    refreshPopup();
  };

  const activateCharacter = async (character: string): Promise<boolean> => {
    const storage = await openCharStorage(character, () => notify(api, STORAGE_WRITE_ERROR));
    if (
      lifecycleDestroyed ||
      character.trim().toLowerCase() !== requestedName?.trim().toLowerCase()
    ) {
      await storage.close();
      return false;
    }
    storageRef = storage;
    transport = new DargothTransport(api);
    const lock = new SessionLock();
    const tasks = new Set<Promise<unknown>>();
    const trackTask = <T,>(task: Promise<T>): Promise<T> => {
      const tracked = task.finally(() => tasks.delete(tracked));
      tasks.add(tracked);
      return tracked;
    };
    const runExclusive = <T,>(operation: () => Promise<T>): Promise<T> =>
      trackTask(lock.runExclusive(operation));
  let connectionGeneration = 0;
  const cancelListeners = new Set<() => void>();
  const sessionOpts = {
    ...SESSION_OPTS,
    onCancel: (cb: () => void): (() => void) => {
      cancelListeners.add(cb);
      return () => cancelListeners.delete(cb);
    },
  };
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
  // Fala 28: jednorazowy przeglad storage - rekordy oznaczone przez
  // STARE wersje jako nieobecne na serwerze (missingOnServer) fizycznie
  // wypadaja. Od tej wersji purge dzieje sie przy kazdym gone-markingu.
  const archive = normalizeArchive(storage.getLetters()).filter(
    (l) => l.missingOnServer !== true,
  );
  storage.setLetters(archive);
  const composePrefs = storage.getJSON<{ template?: LetterTemplate; width?: number }>(COMPOSE_KEY);
  store = new MailUiStore({
    notifyEnabled: storage.getJSON<boolean>(NOTIFY_KEY) ?? true,
    archive,
    composeTemplate: composePrefs?.template ?? "plain",
    composeWidth: composePrefs?.width ?? 60,
    // Fala 18c: flagi kompletnej indeksacji skrzynek (brama Kontaktow).
    indexMeta: storage.getJSON<Partial<Record<MailBox, string>>>(INDEX_KEY) ?? {},
    archiveGaps: storage.getJSON<Partial<Record<MailBox, string[]>>>(ARCHIVE_GAPS_KEY) ?? {},
  });
  const ui = store;
  const mailbox = new MailboxSession(transport, sessionOpts);
  const pager = new PagerSession(transport, sessionOpts);
  const editor = new EditorSession(transport, sessionOpts);

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
   * - lista ma byc ukryta natychmiast, nawet z ucietych listingow).
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
      // strona nie raportuje, na pewno nie ma ich juz w skrzynce
      // (strona jest ciagla od najnowszego). Usuwamy je z widoku
      // i oznaczamy w archiwum. Dzien graniczny nietkniety.
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
        // rekordow nieobecnych na swiezym listingu dotyka flaga
        // missingOnServer - wypadaja z widoku archiwum i licznikow
        // kontaktow. Tylko tutaj: to jedyna
        // sciezka z NIEfiltrowana komenda "listy <skrzynka>" (szukanie,
        // re-kotwice i paginacje maja wlasne komendy i call-site'y).
        if (!res.header.truncated) {
          markGoneFromServer(box, freshIds);
          // Fala 25 (blad 1, decyzja D1): nieuciety listing z komenda
          // "listy <skrzynka>" = skrzynka zweryfikowana w calosci.
          // Stempel dostaje KAZDA sciezka pelnej wiedzy, nie tylko
          // pedzel indeksacji - po "Odswiez + Wczytaj wszystkie"
          // status w Archiwum/Kontaktach klamal ("niekompletna"),
          // mimo ze skrzynki byly zweryfikowane listingiem.
          clearArchiveGaps(box);
          ui.setIndexMeta({ ...ui.state.indexMeta, [box]: new Date().toISOString() });
          persistIndexMeta();
        } else if (boundaryDay !== undefined) {
          // Fala 30b: przy ucietym listingu oznaczamy zakresowo -
          // tylko rekordy scisle nowsze niz granica dnia strony.
          markGoneFromServerNewerThan(box, freshIds, boundaryDay);
        }
      } else if (res.reason === "puste") {
        // Pusta skrzynka (reason "puste", nie "filtr") = pelna prawda:
        // wszystkie jej rekordy odpadly (skrzynka jest pusta).
        markGoneFromServer(box, new Set());
        // Fala 25 (blad 1, decyzja D1): pusta skrzynka to kompletna
        // wiedza o skrzynce - ten sam stempel co przy nieucietym listingu.
        clearArchiveGaps(box);
        ui.setIndexMeta({ ...ui.state.indexMeta, [box]: new Date().toISOString() });
        persistIndexMeta();
      }
    }
  };

  /**
   * Fala 28: FIZYCZNIE usuwa rekordy archiwum danej skrzynki nieobecne
   * w freshIds (zamiast flagi missingOnServer - zombie siedzialy w bazie
   * wiecznie i totalne liczniki klamaly). Wywolywane WYLACZNIE przy
   * pewnoscia kompletnego listingu (patrz fetchBoxes). Blednie usuniety
   * rekord odtworzy kolejny listing (upsert).
   */
  const markGoneFromServer = (box: MailBox, freshIds: Set<string>): void => {
    const purged = purgeGoneLetters(ui.state.archive, box, freshIds);
    if (purged.removedIds.size === 0) return;
    ui.setArchive(purged.letters);
    persistArchive();
    pruneGoneFromView(box, purged.removedIds);
  };

  /**
   * Fala 30c: widok skrzynki wyrzuca wpisy o usunietych id - operacja
   * lokalna, zero komend.
   */
  const pruneGoneFromView = (box: MailBox, removedIds: Set<string>): void => {
    ui.pruneMailboxEntries(box, removedIds);
  };

  /**
   * Fala 24e/28: purge ZAKRESOWY po klamrze przeczesu incrementalnego.
   * Klamra zatrzymuje przeces na przecieciu z baza, wiec pelny
   * markGoneFromServer usunalby niesprawdzone rekordy. Usuwamy tylko
   * rekordy NOWSZE niz boundaryDay (najstarszy dzien widziany w tej
   * petli): strony listingu sa ciagle od najnowszego, wiec wszystko
   * nowsze musialo przejsc przez pobrane strony. Dzien graniczny
   * (<= boundaryDay) nietkniety - klamra mogla uciac go w polowie
   * strony.
   */
  const markGoneFromServerNewerThan = (
    box: MailBox,
    freshIds: Set<string>,
    boundaryDay: string,
  ): void => {
    const purged = purgeGoneLettersNewerThan(ui.state.archive, box, freshIds, boundaryDay);
    if (purged.removedIds.size === 0) return;
    ui.setArchive(purged.letters);
    persistArchive();
    pruneGoneFromView(box, purged.removedIds);
  };

  const refreshBoxes = (boxes: MailBox[], mode: "sync" | "replace" = "sync"): void => {
    if (ui.state.tab === "usuwanie") ui.resetDeletion();
    ui.clearSearchBoxes(boxes);
    const generation = connectionGeneration;
    void runExclusive(() => fetchBoxes(boxes, mode))
      .catch(() => {})
      .finally(() => {
        if (generation !== connectionGeneration) return;
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
  const cancelConnectionOperations = (): void => {
    connectionGeneration++;
    listingCtx = null;
    transport!.setOnline(false);
    lock.cancelWaiting();
    for (const cancel of [...cancelListeners]) cancel();
    if (loadAllFlag) loadAllFlag.cancelled = true;
    if (indexFlag) indexFlag.cancelled = true;
    if (archiveDownloadFlag) archiveDownloadFlag.cancelled = true;
    loadAllFlag = null;
    indexFlag = null;
    archiveDownloadFlag = null;
    pendingRefresh.clear();
    drainScheduled = false;
    ui.setBusy(null);
    ui.setLoadAll(null);
    ui.setIndexRun(null);
    ui.setArchiveDownload(null);
    ui.resetDeletion();
  };
  /**
   * Fala 25 (blad 3, krytyczny): client.connect odpala na OTWARCIU
   * WebSocketa - takze na EKRANIE LOGOWANIA, zanim gracz poda nazwe
   * postaci. Login w kliencie jest prompt-driven: kazda linia na
   * ekranie logowania jest traktowana jako nazwa postaci. Auto-refresh
   * "listy ..." po connect ladowal komende na prompt nazwy i zabijal
   * logowanie ("Nie ma takiej postaci" - potwierdzone przez dwoch
   * graczy; dzialalo dopiero czyszczenie danych + usuniecie pluginu +
   * ctrl+r; z arkadia.rpg.pl logowanie dzialalo, wiec winny byl
   * plugin). Connect kasuje wylacznie operacje poprzedniej sesji;
   * brame otwieraja WYLACZNIE sygnaly potwierdzajace obecnosc w grze
   * (GMCP postaci / pokoju / stanu poczty) albo faktyczne wznowienie
   * sesji przez proxy (resumed && !upstreamClosed). Rozbrojenie:
   * client.disconnect oraz gmcp_msg.system.login (komunikat serwera
   * o zamknieciu sesji - wylapuje tez kick, gdy disconnect nie zdazy
   * nadejsc).
   */
  // Fala 27 (anti-replay): true = ostatnia ramka proxy.session mowila,
  // ze gra zamknela polaczenie. Proxy odtwarza wtedy bufor martwej
  // sesji (w tym STARE envelope'y GMCP) i zamyka socket - takie
  // odtworzone sygnaly obecnosci NIE MOGA uzbroic bramy na ekranie
  // logowania (powrot buga 3). Flage kasuje wylacznie client.connect
  // albo attach zywej sesji (resumed i brak upstreamClosed).
  let lastUpstreamClosed = false;
  const onClientConnect = (): void => {
    lastUpstreamClosed = false;
    cancelConnectionOperations();
  };
  const armGameTransport = (): void => {
    transport!.setOnline(true);
  };
  const onGamePresence = (): void => {
    if (lastUpstreamClosed) return;
    armGameTransport();
  };
  // Fala 27 (blad A): pluginy Dargoth laduja sie hot-load - install/
  // enable W GRZE nastepuje PO sygnalach obecnosci (char.info itd.)
  // i brama zostaje wiecznie rozbrojona. Generyczny event 'gmcp'
  // (MudClient emituje go dla KAZDEGO envelope'a, PluginApi.ts) jest
  // dowodem ZYWEGO ruchu z gry - Arkadia wysyla Char.State przy
  // kazdym ticku, wiec uzbrojenie nastepuje w ciagu sekund. Straż
  // anti-replay obowiazuje identycznie jak dla sygnalow gate.
  const onAnyGmcp = (): void => {
    if (lastUpstreamClosed) return;
    armGameTransport();
  };
  const onProxySession = (session: unknown): void => {
    const s = session as { resumed?: unknown; upstreamClosed?: unknown } | null | undefined;
    // Fala 27 (blad B): proxy Go wysyla upstreamClosed WYLACZNIE gdy
    // true (json:"upstreamClosed,omitempty", proxy/session.go) - sesja
    // zywa ma klucz POMINIETY, wiec === false nigdy nie przechodzilo
    // i uzbrajanie na wznowieniu sesji nigdy nie odpalalo. Klient
    // sam uzywa poprawnego !upstreamClosed (PlayerIdentity.ts).
    if (s?.resumed === true && !s?.upstreamClosed) {
      lastUpstreamClosed = false;
      armGameTransport();
      refreshBoxes(["odebrane", "nieprzeczytane", "wyslane", "niewyslane"]);
    } else if (s?.upstreamClosed === true) {
      // Fala 26: proxy wprost mowi, ze gra zamknela polaczenie (kick:
      // ramka 'ended' albo 'attached' z upstreamClosed=true - obie
      // przychodza PRZED ekranem logowania / gmcp_msg.system.login).
      // Rozbrajamy natychmiast, zamiast czekac na system.login.
      lastUpstreamClosed = true;
      onClientDisconnect();
    } else {
      // Swiezy attach (brak resumed i upstreamClosed) - czysta sesja
      // na ekranie logowania; zdejmujemy straż anti-replay.
      lastUpstreamClosed = false;
    }
  };
  const onClientDisconnect = (): void => {
    cancelConnectionOperations();
    playerMailMode = false;
    clearPlayerMailModeTimer();
  };
  const onSystemLogin = (): void => {
    onClientDisconnect();
  };
  api.events.on("client.connect", onClientConnect);
  api.events.on("client.disconnect", onClientDisconnect);
  api.events.on("gmcp", onAnyGmcp);
  api.events.on("gmcp.char.info", onGamePresence);
  api.events.on("gmcp.char.name", onGamePresence);
  api.events.on("gmcp.mail.state", onGamePresence);
  api.events.on("gmcp_msg.room.long", onGamePresence);
  api.events.on("proxy.session", onProxySession);
  api.events.on("gmcp_msg.system.login", onSystemLogin);

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
  const scheduleRefresh = (boxes: MailBox[]): void => {
    for (const b of boxes) pendingRefresh.add(b);
    // Fala 24f2: w recznym trybie poczty gracza zadna komenda pluginu
    // nie wychodzi - parkujemy do jego wyjscia z trybu.
    if (playerMailMode) return;
    if (drainScheduled) return;
    drainScheduled = true;
    const generation = connectionGeneration;
    void runExclusive(async () => {
        const batch = [...pendingRefresh];
        pendingRefresh.clear();
        ui.clearSearchBoxes(batch);
        await fetchBoxes(batch, "sync");
      })
      .catch(() => {})
      .finally(() => {
        if (generation !== connectionGeneration) return;
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
  const onMailState = (d: unknown): void => {
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
  };
  api.events.on("gmcp.mail.state", onMailState);

  const persistArchive = (): void => {
    storage.setLetters(ui.state.archive);
  };

  /** Fala 18c: flagi kompletnej indeksacji skrzynek (brama Kontaktow). */
  const persistIndexMeta = (): void => {
    storage.setJSON(INDEX_KEY, ui.state.indexMeta);
  };

  const persistArchiveGaps = (): void => {
    storage.setJSON(ARCHIVE_GAPS_KEY, ui.state.archiveGaps);
  };

  const recordArchiveGap = (box: MailBox, day: string): void => {
    const days = [...new Set([...(ui.state.archiveGaps[box] ?? []), day])].sort();
    ui.setArchiveGaps({ ...ui.state.archiveGaps, [box]: days });
    persistArchiveGaps();
    if (ui.state.indexMeta[box] !== undefined) {
      const meta = { ...ui.state.indexMeta };
      delete meta[box];
      ui.setIndexMeta(meta);
      persistIndexMeta();
    }
  };

  const clearArchiveGaps = (box: MailBox): void => {
    if (ui.state.archiveGaps[box] === undefined) return;
    const gaps = { ...ui.state.archiveGaps };
    delete gaps[box];
    ui.setArchiveGaps(gaps);
    persistArchiveGaps();
  };

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
    const generation = connectionGeneration;
    const flag = { cancelled: false };
    const offCancel = sessionOpts.onCancel(() => {
      flag.cancelled = true;
    });
    let fresh: MailboxEntry | null = null;
    try {
      const scan = await scanMailboxPages({
        box,
        initialCommand: olderListingCommand(box, nextDay(entry.date)),
        cancelled: () => flag.cancelled || generation !== connectionGeneration,
        fetchPage: (command) => mailbox.fetch(box, command),
        wait: (ms) => sleepOrCancel(ms, flag),
        onBaseRefresh: () => bumpCtx(box),
        onEmpty: () => bumpCtx(box),
        onGap: (day) => recordArchiveGap(box, day),
        onPage: (res) => {
          stampEntries(box, res.entries);
          const merged = upsertLetters(
            ui.state.archive,
            res.entries.map((item) => fromMailboxEntry(box, item)),
          );
          ui.setArchive(merged.letters);
          persistArchive();
          fresh = res.entries.find((item) => entryKey(item) === entryKey(entry)) ?? null;
          return { stop: fresh !== null };
        },
      });
      if (fresh) return fresh;
      if (scan.end === "cancelled") throw new Error("operacja anulowana");
      if (scan.end === "incomplete") {
        throw new Error("Nie mozna sprawdzic calej listy - sprobuj ponownie.");
      }
    } finally {
      offCancel();
    }
    notify(api, "Nie ma tego listu na liscie - odswiez skrzynke.");
    return null;
  };

  /** Paginacja wstecz: jedna starsza strona listingow do archiwum. */
  const loadOlder = (box: MailBox): void => {
    const generation = connectionGeneration;
    const flag = { cancelled: false };
    ui.setBusy("Wczytuje starsze listy...");
    void runExclusive(async () => {
        const view = ui.state.boxes[box];
        const oldest = oldestEntry(view?.entries ?? []);
        if (!oldest?.date) {
          notify(api, "Nie mozna wczytac starszych - najpierw pobierz skrzynke.");
          return;
        }
        const scan = await scanMailboxPages({
          box,
          initialCommand: olderListingCommand(box, nextDay(oldest.date)),
          singlePage: true,
          cancelled: () => flag.cancelled || generation !== connectionGeneration,
          fetchPage: (command) => mailbox.fetch(box, command),
          wait: (ms) => sleepOrCancel(ms, flag),
          onBaseRefresh: () => bumpCtx(box),
          onGap: (day) => recordArchiveGap(box, day),
          onEmpty: () => bumpCtx(box),
          onPage: (res) => {
            stampEntries(box, res.entries);
            const addedToView = ui.appendMailboxPage(box, res.entries, res.header.truncated);
            const merged = upsertLetters(
              ui.state.archive,
              res.entries.map((entry) => fromMailboxEntry(box, entry)),
            );
            ui.setArchive(merged.letters);
            persistArchive();
            return { addedToView, archiveAdded: merged.added };
          },
        });
        if (scan.end === "cancelled") return;
        if (scan.end === "complete" && scan.pages === 0) {
          ui.appendMailboxPage(box, [], false);
          // Fala 25 (blad 1, decyzja D2): pusta odpowiedz na paginacje
          // wstecz = doszlismy do dna skrzynki - cala zawartosc jest
          // juz w widoku i archiwum, wiec skrzynka ma stempel pelnej
          // wiedzy, a zapisane wczesniej luki dni znikaja.
          clearArchiveGaps(box);
          ui.setIndexMeta({ ...ui.state.indexMeta, [box]: new Date().toISOString() });
          persistIndexMeta();
          notify(api, "Brak starszych listow.");
        } else if (scan.end === "incomplete") {
          notify(
            api,
            `Wczytano dostepne listy (dodanych do listy: ${scan.addedToView}). ${scan.skipWhy ?? "Sprobuj ponownie za chwile"}.`,
          );
        } else {
          notify(api, `Wczytano starsze listy (dodanych do listy: ${scan.addedToView}).`);
        }
      })
      .catch((err: unknown) => {
        if (!isOperationCancelled(err)) {
          notify(api, `Blad wczytywania starszych: ${humanizeMailError(err instanceof Error ? err.message : String(err))}`);
        }
      })
      .finally(() => {
        if (generation !== connectionGeneration) return;
        ui.setBusy(null);
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

  /** Wczytuje starsze strony bez sztywnego limitu ich liczby. */
  const loadAll = (box: MailBox): void => {
    if (loadAllFlag) {
      loadAllFlag.cancelled = true;
      return;
    }
    if (lock.locked) {
      notify(api, SESSION_BUSY_MSG);
      return;
    }
    const flag = { cancelled: false };
    loadAllFlag = flag;
    ui.setLoadAll({ box, pages: 0 });
    const generation = connectionGeneration;
    void runExclusive(async () => {
        try {
          const view = ui.state.boxes[box];
          const oldest = oldestEntry(view?.entries ?? []);
          if (!view?.truncated || !oldest?.date) return;
          const scan = await scanMailboxPages({
            box,
            initialCommand: olderListingCommand(box, nextDay(oldest.date)),
            cancelled: () => flag.cancelled || generation !== connectionGeneration,
            fetchPage: (command) => mailbox.fetch(box, command),
            wait: (ms) => sleepOrCancel(ms, flag),
            onBaseRefresh: () => bumpCtx(box),
            onGap: (day) => recordArchiveGap(box, day),
            onEmpty: () => bumpCtx(box),
            onPage: (res, pages) => {
              stampEntries(box, res.entries);
              const addedToView = ui.appendMailboxPage(box, res.entries, res.header.truncated);
              const merged = upsertLetters(
                ui.state.archive,
                res.entries.map((entry) => fromMailboxEntry(box, entry)),
              );
              ui.setArchive(merged.letters);
              persistArchive();
              ui.setLoadAll({ box, pages });
              ui.setBusy(`Wczytuje wszystkie (${box}): strona ${pages}...`);
              return { addedToView, archiveAdded: merged.added };
            },
          });
          if (scan.end === "cancelled") {
            notify(api, `Przerwano (dodanych do listy: ${scan.addedToView}).`);
            return;
          }
          if (scan.end === "complete") {
            ui.appendMailboxPage(box, [], false);
            clearArchiveGaps(box);
            const done = ui.state.boxes[box];
            if (done && !done.truncated) {
              markGoneFromServer(
                box,
                new Set(done.entries.map((entry) => fromMailboxEntry(box, entry).id)),
              );
              ui.setIndexMeta({ ...ui.state.indexMeta, [box]: new Date().toISOString() });
              persistIndexMeta();
            }
            notify(api, `Wczytano wszystkie (dodanych do listy: ${scan.addedToView}).`);
          } else {
            notify(
              api,
              `Wczytano dostepne listy (dodanych do listy: ${scan.addedToView}). ${scan.skipWhy ?? "Sprobuj ponownie za chwile"}.`,
            );
          }
        } finally {
          if (generation !== connectionGeneration) return;
          loadAllFlag = null;
          ui.setLoadAll(null);
        }
      })
      .catch((err: unknown) => {
        if (!isOperationCancelled(err)) {
          notify(api, `Blad wczytywania: ${humanizeMailError(err instanceof Error ? err.message : String(err))}`);
        }
      })
      .finally(() => {
        if (generation !== connectionGeneration) return;
        ui.setBusy(null);
        rebuildContacts();
      });
  };

  /** Flaga biezacej petli "Indeksuj wszystkie skrzynki" (null = brak). */
  let indexFlag: { cancelled: boolean } | null = null;

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
    const generation = connectionGeneration;
    const skipped: string[] = [];
    void runExclusive(async () => {
        try {
          for (let i = 0; i < INDEX_BOXES.length; i++) {
            const box = INDEX_BOXES[i]!;
            if (flag.cancelled || generation !== connectionGeneration) break;
            ui.setIndexRun({ boxIndex: i, box, pages: 0 });
            ui.setBusy(`Indeksuje skrzynke ${box} (${i + 1}/${INDEX_BOXES.length})...`);
            const seen = new Set<string>();
            const sweepMode = indexSweepMode(ui.state.indexMeta, box, Date.now());
            // Fala 35: wynik listingu nadpisuje occurrences (najswiezsza
            // strona pokazujaca klucz), nigdy nie sumuje.
            const mergeIndexPage = (
              res: Extract<MailboxResult, { kind: "lista" }>,
              fresh: ReadonlyMap<string, number>,
            ) => {
              const entries = res.entries.map((entry) => fromMailboxEntry(box, entry));
              for (const entry of entries) seen.add(entry.id);
              const merged = upsertLetters(ui.state.archive, entries);
              // Po upsert: wystapienia dopiero teraz, gdy rekordy klucza
              // istnieja (nowe wchodza z occurrences = 1, wynik listingu
              // nadpisuje).
              let letters = merged.letters;
              let occurrenceChanged = false;
              for (const [key, count] of fresh) {
                const applied = setOccurrences(letters, box, key, count);
                if (applied.changed > 0) {
                  letters = applied.letters;
                  occurrenceChanged = true;
                }
              }
              ui.setArchive(letters);
              persistArchive();
              return { ...merged, occurrenceChanged };
            };
            const applyFirstIndexPage = (res: Extract<MailboxResult, { kind: "lista" }>): void => {
              stampEntries(box, res.entries);
              const oldest = oldestEntry(res.entries);
              const boundaryDay = oldest?.date
                ? `${oldest.date.year}-${String(oldest.date.month).padStart(2, "0")}-${String(oldest.date.day).padStart(2, "0")}`
                : undefined;
              const synced = ui.syncMailboxPage(
                box,
                res.entries,
                res.header.truncated,
                boundaryDay,
              );
              if (!synced) ui.applyMailbox(box, res);
            };
            const scan = await scanMailboxPages({
              box,
              cancelled: () => flag.cancelled || generation !== connectionGeneration,
              fetchPage: (command) => mailbox.fetch(box, command),
              wait: (ms) => sleepOrCancel(ms, flag),
              onGap: (day) => recordArchiveGap(box, day),
              onBaseRefresh: (res) => {
                if (res.kind === "lista") {
                  applyFirstIndexPage(res);
                  // Baza = swieza strona pierwsza: klucze juz policzone
                  // przy pierwszym przejsciu - bez rekontowania.
                  mergeIndexPage(res, NO_FRESH);
                } else {
                  bumpCtx(box);
                  ui.applyMailbox(box, res);
                }
                rebuildContacts();
              },
              onEmpty: (res) => {
                bumpCtx(box);
                if (seen.size === 0) {
                  ui.applyMailbox(box, res);
                  rebuildContacts();
                }
              },
              onPage: (res, pages, fresh) => {
                ui.setIndexRun({ boxIndex: i, box, pages });
                if (pages === 1) {
                  applyFirstIndexPage(res);
                } else {
                  stampEntries(box, res.entries);
                  ui.appendMailboxPage(box, res.entries, res.header.truncated);
                }
                const merged = mergeIndexPage(res, fresh);
                rebuildContacts();
                return {
                  archiveAdded: merged.added,
                  // Fala 35: nowy blizniak przy istniejacym kluczu to
                  // zmiana occurrences - przeglad leci dalej.
                  stop:
                    sweepMode === "incremental" &&
                    merged.added === 0 &&
                    !merged.occurrenceChanged,
                };
              },
            });
            if ((scan.end === "complete" || scan.end === "clamped") && !flag.cancelled) {
              if (scan.end === "complete" && seen.size > 0) {
                ui.appendMailboxPage(box, [], false);
              }
              if (scan.end === "clamped") {
                markGoneFromServerNewerThan(box, seen, scan.oldestSeenDay ?? "");
              } else {
                markGoneFromServer(box, seen);
                clearArchiveGaps(box);
                ui.setIndexMeta({ ...ui.state.indexMeta, [box]: new Date().toISOString() });
                persistIndexMeta();
              }
              done += 1;
            } else if (scan.end === "cancelled" || flag.cancelled) {
              break;
            } else {
              skipped.push(`${box} (${scan.skipWhy ?? "niekompletne"})`);
            }
          }
          if (flag.cancelled) {
            notify(
              api,
              `Przerwano indeksowanie (zapisane skrzynki: ${done} z ${INDEX_BOXES.length}).`,
            );
          } else if (skipped.length === 0) {
            rebuildContacts();
            notify(
              api,
              `Zindeksowano wszystkie skrzynki (${formatListCount(totalLive(ui.state.archive))} w bazie).`,
            );
          } else {
            rebuildContacts();
            notify(
              api,
              `Indeksowanie niekompletne - pominiete: ${skipped.join(", ")}. ` +
                `Pozostale skrzynki zapisane.`,
            );
          }
        } finally {
          if (generation !== connectionGeneration) return;
          indexFlag = null;
          ui.setIndexRun(null);
          ui.setBusy(null);
        }
      })
      .catch((err: unknown) => {
        if (!isOperationCancelled(err)) {
          notify(api, `Blad indeksowania: ${humanizeMailError(err instanceof Error ? err.message : String(err))}`);
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
   * Odczyt listu przez re-kotwice (Fala 9a) z druga szansa, gdy
   * pierwsza kotwica nie trafi (Fala 16c). Wspolna sciezka dla kliku w liste skrzynki
   * i w wpis archiwum bez tresci (Fala 16h). WYMAGA locka (caller).
   */
  const openWithResolve = async (box: MailBox, entry: MailboxEntry): Promise<void> => {
    // Fala 16c: blad "listing serwera odpowiedzial nietypowo" (re-login, cudzy
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
   * listu nie ma na swiezym listingu (kto go usunal - caller
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
  /** Fala 35: pusty wynik liczenia dla sciezek bez danych per strona. */
  const NO_FRESH: ReadonlyMap<string, number> = new Map();

  let archiveDownloadFlag: { cancelled: boolean } | null = null;

  /**
   * Prog circuit breakera petli pobierania (Fala 31a): tyle bledow
   * Z RZEDU = problem systemowy (siec/serwer lezy) i petla staje,
   * zamiast mielic wszystkie listy do konca. Pojedynczy timeout sie
   * zdarza, wiec prog to 3, nie 1.
   */
  const DOWNLOAD_BREAKER_LIMIT = 3;

  /**
   * Petla "Pobierz tresci do archiwum" (Fala 16i, zgloszenie pkt 10):
   * kolejne listy bez tresci pod JEDNA blokada sesji, tempo jak loadAll.
   * Drugi klik przycisku = Przerwij. Blad pojedynczego listu nie zabija
   * petli - liczony i podsumowany na koncu.
   * Fala 17c (zgloszenie pkt 3): petla jest IDEMPOTENTNA - kandydaci
   * grupowani po kluczu tresci (blizniak pobierany raz), rekordy
   * nieobecne na serwerze oznaczane i pomijane przy restarcie.
   * Fala 31a: circuit breaker - 3 bledy z rzedu (siec/serwer lezy)
   * zatrzymuja petle z jasnym komunikatem, zamiast mielic reszte
   * kandydatow do konca. Sukces i 'missing' licznik resetuja.
   * Uzywa aktualnej bazy; nie uruchamia indeksacji automatycznie.
   */
  const runArchiveDownload = (): void => {
    if (archiveDownloadFlag) {
      archiveDownloadFlag.cancelled = true;
      return;
    }
    if (lock.locked) {
      notify(api, SESSION_BUSY_MSG);
      return;
    }
    // Najpierw grupujemy wszystkie dostepne rekordy. Blizniaki wspoldziela
    // jeden rekord z occurrences slotami tresci (Fala 35) - grupa jest
    // "do pobrania", dopoki CHOC JEDEN slot jest pusty. Kandydat musi
    // miec prawidlowa date, bo bez niej nie mozna odnalezc listu na
    // serwerze.
    const groups = new Map<string, ArchiveLetter[]>();
    for (const l of ui.state.archive) {
      const key = contentKeyOf(l);
      const arr = groups.get(key);
      if (arr) arr.push(l);
      else groups.set(key, [l]);
    }
    const pending = [...groups.values()].filter((group) =>
      group.every((l) => {
        const slots = bodiesOf(l);
        return (
          slots.length < occurrenceCount(l) || slots.some((b) => b.length === 0)
        );
      }),
    );
    const candidates = pending.filter((group) => {
      const dateRaw = group[0]!.dateRaw;
      return dateRaw !== null && parseMailDate(dateRaw) !== null;
    });
    if (candidates.length === 0) {
      notify(
        api,
        ui.state.archive.length === 0
          ? "Skrzynki sa puste - nie ma czego pobierac."
          : pending.length > 0
            ? `Nie mozna pobrac tresci - listy bez prawidlowej daty: ${pending.length}.`
            : groups.size === 0
              ? "Brak dostepnych listow do pobrania - nie ma juz w skrzynce."
              : "Wszystkie listy w bazie maja tresci.",
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
    const generation = connectionGeneration;
    void runExclusive(async () => {
        let done = 0;
        let failed = 0;
        let missing = 0;
        // Fala 31a (circuit breaker): serie bledow Z RZEDU zatrzymuja
        // petle. Sukces i 'missing' (serwer odpowiedzial - listu juz
        // nie ma w skrzynce)
        // resetuja licznik, bo dowodza, ze polaczenie zyje.
        let consecutiveErrors = 0;
        let breakerTripped = false;
        // Fala 35c: grupy jednowystapieniowe ida stara sciezka
        // (re-kotwica + jeden odczyt); wielowystapieniowe swiezym
        // listingiem skrzynki z odczytem kazdego wiersza klucza.
        const singles = candidates.filter((g) => occurrenceCount(g[0]!) === 1);
        const multis = candidates.filter((g) => occurrenceCount(g[0]!) > 1);
        // Fala 35c: listing pokazal mniej wystapien niz baza (albo
        // skan sie nie domknal) = baza nieswieza; dalsze pobieranie
        // bez ponownej indeksacji nie jest bezpieczne.
        let reindexNeeded = false;
        const reportProgress = (): void => {
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
          ui.setBusy(`Pobieram tresci do archiwum (${processed}/${total})...`);
        };
        try {
          for (const group of singles) {
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
            // Fala 31: skrzynka ostatniej proby - przy 'missing' z niej
            // wypada wiersz widoku (box z petli nie jest tu w zakresie).
            let triedBox: MailBox | null = null;
            for (const box of order) {
              if (flag.cancelled) break;
              // Fala 17a: Przerwij domyka tez pager w toku (shouldAbort).
              triedBox = box;
              result = await fetchArchiveBody(group[0], {
                shouldAbort: () => flag.cancelled,
                box,
              });
              if (result.kind === "ok") break;
            }
            if (result.kind === "ok") {
              done += 1;
              consecutiveErrors = 0;
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
              consecutiveErrors = 0;
              // Fala 28: brak na serwerze -> fizyczny purge grupy z archiwum.
              const goneIds = new Set(group.map((l) => l.id));
              ui.setArchive(ui.state.archive.filter((l) => !goneIds.has(l.id)));
              persistArchive();
              // Fala 31: domkniecie parowania - martwy wiersz znika tez
              // z widoku skrzynki (ostatnia niesparowana sciezka;
              // bez tego wiersz byl klikalny i liczyl sie w badge).
              if (triedBox !== null) pruneGoneFromView(triedBox, goneIds);
            } else if (!flag.cancelled) {
              failed += 1;
              consecutiveErrors += 1;
              if (consecutiveErrors >= DOWNLOAD_BREAKER_LIMIT) breakerTripped = true;
            }
            reportProgress();
            if (breakerTripped) break;
            if (flag.cancelled) break;
            await sleepOrCancel(LOAD_ALL_PACE_MS, flag);
          }
          // ── Fala 35c: grupy wielowystapieniowe ──
          // Skan skrzynki pokazuje wszystkie wystapienia klucza tresci
          // (strony sa rozdzielone po dniach, klucz jest jednodniowy).
          // Kazdy wiersz listingu to osobny list z wlasna trescia:
          // odczyt per wiersz, tresc do slotu o numerze wiersza.
          if (!flag.cancelled && !breakerTripped && !reindexNeeded && multis.length > 0) {
            const scanOrder = (
              ["odebrane", "nieprzeczytane", "wyslane", "niewyslane"] as MailBox[]
            ).filter((b) => multis.some((g) => g.some((l) => l.box === b)));
            for (const box of scanOrder) {
              if (flag.cancelled || breakerTripped || reindexNeeded) break;
              const groupsHere = multis.filter((g) => g.some((l) => l.box === box));
              const rowsByKey = new Map<string, MailboxEntry[]>();
              const scan = await scanMailboxPages({
                box,
                cancelled: () => flag.cancelled,
                fetchPage: (command) => mailbox.fetch(box, command),
                wait: (ms) => sleepOrCancel(ms, flag),
                onPage: (res) => {
                  if (res.kind === "lista") {
                    for (const entry of res.entries) {
                      const k = contentKeyOf(fromMailboxEntry(box, entry));
                      const arr = rowsByKey.get(k);
                      if (arr) arr.push(entry);
                      else rowsByKey.set(k, [entry]);
                    }
                  }
                  return {};
                },
              });
              if (flag.cancelled) break;
              if (scan.end !== "complete") {
                // Niedomkniety listing = dane czesciowe; porownanie
                // z baza nie jest bezpieczne.
                reindexNeeded = true;
                break;
              }
              for (const group of groupsHere) {
                if (flag.cancelled || breakerTripped || reindexNeeded) break;
                const record = group[0]!;
                const slotsNow = bodiesOf(record);
                if (
                  slotsNow.length >= occurrenceCount(record) &&
                  slotsNow.every((s) => s.length > 0)
                )
                  continue;
                const rows = rowsByKey.get(contentKeyOf(record)) ?? [];
                const slots = slotsNow;
                const n = Math.max(occurrenceCount(record), slots.length);
                if (rows.length < n) {
                  // Baza chce wiecej wystapien, niz pokazuje listing:
                  // cos doszlo albo przestalo sie pojawiac - indeks do odswiezenia.
                  // Bez purge: fizyczna tozsamosc wystapien nieznana.
                  reindexNeeded = true;
                  break;
                }
                const collected: string[][] = [...slots];
                let groupFailed = false;
                for (let i = 0; i < n; i++) {
                  if (collected[i] && collected[i]!.length > 0) continue;
                  if (flag.cancelled) break;
                  const row = rows[i]!;
                  try {
                    transport!.beginModal();
                    try {
                      const res = await pager.readLetter(row.number, () => flag.cancelled);
                      collected[i] = res.letter.body;
                      consecutiveErrors = 0;
                    } finally {
                      transport!.endModal();
                    }
                  } catch {
                    if (!flag.cancelled) {
                      failed += 1;
                      consecutiveErrors += 1;
                      if (consecutiveErrors >= DOWNLOAD_BREAKER_LIMIT) breakerTripped = true;
                    }
                    groupFailed = true;
                    break;
                  }
                  await sleepOrCancel(LOAD_ALL_PACE_MS, flag);
                }
                // Zapis zawsze, gdy cos nowego przyszlo (czesciowe
                // sloty tez zostaja - kolejna proba dociagnie reszte).
                const changed = collected.some((s, i) => s !== slots[i]);
                if (changed) {
                  const fillAll = group.map((l) => withOccurrenceBodies(l, collected));
                  const mergedAll = upsertLetters(ui.state.archive, fillAll);
                  ui.setArchive(mergedAll.letters);
                  persistArchive();
                }
                if (!groupFailed && bodiesOf(withOccurrenceBodies(record, collected)).every((s) => s.length > 0)) {
                  done += 1;
                }
                reportProgress();
                if (breakerTripped) break;
              }
            }
          }
          if (reindexNeeded) {
            notify(
              api,
              "Przerwano pobieranie - lista na serwerze nie zgadza sie z baza. " +
                "Indeksuj skrzynki od nowa i sprobuj ponownie.",
            );
          } else if (breakerTripped) {
            notify(
              api,
              "Przerwano pobieranie - serwer poczty nie odpowiada. " +
                "Pobrane tresci sa zapisane. Sprobuj ponownie pozniej.",
            );
          } else if (flag.cancelled) {
            notify(api, `Przerwano pobieranie tresci (pobrano: ${done} z ${total}).`);
          } else if (failed === 0 && missing === 0) {
            notify(api, `Pobrano tresci do archiwum (${formatListCount(done)}).`);
          } else {
            const parts: string[] = [];
            if (failed > 0) parts.push(`nieudane: ${failed}`);
            if (missing > 0) parts.push(`nie ma juz w skrzynce: ${missing}`);
            notify(api, `Pobrano tresci (${done} z ${total}; ${parts.join("; ")}).`);
          }
        } finally {
          if (generation !== connectionGeneration) return;
          archiveDownloadFlag = null;
          ui.setArchiveDownload(null);
          ui.setBusy(null);
        }
      })
      .catch((err: unknown) => {
        if (!isOperationCancelled(err)) notify(api, "Blad pobierania tresci do archiwum.");
      });
  };

  /**
   * Zapis dostepnych tresci do ZIP. Operacja czysto lokalna: uzywa
   * tylko danych z cache, nie wysyla komend i nie wymaga pelnego indeksu.
   */
  const runExportArchive = (): void => {
    const { entries, skipped } = archiveExportEntries(ui.state.archive);
    if (entries.length === 0) {
      notify(
        api,
        ui.state.archive.length === 0
          ? "Skrzynki sa puste - nie ma czego zapisywac."
          : "Brak listow z trescia w archiwum - najpierw pobierz tresci.",
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
        ? `Zapisano listy do ZIP (${entries.length} ${entries.length === 1 ? 'plik' : 'plikow'})` +
            (skipped > 0 ? `; pominietych bez tresci: ${skipped}` : "") +
            "."
        : "Nie udalo sie zapisac pliku - klient nie obsluguje pobierania.",
    );
  };

  const deletionSelectionKey = (numbers: readonly number[]): string =>
    [...numbers].sort((a, b) => a - b).join(",");

  const searchForDeletion = (box: MailBox, command: string): void => {
    if (lock.locked) {
      notify(api, SESSION_BUSY_MSG);
      return;
    }
    if (ui.state.tab !== "usuwanie") return;
    const revision = ui.state.deletion.revision;
    const generation = connectionGeneration;
    ui.setBusy(`Szukam w skrzynce ${box}...`);
    void runExclusive(async () => {
      const result = await mailbox.fetch(box, command);
      if (generation !== connectionGeneration) return;
      if (
        revision !== ui.state.deletion.revision ||
        ui.state.tab !== "usuwanie" ||
        ui.state.deletion.box !== box
      ) {
        bumpCtx(box);
        return;
      }
      if (result.kind === "lista") stampEntries(box, result.entries);
      else bumpCtx(box);
      ui.applyDeletionResult(box, command, result);
    })
      .catch((err: unknown) => {
        if (isOperationCancelled(err) || generation !== connectionGeneration) return;
        if (revision === ui.state.deletion.revision && ui.state.tab === "usuwanie") {
          ui.clearDeletionResult("Blad wyszukiwania. Sprobuj ponownie.");
        }
      })
      .finally(() => {
        if (generation === connectionGeneration && !lock.locked) ui.setBusy(null);
      });
  };

  const deleteSelectedLetters = (): void => {
    if (lock.locked) {
      notify(api, SESSION_BUSY_MSG);
      return;
    }
    const current = ui.state.deletion;
    if (ui.state.tab !== "usuwanie" || current.result?.kind !== "lista" || current.command === null) {
      return;
    }
    const selected = current.result.entries.filter((entry) => current.selected.includes(entry.number));
    if (selected.length === 0) return;
    const box = current.box;
    const command = current.command;
    const revision = current.revision;
    const selectionKey = deletionSelectionKey(current.selected);
    const generation = connectionGeneration;
    let deleteStarted = false;
    ui.setBusy("Sprawdzam zaznaczone listy...");
    void runExclusive(async () => {
      transport!.beginModal();
      try {
        const fresh = await mailbox.fetch(box, command);
        if (generation !== connectionGeneration) return;
        if (
          revision !== ui.state.deletion.revision ||
          ui.state.tab !== "usuwanie" ||
          ui.state.deletion.command !== command ||
          deletionSelectionKey(ui.state.deletion.selected) !== selectionKey
        ) {
          bumpCtx(box);
          return;
        }
        if (fresh.kind === "lista") stampEntries(box, fresh.entries);
        else bumpCtx(box);
        if (fresh.kind !== "lista") {
          ui.clearDeletionResult("Zaznaczone listy zmienily sie. Wyszukaj je ponownie.");
          return;
        }
        const match = matchSelectionOnFreshListing(selected, fresh.entries);
        if (!match) {
          ui.clearDeletionResult("Zaznaczone listy zmienily sie. Wyszukaj je ponownie.");
          return;
        }
        ui.setBusy("Usuwam zaznaczone listy...");
        deleteStarted = true;
        const result = await pager.deleteLetters(match.numbers[0], match.range);
        const confirmed = [...new Set([...result.deletedNumbers, ...result.unexpectedNumbers])]
          .sort((a, b) => a - b);
        const updated = applyConfirmedDeletions(ui.state.archive, box, fresh.entries, confirmed);
        if (updated.changedIds.size > 0) {
          ui.setArchive(updated.letters);
          persistArchive();
          rebuildContacts();
          // Pelny zbior usunietych id per skrzynka: pruneMailboxEntries
          // i tak ignoruje id, ktorych dana skrzynka nie zawiera.
          for (const changedBox of updated.changedBoxes) {
            pruneGoneFromView(changedBox, updated.changedIds);
          }
        }
        let message: string;
        if (result.status === "complete") {
          message = `Usunieto: ${formatListCount(result.deletedNumbers.length)}.`;
        } else if (confirmed.length > 0) {
          message =
            `Usunieto: ${formatListCount(confirmed.length)}. ` +
            "Wynik pozostalych jest nieznany. Odswiez przed kolejna proba.";
          if (result.unexpectedNumbers.length > 0) {
            message += " Potwierdzono tez usuniecie listow spoza zaznaczenia.";
          }
        } else if (result.status === "none") {
          message = "Nie usunieto listow.";
        } else {
          message = "Brak potwierdzenia usuniecia. Odswiez przed kolejna proba.";
        }
        if (revision === ui.state.deletion.revision && ui.state.tab === "usuwanie") {
          ui.clearDeletionResult(message);
        }
      } finally {
        transport!.endModal();
      }
    })
      .catch((err: unknown) => {
        if (isOperationCancelled(err) || generation !== connectionGeneration) return;
        if (revision === ui.state.deletion.revision && ui.state.tab === "usuwanie") {
          ui.clearDeletionResult(
            deleteStarted
              ? "Wynik usuwania jest nieznany. Odswiez przed kolejna proba."
              : "Nie udalo sie sprawdzic listow. Sprobuj ponownie.",
          );
        }
      })
      .finally(() => {
        if (generation === connectionGeneration && !lock.locked) ui.setBusy(null);
      });
  };

  /**
   * Doczyt wpisu archiwum z serwera (wspolny dla kliku w wiersz i
   * w puste wystapienie blizniaka, Fala 35e): pseudo-wpis
   * (ctx undefined -> zawsze re-kotwica po dacie) i ta sama sciezka
   * odczytu co klik w liste skrzynki.
   */
  const openArchiveFromServer = (letter: ArchiveLetter): void => {
    if (lock.locked) {
      notify(api, SESSION_BUSY_MSG);
      return;
    }
    ui.setBusy(`Czytam list: ${letter.subject}...`);
    const pseudo = archivePseudoEntry(letter);
    const generation = connectionGeneration;
    void runExclusive(() => openWithResolve(letter.box, pseudo))
      .catch((err: unknown) => {
        if (!isOperationCancelled(err)) notify(api, "Nie udalo sie odczytac listu.");
      })
      .finally(() => {
        if (generation === connectionGeneration && !lock.locked) ui.setBusy(null);
      });
  };

  handlersRef = {
    onDeletionSearch: (box, query) => {
      const validationError = validateListingSearch(query);
      if (validationError) {
        notify(api, validationError);
        return;
      }
      searchForDeletion(box, searchListingCommand(box, query));
    },
    onDeletionDelete: () => deleteSelectedLetters(),
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
      const generation = connectionGeneration;
      void runExclusive(() => openWithResolve(box, entry))
        .catch((err: unknown) => {
          if (!isOperationCancelled(err)) notify(api, "Nie udalo sie odczytac listu.");
        })
        .finally(() => {
          if (generation === connectionGeneration && !lock.locked) ui.setBusy(null);
        });
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
      openArchiveFromServer(letter);
    },
    onOpenArchiveOccurrence: (letter, occurrence) => {
      // Fala 35e: podglad konkretnego wystapienia blizniaka (1-based).
      // Slot z trescia otwiera sie z pamieci; pusty - doczyt z serwera
      // (jedno wystapienie klucza, ta sama sciezka co klik w wiersz).
      const slot = bodiesOf(letter)[occurrence - 1];
      if (slot && slot.length > 0) {
        const senderBox = letter.box === "odebrane" || letter.box === "nieprzeczytane";
        ui.openLetter(letter.box, {
          number: letter.number,
          from: senderBox ? letter.party : "",
          subject: letter.subject,
          to: senderBox ? "" : letter.party,
          cc: null,
          date: letter.dateRaw,
          body: slot,
        });
        return;
      }
      openArchiveFromServer(letter);
    },
    onDownloadArchiveBodies: () => runArchiveDownload(),
    // Indeksacja wszystkich skrzynek jako osobna operacja.
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
      // Zapis uzywa wylacznie danych juz dostepnych w archiwum.
      runExportArchive();
    },
    onSendCompose: (input) => {
      const validationError = validateCompose(input);
      if (validationError) {
        notify(api, validationError);
        return;
      }
      // Fala 12a: jak przy odczycie - zero cichego kolejkowania sesji.
      if (lock.locked) {
        notify(api, SESSION_BUSY_MSG);
        return;
      }
      ui.setBusy("Wysylam list...");
      const generation = connectionGeneration;
      void runExclusive(async () => {
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
              // Fala 28: wczesniej refreshowala sie tylko skrzynka
              // "wyslane" - rekord szkicu w "niewyslane" zostawal zywy
              // w bazie obok wyslanej kopii i totalne liczniki sie
              // rozjezdzaly. Pelny listing niewyslanych usuwa szkic.
              refreshBoxes(["wyslane", "niewyslane"]);
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
        .catch((err: unknown) => {
          if (!isOperationCancelled(err)) notify(api, "Blad wysylki listu.");
        })
        .finally(() => {
          if (generation === connectionGeneration && !lock.locked) ui.setBusy(null);
        });
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
      const validationError = validateListingSearch(query);
      if (validationError) {
        notify(api, validationError);
        return;
      }
      if (lock.locked) {
        notify(api, SESSION_BUSY_MSG);
        return;
      }
      ui.setBusy(`Szukam w skrzynce ${box}...`);
      const generation = connectionGeneration;
      void runExclusive(async () => {
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
            notify(api, `Wyniki szukania (${formatListCount(res.entries.length)}).`);
          } else {
            notify(api, "Brak pasujacych listow.");
          }
        })
        .catch((err: unknown) => {
          if (!isOperationCancelled(err)) {
            notify(api, `Blad szukania: ${humanizeMailError(err instanceof Error ? err.message : String(err))}`);
          }
        })
        .finally(() => {
          if (generation === connectionGeneration && !lock.locked) ui.setBusy(null);
        });
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
      const generation = connectionGeneration;
      ui.setBusy("Czyszcze zapisane dane...");
      void runExclusive(async () => {
        await storage.clearMailData([INDEX_KEY, ARCHIVE_GAPS_KEY]);
        if (generation !== connectionGeneration) return;
        ui.clearCacheData();
        notify(api, "Zapisane dane wyczyszczone.");
      })
        .catch((err: unknown) => {
          if (!isOperationCancelled(err)) {
            notify(api, "Nie udalo sie wyczyscic zapisanych danych.");
          }
        })
        .finally(() => {
          if (generation === connectionGeneration && !lock.locked) ui.setBusy(null);
        });
    },
    onDeleteLetter: (box, entry) => {
      // Fala 12a: zero cichego kolejkowania sesji modalnych.
      if (lock.locked) {
        notify(api, SESSION_BUSY_MSG);
        return;
      }
      ui.setBusy(`Usuwam list: ${entry.subject}...`);
      const generation = connectionGeneration;
      void runExclusive(async () => {
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
              // Replace (Fala 12b): skasowany list ma byc ukryty
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
        .catch((err: unknown) => {
          if (!isOperationCancelled(err)) notify(api, "Blad kasowania listu.");
        })
        .finally(() => {
          if (generation === connectionGeneration && !lock.locked) ui.setBusy(null);
        });
    },
    onForwardLetter: (box, entry, adresat) => {
      // Fala 12a: zero cichego kolejkowania sesji modalnych.
      if (lock.locked) {
        notify(api, SESSION_BUSY_MSG);
        return;
      }
      ui.setBusy(`Przekazuje list: ${entry.subject}...`);
      const generation = connectionGeneration;
      void runExclusive(async () => {
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
        .catch((err: unknown) => {
          if (!isOperationCancelled(err)) notify(api, "Blad przekazania listu.");
        })
        .finally(() => {
          if (generation === connectionGeneration && !lock.locked) ui.setBusy(null);
        });
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
      // Uwaga: stan zakladki usuwanie NIE jest tu kasowany. Gracz z
      // otwartym popupem pisze komendy do gry - resetowanie wynikow na
      // kazda komende zabijalo usuwanie na zywym kliencie, a zakladka
      // Listy tego nie robi (parzystosc, zgloszenie 2026-10-30).
      // Bezpieczenstwo dubla nadal stoi: deleteSelectedLetters bierze
      // swiezy listing i dopasowuje po kluczach tresci, nie numerach.
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

    refreshPopup();
    deactivateActiveCharacter = async (): Promise<void> => {
      cancelConnectionOperations();
      api.events.off("client.connect", onClientConnect);
      api.events.off("client.disconnect", onClientDisconnect);
      api.events.off("gmcp.mail.state", onMailState);
      api.events.off("gmcp", onAnyGmcp);
      api.events.off("gmcp.char.info", onGamePresence);
      api.events.off("gmcp.char.name", onGamePresence);
      api.events.off("gmcp_msg.room.long", onGamePresence);
      api.events.off("proxy.session", onProxySession);
      api.events.off("gmcp_msg.system.login", onSystemLogin);
      api.events.off("gmcp.mail.state", onGamePresence);
      for (const timer of [animalTimer, sluchamTimer, unsentFlashTimer, playerMailModeTimer]) {
        if (timer !== null) clearTimeout(timer);
      }
      animalTimer = null;
      sluchamTimer = null;
      unsentFlashTimer = null;
      playerMailModeTimer = null;
      for (const timer of delayedInboxTimers) clearTimeout(timer);
      delayedInboxTimers = [];
      await Promise.allSettled([...tasks]);
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
      handlersRef = null;
      store = null;
      if (transport) {
        transport.dispose();
        transport = null;
      }
      if (storageRef === storage) storageRef = null;
      await storage.close();
    };
    return true;
  };

  const switchCharacter = async (name: string | null): Promise<void> => {
    const normalized = name?.trim() || null;
    const key = normalized?.toLowerCase() ?? null;
    if (key === activeName) return;
    await deactivateCurrent();
    if (lifecycleDestroyed || key !== (requestedName?.trim().toLowerCase() || null)) return;
    if (!normalized) return;
    if (await activateCharacter(normalized)) activeName = key;
  };
  unsubscribeCharacter = api.character.onChange((name) => {
    requestedName = name;
    switchQueue = switchQueue.then(() => switchCharacter(name)).catch(() => {});
  });
  await switchCharacter(requestedName);

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
  lifecycleDestroyed = true;
  if (unsubscribeCharacter) {
    unsubscribeCharacter();
    unsubscribeCharacter = null;
  }
  if (deactivateActiveCharacter) {
    const deactivate = deactivateActiveCharacter;
    deactivateActiveCharacter = null;
    await deactivate();
  }
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
  if (playerMailModeTimer !== null) {
    clearTimeout(playerMailModeTimer);
    playerMailModeTimer = null;
  }
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
  if (storageRef) {
    const storage = storageRef;
    storageRef = null;
    await storage.close();
  }
  apiRef = null;
}
