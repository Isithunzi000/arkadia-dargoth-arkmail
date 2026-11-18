# Naprawa ArkMail 1.30.10

## Przyczyna

`scanMailboxPages()` scalało poprawnie odczytaną stronę, ale wynik `confirmed: false` powodował natychmiastowe zwrócenie `incomplete`. Warunek był wykonywany przed obsługą uciętego listingu i wysłaniem kolejnej kotwicy. Dlatego „Wczytaj wszystkie” pokazywało nowe wpisy z bieżącej strony, lecz nie pobierało następnej. „Wczytaj starsze” działało, ponieważ pojedyncza strona była już scalona przed przerwaniem skanu.

## Zakres poprawki

- `PageScanResult` otrzymało niezależne pole `unconfirmedPages`.
- Brak promptu lub echa nie przerywa strukturalnie poprawnej paginacji i nie zmienia sam w sobie wyniku `complete` w `incomplete`.
- Każda poprawna strona jest scalana z widokiem i archiwum. Zachowane są kotwice, pauzy, ponawianie duplikatów, sonda ściany dnia, wykrywanie luk i anulowanie.
- Jednoznaczna odpowiedź `kind: "pusta"` nie zwiększa licznika niepotwierdzonych stron.
- Operacje pełnej prawdy są dozwolone wyłącznie przy `unconfirmedPages === 0`: zastępowanie zawartości skrzynki, usuwanie znikniętych wpisów, czyszczenie luk i ustawianie kompletnego stempla indeksu.
- „Wczytaj wszystkie” po strukturalnym końcu z niepotwierdzonymi stronami kończy paginację widoku, lecz zachowuje archiwum jako sumę wpisów, luki i poprzedni stan indeksu. Ostrzeżenie podaje liczbę niepotwierdzonych zamknięć odpowiedzi.
- „Wczytaj starsze” pokazuje i zapisuje stronę bez promptu, ale nie traktuje jej jako potwierdzonej pełnej prawdy.
- Indeksacja zapisuje poprawne wpisy i przechodzi dalej, lecz skrzynka z niepotwierdzoną stroną jest raportowana jako pominięta i nie otrzymuje kompletnego stempla. Dotyczy to także wyniku `clamped`.
- Nie zmieniono UI, „Odpowiedz wszystkim”, compose, edytora, eksportu, kontaktów, aliasów, grup, dat, IndexedDB ani źródeł Dargotha.

## Dowody lokalne przed zmianą produktu

- Oryginalne źródła 1.30.9 z docelowym zestawem `mailboxNoPrompt`: 8 testów, 3 zaliczone, 5 błędów, kod wyjścia 1. Testy wykazały zatrzymanie drugiej kotwicy, wynik `incomplete` zamiast strukturalnego `complete` oraz niebezpieczne operacje pełnej prawdy.
- Te same testy po poprawce: 8 zaliczonych, 0 błędów, 0 pominiętych, kod wyjścia 0.
- Pełny zestaw produktu po poprawce: 1200 zaliczonych, 0 błędów, 0 pominiętych. Osobno zaliczone: typowanie, bundle, build, higiena i deterministyczność paczki.

## Dowód przeglądarkowy na prawdziwym kliencie

Scenariusz `sesje: wczytaj wszystkie kontynuuje kolejne strony bez promptu i chroni archiwum` używa prawdziwego buildu Dargotha `616ea27c949097f13b835d4195af26f4b32f6b14`, mocka WebSocket i syntetycznych listów.

- Oficjalna paczka 1.30.9, SHA-256 `f8018601fe8d4d6d94941527d2818d00cc63fa20777ba8a928b80317eadf8b9b`: 1 test, 1 błąd. Plugin wysłał poprawną pierwszą komendę `listy odebrane przed 24 VIII 1999`, przetworzył stronę bez promptu, lecz nie wysłał oczekiwanej komendy `listy odebrane przed 16 VIII 1999` w limicie 15 sekund.
- Paczka robocza z poprawką, SHA-256 `c294212183386fe4730da4e9bd88d5e5f7b2ff82471e810abbac6528a1617513`: ten sam scenariusz zaliczony, 1 test, 0 błędów, 0 pominiętych.
- Scenariusz potwierdził dwie kolejne kotwice, trzy wpisy w widoku, cztery unikalne rekordy w archiwum, brak duplikatów, zachowanie wcześniejszego wpisu oraz ostrzeżenie o dwóch niepotwierdzonych zamknięciach odpowiedzi. Późniejszy zwykły prompt nie zmienił danych.

## Kontrole zdalne

- Commit poprawki produktu: `af9dd670788bbefb6899c71eeb5ae2d250afe307`; workflow `Build plugins`, run `44367340860`: sukces.
- Commit scenariusza i wsparcia testowego: `be34323d7e8811e028155b3d9767809df25198bb`.
- Workflow `Testy pluginow Dargoth`, run `44412020713`: sukces.
- Workflow `ArkMail E2E`, run `44412020737`: sukces; raport zawiera 46 zaliczonych scenariuszy, 0 pominiętych, 0 nieoczekiwanych i 0 niestabilnych. Nowy scenariusz jest obecny w raporcie. SHA Dargotha jest zgodne z kontrolą lokalną.
- Dodatkowy workflow `E2E Dargoth (prawdziwy klient)`, run `44412020795`: sukces dla Chromium.

## Kontrola wersji i paczki

- Przed zmianą metadanych test oczekujący 1.30.10: 10 testów, 9 zaliczonych, 1 błąd; rzeczywista wersja 1.30.9.
- Po zmianie metadanych i wygenerowaniu paczki: 10 zaliczonych, 0 błędów, 0 pominiętych.
- Pełny zestaw na finalnych źródłach 1.30.10 z docelowym komunikatem commita: 1200 zaliczonych, 0 błędów, 0 pominiętych. Typowanie i build zakończyły się kodem 0.
- Paczka `arkmail_1_30_10.zip` zawiera dokładnie `index.ts` i `plugin.json`, oba wpisy są nieskompresowane i mają datę `1980-01-01 00:00:00`.
- Porównanie z paczką poprawki wykazało wyłącznie zmianę numeru wersji w dwóch polach `plugin.json`, numeru w kodzie i daty buildu. Pozostały kod jest identyczny z kodem objętym powyższymi dowodami.
- Dwa kolejne generowania dały bajtowo identyczną paczkę.
- SHA-256: `72ee6676707531fb811edda6c9b09d5016956294282eb2486bbcd8c356ab723d`.

## Ograniczenie wyniku

Testy syntetyczne i przeglądarkowe nie są testem w realnej grze. Końcowe sprawdzenie zachowania na rzeczywistych danych należy do użytkownika po instalacji oficjalnego wydania.
