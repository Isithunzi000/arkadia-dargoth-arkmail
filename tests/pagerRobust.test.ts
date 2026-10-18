/**
 * Odpornosc pagera na niedoszly/sklejony prompt (Fala 12a).
 * Dowod z logu sesji 2026-10-18 (odczyt listu ramkowego 22:44:52):
 * prompt "[1-50 ...] -- " nie dociera do triggerow jako czysta linia
 * (klient trzyma linie bez znaku nowej linii albo skleja ja z nastepna),
 * sesja wisiala do timeoutu, zostawiala sierocy pager, a sklejona linia
 * "prompt+odrzucenie" byla niewidzialna dla kotwiczonych regexow.
 */
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
  waitRt,
} from './harness';

const OPTS = { timeoutMs: 900, idleMs: 120 };

const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

type Settled<T> = { ok: true; value: T } | { ok: false; error: unknown };
const settle = <T>(p: Promise<T>): Promise<Settled<T>> =>
  p.then(
    (value) => ({ ok: true as const, value }),
    (error) => ({ ok: false as const, error }),
  );

/** Ramkowy list (pergamin) BEZ linii promptu pagera - jak w logu 22:44:52. */
const FRAMED_LETTER: ProtoLine[] = [
  { cls: 'mail', text: 'List : 1' },
  { cls: 'mail', text: 'Od   : Gracz' },
  { cls: 'mail', text: 'Temat: karteczka z rosomakiem' },
  { cls: 'mail', text: 'Do   : Waldo' },
  { cls: 'mail', text: 'DW   : Bar' },
  { cls: 'mail', text: 'Data : Pt, 21 VIII 2026, 18:25:34' },
  { cls: 'mail', text: '' },
  { cls: 'mail', text: ' +--------------------------------------------------------------------+ ' },
  { cls: 'mail', text: ' |                                                                    | ' },
  { cls: 'mail', text: ' |  Droga Waldo,                                                      | ' },
  { cls: 'mail', text: ' |                                                                    | ' },
  { cls: 'mail', text: ' |  Serdecznie pozdrawiam, mam nadzieje, ze do zobaczenia.            | ' },
  { cls: 'mail', text: ' |                                                                    | ' },
  { cls: 'mail', text: ' +--------------------------------------------------------------------+ ' },
];

test('odczyt bez widocznego promptu pagera: idle-completion domyka sesje (q + resolve)', async () => {
  const t = new MockTransport();
  const s = new PagerSession(t, OPTS);
  const op = settle(s.readLetter(1));
  await t.replay(FRAMED_LETTER);
  // Prompt pagera nigdy nie dociera (linia bez \n trzymana przez klienta).
  await sleep(400); // > idleMs: idle-completion powinno zamknac pager
  assert.ok(t.sent.includes('q'), 'po ciszy wyslano q mimo braku promptu pagera');
  await t.replay([{ cls: 'prompt', text: '> ' }]);
  const out = await op;
  assert.ok(out.ok, 'odczyt rozwiazany mimo niedoszlego promptu');
  if (!out.ok) return;
  assert.equal(out.value.letter.from, 'Gracz');
  assert.equal(out.value.letter.to, 'Waldo');
  assert.equal(out.value.letter.cc, 'Bar');
  assert.ok(
    out.value.letter.body.some((l) => l.includes('Droga Waldo')),
    'pelna tresc ramki w body',
  );
});

test('sklejona linia prompt+odrzucenie: wykrycie, q i ponowienie odczytu', async () => {
  const t = new MockTransport();
  const s = new PagerSession(t, OPTS);
  const op = settle(s.readLetter(1));
  await t.replay([
    {
      cls: 'mail',
      text: '[1-50 adefFhHmnqrsRux.!?-+<>] (aktualny: 1) -- Nie ma takiej komendy. Wpisz "?", zeby uzyskac pomoc albo "q", zeby wyjsc.',
    },
  ]);
  assert.deepEqual(
    t.sent,
    ['przeczytaj list 1', 'q'],
    'sklejone odrzucenie sieroczego pagera zamkniete przez q',
  );
  await t.replay([{ cls: 'prompt', text: '> ' }]);
  await waitRt(
    () => t.sent.filter((c) => c === 'przeczytaj list 1').length === 2,
    'ponowienie odczytu po odbudowie',
  );
  // Drugie podejscie: normalny odczyt z widocznym promptem pagera.
  await t.replay([
    { cls: 'mail', text: 'List : 1' },
    { cls: 'mail', text: 'Od   : Bar' },
    { cls: 'mail', text: 'Temat: karteczka' },
    { cls: 'mail', text: 'Data : Pn, 13 VII 2026, 02:13:58' },
    { cls: 'mail', text: '' },
    { cls: 'mail', text: 'Kocham Cie' },
    { cls: 'mail', text: '[1-50 adefFhHmnqrsRux.!?-+<>] (aktualny: 1) -- ' },
  ]);
  await waitRt(() => t.sent.filter((c) => c === 'q').length === 2, 'q na koncu odczytu');
  await t.replay([{ cls: 'prompt', text: '> ' }]);
  const out = await op;
  assert.ok(out.ok, 'odczyt rozwiazany po odbudowie');
  if (out.ok) assert.equal(out.value.letter.from, 'Bar');
});

test('timeout sesji wysyla q przed porzuceniem (zero sierocych pagerow)', async () => {
  const t = new MockTransport();
  const s = new PagerSession(t, OPTS);
  const out = await settle(s.readLetter(7));
  assert.ok(!out.ok, 'sesja bez odpowiedzi konczy sie rejectem');
  if (!out.ok) assert.ok(/timeout/.test(String(out.error)), 'powod: timeout');
  assert.deepEqual(
    t.sent,
    ['przeczytaj list 7', 'q'],
    'q poszlo do gry mimo timeoutu - pager nie zostaje sierota',
  );
});

test('straznik: sklejony prompt pagera poza blokada -> automatyczne q', async () => {
  const h = await startHarness();
  const { f, waitFor } = h;
  try {
    await loadTruncatedBox(h);
    const qBefore = f.sent.filter((c) => c === 'q').length;
    f.fire(
      '[1-50 adefFhHmnqrsRux.!?-+<>] (aktualny: 1) -- Nie ma takiej komendy. Wpisz "?", zeby uzyskac pomoc albo "q", zeby wyjsc.',
      'mail',
    );
    await waitFor(
      () => f.sent.filter((c) => c === 'q').length === qBefore + 1,
      'straznik wyslal q na sklejony prompt',
    );
  } finally {
    await stopHarness();
  }
});

test('klik w list w trakcie innej operacji: komunikat zamiast cichej kolejki', async () => {
  const h = await startHarness();
  const { f, waitFor, content } = h;
  try {
    await loadTruncatedBox(h);
    click(h, '.arkmail-older-all'); // start "Wczytaj wszystkie" - blokada trzymana
    await waitFor(
      () => f.sent.some((c) => c.startsWith('listy odebrane przed')),
      'strona loadAll w toku',
    );
    click(h, '.arkmail-entry'); // klik w trakcie blokady sesji
    await waitFor(() => notifyText(f, 'Trwa inna operacja'), 'komunikat o zajetej sesji');
    assert.ok(
      !f.sent.includes('przeczytaj list 1'),
      'klik nie skolejkowal komendy odczytu',
    );
    // Grzeczne domkniecie petli loadAll (strona pusta -> koniec).
    f.fire('Nie znaleziono zadnych takich odebranych listow.', 'mail');
    await waitFor(() => !content.querySelector('.arkmail-busy'), 'koniec loadAll');
  } finally {
    await stopHarness();
  }
});
