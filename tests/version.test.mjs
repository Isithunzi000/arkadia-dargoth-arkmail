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

test('wydanie: przygotowany numer wersji to 1.21.0', () => {
  assert.equal(metaVersion(), '1.21.0');
});

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

  const zippedTs = execSync(`unzip -p "${path.join(RELEASES, zip)}" "index.ts"`, { encoding: 'utf8' });
  const mZip = zippedTs.match(/PLUGIN_VERSION = "([^"]+)"/);
  assert.ok(mZip, 'zip: brak PLUGIN_VERSION w index.ts');
  assert.equal(mZip[1], ver, 'zip: PLUGIN_VERSION != meta.ts');
  const zippedPj = JSON.parse(execSync(`unzip -p "${path.join(RELEASES, zip)}" "plugin.json"`, { encoding: 'utf8' }));
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

test('dokumentacja: filtr osoby, daty i limit serwera maja pelny opis', () => {
  const protocol = fs.readFileSync(path.join(REPO, 'docs/PROTOCOL.md'), 'utf8');
  assert.match(protocol, /co najmniej jedna spacja/);
  assert.match(protocol, /wymaga dopelniacza/);
  assert.match(protocol, /male litery wylacznie dla osoby/);
  assert.match(protocol, /miesiace zapisuje wielkimi literami/);
  assert.match(protocol, /`h` zwraca maksymalnie 50/);
  assert.match(protocol, /przelacza na liste odebranych/);
  assert.match(protocol, /wiecej niz 50 listow z jednego dnia/);
  assert.match(protocol, /trwala luka/);
});

test('dokumentacja: docelowy magazyn archiwum jest opisany jako IndexedDB', () => {
  const protocol = fs.readFileSync(path.join(REPO, 'docs/PROTOCOL.md'), 'utf8');
  assert.match(protocol, /Trwalosc: IndexedDB per postac/);
  assert.doesNotMatch(protocol, /Trwalosc: localStorage per postac/);
  assert.doesNotMatch(protocol, /IndexedDB\s+swiadomie odlozone/);
});

test('dokumentacja: README opisuje trzy niezalezne kroki Archiwum', () => {
  const readme = fs.readFileSync(path.join(REPO, 'README.md'), 'utf8');
  assert.match(readme, /1\. Indeksacja/);
  assert.match(readme, /2\. Pobranie treści/);
  assert.match(readme, /3\. Zapis ZIP/);
  assert.match(readme, /nie uruchamia indeksacji/);
  assert.match(readme, /częściowy ZIP/);
});

// Fala 32: sekcja Licencja wspomina wylacznie licencje - wyjasnienia
// rodla kodu (np. "port 1:1") nie wolno tam umieszczac.
test('dokumentacja: sekcja Licencja wspomina tylko licencje', () => {
  const readme = fs.readFileSync(path.join(REPO, 'README.md'), 'utf8');
  const lic = readme.split('## Licencja')[1] ?? '';
  assert.match(lic, /AGPL/);
  assert.doesNotMatch(lic, /port 1:1/);
});

// Fala 32: kazdy URL w README ma byc klikalnym odnosnikiem markdown
// ([tekst](url)), nie surowym tekstem w code spanie/fenced blocku.
// Fala 39a: tekstem linku moze (i ma) byc sam pelny URL — najpierw
// wyciynamy kompletne odnosniki [tekst](url), potem wymagamy, zeby
// nie zostal zaden surowy URL.
test('dokumentacja: README uzywa wylacznie klikalnych odnosnikow', () => {
  const readme = fs.readFileSync(path.join(REPO, 'README.md'), 'utf8');
  assert.doesNotMatch(readme, /`[^`\n]*https?:\/\/[^`\n]*`/);
  const stripped = readme.replace(/\[([^\]]*)\]\(([^)]+)\)/g, ' ');
  const bare = stripped.match(/https?:\/\/[^\s)<>"']+/g) ?? [];
  assert.deepEqual(bare, [], `surowe URL poza odnosnikami: ${bare.join(', ')}`);
});

// Konwencja release'ow arkmaila to WYlACZNIE wersjonowany zip
// (arkmail_X_Y_Z.zip); asset o stalej nazwie arkmail.zip byl jednorazowym
// odchyleniem i zostal usuniety z wydania - README nie moze do niego
// odsylac (martwy link).
test('dokumentacja: README nie odwoluje sie do assetu arkmail.zip', () => {
  const readme = fs.readFileSync(path.join(REPO, 'README.md'), 'utf8');
  assert.doesNotMatch(readme, /arkmail\.zip/);
});

test('dokumentacja: README opisuje odswiezanie i grupowanie listow', () => {
  const readme = fs.readFileSync(path.join(REPO, 'README.md'), 'utf8').replace(/\s+/g, ' ');
  assert.match(readme, /osobie, temacie, treści i dacie/);
  assert.match(readme, /Puste pola i przycisk Szukaj odświeżają aktywną skrzynkę/);
  assert.match(readme, /W Usuwaniu przycisk Odswiez ponawia ostatnie wyszukiwanie/);
  assert.match(readme, /traktujemy\s+jak osobne listy/);
  assert.match(readme, /każde wystąpienie ze swoją treścią i jako osobny/);
  assert.match(readme, /pusta lub błędna data nie oznacza zniknięcia listu/);
});

test('dokumentacja: walidacja listu i filtrow jest opisana', () => {
  const protocol = fs.readFileSync(path.join(REPO, 'docs/PROTOCOL.md'), 'utf8');
  assert.match(protocol, /adresat i DW przyjmują wyłącznie litery A-Z i a-z/);
  assert.match(protocol, /kilka nazw lub aliasów rozdzielonych przecinkami/);
  assert.match(protocol, /Temat i treść nie mogą zawierać znaków `;` ani `#`/);
  assert.match(protocol, /Sam szablon lub ramka bez wpisanej treści jest pustym listem/);
  assert.match(protocol, /daty muszą istnieć w kalendarzu/);
});
