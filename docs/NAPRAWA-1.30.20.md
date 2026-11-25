# Naprawa ArkMail 1.30.20

## Zakres poprawki

1. Produkcyjny limit ciszy listingu wynosi 500 ms. Prompt lub echo kończy listing natychmiast, a brak promptu kończy go po 500 ms od ostatniej linii. Limit 8000 ms pozostaje zabezpieczeniem awaryjnym.
2. Poprawka obejmuje wyniki wyszukiwania we wszystkich skrzynek. Wpis zachowuje wyłącznie w pamięci pierwotne zapytanie, dokładną komendę filtra i skrzynkę.
3. Każde kliknięcie wyniku wyszukiwania ponawia dokładnie pierwotny filtr pod wspólną blokadą operacji. Lokalnie zgodny kontekst nie wystarcza do użycia starego numeru.
4. Świeży wpis jest wybierany po `archiveId`. Zniknięcie wpisu, brak identyfikatora i niejednoznaczne dopasowanie przerywają operację bez wysłania odczytu.
5. Odczyt używa dopiero numeru ze świeżego, jednoznacznego wyniku. Bliźniacze metadane pozostają rozróżniane przez osobne identyfikatory archiwum.
6. Po pierwszym `Zly numer listu` albo utracie wyboru listingu kontekst jest unieważniany. Dozwolona jest najwyżej jedna ponowna kotwica dokładnie tym samym filtrem i jeden kolejny odczyt. Drugi błąd kończy operację bez trzeciej próby.
7. Zwykły aktualny wpis bez filtra zachowuje szybką ścieżkę odczytu. Gagowanie pozostaje bez zmian.
8. Wynik zwrócony po ciszy jest od razu widoczny i klikalny, ale kliknięcie wykonuje świeże ponowienie filtra zamiast czekać na awaryjny limit 8000 ms.

## Dowody lokalne

- Przed implementacją zakończony przebieg wszystkich sześciu nowych scenariuszy na starym kodzie pod Node 20 dał 0/6. Osobny przebieg pięciu scenariuszy ponowienia filtra pod Node 26 dał 0/5. Kontrola jednoznaczności zakończyła się oczekiwanym `TypeError`, ponieważ stary kod nie zawierał `uniqueEntryByArchiveId`.
- Osobny pomiar starego kodu wykazał obecność wyniku przy 499 ms. Przerwanego powtórzenia tego pomiaru nie uznano za dodatkowy dowód.
- Po implementacji powiązany zestaw 28 kontrolek przeszedł w całości. Obejmował wszystkie skrzynki, dokładny filtr, wybór po `archiveId`, zniknięcie i duplikat identyfikatora, jedną ponowną próbę, szybką ścieżkę oraz czas 500 ms.
- Pełny zestaw przed zmianą numeru wydania: **1366 kontrolek, 1365 zaliczonych, 0 błędów, 0 anulowanych i 1 pominięta**. Pominięcie dotyczyło wyłącznie kontroli opisu commita bez `COMMIT_MSG`. Osobna kontrola docelowego opisu przeszła 3/3.
- Osobne typowanie i budowanie zakończyły się kodem 0. Kontrole higieny, danych wrażliwych i zabronionych słów przeszły w pełnym zestawie.
- Przed zmianą numeru zaktualizowana kontrola wersji dała jeden oczekiwany błąd: źródło nadal wskazywało 1.30.19 zamiast 1.30.20. Nowa kontrola dokumentacji również najpierw zgłosiła oczekiwany brak tego raportu.
- Po zmianie numeru kontrole wersji i spójności paczki przeszły 2/2. Dwa kolejne zbudowania dały bajtowo identyczny `arkmail_1_30_20.zip` o SHA-256 `43e0147a6243dc26a975b3c504f0d4697816973368cfaf67d0bd92f15f902552`.
- Paczka zawiera dokładnie `index.ts` i `plugin.json`. Oba pliki są zgodne z katalogiem `build/arkmail`; `meta.ts`, oba pola wersji w `plugin.json` i data builda są zsynchronizowane.

## Weryfikacja zdalna

- `Build plugins` dla commita `38912e995e8e481c3f8cde8d9d5a0a4f3ec472bb` zakończył się sukcesem, w tym zadania `build` i `deploy`.
- Pierwszy zdalny ArkMail E2E dla tego samego commita dał 45 zaliczonych i 2 niezaliczone scenariusze. Dziennik potwierdził dokładny SHA ArkMaila. Oba błędy dotyczyły przestarzałego wymagania oczekiwania na prompt po błędzie sesji.
- Lokalny kod i testy wersji 1.30.19 wymagają przeciwnego zachowania: błąd kończy tylko bieżącą operację, a kolejna komenda jest niezależna. Poprzedni udany E2E używał starszego ArkMaila, ale tego samego SHA Dargotha. Dlatego zmieniono wyłącznie dwa scenariusze w repozytorium testów, bez zmiany produktu. Zachowano kontrole braku `q` dla nieznanego pagera oraz odrzucania późnych linii starej sesji.
- Docelowy zdalny ArkMail E2E po tej korekcie: **47/47, 0 błędów, 0 niestabilnych i 0 pominiętych**. Artefakt zawiera `ALL-GATES-OK`, a dziennik ponownie potwierdza checkout ArkMaila `38912e995e8e481c3f8cde8d9d5a0a4f3ec472bb` i Dargotha `616ea27c949097f13b835d4195af26f4b32f6b14`.
- Nie uruchamiano lokalnej pełnej macierzy E2E. Konfiguracja repozytorium testów po pierwszym uruchomieniu została przywrócona do `default: main`; nie pozostawiono tymczasowego SHA.

## Wydanie 1.30.20

- GitHub Release: `ArkMail v1.30.20`, tag `v1.30.20`, dokładnie jeden asset `arkmail_1_30_20.zip`.
- Publikacja ogranicza się do GitHuba. Bez katalogu, marketplace i innych usług zewnętrznych.
- Tag i wydanie mają wskazywać najnowszy commit `main` zawierający tę dokumentację i pakiet. Po publikacji asset ma być pobrany i porównany bajtowo z lokalną paczką.

## Ograniczenie wyniku

Nie wykonano testów na realnej grze. Nie logowano do gry, nie łączono z realnym serwerem i nie wchodzono w interakcje z graczami. Dowód obejmuje lokalne dane syntetyczne, zwykły zdalny build oraz zdalny E2E na prawdziwym kliencie z syntetycznymi odpowiedziami.
