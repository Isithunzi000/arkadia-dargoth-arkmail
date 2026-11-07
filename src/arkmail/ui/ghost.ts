/**
 * Ghost-podpowiedzi (Fala 9g): wyszarzona sugestia za kursorem,
 * strzalka w prawo wpisuje calosc. Jeden wariant, zero przelacznikow -
 * wzorzec z klienta Dargoth (src/web/commandInput/CommandLine.tsx):
 * niewidzialny span powtarza wpisany tekst (ulozenie 1:1 z polem),
 * za nim przytlumiony suffix kandydata.
 *
 * Warunki pokazania: kursor na koncu pola, a wybrany suffix jest
 * prefiksem kandydata lub jego dokladna nazwa (bez wielkosci liter).
 * Akceptacja (ArrowRight) wstawia KANONICZNA forme kandydata.
 * Blur chowa, Escape chowa do nastepnej zmiany tekstu.
 */

/**
 * Kandydat rozbudowany (Fala UI-2 krok 4): grupa ksiazki adresowej
 * podpowiada sie po nazwie, ale akceptacja WSTAWIA ROZWINIETA liste
 * czlonkow (Arkadia nie zna grup pluginu - w polu musza stanac
 * imiona po przecinku), nigdy samej nazwy grupy.
 */
export interface GhostCandidate {
  /** Kanoniczna forma segmentu (imie, alias albo nazwa grupy). */
  text: string;
  /** Grupa: zamiast text wstawiana jest lista czlonkow. */
  expand?: string;
}

/** Dostawca kandydatow - wywolywany na kazde przeliczenie (swiezy stan). */
export type GhostSource = () => readonly (string | GhostCandidate)[];

export interface GhostOptions {
  /**
   * Tryb segmentu dla pol wieloodbiorczych (adresat/DW): granice po
   * przecinkach i spacjach, najdluzszy suffix pasujacy do kandydata.
   * Akceptacja podmienia tylko ten suffix, reszta pola zostaje 1:1.
   */
  segment?: boolean;
}

export function attachGhost(
  doc: Document,
  input: HTMLInputElement,
  source: GhostSource,
  opts?: GhostOptions,
): void {
  // Owrapowanie: pozycja ghosta liczona wzgledem wrapa, nie rodzica.
  const wrap = doc.createElement('span');
  wrap.className = 'arkmail-ghost-wrap';
  input.parentNode?.insertBefore(wrap, input);
  wrap.appendChild(input);

  const ghost = doc.createElement('span');
  ghost.className = 'arkmail-ghost';
  ghost.style.display = 'none';
  const typed = doc.createElement('span');
  typed.className = 'arkmail-ghost-typed';
  const rest = doc.createElement('span');
  rest.className = 'arkmail-ghost-rest';
  ghost.appendChild(typed);
  ghost.appendChild(rest);
  wrap.appendChild(ghost);

  let candidate: GhostCandidate | null = null;
  let candidateHead = '';
  let candidateSegment = '';
  let candidateValue = '';
  let escapeHidden = false;

  const syncScroll = (): void => {
    ghost.scrollLeft = input.scrollLeft;
  };

  const hide = (): void => {
    candidate = null;
    ghost.style.display = 'none';
  };

  /**
   * Mozliwe poczatki suffixu, od najdluzszego do najkrotszego. Separator
   * i wszystkie spacje po nim naleza do glowy, wiec akceptacja nie zmieni
   * ich pisowni. Pusty suffix nigdy nie jest kandydatem.
   */
  const segmentStarts = (value: string): number[] => {
    if (value.length === 0) return [];
    if (!opts?.segment) return [0];
    const starts = [0];
    for (let idx = 0; idx < value.length; idx += 1) {
      if (value[idx] !== ',' && value[idx] !== ' ') continue;
      let start = idx + 1;
      while (value[start] === ' ') start += 1;
      if (start < value.length && !starts.includes(start)) starts.push(start);
    }
    return starts.sort((a, b) => a - b);
  };

  const update = (): void => {
    escapeHidden = false;
    syncScroll();
    candidate = null;
    candidateHead = '';
    candidateSegment = '';
    candidateValue = '';
    const value = input.value;
    const atEnd =
      input.selectionStart === value.length && input.selectionEnd === value.length;
    const candidates = atEnd
      ? source()
          .map((c) => (typeof c === 'string' ? ({ text: c } as GhostCandidate) : c))
          .map((c) => ({ ...c, text: c.text.trim() }))
          .filter((c) => c.text.length > 0)
      : [];
    for (const start of segmentStarts(value)) {
      const segment = value.slice(start);
      const key = segment.toLowerCase();
      // Przy tym samym suffixie dokladna nazwa wygrywa z dluzszym
      // prefiksem. find() zachowuje stabilna kolejnosc zrodla.
      const match = candidates.find((c) => c.text.toLowerCase() === key)
        ?? candidates.find(
          (c) => c.text.length > segment.length && c.text.toLowerCase().startsWith(key),
        );
      if (!match) continue;
      candidate = match;
      candidateHead = value.slice(0, start);
      candidateSegment = segment;
      candidateValue = value;
      break;
    }
    if (!candidate) {
      ghost.style.display = 'none';
      return;
    }
    typed.textContent = value;
    rest.textContent = candidate.text.slice(candidateSegment.length);
    ghost.style.display = '';
    syncScroll();
  };

  input.addEventListener('input', update);
  input.addEventListener('focus', update);
  input.addEventListener('scroll', syncScroll);
  input.addEventListener('blur', hide);
  input.addEventListener('keydown', (ev) => {
    if (ev.key === 'ArrowRight' && candidate && !escapeHidden) {
      const value = input.value;
      if (
        input.selectionStart === value.length &&
        input.selectionEnd === value.length &&
        candidateValue === value
      ) {
        ev.preventDefault();
        // Grupa: wstawiamy czlonkow rozwinietych po przecinku; osoba
        // i alias: kanoniczna forma segmentu. Akceptacja podmienia tylko
        // suffix wybrany przy ostatnim przeliczeniu, glowa zostaje 1:1.
        const insert = candidate.expand ?? candidate.text;
        input.value = candidateHead + insert;
        input.selectionStart = input.value.length;
        input.selectionEnd = input.value.length;
        // Fala 26a (zgloszenie 2026-10-22): akceptacja musi odpalic
        // 'input', bo draft szukajki (mkSearch w render.ts) aktualizuje
        // sie TYLKO tym eventem. Bez dispatchu draft zostawal przy
        // wpisanym prefiksie i pierwszy rerender przywracal go do pola
        // (banner wynikow: "Corge", pole: "cor").
        const view = doc.defaultView;
        input.dispatchEvent(
          view
            ? new view.Event('input', { bubbles: true })
            : new Event('input', { bubbles: true }),
        );
        hide();
      }
    } else if (ev.key === 'Escape' && candidate) {
      escapeHidden = true;
      ghost.style.display = 'none';
    }
  });
}
