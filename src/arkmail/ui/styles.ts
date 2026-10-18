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
  container-type: inline-size;
  display: flex;
  flex-direction: column;
  height: 100%;
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
.arkmail-root .arkmail-refresh {
  border-radius: 999px;
  padding: 3px 8px;
  background: ${BG};
  color: ${FG_DIM};
  border: 1px solid ${BORDER};
  line-height: 1;
}
.arkmail-root .arkmail-refresh:hover { color: ${FG}; background: ${BG_RAISED}; }

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
.arkmail-older-row .arkmail-older { margin-top: 0; flex: 1; }
.arkmail-root .arkmail-older-all { flex: 1; }
.arkmail-root button.arkmail-older-all { margin-top: 8px; width: 100%; }
.arkmail-older-row button.arkmail-older-all { margin-top: 0; width: auto; }

/* --- widok listu --- */
.arkmail-letter-head {
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
.arkmail-letter-ops { display: flex; gap: 6px; margin-top: 8px; align-items: center; }
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
.arkmail-contact:hover, .arkmail-arch-entry:hover { background: ${BG_RAISED}; }
.arkmail-contact-name { color: ${FG}; font-weight: 600; }
.arkmail-contact-stats, .arkmail-arch-meta { color: ${FG_DIM}; font-size: 12px; }
.arkmail-contact-controls { display: flex; gap: 6px; margin-bottom: 8px; }
.arkmail-arch-controls {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 6px;
  margin-bottom: 8px;
}
.arkmail-arch-controls input[type='date'] { color-scheme: dark; }
.arkmail-root .arkmail-contact-filter { flex: 1; }
.arkmail-contact-last { color: ${FG_DIM}; font-size: 11px; white-space: nowrap; }

.arkmail-notify-toggle { margin-right: 4px; }
.arkmail-dim { color: ${FG_DIM}; }

/* --- podzial lista|list na szerokim popupie --- */
.arkmail-split { display: block; }
@container (min-width: 900px) {
  .arkmail-split {
    display: grid;
    grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
    gap: 10px;
    flex: 1;
    min-height: 0;
  }
}
`;
