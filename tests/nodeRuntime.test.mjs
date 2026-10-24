import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const read = (name) => fs.readFileSync(path.join(REPO, name), 'utf8');
const pkg = JSON.parse(read('package.json'));
const lock = JSON.parse(read('package-lock.json'));

test('srodowisko: projekt wymaga Node 24 lub nowszego', () => {
  assert.equal(pkg.engines?.node, '>=24');
  assert.equal(lock.packages[''].engines?.node, '>=24');
});

test('srodowisko: typy Node i lockfile uzywaja wersji 24', () => {
  assert.equal(pkg.devDependencies['@types/node'], '^24.0.0');
  assert.equal(lock.packages[''].devDependencies['@types/node'], '^24.0.0');
  assert.match(lock.packages['node_modules/@types/node'].version, /^24\./);
});

test('srodowisko: CI uzywa Node 24 i powtarzalnej instalacji', () => {
  const workflow = read('.github/workflows/build.yml');
  assert.match(workflow, /node-version:\s*["']24["']/);
  assert.match(workflow, /run:\s*npm ci(?:\s|$)/);
  assert.doesNotMatch(workflow, /run:\s*npm install(?:\s|$)/);
});

test('srodowisko: README podaje wymagany Node', () => {
  assert.match(read('README.md'), /Node 24 lub nowszy/);
});
