// Fala 39b: audyt danych wrazliwych w repo (testy + fixture'i + src).
// Zakres: imiona postaci z logow (maskowane kodami znakow - nigdy jawne),
// alias, klub, zwierze, tematy i tresci listow z logow, daty logowe
// (48 dni korpusu), nazwy sesji. Test skanuje calosc i pada na KAZDym
// trafieniu - po migracji fixture'i musi byc zielony na zawsze.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const FIXTURES = path.join(REPO, 'tests', 'fixtures');

// Imiona postaci - maskowane, w repo nigdy nie wystepuja jawnie.
const MASKED = [
  'A' + String.fromCharCode(114, 97, 104, 105),
  'A' + String.fromCharCode(114, 97, 104, 105, 114),
  'G' + String.fromCharCode(119, 101, 110, 110),
  'S' + String.fromCharCode(122, 97, 114, 107, 97),
];

// Daty logowe (ISO) - dokladnie te dni, zadnych innych.
const LOG_DATES = ["2025-11-10","2025-11-15","2025-11-16","2025-12-01","2025-12-06","2025-12-14","2025-12-15","2025-12-19","2025-12-20","2025-12-21","2025-12-22","2025-12-23","2025-12-24","2025-12-25","2025-12-26","2025-12-27","2025-12-28","2025-12-29","2025-12-30","2025-12-31","2026-01-01","2026-01-02","2026-01-03","2026-01-04","2026-01-05","2026-01-06","2026-01-07","2026-01-11","2026-02-28","2026-03-01","2026-03-02","2026-03-03","2026-03-09","2026-03-11","2026-03-25","2026-03-26","2026-03-27","2026-03-31","2026-04-01","2026-04-02","2026-04-05","2026-04-07","2026-04-08","2026-04-09","2026-04-11","2026-04-12","2026-04-16","2026-04-19"];

// Tresci, tematy i nazwy z logow (podciagi, case-sensitive tam gdzie bezpieczne).
const BANNED = [
  ...MASKED,
  'poltorak', 'Poltorak',
  'Gronk',
  'Kruk', 'Krukowi', 'Krukiem', 'Kruka', 'kruka', 'krukow',
  'Tsches', 'Hanza',
  'szkielka', 'Szkielka', 'Opowiesci, zabawa', 'Wyzima',
  'Moze sie Wam przydac', 'skora goblina',
  'zalakowany', 'Zalakowany', 'zawiniety', 'pachnacy pergamin',
  'Belleteyn', 'Zniwiarz', 'Nuln', 'Novigrad', 'Morr',
  'Galli', 'Grazie', 'Ciao', 'Zielonooka', 'Urbimo', 'rosomak',
];

function* walk(dir, exts) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) yield* walk(p, exts);
    else if (exts.some((x) => e.name.endsWith(x))) yield p;
  }
}

function scanFiles(files, banned) {
  const hits = [];
  for (const f of files) {
    const txt = fs.readFileSync(f, 'utf8');
    for (const b of banned) {
      const i = txt.indexOf(b);
      if (i >= 0) {
        const line = txt.slice(0, i).split('\n').length;
        hits.push(`${path.relative(REPO, f)}:${line}: ${b}`);
      }
    }
  }
  return hits;
}

test('audyt: fixture\'i bez danych wrazliwych', () => {
  const files = [...walk(FIXTURES, ['.json'])];
  const hits = scanFiles(files, BANNED);
  assert.deepEqual(hits, [], `trafienia:\n${hits.join('\n')}`);
});

test('audyt: testy i src bez danych wrazliwych', () => {
  const tests = [...walk(path.join(REPO, 'tests'), ['.ts', '.mjs'])]
    .filter((p) => !p.endsWith('logDataAudit.test.mjs'));
  const src = [...walk(path.join(REPO, 'src'), ['.ts'])];
  const hits = scanFiles([...tests, ...src], BANNED);
  assert.deepEqual(hits, [], `trafienia:\n${hits.join('\n')}`);
});

test('audyt: zadna data logowa nie wystepuje (ISO ani rzymska)', () => {
  const rom = (iso) => {
    const [y, m, d] = iso.split('-').map(Number);
    const R = ['I','II','III','IV','V','VI','VII','VIII','IX','X','XI','XII'];
    return `${d} ${R[m - 1]} ${y}`;
  };
  // Granice wyrazu: '5 IV 2026' NIE moze zlapac '25 IV 2026'.
  const pats = LOG_DATES.flatMap((iso) => [
    new RegExp(`\\b${iso}\\b`),
    new RegExp(`\\b${rom(iso).replace(/ /g, '\\s+')}\\b`),
  ]);
  const files = [
    ...walk(FIXTURES, ['.json']),
    ...[...walk(path.join(REPO, 'tests'), ['.ts', '.mjs'])]
      .filter((p) => !p.endsWith('logDataAudit.test.mjs')),
    ...walk(path.join(REPO, 'src'), ['.ts']),
  ];
  const hits = [];
  for (const f of files) {
    const txt = fs.readFileSync(f, 'utf8');
    for (const re of pats) {
      const m = txt.match(re);
      if (m) hits.push(`${path.relative(REPO, f)}: ${m[0]}`);
    }
  }
  assert.deepEqual(hits, [], `trafienia:\n${hits.join('\n')}`);
});

test('audyt: fixture\'i bez klucza zrodlo i nazw sesji', () => {
  const bad = [];
  for (const f of walk(FIXTURES, ['.json'])) {
    const txt = fs.readFileSync(f, 'utf8');
    if (txt.includes('"zrodlo"') || /session_\d/.test(txt))
      bad.push(path.relative(REPO, f));
  }
  assert.deepEqual(bad, [], `fixture'i z zrodlem/sesja: ${bad.join(', ')}`);
});
