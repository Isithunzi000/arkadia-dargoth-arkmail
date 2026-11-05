/**
 * Migracja klawiszy do natywnych klas (wydanie 1.30.1, Etap 3; twardy
 * skan w 1.30.2, Etap 1) - piny regresji C: kazdy przycisk pluginu ma
 * miec klasy natywne klienta (popup-btn popup-btn--control albo
 * dialog-tab), inaczej nie dziedziczy wysokosci var(--ui-ctrl),
 * skalowania i wariantow. Wyjatki dozwolone: pigulka skrzynki
 * (.arkmail-box - komponent z wlasna rodzina styli) i mini rodzina
 * pomocnicza (.arkmail-contact-dir, .arkmail-contact-addbook - celowo
 * kompaktowa, pin w specificity.test.ts).
 * Wydanie 1.30.2 (Etap 1): skan twardy - className musi nalezec do
 * TEJ zmiennej przycisku (dziura: 14-liniowe okno lapalo className
 * sasiedniego elementu, np. labelu, i wpuszczalo przycisk bez klas).
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
    const mCreate = lines[i].match(/const\s+(\w+)\s*=\s*doc\.createElement\('button'\)/);
    if (!mCreate) continue;
    const varName = mCreate[1];
    // Szukamy className TEJ zmiennej w kolejnych 14 liniach (wartosc
    // moze byc w nastepnej linii - lamanie po '='). Ancja na nazwie
    // zmiennej: className sasiedniego elementu nie wchodzi.
    const window = lines.slice(i + 1, i + 15).join('\n');
    const m = window.match(new RegExp(`${varName}\\.className\\s*=\\s*'([^']*)'`));
    const cls = m ? m[1] : null;
    if (cls === null) {
      violations.push(`linia ${i + 1}: ${varName} bez className`);
      continue;
    }
    if (cls.includes('popup-btn') || cls.includes('dialog-tab')) continue;
    if (ALLOWED.some((a) => cls.split(' ').includes(a))) continue;
    violations.push(`linia ${i + 1}: ${varName} "${cls}" bez klas natywnych`);
  }
  assert.deepEqual(violations, [], `przyciski poza kontraktem:\n${violations.join('\n')}`);
});
