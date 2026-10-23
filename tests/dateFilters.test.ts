/**
 * Filtry dat w UI (Fala 30a, zgloszenie 2026-10-23):
 *  - szukajka: "Od dnia" i "Do dnia" obok siebie (lewo-prawo), Tresc na
 *    calej szerokosci nad nimi; pola dat maja WIDOCZNE etykiety
 *    "(wlacznie)" i tooltipy (placeholder na input[type=date] jest
 *    ignorowany przez przegladarke - pole bylo anonimowe);
 *  - szukajka: Od dnia pozniej niz Do dnia = twardy guard z komunikatem
 *    na przycisku (3 s), bez strzalu do serwera;
 *  - archiwum: te same etykiety i tooltipy; Od > Do = komunikat
 *    i pominiecie filtrow dat (filtr lokalny, bez przycisku Szukaj).
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Window } from 'happy-dom';

import { mountMailUi, type MailUiHandlers } from '../src/arkmail/ui/render';
import { MailUiStore } from '../src/arkmail/ui/store';
import type { ArchiveLetter } from '../src/arkmail/core/archive';
import { waitRt } from './harness';

const window = new Window();
const document = window.document;

function mount(store: MailUiStore, handlers?: Partial<MailUiHandlers>) {
  const container = document.createElement('div');
  const off = mountMailUi(
    container as unknown as HTMLElement,
    store,
    (handlers ?? {}) as unknown as MailUiHandlers,
  );
  return { container, off };
}

const setVal = (el: unknown, v: string) => {
  const input = el as { value: string; dispatchEvent(e: unknown): void };
  input.value = v;
  input.dispatchEvent(new window.Event('input', { bubbles: true }));
};

const letter = (over: Partial<ArchiveLetter>): ArchiveLetter => ({
  id: 'x',
  box: 'odebrane',
  number: 1,
  party: 'Foo',
  subject: 'Temat',
  forwarded: false,
  dateRaw: null,
  sortKey: '2026-10-20 10:00:00',
  read: true,
  body: [],
  ...over,
});

test('szukajka: pola dat maja widoczne etykiety "(wlacznie)" i tooltipy', () => {
  const s = new MailUiStore();
  const { container, off } = mount(s);
  const od = container.querySelector('[data-search="odDaty"]') as unknown as {
    title: string; closest(sel: string): { querySelector(sel: string): { textContent: string } | null } | null;
  } | null;
  const doo = container.querySelector('[data-search="doDaty"]') as unknown as typeof od;
  assert.ok(od && doo, 'pola dat szukajki istnieja');
  const odField = od.closest('.arkmail-date-field');
  const doField = doo.closest('.arkmail-date-field');
  assert.ok(odField && doField, 'pola dat owinniete w pole z etykieta');
  assert.equal(odField.querySelector('.arkmail-date-label')?.textContent, 'Od dnia (wlacznie)');
  assert.equal(doField.querySelector('.arkmail-date-label')?.textContent, 'Do dnia (wlacznie)');
  assert.match(od.title, /wlacznie/i, 'tooltip Od wyjasnia wlacznosc');
  assert.match(doo!.title, /wlacznie/i, 'tooltip Do wyjasnia wlacznosc');
  off();
});

test('szukajka: Od i Do obok siebie (lewo-prawo), Tresc pelna szerokosc', () => {
  const s = new MailUiStore();
  const { container, off } = mount(s);
  const row = container.querySelector('.arkmail-search-row')!;
  const kids = [...row.children] as unknown as { classList: { contains(c: string): boolean }; querySelector(sel: string): unknown }[];
  const isOd = (el: (typeof kids)[number]) => !!el.querySelector('[data-search="odDaty"]');
  const isDo = (el: (typeof kids)[number]) => !!el.querySelector('[data-search="doDaty"]');
  const iOd = kids.findIndex(isOd);
  const iDo = kids.findIndex(isDo);
  assert.ok(iOd >= 0 && iDo >= 0, 'oba pola w rzedzie szukajki');
  assert.equal(iDo, iOd + 1, 'Do dnia bezposrednio po Od dnia (ten sam rzad siatki)');
  const tresc = container.querySelector('[data-search="tresc"]') as unknown as {
    classList: { contains(c: string): boolean };
  };
  assert.ok(tresc.classList.contains('arkmail-search-wide'), 'Tresc pelna szerokosc');
  off();
});

test('szukajka: Od pozniej niz Do blokuje szukanie z komunikatem (3 s)', async () => {
  const s = new MailUiStore();
  const calls: unknown[] = [];
  const { container, off } = mount(s, { onSearch: (...a: unknown[]) => calls.push(a) });
  setVal(container.querySelector('[data-search="odDaty"]'), '2026-10-20');
  setVal(container.querySelector('[data-search="doDaty"]'), '2026-10-10');
  const go = container.querySelector('.arkmail-search-go') as unknown as {
    textContent: string; click(): void;
  };
  go.click();
  assert.equal(calls.length, 0, 'sprzeczne daty nie strzelaja do serwera');
  assert.equal(go.textContent, 'Od dnia pozniej niz Do dnia.', 'komunikat na przycisku');
  go.click();
  assert.equal(calls.length, 0, 'drugi klik tez zablokowany');
  await waitRt(() => go.textContent === 'Szukaj', 'etykieta wrocila po 3 s');
  setVal(container.querySelector('[data-search="doDaty"]'), '2026-10-25');
  go.click();
  assert.equal(calls.length, 1, 'po korekcie dat szukanie dziala');
  off();
});

test('archiwum: pola dat z etykietami "(wlacznie)" i tooltipami', () => {
  const s = new MailUiStore({ tab: 'archiwum' });
  const { container, off } = mount(s);
  const od = container.querySelector('[data-filter="odDaty"]') as unknown as {
    title: string; closest(sel: string): { querySelector(sel: string): { textContent: string } | null } | null;
  } | null;
  const doo = container.querySelector('[data-filter="doDaty"]') as unknown as typeof od;
  assert.ok(od && doo, 'pola dat archiwum istnieja');
  assert.equal(od.closest('.arkmail-date-field')?.querySelector('.arkmail-date-label')?.textContent, 'Od dnia (wlacznie)');
  assert.equal(doo!.closest('.arkmail-date-field')?.querySelector('.arkmail-date-label')?.textContent, 'Do dnia (wlacznie)');
  assert.match(od.title, /wlacznie/i);
  assert.match(doo!.title, /wlacznie/i);
  off();
});

test('archiwum: Od pozniej niz Do = komunikat i pominiecie filtrow dat', async () => {
  const s = new MailUiStore({ tab: 'archiwum' });
  s.setArchive([
    letter({ id: 'a', party: 'Foo', subject: 'Pierwszy', sortKey: '2026-10-05 10:00:00' }),
    letter({ id: 'b', party: 'Bar', subject: 'Drugi', sortKey: '2026-10-22 10:00:00' }),
  ]);
  const { container, off } = mount(s);
  const rowsCount = () => container.querySelectorAll('.arkmail-arch-entry').length;
  await waitRt(() => rowsCount() === 2, 'dwa wpisy bez filtrow');
  setVal(container.querySelector('[data-filter="odDaty"]'), '2026-10-20');
  setVal(container.querySelector('[data-filter="doDaty"]'), '2026-10-10');
  await waitRt(
    () => !!container.querySelector('.arkmail-dates-error'),
    'komunikat o sprzecznych datach',
  );
  assert.equal(rowsCount(), 2, 'sprzeczne daty nie filtruja listy');
  setVal(container.querySelector('[data-filter="doDaty"]'), '2026-10-25');
  await waitRt(() => !container.querySelector('.arkmail-dates-error'), 'komunikat zniknal');
  assert.equal(rowsCount(), 1, 'po korekcie filtr dat dziala (tylko pozniejszy wpis)');
  off();
});
