/**
 * Fala UI-1 (zgloszenie 2026-11-03, sugestia 2 z Discorda): status
 * pobierania/czytania nie moze przesuwac calego UI. Kontrakt nowego
 * paska statusu:
 * - element .arkmail-busy jest ZAWSZE zamontowany (rowniez na idle,
 *   z pustym tekstem) - layout nie zmienia wysokosci przy pojawieniu
 *   ani zniknieciu statusu,
 * - pasek zyje na DOLE okna (po tresci, obok stopki wersji), nie miedzy
 *   zakladkami a trescia,
 * - pasek postepu (.arkmail-busy-bar) dalej warunkowy (tylko przy
 *   pobieraniu archiwum z total).
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Window } from 'happy-dom';

import { mountMailUi } from '../src/arkmail/ui/render';
import { MailUiStore } from '../src/arkmail/ui/store';

const window = new Window();
const document = window.document;

function mount() {
  const container = document.createElement('div');
  const store = new MailUiStore();
  mountMailUi(container as unknown as HTMLElement, store, {
    onOpenLetter: () => {},
    onSendCompose: () => {},
    onCloseLetter: () => {},
    onRefreshBox: () => {},
    onLoadOlder: () => {},
    onLoadAll: () => {},
    onSearch: () => {},
    onClearSearch: () => {},
    onDeleteLetter: () => {},
    onForwardLetter: () => {},
  });
  return { container, store };
}

const busy = (c: { querySelector(s: string): unknown }) =>
  c.querySelector('.arkmail-busy') as { textContent: string | null } | null;

test('status: pasek busy zawsze zamontowany, pusty na idle', () => {
  const { container: c, store } = mount();
  const idle = busy(c);
  assert.ok(idle, 'busy istnieje na idle (stalo zamontowany)');
  assert.equal(idle!.textContent, '', 'idle = pusty tekst');
  store.setBusy('Pobieram skrzynke odebrane...');
  const aktywny = busy(c);
  assert.ok(aktywny, 'busy istnieje w trakcie');
  assert.match(aktywny!.textContent ?? '', /Pobieram skrzynke/);
  store.setBusy(null);
  assert.equal(busy(c)!.textContent, '', 'powrot do pustego, element zostaje');
});

test('status: pasek na dole okna - za zakladkami i trescia, obok wersji', () => {
  const { container: c, store } = mount();
  const root = (c as { querySelector(s: string): unknown }).querySelector(
    '.arkmail-root',
  ) as unknown as { children: Array<{ className: string }> };
  assert.ok(root, 'root istnieje');
  const ileIdle = root.children.length;
  const ostatniIdle = root.children[ileIdle - 1];
  assert.match(ostatniIdle.className, /arkmail-status/, 'ostatni element = pasek statusu');
  assert.doesNotMatch(
    root.children[0].className,
    /arkmail-busy|arkmail-status/,
    'busy NIE przed zakladkami',
  );
  assert.doesNotMatch(
    root.children[1]?.className ?? '',
    /arkmail-busy|arkmail-status/,
    'busy NIE miedzy zakladkami a trescia',
  );
  store.setBusy('Czytam list: probe...');
  assert.equal(
    root.children.length,
    ileIdle,
    'liczba dzieci roota bez zmian (zero przeskoku wysokosci)',
  );
  assert.match(
    root.children[root.children.length - 1].className,
    /arkmail-status/,
    'pasek dalej na dole w trakcie busy',
  );
});

test('status: wersja pluginu mieszka w pasku statusu', () => {
  const { container: c } = mount();
  const status = (c as { querySelector(s: string): unknown }).querySelector(
    '.arkmail-status',
  ) as unknown as { textContent: string };
  assert.ok(status, 'pasek statusu istnieje');
  assert.match(status.textContent, /v\d+\.\d+\.\d+/, 'wersja w pasku statusu');
});
