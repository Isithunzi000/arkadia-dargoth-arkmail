#!/usr/bin/env node
/**
 * Release ArkMail: stamp daty builda -> bundle -> deterministyczny zip.
 * Uzycie: node scripts/release.mjs
 * Wersja z src/arkmail/meta.ts (PLUGIN_VERSION) - zip laduje w releases/.
 */
import { execSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const REPO = path.dirname(path.dirname(fileURLToPath(import.meta.url)));

const meta = fs.readFileSync(path.join(REPO, "src/arkmail/meta.ts"), "utf8");
const m = meta.match(/PLUGIN_VERSION = "([^"]+)"/);
if (!m) {
  console.error("BLAD: brak PLUGIN_VERSION w src/arkmail/meta.ts");
  process.exit(1);
}
const version = m[1];

// Fala 22b: stamp plugin.json (top-level version + metadata.version)
// z meta.ts. Idempotentne; format zachowany bajt w bajt (zweryfikowane).
const pjPath = path.join(REPO, "src/arkmail/plugin.json");
const pjSrc = fs.readFileSync(pjPath, "utf8");
const pj = JSON.parse(pjSrc);
pj.version = version;
pj.metadata.version = version;
const pjOut = JSON.stringify(pj, null, 2) + "\n";
if (pjOut !== pjSrc) {
  fs.writeFileSync(pjPath, pjOut);
  console.log(`stamp: plugin.json version -> ${version}`);
} else {
  console.log(`bez zmian: plugin.json (juz ${version})`);
}

execSync("python3 scripts/stamp_build_date.py", { cwd: REPO, stdio: "inherit" });
execSync("node scripts/bundle.mjs", { cwd: REPO, stdio: "inherit" });
execSync(`python3 scripts/make_release_zip.py build arkmail ${version}`, {
  cwd: REPO,
  stdio: "inherit",
});
console.log(`release OK: releases/arkmail_${version.replace(/\./g, "_")}.zip`);
