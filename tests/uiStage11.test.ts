import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { Window } from 'happy-dom';

import { validateCompose } from '../src/arkmail/core/composeValidation';
import { validateListingSearch } from '../src/arkmail/core/protocol/commands';
import type { Contact } from '../src/arkmail/core/contacts';
import type { MailboxEntry } from '../src/arkmail/core/session/mailbox';
import {
  EditorSession,
  type ComposeOutcome,
} from '../src/arkmail/core/session/editor';
import { PagerSession, type ForwardResult } from '../src/arkmail/core/session/pager';
import {
  mountMailUi,
  type MailUiHandlers,
} from '../src/arkmail/ui/render';
import { MailUiStore } from '../src/arkmail/ui/store';
import {
  FakeApi,
  loadTruncatedBox,
  startHarness,
  stopHarness,
  type Harness,
} from './harness';

const HANDLERS = {} as MailUiHandlers;
const uiWindow = new Window();
const uiDocument = uiWindow.document;

type Root = Pick<HTMLElement, 'querySelector' | 'querySelectorAll'>;
type Notice = { text?: string; level?: string };

function mount(store: MailUiStore): Root {
  const container = uiDocument.createElement('div');
  mountMailUi(container as unknown as HTMLElement, store, HANDLERS);
  return container as unknown as Root;
}

function switchContactTab(root: Root, sub: string): void {
  const pill = root.querySelector(`[data-contact-tab="${sub}"]`) as HTMLButtonElement | null;
  assert.ok(pill, `podzakladka ${sub}`);
  pill.click();
}

function exactNotice(f: FakeApi, text: string): Notice | undefined {
  return f.shown
    .map((entry) => entry as Notice)
    .find((entry) => entry.text === text);
}

async function startCaptured(): Promise<{
  h: Harness;
  handlers: MailUiHandlers;
  store: MailUiStore;
  restore: () => Promise<void>;
}> {
  const renderModule = require('../src/arkmail/ui/render') as {
    mountMailUi: typeof mountMailUi;
  };
  const originalMount = renderModule.mountMailUi;
  let handlers: MailUiHandlers | undefined;
  let store: MailUiStore | undefined;
  renderModule.mountMailUi = (container, currentStore, currentHandlers) => {
    handlers = currentHandlers;
    store = currentStore;
    return originalMount(container, currentStore, currentHandlers);
  };
  const h = await startHarness();
  assert.ok(handlers && store, 'przechwycono prawdziwe handlery i store');
  return {
    h,
    handlers: handlers!,
    store: store!,
    restore: async () => {
      renderModule.mountMailUi = originalMount;
      await stopHarness();
    },
  };
}

const SEND_INPUT = {
  adresat: 'Thud',
  temat: 'Temat',
  dw: '',
  tresc: 'czesc',
  linie: ['czesc'],
};

function contact(name: string): Contact {
  return { name, sources: ['korespondencja'], lettersReceived: 1, lettersSent: 0 };
}

test('etap 11 S1-S4 S11 S15: aliasy i podzakladki maja jednoznaczne teksty', () => {
  const store = new MailUiStore({ tab: 'kontakty' });
  const root = mount(store);
  assert.deepEqual(
    Array.from(root.querySelectorAll('.arkmail-subpill')).map((el) => el.textContent),
    ['Ksiazka adresowa', 'Aliasy pocztowe', 'Grupy', 'Import i eksport'],
  );

  switchContactTab(root, 'aliasy');
  const section = root.querySelector('[data-book-aliases]') as HTMLElement;
  assert.equal(
    section.querySelector('.arkmail-dim')?.textContent,
    'Aliasy pocztowe z gry sa w ArkMailu tylko do odczytu. Sa zapisane lokalnie jako lustro, ale nie trafiaja do eksportu JSON. Aliasy edytujesz i usuwasz w grze.',
  );
  assert.match(
    section.textContent ?? '',
    /Brak zapisanych aliasow\. Pobierz je z gry przyciskiem Importuj aliasy pocztowe\./,
  );
  assert.equal(
    root.querySelector('[data-import="aliasy"]')?.getAttribute('title'),
    'Pobiera z gry aliasy pocztowe i dopisuje ich odbiorcow do ksiazki. W ArkMailu aliasy sa tylko do odczytu; edytujesz i usuwasz je w grze. Rozwija je serwer.',
  );
  const clear = root.querySelector('[data-aliases-clear]') as HTMLButtonElement;
  assert.equal(clear.textContent, 'Wyczysc zapisane aliasy');
  assert.equal(
    clear.getAttribute('title'),
    'Usuwa lokalne lustro aliasow. Na serwerze Arkadii nic nie znika. Aliasy pobierzesz z gry ponownie.',
  );
});

test('etap 11 S3 S12 S13 S15: import i eksport opisuje dopisywanie bez usuwania', () => {
  const store = new MailUiStore({ tab: 'kontakty' });
  const root = mount(store);
  switchContactTab(root, 'importeksport');
  assert.equal(
    root.querySelector('[data-import="zapamietani"]')?.getAttribute('title'),
    'Pobiera z gry osoby zapamietane i dopisuje nowe do ksiazki adresowej. Istniejacych osob nie usuwa. Grup nie tworzy.',
  );
  assert.equal(
    root.querySelector('[data-import="przedstawieni"]')?.getAttribute('title'),
    'Pobiera z gry osoby, ktore zostaly ci ostatnio przedstawione, i dopisuje nowe do ksiazki adresowej. Istniejacych osob nie usuwa. Grup nie tworzy.',
  );
  const joinMode = root.querySelector('[data-book-import-mode] input[title]') as HTMLInputElement;
  assert.equal(
    joinMode.getAttribute('title'),
    'Dolacza imiona i nowe grupy z pliku. Grupe o tej samej nazwie scala z istniejaca. Nie usuwa obecnych danych.',
  );
  const clear = root.querySelector('[data-book-clear-all]') as HTMLButtonElement;
  assert.equal(clear.textContent, 'Wyczysc cala ksiazke i aliasy');
  assert.match(clear.getAttribute('title') ?? '', /Na serwerze Arkadii nic nie znika/);
});

test('etap 11 S16 S17 S22 S23: walidacja i kontrolki compose zachowuja kontrakt', () => {
  const base = { adresat: 'Fred', temat: 'Temat', dw: '', tresc: 'Tresc' };
  assert.equal(
    validateCompose({ ...base, adresat: 'Fred i Grault' }),
    "Adresatow oddziel przecinkami lub spacjami, bez spojnika 'i'. Dozwolone: litery a-z i A-Z.",
  );
  assert.equal(
    validateCompose({ ...base, dw: 'Fred i Grault' }),
    "Adresatow DW oddziel przecinkami lub spacjami, bez spojnika 'i'. Dozwolone: litery a-z i A-Z.",
  );
  assert.equal(
    validateListingSearch({ osoba: 'Fred1' }),
    'Osoba: tylko litery a-z i A-Z.',
  );
  const root = mount(new MailUiStore({ tab: 'napisz' }));
  assert.equal(root.querySelector('.arkmail-send')?.textContent, 'Zapisz w niewyslanych');
  assert.equal(root.querySelector('.arkmail-compose-clear')?.textContent, 'Wyczysc pola listu');
});

test('etap 11 S5: import pliku podaje liczby grup z pliku i imion w ksiazce', async () => {
  const { h, handlers, restore } = await startCaptured();
  try {
    handlers.onSavePeople?.(['Fred']);
    handlers.onImportAddressBook?.(
      { people: ['Corge'], groups: [{ name: 'Patrol', members: ['Corge'] }] },
      'dolacz',
    );
    assert.equal(
      exactNotice(
        h.f,
        'Z pliku: liczba grup 1 (dodano: 1, scalono: 0). W ksiazce: liczba imion 2 (dodano: 1).',
      )?.level,
      'success',
    );
    handlers.onImportAddressBook?.(
      { people: ['Waldo'], groups: [{ name: 'Rada', members: ['Waldo'] }] },
      'zastap',
    );
    assert.equal(
      exactNotice(h.f, 'Ksiazka adresowa zastapiona. Liczba grup: 1. Liczba imion: 1.')?.level,
      'success',
    );
  } finally {
    await restore();
  }
});

test('etap 11 S6: import osob z gry podaje pobrane i nowe liczby', async () => {
  const { h, handlers, restore } = await startCaptured();
  try {
    handlers.onSavePeople?.(['Fred']);
    handlers.onImportPeople?.('zapamietani');
    await h.waitFor(() => h.f.sent.includes('zapamietani'), 'komenda importu osob');
    h.f.fire('[12] Zapamietane przez ciebie imiona to Fred i Grault.', 'mail');
    h.f.fire('> ', 'prompt');
    await h.waitFor(
      () => exactNotice(h.f, 'Liczba pobranych osob: 2. Liczba nowych osob w ksiazce: 1.') !== undefined,
      'podsumowanie importu osob',
    );
  } finally {
    await restore();
  }
});

test('etap 11 S7: import aliasow podaje liczbe aliasow i dopisanych osob', async () => {
  const { h, handlers, restore } = await startCaptured();
  try {
    handlers.onSavePeople?.(['Fred']);
    handlers.onImportAliases?.();
    await h.waitFor(() => h.f.sent.includes('aliasy pocztowe'), 'komenda importu aliasow');
    h.f.fire('Posiadasz nastepujace zdefiniowane aliasy pocztowe:', 'mail');
    h.f.fire('\tzgromadzenie: Fred, Grault', 'mail');
    h.f.fire('> ', 'prompt');
    await h.waitFor(
      () => exactNotice(h.f, 'Zaimportowano aliasy. Liczba aliasow: 1. Liczba osob dopisanych do ksiazki: 1.') !== undefined,
      'podsumowanie importu aliasow',
    );
  } finally {
    await restore();
  }
});

test('etap 11 S8-S10 S14: eksport, dopisanie i czyszczenie maja wlasciwe komunikaty', async () => {
  const downloadModule = require('../src/arkmail/ui/download') as {
    downloadBlob: () => boolean;
  };
  const originalDownload = downloadModule.downloadBlob;
  downloadModule.downloadBlob = () => true;
  const { h, handlers, store, restore } = await startCaptured();
  try {
    handlers.onSavePeople?.(['Fred']);
    handlers.onSaveGroups?.([{ name: 'Patrol', members: ['Fred'] }]);
    handlers.onExportAddressBook?.();
    assert.equal(
      exactNotice(h.f, 'Ksiazka adresowa zapisana do pliku. Liczba imion: 1. Liczba grup: 1.')?.level,
      'success',
    );

    store.setContacts([contact('Fred')]);
    handlers.onAddAllContacts?.();
    assert.equal(exactNotice(h.f, 'Brak nowych osob do dopisania.')?.level, 'info');
    store.setContacts([contact('Fred'), contact('Grault')]);
    handlers.onAddAllContacts?.();
    assert.equal(
      exactNotice(h.f, 'Dopisano nowe osoby do ksiazki. Liczba dodanych: 1. Liczba osob w ksiazce: 2.')?.level,
      'success',
    );

    handlers.onClearAliases?.();
    assert.equal(
      exactNotice(h.f, 'Wyczyszczono lokalne lustro aliasow. Aliasy na serwerze zostaly bez zmian.')?.level,
      'success',
    );
    handlers.onClearAddressBook?.();
    assert.equal(
      exactNotice(h.f, 'Wyczyszczono cala ksiazke adresowa (imiona, grupy, aliasy).')?.level,
      'success',
    );
  } finally {
    downloadModule.downloadBlob = originalDownload;
    await restore();
  }
});

test('etap 11 S20: advisory wskazuje odbiorcow i kontynuacje wysylki', async () => {
  const originalSend = EditorSession.prototype.send;
  EditorSession.prototype.send = () => Promise.resolve({ result: 'zaniechany' });
  const { h, handlers, restore } = await startCaptured();
  try {
    handlers.onSendCompose(SEND_INPUT);
    await h.waitFor(
      () => exactNotice(
        h.f,
        'Odbiorcy spoza zapisanej bazy: Thud. Wysylka bedzie kontynuowana, a serwer zweryfikuje ich nazwy.',
      )?.level === 'warning',
      'pelny advisory',
    );
    await h.waitFor(() => exactNotice(h.f, 'Przerwano wysylke listu.') !== undefined, 'koniec wysylki');
  } finally {
    EditorSession.prototype.send = originalSend;
    await restore();
  }
});

test('etap 11 S18: wysylka rozroznia adresata, timeout, znany blad i fallback', async () => {
  const originalSend = EditorSession.prototype.send;
  let outcome: ComposeOutcome = { result: 'zaniechany' };
  let failure: Error | null = null;
  EditorSession.prototype.send = () => failure
    ? Promise.reject(failure)
    : Promise.resolve(outcome);
  const { h, handlers, restore } = await startCaptured();
  try {
    const cases: Array<[ComposeOutcome, string]> = [
      [
        { result: 'blad', error: { kind: 'brak-adresata', adresat: 'thud' } },
        'Nie ma takiego adresata: thud.',
      ],
      [
        { result: 'blad', error: { kind: 'timeout' } },
        'Serwer nie odpowiedzial na czas. Sprobuj ponownie.',
      ],
      [
        { result: 'blad', error: { kind: 'zly-numer', numer: 7 } },
        'Zly numer listu: 7.',
      ],
      [
        { result: 'blad', error: { kind: 'brak-wyboru' } },
        'Zadne listy nie zostaly wybrane.',
      ],
    ];
    for (const [nextOutcome, text] of cases) {
      outcome = nextOutcome;
      handlers.onSendCompose(SEND_INPUT);
      await h.waitFor(() => exactNotice(h.f, text)?.level === 'error', `wysylka: ${text}`);
    }
    failure = new Error('transport offline');
    handlers.onSendCompose(SEND_INPUT);
    await h.waitFor(
      () => exactNotice(h.f, 'Nie udalo sie wyslac listu. Sprobuj ponownie.')?.level === 'error',
      'fallback wysylki',
    );
  } finally {
    EditorSession.prototype.send = originalSend;
    await restore();
  }
});

test('etap 11 S19 S21: przekazanie rozroznia bledy i opisuje zapis w niewyslanych', async () => {
  const originalForward = PagerSession.prototype.forwardLetter;
  let outcome: ForwardResult = { queued: false, error: null };
  let failure: Error | null = null;
  PagerSession.prototype.forwardLetter = () => failure
    ? Promise.reject(failure)
    : Promise.resolve(outcome);
  const { h, handlers, store, restore } = await startCaptured();
  try {
    await loadTruncatedBox(h);
    const previousStamp = store.state.boxes.odebrane?.entries[0]?.ctx?.stamp;
    handlers.onRefreshBox('odebrane');
    await h.waitFor(
      () => h.f.sent.filter((line) => line === 'listy odebrane').length >= 2,
      'swiezy listing do przekazania',
    );
    h.f.fire('Listy odebrane:', 'mail');
    h.f.fire(' 1. *R* Temat: najnowszy', 'mail');
    h.f.fire('Nadawca: Corge                       Wt, 24 VIII 1999, 00:11:12', 'mail');
    h.f.fire('> ', 'prompt');
    await h.waitFor(
      () => {
        const stamp = store.state.boxes.odebrane?.entries[0]?.ctx?.stamp;
        return stamp !== undefined && stamp !== previousStamp;
      },
      'wpis w biezacym kontekcie listingu',
    );
    const entry = store.state.boxes.odebrane?.entries[0];
    assert.ok(entry, 'wpis do przekazania');
    const forward = (): void => handlers.onForwardLetter('odebrane', entry!, 'Thud');
    const cases: Array<[ForwardResult, string]> = [
      [
        { queued: false, error: { kind: 'brak-adresata', adresat: 'thud' } },
        'Nie ma takiego adresata: thud.',
      ],
      [
        { queued: false, error: { kind: 'zly-numer', numer: 7 } },
        'Zly numer listu: 7.',
      ],
      [
        { queued: false, error: null },
        'Nie udalo sie przekazac listu. Sprobuj ponownie.',
      ],
    ];
    for (const [nextOutcome, text] of cases) {
      outcome = nextOutcome;
      forward();
      await h.waitFor(() => exactNotice(h.f, text)?.level === 'error', `przekazanie: ${text}`);
    }
    failure = new Error('timeout: pager session list 1');
    forward();
    await h.waitFor(
      () => exactNotice(h.f, 'Serwer nie odpowiedzial na czas. Sprobuj ponownie.')?.level === 'error',
      'timeout przekazania',
    );
    failure = new Error('transport offline');
    forward();
    await h.waitFor(
      () => exactNotice(h.f, 'Nie udalo sie przekazac listu. Sprobuj ponownie.')?.level === 'error',
      'fallback przekazania',
    );
    failure = null;
    outcome = { queued: true, error: null };
    forward();
    await h.waitFor(
      () => exactNotice(h.f, 'Przekazany list zapisany w niewyslanych.')?.level === 'success',
      'sukces przekazania',
    );
  } finally {
    PagerSession.prototype.forwardLetter = originalForward;
    await restore();
  }
});

test('etap 11 S44: brak mozliwosci odnalezienia listu ma jeden neutralny komunikat', async () => {
  const { h, handlers, restore } = await startCaptured();
  try {
    const entry: MailboxEntry = {
      number: 1,
      isRead: true,
      subject: 'Bez daty',
      forwarded: false,
      party: 'Fred',
      partyKind: 'nadawca',
      date: null,
    };
    const before = h.f.sent.length;
    handlers.onOpenLetter('odebrane', entry);
    await h.waitFor(
      () => exactNotice(h.f, 'Nie mozna odnalezc tego listu - odswiez skrzynke.')?.level === 'warning',
      'neutralny komunikat odczytu',
    );
    assert.equal(h.f.sent.length, before, 'brak komendy bez pewnej lokalizacji listu');
    const source = readFileSync(join(process.cwd(), 'src/arkmail/index.ts'), 'utf8');
    assert.equal((source.match(/Nie mozna odnalezc tego listu - odswiez skrzynke\./g) ?? []).length, 2);
    assert.doesNotMatch(source, /Nie moge znalezc tego listu|Nie ma tego listu na liscie/);
  } finally {
    await restore();
  }
});

test('etap 11 T25: komentarze i protokol opisuja przecinki oraz spacje bez zastepowania', () => {
  const render = readFileSync(join(process.cwd(), 'src/arkmail/ui/render.ts'), 'utf8');
  const compose = readFileSync(join(process.cwd(), 'src/arkmail/core/composeValidation.ts'), 'utf8');
  const ghost = readFileSync(join(process.cwd(), 'src/arkmail/ui/ghost.ts'), 'utf8');
  const protocol = readFileSync(join(process.cwd(), 'docs/PROTOCOL.md'), 'utf8');
  assert.doesNotMatch(render, /Import ZAMIENIA pule|serwer rozbija odbiorcow po przecinkach/);
  assert.match(render, /Import DOPISUJE nowe osoby/);
  assert.match(render, /serwer akceptuje przecinki i spacje/);
  assert.match(compose, /Rozpoznaje przecinki i spacje/);
  assert.match(ghost, /przecinkach i spacjach/);
  assert.match(protocol, /rozdzielonych przecinkami\s+albo spacjami/);
  assert.match(protocol, /Log nie\s+rozstrzyga, czy jest to nazwa gracza czy alias/);
  assert.match(protocol, /Testy lokalne sprawdzają obsługę nazwanych przypadków przez plugin/);
});
