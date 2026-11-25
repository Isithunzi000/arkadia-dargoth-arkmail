# Plan bezpiecznego odczytu wyników wyszukiwania

## Ustalenia z analizy

- Numer listu jest ważny względem ostatniego listingu serwera. Sam zgodny znacznik kontekstu po stronie wtyczki nie dowodzi, że serwer zakończył już zmianę tego listingu.
- Wynik wyszukiwania zwrócony po limicie ciszy można pokazać natychmiast, ale jego numer nie jest wystarczającą podstawą odczytu.
- Obecna szybka ścieżka może użyć numeru z wyniku wyszukiwania bez ponownego listingu.
- Obecne odzyskiwanie nieaktualnego wpisu używa listingu według daty. Dla wyniku wyszukiwania nie odtwarza to pierwotnego filtra.
- Analiza kodu potwierdza te wady. Nie ma natomiast podstaw, aby przypisać odpowiedź serwera wyłącznie poprzedniemu limitowi 400 ms; poprawka nie opiera bezpieczeństwa odczytu na takim założeniu.
- Wnioski i testy używają wyłącznie danych syntetycznych. Dokument nie zawiera danych sesji ani treści z realnej gry.

## Zatwierdzony zakres

1. Globalny produkcyjny limit ciszy listingu wynosi 500 ms. Prompt nadal kończy listing natychmiast, a brak promptu kończy go po 500 ms od ostatniej odebranej linii. Limit 8000 ms pozostaje wyłącznie zabezpieczeniem awaryjnym.
2. Poprawka obejmuje wyniki wyszukiwania we wszystkich skrzynek.
3. Wpis z wyszukiwania zachowuje w pamięci pierwotne zapytanie, dokładną komendę filtra i skrzynkę. Nie są one zapisywane w trwałym magazynie.
4. Kliknięcie takiego wpisu zawsze ponawia dokładnie pierwotny filtr przed odczytem, także gdy lokalny kontekst wydaje się aktualny. Ponowna kotwica i odczyt pozostają pod wspólną blokadą operacji.
5. Świeży wynik jest wybierany po `archiveId`. Brak wpisu albo niejednoznaczne dopasowanie przerywa operację bez wysłania odczytu.
6. Odczyt używa dopiero numeru ze świeżego, jednoznacznego wyniku. Stary numer nigdy nie wystarcza.
7. Po pierwszym błędzie numeru lub utracie wyboru listingu kontekst jest unieważniany. Dla wyniku wyszukiwania dozwolona jest najwyżej jedną ponowną kotwicę dokładnie tym samym filtrem i jeden kolejny odczyt świeżego numeru. Drugi taki błąd kończy operację bez trzeciej próby.
8. Zwykły wpis bez aktywnego filtra zachowuje dotychczasową szybką ścieżkę, gdy jego kontekst jest aktualny.
9. Gagowanie pozostaje bez zmian. Nie rozszerzamy go na inne typy komunikatów.
10. Nie wykonujemy testów na realnej grze. Pełna macierz scenariuszowa może być uruchomiona wyłącznie przez istniejący zdalny proces.
11. Publikacja ogranicza się do GitHuba: commity, tag i GitHub Release zgodne z najnowszym `main`. Bez katalogu, marketplace i innych publikacji zewnętrznych.

## Sposób weryfikacji

- Każda nowa reguła najpierw otrzymuje konkretny test uruchomiony lokalnie na starym kodzie; oczekiwany negatywny wynik jest zapisywany.
- Test i implementacja trafiają do jednego commita.
- Testy obejmują limit 500 ms, natychmiastowy prompt, wszystkie skrzynki, ponowienie dokładnego filtra, wybór po `archiveId`, bliźniacze metadane, zniknięcie i niejednoznaczność wpisu, jedną ponowną próbę oraz zachowanie szybkiej ścieżki bez filtra.
- Odrębnie sprawdzamy, że wynik po ciszy jest od razu widoczny i klikalny, a kliknięcie nie czeka na awaryjny limit 8000 ms.
- Przed commitem przechodzą pełne lokalne testy jednostkowe i integracyjne, kontrola typów, budowanie, kontrola opisu commita oraz audyt higieny repozytorium.
- Po zatwierdzeniu commitów sprawdzamy zwykły zdalny build i wymaganą zdalną macierz ArkMail. Lokalna pełna macierz E2E nie jest uruchamiana.
- Wydanie otrzymuje kolejny numer poprawki, deterministyczny i wersjonowany pakiet oraz dokładnie jeden asset zgodny z zasadami repozytorium.
