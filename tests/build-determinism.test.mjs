// Straznik determinizmu builda ArkMail (node:test).
// bundle.mjs 2x -> identyczne bajty build/arkmail/index.ts.
// make_release_zip.py 2x w katalogu- fixture -> identyczny SHA-256 zipa
// (fixture w tmp, zeby test nie dotykal zacommitowanego zipa w releases/).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execSync } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO = path.dirname(path.dirname(fileURLToPath(import.meta.url)));

function sha256(file) {
  return crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
}

function currentVersion() {
  const src = fs.readFileSync(path.join(REPO, 'src/arkmail/meta.ts'), 'utf8');
  return src.match(/PLUGIN_VERSION = "([^"]+)"/)[1];
}

test('determinizm: podwojny bundle daje identyczne bajty', () => {
  execSync('node scripts/bundle.mjs', { cwd: REPO, stdio: 'pipe' });
  const first = sha256(path.join(REPO, 'build/arkmail/index.ts'));
  execSync('node scripts/bundle.mjs', { cwd: REPO, stdio: 'pipe' });
  const second = sha256(path.join(REPO, 'build/arkmail/index.ts'));
  assert.equal(first, second, 'bundle nie jest deterministyczny');
});

test('determinizm: podwojny zip daje identyczny SHA-256', () => {
  const ver = currentVersion();
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'arkmail-zip-'));
  fs.mkdirSync(path.join(root, 'scripts'), { recursive: true });
  fs.mkdirSync(path.join(root, 'releases'), { recursive: true });
  fs.copyFileSync(
    path.join(REPO, 'scripts/make_release_zip.py'),
    path.join(root, 'scripts/make_release_zip.py')
  );
  // staging build/arkmail z repo -> fixture build/arkmail
  fs.mkdirSync(path.join(root, 'build/arkmail'), { recursive: true });
  for (const f of ['index.ts', 'plugin.json']) {
    fs.copyFileSync(path.join(REPO, 'build/arkmail', f), path.join(root, 'build/arkmail', f));
  }
  const zipPath = path.join(root, 'releases', `arkmail_${ver.replace(/\./g, '_')}.zip`);
  execSync(`python3 scripts/make_release_zip.py build arkmail ${ver}`, { cwd: root, stdio: 'pipe' });
  const first = sha256(zipPath);
  execSync(`python3 scripts/make_release_zip.py build arkmail ${ver}`, { cwd: root, stdio: 'pipe' });
  const second = sha256(zipPath);
  assert.equal(first, second, 'zip release nie jest deterministyczny');
});
