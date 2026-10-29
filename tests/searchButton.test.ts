/**
 * Jeden przycisk "Szukaj / Odswiez" (zgloszenie 2026-10-30):
 *  - zakladka Listy: klawisz szukania nazywa sie "Szukaj / Odswiez"
 *    i ma podpowiedz; puste filtry = odswiezenie skrzynki (semantyka
 *    bez zmian - dowodzi test dateFilters/listy);
 *  - zakladka usuwanie: osobny, redundantny "Odswiez" znika - jeden
 *    klawisz spelnia obie role, tak jak w Listy.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Window } from 'happy-dom';

import { mountMailUi, type MailUiHandlers } from '../src/arkmail/ui/render';
import { MailUiStore } from '../src/arkmail/ui/store';
import type { MailboxEntry } from '../src/arkmail/core/session/mailbox';

const window = new Window();
const document = window.document;

function mount(store: MailUiStore) {
  const container = document.createElement('div');
  const off = mountMailUi(container as unknown as HTMLElement, store, {} as unknown as MailUiHandlers);
  return { container, off };
}

type Btn = { textContent?: string; getAttribute(n: string): string | null };

function entry(number: number): MailboxEntry {
  return {
    number,
    isRead: true,
    subject: `Temat ${number}`,
    forwarded: false,
    party: 'Foo',
    partyKind: 'nadawca',
    date: null,
  };
}

function storeWithResults(truncated = false): MailUiStore {
  const store = new MailUiStore({ tab: 'usuwanie' });
  store.applyDeletionResult('odebrane', 'listy odebrane', {
    kind: 'lista',
    header: { box: 'odebrane', truncated },
    entries: [entry(1), entry(2)],
  });
  return store;
}

const setField = (container: unknown, key: string, value: string): void => {
  const el = (container as { querySelector(s: string): unknown }).querySelector(
    `[data-deletion-filter="${key}"]`,
  ) as { value: string; dispatchEvent(e: unknown): void };
  el.value = value;
  el.dispatchEvent(new window.Event('input'));
};

test('usuwanie: pisanie w filtrach nie kasuje wynikow', () => {
  const store = storeWithResults();
  const { container, off } = mount(store);
  try {
    assert.equal((container.querySelectorAll('.arkmail-deletion-entry') as unknown as unknown[]).length, 2);
    setField(container, 'temat', 'Raport');
    setField(container, 'osoba', 'Bar');
    assert.equal(
      (container.querySelectorAll('.arkmail-deletion-entry') as unknown as unknown[]).length,
      2,
      'wyniki zostaja na ekranie',
    );
    assert.equal(store.state.deletion.command, 'listy odebrane', 'ostatnie zapytanie zostaje');
    assert.equal(store.state.deletion.result?.kind, 'lista', 'wynik w store zostaje');
  } finally {
    off();
  }
});

test('usuwanie: uciety wynik ma neutralna notke, nie twardy komunikat', () => {
  const { container, off } = mount(storeWithResults(true));
  try {
    const text = (container as { textContent?: string }).textContent ?? '';
    assert.ok(!text.includes('Wynik jest uciety'), 'twardy komunikat zniknal');
    assert.ok(text.includes('Serwer pokazuje maksymalnie 50 wynikow.'), 'neutralna notka jest');
  } finally {
    off();
  }
});

test('listy: przycisk szukania to Szukaj / Odswiez z podpowiedzia', () => {
  const { container, off } = mount(new MailUiStore());
  try {
    const go = container.querySelector('.arkmail-search-go') as Btn | null;
    assert.ok(go, 'przycisk istnieje');
    assert.equal((go!.textContent ?? '').trim(), 'Szukaj / Odswiez');
    const hint = go!.getAttribute('title') ?? '';
    assert.ok(hint.includes('pustych filtrach') && hint.includes('odswieza skrzynke'),
      `podpowiedz opisuje obie role: "${hint}"`);
  } finally {
    off();
  }
});

test('usuwanie: jeden przycisk Szukaj / Odswiez, bez osobnego Odswiez', () => {
  const { container, off } = mount(new MailUiStore({ tab: 'usuwanie' }));
  try {
    assert.ok(!container.querySelector('.arkmail-deletion-refresh'), 'osobny Odswiez zniknal');
    const search = container.querySelector('.arkmail-deletion-search') as Btn | null;
    assert.ok(search, 'przycisk szukania istnieje');
    assert.equal((search!.textContent ?? '').trim(), 'Szukaj / Odswiez');
    const hint = search!.getAttribute('title') ?? '';
    assert.ok(hint.length > 0, 'przycisk ma podpowiedz');
    // Dokladnie jeden klawisz szukajaco-odswiezajacy w zakladce:
    const pane = container.querySelector('.arkmail-deletion') as unknown as {
      querySelectorAll(s: string): unknown[];
    };
    const twins = Array.from(pane.querySelectorAll('button') as unknown as Btn[]).filter((b) =>
      (b.textContent ?? '').includes('Odswiez'),
    );
    assert.equal(twins.length, 1, 'dokladnie jeden klawisz z Odswiez w nazwie');
  } finally {
    off();
  }
});
