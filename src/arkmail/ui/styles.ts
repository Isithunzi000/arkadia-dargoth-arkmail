/**
 * Style ArkMail - jeden <style> wstrzykiwany do kontenera popupu.
 * Wnetrze jest scopingowane pod .arkmail-root. Jedyny wyjatek to
 * wlasny przycisk w natywnym naglowku, ktory znajduje sie poza rootem.
 *
 * Fala 7c: nowoczesny, ciemny wyglad programu pocztowego + naprawa
 * buga "bialy przycisk, niewidoczna czcionka" (klient Dargoth ma
 * ciemny motyw; 'transparent'/'inherit' przy kolorach dawaly
 * bialy-na-bialym). Wszystkie elementy interaktywne maja JAWNE
 * kolory - pilnowane testem tests/uiStyles.test.ts.
 *
 * Podzial dwukolumnowy: container query >= 900px szerokosci popupu
 * (popup jest plywajacym oknem, wiec matchMedia na viewporcie
 * byloby bledne - liczy sie szerokosc samego okna).
 */

// Motyw klienta zostaje zrodlem kolorow. ArkMail mapuje je wylacznie
// na wlasne role na .arkmail-root, bez nadpisywania tokenow --popup-*.
const BG = 'var(--arkmail-bg)';
const BG_PANEL = 'var(--arkmail-panel-bg)';
const BG_RAISED = 'var(--arkmail-raised-bg)';
const BG_INPUT = 'var(--arkmail-input-bg)';
const FG = 'var(--arkmail-text)';
const FG_DIM = 'var(--arkmail-secondary)';
const BORDER = 'var(--arkmail-border)';
const CONTROL_BORDER = 'var(--arkmail-control-border)';
const ACCENT = 'var(--arkmail-accent)';
const ACCENT_FG = 'var(--arkmail-on-accent)';
const DANGER_TEXT = 'var(--arkmail-danger-text)';
const BG_UNREAD = 'var(--arkmail-unread-bg)';
const UNREAD_MARKER = 'var(--arkmail-unread-marker)';

export const STYLES = `
/* Naglowek jest poza .arkmail-root; selektor ogranicza sie do jednej klasy. */
.arkmail-animal-send.popup-header-btn {
  color: var(--popup-accent);
  background: var(--popup-accent-subtle-bg);
}
.arkmail-root {
  --arkmail-bg: var(--popup-bg);
  --arkmail-panel-bg: var(--popup-section-bg);
  --arkmail-raised-bg: var(--popup-control-bg);
  --arkmail-input-bg: var(--popup-input-bg);
  --arkmail-text: var(--popup-text);
  --arkmail-secondary: color-mix(in oklab, var(--popup-text) 95%, transparent);
  --arkmail-placeholder: color-mix(in oklab, var(--popup-text) 95%, transparent);
  --arkmail-border: var(--popup-border);
  --arkmail-control-border: color-mix(in oklab, var(--popup-text) 60%, transparent);
  --arkmail-accent: var(--popup-accent);
  --arkmail-on-accent: black;
  --arkmail-danger-text: color-mix(in oklab, var(--popup-danger) 60%, var(--popup-text) 40%);
  --arkmail-danger-bg: var(--popup-danger-bg);
  --arkmail-unread-bg: var(--popup-accent-subtle-bg);
  --arkmail-unread-marker: color-mix(in oklab, var(--popup-accent) 60%, var(--popup-text) 40%);
  --arkmail-focus: var(--popup-text);
  display: flex;
  flex-direction: column;
  height: 100%;
  /* Fala 11c: panele scrolluja sie niezaleznie (overflow:auto na
     .arkmail-pane); root nie rosnie poza popup i nie scrolluje calosci. */
  overflow: hidden;
  box-sizing: border-box;
  padding: calc(10px * var(--window-font-scale, 1));
  gap: calc(8px * var(--window-font-scale, 1));
  background: ${BG};
  color: ${FG};
  line-height: 1.45;
}
.arkmail-version-footer {
  flex: 0 0 auto;
  min-width: 0;
  max-width: 100%;
  overflow-wrap: anywhere;
  color: ${FG_DIM};
  font-size: calc(11px * var(--window-font-scale, 1));
  line-height: 1.3;
  text-align: right;
}
.arkmail-root *, .arkmail-root *::before, .arkmail-root *::after {
  box-sizing: border-box;
}

/* Kazdy przycisk ma natywne klasy klienta. Lokalne reguly zmieniaja
 * wylacznie uklad albo udowodnione stany kontrastu. */
.arkmail-root :is(button, input, textarea, select, [tabindex]):focus-visible {
  outline: calc(2px * var(--window-font-scale, 1)) solid var(--arkmail-focus);
  outline-offset: calc(1px * var(--window-font-scale, 1));
}
.arkmail-root button.popup-btn--solid,
.arkmail-root button.popup-btn.popup-btn--solid:hover:not(:disabled),
.arkmail-root button.popup-btn--solid:active {
  background: ${ACCENT};
  border-color: ${ACCENT};
  color: ${ACCENT_FG};
  filter: none;
}
.arkmail-root button.popup-btn--control:not(.popup-btn--ghost),
.arkmail-root .popup-input--control {
  border-color: ${CONTROL_BORDER};
}
.arkmail-root .dialog-tabs {
  border-color: ${CONTROL_BORDER};
}
.arkmail-root .dialog-tab.is-active,
.arkmail-root .dialog-tab.is-active:hover {
  background: ${ACCENT};
  border-color: ${ACCENT};
  color: ${ACCENT_FG};
}

/* Zgloszenie 2026-11-05 (A3): poziomy przyciskow to klasy natywnego
 * UI klienta (popup-btn--control/solid/danger/ghost) - zero wlasnych
 * regul kolorow; wyglad i kontrast pilnuje motyw klienta.
 * K2: uzbrojony guard dwukliku (pierwszy klik) dostaje wypelnienie
 * danger i grubsza jasniejsza obwodke - stan "drugi klik kasuje" widac
 * z daleka, wyraznie odroznialny od ghosta w spoczynku. Selektor ma
 * wyzsza specyficznosc niz .popup-btn--danger.ghost klienta. */
.arkmail-root button.popup-btn--danger[data-armed="1"] {
  background: var(--arkmail-danger-bg);
  border-color: ${DANGER_TEXT};
  color: ${DANGER_TEXT};
  outline: calc(2px * var(--window-font-scale, 1)) solid ${DANGER_TEXT};
  outline-offset: calc(1px * var(--window-font-scale, 1));
}
/* Zgloszenie 2026-11-05 (F4c): pola tekstowe uzywaja natywnych klas
 * klienta (popup-input popup-input--control) - tlo, obwodka, fokus
 * i placeholder pilnuje motyw klienta. Zostaja tylko checkboxy. */
.arkmail-root input[type='checkbox'] { accent-color: ${ACCENT}; }
.arkmail-root .popup-input::placeholder {
  color: var(--arkmail-placeholder);
  opacity: 1;
}
.arkmail-root select.popup-input {
  appearance: none;
  background-image:
    linear-gradient(45deg, transparent 50%, ${FG_DIM} 50%),
    linear-gradient(135deg, ${FG_DIM} 50%, transparent 50%);
  background-position:
    right calc(16px * var(--window-font-scale, 1)) top 50%,
    right calc(11px * var(--window-font-scale, 1)) top 50%;
  background-size:
    calc(5px * var(--window-font-scale, 1)) calc(5px * var(--window-font-scale, 1)),
    calc(5px * var(--window-font-scale, 1)) calc(5px * var(--window-font-scale, 1));
  background-repeat: no-repeat;
  border-color: ${CONTROL_BORDER};
  padding-right: calc(28px * var(--window-font-scale, 1));
}

/* --- zakladki: segmentowana belka --- */
/* Zgloszenie 2026-11-05 (F4c): belka zakladek to klasy natywnego UI
 * klienta (dialog-tabs / dialog-tab + is-active) - segment, kolory
 * i hover pilnuje motyw klienta. */

/* --- pasek operacji --- */
.arkmail-root .arkmail-tabs.dialog-tabs {
  flex: 0 0 auto;
  align-self: stretch;
  width: 100%;
  flex-wrap: wrap;
  overflow-x: visible;
}
.arkmail-root .arkmail-tabs .arkmail-tab {
  flex: 1 1 calc(110px * var(--window-font-scale, 1));
  height: auto;
  min-height: calc(32px * var(--window-font-scale, 1));
  white-space: normal;
  overflow-wrap: anywhere;
}

.arkmail-busy {
  padding: calc(5px * var(--window-font-scale, 1)) calc(10px * var(--window-font-scale, 1));
  border: calc(1px * var(--window-font-scale, 1)) solid ${BORDER};
  border-left: calc(3px * var(--window-font-scale, 1)) solid ${ACCENT};
  border-radius: calc(6px * var(--window-font-scale, 1));
  background: ${BG_PANEL};
  color: ${FG_DIM};
  font-size: calc(12px * var(--window-font-scale, 1));
  white-space: normal;
  overflow-wrap: anywhere;
}
/* Fala UI-1: wspolny pasek na dole okna - status (lewo) + wersja
   (prawo). Zawsze zamontowany: wysokosc layoutu stala niezaleznie
   od tego, czy status jest pokazany. */
.arkmail-status {
  flex: 0 0 auto;
  display: flex;
  flex-wrap: wrap;
  justify-content: space-between;
  align-items: flex-end;
  gap: calc(8px * var(--window-font-scale, 1));
}
.arkmail-status .arkmail-busy { flex: 1 1 auto; min-width: 0; }
.arkmail-busy-empty { visibility: hidden; }
/* Fala 18d (zgloszenie pkt 2): pasek postepu pod tekstem busy przy
   masowym pobieraniu tresci (jedyna petla ze znanym total). */
.arkmail-busy-track {
  margin-top: calc(4px * var(--window-font-scale, 1));
  height: calc(6px * var(--window-font-scale, 1));
  border-radius: calc(3px * var(--window-font-scale, 1));
  background: ${BG};
  overflow: hidden;
}
.arkmail-busy-bar {
  height: 100%;
  border-radius: calc(3px * var(--window-font-scale, 1));
  background: ${ACCENT};
  transition: width 200ms ease-out;
}

/* --- panele --- */
.arkmail-pane {
  flex: 1;
  overflow: auto;
  min-height: 0;
  background: ${BG_PANEL};
  border: calc(1px * var(--window-font-scale, 1)) solid ${BORDER};
  border-radius: calc(8px * var(--window-font-scale, 1));
  padding: calc(8px * var(--window-font-scale, 1));
}
/* W zwyklym ukladzie naglowek zostaje na miejscu, a liste przewija
   .arkmail-list-scroll. Gdy duza skala nie zostawia na liste zadnego
   miejsca, caly panel moze sie przewinac zamiast ukryc wiersze. */
.arkmail-listy {
  display: flex;
  flex-direction: column;
  overflow: auto;
}
/* Etap 8: semantyczne podpanele nie zmieniaja ukladu Archiwum;
   Kontakty zachowuja kolumnowy uklad listy w dodatkowym kontenerze. */
.arkmail-subpanel { display: contents; }
.arkmail-contact-subpanel {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
}
.arkmail-contact-subpanel-scroll { overflow: auto; }
.arkmail-list-scroll {
  flex: 1 0 calc(96px * var(--window-font-scale, 1));
  min-height: calc(96px * var(--window-font-scale, 1));
  overflow: auto;
}
/* Wydanie 1.30.1 (zgloszenia 2/3): klient daje natywnym kontrolkom
   min-height: 0, wiec jako dzieci kolumny o ograniczonej wysokosci
   kurcza sie do zera (etykiety nakladaja sie). Naglowek ma twarde
   flex: none; caly skurcz idzie w .arkmail-list-scroll. */
.arkmail-listy > button,
.arkmail-listy > .arkmail-boxes,
.arkmail-listy > .arkmail-search-row,
.arkmail-listy > .arkmail-group-add,
.arkmail-listy > .arkmail-group-filter { flex: none; }
.arkmail-pane::-webkit-scrollbar,
.arkmail-list-scroll::-webkit-scrollbar { width: calc(8px * var(--window-font-scale, 1)); }
.arkmail-pane::-webkit-scrollbar-thumb,
.arkmail-list-scroll::-webkit-scrollbar-thumb { background: ${BORDER}; border-radius: calc(4px * var(--window-font-scale, 1)); }

/* --- skrzynki: pigulki --- */
.arkmail-boxes { display: flex; gap: calc(4px * var(--window-font-scale, 1)); margin-bottom: calc(8px * var(--window-font-scale, 1)); flex-wrap: wrap; }
.arkmail-root button.arkmail-box {
  border-radius: calc(999px * var(--window-font-scale, 1));
  padding: calc(3px * var(--window-font-scale, 1)) calc(12px * var(--window-font-scale, 1));
}
.arkmail-root button.arkmail-box-active {
  background: ${ACCENT};
  border-color: ${ACCENT};
  color: ${ACCENT_FG};
  font-weight: 600;
}
.arkmail-root button.arkmail-box-active:hover { background: ${ACCENT}; color: ${ACCENT_FG}; }
/* Fala 16f: trwaly akcent (obwodka) na skrzynce z licznikiem > 0 -
   Nieprzeczytane/Niewyslane widac z daleka (zgloszenie pkt 5/8). */
.arkmail-root button.arkmail-box-attention {
  border-color: ${ACCENT};
  color: ${FG};
}

/* Fala 11e: zbiorcze operacje na aktywnej skrzynce (zamiast obrotu per box). */
/* Wydanie 1.30.1 (zgloszenie 1): klawisze operacji naturalnej
   szerokosci (bez rozciagania), odstep jak miedzy pigulkami skrzynek. */
.arkmail-box-ops { display: flex; flex-wrap: wrap; gap: calc(8px * var(--window-font-scale, 1)); margin-bottom: calc(8px * var(--window-font-scale, 1)); }
.arkmail-destructive-zone {
  flex: none;
  margin-top: auto;
  margin-bottom: 0;
  padding-top: calc(8px * var(--window-font-scale, 1));
}
.arkmail-box-ops button { flex: 0 1 auto; }
/* Wszystkie klawisze maja popup-btn, wiec jeden stan disabled
 * obejmuje tez skrzynki i miniakcje. */
.arkmail-root .popup-btn:disabled { opacity: 0.45; cursor: default; }
/* Zgloszenie 2026-11-05 (Etap 9): wybor pliku importu otwiera klawisz
 * - sama kontrolka pliku jest niewidoczna. */
.arkmail-root input[data-book-import] { display: none; }
/* Zgloszenie 2026-11-05: poziome linie oddzielajace sekcje w tokenach
 * obramowania (wczesniej domyslny styl klienta/browsera). */
.arkmail-root hr { border: none; border-top: calc(1px * var(--window-font-scale, 1)) solid ${BORDER}; margin: calc(8px * var(--window-font-scale, 1)) 0; }

/* --- wiersze listow: nadawca | temat | data --- */
.arkmail-entry {
  display: flex;
  align-items: baseline;
  gap: calc(8px * var(--window-font-scale, 1));
  padding: calc(6px * var(--window-font-scale, 1)) calc(8px * var(--window-font-scale, 1));
  border-radius: calc(6px * var(--window-font-scale, 1));
  border-bottom: calc(1px * var(--window-font-scale, 1)) solid ${BG};
  cursor: pointer;
}
.arkmail-entry:hover { background: ${BG_RAISED}; }
.arkmail-entry-num { color: ${FG_DIM}; font-size: calc(11px * var(--window-font-scale, 1)); min-width: calc(26px * var(--window-font-scale, 1)); text-align: right; }
.arkmail-entry-party {
  min-width: calc(110px * var(--window-font-scale, 1));
  max-width: calc(180px * var(--window-font-scale, 1));
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: ${FG};
}
.arkmail-entry-subject {
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: ${FG_DIM};
}
.arkmail-entry-date { color: ${FG_DIM}; font-size: calc(11px * var(--window-font-scale, 1)); white-space: nowrap; }
.arkmail-root:not(.arkmail-wide) .arkmail-entry { flex-wrap: wrap; }
.arkmail-root:not(.arkmail-wide) .arkmail-entry-party {
  min-width: 0;
  max-width: 100%;
  white-space: normal;
  overflow-wrap: anywhere;
}
.arkmail-root:not(.arkmail-wide) .arkmail-entry-subject {
  min-width: 0;
  white-space: normal;
  overflow-wrap: anywhere;
}
.arkmail-root:not(.arkmail-wide) .arkmail-entry-date {
  max-width: 100%;
  white-space: normal;
  overflow-wrap: anywhere;
}
/* Fala 16f: nieprzeczytany wiersz dodatkowo JASNIEJSZY (pkt 8: kropka +
   pogrubienie + rozjasnienie; po odczyciu listing daje *R* i wiersz
   wraca do normalnego). */
.arkmail-unread { background: ${BG_UNREAD}; box-shadow: inset calc(3px * var(--window-font-scale, 1)) 0 0 ${UNREAD_MARKER}; }
.arkmail-unread .arkmail-entry-party, .arkmail-unread .arkmail-entry-subject {
  color: ${FG};
  font-weight: 700;
}
.arkmail-unread::before {
  content: '';
  align-self: center;
  width: calc(7px * var(--window-font-scale, 1));
  height: calc(7px * var(--window-font-scale, 1));
  border-radius: 50%;
  background: ${UNREAD_MARKER};
  flex: none;
}

.arkmail-root .arkmail-older { margin-top: calc(8px * var(--window-font-scale, 1)); width: 100%; }
/* Fala 11a: szukajka stosowo (2 kolumny), nie 5 w linii - w waskiej
   kolumnie splitu pola tekstowe zachowuja sensowna szerokosc. */
.arkmail-search-row {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: calc(6px * var(--window-font-scale, 1));
  margin: calc(8px * var(--window-font-scale, 1)) 0;
  align-items: center;
}
.arkmail-search-row .arkmail-search-go { grid-column: 1 / -1; }
/* Fala 30a: Tresc pelna szerokosc, dzieki temu pola dat laduja para
   Od|Do w jednym rzedzie (lewo-prawo, jak czyta sie zakres). */
.arkmail-search-row .arkmail-search-wide { grid-column: 1 / -1; }
/* Pole daty z widoczna etykieta (placeholder na date nie dziala). */
.arkmail-date-field { display: flex; flex-direction: column; gap: calc(2px * var(--window-font-scale, 1)); min-width: 0; }
.arkmail-date-field input { width: 100%; box-sizing: border-box; }
.arkmail-root input[type='date'] { color-scheme: inherit; }
.arkmail-date-label { color: ${FG_DIM}; font-size: calc(11px * var(--window-font-scale, 1)); }
.arkmail-dates-error { color: ${DANGER_TEXT}; font-size: calc(12px * var(--window-font-scale, 1)); margin-bottom: calc(6px * var(--window-font-scale, 1)); }
.arkmail-search-banner {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: calc(8px * var(--window-font-scale, 1));
  background: ${BG_RAISED};
  border: calc(1px * var(--window-font-scale, 1)) solid ${ACCENT};
  border-radius: calc(8px * var(--window-font-scale, 1));
  padding: calc(6px * var(--window-font-scale, 1)) calc(10px * var(--window-font-scale, 1));
  margin-bottom: calc(8px * var(--window-font-scale, 1));
  color: ${FG};
  font-size: calc(12px * var(--window-font-scale, 1));
}
.arkmail-root button.arkmail-search-clear { flex: none; padding: calc(2px * var(--window-font-scale, 1)) calc(10px * var(--window-font-scale, 1)); }
.arkmail-root .arkmail-older-all { flex: 1; }
.arkmail-root button.arkmail-older-all { margin-top: calc(8px * var(--window-font-scale, 1)); width: 100%; }
/* Fala 17e: "Wczytaj wszystkie" w box-ops - regula paginacji wyzej
 * (margin-top: 8px; width: 100%) lapala go specyficznoscia 0,2,1 i
 * przycisk odjezdzal od sasiadow (zgloszenie pkt 1). */
.arkmail-box-ops button.arkmail-older-all { margin-top: 0; width: auto; flex: 0 1 auto; }

/* --- wspolny wiersz akcji --- */
.arkmail-action-row {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: calc(6px * var(--window-font-scale, 1));
  max-width: 100%;
}
.arkmail-action-group {
  display: flex;
  flex: 0 1 auto;
  flex-wrap: wrap;
  align-items: center;
  gap: calc(6px * var(--window-font-scale, 1));
  min-width: 0;
  max-width: 100%;
}
.arkmail-action-row > button,
.arkmail-action-group > button { flex: 0 1 auto; width: auto; max-width: 100%; }

/* Pole i akcja: ghost jest bezposrednim elastycznym dzieckiem flexa. */
.arkmail-field-action {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: calc(6px * var(--window-font-scale, 1));
  max-width: 100%;
}
.arkmail-field-action > input,
.arkmail-field-action > .arkmail-ghost-wrap { flex: 1 1 calc(140px * var(--window-font-scale, 1)); min-width: 0; }
.arkmail-field-action > button { flex: 0 1 auto; width: auto; max-width: 100%; }
.arkmail-field-action > .arkmail-group-error { flex: 1 0 100%; }
.arkmail-book-alias {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: calc(6px * var(--window-font-scale, 1));
  max-width: 100%;
}
.arkmail-book-alias-text { flex: 1 1 auto; min-width: 0; overflow-wrap: anywhere; }
.arkmail-book-alias > button { flex: 0 0 auto; width: auto; max-width: 100%; }
.arkmail-root:not(.arkmail-wide) .arkmail-book-alias { flex-direction: column; align-items: stretch; }
.arkmail-root:not(.arkmail-wide) .arkmail-book-alias > button { align-self: flex-start; }
.arkmail-alias-import { margin-top: calc(12px * var(--window-font-scale, 1)); }

.arkmail-group {
  min-width: 0;
  max-width: 100%;
  margin-bottom: calc(10px * var(--window-font-scale, 1));
  padding: calc(8px * var(--window-font-scale, 1));
  background: ${BG_RAISED};
  border: calc(1px * var(--window-font-scale, 1)) solid ${BORDER};
  border-radius: calc(8px * var(--window-font-scale, 1));
}
.arkmail-group-header { display: flex; align-items: center; min-width: 0; max-width: 100%; }
.arkmail-group-header .arkmail-group-toggle {
  flex: 0 1 auto;
  min-width: 0;
  max-width: 100%;
  overflow: hidden;
  text-overflow: ellipsis;
}
.arkmail-group-body {
  margin-top: calc(8px * var(--window-font-scale, 1));
  padding-top: calc(8px * var(--window-font-scale, 1));
  border-top: calc(1px * var(--window-font-scale, 1)) solid ${BORDER};
}
.arkmail-group-actions { margin-top: calc(8px * var(--window-font-scale, 1)); }
.arkmail-group-members {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: calc(6px * var(--window-font-scale, 1));
  margin-top: calc(8px * var(--window-font-scale, 1));
}
.arkmail-group-member { max-width: 100%; overflow-wrap: anywhere; }
.arkmail-group-member-add { margin-top: calc(8px * var(--window-font-scale, 1)); }

/* --- widok listu --- */
.arkmail-letter-head {
  position: relative;
  display: flex;
  align-items: flex-start;
  gap: calc(8px * var(--window-font-scale, 1));
  background: ${BG};
  border: calc(1px * var(--window-font-scale, 1)) solid ${BORDER};
  border-radius: calc(8px * var(--window-font-scale, 1));
  padding: calc(8px * var(--window-font-scale, 1)) calc(12px * var(--window-font-scale, 1));
  margin-bottom: calc(8px * var(--window-font-scale, 1));
}
.arkmail-letter-heading { flex: 1; min-width: 0; }
.arkmail-letter-subject { font-size: calc(15px * var(--window-font-scale, 1)); font-weight: 700; color: ${FG}; overflow-wrap: anywhere; }
.arkmail-letter-meta { color: ${FG_DIM}; font-size: calc(12px * var(--window-font-scale, 1)); margin-top: calc(2px * var(--window-font-scale, 1)); }
.arkmail-letter-body {
  white-space: pre-wrap;
  font-family: var(--output-font-family, 'IBM Plex Mono', ui-monospace, monospace);
  font-size: var(--output-font-size, calc(12px * var(--window-font-scale, 1)));
  background: ${BG};
  border: calc(1px * var(--window-font-scale, 1)) solid ${BORDER};
  border-radius: calc(8px * var(--window-font-scale, 1));
  padding: calc(10px * var(--window-font-scale, 1)) calc(12px * var(--window-font-scale, 1));
  color: ${FG};
  overflow-wrap: anywhere;
}
.arkmail-letter-ops { display: flex; flex-wrap: wrap; gap: calc(6px * var(--window-font-scale, 1)); margin-top: calc(8px * var(--window-font-scale, 1)); align-items: center; }
.arkmail-letter-ops input { flex: 1; }
/* Zgloszenie 2026-11-05 (A3): kolory klawisza kasowania listu daje
 * klasa natywna popup-btn--danger. */
.arkmail-fwd { flex: none; }

/* --- formularz compose --- */
.arkmail-compose-settings { display: grid; grid-template-columns: minmax(0, 1fr); gap: calc(6px * var(--window-font-scale, 1)); }
.arkmail-compose-setting { min-width: 0; }
.arkmail-wide .arkmail-compose-settings { grid-template-columns: repeat(2, minmax(0, 1fr)); }
.arkmail-compose-actions { margin-top: calc(10px * var(--window-font-scale, 1)); }
.arkmail-form label { display: block; min-width: 0; overflow-wrap: anywhere; margin: calc(6px * var(--window-font-scale, 1)) 0 calc(3px * var(--window-font-scale, 1)); color: ${FG_DIM}; font-size: calc(12px * var(--window-font-scale, 1)); }
.arkmail-form input, .arkmail-form textarea, .arkmail-form select {
  width: 100%;
}
/* Wydanie 1.30.1 (B1): sila 0,2,1 - regula klienta textarea.popup-input.popup-input--control
   (0,2,1; height: auto; min-height: var(--ui-ctrl)) inaczej zaglusza pluginowi
   wysokosc pola compose; remis specyficznosci wygrywa kolejnoscia. */
.arkmail-root .arkmail-form textarea { min-height: calc(120px * var(--window-font-scale, 1)); resize: vertical; }
.arkmail-preview {
  margin: 0;
  padding: calc(8px * var(--window-font-scale, 1)) calc(10px * var(--window-font-scale, 1));
  background: ${BG_INPUT};
  color: ${FG_DIM};
  border: calc(1px * var(--window-font-scale, 1)) solid ${BORDER};
  border-radius: calc(6px * var(--window-font-scale, 1));
  font-family: var(--output-font-family, 'IBM Plex Mono', ui-monospace, monospace);
  font-size: var(--output-font-size, calc(12px * var(--window-font-scale, 1)));
  white-space: pre;
  overflow: auto;
  max-height: calc(220px * var(--window-font-scale, 1));
}
/* Fala 12d: podglad compose bez obcinania. W split (wide) pre rozciaga
   sie na pelna wysokosc prawego panelu; tryb "Pelne okno" to ten sam
   pre na calym popupie. Belka z przyciskiem nad podgladem. */
.arkmail-preview-bar {
  display: flex;
  flex-wrap: wrap;
  justify-content: space-between;
  align-items: center;
  gap: calc(8px * var(--window-font-scale, 1));
  margin-bottom: calc(4px * var(--window-font-scale, 1));
}
.arkmail-preview-bar label { margin: 0; }
.arkmail-split-compose .arkmail-pane { display: flex; flex-direction: column; }
/* Wydanie 1.30.1: ta sama ochrona co w .arkmail-listy - pola klienta
   (min-height: 0) nie moga sie skurczyc do zera w kolumnie compose. */
.arkmail-split-compose .arkmail-pane > input,
.arkmail-split-compose .arkmail-pane > textarea,
.arkmail-split-compose .arkmail-pane > select,
.arkmail-split-compose .arkmail-pane > button { flex: none; }
.arkmail-split-compose .arkmail-preview { flex: 1; max-height: none; }
.arkmail-preview-full-pane { display: flex; flex-direction: column; }
.arkmail-preview-full-pane .arkmail-preview { flex: 1; max-height: none; }
.arkmail-root .arkmail-send {
  margin-top: 0;
  padding: calc(6px * var(--window-font-scale, 1)) calc(18px * var(--window-font-scale, 1));
  font-weight: 600;
}

/* --- usuwanie listow --- */
.arkmail-deletion-intro, .arkmail-deletion-message, .arkmail-deletion-summary,
.arkmail-deletion-limit, .arkmail-deletion-selected { margin: 0 0 calc(8px * var(--window-font-scale, 1)); }
.arkmail-deletion-intro, .arkmail-deletion-limit { color: ${FG_DIM}; }
.arkmail-deletion-controls, .arkmail-deletion-selection-ops {
  display: flex;
  flex-wrap: wrap;
  gap: calc(6px * var(--window-font-scale, 1));
  margin-bottom: calc(8px * var(--window-font-scale, 1));
}
.arkmail-root .arkmail-deletion-box { flex: 1 1 calc(140px * var(--window-font-scale, 1)); min-width: 0; }
.arkmail-deletion-filters {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(calc(150px * var(--window-font-scale, 1)), 1fr));
  gap: calc(6px * var(--window-font-scale, 1));
  margin-bottom: calc(10px * var(--window-font-scale, 1));
}
.arkmail-deletion-filter { min-width: 0; color: ${FG_DIM}; font-size: calc(12px * var(--window-font-scale, 1)); }
.arkmail-deletion-filter span { display: block; margin-bottom: calc(2px * var(--window-font-scale, 1)); }
.arkmail-root .arkmail-deletion-filter input { width: 100%; min-width: 0; }
.arkmail-deletion-results { border-top: calc(1px * var(--window-font-scale, 1)) solid ${BG}; }
.arkmail-deletion-entry {
  display: flex;
  align-items: flex-start;
  gap: calc(8px * var(--window-font-scale, 1));
  padding: calc(7px * var(--window-font-scale, 1)) calc(4px * var(--window-font-scale, 1));
  border-bottom: calc(1px * var(--window-font-scale, 1)) solid ${BG};
  cursor: pointer;
}
.arkmail-deletion-entry input { flex: none; margin-top: calc(3px * var(--window-font-scale, 1)); }
.arkmail-deletion-entry span { min-width: 0; overflow-wrap: anywhere; }
/* Zgloszenie 2026-11-05 (A3): kolor daje klasa natywna
 * popup-btn--danger. */

/* --- kontakty i archiwum --- */
.arkmail-contact, .arkmail-arch-entry {
  display: flex;
  gap: calc(8px * var(--window-font-scale, 1));
  padding: calc(5px * var(--window-font-scale, 1)) calc(8px * var(--window-font-scale, 1));
  border-radius: calc(6px * var(--window-font-scale, 1));
  border-bottom: calc(1px * var(--window-font-scale, 1)) solid ${BG};
}
.arkmail-contact {
  flex-wrap: wrap;
  align-items: center;
  min-width: 0;
}
.arkmail-arch-entry {
  flex-wrap: wrap;
  align-items: center;
  min-width: 0;
}
/* Fala 12c: klikalne jest IMIE (kierunek domyslny) + przyciski kierunku. */
.arkmail-contact:hover, .arkmail-arch-entry:hover { background: ${BG_RAISED}; }
.arkmail-contact-name {
  flex: 1 0 100%;
  min-width: 0;
  max-width: 100%;
  overflow-wrap: anywhere;
  color: ${FG};
  font-weight: 600;
  cursor: pointer;
}
.arkmail-wide .arkmail-contact .arkmail-contact-name {
  flex: 1 1 auto;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.arkmail-contact-name:hover { text-decoration: underline; }
.arkmail-contact-dirs {
  display: flex;
  flex: 0 1 auto;
  flex-wrap: wrap;
  gap: calc(4px * var(--window-font-scale, 1));
  max-width: 100%;
  margin-left: auto;
}
.arkmail-contact-dirs > button,
.arkmail-contact > .arkmail-contact-addbook {
  flex: 0 1 auto;
  width: auto;
  max-width: 100%;
}
/* Rodzina mini: kompaktowy wariant poziomu action (jeden jezyk przyciskow). */
.arkmail-root button.arkmail-contact-dir, .arkmail-root button.arkmail-contact-addbook {
  border-radius: calc(6px * var(--window-font-scale, 1));
  padding: calc(1px * var(--window-font-scale, 1)) calc(8px * var(--window-font-scale, 1));
  font-size: calc(11px * var(--window-font-scale, 1));
}
/* Etap 9 (A1): panel osob uzywa calej dostepnej wysokosci.
 * Jedynym przewijanym obszarem jest sama lista. */
.arkmail-root .arkmail-arch-people-panel {
  display: flex;
  flex-direction: column;
  flex: 1;
  min-height: 0;
  overflow: hidden;
}
.arkmail-root .arkmail-arch-people-list {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
}
/* Waski popup: wiersz ksiazki trzyma checkbox, imie i oba przyciski
 * w jednej linii; imie sie skraca (wielokropek), nie wypycha przyciskow.
 * Head grupy zawija kontrolki zamiast je ucinac. */
.arkmail-root .arkmail-book-row {
  display: flex;
  align-items: center;
  gap: calc(6px * var(--window-font-scale, 1));
}
.arkmail-root .arkmail-book-name {
  flex: 1 1 auto;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.arkmail-root .arkmail-group-head {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: calc(6px * var(--window-font-scale, 1));
}
.arkmail-contact-stats, .arkmail-arch-meta { color: ${FG_DIM}; font-size: calc(12px * var(--window-font-scale, 1)); }
.arkmail-contact-stats {
  flex: 1 1 auto;
  min-width: 0;
  overflow-wrap: anywhere;
}
.arkmail-arch-subject {
  flex: 1 0 100%;
  min-width: 0;
  max-width: 100%;
  overflow-wrap: anywhere;
}
.arkmail-wide .arkmail-arch-entry .arkmail-arch-subject {
  flex: 1 1 auto;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.arkmail-arch-meta {
  flex: 0 1 auto;
  min-width: 0;
  max-width: 100%;
  overflow-wrap: anywhere;
}
.arkmail-arch-date {
  flex: 0 0 auto;
  max-width: 100%;
  color: ${FG_DIM};
  font-size: calc(11px * var(--window-font-scale, 1));
  white-space: nowrap;
}
.arkmail-root:not(.arkmail-wide) .arkmail-arch-date {
  white-space: normal;
  overflow-wrap: anywhere;
}
.arkmail-contact-controls {
  display: flex;
  flex-wrap: wrap;
  gap: calc(6px * var(--window-font-scale, 1));
  margin-bottom: calc(8px * var(--window-font-scale, 1));
}
.arkmail-root .arkmail-arch-people-panel .arkmail-contact-controls { flex: none; }
.arkmail-archive-steps {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(calc(220px * var(--window-font-scale, 1)), 1fr));
  gap: calc(10px * var(--window-font-scale, 1));
  margin: calc(10px * var(--window-font-scale, 1)) 0 calc(12px * var(--window-font-scale, 1));
}
.arkmail-archive-step {
  position: relative;
  display: flex;
  flex-direction: column;
  min-width: 0;
  padding: calc(10px * var(--window-font-scale, 1));
  border: calc(1px * var(--window-font-scale, 1)) solid ${BORDER};
  border-left: calc(3px * var(--window-font-scale, 1)) solid ${FG_DIM};
  border-radius: calc(6px * var(--window-font-scale, 1));
  background: ${BG_RAISED};
}
.arkmail-archive-step-title { font-weight: 700; margin-bottom: calc(5px * var(--window-font-scale, 1)); }
.arkmail-archive-step-status {
  min-height: calc(34px * var(--window-font-scale, 1));
  margin-bottom: calc(9px * var(--window-font-scale, 1));
  color: ${FG_DIM};
  font-size: calc(12px * var(--window-font-scale, 1));
  line-height: 1.4;
}
.arkmail-archive-step button { width: 100%; margin: 0; margin-top: auto; }
.arkmail-step-active { border-left-color: ${ACCENT}; }
.arkmail-step-done { border-left-color: var(--popup-success); }
.arkmail-step-warning, .arkmail-step-incomplete { border-left-color: ${CONTROL_BORDER}; }
.arkmail-arch-controls {
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  gap: calc(6px * var(--window-font-scale, 1));
  margin-bottom: calc(8px * var(--window-font-scale, 1));
}
.arkmail-wide .arkmail-arch-controls {
  grid-template-columns: repeat(3, minmax(0, 1fr));
}
.arkmail-arch-controls > * { min-width: 0; }
.arkmail-arch-controls .arkmail-arch-clear {
  grid-column: 1 / -1;
  justify-self: start;
  width: auto;
  max-width: 100%;
}
.arkmail-contact-controls > .arkmail-ghost-wrap {
  flex: 1 1 calc(140px * var(--window-font-scale, 1));
  min-width: 0;
}
.arkmail-root .arkmail-contact-filter { min-width: 0; }
.arkmail-root .arkmail-contact-sort { max-width: 100%; }
.arkmail-contact-last {
  flex: 0 1 auto;
  min-width: 0;
  max-width: 100%;
  overflow-wrap: anywhere;
  color: ${FG_DIM};
  font-size: calc(11px * var(--window-font-scale, 1));
}

.arkmail-notify-toggle { margin-right: calc(4px * var(--window-font-scale, 1)); }
.arkmail-dim { color: ${FG_DIM}; }

/* --- ghost-podpowiedzi (Fala 9g): wyszarzona sugestia za kursorem --- */
.arkmail-root .arkmail-ghost-wrap { position: relative; display: block; min-width: 0; }
.arkmail-root .arkmail-ghost-wrap > input { width: 100%; box-sizing: border-box; }
/* Pole przekazania moze zmniejszyc szerokosc albo przejsc do nowego rzedu. */
.arkmail-root .arkmail-letter-ops .arkmail-ghost-wrap { flex: 1 1 calc(180px * var(--window-font-scale, 1)); min-width: 0; }
.arkmail-root .arkmail-ghost {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  /* Wydanie 1.30.1 (B2): ten sam font-size co pole klienta
     (var(--ui-input-fs)) i wyrownanie pionowe jak tekst w inputcie -
     podpowiedz stoi 1:1 za kursorem. Padding poziomy = padding
     inputu (8px) + jego border (1px). */
  font-size: var(--ui-input-fs, 14px);
  line-height: normal;
  padding: 0 calc(9px * var(--window-font-scale, 1));
  overflow: hidden;
  pointer-events: none;
  white-space: pre;
}
.arkmail-root .arkmail-ghost-typed { visibility: hidden; white-space: pre; }
.arkmail-root .arkmail-ghost-rest { color: ${FG_DIM}; white-space: pre; }

/* --- podzial lista|list na szerokim popupie (Fala 10) ---
   Uklad sterowany WYLACZNIE klasa .arkmail-wide z JS (ResizeObserver,
   prog 900px) - zero @container, jedno zrodlo prawdy, testowalne. */
.arkmail-wide .arkmail-split {
  display: grid;
  grid-template-columns: minmax(calc(280px * var(--window-font-scale, 1)), 2fr) minmax(0, 3fr);
  gap: calc(10px * var(--window-font-scale, 1));
  flex: 1;
  min-height: 0;
}
/* Fala 11d: compose - formularz szerszy, podglad wezszy. */
.arkmail-wide .arkmail-split-compose {
  grid-template-columns: minmax(0, 3fr) minmax(calc(280px * var(--window-font-scale, 1)), 2fr);
}
.arkmail-root .arkmail-letter-close {
  flex: 0 0 auto;
  padding: calc(2px * var(--window-font-scale, 1)) calc(10px * var(--window-font-scale, 1));
}

/* Fala 14b: pulsowanie Listy/Niewyslane po odlozeniu listu w kolejce.
   Kontrakt uiStyles: jawne hex (bez transparent/inherit). */
@keyframes arkmailFlash {
  0%, 100% { background: ${BG_RAISED}; color: ${FG}; }
  50% { background: ${ACCENT}; color: ${ACCENT_FG}; }
}
.arkmail-root .arkmail-flash {
  animation: arkmailFlash 0.6s ease-in-out 5;
}
`;
