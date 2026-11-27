# Naprawa ArkMail 1.30.25

## Zakres poprawki

1. Kazda wysylka ArkMaila ma ograniczone w czasie dopasowanie do ewentualnej linii echa, niezaleznie od flagi `echo`. Echo wlasnego odczytu nie wlacza recznej poczty, nie anuluje sesji i nie wypuszcza tresci listu do konsoli.
2. Osobny, nietlumacy hook wejscia rozpoznaje rzeczywista komende gracza takze bez linii echa. Reczne `q` lub `x` przechodzi do gry dokladnie raz i natychmiast zdejmuje lokalna blokade dzialan uzytkownika.
3. Blokada automatycznych komend pozostaje rozdzielona od interfejsu. Automatyzacja wznawia prace dopiero po zwyklym prompcie. Aktywny modal nadal obsluguje komendy pagera bez duplikatow i bez wykonywania ich poza pagerem.
4. Dopasowania wysylek bez jawnego echa uzywaja terminu sprawdzanego przy odczycie strumienia. Nie dodaja nowych timerow do pauz pobierania i paginacji.
5. Nie przywrocono automatycznego `q` do pagera nieznanego pochodzenia. Nie zmieniono interfejsu, archiwum, edytora, odpowiedzi, wysylki, kasowania ani numeracji wynikow filtrowania.

## Dowody lokalne

- Przed zmiana produktu kontrolowany zestaw na kodzie 1.30.24 dal **5 testow: 3 zaliczone i 2 bledy**. Pierwszy blad wykazal anulowanie wlasnego odczytu przez echo, brak listu w interfejsie i brak tlumienia tresci. Drugi wykazal blokade interfejsu po recznym `q` bez echa.
- Po pierwszej poprawce powiazane scenariusze przeszly **77/77**. Pelny przebieg wykazal nastepnie cztery bledy w testach pauz pobierania, poniewaz kazda wysylka bez echa otrzymala dodatkowy timer. Zrezygnowano z tych timerow na rzecz terminow sprawdzanych przy odczycie strumienia.
- Po korekcie skupiony zestaw transportu, odczytu, pagera i pauz pobierania przeszedl **63/63**. Dodano takze kontrole wygasania dopasowania echa bez flagi.
- Koncowy pelny zestaw dla naprawy: **1395 testow, 1394 zaliczone, 0 bledow, 0 anulowanych i 1 pominety**. Obejmuje nowa kontrole wygasania dopasowania echa bez flagi. Osobne typowanie `tsc --noEmit`, budowanie oraz kontrole determinizmu, higieny, ASCII, wrazliwych danych i komunikatu commita zakonczyly sie sukcesem. Strazniki wersji i dokumentacji przeszly **18/18**.

## Weryfikacja zdalna

- Zdalna kontrola zostanie zapisana po weryfikacji commita i zakonczeniu `Build plugins`.
- Przed utworzeniem tagu wymagany jest osobny, zielony przebieg `Build plugins` dokladnie dla commita wydania 1.30.25.

## Wydanie 1.30.25

- Docelowy GitHub Release: `ArkMail v1.30.25`, tag `v1.30.25`, dokladnie jeden asset `arkmail_1_30_25.zip`.
- Publikacja ogranicza sie do GitHuba. Bez katalogu, marketplace i innych uslug zewnetrznych.
- Tag i wydanie maja wskazywac najnowszy commit `main` zawierajacy te dokumentacje i pakiet. Po publikacji asset ma byc pobrany i porownany bajtowo z lokalna paczka oraz blobem z drzewa tagu.

## Ograniczenie wyniku

Nie wykonano testow na realnej grze. Nie logowano do gry, nie odczytywano prawdziwych listow i nie wchodzono w interakcje z graczami. Dowod obejmuje lokalne dane syntetyczne, kontrole wydania i zwykly zdalny build. Zielone testy nie rozstrzygaja samodzielnie, czy objawy znikna w realnej grze; wymaga to sprawdzenia przez uzytkownika na opublikowanej paczce.
