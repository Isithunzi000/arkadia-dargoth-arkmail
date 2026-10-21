// Straznik spojnosci wersji ArkMail (node:test, zero deps).
// Zrodlo prawdy: src/arkmail/meta.ts (PLUGIN_VERSION). Musi byc rowne:
// plugin.json metadata.version, nazwie najnowszego zipa w releases/,
// PLUGIN_VERSION wewnatrz zipa oraz version w zwracanym PluginInfo.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const META = path.join(REPO, 'src/arkmail/meta.ts');
const ENTRY = path.join(REPO, 'src/arkmail/index.ts');
const PLUGIN_JSON = path.join(REPO, 'src/arkmail/plugin.json');
const RELEASES = path.join(REPO, 'releases');

function metaVersion() {
  const src = fs.readFileSync(META, 'utf8');
  const m = src.match(/PLUGIN_VERSION = "([^"]+)"/);
  assert.ok(m, 'meta.ts: brak PLUGIN_VERSION');
  return m[1];
}

function latestZip() {
  const zips = fs.readdirSync(RELEASES).filter((f) => /^arkmail_\d+(?:_\d+)*\.zip$/.test(f));
  assert.ok(zips.length > 0, 'brak zipa arkmail w releases/');
  const verCmp = (a, b) => {
    const pa = a.split('_').map(Number), pb = b.split('_').map(Number);
    for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
      const d = (pb[i] || 0) - (pa[i] || 0);
      if (d) return d;
    }
    return 0;
  };
  return zips.sort((a, b) => verCmp(a.match(/_(\d+(?:_\d+)*)\.zip$/)[1], b.match(/_(\d+(?:_\d+)*)\.zip$/)[1]))[0];
}

test('wersja: meta.ts == plugin.json == nazwa zipa == zip w srodku == PluginInfo', () => {
  const ver = metaVersion();

  const pj = JSON.parse(fs.readFileSync(PLUGIN_JSON, 'utf8'));
  assert.equal(pj.metadata.version, ver, 'plugin.json metadata.version != meta.ts PLUGIN_VERSION');
  // Fala 22b (publish-readiness): katalog czyta tez TOP-LEVEL version
  // z plugin.json; release.mjs stampuje oba pola z meta.ts.
  assert.equal(pj.version, ver, 'plugin.json top-level version != meta.ts PLUGIN_VERSION');

  const zip = latestZip();
  const zipVer = zip.match(/^arkmail_(\d+(?:_\d+)*)\.zip$/)[1].replace(/_/g, '.');
  assert.equal(zipVer, ver, 'nazwa najnowszego zipa != meta.ts PLUGIN_VERSION');

  const zippedTs = execSync(`unzip -p "${path.join(RELEASES, zip)}" "arkmail/index.ts"`, { encoding: 'utf8' });
  const mZip = zippedTs.match(/PLUGIN_VERSION = "([^"]+)"/);
  assert.ok(mZip, 'zip: brak PLUGIN_VERSION w index.ts');
  assert.equal(mZip[1], ver, 'zip: PLUGIN_VERSION != meta.ts');
  const zippedPj = JSON.parse(execSync(`unzip -p "${path.join(RELEASES, zip)}" "arkmail/plugin.json"`, { encoding: 'utf8' }));
  assert.equal(zippedPj.metadata.version, ver, 'zip: plugin.json metadata.version != meta.ts');

  const entry = fs.readFileSync(ENTRY, 'utf8');
  assert.match(entry, /version:\s*PLUGIN_VERSION/, 'index.ts: PluginInfo.version ma byc PLUGIN_VERSION z meta.ts');
  // Fala 22a (publish-readiness): katalog wymaga LITERALU author w
  // PluginInfo (metadata.test.mjs dargoth-plugins czyta regexem, nie
  // rozwinie const-ref). Literal musi byc zgodny z meta.ts.
  assert.match(entry, /author:\s*"Isithunzi000"/, 'index.ts: PluginInfo.author ma byc literalem');
});

// Fala 21c: opis pluginu musi byc identyczny w meta.ts i plugin.json
// (katalog wymaga zgodnosci; rozjazd przy zmianie = blad publikacji).
test('opis: meta.ts PLUGIN_DESCRIPTION == plugin.json metadata.description', () => {
  const src = fs.readFileSync(META, 'utf8');
  const m = src.match(/PLUGIN_DESCRIPTION =\s*"([^"]+)"/s);
  assert.ok(m, 'meta.ts: brak PLUGIN_DESCRIPTION');
  const pj = JSON.parse(fs.readFileSync(PLUGIN_JSON, 'utf8'));
  assert.equal(pj.metadata.description, m[1], 'plugin.json metadata.description != meta.ts PLUGIN_DESCRIPTION');
});
