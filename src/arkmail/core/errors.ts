/**
 * Ludzkie komunikaty bledow poczty (Fala 17f, zgloszenie 2026-10-19/20
 * pkt 6 + audyt stringow).
 *
 * Sesje (mailbox/pager) odrzucaja techniczne komunikaty debug
 * ("timeout: mailbox fetch odebrane", "pager session list 12: ...").
 * Gracz ma widziec po ludzku - mapper stosowany w catch-site'ach
 * toastow. Linie serwera (juz po polsku, np. "Data zostala podana
 * w zlym formacie.") przechodza bez zmian; nieznany blad dostaje
 * neutralny fallback zamiast technikala.
 *
 * Wszystkie komunikaty ASCII - Arkadia bez diakrytykow (straznik:
 * tests/uiStrings.test.mjs).
 */

export const isOperationCancelled = (error: unknown): boolean =>
  error instanceof Error && error.message === 'operacja anulowana';

interface Rule {
  re: RegExp;
  msg: string | ((m: RegExpMatchArray) => string);
}

const RULES: Rule[] = [
  {
    re: /^timeout: mailbox fetch /,
    msg: 'Serwer nie odpowiedzial na czas - sprobuj ponownie.',
  },
  {
    re: /^timeout: pager session list \d+$/,
    msg: 'Odczyt listu trwal za dlugo - sprobuj ponownie.',
  },
  {
    re: /^pager session list \d+: przerwano$/,
    msg: 'Przerwano odczyt listu.',
  },
  {
    // Sierocy pager serwera (17a domyka, ale porazka moze sie zdarzyc).
    // Fala 21b: bez slowa "pager" - gracz nie zna tego pojecia.
    re: /odrzucono przez sierocy pager$|^sierocy pager podczas fetch /,
    msg: 'Poczta sie zawiesila - sprobuj ponownie.',
  },
  {
    re: /Listy sa w tej chwili ladowane\.$/,
    msg: 'Serwer jeszcze laduje listy - sprobuj ponownie za chwile.',
  },
  {
    // Straznik desynchronizacji (Fala 14d/17b): surowy format
    // "pusta <skrzynka> podczas fetch <skrzynka>" / "listing ...".
    re: /^(?:pusta|listing) (\S+) podczas fetch (\S+)$/,
    msg: (m) =>
      `Serwer odpowiedzial za inna skrzynke (${m[1]} zamiast ${m[2]}) - sprobuj ponownie.`,
  },
  {
    // "pager session list N: <linia serwera>" - linia serwera jest
    // juz po polsku ("Zly numer listu: 5."), tniemy tylko prefiks.
    re: /^pager session list \d+: (.+)$/,
    msg: (m) => m[1],
  },
];

/** Linia serwera: zaczyna sie wielka litera, konczy kropka. */
const SERVER_LINE_RE = /^[A-Z][^]*\.$/;

/** Techniczny komunikat -> ludzki polski (ASCII). */
export function humanizeMailError(raw: string): string {
  const text = raw.trim();
  for (const rule of RULES) {
    const m = text.match(rule.re);
    if (m) return typeof rule.msg === 'string' ? rule.msg : rule.msg(m);
  }
  // Linie serwera sa juz po polsku - przepuszczamy bez zmian.
  if (SERVER_LINE_RE.test(text)) return text;
  return 'Operacja nie powiodla sie - sprobuj ponownie.';
}
