/**
 * GMCP Mail.State jako wyzwalacz odswiezania skrzynek (Fala 13a).
 *
 * Kontekst: serwer wysyla Mail.State automatycznie po zalogowaniu oraz
 * przy otrzymywaniu i czytaniu poczty (Specyfikacja GMCP Arkadii).
 * Payload: { unread, unreceived, unsent } - booleane. Klient emituje
 * event "gmcp.mail.state" (path lowercasowany w gmcp.ts klienta).
 *
 * Dlaczego potrzebne: linie tekstowe potrafia sie rozjechac z prawda
 * serwera - log 2026-01-04 01:03: "[ POCZTA ] Masz nowa poczte od Bar."
 * i 15 s pozniej przy ladowaniu zwierzecia "Nie masz zadnych
 * nieprzeczytanych listow." (list byl w skrzynce). GMCP jest
 * deklaratywne (stan, nie zdarzenie), wiec jest lepszym wyzwalaczem;
 * badge nadal liczony jest z listingow (computeBadge), GMCP tylko
 * odpala odswiezenie.
 *
 * Kontrakt:
 *  - pierwszy stan po starcie: odswiezamy tylko grupy z flaga TRUE
 *    (cos jest do pokazania); sam stan "wszystko false" nic nie robi;
 *  - kolejne ramki: ZMIANA unread/unreceived -> odebrane+nieprzeczytane,
 *    zmiana unsent -> niewyslane+wyslane; identyczna ramka = bez ruchu;
 *  - zmiana w trakcie trwania sesji pocztowej (lock) NIE kolejkuje
 *    osobnego refresha na slepo: skrzynki laduja w zbiorniku i zostana
 *    pobrane jedna drenażowa sesja po zwolnieniu locka (koalescencja -
 *    ani duplikatow, ani zgubionych aktualizacji);
 *  - nieprawidlowy payload (null, string, {}, nie-boolean) jest ignorowany.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

import type { MailBox } from '../src/arkmail/core/protocol/types.js';
import { startHarness, stopHarness, type Harness } from './harness';

const GENITIVE: Record<MailBox, string> = {
  odebrane: 'odebranych',
  nieprzeczytane: 'nieprzeczytanych',
  wyslane: 'wyslanych',
  niewyslane: 'niewyslanych',
};

/** Licznik kolejnych wystrzalen komend - f.sent jest kumulatywne, wiec
 *  "czy wyslano" musi byc liczone per runda (drenaż 2 strzela te same
 *  komendy co drenaż 1). */
const answered = new Map<string, number>();

/** Odpowiada pustym listingiem na KOLEJNA komende "listy <box>". */
const answerEmpty = async (h: Harness, box: MailBox): Promise<void> => {
  const cmd = `listy ${box}`;
  const n = (answered.get(cmd) ?? 0) + 1;
  await h.waitFor(() => h.f.sent.filter((c) => c === cmd).length >= n, `${cmd} #${n}`);
  answered.set(cmd, n);
  h.f.fire(`Nie masz zadnych ${GENITIVE[box]} listow.`, 'mail');
};

/** Czeka, az pasek "busy" zniknie (koniec biezacej sesji pocztowej). */
const waitIdle = (h: Harness): Promise<void> =>
  h.waitFor(() => !h.content.querySelector('.arkmail-busy'), 'koniec sesji (busy znika)');

const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

test('gmcp.mail.state: pierwsza ramka z unread=true odswieza odebrane i nieprzeczytane', async () => {
  answered.clear();
  answered.clear();
  const h = await startHarness();
  try {
    h.f.fireEvent('gmcp.mail.state', { unread: true, unreceived: false, unsent: false });
    await answerEmpty(h, 'odebrane');
    await answerEmpty(h, 'nieprzeczytane');
    await waitIdle(h);
  } finally {
    await stopHarness();
  }
});

test('gmcp.mail.state: identyczna ramka powtorna nie strzela', async () => {
  answered.clear();
  const h = await startHarness();
  try {
    h.f.fireEvent('gmcp.mail.state', { unread: true, unreceived: false, unsent: false });
    await answerEmpty(h, 'odebrane');
    await answerEmpty(h, 'nieprzeczytane');
    await waitIdle(h);
    h.f.sent.length = 0;
    h.f.fireEvent('gmcp.mail.state', { unread: true, unreceived: false, unsent: false });
    await sleep(120);
    assert.deepEqual(h.f.sent, []);
  } finally {
    await stopHarness();
  }
});

test('gmcp.mail.state: zmiana unsent odswieza niewyslane i wyslane', async () => {
  answered.clear();
  const h = await startHarness();
  try {
    h.f.fireEvent('gmcp.mail.state', { unread: false, unreceived: false, unsent: true });
    await answerEmpty(h, 'niewyslane');
    await answerEmpty(h, 'wyslane');
    await waitIdle(h);
  } finally {
    await stopHarness();
  }
});

test('gmcp.mail.state: zmiana unread true->false odswieza ponownie (poczta przeczytana gdzie indziej)', async () => {
  answered.clear();
  const h = await startHarness();
  try {
    h.f.fireEvent('gmcp.mail.state', { unread: true, unreceived: false, unsent: false });
    await answerEmpty(h, 'odebrane');
    await answerEmpty(h, 'nieprzeczytane');
    await waitIdle(h);
    h.f.fireEvent('gmcp.mail.state', { unread: false, unreceived: false, unsent: false });
    await answerEmpty(h, 'odebrane');
    await answerEmpty(h, 'nieprzeczytane');
    await waitIdle(h);
  } finally {
    await stopHarness();
  }
});

test('gmcp.mail.state: zmiana pod lockiem czeka w zbiorniku i dochodzi po zwolnieniu (koalescencja)', async () => {
  answered.clear();
  const h = await startHarness();
  try {
    // Sesja w toku: powiadomienie tekstowe odpala refresh i NIE odpowiadamy
    // na listing - blokada jest trzymana.
    h.f.fire(' [ POCZTA ] Masz nowa poczte od Foo.');
    await h.waitFor(() => h.f.sent.includes('listy odebrane'), 'refresh po powiadomieniu');
    h.f.fireEvent('gmcp.mail.state', { unread: true, unreceived: false, unsent: true });
    await sleep(120);
    assert.ok(
      !h.f.sent.includes('listy niewyslane') && !h.f.sent.includes('listy wyslane'),
      'gmcp pod blokada nie moze wystrzelic kolejnych listingow w locie',
    );
    // Zwolnienie locka: odlozony drenaż pobiera caly zbiornik (ramka gmcp
    // miala unread=true, wiec inbox tez jest w drugiej turze) - dokladnie raz.
    await answerEmpty(h, 'odebrane');
    await answerEmpty(h, 'nieprzeczytane');
    await answerEmpty(h, 'odebrane');
    await answerEmpty(h, 'nieprzeczytane');
    await answerEmpty(h, 'niewyslane');
    await answerEmpty(h, 'wyslane');
    await waitIdle(h);
    assert.equal(
      h.f.sent.filter((c) => c === 'listy niewyslane').length,
      1,
      'drenaż po zwolnieniu locka - dokladnie jeden listing niewyslane',
    );
  } finally {
    await stopHarness();
  }
});

test('gmcp.mail.state: nieprawidlowy payload jest ignorowany', async () => {
  answered.clear();
  const h = await startHarness();
  try {
    for (const bad of [null, 'x', 42, {}, { unread: 'tak' }]) {
      h.f.fireEvent('gmcp.mail.state', bad);
    }
    await sleep(120);
    assert.deepEqual(h.f.sent, []);
  } finally {
    await stopHarness();
  }
});
