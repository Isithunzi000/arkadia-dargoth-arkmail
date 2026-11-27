import { test } from 'node:test';
import assert from 'node:assert/strict';

import type PluginApi from 'plugin-api';
import { DargothTransport } from '../src/arkmail/adapters/dargothTransport';
import type { ProtoLine } from '../src/arkmail/core/session/transport';
import {
  clearPagerOrphan,
  isPagerOrphanSuspected,
  suspectPagerOrphan,
} from '../src/arkmail/core/session/orphanPager';
import {
  FakeApi,
  startHarness,
  stopHarness,
  loadTruncatedBox,
  click,
  waitRt,
  notifyText,
  textOf,
  type Harness,
} from './harness';

const PAGER_PROMPT = '[1-50 adefFhHmnqrsRux.!?-+<>] (aktualny: 1) -- ';
const CLOSED_MESSAGE =
  'Nie wykonano komend odlozonych podczas operacji pocztowej. ' +
  'Powtorz je po powrocie do zwyklego widoku gry.';

const PAGER_COMMANDS = [
  'h',
  'H Foo',
  '.',
  '17',
  '<',
  '>',
  '',
  '?',
  'r',
  'R 7',
  'm',
  'f 2 Foo',
  'F Foo',
  'a Foo',
  'd 1-3',
  'u 2',
  '- 1-2',
  '+ 3',
  'e',
  'n 4',
  'x',
  'q',
] as const;

interface PagerHooks {
  onUserCommand: (command: string) => void;
  onCommandDropped: () => void;
}

function beginPagerModal(transport: DargothTransport, pager: PagerHooks): void {
  // Rzutowanie pozwala zapisac nowy kontrakt testu przed implementacja.
  (transport as unknown as {
    beginModal(options?: { pager?: PagerHooks }): void;
  }).beginModal({ pager });
}

function armedTransport(f: FakeApi): DargothTransport {
  const transport = new DargothTransport(f.api);
  transport.setOnline(true);
  return transport;
}

async function drain(): Promise<void> {
  for (let i = 0; i < 8; i++) await new Promise((resolve) => setImmediate(resolve));
}

test('modal pagera: kazda komenda czytania trafia raz do otwartego pagera jako komenda gracza', async () => {
  for (const command of PAGER_COMMANDS) {
    const f = new FakeApi();
    const transport = armedTransport(f);
    const seen: ProtoLine[] = [];
    transport.subscribe((line) => seen.push(line));
    let takeovers = 0;
    const takenCommands: string[] = [];
    let dropped = 0;
    try {
      beginPagerModal(transport, {
        onUserCommand: (command) => { takeovers++; takenCommands.push(command); },
        onCommandDropped: () => { dropped++; },
      });
      f.fire(PAGER_PROMPT, 'mail');
      await f.api.command.send(command, true);
      await drain();
      assert.deepEqual(
        f.sent.map((value, index) => ({ command: value, echo: f.sentEcho[index] })),
        [{ command, echo: true }],
        `otwarty pager: ${JSON.stringify(command)}`,
      );
      assert.equal(takeovers, 1, `jedno przejecie: ${JSON.stringify(command)}`);
      assert.deepEqual(takenCommands, [command], `tresc przejetej komendy: ${JSON.stringify(command)}`);
      assert.equal(dropped, 0, `brak odrzucenia: ${JSON.stringify(command)}`);
      const echo = command === '' ? '→ ' : `→ ${command}`;
      seen.length = 0;
      f.fire(echo, 'info');
      assert.notEqual(seen[0]?.own, true, `zrodlo gracza: ${JSON.stringify(command)}`);
    } finally {
      transport.setOnline(false);
      transport.dispose();
    }
  }
});

test('modal pagera: komenda czytania po zamkniciu pagera jest odrzucana, nie odtwarzana do gry', async () => {
  for (const command of PAGER_COMMANDS.filter((value) => value !== 'q' && value !== 'x')) {
    const f = new FakeApi();
    const transport = armedTransport(f);
    let takeovers = 0;
    let dropped = 0;
    try {
      beginPagerModal(transport, {
        onUserCommand: () => { takeovers++; },
        onCommandDropped: () => { dropped++; },
      });
      await f.api.command.send(command, true);
      transport.endModal();
      await drain();
      assert.deepEqual(f.sent, [], `zamkniety pager: ${JSON.stringify(command)}`);
      assert.equal(takeovers, 0, `bez przejecia: ${JSON.stringify(command)}`);
      assert.equal(dropped, 1, `jeden komunikat: ${JSON.stringify(command)}`);
    } finally {
      transport.setOnline(false);
      transport.dispose();
    }
  }
});

test('modal edytora: wykrzyknik zachowuje jawne wykonanie poza trybem czytania', async () => {
  const f = new FakeApi();
  const transport = armedTransport(f);
  transport.beginModal();
  await f.api.command.send('!r', true);
  transport.endModal();
  await drain();
  assert.deepEqual(f.sent, ['!r']);
  assert.deepEqual(f.sentEcho, [true]);
  transport.dispose();
});

test('modal pagera: komendy niezalezne i wykrzyknik zachowuja kolejnosc, prefiks i pojedyncze wykonanie', async () => {
  const f = new FakeApi();
  const transport = armedTransport(f);
  let dropped = 0;
  beginPagerModal(transport, {
    onUserCommand: () => assert.fail('komenda niezalezna nie przejmuje pagera'),
    onCommandDropped: () => { dropped++; },
  });
  await f.api.command.send('pomoc', true);
  await f.api.command.send('!r', true);
  await f.api.command.send('spojrz', true);
  transport.endModal();
  await drain();
  assert.deepEqual(f.sent, ['pomoc', '!r', 'spojrz']);
  assert.deepEqual(f.sentEcho, [true, true, true]);
  assert.equal(dropped, 0);
  transport.dispose();
});

for (const closeCommand of ['q', 'x'] as const) {
  test(`modal pagera: reczne ${closeCommand} przed promptem przechodzi od razu i nie jest koalescencja`, async () => {
    const f = new FakeApi();
    const transport = armedTransport(f);
    const taken: string[] = [];
    try {
      beginPagerModal(transport, {
        onUserCommand: (command) => {
          taken.push(command);
          transport.setPlayerMailMode(true);
        },
        onCommandDropped: () => {},
      });
      await f.api.command.send(closeCommand, true);
      await f.api.command.send(closeCommand, true);
      await drain();

      assert.deepEqual(f.sent, [closeCommand, closeCommand], 'kazde reczne polecenie przechodzi raz');
      assert.deepEqual(f.sentEcho, [true, true]);
      assert.deepEqual(taken, [closeCommand, closeCommand], 'kazde zamkniecie wstrzymuje automatyzacje');
      assert.equal(transport.modalQueueLength, 0, 'reczne zamkniecie nie trafia do kolejki');
      await assert.rejects(transport.send('listy odebrane'), /operacja anulowana/);
      f.fire(PAGER_PROMPT, 'mail');
      await drain();
      assert.deepEqual(f.sent, [closeCommand, closeCommand], 'pozny prompt nie wytwarza drugiej kopii');
    } finally {
      transport.setOnline(false);
      transport.dispose();
    }
  });

  test(`modal pagera: reczne ${closeCommand} po automatycznym q przechodzi bez echa i bez koalescencji`, async () => {
    const f = new FakeApi();
    const transport = armedTransport(f);
    const taken: string[] = [];
    try {
      beginPagerModal(transport, {
        onUserCommand: (command) => {
          taken.push(command);
          transport.setPlayerMailMode(true);
        },
        onCommandDropped: () => {},
      });
      f.fire(PAGER_PROMPT, 'mail');
      await transport.send('q');
      await drain();
      await f.api.command.send(closeCommand, false);
      await drain();

      assert.deepEqual(f.sent, ['q', closeCommand], 'automatyczne q nie polyka polecenia gracza');
      assert.deepEqual(f.sentEcho, [false, false]);
      assert.deepEqual(taken, [closeCommand]);
      assert.equal(transport.modalQueueLength, 0);
    } finally {
      transport.setOnline(false);
      transport.dispose();
    }
  });
}

async function startRead(h: Harness): Promise<void> {
  const { f } = h;
  await loadTruncatedBox(h);
  click(h, '.arkmail-entry');
  await waitRt(() => f.sent.includes('listy odebrane przed 25 VIII 1999'), 're-kotwica');
  f.fire('Listy odebrane (prezentowane jest pierwsze 50):', 'mail');
  f.fire(' 1. *R* Temat: najnowszy', 'mail');
  f.fire('Nadawca: Corge                       Wt, 24 VIII 1999, 00:11:12', 'mail');
  f.fire('> ', 'prompt');
  await waitRt(() => f.sent.includes('przeczytaj list 1'), 'odczyt listu');
  f.fire('List : 1', 'mail');
  f.fire('Od   : Corge', 'mail');
  f.fire('Temat: najnowszy', 'mail');
  f.fire('Data : Wt, 24 VIII 1999, 00:11:12', 'mail');
  f.fire('', 'mail');
  f.fire('Tresc pierwszego.', 'mail');
}

test('automatyczny odczyt: kolejkowane r przejmuje otwarty pager przed pluginowym q', async () => {
  const h = await startHarness();
  const { f } = h;
  try {
    await startRead(h);
    await f.api.command.send('r', true);
    assert.ok(!f.sent.includes('r'), 'r jest wstrzymane przed otwarciem pagera');
    f.fire(PAGER_PROMPT, 'mail');
    await waitRt(() => f.sent.includes('r'), 'r w tym samym pagerze');
    await waitRt(() => f.hookCb === null, 'koniec modalu po przejeciu');
    assert.equal(f.sent.filter((command) => command === 'r').length, 1, 'dokladnie jedno r');
    assert.equal(f.sentEcho[f.sent.indexOf('r')], true, 'r zachowuje zrodlo gracza');
    assert.ok(!f.sent.includes('q'), 'ArkMail nie zamyka przejetego pagera');
  } finally {
    f.fire('> ', 'prompt');
    await stopHarness();
  }
});

test('automatyczny odczyt: po zamknieciu pagera r nie trafia do zwyklego trybu gry', async () => {
  const h = await startHarness();
  const { f } = h;
  try {
    await startRead(h);
    f.fire(PAGER_PROMPT, 'mail');
    await waitRt(() => f.sent.includes('q'), 'automatyczne zamkniecie bez przejecia');
    await f.api.command.send('r', true);
    f.fire('> ', 'prompt');
    await waitRt(() => f.hookCb === null, 'koniec modalu');
    await drain();
    assert.ok(!f.sent.includes('r'), 'r zostalo odrzucone zamiast wykonane poza pagerem');
    assert.ok(notifyText(f, CLOSED_MESSAGE), 'komunikat wyjasnia odrzucenie');
  } finally {
    await stopHarness();
  }
});

for (const closeCommand of ['q', 'x'] as const) {
  test(`automatyczny odczyt: ${closeCommand} gracza odblokowuje UI od razu, a automatyzacja czeka na prompt`, async () => {
    const h = await startHarness();
    const { f } = h;
    try {
      await startRead(h);
      const listingsBefore = f.sent.filter((command) => command === 'listy odebrane').length;
      suspectPagerOrphan();
      await f.api.command.send(closeCommand, true);
      assert.equal(isPagerOrphanSuspected(), false, 'przejecie przez gracza czysci stare podejrzenie');
      f.fire(PAGER_PROMPT, 'mail');
      await waitRt(() => f.sent.includes(closeCommand), `${closeCommand} gracza`);
      await drain(); // dajemy zakonczyc przetwarzanie poznego promptu
      assert.equal(f.sent.filter((command) => command === closeCommand).length, 1, 'jedno zamkniecie');
      assert.equal(f.sentEcho[f.sent.indexOf(closeCommand)], true, 'zamkniecie pochodzi od gracza');
      f.fire(`→ ${closeCommand}`, 'info');
      f.fire(PAGER_PROMPT, 'mail');
      await new Promise((resolve) => setTimeout(resolve, 300));
      assert.equal(
        f.sent.filter((command) => command === 'listy odebrane').length,
        listingsBefore,
        'bez wznowienia przed zwyklym promptem',
      );
      if (closeCommand === 'q') {
        click(h, '[data-tab="archiwum"]');
        click(h, '.arkmail-arch-download');
        click(h, '.arkmail-arch-download');
        await waitRt(
          () => f.sent.includes('listy odebrane przed 25 VIII 1999'),
          'reczna operacja startuje od razu po echu q',
        );
        assert.ok(
          !notifyText(f, 'Najpierw zakoncz reczna sesje poczty w grze, a potem powtorz operacje w ArkMailu.'),
          'samo echo odblokowuje lokalna operacje',
        );
        assert.equal(
          f.sent.filter((command) => command === 'listy odebrane').length,
          listingsBefore,
          'reczna operacja nie wznawia automatycznego odswiezania',
        );
        click(h, '.arkmail-arch-download');
        f.fire('Nie masz zadnych odebranych listow.', 'mail');
        await waitRt(() => textOf(h, '.arkmail-busy') === '', 'koniec recznego pobierania przed wznowieniem');
      }
      f.fire('> ', 'prompt');
      await waitRt(
        () => f.sent.filter((command) => command === 'listy odebrane').length > listingsBefore,
        'wznowienie po zwyklym prompcie',
      );
      f.fire('Nie masz zadnych odebranych listow.', 'mail');
      await waitRt(() => f.sent.includes('listy nieprzeczytane'), 'druga skrzynka');
      f.fire('Nie masz zadnych nieprzeczytanych listow.', 'mail');
    } finally {
      f.fire('> ', 'prompt');
      await stopHarness();
    }
  });
}

for (const closeCommand of ['q', 'x'] as const) {
    test(`automatyczny odczyt: reczne ${closeCommand} bez echa odblokowuje UI, a automatyzacja czeka na prompt`, async () => {
      const h = await startHarness();
      const { f } = h;
      try {
        await startRead(h);
        const listingsBefore = f.sent.filter((command) => command === 'listy odebrane').length;
        await f.api.command.send(closeCommand, true);
        f.fire(PAGER_PROMPT, 'mail');
        await waitRt(() => f.sent.includes(closeCommand), `${closeCommand} gracza bez echa`);
        await drain(); // dajemy zakonczyc przetwarzanie poznego promptu
        assert.equal(f.sent.filter((command) => command === closeCommand).length, 1, 'jedno zamkniecie');
        f.fire(PAGER_PROMPT, 'mail');
        await new Promise((resolve) => setTimeout(resolve, 300));
        assert.equal(
          f.sent.filter((command) => command === 'listy odebrane').length,
          listingsBefore,
          'prompt pagera nie zastepuje zwyklego promptu',
        );

        const checkDownload = closeCommand === 'q';
        if (checkDownload) {
          click(h, '[data-tab="archiwum"]');
          const commandsBefore = f.sent.length;
          click(h, '.arkmail-arch-download');
          click(h, '.arkmail-arch-download');
          assert.ok(
            !notifyText(f, 'Najpierw zakoncz reczna sesje poczty w grze, a potem powtorz operacje w ArkMailu.'),
            'przejecie q/x natychmiast odblokowuje lokalna operacje',
          );
          await waitRt(
            () => f.sent.length > commandsBefore,
            'reczna operacja przechodzi bez czekania na prompt',
          );
          assert.ok(
            f.sent.includes('listy odebrane przed 25 VIII 1999'),
            'odblokowana operacja wysyla wlasna kotwice',
          );
          assert.equal(
            f.sent.filter((command) => command === 'listy odebrane').length,
            listingsBefore,
            'automatyczny listing nadal czeka na zwykly prompt',
          );
          click(h, '.arkmail-arch-download');
          f.fire('Nie masz zadnych odebranych listow.', 'mail');
          await waitRt(() => textOf(h, '.arkmail-busy') === '', 'koniec recznego pobierania bez echa');
        }

        // Swiadomie bez linii "→ q/x": komenda z hooka jest jedynym sygnalem zamkniecia.
        f.fire('> ', 'prompt');
        await waitRt(
          () => f.sent.filter((command) => command === 'listy odebrane').length > listingsBefore,
          'wznowienie bez echa po zwyklym prompcie',
        );
        if (checkDownload) {
          f.fire('Listy odebrane (prezentowane jest pierwsze 50):', 'mail');
          f.fire(' 3. *R* Temat: najstarszy', 'mail');
          f.fire('Nadawca: Foo                        Nd, 22 VIII 1999, 01:15:04', 'mail');
          f.fire(' 2. *R* Temat: srodkowy', 'mail');
          f.fire('Nadawca: Foo                        Pn, 23 VIII 1999, 02:20:05', 'mail');
          f.fire(' 1. *R* Temat: najnowszy', 'mail');
          f.fire('Nadawca: Corge                       Wt, 24 VIII 1999, 00:11:12', 'mail');
          f.fire('> ', 'prompt');
        } else {
          f.fire('Nie masz zadnych odebranych listow.', 'mail');
        }
        await waitRt(() => f.sent.includes('listy nieprzeczytane'), 'druga skrzynka bez echa');
        f.fire('Nie masz zadnych nieprzeczytanych listow.', 'mail');
        if (checkDownload) {
          await waitRt(
            () => ((h.content.querySelector('.arkmail-busy') as { textContent?: string | null } | null)?.textContent ?? 'missing') === '',
            'koniec odswiezenia przed pobieraniem',
          );
          click(h, '[data-tab="archiwum"]');
          click(h, '.arkmail-arch-download');
          click(h, '.arkmail-arch-download');
          await waitRt(
            () => f.sent.some((command) => command.startsWith('listy odebrane przed')),
            'istniejace pobieranie tresci po zamknieciu',
          );
        }
      } finally {
        f.fire('> ', 'prompt');
        await stopHarness();
      }
    });
}

test('automatyczny odczyt: prompt przed echem q konczy tryb, a pozne i powtorzone echo jest bezsilne', async () => {
  const h = await startHarness();
  const { f } = h;
  try {
    await startRead(h);
    const listingsBefore = f.sent.filter((command) => command === 'listy odebrane').length;
    await f.api.command.send('q', true);
    f.fire(PAGER_PROMPT, 'mail');
    await waitRt(() => f.sent.includes('q'), 'q gracza');
    await drain(); // dajemy zakonczyc przetwarzanie poznego promptu
    f.fire('> ', 'prompt');
    await waitRt(
      () => f.sent.filter((command) => command === 'listy odebrane').length > listingsBefore,
      'prompt przed echem zdejmuje blokade',
    );
    f.fire('→ q', 'info');
    f.fire('→ q', 'info');
    f.fire('Nie masz zadnych odebranych listow.', 'mail');
    await waitRt(() => f.sent.includes('listy nieprzeczytane'), 'pozne echo nie blokuje drugiej skrzynki');
    f.fire('Nie masz zadnych nieprzeczytanych listow.', 'mail');
    assert.equal(f.sent.filter((command) => command === 'q').length, 1, 'pozne echo nie wysyla drugiego q');
  } finally {
    f.fire('> ', 'prompt');
    await stopHarness();
  }
});

for (const closeCommand of ['q', 'x'] as const) {
  for (const withEcho of [false, true]) {
    test(`automatyczny odczyt: reczne ${closeCommand} po automatycznym q jest osobna komenda (echo=${withEcho})`, async () => {
      const h = await startHarness();
      const { f } = h;
      try {
        await startRead(h);
        f.fire(PAGER_PROMPT, 'mail');
        await waitRt(() => f.sent.includes('q'), 'automatyczne zamkniecie');
        const listingsBefore = f.sent.filter((command) => command === 'listy odebrane').length;

        await f.api.command.send(closeCommand, true);
        if (withEcho) f.fire(`→ ${closeCommand}`, 'info');
        f.fire('> ', 'prompt');
        await waitRt(() => f.hookCb === null, 'koniec modalu po przejeciu');
        await drain();

        const closes = f.sent.filter((command) => command === 'q' || command === 'x');
        assert.deepEqual(closes, ['q', closeCommand], 'automatyczne i reczne zamkniecie to osobne komendy');
        assert.equal(f.sentEcho[f.sent.lastIndexOf(closeCommand)], true, 'echo zostaje przy recznej komendzie');
        assert.ok(!notifyText(f, CLOSED_MESSAGE), 'reczne zamkniecie nie jest odrzucane');
        assert.ok(!textOf(h, '.arkmail-letter-body').includes('Tresc pierwszego.'), 'przejecie anuluje automatyczny odczyt');
        await waitRt(
          () => f.sent.filter((command) => command === 'listy odebrane').length > listingsBefore,
          'wznowienie po recznym zamknieciu',
        );
        f.fire('Nie masz zadnych odebranych listow.', 'mail');
        await waitRt(() => f.sent.includes('listy nieprzeczytane'), 'druga skrzynka po odzyskaniu');
        f.fire('Nie masz zadnych nieprzeczytanych listow.', 'mail');
      } finally {
        f.fire('> ', 'prompt');
        await stopHarness();
      }
    });
  }

  test(`automatyczny odczyt: pozny prompt nie zmienia dwoch recznych ${closeCommand} po automatycznym q`, async () => {
    const h = await startHarness();
    const { f } = h;
    try {
      await startRead(h);
      f.fire(PAGER_PROMPT, 'mail');
      await waitRt(() => f.sent.includes('q'), 'automatyczne zamkniecie');
      await f.api.command.send(closeCommand, true);
      await f.api.command.send(closeCommand, true);
      f.fire(PAGER_PROMPT, 'mail');
      await drain();
      assert.equal(
        f.sent.filter((command) => command === 'q' || command === 'x').length,
        3,
        'automatyczne q i oba reczne polecenia przechodza bez koalescencji',
      );

      f.fire('> ', 'prompt');
      await waitRt(() => f.hookCb === null, 'koniec modalu po poznym prompcie');
      await drain();
      assert.ok(!notifyText(f, CLOSED_MESSAGE), 'powtorzone zamkniecie nie jest odrzucane');
    } finally {
      f.fire('> ', 'prompt');
      await stopHarness();
    }
  });

  test(`automatyczny odczyt: powtorzone ${closeCommand} przed rozpoznaniem pagera przechodzi od razu`, async () => {
    const h = await startHarness();
    const { f } = h;
    try {
      await startRead(h);
      await f.api.command.send(closeCommand, true);
      await f.api.command.send(closeCommand, true);
      assert.equal(
        f.sent.filter((command) => command === closeCommand).length,
        2,
        'oba polecenia przechodza przed promptem',
      );
      f.fire(PAGER_PROMPT, 'mail');
      await drain();
      assert.equal(
        f.sent.filter((command) => command === 'q' || command === 'x').length,
        2,
        'pozny prompt nie wytwarza automatycznego q',
      );
      assert.ok(!notifyText(f, CLOSED_MESSAGE), 'powtorzone reczne zamkniecie nie jest bledem');
    } finally {
      f.fire('> ', 'prompt');
      await stopHarness();
    }
  });
}

test('automatyczny odczyt: reczne q odblokowuje UI od razu, a automatyzacja nie zalezy od limitu ciszy', async (context) => {
  const h = await startHarness();
  const { f } = h;
  let mocked = false;
  try {
    await startRead(h);
    const listingsBefore = f.sent.filter((command) => command === 'listy odebrane').length;

    await f.api.command.send('q', true);
    f.fire(PAGER_PROMPT, 'mail');
    await drain();
    assert.equal(f.sent.filter((command) => command === 'q').length, 1, 'jedno reczne q');

    click(h, '[data-tab="archiwum"]');
    click(h, '.arkmail-arch-download');
    click(h, '.arkmail-arch-download');
    await drain();
    assert.ok(
      f.sent.includes('listy odebrane przed 25 VIII 1999'),
      'reczna operacja nie czeka na prompt ani limit czasu',
    );
    click(h, '.arkmail-arch-download');
    f.fire('Nie masz zadnych odebranych listow.', 'mail');
    await waitRt(() => textOf(h, '.arkmail-busy') === '', 'koniec recznego pobierania przed cisza');

    context.mock.timers.enable({ apis: ['setTimeout'] });
    mocked = true;
    f.fire(PAGER_PROMPT, 'mail');
    context.mock.timers.tick(180_000);
    await drain();
    assert.equal(
      f.sent.filter((command) => command === 'listy odebrane').length,
      listingsBefore,
      'zadna cisza nie wznawia automatyzacji bez zwyklego promptu',
    );

    context.mock.timers.reset();
    mocked = false;
    f.fire('> ', 'prompt');
    await waitRt(
      () => f.sent.filter((command) => command === 'listy odebrane').length > listingsBefore,
      'dopiero zwykly prompt wznawia automatyzacje',
    );
  } finally {
    if (mocked) context.mock.timers.reset();
    f.fire('> ', 'prompt');
    await stopHarness();
  }
});

// Kontrola typu na wypadek przypadkowej zmiany podpisow API w tescie.
const _apiTypeCheck: PluginApi = new FakeApi().api;
void _apiTypeCheck;
