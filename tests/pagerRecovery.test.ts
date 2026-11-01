/**
 * Wiszace pagery serwerowe (Fala 17a, zgloszenie 2026-10-19/20 pkt 4).
 *
 * Dowod z loga sesji (session_1792449122884.html): po przerwanej petli
 * pobierania tresci pager serwera zostawal OTWARTY - kolejne komendy
 * ("listy ...") byly konsumowane przez pagera, ktory odpowiadal wlasnym
 * promptem "[1-50 ...] -- "; 22:37:11 i 22:38:44 gracz musial recznie
 * wysylac "q" ("Slucham?" dopiero po domknieciu). Trzy dziury:
 *
 *  a) mailbox.fetch nie poznawal promptu pagera - wisial do timeoutu,
 *     zamiast domknac sierote ("q") i powtorzyc komende;
 *  b) w fetchArchiveBody resolveEntry bylo POZA try - wyjatek z
 *     re-kotwicy zabijal cala petle pobierania ("Blad pobierania
 *     tresci do archiwum."), zamiast policzyc pojedyncza porazke
 *     i jechac dalej;
 *  c) PagerSession.readLetter nie mial shouldAbort - Przerwij w trakcie
 *     odczytu zostawial pager w toku do timeoutu, zamiast domknac go
 *     od razu ("q" tylko gdy pager faktycznie otwarty).
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { MockTransport, type ProtoLine } from '../src/arkmail/core/session/transport';
import { MailboxSession } from '../src/arkmail/core/session/mailbox';
import { PagerSession } from '../src/arkmail/core/session/pager';
import {
  startHarness,
  stopHarness,
  loadTruncatedBox,
  click,
  waitRt,
  notifyText,
  type Harness,
} from './harness';

const OPTS = { timeoutMs: 900, idleMs: 120 };

type Settled<T> = { ok: true; value: T } | { ok: false; error: unknown };
const settle = <T>(p: Promise<T>): Promise<Settled<T>> =>
  p.then(
    (value) => ({ ok: true as const, value }),
    (error) => ({ ok: false as const, error }),
  );

const PAGER_PROMPT = '[1-50 adefFhHmnqrsRux.!?-+<>] (aktualny: 23) -- ';

test('mailbox: sierocy pager zjada "listy" - q, prompt gry i powtorka komendy', async () => {
  const t = new MockTransport();
  const m = new MailboxSession(t, OPTS);
  const op = settle(m.fetch('odebrane'));
  // Sierocy pager konsumuje nasza komende i odpowiada wlasnym promptem.
  await t.replay([{ cls: 'mail', text: PAGER_PROMPT }]);
  assert.ok(t.sent.includes('q'), 'wyslano q do sierocy pagera');
  // Domkniecie pagera = prompt gry; komenda listingu powinna byc powtorzona.
  await t.replay([{ cls: 'prompt', text: '> ' }]);
  assert.equal(
    t.sent.filter((s) => s === 'listy odebrane').length,
    2,
    'komenda listingu powtorzona po domknieciu sieroty',
  );
  await t.replay([
    { cls: 'mail', text: 'Listy odebrane (prezentowane jest pierwsze 50):' },
    { cls: 'mail', text: ' 1. *R* Temat: najnowszy' },
    { cls: 'mail', text: 'Nadawca: Corge                       Wt, 24 VIII 1999, 00:11:12' },
    { cls: 'prompt', text: '> ' },
  ]);
  const out = await op;
  assert.ok(out.ok, 'listing dojechal po domknieciu sieroty');
  if (!out.ok) return;
  assert.equal(out.value.kind, 'lista');
  if (out.value.kind !== 'lista') return;
  assert.equal(out.value.entries.length, 1, 'wpis z powtorzonego listingu');
});

test('mailbox: sierocy pager przetrwal q - powtorka promptu = blad, bez trzeciego q', async () => {
  const t = new MockTransport();
  const m = new MailboxSession(t, OPTS);
  const op = settle(m.fetch('odebrane'));
  await t.replay([{ cls: 'mail', text: PAGER_PROMPT }]);
  assert.ok(t.sent.includes('q'), 'pierwsze q do sieroty');
  await t.replay([{ cls: 'prompt', text: '> ' }]);
  await t.replay([{ cls: 'mail', text: PAGER_PROMPT }]); // pager wciaz zywy
  const out = await op;
  assert.ok(!out.ok, 'powtorka promptu pagera odrzuca fetch');
  assert.equal(
    t.sent.filter((s) => s === 'q').length,
    1,
    'po pierwszym q zadnych kolejnych',
  );
});

test('pager: shouldAbort w toku odczytu - domkniecie q i odrzucenie "przerwano"', async () => {
  const t = new MockTransport();
  const s = new PagerSession(t, OPTS);
  let abort = false;
  const op = settle(s.readLetter(1, () => abort));
  await t.replay([
    { cls: 'mail', text: 'List : 1' },
    { cls: 'mail', text: 'Od   : Corge' },
    { cls: 'mail', text: 'Temat: najnowszy' },
    { cls: 'mail', text: 'Data : Wt, 24 VIII 1999, 00:11:12' },
    { cls: 'mail', text: '' },
    { cls: 'mail', text: 'Tresc pierwszego.' },
    { cls: 'mail', text: PAGER_PROMPT },
  ]);
  // Przerwij w trakcie: pager otwarty, kolejna linia (np. echo swiata)
  // uruchamia domkniecie zamiast dalszego zbierania.
  abort = true;
  await t.replay([{ cls: 'mail', text: 'Tresc, ktorej juz nie chcemy.' }]);
  assert.ok(t.sent.includes('q'), 'abort wyslal q do otwartego pagera');
  await t.replay([{ cls: 'prompt', text: '> ' }]);
  const out = await op;
  assert.ok(!out.ok, 'odczyt odrzucony po przerwaniu');
  if (out.ok) return;
  assert.match(String(out.error), /przerwano/, 'powod odrzucenia: przerwano');
});

test('pager: shouldAbort przed otwarciem pagera - odrzucenie BEZ smieciowego q', async () => {
  const t = new MockTransport();
  const s = new PagerSession(t, OPTS);
  const op = settle(s.readLetter(1, () => true));
  await t.replay([{ cls: 'mail', text: 'Goniec przyniosl nowa partie listow.' }]);
  const out = await op;
  assert.ok(!out.ok, 'odczyt odrzucony, gdy abort przed otwarciem');
  assert.ok(!t.sent.includes('q'), 'zadnego q, gdy pager nie zostal otwarty');
});

/** Listing z trzema wpisami prologu (jak w archiveDownload.test.ts). */
function replayListing3(h: Harness): void {
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

function replayLetter(h: Harness, numer: number, subject: string, body: string): void {
  const { f } = h;
  f.fire(`List : ${numer}`, 'mail');
  f.fire('Od   : Corge', 'mail');
  f.fire(`Temat: ${subject}`, 'mail');
  f.fire('Data : Wt, 24 VIII 1999, 00:11:12', 'mail');
  f.fire('', 'mail');
  f.fire(body, 'mail');
  f.fire(`[1-50 adefFhHmnqrsRux.!?-+<>] (aktualny: ${numer}) -- `, 'mail');
  f.fire('> ', 'prompt');
}

test('archiwum: wyjatek z re-kotwicy nie zabija petli pobierania tresci', async () => {
  const h = await startHarness();
  const { f, content } = h;
  try {
    await loadTruncatedBox(h); // archiwum ma 3 wpisy BEZ tresci
    click(h, '[data-tab="archiwum"]');
    const downloadBtn = () => {
      const b = content.querySelector('.arkmail-arch-download') as unknown as {
        dispatchEvent(e: unknown): void;
      } | null;
      assert.ok(b, 'przycisk pobierania istnieje');
      return b;
    };
    downloadBtn().dispatchEvent(new h.window.Event('click')); // uzbrojenie
    downloadBtn().dispatchEvent(new h.window.Event('click')); // start
    // Petla uzyje wpisow z aktualnej bazy.

    await waitRt(
      () => f.sent.includes('listy odebrane przed 25 VIII 1999'),
      're-kotwica pierwszego listu',
    );
    // Serwer odpowiada linia-bledem: fetch odrzuca, resolveEntry rzuca.
    f.fire('Data zostala podana w zlym formacie.', 'mail');

    // Petla ma policzyc porazke i jechac dalej - re-kotwica drugiego listu.
    await waitRt(
      () => f.sent.includes('listy odebrane przed 24 VIII 1999'),
      'petla zyje: re-kotwica drugiego listu po wyjatku',
    );
    replayListing3(h);
    await waitRt(() => f.sent.includes('przeczytaj list 2'), 'odczyt drugiego listu');
    replayLetter(h, 2, 'srodkowy', 'Tresc drugiego.');

    await waitRt(
      () => f.sent.includes('listy odebrane przed 23 VIII 1999'),
      're-kotwica trzeciego listu',
    );
    replayListing3(h);
    await waitRt(() => f.sent.includes('przeczytaj list 3'), 'odczyt trzeciego listu');
    replayLetter(h, 3, 'najstarszy', 'Tresc trzeciego.');

    await waitRt(() => notifyText(f, 'nieudane: 1'), 'podsumowanie z jedna porazka');
    assert.ok(
      !notifyText(f, 'Blad pobierania tresci do archiwum.'),
      'petla nie umarla na wyjatku z re-kotwicy',
    );
  } finally {
    await stopHarness();
  }
});
