/**
 * Ghost-podpowiedzi (Fala 9g): wyszarzona sugestia za kursorem,
 * strzalka w prawo wpisuje calosc. Jeden wariant, zero przelacznikow -
 * wzorzec z klienta Dargoth (src/web/commandInput/CommandLine.tsx):
 * niewidzialny span powtarza wpisany tekst (ulozenie 1:1 z polem),
 * za nim przytlumiony suffix kandydata.
 *
 * Warunki pokazania: kursor na koncu pola, kandydat ma prefiks rowny
 * wpisanemu tekstowi (bez wzgledu na wielkosc liter) i jest dluzszy.
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
   * Tryb segmentu dla pol wieloodbiorczych (adresat/DW): dopasowanie
   * i akceptacja dzialaja po ostatnim przecinku - "Fred, Gr"
   * dopelnia tylko "Gr", reszta pola zostaje nietknieta.
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
  let escapeHidden = false;

  const hide = (): void => {
    candidate = null;
    ghost.style.display = 'none';
  };

  /** W trybie segmentu: czesc pola do ostatniego przecinka (z przecinkiem). */
  const splitHead = (value: string): string => {
    if (!opts?.segment) return '';
    const idx = value.lastIndexOf(',');
    if (idx === -1) return '';
    // Segment zaczyna sie PO odstepach za przecinkiem - inaczej dopasowanie
    // dostaje spacje na poczatku i "fred, Gr" nigdy sie nie uklada.
    let end = idx + 1;
    while (value[end] === ' ') end += 1;
    return value.slice(0, end);
  };

  const update = (): void => {
    escapeHidden = false;
    const value = input.value;
    const atEnd =
      input.selectionStart === value.length && input.selectionEnd === value.length;
    const head = atEnd ? splitHead(value) : '';
    const segment = value.slice(head.length);
    candidate =
      segment.length > 0 && atEnd
        ? (source()
            .map((c) => (typeof c === 'string' ? ({ text: c } as GhostCandidate) : c))
            .find(
              (c) =>
                c.text.length > segment.length &&
                c.text.toLowerCase().startsWith(segment.toLowerCase()),
            ) ?? null)
        : null;
    if (!candidate) {
      ghost.style.display = 'none';
      return;
    }
    typed.textContent = value;
    rest.textContent = candidate.text.slice(segment.length);
    ghost.style.display = '';
  };

  input.addEventListener('input', update);
  input.addEventListener('focus', update);
  input.addEventListener('blur', hide);
  input.addEventListener('keydown', (ev) => {
    if (ev.key === 'ArrowRight' && candidate && !escapeHidden) {
      const value = input.value;
      if (input.selectionStart === value.length && input.selectionEnd === value.length) {
        ev.preventDefault();
        // Grupa: wstawiamy czlonkow rozwinietych po przecinku; osoba
        // i alias: kanoniczna forma segmentu. Glowa pola (przed
        // ostatnim przecinkiem) zostaje nietknieta.
        const head = splitHead(value);
        const insert = candidate.expand ?? candidate.text;
        input.value = head + insert;
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
