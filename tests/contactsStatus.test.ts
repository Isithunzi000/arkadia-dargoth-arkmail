import test from 'node:test';
import assert from 'node:assert/strict';
import { Window } from 'happy-dom';
import { mountMailUi, type MailUiHandlers } from '../src/arkmail/ui/render';
import { MailUiStore } from '../src/arkmail/ui/store';
import type { ArchiveLetter } from '../src/arkmail/core/archive';

/**
 * Fala UI-2 krok 4: status indeksacji ma jedno zrodlo prawdy - krok
 * "1. Indeksacja" w zakladce Archiwum (sub-pigulka Osoby z widoku
 * Kontakty zniknela razem ze stopka .arkmail-index-foot i nota o
 * lukach; rozdzielnosc paneli z Fali 25 przestaje istniec, bo panel
 * jest jeden). Testy pilnuja regresji: statusy kompletu/czesciowego,
 * liczba listow w bazie i wyciecie indeksu przez czyszczenie cache.
 */

const HANDLERS = {} as MailUiHandlers;
const META = {
  odebrane: '1999-09-05T10:00:00.000Z',
  nieprzeczytane: '1999-09-03T10:00:00.000Z',
  wyslane: '1999-09-04T10:00:00.000Z',
  niewyslane: '1999-09-02T10:00:00.000Z',
};

function letter(): ArchiveLetter {
  return {
    id: 'one',
    box: 'odebrane',
    number: 1,
    party: 'Foo',
    subject: 'Temat',
    forwarded: false,
    dateRaw: 'Pn, 20 IX 1999, 01:02:03',
    sortKey: '1999-09-20 01:02:03',
    read: false,
    body: [],
  };
}

const stepStatuses = (container: unknown): string[] =>
  Array.from(
    (container as { querySelectorAll(s: string): Iterable<unknown> }).querySelectorAll(
      '.arkmail-archive-step-status',
    ),
  ).map((el) => (el as { textContent?: string }).textContent ?? '');

test('archiwum: kompletny indeks z lukami - status kroku 1 mowi o brakach, licznik bazy widoczny', () => {
  const window = new Window();
  (globalThis as { document?: unknown }).document = window.document;
  try {
    const store = new MailUiStore({
      archive: [letter()],
      indexMeta: META,
      archiveGaps: { wyslane: ['1999-08-21'] },
    });
    const container = window.document.createElement('div');
    const off = mountMailUi(container as unknown as HTMLElement, store, HANDLERS);
    try {
      store.setTab('archiwum');
      const statuses = stepStatuses(container);
      assert.match(statuses[0] ?? '', /Gotowe, ale brakuje danych z 1 dnia/, 'status kroku 1 z lukami');
      assert.match(container.textContent ?? '', /Liczba listow w bazie: 1\./, 'licznik bazy archiwum');
      const pane = container.querySelector('#arkmail-archive-panel-listy[role="tabpanel"]')!;
      assert.ok(pane, 'aktywny semantyczny podpanel Archiwum istnieje');
      const children = Array.from(pane.children);
      const stepsIndex = children.findIndex((child) =>
        child.classList.contains('arkmail-archive-steps'),
      );
      const controlsIndex = children.findIndex((child) =>
        child.classList.contains('arkmail-arch-controls'),
      );
      assert.ok(stepsIndex >= 0 && stepsIndex < controlsIndex, 'status przed filtrami i lista');

      store.clearCacheData();
      assert.deepEqual(store.state.indexMeta, {});
      assert.deepEqual(store.state.archiveGaps, {});
      assert.doesNotMatch(container.textContent ?? '', /brakuje danych z 1 dnia/);
    } finally {
      off();
    }
  } finally {
    delete (globalThis as { document?: unknown }).document;
  }
});

test('archiwum: niepelny indeks ma jasny stan zamiast opisu kompletnej indeksacji', () => {
  const window = new Window();
  (globalThis as { document?: unknown }).document = window.document;
  try {
    const store = new MailUiStore({ indexMeta: { odebrane: META.odebrane } });
    const container = window.document.createElement('div');
    const off = mountMailUi(container as unknown as HTMLElement, store, HANDLERS);
    try {
      store.setTab('archiwum');
      const statuses = stepStatuses(container);
      assert.match(statuses[0] ?? '', /Czesciowo: 1 z 4 skrzynek/);
      assert.doesNotMatch(statuses[0] ?? '', /Gotowe/);
    } finally {
      off();
    }
  } finally {
    delete (globalThis as { document?: unknown }).document;
  }
});
