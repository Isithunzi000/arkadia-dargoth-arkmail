# ArkMail

Poczta Arkadii w oknie klienta Dargoth: skrzynki, szukanie, kontakty,
archiwum i pisanie listów.

## Instalacja

1. Otwórz klienta Dargoth.
2. Dodaj wtyczkę z adresu [arkmail.js na GitHub Pages](https://isithunzi000.github.io/arkadia-dargoth-arkmail/arkmail.js).

3. W grze wpisz `/arkmail`, aby otworzyć okno poczty.


## Aktualizacje

Wtyczka ładowana jest z powyższego adresu przy każdym uruchomieniu
klienta — aktualizacje przychodzą same, bez ponownej instalacji. Numer
wersji widnieje w nagłówku okna.

## Co potrafi

- czytanie i pisanie listów we wszystkich skrzynkach (odebrane,
  nieprzeczytane, wysłane, niewysłane)
- wczytywanie starszych listów — skrzynka nie kończy się na 50
- szukanie po osobie, temacie, treści i dacie
- usuwanie i przekazywanie listów
- zbiorcze usuwanie zaznaczonych listów z jednej skrzynki
- kontakty z licznikami listów
- archiwum per postać: indeksacja, zapis treści, eksport do TXT i ZIP
- powiadomienia o nowej poczcie (opcjonalne)

## Użycie

`/arkmail` — otwiera i zamyka okno. Reszta to przyciski w oknie.

**Listy.** Puste pola i przycisk Szukaj odświeżają aktywną skrzynkę;
kliknięcie nazwy skrzynki także. Wpisanie filtrów uruchamia wyszukiwanie.
Pole osoby wymaga dopełniacza; wybrane daty są uwzględniane włącznie.

**Pisanie.** Pola adresat i DW przyjmują kilka nazw lub aliasów
rozdzielonych przecinkami. Temat i treść nie mogą zawierać znaków `;`
ani `#`. List musi mieć wpisaną treść; sam szablon ramki nie wystarczy.

**Archiwum.** Trzy niezależne kroki, każdy przycisk wykonuje tylko własną
operację — pobieranie treści i zapis ZIP nie uruchamia indeksacji:

1. Indeksacja — spis wszystkich listów postaci.
2. Pobranie treści — pełne listy; gdy serwer części nie udostępni,
   można pobrać dostępne i zapisać częściowy ZIP (komunikat podaje liczby
   zapisanych i pominiętych listów).
3. Zapis ZIP — archiwum na dysku.

Listy o identycznych metadanych (ta sama osoba, temat i data) traktujemy
jak osobne listy: tyle razy, ile serwer wylistował taki wpis, tyle razy
występuje w archiwum — każde wystąpienie ze swoją treścią i jako osobny
plik w zapisie ZIP. Komunikat wyjaśnia też, że pusta lub błędna data nie
oznacza zniknięcia listu.

**Usuwanie listów.** Pobiera jeden wynik z wybranej skrzynki; można go
zawęzić filtrami, zaznaczyć wiele pozycji i usunąć po potwierdzeniu.
Wyniki nie odświeżają się automatycznie; wyjście z zakładki czyści wyniki, filtry i zaznaczenie. W Usuwaniu przycisk Odswiez ponawia ostatnie
wyszukiwanie.

## Znane ograniczenia

- Przy ponad 50 listach dziennie paginacja "Wczytaj starsze" może
  przeskoczyć dzień, w którym było ich więcej — serwer nie pokazuje
  takiego dnia w całości i w archiwum brakuje danych z niego. Wtyczka
  wykrywa taką lukę i mówi, z którego dnia brakuje.
- Numer listu jest ulotny: po dodaniu lub skasowaniu listu serwer
  przenumerowuje skrzynkę. Wtyczka paruje wpisy po treści i metadanych,
  więc fizyczna tożsamość listu między osobnymi sesjami bywa nie do
  ustalenia.
- Między pokazaniem listy a kliknięciem ktoś mógł ją skasować — wtedy
  wtyczka odświeża widok i informuje, zamiast otwierać pusty ekran.

## Licencja

AGPL-3.0 — pełny tekst licencji w pliku [LICENSE](LICENSE).

## Dla developerów

Do pracy nad wtyczką wymagany jest Node 24 lub nowszy.

```bash
npm ci
npm test
```

Specyfikacja protokołu: [docs/PROTOCOL.md](docs/PROTOCOL.md).
