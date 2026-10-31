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
 *  - danger: WY LacZNIE destrukcja nieodwracalna (Usun);
 *  - reset: czyszczenie formularzy/filtrow/cache (Wyczysc filtry,
 *    Wyczysc [compose], Wyczysc zapisane dane) - z czerwieni do dim.
 *
 * Ten plik to dowod RED: klasy poziomow nie istnieja.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
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
  { tab: 'listy', selector: '.arkmail-search-go', tier: 'arkmail-btn-primary' },
  { tab: 'listy', selector: '.arkmail-animal-send', tier: 'arkmail-btn-action' },
  { tab: 'listy', selector: '.arkmail-older-all', tier: 'arkmail-btn-action' },
  { tab: 'listy', selector: '.arkmail-older', tier: 'arkmail-btn-action' },
  { tab: 'listy', selector: '.arkmail-cache-clear', tier: 'arkmail-btn-reset' },
  { tab: 'listy', selector: '.arkmail-search-clear', tier: 'arkmail-btn-reset' },
  { tab: 'list', selector: '.arkmail-del', tier: 'arkmail-btn-danger' },
  { tab: 'napisz', selector: '.arkmail-send', tier: 'arkmail-btn-primary' },
  { tab: 'napisz', selector: '.arkmail-compose-clear', tier: 'arkmail-btn-reset' },
  { tab: 'kontakty', selector: '.arkmail-index-all', tier: 'arkmail-btn-action' },
  { tab: 'archiwum', selector: '.arkmail-index-all', tier: 'arkmail-btn-action' },
  { tab: 'archiwum', selector: '.arkmail-arch-download', tier: 'arkmail-btn-action' },
  { tab: 'archiwum', selector: '.arkmail-arch-export', tier: 'arkmail-btn-primary' },
  { tab: 'archiwum', selector: '.arkmail-arch-clear', tier: 'arkmail-btn-reset' },
  { tab: 'usuwanie', selector: '.arkmail-deletion-search', tier: 'arkmail-btn-primary' },
  { tab: 'usuwanie', selector: '.arkmail-deletion-delete', tier: 'arkmail-btn-danger' },
  { tab: 'usuwanie', selector: '.arkmail-deletion-clear-filters', tier: 'arkmail-btn-reset' },
];

function mountedTabs(): Record<string, { querySelector(s: string): unknown; querySelectorAll(s: string): unknown }> {
  const kontakty = new MailUiStore({ tab: 'kontakty' });
  kontakty.setContacts([contact()]);
  return {
    listy: mount(withBox(new MailUiStore())),
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
    const primary = (container.querySelectorAll('.arkmail-btn-primary') as unknown as unknown[]).length;
    assert.ok(primary <= 2, `${name}: ${primary} primary > 2`);
  }
});

test('tiers: wszystkie Wyczysc filtry dziela jeden poziom reset', () => {
  const tabs = mountedTabs();
  for (const [tab, selector] of [
    ['listy', '.arkmail-search-clear'],
    ['archiwum', '.arkmail-arch-clear'],
    ['usuwanie', '.arkmail-deletion-clear-filters'],
  ] as const) {
    const el = tabs[tab]!.querySelector(selector) as { className: string } | null;
    assert.ok(el, `${tab} ${selector} istnieje`);
    assert.ok(
      el.className.split(' ').includes('arkmail-btn-reset'),
      `${tab} ${selector} ma poziom reset`,
    );
  }
});

test('tiers: kazdy poziom ma regule w styles.ts i poziomy sie roznia', () => {
  const bodies: Record<string, string> = {};
  for (const tier of ['primary', 'action', 'danger', 'reset']) {
    const m = STYLES.match(new RegExp(`\\.arkmail-btn-${tier}\\s*\\{([^}]*)\\}`));
    assert.ok(m, `regula .arkmail-btn-${tier} istnieje w styles.ts`);
    bodies[tier] = m[1]!;
  }
  const distinct = new Set(Object.values(bodies));
  assert.equal(distinct.size, 4, 'cztery poziomy = cztery rozne wyglady');
});
