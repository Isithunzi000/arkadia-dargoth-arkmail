import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Window } from 'happy-dom';

import { mountMailUi } from '../src/arkmail/ui/render';
import { MailUiStore } from '../src/arkmail/ui/store';
import type { MailboxEntry } from '../src/arkmail/core/session/mailbox';
import type { Contact } from '../src/arkmail/core/contacts';

const window = new Window();
const document = window.document;

type TestButton = {
  textContent: string;
  getAttribute(name: string): string | null;
  dispatchEvent(event: unknown): void;
};

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
  return container;
}

const button = (container: unknown, selector: string): TestButton => {
  const found = (container as { querySelector(s: string): unknown }).querySelector(selector) as TestButton | null;
  assert.ok(found, `przycisk ${selector} istnieje`);
  return found;
};

const click = (container: unknown, selector: string): void => {
  button(container, selector).dispatchEvent(new window.Event('click'));
};

const title = (container: unknown, selector: string): string =>
  button(container, selector).getAttribute('title')?.trim() ?? '';

const missingTitles = (container: unknown): string[] =>
  [...(container as { querySelectorAll(s: string): unknown[] }).querySelectorAll('button')]
    .map((el) => el as TestButton)
    .filter((el) => !(el.getAttribute('title') ?? '').trim())
    .map((el) => el.textContent);

function withBox(store: MailUiStore): MailUiStore {
  store.applyMailbox('odebrane', {
    kind: 'lista',
    header: { box: 'odebrane', truncated: true },
    entries: [source()],
  });
  return store;
}

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

function openLetter(store: MailUiStore, withSource = true): MailUiStore {
  store.openLetter(
    'odebrane',
    { number: 1, from: 'Foo', subject: 'Temat', to: 'Bar', cc: null, date: null, body: ['Tresc'] },
    ...(withSource ? [source()] : []),
  );
  return store;
}

function contact(): Contact {
  return {
    name: 'Bar',
    sources: ['korespondencja'],
    lettersReceived: 1,
    lettersSent: 1,
  };
}

test('podpowiedzi: kazdy przycisk ma title we wszystkich zakladkach', () => {
  const missing: string[] = [];
  const stores = [
    withBox(new MailUiStore()),
    openLetter(withBox(new MailUiStore({ tab: 'list' }))),
    new MailUiStore({ tab: 'napisz' }),
    new MailUiStore({ tab: 'kontakty' }),
    new MailUiStore({ tab: 'archiwum' }),
  ];
  stores[3].setContacts([contact()]);
  for (const store of stores) missing.push(...missingTitles(mount(store)));
  assert.deepEqual(missing, [], 'kazdy przycisk ma niepusta podpowiedz');
});

test('podpowiedzi: potwierdzenia zmieniaja title i przywracaja go po czasie', async () => {
  const cases: Array<{ container: unknown; selector: string; initial: string; expected: string }> = [];
  const listy = mount(withBox(new MailUiStore()));
  cases.push({ container: listy, selector: '.arkmail-cache-clear', initial: title(listy, '.arkmail-cache-clear'), expected: 'ponownie' });
  click(listy, '.arkmail-cache-clear');

  const letter = mount(openLetter(withBox(new MailUiStore({ tab: 'list' }))));
  cases.push({ container: letter, selector: '.arkmail-del', initial: title(letter, '.arkmail-del'), expected: 'ponownie' });
  click(letter, '.arkmail-del');

  const compose = mount(new MailUiStore({ tab: 'napisz' }));
  cases.push({ container: compose, selector: '.arkmail-compose-clear', initial: title(compose, '.arkmail-compose-clear'), expected: 'ponownie' });
  click(compose, '.arkmail-compose-clear');

  const archive = mount(new MailUiStore({ tab: 'archiwum' }));
  cases.push({ container: archive, selector: '.arkmail-arch-download', initial: title(archive, '.arkmail-arch-download'), expected: 'dlugo' });
  click(archive, '.arkmail-arch-download');

  for (const item of cases) {
    assert.ok(title(item.container, item.selector).includes(item.expected), `${item.selector}: title opisuje uzbrojenie`);
  }
  await new Promise((resolve) => setTimeout(resolve, 3100));
  for (const item of cases) {
    assert.equal(title(item.container, item.selector), item.initial, `${item.selector}: poczatkowy title wraca`);
  }
});

test('podpowiedzi: bledy walidacji zmieniaja title razem z etykieta', async () => {
  const listy = mount(withBox(new MailUiStore()));
  for (const [selector, value] of [['[data-search="odDaty"]', '2026-05-02'], ['[data-search="doDaty"]', '2026-05-01']]) {
    const input = (listy as { querySelector(s: string): unknown }).querySelector(selector) as { value: string };
    input.value = value;
  }
  click(listy, '.arkmail-search-go');
  assert.ok(title(listy, '.arkmail-search-go').includes('Od dnia pozniej'));

  const compose = mount(new MailUiStore({ tab: 'napisz' }));
  click(compose, '.arkmail-send');
  assert.ok(title(compose, '.arkmail-send').includes('Brak tresci'));

  await new Promise((resolve) => setTimeout(resolve, 3100));
  assert.equal(title(listy, '.arkmail-search-go'), 'Szukaj');
  assert.equal(title(compose, '.arkmail-send'), 'Zapisz w niewyslanych');
});

test('podpowiedzi: dynamiczne stany i ponownie utworzone przyciski zachowuja title', () => {
  const store = withBox(new MailUiStore());
  const listy = mount(store);
  store.setAnimalFlying(true);
  store.setLoadAll({ box: 'odebrane', pages: 7 });
  assert.ok(title(listy, '.arkmail-animal-send').includes('drodze'));
  assert.ok(title(listy, '.arkmail-older-all').includes('Przerwij'));

  const contactsStore = new MailUiStore({ tab: 'kontakty' });
  contactsStore.setContacts([contact()]);
  const contacts = mount(contactsStore);
  const filter = (contacts as { querySelector(s: string): unknown }).querySelector('[data-filter="kontakty"]') as {
    value: string;
    dispatchEvent(event: unknown): void;
  };
  filter.value = 'Bar';
  filter.dispatchEvent(new window.Event('input'));
  assert.deepEqual(missingTitles(contacts), [], 'przyciski po filtrowaniu tez maja title');
});
