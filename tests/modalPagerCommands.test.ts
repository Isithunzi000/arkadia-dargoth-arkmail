import { test } from 'node:test';
import assert from 'node:assert/strict';

import type PluginApi from 'plugin-api';
import { DargothTransport } from '../src/arkmail/adapters/dargothTransport';
import type { ProtoLine } from '../src/arkmail/core/session/transport';
import {
  FakeApi,
  startHarness,
  stopHarness,
  loadTruncatedBox,
  click,
  waitRt,
  notifyText,
  type Harness,
} from './harness';

const PAGER_PROMPT = '[1-50 adefFhHmnqrsRux.!?-+<>] (aktualny: 1) -- ';
const CLOSED_MESSAGE =
  'Nie wykonano komendy pocztowej, poniewaz tryb czytania poczty zostal juz zamkniety. ' +
  'Otworz poczte recznie i powtorz komende.';

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
  for (const command of PAGER_COMMANDS) {
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
  test(`automatyczny odczyt: ${closeCommand} gracza wykonuje sie raz i wznowienie czeka na prompt`, async () => {
    const h = await startHarness();
    const { f } = h;
    try {
      await startRead(h);
      const listingsBefore = f.sent.filter((command) => command === 'listy odebrane').length;
      await f.api.command.send(closeCommand, true);
      f.fire(PAGER_PROMPT, 'mail');
      await waitRt(() => f.sent.includes(closeCommand), `${closeCommand} gracza`);
      await drain(); // modal konczy sie przed zdjeciem koalescencji q/x do promptu
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
    test(`automatyczny odczyt: kolejkowane ${closeCommand} bez echa konczy sie dopiero zwyklym promptem`, async () => {
      const h = await startHarness();
      const { f } = h;
      try {
        await startRead(h);
        const listingsBefore = f.sent.filter((command) => command === 'listy odebrane').length;
        await f.api.command.send(closeCommand, true);
        f.fire(PAGER_PROMPT, 'mail');
        await waitRt(() => f.sent.includes(closeCommand), `${closeCommand} gracza bez echa`);
        await drain(); // modal konczy sie przed zdjeciem koalescencji q/x do promptu
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
          assert.ok(notifyText(f, 'Przed pobieraniem tresci zamknij poczte otwarta w grze'), 'pobieranie czeka na prompt');
          assert.equal(f.sent.length, commandsBefore, 'blokada pobierania nie wysyla komendy');
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
    await drain(); // modal konczy sie przed zdjeciem koalescencji q/x do promptu
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
    test(`automatyczny odczyt: reczne ${closeCommand} po automatycznym q jest wspolnym zamknieciem (echo=${withEcho})`, async () => {
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
        await waitRt(() => f.hookCb === null, 'koniec modalu po wspolnym zamknieciu');
        await drain();

        assert.equal(f.sent.filter((command) => command === 'q' || command === 'x').length, 1, 'jedno wspolne zamkniecie');
        assert.ok(!notifyText(f, CLOSED_MESSAGE), 'reczne zamkniecie nie jest odrzucane');
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

  test(`automatyczny odczyt: pozny prompt i powtorzone ${closeCommand} nie wysylaja drugiego zamkniecia`, async () => {
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
      assert.equal(f.sent.filter((command) => command === 'q' || command === 'x').length, 1, 'brak drugiego zamkniecia');

      f.fire('> ', 'prompt');
      await waitRt(() => f.hookCb === null, 'koniec modalu po poznym prompcie');
      await drain();
      assert.ok(!notifyText(f, CLOSED_MESSAGE), 'powtorzone zamkniecie nie jest odrzucane');
    } finally {
      f.fire('> ', 'prompt');
      await stopHarness();
    }
  });

  test(`automatyczny odczyt: powtorzone ${closeCommand} przed rozpoznaniem pagera nie jest odrzucane`, async () => {
    const h = await startHarness();
    const { f } = h;
    try {
      await startRead(h);
      await f.api.command.send(closeCommand, true);
      await f.api.command.send(closeCommand, true);
      assert.ok(!f.sent.includes(closeCommand), 'zamkniecie czeka na pager');
      f.fire(PAGER_PROMPT, 'mail');
      await waitRt(() => f.sent.includes(closeCommand), 'zamkniecie po rozpoznaniu pagera');
      await drain(); // modal konczy sie przed zdjeciem koalescencji q/x do promptu
      await drain();
      assert.equal(f.sent.filter((command) => command === 'q' || command === 'x').length, 1, 'jedno zamkniecie gracza');
      assert.ok(!notifyText(f, CLOSED_MESSAGE), 'drugie identyczne zamkniecie jest koalescencja, nie bledem');
    } finally {
      f.fire('> ', 'prompt');
      await stopHarness();
    }
  });
}

// Kontrola typu na wypadek przypadkowej zmiany podpisow API w tescie.
const _apiTypeCheck: PluginApi = new FakeApi().api;
void _apiTypeCheck;
