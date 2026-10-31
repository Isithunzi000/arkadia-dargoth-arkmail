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

- Nazwa wydania: „ArkMail X.Y.Z” — bez nazw fal, bez dopisków.
- Opis: zwykły język użytkownika — co się zmieniło, jak zainstalować.
  Zakaz żargonu: żadnych numerów przebiegów CI, identyfikatorów
  commitów, haseł typu red→green, sha256, znaczków ✖/✓.
- Assety: dokładnie jeden plik `arkmail_X_Y_Z.zip`. Bez paczek
  typu „-red”, bez plików o stałej nazwie, bez duplikatów.
  Wersjonowana nazwa jest wymogiem potoku publikacji (strona
  projektu i katalog wtyczek parsują ją regexem).
