/**
 * Przycisk "Wyslij Zwierze" i maszyna lotu zwierzecia (Fala 13b).
 *
 * Protokol zwierzecia pocztowego (dowody: 576 logow 2025-12/2026-01):
 *  - komenda "wyslij zwierze" (bez argumentow) -> "Wysylasz Kruk na
 *    poczte." + flavor o skrzydlach (roundtrip 20-50 s);
 *  - powrot: "Wsrod trzepotu skrzydel Kruk laduje na twoim prawym
 *    ramieniu." ALBO "...laduje na twojej rece." (dwa warianty);
 *  - przy powrocie serwer sam wypisuje stan nieprzeczytanych - inbox
 *    moze sie zmienic, wiec ladowanie odpala odswiezenie (koalescencja
 *    z Fali 13a zbiera je razem z ewentualnym GMCP);
 *  - gracz moze wyslac zwierze RECZNIE (komenda wpisana w gre) -
 *    linia "Wysylasz ..." bez klikniecia w przycisk tez uzbraja lot
 *    (parsowana od dawna jako 'wysylasz', dotychczas nieuzywana).
 *
 * Maszyna lotu: klik -> lot (przycisk nieaktywny) -> koniec na
 * ladowaniu albo po timeoutcie (ANIMAL_TIMING.flightTimeoutMs).
 * Klik pod lockiem sesji = komunikat zamiast komendy (jak wszedzie);
 * klik w trakcie lotu = komunikat, zero duplikatow komendy.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

import type { MailBox } from '../src/arkmail/core/protocol/types.js';
import { ANIMAL_TIMING } from '../src/arkmail/index';
import { startHarness, stopHarness, click, textOf, waitRt, type Harness } from './harness';

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

const animalBtn = (h: Harness): { disabled: boolean } | null =>
  h.content.querySelector('.arkmail-animal-send') as { disabled: boolean } | null;

test('przycisk Wyslij Zwierze istnieje i wysyla komende "wyslij zwierze"', async () => {
  answered.clear();
  const h = await startHarness();
  try {
    assert.ok(animalBtn(h), 'przycisk w pasku operacji');
    assert.equal(textOf(h, '.arkmail-animal-send'), 'Wyslij zwierze');
    click(h, '.arkmail-animal-send');
    await h.waitFor(() => h.f.sent.includes('wyslij zwierze'), 'komenda wyslij zwierze');
  } finally {
    await stopHarness();
  }
});

test('po wyslaniu przycisk jest nieaktywny do konca lotu', async () => {
  answered.clear();
  const h = await startHarness();
  try {
    click(h, '.arkmail-animal-send');
    await h.waitFor(() => h.f.sent.includes('wyslij zwierze'), 'komenda wyslij zwierze');
    await h.waitFor(() => animalBtn(h)?.disabled === true, 'przycisk nieaktywny w locie');
    assert.ok(textOf(h, '.arkmail-animal-send').includes('w drodze'), 'etykieta lotu');
    // Sprzatniecie lotu: ladowanie.
    h.f.fire('Wsrod trzepotu skrzydel Kruk laduje na twoim prawym ramieniu.', 'mail');
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

test('linia ladowania konczy lot i odswieza inbox', async () => {
  answered.clear();
  const h = await startHarness();
  try {
    click(h, '.arkmail-animal-send');
    await h.waitFor(() => h.f.sent.includes('wyslij zwierze'), 'komenda wyslij zwierze');
    h.f.fire('Wsrod trzepotu skrzydel Kruk laduje na twoim prawym ramieniu.', 'mail');
    await h.waitFor(() => animalBtn(h)?.disabled === false, 'przycisk aktywny po ladowaniu');
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

test('drugi wariant ladowania ("na twojej rece") tez konczy lot', async () => {
  answered.clear();
  const h = await startHarness();
  try {
    click(h, '.arkmail-animal-send');
    await h.waitFor(() => h.f.sent.includes('wyslij zwierze'), 'komenda wyslij zwierze');
    h.f.fire('Wsrod trzepotu skrzydel Kruk laduje na twojej rece.', 'mail');
    await h.waitFor(() => animalBtn(h)?.disabled === false, 'przycisk aktywny po ladowaniu');
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

test('reczna komenda gracza (linia Wysylasz) uzbraja lot bez kliku', async () => {
  answered.clear();
  const h = await startHarness();
  try {
    assert.ok(animalBtn(h)?.disabled === false, 'przycisk aktywny na starcie');
    h.f.fire('Wysylasz Kruk na poczte.', 'mail');
    await h.waitFor(() => animalBtn(h)?.disabled === true, 'lot uzbrojony z linii gry');
    h.f.fire('Wsrod trzepotu skrzydel Kruk laduje na twoim prawym ramieniu.', 'mail');
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

test('klik pod lockiem sesji nie wysyla komendy (komunikat zamiast kolejki)', async () => {
  answered.clear();
  const h = await startHarness();
  try {
    // Sesja w toku: powiadomienie odpala refresh, nie odpowiadamy.
    h.f.fire(' [ POCZTA ] Masz nowa poczte od Foo.');
    await h.waitFor(() => h.f.sent.includes('listy odebrane'), 'refresh trzyma lock');
    click(h, '.arkmail-animal-send');
    await waitRt(() => h.f.emitted.some((e) => e.event === 'notify'), 'tost o zajetej sesji');
    assert.ok(!h.f.sent.includes('wyslij zwierze'), 'zero komendy pod lockiem');
    // Sprzatniecie.
    await answerEmpty(h, 'odebrane');
    await answerEmpty(h, 'nieprzeczytane');
    await waitIdle(h);
  } finally {
    await stopHarness();
  }
});

test('klik w trakcie lotu nie wysyla duplikatu', async () => {
  answered.clear();
  const h = await startHarness();
  try {
    click(h, '.arkmail-animal-send');
    await h.waitFor(() => h.f.sent.includes('wyslij zwierze'), 'komenda wyslij zwierze');
    click(h, '.arkmail-animal-send');
    await waitRt(
      () =>
        h.f.emitted.some(
          (e) => e.event === 'notify' && String((e.args[0] as { text?: string })?.text ?? '').includes('w drodze'),
        ),
      'tost o locie w toku',
    );
    assert.equal(
      h.f.sent.filter((c) => c === 'wyslij zwierze').length,
      1,
      'dokladnie jedna komenda wyslij zwierze',
    );
    // Sprzatniecie lotu.
    h.f.fire('Wsrod trzepotu skrzydel Kruk laduje na twoim prawym ramieniu.', 'mail');
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

test('timeout lotu zdejmuje blokade przycisku', async () => {
  answered.clear();
  ANIMAL_TIMING.flightTimeoutMs = 60;
  const h = await startHarness();
  try {
    click(h, '.arkmail-animal-send');
    await h.waitFor(() => h.f.sent.includes('wyslij zwierze'), 'komenda wyslij zwierze');
    await h.waitFor(() => animalBtn(h)?.disabled === true, 'lot uzbrojony');
    await waitRt(() => animalBtn(h)?.disabled === false, 'przycisk odblokowany po timeoutcie');
  } finally {
    ANIMAL_TIMING.flightTimeoutMs = 60000;
    await stopHarness();
  }
});
