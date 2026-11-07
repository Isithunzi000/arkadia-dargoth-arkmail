/**
 * Wspolna walidacja formularza i handlera wysylki listu.
 * Bledny tekst nie jest poprawiany automatycznie.
 */

export interface ComposeValidationInput {
  adresat: string;
  temat: string;
  dw: string;
  tresc: string;
}

export interface ComposeSendInput extends ComposeValidationInput {
  linie: string[];
}

function validRecipients(value: string, required: boolean): boolean {
  const trimmed = value.trim();
  if (!trimmed) return !required;
  if (/[^a-zA-Z, ]/.test(value)) return false;
  return trimmed.split(',').every((part) => {
    const names = part.trim();
    // Wolne slowo "i" nie jest imieniem - skladnia listingow ("A, B i C")
    // na linie do gry trafia jako jeden bezsensowny odbiorca i serwer
    // odrzuca cala wysylke. Plugin zostawia surowy wpis bez zmian.
    if (/(?:^|\s)i(?:\s|$)/i.test(names)) return false;
    return /^[a-zA-Z]+(?: +[a-zA-Z]+)*$/.test(names);
  });
}

/** Zwraca komunikat dla uzytkownika albo null dla poprawnego listu. */
export function validateCompose(input: ComposeValidationInput): string | null {
  if (!/\S/.test(input.tresc)) return 'Brak tresci listu.';
  if (/[;#]/.test(input.tresc)) return 'Tresc nie moze zawierac znakow ; ani #.';
  if (!input.adresat.trim()) return 'Podaj adresata.';
  if (!validRecipients(input.adresat, true)) {
    return "Adresatow oddziel przecinkami lub spacjami, bez spojnika 'i'. Dozwolone: litery a-z i A-Z.";
  }
  if (!input.temat.trim()) return 'Podaj temat.';
  if (/[;#]/.test(input.temat)) return 'Temat nie moze zawierac znakow ; ani #.';
  if (!validRecipients(input.dw, false)) {
    return "Adresatow DW oddziel przecinkami lub spacjami, bez spojnika 'i'. Dozwolone: litery a-z i A-Z.";
  }
  return null;
}

/**
 * Parser WYLACZNIE dla lokalnego advisory. Rozpoznaje przecinki i spacje.
 * Najpierw dzieli przecinki, potem szuka najdluzszych znanych nazw od
 * lewej do prawej. Surowa wartosc pol nigdy nie jest tu zmieniana ani
 * uzywana ponownie do wysylki.
 */
export function splitRecipients(
  value: string,
  known: ReadonlySet<string> = new Set<string>(),
): string[] {
  const knownKeys = new Set([...known].map((name) => name.trim().toLowerCase()));
  const maxWords = Math.max(1, ...[...knownKeys].map((name) => name.split(/\s+/).length));
  const out: string[] = [];
  for (const rawSegment of value.split(',')) {
    const words = rawSegment.trim().split(/\s+/).filter(Boolean);
    let index = 0;
    while (index < words.length) {
      let matched: string | null = null;
      let matchedLength = 0;
      const limit = Math.min(maxWords, words.length - index);
      for (let length = limit; length >= 1; length--) {
        const candidate = words.slice(index, index + length).join(' ');
        if (knownKeys.has(candidate.toLowerCase())) {
          matched = candidate;
          matchedLength = length;
          break;
        }
      }
      if (matched !== null) {
        out.push(matched);
        index += matchedLength;
      } else {
        out.push(words[index]!);
        index++;
      }
    }
  }
  return out;
}

/**
 * Imiona spoza bazy osob (advisory guard, Fala UI-2 krok 5).
 * Porownanie case-insensitive, wynik deduplikowany w oryginalnej
 * pisowni z formularza. NIGDY nie blokuje wysylki - tylko informuje,
 * ze serwer moze odrzucic te imiona ("Nie ma takiego adresata...").
 */
export function unknownRecipients(
  input: { adresat: string; dw: string },
  known: ReadonlySet<string>,
): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const name of [...splitRecipients(input.adresat, known), ...splitRecipients(input.dw, known)]) {
    const key = name.toLowerCase();
    if (known.has(key) || seen.has(key)) continue;
    seen.add(key);
    out.push(name);
  }
  return out;
}
