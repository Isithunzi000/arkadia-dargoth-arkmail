import { test } from 'node:test';
import assert from 'node:assert/strict';

import { startHarness, stopHarness } from './harness';

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

    await waitFor(
      () => f.sent.filter((c) => c === 'listy odebrane').length > before,
      'nowy listing bez odpowiedzi na stara sesje',
    );
    assert.ok(content.querySelector('.arkmail-busy'), 'nowa operacja ma wlasny komunikat');
    assert.ok(!f.sent.includes('q'), 'anulowanie nie wysyla smieciowego q');
  } finally {
    await stopHarness();
  }
});
