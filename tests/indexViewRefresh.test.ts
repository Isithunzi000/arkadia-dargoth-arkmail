import test from 'node:test';
import assert from 'node:assert/strict';
import {
  startHarness,
  stopHarness,
  loadTruncatedBox,
  waitRt,
  click,
  type Harness,
} from './harness';

function entryTexts(h: Harness): string[] {
  return Array.from(
    h.content.querySelectorAll('.arkmail-entry') as unknown as Iterable<{
      textContent?: string;
    }>,
  ).map((entry) => String(entry.textContent ?? ''));
}

async function startIndexing(h: Harness): Promise<void> {
  click(h, '[data-tab="archiwum"]');
  await waitRt(() => !!h.content.querySelector('.arkmail-index-all'), 'przycisk indeksacji');
  click(h, '.arkmail-index-all');
  await waitRt(
    () => h.f.sent.filter((command) => command === 'listy odebrane').length === 2,
    'pierwsza strona indeksacji',
  );
}

async function finishOtherBoxes(h: Harness): Promise<void> {
  const { f } = h;
  await waitRt(
    () => f.sent.filter((command) => command === 'listy nieprzeczytane').length === 2,
    'indeksacja nieprzeczytanych',
  );
  f.fire('Nie masz zadnych nieprzeczytanych listow.', 'mail');
  await waitRt(() => f.sent.includes('listy wyslane'), 'indeksacja wyslanych');
  f.fire('Nie masz zadnych wyslanych listow.', 'mail');
  await waitRt(() => f.sent.includes('listy niewyslane'), 'indeksacja niewyslanych');
  f.fire('Nie masz zadnych niewyslanych listow.', 'mail');
  await waitRt(() => !h.content.querySelector('.arkmail-busy'), 'koniec indeksacji');
}

test('indeksacja odswieza skrzynke i kontakty po stronach oraz zachowuje starsze wpisy', async () => {
  const h = await startHarness();
  const { f } = h;
  try {
    await loadTruncatedBox(h);
    await startIndexing(h);
    f.fire('Listy odebrane (prezentowane jest pierwsze 50):', 'mail');
    f.fire(' 4. *R* Temat: swiezy', 'mail');
    f.fire('Nadawca: Waldo                      S, 24 XII 2025, 01:00:00', 'mail');
    f.fire(' 3. *R* Temat: najnowszy', 'mail');
    f.fire('Nadawca: Corge                       Wt, 23 XII 2025, 00:11:12', 'mail');
    f.fire(' 2. *R* Temat: srodkowy', 'mail');
    f.fire('Nadawca: Foo                        Pn, 22 XII 2025, 02:20:05', 'mail');
    f.fire(' 1. *R* Temat: najstarszy', 'mail');
    f.fire('Nadawca: Foo                        N, 21 XII 2025, 01:15:04', 'mail');
    f.fire('> ', 'prompt');
    click(h, '[data-tab="listy"]');
    await waitRt(
      () => entryTexts(h).some((text) => text.includes('swiezy')),
      'pierwsza strona widoczna w skrzynce',
    );
    click(h, '[data-tab="kontakty"]');
    await waitRt(
      () =>
        Array.from(
          h.content.querySelectorAll('.arkmail-contact-name') as unknown as Iterable<{
            textContent?: string;
          }>,
        ).some((entry) => String(entry.textContent ?? '') === 'Waldo'),
      'kontakt z pierwszej strony przed koncem indeksacji',
    );
    click(h, '[data-tab="listy"]');

    await waitRt(() => f.sent.includes('listy odebrane przed 22 XII 2025'), 'druga strona');
    f.fire('Listy odebrane:', 'mail');
    f.fire(' 1. *R* Temat: prastary', 'mail');
    f.fire('Nadawca: Baz                        S, 20 XII 2025, 10:00:00', 'mail');
    f.fire('> ', 'prompt');
    await waitRt(
      () => entryTexts(h).some((text) => text.includes('prastary')),
      'druga strona doklejona do skrzynki',
    );
    const texts = entryTexts(h);
    assert.ok(texts.some((text) => text.includes('swiezy')), 'pierwsza strona pozostaje');
    assert.ok(texts.some((text) => text.includes('prastary')), 'starsza strona jest obecna');
    await finishOtherBoxes(h);
  } finally {
    await stopHarness();
  }
});

test('odswiezenie strony bazowej podczas indeksacji aktualizuje widok', async () => {
  const h = await startHarness();
  const { f } = h;
  const replaySamePage = (): void => {
    f.fire('Listy odebrane (prezentowane jest pierwsze 50):', 'mail');
    f.fire(' 3. *R* Temat: najstarszy', 'mail');
    f.fire('Nadawca: Foo                        N, 21 XII 2025, 01:15:04', 'mail');
    f.fire(' 2. *R* Temat: srodkowy', 'mail');
    f.fire('Nadawca: Foo                        Pn, 22 XII 2025, 02:20:05', 'mail');
    f.fire(' 1. *R* Temat: najnowszy', 'mail');
    f.fire('Nadawca: Corge                       Wt, 23 XII 2025, 00:11:12', 'mail');
    f.fire('> ', 'prompt');
  };
  try {
    await loadTruncatedBox(h);
    await startIndexing(h);
    replaySamePage();
    await waitRt(() => f.sent.includes('listy odebrane przed 22 XII 2025'), 'kotwica');
    replaySamePage();
    await waitRt(
      () => f.sent.filter((command) => command === 'listy odebrane').length === 3,
      'ponowne pobranie strony bazowej',
    );
    f.fire('Listy odebrane (prezentowane jest pierwsze 50):', 'mail');
    f.fire(' 1. *R* Temat: odswiezony', 'mail');
    f.fire('Nadawca: Grault                     S, 24 XII 2025, 01:00:00', 'mail');
    f.fire('> ', 'prompt');
    click(h, '[data-tab="listy"]');
    await waitRt(
      () => entryTexts(h).some((text) => text.includes('odswiezony')),
      'widok po ponownym pobraniu strony bazowej',
    );
    await waitRt(
      () => f.sent.filter((command) => command === 'listy odebrane przed 22 XII 2025').length === 2,
      'powtorzona kotwica',
    );
    f.fire('Nie znaleziono zadnych takich odebranych listow.', 'mail');
    await finishOtherBoxes(h);
  } finally {
    await stopHarness();
  }
});


test('pusta odpowiedz po stronach konczy indeksacje i zdejmuje limit widoku', async () => {
  const h = await startHarness();
  const { f } = h;
  try {
    await loadTruncatedBox(h);
    await startIndexing(h);
    f.fire('Listy odebrane (prezentowane jest pierwsze 50):', 'mail');
    f.fire(' 2. *R* Temat: najnowszy', 'mail');
    f.fire('Nadawca: Corge                       Wt, 23 XII 2025, 00:11:12', 'mail');
    f.fire(' 1. *R* Temat: najstarszy', 'mail');
    f.fire('Nadawca: Foo                        N, 21 XII 2025, 01:15:04', 'mail');
    f.fire('> ', 'prompt');
    await waitRt(() => f.sent.includes('listy odebrane przed 22 XII 2025'), 'pusta strona');
    f.fire('Nie znaleziono zadnych takich odebranych listow.', 'mail');
    await finishOtherBoxes(h);
    click(h, '[data-tab="listy"]');
    await waitRt(() => entryTexts(h).length > 0, 'widok po zakonczonej indeksacji');
    assert.ok(
      !h.content.querySelector('.arkmail-older'),
      'kompletny widok nie pokazuje pobierania starszych',
    );
  } finally {
    await stopHarness();
  }
});
