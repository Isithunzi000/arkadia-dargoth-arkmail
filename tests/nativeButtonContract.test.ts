/** Natywne przyciski bez konkurujacego catch-alla i bez wlasnych hoverow. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { STYLES } from '../src/arkmail/ui/styles';

const RENDER = readFileSync(
  join(__dirname, '..', '..', 'src', 'arkmail', 'ui', 'render.ts'),
  'utf-8',
);

test('przyciski: skrzynki maja native control i semantyke aria-pressed', () => {
  assert.match(RENDER, /btn\.className\s*=\s*'arkmail-box popup-btn popup-btn--control'\s*\+/);
  assert.match(RENDER, /btn\.setAttribute\('aria-pressed',\s*String\(state\.activeBox === box\)\)/);
});

test('przyciski: catch-all nie konkuruje z natywnymi klasami klienta', () => {
  assert.doesNotMatch(STYLES, /button:not\(\.popup-btn\):not\(\.dialog-tab\)/);
  assert.doesNotMatch(STYLES, /button:not\(\.popup-btn\):focus-visible/);
});

test('przyciski: skrzynki zachowuja ksztalt, a kolor aktywnej jest lokalny', () => {
  const base = STYLES.match(/\.arkmail-root\s+button\.arkmail-box(?![\w-])[^{]*\{([^}]*)\}/);
  assert.ok(base, 'regula ksztaltu skrzynki istnieje');
  assert.match(base![1]!, /border-radius/);
  assert.doesNotMatch(base![1]!, /background:|color:|border-color:/);
  assert.doesNotMatch(STYLES, /button\.arkmail-box:hover/);
  const active = STYLES.match(/\.arkmail-root\s+button\.arkmail-box-active(?![\w-])[^{]*\{([^}]*)\}/);
  assert.ok(active, 'regula aktywnej skrzynki istnieje');
  assert.match(active![1]!, /background:\s*var\(--arkmail-accent\)/);
  assert.match(active![1]!, /color:\s*var\(--arkmail-on-accent\)/);
});

test('przyciski: hover solid wygrywa specyficznoscia z natywnym filtrem klienta', () => {
  assert.match(
    STYLES,
    /\.arkmail-root\s+button\.popup-btn\.popup-btn--solid:hover:not\(:disabled\)/,
    'selektor odpowiada natywnemu .popup-btn.popup-btn--solid:hover:not(:disabled)',
  );
  const hover = STYLES.match(/\.arkmail-root\s+button\.popup-btn\.popup-btn--solid:hover:not\(:disabled\)[^{]*\{([^}]*)\}/);
  assert.ok(hover, 'regula hover solid istnieje');
  assert.match(hover![1]!, /filter:\s*none/);
});

test('przyciski: miniakcje maja wylacznie lokalny uklad, kolory daje klient', () => {
  const mini = STYLES.match(/\.arkmail-root\s+button\.arkmail-contact-dir,[^{]*\{([^}]*)\}/);
  assert.ok(mini, 'regula ukladu miniakcji istnieje');
  assert.match(mini![1]!, /font-size:/);
  assert.match(mini![1]!, /padding:/);
  assert.doesNotMatch(mini![1]!, /background:|color:|border:/);
  assert.doesNotMatch(STYLES, /button\.arkmail-contact-dir:hover/);
  assert.doesNotMatch(STYLES, /button\.arkmail-contact-addbook:hover/);
});
