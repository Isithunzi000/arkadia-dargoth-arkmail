# ArkMail — roboczy plan napraw, poprawek i ulepszen

Dokument roboczy powiazany z `docs/AUDYT_UI_ROBOCZY.md`. Oba dokumenty nalezy zachowac do zakonczenia calego uzgodnionego zakresu i pelnej weryfikacji. Dopiero wtedy mozna je usunac z repozytorium. Implementacja planu wymaga osobnej jawnej zgody.

## 1. Podstawa i zakres

- Repozytorium: `Isithunzi000/arkadia-dargoth-arkmail`, galaz `main`.
- Punkt odniesienia analizy: `c171285d81ca5cfab1af9e55afafa1872803f92d`, ArkMail 1.30.2.
- Plan obejmuje wszystkie pozycje T1–T25, S1–S46, dwanascie obserwacji LIVE, kolizje alias/grupa, cztery stany przycisku zwierzecia oraz wymagane testy.
- Dokument nie jest zgoda na implementacje, commit zmian kodu, release ani publikacje.
- Teksty UI i komentarze w `src` pozostaja w ASCII bez polskich diakrytykow.

## 2. Decyzje zamykajace kwestie otwarte

### 2.1. Czlonkowie grup — T21

- Reczne dodanie czlonka grupy uzywa tej samej walidacji imienia co dodanie osoby do Ksiazki.
- Poprawne, nieznane dotad imie zostaje jednoczesnie dopisane do Ksiazki i grupy.
- Operacja jest jedna aktualizacja modelu, bez stanu posredniego, w ktorym czlonek istnieje tylko w grupie.
- Duplikat bez wielkosci liter nie powoduje zmiany.
- Bledne imie nie zmienia ani Ksiazki, ani grupy.
- Nie powstaje trzecia semantyka „dowolny tekst wylacznie w grupie”.

Decyzja jest zgodna z istniejacym `withGroupMembers()`, ktore juz wymaga obecnosci wszystkich czlonkow grup w Ksiazce.

### 2.2. Duplikaty w imporcie `zastap` — T7

Duplikaty sa scalane deterministycznie, a nie odrzucane jako caly plik:

- porownanie grup i czlonkow po `trim()` i bez wielkosci liter;
- pierwsza napotkana pisownia jest kanoniczna;
- kolejne duplikaty grup scalaja czlonkow;
- zaden czlonek nie znika;
- kolejnosc wyniku jest stabilna i zgodna z pierwszym wystapieniem;
- powtorzenie importu daje identyczny wynik;
- ta sama normalizacja obowiazuje w `dolacz` i `zastap`.

### 2.3. Kolizje alias/grupa

Konflikt jest stanem wyliczanym z biezacych grup i biezacego lustra aliasow. Nie jest zapisywany jako trwala flaga grupy ani eksportowany.

- Nowa lub zmieniana nazwa grupy nie moze kolidowac z aktualnym lustrem aliasow.
- Porownanie odbywa sie wylacznie po `trim()` i bez wielkosci liter.
- Nie stosowac normalizacji diakrytykow ani podobienstwa przyblizonego.
- Grupe przed pierwszym importem aliasow mozna utworzyc.
- Pozniejszy kolidujacy alias jest zachowywany razem z grupa i jej czlonkami.
- Kolidujaca grupa pozostaje w danych i eksporcie, ale znika z rozwijanych podpowiedzi.
- Dokladna nazwa trafia wtedy do serwera jako alias.
- Ostrzezenie jest widoczne trwale przy grupie.
- Zmiana nazwy grupy albo udany kompletny import bez kolidujacego aliasu automatycznie usuwa konflikt.
- Bledny lub niekompletny import nie zmienia lustra, konfliktow ani dostepnosci grup.
- Identyczny import nie powiela danych ani nowych ostrzezen.
- Wpisane pola adresatow i zapisane szkice nie sa przepisywane.
- Nie wolno automatycznie scalac, kasowac, zmieniac nazwy ani odrzucac aliasu.

### 2.4. Pozycje warunkowe

- **T16:** najpierw test reconnectu z otwartym pagerem i edytorem. Nie dodawac automatycznie `q` ani `~q`.
- **T22:** najpierw ustalenie zachowania serwera dla odbiorcy `A B`. Nie zaostrzac walidacji bez tego dowodu.

## 3. Staly protokol wykonania kazdego etapu

Dla kazdej zmiany kodu:

1. Utworzyc lub zmienic test tak, aby opisywal docelowe zachowanie.
2. Uruchomic go lokalnie na starym kodzie i zachowac konkretny wynik RED: nazwe testu i niespelnione zalozenie.
3. Nie wysylac celowo czerwonego testu do CI.
4. Wykonac minimalna implementacje potrzebna do GREEN.
5. Ponownie uruchomic test docelowy i testy sasiedniego obszaru.
6. Uruchomic `npm run typecheck`, `npm test`, `npm run bundle` i `npm run build`.
7. Sprawdzic brak niezamierzonych zmian w plikach generowanych.
8. Dopiero po pelnym zielonym wyniku scalic etap.

Jezeli zmiana dotyczy wylacznie dokumentacji lub tekstu bez osobnej sciezki wykonania, rowniez musi miec test tresci albo struktury. Nie wolno jedynie podmienic starego oczekiwania bez wykazania, ze nowe oczekiwanie pada na starym kodzie.

## 4. Kolejnosc prac i zaleznosci

### Etap 0 — potwierdzenie punktu wyjscia

**Zakres:** caly projekt.

1. Potwierdzic HEAD i zgodnosc drzewa roboczego z analizowanym stanem.
2. Wykonac jeden pelny przebieg `npm test` bez laczenia wynikow z osobnymi ponowieniami.
3. Wykonac `typecheck`, `bundle` i `build`.
4. Ustalic rzeczywista liczbe testow, zaliczen i warunkowych pominiec.
5. W razie bledu srodowiska powtorzyc pelny przebieg po usunieciu przyczyny, a nie przedstawiac sumy czesciowych wynikow jako jednego przebiegu.

**Warunek przejscia:** jeden pelny zielony punkt odniesienia. Jesli HEAD ma regresje, najpierw nalezy ja oddzielic od planowanych zmian.

### Etap 1 — trwaly zapis listow

**Zakres:** T1.

**Pliki:**

- `src/arkmail/adapters/writeThroughStorage.ts`
- `tests/writeThroughStorage.test.ts`
- `tests/mailStorage.test.ts`
- `tests/atomicClear.test.ts`

**Najpierw RED:**

- odrzucenie pierwszego `putLetters()`, pozniejszy sukces i sprawdzenie, ze rekord nie zniknal z oczekujacych zapisow;
- ponowny `flush()` ponawia zapis bez koniecznosci zmiany tresci listu;
- nowsza wersja rekordu utworzona podczas oczekiwania na starszy zapis nie jest usuwana ani nadpisywana starsza;
- niezmieniony `setLetters()` przy istniejacym oczekujacym zapisie nadal umozliwia ponowienie;
- `clearLetters()` i `clearMailData()` po bledzie nie pozwalaja wskrzesic usunietych rekordow;
- fizyczny purge pozostaje skuteczny;
- powtorzenie tej samej operacji nie powoduje dodatkowych zmian danych.

**Implementacja GREEN:**

- pobierac snapshot oczekujacych rekordow bez czyszczenia mapy przed zapisem;
- po sukcesie usuwac wpis tylko wtedy, gdy nadal odpowiada zapisanemu snapshotowi;
- po bledzie pozostawic najnowsze oczekujace wartosci;
- `flush()` ma aktywnie ponawiac pozostale zapisy listow;
- bez nieskonczonego automatycznego ponawiania przy trwalym bledzie;
- zachowac jednokrotne zgloszenie bledu zgodne z obecna polityka magazynu.

**Warunek zamkniecia:** blad zapisu nie powoduje utraty nowych danych po restarcie, a starsza operacja nigdy nie wygrywa z nowszym stanem.

### Etap 2 — bezpieczny i jednolity model Ksiazki

**Zakres:** T2, T7, T21, podstawa pod S5 i pozniejsze kolizje.

**Pliki:**

- `src/arkmail/core/addressBook.ts`
- `src/arkmail/core/protocol/commands.ts`
- `src/arkmail/ui/render.ts`
- `src/arkmail/index.ts`
- `tests/addressBook.test.ts`
- `tests/bookView.test.ts`
- `tests/groupsView.test.ts`
- `tests/ghostMemberAdd.test.ts`

**Najpierw RED:**

- wersje `0`, `2.5`, `3`, `99` sa odrzucane;
- v2 bez wymaganych `people` albo `groups` jest odrzucany;
- nieprawidlowe typy pol nie moga zostac zamienione na pusta Ksiazke;
- bledny plik w `zastap` pozostawia poprzedni stan bez zmian;
- `Rada` + `rada` daje jedna grupe z wszystkimi czlonkami;
- `Fred` + `fred` w obrebie grupy daje jednego czlonka;
- identyczny import powtorzony jest no-op;
- reczne dodanie nowego poprawnego czlonka dopisuje go takze do Ksiazki;
- niepoprawne imie nie zmienia zadnych danych;
- usuniecie grupy nie usuwa osob z Ksiazki.

**Implementacja GREEN:**

- jawna lista obslugiwanych wersji: 1 i 2;
- pelna walidacja ksztaltu przed normalizacja i przed mutacja;
- jedna wspolna normalizacja dla obu trybow importu;
- jedna wspolna walidacja imienia dla Ksiazki i recznego czlonka grupy;
- zachowac `migratePeople()` bez zmian zakresu;
- nie dodawac migracji historycznych grup.

**Warunek zamkniecia:** zadna sciezka importu nie moze wprowadzic modelu niedostepnego do uzyskania przez poprawne operacje UI.

### Etap 3 — bledy operacji, reconnect i sprzatanie sesji

**Zakres:** T4, T5, T9, T10, T17 oraz warunkowo T16.

**Pliki:**

- `src/arkmail/index.ts`
- `src/arkmail/core/session/importer.ts`
- `src/arkmail/core/session/orphanPager.ts`
- `src/arkmail/core/session/pager.ts`
- `src/arkmail/core/session/editor.ts`
- `tests/importSession.test.ts`
- `tests/reconnectCancel.test.ts`
- `tests/orphanPager.test.ts`
- `tests/gmcpMailState.test.ts`
- `tests/characterLifecycle.test.ts`
- testy wyszukiwania i odswiezania w `tests/harness.ts` oraz testach integracyjnych

**T4 — RED→GREEN:**

- blad recznego odswiezenia pokazuje blad i nie przedstawia starych danych jako swiezych;
- anulowanie nie jest zglaszane jako awaria;
- automatyczne odswiezenie nie uruchamia agresywnego ponawiania ani serii toastow;
- `finally` nadal konczy stan zajetosci;
- rozroznic zrodlo wywolania reczne i automatyczne zamiast wspolnego pustego `catch`.

**T5 — RED→GREEN:**

- wyszukanie nowej osoby natychmiast przebudowuje `contacts`;
- `Dodaj wszystkie do ksiazki` widzi osoby znalezione w ostatnim wyszukiwaniu;
- powtorzenie wyszukania nie duplikuje osob ani rekordow;
- wspolna finalizacja zmiany archiwum wykonuje zapis i przebudowe osob.

**T9 i T17 — RED→GREEN:**

- reconnect → identyczna pierwsza ramka GMCP jest przetwarzana jako pierwsza ramka nowej sesji;
- duplikat w obrebie tej samej sesji pozostaje odfiltrowany;
- podejrzenie sierocego pagera nie przechodzi do nowej generacji polaczenia ani postaci;
- reset nie wylacza ochrony przed zabijaniem recznej sesji gracza.

**T10 — RED→GREEN:**

- sukces, blad, anulowanie i blad `transport.send()` zdejmuja dokladnie jedna rejestracje anulowania;
- wielokrotne sprzatanie jest bezpieczne;
- reconnect nie wywoluje callbackow zakonczonych importow.

**T16 — brama LIVE przed kodem:**

1. Otworzyc odczyt listu, przekazanie i edytor w osobnych probach.
2. Wymusic reconnect i wznowienie tej samej sesji serwerowej.
3. Ustalic, czy zdalny pager/edytor nadal istnieje.
4. Jesli nie istnieje: nie zmieniac protokolu, zachowac obecny zakaz dodatkowego `q`.
5. Jesli istnieje: przygotowac osobna, bezpieczna strategie oparta na wyniku testu. Nie wolno automatycznie wysylac `q`, poniewaz moze trafic do nowego kontekstu albo przerwac reczna sesje gracza.

**Warunek zamkniecia:** pelne sprzatanie lokalne bez przenoszenia stanu miedzy sesjami i bez zgadywania stanu zdalnego dialogu.

### Etap 4 — transport, echo i przycisk zwierzecia

**Zakres:** T8, T18, obserwacja 4.9, cztery stany przycisku, S45.

**Pliki:**

- `src/arkmail/adapters/dargothTransport.ts`
- `src/arkmail/core/session/transport.ts`
- `src/arkmail/index.ts`
- `src/arkmail/ui/store.ts`
- `src/arkmail/ui/styles.ts`
- `types/plugin-api.d.ts`
- nowy, maly modul naglowka, np. `src/arkmail/ui/animalHeader.ts`
- `tests/adapters.test.ts`
- `tests/composeTransport.test.ts`
- `tests/animalButton.test.ts`
- `tests/animalDelivery.test.ts`
- `tests/animalSlucham.test.ts`
- `tests/sendGuard.test.ts`
- `tests/characterLifecycle.test.ts`

#### Transport i echo

**RED:**

- wyslanie offline nie moze zakonczyc sie jako pozorne powodzenie;
- odrzucenie `api.command.send()` usuwa wlasciwy wpis echo;
- wygasniecie wpisu nie pozwala oznaczyc pozniejszej identycznej komendy gracza jako `own`;
- poprawne echo nadal dopasowuje FIFO;
- reconnect i `dispose()` usuwaja wpisy oraz timery;
- blad transportu nie powoduje nieobslugonego rejection w zadnym miejscu wywolania.

**GREEN:**

- wpisy echo przechowuja tozsamosc operacji, tekst i termin wygasniecia, nie tylko string;
- usuniecie po bledzie odbywa sie po tozsamosci operacji;
- projektowy limit wygasniecia: `10_000 ms`, jako limit porzadkowania lokalnych wpisow, nie twierdzenie o czasie odpowiedzi serwera;
- czas kontrolowany w testach sztucznym zegarem;
- wszystkie miejsca fire-and-forget musza miec swiadome obsluzenie bledu albo anulowania;
- nie zmieniac semantyki poprawnych komend pagera i edytora.

#### Lot zwierzecia

**RED:**

- klik offline nie uruchamia lotu ani 60-sekundowej blokady;
- odrzucenie wyslania nie uruchamia lotu i pokazuje wlasciwy blad;
- podwojny klik podczas przyjecia wysylki nie wysyla drugiej komendy;
- natychmiastowa odpowiedz serwera nie gubi zdarzenia powrotu ani `Slucham?`;
- reczne wyslanie z gry, powrot, blad i timeout uzywaja tego samego stanu.

**GREEN:**

- wewnetrzna blokada pojedynczej wysylki przed rozpoczeciem operacji;
- detektory odpowiedzi przygotowane przed wyslaniem i posprzatane po odrzuceniu;
- `startAnimalFlight()` dopiero po rzeczywistym przyjeciu komendy przez transport;
- kazdy blad przywraca spoczynek i sprzata czasowe zasoby;
- S45: `Arkadia nie rozpoznala komendy wyslania zwierzecia. Sprawdz, czy masz zwierze pocztowe.`

#### Naglowek okna

**Implementacja:**

- usunac przycisk z paska List;
- utworzyc jeden stabilny wezel `headerActions`;
- uzyc `popup-header-btn` i dodatkowej klasy ArkMaila;
- przekazac ten sam wezel przy `registerPersistentPopup`;
- aktualizowac wlasciwosci istniejacego przycisku, zamiast tworzyc nowy przy repaintach;
- subskrybowac `animalFlying` i `wide`;
- odsubskrybowac przy dezaktywacji postaci i `destroy()`;
- nie zakladac, ze style scoped pod `.arkmail-root` obejmuja naglowek;
- akcent: `var(--popup-accent)`, `var(--popup-accent-subtle-bg)`, bez danger;
- makieta pozostaje bez zmian.

**Testy czterech stanow:**

| Szerokosc | Lot | Tekst | Aktywnosc |
|---|---:|---|---|
| szerokie | nie | `Wyslij zwierze` | aktywny |
| szerokie | tak | `Zwierze w drodze...` | nieaktywny |
| waskie | nie | `Zwierze` | aktywny |
| waskie | tak | `W drodze...` | nieaktywny |

Dodatkowo:

- waski spoczynek: tooltip i nazwa dostepnosci `Wyslij zwierze`;
- oba stany lotu: `Zwierze w drodze...`;
- jedna kontrolka po ponownym otwarciu i aktywacji;
- brak zmiany kolejnosci natywnych kontrolek;
- zmiana szerokosci podczas lotu zachowuje lot;
- koniec lotu przywraca wlasciwy tekst spoczynku.

### Etap 5 — jednolity model kolizji alias/grupa

**Zakres:** rozdzial 7 raportu, czesc T11, warunkowo T22.

**Pliki:**

- `src/arkmail/core/addressBook.ts`
- `src/arkmail/index.ts`
- `src/arkmail/ui/store.ts`
- `src/arkmail/ui/render.ts`
- `tests/addressBook.test.ts`
- `tests/groupsView.test.ts`
- `tests/bookView.test.ts`
- nowe testy czystej logiki kolizji
- `tests/composeValidation.test.ts` dla T22

**Najpierw RED:**

- blokada utworzenia i zmiany nazwy na istniejacy alias, takze z inna wielkoscia liter i spacjami;
- grupa utworzona przed pierwszym importem jest dozwolona;
- pozny import zachowuje alias, grupe i czlonkow;
- wszystkie konflikty sa wykrywane jednoczesnie;
- bledny import nie zmienia poprzedniego lustra ani konfliktow;
- kompletny import bez aliasu usuwa konflikt;
- identyczny import nie generuje nowego ostrzezenia;
- zmiana nazwy przywraca grupe bez zmiany czlonkow;
- eksport nadal zawiera kolidujace grupy i nie zawiera flagi konfliktu;
- rozna kolejnosc aktualizacji aliasow i zapisu grup daje ten sam wynik;
- konflikt nie modyfikuje pol adresatow ani szkicow.

**GREEN:**

- czysta funkcja wyliczajaca konflikty z aktualnych danych;
- brak osobno zapisywanej flagi;
- jedna walidacja nazw uzywana przy tworzeniu, zmianie nazwy i imporcie;
- atomowa wymiana lustra dopiero po udanym kompletnym imporcie;
- trwale ostrzezenie przy kazdej kolidujacej grupie;
- podsumowanie nowych konfliktow bez powielania komunikatow przy identycznym imporcie;
- alias pozostaje kandydatem serwerowym, grupa kolidujaca jest pomijana w podpowiedziach.

**T22:**

- wykonac kontrolowana probe serwera dla `A B`;
- jesli serwer traktuje to jako jedno poprawne imie, zachowac walidacje i opisac regule;
- jesli nie, odrzucac spacje wewnatrz segmentu i kierowac uzytkownika do przecinkow;
- dopiero wtedy dostosowac S16;
- nie zmieniac walidacji na podstawie samego wygladu regexu.

### Etap 6 — import pliku bez wyscigow i z potwierdzeniem skutku

**Zakres:** T14, T15, potwierdzenie `zastap`, importowe czesci S5, S7–S9 i S13.

**Pliki:**

- `src/arkmail/ui/render.ts`
- `src/arkmail/index.ts`
- `src/arkmail/core/addressBook.ts`
- `tests/addressBook.test.ts`
- `tests/bookView.test.ts`
- `tests/uiRender.test.ts`
- nowe testy kontrolera importu pliku

**RED:**

- dwa odczyty zakonczone w odwrotnej kolejnosci stosuja wylacznie ostatni wybor;
- tryb jest zapisany przy wyborze pliku i nie zmienia sie w trakcie odczytu;
- nowy wybor uniewaznia poprzednie potwierdzenie;
- bledny odczyt nie zmienia Ksiazki;
- pole pliku jest resetowane po sukcesie i bledzie;
- ten sam plik mozna ponownie wybrac;
- `zastap` nie wykonuje mutacji przed potwierdzeniem;
- anulowanie pozostawia dane bez zmian;
- `zastap` zachowuje aliasy;
- podsumowanie rozroznia grupy z pliku, grupy dodane, scalone i imiona w Ksiazce.

**GREEN:**

- monotoniczny identyfikator ostatniego wyboru;
- snapshot pliku i trybu na starcie;
- pomijanie nieaktualnych wynikow;
- reset `input.value` w `finally`;
- dla `zastap` osobny etap potwierdzenia z nazwa pliku oraz liczba imion i grup;
- jednoznaczny przycisk destrukcyjny i `Anuluj`;
- zadnego uzbrajania przed poznaniem konkretnego pliku;
- wynik importu zawiera deterministyczne statystyki potrzebne do S5;
- wszystkie konflikty z aktualnymi aliasami sa wymienione.

### Etap 7 — podpowiedzi adresatow

**Zakres:** T11, T20 i pozostale reguly rozdzialu 7.6.

**Pliki:**

- `src/arkmail/ui/ghost.ts`
- `src/arkmail/ui/render.ts`
- `tests/ghost.test.ts`
- `tests/ghostSegment.test.ts`
- `tests/ghostMemberAdd.test.ts`
- testy kolizji z etapu 5

**RED:**

- dokladna `gildia` wygrywa z wczesniejsza `gildia-rada`;
- przy kolizji istnieje jeden kandydat: alias, nie dwie identyczne podpowiedzi;
- niekolidujaca grupa rozwija sie do czlonkow;
- alias pozostaje nazwa serwerowa;
- pusta grupa nie jest kandydatem;
- wielkosc liter i `trim()` nie zmieniaja priorytetu;
- dlugi segment i `scrollLeft > 0` zachowuja wyrownanie sufiksu;
- akceptacja nie zmienia innych segmentow ani zapisanych szkicow.

**GREEN:**

- osobna sciezka dokladnego dopasowania przed kandydatami prefiksu;
- nie polegac wylacznie na sortowaniu `.find()`, poniewaz obecny warunek dlugosci odrzuca dokladna nazwe;
- stabilna kolejnosc prefiksow;
- filtrowanie kolidujacych grup przy budowaniu zrodla;
- synchronizacja poziomego przewiniecia warstwy podpowiedzi przy wpisywaniu, przewinieciu i repaintach;
- zachowanie obslugi wielu segmentow i kursora na koncu.

**LIVE:** rzeczywisty layout dlugiej listy odbiorcow, nie tylko `happy-dom`.

### Etap 8 — wspolne mechanizmy UI i dostepnosc

**Zakres:** T3, T6, T12, T13, T23 oraz wspolne potwierdzenia z macierzy przyciskow.

**Pliki:**

- `src/arkmail/ui/render.ts`
- `src/arkmail/ui/styles.ts`
- `tests/uiRender.test.ts`
- `tests/nativeUi.test.ts`
- `tests/nativeButtons.test.ts`
- `tests/keyboardAccess.test.ts`
- `tests/armedGuard.test.ts`
- `tests/composeUx.test.ts`
- `tests/dateFilters.test.ts`
- `tests/deletionRender.test.ts`

**T3 — fokus:**

- RED dla nazw z `"`, `\`, `[`, `]` i innymi znakami specjalnymi;
- nie interpolowac surowej nazwy do selektora;
- wyszukiwac element po atrybucie i porownywac jego wartosc bez budowania selektora z danych uzytkownika;
- zachowac fokus, karetke, wartosci pol, checkboxy i scroll.

**T6 — klasy pol:**

- select Usuwania i `Tresc` zachowuja `popup-input popup-input--control`;
- klasy `arkmail-*` sa dodatkami;
- testy jasnego i ciemnego motywu w LIVE.

**T12 — Enter:**

- wspolny helper uruchamiajacy glowna akcje formularza;
- tworzenie grupy, zmiana nazwy, dodanie czlonka, przekazanie i filtry Usuwania;
- dokladnie ta sama walidacja co klik;
- `textarea` zachowuje nowa linie;
- Enter nie wysyla listu;
- jedno nacisniecie powoduje jedna operacje.

**T13 — dostepnosc:**

- powiazane `label`/`for` i identyfikatory pol compose;
- `tablist`, `tab`, `aria-selected`, `aria-controls`, panele i wlasciwy `tabindex`;
- obsluga strzalek, Home i End bez zrywania fokusu przy repaintach;
- `role="status"` i `aria-live` dla statusu;
- `progressbar` z aktualnym zakresem i wartoscia;
- tekstowe ogloszenie uzbrojenia ikonowego przycisku;
- zachowac poprawne klikalne wiersze z Enter i Spacja.

**T23 — szerokosc:**

- walidowac caly zapis, nie `parseInt`;
- `60abc`, pusta wartosc, ulamki i wartosci poza zakresem nie moga zostac po cichu obciete;
- bledna wartosc nie zmienia zapisanej szerokosci i pokazuje komunikat;
- poprawna wartosc przechodzi istniejace ograniczenia zakresu.

**Wspolne potwierdzenia:**

- rozdzielic mechanike od stylu danger;
- wariant destrukcyjny: danger ghost → pelne danger;
- wariant dlugiej operacji: neutralny w obu krokach;
- ESC anuluje, repaint nie wykonuje odroczonej akcji;
- drugi klik wykonuje operacje dokladnie raz.

### Etap 9 — filtry, przyciski i uklady widokow

**Zakres:** obserwacje 4.1–4.8 i 4.11, S24–S27, S33, S37–S43.

**Pliki:**

- `src/arkmail/ui/render.ts`
- `src/arkmail/ui/styles.ts`
- `src/arkmail/ui/store.ts`
- `tests/uiStyles.test.ts`
- `tests/nativeButtons.test.ts`
- `tests/buttonTiers.test.ts`
- `tests/buttonTitles.test.ts`
- `tests/contactsDrafts.test.ts`
- `tests/groupsView.test.ts`
- `tests/bookView.test.ts`

**Wspolne czyszczenie Archiwum i Osob z listow:**

- jedna funkcja wywolywana z dwoch miejsc;
- czysci `osoba`, `temat`, `tresc`, `odDaty`, `doDaty`, `skrzynka`, filtr osob;
- przywraca `Nazwa A-Z`;
- nie przelacza podzakladki;
- przycisk aktywny, gdy ktorakolwiek objeta wartosc rozni sie od domyslnej;
- powtorne klikniecie w stanie domyslnym jest no-op;
- identyczny tooltip w obu miejscach.

**Macierz przyciskow:**

- wszystkie czyszczenia filtrow/wynikow: danger ghost, jeden klik;
- usuwanie danych: danger ghost i dwa kroki;
- dlugie pobieranie: neutralne dwa kroki;
- `Zaznacz wszystkie` i `Odznacz wszystkie`: zwykle kontrolki;
- `Odebrane`, `Wyslane`, `Do ksiazki`: natywna baza plus klasy ArkMaila;
- wyniki List: zachowac obecny danger ghost, zmienic tylko etykiete na `Wyczysc wyniki i filtry`;
- compose: `Wyczysc pola listu`;
- nie zmieniac koloru wynikow List bez nowego dowodu z LIVE.

**Uklady:**

- usunac sztywne `240px` listy osob;
- kolumna na dostepna wysokosc;
- kontrolki `flex: none`;
- lista `flex: 1`, `min-height: 0`, `overflow-y: auto`;
- jedna dolna strefa operacji destrukcyjnych dla Grup, Aliasow i calej Ksiazki;
- bez dodatkowego przewijanego kontenera tylko dla pozycjonowania;
- przeniesc import aliasow do `Aliasy pocztowe`;
- sekcja `Import i eksport` zachowuje pozostale importy i eksporty;
- teksty S24–S27, S33, S37–S43 zgodnie z raportem.

**LIVE:** kilka i setki osob, krotkie i dlugie listy, jasny/ciemny motyw, szerokie i waskie okno.

### Etap 10 — archiwum, pobieranie i wyniki czesciowe

**Zakres:** T19, T24, S28–S36 i S46.

**Pliki:**

- `src/arkmail/ui/download.ts`
- `src/arkmail/index.ts`
- `src/arkmail/ui/render.ts`
- `src/arkmail/adapters/notify.ts`
- `tests/archiveDownload.test.ts`
- `tests/downloadProgress.test.ts`
- `tests/exportRecords.test.ts`
- `tests/exportTxt.test.ts`

**RED:**

- wynik z `failed > 0` albo `missing > 0` ma poziom `warning`, nie `success`;
- pelny sukces pozostaje `success`;
- podsumowanie zawiera tylko niezerowe czesci bledow;
- puste lokalne archiwum nie jest opisywane jako puste skrzynki serwera;
- rekordy bez prawidlowej daty sa wyraznie oddzielone od kandydatow;
- liczby `0, 1, 2, 4, 5, 21, 22, 25` daja poprawne komunikaty;
- `URL.revokeObjectURL()` nie jest wykonywane synchronicznie po `click()`;
- sprzatanie nastepuje jeden raz takze przy wielu pobraniach.

**GREEN:**

- wspolny budowniczy podsumowan pobierania i eksportu;
- poziom powiadomienia zalezny od rzeczywistego wyniku;
- opoznione jednorazowe uniewaznienie URL z kontrolowanym timerem;
- `true` oznacza rozpoczecie pobierania, nie gwarantowany zapis na dysku;
- teksty S28–S36 i S46 dokladnie wedlug raportu;
- zachowac rozroznienie `recordId` i `contentKeyOf` oraz blizniacze listy.

**LIVE:** rzeczywiste pobranie JSON, TXT i ZIP w docelowym kliencie oraz sprawdzenie zawartosci plikow.

### Etap 11 — pozostale komunikaty i dokumentacja zachowania

**Zakres:** S1–S23, S44, T25 oraz wszystkie teksty nieobjete wczesniejszymi etapami.

**Pliki:**

- `src/arkmail/ui/render.ts`
- `src/arkmail/index.ts`
- `src/arkmail/core/composeValidation.ts`
- `src/arkmail/core/protocol/commands.ts`
- `src/arkmail/core/session/editor.ts`
- odpowiadajace im testy tekstow, walidacji i powiadomien

**Zasady:**

- przeniesc teksty z tabel S1–S46 bez zgadywania nowych przyczyn bledow;
- timeout wysylki i przekazania nie wspomina adresata;
- `brak-adresata` pozostaje osobnym, rozpoznanym przypadkiem;
- fallback dotyczy nieznanego bledu, nie konkretnej przyczyny;
- zero nowych osob: `info`, nie `success`;
- aliasy zawsze opisywane jako lokalne lustro;
- „Osoby z listow” nie sa nazywane ogolnie „kontaktami”;
- dynamiczne liczby uzywaja konstrukcji `Liczba ...: N`;
- S14: zachowac obecny jednoznaczny toast czyszczenia Ksiazki;
- S22: zachowac `Zapisz w niewyslanych`;
- T25: komentarz importu opisuje dopisywanie, nie zastepowanie;
- teksty i komentarze zrodlowe pozostaja w ASCII.

**Rozjazd toastu czyszczenia Ksiazki:**

Nie zmieniac obecnego zdania na podstawie samej obserwacji. W LIVE zebrac:

- dokladna tresc komunikatu;
- wersje pluginu;
- klikniety przycisk;
- czy kolejny toast nie zastapil pierwszego.

Jezeli test potwierdzi obecny tekst, zamknac obserwacje bez zmiany kodu.

### Etap 12 — pelna weryfikacja i zamkniecie

1. Pelny `npm test` w jednym przebiegu.
2. `npm run typecheck`.
3. `npm run bundle`.
4. `npm run build`.
5. Porownanie wygenerowanego pakietu z oczekiwanym zakresem zmian.
6. Pelna macierz LIVE.
7. Przeglad wszystkich T/S/obserwacji pod katem dowodu zamkniecia.
8. Kontrola braku danych wrazliwych i niedozwolonych tresci.
9. Dopiero po osobnej zgodzie: commit i push zmian kodu.
10. Release dopiero po osobnej, jednorazowej zgodzie.
11. Po zakonczeniu wszystkich prac usunac ten plan oraz `docs/AUDYT_UI_ROBOCZY.md`.
12. Jesli ktoras pozycje swiadomie odrzucono, najpierw zapisac decyzje i powod w trwalej dokumentacji.

## 5. Macierz pokrycia

| Pozycje | Etap |
|---|---:|
| T1 | 1 |
| T2, T7, T21 | 2 |
| T4, T5, T9, T10, T16, T17 | 3 |
| T8, T18 | 4 |
| T22 | 5 |
| T14, T15 | 6 |
| T11, T20 | 5 i 7 |
| T3, T6, T12, T13, T23 | 8 |
| T19, T24 | 10 |
| T25 | 11 |
| Obserwacje 4.1–4.8, 4.11 | 9 |
| Obserwacja 4.9 | 4 |
| Obserwacja 4.10 | 11 |
| Obserwacja 4.12 | 11 + LIVE |
| S1–S15 | 5, 6, 9 i 11 |
| S16–S23 | 5, 8 i 11 |
| S24–S27 | 9 |
| S28–S36 | 10 |
| S37–S43 | 9 |
| S44–S45 | 4 i 11 |
| S46 | 10 |
| Kolizje alias/grupa | 2, 5, 6 i 7 |
| Cztery stany zwierzecia | 4 |
| Mocne mechanizmy i regresje | wszystkie etapy + 12 |

## 6. Mechanizmy objete szczegolna ochrona

Zaden etap nie moze oslabic:

- re-kotwiczenia operacji pagerowych;
- swiezego listingu i dopasowania zaznaczenia przy usuwaniu zbiorczym;
- odrebnosci blizniaczych listow oraz `recordId`/`contentKeyOf`;
- draftow, fokusu, karetki, checkboxow i scrolla;
- walidacji compose i filtrow;
- wlacznych dat UI i wylacznych granic serwera;
- lockow, generacji polaczenia i anulowania;
- potwierdzen destrukcyjnych;
- wycofania zaznaczenia przy niepewnym usuwaniu;
- ochrony przed zabiciem recznej sesji poczty gracza.

## 7. Wymagane dowody LIVE przed zamknieciem planu

- jasny i ciemny motyw pol oraz przyciskow;
- przewijanie Osob z listow;
- dlugie pola i poziomo przewiniete podpowiedzi;
- wszystkie cztery stany naglowka zwierzecia;
- brak duplikatow naglowka po reconnectach i zmianach postaci;
- reconnect z otwartym pagerem, przekazaniem i edytorem;
- rzeczywiste odrzucenie IndexedDB i `api.command.send()`;
- pobieranie JSON, TXT i ZIP;
- zachowanie serwera dla `A B`;
- dokladny toast czyszczenia Ksiazki i wersja pluginu;
- kolor wynikow List w uzywanym motywie;
- aliasy na serwerze tylko wtedy, gdy zakres mialby wyjsc poza uzgodnione porownanie `trim()` + wielkosc liter.

## 8. Warunek usuniecia dokumentow roboczych

Plan i raport mozna usunac dopiero po spelnieniu wszystkich warunkow:

1. Zakonczono caly uzgodniony zakres albo zapisano trwale decyzje o swiadomym odrzuceniu poszczegolnych pozycji.
2. Wszystkie zmiany maja lokalny dowod RED→GREEN i pelny zielony zestaw.
3. Zakonczono wymagane weryfikacje LIVE.
4. Nie pozostaja otwarte rozjazdy miedzy kodem, raportem i zachowaniem klienta.
5. Ostateczny HEAD i wyniki testow zostaly zweryfikowane.

Sam fakt wykonania czesci implementacji, zielone CI albo przygotowanie release nie jest podstawa do usuniecia dokumentow.
