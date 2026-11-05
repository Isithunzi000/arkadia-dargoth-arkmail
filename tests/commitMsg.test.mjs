// Straznik komunikatow commitow: konwencja nazewnictwa.
//
// Zasady (spojne miedzy repozytoriami):
// - wylacznie ASCII (bez diakrytykow),
// - krotka pierwsza linia (max 100 znakow),
// - zero zargonu wewnetrznego: fala, RED/GREEN, HUNT, lustro, interop,
//   mirror, e2e, numery runow, kody fal (W37, B4-3c, 7K-B1),
//   identyfikatory commitow (@418b4fb8), nazwy techniczne camelCase.
//
// Dowod RED: wzorce ponizej odrzucaja komunikaty historyczne.
// Dowod GREEN: wzorce poprawne przechodza.
// W CI test zmiennej COMMIT_MSG odpala sie tylko gdy zmienna jest ustawiona
// (krok workflow z github.event.head_commit.message); bez zmiennej = pomijany.
import test from "node:test";
import assert from "node:assert/strict";
import { validate } from "./commit-msg-guard.mjs";

const _BAD = [
  "Fala UI-2 krok 5 RED: pisanie z ksiazki i grup - testy",
  "UI-2 krok 5 GREEN: pisanie z ksiazki i grup - implementacja",
  "Krok 6 RED: wydanie 1.27.0 - podbitka wersji bez artefaktu",
  "Wydanie 1.26.0: Fala UI-2 (ksiazka adresowa)",
  "Plan 1.29.0: fala F0b higieny nazewnictwa wyddan i fala F2b straznika commitow",
  "Fala 40/5: kontrasty UI do WCAG AA (zgloszenie 2026-11-01)",
  "Fala 41/1b: przywrocenie zmian Fali 40 w plikach scalonych z Fala 41",
  "CI: usunieta diagnostyka bookView",
  "Diag: sonda bookView klika pigulke Ksiazka po kroku 4 UI-2",
];

const _GOOD = [
  "ASCII: czyste znaki w src/ z biala lista strzalki echa",
  "Kontrasty: bialy tekst na glebokich tonach akcentu, jasniejsze wyroznienia nieprzeczytanych",
  "ZASADY: konwencja nazewnictwa wydan ArkMail vX.Y.Z i komunikatow commitow",
  "Wydanie 1.28.0: paczka zip i stempel plugin.json",
  "Guardy usuwania: wspolny dwuklik, klasy danger, ESC",
  "Archiwum: jeden klawisz indeksacji, znak stanu osob, czyszczenie filtru panelu osob",
];

test("komunikaty historyczne sa odrzucane", () => {
  for (const msg of _BAD) {
    const errors = validate(msg);
    assert.ok(errors.length > 0, `przepuszczono zly komunikat: ${JSON.stringify(msg)}`);
  }
});

test("poprawne wzorce przechodza", () => {
  for (const msg of _GOOD) {
    const errors = validate(msg);
    assert.deepEqual(errors, [], `odrzucono dobry komunikat: ${JSON.stringify(msg)}`);
  }
});

test("komunikat z CI jest zgodny z konwencja", (t) => {
  const msg = process.env.COMMIT_MSG;
  if (!msg) {
    t.skip("COMMIT_MSG nieustawione (poza CI)");
    return;
  }
  const errors = validate(msg);
  assert.deepEqual(errors, [], `komunikat commita niezgodny z konwencja: ${errors.join("; ")}`);
});
