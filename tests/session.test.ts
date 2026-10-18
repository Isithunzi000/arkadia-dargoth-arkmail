/**
 * Testy maszyn stanow sesji pocztowych (Mailbox/Pager/Editor) nad
 * abstrakcyjnym transportem. Sterowane golden fixtures z logow gry -
 * MockTransport odtwarza prawdziwe strumienie linii.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

import { MockTransport, type ProtoLine } from '../src/arkmail/core/session/transport';
import { MailboxSession } from '../src/arkmail/core/session/mailbox';
import { PagerSession } from '../src/arkmail/core/session/pager';
import { EditorSession } from '../src/arkmail/core/session/editor';

const FIXTURES = path.join(process.cwd(), 'tests/fixtures');

function fixture(name: string): ProtoLine[] {
  const d = JSON.parse(fs.readFileSync(path.join(FIXTURES, name + '.json'), 'utf8'));
  return d.lines as ProtoLine[];
}

const OPTS = { timeoutMs: 500 };

/** Linie fixture od echa danej komendy (odcina stare linie sprzed komendy). */
function fromCommand(lines: ProtoLine[], cmd: string): ProtoLine[] {
  const idx = lines.findIndex((l) => l.cls === 'command' && l.text === `→ ${cmd}`);
  return idx >= 0 ? lines.slice(idx) : lines;
}

// --- MailboxSession ---------------------------------------------------------

test('mailbox: fetch odebranych zbiera wpisy do promptu', async () => {
  const t = new MockTransport();
  const s = new MailboxSession(t, OPTS);
  const op = s.fetch('odebrane');
  assert.deepEqual(t.sent, ['listy odebrane']);
  await t.replay(fromCommand(fixture('listing-odebrane-male'), 'listy odebrane'));
  const res = await op;
  assert.equal(res.kind, 'lista');
  if (res.kind !== 'lista') return;
  assert.equal(res.header.box, 'odebrane');
  assert.equal(res.entries.length, 3);
  assert.equal(res.entries[0].number, 3);
  assert.equal(res.entries[0].isRead, true);
  assert.equal(res.entries[0].party, 'Foo');
  assert.equal(res.entries[0].date?.year, 2025);
  assert.equal(res.entries[0].date?.month, 12);
});

test('mailbox: pusta skrzynka', async () => {
  const t = new MockTransport();
  const s = new MailboxSession(t, OPTS);
  const op = s.fetch('nieprzeczytane');
  await t.replay(fixture('listing-odebrane-male')); // zaczyna sie "Nie masz zadnych nieprzeczytanych"
  const res = await op;
  assert.deepEqual(res, { kind: 'pusta', box: 'nieprzeczytane', reason: 'puste' });
});

test('mailbox: listing 50 z suffiksem truncated', async () => {
  const t = new MockTransport();
  const s = new MailboxSession(t, OPTS);
  const op = s.fetch('wyslane');
  await t.replay(fixture('listing-wyslane-50'));
  const res = await op;
  assert.equal(res.kind, 'lista');
  if (res.kind !== 'lista') return;
  assert.equal(res.header.truncated, true);
  assert.equal(res.entries.length, 50);
});

test('mailbox: niewyslane - Odbiorcy zamiast Nadawcy', async () => {
  const t = new MockTransport();
  const s = new MailboxSession(t, OPTS);
  const op = s.fetch('niewyslane');
  await t.replay(fixture('listing-niewyslane'));
  const res = await op;
  assert.equal(res.kind, 'lista');
  if (res.kind !== 'lista') return;
  assert.equal(res.entries.length, 2);
  assert.equal(res.entries[0].partyKind, 'odbiorcy');
  assert.equal(res.entries[0].party, 'Foo');
});

test('mailbox: fetch z wlasna komenda (paginacja wstecz)', async () => {
  const t = new MockTransport();
  const s = new MailboxSession(t, OPTS);
  const op = s.fetch('wyslane', 'listy wyslane przed 9 iii 2026');
  assert.deepEqual(t.sent, ['listy wyslane przed 9 iii 2026']);
  await t.replay(fromCommand(fixture('listing-wyslane-50'), 'listy wyslane'));
  const res = await op;
  assert.equal(res.kind, 'lista');
});

test('mailbox: timeout gdy serwer milczy', async () => {
  const t = new MockTransport();
  const s = new MailboxSession(t, { timeoutMs: 20 });
  await assert.rejects(s.fetch('odebrane'), /timeout/i);
});

// --- PagerSession -----------------------------------------------------------

test('pager: przeczytanie listu i wyjscie q', async () => {
  const t = new MockTransport();
  const s = new PagerSession(t, OPTS);
  const op = s.readLetter(1);
  assert.deepEqual(t.sent, ['przeczytaj list 1']);
  await t.replay(fixture('listing-odebrane-male'));
  const res = await op;
  assert.equal(res.letter.number, 1);
  assert.equal(res.letter.from, 'Corge');
  assert.equal(res.letter.to, 'Gracz i Baz');
  assert.ok(res.letter.body.join('\n').includes('Grazie za wiesci.'));
  assert.deepEqual(res.pager, { lo: 1, hi: 3, current: 1 });
  assert.deepEqual(t.sent, ['przeczytaj list 1', 'q']);
});

test('pager: kasowanie - d 1, Zaznaczono, q, Kasuje listy', async () => {
  const t = new MockTransport();
  const s = new PagerSession(t, OPTS);
  const op = s.deleteLetters(1, '1');
  await t.replay(fixture('kasowanie'));
  const res = await op;
  assert.equal(res.deleted, true);
  assert.deepEqual(res.deletedNumbers, [1]);
  assert.deepEqual(t.sent, ['przeczytaj list 1', 'd 1', 'q']);
});

test('pager: forward z subdialogiem DW i bledami adresata', async () => {
  const t = new MockTransport();
  const s = new PagerSession(t, OPTS);
  const op = s.forwardLetter(23, 'bar');
  await t.replay(fixture('forward-dialog-bledy'));
  const res = await op;
  // Fixture: f bar -> DW: -> "q" odrzucone -> "listy wyslane" odrzucone
  // -> pusta linia -> "List jest gotowy do wyslania." -> pager -> q
  assert.equal(res.queued, true);
  assert.deepEqual(t.sent, ['przeczytaj list 23', 'f bar', '', 'q']);
});

test('pager: zly numer listu w pagerze nie wywraca sesji', async () => {
  const t = new MockTransport();
  const s = new PagerSession(t, OPTS);
  const op = s.readLetter(3);
  await t.replay(fixture('zly-numer'));
  const res = await op;
  assert.deepEqual(t.sent.at(-1), 'q');
});

// --- Fala 11g: odbudowa po sierocym pagerze ---------------------------------
// Log sesji 2026-10-18: pager po stronie serwera zostal otwarty (timeout
// sesji bez q) i ODRZUCAL kolejne komendy: 'Nie ma takiej komendy. Wpisz
// "?"...' + powtorka promptu pagera. Odczyt musi: q -> prompt -> ponowic
// komende (raz). Podwojne odrzucenie = blad.

const ORPHAN_REJECTION: ProtoLine[] = [
  {
    cls: 'mail',
    text: 'Nie ma takiej komendy. Wpisz "?", zeby uzyskac pomoc albo "q", zeby wyjsc.',
  },
  { cls: 'mail', text: '[1-50 adefFhHmnqrsRux.!?-+<>] (aktualny: 1) -- ' },
  { cls: 'prompt', text: '> ' },
];

test('pager recovery: sierocy pager odrzuca komende - q i ponowienie', async () => {
  const t = new MockTransport();
  const s = new PagerSession(t, OPTS);
  const op = s.readLetter(1);
  assert.deepEqual(t.sent, ['przeczytaj list 1']);
  await t.replay(ORPHAN_REJECTION);
  // Po odrzuceniu: zamkniecie sieroty (q) i ponowienie odczytu.
  assert.deepEqual(t.sent, ['przeczytaj list 1', 'q', 'przeczytaj list 1']);
  await t.replay(fixture('listing-odebrane-male'));
  const res = await op;
  assert.equal(res.letter.from, 'Corge');
  assert.equal(res.letter.number, 1);
  assert.deepEqual(t.sent.at(-1), 'q');
});

test('pager recovery: podwojne odrzucenie konczy sie bledem', async () => {
  const t = new MockTransport();
  const s = new PagerSession(t, OPTS);
  const op = s.readLetter(1);
  await t.replay(ORPHAN_REJECTION);
  const assertion = assert.rejects(op, /pager/i); // handler przed replay
  await t.replay(ORPHAN_REJECTION); // ponowiona komenda tez odrzucona
  await assertion;
  // Kazde odrzucenie zamknelismy q (sierota nie zostaje po nas).
  assert.deepEqual(t.sent, ['przeczytaj list 1', 'q', 'przeczytaj list 1', 'q']);
});

// --- EditorSession ----------------------------------------------------------

test('editor: compose pipelined - wyslany w urzedzie', async () => {
  const t = new MockTransport();
  const s = new EditorSession(t, OPTS);
  const linie = [
    ' _____________________________________________________________________  ',
    ' |     Szanowny kolego bracie Zniwiarzu,                            |   ',
    '  \\_/_ _______________________________________________________________/ ',
  ];
  const op = s.send({ adresat: 'Garply', temat: 'Perly', linie });
  assert.deepEqual(t.sent.slice(0, 2), ['napisz list', 'Garply'], 'etap 1: napisz + adresat');
  await t.replay(fixture('compose-pelny'));
  const res = await op;
  assert.equal(res.result, 'wyslany');
  assert.deepEqual(t.sent.slice(0, 4), ['napisz list', 'Garply', 'Perly', '']);
  assert.deepEqual(t.sent.at(-1), '**');
  assert.ok(t.sent.length === 4 + linie.length + 1);
});

test('editor: compose poza urzedem - gotowy do wyslania (kolejka)', async () => {
  const t = new MockTransport();
  const s = new EditorSession(t, OPTS);
  const op = s.send({ adresat: 'Foo', temat: 'test', linie: ['czesc'] });
  await t.replay(fixture('list-gotowy-do-wyslania'));
  const res = await op;
  assert.equal(res.result, 'gotowy');
});

test('editor: literowka w adresacie - blad i przerwanie', async () => {
  const t = new MockTransport();
  const s = new EditorSession(t, OPTS);
  const op = s.send({ adresat: 'Thud', temat: 'oferta aukcyjna', linie: ['tresc'] });
  await t.replay(fixture('brak-adresata-compose'));
  const res = await op;
  assert.equal(res.result, 'blad');
  if (res.result !== 'blad') return;
  assert.equal(res.error.kind, 'brak-adresata');
  if (res.error.kind === 'brak-adresata') assert.equal(res.error.adresat, 'thud');
  assert.ok(!t.sent.includes('**'), 'po bledzie adresatu nie wysylamy tresci');
});

// --- przenosnosc: zywy klient nie daje klas gmcp_msgs do triggerow ---------

/** Zywy PluginApi daje triggerom sam tekst; symulacja: cls pusty wszedzie. */
function bezKlas(lines: ProtoLine[]): ProtoLine[] {
  return lines.map((l) => ({ cls: '', text: l.text }));
}

test('przenosnosc: mailbox dziala bez klas (prompt/echo po samej tresci)', async () => {
  const t = new MockTransport();
  const s = new MailboxSession(t, { timeoutMs: 500, idleMs: 40 });
  const op = s.fetch('odebrane');
  await t.replay(bezKlas(fromCommand(fixture('listing-odebrane-male'), 'listy odebrane')));
  const res = await op;
  assert.equal(res.kind, 'lista');
  if (res.kind !== 'lista') return;
  assert.equal(res.entries.length, 3);
  assert.equal(res.entries[0].party, 'Foo');
});

test('przenosnosc: pager readLetter dziala bez klas', async () => {
  const t = new MockTransport();
  const s = new PagerSession(t, { timeoutMs: 500, idleMs: 40 });
  const op = s.readLetter(1);
  await t.replay(bezKlas(fixture('listing-odebrane-male')));
  const res = await op;
  assert.equal(res.letter.from, 'Corge');
  assert.deepEqual(t.sent, ['przeczytaj list 1', 'q']);
});

test('przenosnosc: editor compose dziala bez klas', async () => {
  const t = new MockTransport();
  const s = new EditorSession(t, { timeoutMs: 500, idleMs: 40 });
  const op = s.send({ adresat: 'Garply', temat: 'Perly', linie: ['linia1', 'linia2'] });
  await t.replay(bezKlas(fixture('compose-pelny')));
  const res = await op;
  assert.equal(res.result, 'wyslany');
});

test('przenosnosc: pager konczy sie idle-flush gdy prompt nie dochodzi', async () => {
  const t = new MockTransport();
  const s = new PagerSession(t, { timeoutMs: 500, idleMs: 40 });
  const bezPromptu = fixture('kasowanie').filter((l) => !(l.cls === 'prompt'));
  const op = s.deleteLetters(1, '1');
  await t.replay(bezKlas(bezPromptu));
  const res = await op;
  assert.equal(res.deleted, true);
  assert.deepEqual(res.deletedNumbers, [1]);
});

test('mailbox: strona "Wybrane listy" (paginacja) zbiera wpisy', async () => {
  const t = new MockTransport();
  const s = new MailboxSession(t, OPTS);
  const op = s.fetch('wyslane', 'listy wyslane przed 19 IV 2026');
  assert.deepEqual(t.sent, ['listy wyslane przed 19 IV 2026']);
  await t.replay(fixture('listing-wyslane-wybrane-przed'));
  const res = await op;
  assert.equal(res.kind, 'lista');
  if (res.kind !== 'lista') return;
  assert.equal(res.header.box, 'wyslane');
  assert.equal(res.header.truncated, true);
  assert.equal(res.entries.length, 50);
  assert.equal(res.entries[0].number, 50);
  assert.equal(res.entries[0].party, 'Bar');
  assert.equal(res.entries[0].date?.month, 3);
  assert.equal(res.entries[49].date?.month, 4);
});

test('mailbox: linia-blad serwera (zly format daty) przerywa sesje od razu', async () => {
  const t = new MockTransport();
  const s = new MailboxSession(t, OPTS);
  const op = s.fetch('odebrane', 'listy odebrane przed 30 II 2026');
  const assertion = assert.rejects(op, /zlym formacie/);
  await t.replay([
    { cls: 'mail', text: 'Data zostala podana w zlym formacie. Przykladowy format to: 13 X 2007.' },
    { cls: 'prompt', text: '> ' },
  ]);
  await assertion;
});
