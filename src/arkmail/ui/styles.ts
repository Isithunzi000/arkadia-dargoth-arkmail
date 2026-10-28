/**
 * Style ArkMail - jeden <style> wstrzykiwany do kontenera popupu.
 * Wszystko scopingowane pod .arkmail-root, zero globalnych regul.
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

const BG = '#1e1f24'; // tlo glowne
const BG_PANEL = '#26272e'; // panele, karty
const BG_RAISED = '#31333c'; // przyciski, hover
const BG_INPUT = '#141519'; // pola tekstowe
const FG = '#e6e6ea'; // tekst glowny
const FG_DIM = '#9a9da8'; // tekst przytlumiony
const BORDER = '#3a3c46'; // obramowania
const ACCENT = '#4a7de0'; // akcent (aktywne, wysylka)
const ACCENT_FG = '#ffffff';
const DANGER = '#b04a42'; // kasowanie

export const STYLES = `
.arkmail-root {
  display: flex;
  flex-direction: column;
  height: 100%;
  /* Fala 11c: panele scrolluja sie niezaleznie (overflow:auto na
     .arkmail-pane); root nie rosnie poza popup i nie scrolluje calosci. */
  overflow: hidden;
  box-sizing: border-box;
  padding: 10px;
  gap: 8px;
  background: ${BG};
  color: ${FG};
  color-scheme: dark;
  font-family: system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif;
  font-size: 13px;
  line-height: 1.45;
}
.arkmail-root *, .arkmail-root *::before, .arkmail-root *::after {
  box-sizing: border-box;
}

/* --- kontrolki bazowe: JAWNE kolory (bug bialy-na-bialym) --- */
.arkmail-root button {
  background: ${BG_RAISED};
  color: ${FG};
  border: 1px solid ${BORDER};
  border-radius: 6px;
  padding: 4px 12px;
  font: inherit;
  cursor: pointer;
  /* Fala 16k: etykiety przyciskow nie lamia sie w waskim popupie. */
  white-space: nowrap;
  /* Fala 17e: jednolita wysokosc i centrowanie etykiety niezaleznie
   * od jej dlugosci (zgloszenie pkt 1: obwodka spojna wielkosciowo). */
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-height: 26px;
}
.arkmail-root button:hover { background: #3b3d47; }
.arkmail-root input, .arkmail-root textarea, .arkmail-root select {
  background: ${BG_INPUT};
  color: ${FG};
  border: 1px solid ${BORDER};
  border-radius: 6px;
  padding: 5px 8px;
  font: inherit;
}
.arkmail-root input:focus, .arkmail-root textarea:focus, .arkmail-root select:focus {
  outline: none;
  border-color: ${ACCENT};
}
.arkmail-root input[type='checkbox'] { accent-color: ${ACCENT}; }
.arkmail-root input::placeholder, .arkmail-root textarea::placeholder {
  color: ${FG_DIM};
  font-size: 12px;
  opacity: 1;
}

/* --- zakladki: segmentowana belka --- */
.arkmail-tabs {
  display: flex;
  gap: 2px;
  flex-wrap: wrap;
  background: ${BG_PANEL};
  border: 1px solid ${BORDER};
  border-radius: 8px;
  padding: 3px;
}
.arkmail-root .arkmail-tab {
  border: 1px solid ${BG_PANEL};
  border-radius: 6px;
  background: ${BG_PANEL};
  color: ${FG_DIM};
  padding: 4px 12px;
}
.arkmail-root .arkmail-tab:hover { color: ${FG}; background: ${BG_RAISED}; }
.arkmail-root .arkmail-tab-active {
  background: ${ACCENT};
  border-color: ${ACCENT};
  color: ${ACCENT_FG};
  font-weight: 600;
}
.arkmail-root .arkmail-tab-active:hover { background: ${ACCENT}; color: ${ACCENT_FG}; }

/* --- pasek operacji --- */
.arkmail-busy {
  padding: 5px 10px;
  border: 1px solid ${BORDER};
  border-left: 3px solid ${ACCENT};
  border-radius: 6px;
  background: ${BG_PANEL};
  color: ${FG_DIM};
  font-size: 12px;
  white-space: normal;
  overflow-wrap: anywhere;
}
/* Fala 18d (zgloszenie pkt 2): pasek postepu pod tekstem busy przy
   masowym pobieraniu tresci (jedyna petla ze znanym total). */
.arkmail-busy-track {
  margin-top: 4px;
  height: 6px;
  border-radius: 3px;
  background: ${BG};
  overflow: hidden;
}
.arkmail-busy-bar {
  height: 100%;
  border-radius: 3px;
  background: ${ACCENT};
  transition: width 200ms ease-out;
}

/* --- panele --- */
.arkmail-pane {
  flex: 1;
  overflow: auto;
  min-height: 0;
  background: ${BG_PANEL};
  border: 1px solid ${BORDER};
  border-radius: 8px;
  padding: 8px;
}
.arkmail-pane::-webkit-scrollbar { width: 8px; }
.arkmail-pane::-webkit-scrollbar-thumb { background: ${BORDER}; border-radius: 4px; }

/* --- skrzynki: pigulki --- */
.arkmail-boxes { display: flex; gap: 4px; margin-bottom: 8px; flex-wrap: wrap; }
.arkmail-root .arkmail-box {
  border-radius: 999px;
  padding: 3px 12px;
  background: ${BG};
  color: ${FG_DIM};
  border: 1px solid ${BORDER};
}
.arkmail-root .arkmail-box:hover { color: ${FG}; background: ${BG_RAISED}; }
.arkmail-root .arkmail-box-active {
  background: ${ACCENT};
  border-color: ${ACCENT};
  color: ${ACCENT_FG};
  font-weight: 600;
}
.arkmail-root .arkmail-box-active:hover { background: ${ACCENT}; color: ${ACCENT_FG}; }
/* Fala 16f: trwaly akcent (obwodka) na skrzynce z licznikiem > 0 -
   Nieprzeczytane/Niewyslane widac z daleka (zgloszenie pkt 5/8). */
.arkmail-root .arkmail-box-attention {
  border-color: ${ACCENT};
  color: ${FG};
}

/* Fala 11e: zbiorcze operacje na aktywnej skrzynce (zamiast ↻ per box). */
.arkmail-box-ops { display: flex; flex-wrap: wrap; gap: 6px; margin-bottom: 8px; }
.arkmail-box-ops button { flex: 1 1 140px; }
.arkmail-root button:disabled { opacity: 0.45; cursor: default; }
.arkmail-root button:disabled:hover { background: ${BG_RAISED}; }

/* --- wiersze listow: nadawca | temat | data --- */
.arkmail-entry {
  display: flex;
  align-items: baseline;
  gap: 8px;
  padding: 6px 8px;
  border-radius: 6px;
  border-bottom: 1px solid ${BG};
  cursor: pointer;
}
.arkmail-entry:hover { background: ${BG_RAISED}; }
.arkmail-entry-num { color: ${FG_DIM}; font-size: 11px; min-width: 26px; text-align: right; }
.arkmail-entry-party {
  min-width: 110px;
  max-width: 180px;
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
.arkmail-entry-date { color: ${FG_DIM}; font-size: 11px; white-space: nowrap; }
/* Fala 16f: nieprzeczytany wiersz dodatkowo JAŚNIEJSZY (pkt 8: kropka +
   pogrubienie + rozjasnienie; po odczyciu listing daje *R* i wiersz
   wraca do normalnego). */
.arkmail-unread { background: ${BG_PANEL}; }
.arkmail-unread .arkmail-entry-party, .arkmail-unread .arkmail-entry-subject {
  color: ${FG};
  font-weight: 700;
}
.arkmail-unread::before {
  content: '';
  align-self: center;
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: ${ACCENT};
  flex: none;
}

.arkmail-root .arkmail-older { margin-top: 8px; width: 100%; }
.arkmail-older-row { display: flex; gap: 6px; margin-top: 8px; }
/* Fala 11a: szukajka stosowo (2 kolumny), nie 5 w linii - w waskiej
   kolumnie splitu pola tekstowe zachowuja sensowna szerokosc. */
.arkmail-search-row {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 6px;
  margin: 8px 0;
  align-items: center;
}
.arkmail-search-row .arkmail-search-go { grid-column: 1 / -1; }
/* Fala 30a: Tresc pelna szerokosc, dzieki temu pola dat laduja para
   Od|Do w jednym rzedzie (lewo-prawo, jak czyta sie zakres). */
.arkmail-search-row .arkmail-search-wide { grid-column: 1 / -1; }
.arkmail-search-row input[type='date'] { color-scheme: dark; }
/* Pole daty z widoczna etykieta (placeholder na date nie dziala). */
.arkmail-date-field { display: flex; flex-direction: column; gap: 2px; min-width: 0; }
.arkmail-date-field input { width: 100%; box-sizing: border-box; }
.arkmail-date-label { color: ${FG_DIM}; font-size: 11px; }
.arkmail-dates-error { color: ${DANGER}; font-size: 12px; margin-bottom: 6px; }
.arkmail-search-banner {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  background: ${BG_RAISED};
  border: 1px solid ${ACCENT};
  border-radius: 8px;
  padding: 6px 10px;
  margin-bottom: 8px;
  color: ${FG};
  font-size: 12px;
}
.arkmail-root .arkmail-search-clear { flex: none; padding: 2px 10px; }
.arkmail-older-row .arkmail-older { margin-top: 0; flex: 1; }
.arkmail-root .arkmail-older-all { flex: 1; }
.arkmail-root button.arkmail-older-all { margin-top: 8px; width: 100%; }
.arkmail-older-row button.arkmail-older-all { margin-top: 0; width: auto; }
/* Fala 17e: "Wczytaj wszystkie" w box-ops - regula paginacji wyzej
 * (margin-top: 8px; width: 100%) lapala go specyficznoscia 0,2,1 i
 * przycisk odjezdzal od sasiadow (zgloszenie pkt 1). */
.arkmail-box-ops button.arkmail-older-all { margin-top: 0; width: auto; }

/* --- widok listu --- */
.arkmail-letter-head {
  position: relative;
  background: ${BG};
  border: 1px solid ${BORDER};
  border-radius: 8px;
  padding: 8px 12px;
  margin-bottom: 8px;
}
.arkmail-letter-subject { font-size: 15px; font-weight: 700; color: ${FG}; }
.arkmail-letter-meta { color: ${FG_DIM}; font-size: 12px; margin-top: 2px; }
.arkmail-letter-body {
  white-space: pre-wrap;
  font-family: 'IBM Plex Mono', ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  font-size: 12px;
  background: ${BG};
  border: 1px solid ${BORDER};
  border-radius: 8px;
  padding: 10px 12px;
  color: ${FG};
}
.arkmail-letter-ops { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 8px; align-items: center; }
.arkmail-letter-ops input { flex: 1; }
.arkmail-root .arkmail-del {
  background: ${DANGER};
  border-color: ${DANGER};
  color: ${ACCENT_FG};
}
.arkmail-root .arkmail-del:hover { background: #c2564d; }
.arkmail-fwd { flex: none; }

/* --- formularz compose --- */
.arkmail-form label { display: block; margin: 6px 0 3px; color: ${FG_DIM}; font-size: 12px; }
.arkmail-form input, .arkmail-form textarea, .arkmail-form select {
  width: 100%;
}
.arkmail-form textarea { min-height: 120px; resize: vertical; }
.arkmail-preview {
  margin: 0;
  padding: 8px 10px;
  background: ${BG_INPUT};
  color: ${FG_DIM};
  border: 1px solid ${BORDER};
  border-radius: 6px;
  font-family: 'IBM Plex Mono', ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  font-size: 12px;
  white-space: pre;
  overflow: auto;
  max-height: 220px;
}
/* Fala 12d: podglad compose bez obcinania. W split (wide) pre rozciaga
   sie na pelna wysokosc prawego panelu; tryb "Pelne okno" to ten sam
   pre na calym popupie. Belka z przyciskiem nad podgladem. */
.arkmail-preview-bar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 8px;
  margin-bottom: 4px;
}
.arkmail-preview-bar label { margin: 0; }
.arkmail-split-compose .arkmail-pane { display: flex; flex-direction: column; }
.arkmail-split-compose .arkmail-preview { flex: 1; max-height: none; }
.arkmail-preview-full-pane { display: flex; flex-direction: column; }
.arkmail-preview-full-pane .arkmail-preview { flex: 1; max-height: none; }
.arkmail-root .arkmail-send {
  margin-top: 10px;
  padding: 6px 18px;
  background: ${ACCENT};
  border-color: ${ACCENT};
  color: ${ACCENT_FG};
  font-weight: 600;
}
.arkmail-root .arkmail-send:hover { background: #5a8ae6; }

/* --- kontakty i archiwum --- */
.arkmail-contact, .arkmail-arch-entry {
  display: flex;
  gap: 8px;
  padding: 5px 8px;
  border-radius: 6px;
  border-bottom: 1px solid ${BG};
}
/* Fala 12c: klikalne jest IMIE (kierunek domyslny) + przyciski kierunku. */
.arkmail-contact:hover, .arkmail-arch-entry:hover { background: ${BG_RAISED}; }
.arkmail-contact-name { color: ${FG}; font-weight: 600; cursor: pointer; }
.arkmail-contact-name:hover { text-decoration: underline; }
.arkmail-contact-dirs { margin-left: auto; display: flex; gap: 4px; }
.arkmail-root .arkmail-contact-dir {
  background: ${BG_RAISED};
  color: ${FG};
  border: 1px solid ${BORDER};
  border-radius: 4px;
  padding: 1px 8px;
  font-size: 11px;
  cursor: pointer;
}
.arkmail-root .arkmail-contact-dir:hover { border-color: ${FG_DIM}; }
.arkmail-root .arkmail-contact-dir:disabled {
  opacity: 0.4;
  cursor: default;
}
.arkmail-contact-stats, .arkmail-arch-meta { color: ${FG_DIM}; font-size: 12px; }
.arkmail-contact-controls {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-bottom: 8px;
}
.arkmail-arch-controls {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 6px;
  margin-bottom: 8px;
}
.arkmail-arch-controls input[type='date'] { color-scheme: dark; }
.arkmail-root .arkmail-contact-filter { flex: 1 1 140px; min-width: 0; }
.arkmail-root .arkmail-contact-sort { max-width: 100%; }
.arkmail-contact-last { color: ${FG_DIM}; font-size: 11px; white-space: nowrap; }

.arkmail-notify-toggle { margin-right: 4px; }
.arkmail-dim { color: ${FG_DIM}; }

/* --- ghost-podpowiedzi (Fala 9g): wyszarzona sugestia za kursorem --- */
.arkmail-root .arkmail-ghost-wrap { position: relative; display: block; min-width: 0; }
.arkmail-root .arkmail-ghost-wrap > input { width: 100%; box-sizing: border-box; }
/* Pole przekazania moze zmniejszyc szerokosc albo przejsc do nowego rzedu. */
.arkmail-root .arkmail-letter-ops .arkmail-ghost-wrap { flex: 1 1 180px; min-width: 0; }
.arkmail-root .arkmail-ghost {
  position: absolute;
  inset: 0;
  /* padding inputu (5px 8px) + jego border (1px) = tekst 1:1 nad polem */
  padding: 6px 9px;
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
  grid-template-columns: minmax(280px, 2fr) minmax(0, 3fr);
  gap: 10px;
  flex: 1;
  min-height: 0;
}
/* Fala 11d: compose - formularz szerszy, podglad wezszy. */
.arkmail-wide .arkmail-split-compose {
  grid-template-columns: minmax(0, 3fr) minmax(280px, 2fr);
}
.arkmail-root .arkmail-letter-close {
  position: absolute;
  top: 6px;
  right: 10px;
  padding: 2px 10px;
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
