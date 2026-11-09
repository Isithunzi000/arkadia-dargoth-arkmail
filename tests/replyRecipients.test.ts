import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  buildReplyAllPrefill,
  knownRecipientNames,
  parseReplyHeader,
  type ReplyAllLetter,
} from '../src/arkmail/core/replyRecipients';
import type { MailBox } from '../src/arkmail/core/protocol/types';

function letter(box: MailBox, over: Partial<ReplyAllLetter> = {}): ReplyAllLetter {
  return {
    box,
    number: 1,
    from: 'Foo',
    subject: 'Syntetyczny temat',
    to: 'Gracz',
    cc: null,
    date: null,
    body: ['Syntetyczna tresc'],
    ...over,
  };
}

test('reply-all core: odebrany laczy nadawce, Do i DW bez duplikatow', () => {
  const result = buildReplyAllPrefill(
    letter('odebrane', { from: 'Foo', to: 'Gracz, Bar i foo', cc: 'BAR i Baz' }),
    'gracz',
    new Set(),
  );
  assert.deepEqual(result, { adresat: 'Foo, Bar', dw: 'Baz' });
});

test('reply-all core: nieznana aktualna postac nie usuwa nikogo', () => {
  const result = buildReplyAllPrefill(
    letter('nieprzeczytane', { to: 'Gracz i Bar', cc: 'Baz' }),
    null,
    new Set(),
  );
  assert.deepEqual(result, { adresat: 'Foo, Gracz, Bar', dw: 'Baz' });
});

test('reply-all core: wyslany nie dodaje nadawcy i promuje DW przy pustym Adresat', () => {
  const result = buildReplyAllPrefill(
    letter('wyslane', { from: 'Gracz', to: 'gracz', cc: 'Foo i Bar' }),
    'Gracz',
    new Set(),
  );
  assert.deepEqual(result, { adresat: 'Foo, Bar', dw: '' });
});

test('reply-all core: pusty wynik jest odrzucony', () => {
  assert.equal(buildReplyAllPrefill(
    letter('niewyslane', { from: 'Gracz', to: 'gracz', cc: 'GRACZ' }),
    'Gracz',
    new Set(),
  ), null);
});

test('reply-all core: znana nazwa wielowyrazowa i alias nie sa dzielone', () => {
  const known = new Set(['foo bar', 'dlugi alias']);
  assert.deepEqual(
    parseReplyHeader('Foo Bar, Dlugi Alias i Baz', known),
    ['Foo Bar', 'Dlugi Alias', 'Baz'],
  );
  assert.deepEqual(
    buildReplyAllPrefill(
      letter('odebrane', { from: 'Zork', to: 'Foo Bar i Dlugi Alias', cc: null }),
      'Gracz',
      known,
    ),
    { adresat: 'Zork, Foo Bar, Dlugi Alias', dw: '' },
  );
});

test('reply-all core: znane nazwy obejmuja kontakty, aliasy, osoby i grupy', () => {
  const known = knownRecipientNames({
    contacts: [{ name: 'Foo', mailAlias: 'Foo Alias' }],
    people: ['Foo Bar'],
    importedAliases: [{ name: 'Dlugi Alias' }],
    groups: [{ members: ['Bar', 'Baz'] }],
  });
  assert.deepEqual(
    [...known].sort(),
    ['bar', 'baz', 'dlugi alias', 'foo', 'foo alias', 'foo bar'],
  );
});
