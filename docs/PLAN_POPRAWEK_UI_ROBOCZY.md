# ArkMail — roboczy plan napraw, poprawek i ulepszen

Dokument roboczy powiazany z `docs/AUDYT_UI_ROBOCZY.md`. Oba dokumenty nalezy zachowac do zakonczenia calego uzgodnionego zakresu i pelnej weryfikacji. Dopiero wtedy mozna je usunac z repozytorium. Implementacja planu wymaga osobnej jawnej zgody.

## 1. Podstawa i zakres

- Repozytorium: `Isithunzi000/arkadia-dargoth-arkmail`, galaz `main`.
- Punkt odniesienia analizy: `c171285d81ca5cfab1af9e55afafa1872803f92d`, ArkMail 1.30.2.
- Plan obejmuje wszystkie pozycje T1–T25, S1–S46, dwanascie obserwacji LIVE, kolizje alias/grupa, cztery stany przycisku zwierzecia oraz wymagane testy.
- Dokument nie jest zgoda na implementacje, commit zmian kodu, release ani publikacje.
- Teksty UI i komentarze w `src` pozostaja w ASCII bez polskich diakrytykow.

## 2. Decyzje zamykajace kwestie otwarte

### 2.1. Czlonkowie grup — T21, decyzja zatwierdzona

Uzytkownik zatwierdzil rekomendowany wariant wspolnej walidacji i dopisania nowego czlonka do Ksiazki.

- Reczne dodanie czlonka grupy uzywa tej samej walidacji imienia co dodanie osoby do Ksiazki.
- Poprawne, nieznane dotad imie zostaje jednoczesnie dopisane do Ksiazki i grupy.
- Operacja jest jedna aktualizacja modelu, bez stanu posredniego, w ktorym czlonek istnieje tylko w grupie.
- Duplikat bez wielkosci liter nie powoduje zmiany.
- Bledne imie nie zmienia ani Ksiazki, ani grupy.
- Nie powstaje trzecia semantyka „dowolny tekst wylacznie w grupie”.

Decyzja jest zgodna z istniejacym `withGroupMembers()`, ktore juz wymaga obecnosci wszystkich czlonkow grup w Ksiazce.

### 2.2. Duplikaty w imporcie `zastap` — T7, decyzja zatwierdzona

Uzytkownik zatwierdzil rekomendowane deterministyczne scalanie. Duplikaty nie sa odrzucane jako caly plik:

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

### 2.4. Reconnect, separatory i bledy adresatow — T16 i T22, dowody potwierdzone

- **T16:** rzeczywista proba pelnego ponownego zalogowania zakonczyla sie brakiem aktywnego pagera/edytora po powrocie do gry. Pisanie listu rozpoczeto poza pluginem, polaczenie zostalo przerwane, a po ponownym zalogowaniu zdalny dialog nie byl juz aktywny. Nie dodawac automatycznie `q` ani `~q`; zachowac obecny lokalny cleanup, reject i istniejacy test zakazujacy dodatkowego `q`. Dla przetestowanej sciezki nie jest potrzebna poprawka zdalnego zamykania dialogu.
- **Granica T16:** ta proba rozstrzyga pelne ponowne zalogowanie, nie kazda techniczna odmiane `proxy.session resumed` ani kazdy dialog. Nie wolno przedstawiac jej jako dowodu tych innych przypadkow. Ewentualna zmiana zachowania dla nich wymagalaby osobnego dowodu. Playwright moze sprawdzic lokalne sprzatanie pluginu, ale nie zastapi dowodu o zdalnym stanie serwera.
- **T22, powtorzenie nadawcy:** nadawce wpisano dwukrotnie ze spacja. Lista niewyslanych pokazala jednego adresata, a w szczegolach listu pole `Do` bylo puste, a `DW` zawieralo nadawce. Jest to pojedyncza obserwacja, a nie dowod ogolnej deduplikacji serwera ani ogolnej reguly przenoszenia nadawcy do `DW`. Nie jest podstawa do zmiany surowej wartosci wpisanej przez uzytkownika.
- **T22, porownanie dwoch przypadkow:** nadawce i druga osobe podano w tej samej kolejnosci, raz ze spacja i raz z przecinkiem. W obu przypadkach lista niewyslanych przedstawila ten sam zestaw w kolejnosci `druga osoba, nadawca`, a szczegoly listu mialy identyczny podzial: druga osoba w `Do`, nadawca w `DW`. Kolejnosc wyswietlona przez serwer roznila sie od kolejnosci wpisu. Jest to obserwacja dla tej pary i tej roli nadawcy; nie jest podstawa do zmiany kolejnosci przez plugin. Podstawowa semantyka obu separatorow jest potwierdzona; kolejny log nie jest potrzebny do zaplanowania poprawki.
- **T22, jawne potwierdzenie czterech poprawnych adresatow:** uzytkownik wprost potwierdzil, ze czterech poprawnych adresatow mozna zapisac jako `A B C D`, `A, B, C, D` albo `A,B,C,D` i kazda z tych form jest poprawna. To niezalezne potwierdzenie uzupelnia wczesniejsze logi; nie jest wnioskiem z odrzuconych prob, ktore zawieraly jedna nieznana osobe.
- **T22, odrzucenie nieznanej osoby:** cztery kolejne proby zawieraly trzy wpisy: dwie osoby rozpoznane przez serwer i jedna nieznana. Nieznana osoba wystapila na poczatku albo w srodku listy, a wpisy rozdzielono samymi spacjami, przecinkami ze spacjami albo przecinkami bez spacji. Kazda proba zostala przerwana przed etapem tematu, komunikat wskazal wylacznie nieznana osobe, a znane osoby nie zostaly zgloszone jako bledne. Nastapil powrot do zwyklego promptu i nie zapisano listu. Nowe `napisz list` mozna bylo wykonac od razu, bez dodatkowego `~q` po bledzie.
- **T22, poprawne pary i anulowanie:** trzy poprawne pary rozdzielone odpowiednio przecinkiem bez spacji, przecinkiem ze spacja i spacja przeszly do etapu tematu. Wszystkie trzy proby anulowano przez `~q`, a serwer odpowiedzial `Zaniechane.`. Wczesniejsze logi nie zawieraly dla nich koncowego listingu, kolejnosci ani podzialu `Do`/`DW`. Pozniejsze jawne potwierdzenie rozstrzyga poprawnosc wszystkich trzech form dla czterech poprawnych adresatow, ale nie dodaje osobnego dowodu o tych szczegolach listingu.
- **Zakres T22:** `splitRecipients()` i `unknownRecipients()` maja sprawdzac kazda osobe oddzielnie, a ghost ma segmentowac po ostatnim przecinku albo spacji. Surowa wartosc recznie wpisanych pol `Do` i `DW` trafia do edytora bez przepisywania, normalizacji separatorow, deduplikacji ani zmiany kolejnosci. Nie wolno zmieniac podzialu miedzy `Do` i `DW` na podstawie wlasnych zalozen ani nasladowac przeksztalcen, ktore Arkadia wykonuje samodzielnie. Ostrzezenia moga byc deduplikowane lokalnie bez deduplikowania danych wysylanych do serwera. Jedynym dozwolonym przeksztalceniem listy jest rozwiniecie grupy nalezacej do pluginu do jej czlonkow w kanonicznym formacie `A, B, C, D`; alias pozostaje nazwa serwerowa. Z `index.ts` nalezy usunac `trim()` dla niepustych wartosci przekazywanych do `editor.send()`, poniewaz obecne przycinanie zewnetrznych spacji rowniez jest przeksztalceniem recznego wpisu. Pusty albo zlozony wylacznie ze spacji `DW` pozostaje nieobecny na podstawie walidacji pola opcjonalnego; nie jest lista adresatow. Wolny spojnik `i` pozostaje odrzucany.
- **Zakres obslugi bledu i anulowania:** obecny `parseMailError()` rozpoznaje `brak-adresata`, `EditorSession` konczy wtedy operacje i nie kontynuuje kolejnych etapow, a `Zaniechane.` daje wynik `zaniechany`. Dla bledu na poczatkowym etapie `Adresat` oznacza to brak tematu, tresci, `**` i dodatkowego `~q`; przy pozniejszym bledzie nie wolno cofac komend juz poprawnie wyslanych przed bledem. Nie ma podstaw do zmiany tych regul. Po bledzie i anulowaniu formularz pozostaje do poprawy, cleanup musi umozliwic natychmiastowe ponowienie, a konkretny blad adresata ma trafic do wlasciwego toastu. Advisory guard pozostaje nieblokujacy: lokalna baza nie jest kompletnym zrodlem prawdy o graczach i aliasach, a ostateczna walidacja nalezy do serwera.
- **Granica T22:** cztery odrzucone proby z trzema wpisami i jednym blednym same nie byly dowodem przyjecia trzech poprawnych adresatow, ale pozniejsze jawne potwierdzenie uzytkownika rozstrzyga cztery poprawne adresaty we wszystkich trzech formach. Nie uogolniamy go bez osobnego dowodu na wiecej niz czterech poprawnych adresatow. Nie sprawdzono nieznanej osoby na koncu listy, kilku nieznanych osob, duplikatow nieznanych ani wszystkich mieszanych separatorow. Logow nie uogolniamy rowniez na wszystkie kombinacje duplikatow, w tym duplikaty osoby innej niz nadawca, pary bez nadawcy, odwrotna kolejnosc wejscia ani ogolne zasady kolejnosci i podzialu pol `Do` i `DW`. Takie rozszerzenie zakresu wymagaloby osobnych prob serwera. Lokalny parser i obsluge bledow mozna testowac dla wiekszej liczby osob i dodatkowych pozycji, ale nie wolno przedstawiac tych testow jako dodatkowego dowodu zachowania serwera.

### 2.5. Zamkniecie decyzji produktowych

Nie pozostaja decyzje produktowe blokujace implementacje. Podstawowe T16 i T22 nie wymagaja kolejnych logow. Pozostaja dowody wykonawcze: jeden pelny zielony przebieg wyjsciowy, rzeczywisty wyglad po zmianach, zgodnosc z przypietym SHA Dargotha, zachowanie przy wymuszonych awariach, wyjasnienie wczesniejszych rozjazdow toastu i koloru oraz pelna macierz przegladarkowa po implementacji.

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

Testy nalezy rozdzielac na dwie kategorie:

- **wykrywajace poprawke:** nowa asercja najpierw pada lokalnie na starym kodzie, a po minimalnej implementacji przechodzi;
- **ochronne juz poprawnego zachowania:** maja byc zielone przed i po zmianie. Nie wolno wymagac dla nich RED, psuc kodu w celu ich zalamania ani przedstawiac ich jako dowodu nowej poprawki.

W zestawie sparametryzowanym RED musi wykazac co najmniej wariant odpowiadajacy nowej poprawce. Wariant juz obslugiwany moze pozostac zielony i sluzyc jako kontrola regresji.

Dla scenariuszy przegladarkowych obowiazuje ten sam lokalny dowod RED→GREEN:

1. Nowa asercja majaca wykryc poprawke najpierw pada na bundle zbudowanym ze starego kodu; zapisac nazwe scenariusza i niespelniona asercje. Asercje ochronne maja byc zielone przed i po zmianie.
2. Testowany artefakt powstaje z biezacego `npm run bundle`. Testowa paczka ZIP zawiera wynik z `build/arkmail`, nie stary release.
3. `scripts/build.js` i katalog `releases/` nie moga byc zrodlem kodu pluginu dla testow nowych zmian, poniewaz build release'owy wybiera wczesniej zapisane paczki.
4. Po poprawce ponownie zbudowac biezacy bundle i uruchomic scenariusz docelowy, sasiedni oraz pelna wymagana macierz.
5. Mock WebSocket dowodzi zachowania pluginu w prawdziwym kliencie, ale nie dowodzi semantyki prawdziwego serwera Arkadii.

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

**Zakres:** T4, T5, T9, T10, T16 i T17.

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

**T16 — potwierdzony przypadek i zakres ochronny:**

1. Rzeczywista proba pelnego ponownego zalogowania wykazala, ze zdalny pager/edytor nie byl juz aktywny po powrocie do gry.
2. Nie zmieniac protokolu dla tego przypadku. Zachowac obecny lokalny cleanup, brak `q` i `~q` oraz `tests/reconnectCancel.test.ts` z asercja, ze reconnect nie wysyla smieciowego `q`.
3. Test Playwright z mockiem ma sprawdzac lokalne odrzucenie operacji, czyszczenie listenerow, brak komendy `q` i poprawny stan nowej generacji polaczenia. Nie moze byc opisywany jako dowod zdalnego zamkniecia dialogu przez serwer.
4. Nie dodawac automatycznego `q`, poniewaz moze trafic do nowego kontekstu albo przerwac reczna sesje gracza.
5. Pelny relog nie jest osobnym dowodem kazdej odmiany `proxy.session resumed`. Jesli przyszla zmiana mialaby zalezec od innej odmiany wznowienia, najpierw potrzebna jest osobna proba serwera; obecny plan jej nie wymaga.

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

**Zakres:** rozdzial 7 raportu, czesc T11 oraz model adresatow z T22.

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

**T22 — RED:**

- sparametryzowane testy `splitRecipients()` dla przecinka i spacji: `A B C D`, `A, B, C, D`, `A,B,C,D`, krotsze listy, wielokrotne spacje i przecinki oraz wartosci puste;
- kazda z trzech jawnie potwierdzonych form czterech adresatow daje liste `A`, `B`, `C`, `D`; `A B` daje dwie osoby, a `A, B` daje identyczna liste; mieszane separatory sa rozbijane deterministycznie na potrzeby lokalnych ostrzezen;
- listy trzyelementowe z dwiema znanymi i jedna nieznana osoba sa rozbijane na trzy osoby dla kazdego separatora; nieznana osoba jest sprawdzana lokalnie na poczatku, w srodku i na koncu, przy czym przypadek koncowy jest wylacznie testem parsera, nie dowodem serwera;
- `unknownRecipients()` sprawdza kazda osobe oddzielnie, nie zglasza dwoch znanych osob rozdzielonych spacja jako jednego nieznanego adresata i nie pokazuje ostrzezenia dla czterech znanych osob w zadnej z trzech potwierdzonych form;
- przypadek mieszany, w ktorym wystepuja znane osoby i rzeczywiscie nieznana osoba, wskazuje w ostrzezeniu wylacznie te nieznana osobe, niezaleznie od jej pozycji;
- testy rozbijania i ostrzezen sa sparametryzowane jednakowo dla pol `adresat` i `DW` oraz dla wszystkich trzech form separatorow; RED jest wymagany dla wariantow wykrywajacych poprawke, a nie dla juz dzialajacych wariantow przecinkowych;
- komunikat S16 oraz analogiczny komunikat dla `DW` opisuja oba separatory i zakaz wolnego spojnika `i`; test tresci pada na starym komunikacie;
- nowy test handlera przekazuje do `editor.send()` niepuste `adresat` i `DW` z zewnetrznymi spacjami bajtowo identycznie jak w formularzu; obecne `input.adresat.trim()` i `input.dw.trim()` maja wykazac RED. Pusty albo zlozony wylacznie ze spacji `DW` pozostaje nieobecny i jest osobna kontrola regresji;
- testy uzywaja wylacznie imion syntetycznych.

**T22 — testy ochronne (GREEN przed i po):**

- test transportu edytora dowodzi, ze surowe `input.adresat` i `input.dw` pozostaja bajtowo niezmienione, w tym dla `A B C D`, `A, B, C, D` i `A,B,C,D`;
- przed wyslaniem nie ma automatycznej deduplikacji, zmiany kolejnosci, zamiany spacji na przecinki, przepisania szkicu ani zmiany podzialu miedzy `Do` i `DW`;
- lokalne ostrzezenia moga byc deduplikowane, ale ta operacja nie zmienia danych wysylanych do serwera;
- wolny spojnik `i` nadal jest odrzucany;
- jedynym dozwolonym przeksztalceniem jest rozwiniecie grupy pluginu do czlonkow w formacie `A, B, C, D`; alias pozostaje nazwa serwerowa, a reczny wpis nie jest normalizowany. Plugin nie nasladuje zadnych przeksztalcen wykonywanych samodzielnie przez Arkadie;
- sparametryzowane odpowiedzi `brak-adresata` na poczatkowym etapie `Adresat`, dla nieznanej osoby na poczatku i w srodku trzyelementowej listy oraz dla spacji, przecinka ze spacja i przecinka bez spacji, zwracaja `blad` z dokladnie ta nieznana osoba; dodatkowy lokalny wariant z osoba na koncu nie jest przedstawiany jako dowod serwera;
- po takim bledzie transport zawiera wylacznie komendy wymagane do rozpoczecia compose i przekazania surowej listy adresatow: nie ma tematu, tresci, `**`, dodatkowego `~q` ani innych prob kontynuacji;
- blad adresata wykonuje cleanup, pokazuje konkretny toast, pozostawia formularz do poprawy i umozliwia natychmiastowe ponowienie compose bez timeoutu i bez ogolnego komunikatu bledu;
- sparametryzowane anulowanie poprawnych par przez `~q` dla trzech form separatorow konczy sie `Zaniechane.` i wynikiem `zaniechany`, bez timeoutu, ogolnego bledu, tematu po anulowaniu, tresci, `**` i dodatkowych komend; formularz pozostaje, a cleanup umozliwia ponowienie;
- powyzsze testy obslugi bledu i anulowania maja pozostac zielone przed i po poprawce parsera list. Jezeli nowa asercja padnie na starym kodzie, nalezy ja sklasyfikowac jako wykryta usterke i objac minimalna poprawka, zamiast sztucznie wymuszac GREEN.

**T22 — GREEN:**

- rozbijanie lokalne po przecinkach i spacjach, z pominieciem pustych segmentow; wszystkie trzy formy `A B C D`, `A, B, C, D` i `A,B,C,D` daja cztery osoby;
- `unknownRecipients()` sprawdza kazda osobe oddzielnie, nie zglasza znanych osob i wskazuje wylacznie rzeczywiscie nieznane;
- walidacja pozostaje w potwierdzonym zakresie liter, przecinkow i spacji; nie ma blednego zaostrzenia do samych przecinkow;
- komunikat S16 opisuje oba separatory;
- rozwiniecie grupy pluginu uzywa formatu `A, B, C, D`, ale jest jedynym przeksztalceniem listy; reczny wpis nie jest normalizowany przed `transport.send()`, a przeksztalcen Arkadii plugin nie powtarza;
- `index.ts` przekazuje niepuste `adresat` i `DW` do `editor.send()` bez `trim()`, lacznie z zewnetrznymi spacjami; pusty albo zlozony wylacznie ze spacji `DW` pozostaje nieobecny;
- `brak-adresata` i `Zaniechane.` zachowuja obecna obsluge bez dodatkowego `~q`, z poprawnym cleanup, tostem lub wynikiem oraz mozliwoscia ponowienia;
- advisory guard nadal tylko ostrzega i nie blokuje wysylki;
- komentarze w `composeValidation.ts`, `ghost.ts` i `render.ts` przestaja twierdzic, ze serwer rozdziela adresatow wylacznie przecinkami.

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

**Zakres:** T11, T20, segmentacja ghostow z T22 i pozostale reguly rozdzialu 7.6.

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
- pusta grupa nie jest kandydatem;
- wielkosc liter i `trim()` nie zmieniaja priorytetu;
- dlugi segment i `scrollLeft > 0` zachowuja wyrownanie sufiksu;
- akceptacja nie zmienia innych segmentow ani zapisanych szkicow;
- sparametryzowane przypadki po ostatnim przecinku i po ostatniej spacji zmieniaja wylacznie ostatni segment;
- `A B` oraz `A, B` pozwalaja podpowiedziec druga osobe bez zmiany pierwszej;
- pusty segment nie pokazuje podpowiedzi;
- scenariusze podpowiedzi i rozwijania grup sa sparametryzowane jednakowo dla pol `adresat` i `DW` oraz dla obu separatorow; RED jest wymagany dla nowej segmentacji po spacji, nie dla juz dzialajacych przypadkow ochronnych.

**Testy ochronne (GREEN przed i po):**

- niekolidujaca grupa rozwija sie do czlonkow;
- alias pozostaje nazwa serwerowa;
- po akceptacji grupy czlonkowie sa wstawiani w kanonicznym formacie przecinkowym, a wczesniejsi adresaci i szkice pozostaja bez zmian;
- nowe przypadki po spacji moga wykazac RED z powodu blednej segmentacji, ale sama semantyka grupy i aliasu na dotychczas obslugiwanym przecinku nie moze byc wymuszana jako RED.

**GREEN:**

- osobna sciezka dokladnego dopasowania przed kandydatami prefiksu;
- nie polegac wylacznie na sortowaniu `.find()`, poniewaz obecny warunek dlugosci odrzuca dokladna nazwe;
- stabilna kolejnosc prefiksow;
- filtrowanie kolidujacych grup przy budowaniu zrodla;
- synchronizacja poziomego przewiniecia warstwy podpowiedzi przy wpisywaniu, przewinieciu i repaintach;
- zachowanie obslugi wielu segmentow i kursora na koncu;
- granica biezacego segmentu jest wyznaczana po ostatnim przecinku albo spacji, a akceptacja podmienia tylko ten segment;
- surowa wartosc innych segmentow oraz wartosc pozniej wysylana do edytora nie sa automatycznie przepisywane.

**Playwright:** rzeczywisty layout dlugiej listy odbiorcow w prawdziwym Dargothcie, nie tylko `happy-dom`.

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
- testy jasnego i ciemnego motywu w Playwright na prawdziwym Dargothcie.

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

**Playwright:** kilka i setki osob, krotkie i dlugie listy, jasny/ciemny motyw, szerokie i waskie okno w prawdziwym Dargothcie.

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

**Playwright:** rzeczywiste pobranie JSON, TXT i ZIP w prawdziwym Dargothcie oraz sprawdzenie nazw i zawartosci pobranych plikow.

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
- S16: `Adresatow oddziel przecinkami lub spacjami, bez spojnika 'i'. Dozwolone: litery a-z i A-Z.` Analogicznie dla DW;
- `docs/PROTOCOL.md` opisuje przecinki i spacje jako potwierdzone separatory oraz granice tego dowodu;
- komentarze w `composeValidation.ts`, `ghost.ts` i `render.ts` opisuja oba separatory i nie przypisuja serwerowi reguly samych przecinkow;
- teksty i komentarze zrodlowe pozostaja w ASCII.

**Rozjazd toastu czyszczenia Ksiazki:**

Nie zmieniac obecnego zdania na podstawie samej obserwacji. W Playwright na prawdziwym Dargothcie z biezacym bundle zebrac:

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
6. Pelna, izolowana macierz Playwright na prawdziwym Dargothcie z biezacym bundle i przypietym SHA klienta.
7. Pozostale proby prawdziwego serwera wylacznie dla pytan, ktorych nie rozstrzygaja dotychczasowe logi ani mock; podstawowe T16 i T22 nie wymagaja ponawiania.
8. Przeglad wszystkich T/S/obserwacji pod katem dowodu zamkniecia.
9. Kontrola braku danych wrazliwych i niedozwolonych tresci.
10. Dopiero po osobnej zgodzie: commit i push zmian kodu.
11. Release dopiero po osobnej, jednorazowej zgodzie.
12. Po zakonczeniu wszystkich prac usunac ten plan oraz `docs/AUDYT_UI_ROBOCZY.md`.
13. Jesli ktoras pozycje swiadomie odrzucono, najpierw zapisac decyzje i powod w trwalej dokumentacji.

## 5. Macierz pokrycia

| Pozycje | Etap |
|---|---:|
| T1 | 1 |
| T2, T7, T21 | 2 |
| T4, T5, T9, T10, T16, T17 | 3 |
| T8, T18 | 4 |
| T22 | 5, 7 i 11 |
| T14, T15 | 6 |
| T11, T20 | 5 i 7 |
| T3, T6, T12, T13, T23 | 8 |
| T19, T24 | 10 |
| T25 | 11 |
| Obserwacje 4.1–4.8, 4.11 | 9 |
| Obserwacja 4.9 | 4 |
| Obserwacja 4.10 | 11 |
| Obserwacja 4.12 | 11 + Playwright |
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
- ochrony przed zabiciem recznej sesji poczty gracza;
- surowej wartosci pol adresatow wysylanej do edytora, bez deduplikacji, zmiany kolejnosci i automatycznej zamiany separatorow.

## 7. Wymagane dowody z prawdziwego Dargotha i serwera

### 7.1. Istniejacy harness Playwright

Punktem wyjscia jest prywatne repozytorium `Isithunzi000/arkadia-dargoth-testy`. Sprawdzony podczas analizy HEAD to `433496ed8d66a530e5095dc0a15cd2a33fde4df4`; przed implementacja nalezy ponownie odczytac aktualny HEAD. W analizowanym drzewie bylo 952 pliki i nie bylo sciezki zawierajacej `mail`, wiec ArkMail wymaga nowej, izolowanej macierzy.

Istniejacy harness zapewnia:

- prawdziwy build i lokalny preview Dargotha bez logowania na serwer;
- mock WebSocket, wstrzykiwanie GMCP i tekstu oraz rejestrowanie i liczenie komend wychodzacych; mock WebSocket jest instalowany przed startem klienta;
- niezalezne konteksty przegladarki, uruchomienie pluginu, reload i odtwarzanie stanu z IndexedDB;
- instalacje pluginu z URL przez prawdziwy menedzer skryptow oraz import ZIP przez prawdziwy edytor pluginow;
- pomiar DOM i geometrii okien, screenshoty, kontrole bledow strony i konsoli oraz testy szerokiego i waskiego okna.

Nie kopiowac calego harnessa. Nalezy ponownie uzyc wspolnych mockow i wzorca instalacji, a ArkMailowi dostarczyc tylko specyficzne odpowiedzi: listingi, tresci listow, pager, edytor, importy osob, aliasy, wyszukiwanie, usuwanie, `GMCP mail.state`, bledy, timeouty i reconnect.

Macierz ArkMaila ma miec wlasna konfiguracje Playwright, skrypt uruchamiajacy, nieuzywany port, scenariusze, odpowiedzi poczty, artefakty i osobny job CI. Nie wolno zmieniac ani uzalezniac jej od macierzy innych pluginow. Instalacja z URL moze byc dodatkowa sciezka diagnostyczna, ale nie zastepuje koncowej proby importu paczki ZIP przygotowanej z biezacego bundle przez prawdziwy edytor pluginow.

### 7.2. Deterministyczny artefakt i klient

1. Na starcie przebiegu pobrac i zapisac pelny SHA Dargotha w artefaktach.
2. Ten sam SHA obowiazuje dla instalacji zaleznosci, builda, preview i wszystkich scenariuszy do konca macierzy; nie pobierac „najnowszego” klienta ponownie w trakcie.
3. ArkMail pochodzi z biezacego `npm run bundle`. Testowa paczka ZIP powstaje z `build/arkmail` i jest instalowana przez prawdziwy menedzer pluginow.
4. Nie uzywac `scripts/build.js` ani ZIP-ow z `releases/` jako zrodla kodu nowych zmian.
5. Kazdy scenariusz uzywa osobnego kontekstu przegladarki albo kontrolowanego resetu. Reload i odtworzenie IndexedDB sa testowane jawnie.
6. Glowny dowod stanowia asercje DOM, stanu, komend, bledow i pobranych plikow. Screenshoty i trace sa materialem pomocniczym.

### 7.3. Scenariusze automatyczne w prawdziwym Dargothcie

**Dane i protokol:**

- pusta i zapelniona skrzynka;
- blizniacze listy oraz zachowanie odrebnosci `recordId` i `contentKeyOf`;
- stronicowanie i wyszukiwanie;
- reconnect, identyczna pierwsza ramka GMCP, lokalne sprzatanie, brak `q`, czyszczenie listenerow i izolacja generacji;
- bledy, timeouty i anulowanie;
- adresaci rozdzieleni spacja oraz przecinkiem;
- grupy i aliasy, w tym wszystkie konflikty;
- importy i powtarzane operacje.

**Compose dla obu separatorow:**

- sparametryzowane scenariusze dla pol `adresat` i `DW`: wpisanie adresatow, rozbicie lokalne, brak ostrzezenia dla znanych osob i wskazanie wylacznie rzeczywiscie nieznanej osoby;
- wpisanie czterech znanych adresatow w formach `A B C D`, `A, B, C, D` i `A,B,C,D` daje cztery lokalne segmenty, brak ostrzezenia i identyczna surowa komende jak wpisana;
- nowa asercja dla niepustych pol z zewnetrznymi spacjami sprawdza bajtowo identyczna komende i najpierw pada na starym bundle z `trim()`; pusty albo zlozony wylacznie ze spacji `DW` pozostaje nieobecny;
- listy trzyelementowe z dwiema znanymi i jedna nieznana osoba obejmuja lokalnie pozycje poczatkowa, srodkowa i koncowa oraz spacje, przecinki ze spacjami i przecinki bez spacji; pozycja koncowa i kombinacje nieobecne w logu sa wylacznie syntetycznymi testami pluginu;
- podpowiedz uzupelnia tylko ostatni segment, grupa pluginu rozwija sie do czlonkow w formacie `A, B, C, D` jako jedyne przeksztalcenie listy, alias pozostaje nazwa serwerowa, a wczesniejsi adresaci pozostaja bez zmian;
- kontrola surowych komend wychodzacych potwierdza brak normalizacji separatorow, deduplikacji, zmiany kolejnosci i zmiany podzialu miedzy `Do` i `DW`;
- syntetyczny `brak-adresata` na poczatkowym etapie `Adresat` ma sparametryzowane przypadki nieznanej osoby na poczatku i w srodku dla wszystkich form separatorow; asercje obejmuja konkretny toast, wynik i cleanup, zachowanie formularza, brak tematu, tresci, `**`, dodatkowego `~q` i mozliwosc natychmiastowego ponowienia;
- syntetyczne `Zaniechane.` po `~q` dla poprawnych par z trzema formami separatorow daje wynik `zaniechany`, bez timeoutu, ogolnego bledu, tresci i `**`, z zachowaniem formularza i mozliwoscia ponowienia;
- mock potwierdza obsluge wariantow przez plugin w rzeczywistym kliencie, a nie semantyke serwera. Zrodlem potwierdzenia czterech poprawnych adresatow jest jawna informacja uzytkownika, nie mock ani wczesniejsze odrzucone proby. Syntetyczne scenariusze weryfikuja zgodnosc pluginu z tym potwierdzeniem.

**UI i klawiatura:**

- wszystkie zakladki i podzakladki;
- fokus, karetka, checkboxy i scroll;
- Enter, ESC, strzalki, Home i End;
- jasny i ciemny motyw pol oraz przyciskow, takze natywne klasy pol i przyciskow;
- szerokie i waskie okno, krotkie i bardzo dlugie dane oraz rzeczywiste przewijanie;
- przewijanie Osob z listow, krotkie i dlugie listy;
- dlugie pola i poziomo przewiniete podpowiedzi po przecinku oraz spacji;
- dolne strefy destrukcyjne;
- wszystkie cztery stany naglowka zwierzecia i brak duplikatow naglowka po reload, reconnectach oraz zmianach postaci.

**Dane trwale i pliki:**

- zapis i odczyt po reload;
- wymuszony blad zapisu i ponowienie;
- brak wskrzeszenia usunietych rekordow;
- ponowny import tego samego pliku i wyscigi odczytow;
- potwierdzenie `zastap`;
- rzeczywiste pobranie JSON, TXT i ZIP wraz z kontrola nazw i zawartosci plikow.

**Dodatkowe kontrole z audytu:**

- wstrzykniete odrzucenie IndexedDB i `api.command.send()`;
- dokladny toast czyszczenia Ksiazki, wersja pluginu i kliknieta kontrolka;
- kolor wynikow List w uzywanym motywie;
- bledy strony i konsoli po instalacji, dzialaniu, reloadu i ponownej aktywacji.

### 7.4. Granice mocka i pozostale proby serwera

- Mock WebSocket potwierdza zachowanie pluginu w prawdziwym kliencie, nie zachowanie Arkadii. Syntetyczne odpowiedzi poczty musza byc oznaczone jako syntetyczne.
- **T16:** pelne ponowne zalogowanie zostalo sprawdzone i nie wymaga ponowienia dla obecnego zakresu. Zachowac brak `q` i `~q`. Inne techniczne odmiany wznowienia nie sa rozstrzygniete tym testem, ale tez nie blokuja obecnego planu.
- **T22:** podstawowa rownowaznosc spacji i przecinka dla tej samej pary dwoch roznych adresatow zostala potwierdzona dwoma przypadkami. W obu przypadkach druga osoba trafila do `Do`, a nadawca do `DW`; kolejnosc wyswietlona przez serwer roznila sie od kolejnosci wpisu. Dodatkowe cztery proby z dwiema znanymi i jedna nieznana osoba potwierdzily odrzucenie calego compose przed tematem dla nieznanej osoby na poczatku i w srodku oraz dla spacji, przecinkow ze spacjami i przecinkow bez spacji. Trzy poprawne pary przeszly do tematu dla wszystkich trzech form separatorow, ale zostaly anulowane przez `~q` i zakonczyly sie `Zaniechane.`. Po bledzie na poczatkowym etapie `Adresat` nie wysylac dodatkowego `~q`, tematu, tresci ani `**`. Niezaleznie od logow uzytkownik jawnie potwierdzil cztery poprawne adresaty w formach `A B C D`, `A, B, C, D` i `A,B,C,D`. Nie sa potrzebne kolejne logi dla zaplanowanej poprawki lokalnego rozbijania. Nie jest to ogolny dowod deduplikacji, przenoszenia nadawcy do `DW`, zmiany kolejnosci, wiecej niz czterech poprawnych adresatow, zachowania nieznanej osoby na koncu ani szczegolowego listingu i podzialu `Do`/`DW` dla przecinka bez spacji. Mock nie moze narzucac tych regul. Syntetyczna odpowiedz moze odwzorowac jawnie nazwany przypadek i sprawdzic plugin, ale nie dowodzi innych wariantow duplikatow, nieznanych osob, rol adresatow, separatorow ani kolejnosci.
- Semantyke aliasow na serwerze sprawdzac tylko wtedy, gdy zakres mialby wyjsc poza uzgodnione porownanie `trim()` i wielkosc liter.

## 8. Warunek usuniecia dokumentow roboczych

Plan i raport mozna usunac dopiero po spelnieniu wszystkich warunkow:

1. Zakonczono caly uzgodniony zakres albo zapisano trwale decyzje o swiadomym odrzuceniu poszczegolnych pozycji.
2. Wszystkie zmiany maja lokalny dowod RED→GREEN i pelny zielony zestaw.
3. Zakonczono wymagane scenariusze Playwright i pozostale, rzeczywiscie potrzebne proby serwera.
4. Nie pozostaja otwarte rozjazdy miedzy kodem, raportem i zachowaniem klienta.
5. Ostateczny HEAD i wyniki testow zostaly zweryfikowane.

Sam fakt wykonania czesci implementacji, zielone CI albo przygotowanie release nie jest podstawa do usuniecia dokumentow.
