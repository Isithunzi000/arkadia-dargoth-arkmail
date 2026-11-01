import test from 'node:test';
import assert from 'node:assert/strict';
import { IDBFactory } from 'fake-indexeddb';
import { Window } from 'happy-dom';
import { init, destroy } from '../src/arkmail/index';
import { IndexedDbStorageDriver } from '../src/arkmail/adapters/storageDriver';
import type { ArchiveLetter } from '../src/arkmail/core/archive';
import { FakeApi } from './harness';

interface ControlledApi {
  characterName: string | null;
  setCharacter(name: string | null): void;
}

function controlled(f: FakeApi): ControlledApi {
  return f as unknown as ControlledApi;
}

function letter(id: string, subject: string): ArchiveLetter {
  return {
    id,
    box: 'odebrane',
    number: 1,
    party: 'Foo',
    subject,
    forwarded: false,
    dateRaw: 'Pn, 20 IX 1999, 01:02:03',
    sortKey: '1999-09-20 01:02:03',
    read: false,
    body: [],
  };
}

async function within<T>(promise: Promise<T>): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error('Przekroczono czas oczekiwania.')), 100);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

async function contentWithStore(f: FakeApi): Promise<HTMLElement> {
  for (let i = 0; i < 200; i++) {
    const content = (await f.popupConfig!.createContent()) as HTMLElement;
    if (content.querySelector('[data-tab="archiwum"]')) return content;
    await new Promise((resolve) => setImmediate(resolve));
  }
  assert.fail('Brak gotowego widoku postaci.');
}

function showArchive(content: HTMLElement, window: Window): string {
  const tab = content.querySelector('[data-tab="archiwum"]') as HTMLElement | null;
  if (!tab) return '';
  tab.dispatchEvent(new window.Event('click') as unknown as Event);
  return content.textContent ?? '';
}

test('start uzywa aktualnej nazwy bez ponownego zdarzenia postaci', async () => {
  const previousFactory = globalThis.indexedDB;
  const previousDocument = globalThis.document;
  globalThis.indexedDB = new IDBFactory();
  const window = new Window();
  globalThis.document = window.document as unknown as Document;
  const f = new FakeApi();
  controlled(f).characterName = 'Foo';
  try {
    await within(init(f.api));
    assert.ok(f.popupConfig);
    const content = await contentWithStore(f);
    assert.ok(content.querySelector('.arkmail-root'));
  } finally {
    await destroy();
    if (previousFactory === undefined) delete (globalThis as { indexedDB?: IDBFactory }).indexedDB;
    else globalThis.indexedDB = previousFactory;
    if (previousDocument === undefined) delete (globalThis as { document?: Document }).document;
    else globalThis.document = previousDocument;
  }
});

test('bez nazwy powloka powstaje od razu, a dane uruchamia pierwsza znana postac', async () => {
  const previousFactory = globalThis.indexedDB;
  const previousDocument = globalThis.document;
  globalThis.indexedDB = new IDBFactory();
  const window = new Window();
  globalThis.document = window.document as unknown as Document;
  const f = new FakeApi();
  controlled(f).characterName = null;
  try {
    const initializing = init(f.api);
    await new Promise((resolve) => setImmediate(resolve));
    assert.ok(f.popupConfig, 'popup jest dostepny bez nazwy postaci');
    await within(initializing);
    controlled(f).setCharacter('Foo');
    const content = await contentWithStore(f);
    assert.ok(content.querySelector('.arkmail-root'));
  } finally {
    await destroy();
    if (previousFactory === undefined) delete (globalThis as { indexedDB?: IDBFactory }).indexedDB;
    else globalThis.indexedDB = previousFactory;
    if (previousDocument === undefined) delete (globalThis as { document?: Document }).document;
    else globalThis.document = previousDocument;
  }
});

test('seria zmian postaci konczy sie na ostatniej i nie miesza archiwum', async () => {
  const previousFactory = globalThis.indexedDB;
  const previousDocument = globalThis.document;
  const factory = new IDBFactory();
  globalThis.indexedDB = factory;
  const window = new Window();
  globalThis.document = window.document as unknown as Document;
  const seed = new IndexedDbStorageDriver(factory);
  await seed.loadAll();
  for (const [character, id, subject] of [
    ['foo', 'foo', 'List Foo'],
    ['bar', 'bar', 'List Bar'],
    ['baz', 'baz', 'List Baz'],
  ]) {
    await seed.putLetters(character, { [id]: JSON.stringify(letter(id, subject)) });
  }
  await seed.close();
  const f = new FakeApi();
  controlled(f).characterName = 'Foo';
  try {
    await within(init(f.api));
    await contentWithStore(f);
    controlled(f).setCharacter('Bar');
    controlled(f).setCharacter('Corge');
    controlled(f).setCharacter('Baz');
    let text = '';
    for (let i = 0; i < 200; i++) {
      const content = await contentWithStore(f);
      text = showArchive(content, window);
      if (text.includes('List Baz')) break;
      await new Promise((resolve) => setImmediate(resolve));
    }
    assert.match(text, /List Baz/);
    assert.doesNotMatch(text, /List Foo|List Bar/);
    const settled = await contentWithStore(f);
    assert.match(showArchive(settled, window), /List Baz/);
  } finally {
    await destroy();
    if (previousFactory === undefined) delete (globalThis as { indexedDB?: IDBFactory }).indexedDB;
    else globalThis.indexedDB = previousFactory;
    if (previousDocument === undefined) delete (globalThis as { document?: Document }).document;
    else globalThis.document = previousDocument;
  }
});

test('destroy anuluje aktywna operacje, odpina zdarzenia i jest idempotentne', async () => {
  const previousFactory = globalThis.indexedDB;
  const previousDocument = globalThis.document;
  globalThis.indexedDB = new IDBFactory();
  const window = new Window();
  globalThis.document = window.document as unknown as Document;
  const f = new FakeApi();
  controlled(f).characterName = 'Foo';
  try {
    await within(init(f.api));
    // Fala 25: brama gry - po init transport jest rozbrojony; test
    // sprawdza aktywna operacje, wiec najpierw sygnal obecnosci w grze.
    f.fireEvent('gmcp.char.info', { name: 'Foo' });
    f.fire(' [ POCZTA ] Masz nowa poczte od Foo.');
    for (let i = 0; i < 200 && !f.sent.includes('listy odebrane'); i++) {
      await new Promise((resolve) => setImmediate(resolve));
    }
    assert.ok(f.sent.includes('listy odebrane'), 'operacja jest aktywna przed zamknieciem');
    await Promise.all([destroy(), destroy()]);
    const sentAfterDestroy = f.sent.length;
    assert.equal(f.characterListeners.size, 0, 'odlaczony nasluch zmiany postaci');
    assert.equal(f.eventListeners.get('client.connect')?.length ?? 0, 0);
    assert.equal(f.eventListeners.get('gmcp.mail.state')?.length ?? 0, 0);
    f.fireEvent('client.connect', {});
    f.fire('Listy odebrane:', 'mail');
    f.fire('> ', 'prompt');
    await new Promise((resolve) => setImmediate(resolve));
    assert.equal(f.sent.length, sentAfterDestroy, 'zadne komendy po zamknieciu');
  } finally {
    await destroy();
    if (previousFactory === undefined) delete (globalThis as { indexedDB?: IDBFactory }).indexedDB;
    else globalThis.indexedDB = previousFactory;
    if (previousDocument === undefined) delete (globalThis as { document?: Document }).document;
    else globalThis.document = previousDocument;
  }
});
