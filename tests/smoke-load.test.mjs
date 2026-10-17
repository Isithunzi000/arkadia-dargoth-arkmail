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
  const el = {
    tagName: tag.toUpperCase(),
    children: [],
    style: {},
    dataset: {},
    className: '',
    textContent: '',
    value: '',
    ownerDocument: null,
    appendChild(c) { this.children.push(c); return c; },
    append(...cs) { this.children.push(...cs); },
    replaceChildren(...cs) { this.children = [...cs]; },
    setAttribute() {},
    getAttribute() { return null; },
    addEventListener() {},
    querySelector() { return null; },
    querySelectorAll() { return []; },
  };
  el.ownerDocument = {
    createElement: (t) => makeElement(t),
    createTextNode: (t) => ({ textContent: t }),
  };
  return el;
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
        return {
          update(b) { (capture.footerUpdates = capture.footerUpdates || []).push(b); },
          remove() { capture.removed.push(['footer', id]); },
        };
      },
      setFooterButtonState(name, on) {
        (capture.footerStates = capture.footerStates || []).push([name, on]);
      },
    },
    events: {
      on(event, listener) { (capture.listeners = capture.listeners || {})[event] = listener; },
      off() {},
      emit(event, ...args) { (capture.emitted = capture.emitted || []).push([event, ...args]); },
    },
    output: { print() {} },
    command: {
      async send(command, echo) { (capture.sent = capture.sent || []).push([command, echo]); },
    },
    triggers: {
      register(pattern, cb, tag) {
        capture.trigger = { pattern, cb, tag };
        return { id: 'trig-1' };
      },
      remove() {},
      removeByTag(tag) { (capture.removedTags = capture.removedTags || []).push(tag); },
    },
    commandHooks: {
      register(cb) { capture.hook = cb; return 'hook-1'; },
      unregister(id) { capture.removed.push(['hook', id]); return true; },
    },
    people: {
      subscribe(listener) { capture.peopleListener = listener; return () => { capture.peopleOff = true; }; },
      getAll: () => [],
    },
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

// Integracja Fali 4c przez zbudowany dist: powiadomienie "[ POCZTA ]"
// odpala odswiezenie skrzynek przez prawdziwe sesje na fixture,
// badge trafia na klawisz stopki, destroy zdejmuje trigger.
test('smoke: powiadomienie odswieza skrzynki i badge stopki', async () => {
  execSync('node scripts/build.js', { cwd: REPO, stdio: 'pipe' });
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'arkmail-smoke2-'));
  const mjs = path.join(tmp, 'arkmail.mjs');
  fs.copyFileSync(path.join(REPO, 'dist/arkmail.js'), mjs);
  const mod = await import(pathToFileURL(mjs).href);

  const fixture = (name) =>
    JSON.parse(fs.readFileSync(path.join(REPO, 'tests/fixtures', name + '.json'), 'utf8')).lines;

  const prevDoc = globalThis.document;
  globalThis.document = { createElement: makeElement };
  try {
    const capture = { removed: [] };
    const api = makeMockApi(capture);
    await mod.init(api);

    assert.ok(capture.trigger, 'init rejestruje zbiorczy trigger linii');
    assert.equal(capture.trigger.tag, 'arkmail');
    assert.ok(capture.listeners?.['gmcp.char.info'], 'slucha gmcp.char.info (nazwa postaci)');
    assert.ok(capture.peopleListener, 'subskrybuje baze people (kontakty)');

    const tick = () => new Promise((r) => setImmediate(r));
    const fire = (text, cls = '') => capture.trigger.cb({ text }, null, cls);
    const waitFor = async (pred, what) => {
      for (let i = 0; i < 200; i++) {
        if (pred()) return;
        await tick();
      }
      assert.fail(`timeout: ${what}`);
    };

    fire(' [ POCZTA ] Masz nowa poczte od Foo.');
    await waitFor(
      () => (capture.sent || []).some(([c]) => c === 'listy odebrane'),
      'komenda listy odebrane po powiadomieniu',
    );
    // echo wysylki jest wyciszone (echo=false)
    assert.ok((capture.sent || []).every(([, echo]) => echo === false), 'echo=false');

    // replay listing odebranych (od echa komendy) przez prawdziwa sesje
    const odebrane = fixture('listing-odebrane-male');
    const idx = odebrane.findIndex((l) => l.text === '→ listy odebrane');
    for (const l of odebrane.slice(idx)) {
      fire(l.text, l.cls);
      await tick();
    }
    await waitFor(
      () => (capture.sent || []).some(([c]) => c === 'listy nieprzeczytane'),
      'komenda listy nieprzeczytane po odebranych',
    );
    for (const l of fixture('listing-nieprzeczytane')) {
      fire(l.text, l.cls);
      await tick();
    }
    await waitFor(
      () => (capture.footerUpdates || []).some((u) => u.label === 'ArkMail (1)'),
      'badge stopki ArkMail (1)',
    );

    await mod.destroy();
    assert.ok((capture.removedTags || []).includes('arkmail'), 'destroy zdejmuje trigger po tagu');
    assert.ok(capture.peopleOff, 'destroy odpina subskrypcje people');
  } finally {
    if (prevDoc === undefined) delete globalThis.document;
    else globalThis.document = prevDoc;
  }
});
