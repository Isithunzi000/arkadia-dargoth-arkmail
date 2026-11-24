# Kontrolowany test ArkMail 1.30.17 na grze

## Zakres dowodu

Test wykonano w prawdziwym kliencie Dargoth z oficjalną paczką ArkMail 1.30.17. Nie zmieniano kodu produktu. Rejestrowano wyłącznie zanonimizowane metadane: kategorie komend i linii, czasy względne, stan interfejsu oraz długość zwróconej treści. Nie zapisano treści listów, nazw, adresatów, tematów, surowych logów ani ramek.

Wynik opisuje zaobserwowane przypadki, nie gwarantuje identycznego zachowania każdego listu ani każdej sesji.

## Środowisko

- Paczka: oficjalny adres wdrożenia ArkMail, 404573 bajty, SHA-256 `8b72a84d223c4647370c4f3af53d57232b90d3d51dd289b85adc44d84100a75f`.
- Aktywne były wyłącznie ArkMail `v1.30.17` i tymczasowe zabezpieczenie testowe ograniczające komendy.
- Pierwsze wczytanie odebranych zakończyło się bez błędu synchronizacji i zwróciło 50 wpisów.
- Operacje były wykonywane pojedynczo, bez równoległych odczytów i automatycznych ponowień.

## Etap odczytów

Wykonano pięć odczytów z odebranych. Cztery pierwsze zakończyły się poprawnie. Piąty przerwał scenariusz zgodnie z planem.

| Odczyt | Długość zwróconej treści | Wynik | Zanonimizowana sekwencja |
|---|---:|---|---|
| 1 | 421 znaki | poprawny | odczyt → `q` → listing |
| 2 | 581 znaków | poprawny | odczyt → `q` → listing |
| 3 | 36 znaków | poprawny | odczyt → `q` → listing |
| 4 | 153 znaki | poprawny | odczyt → `q` → listing |
| 5 | brak zwróconego listu | nieprawidłowy | odczyt → cztery puste przejścia pagera; brak `q` |

Przy poprawnych odczytach 2–4 zaobserwowano jeden prompt pagera, następnie `q`, dwa zwykłe prompty i odświeżenie listingu. Czas od odczytu do `q` wynosił odpowiednio około 243, 190 i 212 ms. Nie odnotowano błędu odczytu ani synchronizacji.

### Nieprawidłowy odczyt stronicowany

Czasy podano względem rozpoczęcia piątego odczytu:

1. 0 ms — komenda odczytu.
2. 206 ms — pierwsza pusta komenda pagera.
3. 606 ms — druga pusta komenda pagera.
4. Około 829 ms — pierwszy zaobserwowany prompt pagera.
5. 857 ms — trzecia pusta komenda pagera.
6. 1063 ms — czwarta pusta komenda pagera.
7. Około 1263 ms — drugi zaobserwowany prompt pagera.

Kolejność zdarzeń w rejestrze metadanych pokazuje pierwszy prompt pagera po trzecim pustym przejściu, a drugi prompt po czwartym przejściu. Nie odnotowano zwykłego promptu, komendy `q` ani zwrócenia listu do okna ArkMail. Operacja przestała być oznaczona jako zajęta, ale nie otwarto treści listu i nie zgłoszono ogólnego błędu odczytu lub synchronizacji. Główna konsola zwiększyła zawartość o 4430 znaków; bez odczytywania treści nie przypisuje się tych znaków do konkretnych linii listu.

Po około 181 sekundach od rozpoczęcia tego odczytu odnotowano komendę listingu, a następnie kolejny prompt pagera zamiast zwykłego promptu. Nie było to ponowienie odczytu. Obserwacja potwierdza, że kanał nadal znajdował się w pagerze podczas późniejszej operacji listingu.

Własny, pozostawiony pager zamknięto jednym ręcznym `q`. Po około 205 ms pojawił się zwykły prompt. Nie wykonano kolejnego odczytu, nie zaznaczano i nie usuwano żadnych listów.

## Etap skrzynek i paginacji

Po zamknięciu własnego pagera sprawdzono cztery skrzynki bez odczytywania kolejnych listów:

- odebrane: 50 wpisów, brak błędu synchronizacji;
- nieprzeczytane: 0 wpisów, operacja zakończona, brak błędu synchronizacji;
- niewysłane: 0 wpisów, operacja zakończona, brak błędu synchronizacji;
- wysłane: 0 wpisów z dostępnego lokalnie widoku, bez nowej komendy i bez błędu synchronizacji.

Następnie w odebranych kliknięto aktywną kontrolkę `Wczytaj starsze`. Nie rozpoczęła ona operacji, nie zmieniła stanu zajętości i nie wysłała komendy. Nie ponowiono kliknięcia. Ten wynik potwierdza problem z uruchomieniem paginacji w tym stanie sesji, ale nie rozstrzyga działania paginacji po nowym połączeniu.

Filtrowania serwerowego, pobierania kolejnych treści archiwum i dalszej paginacji nie wykonano w tym stanie. Nie usunięto żadnych wpisów serwerowych.

Lokalny filtr tematu archiwum sprawdzono syntetycznym wzorcem bez trafień. Wynik: 0 widocznych wpisów, a po wyczyszczeniu filtra ponownie 50. Operacja nie wysłała komendy.

## Eksporty wyłącznie w pamięci

Przed eksportami zainstalowano blokadę pobierań i sprawdzono ją syntetycznym plikiem. Bajty zostały przechwycone i odczytane w pamięci, bez zapisu na dysku.

- Eksport zbiorczy: poprawna sygnatura i struktura ZIP, 4 wpisy, wszystkie jako nieskompresowane TXT w katalogach znanych skrzynek. Wszystkie 4 pliki miały poprawny układ metadanych i treści. Rozmiar ZIP: 2462 bajty. Operacja nie wysłała komendy.
- Eksport pojedynczego listu z lokalnego archiwum: otwarcie cache i eksport nie wysłały komend. Poprawny TXT, 539 bajtów i 17 linii, z kompletem sprawdzanego układu metadanych.
- Przechwycone eksporty zostały usunięte z pamięci po kontroli. Nie testowano fizycznego zapisu na dysku.

## Książka adresowa i czyszczenie lokalne

Najpierw wyczyszczono lokalny cache izolowanego profilu oraz książkę i aliasy lokalne. Operacje nie wysłały komend i nie zmieniły danych serwerowych.

Na wyłącznie syntetycznych kontaktach sprawdzono:

- dodanie dwóch osób;
- filtrowanie: jeden wynik, po wyczyszczeniu filtra dwa;
- eksport JSON w pamięci: dokładnie dwie syntetyczne osoby, zero grup;
- usunięcie jednego utworzonego kontaktu;
- import JSON z bufora w trybie dołączania: trzy osoby po imporcie;
- import JSON z bufora w trybie zastępowania, wraz z potwierdzeniem: dokładnie jedna nowa syntetyczna osoba;
- końcowe wyczyszczenie książki: zero wpisów.

Wszystkie te działania miały zerowy przyrost komend do gry. Nie importowano realnych kontaktów ani aliasów z gry.

## Niewykonane operacje

Nie tworzono odpowiedzi, przekazań ani nowych draftów. Zakończenie edytora mogłoby w nieznanym kontekście pocztowym spowodować fizyczną wysyłkę zamiast zapisu niewysłanego listu, dlatego bez dodatkowego, jednoznacznego potwierdzenia bezpiecznego kontekstu operacji nie podjęto.

Nie wykonano filtrowania serwerowego, indeksacji pełnej, kolejnego pobierania treści ani dalszej paginacji po nieudanej próbie kontrolki starszych stron. Nie usuwano żadnych listów z żadnej skrzynki.

## Wniosek dla dalszej pracy

W zaobserwowanym przypadku nie wysłano przedwczesnego `q`. ArkMail kontynuował puste przejścia mimo promptów pagera, zakończył lokalne oczekiwanie bez wyniku i nie zamknął zdalnego pagera. Same metadane nie rozstrzygają, dlaczego prompt nie doprowadził do zamknięcia; nie wolno przypisywać tego niezgodności numeru bez dodatkowego dowodu. Naprawa produktu wymaga osobnego lokalnego testu padającego na starym kodzie oraz implementacji w tym samym commicie. Ten dokument nie jest dowodem wykonania takiej naprawy.

## Pozostały zakres

Niewykonane lub nierozstrzygnięte części pozostają w `docs/PLAN-TESTU-GRY-1.30.17.md`. Żadna z operacji lokalnych nie jest dowodem poprawy błędu stronicowanego odczytu.
