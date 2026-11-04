# Plan prac - higiena repo i układ wierszy

Status: aktywny (zatwierdzony 2026-11-04).

## Zmiana A - wulgaryzm i strażnik form odmienionych

- A-RED (jeden commit, oczekiwany failure na CI):
  - tests/contactsArchive.test.ts: parafraza cytatu ("dziala niepoprawnie",
    zachowane zrodlo: zgloszenie z sesji 2026-10-19).
  - tests/repo-hygiene.test.mjs: nowy test "higiena: straznik lapie formy
    odmienione" - formy odmienione ROT13, asercja wykrycia przez matcher.
    Matcher jeszcze nie istnieje - test pada (RED).
- A-GREEN (jeden commit):
  - tests/repo-hygiene.test.mjs: matcher z listą rdzeni (ROT13, od "jeba")
    dopasowywanych podciagiem + istniejace granice form podstawowych;
    petla skanujaca pliki korzysta z matchera.
  - Weryfikacja: pelny skan repo zero trafien, CI 760/760.

## Zmiana B - układ wierszy ksiazki i headow grup

- B-RED (jeden commit, oczekiwany failure na CI):
  - tests/uiStyles.test.ts: test guarda - styles.ts zawiera display:flex
    dla .arkmail-book-row i .arkmail-group-head.
- B-GREEN (jeden commit):
  - src/arkmail/ui/styles.ts: dwie reguly, sam uklad, zero nowych kolorow,
    wzorce z istniejacych reguł repo:
    - .arkmail-book-row: flex, align-items:center, gap 6px x skala;
      .arkmail-book-name: flex 1 1 auto, min-width 0, ellipsis.
    - .arkmail-group-head: flex, flex-wrap:wrap, align-items:center, ten sam gap.
  - CI 760/760.

## Wydanie 1.27.1 (obowiazkowe, po A i B zielonych)

- Pieczec wersji: meta.ts 1.27.1, plugin.json (oba pola),
  releases/arkmail_1_27_1.zip, pin w tests/version.test.mjs.
  RED (podbitka bez zipa) -> GREEN (zip), jak przy 1.27.0.
- Tag v1.27.1, release "ArkMail 1.27.1" z zip i sha256.
- Marketplace: NIE - publikacja dopiero na precyzyjny rozkaz.

## Bramki kazdego commitu

- Lokalnie: tsc strict + testy danego obszaru (bez pelnego E2E lokalnie).
- RED dowodzony cytatem z logu CI; GREEN = pelny zielony przebieg.
- Weryfikacja sha + wiadomosc + drzewo 1:1 po kazdym commicie.
