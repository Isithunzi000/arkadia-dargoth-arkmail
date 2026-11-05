# Zasady obowiązujące w tym repozytorium

Reguły współpracy ustalone z właścicielem (2026-10-31). Obowiązują
wszystkie sesje i wygrywają z każdym innym zwyczajem.

## Zmiany w kodzie

- Test na nowe zachowanie piszemy najpierw i sprawdzamy lokalnie,
  na konkretnym pliku testu, że pada na starym kodzie.
- Test i poprawka idą w jednym commicie.
- Integracja (CI GitHub) widzi wyłącznie zielone przebiegi.
- Każdy czerwony przebieg na CI oznacza realną regresję albo awarię
  infrastruktury — nigdy nie jest elementem planowanego procesu.
- Jeśli push okaże się czerwony mimo lokalnych testów: naprawa idzie
  dalej jako kolejny commit (fix-forward). Bez wymuszonych pushy.

## Zmiany wyłącznie w dokumentacji (README, docs)

- Jeden commit: aktualizacja strażnika dokumentacji i tekstu razem.
- Czerwień testu weryfikujemy tylko lokalnie.
- Commity samego README nie uruchamiają workflowu (filtr ścieżek),
  więc zielone potwierdzenie bierzemy ręcznym uruchomieniem builda.

## Wydania (release)

- Nazwa wydania: „ArkMail vX.Y.Z” — wyłącznie nazwa produktu i numer
  wersji, bez nazw fal, bez dopisków.
- Opis: krótki akapit zwykłym językiem użytkownika — co się zmieniło
  i po co. Zakaz: żargonu (fale, hasła procesowe), dat sesji,
  identyfikatorów commitów, sha256, numerów przebiegów CI, nagłówków
  markdown, prefiksu „release:”, znaczków ✖/✓.
- Assety: dokładnie jeden plik `arkmail_X_Y_Z.zip`. Bez paczek
  typu „-red”, bez plików o stałej nazwie, bez duplikatów.
  Wersjonowana nazwa jest wymogiem potoku publikacji (strona
  projektu i katalog wtyczek parsują ją regexem).

## Commity

- Język polski, rzeczowy opis zmiany — co i gdzie.
- Zakaz: języka angielskiego, żargonu procesowego (fale, RED/GREEN,
  identyfikatory własne), wulgaryzmów.
- Dozwolone: nazwy plików, symboli i identyfikatory techniczne.
- Historii git nie przepisujemy (brak wymuszonych pushy) — konwencja
  obowiązuje commity od wersji 1.29.0.
