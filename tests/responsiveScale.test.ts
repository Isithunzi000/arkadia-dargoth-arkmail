/** Skala czcionki i zwijanie ukladu bez utraty kontrolek lub tresci. */
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { shouldUseWideLayout } from '../src/arkmail/index';
import { STYLES } from '../src/arkmail/ui/styles';

function body(selector: RegExp): string {
  const match = STYLES.match(new RegExp(`${selector.source}[^{]*\\{([^}]*)\\}`, 'm'));
  assert.ok(match, `regula ${selector.source} istnieje`);
  return match[1]!;
}

test('skala: prog wide uzywa efektywnej szerokosci 900px', () => {
  assert.equal(shouldUseWideLayout(899, 1), false);
  assert.equal(shouldUseWideLayout(900, 1), true);
  assert.equal(shouldUseWideLayout(1000, 3), false);
  assert.equal(shouldUseWideLayout(2699, 3), false);
  assert.equal(shouldUseWideLayout(2700, 3), true);
  assert.equal(shouldUseWideLayout(269, 0.3), false);
  assert.equal(shouldUseWideLayout(270, 0.3), true);
  assert.equal(shouldUseWideLayout(1000, 3.4), false);
});

test('skala: niepoprawna wartosc wraca bezpiecznie do skali 1', () => {
  for (const scale of [0, -1, Number.NaN, Number.POSITIVE_INFINITY]) {
    assert.equal(shouldUseWideLayout(899, scale), false);
    assert.equal(shouldUseWideLayout(900, scale), true);
  }
});

test('skala: piec zakladek zawija sie zamiast znikac w poziomym scrollu', () => {
  const tabs = body(/\.arkmail-root\s+\.arkmail-tabs\.dialog-tabs(?![\w-])/);
  assert.match(tabs, /align-self:\s*stretch/, 'belka nie kurczy sie do szerokosci jednej zakladki');
  assert.match(tabs, /width:\s*100%/, 'belka wypelnia dostepna szerokosc roota');
  assert.match(tabs, /flex-wrap:\s*wrap/);
  assert.match(tabs, /overflow-x:\s*visible/);
  const tab = body(/\.arkmail-root\s+\.arkmail-tabs\s+\.arkmail-tab(?![\w-])/);
  assert.match(tab, /flex:\s*1\s+1\s+calc\(/);
  assert.match(tab, /height:\s*auto/);
  assert.match(tab, /min-height:\s*calc\(/);
  assert.match(tab, /white-space:\s*normal/);
  assert.match(tab, /overflow-wrap:\s*anywhere/);
});

test('skala: stopka i pasek statusu zawijaja sie bez przycinania', () => {
  const status = body(/\.arkmail-status(?![\w-])/);
  assert.match(status, /flex-wrap:\s*wrap/);
  const footer = body(/\.arkmail-version-footer(?![\w-])/);
  assert.match(footer, /min-width:\s*0/);
  assert.match(footer, /overflow-wrap:\s*anywhere/);
});

test('skala: waskie wiersze list i Archiwum zawijaja dlugie dane', () => {
  const entry = body(/\.arkmail-root:not\(\.arkmail-wide\)\s+\.arkmail-entry(?![\w-])/);
  assert.match(entry, /flex-wrap:\s*wrap/);
  const party = body(/\.arkmail-root:not\(\.arkmail-wide\)\s+\.arkmail-entry-party(?![\w-])/);
  assert.match(party, /min-width:\s*0/);
  const subject = body(/\.arkmail-root:not\(\.arkmail-wide\)\s+\.arkmail-entry-subject(?![\w-])/);
  assert.match(subject, /white-space:\s*normal/);
  assert.match(subject, /overflow-wrap:\s*anywhere/);
  const date = body(/\.arkmail-root:not\(\.arkmail-wide\)\s+\.arkmail-entry-date(?![\w-])/);
  assert.match(date, /white-space:\s*normal/);
  const archiveDate = body(/\.arkmail-root:not\(\.arkmail-wide\)\s+\.arkmail-arch-date(?![\w-])/);
  assert.match(archiveDate, /white-space:\s*normal/);
  assert.match(archiveDate, /overflow-wrap:\s*anywhere/);
});

test('skala: etykiety, podglad listu i pasek podgladu nie nachodza na siebie', () => {
  const label = body(/\.arkmail-form label(?![\w-])/);
  assert.match(label, /min-width:\s*0/);
  assert.match(label, /overflow-wrap:\s*anywhere/);
  const letter = body(/\.arkmail-letter-body(?![\w-])/);
  assert.match(letter, /overflow-wrap:\s*anywhere/);
  const previewBar = body(/\.arkmail-preview-bar(?![\w-])/);
  assert.match(previewBar, /flex-wrap:\s*wrap/);
});

test('skala: brak wysokosci przewija caly panel zamiast scisnac liste do zera', () => {
  const pane = body(/\.arkmail-listy(?![\w-])/);
  assert.match(pane, /overflow:\s*auto/, 'skrajny uklad moze przewinac naglowek i liste razem');
  const list = body(/^\.arkmail-list-scroll(?![\w-])/);
  assert.match(list, /flex:\s*1\s+0\s+calc\(96px \* var\(--window-font-scale, 1\)\)/);
  assert.match(list, /min-height:\s*calc\(96px \* var\(--window-font-scale, 1\)\)/);
});
