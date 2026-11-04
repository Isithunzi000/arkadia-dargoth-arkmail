import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const read = (name) => fs.readFileSync(path.join(REPO, name), 'utf8');
const pkg = JSON.parse(read('package.json'));
const lock = JSON.parse(read('package-lock.json'));

test('srodowisko: projekt wymaga Node 26 lub nowszego', () => {
  assert.equal(pkg.engines?.node, '>=26');
  assert.equal(lock.packages[''].engines?.node, '>=26');
});

test('srodowisko: typy Node i lockfile uzywaja wersji 26', () => {
  assert.equal(pkg.devDependencies['@types/node'], '^26.0.0');
  assert.equal(lock.packages[''].devDependencies['@types/node'], '^26.0.0');
  assert.match(lock.packages['node_modules/@types/node'].version, /^26\./);
});

test('srodowisko: CI uzywa Node 26 i powtarzalnej instalacji', () => {
  const workflow = read('.github/workflows/build.yml');
  assert.match(workflow, /node-version:\s*["']26["']/);
  assert.match(workflow, /run:\s*npm ci(?:\s|$)/);
  assert.doesNotMatch(workflow, /run:\s*npm install(?:\s|$)/);
});
