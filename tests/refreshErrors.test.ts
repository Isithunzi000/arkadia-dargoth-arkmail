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

test('reczne odswiezenie: nieznany pager daje konkretny komunikat bez q i ponowienia', async () => {
  const h = await startHarness();
  try {
    click(h, '.arkmail-search-go');
    await h.waitFor(() => h.f.sent.includes('listy odebrane'), 'reczna komenda przed pagerem');
    h.f.fire('[1-50 adefFhHmnqrsRux.!?-+<>] (aktualny: 1) -- ', 'mail');
    await waitRefreshIdle(h);
    assert.ok(
      notifyText(h.f, 'Poczta jest otwarta w innym widoku - zamknij go i sprobuj ponownie.'),
      'uzytkownik wie, co zatrzymalo reczne odswiezenie',
    );
    assert.ok(notifyText(h.f, 'Blad odswiezania'), 'blad ma wlasny tytul');
    assert.ok(!h.f.sent.includes('q'), 'plugin nie zamyka pagera nieznanego pochodzenia');
    assert.equal(h.f.sent.filter((command) => command === 'listy odebrane').length, 1);
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

test('reczne odswiezenie: reconnect ma jedno ostrzezenie i pozwala ponowic', async () => {
  const message =
    'Polaczenie zostalo przerwane. Poprzednia operacja pocztowa zostala anulowana. Wykonaj ja ponownie po ponownym polaczeniu.';
  const h = await startHarness({ autoRefreshEnabled: false });
  try {
    click(h, '.arkmail-search-go');
    await h.waitFor(() => h.f.sent.includes('listy odebrane'), 'reczna komenda przed reconnectem');
    h.f.fireEvent('client.disconnect', undefined);
    h.f.fireEvent('client.disconnect', undefined);
    h.f.fireEvent('client.connect', undefined);
    h.f.fireEvent('gmcp.char.info', { name: 'Tester' });
    h.f.fireEvent('client.disconnect', undefined);
    await waitRefreshIdle(h);
    await new Promise((resolve) => setTimeout(resolve, 50));
    assert.ok(!notifyText(h.f, 'Blad odswiezania'), 'anulowanie nie jest awaria');
    assert.equal(
      h.f.shown.filter((entry) => String((entry as { text?: string }).text ?? '') === message).length,
      1,
      'wiele sygnalow resetu daje jedno ostrzezenie',
    );
    assert.ok(!h.f.sent.includes('q'));
    assert.ok(!h.f.sent.includes('~q'));

    h.f.fireEvent('client.connect', undefined);
    h.f.fireEvent('gmcp.char.info', { name: 'Tester' });
    click(h, '.arkmail-search-go');
    await h.waitFor(
      () => h.f.sent.filter((command) => command === 'listy odebrane').length === 2,
      'reczne ponowienie po nowym polaczeniu',
    );
    h.f.fire('Nie masz zadnych odebranych listow.', 'mail');
    await waitRefreshIdle(h);
  } finally {
    await stopHarness();
  }
});
