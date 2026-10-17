#!/usr/bin/env node
const fs   = require("fs");
const path = require("path");
const { execSync } = require("child_process");
const esbuild = require("esbuild");

const RELEASES = path.join(__dirname, "..", "releases");
const DIST     = path.join(__dirname, "..", "dist");
const TMP      = path.join(__dirname, "..", ".build_tmp");

fs.mkdirSync(DIST, { recursive: true });
fs.mkdirSync(TMP,  { recursive: true });

const zips = fs.readdirSync(RELEASES).filter(f => f.endsWith(".zip"));
if (!zips.length) {
    console.error("BLAD: brak zipow w releases/ — pustego dist/ nie wolno publikowac");
    process.exit(1);
}

// Wybor najnowszej wersji kazdego pluginu: sortowanie SEMANTYCZNE po numerze
// wersji z nazwy zipa (nie alfabetyczne - "1_8_20" > "1_8_15" mimo ze
// alfabetycznie odwrotnie). Budowany jest wylacznie najnowszy zip per plugin.
function splitZip(zip) {
    const m = zip.match(/^(.+?)_(\d+(?:_\d+)*)\.zip$/);
    if (!m) return null;
    return { name: m[1], ver: m[2].split("_").map(Number) };
}
function verCmp(a, b) {  // malejaco: nowsza wersja najpierw
    for (let i = 0; i < Math.max(a.length, b.length); i++) {
        const x = a[i] || 0, y = b[i] || 0;
        if (x !== y) return y - x;
    }
    return 0;
}
const latestByPlugin = {};
for (const zip of zips) {
    const parsed = splitZip(zip);
    if (!parsed) { console.error(`  POMINIETY (nieparsowalna nazwa): ${zip}`); continue; }
    const cur = latestByPlugin[parsed.name];
    if (!cur || verCmp(parsed.ver, splitZip(cur).ver) < 0) latestByPlugin[parsed.name] = zip;
}
const zipsToBuild = Object.values(latestByPlugin).sort();

(async () => {
    let ok = 0;
    const index = [];

    for (const zip of zipsToBuild) {
        const zipPath = path.join(RELEASES, zip);
        const pluginName = splitZip(zip).name;
        const tmpDir = path.join(TMP, pluginName);

        console.log(`\n[${pluginName}] Rozpakowuje ${zip}...`);
        fs.rmSync(tmpDir, { recursive: true, force: true });
        fs.mkdirSync(tmpDir, { recursive: true });
        try {
            execSync(`unzip -q "${zipPath}" -d "${tmpDir}"`);
        } catch (e) {
            console.error(`  POMINIETY (uszkodzony zip): ${zip}`);
            process.exitCode = 1;
            continue;
        }

        const tsFiles = execSync(`find "${tmpDir}" -name "index.ts"`, { encoding: "utf8" })
            .trim().split("\n").filter(Boolean);

        if (!tsFiles.length) {
            console.error(`  POMINIETY: brak index.ts`);
            continue;
        }

        const tsFile = tsFiles[0];
        const outFile = path.join(DIST, `${pluginName}.js`);
        console.log(`  Kompiluje: ${path.relative(tmpDir, tsFile)}`);

        try {
            const src = fs.readFileSync(tsFile, "utf8");

            // Guard spojnosci wersji: nazwa zipa == PLUGIN_VERSION ==
            // plugin.json metadata.version. Zle nazwany zip nie moze
            // wdrozyc sie po cichu - mismatch przerywa caly build.
            const zipVer = splitZip(zip).ver.join(".");
            const mPv = src.match(/const PLUGIN_VERSION = "([^"]+)"/);
            const pjVer = JSON.parse(fs.readFileSync(
                path.join(path.dirname(tsFile), "plugin.json"), "utf8")).metadata.version;
            if (!mPv || mPv[1] !== zipVer || pjVer !== zipVer) {
                console.error(`  BLAD: niespojnosc wersji w ${zip}: nazwa=${zipVer} PLUGIN_VERSION=${mPv && mPv[1]} plugin.json=${pjVer}`);
                process.exit(1);
            }

            const result = await esbuild.transform(src, {
                loader:  "ts",
                format:  "esm",
                target:  "es2020",
            });

            fs.writeFileSync(outFile, result.code, "utf8");
            const kb = (result.code.length / 1024).toFixed(1);
            console.log(`  OK -> dist/${pluginName}.js (${kb} kB)`);
            index.push({ name: pluginName, zip, file: `${pluginName}.js`, kb });
            ok++;
        } catch (e) {
            console.error(`  BLAD: ${e.message}`);
            process.exitCode = 1;
        }
    }

    fs.rmSync(TMP, { recursive: true, force: true });

    fs.writeFileSync(
        path.join(DIST, "index.json"),
        JSON.stringify({ built: new Date().toISOString(), plugins: index }, null, 2)
    );

    console.log(`\nGotowe: ${ok}/${zips.length} pluginow`);
    fs.readdirSync(DIST).forEach(f => console.log("  " + f));
})();
