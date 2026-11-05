/**
 * Zgloszenie 2026-11-05 (Etap 9): import ksiazki to prawdziwy klawisz,
 * a pole wyboru pliku jest niewidoczne (otwiera je klawisz). Wczesniej
 * role klawisza pelnila etykieta z inputem w srodku - hover, fokus
 * i klawiatura zachowywaly sie inaczej niz przy kazdym innym klawiszu.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Window } from 'happy-dom';

import { mountMailUi } from '../src/arkmail/ui/render';
import { MailUiStore } from '../src/arkmail/ui/store';
import { STYLES } from '../src/arkmail/ui/styles';

const window = new Window();
const document = window.document;

function mount(store: MailUiStore): HTMLElement {
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
  } as never);
  return container as unknown as HTMLElement;
}

const q = (root: unknown, selector: string): unknown =>
  (root as { querySelector(s: string): unknown }).querySelector(selector);
const qa = (root: unknown, selector: string): unknown[] =>
  Array.from((root as { querySelectorAll(s: string): unknown[] }).querySelectorAll(selector));
const click = (el: unknown): void => (el as { click(): void }).click();

const switchToImportEksport = (container: unknown): void => {
  for (const pill of qa(container, '.arkmail-subpill')) {
    if ((pill as { textContent?: string }).textContent === 'Import-Eksport') {
      click(pill);
      return;
    }
  }
  assert.fail('brak sub-pigulki Import-Eksport');
};

test('import: klawisz importu to button, nie etykieta', () => {
  const store = new MailUiStore({ tab: 'kontakty' });
  const container = mount(store);
  switchToImportEksport(container);

  const trigger = q(container, '[data-book-import-trigger]');
  assert.ok(trigger, 'klawisz importu istnieje');
  assert.equal(
    (trigger as { tagName?: string }).tagName,
    'BUTTON',
    'klawisz importu to element button',
  );
  assert.equal(
    (trigger as { textContent?: string }).textContent,
    'Importuj ksiazke',
    'klawisz importu ma pierwotna etykiete',
  );
  assert.ok(
    ((trigger as { getAttribute(n: string): string | null }).getAttribute('title') ?? '').length >
      0,
    'klawisz importu ma podpowiedz',
  );
  // Zadna etykieta nie pelni juz roli klawisza importu.
  for (const lab of qa(container, 'label')) {
    assert.equal(
      q(lab, '[data-book-import]'),
      null,
      'input pliku nie mieszka wewnatrz etykiety',
    );
  }
});

test('import: klik klawisza otwiera wybor pliku (klik na inpucie)', () => {
  const store = new MailUiStore({ tab: 'kontakty' });
  const container = mount(store);
  switchToImportEksport(container);

  const trigger = q(container, '[data-book-import-trigger]') as unknown as {
    click(): void;
  };
  const input = q(container, '[data-book-import]') as unknown as {
    addEventListener(t: string, fn: () => void): void;
  };
  let clicks = 0;
  input.addEventListener('click', () => {
    clicks += 1;
  });
  trigger.click();
  assert.equal(clicks, 1, 'klik klawisza przechodzi na pole wyboru pliku');
});

test('import: pole wyboru pliku jest niewidoczne w stylach', () => {
  const rule = STYLES.match(/\.arkmail-root input\[data-book-import\]\s*\{([^}]*)\}/);
  assert.ok(rule, 'istnieje regula chowajaca pole wyboru pliku');
  assert.match(rule![1]!, /display:\s*none/, 'pole wyboru pliku ma display: none');
});
