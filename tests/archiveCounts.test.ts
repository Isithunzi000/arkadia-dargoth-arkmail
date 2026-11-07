/**
 * Fala 31d: pasek agregatu nad lista archiwum - "Liczba listow w bazie: N."
 * z rozbiem per skrzynka. Zasady:
 *  - deduplikacja blizniakow (ten sam list w "nieprzeczytane" i
 *    "odebrane" liczony raz - klucz: contentKeyOf);
 *  - Fala 28: skasowanych listow w bazie nie ma wcale (fizyczny
 *    purge), wiec zywosc nie jest sprawdzana;
 *  - skrzynki z zerem pomijane;
 *  - agregat jest globalny (nie zalezy od filtra nad lista).
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Window } from 'happy-dom';

import {
  fromMailboxEntry,
  type ArchiveLetter,
} from '../src/arkmail/core/archive';
import { mountMailUi, type MailUiHandlers } from '../src/arkmail/ui/render';
import { MailUiStore } from '../src/arkmail/ui/store';

const window = new Window();
const document = window.document;

function archived(box: ArchiveLetter['box'], subject: string, over: Partial<ArchiveLetter> = {}): ArchiveLetter {
  return {
    ...fromMailboxEntry(box, {
      number: 1,
      isRead: true,
      subject,
      forwarded: false,
      party: 'Foo',
      partyKind: 'nadawca',
      date: {
        raw: 'Wt, 24 VIII 1999, 00:11:12',
        weekday: 'Wt',
        day: 24,
        month: 8,
        year: 1999,
        time: '00:11:12',
      },
    }),
    ...over,
  };
}

function mount(archive: ArchiveLetter[]) {
  const store = new MailUiStore({ tab: 'archiwum' });
  store.setArchive(archive);
  const container = document.createElement('div');
  const off = mountMailUi(container as unknown as HTMLElement, store, {} as unknown as MailUiHandlers);
  return { container, store, off };
}

function countsText(container: { querySelector(s: string): unknown }): string | null {
  const strip = container.querySelector('.arkmail-arch-counts') as { textContent?: string } | null;
  return strip?.textContent ?? null;
}

test('archiwum: agregat liczy listy po deduplikacji (purge Fala 28 juz usunal skasowane)', () => {
  const read = archived('odebrane', 'Wspolny');
  const unread = { ...archived('nieprzeczytane', 'Wspolny'), id: 'inny-rekord' };
  const sent = archived('wyslane', 'Raport');
  const { container, off } = mount([read, unread, sent]);
  try {
    const text = countsText(container);
    assert.equal(
      text,
      'Liczba listow w bazie: 2.',
      `agregat: ${text}`,
    );
  } finally {
    off();
  }
});

test('archiwum: total liczy kazdy rekord skrzynki (blizniaki w skrzynce osobno)', () => {
  // Dwa fizycznie rozne listy o identycznych metadanych w TEJ SAMEJ
  // skrzynce: Fala 41 = kazdy rekord osobno. Krotka replika miedzy
  // skrzynkami liczy sie raz (MAX po skrzynkach w grupie klucza).
  const twin1 = archived('odebrane', 'Raport');
  const twin2 = { ...archived('odebrane', 'Raport'), id: 'inny-rekord' };
  const { container, off } = mount([twin1, twin2]);
  try {
    const text = countsText(container);
    assert.equal(
      text,
      'Liczba listow w bazie: 2.',
      `agregat: ${text}`,
    );
  } finally {
    off();
  }
});

test('archiwum: pusta baza = brak paska', () => {
  const { container, off } = mount([]);
  try {
    assert.equal(countsText(container), null);
  } finally {
    off();
  }
});

test('archiwum: agregat jest globalny, filtrowanie go nie zmienia', () => {
  const { container, store, off } = mount([
    archived('odebrane', 'Wspolny'),
    { ...archived('nieprzeczytane', 'Wspolny'), id: 'inny-rekord' },
    archived('wyslane', 'Raport'),
  ]);
  try {
    const before = countsText(container);
    assert.equal(before, 'Liczba listow w bazie: 2.');
    store.setArchive([
      ...store.state.archive,
      archived('odebrane', 'Dopisany'),
    ]);
    // Po dopisaniu rekordu agregat rosnie, mimo ze filtr tresci
    // (lokalny repaint) nie jest nawet dotkniety - pelny render ze store.
    const after = countsText(container);
    assert.equal(
      after,
      'Liczba listow w bazie: 3.',
      `po dopisaniu: ${after}`,
    );
  } finally {
    off();
  }
});
