# Naprawa ArkMail 1.30.21

## Zakres poprawki

1. Wyniki wyszukiwania muszą mieć kompletną numerację `1..N`. Niespójna numeracja przerywa operację przed wysłaniem komendy odczytu.
2. Pełny listing nie jest akceptowany jako odpowiedź na filtr. Numer listu pochodzi wyłącznie ze świeżego listingu zakończonego zwykłym promptem albo 500 ms ciszy.
3. Po `Zly numer listu` nie następuje natychmiastowe ponowienie. Jedna ponowna próba jest dozwolona dopiero po zwykłym prompcie; sama cisza ani prompt pagera nie dają zgody na ponowienie.
4. Błąd zakończony promptem pagera kończy operację jako niejednoznaczną, bez automatycznego `q`. Sam zgodny prompt pagera przed nagłówkami nie jest pustym, poprawnym odczytem.
5. Ochrona przed nagłówkami dotyczy czystego odczytu. Kasowanie i przekazywanie zachowują dotychczasową obsługę odpowiedzi rozpoczynającej się od promptu pagera.
6. Ręczne `q` lub `x` w modalu odblokowuje obsługę poczty po 500 ms od ostatniej odpowiedzi. Limit 180 sekund dla zwykłej ręcznej poczty poza modalem pozostaje bez zmian.
7. Gagowanie pozostaje bez zmian. Poprawka nie zmienia sposobu filtrowania ani identyfikowania wpisów archiwum.

## Dowody lokalne

- Przed implementacją wszystkie siedem nowych scenariuszy bezpieczeństwa odczytu zakończyło się oczekiwanymi błędami na kodzie 1.30.20: 0/7 zaliczonych. Po naprawie zestaw przeszedł 7/7.
- Wzmocnienie scenariusza promptu pagera klasą `prompt` wykryło błąd kolejności rozpoznawania promptów. Przed ostatnią korektą wynik wynosił 6/7; po rozpoznawaniu promptu pagera przed ogólną klasą promptu zestaw ponownie przeszedł 7/7.
- Pełny zestaw po naprawie i przed zmianą numeru wydania: **1374 kontrolki, 1373 zaliczone, 0 błędów, 0 anulowanych i 1 pominięta**. Pominięcie dotyczyło wyłącznie kontroli opisu commita bez `COMMIT_MSG`.
- Osobne typowanie i budowanie zakończyły się sukcesem. Nie uruchamiano lokalnej pełnej macierzy przeglądarkowej.
- Kontrola wersji przed podbiciem numeru zgłosiła oczekiwany błąd: źródło wskazywało 1.30.20 zamiast 1.30.21. Po zmianie numeru pełna kontrola wersji przeszła 12/12.
- Dwa kolejne zbudowania dały bajtowo identyczny `arkmail_1_30_21.zip` o SHA-256 `89324633d28d6ba03b97a6bae828b3a3d1c4a5b9599f974d7d4c0ff9297771a9`.
- Paczka zawiera dokładnie `index.ts` i `plugin.json`. Oba pliki są zgodne z katalogiem `build/arkmail`; `meta.ts`, oba pola wersji w `plugin.json` i data builda są zsynchronizowane.

## Weryfikacja zdalna

- Commit naprawy `b2e3e341a998c688f5775e6a810e98080ae72afa` przeszedł `Build plugins` w przebiegu `45733669264`; zadania `build` i `deploy` zakończyły się sukcesem.
- Przed utworzeniem tagu wymagany jest osobny, zielony przebieg `Build plugins` dokładnie dla commita wydania 1.30.21.
- Nie uruchamiano testów na realnej grze ani lokalnej pełnej macierzy E2E.

## Wydanie 1.30.21

- GitHub Release: `ArkMail v1.30.21`, tag `v1.30.21`, dokładnie jeden asset `arkmail_1_30_21.zip`.
- Publikacja ogranicza się do GitHuba. Bez katalogu, marketplace i innych usług zewnętrznych.
- Tag i wydanie mają wskazywać najnowszy commit `main` zawierający tę dokumentację i pakiet. Po publikacji asset ma być pobrany i porównany bajtowo z lokalną paczką.

## Ograniczenie wyniku

Nie logowano do gry, nie łączono z realnym serwerem i nie wchodzono w interakcje z graczami. Dowód obejmuje lokalne dane syntetyczne oraz zwykły zdalny build.
