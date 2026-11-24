import { test } from 'node:test';
import assert from 'node:assert/strict';

import { ImportSession } from '../src/arkmail/core/session/importer';
import { PagerSession } from '../src/arkmail/core/session/pager';
import {
  mountMailUi,
  type MailUiHandlers,
} from '../src/arkmail/ui/render';
import type { MailUiStore } from '../src/arkmail/ui/store';
import {
  click,
  loadTruncatedBox,
  notifyText,
  startHarness,
  stopHarness,
  textOf,
  waitRt,
  type Harness,
} from './harness';

const TIMEOUT_MESSAGE = 'Serwer nie odpowiedzial na czas. Sprobuj ponownie.';
const PLAYER_MAIL_INTERRUPTED =
  'Reczna poczta w grze przerwala poprzednia operacje ArkMaila. Zakoncz reczna poczte i wykonaj operacje ponownie.';

type Notice = { text?: string; level?: string };

function noticeCount(h: Harness, text: string): number {
  return h.f.shown.filter((entry) => (entry as Notice).text === text).length;
}

async function waitLong(predicate: () => boolean, label: string): Promise<void> {
  for (let attempt = 0; attempt < 600; attempt++) {
    if (predicate()) return;
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  assert.fail(`przekroczono oczekiwanie: ${label}`);
}

async function startCaptured(autoRefreshEnabled = false): Promise<{
  h: Harness;
  handlers: MailUiHandlers;
  store: MailUiStore;
  restore: () => Promise<void>;
}> {
  const renderModule = require('../src/arkmail/ui/render') as {
    mountMailUi: typeof mountMailUi;
  };
  const originalMount = renderModule.mountMailUi;
  let handlers: MailUiHandlers | undefined;
  let store: MailUiStore | undefined;
  renderModule.mountMailUi = (container, currentStore, currentHandlers) => {
    handlers = currentHandlers;
    store = currentStore;
    return originalMount(container, currentStore, currentHandlers);
  };
  const h = await startHarness({ autoRefreshEnabled });
  assert.ok(handlers && store, 'przechwycono prawdziwe handlery i store');
  return {
    h,
    handlers: handlers!,
    store: store!,
    restore: async () => {
      renderModule.mountMailUi = originalMount;
      await stopHarness();
    },
  };
}

test('reczna poczta gracza: przerwanie recznej operacji ma jeden komunikat i nie wysyla q', async () => {
  const h = await startHarness({ autoRefreshEnabled: false });
  try {
    click(h, '.arkmail-search-go');
    await waitRt(() => h.f.sent.includes('listy odebrane'), 'reczny listing przed poczta gracza');
    h.f.fire('→ listy');
    await waitRt(() => textOf(h, '.arkmail-busy') === '', 'koniec przerwanej operacji');
    await new Promise((resolve) => setTimeout(resolve, 50));
    assert.equal(noticeCount(h, PLAYER_MAIL_INTERRUPTED), 1, 'jeden komunikat przerwania');
    assert.ok(!h.f.sent.includes('q'), 'plugin nie wysyla q do poczty gracza');
    assert.ok(!h.f.sent.includes('~q'), 'plugin nie wysyla ~q');

    h.f.fire('→ q');
    h.f.fire('> ', 'prompt');
    click(h, '.arkmail-search-go');
    await waitRt(
      () => h.f.sent.filter((command) => command === 'listy odebrane').length >= 2,
      'reczne ponowienie po zakonczeniu poczty gracza',
    );
    h.f.fire('Nie masz zadnych odebranych listow.', 'mail');
    await waitRt(() => textOf(h, '.arkmail-busy') === '', 'koniec odswiezenia po powrocie');
  } finally {
    await stopHarness();
  }
});

test('automatyczny listing przerwany rozlaczeniem pozostaje cichy', async () => {
  const h = await startHarness();
  try {
    h.f.fire(' [ POCZTA ] Masz nowa poczte od Foo.');
    await waitRt(() => h.f.sent.includes('listy odebrane'), 'automatyczny listing');
    h.f.fireEvent('client.disconnect', undefined);
    await waitRt(() => textOf(h, '.arkmail-busy') === '', 'koniec automatycznej operacji');
    assert.ok(!notifyText(h.f, 'Polaczenie zostalo przerwane.'), 'brak komunikatu dla automatu');
    assert.ok(!notifyText(h.f, 'Blad odswiezania'), 'anulowanie nie jest awaria');
    assert.ok(!h.f.sent.includes('q'));
    assert.ok(!h.f.sent.includes('~q'));
  } finally {
    await stopHarness();
  }
});

test('limit czasu: kolejne klikniecie od razu wykonuje nowa operacje', async () => {
  const h = await startHarness({ autoRefreshEnabled: false });
  try {
    click(h, '.arkmail-search-go');
    await waitRt(() => h.f.sent.includes('listy odebrane'), 'pierwszy reczny listing');
    await waitLong(
      () => notifyText(h.f, 'Serwer nie odpowiedzial na czas'),
      'pierwszy komunikat limitu czasu',
    );
    assert.equal(h.f.sent.filter((command) => command === 'listy odebrane').length, 1);

    click(h, '.arkmail-search-go');
    await waitRt(
      () => h.f.sent.filter((command) => command === 'listy odebrane').length === 2,
      'ponowienie bez oczekiwania na prompt',
    );
    assert.ok(!notifyText(h.f, 'czeka na potwierdzenie zakonczenia'));
    h.f.fire('Nie masz zadnych odebranych listow.', 'mail');
    await waitRt(() => textOf(h, '.arkmail-busy') === '', 'koniec ponowionego listingu');
    assert.ok(!h.f.sent.includes('q'));
    assert.ok(!h.f.sent.includes('~q'));
  } finally {
    await stopHarness();
  }
});

test('import osob: limit czasu ma wspolny komunikat', async () => {
  const original = ImportSession.prototype.fetchPeople;
  ImportSession.prototype.fetchPeople = async () => {
    throw new Error('import zapamietani: timeout');
  };
  const { h, handlers, restore } = await startCaptured();
  try {
    handlers.onImportPeople?.('zapamietani');
    await waitRt(() => noticeCount(h, TIMEOUT_MESSAGE) === 1, 'komunikat limitu importu osob');
    assert.ok(!notifyText(h.f, 'Nie udalo sie zaimportowac osob z gry.'), 'brak ogolnego bledu');
  } finally {
    ImportSession.prototype.fetchPeople = original;
    await restore();
  }
});

test('import aliasow: limit czasu ma wspolny komunikat', async () => {
  const original = ImportSession.prototype.fetchAliases;
  ImportSession.prototype.fetchAliases = async () => {
    throw new Error('import aliasy pocztowe: timeout');
  };
  const { h, handlers, restore } = await startCaptured();
  try {
    handlers.onImportAliases?.();
    await waitRt(() => noticeCount(h, TIMEOUT_MESSAGE) === 1, 'komunikat limitu importu aliasow');
    assert.ok(!notifyText(h.f, 'Nie udalo sie zaimportowac aliasow z gry.'), 'brak ogolnego bledu');
  } finally {
    ImportSession.prototype.fetchAliases = original;
    await restore();
  }
});

test('usuwanie listu: limit czasu pagera ma wspolny komunikat', async () => {
  const original = PagerSession.prototype.deleteLetters;
  PagerSession.prototype.deleteLetters = async () => {
    throw new Error('timeout: pager session list 1');
  };
  const { h, handlers, store, restore } = await startCaptured(true);
  try {
    await loadTruncatedBox(h);
    click(h, '[data-box="odebrane"]');
    await waitRt(
      () => h.f.sent.filter((command) => command === 'listy odebrane').length === 2,
      'odswiezenie kontekstu przed usunieciem',
    );
    h.f.fire('Listy odebrane (prezentowane jest pierwsze 50):', 'mail');
    h.f.fire(' 3. *R* Temat: najstarszy', 'mail');
    h.f.fire('Nadawca: Foo                        Nd, 22 VIII 1999, 01:15:04', 'mail');
    h.f.fire(' 2. *R* Temat: srodkowy', 'mail');
    h.f.fire('Nadawca: Foo                        Pn, 23 VIII 1999, 02:20:05', 'mail');
    h.f.fire(' 1. *R* Temat: najnowszy', 'mail');
    h.f.fire('Nadawca: Corge                       Wt, 24 VIII 1999, 00:11:12', 'mail');
    h.f.fire('> ', 'prompt');
    await waitRt(() => textOf(h, '.arkmail-busy') === '', 'koniec odswiezenia kontekstu');
    const entry = store.state.boxes.odebrane?.entries[0];
    assert.ok(entry, 'wpis z aktualnego kontekstu listingu');
    h.f.shown.length = 0;
    handlers.onDeleteLetter?.('odebrane', entry);
    await new Promise((resolve) => setTimeout(resolve, 100));
    assert.deepEqual(
      h.f.shown.map((notice) => (notice as Notice).text),
      [TIMEOUT_MESSAGE],
      'jedyny komunikat to limit czasu pagera',
    );
    assert.ok(!notifyText(h.f, 'Blad kasowania listu.'), 'brak ogolnego bledu');
    assert.ok(!h.f.sent.includes('q'), 'odrzucony pager nie wysyla q');
  } finally {
    PagerSession.prototype.deleteLetters = original;
    await restore();
  }
});

test('odczyt archiwum: limit czasu pagera ma wspolny komunikat', async () => {
  const original = PagerSession.prototype.readLetter;
  PagerSession.prototype.readLetter = async () => {
    throw new Error('timeout: pager session list 2');
  };
  const h = await startHarness();
  try {
    await loadTruncatedBox(h);
    click(h, '[data-tab="archiwum"]');
    const rows = Array.from(h.content.querySelectorAll('.arkmail-arch-entry')) as HTMLElement[];
    const row = rows.find((entry) => entry.textContent?.includes('najnowszy'));
    assert.ok(row, 'wpis archiwum bez tresci');
    row.click();
    await waitRt(
      () => h.f.sent.includes('listy odebrane przed 25 VIII 1999'),
      're-kotwica przed limitem odczytu',
    );
    h.f.fire('Listy odebrane (prezentowane jest pierwsze 50):', 'mail');
    h.f.fire(' 2. *R* Temat: najnowszy', 'mail');
    h.f.fire('Nadawca: Corge                       Wt, 24 VIII 1999, 00:11:12', 'mail');
    h.f.fire(' 1. *R* Temat: srodkowy', 'mail');
    h.f.fire('Nadawca: Foo                        Pn, 23 VIII 1999, 02:20:05', 'mail');
    h.f.fire('> ', 'prompt');
    await waitRt(() => noticeCount(h, TIMEOUT_MESSAGE) === 1, 'komunikat limitu odczytu archiwum');
    assert.ok(!notifyText(h.f, 'Nie udalo sie odczytac listu.'), 'brak ogolnego bledu');
    assert.ok(!h.f.sent.includes('q'), 'odrzucony pager nie wysyla q');
  } finally {
    PagerSession.prototype.readLetter = original;
    await stopHarness();
  }
});
