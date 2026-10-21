// Straznik danych wrazliwych ArkMail (node:test, zero deps).
// Fala 25a/25b: w repo NIE wolno trzymac prawdziwych imion postaci,
// zwierzat ani graczy - w zadnej formie gramatycznej. Test skanuje
// wszystkie pliki tekstowe repo (poza katalogami generowanymi) i pada,
// jesli znajdzie zakazany wzorzec.
// UWAGA TECHNICZNA: wzorce budowane z FRAGMENTOW (konkatencja), nigdy
// jako pelne literaly - dzieki temu mechaniczne narzedzia podmiany
// tekstu (w tym przepisywanie historii gita) nie nadpisza wzorcow
// wewnatrz tego pliku. Plik tego testu jest tez wylaczony
// ze skanowania. Nowe wzorce dopisujemy do FORBIDDEN_PARTS.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const SELF = path.relative(REPO, fileURLToPath(import.meta.url));
const SKIP_DIRS = new Set(['.git', 'node_modules', 'out-test', 'build', 'dist', '.build_tmp', 'releases']);
const TEXT_EXT = new Set([
  '.ts', '.mts', '.cts', '.mjs', '.cjs', '.js', '.json',
  '.md', '.txt', '.yml', '.yaml', '.html', '.css', '.xml',
]);
// Wzorce zakazane jako FRAGMENTY (bez rozrozniania wielkosci liter);
// kazdy wzorzec obejmuje wszystkie formy gramatyczne danego imienia.
const FORBIDDEN_PARTS = [
  ['ara', 'hi'],
  ['afa', 'nenn'],
  ['gwe', 'nn'],
  ['eld', 'ur'],
  ['bel', 'fur'],
  ['cata', 'lina'],
  ['gene', 'vive'],
  ['yoa', 'na'],
  ['yoa', 'no'],
  ['ble', 'jd'],
  ['ata', 'man'],
  ['fe', 'rd'],
  ['val', 'ur'],
  ['bar', 'aq'],
];
const FORBIDDEN = FORBIDDEN_PARTS.map((parts) => new RegExp(parts.join(''), 'i'));

function* walk(dir) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (e.isDirectory()) {
      if (!SKIP_DIRS.has(e.name)) yield* walk(path.join(dir, e.name));
    } else if (TEXT_EXT.has(path.extname(e.name).toLowerCase())) {
      yield path.join(dir, e.name);
    }
  }
}

test('repo jest wolne od wrazliwych imion gracza', () => {
  const hits = [];
  for (const file of walk(REPO)) {
    const rel = path.relative(REPO, file);
    if (rel === SELF) continue;
    const lines = fs.readFileSync(file, 'utf8').split('\n');
    lines.forEach((line, i) => {
      for (const re of FORBIDDEN) {
        if (re.test(line)) hits.push(`${rel}:${i + 1}: ${line.trim().slice(0, 80)}`);
      }
    });
  }
  assert.deepEqual(hits, [], `znalezione wrazliwe imiona:\n${hits.join('\n')}`);
});
