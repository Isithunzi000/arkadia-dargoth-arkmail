# Naprawa ArkMail 1.30.16

## Zakres

1. Kompletny i zwalidowany list z własnego pagera jest zwracany, otwierany i zapisywany także wtedy, gdy po automatycznym `q` nie dociera zwykły prompt. Kanał pozostaje w odzyskiwaniu do zwykłego promptu lub ponownego połączenia, więc kolejne komendy pluginu nie są wysyłane przed potwierdzeniem synchronizacji.
2. Jeżeli re-kotwiczenie zatrzymało się na żądanie i znalazło jednoznaczny świeży wpis, odczyt używa tego wpisu mimo niepotwierdzonego zakończenia strony. Nie są pobierane kolejne strony. Brak takiego wpisu nadal odrzuca niepełny skan.
3. Prompt pagera z niezgodnym aktualnym numerem przerywa operację i uruchamia odzyskiwanie bez automatycznego `q`. Ta ścieżka nie uzbraja również późniejszego `q` przez strażnika sierocych pagerów.
4. Po zwróconym odczycie bez zwykłego promptu powtórne ręczne `q`/`x` należy do tego samego zamknięcia i nie jest wysyłane ponownie. Timeout oraz błędy nadal zdejmują tę koalescencję.
5. Odświeżenie skrzynki po takim odczycie jest odkładane do późnego zwykłego promptu. Przed promptem nie wylatuje nowa komenda, a po promptcie wykonywane jest dokładnie jedno odświeżenie.

## Niezmienione zabezpieczenia

- Niepotwierdzona skrzynka nie jest uznawana za kompletną, nie zastępuje archiwum, nie czyści luk i nie pozwala oznaczać wpisów jako zniknięte.
- Usuwanie i przekazywanie nadal wymagają potwierdzonego zamknięcia. Import również nie został objęty wyjątkiem dla zwracanego odczytu.
- Nie zwiększono timeoutów, nie cofnięto kodu do wcześniejszej wersji i nie zmodyfikowano źródeł Dargotha.
- Zmiany nie obejmują wyszukiwania, compose, eksportu, kontaktów ani publikacji w zewnętrznym katalogu.

## Dowody lokalne przed zmianami produktu

- Zwrot listu bez zwykłego promptu: na starym kodzie 18 kontroli, 14 zaliczonych i 4 błędy. Po poprawce 18/18.
- Użycie wpisu z niepotwierdzonej strony: na starym kodzie 13 kontroli, 11 zaliczonych i 2 błędy. Po poprawce 13/13. Kontrole objęły również zakaz zastępowania archiwum i oznaczania znikniętych wpisów.
- Niezgodny numer promptu: na starym kodzie 10 kontroli, 9 zaliczonych i 1 błąd. Po poprawce wspólny zestaw 40/40.
- Koalescencja `q`/`x`: nowa kontrola na kodzie przed poprawką wykazała komendy `['q', 'q', 'x']` zamiast `['q']`; wynik pliku: 9 kontroli, 8 zaliczonych i 1 błąd. Po poprawce powiązany zestaw 45/45.
- Odroczone odświeżenie: na kodzie przed poprawką późny zwykły prompt nie powodował drugiego `listy odebrane`; wynik pliku: 2 kontrole, 1 zaliczona i 1 błąd. Po poprawce wspólny zestaw 47/47.

Każdy test poprawki wykonano lokalnie przed implementacją. Test i odpowiadająca mu poprawka zapisano w tym samym commicie. CI służyło wyłącznie do potwierdzenia.

## Scenariusz w rzeczywistym kliencie

Pojedynczy scenariusz `sesje: pager koalescuje reczne q/x, a podwojny odczyt wysyla jedna komende` uruchomiono lokalnie z prawdziwym buildem Dargotha, Chromium i syntetycznym serwerem. Nie był to lokalny przebieg pełnej macierzy.

- Pierwotna asercja oczekiwała braku treści po późnym promptcie i była niezgodna z zatwierdzonym zachowaniem. Na starym scenariuszu otrzymano jeden element treści zamiast zera.
- Po zaktualizowaniu asercji scenariusz wykazał najpierw dodatkowe `q`, a po naprawie koalescencji również brak odroczonego `listy odebrane`.
- Po obu poprawkach ten sam scenariusz zakończył się wynikiem 1 zaliczony, 0 błędów. Potwierdził otwartą treść, jedno automatyczne `q`, brak dodatkowego `q`/`x`, jedno `przeczytaj list 1` i odświeżenie po późnym promptcie.
- Dargoth: `616ea27c949097f13b835d4195af26f4b32f6b14`.

## Pełne macierze

- Pierwsza macierz `45018951170` zakończyła się niepowodzeniem: 46 oczekiwanych scenariuszy, 1 nieoczekiwany, 0 pominiętych i 0 niestabilnych. Jedynym początkowym błędem była przestarzała asercja opisana powyżej. Jej dalsza diagnostyka wykazała dwie rzeczywiste regresje, które następnie naprawiono z osobnymi dowodami lokalnymi.
- Końcowa macierz `45029799741` zakończyła się sukcesem: 47 oczekiwanych scenariuszy, 0 nieoczekiwanych, 0 pominiętych i 0 niestabilnych. Artefakt zawiera `results.json` oraz znacznik `ALL-GATES-OK` z treścią `ARKMAIL-E2E-OK`.
- Końcowa macierz użyła Dargotha `616ea27c949097f13b835d4195af26f4b32f6b14`, zgodnego z kontrolą lokalną.

## Końcowe kontrole lokalne

- Node 26.13.1.
- Pełny zestaw po ostatniej poprawce: 1348 testów, 1348 zaliczonych, 0 błędów, 0 anulowanych i 0 pominiętych. Typowanie oraz build zakończyły się kodem 0.
- Ten sam pełny wynik powtórzono po wygenerowaniu finalnej paczki: 1348/1348, bez pominięć. Typowanie i build z paczki również zakończyły się kodem 0.
- Kontrola wersji przed zmianą metadanych: 10 testów, 9 zaliczonych i 1 błąd. Po zmianie i wygenerowaniu paczki: 10/10.

## Commity i zdalne potwierdzenia

- `1fc4fff367b782e064a3b3f03da73c9ba0611b89` — zwrot kompletnego listu bez zwykłego promptu; CI `45014785675`: sukces.
- `3017a60c14f3b34d2a641c9d13daa0007e9b15ef` — użycie jednoznacznego wpisu z niepotwierdzonej strony; CI `45015410794`: sukces.
- `bbf87118c5691476d60e88e5f32c307ff9eba07a` — odrzucenie niezgodnego promptu bez automatycznego `q`; CI `45016008710`: sukces.
- `2edc1cfa9d6ba64cb6dd9a1fbc9b350e41f7c70d` — koalescencja zamknięcia i odroczone odświeżenie; CI `45029735507`: sukces.
- `2476767f2e168042f08673576f633421174baa07` w repo testów — zaktualizowany scenariusz późnego promptu; macierz `45029799741`: sukces.

## Paczka wydania

- `arkmail_1_30_16.zip` zawiera dokładnie `index.ts` i `plugin.json` w katalogu głównym.
- Oba wpisy są nieskompresowane i mają datę `1980-01-01 00:00:00`.
- Dwa kolejne generowania dały bajtowo identyczną paczkę.
- SHA-256: `6997a0ebfcee2886f4576dc6f961c61f9eca50b448c34ad88e4b76f8a5c92fe1`.

## Ograniczenie wyniku

Testy syntetyczne i przeglądarkowe nie są testem w realnej grze. Końcowe sprawdzenie na rzeczywistych danych należy do użytkownika po instalacji oficjalnego wydania.
