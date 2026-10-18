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

/** Dostawca kandydatow - wywolywany na kazde przeliczenie (swiezy stan). */
export type GhostSource = () => readonly string[];

export function attachGhost(
  doc: Document,
  input: HTMLInputElement,
  source: GhostSource,
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

  let candidate: string | null = null;
  let escapeHidden = false;

  const hide = (): void => {
    candidate = null;
    ghost.style.display = 'none';
  };

  const update = (): void => {
    escapeHidden = false;
    const value = input.value;
    const atEnd =
      input.selectionStart === value.length && input.selectionEnd === value.length;
    candidate =
      value.length > 0 && atEnd
        ? (source().find(
            (c) => c.length > value.length && c.toLowerCase().startsWith(value.toLowerCase()),
          ) ?? null)
        : null;
    if (!candidate) {
      ghost.style.display = 'none';
      return;
    }
    typed.textContent = value;
    rest.textContent = candidate.slice(value.length);
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
        input.value = candidate;
        input.selectionStart = candidate.length;
        input.selectionEnd = candidate.length;
        hide();
      }
    } else if (ev.key === 'Escape' && candidate) {
      escapeHidden = true;
      ghost.style.display = 'none';
    }
  });
}
