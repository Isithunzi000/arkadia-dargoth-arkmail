import { test } from 'node:test';
import assert from 'node:assert/strict';

import { click, loadTruncatedBox, startHarness, stopHarness, type Harness } from './harness';

function clickEntry(h: Harness, index: number): void {
  const entries = h.content.querySelectorAll('.arkmail-entry');
  const entry = entries[index] as { dispatchEvent(event: unknown): void } | undefined;
  assert.ok(entry, `wpis ${index} istnieje`);
  entry.dispatchEvent(new h.window.Event('click'));
}

async function drain(): Promise<void> {
  for (let i = 0; i < 20; i++) await new Promise((resolve) => setImmediate(resolve));
}

function replayListingA(h: Harness): void {
  const { f } = h;
  f.fire('Listy odebrane (prezentowane jest pierwsze 50):', 'mail');
  f.fire(' 3. *R* Temat: najstarszy', 'mail');
  f.fire('Nadawca: Foo                        Nd, 22 VIII 1999, 01:15:04', 'mail');
  f.fire(' 2. *R* Temat: srodkowy', 'mail');
  f.fire('Nadawca: Foo                        Pn, 23 VIII 1999, 02:20:05', 'mail');
  f.fire(' 1. *R* Temat: najnowszy', 'mail');
  f.fire('Nadawca: Corge                       Wt, 24 VIII 1999, 00:11:12', 'mail');
  f.fire('> ', 'prompt');
}

function replayReanchor(h: Harness, subject: 'srodkowy' | 'najstarszy' | 'najnowszy', number: number): void {
  const { f } = h;
  f.fire('Listy odebrane:', 'mail');
  if (number === 2) {
    f.fire(' 1. *R* Temat: inny', 'mail');
    f.fire('Nadawca: Grault                       Pn, 23 VIII 1999, 03:00:00', 'mail');
  }
  const date = subject === 'srodkowy'
    ? 'Pn, 23 VIII 1999, 02:20:05'
    : subject === 'najstarszy'
      ? 'Nd, 22 VIII 1999, 01:15:04'
      : 'Wt, 24 VIII 1999, 00:11:12';
  const party = subject === 'najnowszy' ? 'Corge' : 'Foo';
  f.fire(` ${number}. *R* Temat: ${subject}`, 'mail');
  f.fire(`Nadawca: ${party.padEnd(29)}${date}`, 'mail');
  f.fire('> ', 'prompt');
}

function replayLetter(h: Harness, number: number, subject: string): void {
  const { f } = h;
  f.fire(`List : ${number}`, 'mail');
  f.fire('Od   : Foo', 'mail');
  f.fire(`Temat: ${subject}`, 'mail');
  f.fire('Data : Pn, 23 VIII 1999, 02:20:05', 'mail');
  f.fire('', 'mail');
  f.fire(`Tresc: ${subject}`, 'mail');
  f.fire(`[1-50 adefFhHmnqrsRux.!?-+<>] (aktualny: ${number}) -- `, 'mail');
  f.fire('> ', 'prompt');
}

async function beginAutoRefresh(h: Harness): Promise<void> {
  const { f, waitFor } = h;
  const before = f.sent.filter((command) => command === 'listy odebrane').length;
  f.fire(' [ POCZTA ] Masz nowa poczte od Foo.');
  await waitFor(
    () => f.sent.filter((command) => command === 'listy odebrane').length > before,
    'aktywny auto-refresh odebranych',
  );
}

async function finishAutoRefresh(h: Harness): Promise<void> {
  const { f, waitFor } = h;
  replayListingA(h);
  await waitFor(() => f.sent.includes('listy nieprzeczytane'), 'koniec auto-refresh: nieprzeczytane');
  f.fire('Nie masz zadnych nieprzeczytanych listow.', 'mail');
}

function assertNoLateOpen(h: Harness, expectedReads = 0, expectedReanchors = 0): void {
  const reads = h.f.sent.filter((command) => command.startsWith('przeczytaj list'));
  assert.equal(reads.length, expectedReads, 'brak poznego odczytu');
  assert.equal(h.f.sent.filter((command) => command.startsWith('listy odebrane przed')).length,
    expectedReanchors, 'brak poznej re-kotwicy');
}

test('auto-refresh: klik otwiera wybrany list po refreshu i uzywa nowego numeru', async () => {
  const h = await startHarness();
  const { f, waitFor, content } = h;
  try {
    await loadTruncatedBox(h);
    await beginAutoRefresh(h);
    clickEntry(h, 1); // srodkowy, przed re-kotwica numer 2
    await finishAutoRefresh(h);

    await waitFor(() => f.sent.includes('listy odebrane przed 24 VIII 1999'),
      'zwykla re-kotwica po auto-refresh');
    replayReanchor(h, 'srodkowy', 1);
    await waitFor(() => f.sent.includes('przeczytaj list 1'), 'odczyt po ponownym dopasowaniu');
    assert.ok(!f.sent.includes('przeczytaj list 2'), 'stary numer nie trafia do gry');
    replayLetter(h, 1, 'srodkowy');
    await waitFor(() => !!content.querySelector('.arkmail-letter-body'), 'wybrany list jest otwarty');
    assert.match(String((content.querySelector('.arkmail-letter-body') as { textContent?: string }).textContent),
      /srodkowy/);
  } finally {
    await stopHarness();
  }
});

test('auto-refresh: kolejne klikniecia zastepuja wybor i powoduja jeden odczyt', async () => {
  const h = await startHarness();
  const { f, waitFor, content } = h;
  try {
    await loadTruncatedBox(h);
    await beginAutoRefresh(h);
    clickEntry(h, 1);
    clickEntry(h, 2); // tylko najstarszy pozostaje do otwarcia
    await finishAutoRefresh(h);

    await waitFor(() => f.sent.includes('listy odebrane przed 23 VIII 1999'),
      'jedna re-kotwica najnowszego wyboru');
    assert.ok(!f.sent.includes('listy odebrane przed 24 VIII 1999'), 'wczesniejszy klik zostal zastapiony');
    replayReanchor(h, 'najstarszy', 2);
    await waitFor(() => f.sent.includes('przeczytaj list 2'), 'odczyt ostatnio kliknietego listu');
    replayLetter(h, 2, 'najstarszy');
    await waitFor(() => !!content.querySelector('.arkmail-letter-body'), 'ostatni wybor jest otwarty');
    assert.deepEqual(f.sent.filter((command) => command.startsWith('przeczytaj list')),
      ['przeczytaj list 2']);
  } finally {
    await stopHarness();
  }
});

test('auto-refresh: Zamknij kasuje odlozony wybor', async () => {
  const h = await startHarness({ wide: true });
  const { f, waitFor, content } = h;
  try {
    await loadTruncatedBox(h);
    clickEntry(h, 0);
    await waitFor(() => f.sent.includes('listy odebrane przed 25 VIII 1999'), 'pierwsza re-kotwica');
    replayReanchor(h, 'najnowszy', 1);
    await waitFor(() => f.sent.includes('przeczytaj list 1'), 'pierwszy odczyt');
    replayLetter(h, 1, 'najnowszy');
    await waitFor(() => !!content.querySelector('.arkmail-letter-body'), 'pierwszy list otwarty');
    await waitFor(() => f.sent.filter((command) => command === 'listy odebrane').length >= 2,
      'auto-refresh po pierwszym odczycie');
    clickEntry(h, 1);
    click(h, '.arkmail-letter-close');
    replayListingA(h);
    await drain();

    assertNoLateOpen(h, 1, 1);
  } finally {
    await stopHarness();
  }
});

test('auto-refresh: reczna poczta, reconnect i replay kasuja odlozony wybor', async (context) => {
  for (const kind of ['reczna-poczta', 'reconnect', 'replay'] as const) {
    await context.test(kind, async () => {
      const h = await startHarness();
      const { f } = h;
      try {
        await loadTruncatedBox(h);
        await beginAutoRefresh(h);
        clickEntry(h, 1);
        if (kind === 'reczna-poczta') f.fire('→ listy', 'command');
        else if (kind === 'reconnect') {
          f.fireEvent('client.disconnect', undefined);
          f.fireEvent('client.connect', undefined);
        } else {
          f.fireEvent('proxy.session', { resumed: true, upstreamClosed: false, replayedBytes: 128 });
        }
        replayListingA(h);
        await drain();
        assertNoLateOpen(h);
      } finally {
        await stopHarness();
      }
    });
  }
});

test('auto-refresh: dwa pelne odczyty bez zamykania pierwszego pozostaja zielone', async () => {
  const h = await startHarness({ wide: true });
  const { f, waitFor, content } = h;
  try {
    await loadTruncatedBox(h);
    clickEntry(h, 0);
    await waitFor(() => f.sent.includes('listy odebrane przed 25 VIII 1999'), 'pierwsza re-kotwica');
    replayReanchor(h, 'najnowszy', 1);
    await waitFor(() => f.sent.includes('przeczytaj list 1'), 'pierwszy odczyt');
    replayLetter(h, 1, 'najnowszy');
    await waitFor(() => !!content.querySelector('.arkmail-letter-body'), 'pierwszy list otwarty');
    await waitFor(() => f.sent.filter((command) => command === 'listy odebrane').length >= 2,
      'auto-refresh po pierwszym odczycie');
    replayListingA(h);
    await waitFor(
      () => ((content.querySelector('.arkmail-busy') as { textContent?: string | null } | null)?.textContent ?? '') === '',
      'koniec auto-refresh po pierwszym odczycie',
    );

    clickEntry(h, 1);
    await waitFor(() => f.sent.includes('przeczytaj list 2'), 'drugi odczyt bez zamykania pierwszego');
    replayLetter(h, 2, 'srodkowy');
    await waitFor(
      () => String((content.querySelector('.arkmail-letter-body') as { textContent?: string }).textContent).includes('srodkowy'),
      'drugi list zastepuje podglad',
    );
    assert.deepEqual(f.sent.filter((command) => command.startsWith('przeczytaj list')),
      ['przeczytaj list 1', 'przeczytaj list 2']);
  } finally {
    await stopHarness();
  }
});

test('auto-refresh: destroy kasuje odlozony wybor', async () => {
  const h = await startHarness();
  const { f } = h;
  await loadTruncatedBox(h);
  await beginAutoRefresh(h);
  clickEntry(h, 1);
  await stopHarness();
  replayListingA(h);
  await drain();
  assertNoLateOpen(h);
});
