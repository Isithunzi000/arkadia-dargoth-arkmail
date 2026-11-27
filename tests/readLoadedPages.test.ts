/** Numery serwera po wczytaniu kilku stron do jednego widoku. */
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { click, startHarness, stopHarness, type Harness } from './harness';

interface Row {
  number: number;
  subject: string;
  date: string;
}

const MONTHS = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X', 'XI', 'XII'];

function dateOf(dayOffset: number): string {
  const date = new Date(Date.UTC(1999, 0, 1 + dayOffset));
  return `Pn, ${date.getUTCDate()} ${MONTHS[date.getUTCMonth()]} ${date.getUTCFullYear()}, 12:00:00`;
}

function pageRows(oldestOffset: number): Row[] {
  return Array.from({ length: 50 }, (_, index) => ({
    number: 50 - index,
    subject: `list-${oldestOffset + index + 1}`,
    date: dateOf(oldestOffset + index),
  }));
}

function replyListing(h: Harness, rows: readonly Row[], selected: boolean, truncated: boolean): void {
  const suffix = truncated ? ' (prezentowane jest pierwsze 50)' : '';
  h.f.fire(`${selected ? 'Wybrane listy' : 'Listy'} odebrane${suffix}:`, 'mail');
  for (const row of rows) {
    h.f.fire(` ${row.number}. *R* Temat: ${row.subject}`, 'mail');
    h.f.fire(`Nadawca: Tester                       ${row.date}`, 'mail');
  }
  h.f.fire('> ', 'prompt');
}

async function loadHundred(h: Harness): Promise<void> {
  click(h, '[data-box="odebrane"]');
  await h.waitFor(() => h.f.sent.includes('listy odebrane'), 'pierwsza strona');
  replyListing(h, pageRows(50), false, true);
  await h.waitFor(() => h.content.querySelectorAll('.arkmail-entry').length === 50, '50 wpisow');

  click(h, '.arkmail-older');
  await h.waitFor(
    () => h.f.sent.some((command) => command.startsWith('listy odebrane przed ')),
    'druga strona',
  );
  replyListing(h, pageRows(0), true, false);
  await h.waitFor(() => h.content.querySelectorAll('.arkmail-entry').length === 100, '100 wpisow');
  await h.waitFor(() => {
    const busy = h.content.querySelector('.arkmail-busy') as { textContent?: string } | null;
    return busy?.textContent === '';
  }, 'koniec wczytywania stron');
}

function replyLetter(h: Harness, row: Row): void {
  h.f.fire(`List : ${row.number}`, 'mail');
  h.f.fire('Od   : Tester', 'mail');
  h.f.fire(`Temat: ${row.subject}`, 'mail');
  h.f.fire(`Data : ${row.date}`, 'mail');
  h.f.fire('', 'mail');
  h.f.fire('Syntetyczna tresc.', 'mail');
  h.f.fire(`[1-50 adefFhHmnqrsRux.!?-+<>] (aktualny: ${row.number}) -- `, 'mail');
  h.f.fire('> ', 'prompt');
}

for (const position of [1, 50, 51, 100] as const) {
  test(`wczytane strony: pozycja ${position} uzywa numeru serwera, nie numeru wiersza`, async () => {
    const h = await startHarness({ autoRefreshEnabled: false });
    try {
      await loadHundred(h);
      const rows = h.content.querySelectorAll('.arkmail-entry') as unknown as Array<{
        dispatchEvent(event: unknown): void;
      }>;
      assert.equal(rows.length, 100);
      const anchorsBefore = h.f.sent.filter((command) => command.startsWith('listy odebrane przed ')).length;
      rows[position - 1]!.dispatchEvent(new h.window.Event('click'));

      // UI odwraca kolejnosc calego widoku, wiec takze kolejnosc kazdej strony.
      const original = position <= 50
        ? pageRows(50)[50 - position]!
        : pageRows(0)[100 - position]!;
      const currentPage = position > 50;
      const expectedNumber = currentPage ? original.number : 7;
      if (!currentPage) {
        await h.waitFor(
          () => h.f.sent.filter((command) => command.startsWith('listy odebrane przed ')).length > anchorsBefore,
          `kotwica pozycji ${position}`,
        );
        replyListing(h, [{ ...original, number: expectedNumber }], false, false);
      }

      await h.waitFor(
        () => h.f.sent.some((command) => command.startsWith('przeczytaj list ')),
        `odczyt pozycji ${position}`,
      );
      assert.ok(
        h.f.sent.includes(`przeczytaj list ${expectedNumber}`),
        `oczekiwany numer ${expectedNumber}; komendy: ${h.f.sent.join(' | ')}`,
      );
      assert.equal(
        h.f.sent.filter((command) => command.startsWith('przeczytaj list ')).length,
        1,
        'jedna komenda odczytu',
      );
      replyLetter(h, { ...original, number: expectedNumber });
    } finally {
      await stopHarness();
    }
  });
}
