/**
 * ArkMail - kompleksowy system pocztowy dla klienta Dargoth (Arkadia MUD).
 * Alias: /arkmail (otwiera/zamyka okno). Menu wtyczek: "ArkMail".
 * Klawisz w stopce klienta: ArkMail (badge z liczba nieprzeczytanych).
 *
 * Fala 4c: wiring - UI (MailUiStore + render) polaczone z sesjami
 * protokolu przez DargothTransport i SessionLock. Powiadomienie
 * "[ POCZTA ] Masz nowa poczte..." odswieza odebrane/nieprzeczytane.
 * Archiwum i ustawienia trwale w localStorage per postac.
 * Plugin w pelni zgodny z regulaminem gry - wszystkie komendy
 * wysylane swiadomie przez gracza (klik w UI).
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
import { parseNotification } from "./core/protocol/parser";
import {
  olderListingCommand,
  nextDay,
  searchListingCommand,
  searchDescription,
} from "./core/protocol/commands";
import type { LetterTemplate } from "./core/letterRender";
import { contactsFromBoxes } from "./core/contacts";
import {
  fromMailboxEntry,
  fromOpenedLetter,
  upsertLetters,
  type ArchiveLetter,
} from "./core/archive";
import { MailboxSession, type MailboxEntry } from "./core/session/mailbox";
import { PagerSession } from "./core/session/pager";
import { EditorSession } from "./core/session/editor";
import { SessionLock } from "./core/sessionLock";
import { DargothTransport } from "./adapters/dargothTransport";
import { CharStorage, type KVLike } from "./adapters/storage";
import { notify } from "./adapters/notify";
import { MailUiStore } from "./ui/store";
import { mountMailUi, type MailUiHandlers } from "./ui/render";

const POPUP_ID = "arkmail";
const FOOTER_BUTTON_ID = "arkmail";
const FOOTER_STATE = "arkmail-poczta";
const ALIAS_REGEX = /^\/arkmail$/i;
const SESSION_OPTS = { timeoutMs: 8000, idleMs: 400 };
/** Bezpieczniki petli "Wczytaj wszystkie" (Fala 8e): twardy limit stron
 *  na jedno klikniecie i pauza miedzy stronami (grzecznosc wobec serwera). */
export const LOAD_ALL_MAX_PAGES = 40;
export const LOAD_ALL_PACE_MS = 400;
/**
 * Kontekst listingu serwera (Fala 9a): kazde pobranie listingu
 * (lista niepusta) dostaje kolejny numer. Serwer interpretuje
 * "przeczytaj list N" wzgledem OSTATNIEGO listingu, wiec numer wpisu
 * jest wazny tylko w jego kontekscie.
 */
let listingCtx = 0;
const ARCHIVE_KEY = "archiwum";
const NOTIFY_KEY = "powiadomienia";
const COMPOSE_KEY = "compose";

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

function createContent(): HTMLDivElement {
  const root = document.createElement("div");
  if (unmount) {
    unmount();
    unmount = null;
  }
  if (store && handlersRef) {
    unmount = mountMailUi(root, store, handlersRef);
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
  const composePrefs = storage.getJSON<{ template?: LetterTemplate; width?: number }>(COMPOSE_KEY);
  store = new MailUiStore({
    notifyEnabled: storage.getJSON<boolean>(NOTIFY_KEY) ?? false,
    archive: storage.getJSON<ArchiveLetter[]>(ARCHIVE_KEY) ?? [],
    composeTemplate: composePrefs?.template ?? "plain",
    composeWidth: composePrefs?.width ?? 60,
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
   * Kontakty WYLACZNIE z korespondencji (nadawcy/adresaci z pobranych
   * listingow) - bez doklejania calej bazy znanych osob klienta.
   * (Decyzja uzytkownika, Fala 7b: zakladka Kontakty ma pokazywac
   * tylko osoby, z ktorymi jest realna poczta.)
   */
  const rebuildContacts = (): void => {
    ui.setContacts(contactsFromBoxes(ui.state.boxes, []));
  };

  /**
   * Pobranie skrzynek. Tryb "merge" (powiadomienie o nowej poczcie,
   * Fala 9b): swieza strona SCALA sie z widokiem - nowe wpisy laduja
   * na gorze, wczytane strony zostaja; znacznik uciecia zostaje
   * zdjety tylko, gdy mamy juz komplet. Tryb "replace" (domyslny):
   * pelna wymiana widoku (reczne odswiezenie, po operacjach).
   */
  const refreshBoxes = (boxes: MailBox[], mode: "replace" | "merge" = "replace"): void => {
    // Swiezy listing nadpisuje widok - tryb wynikow szukania na tych
    // skrzynkach przestaje obowiazywac (bez przywracania schowka).
    ui.clearSearchBoxes(boxes);
    void lock
      .runExclusive(async () => {
        for (const box of boxes) {
          ui.setBusy(`Pobieram skrzynke ${box}...`);
          const res = await mailbox.fetch(box);
          const view = mode === "merge" ? ui.state.boxes[box] : undefined;
          if (res.kind === "lista") stampEntries(res.entries);
          if (res.kind === "lista" && view && view.empty === null) {
            ui.appendMailboxPage(box, res.entries, view.truncated && res.header.truncated);
          } else {
            ui.applyMailbox(box, res);
          }
          if (res.kind === "lista") {
            // Cache (Fala 8f): KAZDE pobranie listingu dokleja wpisy do
            // archiwum (cicho, bez notify). Widok skrzynki NIE jest
            // hydratowany z cache - numery zyja w kontekscie ostatniego
            // listingu serwera.
            const merged = upsertLetters(
              ui.state.archive,
              res.entries.map((e) => fromMailboxEntry(box, e)),
            );
            ui.setArchive(merged.letters);
          }
        }
      })
      .catch(() => {})
      .finally(() => {
        ui.setBusy(null);
        rebuildContacts();
        persistArchive();
      });
  };

  const persistArchive = (): void => {
    storage.setJSON(ARCHIVE_KEY, ui.state.archive);
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

  /** Nadaje wpisom kontekst biezacego listingu serwera (Fala 9a). */
  const stampEntries = (entries: MailboxEntry[]): void => {
    listingCtx += 1;
    for (const e of entries) e.ctx = listingCtx;
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
    if (entry.ctx !== undefined && entry.ctx === listingCtx) return entry;
    if (!entry.date) {
      notify(api, "Nie moge zlokalizowac listu (brak daty) - odswiez skrzynke.");
      return null;
    }
    const res = await mailbox.fetch(box, olderListingCommand(box, nextDay(entry.date)));
    if (res.kind === "lista") {
      stampEntries(res.entries);
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
    notify(api, "Nie znalazlem listu na swiezym listingu - odswiez skrzynke.");
    return null;
  };

  /** Paginacja wstecz: jedna starsza strona listingow do archiwum. */
  const loadOlder = (box: MailBox): void => {
    const view = ui.state.boxes[box];
    const oldest = oldestEntry(view?.entries ?? []);
    if (!oldest?.date) {
      notify(api, "Nie mozna wczytac starszych - najpierw pobierz skrzynke.");
      return;
    }
    // Kotwica: najstarsza data + 1 dzien ("przed" wyklucza caly dzien
    // graniczny; nakladanie zamiast dziur, duplikaty zdejmuje dedup).
    const anchor = nextDay(oldest.date);
    ui.setBusy("Wczytuje starsze listy...");
    void lock
      .runExclusive(async () => {
        const res = await mailbox.fetch(box, olderListingCommand(box, anchor));
        if (res.kind === "lista") {
          stampEntries(res.entries);
          ui.appendMailboxPage(box, res.entries, res.header.truncated);
          const incoming = res.entries.map((e) => fromMailboxEntry(box, e));
          const merged = upsertLetters(ui.state.archive, incoming);
          ui.setArchive(merged.letters);
          persistArchive();
          notify(api, `Wczytano starsze listy (nowych: ${merged.added}).`);
        } else {
          ui.appendMailboxPage(box, [], false);
          notify(api, "Brak starszych listow.");
        }
      })
      .catch((err: unknown) =>
        notify(api, `Blad wczytywania starszych: ${err instanceof Error ? err.message : String(err)}`),
      )
      .finally(() => ui.setBusy(null));
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
              stampEntries(res.entries);
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
              ui.appendMailboxPage(box, [], false);
            }
            ui.setLoadAll({ box, pages });
            ui.setBusy(`Wczytuje wszystkie (${box}): strona ${pages}`);
            if (!more || flag.cancelled) break;
            await sleepOrCancel(LOAD_ALL_PACE_MS, flag);
          }
          if (flag.cancelled) {
            notify(api, `Przerwiano (listow: ${added}, stron: ${pages}).`);
          } else if (pages >= LOAD_ALL_MAX_PAGES && ui.state.boxes[box]?.truncated) {
            notify(
              api,
              `Limit ${LOAD_ALL_MAX_PAGES} stron (listow: ${added}) - kliknij ponownie, aby kontynuowac.`,
            );
          } else {
            notify(api, `Wczytano wszystkie (listow: ${added}, stron: ${pages}).`);
          }
        } finally {
          loadAllFlag = null;
          ui.setLoadAll(null);
        }
      })
      .catch((err: unknown) =>
        notify(api, `Blad wczytywania: ${err instanceof Error ? err.message : String(err)}`),
      )
      .finally(() => ui.setBusy(null));
  };

  handlersRef = {
    onOpenLetter: (box, entry) => {
      ui.setBusy(`Czytam list: ${entry.subject}...`);
      void lock
        .runExclusive(async () => {
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
          } finally {
            transport!.endModal();
          }
        })
        .catch(() => notify(api, "Nie udalo sie odczytac listu."))
        .finally(() => ui.setBusy(null));
    },
    onSendCompose: (input) => {
      if (!input.adresat.trim() || !input.temat.trim()) {
        notify(api, "Adresat i temat sa wymagane.");
        return;
      }
      ui.setBusy("Wysylam list...");
      void lock
        .runExclusive(async () => {
          transport!.beginModal();
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
            } else if (out.result === "gotowy") {
              notify(api, "List odlozony w niewyslanych.");
              refreshBoxes(["niewyslane"]);
            } else {
              notify(api, "Blad wysylki - sprawdz adresata.");
            }
          } finally {
            transport!.endModal();
          }
        })
        .catch(() => notify(api, "Blad wysylki listu."))
        .finally(() => ui.setBusy(null));
    },
    onCloseLetter: () => ui.closeLetter(),
    onRefreshBox: (box) => refreshBoxes([box]),
    onLoadOlder: (box) => loadOlder(box),
    onLoadAll: (box) => loadAll(box),
    onSearch: (box, query) => {
      ui.setBusy(`Szukam w skrzynce ${box}...`);
      void lock
        .runExclusive(async () => {
          const res = await mailbox.fetch(box, searchListingCommand(box, query));
          if (res.kind === "lista") stampEntries(res.entries);
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
          notify(api, `Blad szukania: ${err instanceof Error ? err.message : String(err)}`),
        )
        .finally(() => ui.setBusy(null));
    },
    onClearSearch: (box) => ui.clearSearch(box),
    onDeleteLetter: (box, entry) => {
      ui.setBusy(`Kasuje list: ${entry.subject}...`);
      void lock
        .runExclusive(async () => {
          const fresh = await resolveEntry(box, entry);
          if (!fresh) return;
          transport!.beginModal();
          try {
            const res = await pager.deleteLetters(fresh.number, String(fresh.number));
            if (res.deleted) {
              notify(api, "List oznaczony do skasowania.");
              ui.closeLetter();
              refreshBoxes([box]);
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

  // Powiadomienia pocztowe: odswiezenie + opcjonalny tost.
  transport.subscribe((line) => {
    const n = parseNotification(line.text);
    if (!n) return;
    if (n.kind === "nowa-poczte") {
      if (ui.state.notifyEnabled) notify(api, `Masz nowa poczte od ${n.nadawca}.`);
      refreshBoxes(["odebrane", "nieprzeczytane"], "merge");
    } else if (n.kind === "goniec") {
      refreshBoxes(["odebrane", "nieprzeczytane"], "merge");
    }
  });

  // Badge na klawiszu stopki.
  unsubBadge = ui.subscribe((s) => {
    footerHandle?.update({ label: s.badge > 0 ? `${PLUGIN_NAME} (${s.badge})` : PLUGIN_NAME });
    api.ui.setFooterButtonState(FOOTER_STATE, s.badge > 0);
    storage.setJSON(COMPOSE_KEY, { template: s.composeTemplate, width: s.composeWidth });
    storage.setJSON(NOTIFY_KEY, s.notifyEnabled);
  });

  popup = await api.ui.registerPersistentPopup({
    id: POPUP_ID,
    title: PLUGIN_NAME,
    initialWidth: 480,
    initialHeight: 640,
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
    author: PLUGIN_AUTHOR,
    description: PLUGIN_DESCRIPTION,
  };
}

export async function destroy() {
  if (unsubBadge) {
    unsubBadge();
    unsubBadge = null;
  }
  if (unmount) {
    unmount();
    unmount = null;
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
