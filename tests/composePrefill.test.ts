/**
 * Fala UI-2 krok 5: pisanie z ksiazki adresowej i grup bez recznego
 * przepisywania adresatow. Precedens mechanizmu: Odpowiedz/Przekaz
 * (render.ts) - prefill lokalnego composeDraft + przejscie na zakladke
 * Napisz; czysta operacja UI, zero komend do serwera.
 *
 * Kontrakt:
 *  - wiersz ksiązki ma przycisk "Napisz" [data-book-write] - prefill
 *    adresata samym imieniem, temat i tresc puste;
 *  - pasek zbiorczy ma przycisk "Napisz list do zaznaczonych (N)"
 *    [data-book-write-checked] - wylaczony przy N=0, adresat =
 *    zaznaczeni w kolejnosci listy A-Z, format "A, B, C" (przecinki
 *    na linie do gry - zgodnie z PROTOCOL.md; spojnik " i " zostaje
 *    wylacznie dla parsowania listingow); zaznaczenie kasuje sie
 *    po uzyciu (powrot do Kontaktow nie trzyma starego stanu);
 *  - naglowek grupy ma przycisk "Napisz do grupy" [data-group-write] -
 *    adresat = czlonkowie w formacie "A, B, C"; pusta grupa =
 *    wylaczony z tooltip.
 * Imiona syntetyczne (Fred/Grault/Corge/Waldo - dozwolone przez guardy).
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Window } from 'happy-dom';

import { mountMailUi } from '../src/arkmail/ui/render';
import { MailUiStore } from '../src/arkmail/ui/store';
import type { ContactGroup } from '../src/arkmail/core/addressBook';

const window = new Window();
const document = window.document;

function mount(store: MailUiStore) {
  const container = document.createElement('div');
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
    onSavePeople: (people) => store.setPeople(people),
  });
  return { container };
}

const q = (container: unknown, selector: string): unknown =>
  (container as { querySelector(s: string): unknown }).querySelector(selector);

const qa = (container: unknown, selector: string): unknown[] =>
  Array.from(
    (container as { querySelectorAll(s: string): Iterable<unknown> }).querySelectorAll(selector),
  );

const click = (el: unknown): void => (el as { click(): void }).click();

const attr = (el: unknown, name: string): string =>
  (el as { getAttribute(n: string): string | null }).getAttribute(name) ?? '';

const fieldValue = (container: unknown, field: string): string =>
  (
    q(
      container,
      `[data-pane-key="napisz"] [data-field="${field}"]`,
    ) as unknown as { value: string }
  ).value;

// --- książka: pojedynczy adresat ---------------------------------------------

test('ksiazka: Napisz w wierszu prefila adresata imieniem', () => {
  const s = new MailUiStore({ tab: 'kontakty', people: ['Corge', 'Fred'] });
  const { container } = mount(s);
  const row = qa(container, '[data-book-row]')[0] as unknown as HTMLElement;
  const btn = q(row, '[data-book-write]');
  assert.ok(btn, 'przycisk Napisz w wierszu');
  click(btn);
  assert.equal(s.state.tab, 'napisz', 'przejscie na zakladke Napisz');
  assert.equal(fieldValue(container, 'adresat'), 'Corge', 'adresat = imie z wiersza');
  assert.equal(fieldValue(container, 'temat'), '', 'temat pusty');
  assert.equal(fieldValue(container, 'tresc'), '', 'tresc pusta');
});

// --- książka: zbiorczo do zaznaczonych ---------------------------------------

const checkAt = (container: unknown, i: number): void => {
  const box = qa(container, '[data-book-row] input[type=checkbox]')[
    i
  ] as unknown as HTMLInputElement;
  box.checked = true;
  box.dispatchEvent(new window.Event('change') as unknown as Event);
};

test('ksiazka: Napisz list do zaznaczonych sklada adresata w formacie gry', () => {
  const s = new MailUiStore({ tab: 'kontakty', people: ['Fred', 'Grault', 'Corge'] });
  const { container } = mount(s);
  checkAt(container, 0); // Corge (A-Z)
  checkAt(container, 1); // Fred
  checkAt(container, 2); // Grault
  const bulk = q(container, '[data-book-write-checked]') as unknown as {
    textContent: string;
    click(): void;
  };
  assert.ok(bulk, 'przycisk zbiorczy istnieje');
  assert.match(bulk.textContent, /Napisz list do zaznaczonych \(3\)/, 'etykieta z licznikiem');
  click(bulk);
  assert.equal(s.state.tab, 'napisz', 'przejscie na Napisz');
  assert.equal(fieldValue(container, 'adresat'), 'Corge, Fred, Grault', 'format przecinkowy');
});

test('ksiazka: po uzyciu zbiorczego Napisz zaznaczenie jest zerowane', () => {
  const s = new MailUiStore({ tab: 'kontakty', people: ['Fred', 'Grault'] });
  const { container } = mount(s);
  checkAt(container, 0);
  const bulk = () =>
    q(container, '[data-book-write-checked]') as unknown as {
      getAttribute(n: string): string | null;
      click(): void;
    };
  assert.equal(bulk().getAttribute('disabled'), null, 'aktywny przy zaznaczeniu');
  click(bulk());
  s.setTab('kontakty');
  assert.equal(
    bulk().getAttribute('disabled'),
    '1',
    'zaznaczenie zerowane - przycisk z powrotem wylaczony',
  );
});

test('ksiazka: zbiorczy Napisz wylaczony bez zaznaczenia', () => {
  const s = new MailUiStore({ tab: 'kontakty', people: ['Fred'] });
  const { container } = mount(s);
  const bulk = q(container, '[data-book-write-checked]') as unknown as {
    getAttribute(n: string): string | null;
    textContent: string;
  };
  assert.equal(bulk.getAttribute('disabled'), '1', 'wylaczony przy pustym zaznaczeniu');
  assert.match(bulk.textContent, /Napisz list do zaznaczonych \(0\)/, 'licznik 0');
});

// --- grupy --------------------------------------------------------------------

const GROUPS: ContactGroup[] = [
  { name: 'Druzyna', members: ['Corge', 'Fred', 'Grault'] },
  { name: 'Pusta', members: [] },
];

const clickSubpill = (container: unknown, label: string): void => {
  for (const pill of qa(container, '.arkmail-subpill')) {
    if ((pill as HTMLElement).textContent === label) {
      (pill as unknown as HTMLElement).click();
      return;
    }
  }
  assert.fail(`brak sub-pigulki: ${label}`);
};

// Zgloszenie 2026-11-05 (D3): grupy domyslnie zwiniete - rozwijanie
// naglowkiem po nazwie.
const expandGroup = (container: unknown, name: string): void => {
  for (const toggle of qa(container, '[data-group-toggle]')) {
    const t = toggle as HTMLElement;
    if (t.textContent?.includes(name)) {
      (toggle as unknown as { click(): void }).click();
      return;
    }
  }
  assert.fail(`brak grupy do rozwiniencia: ${name}`);
};

test('grupy: Napisz do grupy sklada adresata z czlonkow', () => {
  const s = new MailUiStore({ tab: 'kontakty', groups: GROUPS });
  const { container } = mount(s);
  // Przelaczenie na sub-pigulke Grupy (po etykiecie - 4 pigulki).
  clickSubpill(container, 'Grupy');
  expandGroup(container, 'Druzyna');
  const rows = qa(container, ".arkmail-group");
  const write = q(rows[0], '[data-group-write]') as unknown as {
    click(): void;
    getAttribute(n: string): string | null;
  };
  assert.ok(write, 'przycisk w naglowku grupy');
  click(write);
  assert.equal(s.state.tab, 'napisz', 'przejscie na Napisz');
  assert.equal(fieldValue(container, 'adresat'), 'Corge, Fred, Grault', 'czlonkowie po przecinku');
});

test('grupy: Napisz do grupy wylaczone dla pustej grupy', () => {
  const s = new MailUiStore({ tab: 'kontakty', groups: GROUPS });
  const { container } = mount(s);
  clickSubpill(container, 'Grupy');
  expandGroup(container, 'Pusta');
  const rows = qa(container, ".arkmail-group");
  const write = q(rows[1], '[data-group-write]') as unknown as {
    getAttribute(n: string): string | null;
  };
  assert.equal(write.getAttribute('disabled'), '1', 'pusta grupa - brak adresatow');
  assert.ok(attr(write, 'title').length > 0, 'tooltip mowi, dlaczego wylaczone');
});
