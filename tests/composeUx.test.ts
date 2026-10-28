/**
 * Fala 14b: UX kolejki niewyslanych (zgloszenia z sesji 2026-10-19).
 *
 * 1. Compose poza poczta ZAWSZE laduje w niewyslanych ("List jest
 *    gotowy do wyslania." - log: 4/4 compose w tej sesji) - przycisk
 *    "Wyslij" mylil, teraz "Zapisz w niewyslanych".
 * 2. Klawisz "Wyczysc" czysci pola compose (adresat/temat/dw/tresc);
 *    dwuklik z uzbrojeniem 3 s (wzorzec "Wyczysc pamiec podreczna").
 * 3. Po odlozeniu listu (compose "gotowy" albo Przekaz) klawisz
 *    zakladki Listy i skrzynki Niewyslane migaja (~3 s) - gracz widzi,
 *    gdzie list wyladowal.
 *
 * Fala 16e (zgloszenia 2026-10-19 pkt 1 i 12):
 * 4. Toast po zapisie brzmi "List zapisany w niewyslanych." (nie
 *    "odlozony");
 * 5. Po udanym zapisie/wyslaniu pola compose sie CZYSZCZA (sygnal
 *    store.clearCompose -> render czysci draft); bez wysylki pola
 *    zostaja.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Window } from 'happy-dom';

import { mountMailUi, type MailUiHandlers } from '../src/arkmail/ui/render';
import { MailUiStore } from '../src/arkmail/ui/store';
import {
  startHarness,
  stopHarness,
  click as hClick,
  notifyText,
  waitRt,
  type Harness,
} from './harness';

const window = new Window();
const document = window.document;

function mount(store: MailUiStore, handlers: Partial<MailUiHandlers> = {}) {
  const container = document.createElement('div');
  const calls: { name: string; args: unknown[] }[] = [];
  const rec =
    (name: string) =>
    (...args: unknown[]) =>
      calls.push({ name, args });
  const off = mountMailUi(container as unknown as HTMLElement, store, {
    onOpenLetter: rec('open'),
    onSendCompose: rec('send'),
    onCloseLetter: rec('close'),
    onRefreshBox: rec('refresh'),
    onLoadOlder: rec('older'),
    onLoadAll: rec('all'),
    onSearch: rec('search'),
    onClearSearch: rec('clear-search'),
    onDeleteLetter: rec('del'),
    onForwardLetter: rec('fwd'),
    ...handlers,
  });
  return { container, calls, off };
}

const click = (el: unknown) =>
  (el as { dispatchEvent(e: unknown): void }).dispatchEvent(new window.Event('click'));

test('compose: przycisk wysylki mowi prawde o kolejce niewyslanych', () => {
  const s = new MailUiStore({ tab: 'napisz' });
  const { container, off } = mount(s);
  const send = container.querySelector('.arkmail-send');
  assert.equal(send?.textContent, 'Zapisz w niewyslanych');
  off();
});

test('compose: Wyczysc z dwuklikiem czysci wszystkie pola listu', () => {
  const s = new MailUiStore({ tab: 'napisz' });
  const { container, off } = mount(s);
  const setVal = (f: string, v: string) => {
    const el = container.querySelector(`[data-field="${f}"]`) as unknown as HTMLInputElement;
    el.value = v;
    el.dispatchEvent(new window.Event('input') as unknown as Event);
  };
  setVal('adresat', 'Garply');
  setVal('temat', 'Perly');
  setVal('dw', 'Foo');
  setVal('tresc', 'tresc listu');

  const clear = container.querySelector('.arkmail-compose-clear');
  assert.ok(clear, 'przycisk Wyczysc istnieje');

  // Pierwszy klik: tylko uzbrojenie, pola nietkniete.
  click(clear);
  assert.equal(
    (container.querySelector('[data-field="adresat"]') as unknown as HTMLInputElement).value,
    'Garply',
    'pierwszy klik nie czysci',
  );
  assert.match(String(clear.textContent), /Na pewno/);

  // Drugi klik: wszystkie pola puste (domyslne szablon/szerokosc zostaja).
  click(clear);
  for (const f of ['adresat', 'temat', 'dw', 'tresc']) {
    assert.equal(
      (container.querySelector(`[data-field="${f}"]`) as unknown as HTMLInputElement).value,
      '',
      `pole ${f} wyczyszczone`,
    );
  }
  // Draft przezywa rerender - sprawdzamy, ze tez jest pusty.
  s.setTab('listy');
  s.setTab('napisz');
  assert.equal(
    (container.querySelector('[data-field="temat"]') as unknown as HTMLInputElement).value,
    '',
    'draft tematu pusty po rerenderze',
  );
  off();
});

test('flash niewyslanych: klasa na zakladce Listy i skrzynce Niewyslane', () => {
  const s = new MailUiStore();
  const { container, off } = mount(s);
  s.setUnsentFlash(true);
  const tab = container.querySelector('[data-tab="listy"]');
  const box = container.querySelector('[data-box="niewyslane"]');
  assert.ok(tab?.className.includes('arkmail-flash'), 'zakladka Listy miga');
  assert.ok(box?.className.includes('arkmail-flash'), 'skrzynka Niewyslane miga');
  s.setUnsentFlash(false);
  assert.ok(
    !container.querySelector('[data-tab="listy"]')?.className.includes('arkmail-flash'),
    'flash gasniety',
  );
  off();
});

test('compose gotowy -> flash niewyslanych zapala sie i gasnie po ~3 s', async () => {
  const h: Harness = await startHarness();
  const { f, waitFor, content } = h;
  try {
    // Formularz compose w popupie.
    hClick(h, '[data-tab="napisz"]');
    const setVal = (field: string, v: string) => {
      const el = content.querySelector(`[data-field="${field}"]`) as {
        value: string;
        dispatchEvent(e: unknown): void;
      };
      el.value = v;
      el.dispatchEvent(new h.window.Event('input'));
    };
    setVal('adresat', 'Gracz');
    setVal('temat', 'Test flash');
    setVal('tresc', 'czesc');
    hClick(h, '.arkmail-send');
    await waitFor(() => f.sent.includes('napisz list'), 'compose start');
    // Potwierdzenie promptow edytora -> flush tematu/dw/tresci + '**'.
    f.fire('Adresat: Temat: DW: ', 'mail');
    f.fire('Wpisz ~?, zeby uzyskac pomoc, lub **, by zakonczyc edycje.', 'mail');
    await waitFor(() => f.sent.includes('**'), 'tresc wyslana');
    // Wynik: list odlozony w niewyslanych.
    f.fire('List jest gotowy do wyslania.', 'mail');
    await waitFor(() => f.sent.includes('listy niewyslane'), 'refresh niewyslanych');
    f.fire('Nie masz zadnych niewyslanych listow.', 'mail');
    f.fire('> ', 'prompt');

    await waitFor(
      () =>
        String(
          (content.querySelector('[data-tab="listy"]') as { className?: string } | null)
            ?.className ?? '',
        ).includes('arkmail-flash'),
      'flash po odlozeniu listu',
    );
    await waitRt(
      () =>
        !String(
          (content.querySelector('[data-tab="listy"]') as { className?: string } | null)
            ?.className ?? '',
        ).includes('arkmail-flash'),
      'flash gasnie sam po ~3 s',
    );
  } finally {
    await stopHarness();
  }
});

test('compose: store.clearCompose czysci pola i draft (przez rerender)', () => {
  const s = new MailUiStore({ tab: 'napisz' });
  const { container, off } = mount(s);
  const setVal = (f: string, v: string) => {
    const el = container.querySelector(`[data-field="${f}"]`) as unknown as HTMLInputElement;
    el.value = v;
    el.dispatchEvent(new window.Event('input') as unknown as Event);
  };
  setVal('adresat', 'Garply');
  setVal('temat', 'Perly');
  setVal('tresc', 'tresc listu');

  s.clearCompose();
  for (const f of ['adresat', 'temat', 'dw', 'tresc']) {
    assert.equal(
      (container.querySelector(`[data-field="${f}"]`) as unknown as HTMLInputElement).value,
      '',
      `pole ${f} wyczyszczone`,
    );
  }
  // Draft tez pusty - rerender nie przywraca starych wartosci.
  s.setTab('listy');
  s.setTab('napisz');
  assert.equal(
    (container.querySelector('[data-field="adresat"]') as unknown as HTMLInputElement).value,
    '',
    'draft adresata pusty po rerenderze',
  );
  off();
});

test('compose: po zapisie w niewyslanych toast "zapisany" i pola czyszczone', async () => {
  const h: Harness = await startHarness();
  const { f, waitFor, content } = h;
  try {
    hClick(h, '[data-tab="napisz"]');
    const setVal = (field: string, v: string) => {
      const el = content.querySelector(`[data-field="${field}"]`) as {
        value: string;
        dispatchEvent(e: unknown): void;
      };
      el.value = v;
      el.dispatchEvent(new h.window.Event('input'));
    };
    setVal('adresat', 'Gracz');
    setVal('temat', 'Test zapisu');
    setVal('tresc', 'czesc');
    hClick(h, '.arkmail-send');
    await waitFor(() => f.sent.includes('napisz list'), 'compose start');
    f.fire('Adresat: Temat: DW: ', 'mail');
    f.fire('Wpisz ~?, zeby uzyskac pomoc, lub **, by zakonczyc edycje.', 'mail');
    await waitFor(() => f.sent.includes('**'), 'tresc wyslana');
    f.fire('List jest gotowy do wyslania.', 'mail');
    await waitFor(() => f.sent.includes('listy niewyslane'), 'refresh niewyslanych');
    f.fire('Nie masz zadnych niewyslanych listow.', 'mail');
    f.fire('> ', 'prompt');

    await waitFor(
      () => notifyText(f, 'List zapisany w niewyslanych.'),
      'toast o zapisie (nie "odlozony")',
    );
    assert.ok(!notifyText(f, 'odlozony'), 'stary string zniknal');
    await waitFor(
      () =>
        (content.querySelector('[data-field="adresat"]') as { value: string } | null)
          ?.value === '',
      'pole adresata wyczyszczone po zapisie',
    );
    assert.equal(
      (content.querySelector('[data-field="temat"]') as { value: string } | null)?.value,
      '',
      'pole tematu wyczyszczone',
    );
    assert.equal(
      (content.querySelector('[data-field="tresc"]') as { value: string } | null)?.value,
      '',
      'pole tresci wyczyszczone',
    );
  } finally {
    await stopHarness();
  }
});
