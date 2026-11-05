// Walidator komunikatow commitow (konwencja wspolna miedzy repozytoriami).
// Zwraca liste bledow; pusta lista = komunikat zgodny z konwencja.

export const MAX_FIRST_LINE = 100;

const WORDS = ["fala", "red", "green", "hunt", "lustro", "interop", "mirror",
  "e2e", "dg", "www", "harness", "spec"];

const PATTERNS = [
  ...WORDS.map((w) => [new RegExp(`\\b${w}\\b`, "i"), `slowo '${w}'`]),
  [/\brun\s+\d{4,}\b/i, "numer runu"],
  [/\bW\d{1,3}\b/, "kod fali W.."],
  [/\bM\d{1,3}\b/, "kod fali M.."],
  [/\bB\d{1,3}\b/, "kod fali B.."],
  [/\b\d[A-Z]-[A-Z]\d\b/, "kod typu 7K-B1"],
  [/\b\d[A-Z]\/[A-Z]\d\b/, "kod typu 7J/A3"],
  [/@\s*[0-9a-f]{7,}\b/, "identyfikator commita"],
  [/\b[a-z]{2,}[A-Z]\w*\b/, "nazwa techniczna camelCase"],
];

export function validate(msg) {
  const errors = [];
  if (!msg || !msg.trim()) {
    return ["pusty komunikat"];
  }
  const first = msg.split("\n")[0];
  if (first.length > MAX_FIRST_LINE) {
    errors.push(`pierwsza linia za dluga: ${first.length} > ${MAX_FIRST_LINE}`);
  }
  const nonAscii = [...new Set([...msg].filter((ch) => ch.charCodeAt(0) > 127))].sort();
  if (nonAscii.length > 0) {
    errors.push(`znaki spoza ASCII: ${nonAscii.slice(0, 10).join("")}`);
  }
  for (const [rx, label] of PATTERNS) {
    if (rx.test(msg)) {
      errors.push(`zargon: ${label}`);
    }
  }
  return errors;
}
