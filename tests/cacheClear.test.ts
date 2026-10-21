/**
 * Czyszczenie pamieci podrecznej (Fala 12e).
 *
 * Gracz musi moc wyczyscic cache pluginu na zadanie. Przycisk "Wyczysc
 * pamiec podreczna" w pasku operacji listingu, z dwuklikowym
 * potwierdzeniem (pierwszy klik uzbraja na 3 s, drugi wykonuje).
 *
 * Czysci: widoki skrzynek, archiwum (RAM + storage), kontakty, schowek
 * wynikow szukania. ZACHOWUJE ustawienia: powiadomienia, szablon
 * compose, otwarty list.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Window } from 'happy-dom';

import { mountMailUi } from '../src/arkmail/ui/render';
import { MailUiStore } from '../src/arkmail/ui/store';
import {
  startHarness,
  stopHarness,
  loadTruncatedBox,
  click,
  waitRt,
  notifyText,
} from './harness';

const window = new Window();
const document = window.document;

function mount(store: MailUiStore) {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const calls: { name: string; args: unknown[] }[] = [];
  const rec = (name: string) => (...args: unknown[]) => calls.push({ name, args });
  mountMailUi(container as unknown as HTMLElement, store, {
    onOpenLetter: rec('open'),
    onSendCompose: rec('send'),
    onCloseLetter: rec('close'),
    onRefreshBox: rec('refresh'),
    onLoadOlder: rec('older'),
    onLoadAll: rec('all'),
    onSearch: rec('search'),
    onClearSearch: rec('clear-search'),
    onDeleteLetter: rec('del'),
    onForwardLetter: rec('fwd'),
    onClearCache: rec('clear-cache'),
  } as Parameters<typeof mountMailUi>[2]);
  return { container, calls };
}

const q = (c: unknown, sel: string): HTMLElement | null =>
  (c as { querySelector(s: string): unknown }).querySelector(sel) as HTMLElement | null;

const clickEl = (el: HTMLElement): void => {
  el.dispatchEvent(new window.Event('click') as unknown as Event);
};

test('store: clearCacheData czysci widoki/archiwum/kontakty, zachowuje ustawienia', () => {
  const s = new MailUiStore({ notifyEnabled: true, composeTemplate: 'parchment', composeWidth: 72 });
  s.applyMailbox('odebrane', {
    kind: 'lista',
    header: { box: 'odebrane', truncated: true },
    entries: [
      {
        number: 1,
        isRead: false,
        subject: 'x',
        forwarded: false,
        party: 'Foo',
        partyKind: 'nadawca',
        date: null,
      },
    ],
  });
  s.setArchive([
    { id: 'a1', box: 'odebrane', party: 'Foo', subject: 'x' } as never,
  ]);
  s.setContacts([
    { name: 'Foo', sources: ['korespondencja'], lettersReceived: 1, lettersSent: 0 },
  ]);
  s.setSearch({ box: 'odebrane', label: 'osoba: Foo' });
  s.openLetter('odebrane', { headers: [], body: [], raw: '' } as never);
  assert.ok(s.state.badge > 0, 'badge przed czyszczeniem');

  const clear = (
    s as unknown as { clearCacheData?: () => void }
  ).clearCacheData?.bind(s);
  assert.equal(typeof clear, 'function', 'metoda clearCacheData istnieje');
  clear!();

  assert.deepEqual(s.state.boxes, {}, 'widoki skrzynek wyczyszczone');
  assert.deepEqual(s.state.archive, [], 'archiwum (RAM) wyczyszczone');
  assert.deepEqual(s.state.contacts, [], 'kontakty wyczyszczone');
  assert.equal(s.state.badge, 0, 'badge wyzerowany');
  assert.equal(s.state.search, null, 'tryb szukania skasowany');
  assert.equal(s.state.notifyEnabled, true, 'powiadomienia ZACHOWANE');
  assert.equal(s.state.composeTemplate, 'parchment', 'szablon compose ZACHOWANY');
  assert.equal(s.state.composeWidth, 72, 'szerokosc compose ZACHOWANA');
  assert.ok(s.state.letter, 'otwarty list nietkniety');
});

test('ui: zakres czyszczenia jako tooltip przycisku, nie staly napis (Fala 24h)', () => {
  const s = new MailUiStore({ tab: 'listy' });
  const { container } = mount(s);
  const btn = q(container, '.arkmail-cache-clear');
  assert.ok(btn, 'przycisk w pasku operacji');
  // Fala 24h (zgloszenie 2026-10-21): informacja "Kasuje listy
  // i kontakty. Ustawienia zostaja." ma byc tooltipem przycisku,
  // nie stalym napisem pod paskiem operacji skrzynki.
  assert.equal(
    btn!.getAttribute('title'),
    'Kasuje listy i kontakty. Ustawienia zostaja.',
    'zakres czyszczenia w tooltipie przycisku',
  );
  const pane = q(container, '.arkmail-pane');
  assert.ok(pane, 'panel skrzynki');
  const dims = Array.from(
    (pane as unknown as { querySelectorAll(s: string): unknown[] }).querySelectorAll(
      '.arkmail-dim',
    ),
  ) as HTMLElement[];
  assert.ok(
    !dims.some((d) => (d.textContent ?? '').includes('Kasuje listy i kontakty')),
    'brak stalego napisu o zakresie czyszczenia w panelu',
  );
});

test('ui: przycisk czysci dopiero po drugim kliku (potwierdzenie)', () => {
  const s = new MailUiStore({ tab: 'listy' });
  const { container, calls } = mount(s);
  const btn = q(container, '.arkmail-cache-clear');
  assert.ok(btn, 'przycisk w pasku operacji');
  assert.match(btn!.textContent ?? '', /Wyczysc zapisane dane/);

  clickEl(btn!);
  assert.equal(calls.filter((c) => c.name === 'clear-cache').length, 0, 'pierwszy klik nie czysci');
  assert.match(btn!.textContent ?? '', /Na pewno/, 'przycisk uzbrojony - prosi o potwierdzenie');

  clickEl(btn!);
  assert.equal(calls.filter((c) => c.name === 'clear-cache').length, 1, 'drugi klik czysci');
});

test('ui: uzbrojenie wygasa po 3 s bez drugiego kliku', async () => {
  const s = new MailUiStore({ tab: 'listy' });
  const { container, calls } = mount(s);
  const btn = q(container, '.arkmail-cache-clear')!;
  clickEl(btn);
  assert.match(btn.textContent ?? '', /Na pewno/, 'uzbrojony');
  await waitRt(
    () => (btn.textContent ?? '').includes('Wyczysc zapisane dane'),
    'przycisk wrocil do stanu poczatkowego',
  );
  clickEl(btn);
  assert.equal(
    calls.filter((c) => c.name === 'clear-cache').length,
    0,
    'klik po wygasnieciu znowu tylko uzbraja',
  );
});

test('harness: czyszczenie kasuje widok i archiwum, ustawienia zostaja', async () => {
  const h = await startHarness();
  const { f, content } = h;
  try {
    await loadTruncatedBox(h);
    // Archiwum zapełnione listingiem (Fala 8f): zakladka archiwum ma wpisy.
    // Wlacz powiadomienia - ustawienie ma PRZETRWAC czyszczenie.
    const chk = content.querySelector('.arkmail-notify-toggle') as { click(): void } | null;
    chk!.click();

    const btn = content.querySelector('.arkmail-cache-clear') as
      | { dispatchEvent(e: unknown): void }
      | null;
    assert.ok(btn, 'przycisk czyszczenia w harness');
    click(h, '.arkmail-cache-clear');
    click(h, '.arkmail-cache-clear');

    await waitRt(() => content.querySelectorAll('.arkmail-entry').length === 0, 'widok pusty');
    assert.ok(notifyText(f, 'Zapisane dane wyczyszczone'), 'tost o czyszczeniu');
    const chkAfter = content.querySelector('.arkmail-notify-toggle') as { checked: boolean };
    assert.equal(chkAfter.checked, true, 'powiadomienia ZACHOWANE po czyszczeniu');
  } finally {
    await stopHarness();
  }
});
