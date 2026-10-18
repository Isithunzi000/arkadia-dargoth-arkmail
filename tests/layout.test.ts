/**
 * Layout dwupanelowy (Fala 10): wide = listing po lewej + podglad listu
 * po prawej (klasyczny klient poczty), waski = jeden panel z powrotem
 * "Zamknij list". Nawigacja uniwersalna: flip wide<->waski w trakcie
 * czytania nie gubi otwartego listu.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Window } from 'happy-dom';

import { mountMailUi } from '../src/arkmail/ui/render';
import { MailUiStore } from '../src/arkmail/ui/store';
import type { LetterContent } from '../src/arkmail/core/session/pager';

const window = new Window();
const document = window.document;

function mount(store: MailUiStore) {
  const container = document.createElement('div');
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

function letter(): LetterContent {
  return { number: 3, from: 'Foo', subject: 'Perly', to: 'Gracz', cc: null, date: null, body: ['czesc'] };
}

function withBox(s: MailUiStore): MailUiStore {
  s.applyMailbox('odebrane', {
    kind: 'lista',
    header: { box: 'odebrane', truncated: false },
    entries: [
      { number: 1, isRead: true, subject: 'Perly', forwarded: false, party: 'Foo', partyKind: 'nadawca', date: null },
    ],
  });
  return s;
}

const q = (c: unknown, sel: string): unknown =>
  (c as { querySelector(s: string): unknown }).querySelector(sel);

const hasButton = (c: unknown, txt: string): boolean =>
  [...(c as { querySelectorAll(s: string): unknown[] }).querySelectorAll('button')].some(
    (b) => (b as { textContent?: string }).textContent === txt,
  );

const click = (c: unknown, sel: string): void =>
  (q(c, sel) as { dispatchEvent(e: unknown): void }).dispatchEvent(
    new window.Event('click') as unknown as Event,
  );

test('layout: wide bez otwartego listu - split z listingiem i placeholderem', () => {
  const s = withBox(new MailUiStore({ wide: true }));
  const c = mount(s);
  const split = q(c, '.arkmail-split') as { children: ArrayLike<unknown> } | null;
  assert.ok(split, 'wide zawsze pokazuje split, nawet bez otwartego listu');
  assert.equal(split!.children.length, 2, 'lewy listing + prawy panel');
  const right = split!.children[1] as { textContent?: string };
  assert.ok(
    right.textContent?.includes('Wybierz list z listy, aby go przeczytac.'),
    'placeholder w prawym panelu',
  );
  assert.ok(q(c, '.arkmail-entry'), 'listing po lewej');
});

test('layout: wide z listem - podglad po prawej, Zamknij w naglowku, bez Zamknij list', () => {
  const s = withBox(new MailUiStore({ wide: true }));
  s.openLetter('odebrane', letter());
  const c = mount(s);
  const split = q(c, '.arkmail-split') as { children: ArrayLike<unknown> } | null;
  assert.ok(split, 'split przy otwartym liscie');
  const right = split!.children[1] as { textContent?: string };
  assert.ok(right.textContent?.includes('Perly'), 'podglad listu po prawej');
  assert.ok(q(c, '.arkmail-letter-close'), 'przycisk Zamknij w podgladzie');
  assert.ok(!hasButton(c, 'Zamknij list'), 'w wide nie ma przycisku Zamknij list');
  const tab = q(c, '[data-tab="listy"]') as { classList: { contains(s: string): boolean } };
  assert.ok(tab.classList.contains('arkmail-tab-active'), 'klik w list nie zmienia zakladki');
});

test('layout: Zamknij w wide czysci podglad - wraca placeholder', () => {
  const s = withBox(new MailUiStore({ wide: true }));
  s.openLetter('odebrane', letter());
  const c = mount(s);
  click(c, '.arkmail-letter-close');
  assert.equal(s.state.letter, null);
  const split = q(c, '.arkmail-split') as { children: ArrayLike<unknown> } | null;
  assert.ok(split, 'split zostaje po zamknieciu');
  const right = split!.children[1] as { textContent?: string };
  assert.ok(right.textContent?.includes('Wybierz list z listy, aby go przeczytac.'));
});

test('layout: waski - jeden panel, Zamknij list wraca do listingu (regresja)', () => {
  const s = withBox(new MailUiStore());
  s.openLetter('odebrane', letter());
  const c = mount(s);
  assert.ok(!q(c, '.arkmail-split'), 'waski nie ma splitu');
  assert.ok(hasButton(c, 'Zamknij list'), 'waski ma powrot');
  assert.ok(!q(c, '.arkmail-letter-close'), 'waski nie ma Zamknij w naglowku');
  click(c, '.arkmail-older');
  assert.equal(s.state.letter, null);
  assert.equal(s.state.tab, 'listy');
  assert.ok(q(c, '.arkmail-entry'), 'po powrocie listing');
});

test('layout: flip wide->waski w trakcie czytania nie gubi listu', () => {
  const s = withBox(new MailUiStore({ wide: true }));
  s.openLetter('odebrane', letter());
  const c = mount(s);
  assert.ok(q(c, '.arkmail-split'), 'przed flipem split');
  s.setWide(false);
  assert.ok(!q(c, '.arkmail-split'), 'po flipie jeden panel');
  assert.ok(hasButton(c, 'Zamknij list'), 'po flipie jest powrot do listingu');
  const pane = q(c, '.arkmail-pane') as { textContent?: string };
  assert.ok(pane.textContent?.includes('Perly'), 'list nadal otwarty');
});
