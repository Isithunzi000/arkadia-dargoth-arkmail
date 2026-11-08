# Tymczasowy plan poprawy pol dat

Dokument roboczy. Usunac po wdrozeniu calego zakresu i zaliczeniu wszystkich testow.

## Stan i zakres

Analiza ArkMaila 1.30.5 (`57b0bee3b7394098e46a91bc7b458eef499991b6`) oraz klienta Dargoth (`13a6dce7ed9e55df3e53e9c3515b3ab7b9e8cedc`).

W pluginie jest szesc pol dat i wszystkie maja prawidlowy typ `input type="date"`:

- Listy: `data-search="odDaty"` i `data-search="doDaty"`;
- Archiwum: `data-filter="odDaty"` i `data-filter="doDaty"`;
- Usuwanie: `data-deletion-filter="odDaty"` i `data-deletion-filter="doDaty"`.

Zgloszony problem dotyczy slabej widocznosci ikony kalendarza, nie braku natywnego pickera. Filtrowanie, parsowanie i zakresy dat dzialaja i nie wchodza w zakres poprawki.

## Potwierdzona przyczyna

Reguly w `src/arkmail/ui/styles.ts` wymuszaja na polach List i Archiwum:

```css
color-scheme: light dark;
```

Tlo pola pochodzi z motywu Dargotha, ale natywna ikona wybiera wariant wedlug schematu systemu lub przegladarki. Przy przeciwstawnych ustawieniach ikona jest ciemna na ciemnym tle albo jasna na jasnym tle.

Kontrolowana proba w Chromium 151 potwierdzila oba przypadki. Pole nie jest wylaczone ani tylko do odczytu. Klikniecie obszaru ikony otwiera kalendarz takze wtedy, gdy ikona jest prawie niewidoczna.

W Usuwaniu nie ma lokalnego nadpisania schematu. Pole dziedziczy schemat klienta. Naprawa ma objac wszystkie szesc pol jedna wspolna regula, aby usunac rozjazd implementacji i zabezpieczyc caly interfejs.

W ArkMailu i globalnych stylach Dargotha nie znaleziono ukrywania `::-webkit-calendar-picker-indicator`, wylaczania `appearance` dla pol dat, blokowania zdarzen ani `pointer-events: none` na tych polach.

## Decyzja projektowa

1. Usunac oba lokalne wymuszenia `color-scheme: light dark`.
2. Dodac jedna wspolna regule dla wszystkich pol dat ArkMaila: `color-scheme: inherit`.
3. Nie zmieniac `input type="date"`, recznego wpisywania, formatu `RRRR-MM-DD`, walidacji, komend serwera ani filtrowania Archiwum.
4. Nie dodawac wlasnego kalendarza, nowych przyciskow ani wywolan `showPicker()`. Zgloszenie dotyczy wylacznie czytelnosci istniejacej ikony.
5. Nie stosowac stalego `filter: invert(...)` ani innego recznego kolorowania ikony. Takie rozwiazanie znow ignorowaloby motyw.
6. Nie zmieniac etykiet ani innych elementow interfejsu w tej poprawce.

## Dowody red-green

Najpierw nowe testy musza przejsc lokalnie na obecnym kodzie i wykazac RED. Celowego RED nie wolno wykonywac przez CI. Dopiero potem implementacja i pelny zestaw GREEN.

1. Test stylu na starym kodzie: wykrywa `light dark` i brak wspolnej reguły `color-scheme: inherit` dla wszystkich szesciu pol. Po poprawce ma przechodzic.
2. Test struktury DOM: potwierdza `type="date"` dla dwoch pol w Listach, dwoch w Archiwum i dwoch w Usuwaniu.
3. Test w prawdziwym Chromium dla wszystkich szesciu pol sprawdza efektywny `getComputedStyle(input).colorScheme` w czterech kombinacjach:
   - ciemny motyw klienta i jasny schemat systemu;
   - ciemny motyw klienta i ciemny schemat systemu;
   - jasny motyw klienta i jasny schemat systemu;
   - jasny motyw klienta i ciemny schemat systemu.
4. Dowod wizualny na prawdziwym kliencie: zrzuty pol przed i po zmianie w obu krytycznych kombinacjach. Ikona musi byc wyrazna bez recznego kolorowania.
5. Test zachowania: klikniecie ikony i wybor dnia nadal ustawia wartosc ISO. Sam test otwarcia pickera nie wykrywa pierwotnego bledu, dlatego nie zastepuje punktow 3 i 4.
6. Testy filtrowania maja pozostac bez zmian i potwierdzic brak regresji logiki.
7. Po czesci red-green: pelny zestaw jednostkowy, `typecheck`, build i macierz E2E.

## Warunek zamkniecia

- Wszystkie szesc pol ma czytelna ikone w jasnym i ciemnym motywie, niezaleznie od schematu systemu.
- Natywny picker i reczne wpisywanie dzialaja bez zmian.
- Pelne testy sa zielone.
- Ten dokument zostaje usuniety w commicie zamykajacym caly zakres.
