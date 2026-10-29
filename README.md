# ArkMail

Poczta Arkadii w oknie klienta Dargoth.

## Instalacja

W kliencie Dargoth dodaj wtyczkę z adresu:

```
https://isithunzi000.github.io/arkadia-dargoth-arkmail/arkmail.js
```

## Co potrafi

- czytanie i pisanie listów we wszystkich skrzynkach (odebrane,
  nieprzeczytane, wysłane, niewysłane)
- wczytywanie starszych listów — skrzynka nie kończy się na 50
- szukanie po osobie, temacie, treści i dacie
- usuwanie i przekazywanie listów
- zbiorcze usuwanie zaznaczonych listów z jednej skrzynki
- kontakty z licznikami listów
- archiwum per postać: filtry, zapis treści, eksport do TXT i ZIP
- powiadomienia o nowej poczcie (opcjonalne)

## Użycie

`/arkmail` — otwiera i zamyka okno. Reszta to przyciski w oknie.

Puste pola i przycisk Szukaj odświeżają aktywną skrzynkę w Listach. Kliknięcie
wybranej skrzynki także ją odświeża. Wpisanie filtrów uruchamia wyszukiwanie.
Pole osoby wymaga dopełniacza, a wybrane daty są uwzględniane włącznie.

Przy pisaniu pola adresat i DW mogą zawierać kilka nazw lub aliasów
rozdzielonych przecinkami. Temat i treść nie mogą zawierać znaków `;` ani `#`.
List musi mieć wpisaną treść; sam szablon ramki nie wystarczy.

Zakładka **Archiwum** pokazuje kolejno: **1. Indeksacja**, **2. Pobranie treści**
i **3. Zapis ZIP**. Każdy przycisk wykonuje tylko własną operację: pobieranie
treści i zapis ZIP nie uruchamia indeksacji. Gdy serwer nie udostępni części
listów, można pobrać dostępne treści i zapisać częściowy ZIP. Komunikat podaje
liczbę zapisanych i pominiętych listów. Archiwum łączy powtórzone wpisy tego
samego listu i liczy je raz. Treść w jednym z powiązanych wpisów wystarcza dla
całej grupy. Komunikat wyjaśnia też, że pusta lub błędna data nie oznacza
zniknięcia listu.

Zakładka **Usuwanie listów** pobiera jeden wynik z wybranej skrzynki.
Można zawęzić go filtrami, zaznaczyć wiele listów i usunąć je po
potwierdzeniu. Wyniki nie odświeżają się automatycznie; wyjście z zakładki
czyści wyniki, filtry i zaznaczenie. W Usuwaniu przycisk Odswiez ponawia
ostatnie wyszukiwanie.

## Dla developerów

Do pracy nad wtyczką wymagany jest Node 24 lub nowszy.

```bash
npm ci
npm test
```

Specyfikacja protokołu: `docs/PROTOCOL.md`. Renderer listów to port 1:1
z oficjalnego klienta WWW Arkadii (licencja MIT, https://arkadia.rpg.pl).
