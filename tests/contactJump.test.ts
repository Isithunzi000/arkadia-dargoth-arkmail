/**
 * Kontakt -> listy (Fala 11h): klik w wiersz kontaktu przenosi do
 * zakladki Listy, wpisuje nazwe kontaktu w pole szukajki (osoba)
 * i odpala szukanie serwerowe na aktywnej skrzynce.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Window } from 'happy-dom';

import { mountMailUi } from '../src/arkmail/ui/render';
import { MailUiStore } from '../src/arkmail/ui/store';

const window = new Window();
const document = window.document;

test('kontakty: klik w kontakt -> Listy + szukanie serwerowe po osobie', () => {
  const s = new MailUiStore({ tab: 'kontakty' });
  s.setContacts([
    {
      name: 'Corge',
      sources: ['korespondencja'],
      lettersReceived: 2,
      lettersSent: 1,
    },
  ]);
  const container = document.createElement('div');
  document.body.appendChild(container);
  const calls: { name: string; args: unknown[] }[] = [];
  const rec = (name: string) => (...args: unknown[]) => calls.push({ name, args });
  mountMailUi(container as unknown as HTMLElement, s, {
    onOpenLetter: rec('open'),
    onSendCompose: rec('send'),
    onCloseLetter: rec('close'),
    onRefreshBox: rec('refresh'),
    onLoadOlder: rec('older'),
    onLoadAll: rec('all'),
    onSearch: rec('search'),
    onClearSearch: rec('clear-search'),
    onDeleteLetter: rec('del'),
    onForwardLetter: rec('fwd'),
  });

  const row = container.querySelector('.arkmail-contact') as unknown as {
    dispatchEvent(e: unknown): void;
  };
  assert.ok(row, 'wiersz kontaktu');
  row.dispatchEvent(new window.Event('click'));

  assert.equal(s.state.tab, 'listy', 'przejscie do zakladki Listy');
  const searchCalls = calls.filter((c) => c.name === 'search');
  assert.deepEqual(
    searchCalls.map((c) => c.args),
    [['odebrane', { osoba: 'Corge' }]],
    'szukanie serwerowe po nazwie kontaktu na aktywnej skrzynce',
  );
  const input = container.querySelector('[data-search="osoba"]') as unknown as {
    value: string;
  } | null;
  assert.ok(input, 'pole szukajki w widoku');
  assert.equal(input!.value, 'Corge', 'pole osoba wypelnione kontaktem');
});
