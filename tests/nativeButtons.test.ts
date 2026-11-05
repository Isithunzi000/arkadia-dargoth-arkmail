/**
 * Migracja klawiszy do natywnych klas (wydanie 1.30.1, Etap 3) - piny
 * regresji C: kazdy przycisk pluginu ma miec klasy natywne klienta
 * (popup-btn popup-btn--control albo dialog-tab), inaczej nie dziedziczy
 * wysokosci var(--ui-ctrl), skalowania i wariantow. Wyjatki dozwolone:
 * pigulka skrzynki (.arkmail-box - komponent z wlasna rodzina styli)
 * i mini rodzina pomocnicza (.arkmail-contact-dir, .arkmail-contact-addbook,
 * .arkmail-arch-people-toggle - celowo kompaktowa, pin w specificity.test.ts).
 * Skan zrodla render.ts: po createElement('button') className w ciagu 14 linii.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const SRC = readFileSync(
  join(__dirname, '..', '..', 'src', 'arkmail', 'ui', 'render.ts'),
  'utf-8',
);

const ALLOWED = ['arkmail-box', 'arkmail-contact-dir', 'arkmail-contact-addbook'];

test('render: kazdy przycisk ma klasy natywne klienta', () => {
  const lines = SRC.split('\n');
  const violations: string[] = [];
  for (let i = 0; i < lines.length; i++) {
    if (!lines[i].includes("createElement('button')")) continue;
    const window = lines.slice(i, i + 14).join('\n');
    const m = window.match(/className\s*=\s*'([^']*)'/);
    if (!m) {
      violations.push(`linia ${i + 1}: przycisk bez className`);
      continue;
    }
    const cls = m[1];
    if (cls.includes('popup-btn') || cls.includes('dialog-tab')) continue;
    if (ALLOWED.some((a) => cls.split(' ').includes(a))) continue;
    violations.push(`linia ${i + 1}: "${cls}" bez klas natywnych`);
  }
  assert.deepEqual(violations, [], `przyciski poza kontraktem:\n${violations.join('\n')}`);
});
