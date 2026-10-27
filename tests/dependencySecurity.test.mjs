import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const manifest = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
const lock = JSON.parse(readFileSync(new URL('../package-lock.json', import.meta.url), 'utf8'));

function parts(version) {
  const match = /^(\d+)\.(\d+)\.(\d+)/.exec(version);
  assert.ok(match, `Nieprawidłowa wersja: ${version}`);
  return match.slice(1).map(Number);
}

function atLeast(version, minimum) {
  const left = parts(version);
  const right = parts(minimum);
  for (let i = 0; i < 3; i++) {
    if (left[i] !== right[i]) return left[i] > right[i];
  }
  return true;
}

for (const [name, minimum] of [['happy-dom', '21.0.4'], ['esbuild', '0.25.0']]) {
  test(`${name} jest w wersji bez znanej podatności`, () => {
    assert.ok(manifest.devDependencies[name], `Brak zależności ${name}`);
    const entry = lock.packages[`node_modules/${name}`];
    assert.ok(entry, `Brak ${name} w pliku blokady`);
    assert.ok(atLeast(entry.version, minimum), `${name} ${entry.version} jest starszy niż ${minimum}`);
  });
}
