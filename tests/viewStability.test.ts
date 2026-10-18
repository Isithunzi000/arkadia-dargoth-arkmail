/**
 * Stabilnosc widoku (Fala 11c): pelny rerender store NIE moze gubic
 * stanu widoku gracza. Migawka przed replaceChildren i przywrocenie po:
 * - focus + karet aktywnego pola (bug: litera po literze wywalalo
 *   z pola, gdy w tle lecialy stronicowania/notyfikacje),
 * - wartosci pol szukajki (draft lokalny, jak filtr archiwum),
 * - scrollTop paneli (po data-pane-key); nowy list startuje od gory.
 * Plus: lancuch wysokosci od createContent, zeby panele scrollowaly
 * sie niezaleznie zamiast calosci (bug: klik w list po przewinieciu
 * pokazywal pusta przestrzen).
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Window } from 'happy-dom';

import { mountMailUi } from '../src/arkmail/ui/render';
import { MailUiStore } from '../src/arkmail/ui/store';
import type { LetterContent } from '../src/arkmail/core/session/pager';
import { startHarness, stopHarness } from './harness';

const window = new Window();
const document = window.document;

function mount(store: MailUiStore) {
  const container = document.createElement('div');
  document.body.appendChild(container);
  mountMailUi(container as unknown as HTMLElement, store, {
    onOpenLetter: () => {},
    onSendCompose: () => {},
    onCloseLetter: () => store.closeLetter(),
    onRefreshBox: () => {},
    onLoadOlder: () => {},
    onLoadAll: () => {},
    onSearch: () => {},
    onClearSearch: () => {},
    onDeleteLetter: () => {},
    onForwardLetter: () => {},
  });
  return container;
}

const q = (c: unknown, sel: string): HTMLInputElement | null =>
  (c as { querySelector(s: string): unknown }).querySelector(sel) as HTMLInputElement | null;

function letter(n: number): LetterContent {
  return { number: n, from: 'Foo', subject: `T${n}`, to: 'Gracz', cc: null, date: null, body: ['tresc'] };
}

function withBox(s: MailUiStore): MailUiStore {
  s.applyMailbox('odebrane', {
    kind: 'lista',
    header: { box: 'odebrane', truncated: false },
    entries: [
      { number: 1, isRead: true, subject: 'A', forwarded: false, party: 'X', partyKind: 'nadawca', date: null },
      { number: 2, isRead: true, subject: 'B', forwarded: false, party: 'Y', partyKind: 'nadawca', date: null },
    ],
  });
  return s;
}

test('stabilnosc: wartosc i focus pola szukajki przez rerender', () => {
  const s = withBox(new MailUiStore());
  const c = mount(s);
  const el = q(c, '[data-search="osoba"]')!;
  el.value = 'gen';
  el.setSelectionRange(3, 3);
  el.dispatchEvent(new window.Event('input') as unknown as Event);
  el.focus();
  // Rerender z tla (np. strona loadAll albo merge notyfikacji).
  s.applyMailbox('nieprzeczytane', { kind: 'pusta', box: 'nieprzeczytane', reason: 'puste' });
  const after = q(c, '[data-search="osoba"]')!;
  assert.equal(after.value, 'gen', 'wartosc pola przetrwala rerender');
  assert.equal(document.activeElement, after, 'focus wraca na to samo pole');
  assert.equal(after.selectionStart, 3, 'karet na miejscu');
});

test('stabilnosc: focus pola compose przez rerender', () => {
  const s = new MailUiStore({ tab: 'napisz' });
  const c = mount(s);
  const el = q(c, '[data-field="adresat"]')!;
  el.focus();
  el.value = 'gwe';
  el.setSelectionRange(3, 3);
  s.setNotifyEnabled(true); // dowolna zmiana store = pelny rerender
  const after = q(c, '[data-field="adresat"]')!;
  assert.equal(after.value, 'gwe');
  assert.equal(document.activeElement, after);
});

test('stabilnosc: scroll listingu zachowany przy otwarciu listu w wide', () => {
  const s = withBox(new MailUiStore({ wide: true }));
  const c = mount(s);
  const left = q(c, '[data-pane-key="listy:odebrane"]')!;
  left.scrollTop = 37;
  s.openLetter('odebrane', letter(1));
  assert.equal(q(c, '[data-pane-key="listy:odebrane"]')!.scrollTop, 37, 'listing nie skacze');
  const right = q(c, '[data-pane-key="list:odebrane:1"]')!;
  assert.ok(right, 'prawy panel ma klucz listu');
  assert.equal(right.scrollTop, 0, 'podglad od gory');
});

test('stabilnosc: inny list w podgladzie startuje od gory', () => {
  const s = withBox(new MailUiStore({ wide: true }));
  s.openLetter('odebrane', letter(1));
  const c = mount(s);
  q(c, '[data-pane-key="list:odebrane:1"]')!.scrollTop = 50;
  s.openLetter('odebrane', letter(2));
  assert.equal(q(c, '[data-pane-key="list:odebrane:2"]')!.scrollTop, 0, 'nowy list od gory');
});

test('stabilnosc: waski podglad listu startuje od gory po kliknieciu', () => {
  const s = withBox(new MailUiStore());
  const c = mount(s);
  q(c, '[data-pane-key="listy:odebrane"]')!.scrollTop = 44;
  s.openLetter('odebrane', letter(1)); // waski -> zakladka list
  const pane = q(c, '[data-pane-key="list:odebrane:1"]')!;
  assert.ok(pane, 'panel listu');
  assert.equal(pane.scrollTop, 0, 'list od gory, nie od pozycji listingu');
});

test('stabilnosc: createContent daje pelna wysokosc (lancuch 100%)', async () => {
  const h = await startHarness();
  try {
    const style = (h.content as unknown as { style: { height: string; minHeight: string } }).style;
    assert.equal(style.height, '100%', 'kontener wypelnia popup');
    assert.equal(style.minHeight, '0', 'min-height 0 dla flexa');
  } finally {
    await stopHarness();
  }
});
