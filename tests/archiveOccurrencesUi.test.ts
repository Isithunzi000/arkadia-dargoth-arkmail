/**
 * Fala 35e: widok archiwum pokazuje wystapienia.
 *
 * Rekord z occurrences = N (blizniaki) renderuje wiersz z licznikiem
 * wystapien i rozwijana lista per wystapienie: numer, stan tresci
 * (w bazie / brak). Klik w wystapienie z trescia otwiera podglad
 * TEJ tresci; bez tresci - dotychczasowa sciezka doczytu z serwera.
 * Rekord z occurrences = 1 renderuje sie jak dotychczas (bez
 * rozwijania).
 *
 * Ten plik to dowod RED: testy padaja na kodzie bez widoku wystapien.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Window } from 'happy-dom';

import {
  bodiesOf,
  fromMailboxEntry,
  withOccurrenceBodies,
  type ArchiveLetter,
} from '../src/arkmail/core/archive';
import { mountMailUi, type MailUiHandlers } from '../src/arkmail/ui/render';
import { MailUiStore } from '../src/arkmail/ui/store';

const window = new Window();
const document = window.document;

function archived(over: Partial<ArchiveLetter> = {}): ArchiveLetter {
  return {
    ...fromMailboxEntry('odebrane', {
      number: 1,
      isRead: true,
      subject: 'Raport',
      forwarded: false,
      party: 'Goniec',
      partyKind: 'nadawca',
      date: {
        raw: 'Wt, 23 XII 2025, 00:11:12',
        weekday: 'Wt',
        day: 23,
        month: 12,
        year: 2025,
        time: '00:11:12',
      },
    }),
    ...over,
  } as ArchiveLetter;
}

interface Mount {
  container: { querySelector(s: string): unknown; querySelectorAll(s: string): unknown };
  store: MailUiStore;
  occurrences: Array<{ index: number; body: string[] }>;
  off: () => void;
}

function mount(letters: ArchiveLetter[], handlers: Partial<MailUiHandlers> = {}): Mount {
  const container = document.createElement('div') as unknown as Mount['container'];
  const store = new MailUiStore({ tab: 'archiwum' });
  store.setArchive(letters);
  const occurrences: Mount['occurrences'] = [];
  const off = mountMailUi(
    container as unknown as HTMLElement,
    store,
    {
      onOpenArchiveOccurrence: (letter: ArchiveLetter, index: number) => {
        // Produkcja (index.ts) wybiera slot tresci po indeksie.
        const slot = bodiesOf(letter)[index - 1];
        occurrences.push({ index, body: slot ?? [] });
      },
      ...handlers,
    } as unknown as MailUiHandlers,
  );
  return { container, store, occurrences, off };
}

const text = (container: Mount['container'], selector: string): string =>
  Array.from(container.querySelectorAll(selector) as unknown as Iterable<{ textContent?: string }>)
    .map((el) => String(el.textContent ?? ''))
    .join('\n');

test('archiwum: blizniaki pokazuja licznik wystapien w wierszu', () => {
  const twin = withOccurrenceBodies(archived({ id: 't1' }), [
    ['Tresc pierwszego.'],
    ['Tresc drugiego.'],
  ]);
  const m = mount([twin]);
  try {
    const rowText = text(m.container, '.arkmail-arch-entry');
    assert.ok(rowText.includes('2 listy'), `licznik wystapien w wierszu: "${rowText}"`);
  } finally {
    m.off();
  }
});

test('archiwum: rozwinięcie listuje kazde wystapienie ze stanem tresci', () => {
  const twin = withOccurrenceBodies(archived({ id: 't2' }), [
    ['Tresc pierwszego.'],
    [],
  ]);
  const m = mount([twin]);
  try {
    const toggle = m.container.querySelector('.arkmail-arch-expand') as unknown as {
      dispatchEvent(e: unknown): void;
    } | null;
    assert.ok(toggle, 'przelacznik rozwijania istnieje');
    toggle.dispatchEvent(new window.Event('click'));
    const occ = Array.from(
      m.container.querySelectorAll('.arkmail-arch-occ') as unknown as Iterable<{
        textContent?: string;
      }>,
    ).map((el) => String(el.textContent ?? ''));
    assert.equal(occ.length, 2, 'dwa wystapienia');
    assert.ok(occ[0]!.includes('1'), 'pierwsze wystapienie numerowane');
    assert.ok(occ[0]!.includes('tresc w bazie'), 'slot 1 z trescia');
    assert.ok(occ[1]!.includes('brak tresci'), 'pusty slot oznaczony');
  } finally {
    m.off();
  }
});

test('archiwum: klik w wystapienie z trescia podaje slot do podgladu', () => {
  const twin = withOccurrenceBodies(archived({ id: 't3' }), [
    ['Tresc pierwszego.'],
    ['Tresc drugiego.'],
  ]);
  const m = mount([twin]);
  try {
    const toggle = m.container.querySelector('.arkmail-arch-expand') as unknown as {
      dispatchEvent(e: unknown): void;
    };
    toggle.dispatchEvent(new window.Event('click'));
    const occ = Array.from(
      m.container.querySelectorAll('.arkmail-arch-occ') as unknown as Iterable<{
        dispatchEvent(e: unknown): void;
      }>,
    );
    assert.equal(occ.length, 2);
    occ[1]!.dispatchEvent(new window.Event('click'));
    assert.deepEqual(m.occurrences, [{ index: 2, body: ['Tresc drugiego.'] }]);
  } finally {
    m.off();
  }
});

test('archiwum: rekord pojedynczy bez zmian (bez licznika i rozwijania)', () => {
  const single = archived({ id: 's1', body: ['Tresc.'] });
  const m = mount([single]);
  try {
    assert.equal(m.container.querySelector('.arkmail-arch-expand'), null, 'bez przelacznika');
    const rowText = text(m.container, '.arkmail-arch-entry');
    assert.ok(!rowText.includes('1 list'), 'bez licznika dla pojedynczego');
  } finally {
    m.off();
  }
});

test('archiwum: liczebnik wystapien poprawny dla 3, 4 i 5 (Fala 38)', () => {
  for (const [n, expected, wrong] of [
    [3, '3 listy', '3 listow'],
    [4, '4 listy', '4 listow'],
    [5, '5 listow', ''],
  ] as const) {
    const twin = withOccurrenceBodies(archived({ id: `t-n${n}` }), Array.from({ length: n }, () => ['Tresc.']));
    const m = mount([twin]);
    try {
      const rowText = text(m.container, '.arkmail-arch-entry');
      assert.ok(rowText.includes(expected), `forma liczebnika dla ${n}: "${rowText}"`);
      if (wrong) assert.ok(!rowText.includes(wrong), `forma odrzucona dla ${n}: "${rowText}"`);
    } finally {
      m.off();
    }
  }
});
