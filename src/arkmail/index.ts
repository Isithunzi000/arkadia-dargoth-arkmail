/**
 * ArkMail - kompleksowy system pocztowy dla klienta Dargoth (Arkadia MUD).
 * Alias: /arkmail (otwiera/zamyka okno). Menu wtyczek: "ArkMail".
 * Klawisz w stopce klienta: ArkMail (odpala /arkmail).
 *
 * Fala 1: szkielet - rejestracja kontraktu pluginu, puste okno.
 * Kolejne fale dokladaja: rdzen protokolu poczty, adaptery, UI,
 * operacje pagerowe i archiwum. Plugin w pelni zgodny z regulaminem
 * gry - wszystkie komendy wysylane swiadomie przez gracza.
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

const POPUP_ID = "arkmail";
const FOOTER_BUTTON_ID = "arkmail";
const ALIAS_REGEX = /^\/arkmail$/i;

let apiRef: PluginApi | null = null;
let popup: PersistentPopupHandle | null = null;
let menuHandle: PopupMenuEntryHandle | null = null;
let footerHandle: FooterButtonHandle | null = null;
let aliasId: string | null = null;

function createContent(): HTMLDivElement {
  const root = document.createElement("div");
  root.className = "arkmail-root";
  const info = document.createElement("div");
  info.className = "arkmail-placeholder";
  info.textContent = `${PLUGIN_NAME} ${PLUGIN_VERSION} (${PLUGIN_BUILD_DATE}) - moduly pocztowe w budowie.`;
  root.appendChild(info);
  return root;
}

export async function init(api: PluginApi) {
  apiRef = api;
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
  });

  return {
    name: PLUGIN_NAME,
    version: PLUGIN_VERSION,
    author: PLUGIN_AUTHOR,
    description: PLUGIN_DESCRIPTION,
  };
}

export async function destroy() {
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
