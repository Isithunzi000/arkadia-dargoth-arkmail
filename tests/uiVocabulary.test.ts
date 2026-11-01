/**
 * Fala 31e: audyt slownictwa komunikatow. Zrodla w src/ nie moga zawierac:
 *  - "Gotowe z ostrzezeniem" (wymuszone, techniczne),
 *  - "zindeksowane" (zargon - gracz nie indeksuje, tylko zapisuje),
 *  - "umkn" / "znikn" (ugniatanie winy - mowimy, co sie stalo),
 *  - "niedostepn" (zamiast tego fakt: "serwer nie pokazuje"),
 *  - "dni z brakami" (zamiast tego "brakuje danych z N dni"),
 *  - znakow "·" i "—" (czcionki mudowate; UI jest ASCII).
 * Dotyczy wszystkich linii zrodla - komunikatow i komentarzy (jeden
 * standard slownictwa w calym kodzie, bez wyjatkow "bo tylko komentarz").
 * Fala 38: porownanie bez rozrozniania wielkosci liter - wielka litera
 * na poczatku zdania nie omija juz guarda.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

const SRC_DIR = join(__dirname, '..', '..', 'src', 'arkmail');

function tsFiles(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) out.push(...tsFiles(full));
    else if (name.endsWith('.ts')) out.push(full);
  }
  return out;
}

const BANNED: Array<[string, string]> = [
  ['Gotowe z ostrzezeniem', 'zamiast tego: "Gotowe: ... (szczegoly)"'],
  ['zindeksowane', 'zamiast tego: "zapisane"'],
  ['umkn', 'wymazane slownictwo'],
  ['znikn', 'wymazane slownictwo - mowimy, co sie stalo'],
  ['niedostepn', 'zamiast tego fakt: "serwer nie pokazuje" / "brakuje danych"'],
  ['dni z brakami', 'zamiast tego: "brakuje danych z N dni"'],
  ['\u00b7', 'znak "srodkowa kropka" nie wystepuje w UI (ASCII)'],
  ['\u2014', 'myślnik em-dash nie wystepuje w UI (ASCII)'],
];

test('audyt: zakazane slowa i znaki nie wystepuja w src/', () => {
  const files = tsFiles(SRC_DIR);
  assert.ok(files.length > 30, `audyt obejmuje pliki zrodlowe (znaleziono: ${files.length})`);
  const hits: string[] = [];
  for (const file of files) {
    const text = readFileSync(file, 'utf8');
    const lines = text.split('\n');
    lines.forEach((line, index) => {
      for (const [banned, hint] of BANNED) {
        if (line.toLowerCase().includes(banned.toLowerCase())) {
          hits.push(`${file.split('/src/')[1]}:${index + 1}: "${banned}" (${hint})`);
        }
      }
    });
  }
  assert.deepEqual(hits, [], `zakazane slowa/znaki:\n${hits.join('\n')}`);
});
