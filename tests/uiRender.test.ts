/**
 * Render UI ArkMail (cienka powloka DOM nad MailUiStore).
 * Testy na happy-dom: zakladki, pasek operacji, listy, klik w list,
 * formularz compose, badge w etykiecie zakladki, tryb wide,
 * lokalny filtr archiwum (bez utraty fokusu - filtr poza store).
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Window } from 'happy-dom';

import { mountMailUi, type MailUiHandlers } from '../src/arkmail/ui/render';
import { renderLetter } from '../src/arkmail/core/letterRender';
import { mergeContacts } from '../src/arkmail/core/contacts';
import { MailUiStore } from '../src/arkmail/ui/store';
import type { MailboxEntry } from '../src/arkmail/core/session/mailbox';
import type { ArchiveLetter } from '../src/arkmail/core/archive';

const window = new Window();
const document = window.document;

function entry(over: Partial<MailboxEntry> = {}): MailboxEntry {
  return {
    number: 3,
    isRead: false,
    subject: 'Perly',
    forwarded: false,
    party: 'Foo',
    partyKind: 'nadawca',
    date: null,
    ...over,
  };
}

function arch(over: Partial<ArchiveLetter> = {}): ArchiveLetter {
  return {
    id: 'a1',
    box: 'odebrane',
    number: 3,
    party: 'Foo',
    subject: 'Perly',
    dateRaw: null,
    sortKey: '2025-12-23 00:11:12',
    read: true,
    body: [],
    ...over,
  };
}

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

test('render: cztery zakladki z polskimi etykietami, bez List', () => {
  // Fala 11b: 'list' to wewnetrzny stan widoku (otwarty list), nie
  // zakladka - na pasku "Listy" i "List" obok siebie mylily gracza.
  const s = new MailUiStore();
  const { container, off } = mount(s);
  const tabs = [...container.querySelectorAll('.arkmail-tab')];
  assert.deepEqual(
    tabs.map((t) => t.getAttribute('data-tab')),
    ['listy', 'napisz', 'kontakty', 'archiwum'],
  );
  assert.deepEqual(
    tabs.map((t) => t.textContent),
    ['Listy', 'Napisz list', 'Kontakty', 'Archiwum'],
  );
  assert.equal(container.querySelector('.arkmail-tab-active')?.getAttribute('data-tab'), 'listy');
  off();
});

test('render: czytanie listu na waskim bez aktywnej zakladki na pasku', () => {
  // Stan wewnetrzny 'list' nie ma przycisku na pasku - powrot przez
  // 'Zamknij list'.
  const s = new MailUiStore();
  s.openLetter('odebrane', {
    number: 1, from: 'A', subject: 'X', to: 'B', cc: null, date: null, body: ['t'],
  });
  const { container, off } = mount(s);
  assert.equal(s.state.tab, 'list');
  assert.ok(!container.querySelector('[data-tab="list"]'), 'brak zakladki List');
  assert.ok(!container.querySelector('.arkmail-tab-active'), 'zadna zakladka nie aktywna');
  off();
});

test('render: klik zakladki zmienia stan, aktywna ma klase', () => {
  const s = new MailUiStore();
  const { container, off } = mount(s);
  const napisz = container.querySelector('[data-tab="napisz"]')!;
  click(napisz);
  assert.equal(s.state.tab, 'napisz');
  assert.equal(container.querySelector('.arkmail-tab-active')?.getAttribute('data-tab'), 'napisz');
  off();
});

test('render: pasek operacji tylko gdy busy', () => {
  const s = new MailUiStore();
  const { container, off } = mount(s);
  assert.equal(container.querySelector('.arkmail-busy'), null);
  s.setBusy('Czytam list 3...');
  assert.ok(container.querySelector('.arkmail-busy')?.textContent?.includes('Czytam list 3'));
  s.setBusy(null);
  assert.equal(container.querySelector('.arkmail-busy'), null);
  off();
});

test('render: lista listow, nieprzeczytany wyrozniony, klik otwiera', () => {
  const s = new MailUiStore();
  const { container, calls, off } = mount(s);
  s.applyMailbox('odebrane', {
    kind: 'lista',
    header: { box: 'odebrane', truncated: false },
    entries: [entry(), entry({ number: 2, isRead: true, subject: 'Stary' })],
  });
  const rows = container.querySelectorAll('.arkmail-entry');
  assert.equal(rows.length, 2);
  // wyswietlanie najnowszy->najstarszy: wpis numer 2 (nowszy) jest pierwszy
  assert.ok(!rows[0].classList.contains('arkmail-unread'));
  assert.ok(rows[0].textContent?.includes('Stary'));
  assert.ok(rows[1].classList.contains('arkmail-unread'));
  assert.ok(rows[1].textContent?.includes('Perly'));
  assert.ok(rows[1].textContent?.includes('Foo'));
  click(rows[1]);
  // Fala 9a: handler dostaje WPIS (tozsamosc do re-kotwiczenia), nie numer.
  assert.equal(calls.length, 1);
  assert.equal(calls[0].name, 'open');
  assert.equal(calls[0].args[0], 'odebrane');
  const passed = calls[0].args[1] as MailboxEntry;
  assert.equal(passed.subject, 'Perly');
  assert.equal(passed.party, 'Foo');
  off();
});

test('render: numery wierszy sa ciagle 1..N (serwerowe numery zostaja w srodku)', () => {
  const s = new MailUiStore();
  const { container, off } = mount(s);
  // Magazyn trzyma najstarszy->najnowszy z serwerowymi numerami strony.
  s.applyMailbox('odebrane', {
    kind: 'lista',
    header: { box: 'odebrane', truncated: false },
    entries: [
      entry({ number: 50, subject: 'Najstarszy' }),
      entry({ number: 49, subject: 'Srodkowy', isRead: true }),
      entry({ number: 48, subject: 'Najnowszy', isRead: true }),
    ],
  });
  const nums = [...container.querySelectorAll('.arkmail-entry-num')].map((n) => n.textContent);
  assert.deepEqual(nums, ['1.', '2.', '3.']);
  // data-number zostaje serwerowe (diagnoza), ale nie trafia do handlerow.
  const rows = container.querySelectorAll('.arkmail-entry');
  assert.equal(rows[0].getAttribute('data-number'), '48');
  off();
});

test('render: kolejnosc wierszy najnowszy -> najstarszy (serwer podaje odwrotnie)', () => {
  const s = new MailUiStore();
  const { container, off } = mount(s);
  s.applyMailbox('odebrane', {
    kind: 'lista',
    header: { box: 'odebrane', truncated: false },
    entries: [entry({ number: 3, subject: 'najstarszy' }), entry({ number: 2, subject: 'srodkowy' }), entry({ number: 1, subject: 'najnowszy' })],
  });
  const rows = container.querySelectorAll('.arkmail-entry');
  assert.deepEqual(
    [...rows].map((r) => r.getAttribute('data-number')),
    ['1', '2', '3'],
    'wiersze od najnowszego (numer 1) do najstarszego',
  );
  assert.ok(rows[0].textContent?.includes('najnowszy'));
  off();
});

test('render: zbiorczy Odswiez odswieza aktywna skrzynke; bez per-skrzynka', () => {
  const s = new MailUiStore();
  const { container, calls, off } = mount(s);
  assert.ok(!container.querySelector('.arkmail-refresh'), 'bez przyciskow odswiez per skrzynka');
  const btn = container.querySelector('.arkmail-refresh-global');
  assert.ok(btn, 'zbiorczy Odswiez');
  click(btn!);
  assert.deepEqual(calls, [{ name: 'refresh', args: ['odebrane'] }]);
  s.setActiveBox('wyslane');
  click(container.querySelector('.arkmail-refresh-global')!);
  assert.deepEqual(calls[1], { name: 'refresh', args: ['wyslane'] }, 'odswieza AKTYWNA skrzynke');
  off();
});

test('render: badge w etykiecie zakladki Listy', () => {
  const s = new MailUiStore();
  const { container, off } = mount(s);
  s.applyMailbox('nieprzeczytane', {
    kind: 'lista',
    header: { box: 'nieprzeczytane', truncated: false },
    entries: [entry(), entry({ number: 2 })],
  });
  assert.equal(container.querySelector('[data-tab="listy"]')?.textContent, 'Listy (2)');
  off();
});

test('render: formularz compose zbiera pola; linie przechodza przez renderer', () => {
  const s = new MailUiStore({ tab: 'napisz' });
  const { container, calls, off } = mount(s);
  (container.querySelector('[data-field="adresat"]') as unknown as HTMLInputElement).value = 'Garply';
  (container.querySelector('[data-field="temat"]') as unknown as HTMLInputElement).value = 'Perly';
  (container.querySelector('[data-field="dw"]') as unknown as HTMLInputElement).value = 'Foo';
  const tresc = container.querySelector('[data-field="tresc"]') as unknown as HTMLTextAreaElement;
  tresc.value = 'linia1\nlinia2';
  fireEvent(tresc, 'input');
  click(container.querySelector('.arkmail-send')!);
  assert.deepEqual(calls, [
    {
      name: 'send',
      args: [
        {
          adresat: 'Garply',
          temat: 'Perly',
          dw: 'Foo',
          linie: renderLetter('linia1\nlinia2', 'plain', 60).lines,
        },
      ],
    },
  ]);
  off();
});

test('render: wide ustawia klase podzialu na roocie', () => {
  const s = new MailUiStore();
  const { container, off } = mount(s);
  assert.ok(!container.querySelector('.arkmail-root')!.classList.contains('arkmail-wide'));
  s.setWide(true);
  assert.ok(container.querySelector('.arkmail-root')!.classList.contains('arkmail-wide'));
  off();
});

test('render: filtr archiwum po temacie - lokalny, bez store', () => {
  const s = new MailUiStore({ tab: 'archiwum' });
  s.setArchive([arch(), arch({ id: 'b2', subject: 'Rachunek', number: 4 })]);
  const { container, off } = mount(s);
  assert.equal(container.querySelectorAll('.arkmail-arch-entry').length, 2);
  const input = container.querySelector('[data-filter="temat"]') as unknown as HTMLInputElement;
  input.value = 'rach';
  input.dispatchEvent(new window.Event('input') as unknown as Event);
  const rows = container.querySelectorAll('.arkmail-arch-entry');
  assert.equal(rows.length, 1);
  assert.ok(rows[0].textContent?.includes('Rachunek'));
  assert.equal(input.value, 'rach', 'input nie jest nadpisywany przy filtrze');
  off();
});

test('render: archiwum - filtry osoba/skrzynka/daty/tresc (lokalne, bez store)', () => {
  const s = new MailUiStore({ tab: 'archiwum' });
  s.setArchive([
    arch({ id: 'a1', box: 'odebrane', party: 'Bar', subject: 'Perly', sortKey: '2026-04-16 00:31:37', body: ['masz perly'] }),
    arch({ id: 'b2', box: 'wyslane', party: 'Grault', subject: 'Rachunek', number: 4, sortKey: '2026-05-01 10:00:00', body: ['plac'] }),
    arch({ id: 'c3', box: 'wyslane', party: 'Garply', subject: 'Perly sprzedam', number: 5, sortKey: '2026-03-01 09:00:00' }),
  ]);
  const { container, off } = mount(s);
  const rows = () => container.querySelectorAll('.arkmail-arch-entry').length;
  assert.equal(rows(), 3);

  const osoba = container.querySelector('[data-filter="osoba"]') as unknown as HTMLInputElement;
  assert.ok(osoba, 'filtr osoby istnieje');
  osoba.value = 'garply';
  fireEvent(osoba, 'input');
  assert.equal(rows(), 1, 'osoba: tylko Garply');
  osoba.value = '';
  fireEvent(osoba, 'input');

  const skr = container.querySelector('[data-filter="skrzynka"]') as unknown as HTMLSelectElement;
  assert.ok(skr, 'filtr skrzynki istnieje');
  skr.value = 'wyslane';
  fireEvent(skr, 'change');
  assert.equal(rows(), 2, 'skrzynka: tylko wyslane');
  skr.value = '';
  fireEvent(skr, 'change');

  const tresc = container.querySelector('[data-filter="tresc"]') as unknown as HTMLInputElement;
  assert.ok(tresc, 'filtr tresci istnieje');
  tresc.value = 'perly';
  fireEvent(tresc, 'input');
  assert.equal(rows(), 1, 'tresc: trafia w body, nie w sam temat');
  tresc.value = '';
  fireEvent(tresc, 'input');

  const od = container.querySelector('[data-filter="odDaty"]') as unknown as HTMLInputElement;
  assert.ok(od, 'filtr odDaty istnieje');
  od.value = '2026-04-01';
  fireEvent(od, 'input');
  assert.equal(rows(), 2, 'odDaty odcina marcowy list');
  const doDaty = container.querySelector('[data-filter="doDaty"]') as unknown as HTMLInputElement;
  doDaty.value = '2026-04-30';
  fireEvent(doDaty, 'input');
  assert.equal(rows(), 1, 'zakres dat wlacznie');

  assert.equal(s.state.archive.length, 3, 'filtry nie ruszaja store');
  off();
});

// --- Fala 5b: szablony + podglad compose, operacje pagerowe -----------------

const fireEvent = (el: unknown, name: string) =>
  (el as { dispatchEvent(e: unknown): void }).dispatchEvent(new window.Event(name));

test('render: compose ma wybor szablonu (6) i szerokosc (domyslnie 60)', () => {
  const s = new MailUiStore({ tab: 'napisz' });
  const { container, off } = mount(s);
  const sel = container.querySelector('[data-field="szablon"]')!;
  const options = [...sel.querySelectorAll('option')].map((o) => o.getAttribute('value'));
  assert.deepEqual(options, ['none', 'plain', 'parchment', 'parchment2', 'parchment3', 'raw']);
  assert.equal((sel as unknown as HTMLSelectElement).value, 'plain');
  assert.equal(
    (container.querySelector('[data-field="szerokosc"]') as unknown as HTMLInputElement).value,
    '60',
  );
  off();
});

test('render: podglad ramki reaguje na tresc i zmiane szablonu', async () => {
  const s = new MailUiStore({ tab: 'napisz' });
  const { container, off } = mount(s);
  const tresc = container.querySelector('[data-field="tresc"]') as unknown as HTMLTextAreaElement;
  tresc.value = 'Witaj w Arkadii';
  fireEvent(tresc, 'input');
  await new Promise((r) => setImmediate(r));
  let preview = container.querySelector('.arkmail-preview')!.textContent!;
  assert.ok(preview.includes('Witaj'), 'podglad zawiera tresc');
  assert.ok(preview.includes('|'), 'domyslny szablon plain daje ramke');

  const sel = container.querySelector('[data-field="szablon"]') as unknown as HTMLSelectElement;
  sel.value = 'none';
  fireEvent(sel, 'change');
  await new Promise((r) => setImmediate(r));
  preview = container.querySelector('.arkmail-preview')!.textContent!;
  assert.equal(preview.trim(), 'Witaj w Arkadii', 'none: sama tresc, bez ramki');
  off();
});

test('render: wysylka przekazuje wyrenderowane linie (ramka w tresci)', () => {
  const s = new MailUiStore({ tab: 'napisz' });
  const { container, calls, off } = mount(s);
  const tresc = container.querySelector('[data-field="tresc"]') as unknown as HTMLTextAreaElement;
  tresc.value = 'Witaj';
  fireEvent(tresc, 'input');
  (container.querySelector('[data-field="adresat"]') as unknown as HTMLInputElement).value = 'Garply';
  (container.querySelector('[data-field="temat"]') as unknown as HTMLInputElement).value = 'Perly';
  (container.querySelector('[data-field="szerokosc"]') as unknown as HTMLInputElement).value = '20';
  fireEvent(container.querySelector('[data-field="szerokosc"]'), 'change');
  click(container.querySelector('.arkmail-send'));
  assert.equal(calls.length, 1);
  const linie = (calls[0].args[0] as { linie: string[] }).linie;
  assert.deepEqual(linie, renderLetter('Witaj', 'plain', 20).lines);
  off();
});

test('render: pusta tresc nie wywołuje wysylki', () => {
  const s = new MailUiStore({ tab: 'napisz' });
  const { container, calls, off } = mount(s);
  (container.querySelector('[data-field="adresat"]') as unknown as HTMLInputElement).value = 'Garply';
  (container.querySelector('[data-field="temat"]') as unknown as HTMLInputElement).value = 'Perly';
  click(container.querySelector('.arkmail-send'));
  assert.deepEqual(calls, []);
  off();
});

test('render: widok listu ma Usun i Przekaz z polem adresata', () => {
  const s = new MailUiStore();
  const { container, calls, off } = mount(s);
  // Fala 9a: openLetter dostaje wpis-zrodlo; operacje dzialaja na wpisie.
  const source = entry({ number: 3 });
  s.openLetter(
    'odebrane',
    { number: 3, from: 'Foo', subject: 'Perly', to: 'Gracz', cc: null, date: null, body: ['czesc'] },
    source,
  );
  // Fala 14e: Usun z dwuklikowym potwierdzeniem - pierwszy klik uzbraja.
  click(container.querySelector('.arkmail-del'));
  assert.equal(calls.length, 0, 'pierwszy klik tylko uzbraja');
  click(container.querySelector('.arkmail-del'));
  assert.equal(calls[0].name, 'del');
  assert.deepEqual(calls[0].args, ['odebrane', source]);
  (container.querySelector('[data-field="forward"]') as unknown as HTMLInputElement).value = 'Bar';
  click(container.querySelector('.arkmail-fwd'));
  assert.equal(calls[1].name, 'fwd');
  assert.deepEqual(calls[1].args, ['odebrane', source, 'Bar']);
  off();
});

test('render: przelacznik powiadomien w panelu Listy', () => {
  const s = new MailUiStore();
  const { container, off } = mount(s);
  const toggle = container.querySelector('.arkmail-notify-toggle') as unknown as HTMLInputElement;
  assert.ok(toggle, 'przelacznik istnieje');
  assert.equal(toggle.checked, false);
  click(toggle);
  assert.equal(s.state.notifyEnabled, true);
  const toggle2 = container.querySelector('.arkmail-notify-toggle') as unknown as HTMLInputElement;
  assert.equal(toggle2.checked, true, 'stan odzwierciedlony po rerenderze');
  off();
});

test('render: przycisk Wczytaj starsze gdy listing uciety', () => {
  const s = new MailUiStore();
  const { container, calls, off } = mount(s);
  s.applyMailbox('wyslane', {
    kind: 'lista',
    header: { box: 'wyslane', truncated: true },
    entries: [entry()],
  });
  s.setActiveBox('wyslane');
  const btn = container.querySelector('.arkmail-older');
  assert.ok(btn, 'przycisk widoczny przy truncated');
  click(btn!);
  assert.deepEqual(calls, [{ name: 'older', args: ['wyslane'] }]);
  off();
});

test('render: zbiorcze Wczytaj wszystkie; w petli Przerwij ze strona', () => {
  const s = new MailUiStore();
  const { container, calls, off } = mount(s);
  s.applyMailbox('wyslane', {
    kind: 'lista',
    header: { box: 'wyslane', truncated: true },
    entries: [entry()],
  });
  s.setActiveBox('wyslane');
  const all = container.querySelector('.arkmail-older-all') as HTMLButtonElement | null;
  assert.ok(all, 'zbiorczy Wczytaj wszystkie');
  assert.ok(!all!.disabled, 'aktywny przy truncated');
  assert.ok(all!.textContent?.includes('Wczytaj wszystkie'));
  click(all!);
  assert.deepEqual(calls, [{ name: 'all', args: ['wyslane'] }]);

  // Petla w toku na tej skrzynce: przycisk zamienia sie w Przerwij ze strona.
  s.setLoadAll({ box: 'wyslane', pages: 3 });
  const cancel = container.querySelector('.arkmail-older-all') as unknown as HTMLButtonElement;
  assert.ok(cancel.textContent?.includes('Przerwij'), 'w petli: Przerwij');
  assert.ok(cancel.textContent?.includes('3'), 'pokazuje biezaca strone');
  assert.ok(!container.querySelector('.arkmail-older'), 'Wczytaj starsze schowane w petli');
  click(cancel);
  assert.deepEqual(calls[1], { name: 'all', args: ['wyslane'] }, 'klik w Przerwij tez wola onLoadAll');

  // Petla na INNEJ skrzynce: zbiorczy wylaczony, Wczytaj starsze schowane.
  s.setLoadAll({ box: 'odebrane', pages: 1 });
  const dis = container.querySelector('.arkmail-older-all') as unknown as HTMLButtonElement;
  assert.ok(dis, 'zbiorczy zostaje na pasku');
  assert.ok(dis.disabled, 'petla gdzie indziej: wylaczony');
  assert.ok(!container.querySelector('.arkmail-older'));

  // Koniec petli, dalej truncated: oba aktywne.
  s.setLoadAll(null);
  assert.ok(container.querySelector('.arkmail-older'));
  assert.ok(
    !(container.querySelector('.arkmail-older-all') as unknown as HTMLButtonElement).disabled,
  );
  off();
});

test('render: zbiorcze Wczytaj wszystkie wylaczone, gdy skrzynka w calosci', () => {
  const s = new MailUiStore();
  const { container, off } = mount(s);
  s.applyMailbox('odebrane', {
    kind: 'lista',
    header: { box: 'odebrane', truncated: false },
    entries: [entry()],
  });
  const all = container.querySelector('.arkmail-older-all') as HTMLButtonElement | null;
  assert.ok(all, 'przycisk zostaje na pasku');
  assert.ok(all!.disabled, 'nie ma czego doczytywac - wylaczony');
  off();
});

// --- Fala 7c: struktura wierszy pod nowoczesny wyglad -----------------------

test('render: wiersz listu ma kolumny nadawcy, tematu i daty', () => {
  const s = new MailUiStore();
  const { container, off } = mount(s);
  s.applyMailbox('odebrane', {
    kind: 'lista',
    header: { box: 'odebrane', truncated: false },
    entries: [
      entry({
        date: {
          raw: 'N, 21 XII 2025, 01:15:04',
          weekday: 'N',
          day: 21,
          month: 12,
          year: 2025,
          time: '01:15:04',
        },
      }),
    ],
  });
  const row = container.querySelector('.arkmail-entry')!;
  assert.ok(row.querySelector('.arkmail-entry-party')?.textContent?.includes('Foo'));
  assert.ok(row.querySelector('.arkmail-entry-subject')?.textContent?.includes('Perly'));
  assert.ok(row.querySelector('.arkmail-entry-date')?.textContent?.includes('21 XII 2025'));
  off();
});

test('render: naglowek listu z wyroznionym tematem i wierszem meta', () => {
  const s = new MailUiStore();
  const { container, off } = mount(s);
  s.openLetter('odebrane', {
    number: 3,
    from: 'Foo',
    subject: 'Perly',
    to: 'Gracz',
    cc: null,
    date: 'N, 21 XII 2025, 01:15:04',
    body: ['czesc'],
  });
  assert.ok(
    container.querySelector('.arkmail-letter-subject')?.textContent?.includes('Perly'),
    'temat wyrozniony osobno',
  );
  const meta = container.querySelector('.arkmail-letter-meta')?.textContent ?? '';
  assert.ok(meta.includes('Foo'), 'meta ma nadawce');
  assert.ok(meta.includes('Gracz'), 'meta ma adresata');
  assert.ok(meta.includes('21 XII 2025'), 'meta ma date');
  off();
});

// --- Fala 8d: kontakty - filtr i sort lokalne (jak filtr archiwum) ------------

test('render: kontakty - filtr i sort lokalne (bez store), wiersz z data', () => {
  const s = new MailUiStore({ tab: 'kontakty' });
  s.setContacts(mergeContacts({
    people: [],
    przedstawieni: [],
    aliasy: [],
    korespondencja: [
      { name: 'Bar', direction: 'in', dateRaw: 'Cz, 16 IV 2026, 00:31:37', dateKey: 20260416 },
      { name: 'Bar', direction: 'in' },
      { name: 'Bar', direction: 'out' },
      { name: 'Grault', direction: 'out', dateRaw: 'N, 19 IV 2026, 03:03:00', dateKey: 20260419 },
      { name: 'Garply', direction: 'in' },
      { name: 'Garply', direction: 'out' },
    ],
  }));
  const { container, off } = mount(s);
  const names = () =>
    [...container.querySelectorAll('.arkmail-contact-name')].map((n) => n.textContent);
  assert.deepEqual(names(), ['Grault', 'Garply', 'Bar'], 'domyslnie sort po nazwie');
  const firstRow = container.querySelector('.arkmail-contact')!;
  assert.ok(firstRow.textContent?.includes('wyslane: 1'), 'liczniki w wierszu');
  assert.ok(firstRow.textContent?.includes('19 IV 2026'), 'data ostatniego kontaktu w wierszu');

  const input = container.querySelector('.arkmail-contact-filter') as unknown as HTMLInputElement;
  assert.ok(input, 'pole filtra kontaktow istnieje');
  input.value = 'gw';
  input.dispatchEvent(new window.Event('input') as unknown as Event);
  assert.deepEqual(names(), ['Bar'], 'filtr zawezil liste');
  assert.equal(input.value, 'gw', 'input zachowuje wartosc (repaint lokalny, nie rerender)');

  input.value = '';
  input.dispatchEvent(new window.Event('input') as unknown as Event);
  assert.equal(names().length, 3, 'wyczyszczony filtr przywraca wszystkie');

  const sel = container.querySelector('.arkmail-contact-sort') as unknown as HTMLSelectElement;
  assert.ok(sel, 'select sortowania istnieje');
  sel.value = 'liczba';
  fireEvent(sel, 'change');
  assert.deepEqual(names(), ['Bar', 'Garply', 'Grault'], 'sort po liczbie listow malejaco');
  sel.value = 'ostatni';
  fireEvent(sel, 'change');
  assert.deepEqual(names(), ['Grault', 'Bar', 'Garply'], 'sort po ostatnim kontakcie malejaco');

  assert.deepEqual(
    s.state.contacts.map((c) => c.name),
    ['Grault', 'Garply', 'Bar'],
    'filtr i sort nie ruszaja store (lokalne, jak filtr archiwum)',
  );
  off();
});

// --- Fala 8g: pasek szukania serwerowego w zakladce Listy ---------------------

test('render: pasek szukania komponuje zapytanie z pol (daty ISO -> DateYMD)', () => {
  const s = new MailUiStore();
  s.applyMailbox('odebrane', {
    kind: 'lista',
    header: { box: 'odebrane', truncated: false },
    entries: [entry()],
  });
  const { container, calls, off } = mount(s);
  const set = (sel: string, v: string) => {
    const el = container.querySelector(sel) as unknown as HTMLInputElement;
    el.value = v;
    fireEvent(el, 'input');
  };
  assert.ok(container.querySelector('[data-search="osoba"]'), 'pole osoby');
  assert.ok(container.querySelector('[data-search="temat"]'), 'pole tematu');
  assert.ok(container.querySelector('[data-search="odDaty"]'), 'pole od daty');
  assert.ok(container.querySelector('[data-search="doDaty"]'), 'pole do daty');
  set('[data-search="osoba"]', 'Bar');
  set('[data-search="temat"]', 'perly');
  set('[data-search="odDaty"]', '2026-04-01');
  set('[data-search="doDaty"]', '2026-04-30');
  click(container.querySelector('.arkmail-search-go')!);
  assert.deepEqual(calls, [
    {
      name: 'search',
      args: [
        'odebrane',
        {
          osoba: 'Bar',
          odDaty: { day: 1, month: 4, year: 2026 },
          doDaty: { day: 30, month: 4, year: 2026 },
          temat: 'perly',
        },
      ],
    },
  ]);
  off();
});

test('render: puste zapytanie nie strzela (Szukaj bez pol = brak akcji)', () => {
  const s = new MailUiStore();
  s.applyMailbox('odebrane', {
    kind: 'lista',
    header: { box: 'odebrane', truncated: false },
    entries: [entry()],
  });
  const { container, calls, off } = mount(s);
  click(container.querySelector('.arkmail-search-go')!);
  assert.deepEqual(calls, [], 'puste pola = brak onSearch');
  off();
});

test('render: tryb wynikow - banner z opisem, Wyczysc, paginacja schowana', () => {
  const s = new MailUiStore();
  s.applyMailbox('wyslane', {
    kind: 'lista',
    header: { box: 'wyslane', truncated: true },
    entries: [entry()],
  });
  s.setActiveBox('wyslane');
  s.setSearch({ box: 'wyslane', label: 'wyslane, adresat: Bar' });
  const { container, calls, off } = mount(s);
  const banner = container.querySelector('.arkmail-search-banner');
  assert.ok(banner, 'banner wynikow widoczny');
  assert.ok(banner!.textContent?.includes('wyslane, adresat: Bar'), 'banner z opisem zapytania');
  assert.ok(!container.querySelector('.arkmail-older'), 'paginacja schowana w trybie wynikow');
  const allBtn = container.querySelector('.arkmail-older-all') as HTMLButtonElement | null;
  assert.ok(!allBtn || allBtn.disabled, 'Wczytaj wszystkie wylaczone w trybie wynikow');
  click(container.querySelector('.arkmail-search-clear')!);
  assert.deepEqual(calls, [{ name: 'clear-search', args: ['wyslane'] }]);
  off();
});

test('render: szukanie na innej skrzynce nie pokazuje bannera tutaj', () => {
  const s = new MailUiStore();
  s.applyMailbox('odebrane', {
    kind: 'lista',
    header: { box: 'odebrane', truncated: false },
    entries: [entry()],
  });
  s.setSearch({ box: 'wyslane', label: 'wyslane, adresat: Bar' });
  const { container, off } = mount(s);
  assert.ok(!container.querySelector('.arkmail-search-banner'), 'banner tylko na szukanej skrzynce');
  off();
});
