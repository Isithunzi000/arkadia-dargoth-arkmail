/**
 * Fala 18d (zgloszenie 2026-10-20 pkt 2): masowe pobieranie tresci do
 * archiwum pokazuje pasek postepu i ETA zamiast samego "(X/Y)".
 * - pasek .arkmail-busy-track/.arkmail-busy-bar pod tekstem busy,
 *   width = done/total;
 * - ETA liczone EMA po czasach ukonczen kolejnych listow (fetch +
 *   pacing), pokazywane od 3 ukonczonych (wczesniej zbyt halasliwe);
 * - format: "zostalo ok. X s" (<45 s) albo "zostalo ok. X min",
 *   minimum 1 s;
 * - petle bez znanego total (Wczytaj wszystkie, indeksacja) zostaja
 *   przy samym liczniku stron - bez paska.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Window } from 'happy-dom';

import {
  startHarness,
  stopHarness,
  waitRt,
  click,
  notifyText,
} from './harness';
import { mountMailUi, type MailUiHandlers } from '../src/arkmail/ui/render';
import { MailUiStore } from '../src/arkmail/ui/store';
import {
  clearWaitDiagnostics,
  readWaitDiagnostics,
} from '../src/arkmail/core/timing';

const HANDLERS = {
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
} as unknown as MailUiHandlers;

const mountBusy = (
  archiveDownload: { done: number; total: number; etaMs: number | null } | null,
): { container: unknown; off: () => void } => {
  const window = new Window();
  (globalThis as { document?: unknown }).document = window.document;
  const store = new MailUiStore({});
  const container = window.document.createElement('div');
  const off = mountMailUi(container as unknown as HTMLElement, store, HANDLERS);
  store.setBusy('Pobieram tresci do archiwum...');
  store.setArchiveDownload(archiveDownload);
  return { container, off };
};

test('pasek postepu: bez petli pobierania tylko tekst (jak dotad)', () => {
  try {
    const { container, off } = mountBusy(null);
    try {
      const c = container as { querySelector(s: string): unknown };
      assert.ok(c.querySelector('.arkmail-busy'), 'pasek busy z tekstem');
      assert.ok(!c.querySelector('.arkmail-busy-bar'), 'bez paska postepu');
    } finally {
      off();
    }
  } finally {
    delete (globalThis as { document?: unknown }).document;
  }
});

test('pasek postepu: width procentowe + ETA w sekundach', () => {
  try {
    const { container, off } = mountBusy({ done: 2, total: 5, etaMs: 9000 });
    try {
      const c = container as { querySelector(s: string): unknown };
      const bar = c.querySelector('.arkmail-busy-bar') as unknown as {
        style?: { width?: string };
      } | null;
      assert.ok(bar, 'pasek postepu widoczny');
      assert.equal(bar.style?.width, '40%', 'width = done/total');
      const busy = c.querySelector('.arkmail-busy') as unknown as {
        textContent?: string;
      } | null;
      assert.ok(
        String(busy?.textContent ?? '').includes('zostalo ok. 9 s'),
        'ETA w sekundach w tekscie busy',
      );
    } finally {
      off();
    }
  } finally {
    delete (globalThis as { document?: unknown }).document;
  }
});

test('pasek postepu: bez ETA (done < 3) pasek jest, tekst bez "zostalo"', () => {
  try {
    const { container, off } = mountBusy({ done: 1, total: 4, etaMs: null });
    try {
      const c = container as { querySelector(s: string): unknown };
      assert.ok(c.querySelector('.arkmail-busy-bar'), 'pasek widoczny bez ETA');
      const busy = c.querySelector('.arkmail-busy') as unknown as {
        textContent?: string;
      } | null;
      assert.ok(
        !String(busy?.textContent ?? '').includes('zostalo'),
        'bez tekstu ETA przed 3 ukonczonymi',
      );
    } finally {
      off();
    }
  } finally {
    delete (globalThis as { document?: unknown }).document;
  }
});

test('pasek postepu: ETA >= 45 s pokazywane w minutach', () => {
  try {
    const { container, off } = mountBusy({ done: 3, total: 10, etaMs: 120000 });
    try {
      const c = container as { querySelector(s: string): unknown };
      const busy = c.querySelector('.arkmail-busy') as unknown as {
        textContent?: string;
      } | null;
      assert.ok(
        String(busy?.textContent ?? '').includes('zostalo ok. 2 min'),
        'ETA w minutach',
      );
    } finally {
      off();
    }
  } finally {
    delete (globalThis as { document?: unknown }).document;
  }
});

/** Prolog z 4 listami (obciety listing) + puste nieprzeczytane. */
async function loadBox4(h: import('./harness').Harness): Promise<void> {
  const { f } = h;
  f.fire(' [ POCZTA ] Masz nowa poczte od Foo.');
  await h.waitFor(() => f.sent.includes('listy odebrane'), 'komenda listy odebrane');
  f.fire('Listy odebrane (prezentowane jest pierwsze 50):', 'mail');
  f.fire(' 4. *R* Temat: czwarty', 'mail');
  f.fire('Nadawca: Foo                        So, 21 VIII 1999, 09:00:00', 'mail');
  f.fire(' 3. *R* Temat: najstarszy', 'mail');
  f.fire('Nadawca: Foo                        Nd, 22 VIII 1999, 01:15:04', 'mail');
  f.fire(' 2. *R* Temat: srodkowy', 'mail');
  f.fire('Nadawca: Foo                        Pn, 23 VIII 1999, 02:20:05', 'mail');
  f.fire(' 1. *R* Temat: najnowszy', 'mail');
  f.fire('Nadawca: Corge                       Wt, 24 VIII 1999, 00:11:12', 'mail');
  f.fire('> ', 'prompt');
  await h.waitFor(() => f.sent.includes('listy nieprzeczytane'), 'komenda listy nieprzeczytane');
  f.fire('Nie masz zadnych nieprzeczytanych listow.', 'mail');
  await h.waitFor(() => !!h.content.querySelector('.arkmail-older'), 'przycisk Wczytaj starsze');
  await h.waitFor(() => ((h.content.querySelector('.arkmail-busy') as { textContent?: string | null } | null)?.textContent ?? 'missing') === '', 'koniec sesji prologu');
}

function replayListing4(h: import('./harness').Harness): void {
  const { f } = h;
  f.fire('Listy odebrane (prezentowane jest pierwsze 50):', 'mail');
  f.fire(' 4. *R* Temat: czwarty', 'mail');
  f.fire('Nadawca: Foo                        So, 21 VIII 1999, 09:00:00', 'mail');
  f.fire(' 3. *R* Temat: najstarszy', 'mail');
  f.fire('Nadawca: Foo                        Nd, 22 VIII 1999, 01:15:04', 'mail');
  f.fire(' 2. *R* Temat: srodkowy', 'mail');
  f.fire('Nadawca: Foo                        Pn, 23 VIII 1999, 02:20:05', 'mail');
  f.fire(' 1. *R* Temat: najnowszy', 'mail');
  f.fire('Nadawca: Corge                       Wt, 24 VIII 1999, 00:11:12', 'mail');
  f.fire('> ', 'prompt');
}

function replayLetterAt(
  h: import('./harness').Harness,
  numer: number,
  subject: string,
  date: string,
): void {
  const { f } = h;
  f.fire(`List : ${numer}`, 'mail');
  f.fire('Od   : Foo', 'mail');
  f.fire(`Temat: ${subject}`, 'mail');
  f.fire(`Data : ${date}`, 'mail');
  f.fire('', 'mail');
  f.fire(`Tresc: ${subject}.`, 'mail');
  f.fire(`[1-50 adefFhHmnqrsRux.!?-+<>] (aktualny: ${numer}) -- `, 'mail');
  f.fire('> ', 'prompt');
}

test('pobieranie tresci: pasek rosnie w trakcie, ETA po 3 ukonczonych', async () => {
  const h = await startHarness();
  const { f } = h;
  try {
    await loadBox4(h);
    click(h, '[data-tab="archiwum"]');
    await waitRt(() => !!h.content.querySelector('.arkmail-arch-download'), 'przycisk pobierania');
    click(h, '.arkmail-arch-download'); // uzbrojenie
    click(h, '.arkmail-arch-download'); // start
    // Petla uzyje czterech wpisow z aktualnej bazy.
    // 1. list (re-kotwica przed dniem po dacie listu).
    await waitRt(() => f.sent.includes('listy odebrane przed 25 VIII 1999'), 'kotwica 1');
    replayListing4(h);
    await waitRt(() => f.sent.includes('przeczytaj list 1'), 'odczyt 1');
    replayLetterAt(h, 1, 'najnowszy', 'Wt, 24 VIII 1999, 00:11:12');
    // Pasek widoczny w trakcie: 1/4 = 25%.
    await waitRt(() => {
      const bar = h.content.querySelector('.arkmail-busy-bar') as unknown as {
        style?: { width?: string };
      } | null;
      return bar?.style?.width === '25%';
    }, 'pasek 25% po pierwszym liscie');
    // 2. i 3. list.
    await waitRt(() => f.sent.includes('listy odebrane przed 24 VIII 1999'), 'kotwica 2');
    replayListing4(h);
    await waitRt(() => f.sent.includes('przeczytaj list 2'), 'odczyt 2');
    replayLetterAt(h, 2, 'srodkowy', 'Pn, 23 VIII 1999, 02:20:05');
    await waitRt(() => f.sent.includes('listy odebrane przed 23 VIII 1999'), 'kotwica 3');
    replayListing4(h);
    await waitRt(() => f.sent.includes('przeczytaj list 3'), 'odczyt 3');
    replayLetterAt(h, 3, 'najstarszy', 'Nd, 22 VIII 1999, 01:15:04');
    // Po 3 ukonczonych ETA pojawia sie w tekscie busy (pacing petli
    // daje realne tempo, minimum "1 s").
    await waitRt(() => {
      const busy = h.content.querySelector('.arkmail-busy') as unknown as {
        textContent?: string;
      } | null;
      return String(busy?.textContent ?? '').includes('zostalo ok.');
    }, 'ETA po trzech ukonczonych');
    // 4. list - koniec petli.
    await waitRt(() => f.sent.includes('listy odebrane przed 22 VIII 1999'), 'kotwica 4');
    replayListing4(h);
    await waitRt(() => f.sent.includes('przeczytaj list 4'), 'odczyt 4');
    replayLetterAt(h, 4, 'czwarty', 'So, 21 VIII 1999, 09:00:00');
    await waitRt(() => notifyText(f, 'Pobrano tresci do archiwum'), 'koniec pobierania');
    await waitRt(() => ((h.content.querySelector('.arkmail-busy') as { textContent?: string | null } | null)?.textContent ?? 'missing') === '', 'pasek busy zgaszony');
  } finally {
    await stopHarness();
  }
});


test('pobieranie: pauza po rekordzie uzywa jednego timera 400 ms', async () => {
  const h = await startHarness();
  const { f } = h;
  const realSetTimeout = globalThis.setTimeout;
  const realClearTimeout = globalThis.clearTimeout;
  const timers: Array<{ ms: number; cancelled: boolean }> = [];
  try {
    await loadBox4(h);
    click(h, '[data-tab="archiwum"]');
    click(h, '.arkmail-arch-download');
    click(h, '.arkmail-arch-download');
    await waitRt(() => f.sent.includes('listy odebrane przed 25 VIII 1999'), 'kotwica przed pauza');
    replayListing4(h);
    await waitRt(() => f.sent.includes('przeczytaj list 1'), 'odczyt przed pauza');
    replayLetterAt(h, 1, 'najnowszy', 'Wt, 24 VIII 1999, 00:11:12');

    globalThis.setTimeout = ((callback: (...args: unknown[]) => void, ms = 0, ...args: unknown[]) => {
      const timer = { ms, cancelled: false };
      timers.push(timer);
      realSetTimeout(() => {
        if (!timer.cancelled) callback(...args);
      }, 0);
      return timer as unknown as ReturnType<typeof setTimeout>;
    }) as typeof setTimeout;
    globalThis.clearTimeout = ((timer: ReturnType<typeof setTimeout>) => {
      (timer as unknown as { cancelled: boolean }).cancelled = true;
    }) as typeof clearTimeout;

    for (let index = 0; index < 100 && timers.length === 0; index += 1) {
      await new Promise((resolve) => realSetTimeout(resolve, 0));
    }
    assert.deepEqual(timers.map((timer) => timer.ms), [400], 'jedna pauza zamiast osmiu timerow po 50 ms');
  } finally {
    globalThis.setTimeout = realSetTimeout;
    globalThis.clearTimeout = realClearTimeout;
    await stopHarness();
  }
});

test('pobieranie: zmiana widocznosci usuwa stara probke ETA z UI', async () => {
  const h = await startHarness();
  const { f } = h;
  try {
    await loadBox4(h);
    click(h, '[data-tab="archiwum"]');
    click(h, '.arkmail-arch-download');
    click(h, '.arkmail-arch-download');

    await waitRt(() => f.sent.includes('listy odebrane przed 25 VIII 1999'), 'widocznosc: kotwica 1');
    replayListing4(h);
    await waitRt(() => f.sent.includes('przeczytaj list 1'), 'widocznosc: odczyt 1');
    replayLetterAt(h, 1, 'najnowszy', 'Wt, 24 VIII 1999, 00:11:12');
    await waitRt(() => f.sent.includes('listy odebrane przed 24 VIII 1999'), 'widocznosc: kotwica 2');
    replayListing4(h);
    await waitRt(() => f.sent.includes('przeczytaj list 2'), 'widocznosc: odczyt 2');
    replayLetterAt(h, 2, 'srodkowy', 'Pn, 23 VIII 1999, 02:20:05');
    await waitRt(() => f.sent.includes('listy odebrane przed 23 VIII 1999'), 'widocznosc: kotwica 3');
    replayListing4(h);
    await waitRt(() => f.sent.includes('przeczytaj list 3'), 'widocznosc: odczyt 3');
    replayLetterAt(h, 3, 'najstarszy', 'Nd, 22 VIII 1999, 01:15:04');
    await waitRt(() => {
      const busy = h.content.querySelector('.arkmail-busy') as { textContent?: string } | null;
      return String(busy?.textContent ?? '').includes('zostalo ok.');
    }, 'stara probka ETA przed zmiana widocznosci');

    h.window.document.dispatchEvent(new h.window.Event('visibilitychange'));
    const busy = h.content.querySelector('.arkmail-busy') as { textContent?: string } | null;
    assert.ok(
      !String(busy?.textContent ?? '').includes('zostalo ok.'),
      'zmiana widocznosci natychmiast usuwa stara prognoze',
    );
  } finally {
    await stopHarness();
  }
});


test('pobieranie: opozniona pauza wysyla jedna kolejna komende bez nadrabiania', async () => {
  const h = await startHarness();
  const { f } = h;
  const realSetTimeout = globalThis.setTimeout;
  const realClearTimeout = globalThis.clearTimeout;
  const timers: Array<{ callback: () => void; ms: number; cancelled: boolean }> = [];
  try {
    clearWaitDiagnostics();
    await loadBox4(h);
    click(h, '[data-tab="archiwum"]');
    click(h, '.arkmail-arch-download');
    click(h, '.arkmail-arch-download');
    await waitRt(() => f.sent.includes('listy odebrane przed 25 VIII 1999'), 'opoznienie: kotwica 1');
    replayListing4(h);
    await waitRt(() => f.sent.includes('przeczytaj list 1'), 'opoznienie: odczyt 1');
    replayLetterAt(h, 1, 'najnowszy', 'Wt, 24 VIII 1999, 00:11:12');

    globalThis.setTimeout = ((callback: () => void, ms = 0) => {
      const timer = { callback, ms, cancelled: false };
      timers.push(timer);
      return timer as unknown as ReturnType<typeof setTimeout>;
    }) as typeof setTimeout;
    globalThis.clearTimeout = ((timer: ReturnType<typeof setTimeout>) => {
      (timer as unknown as { cancelled: boolean }).cancelled = true;
    }) as typeof clearTimeout;
    for (let index = 0; index < 100 && timers.length === 0; index += 1) {
      await new Promise((resolve) => realSetTimeout(resolve, 0));
    }
    assert.deepEqual(timers.map((timer) => timer.ms), [400]);

    const before = f.sent.length;
    await new Promise((resolve) => realSetTimeout(resolve, 35));
    timers[0]!.callback();
    globalThis.setTimeout = realSetTimeout;
    globalThis.clearTimeout = realClearTimeout;
    await waitRt(() => f.sent.length > before, 'jedna komenda po opoznionej pauzy');
    assert.deepEqual(f.sent.slice(before), ['listy odebrane przed 24 VIII 1999']);
    await new Promise((resolve) => realSetTimeout(resolve, 50));
    assert.deepEqual(
      f.sent.slice(before),
      ['listy odebrane przed 24 VIII 1999'],
      'opoznienie nie powoduje dodatkowych komend nadrabiajacych ani podtrzymujacych aktywnosc',
    );
    const diagnostic = readWaitDiagnostics().find((item) => item.stage === 'pobieranie');
    assert.equal(diagnostic?.plannedMs, 400);
    assert.ok((diagnostic?.actualMs ?? -1) >= 20, 'diagnostyka zawiera rzeczywiste opoznienie');
    assert.equal(diagnostic?.outcome, 'wykonano');
  } finally {
    globalThis.setTimeout = realSetTimeout;
    globalThis.clearTimeout = realClearTimeout;
    clearWaitDiagnostics();
    await stopHarness();
  }
});

test('pobieranie: anulowanie pauzy zdejmuje timer bez kolejnych komend', async () => {
  const h = await startHarness();
  const { f } = h;
  const realSetTimeout = globalThis.setTimeout;
  const realClearTimeout = globalThis.clearTimeout;
  const timers: Array<{ ms: number; cancelled: boolean }> = [];
  try {
    clearWaitDiagnostics();
    await loadBox4(h);
    click(h, '[data-tab="archiwum"]');
    click(h, '.arkmail-arch-download');
    click(h, '.arkmail-arch-download');
    await waitRt(() => f.sent.includes('listy odebrane przed 25 VIII 1999'), 'anulowanie: kotwica 1');
    replayListing4(h);
    await waitRt(() => f.sent.includes('przeczytaj list 1'), 'anulowanie: odczyt 1');
    replayLetterAt(h, 1, 'najnowszy', 'Wt, 24 VIII 1999, 00:11:12');

    globalThis.setTimeout = ((callback: (...args: unknown[]) => void, ms = 0, ...args: unknown[]) => {
      const timer = { ms, cancelled: false };
      timers.push(timer);
      realSetTimeout(() => {
        if (!timer.cancelled) callback(...args);
      }, 0);
      return timer as unknown as ReturnType<typeof setTimeout>;
    }) as typeof setTimeout;
    globalThis.clearTimeout = ((timer: ReturnType<typeof setTimeout>) => {
      (timer as unknown as { cancelled: boolean }).cancelled = true;
    }) as typeof clearTimeout;
    for (let index = 0; index < 100 && timers.length === 0; index += 1) {
      await new Promise((resolve) => realSetTimeout(resolve, 0));
    }
    assert.deepEqual(timers.map((timer) => timer.ms), [400]);

    const before = f.sent.length;
    click(h, '.arkmail-arch-download');
    globalThis.setTimeout = realSetTimeout;
    globalThis.clearTimeout = realClearTimeout;
    await waitRt(() => notifyText(f, 'Przerwano pobieranie'), 'anulowanie podczas pauzy');
    assert.equal(timers[0]?.cancelled, true, 'anulowanie wywoluje clearTimeout');
    await new Promise((resolve) => realSetTimeout(resolve, 50));
    assert.deepEqual(f.sent.slice(before), [], 'po anulowaniu nie ma zadnej kolejnej komendy');
    const diagnostic = readWaitDiagnostics().find((item) => item.stage === 'pobieranie');
    assert.equal(diagnostic?.plannedMs, 400);
    assert.equal(diagnostic?.outcome, 'anulowano');
  } finally {
    globalThis.setTimeout = realSetTimeout;
    globalThis.clearTimeout = realClearTimeout;
    clearWaitDiagnostics();
    await stopHarness();
  }
});

test('widocznosc: dezaktywacja postaci usuwa nasluch zdarzenia', async () => {
  const h = await startHarness();
  let removed = 0;
  const original = h.window.document.removeEventListener.bind(h.window.document) as (
    type: string,
    listener: unknown,
  ) => void;
  h.window.document.removeEventListener = ((type: string, listener: unknown) => {
    if (type === 'visibilitychange') removed += 1;
    original(type, listener);
  }) as unknown as typeof h.window.document.removeEventListener;
  await stopHarness();
  assert.equal(removed, 1, 'destroy usuwa dokladnie jeden nasluch widocznosci aktywnej postaci');
});
