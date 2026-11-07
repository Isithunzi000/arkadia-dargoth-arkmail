/**
 * Fala 30: cztery poziomy przyciskow, jedna akcja = jeden wyglad.
 *
 * Zgloszenie live 2026-10-31: przyciski "jakos wyroznione" bez systemu
 * - rozne obwodki i kolory na rozne sposoby w roznych zakladkach,
 * wszystko sie zlewalo, a "Wyczysc" bylo na czerwono jak "Usun".
 *
 * System poziomow (ta sama akcja = ten sam wyglad w kazdej zakladce):
 *  - primary: glowna akcja zakladki, max 1-2 (Szukaj/Odswiez,
 *    Wyslij, Zapisz ZIP);
 *  - action: dlugie flow (Indeksuj, Pobierz, Wyslij zwierze,
 *    Wczytaj starsze/wszystkie);
 *  - danger: kazde kasowanie/usuwanie danych - nieodwracalne (Usun)
 *    i odwracalne pobraniem od nowa (Wyczysc zapisane dane, Wyczysc
 *    filtry, Wyczysc [compose]) - jedna czerwona klasa, decyzja
 *    2026-11-02: szary reset zlewal sie z panelem i bylo niewidoczne;
 *  - reset: klasa pozostaje w styles.ts dla kompatybilnosci, zaden
 *    przycisk jej juz nie uzywa.
 *
 * Ten plik to dowod RED: klasy poziomow nie istnieja.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { Window } from 'happy-dom';

import { STYLES } from '../src/arkmail/ui/styles';
import { mountMailUi } from '../src/arkmail/ui/render';
import { MailUiStore } from '../src/arkmail/ui/store';
import type { MailboxEntry } from '../src/arkmail/core/session/mailbox';
import type { Contact } from '../src/arkmail/core/contacts';

const window = new Window();
const document = window.document;

function source(): MailboxEntry {
  return {
    number: 1,
    isRead: true,
    subject: 'Temat',
    forwarded: false,
    party: 'Foo',
    partyKind: 'nadawca',
    date: null,
  };
}

function withBox(store: MailUiStore): MailUiStore {
  store.applyMailbox('odebrane', {
    kind: 'lista',
    header: { box: 'odebrane', truncated: true },
    entries: [source()],
  });
  return store;
}

function openLetter(store: MailUiStore): MailUiStore {
  store.openLetter(
    'odebrane',
    { number: 1, from: 'Foo', subject: 'Temat', to: 'Bar', cc: null, date: null, body: ['Tresc'] },
    source(),
  );
  return store;
}

function withSearch(store: MailUiStore): MailUiStore {
  store.setSearch({ box: 'odebrane', label: 'temat: test' });
  return store;
}

function contact(): Contact {
  return {
    name: 'Bar',
    sources: ['korespondencja'],
    lettersReceived: 1,
    lettersSent: 0,
  };
}

function mount(store: MailUiStore) {
  const container = document.createElement('div');
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
  return container as unknown as { querySelector(s: string): unknown; querySelectorAll(s: string): unknown };
}

/** Oczekiwane klasy poziomow per przycisk (istniejaca klasa -> poziom). */
const TIERS: Array<{ tab: string; selector: string; tier: string }> = [
  { tab: 'listy', selector: '.arkmail-search-go', tier: 'popup-btn--solid' },
  { tab: 'listy', selector: '.arkmail-older-all', tier: 'popup-btn--control' },
  { tab: 'listy-full', selector: '.arkmail-older', tier: 'popup-btn--control' },
  { tab: 'listy', selector: '.arkmail-cache-clear', tier: 'popup-btn--danger' },
  { tab: 'listy', selector: '.arkmail-search-clear', tier: 'popup-btn--danger' },
  { tab: 'list', selector: '.arkmail-del', tier: 'popup-btn--danger' },
  { tab: 'napisz', selector: '.arkmail-send', tier: 'popup-btn--solid' },
  { tab: 'napisz', selector: '.arkmail-compose-clear', tier: 'popup-btn--danger' },
  // Fala UI-2 krok 4: przycisk indeksacji z bramy Kontaktow przeniesiony
  // do panelu Osoby w Archiwum - poziom ten sam, zakrywa wpis archiwum.
  { tab: 'archiwum', selector: '.arkmail-index-all', tier: 'popup-btn--control' },
  { tab: 'archiwum', selector: '.arkmail-arch-download', tier: 'popup-btn--control' },
  { tab: 'archiwum', selector: '.arkmail-arch-export', tier: 'popup-btn--solid' },
  { tab: 'archiwum', selector: '.arkmail-arch-clear', tier: 'popup-btn--danger' },
  { tab: 'usuwanie', selector: '.arkmail-deletion-search', tier: 'popup-btn--solid' },
  { tab: 'usuwanie', selector: '.arkmail-deletion-delete', tier: 'popup-btn--danger' },
  { tab: 'usuwanie', selector: '.arkmail-deletion-clear-filters', tier: 'popup-btn--danger' },
];

function mountedTabs(): Record<string, { querySelector(s: string): unknown; querySelectorAll(s: string): unknown }> {
  const kontakty = new MailUiStore({ tab: 'kontakty' });
  kontakty.setContacts([contact()]);
  return {
    // search-clear renderuje sie tylko w trybie wynikow szukania
    // (banner z zapytaniem) - fixture musi ten tryb aktywowac.
    listy: mount(withBox(withSearch(new MailUiStore()))),
    'listy-full': mount(withBox(new MailUiStore())),
    list: mount(openLetter(withBox(new MailUiStore()))),
    napisz: mount(new MailUiStore({ tab: 'napisz' })),
    kontakty: mount(kontakty),
    archiwum: mount(new MailUiStore({ tab: 'archiwum' })),
    usuwanie: mount(new MailUiStore({ tab: 'usuwanie' })),
  };
}

test('tiers: kazdy przycisk ma klase swojego poziomu', () => {
  const tabs = mountedTabs();
  const missing: string[] = [];
  for (const { tab, selector, tier } of TIERS) {
    const el = tabs[tab]!.querySelector(selector) as { className: string } | null;
    if (!el) {
      missing.push(`${tab} ${selector}: brak elementu`);
      continue;
    }
    if (!el.className.split(' ').includes(tier)) {
      missing.push(`${tab} ${selector}: brak klasy ${tier} (ma: ${el.className})`);
    }
  }
  assert.deepEqual(missing, [], 'wszystkie przyciski maja klasy poziomow');
});

test('tiers: primary max 2 na zakladke - wyroznienie nie zlewa sie', () => {
  const tabs = mountedTabs();
  for (const [name, container] of Object.entries(tabs)) {
    const primary = (container.querySelectorAll('.popup-btn--solid') as unknown as unknown[]).length;
    assert.ok(primary <= 2, `${name}: ${primary} primary > 2`);
  }
});

test('tiers: wszystkie przyciski czyszczenia dziela poziom danger z Usun', () => {
  const tabs = mountedTabs();
  for (const [tab, selector] of [
    ['listy', '.arkmail-cache-clear'],
    ['listy', '.arkmail-search-clear'],
    ['napisz', '.arkmail-compose-clear'],
    ['archiwum', '.arkmail-arch-clear'],
    ['usuwanie', '.arkmail-deletion-clear-filters'],
  ] as const) {
    const el = tabs[tab]!.querySelector(selector) as { className: string } | null;
    assert.ok(el, `${tab} ${selector} istnieje`);
    assert.ok(
      el.className.split(' ').includes('popup-btn--danger'),
      `${tab} ${selector} ma poziom danger`,
    );
  }
});

test('tiers: zero wlasnych regul poziomow - kolory i wyglad daje klient', () => {
  // Zgloszenie 2026-11-05 (A3): pelna migracja na natywne UI. Poziomy
  // to teraz klasy klienta (popup-btn--control/solid/danger/ghost) -
  // zero regul .arkmail-btn-* w styles.ts, zero przypisan tych klas
  // w render.ts. Kontrast i wyglad pilnuje motyw klienta.
  assert.doesNotMatch(STYLES, /\.arkmail-btn-(primary|action|danger|reset)\b/,
    'styles.ts bez wlasnych regul poziomow');
  const src = readFileSync(join(__dirname, '..', '..', 'src/arkmail/ui/render.ts'), 'utf8');
  assert.doesNotMatch(src, /className = '[^']*arkmail-btn-(primary|action|danger|reset)/,
    'render.ts bez przypisan starych klas poziomow');
});
