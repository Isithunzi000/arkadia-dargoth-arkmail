/**
 * MailUiStore: czysty view-model UI (zero DOM). Zakladki, skrzynki,
 * badge nieprzeczytanych, pasek "operacja w toku", otwarty list,
 * tryb wide (split >= 900px): na waskim otwarcie listu przelacza
 * zakladke na 'list', na szerokim list zostaje w podziale obok.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { MailUiStore } from '../src/arkmail/ui/store';
import type { MailboxResult } from '../src/arkmail/core/session/mailbox';
import type { LetterContent } from '../src/arkmail/core/session/pager';

function lista(box: 'odebrane' | 'nieprzeczytane', entries: Partial<import('../src/arkmail/core/session/mailbox').MailboxEntry>[]): MailboxResult {
  return {
    kind: 'lista',
    header: { box, truncated: false },
    entries: entries.map((e, i) => ({
      number: i + 1,
      isRead: true,
      subject: `t${i}`,
      forwarded: false,
      party: 'X',
      partyKind: 'nadawca',
      date: null,
      ...e,
    })),
  };
}

function letter(): LetterContent {
  return { number: 3, from: 'Foo', subject: 'Perly', to: 'Gracz', cc: null, date: null, body: ['czesc'] };
}

test('ui: stan poczatkowy', () => {
  const s = new MailUiStore();
  assert.equal(s.state.tab, 'listy');
  assert.equal(s.state.activeBox, 'odebrane');
  assert.equal(s.state.badge, 0);
  assert.equal(s.state.busy, null);
  assert.equal(s.state.letter, null);
  assert.equal(s.state.wide, false);
});

test('ui: setTab emituje do subskrybenta, unsubscribe odcina', () => {
  const s = new MailUiStore();
  const seen: string[] = [];
  const off = s.subscribe((st) => seen.push(st.tab));
  s.setTab('napisz');
  s.setTab('kontakty');
  off();
  s.setTab('archiwum');
  assert.deepEqual(seen, ['napisz', 'kontakty']);
});

test('ui: badge z listingu nieprzeczytanych ma pierwszenstwo', () => {
  const s = new MailUiStore();
  s.applyMailbox('odebrane', lista('odebrane', [{ isRead: false }, { isRead: false }, {}]));
  assert.equal(s.state.badge, 2, 'fallback: nieprzeczytane z odebranych');
  s.applyMailbox('nieprzeczytane', lista('nieprzeczytane', [{ isRead: false }]));
  assert.equal(s.state.badge, 1, 'listing nieprzeczytanych wygrywa');
});

test('ui: pusta skrzynka ustawia znacznik i zeruje badge gdy dotyczy', () => {
  const s = new MailUiStore();
  s.applyMailbox('odebrane', lista('odebrane', [{ isRead: false }]));
  assert.equal(s.state.badge, 1);
  s.applyMailbox('nieprzeczytane', { kind: 'pusta', box: 'nieprzeczytane', reason: 'puste' });
  const view = s.state.boxes.nieprzeczytane;
  assert.ok(view);
  assert.equal(view.empty, 'puste');
  assert.equal(view.entries.length, 0);
  assert.equal(s.state.badge, 0);
});

test('ui: openLetter na waskim przelacza na zakladke list', () => {
  const s = new MailUiStore();
  s.openLetter('odebrane', letter());
  assert.equal(s.state.tab, 'list');
  assert.equal(s.state.letter?.from, 'Foo');
  assert.equal(s.state.letter?.box, 'odebrane');
  s.closeLetter();
  assert.equal(s.state.tab, 'listy');
  assert.equal(s.state.letter, null);
});

test('ui: openLetter na szerokim zostaje w podziale (tab bez zmian)', () => {
  const s = new MailUiStore();
  s.setWide(true);
  s.openLetter('odebrane', letter());
  assert.equal(s.state.tab, 'listy');
  assert.ok(s.state.letter);
});

test('ui: busy ustawia i czysci opis operacji', () => {
  const s = new MailUiStore();
  s.setBusy('Czytam list 3...');
  assert.equal(s.state.busy, 'Czytam list 3...');
  s.setBusy(null);
  assert.equal(s.state.busy, null);
});

test('ui: kontakty i archiwum trafiaja do stanu', () => {
  const s = new MailUiStore();
  s.setContacts([{ name: 'Foo', sources: ['korespondencja'], lettersReceived: 2, lettersSent: 1 }]);
  s.setArchive([]);
  assert.equal(s.state.contacts[0].name, 'Foo');
  assert.deepEqual(s.state.archive, []);
});
