/** Kompletny odczyt bez zwyklego promptu. Wszystkie dane sa syntetyczne. */
import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  startHarness,
  stopHarness,
  loadTruncatedBox,
  click,
  notifyText,
  waitRt,
} from './harness';

test('odczyt: kompletny list bez zwyklego promptu otwiera sie i odswieza skrzynke', async () => {
  const h = await startHarness();
  const { f, content } = h;
  try {
    await loadTruncatedBox(h);
    click(h, '.arkmail-entry');
    await waitRt(() => f.sent.includes('listy odebrane przed 25 VIII 1999'), 're-kotwica przed odczytem');
    f.fire('Listy odebrane (prezentowane jest pierwsze 50):', 'mail');
    f.fire(' 1. *R* Temat: najnowszy', 'mail');
    f.fire('Nadawca: Corge                       Wt, 24 VIII 1999, 00:11:12', 'mail');
    f.fire('> ', 'prompt');
    await waitRt(() => f.sent.includes('przeczytaj list 1'), 'komenda odczytu');

    f.fire('List : 1', 'mail');
    f.fire('Od   : Corge', 'mail');
    f.fire('Temat: najnowszy', 'mail');
    f.fire('Data : Wt, 24 VIII 1999, 00:11:12', 'mail');
    f.fire('', 'mail');
    f.fire('Tresc bez zwyklego promptu.', 'mail');
    f.fire('[1-50 adefFhHmnqrsRux.!?-+<>] (aktualny: 1) -- ', 'mail');

    await waitRt(() => !!content.querySelector('.arkmail-letter-body'), 'list otwarty bez promptu');
    const body = content.querySelector('.arkmail-letter-body') as { textContent?: string } | null;
    assert.ok(body?.textContent?.includes('Tresc bez zwyklego promptu.'));
    assert.ok(!notifyText(f, 'Nie udalo sie odczytac listu.'));
    assert.equal(f.sent.filter((command) => command === 'listy odebrane').length, 2,
      'po zwroceniu listu skrzynka odswieza sie bez recovery');
    assert.deepEqual(f.sent.slice(-2), ['q', 'listy odebrane']);

    f.fire('Listy odebrane (prezentowane jest pierwsze 50):', 'mail');
    f.fire(' 1. Temat: najnowszy', 'mail');
    f.fire('Nadawca: Corge                       Wt, 24 VIII 1999, 00:11:12', 'mail');
    f.fire('> ', 'prompt');
    await waitRt(() => ((content.querySelector('.arkmail-busy') as { textContent?: string | null } | null)?.textContent ?? 'missing') === '',
      'koniec odswiezenia');
    assert.equal(f.sent.filter((command) => command === 'listy odebrane').length, 2,
      'dokladnie jedno odswiezenie po odczycie');
  } finally {
    await stopHarness();
  }
});

test('odczyt: wpis znaleziony na niepotwierdzonej stronie nie wymaga kolejnej strony', async () => {
  const h = await startHarness();
  const { f, content } = h;
  try {
    await loadTruncatedBox(h);
    click(h, '.arkmail-entry');
    await waitRt(() => f.sent.includes('listy odebrane przed 25 VIII 1999'), 're-kotwica przed odczytem');
    f.fire('Listy odebrane (prezentowane jest pierwsze 50):', 'mail');
    f.fire(' 1. *R* Temat: najnowszy', 'mail');
    f.fire('Nadawca: Corge                       Wt, 24 VIII 1999, 00:11:12', 'mail');

    await waitRt(() => f.sent.includes('przeczytaj list 1'), 'odczyt po niepotwierdzonej stronie');
    f.fire('List : 1', 'mail');
    f.fire('Od   : Corge', 'mail');
    f.fire('Temat: najnowszy', 'mail');
    f.fire('Data : Wt, 24 VIII 1999, 00:11:12', 'mail');
    f.fire('', 'mail');
    f.fire('Tresc znalezionego listu.', 'mail');
    f.fire('[1-50 adefFhHmnqrsRux.!?-+<>] (aktualny: 1) -- ', 'mail');

    await waitRt(() => !!content.querySelector('.arkmail-letter-body'), 'znaleziony list otwarty');
    assert.equal(f.sent.filter((command) => command.startsWith('listy odebrane przed')).length, 1);
    assert.ok(!notifyText(f, 'Nie mozna sprawdzic calej listy'));
    assert.ok(!notifyText(f, 'Nie udalo sie odczytac listu.'));
  } finally {
    await stopHarness();
  }
});
