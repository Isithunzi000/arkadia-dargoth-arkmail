import { test } from 'node:test';
import assert from 'node:assert/strict';

import { IndexedDbStorageDriver } from '../src/arkmail/adapters/storageDriver';
import { fromMailboxEntry, type ArchiveLetter } from '../src/arkmail/core/archive';
import type { MailboxEntry } from '../src/arkmail/core/session/mailbox';
import {
  click,
  clickText,
  loadTruncatedBox,
  notifyText,
  startHarness,
  stopHarness,
  waitRt,
  type Harness,
} from './harness';

const MESSAGE = 'Najpierw zakoncz reczna sesje poczty w grze, a potem powtorz operacje w ArkMailu.';
const DATE = {
  raw: 'Wt, 24 VIII 1999, 10:00:00',
  weekday: 'Wt',
  day: 24,
  month: 8,
  year: 1999,
  time: '10:00:00',
} as const;
const ENTRY: MailboxEntry = {
  number: 1,
  isRead: true,
  subject: 'List kontrolny',
  forwarded: false,
  party: 'Nadawca',
  partyKind: 'nadawca',
  date: { ...DATE },
};

function archiveRecord(body: string[] = ['Tresc kontrolna.']): ArchiveLetter {
  return { ...fromMailboxEntry('odebrane', ENTRY), body };
}

type OperationCase = {
  label: string;
  archive?: ArchiveLetter[];
  prepare?: (h: Harness) => Promise<void>;
  run: (h: Harness) => void;
};

async function setField(h: Harness, selector: string, value: string): Promise<void> {
  const field = h.content.querySelector(selector) as {
    value: string;
    dispatchEvent(event: unknown): void;
  } | null;
  assert.ok(field, `pole ${selector} istnieje`);
  field.value = value;
  field.dispatchEvent(new h.window.Event('input'));
}

async function contactsSub(h: Harness, label: string): Promise<void> {
  click(h, '[data-tab="kontakty"]');
  clickText(h, '.arkmail-subpill', label);
}

async function openCachedArchive(h: Harness): Promise<void> {
  click(h, '[data-tab="archiwum"]');
  await h.waitFor(() => !!h.content.querySelector('.arkmail-arch-entry'), 'wiersz archiwum');
  click(h, '.arkmail-arch-entry');
  await h.waitFor(() => !!h.content.querySelector('.arkmail-letter-meta'), 'podglad z archiwum');
}

function replayFreshListing(h: Harness): void {
  h.f.fire('Listy odebrane (prezentowane jest pierwsze 50):', 'mail');
  h.f.fire(' 1. *R* Temat: najnowszy', 'mail');
  h.f.fire('Nadawca: Corge                       Wt, 24 VIII 1999, 00:11:12', 'mail');
  h.f.fire('> ', 'prompt');
}

function replayLetter(h: Harness): void {
  h.f.fire('List : 1', 'mail');
  h.f.fire('Od   : Corge', 'mail');
  h.f.fire('Temat: najnowszy', 'mail');
  h.f.fire('Data : Wt, 24 VIII 1999, 00:11:12', 'mail');
  h.f.fire('', 'mail');
  h.f.fire('Tresc kontrolna.', 'mail');
  h.f.fire('[1-50 adefFhHmnqrsRux.!?-+<>] (aktualny: 1) -- ', 'mail');
  h.f.fire('> ', 'prompt');
}

async function openLetterFromList(h: Harness): Promise<void> {
  await loadTruncatedBox(h);
  click(h, '.arkmail-entry');
  await h.waitFor(
    () => h.f.sent.includes('listy odebrane przed 25 VIII 1999'),
    're-kotwica przed odczytem',
  );
  replayFreshListing(h);
  await h.waitFor(() => h.f.sent.includes('przeczytaj list 1'), 'komenda odczytu');
  replayLetter(h);
  await h.waitFor(() => !!h.content.querySelector('.arkmail-del'), 'otwarty list');
}

async function prepareDeletionDelete(h: Harness): Promise<void> {
  click(h, '[data-tab="usuwanie"]');
  click(h, '.arkmail-deletion-search');
  await h.waitFor(() => h.f.sent.includes('listy odebrane'), 'listing do usuwania');
  h.f.fire('Listy odebrane:', 'mail');
  h.f.fire(' 1. *R* Temat: List kontrolny', 'mail');
  h.f.fire('Nadawca: Nadawca                    Wt, 24 VIII 1999, 10:00:00', 'mail');
  h.f.fire('> ', 'prompt');
  await h.waitFor(() => {
    const button = h.content.querySelector('.arkmail-deletion-select-all') as { disabled: boolean } | null;
    return button?.disabled === false;
  }, 'wyniki do zaznaczenia');
  click(h, '.arkmail-deletion-select-all');
}

const CASES: OperationCase[] = [
  {
    label: 'odswiezenie skrzynki',
    run: (h) => click(h, '[data-box="odebrane"]'),
  },
  {
    label: 'wczytanie starszych',
    prepare: loadTruncatedBox,
    run: (h) => click(h, '.arkmail-older'),
  },
  {
    label: 'wczytanie wszystkich',
    prepare: loadTruncatedBox,
    run: (h) => click(h, '.arkmail-older-all'),
  },
  {
    label: 'wyszukiwanie',
    run: (h) => {
      const input = h.content.querySelector('.arkmail-search-row input') as { value: string };
      input.value = 'Nadawcy';
      click(h, '.arkmail-search-go');
    },
  },
  {
    label: 'odczyt listu',
    prepare: loadTruncatedBox,
    run: (h) => click(h, '.arkmail-entry'),
  },
  {
    label: 'kasowanie listu',
    prepare: openLetterFromList,
    run: (h) => {
      click(h, '.arkmail-del');
      click(h, '.arkmail-del');
    },
  },
  {
    label: 'przekazanie listu',
    prepare: openLetterFromList,
    run: (h) => {
      const input = h.content.querySelector('[data-field="forward"]') as { value: string };
      input.value = 'Odbiorca';
      click(h, '.arkmail-fwd');
    },
  },
  {
    label: 'compose',
    prepare: async (h) => {
      click(h, '[data-tab="napisz"]');
      await setField(h, '[data-field="adresat"]', 'Odbiorca');
      await setField(h, '[data-field="temat"]', 'Temat');
      await setField(h, '[data-field="tresc"]', 'Tresc');
    },
    run: (h) => click(h, '.arkmail-send'),
  },
  {
    label: 'import zapamietanych',
    prepare: (h) => contactsSub(h, 'Import i eksport'),
    run: (h) => click(h, '[data-import="zapamietani"]'),
  },
  {
    label: 'import przedstawionych',
    prepare: (h) => contactsSub(h, 'Import i eksport'),
    run: (h) => click(h, '[data-import="przedstawieni"]'),
  },
  {
    label: 'import aliasow',
    prepare: (h) => contactsSub(h, 'Aliasy pocztowe'),
    run: (h) => click(h, '[data-import="aliasy"]'),
  },
  {
    label: 'indeksowanie',
    prepare: async (h) => click(h, '[data-tab="archiwum"]'),
    run: (h) => click(h, '.arkmail-index-all'),
  },
  {
    label: 'pobieranie tresci do archiwum',
    archive: [archiveRecord([])],
    prepare: async (h) => click(h, '[data-tab="archiwum"]'),
    run: (h) => {
      click(h, '.arkmail-arch-download');
      click(h, '.arkmail-arch-download');
    },
  },
  {
    label: 'odczyt brakujacej tresci z archiwum',
    archive: [archiveRecord([])],
    prepare: async (h) => click(h, '[data-tab="archiwum"]'),
    run: (h) => click(h, '.arkmail-arch-entry'),
  },
  {
    label: 'reply-all z niekompletnego archiwum',
    archive: [archiveRecord()],
    prepare: openCachedArchive,
    run: (h) => {
      click(h, '.arkmail-reply-all');
      click(h, '.arkmail-reply-all-continue');
    },
  },
  {
    label: 'wyszukiwanie do zbiorczego usuniecia',
    prepare: async (h) => click(h, '[data-tab="usuwanie"]'),
    run: (h) => click(h, '.arkmail-deletion-search'),
  },
  {
    label: 'zbiorcze usuniecie',
    prepare: prepareDeletionDelete,
    run: (h) => {
      click(h, '.arkmail-deletion-delete');
      click(h, '.arkmail-deletion-delete');
    },
  },
  {
    label: 'wysylka zwierzecia',
    run: (h) => click(h, '.arkmail-animal-send'),
  },
];

async function archiveSnapshot(): Promise<string> {
  const driver = new IndexedDbStorageDriver(globalThis.indexedDB);
  const all = await driver.loadAllLetters();
  await driver.close();
  return JSON.stringify(all);
}

async function settledArchiveSnapshot(): Promise<string> {
  let previous = await archiveSnapshot();
  for (let attempt = 0; attempt < 30; attempt++) {
    await new Promise((resolve) => setImmediate(resolve));
    const current = await archiveSnapshot();
    if (current === previous) return current;
    previous = current;
  }
  assert.fail('zapis archiwum nie osiagnal stanu ustalonego');
}

test('reczna poczta blokuje kazda publiczna operacje serwerowa UI', async (context) => {
  for (const item of CASES) {
    await context.test(item.label, async () => {
      const h = await startHarness({ archive: item.archive });
      try {
        await item.prepare?.(h);
        // Listing w prologu zapisuje archiwum przez kolejke write-through.
        // Odczekaj jej zakonczenie przed zrobieniem punktu odniesienia.
        await new Promise((resolve) => setTimeout(resolve, 60));
        const before = await archiveSnapshot();
        h.f.fire('→ listy');
        h.f.sent.length = 0;
        h.f.shown.length = 0;

        item.run(h);
        await new Promise((resolve) => setTimeout(resolve, 40));

        assert.equal(h.f.sent.length, 0, 'zero komend pluginu');
        assert.equal(
          h.f.shown.filter((entry) => String((entry as { text?: string }).text ?? '').includes(MESSAGE)).length,
          1,
          'jeden komunikat z instrukcja',
        );
        assert.equal(await settledArchiveSnapshot(), before, 'archiwum pozostaje bez zmian');
      } finally {
        await stopHarness();
      }
    });
  }
});

test('reczna poczta nie blokuje lokalnego czyszczenia danych', async () => {
  const h = await startHarness({ archive: [archiveRecord()] });
  try {
    await new Promise((resolve) => setTimeout(resolve, 60));
    h.f.fire('→ listy');
    h.f.sent.length = 0;
    h.f.shown.length = 0;

    click(h, '.arkmail-cache-clear');
    click(h, '.arkmail-cache-clear');
    await waitRt(
      () => notifyText(h.f, 'Zapisane dane wyczyszczone'),
      'lokalne czyszczenie podczas recznej poczty',
    );

    assert.equal(h.f.sent.length, 0, 'zero komend pluginu');
    assert.ok(!notifyText(h.f, MESSAGE), 'brak komunikatu blokady operacji serwerowej');
    const stored = JSON.parse(await settledArchiveSnapshot()) as Record<string, unknown>;
    assert.deepEqual(stored.foo ?? {}, {}, 'archiwum zostaje trwale wyczyszczone');
  } finally {
    await stopHarness();
  }
});

test('operacje automatyczne parkuja bez komunikatu, a wyjscie robi jedno zbiorcze odswiezenie', async () => {
  const h = await startHarness({ notifyEnabled: false });
  const { f } = h;
  try {
    f.fire('→ listy');
    f.shown.length = 0;
    f.fire(' [ POCZTA ] Masz nowa poczte od Foo.', 'mail');
    await new Promise((resolve) => setTimeout(resolve, 40));
    assert.equal(f.sent.length, 0, 'automat nie wysyla komend');
    assert.equal(f.shown.length, 0, 'automat nie pokazuje komunikatu blokady');

    f.fire('→ q');
    f.fire('> ', 'prompt');
    for (const [box, genitive] of [
      ['odebrane', 'odebranych'],
      ['nieprzeczytane', 'nieprzeczytanych'],
    ] as const) {
      await h.waitFor(() => f.sent.includes(`listy ${box}`), `zbiorcze odswiezenie: ${box}`);
      f.fire(`Nie masz zadnych ${genitive} listow.`, 'mail');
    }
    await h.waitFor(() => {
      const busy = h.content.querySelector('.arkmail-busy') as { textContent?: string | null } | null;
      return (busy?.textContent ?? 'missing') === '';
    }, 'koniec zbiorczego odswiezenia');
    assert.equal(f.sent.filter((command) => command === 'listy odebrane').length, 1);
    assert.equal(f.sent.filter((command) => command === 'listy nieprzeczytane').length, 1);
    assert.equal(f.shown.length, 0, 'wyjscie nie doklada komunikatow blokady');
  } finally {
    await stopHarness();
  }
});
