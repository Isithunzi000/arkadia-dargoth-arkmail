/**
 * "Slucham?" po naszym "wyslij zwierze" (Fala 13d).
 *
 * Dowod z logow (session_1766262715076, 1999-08-22 01:15:12): gracz bez
 * zwierzecia pocztowego wpisal "wyslij zwierze" i dostal generyczne
 * "Slucham?" - bez zwierzecia komenda w ogole nie istnieje w parserze
 * serwera, wiec nie ma dedykowanego komunikatu pocztowego. W tej samej
 * sesji "Slucham?" pada ~250 razy przy rozmaitych nieznanych komendach,
 * wiec NIE wolno reagowac na nie globalnie - tylko w waskim oknie
 * (ANIMAL_TIMING.sluchamWindowMs) po NASZYM wyslaniu i tylko dopoki
 * serwer nie potwierdzil linia "Wysylasz ...".
 *
 * Kontrakt:
 *  - "Slucham?" w oknie -> koniec lotu + tost o braku zwierzecia;
 *  - "Slucham?" bez lotu / po oknie / po potwierdzeniu -> ignorowane.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

import type { MailBox } from '../src/arkmail/core/protocol/types.js';
import { ANIMAL_TIMING } from '../src/arkmail/index';
import { startHarness, stopHarness, click, waitRt, queryUi, type Harness } from './harness';

const GENITIVE: Record<MailBox, string> = {
  odebrane: 'odebranych',
  nieprzeczytane: 'nieprzeczytanych',
  wyslane: 'wyslanych',
  niewyslane: 'niewyslanych',
};

const answered = new Map<string, number>();

const answerEmpty = async (h: Harness, box: MailBox): Promise<void> => {
  const cmd = `listy ${box}`;
  const n = (answered.get(cmd) ?? 0) + 1;
  await h.waitFor(() => h.f.sent.filter((c) => c === cmd).length >= n, `${cmd} #${n}`);
  answered.set(cmd, n);
  h.f.fire(`Nie masz zadnych ${GENITIVE[box]} listow.`, 'mail');
};

const waitIdle = (h: Harness): Promise<void> =>
  h.waitFor(() => ((h.content.querySelector('.arkmail-busy') as { textContent?: string | null } | null)?.textContent ?? 'missing') === '', 'koniec sesji');

const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

const animalDisabled = (h: Harness): boolean | null =>
  (queryUi(h, '.arkmail-animal-send') as { disabled: boolean } | null)?.disabled ?? null;

const sluchamToast = (h: Harness): boolean =>
  h.f.shown.some((o) =>
    String((o as { text?: string })?.text ?? '').includes('Arkadia nie rozpoznala komendy wyslania zwierzecia. Sprawdz, czy masz zwierze pocztowe.'),
  );

test('"Slucham?" w oknie po wyslaniu konczy lot i daje tost o braku zwierzecia', async () => {
  answered.clear();
  const h = await startHarness();
  try {
    click(h, '.arkmail-animal-send');
    await h.waitFor(() => h.f.sent.includes('wyslij zwierze'), 'komenda wyslij zwierze');
    await h.waitFor(() => animalDisabled(h) === true, 'lot uzbrojony');
    h.f.fire('Slucham?');
    await h.waitFor(() => animalDisabled(h) === false, 'lot zakonczony po Slucham?');
    assert.ok(sluchamToast(h), 'tost o braku zwierzecia');
  } finally {
    await stopHarness();
  }
});

test('"Slucham?" bez lotu jest ignorowane (generyczny blad parsera serwera)', async () => {
  answered.clear();
  const h = await startHarness();
  try {
    h.f.fire('Slucham?');
    await sleep(80);
    assert.ok(!sluchamToast(h), 'zero tostu bez lotu');
    assert.equal(animalDisabled(h), false, 'przycisk dalej aktywny');
    assert.deepEqual(h.f.sent, [], 'zero komend');
  } finally {
    await stopHarness();
  }
});

test('"Slucham?" po potwierdzeniu wyslania (Wysylasz) nie konczy lotu', async () => {
  answered.clear();
  const h = await startHarness();
  try {
    click(h, '.arkmail-animal-send');
    await h.waitFor(() => h.f.sent.includes('wyslij zwierze'), 'komenda wyslij zwierze');
    h.f.fire('Wysylasz Sroka na poczte.', 'mail');
    h.f.fire('Slucham?'); // np. rownolegla nieznana komenda gracza w oknie
    await sleep(80);
    assert.ok(!sluchamToast(h), 'zero tostu po potwierdzeniu');
    assert.equal(animalDisabled(h), true, 'lot trwa');
    // Sprzatniecie: ladowanie.
    h.f.fire('Wsrod trzepotu skrzydel Sroka laduje na twoim prawym ramieniu.', 'mail');
    await answerEmpty(h, 'odebrane');
    await answerEmpty(h, 'nieprzeczytane');
    // Fala 24f1: powrot odswieza tez niewyslane i wyslane.
    await answerEmpty(h, 'niewyslane');
    await answerEmpty(h, 'wyslane');
    await waitIdle(h);
  } finally {
    await stopHarness();
  }
});

test('natychmiastowe "Slucham?" z wnetrza API nie gubi zdarzenia ani nie zostawia lotu', async () => {
  answered.clear();
  const h = await startHarness();
  h.f.sendImpl = () => {
    h.f.fire('Slucham?');
    return Promise.resolve();
  };
  try {
    click(h, '.arkmail-animal-send');
    await h.waitFor(() => sluchamToast(h), 'natychmiastowy komunikat serwera');
    await new Promise((resolve) => setTimeout(resolve, 30));
    assert.equal(animalDisabled(h), false, 'pozne przyjecie Promise nie odpala lotu po bledzie serwera');
    assert.equal(h.f.sent.filter((cmd) => cmd === 'wyslij zwierze').length, 1);
  } finally {
    await stopHarness();
  }
});

test('"Slucham?" po zamknieciu okna nie konczy lotu', async () => {
  answered.clear();
  ANIMAL_TIMING.sluchamWindowMs = 40;
  const h = await startHarness();
  try {
    click(h, '.arkmail-animal-send');
    await h.waitFor(() => h.f.sent.includes('wyslij zwierze'), 'komenda wyslij zwierze');
    await sleep(90); // okno 40 ms dawno zamkniete
    h.f.fire('Slucham?');
    await sleep(60);
    assert.ok(!sluchamToast(h), 'zero tostu po oknie');
    assert.equal(animalDisabled(h), true, 'lot trwa');
    h.f.fire('Wsrod trzepotu skrzydel Sroka laduje na twojej rece.', 'mail');
    await answerEmpty(h, 'odebrane');
    await answerEmpty(h, 'nieprzeczytane');
    // Fala 24f1: powrot odswieza tez niewyslane i wyslane.
    await answerEmpty(h, 'niewyslane');
    await answerEmpty(h, 'wyslane');
    await waitIdle(h);
  } finally {
    ANIMAL_TIMING.sluchamWindowMs = 2000;
    await stopHarness();
  }
});
