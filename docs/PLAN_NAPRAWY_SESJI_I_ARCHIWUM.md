# Plan naprawy sesji i archiwum ArkMaila

Dokument zatwierdzony 2026-11-13. Zakres obejmuje plugin ArkMail i wymagane testy w repozytorium `arkadia-dargoth-testy`. Klient Dargoth pozostaje niezmodyfikowany. Plan nie obejmuje podniesienia wersji, tagu, wydania ani publikacji w katalogu.

## Podstawa i ograniczenia

- Wersja 1.30.5 kończyła listing po 400 ms ciszy sukcesem, a wersje 1.30.6 i 1.30.7 kończą go błędem. Zmiana pochodzi z commita `dd320028ddc828b8c5ae40f38841186659583b40`.
- Nie przywracamy ślepo dawnego zachowania, ponieważ mogło ono zatwierdzić urwany listing jako kompletny.
- Cisza nie może ani zatwierdzać, ani unieważniać odpowiedzi. Wynik wymaga jednoznacznego zakończenia protokołu albo kończy się błędem po pełnym limicie czasu.
- Lokalny identyfikator sesji nie dowodzi pochodzenia odpowiedzi serwera. Odpowiedź, której nie można jednoznacznie przypisać, nie może zmienić archiwum.
- UI, IndexedDB, kontakty i metadane muszą przedstawiać ten sam zatwierdzony stan.
- Dostępne logi potwierdzają występowanie opóźnionych promptów, ale nie rozstrzygają, czy konkretne zgłoszenie live wynikało z limitu 400 ms czy 8 s.
- Wszystkie dane testowe są syntetyczne. Nie zapisujemy danych postaci, rozmów ani innych danych wrażliwych.

## Zasada pracy

Dla każdej poprawki najpierw dodajemy test zachowania i uruchamiamy go lokalnie na niezmienionym kodzie. Zachowujemy wynik niezaliczonego testu. Następnie implementujemy najmniejszą poprawkę, uruchamiamy test ponownie oraz wykonujemy kontrole regresji i typowania. Test i poprawka trafiają w jednym commicie. Na GitHub trafiają wyłącznie lokalnie zaliczone zmiany.

Nie zmieniamy starych asercji tylko po to, aby dopasować je do implementacji. Zmiana kontraktu wymaga osobnego testu pozytywnego i negatywnego.

## Etapy

- [ ] **1. Reprodukcja opóźnionego promptu.** Dodać deterministyczne scenariusze dla skrzynki, pagera i importu. Umożliwić w E2E niezależne wysłanie linii oraz promptu. Porównać 1.30.5, 1.30.6, 1.30.7 i poprawiony kod na identycznych syntetycznych odpowiedziach. Osobno sprawdzić urwany listing bez promptu.
- [ ] **2. Kończenie sesji.** W `MailboxSession`, `PagerSession` i `ImportSession` usunąć decyzję terminalną z timera ciszy. Poprawna odpowiedź z promptem późniejszym niż 400 ms ma zostać przyjęta przed pełnym limitem. Brak zakończenia ma pozostawić dane nietknięte i uruchomić kontrolowane odzyskiwanie. Późny prompt nie może otworzyć zamkniętej sesji.
- [ ] **3. Spójność archiwum.** Każda skrzynka ma jeden punkt zatwierdzenia obejmujący listy, metadane, kontakty i UI. Przy częściowym sukcesie zapisane skrzynki pozostają spójne, a błędna zachowuje poprzedni stan. Niejednoznaczna pusta odpowiedź nie może wyczyścić archiwum. Testy obejmują błąd IndexedDB i ponowne uruchomienie.
- [ ] **4. Odzyskiwanie i reconnect.** Ograniczyć czas odzyskiwania i uczynić jego wynik widocznym. Prompt kończy odzyskiwanie raz. Reconnect i `dispose()` zamykają stare sesje, timery i blokady. Brak promptu nie może pozostawić cichej blokady ani powodować automatycznego odblokowania bez synchronizacji. Stare zdarzenia nie wpływają na nowe połączenie.
- [ ] **5. Spóźnione odpowiedzi.** Nie dopuszczać równoległych odczytów tego samego zasobu. Przyjąć odpowiedź tylko przy potwierdzonej granicy własnego żądania; w przeciwnym razie odrzucić ją jako niejednoznaczną bez zapisu. Objąć tę samą skrzynkę, ten sam numer listu i odpowiedzi poprzedniego połączenia. Bez automatycznych ponowień w niepewnym stanie kanału.
- [ ] **6. Komunikaty i błędy zapisu.** Ręczna operacja anulowana przez nieznany pager ma mieć widoczne wyjaśnienie. Błąd IndexedDB ma być zgłaszany jako lokalny błąd zapisu, nie awaria serwera. Ograniczenie kolejnych błędów serwera nie może zliczać błędów lokalnego magazynu.
- [ ] **7. Regresja w Dargothcie.** Dodać E2E dla opóźnionego promptu, urwanej odpowiedzi, częściowego odświeżenia, pustej odpowiedzi, błędu zapisu, nieznanego pagera, reconnectu i spóźnionych odpowiedzi. Powtórzenia operacji mają dawać ten sam wynik bez duplikatów. Kontrola negatywna po usunięciu poprawki musi ponownie wykazać błąd.
- [ ] **8. Kontrole końcowe.** Wykonać pełne testy ArkMaila i repozytorium testowego, rzeczywiste `tsc --noEmit`, build, deterministyczny ZIP oraz kontrolę zgodności źródeł z paczką. Po ostatniej zmianie funkcjonalnej uruchomić jedną pełną macierz E2E. Sprawdzić niezmienione drzewo Dargotha i brak danych wrażliwych. Przenieść trwały kontrakt do `docs/PROTOCOL.md`, a zrealizowany plan usunąć.

## Warunki zakończenia

1. Opóźniony prompt nie powoduje błędu w skrzynkach, imporcie ani pagerze.
2. Odpowiedź bez jednoznacznego zakończenia nie jest zapisywana.
3. Częściowy sukces nie rozjeżdża UI, magazynu, kontaktów i metadanych.
4. Niejednoznaczna pusta odpowiedź nie kasuje danych.
5. Odzyskiwanie nie pozostawia cichej, bezterminowej blokady.
6. Stara odpowiedź nie nadpisuje wyniku nowej operacji.
7. Błąd zapisu nie jest przedstawiany jako awaria serwera.
8. Wszystkie zestawy mają potwierdzone wyniki i kody wyjścia, a build jest powtarzalny.

Duże zestawy nie są uruchamiane równolegle. Każdy długi przebieg ma log, kod wyjścia i punkt wznowienia. Nie wykonujemy wymuszonych pushy. Po błędzie HTTP lub timeoutcie najpierw sprawdzamy stan zdalny, bez ponawiania operacji w ciemno.
