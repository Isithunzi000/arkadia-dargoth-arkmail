import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';

const source = readFileSync(new URL('../src/arkmail/ui/styles.ts', import.meta.url), 'utf8');

test('pola dat: jedna wspolna regula dziedziczy schemat motywu', () => {
  assert.doesNotMatch(source, /color-scheme:\s*light\s+dark/, 'bez wymuszonego schematu systemu');
  assert.match(
    source,
    /\.arkmail-root\s+input\[type='date'\]\s*\{\s*color-scheme:\s*inherit;\s*\}/,
    'wszystkie szesc pol dziedziczy schemat klienta',
  );
});

function chromium() {
  const candidates = [
    process.env.CHROME_BIN,
    'chromium',
    'chromium-browser',
    'google-chrome',
    'google-chrome-stable',
  ].filter(Boolean);
  for (const candidate of candidates) {
    const probe = spawnSync(candidate, ['--version'], { encoding: 'utf8' });
    if (!probe.error && probe.status === 0) return candidate;
  }
  assert.fail('Brak prawdziwego Chromium; ustaw CHROME_BIN.');
}

test('Chromium: szesc pol dat dziedziczy motyw w czterech kombinacjach', { timeout: 30000 }, () => {
  const css = [...source.matchAll(/[^{}]+\{[^{}]*color-scheme[^{}]*\}/g)]
    .map((match) => match[0])
    .join('\n');
  assert.ok(css.includes('color-scheme'), 'test obejmuje rzeczywiste reguly pol dat');
  const dir = mkdtempSync(join(tmpdir(), 'arkmail-date-scheme-'));
  try {
    for (const system of ['light', 'dark']) {
      for (const client of ['light', 'dark']) {
        const html = `<!doctype html><html style="color-scheme:${system}"><body><main class="arkmail-root" style="color-scheme:${client}">
          <div class="arkmail-search-row"><input id="s1" type="date" data-search="odDaty"><input id="s2" type="date" data-search="doDaty"></div>
          <div class="arkmail-arch-controls"><input id="a1" type="date" data-filter="odDaty"><input id="a2" type="date" data-filter="doDaty"></div>
          <input id="d1" type="date" data-deletion-filter="odDaty"><input id="d2" type="date" data-deletion-filter="doDaty">
          <style>${css}</style><script>document.body.dataset.result=JSON.stringify(['s1','s2','a1','a2','d1','d2'].map(id=>getComputedStyle(document.getElementById(id)).colorScheme));</script>
        </main></body></html>`;
        const file = join(dir, `${system}-${client}.html`);
        writeFileSync(file, html);
        const run = spawnSync(chromium(), [
          '--headless', '--no-sandbox', '--disable-gpu', '--disable-dev-shm-usage',
          '--dump-dom', `file://${file}`,
        ], { encoding: 'utf8', timeout: 15000 });
        assert.equal(run.status, 0, `Chromium ${system}/${client}: ${run.stderr}`);
        const match = run.stdout.match(/data-result="([^"]+)"/);
        assert.ok(match, `Chromium zwrocilo wynik ${system}/${client}`);
        const actual = JSON.parse(match[1].replaceAll('&quot;', '"'));
        assert.deepEqual(actual, Array(6).fill(client), `system ${system}, klient ${client}`);
      }
    }
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
