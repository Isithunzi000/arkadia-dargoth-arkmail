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

const window = new Window();
const document = window.document;

function mount(store: MailUiStore) {
  const container = document.createElement('div');
  const off = mountMailUi(container as unknown as HTMLElement, store, {} as unknown as MailUiHandlers);
  return { container, off };
}

type Btn = { textContent?: string; getAttribute(n: string): string | null };

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
