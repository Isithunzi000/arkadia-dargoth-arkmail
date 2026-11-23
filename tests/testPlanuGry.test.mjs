import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const planPath = new URL('../docs/PLAN-TESTU-GRY-1.30.17.md', import.meta.url);

test('plan testu gry chroni dane, prywatne listy i kanal wysylki', () => {
  const plan = readFileSync(planPath, 'utf8');
  for (const required of [
    '## Bezpieczenstwo',
    'bez zapisu danych logowania',
    'bez fizycznego wyslania',
    'Nie wolno usuwac listow z odebranych ani wyslanych',
    'wylacznie listy testowe utworzone podczas tego testu',
    'bez zapisywania wygenerowanych archiwow na dysku',
    '## Warunki przerwania',
    '## Zapis wynikow',
  ]) {
    assert.ok(plan.includes(required), `Brak zapisu: ${required}`);
  }
  for (const forbidden of ['Arkadia2025', 'user:', 'pass:']) {
    assert.equal(plan.includes(forbidden), false, `Plan zawiera zakazany material: ${forbidden}`);
  }
});
