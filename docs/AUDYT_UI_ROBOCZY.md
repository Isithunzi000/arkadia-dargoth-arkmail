# ArkMail — roboczy audyt UI, danych i komunikatów

Dokument roboczy do czasu zakończenia poprawek. Po zakończeniu implementacji i weryfikacji należy go usunąć z repozytorium.

## 1. Zakres i podstawa

- Repozytorium: `Isithunzi000/arkadia-dargoth-arkmail`, gałąź `main`.
- Analizowany stan: `c171285d81ca5cfab1af9e55afafa1872803f92d`, ArkMail 1.30.2.
- Zakres: UI, przepływy, wprowadzanie danych, klawiatura, dostępność, trwałość, przypadki brzegowe, kolizje grup i aliasów, typy przycisków oraz wszystkie komunikaty widoczne dla użytkownika.
- Wykonano analizę statyczną kodu. Nie zmieniono kodu ani testów i nie uruchamiano nowego pełnego przebiegu testów.
- Obserwacje z testu na żywym kliencie są oznaczone jako **LIVE**. Stwierdzenia wynikające wprost z kodu są oznaczone jako **KOD**. Możliwe skutki wymagające odtworzenia są oznaczone jako **RYZYKO**.
- Uzupełniające dowody obejmują rzeczywistą próbę pełnego ponownego zalogowania dla T16, dwa zanonimizowane logi adresatów dla T22 oraz przegląd istniejącego harnessa Playwright w `Isithunzi000/arkadia-dargoth-testy`. Nie zawierają one nazw ani innych danych wrażliwych z przekazanych logów.
- Brak polskich diakrytyków w obecnych tekstach źródłowych jest konwencją projektu, nie błędem ortograficznym. Propozycje nowych komunikatów w tym dokumencie również zapisano bez diakrytyków, tak aby można je było przenieść do `src` bez dodatkowej konwersji.

## 2. Najważniejsze decyzje i wnioski

1. Użytkownicy aktualizujący z wersji co najwyżej 1.24.4 nie mają książki adresowej ani grup z nowego UI. Nie potrzeba migracji istniejących grup ani rozstrzygania ich historycznych kolizji z aliasami.
2. Nadal trzeba obsłużyć nową grupę utworzoną przed pierwszym importem aliasów. To przypadek bieżących danych, nie migracja starej wersji.
3. Wszystkie przyciski czyszczące filtry lub wyniki mają mieć czerwony wariant `popup-btn--danger popup-btn--ghost`, zgodnie z decyzją użytkownika. Sam kolor nie oznacza tu utraty danych: czyszczenie filtrów pozostaje jednostopniowe, a usuwanie danych — dwustopniowe.
4. „Wyslij zwierze” powinno trafić do natywnego `headerActions` okna, przed przyciski blokady, przypięcia i zamknięcia. Wyróżnienie: akcentowa obwódka i subtelne tło, bez dodatkowej ramki w środku zakładki Listy.
5. Czyszczenie wspólnych filtrów Archiwum i „Osób z listów” ma być dostępne z obu widoków i wykonywać dokładnie tę samą akcję.
6. Teksty trzeba dostosować do rzeczywistych operacji. Najważniejsze niezgodności: stare „kontakty”, sugestia kasowania aliasów przy czyszczeniu danych poczty, opis importu jako zastępowania zamiast dopisywania, błędna liczba mnoga przy eksporcie ZIP oraz przypisywanie każdego błędu wysyłki adresatowi.
7. Obserwacja LIVE o ogólnym toaście po czyszczeniu książki nie odpowiada obecnemu kodowi. W analizowanym HEAD komunikat brzmi: `Wyczyszczono cala ksiazke adresowa (imiona, grupy, aliasy).` Nie ustalono przyczyny rozjazdu; potrzebna jest dokładna treść komunikatu i wersja z testu.
8. **T7 — decyzja zatwierdzona:** duplikaty w `dolacz` i `zastap` są scalane deterministycznie po `trim()` i bez wielkości liter. Pierwsza pisownia i pierwsza kolejność są kanoniczne, kolejne duplikaty grup scalają członków, a powtórzenie importu jest no-op.
9. **T21 — decyzja zatwierdzona:** ręczny nowy członek grupy przechodzi tę samą walidację co osoba w Książce i jest jednocześnie dopisywany do Książki oraz grupy. Nie powstaje stan członka spoza Książki.
10. **T16 — podstawowy przypadek potwierdzony:** po przerwaniu połączenia i pełnym ponownym zalogowaniu zdalny pager/edytor nie był już aktywny. Nie dodawać `q` ani `~q`; zachować obecny lokalny cleanup i test zakazujący dodatkowego `q`. Wynik nie rozstrzyga każdej technicznej odmiany `proxy.session resumed`.
11. **T22 — podstawowa semantyka potwierdzona:** dla analogicznej pary różnych adresatów spacja i przecinek dały ten sam wynik w dwóch rzeczywistych logach. Poprawić lokalne rozbijanie i ghosty, ale nie przepisywać surowej wartości wysyłanej do edytora, nie deduplikować jej i nie zmieniać kolejności.

## 3. Wersja 1.24.4 i migracja

### Fakty

- Pobrane drzewo `v1.24.4` ma `src/arkmail/plugin.json` z wersją `1.24.4`.
- W tym drzewie nie ma `src/arkmail/core/addressBook.ts`, `ContactGroup`, `importedAliases`, identyfikatorów `grupy-kontaktow`, `aliasy-importowane`, `osoby-importowane` ani interfejsu obecnej książki adresowej.
- Opis wydania 1.25.0 dotyczy wyglądu okna. Wydanie 1.26.0 jest opisane jako wprowadzenie książki adresowej.
- Obecna `migratePeople()` w `core/addressBook.ts:126–167` przenosi wyłącznie starsze pule imion `zapamietani` i `przedstawieni`. Nie przenosi grup, bo w starych danych nie istniały.

### Wniosek

- **Nie dodawać migracji istniejących książek ani grup dla kolizji z aliasami.** Nie ma takiej populacji użytkowników w założonym zakresie aktualizacji.
- **Nie usuwać automatycznie `migratePeople()`** jako rzekomo zbędnej migracji grup. To osobna migracja starszych imion; jej ewentualne usunięcie wymagałoby oddzielnej decyzji i sprawdzenia danych 1.24.4.
- Reguły kolizji muszą działać dla grupy utworzonej teraz, zanim użytkownik pierwszy raz pobierze aliasy.

## 4. Dwanaście obserwacji z testu LIVE

### 4.1. Brak „Wyczysc filtr” w „Osoby z listow”

- **LIVE:** brak przycisku.
- **KOD:** `render.ts:2439–2615` tworzy tylko pole filtra i wybór sortowania. Przycisk istnieje natomiast w Archiwum listów (`render.ts:2701–2721`).
- **Rekomendacja:** dodać w tym samym pasku czerwony `Wyczysc filtry`. Ma być aktywny, gdy filtr osób jest niepusty, sortowanie nie jest `Nazwa A-Z` albo aktywny jest którykolwiek filtr Archiwum.
- **Wspólna akcja:** czyści `osoba`, `temat`, `tresc`, `odDaty`, `doDaty`, `skrzynka`, filtr osób i przywraca sortowanie `Nazwa A-Z`. Nie przełącza podzakładki.
- **Tekst tooltipa:** `Czysci filtry Archiwum i Osob z listow oraz przywraca sortowanie osob: Nazwa A-Z.`

### 4.2. Lista osób wygląda jak osobno przewijana część ekranu

- **LIVE:** układ wygląda na podzielony na przewijaną listę i pozostałą przestrzeń.
- **KOD:** `.arkmail-arch-people-list` w `styles.ts:452–455` ma `overflow-y: auto` i sztywne `max-height: calc(240px * var(--window-font-scale, 1))`. To kodowa przyczyna ograniczonego obszaru; dokładnego wyglądu „na pół” nie mierzono w przeglądarce.
- **Rekomendacja:** panel kolumnowy na pełną dostępną wysokość; kontrolki bez rozciągania; lista z `flex: 1`, `min-height: 0`, `overflow-y: auto`; usunąć sztywne 240 px. Jeden logiczny obszar przewijania, bez pustej przestrzeni pod krótką listą.

### 4.3. Niespójny kolor czyszczenia filtrów

- **LIVE:** w Usuwaniu listów przyciski są czerwone, w Książce adresowej nie.
- **KOD:** czerwone są m.in. w Usuwaniu (`699–715`), wynikach List (`1066–1075`), Archiwum (`2703–2721`) i formularzu listu (`1557–1576`). Zwykły wariant mają Grupy (`1652–1669`) i Książka (`2033–2049`).
- **Rekomendacja:** wszystkie czyszczenia filtrów i wyników: `popup-btn popup-btn--control popup-btn--danger popup-btn--ghost`, jeden klik, bez uzbrajania.

### 4.4. Import aliasów w niewłaściwej sekcji

- **LIVE:** „Importuj aliasy pocztowe” powinno być w „Aliasach pocztowych”, nie w „Import-Eksport”.
- **KOD:** `IMPORT_BTNS` w `render.ts:2294–2323` zawiera `aliasy`; handler wywołuje `onImportAliases`.
- **Rekomendacja:** przenieść przycisk i jego aktualny opis do „Aliasy pocztowe”. Kolejność: opis → import z gry → lista → dolna operacja czyszczenia lokalnego lustra. W „Import i eksport” zostają importy imion oraz import i eksport pliku książki.

### 4.5. „Usun wszystkie grupy” i „Wyczysc aliasy” w różnych wizualnych pozycjach

- **LIVE:** użytkownik preferuje operacje zbiorcze na dole.
- **KOD:** `Usun wszystkie grupy` jest po liście (`1848–1863`). `Wyczysc aliasy` również jest dodane po liście w DOM (`2241–2253`), ale przy pustej lub krótkiej liście pojawia się bezpośrednio pod górnym opisem. Samo „na końcu DOM” nie daje więc spójnego efektu wizualnego.
- **Rekomendacja:** wspólna dolna strefa operacji destrukcyjnych w obrębie sekcji, oddzielona od zwykłych akcji. Nie dodawać drugiego przewijania tylko po to, aby przycisk był „przyklejony”.

### 4.6. „Wyczysc cala ksiazke” u góry swojej sekcji

- **LIVE:** powinno być spójnie na dole.
- **KOD:** przycisk jest po drugim `hr` (`2410–2424`), ale cała sekcja jest jednym przewijanym panelem; przy krótkiej zawartości operacja jest wizualnie blisko góry.
- **Rekomendacja:** układ jak w Grupach i Aliasach: zwykłe operacje w treści, jedna dolna strefa destrukcyjna. Etykieta powinna jasno obejmować również aliasy, np. `Wyczysc cala ksiazke i aliasy`.

### 4.7. Czyszczenie wyników w Listach

- **LIVE:** powinno być czerwone jak pozostałe.
- **KOD:** obecny przycisk ma już `popup-btn--danger popup-btn--ghost` (`1066–1075`). Nie ma podstaw do zmiany koloru w tym HEAD.
- **Rekomendacja:** zachować kolor; zmienić ogólne `Wyczysc` na jednoznaczne `Wyczysc wyniki i filtry`, ponieważ akcja usuwa zarówno wyniki, jak i wszystkie pola szukania. Jeśli w teście nie był czerwony, trzeba sprawdzić wersję i motyw zamiast zakładać przyczynę.

### 4.8. Jednolita semantyka wszystkich przycisków

- **Decyzja użytkownika:** czerwony jest cały typ czyszczenia, również filtrów.
- **Rekomendacja:** zastosować macierz z rozdziału 5. Kolor i liczba klików opisują różne rzeczy: czerwony = czyszczenie/usuwanie; drugi klik = potwierdzenie utraty danych lub długiej operacji, ale długa operacja nie może wyglądać jak usuwanie.

### 4.9. Słabo wyróżnione „Wyslij zwierze”

- **KOD:** zwykły przycisk w `.arkmail-box-ops` (`886–897`), bez `popup-btn--solid`. Rejestracja okna w `index.ts:277–286` nie używa `headerActions`.
- **Rekomendacja:** natywny nagłówek okna, szczegóły w rozdziale 6. Operacja jest globalna, więc dostępność we wszystkich zakładkach jest zgodna z jej charakterem.

### 4.10. Nieaktualny tooltip „Wyczysc zapisane dane”

- **KOD:** obecny tekst (`921–934`) mówi o „kontaktach” i kończy się `Aliasy pobierzesz z gry ponownie.` Tymczasem `onClearCache` i `clearCacheData()` kasują listy, archiwum, osoby z listów i indeksy, ale zachowują książkę, grupy oraz zaimportowane aliasy.
- **Proponowany tekst:** `Kasuje lokalnie zapisane listy, archiwum, osoby z listow i indeksy. Na serwerze Arkadii nic nie znika. Ustawienia, ksiazka adresowa, grupy i zaimportowane aliasy zostaja.`
- **Toast po operacji:** `Wyczyszczono zapisane listy, archiwum, osoby z listow i indeksy. Ksiazka adresowa, grupy i aliasy zostaly zachowane.`

### 4.11. Wspólne czyszczenie Archiwum i „Osób z listów”

- **LIVE:** obecne wspólne czyszczenie jest sensowne; nowy przycisk może robić to samo.
- **KOD:** przycisk Archiwum czyści oba widoki i dodatkowo resetuje sortowanie (`2701–2721`).
- **Rekomendacja:** jedna wspólna funkcja akcji, dwa miejsca wywołania. Tooltip w obu miejscach musi ujawniać pełny zakres, także reset sortowania. Żadnych dwóch różnych definicji „czyszczenia filtrów” pod tą samą etykietą.

### 4.12. Toast po skasowaniu książki adresowej

- **LIVE:** komunikat był odbierany jako mylący i niewspominający książki.
- **KOD:** `index.ts:2089–2098` wysyła `Wyczyszczono cala ksiazke adresowa (imiona, grupy, aliasy).` i używa zwykłego adaptera powiadomień. Nie znaleziono w tej ścieżce podmiany na komunikat ogólny.
- **Status:** nierozstrzygnięty rozjazd między obserwacją a HEAD. Nie wolno przypisywać go innej wersji, innemu przyciskowi ani nadpisaniu toastu bez dowodu.
- **Do późniejszej weryfikacji LIVE:** dokładna treść komunikatu, wersja w stopce, który przycisk kliknięto i czy komunikat nie został zastąpiony kolejnym zdarzeniem. Kod nie wymaga poprawki tego konkretnego zdania, jeśli test potwierdzi obecny tekst.

## 5. Jedna macierz przycisków

### 5.1. Docelowe typy

| Typ operacji | Wygląd i klasy | Potwierdzenie | Przykłady |
|---|---|---|---|
| Nawigacja główna | `dialog-tab`, aktywna `is-active` | brak | Listy, Napisz list, Kontakty |
| Nawigacja lokalna | natywny wzorzec segmentów lub spójne przyciski skrzynek | brak | skrzynki, podzakładki |
| Zwykła akcja | `popup-btn popup-btn--control` | brak | Dodaj, Zapisz nazwe, Napisz |
| Główna akcja sekcji | jak wyżej + `popup-btn--solid` | brak | Szukaj / Odswiez, Zapisz w niewyslanych, Eksportuj |
| Czyszczenie filtrów lub wyników | jak wyżej + `popup-btn--danger popup-btn--ghost` | brak, jeden klik | Wyczysc filtry, Wyczysc wyniki i filtry |
| Usuwanie lub kasowanie danych | danger ghost | dwa kroki, krótki czas na drugi klik, ESC anuluje | Usun grupe, Wyczysc zapisane dane |
| Drugi krok usuwania | pełne czerwone wypełnienie, jednoznaczna etykieta | wykonanie dopiero po drugim kliku | Na pewno usunac? |
| Długa operacja nieusuwająca | zwykła kontrolka; osobny neutralny stan potwierdzenia | dwa kroki, ale bez czerwonego stylu usuwania | Pobierz tresci do archiwum |
| Przerwanie operacji | zwykła kontrolka stanu, nie danger | brak | Przerwij, Przerwij indeksowanie |
| Mała akcja ikonowa | dodatkowo `popup-btn--sm popup-btn--icon` | danger tylko dla usuwania | Usuniecie czlonka grupy |
| Akcja globalna okna | `popup-header-btn`, ewentualnie własna klasa dodatkowa | zależne od skutku | Wyslij zwierze |

### 5.2. Konsekwencje dla obecnego kodu

- Grupy i Książka: dodać danger ghost do czyszczenia filtrów.
- Osoby z listów: nowy przycisk od razu w tym samym wariancie.
- Listy: obecny czerwony przycisk wyników zachować; doprecyzować etykietę.
- Formularz listu: `Wyczysc` usuwa niedokończoną treść, więc pozostaje danger i dwustopniowy; etykieta powinna być konkretna, np. `Wyczysc pola listu`.
- `Zaznacz wszystkie` i `Odznacz wszystkie` są zwykłymi kontrolkami zaznaczenia. Nie klasyfikować ich jako usuwania danych.
- `Odebrane`, `Wyslane` i `Do ksiazki` w „Osobach z listow” (`2560–2589`) mają wyłącznie własne klasy. Powinny dostać natywną bazę przycisku, a klasy `arkmail-*` pozostać dodatkami, nie zamiennikami.
- Nie nadpisywać klas natywnych pól: `nativeFieldClass(box); box.className = ...` w Usuwaniu (`634–636`) oraz `sTresc.className = ...` (`977–982`) usuwają wcześniej dodane `popup-input popup-input--control`.

### 5.3. Potwierdzenie długiej operacji nie może udawać usuwania

`Pobierz tresci do archiwum` używa obecnie `guardDeleteButton()` (`2845–2859`). Po pierwszym kliku dostaje wspólny znacznik `data-armed="1"`, którego styl jest czerwony, mimo że operacja niczego nie kasuje.

**Rekomendacja:** oddzielić mechanikę potwierdzenia od nazwy i stylu usuwania. Wspólny mechanizm może obsługiwać dwa warianty: destrukcyjny oraz neutralny, ale muszą mieć różne znaczniki, kolory i domyślne teksty. Długa operacja: `Kliknij ponownie, aby rozpoczac pobieranie.` Bez czerwonego wypełnienia. „Przerwij” pozostaje zwykłą kontrolką.

### 5.4. Operacja „Zastap cala ksiazke” wymaga potwierdzenia skutku

- **KOD:** wybór pliku w trybie `zastap` prowadzi bezpośrednio do `onImportAddressBook` (`2373–2395`). Sam przycisk importu jest neutralny i nie ma drugiego etapu.
- **RYZYKO:** użytkownik może zastąpić całą książkę po wybraniu pliku, mimo że osobne czyszczenie książki jest dwustopniowe.
- **Rekomendacja:** po poprawnym odczycie pliku pokazać jednoznaczne potwierdzenie z liczbą imion i grup oraz informacją, że obecne imiona i grupy zostaną zastąpione, a aliasy zachowane. Nie uzbrajać przycisku przed wyborem pliku, bo użytkownik nie zna jeszcze skutku konkretnego importu.

## 6. „Wyslij zwierze” w nagłówku okna

### 6.1. Wzorce Dargotha

- Typ `registerPersistentPopup` w `types/plugin-api.d.ts:2024–2029` przewiduje `headerActions?: Node | React.ReactNode`. Kontrolki pojawiają się przed wbudowanymi przyciskami blokady, przypięcia i zamknięcia.
- Dokumentacja Dargotha wskazuje `popup-header-btn`, wspólną wysokość z przyciskami okna oraz `popup-header-btn--danger` dla akcji niebezpiecznych.
- Natywna `PocztaPopup.tsx` umieszcza w `headerActions` segment skrzynek i odświeżanie. Jest to więc udowodniony wzorzec dla często używanych, globalnych kontrolek poczty.
- `AliasEditor.tsx` rozróżnia zwykłe przyciski, przyciski usuwania, małe ikony i natywne pola. „Wyslij zwierze” nie jest operacją danger i nie powinno używać czerwieni.

### 6.2. Uzgodniony wariant i cztery stany

- Przenieść akcję z paska List do `headerActions`.
- Bazowa klasa: `popup-header-btn`; dodatkowa klasa ArkMaila dla akcentu.
- Wygląd zwykły: akcentowa obwódka, `var(--popup-accent-subtle-bg)` jako tło, tekst w `var(--popup-accent)` lub najbardziej czytelnym kontraście motywu.
- Lot: przycisk nieaktywny, spokojny status bez czerwieni; nie uruchamia kolejnej wysyłki.
- Nagłówek pozostaje natywny. Nie dodawać ozdobnej ramki wewnątrz List ani absolutnie pozycjonowanego przycisku na środku obramowania — kolidowałby z tytułem, zmianą szerokości i dokowaniem.

| Szerokość okna | Stan | Widoczny tekst | Aktywność |
|---|---|---|---|
| szerokie | spoczynek | `Wyslij zwierze` | aktywny |
| szerokie | lot | `Zwierze w drodze...` | nieaktywny |
| wąskie | spoczynek | `Zwierze` z ikoną | aktywny |
| wąskie | lot | `W drodze...` z ikoną | nieaktywny |

Dostępność i podpowiedzi:

- wąski spoczynek: pełne `Wyslij zwierze` w tooltipie i etykiecie dostępności;
- szeroki i wąski lot: tooltip oraz etykieta dostępności `Zwierze w drodze...`;
- stan nieaktywny ma być przekazany semantycznie, nie tylko kolorem lub tekstem;
- nie stosować samej niejednoznacznej ikony jako jedynego opisu;
- responsywny skrót nie może przywrócić tekstu `Zwierze`, gdy zwierzę nadal jest w drodze.

Żadna zmiana stanu lotu ani szerokości okna nie może przesuwać pozostałych kontrolek nagłówka, zmieniać ich kolejności ani powodować utraty informacji o trwającym locie. Po zakończeniu lotu przycisk wraca do właściwego stanu spoczynku.

### 6.3. Wymagania cyklu życia przy przyszłej implementacji

`headerActions` jest poza pełnym odmalowaniem treści z `render.ts`. Sam repaint nie zaktualizuje takiego przycisku. Przyszła zmiana musi więc zapewnić:

1. jedno źródło stanu `animalFlying` dla treści i nagłówka;
2. aktualizację tekstu, `disabled`, tooltipa i etykiety dostępności przy każdej zmianie stanu;
3. odsubskrybowanie przy dezaktywacji postaci i zniszczeniu pluginu;
4. brak duplikatów kontrolki przy ponownym otwarciu lub ponownej aktywacji;
5. zachowanie stanu przy zmianie zakładki i szerokości;
6. poprawne zachowanie dla ręcznego wysłania zwierzęcia z gry, powrotu, błędu „Slucham?” i limitu czasu;
7. obsługę braku połączenia zanim zacznie się wizualny lot — obecny błąd opisano w części technicznej.

Makieta `design/wyslij-zwierze/wyslij-zwierze.kanva.pptd` pokazuje trzy stany: zwykły, lot i wąskie okno. Zbiorczy render znajduje się w `design/wyslij-zwierze/podglad-wyslij-zwierze.png`. Obecna makieta jest zaakceptowana wizualnie i nie wymaga przebudowy. Czwarta kombinacja — wąskie okno i lot — jest wiążącym wymaganiem z macierzy powyżej, nawet bez osobnej strony makiety. Jest to projekt wizualny, nie implementacja ani dowód działania w kliencie.

## 7. Kolizje aliasów pocztowych i grup

### 7.1. Źródła, status i rozdzielenie odpowiedzialności

Trzy przekazane dokumenty `Rekomendowane rozwiązanie` są bajtowo identyczne. Stanowią jedno, wcześniejsze źródło analizy. Ich zalecenia dotyczące migracji historycznych konfliktów zostały zastąpione decyzją z rozdziału 3; pozostałe reguły uwzględniono poniżej.

- Alias jest lokalnym lustrem definicji serwera. Rozwija go serwer; plugin nie powinien rozwijać go samodzielnie ani zapisywać go jako grupy.
- Grupa jest lokalną strukturą pluginu. Przy akceptacji podpowiedzi plugin wstawia jej członków.
- Alias i grupa o tej samej nazwie mogą mieć zupełnie innych adresatów. Nie wiadomo, czy grupa jest kopią aliasu, inną listą czy przypadkową kolizją.
- Serwer może zmienić lub usunąć alias niezależnie od pluginu. Lustro może być nieaktualne do następnego udanego, kompletnego importu; nie wolno przedstawiać lokalnego stanu jako dowodu aktualnego stanu serwera.
- Nie wolno automatycznie scalać tych obiektów, kasować któregoś, odrzucać importowanego aliasu ani zmieniać nazwy bez decyzji użytkownika.

### 7.2. Normalizacja i zapobieganie nowym kolizjom

- Nowa lub zmieniana nazwa grupy nie może kolidować z aktualnym lustrem aliasów ani z inną grupą.
- Porównanie odbywa się po `trim()` i bez wielkości liter. Przykładowo `gildia`, `Gildia`, `GILDIA` i ` gildia ` są traktowane jako ta sama nazwa przy sprawdzaniu kolizji.
- Zmiana `gildia` na `Gildia` nie rozwiązuje konfliktu.
- Bez potwierdzenia semantyki serwera nie stosować usuwania różnic diakrytycznych, podobieństwa przybliżonego ani automatycznego scalania aliasów różniących się wielkością liter.
- Zakaz obejmuje także grupy puste; konflikt nie może ujawniać się dopiero po dodaniu pierwszego członka.
- Walidacja musi obowiązywać przy tworzeniu i zmianie nazwy w UI, zapisie grup, imporcie książki, scalaniu danych i późniejszej synchronizacji aliasów. Samo pole formularza nie wystarczy.
- Komunikat: `Nazwa grupy "${name}" koliduje z aliasem pocztowym z gry. Wybierz inna nazwe.`
- Utworzenie grupy przed pierwszym odczytem aliasów pozostaje dozwolone. Nie blokować podstawowej funkcji offline ani po nieudanym imporcie; późniejszy udany import rozstrzyga nowo wykrytą kolizję nieniszcząco.

### 7.3. Późny import aliasu kolidującego z istniejącą grupą

Docelowy przypadek brzegowy: użytkownik tworzy grupę `gildia`, nie ma jeszcze zaimportowanych aliasów, a późniejszy import przynosi alias `gildia`. Przed importem plugin zna grupę, ale nie może uczciwie twierdzić, że na serwerze nie ma kolidującego aliasu.

Rekomendowany, nieniszczący model:

1. Alias zostaje zaimportowany i zapisany jako lustro serwera.
2. Grupa zostaje zachowana bez zmiany nazwy i członków.
3. Rozwijanie grupy w podpowiedziach zostaje czasowo wyłączone tylko dla tej kolizji.
4. Dokładna nazwa `gildia` jest przekazywana jako alias serwera, a nie rozwijana lokalnie.
5. UI Grupy pokazuje trwałe ostrzeżenie przy grupie, np. `Nazwa koliduje z aliasem pocztowym. Grupa nie jest rozwijana w podpowiedziach. Zmien nazwe albo usun grupe.` Jednorazowy toast nie wystarczy.
6. Użytkownik rozstrzyga konflikt przez zmianę nazwy albo świadome usunięcie grupy.
7. Zmiana nazwy na wolną przywraca grupę do podpowiedzi bez zmiany członków; alias działa niezależnie.
8. Usunięcie aliasu na serwerze i następny udany, kompletny import ponownie udostępnia grupę automatycznie. Samo lokalne czyszczenie lustra albo błąd importu nie mogą udawać usunięcia konfliktu na serwerze.

### 7.4. Import aliasów: kompletność, błędy i powtarzalność

- Dopiero udany, kompletny wynik zastępuje poprzednie lustro. Następnie konflikty wszystkich grup są wyliczane ponownie: nowe, znikające, po zmianie wielkości liter i po zmianie nazwy aliasu.
- Błędny lub niekompletny import pozostawia bez zmian poprzednie lustro, zestaw konfliktów i dostępność grup. Pusty wynik błędnego importu nie jest dowodem braku aliasów na serwerze; użytkownik musi dostać błąd importu.
- Powtórzenie identycznego importu nie może tworzyć kopii grup ani aliasów, zmieniać członków, wykonywać dodatkowych działań naprawczych ani bez końca powtarzać tych samych powiadomień. Trwała informacja przy grupie pozostaje do rozstrzygnięcia konfliktu; nowe powiadomienie dotyczy przede wszystkim nowo wykrytego konfliktu.
- Jeden import może wykryć wiele konfliktów. Wszystkie kolidujące grupy są oznaczane; nie wolno losowo zostawiać jednej aktywnej.
- Różna kolejność zapisu grupy i aktualizacji aliasów musi prowadzić do tego samego ostatecznego wyniku.

### 7.5. Import i eksport pliku książki

- Plik książki nie zawiera aliasów serwera, ale może wnieść grupę kolidującą z aktualnym lustrem. Dotyczy to trybów `dolacz` i `zastap`.
- Grupa z pliku zostaje zachowana, konflikt jest wykrywany i pokazywany, a rozwijanie pod kolidującą nazwą jest wyłączone. Podsumowanie importu wymienia wszystkie konflikty; ciche pomijanie grup jest niedopuszczalne.
- Tryb `zastap` nie może omijać zasad unikalności grup w samym pliku.
- Eksport zawiera wszystkie grupy, również aktualnie kolidujące. Aliasy serwera pozostają poza plikiem książki.
- Konflikt nie jest trwałą cechą grupy zapisywaną w eksporcie. Po ponownym imporcie jest wyliczany z aktualnych aliasów, dzięki czemu plik przeniesiony do innego środowiska nie przenosi nieaktualnych informacji o konfliktach.

### 7.6. Priorytet i dokładne dopasowanie podpowiedzi

Obecnie `adresatSource` w `render.ts:480–485` daje osoby i aliasy przed grupami, a `attachGhost` w `ghost.ts:82–98` wybiera pierwszy kandydat spełniający prefiks. Powoduje to dwa problemy:

- identyczna nazwa aliasu i grupy wygrywa na korzyść pierwszego źródła bez jawnej reguły konfliktu;
- grupa `gildia` może zostać zasłonięta przez wcześniejszy alias `gildia-rada`, mimo że użytkownik wpisał już dokładną nazwę grupy.

Docelowa kolejność:

1. Najpierw dokładne dopasowanie całego bieżącego segmentu po `trim()` i bez wielkości liter.
2. Przy dokładnej nazwie aliasu — alias serwera.
3. Przy dokładnej nazwie niekolidującej grupy — rozwinięcie grupy.
4. Dopiero potem kandydaci pasujący do prefiksu, w stabilnej i jednoznacznej kolejności.
5. Dla kolizji alias/grupa nie pokazywać dwóch identycznych podpowiedzi. Pokazać alias, a konflikt wyjaśnić w Grupach; samo dopisanie etykiety do dwóch kandydatów nie rozwiązuje wyboru pierwszego.
6. Puste grupy nadal nie są kandydatami, bo nie mają członków do wstawienia.

Po zaakceptowaniu aliasu w polu może zostać sama nazwa. Po zaakceptowaniu grupy — członkowie w kanonicznym formacie przecinkowym. Bieżący segment jest wyznaczany po ostatnim przecinku albo spacji, a akceptacja zmienia wyłącznie ten segment. Pusty segment nie pokazuje podpowiedzi. Testy muszą obejmować wielkość liter, oba separatory, dokładną nazwę, dłuższy prefiks i zachowanie pozostałych segmentów.

Wykrycie kolizji nie może automatycznie przepisywać tekstu już wpisanego w polu adresatów ani zapisanych szkiców. Po późnym imporcie nie da się wiarygodnie ustalić, czy wcześniejsze `gildia` oznaczało intencję użycia grupy czy aliasu; dane nie mogą zmieniać się w tle.

### 7.7. Odrzucone rozwiązania

| Rozwiązanie | Powód odrzucenia |
|---|---|
| automatyczne usunięcie grupy | utrata danych lokalnych |
| automatyczne scalenie grupy z aliasem | nieznana zgodność list adresatów |
| automatyczna zmiana nazwy | zmiana danych bez zgody i możliwość nowej kolizji; nową nazwę można co najwyżej zaproponować w formularzu |
| pominięcie aliasu podczas importu | lustro przestaje odpowiadać stanowi gry, a prawidłowy adresat serwerowy znika z podpowiedzi |
| pozostawienie dwóch identycznych podpowiedzi | niejednoznaczność przy wyborze pierwszego kandydata |
| preferowanie grupy przed aliasem | zmiana znaczenia prawidłowej nazwy serwerowej |
| zachowanie grupy, oznaczenie konfliktu i wyłączenie jej rozwinięcia | rozwiązanie rekomendowane: bez utraty danych i z jednoznacznym adresem serwerowym |

### 7.8. Migracja historyczna i zatwierdzona relacja grupy z Książką

Nie dodawać migracji historycznych książek, grup ani zapisanej flagi konfliktu dla użytkowników aktualizujących z wersji co najwyżej 1.24.4 — wersje te nie mają książki adresowej ani grup. Ponowne wyliczanie konfliktu z bieżącego lustra i bieżących grup jest zwykłą logiką nowej wersji, a nie osobną migracją danych historycznych. Nie usuwać przy tym istniejącego `migratePeople()`, który dotyczy innych danych.

Ręczne dodanie członka grupy obecnie sprawdza tylko niepustość i duplikat (`1802–1823`). Nie stosuje walidacji imienia z Książki ani nie dopisuje osoby do Książki, mimo że komentarz opisuje grupę jako zbudowaną z bazy osób.

**Decyzja zatwierdzona:** ręczne dodanie członka używa tej samej walidacji imienia co Książka. Poprawne, nieznane dotąd imię jest jednocześnie dopisywane do Książki i grupy w jednej aktualizacji modelu. Błędne imię nie zmienia żadnych danych, duplikat bez wielkości liter jest no-op, a członek grupy nigdy nie istnieje jako dowolny tekst spoza Książki.

## 8. Zagregowane ustalenia techniczne

Poniższa lista łączy wcześniejszy audyt z ustaleniami potwierdzonymi ponownie na analizowanym HEAD. „Ryzyko” oznacza uzasadnioną ścieżkę w kodzie, a nie twierdzenie, że błąd został już odtworzony na serwerze.

Wszystkie 17 głównych pozycji pierwotnego raportu ma odpowiednik w zbiorczej liście:

| Pierwotna pozycja | Odpowiednik | Pierwotna pozycja | Odpowiednik |
|---|---|---|---|
| 1. nieudany zapis listu | T1 | 10. anulowanie dialogu serwera | T16 |
| 2. nieznana wersja importu | T2 | 11. sierocy pager | T17 |
| 3. selektor fokusu | T3 | 12. Enter | T12 |
| 4. ciche odświeżenie | T4 | 13. kolizja i prefiks podpowiedzi | T11 i T20 |
| 5. kontakty po wyszukaniu | T5 | 14. dostępność | T13 |
| 6. natywne klasy pól | T6 | 15. rejestracja anulowania importu | T10 |
| 7. duplikaty w trybie `zastap` | T7 | 16. równoległe importy pliku | T14 |
| 8. pozorny lot offline | T8 | 17. pobieranie i unieważnienie URL | T19 |
| 9. stan GMCP po reconnect | T9 | — | — |

Pozycje T15, T18 i T21–T25 pochodzą z późniejszej, szerszej analizy. Pełna macierz kontrolek, wynik testów, mocne elementy i granice dowodu z pierwotnego raportu znajdują się odpowiednio w rozdziałach 12–15.

### T1. Zapis może zostać porzucony po błędzie zapisu listów

- **KOD, wysokie, błąd pewny:** `flushPendingLetters()` w `writeThroughStorage.ts:141–156` pobiera oczekujące rekordy i czyści `pendingLetters` przed `putLetters`; obsługa błędu jest w `159–165`.
- Po odrzuceniu `driver.putLetters()` rekord pozostaje zmieniony w RAM, ale znika z kolejki. `errorReported` ogranicza komunikat do jednego, a kolejne `setLetters()` z niezmienionym rekordem nie dodaje go ponownie do kolejki przez warunek w `76–82`.
- **Skutek:** interfejs nadal wygląda jak po zapisie, ale po ponownym otwarciu klienta mogą wrócić starsze wartości albo rekord może zniknąć.
- **Luka testowa:** `tests/writeThroughStorage.test.ts:121–143` sprawdza błąd zwykłego `put()`, ale nie analogiczny błąd `putLetters()` i ponowienie zapisu.
- **Kierunek:** oczekujący zapis usuwamy dopiero po sukcesie; błąd musi zachować możliwość ponowienia i być widoczny zgodnie z polityką magazynu.

### T2. Import akceptuje nieznaną wersję jako v2

- **KOD, wysokie przy trybie zastępowania, błąd pewny:** `parseAddressBookExport()` w `addressBook.ts:292–320` sprawdza, czy `version` jest liczbą, i rozgałęzia tylko wersję 1. Każda inna liczba — także 0, 3, 99 albo 2.5 — trafia do czytania pól v2.
- **Skutek:** przyszły lub niezgodny plik bez `people` i `groups` może zostać zinterpretowany jako pusta książka, a tryb `zastap` w `index.ts:2060–2073` może nią nadpisać bieżące dane.
- Dokument `{format: "arkmail-addressbook", version: 2}` bez wymaganych pól również jest akceptowany jako pusta książka. `tests/addressBook.test.ts:286–295` celowo utrwala to zachowanie, więc jest to niebezpieczna decyzja projektowa, nie przypadkowa regresja; w połączeniu z zastępowaniem nadal tworzy ścieżkę utraty danych.
- **Kierunek:** akceptować wyłącznie jawnie obsługiwane wersje i wymagany kształt pól; odrzucać nieznane wersje przed jakąkolwiek mutacją.

### T3. Nazwa grupy może przerwać selektor przywracania fokusu

- **KOD, błąd pewny warunkowo, ryzyko awarii repaintu:** `focusKeyOf()` w `render.ts:380–395` wstawia wartość atrybutu bez escapowania do selektora, a `restoreView()` używa `querySelector()` (`431–448`).
- Dotyczy to między innymi `data-book-check`, którego wartością jest nazwa grupy. Ręczne tworzenie grupy w `render.ts:1615–1637` sprawdza niepustość i unikalność, ale dopuszcza na przykład `grupa"test`.
- Po zaznaczeniu takiej grupy i repaincie wywołanym na przykład przez GMCP, odświeżenie albo zmianę stanu selektor może zgłosić `DOMException`. Nowe drzewo jest już zamontowane, lecz końcowa część renderu nie wykonuje się poprawnie.
- **Luka testowa:** testy fokusu obejmują zwykłe imiona, a nie znaki specjalne.
- **Kierunek:** nie budować selektora z surowej nazwy. Użyć bezpiecznego identyfikatora albo wyszukiwania bez interpolacji; nazwy grup nie powinny być kluczami CSS.

### T4. Błąd ręcznego odświeżenia jest połykany

- **KOD, błąd pewny:** `refreshBoxes()` w `index.ts:609–620` ma `.catch(() => {})`; wejście z przycisku jest w `2239–2244`. Podobny pusty catch istnieje w automatycznym drenażu (`766–780`).
- **Skutek:** po błędzie listingu pasek zajętości znika, ale użytkownik nie wie, czy dane są aktualne, czy pobieranie się nie powiodło. `finally` kończy stan zajętości i zapisuje archiwum tak jak po zakończonej ścieżce.
- Ten sam mechanizm obsługuje odświeżenia wewnętrzne, dlatego brakuje rozróżnienia operacji ręcznej i automatycznej.
- **Kierunek:** rozróżnić anulowanie od błędu i pokazać właściwy komunikat przy operacji ręcznej; nie zmieniać automatycznych odświeżeń w agresywne powtarzanie.

### T5. Wyszukiwanie nie przebudowuje osób z listów

- **KOD, błąd pewny:** wyniki wyszukiwania są dopisywane do archiwum w `index.ts:2276–2282`, ale `onSearch` (`2254–2299`) nie wywołuje `rebuildContacts()`. Zwykłe odświeżenie robi to w `615–619`.
- **Skutek:** osoba znaleziona po raz pierwszy przez wyszukiwarkę może pojawić się w Kontaktach dopiero po późniejszym odświeżeniu albo innej operacji.
- Dotyczy to również przycisku dopisania wszystkich kontaktów do książki, ponieważ korzysta z aktualnego `ui.state.contacts`, które może jeszcze nie zawierać nowej osoby.
- **Luka testowa:** nie znaleziono testu integracyjnego „wyszukanie nowej osoby → kontakty”.
- **Kierunek:** jedna wspólna finalizacja zmiany archiwum albo jawne przebudowanie również po wyszukiwaniu.

### T6. Utrata natywnych klas pól

- **KOD, błąd pewny strukturalnie; skutek wizualny zależy od motywu:** select Usuwania (`render.ts:634–636`) i pole `Tresc` (`977–982`) najpierw dostają przez `nativeFieldClass()` klasy `popup-input popup-input--control`, po czym przypisanie `className` usuwa obie klasy.
- **Skutek:** pozostają wyłącznie klasy ArkMaila. Pola mogą różnić się kolorem, obramowaniem, fokusem, wysokością i zachowaniem w jasnym lub ciemnym motywie.
- **Luka testowa:** `tests/nativeUi.test.ts:84–113` sprawdza compose i Archiwum, ale nie te dwa pola. Testy `dateFilters` i `deletionRender` sprawdzają jedynie obecność klas ArkMaila.
- **Kierunek:** klasy własne dodawać przez `classList.add` albo jedną pełną listę zawierającą klasy natywne.

### T7. Tryb „zastap” dopuszcza duplikaty bez wielkości liter

- **KOD, błąd pewny:** `cleanGroups()` w `addressBook.ts:78–100` deduplikuje grupy i członków case-sensitive, natomiast walidacja UI (`render.ts:1600–1605`) i scalanie w trybie `dolacz` (`addressBook.ts:199–232`) działają case-insensitive.
- `applyBookImport()` w `addressBook.ts:244–260` w trybie zastępowania używa `cleanGroups(incoming.groups)` bez późniejszego scalania case-insensitive.
- **Skutek:** plik może wprowadzić dwie grupy `Rada` i `rada` albo członków `Fred` i `fred`, mimo że użytkownik nie może utworzyć takiej pary ręcznie.
- **Decyzja zatwierdzona:** jedna normalizacja i deterministyczne scalanie dla obu trybów. Porównanie po `trim()` i bez wielkości liter, pierwsza pisownia i kolejność kanoniczna, scalenie wszystkich członków kolejnych duplikatów grupy, brak utraty członków i identyczny wynik po ponownym imporcie.

### T8. Klik „Wyslij zwierze” bez połączenia uruchamia wizualny lot

- **KOD, błąd pewny dla stanu offline; odrzucenie wysyłki jest dodatkowym ryzykiem:** `onSendAnimal` w `index.ts:1979–1994` najpierw wywołuje `startAnimalFlight()`, potem `transport.send(...)` bez obsługi zwróconego Promise.
- `DargothTransport.enqueue()` przy `online === false` zwraca natychmiast rozwiązany Promise bez wysłania komendy (`61–70`, szczególnie `66–68`).
- **Skutek:** komenda nie wychodzi, ale przycisk może być zablokowany jako lot przez **60 sekund** (`index.ts:1414–1421`, stała przy `index.ts:162`).
- Jeżeli `api.command.send()` odrzuci operację, brak `catch` może spowodować nieobsłużony rejection, a wizualny lot nadal pozostanie uruchomiony.
- Podobny wzorzec fire-and-forget występuje w części komend sesji pagera, ale skutek zależy od etapu; nie jest to zaliczone do jednego potwierdzonego błędu.
- **Kierunek:** stan lotu dopiero po potwierdzeniu przyjęcia wysłania; jawny stan dostępności transportu i obsługa błędu zakończenia. Nie udawać wysłania przy rozwiązaniu bez wysłanej komendy.

### T9. `lastMailState` nie jest resetowane przy nowej sesji

- **KOD, ryzyko potwierdzone w logice, częściowo ograniczone przez wznowienie proxy:** stan i deduplikacja GMCP są w `index.ts:834–869`, a `cancelConnectionOperations()` (`629–648`) czyści kontekst listingu i operacje, ale nie resetuje `lastMailState`.
- **Ryzyko:** identyczna pierwsza ramka GMCP po nowym zalogowaniu może zostać uznana za duplikat poprzedniej sesji i nie wywołać odświeżenia. Widok może pozostać przy danych poprzedniego połączenia do kolejnej zmiany stanu.
- Wznowienie przez `proxy.session` wykonuje pełne odświeżenie w `index.ts:695–705`. Ryzyko dotyczy więc przede wszystkim świeżego logowania albo ścieżki bez tego zdarzenia, nie każdego reconnectu.
- **Luka testowa:** istniejące testy sprawdzają duplikaty GMCP i reconnect osobno, ale nie sekwencję „reconnect → identyczna pierwsza ramka”.
- **Kierunek:** reset przy unieważnieniu operacji połączenia; pierwsza poprawna ramka nowej sesji powinna być traktowana zgodnie z udokumentowanym kontraktem początkowym.

### T10. `ImportSession` nie zdejmuje rejestracji anulowania po zakończeniu

- **KOD, błąd pewny, niska waga pojedynczego wystąpienia:** `finish()` i `fail()` w `core/session/importer.ts:38–85` czyszczą timery oraz subskrypcję transportu, ale nie wywołują `cancelUnsub` (`42–57`). Rejestracja z `onCancel` jest zdejmowana tylko przy błędzie samego `transport.send()` (`77–84`).
- **Skutek:** po każdym prawidłowo zakończonym imporcie callback pozostaje w `cancelListeners` do reconnectu. Przy wielu importach rośnie zbiór nieaktywnych funkcji, a podczas reconnect są one bezskutecznie wywoływane.
- **Kierunek:** wspólne sprzątanie wszystkich zasobów przy sukcesie, błędzie i anulowaniu, identyczne z założeniem pozostałych sesji.

### T11. Podpowiedzi wybierają pierwszy prefiks zamiast najlepszego dopasowania

- **KOD:** źródła i `.find()` opisane w rozdziale 7.6.
- **Skutek:** identyczne nazwy i dłuższe prefiksy zasłaniają grupy; wynik zależy od kolejności źródeł.
- **Kierunek:** dokładne dopasowanie przed prefiksem, jawne wyłączenie kolidującej grupy i stabilna kolejność.

### T12. Enter działa niespójnie

- **KOD, niespójność pewna; żadna z wymienionych operacji nie jest całkowicie odłączona:** Enter uruchamia wyszukiwanie List (`render.ts:1034–1040`) i dodanie imienia (`2008–2011`).
- Brakuje analogicznej obsługi przy tworzeniu grupy, zapisaniu zmiany nazwy grupy, dodaniu członka grupy, przekazaniu listu i filtrach w zakładce Usuwanie. Wszystkie te operacje działają przez przycisk, ale podobne formularze wymagają różnego zachowania.
- Nowszy przegląd wykazał również brak spójnej reguły w polach jednoliniowych formularza listu; nie oznacza to zgody na wysyłanie listu klawiszem Enter.
- **Kierunek:** Enter w polu jednoliniowym uruchamia główną akcję tego formularza po tej samej walidacji co klik. W `textarea` Enter zostaje nową linią. Nie dodawać przypadkowego wysyłania listu bez decyzji o skrócie.

### T13. Braki dostępności

- **KOD, potwierdzone braki strukturalne; nie wykonano audytu czytnikiem ekranu:** etykiety compose są osobnymi elementami `<label>` bez `for` i bez obejmowania pola (`render.ts:1423–1429`), więc nie mają programowego powiązania z inputem.
- Zakładki i subzakładki nie mają semantyki `tablist`/`tab` ani `aria-selected` (`render.ts:576–593`).
- Pasek statusu nie ma `role="status"` ani `aria-live`, a pasek postępu nie ma semantyki `progressbar` (`render.ts:510–537`).
- Ikonowe przyciski `x` po uzbrojeniu zmieniają głównie kolor i `title`, bez tekstowego ogłoszenia zmiany stanu.
- Klikalne wiersze mają natomiast poprawne `role="button"`, `tabindex="0"`, obsługę Enter i Spacji; tego zachowania nie wolno pogorszyć.
- **Kierunek:** powiązać etykiety z polami, opisać zakładki i stan, ogłaszać drugi krok także tekstem dla technologii asystujących. Tooltip nie może być jedynym nośnikiem krytycznej informacji.

### T14. Możliwy wyścig dwóch importów pliku

- **KOD, ryzyko wyścigu:** każde zdarzenie `change` uruchamia niezależne, asynchroniczne `file.text()` (`render.ts:2382–2403`). Wynik jest stosowany bez identyfikatora kolejnego importu, numeru operacji ani blokady kolejnego wyboru.
- **Ryzyko:** użytkownik może rozpocząć kolejny wybór przed zakończeniem poprzedniego odczytu. W trybie `zastap` wygrywa plik, którego odczyt zakończy się później, a niekoniecznie plik wybrany jako ostatni; może też zostać zastosowany nie ten tryb, który użytkownik widzi jako ostatni.
- **Luka testowa:** brakuje testu takiej sekwencji.
- **Kierunek:** identyfikator ostatniego wyboru, pomijanie nieaktualnych wyników i zapisane na starcie parametry importu.

### T15. Ponowny wybór tego samego pliku może nie wywołać importu

- **KOD:** pole pliku nie jest czyszczone po obsłużeniu `change`.
- **Ryzyko:** po poprawieniu pliku pod tą samą ścieżką ponowny wybór może nie wygenerować zdarzenia `change`.
- **Kierunek:** reset wartości pola po każdej próbie, także błędnej, bez kasowania aktualnej książki.

### T16. Anulowanie połączenia i stan zdalnego dialogu

- **KOD:** przy reconnect pager wykonuje tylko opcjonalne `onCancel`, cleanup i reject (`core/session/pager.ts:566–570`); odczyt i przekazanie nie mają własnego `onCancel`. Edytor również kończy się bez wysłania `~q` (`core/session/editor.ts:155–158`).
- `tests/reconnectCancel.test.ts:14–25` celowo wymaga, aby reconnect nie wysyłał dodatkowego `q`. Obecne zachowanie jest zamierzone i nie wolno go automatycznie „naprawić” przez dodanie tej komendy.
- **LIVE, potwierdzone pełne ponowne zalogowanie:** pisanie listu rozpoczęto poza pluginem, połączenie zostało przerwane, a po ponownym zalogowaniu pager/edytor nie był już aktywny. Dla tego przypadku nie ma podstaw do dodawania `q` ani `~q`; należy zachować obecny lokalny cleanup.
- **Granica dowodu:** wynik nie jest osobnym dowodem każdej technicznej odmiany `proxy.session resumed` ani każdego dialogu. Nie należy przedstawiać go jako rozstrzygnięcia tych przypadków. Obecny zakres nie wymaga zmiany dla nich; ewentualna nowa strategia wymagałaby osobnej próby serwera.
- **Kierunek testowy:** Playwright z mockiem ma potwierdzić lokalne odrzucenie operacji, czyszczenie zasobów, brak `q` i izolację nowej generacji połączenia. Nie może dowodzić zdalnego zamknięcia dialogu przez prawdziwy serwer.

### T17. Globalne podejrzenie sierocego pagera może przetrwać reconnect

- **KOD, ryzyko niskie i warunkowe:** `orphanPager.ts:28–42` przechowuje globalną dla modułu flagę `suspected`; `cancelConnectionOperations()` jej nie resetuje, mimo że komentarz opisuje stan bieżącej sesji serwera.
- **Ryzyko:** podejrzenie z poprzedniej sesji serwera może wpłynąć na nową sesję.
- W typowym ręcznym wejściu do poczty echo komendy czyści flagę przed promptem, co ogranicza ryzyko. Niepełny pozostaje przypadek promptu odtworzonego po reconnect bez takiego echa; nie znaleziono testu tej sekwencji.
- **Kierunek:** reset przy zmianie generacji połączenia i postaci; żadne podejrzenie nie może przenosić się między sesjami serwera.

### T18. Nieaktualne `pendingEchoSends` po błędzie lub braku echa

- **KOD:** wpis dodawany jest przed `api.command.send()` (`dargothTransport.ts:72–86`), a usuwany dopiero po dopasowaniu echa (`176–187`). Błąd wysłania nie usuwa właśnie dodanego wpisu; limit tylko obcina najstarsze.
- **Ryzyko:** późniejsza identyczna komenda gracza może zostać błędnie oznaczona jako własna.
- **Kierunek:** usunięcie wpisu przy odrzuceniu oraz ograniczenie czasu oczekiwania; zachowanie dopasowania FIFO dla poprawnych wysłań.

### T19. Natychmiastowe `URL.revokeObjectURL()`

- **KOD, ryzyko przeglądarkowe, nie potwierdzony błąd:** `download.ts:38–45` wywołuje `a.click()`, usuwa element i natychmiast wykonuje `URL.revokeObjectURL(url)`.
- **Ryzyko:** część środowisk może nie zdążyć rozpocząć pobierania; kod zwraca mimo to `true`. Typowy Chromium zwykle działa z tym wzorcem, ale nie ma dowodu dla wszystkich obsługiwanych środowisk.
- **Luka testowa:** testy podmieniają implementację pobierania, więc nie sprawdzają rzeczywistego zapisu pliku w kliencie.
- **Kierunek:** opóźnione sprzątanie adresu i test w docelowym kliencie. Nie raportować gwarantowanego zapisu tam, gdzie API daje jedynie sygnał rozpoczęcia pobierania.

### T20. Podpowiedź może rozjeżdżać się z poziomo przewiniętym polem

- **KOD:** `ghost.ts` układa niewidzialny wpisany tekst i sufiks względem wrappera, ale nie synchronizuje `scrollLeft` pola z warstwą podpowiedzi.
- **Ryzyko:** przy długiej liście odbiorców podpowiedź może nie wyrównywać się z kursorem.
- **Kierunek:** obsługa przewinięcia poziomego i test długiego segmentu przy kursorze na końcu.

### T21. Ręczny członek grupy omija reguły imienia i spójności Książki

- **KOD:** opis w rozdziale 7.8.
- **Ryzyko:** dowolny tekst trafia do rozwinięcia adresatów, a Książka nie odzwierciedla członków grupy.
- **Decyzja zatwierdzona:** jedna reguła walidacji, a nowy poprawny członek jest dopisywany jednocześnie do Książki i grupy. Szczegóły w rozdziale 7.8.

### T22. Spacja i przecinek rozdzielają adresatów, ale lokalne funkcje rozbijają tylko przecinki

- **Dowód z rzeczywistych logów:** dwa zanonimizowane logi dla analogicznej pary różnych adresatów wykazały ten sam wynik przy zapisie rozdzielonym spacją i przecinkiem. Podstawowa semantyka obu separatorów jest potwierdzona; nie potrzeba kolejnego logu do tej poprawki.
- **KOD:** walidacja `composeValidation.ts:17–28` dopuszcza litery, przecinki i spacje, ale `splitRecipients()` rozbija wyłącznie po przecinku. W konsekwencji `unknownRecipients()` może potraktować dwie znane osoby rozdzielone spacją jako jednego nieznanego adresata.
- **KOD, ghost:** `splitHead()` w `ui/ghost.ts` szuka granicy segmentu wyłącznie po ostatnim przecinku. Po spacji akceptacja może więc zastąpić niewłaściwy zakres zamiast wyłącznie ostatniego segmentu.
- **Kierunek:** rozbijać lokalnie po przecinkach i spacjach, sprawdzać każdą osobę oddzielnie i segmentować ghosta po ostatnim z obu separatorów. Dodać sparametryzowane testy przecinka i spacji z imionami syntetycznymi.
- **Ochrona surowej wartości:** `core/session/editor.ts` przekazuje pierwotne `input.adresat` do transportu. Tego nie wolno zmieniać na automatyczną normalizację do przecinków, deduplikację ani zmianę kolejności. Generowane rozwinięcie grupy może nadal używać kanonicznych przecinków. Wolny spójnik `i` pozostaje odrzucany.
- **Granica dowodu:** logi nie rozstrzygają wszystkich duplikatów, mieszanych separatorów ani kolejności `Do`/`DW`; nie wolno rozszerzać na nie twierdzenia o serwerze bez osobnych prób.

### T23. Pole szerokości akceptuje częściowy zapis liczby

- **KOD:** `render.ts:1460–1472` używa zwykłego pola i `Number.parseInt`. Zapis `60abc` daje 60, pusta lub nieliczbowa wartość wraca do 60, bez komunikatu.
- **Kierunek:** pole liczbowe z zakresem albo pełna walidacja całego zapisu i jasny komunikat. Zachowanie nie może zależeć od cichego obcinania końcówki.

### T24. Częściowo nieudane pobieranie kończy się poziomem sukcesu

- **KOD:** `index.ts:1754–1762` przy `failed > 0` lub `missing > 0` pokazuje podsumowanie z tytułem `Pobrano tresci` i poziomem `success`.
- **Kierunek:** wynik mieszany jako ostrzeżenie z liczbą pobranych, nieudanych i nieobecnych. Sukces tylko przy pełnym powodzeniu planowanej operacji.

### T25. Komentarz importu opisuje zastępowanie, którego kod nie wykonuje

- **KOD:** komentarz przy `render.ts:2287–2291` mówi `Import ZAMIENIA pule`, natomiast `importPeople()` używa `unionPeople` i dopisuje nowe imiona.
- **Kierunek:** poprawić również komentarz, aby kolejne zmiany nie opierały się na błędnym kontrakcie. To nie jest tekst widoczny, ale jest błędną dokumentacją zachowania.

## 9. Pełny audyt tekstów interfejsu

Przejrzano teksty przycisków, tooltipy, etykiety, stany puste, walidację, statusy operacji i powiadomienia z `render.ts`, `index.ts` oraz `composeValidation.ts`. Poniżej są wszystkie pozycje wymagające zmiany lub doprecyzowania. Pozostałe komunikaty nie wykazały niezgodności z analizowaną ścieżką; w szczególności poprawne są: nazwy skrzynek, `Zapisz w niewyslanych`, oznaczenie dat `wlacznie`, zastrzeżenie filtra treści, zakres eksportu JSON bez aliasów oraz obecny toast czyszczenia książki.

### 9.1. Aliasy, Książka i importy

| ID | Miejsce | Problem | Proponowany kierunek lub tekst |
|---|---|---|---|
| S1 | `render.ts:2218–2222` | `Aliasy edytujesz i usuniesz w grze.` jest niepoprawne językowo. `nie sa zapisywane do pliku` może sugerować brak lokalnego zapisu, chociaż lustro jest zapisywane; chodzi o eksport. | `Aliasy pocztowe z gry sa w ArkMailu tylko do odczytu. Sa zapisane lokalnie jako lustro, ale nie trafiaja do eksportu JSON. Aliasy edytujesz i usuwasz w grze.` |
| S2 | `2221–2223` | `Brak aliasow - aliasy pobiera sie z gry.` jest powtarzalne i nie wskazuje akcji. | `Brak zapisanych aliasow. Pobierz je z gry przyciskiem Importuj aliasy pocztowe.` |
| S3 | `2294–2304` | Tooltipy importu zapamiętanych i przedstawionych mówią `zapisuje je jako baze osob`, co sugeruje zastąpienie. Kod używa `unionPeople` i niczego nie usuwa. | `Pobiera z gry osoby zapamietane i dopisuje nowe do ksiazki adresowej. Istniejacych osob nie usuwa. Grup nie tworzy.` Analogicznie dla przedstawionych. |
| S4 | `2305–2309` | `Nie da sie ich edytowac` jest zbyt szerokie — edycja jest możliwa w grze, tylko nie w ArkMailu. | `Pobiera z gry aliasy pocztowe i dopisuje ich odbiorcow do ksiazki. W ArkMailu aliasy sa tylko do odczytu; edytujesz i usuwasz je w grze. Rozwija je serwer.` |
| S5 | `index.ts:2071–2073` | `Grup: N` miesza liczbę grup z pliku z liczbą imion po scaleniu. Formy `Grup`, `Imion` są też błędne dla 1. | `Z pliku: liczba grup N (dodano: X, scalono: Y). W ksiazce: liczba imion M (dodano: Z).` W praktyce UI może użyć układu `Grupy z pliku: N. Dodane: X. Scalone: Y. Imiona w ksiazce: M. Dodane: Z.` |
| S6 | `index.ts:428` | `Osob pobranych... Nowych...` ma błędne formy dla 1. | `Liczba pobranych osob: N. Liczba nowych osob w ksiazce: M.` |
| S7 | `index.ts:466` | `Aliasow pocztowych: N. Osob dolaczonych...` ma błędne formy dla 1 i nie mówi wprost o zakończonym imporcie. | `Zaimportowano aliasy. Liczba aliasow: N. Liczba osob dopisanych do ksiazki: M.` |
| S8 | `index.ts:2111–2115` | Eksport używa `imion: N, grup: M`, błędnego dla 1. | `Ksiazka adresowa zapisana do pliku. Liczba imion: N. Liczba grup: M.` |
| S9 | `index.ts:2122–2128` | `Dopisano... 0 nowych osob` jest komunikatem sukcesu mimo braku zmiany. | Gdy 0: `Brak nowych osob do dopisania.` jako informacja. Gdy >0: `Dopisano nowe osoby do ksiazki. Liczba dodanych: N. Liczba osob w ksiazce: M.` |
| S10 | `index.ts:2083` | `Wyczyszczono lokalne aliasy` jest poprawne zakresowo, ale warto jednolicie nazwać dane lustrem. | `Wyczyszczono lokalne lustro aliasow. Aliasy na serwerze zostaly bez zmian.` |
| S11 | `render.ts:2241–2252` | `Wyczysc aliasy` nie mówi, że usuwa wyłącznie lokalną kopię. Tooltip już to wyjaśnia. | Etykieta `Wyczysc zapisane aliasy`; tooltip `Usuwa lokalne lustro aliasow. Na serwerze Arkadii nic nie znika. Aliasy pobierzesz z gry ponownie.` |
| S12 | `render.ts:2413–2423` | `Wyczysc cala ksiazke` nie ujawnia w etykiecie, że usuwa też aliasy. | `Wyczysc cala ksiazke i aliasy`; tooltip zachowuje pełny zakres i informację o serwerze. |
| S13 | `render.ts:2347–2357` | Opis `Nowe grupy z pliku dolacza` jest sztywny językowo. | `Dolacza imiona i nowe grupy z pliku. Grupe o tej samej nazwie scala z istniejaca. Nie usuwa obecnych danych.` Opis zastępowania jest zakresowo poprawny i powinien zostać uzupełniony o potwierdzenie z rozdziału 5.4. |
| S14 | `index.ts:2097` | Obecny toast jest już jednoznaczny; nie zmieniać go na ogólny. | Zachować `Wyczyszczono cala ksiazke adresowa (imiona, grupy, aliasy).`; opcjonalnie dodać `Na serwerze nic nie znika.` |
| S15 | `render.ts:2170–2177` | Tytuły podzakładek mają niespójną kapitalizację i nazwę `Import-Eksport`. | `Aliasy pocztowe`, `Import i eksport`. |

### 9.2. Wysyłka, przekazywanie i walidacja

| ID | Miejsce | Problem | Proponowany tekst |
|---|---|---|---|
| S16 | `composeValidation.ts:36–43` | Komunikat nie wyjaśnia odrzucenia wolnego `i`; zapis `a-zA-Z` jest mało czytelny, a sama wzmianka o przecinkach nie opisuje potwierdzonej spacji. | `Adresatow oddziel przecinkami lub spacjami, bez spojnika 'i'. Dozwolone: litery a-z i A-Z.` Analogicznie dla DW. |
| S17 | `core/protocol/commands.ts:118` | `Osoba: tylko litery a-zA-Z.` jest mało czytelne. | `Osoba: tylko litery a-z i A-Z.` |
| S18 | `index.ts:2213–2220`, `core/session/editor.ts:76–79` | Timeout i inne błędy dostają `Blad wysylki - sprawdz adresata.`, mimo że adresat nie jest ustaloną przyczyną. | Timeout: `Serwer nie odpowiedzial na czas. Sprobuj ponownie.` Inny znany błąd: właściwy komunikat. Nieznany: `Nie udalo sie wyslac listu. Sprobuj ponownie.` |
| S19 | `index.ts:2378–2391` | Każda porażka przekazania jest sprowadzana do adresata. | Rozdzielić `brak-adresata`, timeout i inne błędy jak przy wysyłce; fallback `Nie udalo sie przekazac listu. Sprobuj ponownie.` |
| S20 | `index.ts:2174–2177` | `Poza baza osob: ...` jest zbyt lakoniczne i nie mówi, że wysyłka będzie kontynuowana. | `Odbiorcy spoza zapisanej bazy: ... Wysylka bedzie kontynuowana, a serwer zweryfikuje ich nazwy.` |
| S21 | `index.ts:2380` | `List przekazany` może sugerować dostarczenie, mimo że list czeka w niewysłanych. | `Przekazany list zapisany w niewyslanych.` |
| S22 | `render.ts:1506–1522` | Etykieta `Zapisz w niewyslanych` jest zgodna z rzeczywistym skutkiem i nie powinna wracać do `Wyslij`. | Bez zmian. |
| S23 | `render.ts:1556–1576` | Samo `Wyczysc` jest niejednoznaczne obok wielu filtrów. | `Wyczysc pola listu`; tooltip obecnie poprawnie wymienia zakres. |

### 9.3. Archiwum i „Osoby z listów”

| ID | Miejsce | Problem | Proponowany tekst |
|---|---|---|---|
| S24 | `render.ts:2447–2450`, `2594–2600` | Stare `Kontakty`, `Brak kontaktow`, `Zaden kontakt` są niespójne z nazwą widoku. | `Osoby z listow powstaja z listow zebranych ze wszystkich skrzynek.`; `Brak osob z listow - pojawia sie po pobraniu skrzynek.`; `Zadna osoba nie pasuje do filtra.` |
| S25 | `render.ts:2472–2476` | `Ostatni kontakt` jest mniej precyzyjne niż sortowanie po ostatnim liście. | `Ostatni list`. |
| S26 | `render.ts:2533–2538` | Tooltip mówi `domyslnie: odebrane`, ale dla osoby bez odebranych klik otwiera wysłane. | Neutralnie `Pokaz listy tej osoby w archiwum.` albo dynamicznie `Pokaz odebrane...` / `Pokaz wyslane...` zgodnie z faktycznym klikiem. |
| S27 | `render.ts:2542–2544` | Brak separatora przed `alias:`. | `(odebrane: N, wyslane: M) | alias: X`. |
| S28 | `render.ts:2792–2800` | `Do pobrania: N (M bez daty)` sugeruje, że rekordy bez daty należą do kandydatów; kod ich nie pobiera. `Gotowe` może sugerować komplet mimo pominiętych. | `Czesciowo: liczba listow z trescia N. Do pobrania: X. Bez tresci i bez prawidlowej daty: M.` Gdy nie ma kandydatów: `Liczba listow z trescia: N. Do pobrania nie nadaja sie: M (brak prawidlowej daty).` |
| S29 | `render.ts:2801–2807` | `Gotowe: N do zapisu (M bez tresci)` nie mówi, że M zostanie pominięte. | `Do zapisu: N. Pominiete bez tresci: M.` |
| S30 | `render.ts:2755–2763` | `Gotowe od <data>` przedstawia najstarszy timestamp indeksacji jak datę gotowości; `stron: N` jest błędne dla 1. | `Wszystkie skrzynki zapisane. Najstarszy zapis: YYYY-MM-DD.`; `W toku: skrzynka X. Liczba stron: N.` |
| S31 | `render.ts:2824` | `Listow w bazie: N` jest błędne dla 1. | `Liczba listow w bazie: N.` |
| S32 | `render.ts:2899–2902` | `Od dnia pozniej niz Do dnia` jest niepoprawne i nie mówi, że pomijane są oba filtry. | `Data 'Od dnia' jest pozniejsza niz 'Do dnia' - oba filtry dat zostaly pominiete.` Przy błędnej dacie: `Nieprawidlowa data - oba filtry dat zostaly pominiete.` |
| S33 | `render.ts:2941–2943` | `Archiwum puste albo...` jest mniej naturalne. | `Archiwum jest puste albo zaden list nie pasuje do filtra.` |
| S34 | `index.ts:1605–1613` | `Skrzynki sa puste` opisuje puste lokalne archiwum jako stan skrzynek serwera; `listy bez prawidlowej daty: N` ma błędną formę dla 1. | `Archiwum jest puste - nie ma czego pobierac.`; `Nie mozna pobrac tresci. Liczba listow bez prawidlowej daty: N.` |
| S35 | `index.ts:1782–1788` | Przy eksporcie `Skrzynki sa puste` również dotyczy lokalnej bazy, nie potwierdzonego stanu serwera. | `Archiwum jest puste - nie ma czego zapisywac.` |
| S36 | `index.ts:1754–1762` | Wynik z błędami jest przedstawiony jako pełny sukces. | `Pobrano: N z M. Nieudane: X. Nie ma juz w skrzynce: Y.` z poziomem ostrzeżenia; bez części zerowych. |

### 9.4. Szukanie, stany puste i nazwy akcji

| ID | Miejsce | Problem | Proponowany tekst |
|---|---|---|---|
| S37 | `render.ts:293–294` | Tooltip `Szukaj / Odswiez` nie ma kropki i nie mówi wprost o listach oraz wybranej skrzynce. | `Szuka listow po wpisanych filtrach. Przy pustych filtrach odswieza wybrana skrzynke.` |
| S38 | `render.ts:970–972` | Placeholder dopuszcza `kogo? czego?`, a tooltip zawęża je wyłącznie do imienia. | `Wpisz szukana fraze w dopelniaczu (kogo? czego?).` |
| S39 | `render.ts:1066–1075` | `Wyczysc` nie mówi, że usuwa też wszystkie pola szukania. | `Wyczysc wyniki i filtry`; tooltip `Usuwa wyniki szukania, czysci wszystkie pola i przywraca pelny widok skrzynki.` |
| S40 | `render.ts:1080–1087` | `kliknij jej nazwe, aby pobrac` i `Skrzynka pusta` są mniej naturalne. | `Skrzynka nie zaladowana - kliknij jej nazwe, aby ja pobrac.`; `Skrzynka jest pusta.` |
| S41 | `render.ts:1652–1669`, `2033–2049` | Tooltipy `znowu wszystkie grupy`, `znowu cala ksiazka` są skrótami stylistycznymi. | `Czysci filtr grup i pokazuje wszystkie grupy.`; `Czysci filtr imion i pokazuje cala ksiazke adresowa.` |
| S42 | `render.ts:1766`, `2235` i podobne | `Otwiera zakladke Napisz` nie używa pełnej nazwy zakładki `Napisz list`. | `Otwiera zakladke Napisz list z ...` |
| S43 | `render.ts:1284` | `Zapisz list TXT` jest poprawne, ale mniej naturalne niż pełny zapis. | `Zapisz list jako TXT`. |
| S44 | `index.ts:972`, `1025` | `Nie moge znalezc` i `Nie ma tego listu na liscie` używają różnych, mniej neutralnych sformułowań dla podobnego przypadku. | `Nie mozna odnalezc tego listu - odswiez skrzynke.` |
| S45 | `index.ts:2473` | `Zwierze nie odpowiada` opisuje skutek jako brak odpowiedzi zwierzęcia, podczas gdy ścieżka reaguje na nierozpoznanie komendy przez serwer. | `Arkadia nie rozpoznala komendy wyslania zwierzecia. Sprawdz, czy masz zwierze pocztowe.` |
| S46 | `index.ts:1801–1808` | Warunek rozróżnia wyłącznie liczbę 1 od pozostałych, więc daje błędne `2 plikow`, `3 plikow` i `4 plikow`. Informacja o pominiętych jest poprawna zakresowo. | `Zapisano pliki TXT do ZIP. Liczba plikow: N. Pominiete bez tresci: M.` |

### 9.5. Reguły redakcyjne dla całego pluginu

1. **Osoby z listów** to dane pochodne archiwum. **Książka adresowa** to zapisane imiona. Nie używać dla obu ogólnego „kontakty”.
2. **Aliasy** są lokalnym lustrem danych serwera. Czyszczenie lustra nie jest usuwaniem aliasów w grze i tekst musi to rozróżniać.
3. Przy dynamicznych liczbach stosować rzeczowniki niezmienne względem liczby (`Liczba osob: N`, `Liczba grup: N`) albo poprawną liczbę mnogą. Nie zostawiać `1 osob`, `1 grup`, `1 listow`, `1 plikow`.
4. Komunikat błędu może wskazywać przyczynę tylko wtedy, gdy kod ją rozpoznał. Timeout nie jest błędem adresata.
5. Sukces oznacza wykonanie planowanej operacji. Zero dodanych osób jest informacją o braku zmiany, a wynik z nieudanymi pobraniami — ostrzeżeniem.
6. „Lokalnie”, „na serwerze”, „tylko do odczytu” i „pominięte” mają być używane dosłownie, bez sugerowania szerszego skutku.
7. Etykieta przycisku ma wskazywać zakres tam, gdzie samo `Wyczysc` byłoby niejednoznaczne. Tooltip uzupełnia szczegóły, ale nie zastępuje jasnej etykiety.
8. Nazwy zakładek i pojęć pozostają jednolite w etykietach, tooltipach i toastach.

## 10. Układ prac przy przyszłej implementacji

To nie jest zgoda na implementację ani kolejność już zatwierdzona. Jest to bezpieczny porządek zależności do wykorzystania po osobnej decyzji.

1. **Najpierw ochrona danych i błędy wysyłki:** T1, T2, T4, T8, T9, T10, T16–T18 oraz S16–S21.
2. **Potem jedna normalizacja Książki i kolizji:** T7, T14, T15, T21, T22, reguły z rozdziału 7 i potwierdzenie zastępowania.
3. **Następnie wspólne typy przycisków i układy:** obserwacje 1–8, 11, T6, T12, T13, T20, T23.
4. **Na końcu teksty i szczegóły statusów:** pozostałe pozycje S, T24–T25.
5. **„Wyslij zwierze” w nagłówku:** po uporządkowaniu stanu dostępności transportu z T8, aby nie przenosić błędnego zachowania do bardziej widocznego miejsca.

Każda zmiana kodu wymaga najpierw testu, który zawodzi na starym zachowaniu lokalnie, następnie poprawki i pełnego zielonego zestawu przed scaleniem. Nie wolno używać CI do celowego pokazania czerwonego testu.

## 11. Minimalna macierz akceptacyjna

### Filtry i przewijanie

- Wspólne czyszczenie uruchomione w Archiwum i w „Osobach z listów” daje identyczny stan; nie zmienia aktywnej podzakładki.
- Przycisk jest nieaktywny dopiero wtedy, gdy wszystkie objęte filtry są puste, skrzynka nie jest wybrana, a sortowanie osób jest domyślne.
- Sortowanie wraca do `Nazwa A-Z`, wszystkie pola dat i tekstu są puste.
- Lista osób wykorzystuje dostępną wysokość przy kilku i przy setkach pozycji; kontrolki pozostają widoczne; nie ma sztywnego limitu 240 px.

### Przyciski

- Wszystkie czyszczenia filtrów są czerwone i jednostopniowe.
- Wszystkie usunięcia danych są czerwone i dwustopniowe; drugi krok ma pełny wygląd danger i jednoznaczny opis.
- Pobieranie treści ma neutralne potwierdzenie, nie czerwone.
- ESC rozbraja bez wykonania operacji; repaint nie wykonuje odłożonej akcji.
- Zwykłe pola zachowują natywne klasy i własne klasy dodatkowe.

### Grupy i aliasy

- Utworzenie grupy o nazwie istniejącego aliasu jest odrzucane; to samo dotyczy innej wielkości liter i białych znaków na końcach oraz zmiany nazwy grupy na alias.
- Utworzenie grupy przed pierwszym wczytaniem aliasów jest dozwolone; późniejszy import kolidującego aliasu zachowuje obie struktury, oznacza grupę i wyłącza ją z podpowiedzi.
- Kolidująca grupa nie jest rozwijana; dokładny alias działa jako adresat serwerowy, a członkowie grupy pozostają niezmienieni.
- `gildia` nie jest zasłaniane przez `gildia-rada`; dokładne dopasowanie wygrywa z prefiksem.
- Zmiana nazwy grupy na wolną przywraca podpowiedź bez zmiany członków; świadome usunięcie grupy kończy konflikt.
- Usunięcie aliasu na serwerze i udany, kompletny import przywraca możliwość rozwijania grupy bez ręcznego odblokowania.
- Nieudany lub niekompletny import pozostawia poprzednie aliasy, konflikty i dostępność grup bez zmian oraz pokazuje błąd.
- Wiele konfliktów w jednym imporcie daje kompletną listę, bez domyślnego wyboru jednej aktywnej grupy.
- Import pliku w trybach `dolacz` i `zastap` zachowuje kolidujące grupy, pokazuje wszystkie konflikty i nie pomija danych po cichu.
- Import pliku z duplikatami jest deterministyczny i nie niszczy danych.
- Eksport zawiera również kolidujące grupy, nie zawiera aliasów serwera ani trwałej flagi konfliktu; ponowny import wylicza konflikt według aktualnych aliasów.
- Powtórzenie identycznego importu nie zmienia danych, nie tworzy kopii i nie powiela ostrzeżeń.
- Różna kolejność zapisu grupy i aktualizacji aliasów daje ten sam wynik końcowy.
- Wykrycie konfliktu nie przepisuje wpisanego pola adresatów ani zapisanego szkicu.

### Pliki i zapis

- Nieznana wersja pliku jest odrzucana przed mutacją.
- Zastępowanie wymaga świadomego potwierdzenia konkretnego pliku.
- Dwa odczyty zakończone w odwrotnej kolejności nie mogą zastosować starszego wyboru.
- Ten sam plik można wybrać ponownie po sukcesie i po błędzie.
- Błąd `putLetters` nie gubi oczekującego zapisu.

### Teksty i dostępność

- Testy liczników obejmują 0, 1, 2, 4, 5, 21, 22 i 25 tam, gdzie występują formy zależne od liczby.
- Timeout wysyłki i przekazania nie wspomina adresata.
- Czyszczenie danych wymienia osoby z listów i zachowanie aliasów.
- Zakładki, pola, status i drugi krok potwierdzenia mają poprawne nazwy oraz stany dostępności.
- Enter wykonuje tylko akcję właściwą dla danego formularza; w treści listu pozostaje nową linią.

### Przycisk zwierzęcia

- Jeden przycisk w nagłówku we wszystkich zakładkach, przed natywnymi kontrolkami okna.
- Brak duplikatu po ponownym otwarciu, aktywacji i zmianie postaci.
- Klik offline nie uruchamia pozornego lotu.
- Ręczne wysłanie z gry, powrót, błąd i limit czasu aktualizują ten sam stan.
- Szerokie okno i spoczynek: `Wyslij zwierze`; szerokie okno i lot: `Zwierze w drodze...`.
- Wąskie okno i spoczynek: `Zwierze`; wąskie okno i lot: `W drodze...`.
- **Przy wąskim oknie i `animalFlying=true` widoczne jest `W drodze...`, nigdy samo `Zwierze`.**
- Podczas lotu przycisk jest semantycznie nieaktywny i nie uruchamia kolejnej wysyłki; tooltip oraz etykieta dostępności brzmią `Zwierze w drodze...` także przy wąskim oknie.
- Zmiana szerokości podczas lotu zachowuje informację o locie. Zmiana stanu i szerokości nie przesuwa pozostałych kontrolek ani nie zmienia ich kolejności.
- Po zakończeniu lotu oba warianty szerokości wracają do właściwego tekstu spoczynku.

## 12. Macierz kontrolek z pierwotnego audytu

**Wniosek:** nie znaleziono widocznej kontrolki całkowicie odłączonej w produkcyjnym montażu. Nie znaczy to, że wszystkie działają poprawnie w każdym przypadku — problemy dotyczą między innymi walidacji, stanu danych, klas, błędów i przypadków brzegowych.

| Obszar | Podpięcie i walidacja | Najważniejsze ustalenie |
|---|---|---|
| Zakładki i skrzynki | podpięte | brak martwych kontrolek |
| Listy, starsze strony, pełne wczytanie | podpięte, chronione lockiem | ręczny błąd odświeżenia jest cichy |
| Szukajka List | podpięta; Enter i walidacja działają | pole `Tresc` traci klasy natywne; kontakty nie są przebudowywane |
| Odczyt listu | podpięty; re-kotwiczenie obecne | pełny relog zamyka zdalny dialog; zachować brak `q`, inne wznowienia nie są rozstrzygnięte |
| Odpowiedź, cytowanie, przekazanie, usunięcie, eksport | podpięte | brak Enter przy przekazaniu |
| Compose, szablon, szerokość, podgląd, wyczyszczenie | podpięte; walidacja przed wysłaniem | braki etykiet dostępności; osobne ustalenia T23 |
| Kontakty, filtr, sortowanie, kierunki | podpięte | dane mogą być nieaktualne po wyszukiwaniu |
| Książka adresowa CRUD i zaznaczanie | podpięte | selektor fokusu nie znosi znaków specjalnych |
| Import i eksport książki | podpięte | nieznane wersje, duplikaty liter i wyścig odczytu |
| Grupy i ghosty | podpięte | kolizje kandydatów mogą blokować rozwinięcie grupy |
| Archiwum, indeksacja, pobieranie treści, eksport | podpięte | trwały zapis po błędzie IndexedDB nie jest ponawiany |
| Usuwanie zbiorcze | podpięte; zaznaczenie jest ponownie dopasowywane do świeżego listingu | brak Enter; select traci klasy natywne |
| Lot zwierzęcia | podpięte | pozorny lot offline i nieobsłużone odrzucenie |

Późniejsze obserwacje LIVE i ustalenia T18–T25 uzupełniają tę macierz, ale nie zmieniają wniosku o braku całkowicie odłączonej kontrolki na analizowanym HEAD.

## 13. Mocne elementy, których nie wolno popsuć podczas poprawek

1. **Re-kotwiczenie operacji pagerowych:** operacje nie polegają wyłącznie na starym numerze listu.
2. **Świeży listing przy usuwaniu zbiorczym:** listing jest ponownie pobierany, a zaznaczenie dopasowywane po tożsamości rekordów.
3. **Bliźniacze listy:** zachowują odrębne rekordy i treści; `recordId` nie jest utożsamiane z `contentKeyOf`.
4. **Stan UI przy repaintach:** drafty, fokus, karetka, checkboxy i scroll są zachowywane przy zwykłych repaintach. Poprawka T3 ma usuwać awarię selektora, nie zrezygnować z ochrony stanu.
5. **Rzeczywista walidacja:** compose i filtry są walidowane również poza wyglądem kontrolek.
6. **Granice dat:** daty UI są włączne, a granice serwerowe poprawnie przeliczane na wyłączne.
7. **Ochrona przed wyścigami:** lock, generacja połączenia i anulowanie oczekujących operacji ograniczają większość wyścigów.
8. **Potwierdzenia i niepewny wynik:** obecne potwierdzenia operacji destrukcyjnych oraz wycofanie zaznaczenia przy niepewnym usuwaniu są dobrze rozbudowane. Zmiany stylu i neutralnego potwierdzenia długiej operacji nie mogą osłabić tych zabezpieczeń.

## 14. Wynik pierwotnych testów i granice dowodu

### 14.1. Wynik łączony

Środowisko: **Node 26.13.0**.

Pierwszy pełny przebieg:

- 857 testów;
- 854 zaliczone;
- 2 przerwania środowiskowe;
- 1 warunkowo pominięty.

Dwa pliki przerwały ładowanie z błędem `resource temporarily unavailable` przy odczycie `package.json`; nie wykonały scenariuszy. Ponowione osobno dały **6/6 zaliczonych**. Łączny rezultat po tym ponowieniu:

- **860 zaliczonych;**
- **1 warunkowy skip;**
- **0 niezaliczonych.**

Pominięty test dotyczy komunikatu commita poza CI i jest pomijany warunkowo. Nie był to jeden ponowny, pełny przebieg wszystkich testów po awarii środowiska. Wynik jest więc łączony, a nie deklaracją jednorazowego pełnego zielonego przebiegu.

### 14.2. Czego testy nie dowodzą

Pierwotny audyt nie obejmował testów w żywym kliencie Dargoth. Testy `happy-dom`, podmienione pobieranie i transport nie dowodzą rzeczywistego layoutu, motywu, zapisu pliku, zachowania serwera ani odrzucenia zewnętrznych API. Ryzyka oznaczone jako warunkowe nie mogą być przedstawiane jako odtworzone błędy LIVE.

### 14.3. Harness prawdziwego Dargotha

Do automatycznej weryfikacji należy wykorzystać istniejące prywatne repozytorium `Isithunzi000/arkadia-dargoth-testy`. Sprawdzony podczas analizy HEAD to `433496ed8d66a530e5095dc0a15cd2a33fde4df4`; przed implementacją trzeba ponownie odczytać aktualny HEAD. W analizowanym drzewie było 952 pliki i nie było ścieżki zawierającej `mail`.

Harness uruchamia prawdziwy build Dargotha i lokalny preview, instaluje paczkę pluginu przez prawdziwy menedżer skryptów, obsługuje reload i IndexedDB, rejestruje błędy strony oraz udostępnia mock WebSocket, GMCP, teksty i dziennik komend. Nie loguje się na serwer Arkadii.

Macierz ArkMaila powinna być izolowana: własna konfiguracja, skrypt, port, scenariusze, odpowiedzi poczty, artefakty i osobny job CI. Pełny SHA Dargotha należy pobrać i zapisać na starcie, po czym używać go niezmiennego przez cały przebieg. Testowany plugin musi pochodzić z bieżącego `npm run bundle` i paczki utworzonej z `build/arkmail`; `scripts/build.js` korzysta z ZIP-ów release'owych i nie może dostarczać starego artefaktu do testu nowych zmian.

Asercje DOM, stanu, komend i pobranych plików są głównym dowodem, a screenshoty i trace — pomocniczym. Mock dowodzi zachowania pluginu w prawdziwym kliencie, nie semantyki prawdziwego serwera.

## 15. Wymagana weryfikacja przed zamknięciem

### 15.1. Automatyczna macierz Playwright na prawdziwym Dargothcie

1. Jasny i ciemny motyw pól bez klas natywnych, w szczególności select Usuwania i pole `Tresc` z T6.
2. Rzeczywisty layout długich pól i ghostów, w tym poziome przewinięcie z T20 oraz segmentacja po przecinku i spacji.
3. Lokalne sprzątanie reconnectu, brak `q`, czyszczenie listenerów i izolacja generacji połączenia; bez twierdzenia, że mock dowodzi stanu serwera.
4. Pobieranie plików przez docelową przeglądarkę i kontrola nazwy oraz zawartości pliku po opóźnionym sprzątaniu adresu z T19.
5. Wstrzyknięte odrzucenie IndexedDB, w szczególności `putLetters()` z T1, oraz `api.command.send()` z T8.
6. Dokładny toast po czyszczeniu książki, wersja bieżącego bundle'a i kliknięta kontrolka — kod HEAD ma już komunikat z nazwą książki.
7. Faktyczny kolor `Wyczysc` w wynikach List w używanym motywie — kod HEAD już przypisuje danger ghost.
8. Układ przewijania Osób po usunięciu sztywnego limitu dla kilku i setek pozycji.
9. Nagłówek z przyciskiem zwierzęcia przy rzeczywistych tokenach i szerokościach Dargotha, w tym wąskie okno z `animalFlying=true` i tekstem `W drodze...`.
10. Brak błędów strony i konsoli po instalacji, użyciu, reloadu i ponownej aktywacji.

### 15.2. Dowody serwerowe i ich granice

1. **T16:** pełne ponowne zalogowanie zostało wykonane i zamknęło podstawowy przypadek. Nie powtarzać go dla obecnego zakresu i nie dodawać `q` ani `~q`. Nie jest to dowód każdej odmiany `proxy.session resumed`.
2. **T22:** dwa logi potwierdziły spację i przecinek dla analogicznej pary różnych adresatów. Nie potrzeba kolejnego logu dla podstawowej poprawki. Duplikaty, mieszane separatory i kolejność `Do`/`DW` pozostają poza dowodem.
3. Semantykę aliasów na serwerze przy dokładnych nazwach, wielkości liter i znakach diakrytycznych sprawdzać tylko wtedy, gdy przyszła implementacja miałaby wykraczać poza porównanie opisane w rozdziale 7.
4. Nowa próba serwera jest wymagana dopiero wtedy, gdy planowana zmiana zależy od zachowania, którego nie rozstrzygają dotychczasowe dowody. Mock Playwright nie zastępuje takiej próby.

## 16. Warunek usunięcia dokumentu

Dokument można usunąć dopiero po zakończeniu uzgodnionych poprawek, pełnych testach, wymaganej macierzy Playwright i pozostałych, rzeczywiście potrzebnych prób serwera. Jeżeli któraś pozycja zostanie świadomie odrzucona, decyzję i powód należy najpierw przenieść do trwałej dokumentacji projektu, aby usunięcie tej listy nie usunęło również uzasadnienia decyzji.
