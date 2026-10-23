/**
 * Adaptery Dargoth: DargothTransport (Transport nad PluginApi + modal-guard
 * na commandHooks), CharStorage (IndexedDB per-postac), notify.
 * Testy nad podróbkami API; kontrakty zweryfikowane w PluginApi.ts klienta.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

import type PluginApi from 'plugin-api';
import { DargothTransport } from '../src/arkmail/adapters/dargothTransport';
import { CharStorage } from '../src/arkmail/adapters/storage';
import { MemoryStorageDriver } from '../src/arkmail/adapters/storageDriver';
import { notify } from '../src/arkmail/adapters/notify';
import type { ProtoLine } from '../src/arkmail/core/session/transport';

type TriggerCb = (line: { text: string }, matches: unknown, type: string) => unknown;
type HookCb = (command: string) => string | null | undefined;

class FakeApi {
  sent: { command: string; echo?: boolean; options?: { preserveCase?: boolean } }[] = [];
  triggerCb: TriggerCb | null = null;
  triggerTag: string | null = null;
  hookCb: HookCb | null = null;
  hookPriority: number | null = null;
  emitted: { event: string; args: unknown[] }[] = [];

  readonly api = {
    command: {
      send: async (command: string, echo?: boolean, options?: { preserveCase?: boolean }) => {
        this.sent.push(options === undefined ? { command, echo } : { command, echo, options });
      },
      addSuggestions: () => {},
      removeSuggestions: () => {},
    },
    triggers: {
      register: (_pattern: unknown, cb: TriggerCb, tag?: string) => {
        this.triggerCb = cb;
        this.triggerTag = tag ?? null;
        return { id: 'trig-1' };
      },
      remove: () => {},
      removeByTag: () => {},
    },
    commandHooks: {
      register: (cb: HookCb, priority?: number) => {
        this.hookCb = cb;
        this.hookPriority = priority ?? null;
        return 'hook-1';
      },
      unregister: (id: string) => {
        if (id !== 'hook-1') return false;
        this.hookCb = null;
        return true;
      },
    },
    events: {
      on: () => {},
      off: () => {},
      emit: (event: string, ...args: unknown[]) => {
        this.emitted.push({ event, args });
      },
    },
  } as unknown as PluginApi;

  /** Symuluje linie z gry docierajaca do triggera. */
  fireLine(text: string, type = ''): unknown {
    const line = { text };
    return this.triggerCb?.(line, null, type);
  }
}

// --- DargothTransport -------------------------------------------------------

test('adapter: send idzie przez command.send z wyciszonym echem', async () => {
  const f = new FakeApi();
  const t = new DargothTransport(f.api);
  t.send('listy odebrane');
  await new Promise((r) => setImmediate(r));
  assert.deepEqual(f.sent, [
    { command: 'listy odebrane', echo: false, options: { preserveCase: true } },
  ]);
});

test('adapter: komenda z data zachowuje wielkie litery miesiaca', async () => {
  const f = new FakeApi();
  const t = new DargothTransport(f.api);
  const command = 'listy odebrane przed 18 X 2026';
  t.send(command);
  await new Promise((r) => setImmediate(r));

  const sent = f.sent[0];
  assert.equal(sent?.options?.preserveCase, true);
  const delivered = sent?.options?.preserveCase
    ? sent.command
    : sent?.command.replace(/[IVX]+/g, (month) => month.toLowerCase());
  assert.equal(delivered, command, 'serwer nie moze dostac miesiaca malymi literami');
});

test('adapter: subscribe dostaje {text, cls=typ}, linia zwracana bez zmian', () => {
  const f = new FakeApi();
  const t = new DargothTransport(f.api);
  const seen: ProtoLine[] = [];
  t.subscribe((l) => seen.push(l));
  assert.ok(f.triggerCb, 'trigger zarejestrowany leniwie przy subscribe');
  assert.equal(f.triggerTag, 'arkmail');
  const ret = f.fireLine('Listy odebrane:', 'info');
  assert.deepEqual(ret, { text: 'Listy odebrane:' }, 'zwrotka bez modyfikacji');
  f.fireLine('> ', 'prompt');
  assert.deepEqual(seen, [
    { text: 'Listy odebrane:', cls: 'info' },
    { text: '> ', cls: 'prompt' },
  ]);
});

test('adapter: unsubscribe odcina strumien', () => {
  const f = new FakeApi();
  const t = new DargothTransport(f.api);
  const seen: ProtoLine[] = [];
  const off = t.subscribe((l) => seen.push(l));
  f.fireLine('a');
  off();
  f.fireLine('b');
  assert.deepEqual(seen.map((l) => l.text), ['a']);
});

test('adapter: modal-guard tlumi komendy gracza, przepuszcza wlasne', async () => {
  const f = new FakeApi();
  const t = new DargothTransport(f.api);
  t.beginModal();
  assert.ok(f.hookCb, 'hook zarejestrowany');
  assert.equal(f.hookPriority, 100, 'wysoki priorytet - przed aliasami gry');

  // komenda gracza podczas pagera: stlumiona i zakolejkowana
  assert.equal(f.hookCb!('atakuj goblina'), null);
  assert.equal(t.modalQueueLength, 1);

  // wlasna wysylka sesji: przechodzi (undefined), nie laduje w kolejce
  t.send('q');
  assert.equal(f.hookCb!('q'), undefined);
  assert.equal(t.modalQueueLength, 1);
  await new Promise((r) => setImmediate(r));
  assert.deepEqual(f.sent, [
    { command: 'q', echo: false, options: { preserveCase: true } },
  ]);

  // koniec modalu: kolejka gracza odtworzona do gry, hook zdjety
  t.endModal();
  assert.equal(f.hookCb, null, 'hook wyrejestrowany po endModal');
  await new Promise((r) => setImmediate(r));
  assert.deepEqual(f.sent[1], {
    command: 'atakuj goblina',
    echo: undefined,
    options: { preserveCase: true },
  });
  assert.equal(t.modalQueueLength, 0);
});

test('adapter: modal-guard - poczatek/koniec idempotentne', () => {
  const f = new FakeApi();
  const t = new DargothTransport(f.api);
  t.beginModal();
  const hook1 = f.hookCb;
  t.beginModal();
  assert.equal(f.hookCb, hook1, 'drugi beginModal nie zaklada drugiego hooka');
  t.endModal();
  t.endModal();
  assert.equal(f.hookCb, null, 'po endModal hook zdjety, nic nie tlumi');
});

test('adapter: rozlaczenie porzuca kolejke modalna i blokuje stare wysylki', async () => {
  const f = new FakeApi();
  const t = new DargothTransport(f.api);
  t.beginModal();
  f.hookCb!('pomoc');
  t.setOnline(false);
  t.send('q');
  t.endModal();
  t.setOnline(true);
  t.endModal();
  await new Promise((r) => setImmediate(r));
  assert.deepEqual(f.sent, []);
  assert.equal(t.modalQueueLength, 0);
});

// --- CharStorage --------------------------------------------------------------

test('storage: przestrzen per postac, JSON roundtrip', async () => {
  const driver = new MemoryStorageDriver();
  const foo = await CharStorage.open('Foo', driver, () => {});
  foo.setJSON('ustawienia', { powiadomienia: true });
  await foo.flush();
  assert.deepEqual(foo.getJSON('ustawienia'), { powiadomienia: true });
  assert.deepEqual(await driver.loadAll(), {
    'arkmail.foo.ustawienia': '{"powiadomienia":true}',
  });

  const baz = await CharStorage.open('Baz', driver, () => {});
  assert.equal(baz.getJSON('ustawienia'), null, 'inna postac = inna przestrzen');
  const reopenedFoo = await CharStorage.open('Foo', driver, () => {});
  assert.deepEqual(reopenedFoo.getJSON('ustawienia'), { powiadomienia: true });
});

test('storage: uszkodzony JSON nie wywraca odczytu', async () => {
  const driver = new MemoryStorageDriver();
  await driver.put('arkmail.foo.zepsuty', '{nie-json');
  const storage = await CharStorage.open('Foo', driver, () => {});
  assert.equal(storage.getJSON('zepsuty'), null);
});

// --- notify -------------------------------------------------------------------

test('notify: tost przez events.emit, opcjonalny czas wyswietlania', () => {
  const f = new FakeApi();
  notify(f.api, 'Nowy list od Foo');
  notify(f.api, 'Pilne', { time: 8000 });
  assert.deepEqual(f.emitted, [
    { event: 'notify', args: [{ text: 'Nowy list od Foo' }] },
    { event: 'notify', args: [{ text: 'Pilne', time: 8000 }] },
  ]);
});

test('adapter: linia brana z originalLine (4. arg) gdy inny trigger ja zmodyfikowal', () => {
  // System triggerow Dargoth przekazuje kolejnym callbackom buffer po
  // cudzych modyfikacjach (np. newMail dokleja "\n[ POCZTA ] " i "\n\n"),
  // ale 4. argument niesie dziewiczy tekst linii z gry (Triggers.ts:
  // TriggerCallback(line, matches, type, originalLine)). Transport ma
  // podawac subskrybentom tekst dziewiczy.
  const f = new FakeApi();
  const t = new DargothTransport(f.api);
  const seen: ProtoLine[] = [];
  t.subscribe((l) => seen.push(l));
  const modified = { text: '\n[ POCZTA ] Masz nowa poczte od Bar.\n\n' };
  (f.triggerCb as unknown as (l: unknown, m: unknown, ty: string, orig: string) => unknown)(
    modified,
    null,
    '',
    'Masz nowa poczte od Bar.',
  );
  assert.deepEqual(seen, [{ text: 'Masz nowa poczte od Bar.', cls: '' }]);
});
