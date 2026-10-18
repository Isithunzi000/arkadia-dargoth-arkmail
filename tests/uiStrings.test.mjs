/**
 * Higiena stringow UI (Fala 9e): Arkadia nie wspiera ogonkow, wiec
 * stringi widoczne dla gracza sa bez nich; zero zargona technicznego.
 * Skanujemy zrodla UI poza komentarzami (komentarze full-line sa
 * odrzucane - stringi i tak zyja w kodzie, nie w komentarzach).
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const UI_FILES = [
  'src/arkmail/ui/render.ts',
  'src/arkmail/ui/store.ts',
  'src/arkmail/ui/styles.ts',
  'src/arkmail/index.ts',
];
const DIACRITICS = /[ąćęłńóśźżĄĆĘŁŃÓŚŹŻ]/;

const codeOnly = (path) =>
  readFileSync(join(ROOT, path), 'utf8')
    .split('\n')
    .filter((line) => {
      const t = line.trimStart();
      return !t.startsWith('//') && !t.startsWith('/*') && !t.startsWith('*');
    })
    .join('\n');

test('stringi UI: zero ogonkow poza komentarzami', () => {
  for (const file of UI_FILES) {
    const code = codeOnly(file);
    const hit = DIACRITICS.exec(code);
    assert.equal(
      hit,
      null,
      `${file}: ogonki w kodzie (np. "${hit?.[0]}" na pozycji ${hit?.index})`,
    );
  }
});

test('stringi UI: zakazany zargon techniczny', () => {
  for (const file of UI_FILES) {
    const code = codeOnly(file);
    for (const banned of ['(tost)', 'w toku:', 'paginacj']) {
      assert.ok(!code.includes(banned), `${file}: zakazane sformulowanie "${banned}"`);
    }
  }
});
