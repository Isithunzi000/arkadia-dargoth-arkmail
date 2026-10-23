/**
 * Bramka regresji: symulacja flow na prawdziwych ramkach (bramka regresji, Fala 28f).
 *
 * Przeniesienie symulatora audytowego (2026-10-22) do repo. Ramki:
 * tests/fixtures (prawdziwe logi, fixtura selekcji zesanityzowana -
 * imiona zastapione tokenami). Asercje zbierane jak w oryginale;
 * jakikolwiek FAIL wywala test z lista niepowodzen.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
/**
 * SYMULACJA ArkMail na prawdziwych ramkach z logow (audyt 2026-10-22).
 * Czesc 1: flow pozytywne (listing, szukanie, pager, compose, forward, kasowanie).
 * Transport: MockTransport z out-test; ramki: tests/fixtures (prawdziwe logi).
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { MockTransport } from '../out-test/src/arkmail/core/session/transport.js';
import { MailboxSession } from '../out-test/src/arkmail/core/session/mailbox.js';
import { PagerSession } from '../out-test/src/arkmail/core/session/pager.js';
import { EditorSession } from '../out-test/src/arkmail/core/session/editor.js';
import { searchListingCommand, olderListingCommand } from '../out-test/src/arkmail/core/protocol/commands.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const FIX = join(HERE, 'fixtures') + '/';
const load = (name) => JSON.parse(readFileSync(FIX + name, 'utf8')).lines;
const OPTS = { timeoutMs: 4000, idleMs: 250 };

test('symulacja flow na prawdziwych ramkach (bramka regresji, Fala 28f)', async () => {

let pass = 0, fail = 0;
const results = [];
function ok(name, cond, detail = '') {
  if (cond) { pass++; results.push(`PASS ${name}${detail ? ' | ' + detail : ''}`); }
  else { fail++; results.push(`FAIL ${name}${detail ? ' | ' + detail : ''}`); }
}
const eq = (a, b) => JSON.stringify(a) === JSON.stringify(b);

// --- S1: listing odebrane (maly, prawdziwe ramki) -------------------------
{
  const t = new MockTransport();
  const mb = new MailboxSession(t, OPTS);
  const p = mb.fetch('odebrane');
  // Fixtura zawiera ogony POPRZEDNIEJ komendy z loga (puste nieprzeczytane);
  // produkcyjnie sesja widzi linie dopiero po swoim wyslaniu - start po echу.
  await t.replay(load('listing-odebrane-male.json').slice(3));
  const res = await p;
  ok('S1a komenda', eq(t.sent, ['listy odebrane']), t.sent.join(','));
  ok('S1b kind=lista', res.kind === 'lista');
  if (res.kind === 'lista') {
    ok('S1c wpisy=3', res.entries.length === 3, `entries=${res.entries.length}`);
    const e = res.entries[0];
    ok('S1d nadawca+data', e.partyKind === 'nadawca' && e.party.length > 0 && e.date !== null,
      `party=${e.party}`);
    ok('S1e numeracja zachowana', res.entries.map((x) => x.number).join(',') === '3,2,1',
      res.entries.map((x) => x.number).join(','));
  }
}

// --- S2: wariant pustej skrzynki ("Nie masz zadnych...") -------------------
{
  const t = new MockTransport();
  const mb = new MailboxSession(t, OPTS);
  const p = mb.fetch('nieprzeczytane');
  await t.replay([
    { cls: 'mail', text: 'Nie masz zadnych nieprzeczytanych listow.' },
    { cls: 'prompt', text: '> ' },
  ]);
  const res = await p;
  ok('S2 puste', res.kind === 'pusta' && res.reason === 'puste' && res.box === 'nieprzeczytane');
}

// --- S3: pusty filtr ("Nie znaleziono zadnych takich...") ------------------
{
  const t = new MockTransport();
  const mb = new MailboxSession(t, OPTS);
  const cmd = searchListingCommand('wyslane', { osoba: 'Foo' });
  ok('S3a komenda szukania', cmd === 'listy wyslane do Foo', cmd);
  const p = mb.fetch('wyslane', cmd);
  await t.replay([
    { cls: 'mail', text: 'Nie znaleziono zadnych takich wyslanych listow.' },
    { cls: 'prompt', text: '> ' },
  ]);
  const res = await p;
  ok('S3b filtr-pusty', res.kind === 'pusta' && res.reason === 'filtr', res.kind);
}

// --- S4: pelny listing wyslanych 50 (suffix odcinajacy) --------------------
{
  const t = new MockTransport();
  const mb = new MailboxSession(t, OPTS);
  const p = mb.fetch('wyslane');
  await t.replay(load('listing-wyslane-50.json'));
  const res = await p;
  ok('S4a 50 wpisow', res.kind === 'lista' && res.entries.length === 50,
    res.kind === 'lista' ? `entries=${res.entries.length}` : res.kind);
  if (res.kind === 'lista') {
    ok('S4b odbiorcy', res.entries.every((e) => e.partyKind === 'odbiorcy'));
    const dates = res.entries.every((e) => e.date !== null);
    ok('S4c wszystkie daty sparsowane', dates);
  }
}

// --- S5: strona kotwicowa "Wybrane listy wyslane" (renumeracja) ------------
{
  const t = new MockTransport();
  const mb = new MailboxSession(t, OPTS);
  const cmd = olderListingCommand('wyslane', { day: 19, month: 4, year: 2026 });
  ok('S5a komenda kotwicy', cmd === 'listy wyslane przed 19 IV 2026', cmd);
  const p = mb.fetch('wyslane', cmd);
  await t.replay(load('listing-wyslane-wybrane-przed.json'));
  const res = await p;
  ok('S5b 50 wpisow selekcji', res.kind === 'lista' && res.entries.length === 50);
  if (res.kind === 'lista') {
    const nums = res.entries.map((e) => e.number);
    ok('S5c numery maleja 50->1', nums[0] === 50 && nums[49] === 1, `${nums[0]}..${nums[49]}`);
    const oldest = res.entries[0];
    ok('S5d najstarszy pierwszy (25 III)', oldest.date?.day === 25 && oldest.date?.month === 3,
      `${oldest.date?.day}.${oldest.date?.month}`);
  }
}

// --- S6: selekcja po osobie "Wybrane listy odebrane" -----------------------
{
  const t = new MockTransport();
  const mb = new MailboxSession(t, OPTS);
  const sel = JSON.parse(readFileSync(FIX + 'wybrane-odebrane.json', 'utf8')).lines;
  const p = mb.fetch('odebrane', 'listy odebrane od foo');
  await t.replay(sel);
  const res = await p;
  ok('S6a selekcja odebranych', res.kind === 'lista' && res.entries.length >= 20,
    res.kind === 'lista' ? `entries=${res.entries.length}` : res.kind);
  if (res.kind === 'lista') {
    ok('S6b nadawcy', res.entries.every((e) => e.partyKind === 'nadawca'));
    ok('S6c numery malejace', res.entries[0].number > res.entries[res.entries.length - 1].number);
  }
}

// --- S7: komendy szukania 1:1 z helpem --------------------------------------
{
  ok('S7a osoba+daty+temat',
    searchListingCommand('odebrane', { osoba: 'Foo', odDaty: { day: 1, month: 3, year: 2026 }, doDaty: { day: 10, month: 3, year: 2026 }, temat: 'karteczka' })
      === 'listy odebrane od Foo po 28 II 2026 przed 11 III 2026 o temacie karteczka');
  ok('S7b wyslane=do', searchListingCommand('wyslane', { osoba: 'Bar' }) === 'listy wyslane do Bar');
  ok('S7c temat ostatni', searchListingCommand('niewyslane', { temat: 'a b c' }) === 'listy niewyslane o temacie a b c');
  ok('S7d miesiac WIELKA rzymska', searchListingCommand('odebrane', { odDaty: { day: 7, month: 12, year: 2025 } }) === 'listy odebrane po 6 XII 2025');
}

// --- S8: pager: przeczytanie listu (fixture w listing-odebrane-male) --------
{
  const t = new MockTransport();
  const pg = new PagerSession(t, OPTS);
  const p = pg.readLetter(3);
  await t.replay([
    { cls: 'mail', text: 'List : 3' },
    { cls: 'mail', text: 'Od   : Corge' },
    { cls: 'mail', text: 'Temat: --' },
    { cls: 'mail', text: 'Do   : Gracz' },
    { cls: 'mail', text: 'Data : Wt, 23 XII 2025, 00:11:12' },
    { cls: 'mail', text: '' },
    { cls: 'mail', text: 'Pierwsza linia tresci.' },
    { cls: 'mail', text: 'Druga linia tresci.' },
    { cls: 'prompt', text: '[1-3 adefFhHmnqrsRux.!?-+<>] (aktualny: 3) -- ' },
    { cls: 'prompt', text: '> ' },
  ]);
  const res = await p;
  ok('S8a komendy pagera', eq(t.sent, ['przeczytaj list 3', 'q']), t.sent.join(' | '));
  ok('S8b list sparsowany', res.letter?.from === 'Corge' && res.letter?.subject === '--',
    `from=${res.letter?.from}`);
  ok('S8c tresc', res.letter?.body?.join('\n').includes('Druga linia'));
}

// --- S9: kasowanie w pagerze (prawdziwe ramki) ------------------------------
{
  const t = new MockTransport();
  const pg = new PagerSession(t, OPTS);
  const p = pg.deleteLetters(1, '1');
  await t.replay(load('kasowanie.json'));
  const res = await p;
  ok('S9a komendy', eq(t.sent.slice(0, 3), ['przeczytaj list 1', 'd 1', 'q']), t.sent.join(' | '));
  ok('S9b skasowano', res.deleted === true && res.deletedNumbers.join(',') === '1',
    `deleted=${res.deleted}`);
}

// --- S10: forward z blednym adresatem (prawdziwe ramki) ---------------------
{
  const t = new MockTransport();
  const pg = new PagerSession(t, OPTS);
  const p = pg.forwardLetter(2, 'bar');
  await t.replay(load('forward-dialog-bledy.json'));
  const res = await p;
  ok('S10a f+pusta', t.sent.includes('f bar') && t.sent.includes(''), t.sent.join(' | '));
  ok('S10b wynik', res.queued === true || res.error !== null,
    `queued=${res.queued} err=${res.error?.kind ?? '-'}`);
}

// --- S11: compose pelny (prawdziwe ramki, pipelining) -----------------------
{
  const t = new MockTransport();
  const ed = new EditorSession(t, OPTS);
  const p = ed.send({ adresat: 'Garply', temat: 'Perly', dw: undefined, linie: ['Linia 1', 'Linia 2'] });
  await t.replay(load('compose-pelny.json'));
  const res = await p;
  ok('S11a napisz list pierwsze', t.sent[0] === 'napisz list', t.sent[0]);
  ok('S11b adresat drugi', t.sent[1] === 'Garply');
  ok('S11c koncowka **', t.sent[t.sent.length - 1] === '**', t.sent.join(' | '));
  ok('S11d wynik', res.result === 'wyslany' || res.result === 'gotowy', res.result);
}

// --- S12: compose: brak adresata (prawdziwe ramki) ---------------------------
{
  const t = new MockTransport();
  const ed = new EditorSession(t, OPTS);
  const p = ed.send({ adresat: 'thud', temat: 'x', dw: undefined, linie: ['y'] });
  await t.replay(load('brak-adresata-compose.json'));
  const res = await p;
  ok('S12 blad adresata', res.result === 'blad' && res.error?.kind === 'brak-adresata',
    `${res.result}/${res.error?.kind}`);
  ok('S12b bez ** po bledzie', !t.sent.includes('**'), t.sent.join(' | '));
}



  assert.equal(fail, 0, results.filter((r) => r.startsWith('FAIL')).join('\n'));
  console.log(`symulacja: ${pass} asercji OK`);
});
