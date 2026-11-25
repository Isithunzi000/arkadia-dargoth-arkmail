/** Jednoznaczne dopasowanie swiezego wyniku po archiveId. Dane syntetyczne. */
import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  uniqueEntryByArchiveId,
  type MailboxEntry,
} from '../src/arkmail/core/session/mailbox';

const entry = (number: number, archiveId?: string): MailboxEntry => ({
  number,
  isRead: true,
  subject: 'syntetyczny',
  forwarded: false,
  party: 'Corge',
  partyKind: 'nadawca',
  date: null,
  archiveId,
});

test('ponowna kotwica: dokladnie jeden archiveId zwraca wpis, brak i duplikat odrzuca', () => {
  const first = entry(4, 'rekord-a');
  const second = entry(3, 'rekord-b');
  assert.equal(uniqueEntryByArchiveId([first, second], 'rekord-b'), second);
  assert.equal(uniqueEntryByArchiveId([first, second], 'nieobecny'), null);
  assert.equal(uniqueEntryByArchiveId([first, second], undefined), null);
  assert.equal(
    uniqueEntryByArchiveId([first, entry(2, 'rekord-a')], 'rekord-a'),
    null,
    'dwa wpisy o tym samym archiveId nie moga uruchomic odczytu',
  );
});
