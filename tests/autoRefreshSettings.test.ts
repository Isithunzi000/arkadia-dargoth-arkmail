import { test } from 'node:test';
import assert from 'node:assert/strict';

import { IndexedDbStorageDriver } from '../src/arkmail/adapters/storageDriver';
import {
  click,
  notifyText,
  startHarness,
  stopHarness,
  type Harness,
} from './harness';

const NOTIFY_TITLE =
  'Pokazuje komunikat o nowej poczcie. To ustawienie nie wplywa na automatyczne odswiezanie skrzynek.';
const AUTO_TITLE =
  'Po nowej poczcie i innych zdarzeniach pocztowych ArkMail automatycznie sprawdza skrzynki oraz aktualizuje archiwum, kontakty i liczniki. Wylaczenie tej opcji zatrzymuje odswiezanie w tle, ale nie wylacza powiadomien. Dane moga byc nieaktualne do czasu recznego odswiezenia. Uzyj przycisku Odswiez, aby pobrac aktualne dane.';
const AUTO_WARNING =
  'Automatyczne odswiezanie jest wylaczone. Archiwum, kontakty i liczniki moga byc nieaktualne. Uzyj przycisku Odswiez, aby pobrac aktualne dane.';

interface Toggle {
  checked: boolean;
  title: string;
  click(): void;
}

const toggle = (h: Harness, selector: string): Toggle => {
  const element = h.content.querySelector(selector) as Toggle | null;
  assert.ok(element, `przelacznik istnieje: ${selector}`);
  return element;
};

const autoToggle = (h: Harness): Toggle => toggle(h, '.arkmail-auto-refresh-toggle');
const notifyToggle = (h: Harness): Toggle => toggle(h, '.arkmail-notify-toggle');
const warning = (h: Harness): string | null =>
  (h.content.querySelector('.arkmail-auto-refresh-warning') as { textContent?: string } | null)
    ?.textContent ?? null;
const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

test('ustawienia: domyslnie wlaczone, dokladne tooltipy i brak ostrzezenia', async () => {
  const h = await startHarness();
  try {
    assert.equal(notifyToggle(h).checked, true);
    assert.equal(autoToggle(h).checked, true);
    assert.equal(notifyToggle(h).title, NOTIFY_TITLE);
    assert.equal(autoToggle(h).title, AUTO_TITLE);
    assert.equal(warning(h), null);
  } finally {
    await stopHarness();
  }
});

test('ustawienia: zapisane wylaczenie odswiezania jest odtwarzane niezaleznie', async () => {
  const h = await startHarness({ notifyEnabled: false, autoRefreshEnabled: false });
  try {
    assert.equal(notifyToggle(h).checked, false);
    assert.equal(autoToggle(h).checked, false);
    assert.equal(warning(h), AUTO_WARNING);
  } finally {
    await stopHarness();
  }
});

test('ustawienia: przelaczniki i zapis trwaly sa niezalezne', async () => {
  const h = await startHarness();
  const driver = new IndexedDbStorageDriver(globalThis.indexedDB);
  try {
    notifyToggle(h).click();
    assert.equal(notifyToggle(h).checked, false);
    assert.equal(autoToggle(h).checked, true);
    autoToggle(h).click();
    assert.equal(notifyToggle(h).checked, false);
    assert.equal(autoToggle(h).checked, false);
    assert.equal(warning(h), AUTO_WARNING);

    let values: Record<string, string> = {};
    for (let attempt = 0; attempt < 500; attempt += 1) {
      values = await driver.loadAll();
      if (
        values['arkmail.foo.powiadomienia'] === 'false' &&
        values['arkmail.foo.automatyczne-odswiezanie'] === 'false'
      ) break;
      await new Promise((resolve) => setImmediate(resolve));
    }
    assert.equal(values['arkmail.foo.powiadomienia'], 'false');
    assert.equal(values['arkmail.foo.automatyczne-odswiezanie'], 'false');
  } finally {
    await driver.close();
    await stopHarness();
  }
});

test('wylaczone odswiezanie: zdarzenia w tle nie wysylaja komend, powiadomienia i reczne odswiezenie dzialaja', async () => {
  const h = await startHarness({ autoRefreshEnabled: false });
  const { f } = h;
  try {
    f.fire(' [ POCZTA ] Masz nowa poczte od Corge.');
    f.fireEvent('gmcp.mail.state', { unread: true, unreceived: false, unsent: true });
    f.fireEvent('proxy.session', { resumed: true, upstreamClosed: false });
    f.fire('Wsrod trzepotu skrzydel Sroka laduje na twoim prawym ramieniu.');
    await sleep(150);
    assert.deepEqual(f.sent, []);
    assert.ok(notifyText(f, 'Masz nowa poczte od Corge.'));

    click(h, '.arkmail-search-go');
    await h.waitFor(() => f.sent.includes('listy odebrane'), 'reczne odswiezenie');
  } finally {
    await stopHarness();
  }
});

test('wylaczenie w trakcie pobierania zatrzymuje kolejne skrzynki i opoznione ponowienia', async () => {
  const h = await startHarness();
  const { f } = h;
  try {
    f.fire(' [ POCZTA ] Masz nowa poczte od Corge.');
    await h.waitFor(() => f.sent.includes('listy odebrane'), 'pierwszy automatyczny listing');
    autoToggle(h).click();
    f.fire('Nie masz zadnych odebranych listow.', 'mail');
    await sleep(10_500);
    assert.deepEqual(
      f.sent.filter((command) => command.startsWith('listy ')),
      ['listy odebrane'],
      'po wylaczeniu nie ma kolejnej skrzynki ani ponowienia po 10 s',
    );
  } finally {
    await stopHarness();
  }
});
