// Straznik danych wrazliwych ArkMail (node:test, zero deps).
// Fala 25a/25b/25c: w repo NIE wolno trzymac prawdziwych imion postaci,
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
// Wzorce zakazane jako FRAGMENTY regexow (bez rozrozniania wielkosci
// liter). '\\w*' na koncu łapie formy gramatyczne; wzorce bez '\\w*'
// sa dokladne (krotkie imiona kolidujace z polskimi slowami, np. Rab
// vs "robie", Bork vs "delikatny").
const FORBIDDEN_PARTS = [
  ['\\b', 'ara', 'hi', '\\w*'],
  ['\\b', 'afa', 'nenn', '\\w*'],
  ['\\b', 'gwe', 'nn', '\\w*'],
  ['\\b', 'eld', 'ur', '\\w*'],
  ['\\b', 'bel', 'fur', '\\w*'],
  ['\\b', 'cata', 'lina', '\\w*'],
  ['\\b', 'gene', 'vive', '\\w*'],
  ['\\b', 'yoa', 'n', '\\w*'],
  ['\\b', 'ble', 'jd', '\\w*'],
  ['\\b', 'ata', 'man', '\\w*'],
  ['\\b', 'fe', 'rd', '\\w*'],
  ['\\b', 'val', 'ur', '\\w*'],
  ['\\b', 'bar', 'aq', '\\w*'],
  ['\\b', 'kal', 'kofoniks', '\\w*'],
  ['\\b', 'ast', 'or', '\\w*'],
  ['\\b', 'bar', 'ag', '\\w*'],
  ['\\b', 'bla', 'z', '\\w*'],
  ['\\b', 'de', 'li', '\\b'],
  ['\\b', 'gal', 'zar', '\\w*'],
  ['\\b', 'gh', 'ur', '\\w*'],
  ['\\b', 'gro', 'har', '\\w*'],
  ['\\b', 'gru', 'ng', '\\w*'],
  ['\\b', 'gvi', 'don', '\\w*'],
  ['\\b', 'ise', 'grin', '\\w*'],
  ['\\b', 'kru', 'x', '\\w*'],
  ['\\b', 'lio', 'ne', '\\w*'],
  ['\\b', 'mii', 'la', '\\w*'],
  ['\\b', 'mir', 'is', '\\w*'],
  ['\\b', 'mus', 'in', '\\w*'],
  ['\\b', 'myr', 'dred', '\\w*'],
  ['\\b', 'r', 'ob', '\\b'],
  ['\\b', 'sa', 'ul', '\\w*'],
  ['\\b', 'tah', 'ira', '\\w*'],
  ['\\b', 'tere', 'nes', '\\w*'],
  ['\\b', 'tuz', 'zio', '\\w*'],
  ['\\b', 'zuz', 'ia', '\\w*'],
  ['\\b', 'nept', 'un', '\\w*'],
  ['\\b', 'boro', 'mer', '\\w*'],
  ['\\b', 'kha', 'el', '\\w*'],
  ['\\b', 'anay', 'ensen', '\\w*'],
  ['\\b', 'arc', 'ain', '\\w*'],
  ['\\b', 'mire', 'lle', '\\w*'],
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
