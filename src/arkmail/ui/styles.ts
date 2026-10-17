/**
 * Style ArkMail - jeden <style> wstrzykiwany do kontenera popupu.
 * Wszystko scopingowane pod .arkmail-root, zero globalnych regul.
 * Podzial dwukolumnowy: container query >= 900px szerokosci popupu
 * (popup jest plywajacym oknem, wiec matchMedia na viewporcie
 * byloby bledne - liczy sie szerokosc samego okna).
 */
export const STYLES = `
.arkmail-root {
  container-type: inline-size;
  display: flex;
  flex-direction: column;
  height: 100%;
  font-size: 13px;
  color: inherit;
}
.arkmail-tabs { display: flex; gap: 2px; flex-wrap: wrap; margin-bottom: 6px; }
.arkmail-tab {
  padding: 4px 10px;
  border: 1px solid rgba(128, 128, 128, 0.4);
  border-radius: 4px;
  cursor: pointer;
  background: transparent;
  color: inherit;
  font: inherit;
}
.arkmail-tab-active { font-weight: bold; border-color: currentColor; }
.arkmail-busy {
  padding: 3px 8px;
  margin-bottom: 4px;
  border: 1px dashed rgba(128, 128, 128, 0.6);
  border-radius: 4px;
  opacity: 0.85;
}
.arkmail-pane { flex: 1; overflow: auto; min-height: 0; }
.arkmail-boxes { display: flex; gap: 2px; margin-bottom: 4px; flex-wrap: wrap; }
.arkmail-box {
  padding: 2px 8px;
  border: 1px solid rgba(128, 128, 128, 0.3);
  border-radius: 3px;
  cursor: pointer;
  background: transparent;
  color: inherit;
  font: inherit;
}
.arkmail-box-active { font-weight: bold; border-color: currentColor; }
.arkmail-entry {
  padding: 2px 4px;
  cursor: pointer;
  border-radius: 3px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.arkmail-entry:hover { background: rgba(128, 128, 128, 0.15); }
.arkmail-unread { font-weight: bold; }
.arkmail-entry-party { opacity: 0.75; }
.arkmail-older { margin-top: 6px; font: inherit; cursor: pointer; }
.arkmail-letter-head { margin-bottom: 6px; opacity: 0.9; }
.arkmail-letter-body { white-space: pre-wrap; font-family: inherit; }
.arkmail-form label { display: block; margin: 4px 0 2px; }
.arkmail-form input, .arkmail-form textarea {
  width: 100%;
  box-sizing: border-box;
  font: inherit;
  color: inherit;
  background: rgba(128, 128, 128, 0.08);
  border: 1px solid rgba(128, 128, 128, 0.4);
  border-radius: 3px;
  padding: 3px 6px;
}
.arkmail-form textarea { min-height: 120px; resize: vertical; }
.arkmail-send { margin-top: 8px; font: inherit; cursor: pointer; padding: 4px 14px; }
.arkmail-contact, .arkmail-arch-entry { padding: 2px 4px; }
.arkmail-dim { opacity: 0.65; }
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
