// Fala 41: widok archiwum renderuje jeden wiersz na rekord.
// Usuniety agregat "Wystapienia" (licznik + panel rozwijany); klikniecie
// w wiersz otwiera list tego rekordu (onOpenArchiveLetter).
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

function archived(id: string, body: string[]): ArchiveLetter {
  return {
    ...fromMailboxEntry('odebrane', {
      number: 1,
      isRead: true,
      subject: 'Wspolny temat',
      forwarded: false,
      party: 'Goniec',
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
    id,
    body,
  } as ArchiveLetter;
}

interface Mount {
  container: {
    querySelector(s: string): unknown;
    querySelectorAll(s: string): ArrayLike<unknown> & Iterable<unknown>;
  };
  opened: ArchiveLetter[];
  off: () => void;
}

function mount(letters: ArchiveLetter[]): Mount {
  const container = document.createElement('div') as unknown as Mount['container'];
  const store = new MailUiStore({ tab: 'archiwum' });
  store.setArchive(letters);
  const opened: ArchiveLetter[] = [];
  const handlers = {
    onOpenArchiveLetter: (letter: ArchiveLetter) => {
      opened.push(letter);
    },
  } as unknown as MailUiHandlers;
  const off = mountMailUi(
    container as unknown as HTMLElement,
    store,
    handlers,
  );
  return { container, opened, off };
}

const text = (container: Mount['container'], selector: string): string =>
  Array.from(container.querySelectorAll(selector) as unknown as Iterable<{ textContent?: string }>)
    .map((el) => String(el.textContent ?? ''))
    .join('\n');

test('archiwum: blizniacze rekordy to dwa osobne wiersze', () => {
  const m = mount([
    archived('t1', ['Tresc pierwszego.']),
    archived('t2', ['Tresc drugiego.']),
  ]);
  try {
    assert.equal(m.container.querySelectorAll('.arkmail-arch-entry').length, 2);
    // Bez agregatu "Wystapienia": brak licznika i przycisku rozwijania.
    const rowText = text(m.container, '.arkmail-arch-entry');
    assert.ok(!rowText.includes('2 listy'), `bez licznika w wierszu: "${rowText}"`);
    assert.equal(m.container.querySelectorAll('.arkmail-arch-expand').length, 0);
    assert.equal(m.container.querySelectorAll('.arkmail-arch-occ').length, 0);
  } finally {
    m.off();
  }
});

test('archiwum: klik w wiersz otwiera list tego rekordu', () => {
  const second = archived('t2', ['Tresc drugiego.']);
  const m = mount([archived('t1', ['Tresc pierwszego.']), second]);
  try {
    const rows = Array.from(
      m.container.querySelectorAll('.arkmail-arch-entry') as unknown as ArrayLike<{
        dispatchEvent(e: unknown): void;
      }>,
    );
    assert.equal(rows.length, 2);
    rows[1]!.dispatchEvent(new window.Event('click'));
    assert.deepEqual(m.opened, [second]);
  } finally {
    m.off();
  }
});

test('archiwum: rekord pojedynczy bez zmian', () => {
  const m = mount([archived('s1', ['Tresc.'])]);
  try {
    assert.equal(m.container.querySelectorAll('.arkmail-arch-entry').length, 1);
    assert.equal(m.container.querySelector('.arkmail-arch-expand'), null);
  } finally {
    m.off();
  }
});

test('archiwum: kazdy wiersz pokazuje date i czas oraz zachowuje metadane', () => {
  const second = archived('t2', ['Tresc drugiego.']);
  const m = mount([archived('t1', ['Tresc pierwszego.']), second]);
  try {
    assert.equal(
      text(m.container, '.arkmail-arch-date'),
      'Wt, 24 VIII 1999, 00:11:12\nWt, 24 VIII 1999, 00:11:12',
    );
    assert.equal(
      text(m.container, '.arkmail-arch-subject'),
      '1. Wspolny temat\n2. Wspolny temat',
      'kolejnosc, numeracja i temat bez zmian',
    );
    assert.equal(
      text(m.container, '.arkmail-arch-meta'),
      'od Goniec | odebrane\nod Goniec | odebrane',
      'kierunek, strona listu i skrzynka bez zmian',
    );
    const rows = Array.from(
      m.container.querySelectorAll('.arkmail-arch-entry') as unknown as ArrayLike<{
        dispatchEvent(e: unknown): void;
      }>,
    );
    rows[1]!.dispatchEvent(new window.Event('click'));
    assert.deepEqual(m.opened, [second], 'klik nadal otwiera wlasciwy rekord');
  } finally {
    m.off();
  }
});

test('archiwum: brak daty jest jawny i nie tworzy daty zerowej', () => {
  const m = mount([
    { ...archived('no-date', ['Tresc.']), dateRaw: null },
    { ...archived('blank-date', ['Tresc.']), dateRaw: '   ' },
  ]);
  try {
    assert.equal(text(m.container, '.arkmail-arch-date'), 'brak daty\nbrak daty');
    assert.ok(!text(m.container, '.arkmail-arch-entry').includes('0000-00-00'));
  } finally {
    m.off();
  }
});
