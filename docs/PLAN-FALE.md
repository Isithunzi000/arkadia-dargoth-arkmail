# Plan prac - wydanie 1.27.1

Status: aktywny (zatwierdzony 2026-11-04).

## Zmiana A - wulgaryzm i strażnik form odmienionych

Wykonana 100%: parafraza w contactsArchive.test.ts, matcher findBad
(formy podstawowe granice + rdzenie podciagiem), pelny skan repo zero
trafien. RED 299be58306 -> GREEN a4fb751bc0 (CI 761/761).

## Zmiana B - układ wierszy ksiazki i headow grup

Wykonana 100%: reguly flex .arkmail-book-row/.arkmail-book-name/
.arkmail-group-head w styles.ts (sam uklad, zero nowych kolorow).
RED fc774a4969 -> GREEN 825022abd2 (CI 762/762).

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
