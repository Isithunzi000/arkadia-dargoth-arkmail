import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  fromMailboxEntry,
  recordId,
  scanKeyOfEntries,
  type ArchiveLetter,
} from '../src/arkmail/core/archive';
import type { MailboxEntry } from '../src/arkmail/core/session/mailbox';
import { IndexedDbStorageDriver } from '../src/arkmail/adapters/storageDriver';
import {
  click,
  notifyText,
  startHarness,
  stopHarness,
  waitRt,
  type Harness,
} from './harness';

const DATE_RAW = 'Wt, 24 VIII 1999, 10:00:00';
const BODY = 'Historyczna syntetyczna tresc.';
const WRITE_ERROR = 'Nie udalo sie zapisac pobranej tresci w IndexedDB.';
const DATE = {
  raw: DATE_RAW,
  weekday: 'Wt',
  day: 24,
  month: 8,
  year: 1999,
  time: '10:00:00',
} as const;

const PAGE: MailboxEntry[] = [
  {
    number: 3,
    isRead: true,
    subject: 'Syntetyczny temat',
    forwarded: false,
    party: 'Listing nadawcy',
    partyKind: 'nadawca',
    date: { ...DATE },
  },
  {
    number: 2,
    isRead: true,
    subject: 'Syntetyczny temat',
    forwarded: false,
    party: 'Listing nadawcy',
    partyKind: 'nadawca',
    date: { ...DATE },
  },
];
const SCAN_KEY = scanKeyOfEntries(PAGE);
const TARGET_ID = recordId('odebrane', SCAN_KEY, 0);
const TWIN_ID = recordId('odebrane', SCAN_KEY, 1);

function record(over: Partial<ArchiveLetter> = {}): ArchiveLetter {
  return {
    ...fromMailboxEntry('odebrane', PAGE[0]!),
    id: TARGET_ID,
    body: [BODY],
    ...over,
  };
}

function twin(): ArchiveLetter {
  return {
    ...fromMailboxEntry('odebrane', PAGE[1]!),
    id: TWIN_ID,
    body: ['Tresc blizniaka.'],
  };
}

function replica(): ArchiveLetter {
  return {
    ...record({
      id: 'replika-innej-skrzynki',
      box: 'wyslane',
      number: 1,
      party: 'Listing odbiorcow',
      body: ['Tresc repliki.'],
    }),
  };
}

type Field = { value: string; dispatchEvent(event: unknown): void };

function field(h: Harness, name: string): Field {
  const element = h.content.querySelector(`[data-field="${name}"]`) as Field | null;
  assert.ok(element, `pole ${name} istnieje`);
  return element;
}

function setField(h: Harness, name: string, value: string): void {
  const element = field(h, name);
  element.value = value;
  element.dispatchEvent(new h.window.Event('input'));
}

function seedDraft(h: Harness): void {
  click(h, '[data-tab="napisz"]');
  setField(h, 'adresat', 'Reczny adresat');
  setField(h, 'temat', 'Reczny temat');
  setField(h, 'dw', 'Reczne DW');
  setField(h, 'tresc', 'Reczna tresc');
}

function assertDraftUnchanged(h: Harness): void {
  click(h, '[data-tab="napisz"]');
  assert.equal(field(h, 'adresat').value, 'Reczny adresat');
  assert.equal(field(h, 'temat').value, 'Reczny temat');
  assert.equal(field(h, 'dw').value, 'Reczne DW');
  assert.equal(field(h, 'tresc').value, 'Reczna tresc');
}

async function openCached(h: Harness, rowIndex = 0): Promise<void> {
  click(h, '[data-tab="archiwum"]');
  const rows = h.content.querySelectorAll('.arkmail-arch-entry') as unknown as Array<{
    dispatchEvent(event: unknown): void;
  }>;
  assert.ok(rows[rowIndex], `wiersz Archiwum ${rowIndex} istnieje`);
  rows[rowIndex].dispatchEvent(new h.window.Event('click'));
  await waitRt(() => !!h.content.querySelector('.arkmail-letter-meta'), 'podglad z cache');
}

function replyAll(h: Harness, scope: 'all' | 'to' | 'cc' = 'all', quote = false): void {
  click(h, '.arkmail-reply-all');
  const scopeInput = h.content.querySelector(`[data-reply-scope="${scope}"]`) as
    | { checked: boolean; dispatchEvent(event: unknown): void }
    | null;
  assert.ok(scopeInput, `zakres ${scope} w panelu Archiwum`);
  scopeInput.checked = true;
  scopeInput.dispatchEvent(new h.window.Event('change'));
  const quoteInput = h.content.querySelector('.arkmail-reply-all-quote') as
    | { checked: boolean; dispatchEvent(event: unknown): void }
    | null;
  assert.ok(quoteInput, 'checkbox cytowania w panelu Archiwum');
  quoteInput.checked = quote;
  quoteInput.dispatchEvent(new h.window.Event('change'));
  click(h, '.arkmail-reply-all-continue');
}

async function beginReplyAllAnchor(h: Harness): Promise<void> {
  replyAll(h);
  await waitRt(
    () => h.f.sent.some((command) => command.startsWith('listy odebrane przed')),
    'jedyna re-kotwica reply-all',
  );
}

function replayListing(h: Harness): void {
  h.f.fire('Listy odebrane:', 'mail');
  for (const entry of PAGE) {
    h.f.fire(` ${entry.number}. *R* Temat: ${entry.subject}`, 'mail');
    h.f.fire(`Nadawca: Listing nadawcy                ${DATE_RAW}`, 'mail');
  }
  h.f.fire('> ', 'prompt');
}

function replayLetter(h: Harness, number = 3): void {
  h.f.fire(`List : ${number}`, 'mail');
  h.f.fire('Od   : Nadawca', 'mail');
  h.f.fire('Do   : Foo, Pierwszy', 'mail');
  h.f.fire('DW   : Trzeci', 'mail');
  h.f.fire('Temat: Syntetyczny temat', 'mail');
  h.f.fire(`Data : ${DATE_RAW}`, 'mail');
  h.f.fire('', 'mail');
  h.f.fire('Odzyskana syntetyczna tresc.', 'mail');
  h.f.fire(`[1-50 adefFhHmnqrsRux.!?-+<>] (aktualny: ${number}) -- `, 'mail');
  h.f.fire('> ', 'prompt');
}

async function readBack(): Promise<Record<string, ArchiveLetter>> {
  const driver = new IndexedDbStorageDriver(globalThis.indexedDB);
  const all = await driver.loadAllLetters();
  await driver.close();
  return Object.fromEntries(
    Object.entries(all.foo ?? {}).map(([id, raw]) => [id, JSON.parse(raw) as ArchiveLetter]),
  );
}

async function ticks(count = 12): Promise<void> {
  for (let i = 0; i < count; i++) await new Promise((resolve) => setImmediate(resolve));
}

async function contentWithStore(h: Harness): Promise<Harness['content']> {
  for (let i = 0; i < 200; i++) {
    const content = await h.f.popupConfig!.createContent() as Harness['content'];
    if (content.querySelector('[data-tab="archiwum"]')) return content;
    await new Promise((resolve) => setImmediate(resolve));
  }
  assert.fail('Brak gotowego widoku nowej postaci.');
}

test('reply-all: rekord z kompletem pozostaje lokalny i nie uruchamia odzyskiwania', async () => {
  const h = await startHarness({
    archive: [record({ headers: { from: 'Nadawca', to: 'Foo, Pierwszy', cc: 'Trzeci' } })],
  });
  try {
    await openCached(h);
    replyAll(h);
    assert.equal(field(h, 'adresat').value, 'Nadawca, Pierwszy');
    assert.equal(field(h, 'dw').value, 'Trzeci');
    assert.deepEqual(h.f.sent, [], 'pelny rekord nie wymaga komend');
  } finally {
    await stopHarness();
  }
});

test('reply-all: jeden odczyt zapisuje komplet przed prefillem, a kolejne otwarcie jest lokalne', async () => {
  const h = await startHarness({ archive: [record()] });
  try {
    seedDraft(h);
    await openCached(h);
    await beginReplyAllAnchor(h);
    assert.equal(h.content.querySelector('[data-field="adresat"]'), null, 'prefill czeka na odczyt');
    replayListing(h);
    await waitRt(() => h.f.sent.includes('przeczytaj list 3'), 'jedyny odczyt pagera');
    assert.equal(h.content.querySelector('[data-field="adresat"]'), null, 'prefill czeka na zaakceptowana odpowiedz');
    replayLetter(h);
    await waitRt(() => {
      const element = h.content.querySelector('[data-field="adresat"]') as Field | null;
      return element?.value === 'Nadawca, Pierwszy';
    }, 'pelny prefill dopiero po trwalym zapisie');
    assert.equal(field(h, 'dw').value, 'Trzeci');
    assert.equal(field(h, 'temat').value, '');
    assert.equal(field(h, 'tresc').value, '');
    assert.equal(h.f.sent.filter((command) => command === 'przeczytaj list 3').length, 1);
    assert.equal(h.f.sent.filter((command) => command.startsWith('listy odebrane przed')).length, 1);
    const saved = await readBack();
    assert.deepEqual(saved[TARGET_ID]?.headers, {
      from: 'Nadawca',
      to: 'Foo, Pierwszy',
      cc: 'Trzeci',
    });

    await openCached(h);
    const commands = h.f.sent.length;
    replyAll(h);
    assert.equal(field(h, 'adresat').value, 'Nadawca, Pierwszy');
    assert.equal(field(h, 'dw').value, 'Trzeci');
    assert.equal(h.f.sent.length, commands, 'kolejne otwarcie i klik nie wymagaja komend');
  } finally {
    await stopHarness();
  }
});

test('reply-all: blad numeru nie ponawia odczytu i nie nadpisuje recznego draftu', async () => {
  const h = await startHarness({ archive: [record()] });
  try {
    seedDraft(h);
    await openCached(h);
    await beginReplyAllAnchor(h);
    replayListing(h);
    await waitRt(() => h.f.sent.includes('przeczytaj list 3'), 'odczyt przed bledem');
    h.f.fire('Zly numer listu: 3.', 'mail');
    h.f.fire('> ', 'prompt');
    await waitRt(() => notifyText(h.f, 'Nie mozna odzyskac pelnych naglowkow'), 'konkretny blad');
    await ticks();
    assert.equal(h.f.sent.filter((command) => command === 'przeczytaj list 3').length, 1);
    assert.equal(h.f.sent.filter((command) => command.startsWith('listy odebrane przed')).length, 1);
    assertDraftUnchanged(h);
    assert.ok(!h.f.sent.some((command) => command.startsWith('wyslij')), 'zero wysylki');
  } finally {
    await stopHarness();
  }
});

test('reply-all: brak poprawnej daty oznacza zero komend i compose bez zmian', async () => {
  const h = await startHarness({ archive: [record({ dateRaw: null, sortKey: '' })] });
  try {
    seedDraft(h);
    await openCached(h);
    replyAll(h);
    assert.ok(notifyText(h.f, 'bez poprawnej daty listu'));
    assert.deepEqual(h.f.sent, [], 'brak daty nie powoduje slepej kotwicy');
    assertDraftUnchanged(h);
  } finally {
    await stopHarness();
  }
});

test('reply-all: brak listu na serwerze nie kasuje tresci ani nie tworzy prefillu', async () => {
  const h = await startHarness({ archive: [record()] });
  try {
    seedDraft(h);
    await openCached(h);
    await beginReplyAllAnchor(h);
    h.f.fire('Nie masz zadnych odebranych listow.', 'mail');
    h.f.fire('> ', 'prompt');
    await waitRt(() => notifyText(h.f, 'Listu nie ma w skrzynce'), 'koniec bez listu');
    assertDraftUnchanged(h);
    const saved = await readBack();
    assert.deepEqual(saved[TARGET_ID]?.body, [BODY], 'historyczna tresc zostaje');
    assert.equal(saved[TARGET_ID]?.headers, undefined, 'brak zgadnietego kompletu');
  } finally {
    await stopHarness();
  }
});

test('reply-all: reconnect odrzuca pozny wynik i pozostawia compose bez zmian', async () => {
  const h = await startHarness({ archive: [record()] });
  try {
    seedDraft(h);
    await openCached(h);
    await beginReplyAllAnchor(h);
    replayListing(h);
    await waitRt(() => h.f.sent.includes('przeczytaj list 3'), 'odczyt przed reconnectem');
    h.f.fireEvent('client.disconnect', undefined);
    h.f.fireEvent('client.connect', undefined);
    replayLetter(h);
    await ticks();
    assert.equal(h.content.querySelector('[data-field="adresat"]'), null, 'pozny wynik nie otwiera compose');
    assertDraftUnchanged(h);
    assert.equal(h.f.sent.filter((command) => command === 'przeczytaj list 3').length, 1);
  } finally {
    await stopHarness();
  }
});

test('reply-all: zmiana postaci odrzuca wynik i nie przenosi prefillu', async () => {
  const h = await startHarness({ archive: [record()] });
  try {
    seedDraft(h);
    await openCached(h);
    await beginReplyAllAnchor(h);
    replayListing(h);
    await waitRt(() => h.f.sent.includes('przeczytaj list 3'), 'odczyt przed zmiana postaci');
    assert.equal(h.content.querySelector('[data-field="adresat"]'), null);
    h.f.setCharacter('Bar');
    await ticks(24);
    replayLetter(h);
    await ticks();
    const fresh = await contentWithStore(h);
    const tab = fresh.querySelector('[data-tab="napisz"]') as { dispatchEvent(event: unknown): void } | null;
    assert.ok(tab, 'nowa postac ma wlasny interfejs');
    tab.dispatchEvent(new h.window.Event('click'));
    const adresat = fresh.querySelector('[data-field="adresat"]') as Field | null;
    const temat = fresh.querySelector('[data-field="temat"]') as Field | null;
    assert.equal(adresat?.value ?? '', '');
    assert.equal(temat?.value ?? '', '');
  } finally {
    await stopHarness();
  }
});

test('reply-all: blizniak i replika nie zyskuja naglowkow cudzego archiveId', async () => {
  const otherTwin = twin();
  const otherReplica = replica();
  const h = await startHarness({ archive: [record(), otherTwin, otherReplica] });
  try {
    await openCached(h, 0);
    await beginReplyAllAnchor(h);
    replayListing(h);
    await waitRt(() => h.f.sent.includes('przeczytaj list 3'), 'odczyt wlasciwego blizniaka');
    replayLetter(h);
    await waitRt(() => {
      const element = h.content.querySelector('[data-field="adresat"]') as Field | null;
      return element?.value === 'Nadawca, Pierwszy';
    }, 'prefill wlasciwego rekordu');
    const saved = await readBack();
    assert.deepEqual(saved[TARGET_ID]?.headers, {
      from: 'Nadawca',
      to: 'Foo, Pierwszy',
      cc: 'Trzeci',
    });
    assert.equal(saved[TWIN_ID]?.headers, undefined);
    assert.deepEqual(saved[TWIN_ID]?.body, ['Tresc blizniaka.']);
    assert.equal(saved[otherReplica.id]?.headers, undefined);
    assert.deepEqual(saved[otherReplica.id]?.body, ['Tresc repliki.']);
  } finally {
    await stopHarness();
  }
});

test('reply-all: blad trwalego zapisu nie daje prefillu ani trwalego kompletu', async () => {
  const h = await startHarness({ archive: [record()] });
  const original = IndexedDbStorageDriver.prototype.putLetters;
  IndexedDbStorageDriver.prototype.putLetters = async () => {
    throw new Error('Syntetyczny blad zapisu.');
  };
  try {
    seedDraft(h);
    await openCached(h);
    await beginReplyAllAnchor(h);
    replayListing(h);
    await waitRt(() => h.f.sent.includes('przeczytaj list 3'), 'odczyt przed bledem zapisu');
    replayLetter(h);
    await waitRt(() => notifyText(h.f, WRITE_ERROR), 'konkretny blad zapisu');
    await ticks();
    assertDraftUnchanged(h);
    const saved = await readBack();
    assert.equal(saved[TARGET_ID]?.headers, undefined);
    assert.deepEqual(saved[TARGET_ID]?.body, [BODY]);
    assert.equal(h.f.sent.filter((command) => command === 'przeczytaj list 3').length, 1);
  } finally {
    IndexedDbStorageDriver.prototype.putLetters = original;
    await stopHarness();
  }
});

test('reply-all: odzyskane naglowki respektuja Tylko DW, a cytat pochodzi z tego samego otwartego rekordu', async () => {
  const h = await startHarness({ archive: [record()] });
  try {
    await openCached(h);
    replyAll(h, 'cc', true);
    await waitRt(
      () => h.f.sent.some((command) => command.startsWith('listy odebrane przed')),
      'odzyskiwanie po wyborze Tylko DW',
    );
    replayListing(h);
    await waitRt(() => h.f.sent.includes('przeczytaj list 3'), 'odczyt dla Tylko DW');
    replayLetter(h);
    await waitRt(() => {
      const element = h.content.querySelector('[data-field="adresat"]') as Field | null;
      return element?.value === 'Trzeci';
    }, 'oryginalne DW jako Adresat');
    assert.equal(field(h, 'dw').value, '');
    assert.equal(field(h, 'temat').value, 'Odp: Syntetyczny temat');
    assert.equal(field(h, 'tresc').value, `\n\n---\n${BODY}\n---`);
    assert.equal(h.f.sent.filter((command) => command === 'przeczytaj list 3').length, 1);
    assert.ok(!h.f.sent.some((command) => command === 'napisz list'), 'prefill nie wysyla listu');
  } finally {
    await stopHarness();
  }
});

test('reply-all: pelne naglowki Archiwum zachowuja w Tylko DW takze nadawce i odbiorcow DO', async () => {
  const h = await startHarness({
    archive: [record({
      headers: {
        from: 'Nadawca',
        to: 'Foo, Pierwszy',
        cc: 'Nadawca, Pierwszy, Trzeci',
      },
    })],
  });
  try {
    await openCached(h);
    replyAll(h, 'cc', false);
    await waitRt(() => !!h.content.querySelector('[data-field="adresat"]'), 'prefill z Archiwum');
    assert.equal(field(h, 'adresat').value, 'Nadawca, Pierwszy, Trzeci');
    assert.equal(field(h, 'dw').value, '');
    assert.equal(field(h, 'tresc').value, '');
    assert.ok(!h.f.sent.some((command) => command === 'napisz list'), 'prefill nie wysyla listu');
  } finally {
    await stopHarness();
  }
});

test('reply-all: zamkniecie listu odrzuca pozny wynik i chroni reczny draft', async () => {
  const h = await startHarness({ archive: [record()] });
  try {
    seedDraft(h);
    await openCached(h);
    await beginReplyAllAnchor(h);
    replayListing(h);
    await waitRt(() => h.f.sent.includes('przeczytaj list 3'), 'odczyt przed zamknieciem listu');
    const close = h.content.querySelector('.arkmail-letter-close, button.arkmail-older') as
      | { dispatchEvent(event: unknown): void }
      | null;
    assert.ok(close, 'Zamknij list jest dostepne');
    close.dispatchEvent(new h.window.Event('click'));
    replayLetter(h);
    await ticks();
    assert.equal(h.content.querySelector('[data-field="adresat"]'), null, 'pozny wynik nie otwiera compose');
    assertDraftUnchanged(h);
  } finally {
    await stopHarness();
  }
});

test('reply-all: Archiwum pokazuje konkretny komunikat dla kazdego zakresu i przyczyny', async () => {
  const cases: Array<{
    scope: 'all' | 'to' | 'cc';
    headers: { from: string; to: string; cc: string | null };
    message: string;
  }> = [
    {
      scope: 'all',
      headers: { from: 'Foo', to: 'foo', cc: 'FOO' },
      message: 'Nie mozna przygotowac odpowiedzi wszystkim, poniewaz Twoja postac jest jedynym adresem odpowiedzi i zostaje pominieta.',
    },
    {
      scope: 'all',
      headers: { from: '', to: '', cc: null },
      message: 'Nie mozna przygotowac odpowiedzi wszystkim, poniewaz list nie zawiera adresatow odpowiedzi.',
    },
    {
      scope: 'to',
      headers: { from: 'Foo', to: 'foo', cc: 'Bar' },
      message: 'Nie mozna przygotowac odpowiedzi w zakresie Tylko DO, poniewaz Twoja postac jest jedyna osoba w tym zakresie i zostaje pominieta.',
    },
    {
      scope: 'to',
      headers: { from: '', to: '', cc: 'Bar' },
      message: 'Nie mozna przygotowac odpowiedzi w zakresie Tylko DO, poniewaz ten zakres nie zawiera adresatow.',
    },
    {
      scope: 'cc',
      headers: { from: 'Nadawca', to: 'Bar', cc: 'foo i FOO' },
      message: 'Nie mozna przygotowac odpowiedzi tylko do DW, poniewaz Twoja postac jest jedynym odbiorca DW i zostaje pominieta.',
    },
    {
      scope: 'cc',
      headers: { from: 'Nadawca', to: 'Bar', cc: null },
      message: 'List nie ma odbiorcow DW, wiec nie mozna przygotowac odpowiedzi tylko do DW.',
    },
  ];
  for (const value of cases) {
    const h = await startHarness({ archive: [record({ headers: value.headers })] });
    try {
      await openCached(h);
      replyAll(h, value.scope);
      await waitRt(() => notifyText(h.f, value.message), `${value.scope}: konkretny komunikat`);
      assert.deepEqual(h.f.sent, [], 'pusty wynik nie wysyla komend');
    } finally {
      await stopHarness();
    }
  }
});
