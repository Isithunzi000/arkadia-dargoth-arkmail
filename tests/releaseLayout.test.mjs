import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO = path.dirname(path.dirname(fileURLToPath(import.meta.url)));

const VERSION = fs.readFileSync(path.join(REPO, 'src/arkmail/meta.ts'), 'utf8').match(/PLUGIN_VERSION = "([^"]+)"/)[1];

function sha256(file) {
  return crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
}

test('ZIP ma dwa pliki w katalogu glownym, nazwe ArkMail i deterministyczne bajty', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'arkmail-release-layout-'));
  fs.mkdirSync(path.join(root, 'scripts'), { recursive: true });
  fs.mkdirSync(path.join(root, 'releases'), { recursive: true });
  fs.mkdirSync(path.join(root, 'build/arkmail'), { recursive: true });
  fs.copyFileSync(
    path.join(REPO, 'scripts/make_release_zip.py'),
    path.join(root, 'scripts/make_release_zip.py'),
  );
  for (const file of ['index.ts', 'plugin.json']) {
    fs.copyFileSync(path.join(REPO, 'build/arkmail', file), path.join(root, 'build/arkmail', file));
  }
  const args = ['scripts/make_release_zip.py', 'build', 'arkmail', VERSION];
  execFileSync('python3', args, { cwd: root, stdio: 'pipe' });
  const zip = path.join(root, `releases/arkmail_${VERSION.replace(/\./g, '_')}.zip`);
  const first = sha256(zip);
  execFileSync('python3', args, { cwd: root, stdio: 'pipe' });
  assert.equal(sha256(zip), first, 'dwa buildy maja identyczne bajty');

  const report = JSON.parse(execFileSync('python3', ['-c', `
import json, zipfile
with zipfile.ZipFile(${JSON.stringify(zip)}) as z:
    print(json.dumps([{
        'name': i.filename,
        'date': i.date_time,
        'attr': i.external_attr,
        'compression': i.compress_type,
        'plugin': json.loads(z.read('plugin.json')) if i.filename == 'plugin.json' else None,
    } for i in z.infolist()]))
`], { encoding: 'utf8' }));
  assert.deepEqual(report.map((entry) => entry.name), ['index.ts', 'plugin.json']);
  const plugin = report.find((entry) => entry.name === 'plugin.json').plugin;
  assert.equal(plugin.name, 'ArkMail');
  for (const entry of report) {
    assert.deepEqual(entry.date, [1980, 1, 1, 0, 0, 0]);
    assert.equal(entry.compression, 0, 'ZIP_STORED');
    assert.equal(entry.attr, 0o100644 * 0x10000, 'stale uprawnienia pliku');
  }
});
