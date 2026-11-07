# Plan ArkMail 1.30.4 — spójność i układ interfejsu

## 1. Status i punkt wyjścia

Dokument obowiązuje do pełnego wykonania zakresu. Po zakończeniu wszystkich prac, uzyskaniu zielonych testów i przygotowaniu wydania dokument ma zostać usunięty.

Punkt wyjścia zweryfikowany przed sporządzeniem planu:

- repozytorium: `Isithunzi000/arkadia-dargoth-arkmail`, gałąź `main`;
- HEAD: `e0a2d04c6ed96faf81e2228ba278a53453c1aa1f`, `Przygotuj ArkMail 1.30.3`;
- lokalne drzewo jest zgodne ze zdalnym HEAD: 293 pliki;
- wersja wyjściowa: 1.30.3;
- klient używany w testach: `Delwing/arkadia-web-client-extension`, SHA `b9de7dc9eabf7f2859d4560df89861241eec4628`;
- repozytorium testów: `Isithunzi000/arkadia-dargoth-testy`;
- dotychczasowa macierz ArkMaila: 23 testy;
- marketplace i Vercel są wyłączone z zakresu.

Cel wydania 1.30.4: poprawić układ, czytelność i spójność kontrolek bez zmiany zachowania poczty, danych, poleceń wysyłanych do gry ani obsługiwanych przepływów.

## 2. Reguły nienaruszalne

1. Każda zmiana zachowania interfejsu ma najpierw test, który przechodzi na docelowym zachowaniu i pada na niezmienionym kodzie. Dowód niepowodzenia sprawdzamy lokalnie, nigdy przez celowo czerwony push do CI.
2. Test i implementacja trafiają w jednym commicie. Przed commitem przechodzą pełne szybkie bramki repozytorium: `typecheck`, komplet testów i build.
3. Historii nie przepisujemy. Nieoczekiwana czerwień po pushu jest naprawiana kolejnym commitem.
4. Teksty interfejsu i komentarze w `src` pozostają bez polskich diakrytyków. Commity są po polsku, rzeczowe i bez diakrytyków.
5. Nie zmieniamy handlerów, formatów danych, zapisu lokalnego, protokołu poczty, walidacji, poleceń do Arkadii ani istniejących potwierdzeń operacji niebezpiecznych, poza zmianą samej etykiety potwierdzenia pobierania opisaną niżej.
6. Zachowujemy istniejące selektory `data-*` i klasy używane przez testy oraz logikę. Nowe klasy są dodawane, a nie wykorzystywane do zastępowania stabilnych punktów zaczepienia bez konieczności.
7. Kolory, wysokość, obramowanie, hover, disabled i focus pochodzą z natywnych klas oraz tokenów klienta. Nie tworzymy własnych kolorów przycisków.
8. Samodzielne przyciski akcji mają naturalną szerokość. Nie są rozciągane przez kolumnowy `flex`, `flex: 1` ani przypadkowe `width: 100%`.
9. Pełna szerokość pozostaje tylko w zamkniętych wyjątkach:
   - `Szukaj / Odswiez` jako główna akcja formularza;
   - `Wczytaj starsze` jako zakończenie listy;
   - przyciski w kartach kroków Archiwum;
   - istniejące, celowe pełne przyciski nawigacyjne lub formularza, których ten plan nie zmienia.
10. Wszystkie przyciski czyszczące wyłącznie filtry mają identyczny wspólny zestaw klas: `arkmail-filter-clear popup-btn popup-btn--control popup-btn--ghost`. Klasy specyficzne dla widoku mogą pozostać. Żaden taki przycisk nie ma `popup-btn--danger`.
11. Czerwony wariant pozostaje przy rzeczywistym kasowaniu lub czyszczeniu danych i treści: listów, grup, członków grup, osób, pól listu, zapisanych danych lokalnych, aliasów i całej książki.
12. Testy i zrzuty używają wyłącznie danych syntetycznych. Nie wprowadzamy prawdziwych nazw postaci, treści listów, tokenów ani surowych logów.
13. Nie zmieniamy ArkSzeptu ani jego kontroli.

## 3. Wspólne wzorce implementacji

### 3.1. Wiersz akcji

Dodać wspólny `.arkmail-action-row`:

- `display: flex`;
- `flex-wrap: wrap`;
- `align-items: center`;
- jednolity `gap` skalowany przez `--window-font-scale`;
- bezpośrednie przyciski: `flex: 0 1 auto`, `width: auto`, `max-width: 100%`;
- grupy logiczne mogą być dziećmi wiersza i zawijać się jako całości, a wewnętrzne zawijanie jest awaryjne tylko wtedy, gdy grupa sama nie mieści się w panelu.

Wiersz stosujemy zamiast dokładania samodzielnych przycisków bezpośrednio do kolumnowego panelu.

### 3.2. Pole z przyciskiem

Dodać wspólny `.arkmail-field-action` dla dodawania i filtrowania:

- elastyczne pole i przycisk naturalnej szerokości;
- zawijanie bez przepełnienia;
- reguła elastyczności dotyczy bezpośredniego dziecka rodzica, więc po `attachGhost()` jest przypisana do `.arkmail-ghost-wrap`, nie tylko do inputu;
- wrapper ma `min-width: 0`, a input nadal `width: 100%` i `box-sizing: border-box`;
- pole bez ghosta korzysta z tego samego układu;
- komunikat błędu, jeśli występuje, zajmuje osobną pełną linijkę i nie zmienia szerokości przycisku.

### 3.3. Grupy operacji listu

W `.arkmail-letter-ops` utworzyć trzy logiczne grupy:

1. odpowiedzi: `Odpowiedz`, `Odpowiedz wszystkim`, `Odpowiedz z cytowaniem`;
2. przekazanie i eksport: pole przekazania, `Przekaz`, `Zapisz list jako TXT`;
3. `Usun` jako ostatnia operacja.

Pole przekazania zachowuje elastyczny `.arkmail-ghost-wrap`. Wszystkie przyciski pozostają naturalnej szerokości, a grupy nie powodują poziomego przepełnienia.

### 3.4. Nagłówek listu

W szerokim widoku usunąć pozycjonowanie absolutne `Zamknij`. Temat i metadane umieścić we wspólnym bloku tekstowym, a przycisk obok niego w normalnym układzie:

- blok tekstowy: `flex: 1`, `min-width: 0`;
- długi temat może się łamać, bez nachodzenia na przycisk;
- `Zamknij`: naturalna szerokość, bez kurczenia etykiety;
- selektory i handler zamknięcia pozostają bez zmian.

### 3.5. Rekordy Archiwum i Osób

Dla `.arkmail-arch-entry` i `.arkmail-contact` zastosować responsywny układ zależny od istniejącej klasy `.arkmail-wide`:

- szeroki widok: treść i akcje w jednym wierszu, tekst ma `min-width: 0`;
- temat Archiwum i nazwa osoby w szerokim widoku: jednoliniowe skrócenie z wielokropkiem oraz pełna wartość w `title`;
- wąski widok: dwa wiersze, tekst może się łamać, akcje zawijają się poniżej;
- `Odebrane` i `Wyslane` tworzą jedną nierozdzielaną w zwykłych warunkach grupę kierunków, a `Do ksiazki` pozostaje osobną akcją;
- metadane nie wypychają treści ani akcji poza panel.

### 3.6. Karty i formularze

- Karty `.arkmail-archive-step` stają się kolumnowym flexem. Ich przyciski zachowują `width: 100%`, a `margin-top: auto` wyrównuje je do dołu.
- Ustawienia compose otrzymują `.arkmail-compose-settings`: jedna kolumna w wąskim oknie, dwie równe kolumny w szerokim. Każde pole zachowuje własną etykietę, identyfikator i opis błędu.
- Filtry Archiwum: trzy kolumny w szerokim oknie, jedna w wąskim; `Wyczysc filtry` zajmuje osobny wiersz przez `grid-column: 1 / -1`, ale ma `justify-self: start` i naturalną szerokość.

## 4. Macierz pełnego zakresu

### U-01 — Listy

Zmienić:

- usunąć pozostałe `flex: 1` z `Wczytaj wszystkie` w `.arkmail-box-ops`;
- zachować `margin-top: 0` i `width: auto`;
- objąć `.arkmail-search-clear` wspólnym neutralnym wariantem filtrów.

Bez zmian:

- naturalne przełączniki skrzynek;
- pełne `Szukaj / Odswiez`;
- pełne `Wczytaj starsze`;
- stały nagłówek i osobne przewijanie listy;
- `Wyczysc zapisane dane` pozostaje niebezpieczne.

Dowody: test DOM klas filtra, test CSS `flex-grow: 0`, istniejące testy paginacji i wyszukiwania, pomiar szerokości w Playwright w obu szerokościach okna.

### U-02 — Widok listu

Zmienić:

- pogrupować odpowiedzi, przekazanie z eksportem i końcowe usuwanie;
- zachować naturalną szerokość przycisków i elastyczne pole przekazania;
- przebudować nagłówek szerokiego widoku tak, aby długi temat nie nachodził na `Zamknij`.

Bez zmian:

- kolejność i treść odpowiedzi wewnątrz grupy;
- prefill odpowiedzi, cytowanie, przekazanie, eksport i potwierdzenie usunięcia;
- wąskie `Zamknij list` oraz podgląd treści.

Dowody: test struktury trzech grup i kolejności `Usun`, test CSS nagłówka oraz zawijania, pełne istniejące testy listu, Playwright z długim tematem i sprawdzeniem braku części wspólnej prostokątów tematu i przycisku.

### U-03 — Napisz list

Zmienić:

- umieścić `Zapisz w niewyslanych` i `Wyczysc pola listu` we wspólnym `.arkmail-action-row`;
- zachować `solid` dla zapisu i `danger + ghost` dla czyszczenia treści;
- umieścić `Szablon` i `Szerokosc linii` w siatce ustawień: obok siebie w szerokim oknie, jedno pod drugim w wąskim;
- zachować komunikat błędu szerokości przy właściwym polu.

Bez zmian:

- adresaci, temat, DW, treść, ghosty, walidacja i szkic;
- podgląd, `Pelne okno`, szablon i zapis ustawień;
- potwierdzenie czyszczenia pól.

Dowody: test DOM wspólnego rodzica i klas, test siatki szerokiej/wąskiej, istniejące testy compose, pomiar naturalnej szerokości i wspólnej linii ustawień w Playwright.

### U-04 — Aliasy pocztowe

Zmienić:

- nadać `.arkmail-book-alias` elastyczny, responsywny układ;
- wydzielić tekst aliasu i akcję `Napisz`;
- tekst może się łamać, a przycisk ma naturalną szerokość;
- wąski widok układa tekst i akcję dwuwierszowo;
- import aliasów ma osobny wiersz z wyraźnym odstępem.

Bez zmian:

- `Wyczysc aliasy` pozostaje na dole i zachowuje `danger + ghost` oraz potwierdzenie;
- źródło i odświeżanie aliasów oraz prefill `Napisz`.

Dowody: test struktury wiersza i przycisku, test CSS łamania i zawijania, Playwright z długim syntetycznym aliasem i wieloma celami.

### U-05 — Grupy

Zmienić:

- zastosować `.arkmail-field-action` do tworzenia grupy i filtrowania;
- nadać `.arkmail-group` wyraźną kartę/sekcję z odstępem i tokenami klienta;
- oddzielić rozwiniętą zawartość od nagłówka;
- `.arkmail-group-members` ma zawijać chipsy;
- dodawanie członka przenieść do osobnego `.arkmail-field-action` poniżej listy członków;
- rozdzielić wiersz edycji nazwy od `Usun grupe` i `Napisz do grupy`, zachowując logiczny odstęp;
- długa nazwa zwiniętej grupy nie może powodować przepełnienia;
- objąć `data-group-filter-clear` wspólnym neutralnym wariantem.

Bez zmian:

- domyślne zwijanie, rozwijanie, CRUD, guardy i komunikaty;
- `Usun wszystkie grupy` pozostaje naturalnej szerokości na dole i niebezpieczne.

Dowody: testy DOM nowych sekcji i zachowania selektorów, testy CSS kart, chipsów i pól, pełne testy grup, Playwright z rozwiniętą grupą, wieloma członkami i długą nazwą.

### U-06 — Książka adresowa

Zmienić:

- pogrupować cztery przyciski w dwa wiersze:
  1. `Zaznacz wszystkie`, `Odznacz wszystkie`;
  2. `Napisz list do zaznaczonych (0)`, `Usun zaznaczone imiona`;
- zachować naturalną szerokość przycisków;
- zastosować wspólny wzorzec pola z przyciskiem do dodawania osoby i filtra;
- objąć `data-book-filter-clear` wspólnym neutralnym wariantem.

Bez zmian:

- lista, zaznaczanie widocznych imion, licznik, pola i handlery;
- czerwone usuwanie pojedynczych i zaznaczonych imion;
- osobne przewijanie listy i zachowanie fokusu.

Dowody: test DOM kolejności i wspólnych rodziców, test CSS pól i akcji, istniejące testy książki, Playwright z zaznaczeniem i długimi syntetycznymi danymi.

### U-07 — Import i eksport

Zmienić:

- pierwszy `.arkmail-action-row`: `Dopisz wszystkie osoby z listow`, `Importuj zapamietanych`, `Importuj przedstawionych`;
- drugi `.arkmail-action-row`: `Eksportuj ksiazke`, `Importuj ksiazke`;
- zachować naturalną szerokość wszystkich pięciu przycisków;
- pozostawić ukryte pole pliku poza wierszem akcji i zachować tryby importu pod nim.

Bez zmian:

- `Eksportuj ksiazke` jako jedyny akcent sekcji;
- tryby `Dolacz` i `Zastap`, potwierdzenie zastąpienia oraz walidacja pliku;
- dolne `Wyczysc cala ksiazke i aliasy` pozostaje niebezpieczne.

Dowody: test DOM obu grup i kolejności, test klas akcentu, pełne testy importu/eksportu, pomiar przycisków w Playwright.

### U-08 — Archiwum listów

Zmienić:

- wyrównać pełne przyciski kart do dołu bez zmiany ich szerokości;
- zmienić uzbrojoną etykietę pobierania na `Potwierdz dlugie pobieranie`, zachowując pełne wyjaśnienie w `title` i dwuklik;
- zastosować responsywną siatkę filtrów;
- zachować osobny wiersz `.arkmail-arch-clear` (`Wyczysc filtry`), ale nadać mu naturalną szerokość i wspólny neutralny wariant;
- skracać temat z wielokropkiem w szerokim widoku i układać rekord dwuwierszowo w wąskim;
- dodać pełny temat do `title`.

Bez zmian:

- kolejność kroków, statusy, indeksacja, pobieranie, eksport ZIP i filtrowanie;
- klikanie rekordu i otwieranie listu;
- pełna szerokość przycisków kart.

Dowody: testy CSS kart i siatki, test etykiety oraz guarda, test DOM `title`, istniejące testy Archiwum, Playwright z różną długością statusów i bardzo długim tematem.

### U-09 — Osoby z listów

Zmienić:

- przenieść elastyczność filtra z `.arkmail-contact-filter` na bezpośredni `.arkmail-ghost-wrap`;
- zachować sortowanie i czyszczenie obok, z zawijaniem;
- objąć `data-arch-people-clear` wspólnym neutralnym wariantem;
- nadać wierszom osób responsywny układ;
- nazwa ma `min-width: 0` i wielokropek w szerokim widoku;
- `Odebrane` i `Wyslane` grupować razem, `Do ksiazki` pozostawić osobno;
- wszystkie przyciski akcji mają naturalną szerokość.

Bez zmian:

- sortowanie, filtr, skok do listów, kierunek i dodawanie do książki;
- własne przewijanie listy oraz zachowanie fokusu i karetki.

Dowody: test CSS wrappera ghost, test struktury grup akcji, pełne testy Osób, Playwright z długą nazwą, dużymi licznikami i obiema szerokościami.

### U-10 — Usuwanie listów

Zmienić wyłącznie:

- `.arkmail-deletion-clear-filters` otrzymuje wspólny neutralny wariant czyszczenia filtrów.

Bez zmian:

- obecny układ formularza i wyników;
- wyszukiwanie, zaznaczanie, paginacja, usuwanie i wszystkie potwierdzenia;
- `Usun zaznaczone` pozostaje niebezpieczne.

Dowody: test wspólnych klas i braku `danger` tylko dla czyszczenia filtrów, pełne istniejące testy usuwania, zrzut kontrolny w obu szerokościach.

### U-11 — Elementy wspólne i świadome wyjątki

Bez zmian:

- natywne `.dialog-tabs` z poziomym przewijaniem; częściowo widoczna zakładka nie jest trwale ucięta;
- przełączniki podsekcji;
- cztery stany przycisku zwierzęcia;
- status, pasek postępu i stopka;
- pełne przyciski kart Archiwum, `Wczytaj starsze`, `Szukaj / Odswiez`;
- pełny podgląd compose i jego `Pelne okno`.

Dowód: pełna istniejąca macierz jednostkowa i E2E, kontrola zakładek w wąskim oknie, brak nowych reguł zmieniających natywne przewijanie.

## 5. Testy i dowody niepowodzenia przed implementacją

### 5.1. Testy repozytorium pluginu

Zmodyfikować lub dodać przede wszystkim w:

- `tests/buttonTiers.test.ts`:
  - zastąpić starą decyzję o czerwonych filtrach;
  - sprawdzać wszystkie sześć wystąpień: Listy, Grupy, Książka, Osoby, Archiwum listów i Usuwanie;
  - wymagać wspólnej klasy oraz identycznych klas natywnych;
  - zakazać `danger` tylko dla filtrów;
  - zachować osobne asercje `danger` dla kasowania danych i treści.
- `tests/uiStyles.test.ts`:
  - naturalna szerokość `Wczytaj wszystkie`, w tym `flex-grow: 0`;
  - wspólne wiersze akcji i pól;
  - ghost jako bezpośrednie elastyczne dziecko;
  - nagłówek listu, grupy, aliasy, książka, import, Archiwum i Osoby;
  - osobny wiersz oraz naturalna szerokość czyszczenia Archiwum;
  - zachowanie pełnej szerokości zamkniętych wyjątków.
- nowy `tests/uiLayout.test.ts`:
  - struktura i kolejność DOM dla każdego nowego kontenera;
  - wszystkie ekrany i stabilne selektory;
  - zachowanie klas semantycznych oraz etykiet;
  - brak przypadkowej zmianu handlerów potwierdzony istniejącymi testami interakcji.

Każda partia ma osobny zapis lokalnego wyniku przed implementacją: nazwa testu, oczekiwana asercja i rzeczywista przyczyna niepowodzenia na starym kodzie. Po implementacji ten sam test musi przejść. Nie wystarczy sam test obecności reguły CSS, jeśli problem dotyczy struktury DOM.

### 5.2. Nowy test Playwright w repozytorium testów

Dodać `e2e-dargoth/arkmail/layout.spec.ts` z jednolitymi pomocnikami:

- pomiar `getBoundingClientRect()` i `getComputedStyle()`;
- brak poziomego przepełnienia panelu i kontrolek;
- brak nachodzenia odrębnych kontrolek i tematu na `Zamknij`;
- naturalna szerokość wskazanych przycisków;
- zachowana pełna szerokość trzech zamkniętych wyjątków;
- wspólna linia lub zamierzony drugi wiersz;
- wielokropek lub bezpieczne łamanie długiego tekstu;
- dolne wyrównanie przycisków kart;
- poprawne klasy i brak błędów konsoli oraz strony.

Zakres obejmuje wszystkie ekrany U-01–U-10, szerokie okno 1000 × 700 i wąskie 390 × 650, motywy `light-silver` oraz `dark-neutral`. Motyw ustawiamy przez istniejące `uiSettings.colorTheme` i przeładowanie, zgodnie z aktualnym testem motywów.

Dane są syntetyczne: długi temat, długa nazwa, wiele osób, grupa z członkami, alias z wieloma celami oraz rekordy Archiwum. Artefakty trafiają do `testInfo.outputPath()`, nie do stałych ścieżek i nie do repozytorium.

Najpierw uruchomić nowy test na ZIP-ie 1.30.3 i zachować wynik niepowodzeń dla konkretnych pomiarów. Następnie uruchomić go na nowo zbudowanym ZIP-ie. Test nie może zostać osłabiony po to, aby uzyskać zieleń; poprawiamy implementację albo błędny pomiar, jeśli zostanie wykazany kodem i rzeczywistą geometrią.

### 5.3. Kontrola wizualna

Dla każdego zmienionego ekranu zapisać zrzut w obu szerokościach i obu motywach. Sprawdzić dodatkowo:

- stany normalny, hover, focus-visible i disabled reprezentatywnych przycisków;
- uzbrojone potwierdzenie pobierania i jednego usuwania;
- rozwiniętą grupę;
- długi temat listu i rekordu Archiwum;
- puste i wypełnione widoki tam, gdzie układ zależy od danych.

Zrzuty są materiałem kontrolnym, nie zastępują asercji geometrycznych.

## 6. Kolejność wykonania i commity

1. Zapisać ten plan osobnym commitem dokumentacji i potwierdzić drzewo na GitHubie.
2. Przygotować środowisko: Node zgodny z `>=26`, czyste `npm ci`, tymczasowy indeks git w kopii tarballa dla testów higieny, Chromium i zależności testów. Nie raportować gotowości bez rzeczywistego uruchomienia wersji i bramek.
3. Przed zmianami kodu przygotować kompletny `layout.spec.ts`, uruchomić go na ZIP-ie 1.30.3 i zapisać konkretne niepowodzenia nowych pomiarów. Test pozostaje lokalnie w repozytorium testów do czasu przygotowania zielonego wydania.
4. Partia 1: wspólne klasy filtrów oraz Listy. Najpierw testy i lokalne niepowodzenie, potem implementacja. Commit: `Ujednolic czyszczenie filtrow i akcje list`.
5. Partia 2: widok listu i compose. Osobne lokalne dowody dla struktury i stylu, jedna spójna implementacja wzorców. Commit: `Uporzadkuj akcje listu i formularz pisania`.
6. Partia 3: Książka, Import i eksport oraz Aliasy. Commit: `Uporzadkuj akcje kontaktow i importu`.
7. Partia 4: Grupy. Commit: `Uporzadkuj karty i pola grup`.
8. Partia 5: Archiwum listów i Osoby. Commit: `Popraw responsywnosc archiwum i osob`.
9. Po każdej partii:
   - uruchomić `npm run typecheck`;
   - uruchomić komplet `npm test -- --test-timeout=120000`;
   - uruchomić `npm run build`;
   - sprawdzić brak danych wrażliwych, wulgaryzmów i przypadkowych plików;
   - commit przez Git Data API, bez wymuszenia;
   - odczytać SHA, komunikat, ścieżki drzewa i zielony Build plugins przed partią zależną.
10. Po partiach kodu ponownie uruchomić kompletny nowy test układu na nowym ZIP-ie, a potem pełną lokalną macierz ArkMaila. Dodać testy Playwright do repozytorium testów dopiero po przygotowaniu zielonego wydania, aby CI nie uruchomiło ich celowo przeciwko starej wersji.
11. Gdy wszystkie punkty U-01–U-11 są wykonane, usunąć ten plan, podnieść wersję do 1.30.4 i zbudować dokładnie jeden `arkmail_1_30_4.zip`. Commit: `Przygotuj ArkMail 1.30.4`.
12. Poczekać na zielone CI wydania, utworzyć tag i GitHub Release `ArkMail v1.30.4` z jednym assetem. Krótki opis zwykłym językiem, bez identyfikatorów technicznych.
13. Opublikować testy Playwright w `Isithunzi000/arkadia-dargoth-testy`, odczekać zieloną macierz na opublikowanym ZIP-ie i porównać liczbę testów z poprzednią macierzą powiększoną o nowy zakres.
14. Zweryfikować pobrany asset bajt po bajcie z lokalnym buildem, zamknąć raport z liczbami testów i stanem obu repozytoriów. Nie wykonywać żadnych kroków marketplace ani Vercel.

## 7. Idempotentność i bezpieczeństwo operacji

- Edycje są oparte na jednoznacznych kotwicach; każda kotwica musi występować dokładnie raz. Ponowne uruchomienie nie może dokładać duplikatów klas, kontenerów ani reguł.
- Przed każdą partią sprawdzamy aktualny zdalny HEAD i zgodność kopii. Nie nadpisujemy zmian, których nie ma w punkcie wyjścia.
- Nie wykonujemy równoległych edycji tego samego pliku. Po każdej partii odczytujemy zmienione fragmenty i sprawdzamy selektory.
- Po timeoutcie lub błędzie 404/504/5xx najpierw odczytujemy stan na żywo. Nie ponawiamy ślepo commita, release ani uploadu.
- Po commicie weryfikujemy rzeczywiste ścieżki drzewa, nie tylko SHA refu.
- Po uploadzie assetu nie usuwamy go z powodu samego błędu odczytu; najpierw niezależnie sprawdzamy release, tag i HEAD, a następnie ponawiamy wyłącznie pobranie weryfikacyjne.
- Każdy dłuższy przebieg zapisuje postęp i wynik w trwałym katalogu roboczym. Ponowienie pomija zakończone i sprawdzone kroki.

## 8. Warunki uznania prac za zakończone

Wszystkie warunki muszą być spełnione jednocześnie:

- U-01–U-11 mają implementację i przypisane testy;
- każdy test nowego zachowania ma udokumentowane lokalne niepowodzenie na starym kodzie i zieleń na nowym; testy chroniące świadome wyjątki mogą przechodzić również na starym kodzie;
- wszystkie czyszczenia filtrów mają identyczny wspólny wariant, a czyszczenie danych pozostaje czerwone;
- brak rozciąganych samodzielnych przycisków i brak zmiany zamkniętych pełnych wyjątków;
- brak nachodzenia i poziomego przepełnienia w obu szerokościach oraz obu motywach;
- pełne testy jednostkowe, `typecheck`, build i pełna macierz Playwright są zielone;
- nie ma błędów konsoli ani strony;
- oba repozytoria mają zielone CI na końcowych HEAD-ach;
- plan został usunięty po wykonaniu;
- `ArkMail v1.30.4` ma dokładnie jeden poprawny asset;
- marketplace i Vercel pozostały nietknięte.
