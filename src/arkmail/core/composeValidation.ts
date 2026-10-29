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
    return /^[a-zA-Z]+(?: +[a-zA-Z]+)*$/.test(names);
  });
}

/** Zwraca komunikat dla uzytkownika albo null dla poprawnego listu. */
export function validateCompose(input: ComposeValidationInput): string | null {
  if (!/\S/.test(input.tresc)) return 'Brak tresci listu.';
  if (/[;#]/.test(input.tresc)) return 'Tresc nie moze zawierac znakow ; ani #.';
  if (!input.adresat.trim()) return 'Podaj adresata.';
  if (!validRecipients(input.adresat, true)) {
    return 'Adresat: tylko litery a-zA-Z, przecinki i spacje.';
  }
  if (!input.temat.trim()) return 'Podaj temat.';
  if (/[;#]/.test(input.temat)) return 'Temat nie moze zawierac znakow ; ani #.';
  if (!validRecipients(input.dw, false)) {
    return 'DW: tylko litery a-zA-Z, przecinki i spacje.';
  }
  return null;
}
