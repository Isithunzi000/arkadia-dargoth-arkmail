/**
 * Fala UI-2 krok 2b/4: przyciski importu w widoku Ksiazka adresowa
 * (po kroku 4 przeniesione z widoku Osoby, ktory zniknal) + karmienie
 * bazy osob. Import NIE tworzy grup - daje baze, z ktorej gracz
 * sklada grupy recznie. Alias pocztowy trafia do podpowiedzi jako
 * jeden token (serwer rozwija go przy wysylce), a jego czlonkowie
 * dolaczaja do kontaktow ze zrodlem 'alias'. Wyczysc zapisane dane
 * nie tyka ksiazki adresowej. Imiona syntetyczne (Fred, Grault, Corge).
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Window } from 'happy-dom';

import { mountMailUi } from '../src/arkmail/ui/render';
import { MailUiStore } from '../src/arkmail/ui/store';
import { contactsFromArchiveWithAliases } from '../src/arkmail/core/contacts';

const window = new Window();
const document = window.document;

function mount(
  store: MailUiStore,
  handlers?: {
    onImportPeople?: (kind: 'zapamietani' | 'przedstawieni') => void;
    onImportAliases?: () => void;
  },
) {
  const container = document.createElement('div');
  const calls: string[] = [];
  mountMailUi(container as unknown as HTMLElement, store, {
    onOpenLetter: () => {},
    onSendCompose: () => {},
    onCloseLetter: () => {},
    onRefreshBox: () => {},
    onLoadOlder: () => {},
    onLoadAll: () => {},
    onSearch: () => {},
    onClearSearch: () => {},
    onDeleteLetter: () => {},
    onForwardLetter: () => {},
    onImportPeople: handlers?.onImportPeople ?? ((kind) => calls.push(`people:${kind}`)),
    onImportAliases: handlers?.onImportAliases ?? (() => calls.push('aliases')),
  });
  return { container, calls };
}

const q = (container: unknown, selector: string): unknown =>
  (container as { querySelector(s: string): unknown }).querySelector(selector);

const text = (el: unknown): string => (el as { textContent?: string })?.textContent ?? '';

const click = (el: unknown): void => (el as { click(): void }).click();

const qa = (container: unknown, selector: string): unknown[] =>
  Array.from(
    (container as { querySelectorAll(s: string): Iterable<unknown> }).querySelectorAll(selector),
  );

const switchSubByLabel = (container: unknown, label: string): void => {
  for (const pill of qa(container, '.arkmail-subpill')) {
    if (text(pill) === label) {
      click(pill);
      return;
    }
  }
  throw new Error(`brak pigulki: ${label}`);
};

test('import: pigulka Import-Eksport ma trzy przyciski importu z podpowiedziami', () => {
  const s = new MailUiStore({ tab: 'kontakty' });
  const { container } = mount(s);
  // Zgloszenie 2026-11-05 (K7): wszystkie importy w pigulce Import-Eksport.
  assert.equal(q(container, '[data-import]'), null, 'Ksiazka bez przyciskow importu');
  switchSubByLabel(container, 'Import-Eksport');
  const btns = qa(container, '[data-import]');
  assert.deepEqual(
    btns.map((b) => (b as { getAttribute(n: string): string }).getAttribute('data-import')),
    ['zapamietani', 'przedstawieni', 'aliasy'],
    'trzy przyciski w ustalonej kolejnosci',
  );
  for (const b of btns) {
    const el = b as { textContent?: string; getAttribute(n: string): string | null };
    assert.ok(el.textContent && el.textContent.length > 3, 'etykieta niepusta');
    const title = el.getAttribute('title');
    assert.ok(title && title.length > 10, 'podpowiedz niepusta');
  }
});

test('import: klik wywoluje handler z rodzajem importu', () => {
  const s = new MailUiStore({ tab: 'kontakty' });
  const { container, calls } = mount(s);
  switchSubByLabel(container, 'Import-Eksport');
  for (const kind of ['zapamietani', 'przedstawieni', 'aliasy']) {
    (q(container, `[data-import="${kind}"]`) as { click(): void }).click();
  }
  assert.deepEqual(calls, ['people:zapamietani', 'people:przedstawieni', 'aliases']);
});

test('import: imiona z ksiazki podpowiadaja w polu adresata', () => {
  const s = new MailUiStore({ tab: 'napisz' });
  s.setPeople(['Fred', 'Grault']);
  const { container } = mount(s);
  const el = q(container, '[data-field="adresat"]') as HTMLInputElement;
  el.value = 'fr';
  el.selectionStart = 2;
  el.selectionEnd = 2;
  el.dispatchEvent(new window.Event('input') as unknown as Event);
  const wrap = el.closest('.arkmail-ghost-wrap');
  const rest = wrap?.querySelector('.arkmail-ghost-rest') as { textContent?: string } | null;
  assert.equal(rest?.textContent ?? '', 'ed', 'Fred z importu podpowiada');
});

test('import: alias pocztowy podpowiada jako jeden token', () => {
  const s = new MailUiStore({ tab: 'napisz' });
  s.setImportedAliases([{ name: 'zgromadzenie', targets: ['Fred', 'Grault'] }]);
  const { container } = mount(s);
  const el = q(container, '[data-field="adresat"]') as HTMLInputElement;
  el.value = 'zgrom';
  el.selectionStart = 5;
  el.selectionEnd = 5;
  el.dispatchEvent(new window.Event('input') as unknown as Event);
  const wrap = el.closest('.arkmail-ghost-wrap');
  const rest = wrap?.querySelector('.arkmail-ghost-rest') as { textContent?: string } | null;
  assert.equal(rest?.textContent ?? '', 'adzenie', 'alias jako calosc, bez rozwijania');
});

test('import: wyczysc cache nie usuwa ksiazki adresowej w UI', () => {
  const s = new MailUiStore();
  s.setPeople(['Fred']);
  s.setImportedAliases([{ name: 'zgromadzenie', targets: ['Fred'] }]);
  s.clearCacheData();
  assert.deepEqual(s.state.people, ['Fred']);
  assert.deepEqual(s.state.importedAliases, [{ name: 'zgromadzenie', targets: ['Fred'] }]);
});

test('import: czlonkowie aliasu dolaczaja do kontaktow ze zrodlem alias', () => {
  const contacts = contactsFromArchiveWithAliases(
    [],
    [{ name: 'zgromadzenie', targets: ['Fred', 'Grault'] }],
  );
  const fred = contacts.find((c) => c.name === 'Fred');
  assert.ok(fred, 'Fred w kontaktach');
  assert.deepEqual(fred!.sources, ['alias']);
  assert.equal(fred!.mailAlias, 'zgromadzenie');
});
