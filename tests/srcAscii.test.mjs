/**
 * Higiena znakow wydania 1.29.0 (K2): katalog src/ w czystym ASCII.
 *
 * Biala lista: wylacznie U+2192 (strzalka echa komend, wymog protokolu
 * gry). Zrodlo: docs/PLAN-1.29.0.md, fala F2.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const SRC = path.join(process.cwd(), 'src');
const ALLOWED = new Set([0x2192]);

function* walk(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) yield* walk(full);
    else if (entry.isFile()) yield full;
  }
}

test('src/: wyłącznie ASCII i strzałka U+2192', () => {
  const violations = [];
  for (const file of walk(SRC)) {
    const text = fs.readFileSync(file, 'utf8');
    const rel = path.relative(process.cwd(), file);
    text.split('\n').forEach((line, i) => {
      for (const ch of line) {
        if (ch.charCodeAt(0) > 127 && !ALLOWED.has(ch.charCodeAt(0))) {
          violations.push(`${rel}:${i + 1} U+${ch.charCodeAt(0).toString(16).padStart(4, '0')} ${ch}`);
        }
      }
    });
  }
  assert.deepEqual(violations, [], `znaki spoza ASCII w src/: ${violations.length}`);
});
