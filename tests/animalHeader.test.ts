/** Stabilny przycisk zwierzecia w natywnym naglowku popupu. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Window } from 'happy-dom';

import { createAnimalHeader } from '../src/arkmail/ui/animalHeader';
import { startHarness, stopHarness, type Harness } from './harness';

const animalButton = (h: Harness): HTMLButtonElement => {
  const root = h.f.headerActions as unknown as (HTMLButtonElement & ParentNode) | null;
  const button = root?.classList.contains('arkmail-animal-send')
    ? root
    : root?.querySelector('.arkmail-animal-send');
  assert.ok(button, 'przycisk istnieje w headerActions');
  return button as HTMLButtonElement;
};

const animalButtonCount = (h: Harness): number => {
  const root = h.f.headerActions as unknown as (HTMLButtonElement & ParentNode) | null;
  if (!root) return 0;
  return root.classList.contains('arkmail-animal-send')
    ? 1
    : root.querySelectorAll('.arkmail-animal-send').length;
};

const clickHeader = (h: Harness): void => {
  (animalButton(h) as unknown as { dispatchEvent(event: unknown): void }).dispatchEvent(new h.window.Event('click'));
};

test('szeroki naglowek: spoczynek, lot i powrot do spoczynku na tym samym wezle', async () => {
  const h = await startHarness({ wide: true });
  try {
    const button = animalButton(h);
    assert.equal(h.content.querySelector('.arkmail-animal-send'), null, 'pasek List nie ma duplikatu');
    assert.equal(h.f.popupConfig?.headerActions, h.f.headerActions, 'wezel przekazano juz przy rejestracji');
    assert.ok(button.classList.contains('popup-header-btn'));
    assert.equal(button.textContent, 'Wyslij zwierze');
    assert.equal(button.disabled, false);
    assert.equal(button.title, 'Wyslij zwierze');
    assert.equal(button.getAttribute('aria-label'), 'Wyslij zwierze');

    clickHeader(h);
    await h.waitFor(() => button.disabled, 'lot w szerokim naglowku');
    assert.equal(button.textContent, 'Zwierze w drodze...');
    assert.equal(button.title, 'Zwierze w drodze...');
    assert.equal(button.getAttribute('aria-label'), 'Zwierze w drodze...');
    assert.equal(animalButton(h), button, 'repaint nie tworzy nowego przycisku');

    h.f.fire('Slucham?');
    await h.waitFor(() => !button.disabled, 'koniec blednego lotu');
    assert.equal(button.textContent, 'Wyslij zwierze');
    assert.equal(animalButton(h), button);
  } finally {
    await stopHarness();
  }
});

test('waski naglowek: krotkie teksty i pelne nazwy dostepnosci', async () => {
  const h = await startHarness({ wide: false });
  try {
    const button = animalButton(h);
    assert.equal(button.textContent, 'Zwierze');
    assert.equal(button.disabled, false);
    assert.equal(button.title, 'Wyslij zwierze');
    assert.equal(button.getAttribute('aria-label'), 'Wyslij zwierze');

    clickHeader(h);
    await h.waitFor(() => button.disabled, 'lot w waskim naglowku');
    assert.equal(button.textContent, 'W drodze...');
    assert.equal(button.title, 'Zwierze w drodze...');
    assert.equal(button.getAttribute('aria-label'), 'Zwierze w drodze...');
  } finally {
    await stopHarness();
  }
});

test('zmiana szerokosci podczas lotu zachowuje stan i konczy sie wlasciwym tekstem', () => {
  const window = new Window();
  (globalThis as { document?: unknown }).document = window.document;
  try {
    const control = createAnimalHeader(() => {});
    const button = control.element;
    control.update(true, true);
    assert.equal(button.textContent, 'Zwierze w drodze...');
    assert.equal(button.disabled, true);
    control.update(false, true);
    assert.equal(button.textContent, 'W drodze...');
    assert.equal(button.disabled, true);
    assert.equal(button.getAttribute('aria-label'), 'Zwierze w drodze...');
    control.update(false, false);
    assert.equal(button.textContent, 'Zwierze');
    assert.equal(button.disabled, false);
    assert.equal(button.getAttribute('aria-label'), 'Wyslij zwierze');
  } finally {
    delete (globalThis as { document?: unknown }).document;
  }
});

test('ponowne otwarcie i aktywacja postaci utrzymuja jedna kontrolke naglowka', async () => {
  const h = await startHarness({ wide: true });
  try {
    const button = animalButton(h);
    await h.f.popupConfig!.createContent();
    await h.f.popupConfig!.createContent();
    assert.equal(animalButtonCount(h), 1);
    assert.equal(animalButton(h), button);

    h.f.setCharacter(null);
    h.f.setCharacter('Foo');
    await h.waitFor(() => !button.disabled, 'ponowna aktywacja postaci');
    await h.f.popupConfig!.createContent();
    assert.equal(animalButtonCount(h), 1);
    assert.equal(animalButton(h), button);
    assert.equal(button.textContent, 'Wyslij zwierze');
  } finally {
    await stopHarness();
  }
});
