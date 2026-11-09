# Glowny tymczasowy plan analiz, poprawek i optymalizacji ArkMaila

## 1. Status i zakres

Dokument jest jedynym scalonym planem wszystkich dotychczasowych analiz, ustalen, poprawek i optymalizacji ArkMaila 1.30.5. Obejmuje:

- sporadyczna odpowiedz `Slucham?` po pierwszym recznym `r`;
- kolizje automatycznych operacji pocztowych z recznym pagerem gracza;
- zgloszona blokade klienta trwajaca okolo 7-8 sekund;
- koszty wydajnosciowe odswiezania, archiwum, eksportu, zapisu i interfejsu;
- wariant pozostawienia samego powiadomienia o nowej poczcie, bez automatycznego sprawdzania skrzynek;
- pola dat, date i czas w Archiwum oraz czytelnosc interfejsu;
- pobieranie tresci, reconnecty, pozne odpowiedzi, indeksacje i trwaly zapis;
- pelne naglowki, odpowiedzi, eksport, kontakty oraz obsluge starych Archiwow;
- docelowe kontrakty, macierz testow, kolejnosc prac i kryteria zakonczenia.

Pierwotna podstawa analizy recznej poczty i wydajnosci: kod z HEAD `0d15414308b8b17a10c19663dcadec844e8a3e91` oraz publiczny kod natywnego modulu poczty Dargotha z rewizji `13a6dce7ed9e55df3e53e9c3515b3ab7b9e8cedc`. Pozostale podstawy historyczne sa wymienione w sekcjach 13.1 i 16.1.

Aktualna kontrola calego scalonego dokumentu zostala wykonana na HEAD `fae0b99e1fbbc445354682e93d530cec9f3e5e72`. Potwierdzono zgodnosc lokalnej kopii 240 plikow spoza `releases/` z drzewem tego HEAD oraz ponownie sprawdzono wszystkie sciezki i mechanizmy kodu cytowane w planie. Szczegolowy zakres i granice tej kontroli opisuje sekcja 16.1.

W ramach analiz nie zmieniono kodu produkcyjnego ani testow. Nie przeprowadzono profilowania dzialajacego klienta i nie odtworzono konkretnego zdarzenia na zanonimizowanym logu czasow. Dlatego dokument rozroznia:

1. fakty potwierdzone bezposrednio w kodzie;
2. mechanizmy zgodne ze zgloszonymi objawami;
3. historyczne analizy i raportowane pomiary zewnetrzne;
4. wymagania docelowe, ktore nie sa jeszcze zaimplementowane;
5. kwestie, ktorych nie mozna przypisac do konkretnego zdarzenia bez pomiarow.

Dokument jest tymczasowy. Po pelnym wdrozeniu calego zatwierdzonego zakresu i zakonczeniu testow nalezy usunac go jako zbedny. Nie nalezy usuwac go po zaimplementowaniu tylko jednej sekcji.

## 2. Najwazniejsze wnioski

1. **Istnieje potwierdzony defekt wspoldzielenia pagera.** Reczne wejscie gracza w poczte nie przerywa juz rozpoczetej serii automatycznych listingow. Kolejny listing moze trafic do pagera gracza, a `MailboxSession` moze wtedy wyslac `q` i ponowic listing.
2. **Istnieje druga, niezalezna sciezka dla `r`.** Komenda wpisana podczas modalnego odczytu z ArkMaila moze zostac odtworzona dopiero po automatycznym zamknieciu pagera. Moze wowczas trafic do zwyklego trybu gry.
3. **Wartosc 8 sekund wystepuje w konfiguracji sesji.** Pojedyncza nierozpoznana odpowiedz moze utrzymac operacje do `timeoutMs = 8000`. To zgodnosc czasu, nie dowod przyczyny zgloszonej blokady.
4. **Asynchroniczny timeout i `SessionLock` nie zamrazaja same w sobie petli zdarzen.** Moga opozniac operacje ArkMaila. Natomiast pelne renderowanie, generowanie eksportow TXT i synchroniczna serializacja duzego archiwum wykonuja rzeczywista prace na watku interfejsu i moga powodowac przyciecia zalezne od wolumenu danych i sprzetu.
5. **Samo powiadomienie bez automatycznych odswiezen ogranicza wyzwalacze kolizji, ale jej nie naprawia.** Kolizja pozostaje mozliwa przy recznym Odswiez, indeksacji, wyszukiwaniu, ladowaniu starszych stron i ponownym ustalaniu pozycji listu. Osobno pozostaje sciezka modalna.
6. **Najpierw nalezy naprawic poprawnosc wspoldzielenia pagera.** Dopiero pozniej warto dodac opcjonalny tryb samego powiadomienia i wykonywac optymalizacje wydajnosci na podstawie pomiarow.

## 3. Potwierdzona kolizja recznego pagera z listingami

### 3.1. Wyzwalacze automatycznych listingow

W `src/arkmail/index.ts` powrot zwierzecia pocztowego uruchamia:

```ts
scheduleRefresh(["odebrane", "nieprzeczytane", "niewyslane", "wyslane"]);
```

Nowa poczta uruchamia listingi `odebrane` i `nieprzeczytane`, a takze opoznione ponowienia po 10 i 25 sekundach. Dodatkowe odswiezenia wynikaja m.in. ze zmian `GMCP Mail.State`, wyslania listu i usuniecia listu.

Przelacznik `notifyEnabled` steruje wylacznie powiadomieniem na ekranie. Nie wylacza automatycznych listingow ani opoznionych ponowien.

### 3.2. Parkowanie dotyczy tylko przyszlych operacji

`playerMailMode` jest ustawiany po wykryciu recznej komendy wejscia w poczte. `scheduleRefresh()` sprawdza ten stan i parkuje nowe zadania w `pendingRefresh`.

Nie zatrzymuje to jednak operacji, ktora juz przeszla przez `scheduleRefresh()`. `fetchBoxes()` wykonuje listingi sekwencyjnie:

```ts
for (const box of boxes) {
  ui.setBusy(`Pobieram skrzynke ${box}...`);
  const res = await mailbox.fetch(box);
  // przetwarzanie wyniku
}
```

W petli nie ma kontroli `playerMailMode` przed kolejnym `mailbox.fetch()`. Samo ustawienie trybu recznego nie anuluje rowniez biezacego `MailboxSession.fetch()`.

### 3.3. Sekwencja prowadzaca do zamkniecia pagera gracza

Kod dopuszcza nastepujaca kolejnosc:

1. Automatyczne zdarzenie uruchamia serie listingow, na przyklad cztery listingi po powrocie zwierzecia.
2. Listingi nie objmuja modalnej blokady komend uzytkownika. Reczne `przeczytaj list 1` moze zostac wyslane bezposrednio do gry.
3. ArkMail wykrywa wejscie w reczna poczte i ustawia `playerMailMode`, ale rozpoczeta seria nadal trwa.
4. Po zakonczeniu biezacego listingu `fetchBoxes()` moze wyslac komende kolejnej skrzynki. Trafia ona do pagera otwartego przez gracza zamiast do zwyklego trybu gry.
5. Jesli `MailboxSession.fetch()` nie ma jeszcze naglowka listingu i otrzyma prompt pagera, kod traktuje go jako podejrzenie osieroconego pagera. Przy pierwszym takim zdarzeniu wysyla `q`, czeka na zwykly prompt gry i ponawia listing.
6. Pager gracza zostaje wiec zamkniety przez komende pluginu. Pozniejsze reczne `r` moze trafic juz poza pager i zakonczyc sie odpowiedzia `Slucham?`.

Najwazniejszy fragment `src/arkmail/core/session/mailbox.ts`:

```ts
if (extractPagerPrompt(line.text)) {
  if (pagerRetried) {
    suspectPagerOrphan();
    cleanup();
    reject(new Error(`sierocy pager podczas fetch ${box}`));
    return;
  }
  pagerRetried = true;
  awaitingPromptAfterQ = true;
  send('q');
  return;
}
```

Ta galaz nie rozroznia pagera gracza od osieroconego pagera pluginu. Potwierdzony defekt dotyczy dokladnie sytuacji, w ktorej reczny pager pojawi sie w aktywnym listingu przed jego naglowkiem. Inne uklady linii wymagaja osobnych testow i nie nalezy ich rozstrzygac na podstawie samego opisu objawu.

### 3.4. Problem nie dotyczy wylacznie powrotu zwierzecia

`mailbox.fetch()` jest uzywany takze przez:

- reczne odswiezanie skrzynek;
- ponowne ustalenie pozycji listu przed odczytem;
- ladowanie starszych stron i pelnej skrzynki;
- indeksacje wszystkich skrzynek;
- wyszukiwanie;
- przygotowanie usuwania i swiezy listing przed usunieciem.

Usuniecie automatycznego odswiezenia po powrocie zwierzecia ograniczyloby tylko jeden wyzwalacz. Nie zamkneloby klasy bledu.

### 3.5. Opoznione ponowienia i wznowienie

Po wejsciu gracza w poczte trzeba uwzglednic rowniez:

- zaplanowane ponowienia po 10 i 25 sekundach;
- skrzynki pozostale w `pendingRefresh`;
- biezaca, niedokonczona skrzynke;
- czas wygasniecia recznego trybu poczty, obecnie 180 sekund;
- wznowienie po recznym `q` lub `x`.

Bez centralnego anulowania mozliwe byloby opoznione wyslanie listingu mimo recznej sesji albo podwojne wykonanie zaparkowanych zadan po jej zakonczeniu.

## 4. Osobna sciezka: `r` kolejkowane podczas modalu

Odczyt listu z okna ArkMaila uzywa `transport.beginModal()` i `transport.endModal()`.

W `src/arkmail/adapters/dargothTransport.ts` komendy uzytkownika wpisane podczas modalu sa tlumione i odkladane do kolejki. Po zakonczeniu modalu sa odtwarzane.

Jednoczesnie `PagerSession` przy odczycie bez dodatkowej akcji automatycznie wysyla `q` przy pierwszym prompcie pagera.

Mozliwa jest zatem sekwencja:

1. ArkMail prowadzi wlasny odczyt listu.
2. Uzytkownik wpisuje `r`.
3. `r` zostaje wstrzymane przez modal.
4. ArkMail konczy odczyt i automatycznie wysyla `q`.
5. `endModal()` odtwarza `r` dopiero po zamknieciu pagera.
6. Komenda trafia do zwyklego trybu gry.

To nie jest ta sama sciezka co kolizja listingow z recznym pagerem. Wymaga osobnego testu i osobnej decyzji o polityce komend zaleznnych od kontekstu pagera.

Dodatkowa niespojnosc dotyczy odtwarzanych komend wejscia w poczte:

- komendy z kolejki modalnej sa wysylane z `echo=true`;
- transport oznacza echo takich wysylek jako `own`;
- `index.ts` wywoluje `enterPlayerMailMode()` tylko dla `!line.own`.

W konsekwencji odtworzone reczne `listy` lub `przeczytaj...` moze nie wlaczyc recznego trybu poczty. Komentarze w kodzie sugeruja inny zamierzony rezultat. Ta sciezka nie jest glownym wyjasnieniem kolizji po powrocie zwierzecia, ale musi zostac objeta testami przy naprawie zrodla komend.

## 5. Znaczenie 8 sekund i rozroznienie opoznienia od blokady

Rzeczywista konfiguracja w `index.ts`:

```ts
const SESSION_OPTS = { timeoutMs: 8000, idleMs: 400 };
export const PLAYER_MAIL_MODE_IDLE_MS = 180_000;
const DELAYED_INBOX_RETRY_MS = [10_000, 25_000];
```

`MailboxSession`, `PagerSession`, `EditorSession` i `ImportSession` otrzymuja te opcje.

Zgodnosc ze zgloszonym czasem:

- jedna operacja oczekujaca na nierozpoznana lub nieotrzymana odpowiedz moze zakonczyc sie po okolo 8 sekundach;
- cztery listingi sa wykonywane sekwencyjnie, wiec cala seria moze trwac dluzej niz jeden timeout;
- kolejne operacje moga czekac na `SessionLock`.

Ograniczenia tego wniosku:

- nie ma zanonimizowanego logu czasow dowodzacego, ze w zgloszonym zdarzeniu wystapil timeout;
- asynchroniczny `setTimeout()` nie blokuje petli zdarzen przez 8 sekund;
- `SessionLock.runExclusive()` jest asynchroniczna kolejka FIFO, nie blokada synchroniczna;
- samo oczekiwanie na sesje nie dowodzi zamrozenia calego Dargotha.

Wniosek 7-8 sekund nalezy traktowac jako hipoteze zgodna z konfiguracja, nie jako ustalona przyczyne konkretnego zdarzenia.

## 6. Potwierdzone koszty wydajnosciowe

### 6.1. Generowanie pelnych eksportow TXT podczas renderowania

Najbardziej oczywisty niepotrzebny koszt znajduje sie w renderze zakladki Archiwum.

`src/arkmail/ui/render.ts` wywoluje `archiveExportEntries(state.archive)`, aby ustalic dane zwiazane z eksportem. Funkcja w `src/arkmail/core/exportTxt.ts`:

- wybiera listy z trescia;
- sortuje je;
- tworzy nazwy plikow;
- generuje pelne teksty TXT wszystkich eksportowalnych listow.

Dzieje sie to podczas renderowania, mimo ze uzytkownik nie uruchomil eksportu. Koszt rosnie wraz z liczba listow i laczna objetoscia ich tresci. Jest to priorytetowy kandydat do optymalizacji, poniewaz praca nie jest potrzebna do zwyklego wyswietlenia zakladki.

### 6.2. Pelne przerysowanie interfejsu

Kazda zmiana store wywoluje `render(state)`. Render tworzy strukture widoku i wykonuje:

```ts
root.replaceChildren(...nodes);
```

Na zakladce Archiwum dodatkowo powstaja elementy DOM dla wszystkich pasujacych wierszy. Nie ma selektywnego renderowania ani wirtualizacji listy. Koszt obejmuje usuwanie i tworzenie DOM, obliczanie filtrow, grup i statystyk oraz przywracanie stanu widoku.

### 6.3. Synchroniczna serializacja archiwum

`WriteThroughStorage.setLetters()` porownuje rekordy po ich serializacji:

```ts
for (const letter of letters) {
  const value = JSON.stringify(letter);
  // porownanie i przygotowanie zapisu
}
```

Do IndexedDB trafiaja tylko zmienione rekordy, a zapis bazy jest asynchroniczny. Mimo to `JSON.stringify()` jest wykonywany synchronicznie dla calego przekazanego archiwum, takze dla rekordow niezmienionych. Przy duzym archiwum moze to byc istotny koszt watku interfejsu.

### 6.4. Przetwarzanie calego archiwum i kontaktow

Potwierdzone operacje obejmuja m.in.:

- tworzenie map i scalanie calego archiwum;
- sortowanie archiwum;
- filtrowanie rekordow;
- przebudowe i sortowanie kontaktow;
- wielokrotne obliczanie statystyk;
- przygotowanie list eksportowych.

Po automatycznym pobraniu skrzynek `finalizeArchiveChange()` wykonuje zapis archiwum i przebudowe kontaktow.

### 6.5. Niepotrzebne zapisy ustawien przy kazdej zmianie store

Subskrypcja w `index.ts` zapisuje ustawienia szablonu, szerokosci edytora i powiadomien przy kazdej aktualizacji store, nie tylko przy rzeczywistej zmianie tych wartosci. Jest to koszt mniejszy niz pelne TXT czy renderowanie calego archiwum, ale rowniez niepotrzebny.

### 6.6. Czego nie mozna stwierdzic bez pomiaru

Nie mozna na podstawie samego kodu okreslic:

- czy wymienione koszty spowodowaly konkretna blokade 7-8 sekund;
- jaki byl rozmiar archiwum i liczba elementow DOM podczas zdarzenia;
- jaka czesc czasu zajely renderowanie, serializacja, komunikacja z gra lub inne rozszerzenia;
- czy wystapily dlugie zadania przegladarki o takim czasie trwania.

Natywny modul nowej poczty Dargotha sprawdzony w publicznym zrodle jedynie formatuje powiadomienie. Nie wysyla automatycznych listingow, wiec nie jest drugim nadawca komend w opisanym mechanizmie. Nie wyklucza to innych obciazen calego klienta, ktorych ta analiza ArkMaila nie mierzyla.

## 7. Ocena wariantu samego powiadomienia

### 7.1. Wymagane rozdzielenie ustawien

Obecny `notifyEnabled` nie moze sluzyc jako wylacznik automatycznych odswiezen. Potrzebna byloby osobna preferencja, np. automatyczne odswiezanie poczty, z zachowaniem dotychczasowej wartosci domyslnej dla zgodnosci.

Przy wylaczonym automatycznym odswiezaniu:

- powiadomienie o nowej poczcie nadal moze byc pokazywane niezaleznie;
- zdarzenia nowej poczty, GMCP i powrotu zwierzecia nie powinny uruchamiac listingow;
- nie powinny powstawac opoznione ponowienia;
- reczne Odswiez, indeksacja, wyszukiwanie i ladowanie stron nadal musi dzialac na jawne polecenie;
- licznik, archiwum, kontakty i czas ostatniej synchronizacji musza jasno wskazywac, ze dane moga byc nieaktualne do recznego odswiezenia.

Nalezy osobno zdefiniowac zachowanie po operacji wykonanej z ArkMaila, np. wyslaniu lub usunieciu listu: aktualizacja lokalna albo jedno odswiezenie bezposrednio zwiazane z poleceniem uzytkownika. Nie moze to powodowac ukrytego uruchamiania niezaleznych zadan w tle.

### 7.2. Zalety

- mniej automatycznych komend pocztowych;
- mniej wyzwalaczy kolizji z reczna poczta;
- mniej automatycznych renderowan i zapisow;
- prostszy model dla uzytkownika, ktory chce jedynie informacji o nowej poczcie.

### 7.3. Ograniczenia

- nie naprawia kolizji rozpoczetego recznego odswiezenia z pagerem gracza;
- nie naprawia indeksacji, wyszukiwania, paginacji ani ponownego ustalania pozycji listu;
- nie naprawia komend kolejkowanych w modalu;
- nie usuwa kosztow renderowania i archiwum przy recznym uzyciu;
- pogarsza aktualnosc danych, jesli stan nie zostanie wyraznie oznaczony.

Rekomendacja: traktowac ten wariant jako dodatkowa preferencje po naprawie poprawnosci, a nie jako zamiennik naprawy.

## 8. Rekomendowany zakres przyszlej naprawy poprawnosci

### 8.1. Priorytet uzytkownika i centralne anulowanie

Wykrycie zewnetrznego, recznego wejscia w poczte powinno synchronicznie:

1. ustawic reczny tryb poczty;
2. anulowac aktywny automatyczny `MailboxSession.fetch()` z jednoznaczna przyczyna anulowania;
3. zatrzymac wszystkie petle przed wyslaniem kolejnej komendy skrzynki;
4. uniewaznic opoznione ponowienia i zwiazane z nimi wywolania zwrotne;
5. wyczyscic stan `busy` bez zglaszania pozornego bledu uzytkownikowi.

Anulowanie musi byc respektowane w samym `MailboxSession`, nie tylko w petlach wywolujacych. Po wykryciu recznego pagera sesja nie moze:

- wyslac `q`;
- ponowic listingu;
- uruchomic kolejnego timera;
- oznaczyc pagera gracza jako osieroconego;
- przetworzyc czesciowej odpowiedzi jako kompletnego listingu.

Sprawdzenie anulowania musi nastepowac rowniez bezposrednio przed kazda komenda wysylana przez sesje, aby przelaczenie trybu nie zostalo przegapione miedzy zdarzeniami asynchronicznymi.

### 8.2. Wznowienie po zakonczeniu recznej poczty

Niedokonczone automatyczne skrzynki powinny zachowac sie w `pendingRefresh`, lacznie z biezaca skrzynka, jesli jej listing nie zostal poprawnie zakonczony.

Po recznym `q` lub `x`:

- zaparkowane zadania moga zostac wznowione;
- wznowienie musi byc pojedyncze i uporzadkowane przez istniejaca kolejke;
- nie wolno utworzyc rownoleglego ani podwojnego wykonania kolejki;
- zadania uniewaznione przez rozlaczenie lub zmiane generacji polaczenia nie moga wznowic sie dla starej sesji.

Reczne operacje z UI, ktore zostana przerwane wejsciem gracza w poczte, powinny zakonczyc sie jako jawne anulowanie i wymagac ponownego polecenia. Nie powinny same wracac jako nieoczekiwana praca w tle. Automatyczne odswiezenia moga natomiast wrocic do zaparkowanej kolejki.

### 8.3. Spojnosc danych

Czesciowy lub anulowany listing nie moze:

- usuwac rekordow archiwum na podstawie niekompletnej odpowiedzi;
- ustawiac znacznika pelnego pobrania;
- przesuwac punktu kotwiczenia listu;
- nadpisywac nowszych danych wynikiem anulowanej operacji;
- wywolywac koncowej przebudowy archiwum tak, jakby cala seria zakonczyla sie powodzeniem.

Przetwarzanie wyniku powinno byc zwiazane z identyfikatorem operacji lub generacji, aby pozne odpowiedzi nie mogly zmienic stanu po anulowaniu.

Stan wykonania: WDROZONE dla wspolnego mechanizmu 8.1-8.3. `DargothTransport` zachowuje zrodlo komendy uzytkownika przy technicznym echo, `MailboxSession` anuluje listing po prompcie pagera nieznanego pochodzenia bez `q`, retry, nowych timerow i oznaczania sieroty, a centralne wejscie gracza w poczte anuluje aktywne sesje, zatrzymuje petle, czysci opoznione odswiezenia i stan busy. `fetchBoxes()` nie stosuje wyniku po anulowaniu, automatyczne skrzynki wracaja przez `pendingRefresh` w jednej kolejce, a reczne pobieranie tresci konczy sie bez automatycznego wznowienia. Koncowa aktualizacja Archiwum po `fetchBoxes()` wykonuje sie wylacznie po sukcesie.

Dowody: trzy nowe testy wykazaly najpierw lokalny RED na starym kodzie (`53` testy, `50` zaliczonych, `3` niezaliczone). Po implementacji i dostosowaniu czterech starych testow oczekujacych poprzedniego, niebezpiecznego kontraktu rozszerzony zestaw dal `70/70`. Koncowa pelna regresja: `1037` testow, `1036` zaliczonych, `1` pominiety, `0` niezaliczonych; niezalezna kontrola typow i build zakonczyly sie pomyslnie. Ten wpis nie zamyka specjalistycznych sciezek z 8.4, potwierdzenia zwyklego promptu przed wznowieniem ani kolejnych prac z planu.

### 8.4. Wszystkie sciezki listingow

Te same zabezpieczenia musza obejmowac:

- automatyczne i reczne `fetchBoxes()`;
- ponowne ustalenie pozycji przed odczytem;
- `loadOlder()` i `loadAll()`;
- `indexAllBoxes()`;
- wyszukiwanie i przygotowanie usuwania;
- swiezy listing przed usunieciem.

Naprawa tylko jednego zdarzenia w `index.ts` bylaby niedostateczna.

### 8.5. Komendy zalezne od pagera w modalu

Komenda uzytkownika nie moze zostac bezrefleksyjnie przeniesiona do innego kontekstu niz ten, w ktorym ja wpisano.

Minimalna zasada bezpieczenstwa: jesli pager, w ktorym wpisano `r`, zostal juz zamkniety, nie wolno odtwarzac `r` do zwyklego trybu gry. Docelowa polityka powinna zapewniac priorytet uzytkownikowi i jednoznacznie okreslac, czy:

- reczna komenda przejmuje aktywny pager po anulowaniu automatycznego odczytu, bez wysylania pluginowego `q`; albo
- komenda zalezna od zakonczonego pagera nie jest wykonywana, a uzytkownik otrzymuje krotka informacje o koniecznosci jej powtorzenia w recznej poczcie.

Niezaleznie od wybranego wariantu zakazane jest ciche wyslanie pagerowego `r` poza pagerem. Rowniez odtworzone `listy` i `przeczytaj...` musza zachowac informacje, ze ich zrodlem byl uzytkownik, mimo technicznego `echo=true` i oznaczenia echa jako `own`.

## 9. Rekomendowany zakres optymalizacji wydajnosci

Najpierw nalezy wykonac pomiar bazowy na syntetycznych archiwach, bez prawdziwych tresci listow i identyfikatorow. Pomiar powinien obejmowac co najmniej:

- czas pojedynczego renderu zakladki Archiwum;
- liczbe i czas dlugich zadan na watku interfejsu;
- czas serializacji i zapisu po odswiezeniu;
- liczbe tworzonych elementow DOM;
- opoznienie miedzy zdarzeniem a obsluga kolejnej komendy;
- porownanie kilku kontrolowanych rozmiarow archiwum i objetosci tresci.

Kolejnosc optymalizacji wedlug stosunku korzysci do ryzyka:

1. Usunac generowanie pelnych TXT z renderowania. Do samego widoku wystarczy tania informacja o dostepnosci eksportu; pelne dane powinny powstawac dopiero na polecenie eksportu.
2. Zaprzestac pelnego przerysowania przy kazdej zmianie store. Wprowadzic aktualizacje tylko zmienionych obszarow oraz memoizacje danych pochodnych wedlug wersji archiwum i filtrow.
3. Ograniczyc liczbe wierszy Archiwum w DOM przez stronicowanie lub wirtualizacje, z zachowaniem filtrow, zaznaczenia i polozenia przewijania.
4. Ograniczyc synchroniczna serializacje niezmienionych rekordow. Docelowy mechanizm ma opierac sie na wersjach lub rzeczywiscie zmienionych listach, zamiast serializowac cale archiwum w celu wykrycia zmian.
5. Wykonywac zapisy ustawien tylko przy rzeczywistej zmianie odpowiedniej wartosci.
6. Dopiero po ponownym pomiarze ocenic koniecznosc dalszych zmian w sortowaniu, kontaktach i statystykach.

Optymalizacja nie moze zmienic zasad poprawnosci opisanych w sekcji 8 ani zastapic testow kolizji.

## 10. Wymagane testy przed implementacja i po niej

Kazda zmiana kodu wymaga dowodu red-green: najpierw nowy test ma zostac uruchomiony lokalnie na starym kodzie i wykazac RED, dopiero potem moze powstac implementacja. Celowego RED nie nalezy wykonywac przez CI. Przed commitem caly odpowiedni zestaw musi przejsc lokalnie na zielono, a po pushu pelny CI rowniez musi byc zielony.

### 10.1. Kolizja z recznym pagerem

Minimalna macierz:

1. Powrot zwierzecia uruchamia cztery listingi; gracz wchodzi w reczny pager przed naglowkiem kolejnego listingu.
2. Reczne wejscie nastepuje w trakcie oczekiwania pierwszego listingu.
3. Reczne wejscie nastepuje miedzy dwoma skrzynkami.
4. Prompt pagera gracza pojawia sie przed naglowkiem aktywnego listingu.
5. W trakcie recznej poczty wygasa jedno z opoznionych ponowien 10/25 s.
6. Gracz konczy reczna poczte przez `q` i osobno przez `x`.
7. Rozlaczenie nastepuje przed wznowieniem zaparkowanych zadan.

Oczekiwania:

- zadne kolejne `listy ...` nie trafia do pagera gracza;
- ArkMail nie wysyla `q` do pagera gracza;
- reczne `r` nie jest przechwytywane, zmieniane ani opozniane;
- nie ma automatycznego ponowienia listingu w recznej sesji;
- po zakonczeniu recznej sesji zaparkowane skrzynki wykonuja sie dokladnie raz;
- czesciowy listing nie powoduje usuniecia archiwum ani falszywego znacznika kompletu.

### 10.2. Pozostale sciezki listingow

Analogiczne zabezpieczenia trzeba sprawdzic dla:

- recznego Odswiez;
- indeksacji wszystkich skrzynek;
- `loadOlder()` i `loadAll()`;
- wyszukiwania;
- ponownego ustalenia pozycji listu;
- przygotowania i swiezego listingu przed usunieciem.

### 10.3. Modal i zrodlo komendy

Osobne testy:

1. `r` wpisane podczas modalnego odczytu nigdy nie zostaje wyslane po zamknieciu pagera do zwyklego trybu gry.
2. Odtworzone reczne `listy` wlacza reczny tryb poczty mimo technicznego oznaczenia echa jako `own`.
3. Odtworzone reczne `przeczytaj...` zachowuje pochodzenie uzytkownika.
4. Wlasne `q` pluginu nie zostaje pomylone z recznym zakonczeniem poczty.
5. Komendy niezalezne od pagera zachowuja dotychczasowa kolejnosc i nie sa duplikowane.

### 10.4. Korekta istniejacego testu

`tests/playerMailMode.test.ts` zawiera obecnie scenariusz, w ktorym po recznym wejsciu gracza w poczte test oczekuje wyslania drugiego listingu indeksacji. To utrwala opisana luke.

Przy naprawie test nalezy przebudowac tak, aby:

- odtwarzal wejscie gracza w aktywny pager, a nie tylko zwykla odpowiedz listingu;
- zakazywal kolejnego listingu i pluginowego `q` az do wyjscia gracza;
- sprawdzal kontrolowane wznowienie po zakonczeniu recznej sesji.

### 10.5. Wydajnosc

Testy wydajnosci powinny uzywac wylacznie danych syntetycznych. Nalezy zachowac porownywalna procedure przed i po zmianie oraz raportowac srednia, mediane i najdluzsze zadanie. Sam fakt zielonych testow funkcjonalnych nie dowodzi poprawy wydajnosci.

## 11. Kryteria zamkniecia tematu

Temat bedzie zamkniety dopiero, gdy:

1. reczna poczta ma bezwzgledny priorytet nad automatycznymi listingami;
2. zadna sciezka ArkMaila nie zamyka pagera gracza w opisanej kolizji;
3. `r` ani inna komenda zalezna od trybu czytania nie moze zostac przeniesiona z zakonczonego pagera do zwyklego trybu gry;
4. wszystkie sciezki `mailbox.fetch()` respektuja anulowanie i wznowienie;
5. czesciowe odpowiedzi nie zmieniaja archiwum ani znacznikow kompletu;
6. testy maja udokumentowane lokalne RED na starym kodzie i pelne GREEN po poprawce;
7. CI po pushu jest zielone;
8. wydajnosc zostala zmierzona przed i po optymalizacji na danych syntetycznych;
9. decyzja o opcjonalnym trybie samego powiadomienia zostala zapisana osobno;
10. po pelnym wdrozeniu ten tymczasowy dokument usunieto z repozytorium.

## 12. Granica wnioskowania

Kod potwierdza realna kolizje listingow z recznym pagerem oraz osobna sciezke opoznionego `r`. Potwierdza tez timeout 8000 ms i synchroniczne koszty interfejsu. Nie potwierdza natomiast, ze konkretne zgloszone zdarzenie bylo spowodowane wlasnie timeoutem albo konkretnym renderem.

Do jednoznacznego przypisania konkretnego zdarzenia potrzebny bylby zanonimizowany log sekwencji komend i odpowiedzi wraz ze znacznikami czasu oraz profil dlugich zadan przegladarki. Bez takich danych najmocniejszy uczciwy wniosek brzmi: **mechanizm zgodny z objawami istnieje i wymaga naprawy, ale czas trwania oraz przyczyna jednej konkretnej blokady nie zostaly dowiedzione.**


## 13. Doprecyzowany plan wdrozenia

Ponizsze ustalenia uzupelniaja plan i rozstrzygaja kwestie omowione po pierwszym zapisie analizy. Status wykonania jest odnotowywany wylacznie przy etapach, ktore maja komplet wymaganych dowodow.

### 13.1. Pola dat

Ta sekcja zawiera caly dawny osobny plan pol dat; nie wymaga zadnego uzupelniajacego dokumentu. Analiza zrodlowa objela ArkMaila 1.30.5 (`57b0bee3b7394098e46a91bc7b458eef499991b6`) i Dargotha (`13a6dce7ed9e55df3e53e9c3515b3ab7b9e8cedc`). Na aktualnym HEAD `fae0b99e1fbbc445354682e93d530cec9f3e5e72` pliki `src/arkmail/ui/styles.ts` i `src/arkmail/ui/render.ts` sa bajtowo identyczne z wersjami objetymi tamta analiza, a ich aktualne deklaracje i struktura pol zostaly ponownie sprawdzone.

Problem dotyczy wylacznie czytelnosci natywnej ikony kalendarza, a nie braku pickera, filtrowania, parsowania ani zakresow dat. Zakres obejmuje dokladnie szesc pol `input type="date"`:

1. Listy: `data-search="odDaty"` i `data-search="doDaty"`.
2. Archiwum: `data-filter="odDaty"` i `data-filter="doDaty"`.
3. Usuwanie: `data-deletion-filter="odDaty"` i `data-deletion-filter="doDaty"`.

Aktualny kod potwierdza lokalne `color-scheme: light dark` dla pol List i Archiwum. Tlo pochodzi z motywu klienta, ale natywna ikona moze wybrac wariant wedlug schematu systemu lub przegladarki. W Usuwaniu nie ma lokalnego nadpisania i pole dziedziczy schemat klienta.

Zrodlowa analiza raportuje kontrolowana probe w Chromium 151 dla obu przeciwstawnych kombinacji motywu i systemu. Wedlug tego raportu pole nie jest wylaczone ani tylko do odczytu, a klikniecie obszaru ikony otwiera kalendarz takze wtedy, gdy ikona jest prawie niewidoczna. W tej kontroli porownawczej nie powtarzano pomiaru wizualnego, dlatego jest to dowod historyczny, a nie nowy pomiar na aktualnym HEAD.

W analizowanych zrodlach ArkMaila i globalnych stylach Dargotha nie znaleziono:

- ukrywania `::-webkit-calendar-picker-indicator`;
- wylaczania `appearance` dla pol dat;
- blokowania zdarzen na tych polach;
- `pointer-events: none` na tych polach.

Aktualne wyszukanie w `src/arkmail` potwierdza brak `showPicker`, `calendar-picker-indicator` i `appearance: none`. Wystepujace w `styles.ts` `pointer-events: none` dotyczy `.arkmail-ghost`, a nie pol dat.

Decyzja projektowa:

1. Usunac oba lokalne wymuszenia `color-scheme: light dark`.
2. Dodac jedna wspolna regule dla wszystkich pol dat ArkMaila: `color-scheme: inherit`.
3. Nie zmieniac `input type="date"`, recznego wpisywania, natywnego formatu wyswietlania daty ani technicznej wartosci ISO `RRRR-MM-DD`; bez zmian walidacji, komend serwera i filtrowania Archiwum.
4. Nie dodawac wlasnego kalendarza, nowych przyciskow ani wywolan `showPicker()`. Zgloszenie dotyczy wylacznie czytelnosci istniejacej ikony.
5. Nie stosowac stalego `filter: invert(...)` ani innego recznego kolorowania ikony, poniewaz takie rozwiazanie znow ignorowaloby motyw.
6. Nie zmieniac etykiet ani innych elementow interfejsu w tej poprawce.

Dowody i bramki:

1. Lokalny RED na starym kodzie dotyczy nowego kontraktu stylu: wykrycia dwoch deklaracji `light dark` i braku wspolnej reguly `color-scheme: inherit` dla wszystkich szesciu pol. Celowego RED nie wolno wykonywac przez CI.
2. Test struktury DOM potwierdza `type="date"` dla dwoch pol w kazdej z trzech zakladek. To zielona baza regresyjna, poniewaz struktura jest juz poprawna; nie wolno sztucznie psuc jej dla uzyskania RED.
3. Test w prawdziwym Chromium sprawdza efektywny `getComputedStyle(input).colorScheme` dla wszystkich szesciu pol w czterech kombinacjach: ciemny motyw/jasny system, ciemny motyw/ciemny system, jasny motyw/jasny system i jasny motyw/ciemny system. Przed implementacja RED dotyczy sciezek, ktorych stare wymuszenie lamie kontrakt. Usuwanie jest kontrola regresyjna i nie musi byc RED.
4. Dowod wizualny na prawdziwym kliencie obejmuje zrzuty przed i po zmianie w obu krytycznych kombinacjach. Ikona ma byc wyrazna bez recznego kolorowania. To dowod porownawczy, nie automatyczny test RED.
5. Test zachowania potwierdza, ze klikniecie ikony i wybor dnia nadal ustawiaja wartosc ISO. Samo otwarcie pickera nie wykrywa pierwotnego bledu i nie zastepuje kontroli obliczonego stylu ani dowodu wizualnego.
6. Istniejace testy filtrowania pozostaja niezmienione i potwierdzaja brak regresji logiki.
7. Po lokalnym RED nowego kontraktu i GREEN po implementacji wykonac pelny wymagany zestaw jednostkowy, `typecheck`, build i macierz E2E zgodnie z zasadami bramek projektu.

Poprawke mozna zamknac dopiero, gdy wszystkie szesc pol ma czytelna ikone w jasnym i ciemnym motywie niezaleznie od schematu systemu, natywny picker i reczne wpisywanie dzialaja bez zmian, a pelne testy sa zielone. Ta sekcja pozostaje w glownym planie do czasu wdrozenia calego zakresu dokumentu; glowny plan usuwa sie dopiero po zakonczeniu wszystkich planowanych prac i testow.

Stan wykonania: WDROZONE. Nowy test najpierw wykazal lokalny RED na starym kodzie: dwie kontrole nie przeszly, a Chromium raportowalo `light dark` na czterech polach zamiast schematu klienta. Po usunieciu obu wymuszen i dodaniu wspolnego `color-scheme: inherit` obie kontrole przeszly, w tym szesc pol w czterech kombinacjach motywu klienta i schematu systemu. Pelny zestaw dal wynik 1035 testow: 1034 zaliczone, 1 pominiety i 0 niezaliczonych; niezalezna kontrola typow oraz build zakonczyly sie pomyslnie. Nie zmieniono typu pol, natywnego pickera, recznego wpisywania, technicznej wartosci ISO, filtrowania, parsowania, walidacji ani komend.

### 13.2. Rozpoznawanie zrodla komendy

ArkMail nie moze rozpoznawac wlasciciela pagera wylacznie na podstawie jego promptu. Prompt moze pochodzic od gracza, wtyczki lub innego skryptu.

Docelowo:

1. Kazda komenda ma zachowac zrodlo: ArkMail, uzytkownik albo zrodlo zewnetrzne/nieznane.
2. Komendy wyslane przez ArkMaila sa oznaczane wewnetrznie jako wlasne.
3. Komendy przechwycone z wejscia uzytkownika zachowuja to zrodlo rowniez po kolejkowaniu i odtworzeniu.
4. Techniczne `echo=true` i oznaczenie echa jako `own` nie moga zmienic komendy uzytkownika w komende wtyczki.
5. Kazda komenda pocztowa spoza ArkMaila ma pierwszenstwo. Nie trzeba rozstrzygac, czy wpisal ja czlowiek, alias czy inny skrypt.
6. Zewnetrzne `listy`, `przeczytaj...` lub inna rozpoznana komenda wejscia w poczte przerywa prace ArkMaila od razu, przed pojawieniem sie promptu pagera.
7. Samo `r` nie sluzy do rozpoczecia wykrywania recznej poczty. Nalezy do juz rozpoznanej sesji albo do wlasnego pagera przekazywanego uzytkownikowi.
8. Prompt pagera o nieznanym zrodle nie moze powodowac automatycznego `q`. ArkMail przerywa wlasna prace i czeka.
9. Sprzatanie osieroconego pagera jest dopuszczalne tylko przy pozytywnym potwierdzeniu, ze ArkMail sam wczesniej otworzyl ten pager.

### 13.3. Przerwanie i wznowienie listingow

Po zewnetrznym wejsciu w poczte ArkMail ma:

1. wlaczyc reczny tryb poczty;
2. anulowac aktywny automatyczny `MailboxSession.fetch()`;
3. zatrzymac wszystkie petle przed kolejna komenda skrzynki;
4. anulowac opoznione ponowienia, w tym 10/25 s;
5. nie wysylac `q`, nie ponawiac listingu i nie uruchamiac nowych timerow;
6. nie przechwytywac ani nie opozniac komend gracza;
7. wyczyscic stan `busy` bez pozornego bledu;
8. zachowac niedokonczone automatyczne skrzynki w `pendingRefresh`, lacznie z biezaca niekompletna skrzynka;
9. wznowic zaparkowane zadania dokladnie raz dopiero po potwierdzonym zakonczeniu recznej sesji;
10. nie wznawiac zadan starej generacji po rozlaczeniu.

Reczna operacja z UI przerwana wejsciem uzytkownika w poczte konczy sie jako anulowana i wymaga nowego polecenia. Nie wraca samoczynnie jako praca w tle.

Zabezpieczenia obejmuja wszystkie sciezki `mailbox.fetch()`: automatyczne i reczne odswiezenia, indeksacje, `loadOlder()`, `loadAll()`, wyszukiwanie, ponowne ustalenie pozycji listu oraz listingi przed usunieciem.

Stan wykonania: WDROZONE potwierdzenie zwyklego promptu po `q`/`x`. Nowy test najpierw wykazal lokalny RED na starym kodzie: 6 testow, 5 zaliczonych i 1 niezaliczony; po samym `→ q` wyslano `listy odebrane`, mimo oczekiwanego braku komend. Po implementacji oczekiwania na zwykly prompt i wzmocnieniu przypadku o posredni prompt pagera powiazany zestaw przeszedl 12/12. Pelna regresja zakonczyla sie kodem 0: 1038 testow, 1037 zaliczone, 1 pominiety i 0 niezaliczonych. Niezalezny typecheck i build zakonczyly sie pomyslnie.

### 13.4. Spojnosc danych

Czesciowy lub anulowany listing nie moze:

- usuwac rekordow archiwum;
- ustawiac znacznika pelnego pobrania;
- przesuwac punktu kotwiczenia;
- nadpisywac nowszego stanu;
- powodowac koncowej przebudowy archiwum jak po udanej serii.

Wynik operacji ma byc zwiazany z jej identyfikatorem lub generacja. Pozne odpowiedzi anulowanej operacji nie moga zmieniac stanu.

### 13.5. Komendy zalezne od trybu czytania podczas automatycznego odczytu

Zasada dla `r` jest czescia ogolniejszego wymagania dla wszystkich komend zaleznych od trybu czytania poczty. Pelna liste i klasyfikacje zawiera sekcja 14.

1. Przed kolejkowaniem lub odtworzeniem komendy trzeba okreslic, czy wymaga aktywnego trybu czytania, zamyka ten tryb, czy zostala jawnie oznaczona przez `!` jako komenda spoza trybu.
2. Jesli wlasny pager nadal jest otwarty:
   - `q` lub `x` uzytkownika wykonuje sie dokladnie raz jako zamkniecie na zadanie uzytkownika, konczy wlasna sesje i nie odtwarza komendy drugi raz;
   - inna komenda zalezna od trybu czytania przerywa automatyczny odczyt bez pluginowego `q`, przekazuje pager uzytkownikowi i wykonuje sie dokladnie raz w tym samym pagerze;
   - `!<komenda>` zachowuje znaczenie jawnego wykonania poza trybem czytania i nie jest traktowana jak zwykla komenda pagerowa.
3. Jesli pager zostal juz zamkniety, zadna komenda zalezna od trybu czytania nie moze zostac odtworzona do zwyklego trybu gry. Dotyczy to m.in. `r`, `R`, pustego Entera, nawigacji, oznaczania i kasowania listow.
4. `!<komenda>` moze zostac wykonana poza pagerem zgodnie z jej jawnym znaczeniem. Nie wolno usuwac prefiksu `!`, traktowac jej jako zwyklej komendy pagerowej ani odrzucac wylacznie z powodu zamkniecia pagera.
5. Odtworzone `listy` i `przeczytaj...` zachowuja zrodlo uzytkownika.
6. Wlasne `q` ArkMaila nie jest mylone z recznym wyjsciem uzytkownika.
7. Komendy niezalezne od pagera nie sa duplikowane i zachowuja kolejnosc.

Proponowany ogolny komunikat UI bez polskich diakrytykow:

> Nie wykonano komendy pocztowej, poniewaz tryb czytania poczty zostal juz zamkniety. Otworz poczte recznie i powtorz komende.

Stan wykonania: WDROZONE. Nowy zestaw najpierw wykazal lokalny RED na starym kodzie: 7 testow, 1 zaliczony i 6 niezaliczonych. Dowody obejmowaly pluginowe `q` mimo przejecia pagera przez `r`, odtworzenie `r` po zamknieciu, zduplikowane `q` oraz odtwarzanie komend pagerowych do zwyklego trybu gry. Po implementacji pierwsze 7 testow przeszlo 7/7, a powiazana regresja 51/51. Dodatkowy osmy przypadek sprawdza `!r` w zwyklym modalu edytora. Pelna regresja z wszystkimi 8 nowymi przypadkami zakonczyla sie kodem 0: 1046 testow, 1045 zaliczonych, 1 pominiety i 0 niezaliczonych; niezalezny typecheck i build zakonczyly sie pomyslnie. Parametryczne przypadki obejmuja 22 komendy, pusty Enter dostarczony do hooka, zachowanie argumentow, wielkosci liter, zrodla uzytkownika, prefiksu `!` i kolejnosci. Nie wykonano testu w prawdziwej grze; obsluga pustego Entera jest potwierdzona dla zdarzenia przekazanego do `commandHooks`, a nie dla niezaleznego pomiaru wejscia klienta gry.

### 13.6. Niskokosztowa optymalizacja Archiwum

1. Przed zmiana wykonac pomiar na kilku syntetycznych archiwach o roznej liczbie listow i objetosci tresci.
2. Usunac generowanie pelnych eksportow TXT podczas zwyklego renderowania Archiwum.
3. Podczas renderu sprawdzac jedynie dostepnosc eksportu.
4. Pelne TXT generowac dopiero po poleceniu eksportu.
5. Testem potwierdzic identyczny wynik eksportu przed i po zmianie.
6. Powtorzyc pomiar czasu renderu, najdluzszego zadania i liczby elementow DOM.
7. Nie rozpoczynac wirtualizacji, stronicowania ani duzej przebudowy renderowania bez osobnej decyzji popartej pomiarami.

Stan wykonania: WDROZONE. Nowy zestaw najpierw wykazal lokalny RED na starym kodzie: 2 testy, 1 zaliczony i 1 niezaliczony. Slad bledu prowadzil z `renderArchiwum()` przez `archiveExportEntries()` i `archiveLetterTxt()` do serializacji `body.map(...)`; drugi test potwierdzil dokladna nazwe i zawartosc wlasciwego eksportu TXT. Po dodaniu `archiveExportStats()` render oblicza wylacznie liczbe rekordow z trescia i pominietych, a pelne TXT powstaja nadal dopiero w `runExportArchive()`. Nowy test i powiazana regresja przeszly 18/18. Pelna regresja zakonczyla sie kodem 0: 1048 testow, 1047 zaliczonych, 1 pominiety i 0 niezaliczonych; niezalezny typecheck i build zakonczyly sie pomyslnie.

Pomiar wykonano w tym samym srodowisku harnessu `happy-dom`, na danych syntetycznych, po 5 probek na przypadek. Format: srednia, mediana, najdluzsze zadanie i liczba elementow DOM przed -> po:

- 100 listow po 20 linii po 80 znakow: 15,54 -> 16,21 ms; 13,78 -> 16,70 ms; 25,43 -> 20,92 ms; 357 -> 357. Ten najmniejszy przypadek nie wykazal poprawy sredniej ani mediany.
- 500 listow po 100 linii po 80 znakow: 60,16 -> 43,28 ms; 51,57 -> 37,07 ms; 88,46 -> 63,08 ms; 1557 -> 1557.
- 1000 listow po 200 linii po 80 znakow: 127,34 -> 77,84 ms; 111,65 -> 76,60 ms; 196,35 -> 83,41 ms; 3057 -> 3057.

Pomiar nie jest testem w prawdziwej grze ani pomiarem przegladarki produkcyjnej. Nie zmieniono wirtualizacji, stronicowania, struktury DOM ani samej funkcji `archiveExportEntries()`.

### 13.7. Ustawienia i teksty UI

Maja istniec dwa niezalezne ustawienia:

1. **Powiadomienia o nowej poczcie** - steruja tylko komunikatem.
2. **Automatyczne odswiezanie poczty** - steruja sprawdzaniem skrzynek w tle.

Automatyczne odswiezanie jest domyslnie wlaczone, co zachowuje dotychczasowe dzialanie po aktualizacji. Ustawienie jest trwale i odtwarzane po ponownym uruchomieniu.

Po wylaczeniu automatycznego odswiezania:

- nowa poczta, GMCP, powrot zwierzecia i inne zdarzenia w tle nie uruchamiaja listingow;
- nie powstaja opoznione ponowienia;
- powiadomienia pozostaja niezalezne;
- reczne Odswiez, indeksacja i wyszukiwanie dzialaja normalnie;
- bezposrednie operacje uzytkownika moga wykonac swoje powiazane odswiezenie, ale nie uruchamiaja niezaleznych zadan w tle;
- interfejs wyraznie informuje, ze archiwum, kontakty i liczniki moga byc nieaktualne.

Teksty UI maja byc bez polskich diakrytykow.

Tooltip **Powiadomienia o nowej poczcie**:

> Pokazuje komunikat o nowej poczcie. To ustawienie nie wplywa na automatyczne odswiezanie skrzynek.

Tooltip **Automatyczne odswiezanie poczty**:

> Po nowej poczcie i innych zdarzeniach pocztowych ArkMail automatycznie sprawdza skrzynki oraz aktualizuje archiwum, kontakty i liczniki. Wylaczenie tej opcji zatrzymuje odswiezanie w tle, ale nie wylacza powiadomien. Dane moga byc nieaktualne do czasu recznego odswiezenia. Uzyj przycisku Odswiez, aby pobrac aktualne dane.

Staly komunikat po wylaczeniu automatycznego odswiezania:

> Automatyczne odswiezanie jest wylaczone. Archiwum, kontakty i liczniki moga byc nieaktualne. Uzyj przycisku Odswiez, aby pobrac aktualne dane.

Tooltipy maja byc dostepne rowniez z klawiatury. Informacja o nieaktualnych danych nie moze byc dostepna wylacznie po najechaniu na ustawienie.

Wynik wdrozenia:

- RED przed implementacja: 5 testow, 0 zaliczonych, 5 niezaliczonych.
- GREEN po implementacji: testy ustawien 5/5 oraz powiazana regresja 63/63.
- Pierwszy pelny zestaw wykazal jeden blad kontroli slownictwa w nowym komentarzu. Po zastapieniu go neutralnym opisem usuwania zadan kontrola przechodzi 1/1.
- Koncowy pelny zestaw: 1053 testy, 1052 zaliczone, 0 niezaliczonych, 1 pominiety.
- Niezalezne `npm run typecheck` i `npm run build` zakonczyly sie sukcesem.

Nie wykonano testu w prawdziwej grze.

### 13.8. Kolejnosc commitow i testow

Prace nalezy podzielic na osobne, spojne commity:

1. pola dat;
2. zrodlo komend i przerwanie listingow;
3. wznowienie i pozostale sciezki listingow;
4. komendy kolejkowane podczas automatycznego odczytu;
5. optymalizacja eksportu przy renderowaniu;
6. ustawienie automatycznego odswiezania wraz z tooltipami i komunikatem;
7. data i czas w Archiwum.

Dla kazdej zmiany kodu:

1. Najpierw test przechodzi lokalnie na starym kodzie i wykazuje RED.
2. Dowodu RED nie wykonuje sie przez CI.
3. Dopiero potem powstaje implementacja.
4. Przed commitem pelny odpowiedni zestaw testow, typowanie i pozostale kontrole przechodza lokalnie na zielono.
5. Po pushu CI musi byc zielone przed zaleznym krokiem.

Testy obejmuja co najmniej:

- wejscie gracza przed, w trakcie i miedzy listingami;
- pager przed naglowkiem listingu;
- opoznione ponowienia;
- zakonczenie recznej sesji i powrot zwyklego promptu;
- rozlaczenie przed wznowieniem;
- wszystkie sciezki `mailbox.fetch()`;
- parametrowane przypadki komend zaleznych od trybu czytania przy otwartym i zamknietym pagerze, w tym `r`, `R` i pusty Enter;
- `q` i `x` z potwierdzonym oraz bez potwierdzonego zakonczenia pagera;
- `!<komenda>` z zachowaniem prefiksu, pojedynczego wykonania i znaczenia spoza trybu czytania;
- zrodlo odtwarzanych komend;
- brak zmian archiwum po anulowaniu;
- niezaleznosc i trwalosc obu ustawien;
- brak zadan w tle po wylaczeniu automatycznego odswiezania;
- dokladne teksty tooltipow i stalego komunikatu;
- identycznosc eksportu TXT przed i po optymalizacji;
- date i czas w kazdym wierszu Archiwum, zachowanie dotychczasowych metadanych oraz poprawne `brak daty` dla pustego `dateRaw`.

Obecny `tests/playerMailMode.test.ts`, ktory oczekuje drugiego listingu po recznym wejsciu gracza, musi zostac przebudowany zgodnie z nowymi zasadami.

Plan nie obejmuje podniesienia wersji, wydania ani publikacji w marketplace bez osobnego polecenia.

Po pelnym wdrozeniu calego planu i zakonczeniu testow nalezy usunac jedyny pozostaly tymczasowy dokument: `docs/PLAN_TYMCZASOWY_RECZNEJ_POCZTY_I_WYDAJNOSCI.md`. Nie wolno usuwac go po zakonczeniu pojedynczego punktu ani osobnego etapu.

## 14. Pomoc gry: potwierdzenie `q` i `x` oraz pozostale komendy

Przekazany fragment pomocy gry wprost okresla:

```text
x lub q           Wyjscie z trybu czytania poczty.
```

**Obie komendy sa zatem potwierdzonymi sposobami wyjscia z trybu czytania poczty.** Wczesniejsza niepewnosc dotyczaca `x` zostala usunieta. Obecny warunek `/^(?:q|x)$/i` jest zgodny z pomoca gry.

Nadal zachowujemy dodatkowe wymaganie potwierdzenia powrotu zwyklego promptu przed wznowieniem automatycznych listingow. Nie wynika ono juz z watpliwosci co do `x`, lecz z bezpieczenstwa: sama wyslana komenda nie dowodzi, ze gra zakonczyla przetwarzanie i ze kolejny listing nie trafi do wciaz aktywnej sesji.

### 14.1. Komendy zalezne od aktywnego trybu czytania

Pomoc gry pokazuje, ze problem nie dotyczy wylacznie `r`.

Nawigacja i wyswietlanie:

- `h [<kogo>]` i `H [<kogo>]`;
- `.`;
- `<num>`;
- `<`;
- `>` lub pusty Enter;
- `?`.

Odpowiedzi, tworzenie i przekazywanie listow:

- `r [<num>]`;
- `R [<num>]`;
- `m`;
- `f [<num>] <imie>` i `F [<num>] <imie>`;
- `a <imie>`.

Oznaczanie, kasowanie i notatki:

- `d [<przedzial>]` i `u [<przedzial>]`;
- `- [<przedzial>]` i `+ [<przedzial>]`;
- `e`;
- `n [<num>]`.

Wyjscie:

- `x` lub `q`.

Wszystkie argumenty musza zostac zachowane dokladnie. Szczegolnie `r` i `R` moga wystapic z opcjonalnym numerem, a same wielkie i male litery maja rozne znaczenie.

### 14.2. Jawne wykonanie poza trybem czytania

Pomoc okresla rowniez:

```text
!<komenda>        Wykonanie <komendy> spoza trybu czytania poczty.
```

Moze to wystapic takze podczas pisania listu.

Konsekwencje:

1. `!<komenda>` jest osobna klasa i nie moze byc traktowana jak komenda wymagajaca pagera.
2. Prefiks `!` musi zostac zachowany, a komenda wykonana dokladnie raz.
3. Zamkniecie pagera samo w sobie nie uniemozliwia wykonania `!<komenda>`, poniewaz uzytkownik jawnie chcial wykonac ja poza trybem czytania.
4. `!r` nie jest tym samym co pagerowe `r` i nie wolno laczyc tych przypadkow.
5. Ta informacja nie dowodzi kolizji edytorow i nie uzasadnia samodzielnie przebudowy `EditorSession`. Wymagany jest natomiast test zachowania `!` w transporcie i kolejce.

### 14.3. Pusty Enter

Pusty Enter w trybie czytania oznacza wyswietlenie nastepnego listu. Nie jest wiec pusta, pozbawiona znaczenia operacja.

Przed implementacja trzeba sprawdzic testem transportu, czy `commandHooks` dostarcza pusta komende Enter. Nie wolno zakladac, ze tak sie dzieje bez potwierdzenia.

- Jesli transport dostarcza pusty Enter, objac go tymi samymi zasadami co `>`: przekazanie otwartego pagera albo zakaz odtworzenia po jego zamknieciu.
- Jesli transport go nie dostarcza, udokumentowac ograniczenie przed implementacja i nie deklarowac obslugi, ktorej kod nie moze potwierdzic.

### 14.4. Zakres nowych testow

Oprocz wczesniejszej macierzy:

1. Parametrycznie sprawdzic wszystkie klasy komend z pomocy, z reprezentatywnymi argumentami opcjonalnymi i syntetycznymi identyfikatorami.
2. Dla kazdej komendy pagerowej sprawdzic przekazanie otwartego pagera i zakaz odtworzenia po jego zamknieciu.
3. Sprawdzic rozroznienie `r`/`R`, wielkosci liter i zachowanie argumentow.
4. Sprawdzic pusty Enter zgodnie z rzeczywistym zachowaniem transportu.
5. Sprawdzic `q` i `x` zarowno z powrotem zwyklego promptu, jak i bez niego.
6. Sprawdzic `!<komenda>` podczas czytania oraz zapisu, bez usuwania prefiksu i bez duplikacji.
7. Nie uzywac prawdziwych identyfikatorow, tresci listow ani surowych logow w testach i dokumentacji.


## 15. Data i czas w Archiwum

### 15.1. Stan potwierdzony w kodzie

W zakladce list kazdy wiersz ma osobny element `.arkmail-entry-date`, ktorego tekst pochodzi z `e.date.raw`. Sa to oryginalne dane z listingu, bez dodatkowej konwersji stref czasowych.

W Archiwum wiersz `.arkmail-arch-entry` obecnie zawiera:

- numer porzadkowy i temat w `.arkmail-arch-subject`;
- kierunek, strone listu i skrzynke w `.arkmail-arch-meta`.

Nie ma osobnego elementu z data i czasem.

Rekord `ArchiveLetter` zawiera juz:

- `dateRaw: string | null` z oryginalna data i czasem;
- `sortKey` uzywany do sortowania.

`fromMailboxEntry()` zapisuje `entry.date?.raw ?? null`. `fromOpenedLetter()` zapisuje date z otwartego listu. `normalizeArchive()` potrafi rowniez odzyskac `dateRaw` ze starszych zapisow na podstawie poprawnej daty na koncu osoby albo poprawnego `sortKey`.

**Wniosek:** wyswietlenie daty i czasu nie wymaga nowych listingow, zmiany schematu danych, migracji IndexedDB ani dodatkowego parsowania przy kazdym renderze. Brakujacym elementem jest prezentacja w `render.ts`.

### 15.2. Zakres zmiany

1. Dodac do kazdego wiersza Archiwum osobny element `.arkmail-arch-date` za dotychczasowymi metadanymi.
2. Wyswietlac pelne `dateRaw`, czyli te sama date i czas ktore zakladka list pokazuje przez `date.raw`.
3. Zachowac bez zmian:
   - numer porzadkowy;
   - temat;
   - kierunek `od/do`;
   - strone listu;
   - skrzynke;
   - klikniecie otwierajace list;
   - kolejnosc, filtrowanie i wyszukiwanie.
4. Dla `dateRaw === null` lub wartosci pustej po usunieciu bialych znakow pokazac `brak daty` w wersji UI bez diakrytykow.
5. Nie pokazywac sztucznego `0000-00-00 00:00:00` pochodzacego z pustego `sortKey` i nie zgadywac brakujacej daty.
6. Nie zmieniac `dateRaw`, `sortKey`, identyfikatorow rekordow, eksportu ani danych w storage.
7. Nie dodawac nowych odswiezen, komend pocztowych ani pelnych eksportow TXT w zwiazku z ta zmiana.

### 15.3. Uklad i czytelnosc

1. Data i czas maja byc osobnym tekstem, a nie dopiskiem utrudniajacym testowanie i responsywnosc `.arkmail-arch-meta`.
2. Styl ma odpowiadac `.arkmail-entry-date`: tekst drugorzedny, czytelny w jasnym i ciemnym motywie, rozmiar zalezny od skali okna.
3. Data i czas maja pozostac w calosci bez obcinania; na waskim oknie element ma przejsc do kolejnej linii zamiast zaslaniac temat albo metadane.
4. Nie dodawac nowych przyciskow ani zagniezdzonych elementow interaktywnych w klikalnym wierszu.
5. Nie zmieniac wygladu zakladki list.

### 15.4. Testy i kryteria odbioru

1. Nowy test w `tests/archiveRows.test.ts` ma na starym kodzie wykazac lokalne RED przez brak `.arkmail-arch-date`.
2. Dla rekordu ze znana syntetyczna data test ma sprawdzic dokladny tekst `dateRaw`, w tym date i czas.
3. Ten sam wiersz ma nadal zawierac numer, temat, kierunek, strone listu i skrzynke.
4. Dla `dateRaw === null` i pustego `dateRaw` test ma sprawdzic `brak daty` oraz brak sztucznej daty zerowej.
5. Testy maja potwierdzic niezmienione klikniecie wiersza, kolejnosc rekordow i wynik filtrowania.
6. Test stylow ma sprawdzic brak obcinania daty i zawijanie na waskim oknie.
7. Weryfikacja wizualna na danych syntetycznych ma objac jasny i ciemny motyw, szerokie i waskie okno oraz dlugi temat.
8. Zrzuty i testy nie moga zawierac prawdziwych identyfikatorow, tresci listow ani danych z dostarczonych zrzutow.

Kryterium odbioru: kazdy wiersz Archiwum pokazuje dotychczasowe informacje oraz date i czas z `dateRaw`, a rekord bez daty ma czytelne `brak daty`. Nie powstaja zadne nowe operacje pocztowe ani zmiany danych.

### 15.5. Wynik wdrozenia

- RED na starym kodzie: 40 testow, 37 zaliczonych, 3 niezaliczone. Dwa testy wykazaly brak elementu daty, a trzeci brak jej reguly stylu.
- GREEN po implementacji: 40/40; powiazana regresja Archiwum i UI 148/148.
- Weryfikacja wizualna na danych syntetycznych objela jasny i ciemny motyw, szeroki i waski widok oraz dlugi temat. Wszystkie daty mieszcza sie w wierszach, nie sa obcinane ani lamane w srodku.
- Pelny zestaw: 1056 testow, 1055 zaliczonych, 0 niezaliczonych, 1 pominiety.
- Niezalezne `npm run typecheck` i `npm run build` zakonczyly sie sukcesem.

Nie wykonano testu w prawdziwej grze.


## 16. Scalona analiza i kompletny plan pobierania, naglowkow, odpowiedzi i migracji

### 16.1. Status, zakres i podstawa dowodowa

Ta sekcja zastepuje wczesniejsze, rozdzielone sekcje 16-19. Laczy ich ustalenia, ograniczenia dowodowe, kontrakty docelowe, kolejnosc wykonania i testy w jeden spojny plan. Nie zostawia rownoleglych wariantow wykonania.

Zakres obejmuje:

- pobieranie tresci do Archiwum, tempo, timery i ETA;
- reconnect, anulowanie, idempotentnosc i trwaly zapis;
- jeden rekord pozostajacy bez tresci i dzien z ponad 50 listami;
- pozne odpowiedzi, ich przynaleznosc do sesji i koniec gagowania;
- `Odpowiedz wszystkim`, format odbiorcow i zwykle odpowiedzi;
- zapis pelnych naglowkow, podglad z cache i eksport;
- stare Archiwa, leniwe uzupelnianie i ponowna indeksacje;
- kontakty, filtry, scalanie duplikatow i izolacje postaci;
- diagnostyke, macierz testow, commity i kryteria zakonczenia.

Podstawa poszczegolnych ustalen:

- analiza pobierania: HEAD `73d6a729aa870ea18ffa8fddd4bfbed6451c3a9e`, caly `src/arkmail`, sesje mailbox/pager, transport, blokada, storage, re-kotwiczenie, liczniki i testy;
- analiza reply-all: HEAD `96fe5f334e33c3aa0f1f75dc5f90f66962305198`, przyciski, `LetterContent`, parser, compose, Archiwum, cache i testy;
- analiza podobnych utrat i migracji: HEAD `a4f8cb62eb86253fd445aa9cd4d3b0d2c6862aab`, wszystkie 38 plikow `src/`, dokumentacja protokolu, eksport, kontakty, zapis i cykl zycia postaci;
- wczesniejsze scalenie: HEAD `e4504df53f3b457c770eaa5f1e7479d05ccdfda1`;
- aktualna kontrola calego scalonego planu: HEAD `fae0b99e1fbbc445354682e93d530cec9f3e5e72`.

Aktualna kontrola miala charakter statyczny. Drzewo API zawieralo 299 blobow i nie bylo obciete. Zweryfikowano rozmiar oraz Git blob SHA1 wszystkich 240 plikow spoza `releases/`: nie bylo brakow, plikow nadmiarowych ani rozbieznosci. Nie pobierano 59 historycznych archiwow ZIP z `releases/`, poniewaz nie sa potrzebne do sprawdzenia aktualnych twierdzen o kodzie; kontrola bajtow nie obejmuje tych 59 archiwow i nie wolno przedstawiac jej jako weryfikacji wszystkich 299 blobow.

Ponownie sprawdzono wszystkie 12 sciezek kodu i testow cytowanych w planie oraz aktualna zawartosc mechanizmow im przypisanych. W szczegolnosci potwierdzono:

1. kolizje recznego pagera z rozpoczeta seria `fetchBoxes()`, wyslanie `q` przez `MailboxSession` po prompcie pagera oraz parkowanie tylko przyszlych odswiezen przez `playerMailMode`;
2. kolejkowanie komend w modalu, oznaczanie odtworzonego echa jako `own`, przekazywanie linii subskrybentom przed decyzja o gagowaniu oraz obecny predykat `lock.locked && !composeVisible`;
3. `timeoutMs = 8000`, `idleMs = 400`, `PLAYER_MAIL_MODE_IDLE_MS = 180_000`, opoznione ponowienia 10/25 s, `PAGE_PACE_MS = 400` i `ANCHOR_RETRY_WAITS_MS = [2500, 4000, 4000]`;
4. koszt `archiveExportEntries(state.archive)` podczas renderu, pelne `root.replaceChildren(...nodes)`, serializacje calego przekazanego Archiwum przez `JSON.stringify()` oraz zapis do IndexedDB tylko zmienionych rekordow;
5. lokalny eksport ZIP, lokalne `restoreArchiveTail()` i `rebuildContacts()` oraz istniejace testy odtwarzania starszych wierszy bez dodatkowych komend;
6. brak pelnych `headers` w `ArchiveLetter`, utrate oryginalnych odbiorcow w reply-all, rekonstrukcje naglowkow w podgladzie z cache i eksporcie oraz zachowanie tresci przez `upsertLetters()` przy pustym `body`;
7. przebieg `runArchiveDownload()`, postep `done + failed + missing`, EMA dla ETA, przerwanie po trzech bledach z rzedu, brak automatycznego wznowienia po reconnectcie i redukcje bledu `fetchArchiveBody()` do samego `{ kind: "error" }`;
8. przyjecie numeru listu z odpowiedzi przez `PagerSession` bez porownania z numerem zadanym, obsluge dnia 50+ bez podstawy do falszywego `missing` oraz `clamped` uruchamiajace lokalne odtwarzanie ogona;
9. szesc pol dat, dwie deklaracje `color-scheme: light dark`, brak `.arkmail-arch-date`, obecny format wierszy Archiwum oraz brak obslugi zdarzen widocznosci i fokusu okna;
10. obecny stary kontrakt w `tests/playerMailMode.test.ts`, oczekujacy drugiego listingu po wejsciu gracza, oraz luki testowe dotyczace reply-all, pelnych naglowkow i eksportu.

Kontrola statyczna nie jest wynikiem testow. Nie uruchomiono testow jednostkowych, `typecheck`, builda ani E2E. Nie powtorzono raportowanej proby Chromium 151, nie wykonano profilowania przegladarki i nie zmierzono zachowania dzialajacego klienta. Historyczne HEAD-y powyzej pozostaja podstawa odpowiednich wczesniejszych analiz, a nie oznaczeniem aktualnego stanu repozytorium.

Nie dostarczono zanonimizowanego logu czasow, pelnych komunikatow koncowych ani rejestru klas widocznych linii. Nie wykonano profilowania przegladarki. Dlatego raport rozroznia potwierdzone zachowanie kodu, mozliwe przebiegi zgodne z objawami i kwestie wymagajace pomiaru. Nie przypisujemy konkretnego zdarzenia przegladarce, sieci, serwerowi ani IndexedDB bez dowodu.

Nie zapisano nickow, nazw postaci, tematow, tresci listow ani surowych logow. Wszystkie przyszle dane testowe maja byc syntetyczne. To jest analiza i plan, nie potwierdzenie implementacji.

### 16.2. Obecny przebieg pobierania i rzeczywista idempotentnosc

`Pobierz tresci do archiwum` uruchamia `runArchiveDownload()`:

1. Kandydatami sa rekordy z `body.length === 0` i poprawna `dateRaw`.
2. Petla dziala pod jedna blokada `SessionLock`.
3. `resolveEntry()` ustala aktualny numer przez listing po dacie; numer z Archiwum nie jest wysylany na slepo.
4. `PagerSession.readLetter()` pobiera naglowki i tresc, po czym probuje zamknac pager przez `q`.
5. `upsertLetters()` zapisuje wynik pod `archiveId` wskazanego rekordu, a `persistArchive()` przekazuje Archiwum do storage.
6. Po kandydacie nastepuje pauza 400 ms.
7. `ok` zwieksza `done`; `missing` usuwa rekord dopiero po sprawdzeniu wszystkich skrzynek; `error` zwieksza `failed` i zostawia pusta tresc.
8. Trzy bledy z rzedu zatrzymuja petle, a sukces i `missing` resetuja serie.

Kolejne uruchomienie wybiera kandydatow ponownie z aktualnego Archiwum. Nie korzysta z poprzedniego postepu. Idempotentnosc jest ograniczona do ponownego wyboru rekordow bez tresci:

- niepusta tresc nie jest ponownie pobierana;
- blad, anulowanie i niedokonczony odczyt pozostawiaja kandydata;
- potwierdzone `missing` usuwa rekord;
- odczyt moze sie powtorzyc, jesli poprzednia proba zostala anulowana przed zapisem albo zapis trwaly nie doszedl do skutku.

Nie ma gwarancji exactly-once kazdej komendy ani trwalego dziennika postepu per rekord. Serwer moze juz oznaczyc list jako przeczytany, mimo ze lokalna tresc po anulowaniu nadal jest pusta. Ponowny odczyt jest wtedy zamierzony.

`cancelConnectionOperations()` zwieksza `connectionGeneration`, uniewaznia konteksty, ustawia transport offline, odrzuca oczekujace operacje, anuluje sesje i petle oraz czysci wskazniki biezacych operacji. `runExclusive()` zwalnia blokade po zakonczeniu sesji, a sprawdzenie generacji chroni stan nowej operacji przed czyszczeniem przez stara. Nie ma rownoleglych automatycznych petli pod ta sama blokada.

RAM jest aktualizowany natychmiast, ale trwaly zapis wykonuje kolejka storage. `flush()` wystepuje przy zamykaniu storage, nie przy kazdym reconnectcie. Zamkniecie strony przed zakonczeniem kolejki albo trwaly blad IndexedDB moze zmienic stan odtworzony po restarcie.

### 16.3. Tempo, timery i ETA

W `src/arkmail` nie ma obslugi `visibilitychange`, `document.hidden`, `document.visibilityState`, `window.focus` ani `window.blur`, ktora celowo zmienialaby tempo. Nie ma wlasnego szybkiego trybu na pierwszym planie ani oszczednego trybu w tle.

Operacja zalezy jednak od timerow:

| Miejsce | Nominalny czas | Rola |
|---|---:|---|
| pauza po kandydacie | 400 ms jako osiem timerow po 50 ms | odstep miedzy rekordami |
| `MailboxSession` idle | 400 ms | koniec listingu bez promptu |
| `PagerSession` quiet | 400 ms | wykrycie ciszy |
| proby advance pagera | maksymalnie 3 proby | pusty Enter przed uznaniem tresci za kompletna |
| idle po `q` | 400 ms | zakonczenie bez promptu |
| retry ladowania list | 2000 ms | jedno ponowienie komendy |
| timeout sesji | 8000 ms | zakonczenie awaryjne; pager ma dodatkowy grace |
| retry powtarzanej kotwicy | 2500, 4000, 4000 ms | ponowienia strony |
| pauza miedzy stronami skanu | 400 ms | kolejne listingi |

Nominalne 400 ms nie jest pelnym kosztem rekordu. Bez widocznego promptu moga wystapic proby advance, kolejna cisza przed `q` i dalsza cisza przed zakonczeniem. `setTimeout` okresla najwczesniejsze planowane wykonanie, nie gwarantuje czasu sciennego. Opoznianie timerow opoznia sesje, pauze, retry i watchdog.

Dodatkowy koszt stanowia aktualizacje stanu, renderowanie, serializacja rekordow, listingi re-kotwiczenia, zapisy i kolejka trwalego zapisu.

Zaleznosc od timerow moze tlumaczyc roznice tempa po przelaczeniu okna, jesli srodowisko je opoznia, ale nie jest dowodem przyczyny zgloszenia. Sam fakt przelaczenia okna nie ustala stanu widocznosci strony. Bez pomiaru nie dzielimy czasu miedzy timery, siec, serwer, WebSocket, IndexedDB, renderowanie i sprzet.

ETA uzywa rzeczywistego czasu miedzy przetworzeniami, obejmuje pauze i pozniejszy rekord oraz nie jest resetowane przy zmianie widocznosci. Po powrocie do aktywnego okna stara duza probka moze jeszcze zawyzac prognoze.

### 16.4. Liczniki i mozliwe przyczyny jednego rekordu bez tresci

Archiwum rozroznia:

- `pendingBody`: pusta tresc i poprawna data; rekord trafia do pobierania;
- `undatedBody`: pusta tresc i brak poprawnej daty; rekord nie trafia do pobierania.

`Do pobrania: 1` oznacza `pendingBody = 1`. Nie wolno mieszac go z komunikatem o rekordach nienadajacych sie do pobrania.

Postep to `done + failed + missing`, nie liczba sukcesow. Pasek moze osiagnac koniec mimo bledow, a podsumowanie musi pokazac `Nieudane: N`.

Potwierdzone w kodzie mozliwosci:

1. Pojedynczy blad listingu, kotwiczenia lub pagera zostawia rekord i pozwala zakonczyc zakres postepu. `fetchArchiveBody()` redukuje wyjatek do samego `error`, wiec traci przyczyne.
2. Dzien z ponad 50 listami moze zakonczyc skan jako `incomplete`. Rekord prawidlowo nie jest usuwany jako `missing`, ale pozostaje bez tresci. Zgloszony gesty dzien czyni te sciezke istotna, nie przesadza jednak o niej bez identyfikacji rekordu.
3. Reconnect, `Przerwij`, wejscie gracza w poczte albo circuit breaker przerywaja petle. Biezacy i nieprzetworzone rekordy pozostaja kandydatami.
4. Technicznie zakonczony odczyt z `body = []` moze zwiekszyc `done`, ale nie zastapic tresci. Nie ma osobnego stanu dla pustej odpowiedzi serwera.
5. Brak poprawnej daty pozostawia rekord poza kandydatami i powinien byc widoczny jako `undatedBody`.
6. Blad trwalego zapisu moze wyjasnic powrot pustej tresci po restarcie, ale nie jest podstawowym wyjasnieniem licznika pozostajacego niezmienionym natychmiast po zapisie w RAM.

Sam `missing` nie wyjasnia pozostalego rekordu, poniewaz usuwa go z Archiwum. Moze on wrocic dopiero przez pozniejszy listing.

Najwazniejsza luka diagnostyczna to utrata etapu i kategorii bledu. Bez nich nie da sie po fakcie rozroznic timeoutu, luki dnia, pagera, reconnectu, pustej tresci i zapisu.

### 16.5. Pozne odpowiedzi i granice gagowania

Transport dostarcza linie subskrybentom przed decyzja o wyswietleniu. Gagowanie zachodzi wylacznie dla `type === 'mail' && lock.locked && !composeVisible`. Nie zalezy od `modalActive`, aktywnej subskrypcji konkretnej sesji ani potwierdzenia konca odpowiedzi serwera.

`cleanup()` odhacza subskrybenta i zatrzymuje timery, ale nie zatrzymuje linii dostarczonych pozniej. Po odrzuceniu sesji petla moze kontynuowac, a po ostatnim rekordzie blokada zostaje zwolniona. Pozna linia `mail` moze wtedy trafic do glownego okna.

Zgodny z objawem, ale niedowodzacy konkretnego zdarzenia przebieg:

1. Sesja konczy sie bledem lub anulowaniem.
2. Jej odpowiedz dociera opozniona.
3. Linie przed zwolnieniem blokady sa gagowane, ale nie parsowane przez zamknieta sesje.
4. Linie po zwolnieniu blokady nie sa gagowane.
5. Kilka opoznionych odpowiedzi moze pojawic sie jako seria po zakonczeniu pobierania.

Dodatkowe granice:

- linia bez dokladnej klasy `mail` nie jest gagowana nawet pod blokada;
- straznik osieroconego pagera moze wyslac `q`, ale wyslanie nie potwierdza zamkniecia pagera ani konca starych linii;
- odpowiedzi nie maja identyfikatora operacji ani generacji;
- pozna odpowiedz starej sesji moze trafic do subskrybenta nowej sesji przed decyzja o gagowaniu;
- mailbox sprawdza skrzynke, ale nie zna pelnej tozsamosci zadanej komendy;
- pager przyjmuje `List : N` bez porownania `N` z numerem oczekiwanym.

Sam filtr widocznosci albo przedluzenie gagowania moze ukryc objaw, pozostawiajac ryzyko blednego parsowania i zapisu. Najpierw trzeba ustalic przynaleznosc odpowiedzi do operacji.

### 16.6. Istniejace testy i luki dowodowe

Istniejace testy potwierdzaja:

- zapis tresci i podglad z cache bez komend;
- brak kandydatow po kompletnym pobraniu;
- osobne rekordy blizniakow i zapis pod wlasne `archiveId`;
- usuniecie dopiero po `missing` ze wszystkich skrzynek;
- pozostawienie rekordu przy luce re-kotwiczenia;
- zatrzymanie po trzech bledach i reset serii;
- przerwanie przez uzytkownika i wejscie gracza w poczte;
- reconnect bez `q` do nowej sesji i bez otwarcia starego listu;
- gagowanie listingow i odczytow pod blokada;
- timeout pagera z proba `q` i obsluga osieroconego pagera.

Nie obejmuja bezposrednio:

1. opozniania timerow po zmianie widocznosci lub fokusu;
2. reconnectu w kazdym etapie: kotwica, odczyt, `q`, zapis i pauza;
3. jednego `failed` przy `processed === total` i `Do pobrania: 1`;
4. technicznego sukcesu z `body = []`;
5. dnia 50+ z pozostawieniem rekordu i przyczyna;
6. poznych linii przed i po zwolnieniu blokady z kontrola `gagged`;
7. poznych linii po reconnectcie;
8. starej odpowiedzi podczas nowej sesji mailbox/pagera;
9. linii o klasie innej niz `mail`;
10. bledu trwalego zapisu i restartu;
11. ETA po duzym opoznieniu i powrocie do aktywnego okna.

Testy reply-all dodatkowo utrwalaja stary, bledny kontrakt: oczekuja samego nadawcy i oryginalnego `DW`, nie zawieraja wielu osob w `Do`, a przypadek bez `DW` blednie zrownywuja ze zwykla odpowiedzia. Testy Archiwum nie sprawdzaja zachowania `Do` i `DW`, a testy eksportu rekordu nie wykrywaja utraty pozostalych naglowkow.

### 16.7. Bezposrednia przyczyna reply-all i format odbiorcow

Przycisk jest operacja UI: wypelnia lokalny `composeDraft` i przelacza do `Napisz`. Nie wysyla odpowiedzi.

Obecna logika dla odebranego ustawia `Adresat` na `from`, `DW` na oryginalne `cc` i w ogole nie uzywa `to`. Utrata odbiorcow nastepuje przed walidacja i przed wysylka. Handler wysylki nie usuwa ich pozniej; otrzymuje juz niepelny formularz. Dla wyslanego stosowany jest skrot `to || cc`, ktory miesza role pol.

`LetterContent` zawiera pelne `from`, `to`, `cc`, date i tresc, a parser pagera zachowuje naglowki. Dane przy swiezym odczycie istnieja.

Naglowki `Do` i `DW` moga zawierac przecinki i koncowy spojnik ` i `. Formularz akceptuje przecinki i spacje, ale walidacja odrzuca wolne slowo `i`. Nie wolno tylko skleic pol, poniewaz powstalyby niedozwolony format, duplikaty, aktualna postac jako odbiorca, bledny podzial nazwy wielowyrazowej albo powielenie odbiorcow miedzy polami.

`splitParty()` sluzy kontaktom i przyjmuje jednowyrazowe nazwy zlozone z liter. Nie jest bezpiecznym parserem compose. `splitRecipients()` rozpoznaje znane nazwy wielowyrazowe i aliasy, ale jest parserem advisory i sam nie stanowi kompletnej reguly naglowkowego spojnika oraz kontraktu odpowiedzi. Zwykla deduplikacja kontaktow rowniez nie jest budowaniem prefillu.

Potrzebna jest jedna czysta funkcja core, ktora parsuje naglowkowe listy, korzysta ze znanych nazw i aliasow, zachowuje kolejnosc, deduplikuje i zwraca kanoniczne pola formularza. Nie wolno dzielic mechanicznie kazdej spacji ani normalizowac pozniej recznego wpisu uzytkownika.

### 16.8. Utrata naglowkow w Archiwum, odpowiedziach i eksporcie

`ArchiveLetter` obecnie nie przechowuje pelnych `from`, `to` i `cc`. `fromOpenedLetter()` zapisuje tresc, ale nie komplet naglowkow.

Przy otwarciu z cache:

- odebrany dostaje `from = party`, puste `to` i `cc = null`;
- wyslany dostaje puste `from`, `to = party` i `cc = null`.

Skutki:

1. pierwszy swiezy podglad moze byc pelny;
2. Archiwum zachowuje tylko czesc danych;
3. kolejny podglad z cache traci pozostale naglowki;
4. reply-all, zwykla odpowiedz i cytowanie dziedzicza zastepcze dane;
5. eksport pojedynczy po swiezym odczycie jest poprawny, ale po cache jest niekompletny.

`archiveLetterTxt()` powtarza rekonstrukcje z `party` i nigdy nie przekazuje `cc`. Eksport zbiorczy traci wiec `DW` oraz czesc pozostalych pol niezaleznie od podgladu. Sam `letterTxt()` jest poprawnym rendererem: wypisuje `Od`, `Do` i `DW`, gdy otrzyma pelne dane.

Rekord tylko na `DW` jest szczegolnie wazny. Protokol dopuszcza puste `Do`, a odbiorca `DW` widzi list w odebranych. Po obecnym zapisie i odczyciu cache nie mozna wiarygodnie rozroznic prawdziwego pustego `Do`, rzeczywistego `DW` i nieznanych naglowkow.

`openArchiveFromServer()` dla rekordu bez tresci korzysta z `openWithResolve()`, wiec swiezy odczyt ma pelne `LetterContent`. `openWithResolve()` otwiera wynik, zapisuje go przez `fromOpenedLetter()` i utrwala Archiwum. `archivePseudoEntry()` przenosi `archiveId` przy re-kotwiczeniu swiezego numeru. `resolveEntry()` wybiera rekord po `archiveId`, a fallback metadanych dotyczy tylko starych wpisow bez identyfikatora. Dlatego kazdy blizniaczy rekord musi uzupelniac naglowki niezaleznie i nigdy przez podobne metadane innego wpisu.

Aktualna postac jest dostepna w integracji przez `api.character.getName()` i `api.character.onChange()`. Operacja asynchroniczna musi sprawdzic zarowno postac, jak i generacje przed zapisem oraz przed zmiana compose. Pozny wynik jest odrzucany.

`onSendCompose()` wykonuje `validateCompose()`, rozwija lokalna grupe przez `expandLocalGroup()` i uruchamia advisory `unknownRecipients()`. Korzysta z pol formularza, nie usuwa odbiorcow z poprawnego prefillu i nie wykonuje pozniejszej normalizacji recznego wpisu. `Odpowiedz z cytowaniem` jest osobna sciezka z wlasnym tematem i cytowana trescia; nie wolno zamieniac jej w reply-all.

Nie trzeba ustalac, czy pierwotne zgloszenie dotyczylo List czy Archiwum. Obie sciezki sa potwierdzone i obie wymagaja naprawy.

### 16.9. Kontakty, filtry i elementy poza zakresem zmian

Wiersz Archiwum, kontakty i filtry korzystaja z `party`. `splitParty()` odrzuca caly segment nazwy wielowyrazowej. To potwierdzone ograniczenie parsera, ale zebrane materialy nie dowodza, jak czesto serwerowy listing umieszcza tam taka nazwe lub alias zamiast rozstrzygnietych osob.

Nie wiadomo rowniez z samego kodu, czy kazdy odbiorca `DW` jest juz obecny w `party`. Dodanie `headers` nie moze wiec automatycznie zmienic licznikow, kontaktow ani filtrow.

W tej naprawie:

- `party`, kontakty, liczniki i filtry pozostaja niezmienione;
- zwykle `Odpowiedz` i `Odpowiedz z cytowaniem` pozostaja jednoadresowe;
- `letterTxt()` nie jest przepisywany jako zrodlo bledu;
- handler wysylki nie dostaje nowej normalizacji recznego wpisu;
- import i eksport ksiazki adresowej pozostaja poza migracja Archiwum, bo nie zawieraja listow;
- nie ma automatycznej wysylki ani ponawiania wysylki;
- nie ma zmiany protokolu wysylki;
- osobny przypadek testowy musi poprzedzic jakakolwiek przyszla zmiane semantyki kontaktow.

### 16.10. Nienaruszalne zasady calego planu

- Nie ma rownoleglych automatycznych petli pod ta sama blokada.
- Nie ma automatycznego odtwarzania przerwanej petli po reconnectcie.
- Nie ma `q` do pagera uzytkownika ani pagera nieznanego pochodzenia.
- Komendy uzytkownika maja pierwszenstwo i nie sa odtwarzane w innym kontekscie.
- Odpowiedz niezgodna albo niejednoznaczna nie moze zaktualizowac Archiwum jako sukces.
- Pusta tablica tresci nie jest pobrana trescia.
- Niepelny skan nie moze usunac rekordu jako `missing`.
- Blad zapisu nie moze byc pokazany jako trwale zakonczony sukces.
- Gagowanie nie konczy sie tylko dlatego, ze zakonczyla sie funkcja TypeScript albo zwolniono blokade.
- Nie kasujemy Archiwum, identyfikatorow, kluczy ani zachowanej tresci.
- Nie odtwarzamy nieznanych naglowkow z `party`, podobnego listu, blizniaka, repliki lub aktualnej nazwy postaci.
- Nie wykonujemy masowego pobierania po aktualizacji ani podczas eksportu.
- Nie przenosimy danych miedzy postaciami, rekordami ani skrzynkami.
- Nie przedstawiamy nieznanego jako pustego lub pewnego.
- Nie wysylamy odpowiedzi automatycznie.
- Nie zastepujemy naprawy samym wydluzeniem timeoutow, dodaniem pauz albo przedluzeniem gagowania.
- Nie obiecujemy exactly-once komend, ktorych protokol nie potrafi powiazac identyfikatorem. Celem jest brak nakladania wlasnych sesji, wykrywanie niezgodnosci i bezpieczne ponowienie.

### 16.11. Docelowy wynik per rekord, liczniki i diagnostyka

`fetchArchiveBody()` ma zachowac etap i kategorie wyniku bez danych wrazliwych.

Dozwolone koncowe stany proby:

- `pobrano`: odpowiedz przypisana do wlasciwego rekordu, niepusta tresc i przyjety zapis;
- `nie_ma_w_skrzynce`: dopiero po pelnym sprawdzeniu wszystkich skrzynek;
- `blad_kotwiczenia`;
- `blad_odczytu`;
- `niejednoznaczna_odpowiedz`;
- `pusta_tresc`;
- `blad_zapisu`;
- `anulowano`.

Zasady:

- `body = []` nie zwieksza sukcesow;
- `failed` moze zwiekszac przetworzone, nigdy pobrane;
- anulowanie nie jest normalnym zakonczeniem;
- rekord po bledzie pozostaje kandydatem do swiadomego ponowienia;
- podsumowanie pokazuje osobno pobrane, nieudane, usuniete jako znikniete i pozostale;
- `Do pobrania` pochodzi z rzeczywistego Archiwum, nie z licznika petli;
- jeden blad nie jest ukrywany przez pelny pasek;
- wynik kazdego rekordu jest jednoznaczny, a powod pozostaje dostepny w diagnostyce.

Do odtworzenia konkretnego zdarzenia wystarczy zanonimizowany zapis techniczny:

- planowany i rzeczywisty czas timera;
- identyfikator operacji, generacja i etap;
- jednorazowy pseudonim rekordu;
- rodzaj komendy bez argumentow i tresci odpowiedzi;
- klasa linii, stan blokady, modalu, sesji i decyzja gagowania;
- wynik i kategoria bledu oraz seria bledow;
- luka dnia i zakonczenie skanu;
- rozpoczecie i wynik trwalego zapisu;
- dokladny syntetyczny status Archiwum i podsumowania.

Diagnostyka nie moze zawierac nazw postaci, nadawcow, odbiorcow, tematow ani tresci listow.

### 16.12. Przynaleznosc odpowiedzi, odzyskiwanie i koniec gagowania

Kazda sesja mailbox/pager otrzymuje wlasny identyfikator i generacje polaczenia. Rejestracja subskrybenta jest zwiazana z konkretna sesja. Samo nadanie generacji operacji nie wystarcza, jesli stara linia moze trafic do nowego subskrybenta.

Wymagane zachowanie:

1. Pager porownuje `List : N` z numerem zadanym.
2. Niezgodnosc numeru lub innych dostepnych identyfikatorow daje `niejednoznaczna_odpowiedz` i nie trafia do Archiwum.
3. Normalne zakonczenie wymaga ustalonego konca odpowiedzi, a nie samej ciszy, po ktorej stare linie nadal moga przyjsc.
4. Po timeoutcie lub reconnectcie stara sesja jest zamknieta logicznie, automatyczna petla nie rozpoczyna kolejnej sesji, a linie pocztowe pozostaja gagowane w stanie odzyskiwania.
5. Nowa operacja automatyczna czeka na potwierdzony zwykly prompt albo konczy sie jako przerwana. Nie czeka bez konca i nie zgaduje stanu pagera.
6. Gagowanie wygasa dopiero po zakonczeniu obslugi odpowiedzi albo bezpiecznym zakonczeniu odzyskiwania.
7. Pozna odpowiedz nie moze zaktualizowac innego rekordu, compose ani nowej sesji.

Nie wolno gagowac wszystkich klas na slepo. Dla klas innych niz `mail` najpierw wykonujemy test i rejestr techniczny, potem ustalamy zakres. Zwykly dialog uzytkownika z gra nie moze zostac ukryty.

### 16.13. Reconnect i potwierdzenie trwalego zapisu

Po reconnectcie uzytkownik moze swiadomie uruchomic ponownie pobieranie brakujacych tresci. Stara petla nie odradza sie automatycznie.

Dla kazdego rekordu:

- sukces w RAM i sukces trwalego zapisu sa rozrozniane;
- zapis ma wlasne potwierdzenie zakonczenia zamiast pelnego `flush()` calego Archiwum po kazdym liscie;
- blad IndexedDB daje `blad_zapisu` i konkretny komunikat;
- reconnect nie kasuje potwierdzonych danych;
- po restarcie Archiwum zawiera dokladnie tresci i naglowki, ktorych zapis potwierdzono;
- ponowne uruchomienie wybiera tylko rekordy nadal bez potwierdzonej tresci;
- kolejka write-through nie jest przedstawiana jako gwarancja trwalosci przed zamknieciem strony;
- zamkniecie i ponowne otwarcie sprawdzaja rzeczywisty stan, nie tylko RAM.

Stan wykonania: WDROZONE. Glowny nowy zestaw najpierw wykazal lokalny RED na starym kodzie: 5 testow, 1 zaliczony i 4 niezaliczone; stary kod zwracal `pobrano` przed zakonczeniem zapisu oraz po bledzie IndexedDB i reconnectcie, a magazyn nie mial potwierdzonego zapisu. Dodatkowy przypadek magazynu awaryjnego RAM takze najpierw dal RED, poniewaz falszywie potwierdzal trwalosc. Po implementacji 6 nowych testow przechodzi 6/6. `setLettersConfirmed()` oczekuje na zapis tylko zmienionych rekordow bez pelnego `flush()`, propaguje blad konkretnej operacji i nie przerywa pozniejszej kolejki. Pobieranie wycofuje niepotwierdzona zmiane RAM, zwraca `blad_zapisu` z konkretnym komunikatem i pozostawia rekord do ponowienia. Testy odczytuja baze przed i po zapisie, sprawdzaja reconnect, restart, magazyn wylacznie RAM oraz ponowny wybor wylacznie rekordow bez tresci. Koncowa pelna regresja zakonczyla sie kodem 0: 1083 testy, 1082 zaliczone, 1 pominiety i 0 niezaliczonych; niezalezny typecheck i build zakonczyly sie pomyslnie. Nie wykonano testu w prawdziwej grze.

### 16.14. Dzien z ponad 50 listami i kompletnosc indeksacji

Naprawa obejmuje skan, nie tylko komunikat:

1. Test syntetyczny tworzy co najmniej 51 listow jednego dnia i rekord poza pierwsza strona.
2. Rejestrowana jest sekwencja stron, kotwic i sond wykluczajacych bez danych listow.
3. Skan deterministycznie przeszukuje pelny dostepny zakres dnia zamiast konczyc sie po pierwszej nierozstrzygnietej powtorce.
4. Pelny skan bez rekordu daje `nie_ma_w_skrzynce`.
5. Niepelny skan daje `blad_kotwiczenia` i pozostawia rekord.
6. Blizniacze wpisy sa rozrozniane po `archiveId`; nie wolno pobrac tresci innego listu o tych samych metadanych.
7. Znacznik kompletnej indeksacji wraca dopiero po nowym pelnym potwierdzeniu, nie po zapisie pojedynczej tresci.

Jesli ograniczenie serwera uniemozliwia pelne wyliczenie dnia, rekord pozostaje, a uzytkownik dostaje konkretny powod. Ograniczenia nie wolno zamieniac na falszywy `missing`.

Stan wykonania: WDROZONE. Nowy zestaw najpierw wykazal lokalny RED na starym kodzie: 2 testy, 1 zaliczony i 1 niezaliczony. Po znalezieniu celu na powtorzonej stronie blizniakow stary kod ignorowal `visit.stop` w galezi duplikatow i probowal pobrac kolejna strone. Po przeniesieniu obslugi zatrzymania przed ponawianie duplikatow skan konczy sie natychmiast po znalezieniu wlasciwego `archiveId`, bez dodatkowych kotwic. Drugi test tworzy 51 syntetycznych listow jednego dnia i cel poza pierwsza strona; potwierdza dokladnie 9 komend obejmujacych strony, trzy ponowienia kotwicy i sonde wykluczajaca dzien, wynik `blad_kotwiczenia`, brak odczytu innego listu, brak falszywego `missing`, zachowanie rekordu oraz usuniecie znacznika kompletnej indeksacji. Istniejace testy potwierdzaja ponadto pelny skan bez rekordu jako `nie_ma_w_skrzynce` oraz rozroznianie blizniakow po `archiveId`. Powiazana regresja przeszla 32/32. Koncowa pelna regresja zakonczyla sie kodem 0: 1085 testow, 1084 zaliczone, 1 pominiety i 0 niezaliczonych; niezalezny typecheck i build zakonczyly sie pomyslnie. Nie wykonano testu w prawdziwej grze.

### 16.15. Timery, widocznosc i ETA

- Osiem timerow 50 ms pauzy zostaje zastapionych jednym anulowalnym timerem 400 ms.
- Diagnostyka testowa rejestruje planowany i rzeczywisty czas kazdego etapu.
- Opoznienie nie powoduje serii przyspieszonych komend w celu nadrobienia czasu.
- Zmiana widocznosci rozpoczyna nowa probke ETA, aby stare opoznienie nie zawyzalo prognozy po powrocie.
- Nie ma sztucznego odpytywania ani dodatkowych komend podtrzymujacych aktywnosc.
- Nie obiecuje sie jednakowej szybkosci w tle, jesli srodowisko ogranicza timery.
- ETA i postep wynikaja z rzeczywiscie zakonczonych rekordow, nie z samego uplywu czasu.
- Timery sa sprzatane przy sukcesie, bledzie, anulowaniu, reconnectcie i zamknieciu.

Stan wykonania: WDROZONE. Dwa glowne testy najpierw wykazaly lokalny RED na starym kodzie: 7 testow, 5 zaliczonych i 2 niezaliczone. Stary kod utworzyl timer `50 ms` zamiast jednego `400 ms`, a po `visibilitychange` pozostawil stara prognoze w UI. Po implementacji wspolnego `waitOrCancel()` kazda pauza ma jeden timer, jednokrotne sprzatanie, anulowanie przez flage i nasluch sesji oraz techniczna diagnostyke `plannedMs`, `actualMs`, etapu i wyniku bez danych listow. `DownloadEta` liczy EMA wylacznie po zakonczonych rekordach, a zmiana widocznosci resetuje probke, zachowuje `done/total` i natychmiast usuwa stare ETA. Stara operacja nie kasuje ETA nowej, a dezaktywacja usuwa nasluch widocznosci. Testy potwierdzaja jeden timer `400 ms`, pomiar `400/475 ms`, anulowanie po `125 ms`, brak timera nadrabiajacego, jedna kolejna komende po opoznieniu, brak komend podtrzymujacych aktywnosc, reset EMA i sprzatanie po zamknieciu. Powiazane zestawy przechodza 10/10 i 4/4. Koncowa pelna regresja zakonczyla sie kodem 0: 1094 testy, 1093 zaliczone, 1 pominiety i 0 niezaliczonych; niezalezny typecheck, build i higiena zakonczyly sie pomyslnie. Nie wykonano testu w prawdziwej grze.

### 16.16. Docelowy kontrakt odpowiedzi

Zwykle `Odpowiedz` oraz `Odpowiedz z cytowaniem` pozostaja bez zmian. Temat i tresc zwyklego `Odpowiedz wszystkim` pozostaja puste. Klikniecie tylko wypelnia formularz i nie wysyla listu.

Dla odebranych i nieprzeczytanych:

- `Adresat`: oryginalny nadawca, a nastepnie pozostali bezposredni odbiorcy z `Do`;
- `DW`: oryginalni odbiorcy `DW`;
- aktualna postac jest usuwana z obu list;
- duplikaty miedzy `Od`, `Do` i `DW` sa usuwane bez wielkosci liter, z zachowaniem pierwszego wystapienia i kolejnosci;
- jesli nazwa aktualnej postaci jest nieznana, nie wolno zgadywac; zachowujemy wszystkich odbiorcow zamiast pominac niewlasciwa osobe.

Dla wyslanych i niewyslanych:

- `Adresat`: oryginalni odbiorcy `Do`;
- `DW`: oryginalni odbiorcy `DW`;
- aktualny nadawca nie jest dodawany ponownie;
- obowiazuje ta sama deduplikacja i kontrola aktualnej postaci;
- gdy `Do` jest puste, odbiorcy `DW` trafiaja do wymaganego pola `Adresat`, a `DW` pozostaje puste;
- jesli po odjeciu aktualnej postaci `Adresat` jest pusty, a `DW` nie jest, odbiorcy `DW` przechodza do `Adresat`;
- odbiorcow nie wolno powielac w obu polach;
- jesli po tych regulach nie ma zadnego odbiorcy, formularz nie moze udawac poprawnego prefillu; uzytkownik dostaje konkretny komunikat i nic nie jest wysylane.

Deduplikacja dotyczy wylacznie nowo generowanego prefillu. Po przejsciu do `Napisz` uzytkownik moze edytowac pola, a handler wysylki nie wykonuje nowej normalizacji recznego wpisu. Arkadia ostatecznie weryfikuje odbiorcow.

### 16.17. Model naglowkow i zasada nieznanego

Istniejacy JSON rekordu zostaje rozszerzony o opcjonalny `headers` z `from`, `to` i `cc`.

- Wszystkie trzy wartosci pochodza z jednego zaakceptowanego `LetterContent`.
- Komplet jest zapisywany atomowo w tym samym rekordzie i pod tym samym `archiveId`.
- Obecnosc poprawnego `headers` oznacza znany komplet.
- Brak `headers` oznacza dane nieznane, historyczne albo rekord tylko z listingu.
- `headers.to === ''` jest prawdziwym pustym `Do`, jesli tak wynikalo z pagera.
- `headers.cc === null` jest potwierdzonym brakiem `DW`, jesli tak wynikalo z pagera.
- Brak calego `headers` nie moze byc traktowany jako puste `Do` lub `DW`.
- `fromMailboxEntry()` i sam listing nigdy nie tworza kompletu.
- `fromOpenedLetter()` zapisuje tresc i komplet przy kazdym zaakceptowanym swiezym odczycie.
- Nie ma osobnego numeru wersji rekordu ani znacznika wykonanej migracji.
- Nie ma masowego ponownego pobierania tylko w celu uzupelnienia naglowkow.

Nie wolno tworzic `headers` z `party`, przepisywac aktualnej postaci jako historycznego nadawcy, laczyc pol z roznych rekordow, kopiowac ich miedzy blizniakami lub replikami ani kasowac tresci z powodu braku naglowkow.

To jest rozszerzenie rekordu JSON, nie zmiana schematu IndexedDB. Store `letters`, klucz `[character, letter.id]` i `DATABASE_VERSION = 2` pozostaja bez zmian. `normalizeArchive()` zachowuje nieznane pola, a `WriteThroughStorage` zapisuje caly obiekt danego listu, wiec nowy store, indeks i klucz nie sa potrzebne. Zapis porownuje JSON i zmienia tylko zmienione rekordy; `close()` wykonuje `flush()` przed zamknieciem sterownika, ale nie zastepuje to potwierdzenia trwalego zapisu per rekord w trakcie pobierania.

### 16.18. Docelowy podglad i eksport

Rekord z `headers`:

- otwiera sie z pelnymi `Od`, `Do` i `DW` bez komend;
- dziala z cache i offline;
- reply-all korzysta z pelnych danych;
- zwykla odpowiedz i cytowanie zachowuja swoj kontrakt;
- eksport pojedynczy po cache jest identyczny z eksportem po swiezym odczycie;
- `archiveLetterTxt()` uzywa kompletu jako jednej migawki, nie rekonstrukcji z `party`.

Stary rekord bez `headers`:

- zwykly podglad pozostaje natychmiastowy, lokalny i bez komend;
- pokazuje tylko wiarygodne dane z listingu i tresc;
- nie przedstawia `party` jako pelnego kompletu;
- nie uruchamia pobierania przy samym otwarciu;
- zwykla odpowiedz pozostaje dostepna bez dodatkowego pobierania, ale nie moze przedstawiac nieznanych danych jako pewnych.

Eksport zbiorczy pozostaje operacja lokalna:

1. Rekord z `headers` jest eksportowany w pelni.
2. Rekord bez `headers` zawiera tylko wiarygodne dane z listingu i tresc, bez zgadnietych pol.
3. Podsumowanie wskazuje liczbe rekordow z niepelnymi historycznymi naglowkami.
4. Brak naglowkow nie blokuje pozostalych plikow i nie kasuje danych.
5. Do tresci listu nie sa dopisywane techniczne ostrzezenia.
6. Pozniejsze uzupelnienie powoduje, ze kolejny eksport jest pelny.
7. Eksport nie uruchamia automatycznego pobierania setek listow.

### 16.19. Stare Archiwa, leniwe uzupelnianie i ponowna indeksacja

Aktualizacja uzytkownika jest przezroczysta: instaluje nowa wersje, a plugin otwiera istniejaca baze bez czyszczenia, recznej migracji i wymuszonej re-indeksacji.

Macierz rekordow:

| Stan po aktualizacji | Zachowanie docelowe |
|---|---|
| Bez tresci i bez `headers` | Zwykle otwarcie uzywa istniejacej sciezki serwerowej; sukces zapisuje tresc i komplet |
| Z trescia, bez `headers` | Tresc dziala z cache i offline; naglowkow nie zgadujemy |
| Z trescia i `headers` | Podglad, odpowiedzi i eksport dzialaja bez komend |
| Tylko listing | Pozostaje bez `headers` do pelnego odczytu |
| Bez poprawnej daty | Brak slepych komend; tresc i pozostale dane zostaja |
| List nieobecny na serwerze | Brak lokalnej rekonstrukcji; niepowodzenie nie kasuje tresci |
| Blizniacze rekordy | Kazdy uzupelnia wlasne `archiveId`; brak kopiowania miedzy nimi |
| Replika w innej skrzynce | Nie zmienia `id`, wlasciwosci ani innej repliki |
| Zmiana postaci w trakcie odczytu | Wynik jest odrzucany; zadne dane ani prefill nie przechodza miedzy postaciami |
| Blad trwalego zapisu | Nie raportujemy trwalego uzupelnienia; restart sprawdza rzeczywisty stan |

Dla starego rekordu z trescia i bez `headers` `Odpowiedz wszystkim` uruchamia jeden kontrolowany odczyt:

1. Potwierdza rekord, `archiveId`, postac i generacje.
2. Odnajduje wpis przez istniejaca kotwice.
3. Wykonuje jeden odczyt pagera pod blokada, z jasnym stanem zajetosci i bez automatycznej serii ponowien.
4. Akceptuje tylko odpowiedz zwiazana z zadanym listem zgodnie z zabezpieczeniami sesji.
5. Zapisuje komplet atomowo.
6. Dopiero z pelnego wyniku buduje edytowalny prefill.

Blad, brak daty, brak listu, reconnect, zmiana postaci lub przerwanie pozostawiaja compose bez zmian, nie wysylaja nic, pokazuja konkretny komunikat i nie wykonuja fallbacku do samego nadawcy. Zawartosc Archiwum pozostaje nietknieta poza potwierdzonymi zapisami.

Ponowna indeksacja listingu sama w sobie nie uzupelnia naglowkow. Zachowuje dopasowane rekordy, tresc i wczesniejszy komplet oraz nie tworzy duplikatow. Operacja obejmujaca pelny odczyt uzupelnia naglowki tylko dla rzeczywiscie odczytanych i zwalidowanych listow. Rekordow z trescia nie pobiera sie ponownie tylko dla migracji.

Nalezy rozroznic cztery mechanizmy, ktore korzystaja z Archiwum, ale nie maja tego samego kontraktu:

1. `indexAllBoxes()` jest operacja sieciowa. Pobiera listingi przez `mailbox.fetch()`; pelny przebieg moze przejsc wszystkie strony, a inkrementalny zatrzymuje sie na stronie w calosci znanej. Nie wolno opisywac calej indeksacji jako lokalnej przebudowy bazy.
2. `restoreArchiveTail()` jest juz zaimplementowanym etapem lokalnym po zatrzymaniu inkrementalnym. Po restarcie dokleja starsze wiersze z Archiwum bez dodatkowych komend paginacji, zachowuje swieza pierwsza strone, rozdziela blizniacze rekordy i nie zmienia Archiwum. `tests/indexViewRestore.test.ts` potwierdza tez, ze anulowanie, niekompletny przebieg i zwykle odswiezenie nie uruchamiaja tego odtwarzania. Dodanie `headers` nie moze oslabic tych zabezpieczen; pseudo-wpisy nie moga otrzymywac zgadnietych naglowkow.
3. `rebuildContacts()` oraz zapis i scalanie rekordow sa lokalnymi etapami, ale moga byc wywolywane w trakcie operacji sieciowej. Samo ich wykonanie nie wysyla komend; nie dowodzi to, ze otaczajaca operacja jest offline. Aktualizacje store wywoluja ponadto renderowanie aktywnej zakladki.
4. Problem podobny do przygotowania eksportu ZIP wystepuje podczas renderowania Archiwum i nadal nie jest naprawiony. `archiveExportEntries(state.archive)` sortuje rekordy z trescia, tworzy nazwy oraz pelne TXT wszystkich eksportowalnych listow mimo braku polecenia eksportu. Kolejne aktualizacje podczas indeksacji moga wiec powtarzac ten koszt. Nie jest to jednak pelne generowanie ZIP: render nie wykonuje `TextEncoder`, `buildZip()` ani pobierania pliku i sam nie wysyla komend. Rozwiazaniem pozostaje punkt 1 sekcji 9: w widoku liczyc tylko dostepne i pomijane rekordy, a pelne dane eksportowe tworzyc wylacznie po poleceniu eksportu. Nie wymaga to migracji bazy ani zmiany indeksacji.

Danych, ktorych stara wersja nie zapisala, nie da sie wiarygodnie odtworzyc bez oryginalnego listu na serwerze. Wtedy tresc zostaje, a nieznane naglowki pozostaja nieznane. Eksport takiego rekordu moze byc niekompletny i ma to byc widoczne w podsumowaniu.

### 16.20. Scalanie, storage i downgrade

Implementacja musi zachowac nastepujace niezmienniki:

1. Kolejny listing bez naglowkow nie usuwa kompletu.
2. `upsertLetters()` nie kasuje kompletu przez rekord, w ktorym pole jest nieobecne.
3. Nowy zaakceptowany komplet moze zastapic stary tylko jako jedna migawka.
4. `normalizeArchive()` zachowuje poprawne `headers`, a niepoprawny ksztalt traktuje jako brak danych.
5. `mergeArchiveDuplicates()` nie wybiera pustego lub niekompletnego wariantu kosztem kompletu.
6. Scalanie nie sklada naglowkow z roznych duplikatow i jest deterministyczne.
7. Pozna lub niepowiazana odpowiedz nie nadpisuje innego rekordu.
8. Zapis, odczyt, normalizacja i restart zachowuja dokladnie puste `to` i `cc: null`.
9. Naglowki nie zmieniaja `id`, `party`, `contentKeyOf()`, kolejnosci, kontaktow ani filtrow.
10. Zapis pozostaje per rekord i izolowany per postac; nie przepisuje calego Archiwum.
11. Zmiana naglowkow nie zmienia wersji IndexedDB ani kluczy.
12. Blad zapisu nie jest pokazywany jako trwaly sukces.

Starsza wersja pluginu nadal ignoruje `headers` i zachowuje stary blad. Brak podniesienia wersji bazy unika technicznej blokady otwarcia, ale nie deklarujemy pelnej zgodnosci przy downgrade bez osobnych testow, szczegolnie dla scalania duplikatow.

### 16.21. Zasada red->green i dane testowe

Kazda zmiana wymaga lokalnego dowodu red->green:

1. Najpierw nowy test lub nowa asercja pada na starym kodzie lokalnie.
2. Zachowujemy konkretny wynik red i sprawdzamy, ze test rzeczywiscie rozroznia stary kontrakt od nowego.
3. Dopiero potem powstaje implementacja.
4. Nowy test przechodzi lokalnie.
5. Caly wymagany zestaw, kontrola typow i build przechodza przed commitem.
6. Test i implementacja trafiaja razem dopiero po zielonym wyniku.
7. CI nigdy nie sluzy do celowego pokazania red.

Istniejace testy utrwalajace bledny kontrakt reply-all aktualizujemy w tym samym commicie co poprawke, z zachowanym dowodem, ze nowe przypadki wczesniej padaly na starym kodzie.

Wszystkie dane sa syntetyczne. Zakazane sa prawdziwe nazwy postaci, nicki, tematy, tresci listow i surowe logi. Testy maja pokrywac wszystkie wymienione sciezki i przypadki brzegowe, nie tylko happy path. Deklarowane pelne pokrycie oznacza zamkniecie calej ponizszej macierzy, a nie sam procent linii.

### 16.22. Kompletna macierz testow

#### A. Wyniki, liczniki i pusta tresc

1. Jeden `failed` przy pozostalych sukcesach, pelnym zakresie postepu i `Do pobrania: 1`.
2. `body = []` po technicznie zakonczonym odczycie nie jest sukcesem.
3. `pusta_tresc` pozostawia kandydata i nie nadpisuje istniejacej tresci.
4. `failed` nie jest liczone jako pobrane.
5. Anulowanie nie jest pokazane jako normalne zakonczenie.
6. Podsumowanie rozdziela pobrane, nieudane, znikniete i pozostale.
7. `pendingBody` i `undatedBody` nie sa mieszane.
8. Trzy bledy z rzedu zatrzymuja petle, a sukces i `missing` resetuja serie.
9. Kazdy koncowy stan ma zachowana kategorie i etap bez danych wrazliwych.

#### B. Sesje, pozne odpowiedzi i gagowanie

10. Pozna odpowiedz po timeoutcie przed zwolnieniem blokady.
11. Pozna odpowiedz po zwolnieniu blokady z kontrola `gagged`.
12. Pozna odpowiedz po reconnectcie.
13. Stara odpowiedz podczas nowej sesji mailbox.
14. Stara odpowiedz podczas nowej sesji pagera.
15. `List : N` z numerem innym niz oczekiwany daje niejednoznacznosc i brak zapisu.
16. Linia o klasie innej niz `mail` nie jest objeta slepa zmiana gagowania.
17. Zwykly dialog uzytkownika pozostaje widoczny.
18. Gagowanie konczy sie dopiero po bezpiecznym zakonczeniu odpowiedzi lub odzyskiwania.
19. Timeout, reconnect i przerwanie nie zostawiaja aktywnego starego subskrybenta ani timerow.
20. `q` nie trafia do pagera uzytkownika ani nieznanego pochodzenia.
21. Pozna odpowiedz nie zmienia Archiwum, compose ani nowej operacji.

#### C. Reconnect i trwaly zapis

22. Reconnect podczas re-kotwiczenia.
23. Reconnect podczas odczytu.
24. Reconnect podczas zamykania pagera.
25. Reconnect podczas zapisu.
26. Reconnect podczas pauzy.
27. Brak automatycznego odtworzenia petli i brak rownoleglych petli.
28. Swiadome ponowne uruchomienie wybiera tylko brakujace rekordy.
29. Blad IndexedDB daje `blad_zapisu` i nie jest sukcesem.
30. Restart odtwarza dokladnie potwierdzone tresci i naglowki.
31. Zamkniecie przed zakonczeniem kolejki nie jest przedstawiane jako trwaly zapis.
32. Potwierdzone dane nie znikaja po reconnectcie.
33. Zapis per rekord nie wymaga pelnego `flush()` calego Archiwum po kazdym liscie.

#### D. Re-kotwiczenie i dzien 50+

34. Syntetyczny dzien z co najmniej 51 listami i celem poza pierwsza strona.
35. Deterministyczna sekwencja stron, kotwic i sond.
36. Pelny skan bez rekordu daje `nie_ma_w_skrzynce`.
37. Niepelny skan daje `blad_kotwiczenia` i pozostawia rekord.
38. Blizniacze metadane nie powoduja odczytu cudzego listu.
39. Znacznik kompletnej indeksacji nie wraca po zapisie pojedynczej tresci.
40. Ograniczenie serwera nie jest zamieniane na falszywy `missing`.

#### E. Timery i ETA

41. Opoznione timery z pomiarem planowanego i rzeczywistego czasu.
42. Zmiana widocznosci bez zgadywania polityki przegladarki.
43. Brak serii przyspieszonych komend po opoznieniu.
44. Nowa probka ETA po zmianie widocznosci.
45. Powrot do aktywnego okna nie pozostawia starej zawyzajacej probki.
46. Jedna anulowalna pauza zamiast osmiu timerow.
47. Brak dodatkowych komend podtrzymujacych aktywnosc.
48. Timery sa sprzatane na kazdej sciezce zakonczenia.

#### F. Reply-all i compose

49. Odebrany: jeden nadawca, `Do` z aktualna postacia i jedna inna osoba, puste `DW`; prefill zawiera nadawce i inna osobe.
50. Odebrany z wieloma `Do` i `DW`, lacznie z koncowym ` i `; wynik przechodzi `validateCompose()`.
51. Aktualna postac w `Do` i `DW` jest usuwana bez wielkosci liter.
52. Nadawca powtarzajacy sie w `Do` albo `DW` wystepuje tylko raz.
53. Ta sama osoba w `Do` i `DW` z roznica wielkosci liter zostawia pierwsze wystapienie.
54. Znana nazwa wielowyrazowa lub alias nie jest dzielona.
55. Nieznana nazwa aktualnej postaci nie powoduje zgadywania ani usuwania innych osob.
56. Odebrany tylko z `DW` daje wymaganych odbiorcow bez duplikatow.
57. Wyslany zachowuje odbiorcow `Do` i `DW` oraz nie dodaje aktualnego nadawcy.
58. Wyslany tylko na `DW` przenosi ich do `Adresat`, pozostawia `DW` puste i nie powiela osob.
59. Po odjeciu aktualnej postaci pusty `Adresat` jest uzupelniany z `DW` zgodnie z kontraktem.
60. Brak jakiegokolwiek odbiorcy daje komunikat, brak poprawnego prefillu i brak wysylki.
61. Zwykle `Odpowiedz` i `Odpowiedz z cytowaniem` pozostaja bez zmian.
62. Klikniecie nie wysyla komend i nie zmienia tematu ani tresci poza dotychczasowym kontraktem.
63. Reczny wpis nie jest pozniej automatycznie normalizowany.
64. Reczne zmiany compose nie sa nadpisywane przez niepowodzenie odzyskiwania.

#### G. Naglowki, cache i Archiwum

65. Swiezy odczyt zapisuje pelne naglowki w Archiwum.
66. Odebrany z cache zachowuje `Do` i `DW` bez komend.
67. Wyslany z cache zachowuje `Od` i `DW` bez komend.
68. Restart zachowuje komplet.
69. Puste `to` i `cc: null` sa zachowane dokladnie.
70. Rekord z kompletem nie powoduje dodatkowych komend.
71. Rekord bez tresci korzysta z istniejacej sciezki serwerowej.
72. Rekord tylko z listingu nie otrzymuje pozornego kompletu.
73. Stary rekord z trescia i bez `headers` zachowuje tresc i dziala offline.
74. Niepoprawny ksztalt `headers` jest traktowany jako brak danych.
75. Naglowki nie sa tworzone z `party`, aktualnej postaci, blizniaka ani repliki.
76. Podglad i odpowiedzi po cache sa zgodne ze swiezym odczytem dla tych samych danych.

#### H. Leniwe odzyskiwanie i migracja

77. Stary rekord bez `headers` uruchamia jeden kontrolowany odczyt dla reply-all.
78. Nie ma automatycznej serii ponowien.
79. Pelny prefill powstaje dopiero po zaakceptowanym odczycie.
80. Blad odzyskania nie powoduje fallbacku do samego nadawcy.
81. Blad pozostawia compose bez zmian i nie wysyla nic.
82. Brak daty nie powoduje slepych komend.
83. Brak listu na serwerze nie kasuje tresci.
84. Reconnect i przerwanie nie tworza niepelnego prefillu.
85. Zmiana postaci lub generacji odrzuca pozny wynik.
86. Blizniak uzupelnia wylacznie wlasne `archiveId`.
87. Replika nie zmienia innej skrzynki.
88. Blad zapisu nie jest raportowany jako trwale uzupelnienie.
89. Otwarcie starej bazy w wersji 2 nie wymaga migracji schematu ani recznej akcji.

#### I. Indeksacja, upsert i scalanie

90. Sama indeksacja listingu nie uzupelnia naglowkow.
91. Pelny odczyt podczas pobierania uzupelnia tylko rzeczywiscie odczytane rekordy.
92. Ponowna indeksacja zachowuje tresc, komplet i identyfikatory oraz nie tworzy duplikatow. Inkrementalny przebieg po restarcie odtwarza starsze wiersze z Archiwum bez dodatkowych komend paginacji i bez zmiany rekordow; anulowanie, wynik niekompletny i zwykle odswiezenie nie uruchamiaja tego odtwarzania.
93. Rekordy z trescia nie sa pobierane ponownie tylko dla migracji.
94. Listing bez naglowkow nie kasuje kompletu.
95. Upsert bez pola nie kasuje kompletu.
96. Nowy komplet zastepuje stary atomowo.
97. Normalizacja zachowuje poprawny komplet.
98. Scalanie nie wybiera niekompletnego wariantu kosztem kompletu.
99. Scalanie nie sklada pol z roznych duplikatow i jest deterministyczne.
100. Klucze, `id`, `party`, `contentKeyOf()`, kolejnosc i izolacja postaci pozostaja niezmienione.

#### J. Eksport

101. Eksport pojedynczy po swiezym odczycie.
102. Eksport pojedynczy po cache jest identyczny dla tych samych danych.
103. Odebrany TXT zachowuje `Do` i `DW`.
104. Wyslany TXT zachowuje `Od` i `DW`.
105. Eksport calego Archiwum korzysta z `headers`, nie z rekonstrukcji `party`.
106. Historyczny rekord bez `headers` nie otrzymuje zgadnietych pol.
107. Eksport zbiorczy nie uruchamia masowego pobierania.
108. Podsumowanie poprawnie liczy rekordy z niepelnymi historycznymi naglowkami.
109. Brak kompletu nie blokuje pozostalych eksportow.
110. Do tresci listu nie sa dopisywane techniczne ostrzezenia.
111. Kolejny eksport po uzupelnieniu jest pelny.

#### K. Regresje i kontrole techniczne

112. Kontakty, liczniki i filtry daja niezmienione wyniki dla dotychczasowych przypadkow.
113. Zwykle reczne operacje pocztowe pozostaja bez zmian.
114. Pelny istniejacy zestaw testow projektu przechodzi.
115. Pelne `tsc --noEmit` przechodzi.
116. Build przechodzi.
117. Kontrola higieny repozytorium przechodzi.
118. Teksty UI, komentarze w `src` i komendy gry pozostaja bez polskich diakrytykow.
119. Testy i dokumenty nie zawieraja danych wrazliwych, prawdziwych nickow, tresci listow ani surowych logow.
120. Nie ma zmian pobocznych w ArkSzepcie, innych katalogach roboczych, wersji, wydaniu ani publikacji bez osobnego polecenia.

### 16.23. Kolejnosc wykonania i commity

Kolejnosc zachowuje zaleznosci i dzieli prace na male, kompletne jednostki:

1. Wyniki per rekord, `body = []`, kategorie bledow i podsumowanie.
2. Identyfikacja sesji, walidacja numeru listu, niejednoznaczne odpowiedzi i odzyskiwanie.
3. Pozne linie oraz bezpieczny koniec gagowania.
4. Reconnect i potwierdzanie trwalego zapisu.
5. Skan dnia 50+ i znacznik kompletnej indeksacji.
6. Timery, pomiar opoznien i ETA.
7. Czysta funkcja odbiorcow i poprawny reply-all dla pelnego `LetterContent`.
8. Atomowe `headers`, normalizacja, upsert, storage i scalanie.
9. Podglad z cache oraz eksport pojedynczy i zbiorczy.
10. Leniwe odzyskiwanie starych rekordow i zachowanie ponownej indeksacji.

#### Wynik kroku 1: wyniki per rekord, pusta tresc i podsumowanie

Stan wykonania: WDROZONE.

- RED na starym kodzie: 6 testow, 1 zaliczony i 5 niezaliczonych. Testy wykazaly brak pozostalych rekordow w podsumowaniu, brak diagnostyki, zaliczanie pustej tresci jako sukces oraz kontynuowanie odczytu po anulowaniu kotwiczenia.
- GREEN po implementacji: 6/6. Kazdy rozpoczety rekord ma jeden z osmiu dozwolonych wynikow oraz etap; pusta lub bialoznakowa tresc jest bledem odczytu bez upsertu, a anulowanie nie jest normalnym zakonczeniem.
- Pierwsza powiazana regresja: 52 testy, 51 zaliczonych i 1 niezaliczony. Stare oczekiwanie nie uwzglednialo rzeczywiscie pozostalych rekordow. Po zaktualizowaniu dwoch oczekiwanych komunikatow zgodnie z nowym kontraktem koncowa powiazana regresja przeszla 23/23.
- Podsumowanie rozdziela pobrane, nieudane, znikniete i pozostale rekordy. `Do pobrania` nadal pochodzi z rzeczywistego Archiwum, a diagnostyka zawiera wylacznie techniczne pseudonimy, kategorie, etapy i liczniki bez danych listow.
- Pelny zestaw na Node 26: 1062 testy, 1061 zaliczonych, 0 niezaliczonych i 1 pominiety; kod wyjscia 0.
- Niezalezny `tsc --noEmit -p tsconfig.test.json` oraz build zakonczyly sie pomyslnie.

Nie wykonano testu w prawdziwej grze. Nie zmieniono wersji, nie utworzono wydania i nie wykonano publikacji.

#### Wynik kroku 2: identyfikacja sesji i niejednoznaczne odpowiedzi

Stan wykonania: WDROZONE.

- RED na starym kodzie: podstawowy zestaw 5 testow zakonczyl sie 5 niepowodzeniami; osobny test niezgodnego promptu na starym pagerze dal 1 niepowodzenie, a test reentrantnej dystrybucji dal kolejne 1 niepowodzenie. Wykazaly przyjmowanie cudzego numeru, brak rejestracji sesji, zwykly blad zamiast niejednoznacznosci, zapis cudzej tresci i przekierowanie biezacej linii do nowej sesji.
- GREEN po implementacji: nowe testy 6/6, lacznie z testami adaptera 27/27, a powiazana regresja przed ostatnimi dwoma przypadkami 110/110.
- Mailbox i pager uzywaja odrebnych rejestracji z identyfikatorem oraz generacja polaczenia. Reconnect zamyka stare rejestracje, sprzatanie jest idempotentne, a wlasciciel sesji otrzymuje linie przed globalnymi subskrybentami.
- Pager porownuje `List : N` oraz `(aktualny: N)` z numerem zadanym. Niezgodnosc powoduje bezpieczne `q`, zakonczenie na zwyklym prompcie i `niejednoznaczna_odpowiedz`; taka tresc nie trafia do Archiwum ani do innego rekordu.
- Pierwszy pelny zestaw wykazal 3 regresje: dwie dotyczyly mapowania nowego typu bledu na komunikat uzytkownika, a jedna niespojnego numeru zadania z zachowanymi ramkami forwardu. Po osobnym RED 2/2 i poprawce mappera oraz zgodnosci zadania z ramkami regresja przeszla 9/9 bez zmiany zachowanej fixtury.
- Koncowy pelny zestaw na Node 26: 1070 testow, 1069 zaliczonych, 0 niezaliczonych i 1 pominiety; kod wyjscia 0. Wczesniejszy przebieg mial 3 niezaliczone kontrole higieny wylacznie z powodu braku indeksu Git w tymczasowej kopii; po odtworzeniu indeksu same kontrole przeszly 4/4, a caly zestaw zostal powtorzony z powyzszym wynikiem.
- Niezalezny `tsc --noEmit -p tsconfig.test.json` oraz build zakonczyly sie pomyslnie.

Ustalony koniec odpowiedzi, pozne linie po zakonczeniu i bezpieczne wygaszenie gagowania pozostaja odrebnym zakresem kroku 3. Nie wykonano testu w prawdziwej grze. Nie zmieniono wersji, nie utworzono wydania i nie wykonano publikacji.

#### Wynik kroku 3: potwierdzony koniec odpowiedzi i bezpieczne odzyskiwanie

Stan wykonania: WDROZONE.

- RED na starym kodzie: 6 testow, 0 zaliczonych i 6 niezaliczonych. Wykazaly konczenie mailbox, pagera i importu po samej ciszy, brak gagowania poznych linii, brak blokady nowej sesji oraz brak odzyskiwania po timeoutcie compose. Dodatkowy test komendy oczekujacej w kolejce transportu dal 1 niepowodzenie, a przypadek kasowania wykazal bledne nadpisanie stanu niepewnego przez `complete`.
- GREEN po implementacji: 7/7 nowych testow odzyskiwania oraz 66/66 w koncowej powiazanej regresji adaptera, reconnectu, mailbox, pagera, compose i symulacji edge.
- Timeout i reconnect z aktywna sesja uruchamiaja odzyskiwanie do zwyklego promptu. Pozne linie `mail` pozostaja gagowane takze po zwolnieniu blokady, klasy inne niz `mail` pozostaja widoczne, a nowa sesja lub komenda pluginu konczy sie jako przerwana zamiast zgadywac stan odpowiedzi.
- Mailbox, pager i import nie traktuja ciszy jako sukcesu. Pager nadal moze wyslac `q` po wykryciu niewidocznego promptu pagera, ale zamkniecie transakcji wymaga zwyklego promptu gry. Editor i import uzywaja rejestrowanych sesji, wiec stara odpowiedz nie trafia do nowego compose ani importu.
- Transport sprawdza odzyskiwanie rowniez przy pobieraniu komendy z kolejki, nie tylko przy jej dodawaniu. Niepotwierdzone kasowanie zachowuje fizyczne dowody usuniecia, ale ma wynik `unknown`, nie `complete`.
- Pierwszy pelny zestaw mial 1077 testow, 1074 zaliczone, 2 niezaliczone i 1 pominiety. Jednym bledem bylo stare oczekiwanie nowej sesji bez promptu po reconnectcie; przypadek odtwarzania Archiwum przeszedl nastepnie bez zmian kodu w izolacji. Oba powiazane pliki osiagnely 10/10, a caly zestaw zostal powtorzony.
- Koncowy pelny zestaw na Node 26: 1077 testow, 1076 zaliczonych, 0 niezaliczonych i 1 pominiety; kod wyjscia 0. Niezalezny `tsc --noEmit -p tsconfig.test.json` oraz build zakonczyly sie pomyslnie.

Nie wykonano testu w prawdziwej grze. Nie zmieniono wersji, nie utworzono wydania i nie wykonano publikacji.

Kroki 1-6 zabezpieczaja odczyt przed leniwym uzupelnianiem z kroku 10. Kroki 7-9 moga byc testowane na pelnych danych bez czekania na migracje historyczna, ale calosc nie jest zakonczona przed zamknieciem wszystkich krokow.

Kazdy krok:

- rozpoczyna sie lokalnym red na starym kodzie;
- zawiera implementacje dopiero po tym dowodzie;
- konczy lokalnym green nowego testu i pelnego wymaganego zestawu;
- zawiera `tsc --noEmit`, build i kontrole braku zmian pobocznych;
- aktualizuje ten dokument w tym samym commicie co zakonczony element;
- po zapisie wymaga weryfikacji SHA, komunikatu, rodzica, dokladnych sciezek, drzewa i zawartosci;
- trafia do CI dopiero jako lokalnie zielony;
- nie uzywa force-push;
- po 404, 504 lub 5xx najpierw sprawdza rzeczywisty stan i nie ponawia w ciemno.

Commity sa po polsku, rzeczowe, ASCII i bez wulgaryzmow. Dokumentacja nie zawiera tokenow, sciezek roboczych ani danych wrazliwych. Nie wykonujemy publikacji zewnetrznej bez osobnego, jednoznacznego polecenia.

### 16.24. Kryteria zakonczenia

Prace sa zakonczone dopiero po spelnieniu calego ponizszego zestawu:

- kazdy z 120 przypadkow macierzy ma wymagany dowod i wynik green;
- pelny istniejacy zestaw testow, kontrola typow i build przechodza;
- CI przechodzi bez celowego wczesniejszego red;
- pasek, podsumowanie i licznik `Do pobrania` sa zgodne ze stanem Archiwum;
- pusta tresc i blad zapisu nie sa sukcesami;
- dzien 50+ nie daje falszywego `missing`;
- stare odpowiedzi nie sa widoczne po operacji i nie trafiaja do nowej sesji;
- reconnect nie uruchamia rownoleglej petli ani nie kasuje potwierdzonych danych;
- restart odtwarza tylko rzeczywiscie zapisane dane;
- reply-all nie gubi odbiorcow w Listach ani Archiwum;
- zwykla odpowiedz i cytowanie pozostaja jednoadresowe;
- pelne naglowki przezywaja zapis, restart, indeksacje, upsert i scalanie;
- stare Archiwum dziala bez recznej migracji i masowego pobierania;
- sama indeksacja nie jest przedstawiana jako uzupelnienie naglowkow;
- lokalne odtwarzanie starszych wierszy po indeksacji inkrementalnej pozostaje bez dodatkowych komend i nie zmienia Archiwum;
- render Archiwum nie przygotowuje pelnych TXT bez polecenia eksportu, a wlasciwy eksport nadal dziala lokalnie;
- eksport jest pelny albo uczciwie raportuje historyczne braki;
- zadne nieznane dane nie sa zgadywane;
- kontakty, liczniki i filtry nie zmieniaja sie bez osobnej decyzji;
- dokumentacja odpowiada rzeczywistemu kodowi;
- tymczasowy dokument zostaje usuniety dopiero po pelnym wdrozeniu calego planowanego zakresu, nie po pojedynczej poprawce;
- wlasny katalog roboczy zostaje usuniety po zakonczeniu.

Do czasu wykonania tych krokow nie deklarujemy, ze cala implementacja jest zakonczona ani ze cala aktualizacja zostala juz zweryfikowana. Zakonczone etapy maja wlasne wpisy wykonania; pozostaly zakres nadal jest planem. Nie podniesiono wersji, nie utworzono wydania i nie wykonano publikacji.
