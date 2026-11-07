import { test } from 'node:test';
import assert from 'node:assert/strict';

import { startHarness, stopHarness, click, notifyText, textOf, type Harness } from './harness';

const ERROR_LINE = 'Data zostala podana w zlym formacie.';

async function waitRefreshIdle(h: Harness): Promise<void> {
  await h.waitFor(() => textOf(h, '.arkmail-busy') === '', 'koniec odswiezania');
}

test('reczne odswiezenie: blad jest widoczny, busy znika i nie ma komunikatu sukcesu', async () => {
  const h = await startHarness();
  try {
    click(h, '.arkmail-search-go');
    await h.waitFor(() => h.f.sent.includes('listy odebrane'), 'reczna komenda listingu');
    h.f.fire(ERROR_LINE, 'mail');
    await waitRefreshIdle(h);
    assert.ok(notifyText(h.f, 'Blad odswiezania'), 'reczny blad ma wlasny toast');
    assert.ok(!notifyText(h.f, 'Odswiezono'), 'stare dane nie sa przedstawiane jako swieze');
  } finally {
    await stopHarness();
  }
});

test('automatyczne odswiezenie: blad bez toastu i bez agresywnego ponawiania', async () => {
  const h = await startHarness();
  try {
    h.f.fire(' [ POCZTA ] Masz nowa poczte od Foo.');
    await h.waitFor(() => h.f.sent.includes('listy odebrane'), 'automatyczna komenda listingu');
    h.f.fire(ERROR_LINE, 'mail');
    await waitRefreshIdle(h);
    await new Promise((r) => setTimeout(r, 100));
    assert.ok(!notifyText(h.f, 'Blad odswiezania'), 'automatyczny blad nie generuje toastu');
    assert.equal(
      h.f.sent.filter((c) => c === 'listy odebrane').length,
      1,
      'brak automatycznej serii ponowien',
    );
  } finally {
    await stopHarness();
  }
});

test('reczne odswiezenie: anulowanie reconnectem nie jest zglaszane jako awaria', async () => {
  const h = await startHarness();
  try {
    click(h, '.arkmail-search-go');
    await h.waitFor(() => h.f.sent.includes('listy odebrane'), 'reczna komenda przed reconnectem');
    h.f.fireEvent('client.disconnect', undefined);
    await waitRefreshIdle(h);
    assert.ok(!notifyText(h.f, 'Blad odswiezania'), 'anulowanie pozostaje ciche');
  } finally {
    await stopHarness();
  }
});
