/**
 * Odswiezanie skrzynek (Fala 11e; kontrakt sync zmieniony w Fali 12b).
 *
 * Klik w skrzynke ZAWSZE pobiera najnowsza strone z serwera - gracz nie
 * moze utknac na nieodswiezonym cache i przegapic nowych listow.
 * Fala 12b: odswiezenie to SYNC (aktualizacja w miejscu + doklejenie
 * nowych na koncu), nie replace - wczytane starsze strony ("Wczytaj
 * starsze" / "Wczytaj wszystkie") NIE znikaja przy odswiezeniu.
 * Powiadomienie o nowej poczcie dziala tak samo (ten sam sync).
 * Pelny replace zostaje tylko po skasowaniu listu.
 * Szczegoly kontraktu: tests/syncMailbox.test.ts.
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
  textOf,
  type Harness,
} from './harness';

const window = new Window();
const document = window.document;

function mount(store: MailUiStore) {
  const container = document.createElement('div');
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

test('zakladki: klik w skrzynke ZAWSZE odswieza najnowsza strone', () => {
  const s = new MailUiStore();
  const { container, calls } = mount(s);
  const boxTab = (box: string) =>
    (container.querySelector(`[data-box="${box}"]`) as { dispatchEvent(e: unknown): void })
      .dispatchEvent(new window.Event('click'));
  // Pusta czy zaladowana - kazdy klik strzela refresh (najnowsze 50).
  boxTab('odebrane');
  boxTab('wyslane');
  s.applyMailbox('wyslane', {
    kind: 'lista',
    header: { box: 'wyslane', truncated: false },
    entries: [],
  });
  boxTab('wyslane');
  boxTab('wyslane');
  const refreshCalls = calls.filter((c) => c.name === 'refresh');
  assert.deepEqual(
    refreshCalls.map((c) => c.args),
    [['odebrane'], ['wyslane'], ['wyslane'], ['wyslane']],
    'klik w zaladowana skrzynke tez odswieza',
  );
});

/** Dokleja starsza strone (jak w reanchor.test) - 5 wierszy razem. */
async function loadOlderPage(h: Harness): Promise<void> {
  const { f, waitFor } = h;
  click(h, '.arkmail-older');
  await waitFor(() => f.sent.includes('listy odebrane przed 23 VIII 1999'), 'kotwica');
  f.fire('Wybrane listy odebrane:', 'mail');
  f.fire(' 2. *R* Temat: prastary', 'mail');
  f.fire('Nadawca: Waldo                          So, 21 VIII 1999, 10:00:00', 'mail');
  f.fire(' 1. *R* Temat: antyczny', 'mail');
  f.fire('Nadawca: Baz                          Pt, 20 VIII 1999, 09:00:00', 'mail');
  f.fire('> ', 'prompt');
  await waitFor(() => h.content.querySelectorAll('.arkmail-entry').length === 5, '5 wierszy');
}

test('zakladki: powrot na skrzynke odswieza najnowsza strone (sync zachowuje wczytane)', async () => {
  const h = await startHarness();
  const { f, waitFor, content } = h;
  try {
    await loadTruncatedBox(h);
    await loadOlderPage(h);
    const listingsBefore = f.sent.filter((c) => c === 'listy odebrane').length;

    // Odejscie na wyslane (klik = fetch) i powrot (klik = REFETCH).
    click(h, '[data-box="wyslane"]');
    await waitFor(() => f.sent.includes('listy wyslane'), 'pobranie wyslanych');
    f.fire('Nie masz zadnych wyslanych listow.', 'mail');
    await waitFor(() => !content.querySelector('.arkmail-busy'), 'koniec pobierania');
    click(h, '[data-box="odebrane"]');
    await waitFor(
      () => f.sent.filter((c) => c === 'listy odebrane').length === listingsBefore + 1,
      'powrot = refetch najnowszej strony',
    );

    // Sync (Fala 12b): swieza strona (z jednym NOWYM listem) aktualizuje
    // wpisy w miejscu - doczytane starsze strony NIE znikaja.
    f.fire('Listy odebrane (prezentowane jest pierwsze 50):', 'mail');
    f.fire(' 4. *R* Temat: najstarszy', 'mail');
    f.fire('Nadawca: Foo                        Nd, 22 VIII 1999, 01:15:04', 'mail');
    f.fire(' 3. *R* Temat: srodkowy', 'mail');
    f.fire('Nadawca: Foo                        Pn, 23 VIII 1999, 02:20:05', 'mail');
    f.fire(' 2. *R* Temat: najnowszy', 'mail');
    f.fire('Nadawca: Corge                       Wt, 24 VIII 1999, 00:11:12', 'mail');
    f.fire(' 1. Temat: swiezy', 'mail');
    f.fire('Nadawca: Grault                         Sr, 25 VIII 1999, 08:00:00', 'mail');
    f.fire('> ', 'prompt');
    // Najpierw czekamy az swiezy listing ZOSTANIE zastosowany (nowy list
    // widoczny) - inaczej waitFor zlapalby stan sprzed async zapisu.
    await waitFor(
      () => textOf(h, '.arkmail-entry').includes('swiezy'),
      'swiezy listing zastosowany (nowy list widoczny)',
    );
    assert.equal(
      content.querySelectorAll('.arkmail-entry').length,
      6,
      'widok = swieza strona + wczytane starsze (5+1=6 wierszy)',
    );
  } finally {
    await stopHarness();
  }
});

test('zakladki: powiadomienie scala swieza strone zamiast kasowac wczytane', async () => {
  const h = await startHarness();
  const { f, waitFor, content } = h;
  try {
    await loadTruncatedBox(h);
    await loadOlderPage(h);

    // Nowa poczta: swiezy listing przynosi 1 NOWY list na gorze.
    f.fire(' [ POCZTA ] Masz nowa poczte od Grault.');
    await waitFor(
      () => f.sent.filter((c) => c === 'listy odebrane').length === 2,
      'refresh po powiadomieniu',
    );
    f.fire('Listy odebrane (prezentowane jest pierwsze 50):', 'mail');
    f.fire(' 4. *R* Temat: najstarszy', 'mail');
    f.fire('Nadawca: Foo                        Nd, 22 VIII 1999, 01:15:04', 'mail');
    f.fire(' 3. *R* Temat: srodkowy', 'mail');
    f.fire('Nadawca: Foo                        Pn, 23 VIII 1999, 02:20:05', 'mail');
    f.fire(' 2. *R* Temat: najnowszy', 'mail');
    f.fire('Nadawca: Corge                       Wt, 24 VIII 1999, 00:11:12', 'mail');
    f.fire(' 1. Temat: swiezy', 'mail');
    f.fire('Nadawca: Grault                         Sr, 25 VIII 1999, 08:00:00', 'mail');
    f.fire('> ', 'prompt');
    await waitFor(
      () => f.sent.filter((c) => c === 'listy nieprzeczytane').length === 2,
      'refresh nieprzeczytanych',
    );
    f.fire(' 1. Temat: swiezy', 'mail');
    f.fire('Nadawca: Grault                         Sr, 25 VIII 1999, 08:00:00', 'mail');
    f.fire('> ', 'prompt');
    // 5 wczytanych + 1 nowy = 6 wierszy; stare strony NIE znikaja.
    await waitFor(() => content.querySelectorAll('.arkmail-entry').length === 6, '6 wierszy');
  } finally {
    await stopHarness();
  }
});
