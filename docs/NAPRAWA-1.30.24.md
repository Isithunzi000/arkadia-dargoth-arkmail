# Naprawa ArkMail 1.30.24

> Test w realnej grze obalil skutecznosc tej wersji: wlasne echo moglo
> przerwac odczyt, a reczne `q` bez echa zostawialo blokade. Dawne wyniki
> ponizej opisuja wylacznie kontrole syntetyczna i wydanie, nie potwierdzaja
> poprawnego dzialania w grze. Naprawe tego obszaru opisuje
> `NAPRAWA-1.30.25.md`.

## Zakres poprawki

1. Odczyt uzywa numerow z aktualnego listingu serwera bez przeliczania pozycji wynikow filtra ani numerow wizualnych wierszy interfejsu.
2. Wpis z nieaktualnego kontekstu jest ponownie odnajdywany przez zwykly listing zakotwiczony na dacie. Wybor odbywa sie po jednoznacznym `archiveId`, a odczyt uzywa swiezego numeru serwera. Listing i odczyt naleza do jednej operacji wylacznej.
3. Wczytanie kolejnych stron nie zmienia serwerowego podzialu na strony po maksymalnie 50 listow. Testy obejmuja pozycje 1, 50, 51 i 100 oraz odczyt najstarszego wczytanego wpisu.
4. Po odrzuceniu numeru wolno wykonac najwyzej jedno ponowne odnalezienie. Brak jednoznacznego wpisu konczy operacje bez zgadywania i bez automatycznego `q` do pagera nieznanego pochodzenia.
5. Reczne `q` lub `x` przechodzi do gry raz i natychmiast zdejmuje lokalna blokade dzialan uzytkownika. Nie czeka na zwykly prompt ani limit czasu.
6. Blokada interfejsu i blokada automatyzacji sa rozdzielone. Automatyczne komendy pozostaja wstrzymane do zwyklego promptu, natomiast sam limit ciszy ich nie wznawia.
7. Nowy interfejs, archiwum i pozostale funkcje zostaly zachowane. Nie przywracano calych plikow z wersji 1.30.5.

## Dowody lokalne

- Poprawka odczytu przeszla pelny zestaw: **1388 testow, 1387 zaliczonych, 0 bledow, 0 anulowanych i 1 pominiety**. Osobne typowanie i budowanie zakonczyly sie sukcesem.
- Przed zmiana obslugi `q/x` skupione scenariusze daly **37 testow: 32 zaliczone i 5 bledow**. Bledy dotyczyly natychmiastowego odczytu po recznym `q`, odblokowania przez echo i przechwycona komende oraz niezaleznosci automatyzacji od limitu ciszy.
- Po poprawce `q/x` te same scenariusze przeszly **37/37**. Pelny zestaw przed commitem tej poprawki dal **1388 testow, 1387 zaliczonych, 0 bledow, 0 anulowanych i 1 pominiety**. Typowanie, budowanie, higiena i kontrola ASCII zakonczyly sie sukcesem.
- Pelny zestaw dla wydania 1.30.24: **1389 testow, 1388 zaliczonych, 0 bledow, 0 anulowanych i 1 pominiety**. Osobne typowanie, budowanie, kontrole determinizmu i higiena zakonczyly sie sukcesem.
- Straznik wersji 1.30.24 na kodzie 1.30.23 zglosil dwa oczekiwane bledy: **15 testow, 13 zaliczonych i 2 bledy**. Pierwszy wykazal stara wersje, drugi brak tej dokumentacji.
- Dwa kolejne zbudowania daly bajtowo identyczny `arkmail_1_30_24.zip` o SHA-256 `7015bdb050522defb420c8b70d48a624d6cd9448188fa5c3afb573a21ee304ba`. Paczka ma 409399 bajtow i zawiera dokladnie `index.ts` oraz `plugin.json`, zgodne z katalogiem `build/arkmail` i wersja 1.30.24.

## Weryfikacja zdalna

- Commit poprawki odczytu `3e0c586bfb1cb1b76154fc41ba2d0aa02575f320` przeszedl `Build plugins` w przebiegu `45919106906`; zadania `build` i `deploy` zakonczyly sie sukcesem.
- Commit poprawki `q/x` `87580ef37cff836e799c2260b0af76997dfe65b2` przeszedl `Build plugins` w przebiegu `45922672796`; zadania `build` i `deploy` zakonczyly sie sukcesem.
- Drzewo commita `q/x` porownano z lokalnym drzewem 1:1: 376 plikow, bez brakow, nadmiarowych sciezek i roznic. Commit zawiera wylacznie implementacje i trzy pliki testow.
- Przed utworzeniem tagu wymagany jest osobny, zielony przebieg `Build plugins` dokladnie dla commita wydania 1.30.24.

## Wydanie 1.30.24

- GitHub Release: `ArkMail v1.30.24`, tag `v1.30.24`, dokladnie jeden asset `arkmail_1_30_24.zip`.
- Publikacja ogranicza sie do GitHuba. Bez katalogu, marketplace i innych uslug zewnetrznych.
- Tag i wydanie maja wskazywac najnowszy commit `main` zawierajacy te dokumentacje i pakiet. Po publikacji asset ma byc pobrany i porownany bajtowo z lokalna paczka oraz blobem z drzewa tagu.

## Ograniczenie wyniku

Nie wykonano testow na realnej grze. Nie logowano do gry, nie odczytywano prawdziwych listow i nie wchodzono w interakcje z graczami. Dowod obejmuje lokalne dane syntetyczne, kontrole wydania i zwykly zdalny build. Zielone testy nie rozstrzygaja samodzielnie, czy objawy znikna w realnej grze; wymaga to sprawdzenia przez uzytkownika na opublikowanej paczce.
