import test from 'node:test';
import assert from 'node:assert/strict';

import { startHarness, stopHarness, click, clickText } from './harness';

const type = (h: Awaited<ReturnType<typeof startHarness>>, selector: string, value: string): void => {
  const input = h.content.querySelector(selector) as {
    value: string;
    dispatchEvent(event: unknown): void;
  };
  input.value = value;
  input.dispatchEvent(new h.window.Event('input'));
};

test('integracja: nowy czlonek grupy pojawia sie w Ksiazce po jednym kliku', async () => {
  const h = await startHarness();
  try {
    click(h, '[data-tab="kontakty"]');
    clickText(h, '.arkmail-subpill', 'Grupy');
    type(h, '[data-group-add]', 'Gildia');
    click(h, '[data-group-create]');
    click(h, '[data-group-toggle]');
    type(h, '[data-member-add]', 'Grault');
    click(h, '[data-member-add-ok]');

    clickText(h, '.arkmail-subpill', 'Ksiazka adresowa');
    const names = Array.from(h.content.querySelectorAll('[data-book-name]')).map(
      (element) => (element as { textContent?: string }).textContent,
    );
    assert.deepEqual(names, ['Grault']);
  } finally {
    await stopHarness();
  }
});
