import { test } from 'node:test';
import assert from 'node:assert/strict';

import { click, loadTruncatedBox, startHarness, stopHarness } from './harness';

test('reconnect anuluje stary listing i wznawia odswiezenie po sygnale wznowienia sesji', async () => {
  const h = await startHarness();
  const { f, waitFor, content } = h;
  try {
    f.fire(' [ POCZTA ] Masz nowa poczte od Foo.');
    await waitFor(() => f.sent.includes('listy odebrane'), 'pierwszy listing przed rozlaczeniem');
    const before = f.sent.filter((c) => c === 'listy odebrane').length;

    f.fireEvent('client.disconnect', undefined);
    f.fireEvent('client.connect', undefined);
    // Fala 25: sam connect odpala tez na ekranie logowania, wiec
    // odswiezenie dopiero po faktycznym wznowieniu sesji w grze.
    f.fireEvent('proxy.session', { resumed: true, upstreamClosed: false });
    // Nowa operacja czeka na potwierdzony, zwykly prompt po reconnectcie.
    f.fire('> ', 'prompt');

    await waitFor(
      () => f.sent.filter((c) => c === 'listy odebrane').length > before,
      'nowy listing bez odpowiedzi na stara sesje',
    );
    assert.ok(content.querySelector('.arkmail-busy'), 'nowa operacja ma wlasny komunikat');
    assert.ok(!f.sent.includes('q'), 'anulowanie nie wysyla smieciowego q');
    assert.ok(!f.sent.includes('~q'), 'anulowanie nie wysyla smieciowego ~q');
  } finally {
    await stopHarness();
  }
});

test('reconnect podczas odczytu odrzuca spozniona odpowiedz bez q i bez otwarcia listu', async () => {
  const h = await startHarness();
  const { f, waitFor, content } = h;
  try {
    await loadTruncatedBox(h);
    click(h, '.arkmail-entry');
    await waitFor(
      () => f.sent.includes('listy odebrane przed 25 VIII 1999'),
      `rekotwica przed rozlaczeniem: ${JSON.stringify(f.sent)}`,
    );
    f.fire('Listy odebrane:', 'mail');
    f.fire(' 1. *R* Temat: najnowszy', 'mail');
    f.fire('Nadawca: Corge                       Wt, 24 VIII 1999, 00:11:12', 'mail');
    f.fire('> ', 'prompt');
    await waitFor(() => f.sent.includes('przeczytaj list 1'), 'odczyt przed rozlaczeniem');

    f.fireEvent('gmcp_msg.system.login', {});
    f.fireEvent('gmcp.char.info', { name: 'Tester' });
    f.fire('List : 1', 'mail');
    f.fire('Od   : Foo', 'mail');
    f.fire('Temat: najnowszy', 'mail');
    f.fire('Data : Wt, 24 VIII 1999, 00:11:12', 'mail');
    f.fire('Spozniona tresc.', 'mail');
    f.fire('[1-50 adefFhHmnqrsRux.!?-+<>] (aktualny: 1) -- ', 'mail');
    f.fire('> ', 'prompt');
    await new Promise((resolve) => setTimeout(resolve, 50));

    assert.ok(!f.sent.includes('q'), 'spozniona odpowiedz nie moze wyslac q do nowej sesji');
    assert.ok(!f.sent.includes('~q'), 'spozniona odpowiedz nie moze wyslac ~q do nowej sesji');
    assert.equal(content.querySelector('.arkmail-letter-body'), null, 'stary list nie otwiera sie po reconnectcie');
  } finally {
    await stopHarness();
  }
});
