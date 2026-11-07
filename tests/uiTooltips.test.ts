/**
 * Fala UI-2 krok 6: tooltipy klawiszy - spojnosc, prostota, zero zargonu.
 *
 * Zgloszenie: tooltipy maja byc "spojne, poprawne, proste, bez zargonu".
 * Slownictwo zatwierdzone w tej fali: "baza osob" (import zapamietani/
 * przedstawieni NIE tworzy grup), "grupa" (ksiazka adresowa pluginu),
 * "alias pocztowy" (alias z gry, rozwija go serwer przy wysylce).
 * "Wpisz szukana fraze w dopelniaczu (kogo? czego?)." (etap 9, S38).
 *
 * Guard pilnuje regresji:
 *  - KAZDY przycisk w KAZDYM widoku ma niepusty tooltip;
 *  - tooltip czyszczenia danych mowi, ze grupy/importy zostaja;
 *  - uzbrojone kasowanie: jednolity schemat "Dwuklik: pierwszy klik
 *    pyta o potwierdzenie, drugi ..." (zero "uzbraja" w tooltipach);
 *  - zakazany zargon techniczny nie wystepuje w tooltipach;
 *  - tooltipy sa czysto ASCII (klient bez diakrytyk).
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Window } from 'happy-dom';

import { mountMailUi } from '../src/arkmail/ui/render';
import { MailUiStore } from '../src/arkmail/ui/store';

const window = new Window();
const document = window.document;

/** Widoki do audytu: zakladki + oba sub-widoki Kontaktow. */
function collectTitles(): { titles: string[]; buttons: string[] } {
  const container = document.createElement('div');
  const noop = () => {};
  const s = new MailUiStore();
  mountMailUi(container as unknown as HTMLElement, s, {
    onOpenLetter: noop,
    onSendCompose: noop,
    onCloseLetter: noop,
    onRefreshBox: noop,
    onLoadOlder: noop,
    onLoadAll: noop,
    onSearch: noop,
    onClearSearch: noop,
    onDeleteLetter: noop,
    onForwardLetter: noop,
  } as never);

  const titles: string[] = [];
  const buttons: string[] = [];
  // Grupa w stanie: przycisk kasowania pojedynczej grupy renderuje sie
  // tylko dla istniejacej grupy (delAll zawsze jest).
  s.setGroups([{ name: 'Zgrupowanie', members: ['Fred', 'Grault'] }]);
  const sweep = (): void => {
    for (const el of Array.from(
      container.querySelectorAll('[title]') as unknown as Array<{ getAttribute(n: string): string | null }>,
    )) {
      const t = (el.getAttribute('title') ?? '').trim();
      if (t) titles.push(t);
    }
    for (const el of Array.from(
      container.querySelectorAll('button') as unknown as Array<{
        getAttribute(n: string): string | null;
        textContent?: string | null;
      }>,
    )) {
      buttons.push((el.getAttribute('title') ?? '').trim());
    }
  };

  for (const tab of ['listy', 'archiwum', 'kontakty', 'usuwanie', 'napisz']) {
    s.setTab(tab as never);
    if (tab === 'kontakty') {
      const subs = Array.from(
        container.querySelectorAll('.arkmail-subpill') as unknown as Array<{ click(): void }>,
      );
      for (const sub of subs) {
        sub.click();
        sweep();
      }
    } else {
      sweep();
    }
  }
  return { titles, buttons };
}

test('tooltipy: kazdy przycisk w kazdym widoku ma niepusty tooltip', () => {
  const { buttons } = collectTitles();
  assert.ok(buttons.length > 30, `audyt obejmuje przyciski (znaleziono: ${buttons.length})`);
  assert.deepEqual(
    buttons.filter((t) => t === ''),
    [],
    'przyciski bez tooltipu - fillButtonTitles ma wypelniac z etykiety',
  );
});

test('tooltipy: czyszczenie danych mowi, ze grupy i ksiazka zostaja', () => {
  const { titles } = collectTitles();
  const wipe = titles.find((t) => t.includes('Kasuje lokalnie'));
  assert.ok(wipe, 'tooltip czyszczenia istnieje');
  assert.ok(
    wipe.includes('Ustawienia, grupy i ksiazka adresowa zostaja. Aliasy pobierzesz z gry ponownie.'),
    `tooltip czyszczenia zawiera zdanie o grupach/ksiazce: ${wipe}`,
  );
});

test('tooltipy: pole osoby wyjasnia fraze i dopelniacz', () => {
  const { titles } = collectTitles();
  assert.ok(
    titles.includes('Wpisz szukana fraze w dopelniaczu (kogo? czego?).'),
    'tooltip pola osoby w szukajce serwerowej zgodny z S38',
  );
});

test('tooltipy: uzbrojone kasowanie - jednolity schemat dwukliku', () => {
  const { titles } = collectTitles();
  const armed = titles.filter((t) => t.startsWith('Dwuklik'));
  assert.ok(armed.length >= 2, `audyt obejmuje uzbrojone kasowanie (znaleziono: ${armed.length})`);
  for (const t of armed) {
    assert.ok(
      t.startsWith('Dwuklik: pierwszy klik pyta o potwierdzenie, drugi '),
      `tooltip dwukliku w jednolitym schemacie: ${t}`,
    );
    assert.ok(!/uzbraj/i.test(t), `zero "uzbraja" w tooltipach: ${t}`);
  }
});

test('tooltipy: import osob - slownictwo zatwierdzone', () => {
  const { titles } = collectTitles();
  const byKind = (kind: string): string => {
    const container = document.createElement('div');
    const noop = () => {};
    const s = new MailUiStore();
    mountMailUi(container as unknown as HTMLElement, s, {
      onOpenLetter: noop,
      onSendCompose: noop,
      onCloseLetter: noop,
      onRefreshBox: noop,
      onLoadOlder: noop,
      onLoadAll: noop,
      onSearch: noop,
      onClearSearch: noop,
      onDeleteLetter: noop,
      onForwardLetter: noop,
    } as never);
    s.setTab('kontakty' as never);
    // Zgloszenie 2026-11-05 (K7): przyciski importu stoja w pigulce
    // Import i eksport, nie w Ksiazce.
    for (const sub of Array.from(
      container.querySelectorAll('.arkmail-subpill') as unknown as Array<{ click(): void }>,
    )) {
      sub.click();
      const found = container.querySelector(`[data-import="${kind}"]`);
      if (found) break;
    }
    const btn = container.querySelector(`[data-import="${kind}"]`) as {
      getAttribute(n: string): string | null;
    } | null;
    assert.ok(btn, `przycisk importu ${kind} istnieje`);
    return btn.getAttribute('title') ?? '';
  };
  for (const kind of ['zapamietani', 'przedstawieni']) {
    const t = byKind(kind);
    assert.ok(t.includes('dopisuje nowe do ksiazki adresowej'), `import ${kind} mowi o dopisywaniu do ksiazki: ${t}`);
    assert.ok(t.includes('Istniejacych osob nie usuwa'), `import ${kind} wyklucza usuwanie: ${t}`);
    assert.ok(t.includes('Grup nie tworzy'), `import ${kind} wyjasnia, ze grup nie tworzy: ${t}`);
  }
  assert.ok(byKind('aliasy').includes('aliasy pocztowe'), 'import aliasow uzywa slownictwa');
  void titles;
});

test('tooltipy: zero zargonu technicznego', () => {
  const { titles } = collectTitles();
  const JARGON = [
    'gmcp',
    'pager',
    'modal',
    'transport',
    'storage',
    'cache',
    'watchdog',
    'indexeddb',
    'prompt',
    'plugin',
    'api',
    'hook',
    'trigger',
  ];
  const hits: string[] = [];
  for (const t of titles) {
    const lower = t.toLowerCase();
    for (const word of JARGON) {
      // Granice slowa: "Napisz" zawiera "api" jako podslowo i jest OK.
      if (new RegExp(`\\b${word}\\b`).test(lower)) hits.push(`${word}: ${t}`);
    }
  }
  assert.deepEqual(hits, [], `zargon techniczny w tooltipach:\n${hits.join('\n')}`);
});

test('tooltipy: czysty ASCII (klient bez diakrytyk)', () => {
  const { titles } = collectTitles();
  const hits = titles.filter((t) => /[^\x20-\x7E]/.test(t));
  assert.deepEqual(hits, [], `tooltipy z diakrytykami/poza ASCII:\n${hits.join('\n')}`);
});
