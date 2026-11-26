# Naprawa ArkMail 1.30.23

> Korekta po kolejnym tescie realnej gry: objaw blednego numeru i blokady po
> recznym `q` nadal wystepuje. Tytul i dawne wnioski o skutecznosci poprawki
> pozostaja ponizej wylacznie jako historia. Nie stanowia one potwierdzenia
> naprawy. Aktualny zakres prac opisuje `PLAN-1.30.24.md`.

## Zakres poprawki

1. Wyniki wyszukiwania otrzymuja numery komend zgodnie z pozycja w selekcji: ostatni odebrany wpis ma numer 1, przedostatni numer 2 itd. Surowa liczba wypisana przez serwer przy wyniku nie jest juz automatycznie numerem polecenia odczytu.
2. Dla dwoch wynikow oznaczonych `3, 2` wybranie drugiego widocznego wiersza wysyla `przeczytaj list 2`, a nie `przeczytaj list 3`. Nie jest potrzebny drugi listing przed pierwszym odczytem.
3. Pierwotne wyszukiwanie i kazde ponowienie tego samego filtra uzywaja wspolnej normalizacji. Ponowna kotwica nie odrzuca juz prawidlowych wynikow `3, 2` jako nieciaglej numeracji.
4. Normalizacja nastepuje przed zapisem rekordow, sprawdzeniem tozsamosci i wyborem wpisu. Niejednoznaczne identyczne wpisy nadal przerywaja operacje przed odczytem; numer nie jest zgadywany.
5. Nie zmieniono interfejsu, stylow, zwyklych listingow, pagera, tlumienia linii ani zasad zamykania odczytu. Nieznany pager gracza pozostaje nietknięty; nie przywrocono globalnego odzyskiwania ani globalnego `q`.
6. Test wymagajacy wczesniej przerwania dla wynikow `3, 2` zostal zastapiony kontrola poprawnego odczytu numeru 2. Osobne zabezpieczenia niejednoznacznosci pozostaly aktywne.

## Dowody lokalne

- Przed zmiana produktu dwa nowe scenariusze daly **6 kontrolek: 4 zaliczone i 2 bledy**. Pierwszy wykazal rzeczywiste `przeczytaj list 3` zamiast `przeczytaj list 2`; drugi wykazal, ze ponowna kotwica odrzucala wyniki `3, 2`. Typowanie przed tym przebiegiem zakonczylo sie sukcesem.
- Po poprawce dokladne scenariusze zgloszenia przeszly **6/6**, a powiazany zestaw wyszukiwania, ponownej kotwicy, odczytu, archiwum i pagera **55/55**.
- Pelny zestaw przed commitem naprawy: **1392/1392**, 0 bledow, 0 anulowanych i 0 pominietych. Osobne typowanie i budowanie zakonczyly sie sukcesem.
- Straznik wersji 1.30.23 na kodzie oznaczonym 1.30.22 zglosil oczekiwany blad: 12/13 kontrolek zaliczonych. Po dodaniu straznika tej dokumentacji, przed jej utworzeniem, wynik wynosil 12/14 z dwoma oczekiwanymi bledami.
- Dwa kolejne zbudowania daly bajtowo identyczny `arkmail_1_30_23.zip` o SHA-256 `69d0530629b4ec889dad59746d10a5f1027a0f2a3f7662d19c38077e3b912c18`. Paczka ma 410903 bajty i zawiera dokladnie `index.ts` oraz `plugin.json`, zgodne z katalogiem `build/arkmail`.

## Weryfikacja zdalna

- Commit naprawy `0035c98578a71b457ff05dd32fefce93fab3380a` przeszedl `Build plugins` w przebiegu `45869052316`; zadania `build` i `deploy` zakonczyly sie sukcesem.
- Drzewo commita naprawy porownano z lokalnym drzewem 1:1: 372 pliki sledzone, bez brakow i roznic. Lokalne artefakty budowania nie zostaly dodane do commita.
- Przed utworzeniem tagu wymagany jest osobny, zielony przebieg `Build plugins` dokladnie dla commita wydania 1.30.23.

## Wydanie 1.30.23

- GitHub Release: `ArkMail v1.30.23`, tag `v1.30.23`, dokladnie jeden asset `arkmail_1_30_23.zip`.
- Publikacja ogranicza sie do GitHuba. Bez katalogu, marketplace i innych uslug zewnetrznych.
- Tag i wydanie maja wskazywac najnowszy commit `main` zawierajacy te dokumentacje i pakiet. Po publikacji asset ma byc pobrany i porownany bajtowo z lokalna paczka oraz blobem z drzewa tagu.

## Ograniczenie wyniku

Nie wykonano nowego testu na realnej grze. Nie logowano do gry, nie odczytywano prawdziwych listow i nie wchodzono w interakcje z graczami. Dowod obejmuje lokalne dane syntetyczne, kontrole wydania i zwykly zdalny build. Zielone testy nie rozstrzygaja samodzielnie, czy caly objaw z konsoli zniknal w realnej grze; wymaga to sprawdzenia przez uzytkownika na opublikowanej paczce.
