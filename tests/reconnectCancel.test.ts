import { test } from 'node:test';
import assert from 'node:assert/strict';

import { click, loadTruncatedBox, notifyText, startHarness, stopHarness } from './harness';

test('pusty replay wykonuje jedno odswiezenie mimo powtornych sygnalow', async () => {
  const h = await startHarness();
  const { f, waitFor, content } = h;
  try {
    f.fireEvent('client.disconnect', undefined);
    f.fireEvent('client.connect', undefined);
    f.fireEvent('proxy.session', { resumed: true, upstreamClosed: false, replayedBytes: 0 });
    const boxes = [
      ['odebrane', 'odebranych'],
      ['nieprzeczytane', 'nieprzeczytanych'],
      ['wyslane', 'wyslanych'],
      ['niewyslane', 'niewyslanych'],
    ] as const;
    for (const [box, genitive] of boxes) {
      await waitFor(() => f.sent.includes(`listy ${box}`), `pierwsze odswiezenie: ${box}`);
      f.fire(`Nie masz zadnych ${genitive} listow.`, 'mail');
    }
    await waitFor(
      () => ((content.querySelector('.arkmail-busy') as { textContent?: string | null } | null)?.textContent ?? 'missing') === '',
      'koniec pierwszego odswiezenia',
    );
    const sentAfterRefresh = [...f.sent];

    f.fireEvent('proxy.session', { resumed: true, upstreamClosed: false, replayedBytes: 0 });
    f.fireEvent('gmcp', { path: 'char.state', value: {} });
    f.fireEvent('gmcp.char.info', { name: 'Tester' });
    await new Promise((resolve) => setTimeout(resolve, 80));

    assert.deepEqual(f.sent, sentAfterRefresh, 'powtorne sygnaly nie tworza drugiego odswiezenia');
    assert.ok(!f.sent.includes('q'));
    assert.ok(!f.sent.includes('~q'));
  } finally {
    await stopHarness();
  }
});

test('replay niepusty i nieznany czeka na swiadome ponowienie przez uzytkownika', async (t) => {
  const cases = [
    ['niepusty', { resumed: true, upstreamClosed: false, replayedBytes: 128 }],
    ['nieznany', { resumed: true, upstreamClosed: false }],
  ] as const;

  for (const [label, session] of cases) {
    await t.test(label, async () => {
      const h = await startHarness();
      const { f, waitFor, content } = h;
      try {
        f.sent.length = 0;
        f.fireEvent('client.disconnect', undefined);
        f.fireEvent('client.connect', undefined);
        f.fireEvent('proxy.session', session);
        f.fireEvent('proxy.session', session);
        f.fireEvent('gmcp', { path: 'char.state', value: {} });
        f.fireEvent('gmcp.char.info', { name: 'Tester' });
        f.fireEvent('gmcp.mail.state', { unread: true, unreceived: false, unsent: false });
        f.fire(' [ POCZTA ] Masz nowa poczte od Foo.');
        await new Promise((resolve) => setTimeout(resolve, 80));

        assert.equal(
          f.sent.length,
          0,
          `replay i automatyczne sygnaly nie wysylaja komend: ${JSON.stringify(f.sent)}`,
        );
        assert.ok(!f.sent.includes('q'));
        assert.ok(!f.sent.includes('~q'));
        assert.ok(!notifyText(f, 'Ponow ja, gdy bedziesz gotowy'), 'bez komunikatu podczas bezczynnosci');

        click(h, '[data-box="odebrane"]');
        await waitFor(
          () => f.sent.filter((command) => command === 'listy odebrane').length === 1,
          'dokladnie jedno reczne ponowienie',
        );
        f.fire('Nie masz zadnych odebranych listow.', 'mail');
        await waitFor(
          () => ((content.querySelector('.arkmail-busy') as { textContent?: string | null } | null)?.textContent ?? 'missing') === '',
          'koniec recznego ponowienia',
        );
        assert.deepEqual(f.sent, ['listy odebrane'], 'ponowienie nie uruchamia dodatkowych operacji');
      } finally {
        await stopHarness();
      }
    });
  }
});

test('replay przerywa reczna operacje z jednym komunikatem i odrzuca jej wynik', async () => {
  const h = await startHarness();
  const { f, waitFor, content } = h;
  try {
    click(h, '[data-box="odebrane"]');
    await waitFor(() => f.sent.includes('listy odebrane'), 'reczny listing przed replayem');

    f.fireEvent('proxy.session', { resumed: true, upstreamClosed: false, replayedBytes: 128 });
    f.fireEvent('proxy.session', { resumed: true, upstreamClosed: false, replayedBytes: 128 });
    await waitFor(
      () => notifyText(f, 'Ponow ja, gdy bedziesz gotowy'),
      'jeden komunikat o przerwaniu recznej operacji',
    );
    const warnings = f.shown.filter((entry) =>
      String((entry as { text?: string }).text ?? '').includes('Ponow ja, gdy bedziesz gotowy'),
    );
    assert.equal(warnings.length, 1, 'powtorzony replay nie powtarza komunikatu');

    f.fire('Listy odebrane:', 'mail');
    f.fire(' 1. *R* Temat: spozniony', 'mail');
    f.fire('Nadawca: Foo                        Wt, 24 VIII 1999, 00:11:12', 'mail');
    f.fire('> ', 'prompt');
    await new Promise((resolve) => setTimeout(resolve, 50));
    assert.equal(content.querySelector('.arkmail-entry'), null, 'spozniony listing nie zmienia widoku');
    click(h, '[data-tab="archiwum"]');
    assert.equal(
      content.querySelector('.arkmail-arch-entry'),
      null,
      'spozniony listing nie zmienia archiwum',
    );
    click(h, '[data-tab="listy"]');
    assert.ok(!f.sent.includes('q'));
    assert.ok(!f.sent.includes('~q'));

    click(h, '[data-box="odebrane"]');
    await waitFor(
      () => f.sent.filter((command) => command === 'listy odebrane').length === 2,
      'reczne ponowienie po przerwaniu',
    );
    f.fire('Nie masz zadnych odebranych listow.', 'mail');
    await waitFor(
      () => ((content.querySelector('.arkmail-busy') as { textContent?: string | null } | null)?.textContent ?? 'missing') === '',
      'koniec ponowionej operacji',
    );
    assert.equal(f.sent.filter((command) => command === 'listy odebrane').length, 2);
  } finally {
    await stopHarness();
  }
});

test('replay podczas recznej poczty gracza informuje o przerwaniu bez q', async () => {
  const h = await startHarness();
  const { f, waitFor } = h;
  try {
    f.fire('→ listy', 'command');
    f.fireEvent('proxy.session', { resumed: true, upstreamClosed: false, replayedBytes: 128 });

    await waitFor(
      () => notifyText(f, 'Ponow ja, gdy bedziesz gotowy'),
      'komunikat o przerwaniu recznej poczty gracza',
    );
    assert.ok(!f.sent.includes('q'));
    assert.ok(!f.sent.includes('~q'));
  } finally {
    await stopHarness();
  }
});

test('replay podczas wysylki zwierzecia informuje o przerwaniu bez komend naprawczych', async () => {
  const h = await startHarness();
  const { f, waitFor } = h;
  try {
    click(h, '.arkmail-animal-send');
    await waitFor(() => f.sent.includes('wyslij zwierze'), 'wysylka zwierzecia przed replayem');
    f.fireEvent('proxy.session', { resumed: true, upstreamClosed: false, replayedBytes: 128 });

    await waitFor(
      () => notifyText(f, 'Ponow ja, gdy bedziesz gotowy'),
      'komunikat o przerwaniu wysylki zwierzecia',
    );
    assert.ok(!f.sent.includes('q'));
    assert.ok(!f.sent.includes('~q'));
  } finally {
    await stopHarness();
  }
});

test('replay podczas operacji automatycznej nie prosi o reczne ponowienie', async () => {
  const h = await startHarness();
  const { f, waitFor } = h;
  try {
    f.fire(' [ POCZTA ] Masz nowa poczte od Foo.');
    await waitFor(() => f.sent.includes('listy odebrane'), 'automatyczny listing przed replayem');

    f.fireEvent('proxy.session', { resumed: true, upstreamClosed: false, replayedBytes: 128 });
    await new Promise((resolve) => setTimeout(resolve, 50));

    assert.ok(!notifyText(f, 'Ponow ja, gdy bedziesz gotowy'));
    assert.ok(!f.sent.includes('q'));
    assert.ok(!f.sent.includes('~q'));
  } finally {
    await stopHarness();
  }
});

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
    f.fireEvent('proxy.session', { resumed: true, upstreamClosed: false, replayedBytes: 0 });

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

test('powtorne resety zachowuja formularz, archiwum i ustawienia bez komend', async () => {
  const h = await startHarness({
    archive: [{
      id: 'trwaly-list',
      box: 'odebrane',
      number: 1,
      party: 'Nadawca',
      subject: 'Trwaly temat',
      dateRaw: 'Wt, 24 VIII 1999, 00:11:12',
      sortKey: '1999-08-24 00:11:12',
      read: true,
      body: ['Trwala tresc.'],
    }],
    notifyEnabled: false,
    autoRefreshEnabled: false,
  });
  const { f, content } = h;
  try {
    click(h, '[data-tab="napisz"]');
    const values: Record<string, string> = {
      adresat: 'Odbiorca',
      temat: 'Roboczy temat',
      dw: 'Osoba',
      tresc: 'Robocza tresc',
    };
    for (const [field, value] of Object.entries(values)) {
      const input = content.querySelector(`[data-field="${field}"]`) as {
        value: string;
        dispatchEvent(event: unknown): void;
      };
      input.value = value;
      input.dispatchEvent(new h.window.Event('input'));
    }
    const sentBeforeResets = [...f.sent];

    f.fireEvent('client.disconnect', undefined);
    f.fireEvent('client.disconnect', undefined);
    f.fireEvent('client.connect', undefined);
    f.fireEvent('client.connect', undefined);
    f.fireEvent('proxy.session', { resumed: true, upstreamClosed: false, replayedBytes: 0 });
    f.fireEvent('proxy.session', { resumed: true, upstreamClosed: false, replayedBytes: 0 });
    f.fireEvent('gmcp_msg.system.login', {});
    f.fireEvent('gmcp_msg.system.login', {});

    assert.deepEqual(f.sent, sentBeforeResets, 'zadna powtorzona kontrola nie wysyla komendy');
    assert.ok(!f.sent.includes('q'));
    assert.ok(!f.sent.includes('~q'));
    for (const [field, value] of Object.entries(values)) {
      assert.equal(
        (content.querySelector(`[data-field="${field}"]`) as { value: string }).value,
        value,
        `formularz zachowuje pole ${field}`,
      );
    }
    click(h, '[data-tab="listy"]');
    assert.equal(
      (content.querySelector('.arkmail-auto-refresh-toggle') as { checked: boolean }).checked,
      false,
      'ustawienie automatycznego odswiezania zachowane',
    );
    assert.equal(
      (content.querySelector('.arkmail-notify-toggle') as { checked: boolean }).checked,
      false,
      'ustawienie powiadomien zachowane',
    );
    click(h, '[data-tab="archiwum"]');
    assert.match(
      String((content.querySelector('.arkmail-arch-entry') as { textContent?: string }).textContent ?? ''),
      /Trwaly temat/,
      'rekord archiwum pozostaje dostepny',
    );
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
