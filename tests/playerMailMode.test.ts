/**
 * Fala 24f: reczny tryb poczty gracza + szersze odswiezanie.
 *
 * Zgloszenie 2026-10-21: "ArkMail blokowal wpisywanie komend jak sie
 * wyswietla list recznie" - gracz musial odinstalowac wtyczke, zeby
 * recznie skasowac list. Fala 24g zdjela auto-"q" straznika; Fala 24f
 * domyka temat odswiezan: w recznym trybie poczty gracza ZADNA
 * komenda pluginu nie wychodzi (pager gracza zjadlby ja), odswiezenia
 * parkuja, a po wyjsciu (echo q/x albo bezczynnosc) leci drenaz i
 * obowiazkowy refresh inboxa.
 *
 * f1: powrot zwierzecia odswieza tez niewyslane+wyslane (moglo
 *     dostarczyc niewyslane, ktore przechodza do wyslanych).
 * f2: sledzenie trybu poczty gracza + parkowanie scheduleRefresh.
 * f3: linia serwera "Kasuje listy..." (reczne kasowanie zaznaczonych)
 *     odswieza wszystkie 4 skrzynki (parkowana w trybie gracza).
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

import type { MailBox } from '../src/arkmail/core/protocol/types.js';
import { PLAYER_MAIL_MODE_IDLE_MS } from '../src/arkmail/index';
import { parseNotification } from '../src/arkmail/core/protocol/parser';
import { startHarness, stopHarness, waitRt, type Harness } from './harness';

const GENITIVE: Record<MailBox, string> = {
  odebrane: 'odebranych',
  nieprzeczytane: 'nieprzeczytanych',
  wyslane: 'wyslanych',
  niewyslane: 'niewyslanych',
};

/** Licznik kolejnych wystrzalen (f.sent kumuluje sie miedzy rundami). */
const answered = new Map<string, number>();

const answerEmpty = async (h: Harness, box: MailBox): Promise<void> => {
  const cmd = `listy ${box}`;
  const n = (answered.get(cmd) ?? 0) + 1;
  await h.waitFor(() => h.f.sent.filter((c) => c === cmd).length >= n, `${cmd} #${n}`);
  answered.set(cmd, n);
  h.f.fire(`Nie masz zadnych ${GENITIVE[box]} listow.`, 'mail');
};

const waitIdle = (h: Harness): Promise<void> =>
  h.waitFor(() => !h.content.querySelector('.arkmail-busy'), 'koniec sesji');

const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

test('parseNotification: "Kasuje listy..." + stala bezczynnosci trybu (Fala 24f)', () => {
  assert.deepEqual(parseNotification('Kasuje listy...'), { kind: 'kasowanie' });
  assert.equal(PLAYER_MAIL_MODE_IDLE_MS, 180_000, 'bezczynnosc trybu poczty gracza');
});

test('powrot zwierzecia odswieza tez niewyslane i wyslane (Fala 24f1)', async () => {
  answered.clear();
  const h = await startHarness();
  try {
    h.f.fire('Wsrod trzepotu skrzydel Sroka laduje na twoim prawym ramieniu.', 'mail');
    await answerEmpty(h, 'odebrane');
    await answerEmpty(h, 'nieprzeczytane');
    await answerEmpty(h, 'niewyslane');
    await answerEmpty(h, 'wyslane');
    await waitIdle(h);
  } finally {
    await stopHarness();
  }
});

test('tryb poczty gracza parkuje odswiezenia, wyjscie "q" odpala drenaz (Fala 24f2)', async () => {
  answered.clear();
  const h = await startHarness();
  const { f } = h;
  try {
    // Gracz wchodzi w poczte recznie (echo jego komendy).
    f.fire('→ listy');
    // Powiadomienie w trakcie jego sesji: zadna komenda pluginu NIE
    // moze wyjsc - pager gracza zjadlby ja, a straznik
    // desynchronizacji moglby odpowiedziec "q" (Fala 17a).
    f.fire(' [ POCZTA ] Masz nowa poczte od Foo.', 'mail');
    await sleep(300);
    assert.deepEqual(f.sent, [], 'zero komend pluginu w recznym trybie poczty');
    // Wyjscie "q": zaparkowane odswiezenie + obowiazkowy refresh
    // inboxa (gracz mogl czytac/kasowac).
    f.fire('→ q');
    await answerEmpty(h, 'odebrane');
    await answerEmpty(h, 'nieprzeczytane');
    await waitIdle(h);
  } finally {
    await stopHarness();
  }
});

test('kasowanie w trybie poczty gracza parkuje, po wyjsciu drenaz 4 skrzynek (Fala 24f3)', async () => {
  answered.clear();
  const h = await startHarness();
  const { f } = h;
  try {
    // Scenariusz z loga 2026-10-21: gracz zaznaczyl listy recznie
    // i kasuje je w swojej sesji pocztowej.
    f.fire('→ listy');
    f.fire('Kasuje listy...', 'mail');
    await sleep(300);
    assert.deepEqual(f.sent, [], 'kasowanie zaparkowane w trybie gracza');
    // Po wyjsciu drenaz obejmuje wszystkie 4 skrzynki.
    f.fire('→ q');
    await answerEmpty(h, 'odebrane');
    await answerEmpty(h, 'nieprzeczytane');
    await answerEmpty(h, 'wyslane');
    await answerEmpty(h, 'niewyslane');
    await waitIdle(h);
  } finally {
    await stopHarness();
  }
});
