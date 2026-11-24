/** Wlasne przejscie na koncu listu nie moze zostawic pagera na kolejnym liscie. */
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { MockTransport, type ProtoLine } from '../src/arkmail/core/session/transport';
import { PagerSession } from '../src/arkmail/core/session/pager';
import {
  startHarness,
  stopHarness,
  loadTruncatedBox,
  click,
  notifyText,
  textOf,
  waitRt,
  type Harness,
} from './harness';

const OPTS = { timeoutMs: 1000, idleMs: 40 };
const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

type Settled<T> = { ok: true; value: T } | { ok: false; error: unknown };
const settle = <T>(promise: Promise<T>): Promise<Settled<T>> => promise.then(
  (value) => ({ ok: true as const, value }),
  (error) => ({ ok: false as const, error }),
);

const HEADERS: ProtoLine[] = [
  { cls: 'mail', text: 'List : 1' },
  { cls: 'mail', text: 'Od   : Foo' },
  { cls: 'mail', text: 'Temat: syntetyczny' },
  { cls: 'mail', text: 'Data : Wt, 24 VIII 1999, 00:11:12' },
];

const prompt = (current: number): ProtoLine => ({
  cls: 'mail',
  text: `[1-50 adefFhHmnqrsRux.!?-+<>] (aktualny: ${current}) -- `,
});

async function waitFor(predicate: () => boolean, label: string): Promise<void> {
  for (let attempt = 0; attempt < 200; attempt++) {
    if (predicate()) return;
    await sleep(5);
  }
  assert.fail(`Nie osiagnieto stanu: ${label}`);
}

test('wlasne przejscie otwiera kolejny list: zamknij pager i zwroc tylko zadany list', async () => {
  const transport = new MockTransport();
  const pager = new PagerSession(transport, OPTS);
  const operation = settle(pager.readLetter(1));
  const blanks = () => transport.sent.filter((command) => command === '').length;

  await transport.replay([...HEADERS, { cls: 'mail', text: 'Strona pierwsza.' }]);
  await waitFor(() => blanks() === 1, 'pierwsze puste przejscie');
  await transport.replay([{ cls: 'mail', text: 'Strona druga.' }]);
  await waitFor(() => blanks() === 2, 'drugie puste przejscie');
  await transport.replay([{ cls: 'mail', text: 'Koniec zadanego listu.' }]);
  await waitFor(() => blanks() === 3, 'przejscie po ostatniej stronie');

  // Serwer nie pokazal koncowego promptu przed przejsciem. Pusty Enter
  // otwiera kolejny list; jego naglowki i tresc nie naleza do wyniku.
  await transport.replay([
    { cls: 'mail', text: 'List : 2' },
    { cls: 'mail', text: 'Od   : Bar' },
    { cls: 'mail', text: 'Temat: kolejny syntetyczny' },
    { cls: 'mail', text: 'Data : Wt, 24 VIII 1999, 00:12:12' },
    { cls: 'mail', text: 'Tresc kolejnego listu.' },
    prompt(2),
  ]);
  await waitFor(() => transport.sent.includes('q'), 'zamkniecie wlasnego pagera');
  await transport.replay([{ cls: 'prompt', text: '> ' }]);
  const result = await operation;

  assert.ok(result.ok, 'odczyt konczy sie bez recovery');
  assert.equal(transport.sent.filter((command) => command === 'q').length, 1, 'dokladnie jedno q');
  if (!result.ok) return;
  assert.equal(result.value.letter.number, 1);
  assert.deepEqual(result.value.letter.body, [
    'Strona pierwsza.',
    'Strona druga.',
    'Koniec zadanego listu.',
  ]);
});

test('niezgodny numer bez wlasnego przejscia: nadal cudzy pager i zakaz automatycznego q', async () => {
  const transport = new MockTransport();
  const pager = new PagerSession(transport, OPTS);
  const operation = settle(pager.readLetter(1));

  await transport.replay([
    ...HEADERS,
    { cls: 'mail', text: 'Tresc zadanego listu.' },
    prompt(2),
    { cls: 'prompt', text: '> ' },
  ]);
  const result = await operation;

  assert.equal(result.ok, false, 'niejednoznaczna odpowiedz pozostaje odrzucona');
  assert.equal(transport.sent.includes('q'), false, 'cudzego pagera nie zamykamy');
});

function fireListing3(h: Harness): void {
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

async function beginOpen(h: Harness): Promise<void> {
  const { f } = h;
  await loadTruncatedBox(h);
  click(h, '.arkmail-entry');
  await waitRt(() => f.sent.includes('listy odebrane przed 25 VIII 1999'), 're-kotwica odczytu');
  fireListing3(h);
  await waitRt(() => f.sent.includes('przeczytaj list 1'), 'komenda odczytu');
}

function fireOlderPage(h: Harness): void {
  const { f } = h;
  f.fire('Wybrane listy odebrane:', 'mail');
  f.fire('50. *R* Temat: starszy syntetyczny', 'mail');
  f.fire('Nadawca: Waldo                          Nd, 15 VIII 1999, 10:00:00', 'mail');
}

test('integracja: po wlasnym przejsciu Wczytaj starsze dziala bez odzyskiwania', async () => {
  const h = await startHarness();
  const { f } = h;
  const blanks = () => f.sent.filter((command) => command === '').length;
  try {
    await beginOpen(h);
    const refreshBefore = f.sent.filter((command) => command === 'listy odebrane').length;
    for (const [index, body] of [
      'Strona pierwsza.',
      'Strona druga.',
      'Koniec zadanego listu.',
    ].entries()) {
      if (index === 0) {
        for (const line of HEADERS) f.fire(line.text, line.cls);
      }
      f.fire(body, 'mail');
      await waitRt(() => blanks() === index + 1, `puste przejscie ${index + 1}`);
    }
    f.fire('List : 2', 'mail');
    f.fire('Od   : Bar', 'mail');
    f.fire('Temat: kolejny syntetyczny', 'mail');
    f.fire('Data : Wt, 24 VIII 1999, 00:12:12', 'mail');
    f.fire('Tresc kolejnego listu.', 'mail');
    f.fire(prompt(2).text, 'mail');
    await waitRt(() => f.sent.filter((command) => command === 'q').length === 1, 'jedno q');
    f.fire('> ', 'prompt');
    await waitRt(() => !!h.content.querySelector('.arkmail-letter-body'), 'otwarty zadany list');
    assert.ok(textOf(h, '.arkmail-letter-body').includes('Koniec zadanego listu.'));
    assert.ok(!textOf(h, '.arkmail-letter-body').includes('Tresc kolejnego listu.'));

    await waitRt(
      () => f.sent.filter((command) => command === 'listy odebrane').length === refreshBefore + 1,
      'odswiezenie po odczycie',
    );
    fireListing3(h);
    await waitRt(() => textOf(h, '.arkmail-busy') === '', 'koniec odswiezenia');
    click(h, '.arkmail-older'); // waski widok: Zamknij list
    await waitRt(
      () => h.content.querySelectorAll('.arkmail-entry').length === 3 && !!h.content.querySelector('.arkmail-older'),
      'powrot do listingu',
    );

    click(h, '.arkmail-older');
    await waitRt(() => f.sent.includes('listy odebrane przed 23 VIII 1999'), 'starsza strona po odczycie');
    fireOlderPage(h);
    await waitRt(() => notifyText(f, 'Wczytano starsze listy'), 'starsza strona zatwierdzona');
    assert.ok(!notifyText(f, 'Blad wczytywania starszych'));
    assert.ok(!notifyText(f, 'czeka na potwierdzenie zakonczenia'));
  } finally {
    await stopHarness();
  }
});

test('integracja: niejednoznacznosc blokuje starsza strone tylko do zwyklego promptu', async () => {
  const h = await startHarness();
  const { f } = h;
  try {
    await beginOpen(h);
    for (const line of HEADERS) f.fire(line.text, line.cls);
    f.fire('Tresc zadanego listu.', 'mail');
    f.fire(prompt(2).text, 'mail');
    await waitRt(() => textOf(h, '.arkmail-busy') === '', 'koniec niejednoznacznego odczytu');
    assert.ok(notifyText(f, 'Nie udalo sie odczytac listu.'));
    assert.ok(!f.sent.includes('q'), 'cudzego pagera nie zamykamy');

    const sentBefore = f.sent.length;
    click(h, '.arkmail-older');
    assert.ok(notifyText(f, 'czeka na potwierdzenie zakonczenia'));
    assert.equal(f.sent.length, sentBefore, 'przed promptem brak komendy starszej strony');

    f.fire('> ', 'prompt');
    click(h, '.arkmail-older');
    await waitRt(() => f.sent.includes('listy odebrane przed 23 VIII 1999'), 'odblokowana starsza strona');
    fireOlderPage(h);
    f.fire('> ', 'prompt');
    await waitRt(() => notifyText(f, 'Wczytano starsze listy'), 'starsza strona po potwierdzeniu');
    assert.ok(!f.sent.includes('q'), 'nawet pozniej brak automatycznego q');
  } finally {
    await stopHarness();
  }
});
