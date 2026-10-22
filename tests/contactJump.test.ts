/**
 * Kontakt -> listy (Fala 11h; wybor kierunku w Fali 12c; skok na
 * lokalne archiwum w Fali 26b).
 *
 * Fala 26b (zgloszenie 2026-10-22): skok z kontaktu filtruje LOKALNE
 * archiwum (zakladka Archiwum: filtr osoby + skrzynki), zamiast
 * strzelac szukaniem do serwera. Liczniki kontaktow stoja na archiwum
 * (contactsFromArchive), a serwerowe skrzynki bywaja chude (gracz
 * sprzata poczte) - serwerowe szukanie pokazywalo pusty filtr mimo
 * istniejacych listow ("klikam w wyslane danym kontakcie i pokazuje,
 * ze niby nic nie ma"). Bonus: filtr osoby w archiwum to podciag
 * po party, wiec listy wieloodbiorcze ("Foo, Corge i Bar") tez
 * trafiaja - serwerowy filtr osoby je gubil.
 *
 * Skok jest deterministyczny: ustawia osobe + skrzynke i kasuje
 * pozostale filtry archiwum (temat/tresc/daty), zeby wynik byl
 * dokladnie "listy tej osoby w tym kierunku".
 *
 * Przycisk kierunku jest wylaczony (disabled), gdy licznik listow
 * w danym kierunku wynosi 0. Klik w samo imie/wiersz (poza
 * przyciskami) = kierunek domyslny: odebrane, gdy sa; inaczej
 * wyslane; inaczej nic.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Window } from 'happy-dom';

import { mountMailUi } from '../src/arkmail/ui/render';
import { MailUiStore } from '../src/arkmail/ui/store';
import type { Contact } from '../src/arkmail/core/contacts';
import type { ArchiveLetter } from '../src/arkmail/core/archive';
import type { MailBox } from '../src/arkmail/core/protocol/types';

// Fala 18c: kontakty stoja za brama pelnego indeksu skrzynek - testy
// widoku kontaktow montuja stan z kompletnymi flagami (sama brama i
// jej integracja: tests/indexAll.test.ts).
const INDEXED: Partial<Record<MailBox, string>> = {
  odebrane: '2026-10-20T00:00:00.000Z',
  nieprzeczytane: '2026-10-20T00:00:00.000Z',
  wyslane: '2026-10-20T00:00:00.000Z',
  niewyslane: '2026-10-20T00:00:00.000Z',
};

const window = new Window();
const document = window.document;

interface Mounted {
  container: ReturnType<typeof document.createElement>;
  calls: { name: string; args: unknown[] }[];
}

function mount(store: MailUiStore): Mounted {
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
  });
  return { container, calls };
}

const contact = (over: Partial<Contact>): Contact => ({
  name: 'Corge',
  sources: ['korespondencja'],
  lettersReceived: 2,
  lettersSent: 1,
  ...over,
});

const letter = (box: MailBox, party: string, subject: string, sortKey: string): ArchiveLetter => ({
  id: `${box}|${party}|${subject}`,
  box,
  number: 1,
  party,
  subject,
  dateRaw: null,
  sortKey,
  read: true,
  body: [],
});

/** Standardowa baza: Corge ma list w odebranych i w wyslanych, Foo tylko odebrany. */
const seedArchive = (s: MailUiStore): void => {
  s.setArchive([
    letter('odebrane', 'Foo', 'inny list', '2026-10-02 10:00:00'),
    letter('odebrane', 'Corge', 'paczka od niego', '2026-10-01 10:00:00'),
    letter('wyslane', 'Corge', 'do niego', '2026-10-03 10:00:00'),
  ]);
};

const clickEl = (el: unknown): void => {
  (el as { dispatchEvent(e: unknown): void }).dispatchEvent(new window.Event('click'));
};

const searchCalls = (calls: Mounted['calls']) =>
  calls.filter((c) => c.name === 'search').map((c) => c.args);

const archRows = (container: unknown): string[] =>
  Array.from(
    (container as { querySelectorAll(s: string): unknown }).querySelectorAll(
      '.arkmail-arch-entry .arkmail-arch-meta',
    ) as ArrayLike<{ textContent: string }>,
  ).map((el) => el.textContent);

const filterInputs = (container: unknown): { osoba: string; skrzynka: string } => ({
  osoba: (
    (container as { querySelector(s: string): unknown }).querySelector(
      '[data-filter="osoba"]',
    ) as { value: string }
  ).value,
  skrzynka: (
    (container as { querySelector(s: string): unknown }).querySelector(
      '[data-filter="skrzynka"]',
    ) as { value: string }
  ).value,
});

test('kontakty: klik w imie -> archiwum z filtrem osoby na odebranych (Fala 26b)', () => {
  const s = new MailUiStore({ tab: 'kontakty', indexMeta: INDEXED });
  s.setActiveBox('wyslane'); // aktywna skrzynka NIE moze decydowac
  s.setContacts([contact({})]);
  seedArchive(s);
  const { container, calls } = mount(s);

  const row = container.querySelector('.arkmail-contact-name');
  assert.ok(row, 'imie kontaktu');
  clickEl(row);

  assert.equal(s.state.tab, 'archiwum', 'przejscie do zakladki Archiwum');
  assert.deepEqual(searchCalls(calls), [], 'zero szukania serwerowego');
  assert.deepEqual(filterInputs(container), { osoba: 'Corge', skrzynka: 'odebrane' });
  assert.deepEqual(archRows(container), ['od Corge | odebrane'], 'tylko listy Corge z odebranych');
});

test('kontakty: klik w imie -> wyslane, gdy odebranych brak', () => {
  const s = new MailUiStore({ tab: 'kontakty', indexMeta: INDEXED });
  s.setContacts([contact({ lettersReceived: 0, lettersSent: 3 })]);
  seedArchive(s);
  const { container, calls } = mount(s);

  clickEl(container.querySelector('.arkmail-contact-name'));

  assert.equal(s.state.tab, 'archiwum');
  assert.deepEqual(searchCalls(calls), [], 'zero szukania serwerowego');
  assert.deepEqual(filterInputs(container), { osoba: 'Corge', skrzynka: 'wyslane' });
  assert.deepEqual(archRows(container), ['do Corge | wyslane']);
});

test('kontakty: klik w imie bez zadnych listow -> nic sie nie dzieje', () => {
  const s = new MailUiStore({ tab: 'kontakty', indexMeta: INDEXED });
  s.setContacts([contact({ lettersReceived: 0, lettersSent: 0 })]);
  seedArchive(s);
  const { container, calls } = mount(s);

  clickEl(container.querySelector('.arkmail-contact-name'));

  assert.equal(s.state.tab, 'kontakty', 'zostajemy w kontaktach');
  assert.deepEqual(searchCalls(calls), [], 'zero szukania');
});

test('kontakty: przycisk Wyslane -> archiwum z filtrem na wyslanych', () => {
  const s = new MailUiStore({ tab: 'kontakty', indexMeta: INDEXED });
  s.setContacts([contact({})]); // ma oba kierunki
  seedArchive(s);
  const { container, calls } = mount(s);

  const btn = container.querySelector('[data-dir="wyslane"]');
  assert.ok(btn, 'przycisk kierunku Wyslane');
  clickEl(btn);

  assert.equal(s.state.tab, 'archiwum');
  assert.deepEqual(searchCalls(calls), [], 'zero szukania serwerowego');
  assert.deepEqual(filterInputs(container), { osoba: 'Corge', skrzynka: 'wyslane' });
  assert.deepEqual(archRows(container), ['do Corge | wyslane'], 'jawny wybor kierunku wygrywa');
});

test('kontakty: list wieloodbiorczy trafia w skok po osobie (Fala 26b)', () => {
  // Serwerowy filtr osoby gubil listy "Odbiorcy: A, B i C"; lokalny
  // filtr archiwum to podciag po party - grupowy list jest widoczny.
  const s = new MailUiStore({ tab: 'kontakty', indexMeta: INDEXED });
  s.setContacts([contact({ lettersReceived: 0, lettersSent: 2 })]);
  s.setArchive([
    letter('wyslane', 'Foo, Corge i Bar', 'grupowy', '2026-10-04 10:00:00'),
    letter('wyslane', 'Foo', 'nie do niego', '2026-10-05 10:00:00'),
  ]);
  const { container } = mount(s);

  clickEl(container.querySelector('[data-dir="wyslane"]'));

  assert.equal(s.state.tab, 'archiwum');
  assert.deepEqual(archRows(container), ['do Foo, Corge i Bar | wyslane']);
});

test('kontakty: przycisk kierunku wylaczony, gdy licznik wynosi 0', () => {
  const s = new MailUiStore({ tab: 'kontakty', indexMeta: INDEXED });
  s.setContacts([contact({ lettersReceived: 0, lettersSent: 5 })]);
  seedArchive(s);
  const { container, calls } = mount(s);

  const off = container.querySelector('[data-dir="odebrane"]') as unknown as {
    disabled: boolean;
  } | null;
  const on = container.querySelector('[data-dir="wyslane"]') as unknown as {
    disabled: boolean;
  } | null;
  assert.ok(off && on, 'oba przyciski kierunku w wierszu');
  assert.ok(off!.disabled, 'Odebrane wylaczone (0 odebranych)');
  assert.ok(!on!.disabled, 'Wyslane aktywne');
  clickEl(off);
  assert.equal(s.state.tab, 'kontakty', 'wylaczony przycisk nie przenosi');
  assert.deepEqual(searchCalls(calls), [], 'wylaczony przycisk nie strzela');
});
