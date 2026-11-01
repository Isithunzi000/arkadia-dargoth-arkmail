/**
 * Bramka regresji: symulacja edge/race na prawdziwych ramkach (bramka regresji, Fala 28f).
 *
 * Przeniesienie symulatora audytowego (2026-10-22) do repo. Ramki:
 * tests/fixtures (prawdziwe logi, fixtura selekcji zesanityzowana -
 * imiona zastapione tokenami). Asercje zbierane jak w oryginale;
 * jakikolwiek FAIL wywala test z lista niepowodzen.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
/**
 * SYMULACJA czesc 2: edge case'y i wyscigi (audyt 2026-10-22).
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { MockTransport } from '../out-test/src/arkmail/core/session/transport.js';
import { MailboxSession } from '../out-test/src/arkmail/core/session/mailbox.js';
import { PagerSession } from '../out-test/src/arkmail/core/session/pager.js';
import { EditorSession } from '../out-test/src/arkmail/core/session/editor.js';
import { SessionLock } from '../out-test/src/arkmail/core/sessionLock.js';
import { olderListingCommand, nextDay } from '../out-test/src/arkmail/core/protocol/commands.js';
import { humanizeMailError } from '../out-test/src/arkmail/core/errors.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const FIX = join(HERE, 'fixtures') + '/';
const load = (n) => JSON.parse(readFileSync(FIX + n, 'utf8')).lines;
const OPTS = { timeoutMs: 1200, idleMs: 250 };
const OPTS_PROD = { timeoutMs: 8000, idleMs: 400 }; // produkcyjne (index.ts:58)

test('symulacja edge/race na prawdziwych ramkach (bramka regresji, Fala 28f)', async () => {

let pass = 0, fail = 0;
const results = [];
const ok = (name, cond, detail = '') => {
  if (cond) { pass++; results.push(`PASS ${name}${detail ? ' | ' + detail : ''}`); }
  else { fail++; results.push(`FAIL ${name}${detail ? ' | ' + detail : ''}`); }
};

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// --- E1: desync: pusta INNEJ skrzynki w trakcie fetch -> fail-fast ---------
{
  const t = new MockTransport();
  const mb = new MailboxSession(t, OPTS);
  const p = mb.fetch('odebrane');
  let err = null;
  p.catch((e) => { err = e; });
  await t.replay([{ cls: 'mail', text: 'Nie masz zadnych niewyslanych listow.' }]);
  await sleep(50);
  ok('E1 desync-pusta reject', err !== null && /podczas fetch odebrane/.test(err.message), err?.message);
  ok('E1b humanize', humanizeMailError(err?.message ?? '').includes('za inna skrzynke'),
    humanizeMailError(err?.message ?? ''));
}

// --- E2: desync: naglowek INNEJ skrzynki w trakcie fetch -> fail-fast ------
{
  const t = new MockTransport();
  const mb = new MailboxSession(t, OPTS);
  const p = mb.fetch('odebrane');
  let err = null;
  p.catch((e) => { err = e; });
  await t.replay([{ cls: 'mail', text: 'Listy wyslane:' }]);
  await sleep(50);
  ok('E2 desync-naglowek reject', err !== null && /podczas fetch/.test(err.message), err?.message);
}

// --- E3: blad formatu daty serwera w trakcie fetch --------------------------
{
  const t = new MockTransport();
  const mb = new MailboxSession(t, OPTS);
  const p = mb.fetch('odebrane', 'listy odebrane przed 30 iv 2026');
  let err = null;
  p.catch((e) => { err = e; });
  await t.replay([
    { cls: 'mail', text: 'Data zostala podana w zlym formacie. Przykladowy format to: 13 X 2007.' },
    { cls: 'prompt', text: '> ' },
  ]);
  await sleep(50);
  ok('E3 zly format reject', err !== null && /zlym formacie/.test(err.message));
  ok('E3b humanize passthrough', humanizeMailError(err?.message ?? '').startsWith('Data zostala'));
}

// --- E4: throttle "Listy sa w tej chwili ladowane." -> retry po 2 s ---------
{
  const t = new MockTransport();
  const mb = new MailboxSession(t, OPTS_PROD);
  const p = mb.fetch('odebrane');
  await t.replay([{ cls: 'mail', text: 'Listy sa w tej chwili ladowane.' }]);
  ok('E4a natychmiast bez rejectu (czeka na retry)', t.sent.length === 1);
  await sleep(2300); // retry po 2000 ms
  ok('E4b retry wyslany', t.sent.length === 2 && t.sent[1] === 'listy odebrane', t.sent.join(','));
  // po retry serwer odpowiada listingiem - sesja domyka sie normalnie
  await t.replay(load('listing-odebrane-male.json').slice(3));
  const res = await p;
  ok('E4c listing po retry OK', res.kind === 'lista' && res.entries.length === 3);
}

// --- E4d: drugi throttle z rzedu -> reject ----------------------------------
{
  const t = new MockTransport();
  const mb = new MailboxSession(t, OPTS_PROD);
  const p = mb.fetch('odebrane');
  let err = null;
  p.catch((e) => { err = e; });
  await t.replay([{ cls: 'mail', text: 'Listy sa w tej chwili ladowane.' }]);
  await sleep(2300);
  await t.replay([{ cls: 'mail', text: 'Listy sa w tej chwili ladowane.' }]);
  await sleep(50);
  ok('E4d drugi throttle reject', err !== null && /ladowane/.test(err.message), err?.message);
  ok('E4d2 humanize', humanizeMailError(err?.message ?? '').includes('jeszcze laduje'));
}

// --- E5: timeout (cisza od serwera) -----------------------------------------
{
  const t = new MockTransport();
  const mb = new MailboxSession(t, OPTS);
  const p = mb.fetch('odebrane');
  let err = null;
  p.catch((e) => { err = e; });
  await sleep(1400);
  ok('E5 timeout reject', err !== null && /^timeout: mailbox fetch odebrane$/.test(err.message), err?.message);
  ok('E5b humanize', humanizeMailError(err?.message ?? '') === 'Serwer nie odpowiedzial na czas - sprobuj ponownie.');
}

// --- E6: idle-flush: wpisy bez promptu -> domkniecie po idleMs ---------------
{
  const t = new MockTransport();
  const mb = new MailboxSession(t, { timeoutMs: 3000, idleMs: 300 });
  const p = mb.fetch('odebrane');
  await t.replay(load('listing-odebrane-male.json').slice(3, -1)); // bez promptu koncowego
  const res = await p;
  ok('E6 idle-flush zbiera wpisy', res.kind === 'lista' && res.entries.length === 3,
    res.kind === 'lista' ? `entries=${res.entries.length}` : res.kind);
}

// --- E7: pager: zly numer listu ----------------------------------------------
{
  const t = new MockTransport();
  const pg = new PagerSession(t, OPTS);
  const p = pg.readLetter(4);
  let err = null;
  p.catch((e) => { err = e; });
  // Blad PRZED naglowkami (jak tests/listingCtx.test.ts:36): od razu, bez q.
  await t.replay([{ cls: 'mail', text: 'Zly numer listu: 4.' }]);
  await sleep(50);
  ok('E7 zly numer reject', err !== null && /Zly numer listu: 4/.test(err.message), err?.message);
  ok('E7b humanize tnie prefiks', humanizeMailError(err?.message ?? '') === 'Zly numer listu: 4.',
    humanizeMailError(err?.message ?? ''));
  ok('E7c bez smieciowego q', !t.sent.includes('q'), t.sent.join(' | '));
}

// --- E8: szum w trakcie fetch: echo komendy gracza + prompt ------------------
{
  const t = new MockTransport();
  const mb = new MailboxSession(t, OPTS);
  const p = mb.fetch('odebrane');
  await t.replay([
    { cls: 'command', text: '→ wesprzyj Arkadie' }, // echo recznej komendy gracza
    ...load('listing-odebrane-male.json').slice(3, -1),
    { cls: 'prompt', text: '> ' },
  ]);
  const res = await p;
  ok('E8 echo gracza nie psuje listingu', res.kind === 'lista' && res.entries.length === 3);
}

// --- E9: pager: abort z zewnatrz (Przerwij) ----------------------------------
{
  const t = new MockTransport();
  const pg = new PagerSession(t, OPTS);
  let abort = false;
  const p = pg.readLetter(1, () => abort);
  let err = null;
  p.catch((e) => { err = e; });
  // Abort w trakcie plynacej tresci (realistyczny Przerwij): pager otwarty,
  // sesja domyka sie "q" i odrzuca 'przerwano'.
  await t.replay([
    { cls: 'mail', text: 'List : 1' },
    { cls: 'mail', text: 'Od   : Foo' },
    { cls: 'mail', text: 'Temat: --' },
    { cls: 'mail', text: 'Do   : Bar' },
    { cls: 'mail', text: 'Data : Wt, 24 VIII 1999, 00:11:12' },
    { cls: 'mail', text: 'tresc...' },
  ]);
  abort = true;
  await t.replay([{ cls: 'mail', text: 'kolejna linia tresci' }]);
  await sleep(600);
  ok('E9 abort = przerwano', err !== null && /przerwano/.test(err.message), err?.message ?? 'brak');
}

// --- E10: editor: timeout ------------------------------------------------------
{
  const t = new MockTransport();
  const ed = new EditorSession(t, OPTS);
  const p = ed.send({ adresat: 'Foo', temat: 'x', dw: undefined, linie: ['y'] });
  const res = await p;
  ok('E10 editor timeout', res.result === 'blad' && res.error?.kind === 'timeout', res.result);
}

// --- E11: sonda sciany (26c): komendy kotwicy normalna vs sonda ---------------
{
  const oldest = { day: 21, month: 8, year: 1999 };
  const normalna = olderListingCommand('wyslane', nextDay(oldest));
  const sonda = olderListingCommand('wyslane', oldest);
  ok('E11a kotwica naklada dzien (przed D+1)', normalna === 'listy wyslane przed 22 VIII 1999', normalna);
  ok('E11b sonda wyklucza dzien (przed D)', sonda === 'listy wyslane przed 21 VIII 1999', sonda);
}

// --- R1: SessionLock: serializacja, wyjatki, idempotentne zwolnienie ----------
{
  const lock = new SessionLock();
  const order = [];
  const a = lock.runExclusive(async () => { order.push('A-start'); await sleep(150); order.push('A-end'); });
  const b = lock.runExclusive(async () => { order.push('B-start'); await sleep(10); order.push('B-end'); });
  await Promise.all([a, b]);
  ok('R1a FIFO serializacja', order.join(',') === 'A-start,A-end,B-start,B-end', order.join(','));
  ok('R1b lock zwolniony', lock.locked === false);

  const lock2 = new SessionLock();
  let threw = false;
  try {
    await lock2.runExclusive(async () => { throw new Error('boom'); });
  } catch { threw = true; }
  ok('R1c wyjatek zwalnia', threw && lock2.locked === false);

  const lock3 = new SessionLock();
  const rel = await lock3.acquire();
  rel(); rel(); // podwojne zwolnienie nie psuje licznika
  ok('R1d idempotentne zwolnienie', lock3.locked === false);
}

// --- R2: wyscig klikow: lock trzyma druga operacje az pierwsza skonczy -------
{
  const t = new MockTransport();
  const mb = new MailboxSession(t, OPTS);
  const lock = new SessionLock();
  const order = [];
  const first = lock.runExclusive(async () => {
    order.push('fetch1-start');
    const p = mb.fetch('odebrane');
    await t.replay(load('listing-odebrane-male.json').slice(3));
    const r = await p;
    order.push('fetch1-end');
    return r;
  });
  const second = lock.runExclusive(async () => {
    order.push('fetch2-start');
    const p2 = mb.fetch('niewyslane');
    await t.replay(load('listing-niewyslane.json').slice(0));
    const r2 = await p2;
    order.push('fetch2-end');
    return r2;
  });
  const [r1, r2] = await Promise.all([first, second]);
  ok('R2a brak przeplotu', order.join(',') === 'fetch1-start,fetch1-end,fetch2-start,fetch2-end', order.join(','));
  ok('R2b obie sesje OK', r1.kind === 'lista' && (r2.kind === 'lista' || r2.kind === 'pusta'),
    `${r1.kind}/${r2.kind}`);
}



  assert.equal(fail, 0, results.filter((r) => r.startsWith('FAIL')).join('\n'));
  console.log(`symulacja: ${pass} asercji OK`);
});
