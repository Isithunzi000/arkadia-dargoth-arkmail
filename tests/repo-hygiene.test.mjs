// Straznik higieny repo ArkMail (node:test).
// Skanuje pliki robocze (sledzone + nowe, z poszanowaniem .gitignore):
// zero tokenow/kluczy, zero placeholderow edytora pluginow,
// zero wulgaryzmow (lista w ROT13, zeby straznik nie lamal zasady sam).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const SELF = path.relative(REPO, fileURLToPath(import.meta.url));

function rot13(s) {
  return s.replace(/[a-z]/g, (c) => String.fromCharCode(((c.charCodeAt(0) - 97 + 13) % 26) + 97));
}

// Wzorce budowane dynamicznie, zeby straznik nie trafial sam siebie.
const TOKEN_PATTERN = new RegExp(['github', '_pat_', '[A-Za-z0-9_]{20,}'].join(''));
const PLACEHOLDERS = ['Plugin Editor', 'Created with Plugin Editor'];
const BANNED = [
  'xhejn', 'phejn', 'puhw', 'cvrqmby', 'wronp', 'qhcn', 'pvcn', 'cvmqn',
  'fxhejflfa', 'shpx', 'fuvg', 'ovgpu',
].map(rot13);
// Rdzenie lapia formy odmienione (podciag, nie granice wyrazu).
const BANNED_STEMS = ['wron'].map(rot13);

function boundary(w) {
  return new RegExp(`(^|[^a-z])${w}([^a-z]|$)`, 'i');
}

// Zwraca wykryty wzorzec albo null. Formy podstawowe: granice wyrazu;
// rdzenie: dowolne wystapienie podciagu (formy odmienione).
function findBad(content) {
  const lower = content.toLowerCase();
  for (const bad of BANNED) {
    if (boundary(bad).test(lower)) return bad;
  }
  for (const stem of BANNED_STEMS) {
    if (lower.includes(stem)) return stem;
  }
  return null;
}

function textFiles() {
  const out = execSync('git ls-files -co --exclude-standard', { cwd: REPO, encoding: 'utf8' });
  return out.split('\n').filter(Boolean).filter((f) =>
    !f.startsWith('releases/') && !f.endsWith('.zip') && f !== SELF
  );
}

function read(f) {
  return fs.readFileSync(path.join(REPO, f), 'utf8');
}

test('higiena: zero tokenow i kluczy w plikach repo', () => {
  for (const f of textFiles()) {
    assert.ok(!TOKEN_PATTERN.test(read(f)), `${f}: wykryty wzorzec tokenu`);
  }
});

test('higiena: zero placeholderow edytora pluginow', () => {
  for (const f of textFiles()) {
    const content = read(f);
    for (const bad of PLACEHOLDERS) {
      assert.ok(!content.includes(bad), `${f}: placeholder "${bad}"`);
    }
  }
});

test('higiena: zero wulgaryzmow w plikach repo', () => {
  for (const f of textFiles()) {
    const hit = findBad(read(f));
    assert.equal(hit, null, `${f}: niedozwolone slowo`);
  }
});

// Straznik ma lapac rowniez formy odmienione (komentarz 2026-10-19
// przeszedl dotychczasowa liste). Formy w ROT13, ten sam standard co BANNED.
test('higiena: straznik lapie formy odmienione', () => {
  const forms = ['mwronar', 'mwronqn', 'mwronf', 'wronar', 'wronqv'].map(rot13);
  for (const f of forms) {
    assert.ok(findBad(f) !== null, `forma odmieniona niewykryta: ${f}`);
  }
  assert.equal(findBad('zliczanie kontaktow dziala poprawnie'), null);
});
