# Naprawa ArkMail 1.30.17

## Przyczyna i decyzja

Wersja 1.30.16 zamieniła krótki fallback ciszy z wersji 1.30.5 w podstawę odzyskiwania kanału, odroczonego odświeżania i pomijania skrzynek. Pojedyncza odpowiedź bez zwykłego promptu mogła więc zwrócić dane, a mimo to pozostawić wtyczkę niedostępną dla kolejnych działań.

Przywracamy prostą semantykę: zwykły prompt kończy operację od razu, a krótka cisza zwraca zebrane dane i również kończy operację. Brak promptu przy poprawnym odczycie lub listingu nie uruchamia odzyskiwania. Nie dodajemy nowych timerów, późnych potwierdzeń ani zastępczych stanów wyniku.

Wynik podczas opóźnienia serwera może być niepełny, ale nie może blokować użytkownika. Istniejący fallback ciszy pozostaje, ponieważ zapobiega oczekiwaniu do pełnego limitu przy braku promptu.

## Zakres

1. Odczyt pagera: po zwróceniu listu kolejna operacja jest dostępna od razu. Zakończenie operacji zdejmuje hook modalny, więc późniejsze ręczne `q`/`x` nie są tłumione przez ArkMail. Usuwanie i przekazywanie zachowują dotychczasowe potwierdzanie.
2. Listing i indeksacja: wynik uzyskany po ciszy jest traktowany jak zwykły listing. Znika licznik niepotwierdzonych stron, zatrzymywanie paginacji z tego powodu oraz pomijanie skrzynek z komunikatem o braku potwierdzenia. Błędy strukturalne i rzeczywiste luki nadal zatrzymują pełne zatwierdzenie.
3. Czyszczenie lokalne: `Wyczyść zapisane dane` działa również podczas odzyskiwania i aktywnej operacji. Czyszczenie anuluje bieżące operacje, nie wysyła komend do gry i nie pozwala późnej odpowiedzi odtworzyć usuniętych danych.

Zachowane zostają interfejs, motywy, odpowiadanie wszystkim, pełne nagłówki, eksport, podsumowania pobierania oraz kontrola trwałego zapisu IndexedDB.

## Dowody lokalne

### Odczyt pagera

- Test zwrotu listu bez zwykłego promptu i ręcznego zamknięcia na kodzie przed poprawką: 1 kontrola, 0 zaliczonych, 1 błąd (`true !== false` dla odzyskiwania). Po poprawce: 1/1.
- Powiązane testy pagera po poprawce: 67/67.
- Dwa dawne testy oczekiwały odrzucenia kolejnego odczytu i zatrzymywały się na `assert.rejects`. Po zmianie oczekiwań na zatwierdzone zachowanie plik `sessionDelayedPrompt.test.ts`: 6/6.
- Dawny test adaptera oczekiwał błędu `operacja anulowana` przy kolejnym odczycie. Po zmianie oczekiwania plik `sessionRecovery.test.ts`: 11/11.

Dalsze wyniki oraz kontrole etapów 2 i 3 zostaną dopisane po ich rzeczywistym wykonaniu.

## Ograniczenie wyniku

Testy syntetyczne i przeglądarkowe nie są testem w realnej grze. Końcowe sprawdzenie na rzeczywistych danych należy do użytkownika po instalacji oficjalnego wydania.
