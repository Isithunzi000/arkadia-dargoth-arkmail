// Test dymny: dist/arkmail.js laduje sie w czystym Node z zamockowanym
// PluginApi i robi dokladnie to, co obiecuje kontrakt pluginu Dargoth:
// init() -> PluginInfo + rejestracje (alias /arkmail, popup, wpis w menu,
// klawisz w stopce); destroy() zdejmuje wszystkie rejestracje.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const REPO = path.dirname(path.dirname(fileURLToPath(import.meta.url)));

function makeElement(tag) {
  return {
    tagName: tag.toUpperCase(),
    children: [],
    style: {},
    dataset: {},
    className: '',
    textContent: '',
    appendChild(c) { this.children.push(c); return c; },
    append(...cs) { this.children.push(...cs); },
    setAttribute() {},
    addEventListener() {},
  };
}

function makeMockApi(capture) {
  return {
    aliases: {
      register(pattern, cb) { capture.alias = { pattern, cb }; return 'alias-1'; },
      remove(id) { capture.removed.push(['alias', id]); },
    },
    ui: {
      async registerPersistentPopup(config) {
        capture.popup = config;
        const handle = {
          id: config.id,
          isOpen: false,
          wasRestored: false,
          isPinned: false,
          element: makeElement('div'),
          async open() { handle.isOpen = true; handle.content = await config.createContent(); },
          close() { handle.isOpen = false; capture.closed = (capture.closed || 0) + 1; },
          onClose(cb) { capture.onClose = cb; },
          setTitle() {}, setBody() {}, setPinned() {}, setHeaderActions() {},
        };
        capture.popupHandle = handle;
        return handle;
      },
      addPopupMenuEntry(label, onSelect) {
        capture.menu = { label, onSelect };
        return { remove() { capture.removed.push(['menu', label]); }, setLabel() {}, setDisabled() {} };
      },
      registerFooterButton(id, button) {
        capture.footer = { id, button };
        return { update() {}, remove() { capture.removed.push(['footer', id]); } };
      },
    },
    events: { on() {}, off() {}, emit() {} },
    output: { print() {} },
    command: { send() {} },
  };
}

test('smoke: init rejestruje kontrakt, destroy zdejmuje rejestracje', async () => {
  execSync('node scripts/build.js', { cwd: REPO, stdio: 'pipe' });
  const dist = path.join(REPO, 'dist/arkmail.js');
  assert.ok(fs.existsSync(dist), 'brak dist/arkmail.js po buildzie');

  const code = fs.readFileSync(dist, 'utf8');
  assert.ok(!code.includes('plugin-api'), 'dist nie moze zawierac importu plugin-api');

  // dist jest ESM; repo jest CJS -> import z katalogu tymczasowego jako .mjs
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'arkmail-smoke-'));
  const mjs = path.join(tmp, 'arkmail.mjs');
  fs.copyFileSync(dist, mjs);
  const mod = await import(pathToFileURL(mjs).href);
  assert.equal(typeof mod.init, 'function', 'dist eksportuje init()');
  assert.equal(typeof mod.destroy, 'function', 'dist eksportuje destroy()');

  const prevDoc = globalThis.document;
  globalThis.document = { createElement: makeElement };
  try {
    const capture = { removed: [] };
    const api = makeMockApi(capture);
    const info = await mod.init(api);

    assert.equal(info.name, 'ArkMail');
    const meta = fs.readFileSync(path.join(REPO, 'src/arkmail/meta.ts'), 'utf8');
    const ver = meta.match(/PLUGIN_VERSION = "([^"]+)"/)[1];
    assert.equal(info.version, ver, 'PluginInfo.version == PLUGIN_VERSION');
    assert.ok(info.author && info.description, 'PluginInfo ma autora i opis');

    assert.ok(capture.alias, 'zarejestrowany alias');
    assert.ok(capture.alias.pattern.test('/arkmail'), 'alias łapie /arkmail');
    assert.ok(capture.alias.pattern.test('/ArkMail'), 'alias jest case-insensitive');
    assert.ok(!capture.alias.pattern.test('/poczta'), 'alias NIE łapie /poczta');

    assert.ok(capture.popup, 'zarejestrowany popup');
    assert.equal(capture.popup.id, 'arkmail');
    assert.equal(typeof capture.popup.createContent, 'function');

    assert.ok(capture.menu, 'wpis w menu wtyczek');
    assert.ok(capture.footer, 'klawisz w stopce');
    assert.equal(capture.footer.button.command, '/arkmail', 'klawisz stopki odpala /arkmail');

    // klik aliasu otwiera popup, fabryka tresci dziala bez DOM klienta
    assert.equal(capture.alias.cb(), true);
    await capture.popupHandle.open();
    assert.ok(capture.popupHandle.content, 'createContent zwrocilo tresc');

    await mod.destroy();
    const kinds = capture.removed.map((r) => r[0]).sort();
    assert.ok(kinds.includes('alias'), 'destroy zdejmuje alias');
    assert.ok(kinds.includes('menu'), 'destroy zdejmuje wpis menu');
    assert.ok(kinds.includes('footer'), 'destroy zdejmuje klawisz stopki');
    assert.ok(capture.closed >= 1, 'destroy zamyka popup');
  } finally {
    if (prevDoc === undefined) delete globalThis.document;
    else globalThis.document = prevDoc;
  }
});
