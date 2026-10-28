import test from 'node:test';
import assert from 'node:assert/strict';
import { Window } from 'happy-dom';
import { mountMailUi, type MailUiHandlers } from '../src/arkmail/ui/render';
import { MailUiStore } from '../src/arkmail/ui/store';
import type { ArchiveLetter } from '../src/arkmail/core/archive';

const HANDLERS = {} as MailUiHandlers;
const META = {
  odebrane: '2026-01-04T10:00:00.000Z',
  nieprzeczytane: '2026-01-02T10:00:00.000Z',
  wyslane: '2026-01-03T10:00:00.000Z',
  niewyslane: '2026-01-01T10:00:00.000Z',
};

function letter(): ArchiveLetter {
  return {
    id: 'one',
    box: 'odebrane',
    number: 1,
    party: 'Foo',
    subject: 'Temat',
    forwarded: false,
    dateRaw: 'Pn, 2 III 2026, 01:02:03',
    sortKey: '2026-03-02 01:02:03',
    read: false,
    body: [],
  };
}

test('status i luki sa nad kontaktami, a czyszczenie usuwa je z widoku i stanu', () => {
  const window = new Window();
  (globalThis as { document?: unknown }).document = window.document;
  try {
    const store = new MailUiStore({
      archive: [letter()],
      indexMeta: META,
      archiveGaps: { wyslane: ['2025-12-20'] },
    });
    store.setContacts([{ name: 'Foo', sources: [], lettersReceived: 1, lettersSent: 0 }]);
    const container = window.document.createElement('div');
    const off = mountMailUi(container as unknown as HTMLElement, store, HANDLERS);
    try {
      store.setTab('kontakty');
      const status = container.querySelector('.arkmail-index-foot');
      assert.ok(status);
      assert.match(status.textContent ?? '', /Kompletna indeksacja od: 2026-01-01/);
      assert.match(status.textContent ?? '', /listow w bazie: 1/);
      const gaps = container.querySelector('.arkmail-index-gaps');
      assert.ok(gaps);
      assert.match(gaps.textContent ?? '', /wyslane: 2025-12-20/);
      const pane = container.querySelector('[data-pane-key="kontakty"]')!;
      const children = Array.from(pane.children);
      const statusIndex = children.indexOf(status);
      const gapsIndex = children.indexOf(gaps);
      const controlsIndex = children.findIndex((child) =>
        child.classList.contains('arkmail-contact-controls'),
      );
      assert.ok(statusIndex >= 0 && statusIndex < controlsIndex, 'status przed filtrem i lista');
      assert.ok(gapsIndex >= 0 && gapsIndex < controlsIndex, 'luki przed filtrem i lista');

      store.clearCacheData();
      assert.deepEqual(store.state.indexMeta, {});
      assert.deepEqual(store.state.archiveGaps, {});
      assert.doesNotMatch(container.textContent ?? '', /2026-01-01|2025-12-20/);
    } finally {
      off();
    }
  } finally {
    delete (globalThis as { document?: unknown }).document;
  }
});

test('niepelny indeks ma jasny stan zamiast opisu kompletnej indeksacji', () => {
  const window = new Window();
  (globalThis as { document?: unknown }).document = window.document;
  try {
    const store = new MailUiStore({ indexMeta: { odebrane: META.odebrane } });
    const container = window.document.createElement('div');
    const off = mountMailUi(container as unknown as HTMLElement, store, HANDLERS);
    try {
      store.setTab('kontakty');
      const status = container.querySelector('.arkmail-index-foot');
      assert.ok(status);
      assert.match(status.textContent ?? '', /Indeksacja niekompletna/);
      assert.doesNotMatch(status.textContent ?? '', /Kompletna indeksacja od:/);
    } finally {
      off();
    }
  } finally {
    delete (globalThis as { document?: unknown }).document;
  }
});
