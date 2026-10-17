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
  const boundary = (w) => new RegExp(`(^|[^a-z])${w}([^a-z]|$)`, 'i');
  for (const f of textFiles()) {
    const content = read(f).toLowerCase();
    for (const bad of BANNED) {
      assert.ok(!boundary(bad).test(content), `${f}: niedozwolone slowo (poz.${BANNED.indexOf(bad)})`);
    }
  }
});
