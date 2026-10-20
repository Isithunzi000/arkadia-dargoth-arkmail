/**
 * Fala 18b (zgloszenie 2026-10-20 pkt 1): szkice (skrzynka
 * "niewyslane") NIE licza sie jako wyslana korespondencja - list
 * odlozony na poczcie nie zostal wyslany, wiec nie podbija
 * lettersSent ani lastContact. Znikaja tez z dedupu: wyslanie szkicu
 * (ten sam list w "wyslane") liczy sie normalnie.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { contactsFromArchive, contactsFromBoxes } from '../src/arkmail/core/contacts';
import { fromMailboxEntry } from '../src/arkmail/core/archive';
import { parseMailDate } from '../src/arkmail/core/protocol/parser';
import type { MailboxEntry } from '../src/arkmail/core/session/mailbox';

const date = (raw: string) => {
  const d = parseMailDate(raw);
  assert.ok(d, `parsowanie daty: ${raw}`);
  return d;
};

function entry(over: Partial<MailboxEntry> = {}): MailboxEntry {
  return {
    number: 1,
    isRead: true,
    subject: 'Raport',
    forwarded: false,
    party: 'Qux',
    partyKind: 'odbiorcy',
    date: date('Wt, 23 XII 2025, 00:11:12'),
    ...over,
  };
}

test('contactsFromArchive: szkic (niewyslane) nie liczy sie jako wyslany', () => {
  const szkic = fromMailboxEntry('niewyslane', entry());
  const wyslany = fromMailboxEntry('wyslane', entry({ subject: 'Inny list' }));
  const out = contactsFromArchive([szkic, wyslany]);
  const b = out.find((c) => c.name === 'Qux')!;
  assert.equal(b.lettersSent, 1, 'liczy sie tylko faktycznie wyslany');
  assert.equal(
    b.lastContactRaw,
    wyslany.dateRaw,
    'szkic nie ustawia ostatniego kontaktu',
  );
});

test('contactsFromArchive: kontakt tylko ze szkicem znika z listy', () => {
  const szkic = fromMailboxEntry('niewyslane', entry());
  const out = contactsFromArchive([szkic]);
  assert.equal(out.length, 0, 'szkic sam w sobie nie tworzy korespondencji');
});

test('contactsFromBoxes: szkic z widoku skrzynki tez nie liczy sie', () => {
  const out = contactsFromBoxes(
    {
      niewyslane: { entries: [entry()] },
      wyslane: { entries: [entry({ subject: 'Wyslany' })] },
    },
    [],
  );
  const b = out.find((c) => c.name === 'Qux')!;
  assert.equal(b.lettersSent, 1, 'tylko faktycznie wyslany');
});

test('po wyslaniu szkicu (rekord w wyslane) licznik rosnie normalnie', () => {
  const szkic = fromMailboxEntry('niewyslane', entry());
  const poWyslaniu = fromMailboxEntry('wyslane', entry());
  const out = contactsFromArchive([szkic, poWyslaniu]);
  const b = out.find((c) => c.name === 'Qux')!;
  assert.equal(b.lettersSent, 1, 'jeden faktyczny wyslany');
});
