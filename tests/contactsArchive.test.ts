/**
 * Kontakty liczone z ARCHIWUM, nie z zaladowanych widokow skrzynek
 * (Fala 14a, zgloszenie uzytkownika z sesji 2026-10-19: "zliczanie
 * wiadomosci per kontakt jest zjebane").
 *
 * Problem: contactsFromBoxes liczy tylko wpisy aktualnie zaladowane
 * (domyslnie pierwsze 50 na skrzynke) - licznik skakal w zaleznosci
 * od tego, co gracz akurat wczytal, a po refreshu z pustym listingu
 * kontakty znikaly. Archiwum (Fala 8f) kumuluje KAZDY pobrany listing
 * i przetrwa refresh oraz restart (storage) - licznik jest stabilny.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { contactsFromArchive } from '../src/arkmail/core/contacts';
import type { ArchiveLetter } from '../src/arkmail/core/archive';
import {
  startHarness,
  stopHarness,
  loadTruncatedBox,
  click,
  type Harness,
} from './harness';

function archLetter(partial: Partial<ArchiveLetter>): ArchiveLetter {
  return {
    id: 'x',
    box: 'odebrane',
    number: 1,
    party: 'Foo',
    subject: 'kartka',
    dateRaw: 'Wt, 23 XII 2025, 00:11:12',
    sortKey: '2025-12-23 00:11:12',
    read: true,
    body: [],
    ...partial,
  };
}

test('contactsFromArchive: kierunek po skrzynce, liczniki i ostatni kontakt', () => {
  const out = contactsFromArchive([
    archLetter({ box: 'odebrane', party: 'Foo' }),
    archLetter({ box: 'nieprzeczytane', party: 'Foo' }), // ten sam list - raz
    archLetter({
      box: 'wyslane',
      party: 'Foo',
      subject: 'odpowiedz',
      dateRaw: 'Cz, 25 XII 2025, 10:00:00',
      sortKey: '2025-12-25 10:00:00',
    }),
  ]);
  const af = out.find((c) => c.name === 'Foo')!;
  assert.equal(af.lettersReceived, 1, 'odebrane+nieprzeczytane to jeden list');
  assert.equal(af.lettersSent, 1);
  assert.equal(af.lastContactRaw, 'Cz, 25 XII 2025, 10:00:00');
});

test('contactsFromArchive: forward w tej samej sekundzie liczy sie osobno', () => {
  const out = contactsFromArchive([
    archLetter({ box: 'wyslane', party: 'Bar', forwarded: false }),
    archLetter({ box: 'wyslane', party: 'Bar', forwarded: true }),
  ]);
  const gw = out.find((c) => c.name === 'Bar')!;
  assert.equal(gw.lettersSent, 2, 'flaga forwarded rozroznia listy');
});

test('contactsFromArchive: rekord bez daty i bez flagged forwarded (stare storage)', () => {
  // Kompatybilnosc wstecz: rekordy zapisane przed Fala 14a nie maja
  // pola forwarded - traktujemy jak false, daty brak = bez klucza.
  const legacy = archLetter({ party: 'Baz', dateRaw: null, sortKey: '0000-00-00 00:00:00' });
  delete (legacy as Partial<ArchiveLetter>).forwarded;
  const out = contactsFromArchive([legacy]);
  const el = out.find((c) => c.name === 'Baz')!;
  assert.equal(el.lettersReceived, 1);
  assert.equal(el.lastContactKey, undefined);
});

test('kontakty z archiwum: pusta skrzynka (kompletna prawda) zdejmuje liczniki', async () => {
  const h: Harness = await startHarness();
  const { f, waitFor, content } = h;
  try {
    await loadTruncatedBox(h); // 3 listy: Foo x2, Corge x1

    // Fala 18a (SWIADOMA zmiana decyzji 14a, zgloszenie 2026-10-20):
    // pusty listing z reason "puste" to PELNA prawda serwera - gracz
    // wyczyscil skrzynke w grze, wiec listy przestaja sie liczyc do
    // kontaktow (rekordy zostaja w archiwum ze znacznikiem znikniecia;
    // powrot listu do listingu znacznik czysci i liczniki wracaja).
    // Stabilnosc z Fali 14a jest zachowana tam, gdzie byla potrzebna:
    // zwykly refresh skrzynki >50 listow jest UCIETY i reguly nie
    // odpala.
    click(h, '[data-box="odebrane"]');
    await waitFor(
      () => f.sent.filter((c) => c === 'listy odebrane').length >= 2,
      'refresh odebranych po kliku',
    );
    f.fire('Nie masz zadnych odebranych listow.', 'mail');
    f.fire('> ', 'prompt');
    await waitFor(() => !content.querySelector('.arkmail-busy'), 'koniec refreshu');

    click(h, '[data-tab="kontakty"]');
    await waitFor(
      () => content.querySelectorAll('.arkmail-contact').length === 0,
      'kontakty reaguja na pusta skrzynke',
    );
  } finally {
    await stopHarness();
  }
});
