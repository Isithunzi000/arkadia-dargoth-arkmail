/**
 * Pamiec widoku skrzynek (Fala 9b).
 *
 * Przelaczenie zakladki NIE moze kasowac wczytanych stron: fetch tylko
 * przy pierwszym wejsciu na skrzynke (brak widoku). Powiadomienie o nowej
 * poczcie SCALA swieza strone z widokiem (dokleja nowe, zostawia wczytane
 * strony); pelna wymiana widoku tylko z przycisku odswiez i po operacjach.
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

test('zakladki: klik w pusta skrzynke pobiera, klik w zaladowana - nie', () => {
  const s = new MailUiStore();
  const { container, calls } = mount(s);
  const boxTab = (box: string) =>
    (container.querySelector(`[data-box="${box}"]`) as { dispatchEvent(e: unknown): void })
      .dispatchEvent(new window.Event('click'));
  // Pierwsze wejscie na skrzynke bez widoku -> pobierz.
  boxTab('odebrane');
  boxTab('wyslane');
  // Widok zaladowany: kolejne kliki NIE pobieraja.
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
    [['odebrane'], ['wyslane']],
  );
});

/** Dokleja starsza strone (jak w reanchor.test) - 5 wierszy razem. */
async function loadOlderPage(h: Harness): Promise<void> {
  const { f, waitFor } = h;
  click(h, '.arkmail-older');
  await waitFor(() => f.sent.includes('listy odebrane przed 22 XII 2025'), 'kotwica');
  f.fire('Wybrane listy odebrane:', 'mail');
  f.fire(' 2. *R* Temat: prastary', 'mail');
  f.fire('Nadawca: Waldo                          So, 20 XII 2025, 10:00:00', 'mail');
  f.fire(' 1. *R* Temat: antyczny', 'mail');
  f.fire('Nadawca: Baz                          Pt, 19 XII 2025, 09:00:00', 'mail');
  f.fire('> ', 'prompt');
  await waitFor(() => h.content.querySelectorAll('.arkmail-entry').length === 5, '5 wierszy');
}

test('zakladki: powrot na wczytana skrzynke zachowuje wszystkie strony', async () => {
  const h = await startHarness();
  const { f, waitFor, content } = h;
  try {
    await loadTruncatedBox(h);
    await loadOlderPage(h);
    const listingsBefore = f.sent.filter((c) => c === 'listy odebrane').length;

    // Odejscie na wyslane (pierwsza wizyta -> fetch) i powrot.
    click(h, '[data-box="wyslane"]');
    await waitFor(() => f.sent.includes('listy wyslane'), 'pierwsze pobranie wyslanych');
    f.fire('Nie masz zadnych wyslanych listow.', 'mail');
    await waitFor(() => !content.querySelector('.arkmail-busy'), 'koniec pobierania');
    click(h, '[data-box="odebrane"]');

    // Bez nowego fetchu i z kompletem 5 wierszy.
    await waitFor(() => content.querySelectorAll('.arkmail-entry').length === 5, '5 wierszy');
    assert.equal(
      f.sent.filter((c) => c === 'listy odebrane').length,
      listingsBefore,
      'powrot bez refetchu',
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
    f.fire('Nadawca: Foo                        N, 21 XII 2025, 01:15:04', 'mail');
    f.fire(' 3. *R* Temat: srodkowy', 'mail');
    f.fire('Nadawca: Foo                        Pn, 22 XII 2025, 02:20:05', 'mail');
    f.fire(' 2. *R* Temat: najnowszy', 'mail');
    f.fire('Nadawca: Corge                       Wt, 23 XII 2025, 00:11:12', 'mail');
    f.fire(' 1. Temat: swiezy', 'mail');
    f.fire('Nadawca: Grault                         Cz, 24 XII 2025, 08:00:00', 'mail');
    f.fire('> ', 'prompt');
    await waitFor(
      () => f.sent.filter((c) => c === 'listy nieprzeczytane').length === 2,
      'refresh nieprzeczytanych',
    );
    f.fire(' 1. Temat: swiezy', 'mail');
    f.fire('Nadawca: Grault                         Cz, 24 XII 2025, 08:00:00', 'mail');
    f.fire('> ', 'prompt');
    // 5 wczytanych + 1 nowy = 6 wierszy; stare strony NIE znikaja.
    await waitFor(() => content.querySelectorAll('.arkmail-entry').length === 6, '6 wierszy');
  } finally {
    await stopHarness();
  }
});
