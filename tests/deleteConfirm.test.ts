/**
 * Usuwanie listu z dwuklikowym potwierdzeniem + jednoznaczny toast (Fala 14e).
 *
 * Problem (zgloszenie 2026-10-19, pkt 7): przycisk "Usun" na otwartym
 * liscie kasowal POJEDYNCZYM kliknieciem - latwo o przypadek. A toast
 * mowil "List oznaczony do skasowania.", choć sesja pagera (d N -> q)
 * kasuje list FAKTYCZNIE przy wyjsciu z pagera ("Kasuje: N."), wiec
 * po res.deleted list juz nie istnieje.
 *
 * Kontrakt:
 *  - pierwszy klik tylko uzbraja przycisk ("Na pewno? Kliknij ponownie",
 *    wygasa po 3 s) - zero komend do serwera;
 *  - drugi klik w oknie wywoluje onDeleteLetter;
 *  - toast po sukcesie: "List zostal usuniety."
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Window } from 'happy-dom';

import { mountMailUi, type MailUiHandlers } from '../src/arkmail/ui/render';
import { MailUiStore } from '../src/arkmail/ui/store';
import type { MailboxEntry } from '../src/arkmail/core/session/mailbox';
import {
  startHarness,
  stopHarness,
  loadTruncatedBox,
  click,
  waitRt,
  notifyText,
  textOf,
  type Harness,
} from './harness';

const window = new Window();
const document = window.document;

function entry(over: Partial<MailboxEntry> = {}): MailboxEntry {
  return {
    number: 3,
    isRead: true,
    subject: 'Perly',
    forwarded: false,
    party: 'Foo',
    partyKind: 'nadawca',
    date: null,
    ...over,
  };
}

function mount(store: MailUiStore) {
  const container = document.createElement('div');
  const calls: { name: string; args: unknown[] }[] = [];
  const rec =
    (name: string) =>
    (...args: unknown[]) =>
      calls.push({ name, args });
  const off = mountMailUi(container as unknown as HTMLElement, store, {
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
    ...{},
  } as unknown as MailUiHandlers);
  return { container, calls, off };
}

const clickEl = (el: unknown) =>
  (el as { dispatchEvent(e: unknown): void }).dispatchEvent(
    new window.Event('click') as unknown as Event,
  );

function openLetterWithSource(s: MailUiStore): MailboxEntry {
  const source = entry({ number: 3 });
  s.openLetter(
    'odebrane',
    { number: 3, from: 'Foo', subject: 'Perly', to: 'Gracz', cc: null, date: null, body: ['czesc'] },
    source,
  );
  return source;
}

test('ui: Usun kasuje dopiero po drugim kliku (potwierdzenie)', () => {
  const s = new MailUiStore();
  const { container, calls, off } = mount(s);
  const source = openLetterWithSource(s);
  const del = container.querySelector('.arkmail-del')!;
  assert.equal(del.textContent, 'Usun');

  clickEl(del);
  assert.equal(calls.filter((c) => c.name === 'del').length, 0, 'pierwszy klik nie kasuje');
  assert.match(del.textContent ?? '', /Na pewno/, 'przycisk uzbrojony');

  clickEl(del);
  assert.equal(calls.filter((c) => c.name === 'del').length, 1, 'drugi klik kasuje');
  assert.deepEqual(calls[0].args, ['odebrane', source]);
  assert.equal(del.textContent, 'Usun', 'przycisk wrocil do stanu poczatkowego');
  off();
});

test('ui: uzbrojenie Usun wygasa po 3 s bez drugiego kliku', async () => {
  const s = new MailUiStore();
  const { container, calls, off } = mount(s);
  openLetterWithSource(s);
  const del = container.querySelector('.arkmail-del')!;
  clickEl(del);
  assert.match(del.textContent ?? '', /Na pewno/, 'uzbrojony');
  await waitRt(() => del.textContent === 'Usun', 'przycisk wrocil do stanu poczatkowego');
  clickEl(del);
  assert.equal(calls.filter((c) => c.name === 'del').length, 0, 'klik po wygasnieciu znowu tylko uzbraja');
  off();
});

/** Odtwarza otwarcie listu numer N w pagerze i wyjscie. */
function replayLetter(h: Harness, n: number): void {
  const { f } = h;
  f.fire(`List : ${n}`, 'mail');
  f.fire('Od   : Corge', 'mail');
  f.fire('Temat: najnowszy', 'mail');
  f.fire('Data : Wt, 23 XII 2025, 00:11:12', 'mail');
  f.fire('', 'mail');
  f.fire('Tresc karteczki.', 'mail');
  f.fire(`[1-50 adefFhHmnqrsRux.!?-+<>] (aktualny: ${n}) -- `, 'mail');
  f.fire('> ', 'prompt');
}

/** Swiezy listing odebranych, w ktorym "najnowszy" (Corge 23 XII) ma numer 2. */
function replayFreshListing(h: Harness): void {
  const { f } = h;
  f.fire('Listy odebrane (prezentowane jest pierwsze 50):', 'mail');
  f.fire(' 3. *R* Temat: inny', 'mail');
  f.fire('Nadawca: Grault                         Wt, 23 XII 2025, 01:00:00', 'mail');
  f.fire(' 2. *R* Temat: najnowszy', 'mail');
  f.fire('Nadawca: Corge                       Wt, 23 XII 2025, 00:11:12', 'mail');
  f.fire(' 1. *R* Temat: srodkowy', 'mail');
  f.fire('Nadawca: Foo                        Pn, 22 XII 2025, 02:20:05', 'mail');
  f.fire('> ', 'prompt');
}

test('harness: Usun wymaga dwukliku; toast "List zostal usuniety."', async () => {
  const h = await startHarness();
  const { f, waitFor } = h;
  try {
    await loadTruncatedBox(h);
    // Fala 14f: prolog konczy sie pustym listingiem nieprzeczytanych -
    // wpis ma stary kontekst, wiec otwarcie idzie przez re-kotwice.
    click(h, '.arkmail-entry');
    await waitFor(
      () => f.sent.includes('listy odebrane przed 24 XII 2025'),
      're-kotwica przed otwarciem',
    );
    replayFreshListing(h);
    await waitFor(() => f.sent.includes('przeczytaj list 2'), 'przeczytaj list 2');
    replayLetter(h, 2);
    await waitFor(() => !!h.content.querySelector('.arkmail-del'), 'widok listu z Usun');
    // Fala 11f: refresh po odczycie nadpisuje kontekst listingu serwera.
    await waitFor(
      () => f.sent.filter((c) => c === 'listy odebrane').length === 2,
      'refresh po odczycie (11f)',
    );
    replayFreshListing(h);
    await waitRt(() => !h.content.querySelector('.arkmail-busy'), 'koniec refreshu');

    // Pierwszy klik: tylko uzbrojenie - ZERO komend do serwera.
    const sentBefore = f.sent.length;
    click(h, '.arkmail-del');
    await waitFor(() => textOf(h, '.arkmail-del').includes('Na pewno'), 'przycisk uzbrojony');
    assert.ok(
      !f.sent.slice(sentBefore).some((c) => /^(d |przeczytaj|listy)/.test(c)),
      'pierwszy klik nie rusza serwera',
    );

    // Drugi klik: kasowanie (wpis ma stary kontekst -> re-kotwica).
    // Te same komende co przy otwarciu rozrozniamy po liczbie wystapien.
    click(h, '.arkmail-del');
    await waitFor(
      () => f.sent.filter((c) => c === 'listy odebrane przed 24 XII 2025').length === 2,
      're-kotwica przed kasowaniem',
    );
    replayFreshListing(h);
    await waitFor(
      () => f.sent.filter((c) => c === 'przeczytaj list 2').length === 2,
      'przeczytaj ze swiezym numerem 2',
    );
    replayLetter(h, 2);
    await waitFor(() => f.sent.includes('d 2'), 'zaznaczenie 2 do skasowania');
    f.fire('Zaznaczono do skasowania: 2.', 'mail');
    // Po potwierdzeniu serwer WRACA do promptu pagera - dopiero wtedy q.
    f.fire('[1-50 adefFhHmnqrsRux.!?-+<>] (aktualny: 2) -- ', 'mail');
    f.fire('> ', 'prompt');
    await waitFor(() => notifyText(f, 'List zostal usuniety.'), 'toast po kasowaniu');
  } finally {
    await stopHarness();
  }
});
