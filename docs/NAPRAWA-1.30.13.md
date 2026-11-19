# Naprawa ArkMail 1.30.13

## Punkt wyjscia

- Baza: ArkMail 1.30.12, commit `f3c9963ac48485f583f0da9b25dc9c7a60722686`.
- Kopia robocza jest zgodna z drzewem GitHub: 334 pliki, zgodne identyfikatory blobow, drzewo bez obciecia.
- Zdalny build bazowego commita zakonczyl sie sukcesem.

## Zatwierdzony zakres

1. **Tylko DW:** zakres DW powstaje z pierwotnego naglowka DW przed deduplikacja z nadawca i DO. Deduplikacja wewnatrz DW oraz usuwanie biezacej postaci pozostaja. DO+DW i Tylko DO zachowuja dotychczasowy kontrakt.
2. **Pager i reczne q/x:** komenda uzytkownika nie moze zostac odrzucona przed rozpoznaniem pagera, po automatycznym q ani podczas zamykania. Obsluga z echem i bez echa ma ten sam skutek, bez podwojnego wyslania. Zwykly prompt konczy oczekiwanie, a ograniczony czasowo mechanizm awaryjny zapobiega blokadzie bez konca. Pozne odpowiedzi starej sesji nie moga zmienic nowej.
3. **Szybkie kolejne operacje:** drugie klikniecie nie otwiera rownoleglej sesji. Odczyt, usuwanie, przekazywanie i pobieranie korzystaja z tej samej poprawionej obslugi zamykania.
4. **Paginacja:** niepotwierdzony listing konczy automatyczne pobieranie kolejnych stron. Czesciowy wynik nie moze powodowac pelnej indeksacji, zastapienia Archiwum ani kasowania nieobecnych rekordow. Pozne wpisy, echo i prompt starej strony nie trafiaja do nowej sesji.
5. **Kontakty i filtry:** pelne `headers.from`, `headers.to` i `headers.cc` uzupelniaja `party`; stare rekordy zachowuja fallback. Osoby tylko w DW sa uwzgledniane w kontaktach, licznikach, dodawaniu wszystkich kontaktow, skoku z kontaktu i lokalnych filtrach. Biezaca postac oraz duplikaty bez rozrozniania wielkosci liter nie tworza dodatkowych pozycji.
6. **Eksport:** nazwy plikow korzystaja z pelnych naglowkow z fallbackiem do `party`. Tresc eksportu i pelne naglowki pozostaja bez zmian.
7. **Regresja:** wszystkie cztery skrzynki, Listy i Archiwum, cytowanie i brak cytowania, zwykla odpowiedz, wysylka, grupy, przekazywanie, usuwanie, kontakty, filtry i eksport.

## Zasady wykonania

- Kazda poprawka zaczyna sie od lokalnego testu padajacego na starym kodzie. Test i implementacja trafiaja do jednego commita.
- Kontrole dotychczas poprawnego zachowania sa testami regresji i nie sa przedstawiane jako dowod bledu na starej wersji.
- Przed kazdym commitem: pelny szybki zestaw lokalny, rzeczywiste typowanie i build.
- Pelna macierz scenariuszowa uruchamiana jest raz po ostatniej poprawce, przed wydaniem, na GitHub Actions.
- Bez przypadkowych opoznien anty-lag, zmian niezwiazanych z zakresem, modyfikacji zrodel Dargotha, wymuszonych pushy i publikacji zewnetrznych.
- Commity i wydanie po polsku, ASCII, rzeczowo. W repozytorium wylacznie syntetyczne dane testowe.

## Kolejnosc

1. Tylko DW i regresja odbiorcow.
2. Pager, q/x, blokady i odzyskiwanie.
3. Paginacja i pozne odpowiedzi.
4. Kontakty, filtry i nazwy eksportow.
5. Scenariusze przegladarkowe, pelne kontrole i macierz.
6. Wersja 1.30.13, tag `v1.30.13`, GitHub Release `ArkMail v1.30.13`, jeden asset `arkmail_1_30_13.zip` z kontrola bajtowa i SHA-256.

## Wyniki

### Tylko DW

- Baza przed zmiana: 1221 testow, 1221 zaliczonych, 0 bledow; typowanie i build zakonczone sukcesem.
- RED na niezmienionym kodzie: 4 nowe przypadki wykryly utrate osob z DW oraz bledny pusty zakres; pozostale 41 z 45 ukierunkowanych testow przechodzilo.
- GREEN po poprawce: 45 z 45 ukierunkowanych testow.
- Pelny zestaw po poprawce: 1224 testy, 1224 zaliczone, 0 bledow; typowanie i build zakonczone sukcesem.
- Zakres kodu: Tylko DW uzywa niezaleznej deduplikacji pierwotnego naglowka DW. DO+DW i Tylko DO pozostaly bez zmian.

### Pager, q/x i odzyskiwanie

- RED na niezmienionym kodzie: 9 nowych przypadkow wykrylo podwojne zamkniecie, odrzucenie recznego q/x oraz blokade bez zwyklego promptu; pozostale 17 z 26 ukierunkowanych testow przechodzilo.
- GREEN po poprawce: 26 z 26 ukierunkowanych testow.
- Pelny zestaw po poprawce: 1233 testy, 1233 zaliczone, 0 bledow, 0 przerwanych; rzeczywiste typowanie i build zakonczone sukcesem.
- Reczne q/x przed rozpoznaniem pagera oraz po automatycznym zamknieciu jest koalescencja jednego zamkniecia. Modal konczy sie natychmiast, a ograniczony hook do zwyklego promptu usuwa wylacznie powtorzenia q/x; wszystkie inne komendy przechodza normalnie.
- Tryb gracza bez zwyklego promptu ma awaryjne wyjscie po 180 sekundach. Blokada transportu `recovering` nie jest zdejmowana przez sam uplyw czasu, aby pozne dane starej sesji nie trafily do nowej.

### Paginacja i pozne odpowiedzi

- RED na niezmienionym kodzie: 4 przypadki wykryly kolejna strone po niepotwierdzonej odpowiedzi, kolejna kotwice po niepotwierdzonym listingu bazowym oraz niebezpieczna kontynuacje w petli i indeksacji; pozostale 5 z 9 ukierunkowanych testow przechodzilo.
- GREEN po poprawce: 9 z 9 ukierunkowanych testow.
- Pelny zestaw po poprawce: 1234 testy, 1234 zaliczone, 0 bledow, 0 przerwanych; rzeczywiste typowanie i build zakonczone sukcesem.
- Niepotwierdzona strona oraz niepotwierdzony listing bazowy sa najpierw scalane, a nastepnie koncza skan wynikiem czesciowym. Nie otwieraja kolejnej sesji, nie stempluja kompletu, nie zastepuja Archiwum i nie kasuja nieobecnych rekordow.

Pozostale wyniki beda dopisywane wraz z kolejnymi commitami. Po zakonczeniu calego zakresu ten dokument zostanie usuniety jako zrealizowany.
