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
const BORDER = '#787e8f'; // obramowania (AA non-text vs wszystkie panele)
const ACCENT = '#4a7de0'; // akcent (aktywne, wysylka, kropki, obwodki)
const ACCENT_SOFT = '#7ea2ee'; // tekst akcentowy na BG_RAISED (4.97)
const ACCENT_DEEP = '#3a63b8'; // tlo btn-primary (bialy 5.74)
const ACCENT_DEEPER = '#2f4f94'; // hover btn-primary (bialy 7.87)
const ACCENT_FG = '#ffffff';
const DANGER = '#b04a42'; // tlo btn-danger (bialy 5.38)
const DANGER_TEXT = '#d4736c'; // tekst bledow na panelu (4.58)
const BG_UNREAD = '#313a4e'; // tlo wiersza nieprzeczytanego
const ACCENT_BRIGHT = '#6b93ea'; // wyroznienia na BG_UNREAD (3.79)

export const STYLES = `
.arkmail-root {
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
  color-scheme: dark;
  line-height: 1.45;
}
.arkmail-version-footer {
  flex: 0 0 auto;
  color: ${FG_DIM};
  font-size: calc(11px * var(--window-font-scale, 1));
  line-height: 1.3;
  text-align: right;
}
.arkmail-root *, .arkmail-root *::before, .arkmail-root *::after {
  box-sizing: border-box;
}

/* --- kontrolki bazowe: JAWNE kolory (bug bialy-na-bialym) --- */
.arkmail-root button {
  background: ${BG_RAISED};
  color: ${FG};
  border: calc(1px * var(--window-font-scale, 1)) solid ${BORDER};
  border-radius: calc(6px * var(--window-font-scale, 1));
  padding: calc(4px * var(--window-font-scale, 1)) calc(12px * var(--window-font-scale, 1));
  font: inherit;
  cursor: pointer;
  /* Fala 16k: etykiety przyciskow nie lamia sie w waskim popupie. */
  white-space: nowrap;
  /* Fala 17e: jednolita wysokosc i centrowanie etykiety niezaleznie
   * od jej dlugosci (zgloszenie pkt 1: obwodka spojna wielkosciowo). */
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-height: calc(26px * var(--window-font-scale, 1));
}
.arkmail-root button:hover { background: #454a58; }

/* --- Fala 30: cztery poziomy przyciskow (jeden jezyk calego UI) --- */
.arkmail-root .arkmail-btn-primary {
  background: ${ACCENT_DEEP};
  border-color: ${ACCENT_DEEP};
  color: ${ACCENT_FG};
}
.arkmail-root .arkmail-btn-primary:hover { background: ${ACCENT_DEEPER}; border-color: ${ACCENT_DEEPER}; }
.arkmail-root .arkmail-btn-action {
  background: ${BG_RAISED};
  border: calc(1px * var(--window-font-scale, 1)) solid ${ACCENT};
  color: ${ACCENT_SOFT};
}
.arkmail-root .arkmail-btn-action:hover { background: #454a58; border-color: ${ACCENT_SOFT}; color: #ffffff; }
.arkmail-root .arkmail-btn-danger {
  background: ${DANGER};
  border-color: ${DANGER};
  color: ${ACCENT_FG};
}
.arkmail-root .arkmail-btn-danger:hover { background: #c04a40; border-color: #c04a40; }
/* Zgloszenie 2026-11-05: uzbrojony guard dwukliku (pierwszy klik)
   dostaje czerwone tlo niezaleznie od bazowej klasy klawisza - stan
   "drugi klik kasuje" widac z daleka, bez zmiany szerokosci przycisku. */
.arkmail-root button[data-armed="1"] { background: ${DANGER}; border-color: ${DANGER}; color: ${ACCENT_FG}; }
.arkmail-root .arkmail-btn-reset {
  background: ${BG_PANEL};
  border-color: ${BORDER};
  color: ${FG_DIM};
}
.arkmail-root .arkmail-btn-reset:hover { background: #2b2d34; }
.arkmail-root input, .arkmail-root textarea, .arkmail-root select {
  background: ${BG_INPUT};
  color: ${FG};
  border: calc(1px * var(--window-font-scale, 1)) solid ${BORDER};
  border-radius: calc(6px * var(--window-font-scale, 1));
  padding: calc(5px * var(--window-font-scale, 1)) calc(8px * var(--window-font-scale, 1));
  font: inherit;
}
.arkmail-root input:focus, .arkmail-root textarea:focus, .arkmail-root select:focus {
  outline: none;
  border-color: ${ACCENT};
}
.arkmail-root input[type='checkbox'] { accent-color: ${ACCENT}; }
.arkmail-root input::placeholder, .arkmail-root textarea::placeholder {
  color: ${FG_DIM};
  font-size: calc(12px * var(--window-font-scale, 1));
  opacity: 1;
}

/* --- zakladki: segmentowana belka --- */
.arkmail-tabs {
  display: flex;
  gap: calc(2px * var(--window-font-scale, 1));
  flex-wrap: wrap;
  background: ${BG_PANEL};
  border: calc(1px * var(--window-font-scale, 1)) solid ${BORDER};
  border-radius: calc(8px * var(--window-font-scale, 1));
  padding: calc(3px * var(--window-font-scale, 1));
}
.arkmail-root .arkmail-tab {
  border: calc(1px * var(--window-font-scale, 1)) solid ${BG_PANEL};
  border-radius: calc(6px * var(--window-font-scale, 1));
  background: ${BG_PANEL};
  color: ${FG_DIM};
  padding: calc(4px * var(--window-font-scale, 1)) calc(12px * var(--window-font-scale, 1));
}
.arkmail-root .arkmail-tab:hover { color: ${FG}; background: ${BG_RAISED}; }
.arkmail-root .arkmail-tab-active {
  background: ${ACCENT_DEEP};
  border-color: ${ACCENT_DEEP};
  color: ${ACCENT_FG};
  font-weight: 600;
}
.arkmail-root .arkmail-tab-active:hover { background: ${ACCENT_DEEP}; color: ${ACCENT_FG}; }

/* --- pasek operacji --- */
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
/* Fala UI-1 (zgloszenie 2026-11-03): zakladka Listy - panel kolumnowy,
   scrolluje sie wylacznie .arkmail-list-scroll; naglowek (skrzynki,
   operacje, szukajka) widoczny zawsze (sugestia 3 z Discorda). */
.arkmail-listy {
  display: flex;
  flex-direction: column;
  overflow: hidden;
}
.arkmail-list-scroll {
  flex: 1 1 auto;
  min-height: 0;
  overflow: auto;
}
.arkmail-pane::-webkit-scrollbar,
.arkmail-list-scroll::-webkit-scrollbar { width: calc(8px * var(--window-font-scale, 1)); }
.arkmail-pane::-webkit-scrollbar-thumb,
.arkmail-list-scroll::-webkit-scrollbar-thumb { background: ${BORDER}; border-radius: calc(4px * var(--window-font-scale, 1)); }

/* --- skrzynki: pigulki --- */
.arkmail-boxes { display: flex; gap: calc(4px * var(--window-font-scale, 1)); margin-bottom: calc(8px * var(--window-font-scale, 1)); flex-wrap: wrap; }
.arkmail-root .arkmail-box {
  border-radius: calc(999px * var(--window-font-scale, 1));
  padding: calc(3px * var(--window-font-scale, 1)) calc(12px * var(--window-font-scale, 1));
  background: ${BG};
  color: ${FG_DIM};
  border: calc(1px * var(--window-font-scale, 1)) solid ${BORDER};
}
.arkmail-root .arkmail-box:hover { color: ${FG}; background: ${BG_RAISED}; }
.arkmail-root .arkmail-box-active {
  background: ${ACCENT_DEEP};
  border-color: ${ACCENT_DEEP};
  color: ${ACCENT_FG};
  font-weight: 600;
}
.arkmail-root .arkmail-box-active:hover { background: ${ACCENT_DEEP}; color: ${ACCENT_FG}; }
/* Fala 16f: trwaly akcent (obwodka) na skrzynce z licznikiem > 0 -
   Nieprzeczytane/Niewyslane widac z daleka (zgloszenie pkt 5/8). */
.arkmail-root .arkmail-box-attention {
  border-color: ${ACCENT};
  color: ${FG};
}

/* Fala 11e: zbiorcze operacje na aktywnej skrzynce (zamiast obrotu per box). */
.arkmail-box-ops { display: flex; flex-wrap: wrap; gap: calc(6px * var(--window-font-scale, 1)); margin-bottom: calc(8px * var(--window-font-scale, 1)); }
.arkmail-box-ops button { flex: 1 1 calc(140px * var(--window-font-scale, 1)); }
.arkmail-root button:disabled { opacity: 0.45; cursor: default; }
.arkmail-root button:disabled:hover { background: ${BG_RAISED}; }

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
/* Fala 16f: nieprzeczytany wiersz dodatkowo JASNIEJSZY (pkt 8: kropka +
   pogrubienie + rozjasnienie; po odczyciu listing daje *R* i wiersz
   wraca do normalnego). */
.arkmail-unread { background: ${BG_UNREAD}; box-shadow: inset calc(3px * var(--window-font-scale, 1)) 0 0 ${ACCENT_BRIGHT}; }
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
  background: ${ACCENT_BRIGHT};
  flex: none;
}

.arkmail-root .arkmail-older { margin-top: calc(8px * var(--window-font-scale, 1)); width: 100%; }
.arkmail-older-row { display: flex; gap: calc(6px * var(--window-font-scale, 1)); margin-top: calc(8px * var(--window-font-scale, 1)); }
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
.arkmail-search-row input[type='date'] { color-scheme: dark; }
/* Pole daty z widoczna etykieta (placeholder na date nie dziala). */
.arkmail-date-field { display: flex; flex-direction: column; gap: calc(2px * var(--window-font-scale, 1)); min-width: 0; }
.arkmail-date-field input { width: 100%; box-sizing: border-box; }
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
.arkmail-root .arkmail-search-clear { flex: none; padding: calc(2px * var(--window-font-scale, 1)) calc(10px * var(--window-font-scale, 1)); }
.arkmail-older-row .arkmail-older { margin-top: 0; flex: 1; }
.arkmail-root .arkmail-older-all { flex: 1; }
.arkmail-root button.arkmail-older-all { margin-top: calc(8px * var(--window-font-scale, 1)); width: 100%; }
.arkmail-older-row button.arkmail-older-all { margin-top: 0; width: auto; }
/* Fala 17e: "Wczytaj wszystkie" w box-ops - regula paginacji wyzej
 * (margin-top: 8px; width: 100%) lapala go specyficznoscia 0,2,1 i
 * przycisk odjezdzal od sasiadow (zgloszenie pkt 1). */
.arkmail-box-ops button.arkmail-older-all { margin-top: 0; width: auto; }

/* --- widok listu --- */
.arkmail-letter-head {
  position: relative;
  background: ${BG};
  border: calc(1px * var(--window-font-scale, 1)) solid ${BORDER};
  border-radius: calc(8px * var(--window-font-scale, 1));
  padding: calc(8px * var(--window-font-scale, 1)) calc(12px * var(--window-font-scale, 1));
  margin-bottom: calc(8px * var(--window-font-scale, 1));
}
.arkmail-letter-subject { font-size: calc(15px * var(--window-font-scale, 1)); font-weight: 700; color: ${FG}; }
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
}
.arkmail-letter-ops { display: flex; flex-wrap: wrap; gap: calc(6px * var(--window-font-scale, 1)); margin-top: calc(8px * var(--window-font-scale, 1)); align-items: center; }
.arkmail-letter-ops input { flex: 1; }
.arkmail-root .arkmail-del {
  background: ${DANGER};
  border-color: ${DANGER};
  color: ${ACCENT_FG};
}
.arkmail-root .arkmail-del:hover { background: #c04a40; border-color: #c04a40; }
.arkmail-fwd { flex: none; }

/* --- formularz compose --- */
.arkmail-form label { display: block; margin: calc(6px * var(--window-font-scale, 1)) 0 calc(3px * var(--window-font-scale, 1)); color: ${FG_DIM}; font-size: calc(12px * var(--window-font-scale, 1)); }
.arkmail-form input, .arkmail-form textarea, .arkmail-form select {
  width: 100%;
}
.arkmail-form textarea { min-height: calc(120px * var(--window-font-scale, 1)); resize: vertical; }
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
  justify-content: space-between;
  align-items: center;
  gap: calc(8px * var(--window-font-scale, 1));
  margin-bottom: calc(4px * var(--window-font-scale, 1));
}
.arkmail-preview-bar label { margin: 0; }
.arkmail-split-compose .arkmail-pane { display: flex; flex-direction: column; }
.arkmail-split-compose .arkmail-preview { flex: 1; max-height: none; }
.arkmail-preview-full-pane { display: flex; flex-direction: column; }
.arkmail-preview-full-pane .arkmail-preview { flex: 1; max-height: none; }
.arkmail-root .arkmail-send {
  margin-top: calc(10px * var(--window-font-scale, 1));
  padding: calc(6px * var(--window-font-scale, 1)) calc(18px * var(--window-font-scale, 1));
  background: ${ACCENT_DEEP};
  border-color: ${ACCENT_DEEP};
  color: ${ACCENT_FG};
  font-weight: 600;
}
.arkmail-root .arkmail-send:hover { background: ${ACCENT_DEEPER}; border-color: ${ACCENT_DEEPER}; }

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
.arkmail-deletion-results { border-top: calc(1px * var(--window-font-scale, 1)) solid ${BORDER}; }
.arkmail-deletion-entry {
  display: flex;
  align-items: flex-start;
  gap: calc(8px * var(--window-font-scale, 1));
  padding: calc(7px * var(--window-font-scale, 1)) calc(4px * var(--window-font-scale, 1));
  border-bottom: calc(1px * var(--window-font-scale, 1)) solid ${BORDER};
  cursor: pointer;
}
.arkmail-deletion-entry input { flex: none; margin-top: calc(3px * var(--window-font-scale, 1)); }
.arkmail-deletion-entry span { min-width: 0; overflow-wrap: anywhere; }
.arkmail-root .arkmail-deletion-delete {
  background: ${DANGER};
  border-color: ${DANGER};
  color: ${ACCENT_FG};
}
.arkmail-root .arkmail-deletion-delete:disabled { background: ${BG_RAISED}; color: ${FG_DIM}; }

/* --- kontakty i archiwum --- */
.arkmail-contact, .arkmail-arch-entry {
  display: flex;
  gap: calc(8px * var(--window-font-scale, 1));
  padding: calc(5px * var(--window-font-scale, 1)) calc(8px * var(--window-font-scale, 1));
  border-radius: calc(6px * var(--window-font-scale, 1));
  border-bottom: calc(1px * var(--window-font-scale, 1)) solid ${BG};
}
/* Fala 12c: klikalne jest IMIE (kierunek domyslny) + przyciski kierunku. */
.arkmail-contact:hover, .arkmail-arch-entry:hover { background: ${BG_RAISED}; }
.arkmail-contact-name { color: ${FG}; font-weight: 600; cursor: pointer; }
.arkmail-contact-name:hover { text-decoration: underline; }
.arkmail-contact-dirs { margin-left: auto; display: flex; gap: calc(4px * var(--window-font-scale, 1)); }
.arkmail-root .arkmail-contact-dir, .arkmail-root .arkmail-contact-addbook, .arkmail-root .arkmail-arch-people-toggle {
  background: ${BG_RAISED};
  color: ${FG};
  border: calc(1px * var(--window-font-scale, 1)) solid ${BORDER};
  border-radius: calc(4px * var(--window-font-scale, 1));
  padding: calc(1px * var(--window-font-scale, 1)) calc(8px * var(--window-font-scale, 1));
  font-size: calc(11px * var(--window-font-scale, 1));
  cursor: pointer;
}
.arkmail-root .arkmail-contact-dir:hover, .arkmail-root .arkmail-contact-addbook:hover, .arkmail-root .arkmail-arch-people-toggle:hover { border-color: ${FG_DIM}; }
.arkmail-root .arkmail-contact-dir:disabled, .arkmail-root .arkmail-contact-addbook:disabled {
  opacity: 0.4;
  cursor: default;
}
/* Fala UI-2 krok 4: naglowek zwijanego panelu "Osoby z listow". */
.arkmail-arch-people-head { margin: calc(8px * var(--window-font-scale, 1)) 0 calc(4px * var(--window-font-scale, 1)); }
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
.arkmail-arch-expand { margin-left: calc(8px * var(--window-font-scale, 1)); }
.arkmail-arch-occ-list { margin: calc(2px * var(--window-font-scale, 1)) 0 calc(6px * var(--window-font-scale, 1)) calc(18px * var(--window-font-scale, 1)); }
.arkmail-arch-occ { color: ${FG_DIM}; font-size: calc(12px * var(--window-font-scale, 1)); cursor: pointer; }
.arkmail-arch-occ:hover { color: ${FG}; }
.arkmail-contact-controls {
  display: flex;
  flex-wrap: wrap;
  gap: calc(6px * var(--window-font-scale, 1));
  margin-bottom: calc(8px * var(--window-font-scale, 1));
}
.arkmail-archive-steps {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(calc(220px * var(--window-font-scale, 1)), 1fr));
  gap: calc(18px * var(--window-font-scale, 1));
  margin: calc(10px * var(--window-font-scale, 1)) 0 calc(12px * var(--window-font-scale, 1));
}
.arkmail-archive-step {
  position: relative;
  min-width: 0;
  padding: calc(10px * var(--window-font-scale, 1));
  border: calc(1px * var(--window-font-scale, 1)) solid ${BORDER};
  border-left: calc(4px * var(--window-font-scale, 1)) solid ${FG_DIM};
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
.arkmail-archive-step button { width: 100%; margin: 0; }
.arkmail-step-active { border-left-color: ${ACCENT}; }
.arkmail-step-done { border-left-color: #55aa77; }
.arkmail-step-warning, .arkmail-step-incomplete { border-left-color: #cc9944; }
.arkmail-arch-controls {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: calc(6px * var(--window-font-scale, 1));
  margin-bottom: calc(8px * var(--window-font-scale, 1));
}
.arkmail-arch-controls .arkmail-arch-clear { grid-column: 1 / -1; }
.arkmail-arch-controls input[type='date'] { color-scheme: dark; }
.arkmail-root .arkmail-contact-filter { flex: 1 1 calc(140px * var(--window-font-scale, 1)); min-width: 0; }
.arkmail-root .arkmail-contact-sort { max-width: 100%; }
.arkmail-contact-last { color: ${FG_DIM}; font-size: calc(11px * var(--window-font-scale, 1)); white-space: nowrap; }

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
  /* padding inputu (5px 8px) + jego border (1px) = tekst 1:1 nad polem */
  padding: calc(6px * var(--window-font-scale, 1)) calc(9px * var(--window-font-scale, 1));
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
  position: absolute;
  top: calc(6px * var(--window-font-scale, 1));
  right: calc(10px * var(--window-font-scale, 1));
  padding: calc(2px * var(--window-font-scale, 1)) calc(10px * var(--window-font-scale, 1));
}

/* Fala 14b: pulsowanie Listy/Niewyslane po odlozeniu listu w kolejce.
   Kontrakt uiStyles: jawne hex (bez transparent/inherit). */
@keyframes arkmailFlash {
  0%, 100% { background: ${BG_RAISED}; color: ${FG}; }
  50% { background: ${ACCENT_DEEP}; color: ${ACCENT_FG}; }
}
.arkmail-root .arkmail-flash {
  animation: arkmailFlash 0.6s ease-in-out 5;
}
`;
