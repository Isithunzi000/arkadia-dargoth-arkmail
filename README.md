# ArkMail

Poczta Arkadii w oknie klienta Dargoth: skrzynki, szukanie, kontakty,
archiwum i pisanie listów.

## Instalacja

1. Otwórz klienta Dargoth.
2. Dodaj wtyczkę z adresu
   [https://isithunzi000.github.io/arkadia-dargoth-arkmail/arkmail.js](https://isithunzi000.github.io/arkadia-dargoth-arkmail/arkmail.js).
3. W grze wpisz `/arkmail`, aby otworzyć okno poczty.

## Aktualizacje

Wtyczka ładowana jest z powyższego adresu przy każdym uruchomieniu
klienta — aktualizacje przychodzą same, bez ponownej instalacji. Numer
wersji widnieje w nagłówku okna.

## Użycie

`/arkmail` otwiera i zamyka okno; reszta to przyciski i zakładki.
Puste pola i przycisk Szukaj odświeżają aktywną skrzynkę; wpisanie
filtrów uruchamia szukanie po stronie serwera: osobie, temacie, treści
i dacie. Skrzynka nie kończy się na 50 — starsze listy wczytuje się
przyciskiem na dole listy.

Zakładka Usuwanie pobiera jeden wynik z wybranej skrzynki; można go
zawęzić filtrami, zaznaczyć wiele pozycji i usunąć po potwierdzeniu.
W Usuwaniu przycisk Odswiez ponawia ostatnie wyszukiwanie.

**Archiwum.** Trzy niezależne kroki — pobieranie treści i zapis ZIP
nie uruchamia indeksacji:

1. Indeksacja — spis wszystkich listów postaci.
2. Pobranie treści — pełne listy; gdy serwer części nie udostępni,
   można zapisać częściowy ZIP (komunikat podaje liczby zapisanych
   i pominiętych listów).
3. Zapis ZIP — archiwum na dysku.

Listy o identycznych metadanych (ta sama osoba, temat i data)
traktujemy jak osobne listy: tyle razy, ile serwer wylistował taki
wpis, tyle razy występuje w archiwum — każde wystąpienie ze swoją
treścią i jako osobny plik w zapisie ZIP; pusta lub błędna data nie
oznacza zniknięcia listu.

## Licencja

AGPL-3.0 — pełny tekst licencji w pliku [LICENSE](LICENSE).
