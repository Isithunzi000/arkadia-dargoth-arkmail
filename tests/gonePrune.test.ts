/**
 * Widok czysci wpisy oznaczone jako znikniete z serwera (Fala 30c,
 * zgloszenie 2026-10-23): gone-marking (pelny albo zakresowy) dotykal
 * tylko archiwum - skasowany list znikal z Archiwum i kontaktow, ale
 * zostawal w widoku skrzynki i klik w niego konczyl sie "Nie ma tego
 * listu na liscie". Kazde oznaczenie usuwa tez odpowiadajace wpisy
 * z widoku skrzynki (lokalnie, zero komend), a od Fali 28 samo
 * oznaczenie = FIZYCZNY purge rekordu z archiwum (zamiast flagi
 * missingOnServer - zombie siedzialy w bazie i klamaly liczniki).
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

import type { MailboxEntry } from '../src/arkmail/core/session/mailbox.js';
import { fromMailboxEntry } from '../src/arkmail/core/archive';
import { MailUiStore } from '../src/arkmail/ui/store';
import {
  startHarness,
  stopHarness,
  loadTruncatedBox,
  click,
  waitRt,
  type Harness,
} from './harness';

let seq = 0;
const entry = (subject: string, day: number, party = 'Foo'): MailboxEntry => {
  seq += 1;
  return {
    number: seq,
    isRead: true,
    subject,
    forwarded: false,
    party,
    partyKind: 'nadawca',
    date: {
      raw: `X, ${day} XII 2025, 10:00:00`,
      weekday: 'X',
      day,
      month: 12,
      year: 2025,
      time: '10:00:00',
    },
  };
};

test('store: pruneMailboxEntries usuwa wpisy o podanych id, reszta zostaje', () => {
  const s = new MailUiStore();
  const a = entry('zostaje-a', 20);
  const b = entry('zniknal-b', 21);
  const c = entry('zostaje-c', 22, 'Bar');
  s.applyMailbox('odebrane', {
    kind: 'lista',
    header: { box: 'odebrane', truncated: true },
    entries: [a, b, c],
  });
  const goneId = fromMailboxEntry('odebrane', b).id;
  const prune = (
    s as unknown as { pruneMailboxEntries?: (box: 'odebrane', ids: Set<string>) => number }
  ).pruneMailboxEntries;
  assert.equal(typeof prune, 'function', 'metoda istnieje');
  const removed = prune!.call(s, 'odebrane', new Set([goneId]));
  assert.equal(removed, 1, 'usuniety dokladnie jeden wpis');
  assert.deepEqual(
    s.state.boxes.odebrane!.entries.map((e) => e.subject),
    ['zostaje-a', 'zostaje-c'],
    'pozostale wpisy nietkniete, kolejnosc zachowana',
  );
  // Idempotentnosc: drugi przejazd z tym samym zbiorem nic nie rusza.
  const again = prune!.call(s, 'odebrane', new Set([goneId]));
  assert.equal(again, 0, 'ponowne wywolanie bez skutku');
});

test('integracja: pelna indeksacja usuwa z widoku list znikniety z serwera', async () => {
  const h: Harness = await startHarness();
  const { f, content } = h;
  try {
    await loadTruncatedBox(h);
    const rows = () => content.querySelectorAll('.arkmail-entry').length;
    assert.equal(rows(), 3, 'prolog: 3 wpisy w widoku');

    // Zakladka Archiwum -> Indeksuj wszystkie skrzynki.
    click(h, '[data-tab="archiwum"]');
    await waitRt(() => !!content.querySelector('.arkmail-index-all'), 'przycisk indeksacji');
    click(h, '.arkmail-index-all');

    // Odebrane: swieza strona 1 bez "najnowszy" (skasowany na serwerze),
    // potem pusta strona kotwicowa = skrzynka kompletna.
    await waitRt(
      () => f.sent.filter((c) => c === 'listy odebrane').length === 2,
      'indeksacja pobrala strone 1 odebranych',
    );
    f.fire('Listy odebrane (prezentowane jest pierwsze 50):', 'mail');
    f.fire(' 2. *R* Temat: najstarszy', 'mail');
    f.fire('Nadawca: Foo                        Nd, 22 VIII 1999, 01:15:04', 'mail');
    f.fire(' 1. *R* Temat: srodkowy', 'mail');
    f.fire('Nadawca: Foo                        Pn, 23 VIII 1999, 02:20:05', 'mail');
    f.fire('> ', 'prompt');
    await waitRt(
      () => f.sent.includes('listy odebrane przed 23 VIII 1999'),
      'kotwica starszych',
    );
    f.fire('Nie znaleziono zadnych takich odebranych listow.', 'mail');
    f.fire('> ', 'prompt');

    // Pozostale skrzynki puste - petla jedzie dalej.
    await waitRt(
      () => f.sent.filter((c) => c === 'listy nieprzeczytane').length === 2,
      'indeksacja nieprzeczytanych',
    );
    f.fire('Nie masz zadnych nieprzeczytanych listow.', 'mail');
    f.fire('> ', 'prompt');
    await waitRt(() => f.sent.includes('listy wyslane'), 'indeksacja wyslanych');
    f.fire('Nie masz zadnych wyslanych listow.', 'mail');
    f.fire('> ', 'prompt');
    await waitRt(() => f.sent.includes('listy niewyslane'), 'indeksacja niewyslanych');
    f.fire('Nie masz zadnych niewyslanych listow.', 'mail');
    f.fire('> ', 'prompt');
    await waitRt(() => !content.querySelector('.arkmail-busy'), 'koniec indeksacji');

    // Widok skrzynki: znikniety list usuniety, zywe zostaly.
    click(h, '[data-tab="listy"]');
    await waitRt(() => rows() === 2, 'widok wyczyscil znikniety list');
    const subjects = [...content.querySelectorAll('.arkmail-entry-subject')].map(
      (el) => (el as { textContent: string }).textContent,
    );
    assert.ok(!subjects.includes('najnowszy'), 'znikniety list zniknal z widoku');
    assert.ok(subjects.includes('najstarszy'), 'zywy list zostaje');
    assert.ok(subjects.includes('srodkowy'), 'zywy list zostaje (2)');

    // Archiwum tez go nie pokazuje (fizyczny purge, Fala 28).
    click(h, '[data-tab="archiwum"]');
    await waitRt(
      () => content.querySelectorAll('.arkmail-arch-entry').length === 2,
      'archiwum ukrywa znikniety list',
    );
  } finally {
    await stopHarness();
  }
});
