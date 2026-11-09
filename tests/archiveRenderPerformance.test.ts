import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Window } from 'happy-dom';

import { fromMailboxEntry, type ArchiveLetter } from '../src/arkmail/core/archive';
import { archiveExportEntries } from '../src/arkmail/core/exportTxt';
import { mountMailUi, type MailUiHandlers } from '../src/arkmail/ui/render';
import { MailUiStore } from '../src/arkmail/ui/store';

function archived(id: string, body: string[]): ArchiveLetter {
  return {
    ...fromMailboxEntry('odebrane', {
      number: 1,
      isRead: true,
      subject: 'Synthetic',
      forwarded: false,
      party: 'Example',
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
  };
}

test('render Archiwum liczy eksport bez serializowania tresci do TXT', () => {
  const body = ['Line one.'];
  Object.defineProperty(body, 'map', {
    value: () => {
      throw new Error('TXT nie moze powstac podczas renderu');
    },
  });
  const window = new Window();
  const container = window.document.createElement('div');
  const store = new MailUiStore({ tab: 'archiwum' });
  store.setArchive([archived('with-body', body), archived('without-body', [])]);
  let off: (() => void) | undefined;
  try {
    assert.doesNotThrow(() => {
      off = mountMailUi(container as unknown as HTMLElement, store, {} as MailUiHandlers);
    });
    const steps = Array.from(
      container.querySelectorAll('.arkmail-archive-step'),
    ).map((step) => step.textContent ?? '');
    assert.match(steps[2] ?? '', /Do zapisu: 1\. Pominiete bez tresci: 1\./);
  } finally {
    off?.();
  }
});

test('optymalizacja renderu zachowuje dokladny wynik wlasciwego eksportu', () => {
  const result = archiveExportEntries([
    archived('without-body', []),
    archived('with-body', ['Line one.']),
  ]);
  assert.deepEqual(result, {
    entries: [{
      name: 'odebrane/1999-08-24_00-11-12_example_synthetic.txt',
      txt: 'Synthetic\nOd: Example | Wt, 24 VIII 1999, 00:11:12 | skrzynka: odebrane\n\nLine one.\n',
    }],
    skipped: 1,
  });
});
