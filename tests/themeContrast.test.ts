/**
 * Lokalny kontrakt kolorow ArkMaila. Motyw klienta jest zrodlem tokenow,
 * ale bezpieczne role tekstu i kontrolek naleza do .arkmail-root.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { STYLES } from '../src/arkmail/ui/styles';
import {
  compositeOver,
  contrastRatio,
  parseCssColor,
} from '../src/arkmail/ui/themeColors';

const SOURCE = readFileSync(
  join(__dirname, '..', '..', 'src', 'arkmail', 'ui', 'styles.ts'),
  'utf-8',
);

function rootBody(): string {
  const m = STYLES.match(/\.arkmail-root\s*\{([^}]*)\}/);
  assert.ok(m, 'regula .arkmail-root istnieje');
  return m[1]!;
}

function ruleBody(selector: RegExp): string {
  const m = STYLES.match(new RegExp(`${selector.source}[^{]*\\{([^}]*)\\}`, 'm'));
  assert.ok(m, `regula ${selector.source} istnieje`);
  return m[1]!;
}

test('motyw: root definiuje wlasne role i nie nadpisuje tokenow klienta', () => {
  const root = rootBody();
  for (const token of [
    '--arkmail-bg',
    '--arkmail-panel-bg',
    '--arkmail-text',
    '--arkmail-secondary',
    '--arkmail-placeholder',
    '--arkmail-accent',
    '--arkmail-on-accent',
    '--arkmail-danger-text',
    '--arkmail-control-border',
    '--arkmail-unread-marker',
    '--arkmail-focus',
  ]) {
    assert.match(root, new RegExp(`${token}\\s*:`), `${token} jest zdefiniowany lokalnie`);
  }
  assert.doesNotMatch(STYLES, /--popup-[\w-]+\s*:/, 'plugin nie nadpisuje tokenow --popup-*');
  assert.match(root, /--arkmail-secondary:\s*color-mix\(in oklab,\s*var\(--popup-text\) 95%,\s*transparent\)/);
  assert.match(root, /--arkmail-placeholder:\s*color-mix\(in oklab,\s*var\(--popup-text\) 95%,\s*transparent\)/);
  assert.match(root, /--arkmail-danger-text:\s*color-mix\(in oklab,\s*var\(--popup-danger\) 60%,\s*var\(--popup-text\) 40%\)/);
  assert.match(root, /--arkmail-control-border:\s*color-mix\(in oklab,\s*var\(--popup-text\) 60%,\s*transparent\)/);
  assert.match(root, /--arkmail-unread-marker:\s*color-mix\(in oklab,\s*var\(--popup-accent\) 60%,\s*var\(--popup-text\) 40%\)/);
});

test('motyw: role drugoplanowe osiagaja 4.5:1 na zmierzonych tlach motywow', () => {
  const root = rootBody();
  const secondary = root.match(/--arkmail-secondary:\s*color-mix\(in oklab,\s*var\(--popup-text\) (\d+)%,\s*transparent\)/);
  const placeholder = root.match(/--arkmail-placeholder:\s*color-mix\(in oklab,\s*var\(--popup-text\) (\d+)%,\s*transparent\)/);
  assert.ok(secondary, 'udzial tekstu drugoplanowego jest znany');
  assert.ok(placeholder, 'udzial placeholdera jest znany');
  assert.equal(placeholder![1], secondary![1], 'obie role maja ten sam poziom kontrastu');
  const opacity = Number(secondary![1]) / 100;
  const cases = [
    {
      label: 'Gray',
      foreground: 'oklab(0.883393 0.00156382 -0.00519639)',
      backgrounds: ['rgb(28 29 31)', 'rgb(30 30 32)'],
    },
    {
      label: 'Dark Neutral',
      foreground: 'oklab(0.906695 0.0000413954 0.0000181794)',
      backgrounds: ['rgb(47 47 47)', 'rgb(45 45 45)'],
    },
    {
      label: 'Kuznia',
      foreground: 'oklab(0.808891 0.00394112 0.0410014)',
      backgrounds: ['rgb(14 14 12)', 'rgb(17 17 16)', 'rgb(25 25 22)', 'rgb(21 21 20)'],
    },
  ];
  for (const item of cases) {
    const parsed = parseCssColor(item.foreground);
    assert.ok(parsed, `${item.label}: kolor tekstu jest parsowalny`);
    const foreground = { ...parsed!, a: opacity };
    for (const backgroundValue of item.backgrounds) {
      const background = parseCssColor(backgroundValue);
      assert.ok(background, `${item.label}: tlo jest parsowalne`);
      const ratio = contrastRatio(compositeOver(foreground, background!), background!);
      assert.ok(ratio >= 4.5, `${item.label} ${backgroundValue}: ${ratio}:1`);
    }
  }
});

test('motyw: natywne przyciski solid i aktywne zakladki uzywaja on-accent', () => {
  const solid = ruleBody(/\.arkmail-root\s+button\.popup-btn--solid(?![\w-])/);
  assert.match(solid, /background:\s*var\(--arkmail-accent\)/);
  assert.match(solid, /color:\s*var\(--arkmail-on-accent\)/);
  assert.match(solid, /filter:\s*none/, 'hover nie zmienia zmierzonego akcentu');
  const tab = ruleBody(/\.arkmail-root\s+\.dialog-tab\.is-active(?![\w-])/);
  assert.match(tab, /background:\s*var\(--arkmail-accent\)/);
  assert.match(tab, /color:\s*var\(--arkmail-on-accent\)/);
});

test('motyw: uzbrojony danger ma bezpieczny tekst i jednoznaczny kontur', () => {
  const armed = ruleBody(/\.arkmail-root\s+button\.popup-btn--danger\[data-armed="1"\]/);
  assert.match(armed, /color:\s*var\(--arkmail-danger-text\)/);
  assert.match(armed, /border-color:\s*var\(--arkmail-danger-text\)/);
  assert.match(armed, /outline:[^;]*var\(--arkmail-danger-text\)/);
});

test('motyw: placeholder i focus maja lokalne role o kontrolowanym kontrascie', () => {
  const placeholder = ruleBody(/\.arkmail-root\s+\.popup-input::placeholder/);
  assert.match(placeholder, /color:\s*var\(--arkmail-placeholder\)/);
  assert.match(placeholder, /opacity:\s*1/);
  const focus = ruleBody(/\.arkmail-root\s+:is\([^{]*\):focus-visible/);
  assert.match(focus, /outline:[^;]*var\(--arkmail-focus\)/);
});

test('motyw: select ma wlasna strzalke zamiast szarej strzalki klienta', () => {
  const select = ruleBody(/\.arkmail-root\s+select\.popup-input(?![\w-])/);
  assert.match(select, /appearance:\s*none/);
  assert.match(select, /background-image:[\s\S]*var\(--arkmail-secondary\)/);
  assert.match(select, /background-repeat:\s*no-repeat/);
});

test('motyw: znaczniki nieprzeczytanych i ostrzezen nie uzywaja surowego akcentu', () => {
  const unread = ruleBody(/\.arkmail-unread(?![\w-])/);
  assert.match(unread, /box-shadow:[^;]*var\(--arkmail-unread-marker\)/);
  const dot = ruleBody(/\.arkmail-unread::before/);
  assert.match(dot, /background:\s*var\(--arkmail-unread-marker\)/);
  const warning = ruleBody(/\.arkmail-step-warning,\s*\.arkmail-step-incomplete/);
  assert.match(warning, /border-left-color:\s*var\(--arkmail-control-border\)/);
});

test('motyw: natywne kontrolki maja obwodke o kontrolowanym kontrascie', () => {
  const controls = ruleBody(/\.arkmail-root\s+button\.popup-btn--control:not\(\.popup-btn--ghost\),/);
  assert.match(controls, /border-color:\s*var\(--arkmail-control-border\)/);
  const track = ruleBody(/\.arkmail-root\s+\.dialog-tabs(?![\w-])/);
  assert.match(track, /border-color:\s*var\(--arkmail-control-border\)/);
});

test('motyw: style komponentow uzywaja rol ArkMaila, nie globalnych rol tekstu', () => {
  assert.doesNotMatch(SOURCE, /const FG_DIM = 'var\(--popup-text-dim\)'/);
  assert.doesNotMatch(SOURCE, /const ACCENT_FG = 'var\(--popup-bg\)'/);
  assert.doesNotMatch(SOURCE, /const DANGER_TEXT = 'var\(--popup-danger\)'/);
});
