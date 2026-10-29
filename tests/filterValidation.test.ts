/**
 * Guardy filtrow serwerowych i dat przed zbudowaniem komendy.
 * Bledny tekst zostaje w polu; zadna sciezka nie pomija walidacji.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Window } from 'happy-dom';

import {
  fromISODate,
  nextDay,
  prevDay,
  searchListingCommand,
  validateSearchDraft,
  type ListingSearch,
} from '../src/arkmail/core/protocol/commands';
import { filterVisibleArchive, type ArchiveLetter } from '../src/arkmail/core/archive';
import { mountMailUi, type MailUiHandlers } from '../src/arkmail/ui/render';
import { MailUiStore } from '../src/arkmail/ui/store';
import { notifyText, startHarness, stopHarness, waitRt } from './harness';

const PERSON_ERROR = 'Osoba: tylko litery a-zA-Z.';
const SUBJECT_ERROR = 'Temat nie moze zawierac znakow ; ani #.';
const BODY_ERROR = 'Tresc nie moze zawierac znakow ; ani #.';
const DATE_ERROR = 'Podaj prawidlowa date w formacie RRRR-MM-DD.';
const RANGE_ERROR = 'Od dnia pozniej niz Do dnia.';

const invalidQueries: Array<[ListingSearch, string]> = [
  [{ osoba: 'Foo1' }, PERSON_ERROR],
  [{ osoba: 'Foo Bar' }, PERSON_ERROR],
  [{ osoba: 'Foo,Bar' }, PERSON_ERROR],
  [{ osoba: 'Foo;Bar' }, PERSON_ERROR],
  [{ osoba: 'Foo#Bar' }, PERSON_ERROR],
  [{ temat: 'Temat; kolejna komenda' }, SUBJECT_ERROR],
  [{ temat: 'Temat # kolejna komenda' }, SUBJECT_ERROR],
  [{ tresc: 'Tresc; kolejna komenda' }, BODY_ERROR],
  [{ tresc: 'Tresc # kolejna komenda' }, BODY_ERROR],
  [{ odDaty: { day: 30, month: 2, year: 2026 } }, DATE_ERROR],
  [{ doDaty: { day: 1, month: 13, year: 2026 } }, DATE_ERROR],
  [{ odDaty: { day: 1, month: 1, year: 0 } }, DATE_ERROR],
  [{ odDaty: { day: 1, month: 1, year: 1 } }, DATE_ERROR],
  [{
    odDaty: { day: 20, month: 10, year: 2026 },
    doDaty: { day: 10, month: 10, year: 2026 },
  }, RANGE_ERROR],
];

test('komendy: kazdy bledny filtr jest odrzucony przed zbudowaniem komendy', () => {
  for (const [query, message] of invalidQueries) {
    assert.throws(
      () => searchListingCommand('odebrane', query),
      { message },
      `komenda nie powstaje: ${message}`,
    );
  }
});

test('daty: rok i liczby calkowite maja twardy guard kalendarza', () => {
  assert.equal(fromISODate('0000-01-01'), null, 'rok zero nie jest data pola HTML');
  for (const date of [
    { day: 1, month: 1, year: 0 },
    { day: 1, month: 1, year: 2026.5 },
    { day: 1.5, month: 1, year: 2026 },
    { day: 1, month: 1.5, year: 2026 },
  ]) {
    assert.throws(() => nextDay(date), { message: DATE_ERROR });
    assert.throws(() => prevDay(date), { message: DATE_ERROR });
  }
  assert.throws(
    () => prevDay({ day: 1, month: 1, year: 1 }),
    { message: DATE_ERROR },
    'poprzedni dzien nie moze miec roku zero',
  );
});

const window = new Window();
const document = window.document;

type Call = { name: string; args: unknown[] };

function mount(store: MailUiStore) {
  const container = document.createElement('div');
  const calls: Call[] = [];
  const rec = (name: string) => (...args: unknown[]) => calls.push({ name, args });
  const off = mountMailUi(container as unknown as HTMLElement, store, {
    onSearch: rec('search'),
    onDeletionSearch: rec('deletion-search'),
  } as unknown as MailUiHandlers);
  return { container, calls, off };
}

const setInput = (container: unknown, selector: string, value: string): void => {
  const input = (container as { querySelector(s: string): unknown }).querySelector(selector) as {
    value: string;
    dispatchEvent(event: unknown): void;
  } | null;
  assert.ok(input, `pole ${selector} istnieje`);
  input.value = value;
  input.dispatchEvent(new window.Event('input', { bubbles: true }));
};

const click = (container: unknown, selector: string): void => {
  const button = (container as { querySelector(s: string): unknown }).querySelector(selector) as {
    click(): void;
  } | null;
  assert.ok(button, `przycisk ${selector} istnieje`);
  button.click();
};

const label = (container: unknown, selector: string): string =>
  String(((container as { querySelector(s: string): unknown }).querySelector(selector) as {
    textContent?: string;
  } | null)?.textContent ?? '');

const callsNamed = (calls: Call[], name: string): Call[] => calls.filter((call) => call.name === name);

test('ui Listy: bledne znaki nie trafiaja do handlera i zostaja w polach', () => {
  const store = new MailUiStore({ tab: 'listy' });
  const { container, calls, off } = mount(store);
  const cases: Array<[string, string, string]> = [
    ...['Foo1', 'Foo Bar', 'Foo,Bar', 'Foo;Bar', 'Foo#Bar'].map(
      (value): [string, string, string] => ['osoba', value, PERSON_ERROR],
    ),
    ['temat', 'Temat; kolejna komenda', SUBJECT_ERROR],
    ['temat', 'Temat # kolejna komenda', SUBJECT_ERROR],
    ['tresc', 'Tresc; kolejna komenda', BODY_ERROR],
    ['tresc', 'Tresc # kolejna komenda', BODY_ERROR],
  ];
  for (const [field, value, message] of cases) {
    setInput(container, `[data-search="${field}"]`, value);
    click(container, '.arkmail-search-go');
    assert.equal(callsNamed(calls, 'search').length, 0, `brak wyszukiwania: ${value}`);
    assert.equal(label(container, '.arkmail-search-go'), message);
    const input = container.querySelector(`[data-search="${field}"]`) as unknown as { value: string };
    assert.equal(input.value, value, 'plugin nie poprawia tekstu automatycznie');
    setInput(container, `[data-search="${field}"]`, '');
  }
  off();
});

test('ui Listy: poprawne znaki i daty zachowuja dotychczasowa komende', () => {
  const store = new MailUiStore({ tab: 'listy' });
  const { container, calls, off } = mount(store);
  setInput(container, '[data-search="osoba"]', 'Foo');
  setInput(container, '[data-search="temat"]', 'Perly: zloto?');
  setInput(container, '[data-search="tresc"]', 'Zloto, morze!');
  setInput(container, '[data-search="odDaty"]', '2026-10-01');
  setInput(container, '[data-search="doDaty"]', '2026-10-31');
  click(container, '.arkmail-search-go');
  assert.equal(callsNamed(calls, 'search').length, 1);
  const query = callsNamed(calls, 'search')[0].args[1] as ListingSearch;
  assert.deepEqual(query, {
    osoba: 'Foo',
    odDaty: { day: 1, month: 10, year: 2026 },
    doDaty: { day: 31, month: 10, year: 2026 },
    temat: 'Perly: zloto?',
    tresc: 'Zloto, morze!',
  });
  off();
});

test('ui Usuwanie: wspolne guardy obejmuja tez surowe daty i ich zakres', () => {
  const store = new MailUiStore({ tab: 'usuwanie' });
  const { container, calls, off } = mount(store);
  setInput(container, '[data-deletion-filter="osoba"]', 'Foo;Bar');
  click(container, '.arkmail-deletion-search');
  assert.equal(callsNamed(calls, 'deletion-search').length, 0);
  assert.equal(label(container, '.arkmail-deletion-search'), PERSON_ERROR);

  // Pola od C3 pisza do lokalnego draftu (commit dopiero klik 'Szukaj /
  // Odswiez'), wiec scenariusz walidacji prowadzimy przez pola.
  setInput(container, '[data-deletion-filter="osoba"]', '');
  setInput(container, '[data-deletion-filter="odDaty"]', '2026-10-20');
  setInput(container, '[data-deletion-filter="doDaty"]', '2026-10-10');
  click(container, '.arkmail-deletion-search');
  assert.equal(callsNamed(calls, 'deletion-search').length, 0, 'odwrocony zakres jest zablokowany');
  assert.equal(label(container, '.arkmail-deletion-search'), RANGE_ERROR);
  off();
});

// Surowe, niedopuszczalne daty ('2026-02-30', '0001-01-01') nie da sie
// wpisac do pola type=date (przegladarka czysci wartosc), wiec guard
// draftu testujemy wprost - fireSearch przepuszcza przez validateSearchDraft
// dokladnie takie surowe stringi z deletionDraft.
test('usuwanie: surowe bledne daty odrzuca walidacja draftu', () => {
  for (const odDaty of ['2026-02-30', '0001-01-01', '2026-13-01', 'nie-data']) {
    assert.equal(
      validateSearchDraft({ osoba: '', temat: '', tresc: '', odDaty, doDaty: '' }),
      DATE_ERROR,
      `odrzucono: "${odDaty}"`,
    );
  }
  assert.equal(
    validateSearchDraft({ osoba: '', temat: '', tresc: '', odDaty: '2026-10-20', doDaty: '2026-10-10' }),
    RANGE_ERROR,
    'odwrocony zakres odrzucony na poziomie draftu',
  );
});

test('handler: bezposrednie Listy i Usuwanie nie omijaja walidacji', async () => {
  const renderModule = require('../src/arkmail/ui/render') as {
    mountMailUi: typeof mountMailUi;
  };
  const originalMount = renderModule.mountMailUi;
  let captured: MailUiHandlers | null = null;
  renderModule.mountMailUi = (container, store, handlers) => {
    captured = handlers;
    return originalMount(container, store, handlers);
  };
  let h: Awaited<ReturnType<typeof startHarness>> | null = null;
  try {
    h = await startHarness();
    assert.ok(captured, 'przechwycono prawdziwe handlery');
    const handlers = captured as unknown as MailUiHandlers;
    handlers.onSearch('odebrane', { temat: 'Temat; kolejna komenda' });
    await waitRt(
      () => h!.f.sent.length > 0 || notifyText(h!.f, SUBJECT_ERROR),
      'bezposredni handler Listy odpowiedzial',
    );
    assert.deepEqual(h.f.sent, [], 'bezposrednie Listy nie wysylaja blednej komendy');
    assert.ok(notifyText(h.f, SUBJECT_ERROR), 'bezposrednie Listy pokazuja komunikat');

    (h.content.querySelector('[data-tab="usuwanie"]') as unknown as { click(): void }).click();
    handlers.onDeletionSearch?.('odebrane', {
      odDaty: { day: 20, month: 10, year: 2026 },
      doDaty: { day: 10, month: 10, year: 2026 },
    });
    await waitRt(
      () => h!.f.sent.length > 0 || notifyText(h!.f, RANGE_ERROR),
      'bezposredni handler Usuwania odpowiedzial',
    );
    assert.deepEqual(h.f.sent, [], 'bezposrednie Usuwanie nie wysyla blednej komendy');
    assert.ok(notifyText(h.f, RANGE_ERROR), 'bezposrednie Usuwanie pokazuje komunikat');
  } finally {
    renderModule.mountMailUi = originalMount;
    await stopHarness();
  }
});

const archiveLetter = (id: string, sortKey: string): ArchiveLetter => ({
  id,
  box: 'odebrane',
  number: 1,
  party: 'Foo',
  subject: id,
  forwarded: false,
  dateRaw: null,
  sortKey,
  read: true,
  body: [],
});

test('archiwum: bledna data nie zaweza listy po cichu', () => {
  const letters = [
    archiveLetter('Pierwszy', '2026-10-05 10:00:00'),
    archiveLetter('Drugi', '2026-10-22 10:00:00'),
  ];
  for (const filter of [
    { odDaty: '2026-02-30' },
    { doDaty: '01.04.2026' },
    { odDaty: '0000-01-01' },
  ]) {
    assert.equal(filterVisibleArchive(letters, filter).length, 2, JSON.stringify(filter));
  }
});
