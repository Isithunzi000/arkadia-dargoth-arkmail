/**
 * Pelnoekranowy podglad compose (Fala 12d).
 *
 * Problem: podglad przy tworzeniu listu byl obciety (max-height 220px,
 * waska kolumna) - wybrany szablon pergaminu byl niewidoczny.
 *
 * Nowy kontrakt:
 *  - w trybie wide podglad w prawym panelu rozciaga sie na PELNA
 *    wysokosc panelu (style: flex + max-height:none);
 *  - przycisk "Pelne okno" (oba tryby: waski i wide) otwiera podglad
 *    na cale okno popupu - pre w naturalnym rozmiarze, bez obcinania;
 *  - "Zamknij podglad" wraca do formularza z ZACHOWANA trescia;
 *  - zmiana zakladki zamyka pelny podglad (powrot do napisz = formularz).
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Window } from 'happy-dom';

import { mountMailUi } from '../src/arkmail/ui/render';
import { MailUiStore } from '../src/arkmail/ui/store';
import { STYLES } from '../src/arkmail/ui/styles';

const window = new Window();
const document = window.document;

function mount(store: MailUiStore) {
  const container = document.createElement('div');
  document.body.appendChild(container);
  mountMailUi(container as unknown as HTMLElement, store, {
    onOpenLetter: () => {},
    onSendCompose: () => {},
    onCloseLetter: () => {},
    onRefreshBox: () => {},
    onLoadOlder: () => {},
    onLoadAll: () => {},
    onSearch: () => {},
    onClearSearch: () => {},
    onDeleteLetter: () => {},
    onForwardLetter: () => {},
  });
  return container;
}

const q = (c: unknown, sel: string): HTMLElement | null =>
  (c as { querySelector(s: string): unknown }).querySelector(sel) as HTMLElement | null;

const clickEl = (el: HTMLElement): void => {
  el.dispatchEvent(new window.Event('click') as unknown as Event);
};

const typeTresc = (c: unknown, text: string): void => {
  const tresc = q(c, '[data-field="tresc"]') as HTMLTextAreaElement;
  tresc.value = text;
  tresc.dispatchEvent(new window.Event('input') as unknown as Event);
};

test('compose wide: Pelne okno otwiera podglad na caly popup', () => {
  const s = new MailUiStore({ tab: 'napisz', wide: true });
  const c = mount(s);
  typeTresc(c, 'Ala ma kota');
  const open = q(c, '.arkmail-preview-open');
  assert.ok(open, 'przycisk Pelne okno w panelu podgladu');
  clickEl(open!);
  const full = q(c, '[data-pane-key="napisz:podglad-full"]');
  assert.ok(full, 'overlay pelnego podgladu');
  assert.match(
    q(full!, '.arkmail-preview')!.textContent ?? '',
    /Ala ma kota/,
    'pelny podglad pokazuje biezaca tresc',
  );
  assert.equal(q(c, '[data-field="adresat"]'), null, 'formularz schowany pod overlay');
});

test('compose waski: Pelne okno tez otwiera podglad na caly popup', () => {
  const s = new MailUiStore({ tab: 'napisz' });
  const c = mount(s);
  typeTresc(c, 'Kot ma Ale');
  const open = q(c, '.arkmail-preview-open');
  assert.ok(open, 'przycisk Pelne okno pod forma (waski)');
  clickEl(open!);
  const full = q(c, '[data-pane-key="napisz:podglad-full"]');
  assert.ok(full, 'overlay pelnego podgladu (waski)');
  assert.match(q(full!, '.arkmail-preview')!.textContent ?? '', /Kot ma Ale/);
});

test('compose: Zamknij podglad wraca do formularza z zachowana trescia', () => {
  const s = new MailUiStore({ tab: 'napisz', wide: true });
  const c = mount(s);
  typeTresc(c, 'Nie gub mnie');
  clickEl(q(c, '.arkmail-preview-open')!);
  const close = q(c, '.arkmail-preview-close');
  assert.ok(close, 'przycisk Zamknij podglad');
  clickEl(close!);
  assert.equal(q(c, '[data-pane-key="napisz:podglad-full"]'), null, 'overlay zamkniety');
  const tresc = q(c, '[data-field="tresc"]') as HTMLTextAreaElement;
  assert.ok(tresc, 'formularz z powrotem');
  assert.equal(tresc.value, 'Nie gub mnie', 'tresc zachowana po powrocie');
});

test('compose: zmiana zakladki zamyka pelny podglad', () => {
  const s = new MailUiStore({ tab: 'napisz', wide: true });
  const c = mount(s);
  clickEl(q(c, '.arkmail-preview-open')!);
  assert.ok(q(c, '[data-pane-key="napisz:podglad-full"]'), 'overlay otwarty');
  s.setTab('listy');
  assert.equal(q(c, '[data-pane-key="napisz:podglad-full"]'), null, 'overlay znika z zakladka');
  s.setTab('napisz');
  assert.equal(
    q(c, '[data-pane-key="napisz:podglad-full"]'),
    null,
    'powrot do napisz = formularz, nie overlay',
  );
  assert.ok(q(c, '[data-field="adresat"]'), 'formularz widoczny');
});

test('compose: style - podglad bez obcinania (split i pelne okno)', () => {
  assert.match(
    STYLES,
    /\.arkmail-split-compose \.arkmail-preview\s*{[^}]*max-height:\s*none/,
    'podglad w split: max-height none (pelna wysokosc panelu)',
  );
  assert.match(
    STYLES,
    /\.arkmail-preview-full-pane \.arkmail-preview\s*{[^}]*max-height:\s*none/,
    'pelne okno: max-height none',
  );
  assert.match(
    STYLES,
    /\.arkmail-preview-full-pane\s*{[^}]*display:\s*flex/,
    'pelne okno: pane flex (pre rozciaga sie)',
  );
});
