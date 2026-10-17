#!/usr/bin/env node
/**
 * Spłaszcza wieloplikowy src/arkmail/ do jednego index.ts (kontrakt zipa
 * release'owego: katalog z index.ts + plugin.json). Import "plugin-api"
 * jest type-only (import type) - esbuild go wymaze, dist nie zawiera
 * zadnych zaleznosci zewnetrznych.
 *
 * Wyjscie: build/arkmail/{index.ts,plugin.json}
 * Deterministyczne: te same zrodla -> te same bajty (esbuild bez minify,
 * stala wersja w devDependencies).
 */
import esbuild from "esbuild";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const REPO = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const SRC = path.join(REPO, "src/arkmail");
const OUT = path.join(REPO, "build/arkmail");

fs.rmSync(OUT, { recursive: true, force: true });
fs.mkdirSync(OUT, { recursive: true });

const result = await esbuild.build({
  entryPoints: [path.join(SRC, "index.ts")],
  bundle: true,
  format: "esm",
  target: "es2020",
  platform: "browser",
  write: false,
  logLevel: "silent",
});

let code = result.outputFiles[0].text;
if (code.includes("plugin-api")) {
  console.error("BLAD: bundle zawiera referencje plugin-api (import nie jest type-only)");
  process.exit(1);
}
// esbuild przy sklejaniu modulow obniża top-level const do var (semantyka
// live bindings). Kontrakt release'owy (guard w build.js) wymaga dokladnie
// `const PLUGIN_VERSION = "..."` - przywracamy const, z asercja 1 trafienia.
// PLUGIN_VERSION nigdy nie jest nadpisywane, wiec const jest poprawne.
const VAR_PV = 'var PLUGIN_VERSION = "';
const hits = code.split(VAR_PV).length - 1;
if (hits !== 1) {
  console.error(`BLAD: oczekiwano 1x "${VAR_PV}..." w bundle, jest ${hits}`);
  process.exit(1);
}
code = code.replace(VAR_PV, 'const PLUGIN_VERSION = "');
fs.writeFileSync(path.join(OUT, "index.ts"), code, "utf8");
fs.copyFileSync(path.join(SRC, "plugin.json"), path.join(OUT, "plugin.json"));
console.log(`bundle OK -> build/arkmail/index.ts (${(code.length / 1024).toFixed(1)} kB)`);
