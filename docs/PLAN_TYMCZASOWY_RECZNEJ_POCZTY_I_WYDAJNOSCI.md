# Tymczasowa analiza recznej poczty i wydajnosci

## 1. Status i zakres

Dokument zawiera wyniki analizy ArkMaila 1.30.5 dotyczacej:

- sporadycznej odpowiedzi `Slucham?` po pierwszym recznym `r`;
- mozliwej kolizji automatycznych operacji pocztowych z recznym pagerem gracza;
- zgloszonej blokady klienta trwajacej okolo 7-8 sekund;
- kosztow wydajnosciowych odswiezania, archiwum i interfejsu;
- wariantu pozostawienia samego powiadomienia o nowej poczcie, bez automatycznego sprawdzania skrzynek.

Podstawa analizy: kod z HEAD `0d15414308b8b17a10c19663dcadec844e8a3e91` oraz publiczny kod natywnego modulu poczty Dargotha z rewizji `13a6dce7ed9e55df3e53e9c3515b3ab7b9e8cedc`.

W ramach tej analizy nie zmieniono kodu produkcyjnego ani testow. Nie przeprowadzono profilowania dzialajacego klienta i nie odtworzono konkretnego zdarzenia na zanonimizowanym logu czasow. Dlatego dokument rozroznia:

1. fakty potwierdzone bezposrednio w kodzie;
2. mechanizmy zgodne ze zgloszonymi objawami;
3. kwestie, ktorych nie mozna przypisac do konkretnego zdarzenia bez pomiarow.

Dokument jest tymczasowy. Po pelnym wdrozeniu zatwierdzonych poprawek i zakonczeniu testow nalezy go usunac jako zbedny.

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

Ponizsze ustalenia uzupelniaja plan i rozstrzygaja kwestie omowione po pierwszym zapisie analizy. Nie oznaczaja rozpoczecia implementacji.

### 13.1. Pola dat

Zakres poprawki pol dat pozostaje zapisany osobno w `docs/PLAN_TYMCZASOWY_POL_DAT.md`:

1. Usunac dwie lokalne deklaracje `color-scheme: light dark`.
2. Dodac wspolne `color-scheme: inherit`.
3. Pozostawic obecny natywny picker i sposob wpisywania dat.
4. Nie dodawac wlasnego kalendarza, przyciskow ani `showPicker()`.
5. Sprawdzic wszystkie pola dat w jasnym i ciemnym motywie.

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

### 13.6. Niskokosztowa optymalizacja Archiwum

1. Przed zmiana wykonac pomiar na kilku syntetycznych archiwach o roznej liczbie listow i objetosci tresci.
2. Usunac generowanie pelnych eksportow TXT podczas zwyklego renderowania Archiwum.
3. Podczas renderu sprawdzac jedynie dostepnosc eksportu.
4. Pelne TXT generowac dopiero po poleceniu eksportu.
5. Testem potwierdzic identyczny wynik eksportu przed i po zmianie.
6. Powtorzyc pomiar czasu renderu, najdluzszego zadania i liczby elementow DOM.
7. Nie rozpoczynac wirtualizacji, stronicowania ani duzej przebudowy renderowania bez osobnej decyzji popartej pomiarami.

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

Po pelnym wdrozeniu i zakonczeniu testow nalezy usunac oba tymczasowe dokumenty:

- `docs/PLAN_TYMCZASOWY_POL_DAT.md`;
- `docs/PLAN_TYMCZASOWY_RECZNEJ_POCZTY_I_WYDAJNOSCI.md`.

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


## 16. Analiza pobierania tresci w tle, reconnectow i pozniejszych odpowiedzi

### 16.1. Zakres i podstawa wnioskow

Analiza objela zgloszenie dotyczace:

- szybszego pobierania tresci przy aktywnym oknie i wolniejszego po przelaczeniu na inne okno;
- kilku rozlaczen i ponownych uruchomien pobierania;
- jednego rekordu pozostajacego bez tresci;
- kolejnego pobierania, po ktorym w glownym oknie klienta pojawilo sie kilka odpowiedzi mimo gagowania, a licznik nadal wskazywal jeden rekord do pobrania.

Podstawa jest kod i testy z HEAD `73d6a729aa870ea18ffa8fddd4bfbed6451c3a9e`. Sprawdzono caly kod `src/arkmail` pod katem obslugi widocznosci i fokusu oraz szczegolowo pobieranie tresci, re-kotwiczenie, sesje mailbox/pager, transport, blokade, storage, liczniki i testy tych obszarow.

Nie dostarczono zanonimizowanego logu czasow, dokladnego komunikatu koncowego ani surowych klas widocznych linii. Nie wykonano profilowania przegladarki ani nowych testow. Nie zmieniono kodu produkcyjnego ani testow. Dlatego ponizszy raport rozroznia fakty w kodzie, mozliwe przebiegi zgodne z objawami i kwestie nierozstrzygalne bez pomiaru.

### 16.2. Rzeczywisty przebieg pobierania jednego rekordu

Przycisk `Pobierz tresci do archiwum` uruchamia `runArchiveDownload()`:

1. Kandydatami sa rekordy z `body.length === 0` i poprawna `dateRaw`.
2. Cala petla dziala pod jedna blokada `SessionLock`.
3. Dla kazdego rekordu `resolveEntry()` ponownie ustala aktualny numer listu przez listing po dacie. Numer zapisany w archiwum nie jest wysylany na slepo.
4. `PagerSession.readLetter()` pobiera naglowki i tresc, po czym zamyka pager przez `q`.
5. Po rozwiazaniu odczytu `upsertLetters()` zapisuje tresc pod `archiveId` wskazanego rekordu, a `persistArchive()` przekazuje aktualne archiwum do storage.
6. Po kazdym przetworzonym kandydacie nastepuje pauza `LOAD_ALL_PACE_MS = PAGE_PACE_MS = 400 ms`.
7. Wynik `ok` zwieksza `done`, `missing` usuwa rekord po sprawdzeniu wszystkich skrzynek, a `error` zwieksza `failed` i zostawia rekord z pusta trescia.
8. Trzy bledy z rzedu zatrzymuja petle. Sukces i `missing` resetuja te serie.

Kolejne uruchomienie tworzy kandydatow ponownie z aktualnego archiwum. Nie korzysta z poprzedniej listy kandydatow ani z licznika postepu poprzedniego uruchomienia.

### 16.3. Tempo przy nieaktywnym oknie

#### Fakty w kodzie

W calym `src/arkmail` nie ma obslugi `visibilitychange`, `document.hidden`, `document.visibilityState`, `window.focus` ani `window.blur`, ktora zmienialaby tempo pobierania. ArkMail nie ma wlasnego trybu szybkiego pobierania na pierwszym planie ani trybu oszczedzania w tle.

Operacja jest natomiast zalezna od wielu timerow:

| Miejsce | Nominalny czas | Rola |
|---|---:|---|
| `sleepOrCancel()` po kandydacie | 400 ms | pauza miedzy rekordami; wykonana jako osiem timerow po 50 ms |
| `MailboxSession` idle | 400 ms w konfiguracji wykonawczej | zakonczenie listingu, gdy prompt nie dociera |
| `PagerSession` quiet | 400 ms | wykrycie ciszy po naglowkach i tresci |
| proby advance pagera | maksymalnie 3 proby po ciszy | pusty Enter przed uznaniem tresci za kompletna |
| `PagerSession` idle po `q` | 400 ms | zakonczenie bez docierajacego promptu |
| retry `Listy sa w tej chwili ladowane` | 2000 ms | jedno ponowienie komendy |
| timeout sesji | 8000 ms | zakonczenie awaryjne; przy pagerze dodatkowy grace co najmniej 400 ms |
| retry powtarzanej kotwicy | 2500, 4000, 4000 ms | ponowienia przy powtarzajacej sie stronie |
| pauza miedzy stronami skanu | 400 ms | kolejne strony re-kotwiczenia |

W szczegolnym przypadku bez widocznego promptu pagera kod moze wykonac trzy proby advance, kolejna cisze przed `q` i dalsza cisze przed zakonczeniem. Nominalne 400 ms nie jest wiec pelnym kosztem kazdego rekordu.

`setTimeout` okresla najwczesniejsze planowane wykonanie, nie gwarancje wykonania dokladnie po tym czasie. Opoznienie timera w srodowisku wykonawczym opoznia rowniez przejscie sesji, pauze, retry i sam watchdog timeoutu. Z tego powodu `timeoutMs = 8000` nie jest twardym pomiarem maksymalnego czasu sciennego w obecnosci opozniania timerow.

Niezalezny koszt stanowia praca synchroniczna i zapis:

- kazda zmiana archiwum uruchamia aktualizacje stanu i renderowanie;
- `setLetters()` serializuje rekordy przy porownywaniu i zapisie;
- re-kotwiczenie moze wykonac wiele listingow i zapisow przed jednym odczytem;
- trwaly zapis jest kolejkowany asynchronicznie.

#### Wniosek i granica dowodu

Zaleznosc od timerow jest potwierdzonym mechanizmem, ktory moze tlumaczyc roznice tempa, jesli przegladarka lub klient opoznia timery po przelaczeniu okna. Nie jest to dowod, ze wlasnie to spowodowalo konkretne zgloszenie. Bez pomiaru nie mozna podzielic czasu miedzy timery, siec, serwer, WebSocket, IndexedDB, renderowanie i obciazenie sprzetu.

Sam fakt przelaczenia na inne okno nie wystarcza tez do ustalenia stanu widocznosci strony. Trzeba zmierzyc rzeczywiste zdarzenia i opoznienia w uzywanym kliencie, zamiast przypisywac przegladarce konkretny prog opozniania timerow.

ETA jest liczone z rzeczywistego czasu miedzy przetworzeniami, wiec obejmuje rowniez pauze i pozniejszy rekord. Moze sie dostosowac do wolniejszego tempa, ale nie rozroznia jego przyczyny i nie jest resetowane przy zmianie widocznosci. Po powrocie do aktywnego okna wczesniejsza duza probka moze jeszcze przez kilka rekordow zawyzac ETA.

### 16.4. Reconnect i rzeczywisty zakres idempotentnosci

`cancelConnectionOperations()` po rozlaczeniu lub zdarzeniu konca sesji:

- zwieksza `connectionGeneration`;
- uniewaznia kontekst listingu i podejrzenie osieroconego pagera;
- ustawia transport offline i odrzuca operacje oczekujace na blokade;
- wywoluje anulowanie aktywnych sesji;
- ustawia `cancelled` dla pobierania i innych petli;
- czysci wskazniki biezacych operacji, odswiezenia oczekujace i odpowiedni stan UI.

Aktywna sesja konczy sie przez wlasne odrzucenie, po czym `runExclusive()` zwalnia blokade. Nowe pobieranie nie wchodzi w rownolegla petle pod ta sama blokada. Sprawdzenie generacji w koncowym `finally` chroni stan nowej operacji przed wyczyszczeniem przez stara.

Kazdy pomyslnie odczytany rekord jest przekazywany do archiwum od razu, a nie dopiero na koncu petli. RAM jest aktualizowany natychmiast. Trwaly zapis wykonuje kolejka storage; `flush()` nastepuje przy zamykaniu storage, nie przy kazdym reconnectcie. Blad zapisu jest zglaszany osobno, a oczekujacy rekord moze byc ponowiony przy kolejnej zmianie. Zamkniecie strony przed zakonczeniem kolejki albo trwaly blad IndexedDB moze wiec zmienic stan odtworzony po restarcie, mimo ze wczesniejszy widok w RAM byl kompletny.

**Idempotentnosc jest ograniczona do ponownego wyboru rekordow z pusta trescia:**

- rekord z niepusta trescia nie jest ponownie pobierany;
- rekord po bledzie, anulowaniu albo niedokonczonym odczycie pozostaje kandydatem;
- rekord uznany za `missing` jest usuwany;
- ta sama tresc moze zostac pobrana ponownie, jesli poprzednia operacja zostala anulowana przed zapisem albo zapis trwaly nie doszedl do skutku.

Nie jest to gwarancja wykonania kazdej komendy dokladnie raz ani trwaly dziennik postepu per rekord. Sam serwer moze juz oznaczyc list jako przeczytany, podczas gdy lokalna tresc po anulowaniu nadal bedzie pusta. Ponowny odczyt jest wtedy zamierzony.

Odpowiedzi nie maja powiazanego identyfikatora operacji ani generacji. `connectionGeneration` zatrzymuje stara logike, ale nie oznacza pozniej docierajacych linii. Istniejacy test reconnectu sprawdza brak `q` i brak otwarcia starego listu po anulowaniu, lecz nie sprawdza spoznionej odpowiedzi docierajacej juz w trakcie nowej operacji ani jej widocznosci w glownym oknie.

### 16.5. Dlaczego jeden rekord moze pozostac bez tresci

Licznik w Archiwum rozroznia:

- `pendingBody`: pusta tresc i poprawna data; dokladnie te rekordy trafiaja do pobierania;
- `undatedBody`: pusta tresc i brak poprawnej daty; te rekordy nie trafiaja do pobierania.

Komunikat `Do pobrania: 1` oznacza `pendingBody = 1`. Komunikat o rekordach nienadajacych sie do pobrania jest innym stanem i nie wolno mieszac tych przypadkow.

Postep operacji nie jest liczba sukcesow. `reportProgress()` oblicza:

```ts
processed = done + failed + missing
```

Pasek moze wiec osiagnac koniec zakresu mimo bledow. Koncowe podsumowanie ma wtedy pokazac `Nieudane: N`. Kod potwierdza nastepujace mozliwe przyczyny pozostawienia jednego rekordu:

1. **Pojedynczy blad.** Timeout, blad listingu, blad pagera lub niekompletna re-kotwica zwracaja `error`. Rekord zostaje z pusta trescia, `failed` rosnie, a petla moze kontynuowac i zakonczyc caly pasek. Dokladny wyjatek jest nastepnie odrzucany przez `fetchArchiveBody()`, ktore zwraca tylko `{ kind: "error" }`. Uzytkownik nie dostaje przyczyny per rekord.
2. **Dzien z ponad 50 listami.** Re-kotwiczenie korzysta z `scanMailboxPages()`. Gdy serwer pokazuje tylko czesc gestego dnia i docelowego wiersza nie mozna znalezc, skan zapisuje luke i konczy sie jako `incomplete`. `resolveEntry()` zglasza blad, a nie `missing`. Rekord prawidlowo nie jest usuwany jako znikniety, lecz pozostaje bez tresci. Istniejacy test potwierdza wlasnie taki wynik: `Nieudane: 1`, brak `Nie ma juz w skrzynce` i rekord nadal widoczny. Zgloszony dzien z ponad 50 listami czyni te sciezke szczegolnie istotna, ale bez identyfikacji pozostalego rekordu nie przesadza o niej.
3. **Przerwanie przed ukonczeniem.** Reconnect, reczne `Przerwij`, wejscie gracza w poczte albo circuit breaker zatrzymuja petle. Rekordy nieprzetworzone i rekord z biezacej nieudanej proby pozostaja kandydatami. Przy reconnectcie koncowe czyszczenie starej generacji nie nadpisuje stanu nowej operacji.
4. **Technicznie udany odczyt z pusta tablica tresci.** `done` zwieksza sie po `ok`, ale `upsertLetters()` nie traktuje pustej tablicy jako tresci zastepujacej poprzednia. Rekord z `body = []` pozostanie kandydatem mimo zaliczenia proby. Kod nie ma osobnego stanu rozrozniajacego `nigdy nie pobrano`, `blad pobierania` i `serwer zwrocil pusta tresc`. Nie wiadomo, czy zgloszony list mial taka odpowiedz; wymaga to osobnego testu i dowodu z odpowiedzi.
5. **Brak poprawnej daty.** Rekord zostaje poza kandydatami. Wtedy UI powinno wskazywac grupe `undatedBody`, a nie zwykle `Do pobrania: 1`.
6. **Problem trwalego zapisu.** Moze wyjasnic powrot pustej tresci dopiero po restarcie lub zamknieciu strony. Nie jest podstawowym wyjasnieniem licznika, ktory pozostal niezmieniony natychmiast po pomyslnym zapisie w RAM, bo wtedy trzeba najpierw sprawdzic punkty 1-5.

Sam `missing` nie wyjasnia pozostalego rekordu: taki rekord jest fizycznie usuwany z archiwum. Moze wrocic tylko przez pozniejszy listing, ktory ponownie go wykryje.

**Najwazniejsza luka diagnostyczna:** podsumowanie zawiera liczbe nieudanych, ale tracony jest powod kazdego bledu. Bez zachowania etapu i kategorii bledu nie da sie po fakcie rozroznic timeoutu, luki gestego dnia, odrzucenia przez pager, reconnectu i pustej tresci.

### 16.6. Dlaczego pozne odpowiedzi moga pojawic sie w glownym oknie

Transport dostarcza linie do subskrybentow zawsze, a dopiero potem decyduje o ich wyswietleniu. Gagowanie zachodzi wylacznie, gdy:

```ts
type === 'mail' && lock.locked && !composeVisible
```

Nie jest sterowane przez `modalActive`, aktywna subskrypcje konkretnej sesji ani potwierdzenie, ze serwer zakonczyl odpowiedz.

`cleanup()` mailbox/pagera odhacza subskrybenta i zatrzymuje timery. Nie zatrzymuje natomiast linii, ktore serwer lub klient dostarczy pozniej. Po odrzuceniu sesji `fetchArchiveBody()` moze kontynuowac petle, a po ostatnim rekordzie `runExclusive()` zwalnia blokade. Od tej chwili kazda pozna linia `mail` przechodzi do glownego okna, nawet jesli nalezy do operacji ArkMaila.

Zgodny z objawem przebieg jest wiec technicznie mozliwy:

1. Jedna lub kilka sesji konczy sie bledem albo anulowaniem.
2. Odpowiedzi tych sesji docieraja opoznione.
3. Linie przychodzace przed zwolnieniem blokady sa gagowane, ale juz nie sa parsowane przez zamknieta sesje.
4. Linie przychodzace po zwolnieniu blokady nie sa gagowane i staja sie widoczne.
5. Kilka opoznionych odpowiedzi moze pojawic sie jako seria po zakonczeniu pobierania.

Reconnect tworzy analogiczna granice: anulowanie zamyka subskrypcje, a pozniejsze zwolnienie blokady konczy gagowanie. Nie dowodzi to jednak, ze konkretne widoczne odpowiedzi powstaly wlasnie tak.

Sa jeszcze dwie istotne granice:

- linia bez dokladnej klasy `mail` nie jest gagowana nawet pod blokada; bez rejestru klas nie mozna wykluczyc tej sciezki;
- straznik osieroconego pagera moze wyslac `q` po zwolnieniu blokady, ale samo wyslanie nie jest ani potwierdzeniem zamkniecia pagera przez serwer, ani zabezpieczeniem przed pozniejszymi liniami.

Istniejace testy gagowania potwierdzaja linie w trakcie operacji oraz celowo przywracaja widocznosc linii po operacji. Nie rozrozniaja recznej odpowiedzi od poznej odpowiedzi pluginu. Test reconnectu nie sprawdza tablicy `gagged`. Test timeoutu pagera uzywa prostego mocka transportu bez predykatu gagowania Dargotha. Brakuje zatem bezposredniego dowodu testowego dla scenariusza zgloszenia.

### 16.7. Pozne linie podczas nowej operacji

Samo przedluzenie gagowania nie rozwiazaloby calego problemu. Subskrybenci otrzymuja kazda linie przed decyzja o gagowaniu, a linie nie maja identyfikatora sesji.

Po timeoutcie starej sesji i rozpoczeciu nowej pozna odpowiedz moze zostac odebrana przez subskrybenta nowej sesji. Mailbox czesciowo ogranicza ryzyko przez sprawdzenie skrzynki w naglowku, ale nie zna tozsamosci zadanej komendy. Pager przyjmuje naglowek `List : N` bez porownania `N` z numerem oczekiwanym. W konsekwencji kod nie ma pelnego mechanizmu odrzucenia starej odpowiedzi, ktora dotarla dopiero podczas nowej sesji tego samego typu.

Nie jest to dowod blednego zapisu w zgloszeniu. Jest to potwierdzona granica projektu, ktora wymaga osobnych testow przed zmiana gagowania lub reconnectow. Poprawka powinna najpierw ustalic zasade przynaleznosci odpowiedzi do operacji; w przeciwnym razie mozna jedynie ukryc objaw w glownym oknie, pozostawiajac ryzyko blednego parsowania.

### 16.8. Co potwierdzaja istniejace testy, a czego nie obejmuja

Istniejace testy potwierdzaja:

- zapis tresci i pozniejszy podglad z cache bez komend;
- ponowne uruchomienie bez kandydatow po kompletnym pobraniu;
- osobne rekordy blizniakow i zapis pod wlasne `archiveId`;
- usuniecie rekordu dopiero po `missing` ze wszystkich skrzynek;
- pozostawienie rekordu przy luce re-kotwiczenia i zaliczenie go do `Nieudane`;
- zatrzymanie po trzech bledach z rzedu i reset serii po sukcesie albo `missing`;
- przerwanie przez uzytkownika i wejscie gracza w poczte;
- reconnect bez `q` do nowej sesji i bez otwarcia starego listu;
- gagowanie zwyklych listingow i odczytow w trakcie blokady;
- timeout pagera z proba zamkniecia przez `q` i obsluge podejrzenia osieroconego pagera.

Nie znaleziono testow bezposrednio obejmujacych:

1. opoznianie timerow po zmianie widocznosci albo fokusu;
2. reconnect podczas kazdego etapu masowego pobierania: re-kotwica, odczyt, `q`, zapis i pauza;
3. jeden `failed` przy koncowym `processed === total` i jednoczesnym `Do pobrania: 1`;
4. pomyslny odczyt z `body = []` i zachowanie licznika oraz kolejnego uruchomienia;
5. syntetyczny dzien przekraczajacy limit 50 z pozostawieniem wlasciwego rekordu i komunikatu przyczyny;
6. pozne linie po timeoutcie i po zwolnieniu blokady, z kontrola `gagged`;
7. pozne linie po reconnectcie, z kontrola widocznosci w glownym oknie;
8. pozna odpowiedz starej sesji docierajaca podczas nowej sesji mailbox albo pagera;
9. linie o klasie innej niz `mail` podczas operacji;
10. blad trwalego zapisu i odtworzenie stanu po restarcie;
11. zachowanie ETA po duzym opoznieniu i powrocie do aktywnego okna.

### 16.9. Wymagana diagnostyka przed implementacja

Do rozstrzygniecia konkretnego zdarzenia wystarczy zanonimizowany zapis techniczny bez tresci listow, nazw postaci, nadawcow, odbiorcow i tematow. Powinien zawierac:

- czas zdarzenia i czas wykonania timera wzgledem planowanego czasu;
- kolejny identyfikator operacji, generacje polaczenia i etap;
- jednorazowy pseudonim rekordu, bez danych listu;
- rodzaj komendy bez argumentow i bez tresci odpowiedzi;
- klase linii, stan blokady, modalu, sesji i decyzje o gagowaniu;
- wynik `ok/error/missing`, kategorie bledu i licznik bledow z rzedu;
- informacje o luce dnia i zakonczeniu skanu;
- rozpoczecie i wynik trwalego zapisu;
- dokladny tekst statusu Archiwum i koncowego podsumowania.

Przed zmiana kodu nalezy odtworzyc na danych syntetycznych co najmniej:

1. jeden blad przy pozostalych sukcesach, aby potwierdzic roznice miedzy paskiem przetworzenia a licznikiem sukcesow;
2. dzien z 51 listami, w ktorym docelowy rekord znajduje sie poza dostepna strona;
3. pozna odpowiedz po timeoutcie przed i po zwolnieniu blokady;
4. pozna odpowiedz starej sesji w trakcie nowej;
5. reconnect w kazdym etapie z kontrola zapisu, braku nakladania operacji i gagowania;
6. pusta tablice tresci po technicznie zakonczonym odczycie;
7. opoznione timery z pomiarem czasu kazdego etapu, bez zgadywania polityki przegladarki.

### 16.10. Koncowe wnioski

1. **Nie ma w ArkMailu celowego spowalniania po przelaczeniu okna.** Jest natomiast rozlegla zaleznosc od timerow. Korelacja z aktywnym oknem jest zgodna z mozliwym opoznianiem timerow przez srodowisko, ale wymaga pomiaru.
2. **Wznawianie dziala jako ponowny wybor pustych rekordow, nie jako dokladnie jednokrotne wykonanie.** Sukcesy niepustych tresci sa zachowywane, bledy i anulowania zostawiaja kandydatow. Trwaly zapis ma osobna kolejke i osobne ryzyko.
3. **Jeden rekord po pelnym pasku jest zgodny z pojedynczym bledem.** `failed` wchodzi w postep, ale nie daje tresci. Przy dniu z ponad 50 listami szczegolnie istotna jest potwierdzona sciezka luki re-kotwiczenia. Inne mozliwosci to przerwanie, pusta tablica tresci albo brak daty; po restarcie takze zapis trwaly.
4. **Istnieje potwierdzona w kodzie sciezka widocznosci poznych odpowiedzi.** Gagowanie konczy sie przy zwolnieniu blokady, nie po wygasnieciu mozliwosci dostarczenia starej odpowiedzi. Konkretnego zdarzenia nie mozna przypisac tej sciezce bez czasow i klas linii.
5. **Sam filtr widocznosci nie wystarczy.** Pozna linia moze trafic do nowej sesji przed decyzja o gagowaniu, poniewaz odpowiedzi nie sa powiazane z operacja. Ta kwestia wymaga osobnego testu i projektu poprawki.
6. **Obecna diagnostyka jest niewystarczajaca do pewnego postmortem.** `fetchArchiveBody()` redukuje rozne wyjatki do jednego `error`. Przed implementacja trzeba zachowac kategorie i etap bledu oraz odtworzyc wymienione scenariusze na danych syntetycznych.

Nie wykonano implementacji, zmiany wersji, wydania ani publikacji. Decyzja o zakresie poprawek wymaga osobnego zatwierdzenia po przedstawieniu planu opartego na powyzszych dowodach.

## 17. Plan naprawy pobierania tresci, reconnectow i poznych odpowiedzi

### 17.1. Status i zakres

Ten plan zapisuje uzgodniony kierunek naprawy zgloszenia z sekcji 16. Nie jest potwierdzeniem wykonania implementacji. Kod, wersja, wydanie i publikacja wymagaja osobnych polecen zgodnie z zasadami projektu.

Naprawa obejmuje piec wzajemnie powiazanych obszarow:

1. jednoznaczny wynik kazdego rekordu i prawdziwe liczniki;
2. przynaleznosc odpowiedzi do sesji oraz bezpieczne zakonczenie gagowania;
3. reconnect i potwierdzenie trwalego zapisu;
4. re-kotwiczenie rekordu w dniu z ponad 50 listami;
5. pomiar opoznien timerow i wiarygodne ETA.

Nie wolno zastapic tej naprawy samym wydluzeniem timeoutow, dodaniem kolejnych pauz albo przedluzeniem gagowania.

### 17.2. Nienaruszalne zasady

- Nie ma rownoleglych automatycznych petli pobierania pod ta sama blokada.
- Nie ma automatycznego odtwarzania przerwanej petli po reconnectcie.
- Nie ma `q` do pagera uzytkownika ani pagera nieznanego pochodzenia.
- Komendy uzytkownika maja pierwszenstwo i nie sa odtwarzane w innym kontekscie.
- Odpowiedz niezgodna albo niejednoznaczna nie moze zaktualizowac archiwum jako sukces.
- Pusta tablica tresci nie jest pobrana trescia.
- Niepelny skan nie moze usunac rekordu jako `missing`.
- Blad zapisu nie moze byc pokazany jako trwale zakonczony sukces.
- Gagowanie nie konczy sie tylko dlatego, ze zakonczyla sie funkcja TypeScript albo zwolniono blokade.
- Reczne wpisywanie odbiorcow i reczne operacje pocztowe pozostaja poza zakresem automatycznych przeksztalcen.

Protokol nie dostarcza identyfikatorow odpowiedzi serwera. Nie ma podstaw do obiecywania pelnego exactly-once kazdej komendy. Celem jest brak nakladania wlasnych sesji, odrzucanie wykrytych niezgodnosci i bezpieczne ponowienie odczytu bez przypisania odpowiedzi do niewlasciwego rekordu.

### 17.3. Najpierw lokalne testy RED

Kazda zmiana wymaga lokalnego dowodu red->green. Najpierw test pada na starym kodzie lokalnie, nigdy celowo przez CI. Dopiero potem powstaje implementacja. Przed commitem caly zestaw ma przechodzic na zielono.

Minimalny zestaw nowych scenariuszy:

1. jeden `failed` przy pozostalych sukcesach, pelnym zakresie postepu i `Do pobrania: 1`;
2. technicznie zakonczony odczyt z `body = []`;
3. dzien z 51 listami i docelowym rekordem poza pierwsza strona;
4. reconnect podczas re-kotwiczenia, odczytu, zamykania pagera, zapisu i pauzy;
5. pozna odpowiedz przed i po zwolnieniu blokady;
6. pozna odpowiedz po reconnectcie;
7. pozna odpowiedz podczas nowej sesji mailbox i pagera;
8. naglowek listu z numerem innym niz oczekiwany;
9. linia o klasie innej niz `mail`;
10. opoznione timery i powrot do aktywnego okna;
11. blad trwalego zapisu i odtworzenie stanu po restarcie.

Wszystkie dane testowe maja byc syntetyczne. Nie wolno zapisywac prawdziwych tresci listow, nazw postaci ani surowych logow.

### 17.4. Jednoznaczny wynik rekordu i liczniki

`fetchArchiveBody()` nie moze redukowac wszystkich niepowodzen do jednego `error`. Wynik ma zachowac etap i kategorie bez danych wrazliwych.

Dozwolone koncowe stany proby:

- `pobrano`: odpowiedz przypisana do wlasciwego rekordu, niepusta tresc i przyjety zapis;
- `nie_ma_w_skrzynce`: dopiero po pelnym sprawdzeniu wszystkich skrzynek;
- `blad_kotwiczenia`;
- `blad_odczytu`;
- `niejednoznaczna_odpowiedz`;
- `pusta_tresc`;
- `blad_zapisu`;
- `anulowano`.

Zasady rozliczenia:

- `body = []` nie zwieksza liczby sukcesow;
- `failed` moze zwiekszac liczbe przetworzonych, ale nigdy liczbe pobranych;
- anulowanie nie jest pokazywane jako normalnie zakonczona operacja;
- rekord po bledzie pozostaje kandydatem do kolejnego swiadomego uruchomienia;
- podsumowanie pokazuje osobno pobrane, nieudane, usuniete jako znikniete i pozostale do pobrania;
- `Do pobrania` nadal pochodzi z rzeczywistego stanu archiwum, a nie z licznika petli.

### 17.5. Przynaleznosc odpowiedzi i koniec gagowania

Kazda sesja mailbox/pager otrzymuje wlasny identyfikator i generacje polaczenia. Rejestracja subskrybenta ma byc zwiazana z konkretna sesja. Samo nadanie generacji operacji nie wystarcza, jesli pozna linia nadal moze trafic do subskrybenta nowej sesji.

Wymagane zabezpieczenia:

1. Pager porownuje numer z naglowka `List : N` z numerem zadanym.
2. Niezgodnosc numeru albo innych dostepnych danych identyfikujacych jest wynikiem niejednoznacznym i nie trafia do archiwum.
3. Normalne zakonczenie wymaga ustalonego konca odpowiedzi, a nie samej ciszy, po ktorej stare linie nadal moga przyjsc.
4. Po timeoutcie lub reconnectcie powstaje stan odzyskiwania: stara sesja jest zamknieta logicznie, automatyczna petla nie rozpoczyna kolejnej sesji, a linie pocztowe pozostaja gagowane.
5. Nowa operacja automatyczna czeka na potwierdzony zwykly prompt albo konczy sie jako przerwana. Nie wolno czekac bez konca ani zgadywac stanu pagera.
6. Gagowanie wygasa dopiero po zakonczeniu obslugi odpowiedzi albo bezpiecznym zakonczeniu odzyskiwania.

Nie wolno gagowac wszystkich klas linii na slepo. Dla klas innych niz `mail` najpierw test i rejestr techniczny, potem decyzja o zakresie. Nie wolno ukryc zwyklego dialogu uzytkownika z gra.

### 17.6. Reconnect i trwaly zapis

Po reconnectcie uzytkownik moze swiadomie uruchomic ponownie pobieranie brakujacych tresci. Stara petla nie jest odtwarzana automatycznie.

Dla kazdego rekordu:

- sukces w RAM i sukces trwalego zapisu sa rozrozniane;
- zapis ma wlasne potwierdzenie zakonczenia zamiast pelnego `flush()` calego archiwum po kazdym liscie;
- blad IndexedDB pozostawia jednoznaczny stan niepowodzenia i komunikat;
- reconnect nie kasuje juz potwierdzonych danych;
- po restarcie archiwum zawiera dokladnie tresci, ktorych zapis zostal potwierdzony;
- ponowne uruchomienie wybiera wylacznie rekordy nadal pozbawione potwierdzonej tresci.

Nie wolno przedstawiac samej kolejki write-through jako gwarancji trwalosci przed zamknieciem strony.

### 17.7. Dzien z ponad 50 listami

Naprawa obejmuje skan, nie tylko komunikat.

1. Test syntetyczny odtwarza co najmniej 51 listow jednego dnia i rekord poza pierwsza strona.
2. Rejestrowana jest sekwencja stron, kotwic i sond wykluczajacych.
3. Skan ma deterministycznie przeszukac pelny dostepny zakres dnia zamiast konczyc sie po pierwszej nierozstrzygnietej powtorce.
4. Pelny skan bez rekordu daje `nie_ma_w_skrzynce`.
5. Niepelny skan daje `blad_kotwiczenia` i pozostawia rekord.
6. Blizniacze wpisy sa rozrozniane po `archiveId`; poprawka nie moze pobrac tresci innego listu o tych samych metadanych.
7. Znacznik kompletnej indeksacji wraca dopiero po nowym pelnym potwierdzeniu, nie po samym zapisie pojedynczej tresci.

Jesli ograniczenie serwera uniemozliwia pelne wyliczenie dnia, rekord pozostaje i uzytkownik dostaje konkretny powod. Nie wolno zamieniac tego ograniczenia na falszywy `missing`.

### 17.8. Timery i ETA

- Osiem timerow 50 ms pauzy zostaje zastapionych jednym anulowalnym timerem 400 ms.
- Diagnostyka testowa rejestruje planowany i rzeczywisty czas wykonania etapu.
- Opoznienie nie powoduje serii przyspieszonych komend w celu nadrobienia czasu.
- Zmiana widocznosci rozpoczyna nowa probke ETA, aby stare opoznienie nie zawyzalo prognozy po powrocie.
- Nie ma sztucznego odpytywania ani dodatkowych komend podtrzymujacych aktywnosc.
- Nie obiecuje sie jednakowej szybkosci w tle, jesli srodowisko ogranicza timery.

### 17.9. Kolejnosc i kryteria zakonczenia

Kolejnosc commitow:

1. wyniki per rekord, pusta tresc i podsumowanie;
2. identyfikacja sesji, walidacja odpowiedzi i odzyskiwanie;
3. pozne linie oraz koniec gagowania;
4. reconnect i potwierdzanie trwalego zapisu;
5. skan dnia z ponad 50 listami;
6. timery, pomiar opoznien i ETA.

Przed kazdym commitem: lokalny RED na starym kodzie, implementacja, lokalny GREEN nowego testu, pelny zestaw testow, kontrola typow i brak zmian pobocznych. Po pushu: zielony CI, weryfikacja SHA, komunikatu, rodzica i dokladnych sciezek.

Zakonczenie wymaga jednoczesnie:

- braku widocznych starych odpowiedzi;
- braku zapisu odpowiedzi do zlego rekordu;
- poprawnego wyniku dla dnia 50+;
- zgodnosci paska, podsumowania i licznika;
- bezpiecznego wznowienia po rozlaczeniu;
- potwierdzonej trwalosci zapisu;
- calego zestawu testow i CI na zielono.

## 18. Analiza: Odpowiedz wszystkim pomija odbiorcow z pola Do

### 18.1. Zgloszenie i podstawa analizy

Zanonimizowane zgloszenie opisuje list z jednym nadawca i wieloma odbiorcami w polu `Do`, wsrod ktorych byla aktualna postac. Po wybraniu `Odpowiedz wszystkim` formularz zawieral tylko nadawce. Rozmowa wskazuje rowniez na koniecznosc uwzglednienia `DW`, ale nie dostarczono surowych naglowkow, wiec dokladny uklad osob w `Do` i `DW` pozostaje nieznany.

Analize wykonano na HEAD `96fe5f334e33c3aa0f1f75dc5f90f66962305198`. Sprawdzono sciezke przyciskow odpowiedzi, typ `LetterContent`, parser pagera, formularz i walidacje compose, zapis Archiwum, ponowne otwarcie z cache oraz testy odpowiedzi i Archiwum. Nie wykonano implementacji ani nowych testow.

Do raportu nie zapisano nickow, tresci rozmowy, nazw postaci ani naglowkow prawdziwego listu.

### 18.2. Bezposrednia przyczyna w Listach

Przycisk jest czysta operacja UI. Nie wysyla komendy odpowiedzi do serwera. Wypelnia lokalny `composeDraft` i przelacza uzytkownika do zakladki `Napisz`.

Obecna logika dla `Odpowiedz wszystkim` jest rownowazna:

```ts
adresat = odebrany ? list.from : (list.to || list.cc || '')
dw = list.cc || ''
```

Dla listu odebranego oznacza to:

- `Adresat` = wylacznie `Od`;
- `DW` = wylacznie oryginalne `DW`;
- oryginalne `Do` nie jest w ogole uzyte.

Pominiecie pozostalych odbiorcow nastepuje wiec przed walidacja i przed wysylka. Nie jest to efekt odrzucenia odbiorcow przez serwer. Handler wysylki korzysta dopiero z pol formularza, ktore zostaly juz przygotowane bez osob z `Do`.

Istniejacy test `Odpowiedz wszystkim doklada oryginalne DW` potwierdza to zachowanie: oczekuje nadawcy jako jedynego adresata i samego oryginalnego DW. Test nie zawiera wielu osob w `Do`. Kolejny test twierdzi, ze brak DW oznacza zachowanie jak zwykle `Odpowiedz`, co jest niepoprawnym kontraktem dla listu z wieloma odbiorcami bez DW. Te testy trzeba bedzie zmienic razem z kontraktem, a nie traktowac jako dowodu poprawnosci zgloszonego zachowania.

### 18.3. Drugi problem: utrata naglowkow w Archiwum

`LetterContent` z pagera zawiera pelne `from`, `to`, `cc`, date i tresc. Parser pagera przepisuje naglowki `Do` i `DW` do tych pol. Zatem przy swiezym odczycie dane potrzebne do poprawnego `Odpowiedz wszystkim` istnieja.

`ArchiveLetter` nie przechowuje jednak pelnych naglowkow. Zawiera miedzy innymi `party`, temat, date i tresc, ale nie zachowuje osobno `from`, `to` i `cc`. `fromOpenedLetter()` zapisuje tresc, lecz nie zapisuje pelnych naglowkow do rekordu Archiwum.

Przy ponownym otwarciu rekordu z cache kod konstruuje widok zastepczy:

- dla odebranych: `from = party`, `to = ''`, `cc = null`;
- dla wyslanych: `from = ''`, `to = party`, `cc = null`.

W konsekwencji nawet po wczesniejszym poprawnym odczycie z serwera:

1. pierwsze otwarcie moze miec pelne naglowki w RAM;
2. Archiwum zapisuje tylko czesc danych;
3. kolejne otwarcie z cache traci pozostalych odbiorcow i DW;
4. `Odpowiedz wszystkim` nie ma juz danych potrzebnych do zbudowania pelnej listy.

Nie wiadomo, czy zgloszenie dotyczylo List czy Archiwum. Nie trzeba tego zgadywac: obie potwierdzone sciezki wymagaja naprawy, aby funkcja dzialala konsekwentnie.

### 18.4. Format listy odbiorcow i walidacja

Naglowki `Do` i `DW` sa surowymi lancuchami. Protokol pokazuje liste z przecinkami i koncowym spojnikiem ` i `. Formularz wysylki akceptuje przecinki i spacje, ale walidacja odrzuca wolne slowo `i`.

Dlatego nie wolno tylko skleic `from`, `to` i `cc` oraz przeniesc ich bez zmian do formularza. Taka poprawka moglaby:

- zostawic niedozwolony spojnik `i`;
- zduplikowac nadawce lub odbiorce wystepujacego w kilku polach;
- wpisac aktualna postac do wlasnej odpowiedzi;
- blednie podzielic znana nazwe wielowyrazowa lub alias;
- przy liscie wyslanym tylko na DW wpisac te same osoby jednoczesnie do `Adresat` i `DW`.

Istniejace funkcje nie rozwiazuja tego kompletnie:

- `splitParty()` sluzy kontaktom i zaklada jednowyrazowe imiona; nie jest bezpiecznym parserem compose dla nazw wielowyrazowych i aliasow;
- `splitRecipients()` obsluguje znane nazwy wielowyrazowe, ale jest parserem advisory i nie obsluguje koncowego spojnika naglowkow jako osobnej reguly;
- zwykla deduplikacja kontaktow jest inna operacja niz zbudowanie nowej listy odbiorcow odpowiedzi.

Potrzebna jest jedna czysta funkcja core, ktora parsuje naglowkowa liste odbiorcow, korzysta ze znanych nazw i aliasow do rozwiazania nazw wielowyrazowych oraz zwraca kanoniczne pola formularza. Nie wolno uzywac mechanicznego dzielenia kazdej spacji.

### 18.5. Rekomendowany kontrakt odpowiedzi

Zwykle `Odpowiedz` oraz `Odpowiedz z cytowaniem` pozostaja bez zmian. Temat i tresc zwyklego `Odpowiedz wszystkim` pozostaja puste. Klikniecie nadal tylko wypelnia formularz; nie wysyla listu automatycznie.

Dla `Odpowiedz wszystkim` na liscie odebranym albo nieprzeczytanym:

- `Adresat`: oryginalny nadawca, a nastepnie pozostali bezposredni odbiorcy z `Do`;
- `DW`: oryginalni odbiorcy `DW`;
- aktualna postac jest usuwana z obu list;
- duplikaty miedzy `Od`, `Do` i `DW` sa usuwane bez wielkosci liter, z zachowaniem pierwszego wystapienia i kolejnosci;
- jesli nazwa aktualnej postaci jest nieznana, nie wolno zgadywac. Bezpieczniej jest zachowac wszystkich odbiorcow niz pominac niewlasciwa osobe.

Dla listu z `wyslane` albo `niewyslane`:

- `Adresat`: oryginalni odbiorcy `Do`;
- `DW`: oryginalni odbiorcy `DW`;
- aktualny nadawca nie jest dodawany ponownie;
- obowiazuje ta sama deduplikacja i kontrola aktualnej postaci;
- gdy `Do` jest puste, odbiorcy `DW` trafiaja do wymaganego pola `Adresat`, a `DW` pozostaje puste. Nie wolno powielac ich w obu polach;
- jesli po odjeciu aktualnej postaci `Adresat` jest pusty, a `DW` nie jest, odbiorcy `DW` przechodza do `Adresat`;
- jesli po tych regulach nie ma zadnego odbiorcy, formularz nie moze udawac poprawnego prefillu. Pokazuje konkretny komunikat i nie wysyla nic.

Deduplikacja dotyczy wylacznie nowo generowanego prefillu. Po przelaczeniu do `Napisz` uzytkownik moze edytowac pola, a handler wysylki nie dokonuje nowej normalizacji recznego wpisu. Nie zmienia to zasady, ze Arkadia ostatecznie weryfikuje odbiorcow.

### 18.6. Zachowanie pelnych naglowkow w Archiwum

Rekord Archiwum powinien dodatkowo przechowywac komplet naglowkow potrzebnych do odpowiedzi, na przyklad jako opcjonalny obiekt `headers` z `from`, `to` i `cc`.

Zasady:

- obecnosc `headers` oznacza znany komplet, takze gdy `to` jest puste albo `cc` jest `null`;
- brak `headers` oznacza rekord starszej wersji i nie wolno przedstawiac go jako pelnego;
- `fromOpenedLetter()` zapisuje naglowki przy kazdym swiezym odczycie;
- listing bez tresci i naglowkow nie kasuje wczesniej zachowanego kompletu;
- `party`, `archiveId`, sortowanie, kontakty, filtry, format eksportu i dotychczasowa tresc pozostaja zgodne z obecnymi zasadami;
- to rozszerzenie istniejacego rekordu JSON, nie zmiana identyfikatorow ani migracja schematu IndexedDB;
- nie ma masowego ponownego pobierania listow tylko w celu uzupelnienia naglowkow.

Przy otwarciu z cache rekord z kompletem naglowkow uzywa ich bez komend do serwera.

Dla starego rekordu bez kompletu nie wolno po cichu wykonac niepelnego `Odpowiedz wszystkim`. Klikniecie powinno uruchomic kontrolowany odczyt z serwera przez istniejaca re-kotwice, zapisac komplet i dopiero wtedy wypelnic formularz. Przy bledzie, braku daty, reconnectcie albo niejednoznacznej odpowiedzi:

- nie ma automatycznego fallbacku do samego nadawcy;
- zwykle `Odpowiedz` pozostaje dostepne;
- uzytkownik dostaje konkretny komunikat;
- nie ma wysylki ani zgadywania odbiorcow.

### 18.7. Testy wymagane przed implementacja

Najpierw lokalne RED na obecnym kodzie, potem implementacja i pelny GREEN przed commitem.

Minimum:

1. Odebrany: jeden nadawca, `Do` z aktualna postacia i jedna inna osoba, puste `DW`; prefill zawiera nadawce i te inna osobe.
2. Odebrany: wielu odbiorcow `Do` i wielu `DW`, lacznie z koncowym ` i `; wynik przechodzi `validateCompose()`.
3. Aktualna postac w `Do` i `DW` zostaje usunieta bez wielkosci liter.
4. Nadawca powtarza sie w `Do` albo `DW`; wystepuje tylko raz.
5. Ta sama osoba w `Do` i `DW` z roznica wielkosci liter; zostaje pierwsze wystapienie.
6. Znana nazwa wielowyrazowa lub alias nie zostaje podzielony.
7. Nieznana nazwa aktualnej postaci nie powoduje zgadywania ani usuwania innych osob.
8. List tylko z `DW` daje wymaganego adresata i puste `DW` bez duplikatow.
9. Wyslany: `Odpowiedz wszystkim` zachowuje odbiorcow `Do` i `DW`, nie dodaje aktualnego nadawcy.
10. Wyslany tylko na `DW`: brak powielenia odbiorcow w obu polach.
11. Zwykle `Odpowiedz` i `Odpowiedz z cytowaniem` pozostaja bez zmian.
12. Klikniecie nie wysyla komend i nie zmienia tematu ani tresci poza dotychczasowym kontraktem.
13. Swiezy odczyt zapisuje pelne naglowki w Archiwum.
14. Zamkniecie i ponowne otwarcie z cache zachowuje `Do` i `DW`, bez komend.
15. Zapis, restart i odczyt rekordu zachowuja komplet naglowkow.
16. Stary rekord bez kompletu uruchamia kontrolowany odczyt zamiast niepelnego prefillu.
17. Blad odzyskania starych naglowkow nie powoduje fallbacku do samego nadawcy.
18. Listing bez naglowkow nie kasuje wczesniej zapisanego kompletu.

Istniejace testy utrwalajace stary kontrakt nalezy zaktualizowac w tym samym commicie co poprawka, z zachowaniem dowodu, ze nowy test najpierw padl na starym kodzie.

### 18.8. Zakres implementacji po osobnym poleceniu

1. Czysta funkcja core budujaca odbiorcow odpowiedzi, z parserem naglowkow, deduplikacja i obsluga aktualnej postaci.
2. Podpiecie funkcji pod `Odpowiedz wszystkim` bez zmiany zwyklego `Odpowiedz` i cytowania.
3. Dodatkowe zachowanie kompletu naglowkow w Archiwum i odtwarzanie ich z cache.
4. Kontrolowane odzyskanie naglowkow dla starego rekordu, bez niepelnego fallbacku.
5. Testy jednostkowe, UI, Archiwum, storage i pelny zestaw projektu.

Nie sa potrzebne zmiany protokolu wysylki, automatyczne wysylanie odpowiedzi, nowe listingi przy nowych rekordach ani migracja identyfikatorow Archiwum. Nie wolno ograniczyc poprawki do doklejenia `l.to` w jednej linii renderu, poniewaz zostawilaby format ` i `, duplikaty, aktualna postac i utrate naglowkow w Archiwum.

### 18.9. Koncowy wniosek

Zgloszenie jest potwierdzonym bledem ArkMaila. Dla odebranych `Odpowiedz wszystkim` pomija cale oryginalne `Do`, a testy obecnie utrwalaja ten bledny kontrakt. Dodatkowo Archiwum traci `Do` i `DW` przy zapisie oraz ponownym otwarciu z cache.

Poprawka ma zapewnic pelny, edytowalny prefill dla wszystkich odbiorcow, z usunieciem aktualnej postaci i duplikatow, bez automatycznej wysylki oraz bez zgadywania przy starych lub niekompletnych danych.


## 19. Analiza: podobne utraty naglowkow i aktualizacja istniejacych Archiwow

### 19.1. Zakres i glowny wniosek

Analize wykonano na HEAD `a4f8cb62eb86253fd445aa9cd4d3b0d2c6862aab`. Przeszukano wszystkie 38 plikow `src/`, dokumentacje protokolu i zasad oraz testy odpowiedzi, Archiwum, cache, eksportu, kontaktow, compose, zapisu i cyklu zycia postaci. Szczegolowo przesledzono wszystkie odczyty `from`, `to`, `cc` i `party`, zapis i odczyt rekordow, normalizacje, scalanie, kolejne listingi, eksport oraz restart. Nie zmieniono kodu i nie uruchamiano nowych testow.

Podobny problem wystepuje w trzech powiazanych obszarach:

1. `Odpowiedz wszystkim` pomija oryginalne `Do` dla odebranych, co opisano w sekcji 18.
2. Podglad listu z Archiwum zastepuje pelne naglowki danymi z `party` i ustawia `cc: null`.
3. Eksport Archiwum do TXT/ZIP samodzielnie powtarza te sama rekonstrukcje z `party`, tracac `DW` oraz czesc pozostalych naglowkow.

Eksport pojedynczego listu po otwarciu z cache dziedziczy problem podgladu. Swiezy eksport z pelnego odczytu jest poprawny, poniewaz `letterTxt()` przenosi wszystkie przekazane pola.

Nie jest potrzebna migracja struktury IndexedDB ani reczna akcja uzytkownikow po aktualizacji. Potrzebne jest natomiast dodatkowe pole w rekordzie JSON i leniwe uzupelnianie brakujacych naglowkow z serwera. Dawnych naglowkow, ktorych obecna wersja nie zapisala, nie mozna wiarygodnie odtworzyc z lokalnego `party`.

### 19.2. Mapa potwierdzonych usterek

| Obszar | Potwierdzone zachowanie | Skutek |
|---|---|---|
| Swiezy list, `Odpowiedz wszystkim` | Dla odebranych pomija cale `Do` | Odpowiedz trafia tylko do nadawcy i ewentualnego `DW` |
| Podglad z cache | Odebrany dostaje `from = party`, puste `to` i `cc`; wyslany dostaje puste `from`, `to = party`, puste `cc` | Widok po restarcie lub ponownym otwarciu z Archiwum jest niekompletny |
| Odpowiedzi z cache | Przyciski korzystaja z zastepczych pol podgladu | `Odpowiedz wszystkim` ponownie gubi odbiorcow; zwykla odpowiedz i cytowanie dziedzicza braki danych, choc ich kontrakt pojedynczego adresata ma zostac bez zmian |
| Eksport pojedynczego listu | Uzywa aktualnego stanu podgladu | Po swiezym odczycie jest pelny, po otwarciu z cache jest niekompletny |
| Eksport calego Archiwum | `archiveLetterTxt()` tworzy `Od` albo `Do` z `party` i nigdy nie przekazuje `cc` | Odebrany TXT pomija `Do` i `DW`; wyslany TXT pomija `Od` i `DW` |
| Zapis pelnego odczytu | `fromOpenedLetter()` zapisuje `body`, ale nie zachowuje `from`, `to`, `cc` | Pozniejszy podglad i eksport nie maja juz dostepu do pelnych danych |

Wyslany tylko na `DW` jest szczegolnym przypadkiem. Protokol dopuszcza puste `Do`. Po obecnym zapisie i odczyciu z cache nie ma juz wiarygodnego rozroznienia miedzy pustym `Do`, rzeczywistym `DW` i nieznanymi naglowkami. Nie wolno wowczas zgadywac adresata z samego kierunku skrzynki.

### 19.3. Co nie jest przyczyna i czego nie nalezy zmieniac

1. `letterTxt()` jest poprawnym rendererem: wypisuje `Od`, `Do` i `DW`, gdy otrzyma pelne dane. Bledem jest wejscie zbudowane przez `archiveLetterTxt()` albo podglad z cache, a nie sam format TXT.
2. Handler wysylki nie usuwa odbiorcow przygotowanych przez poprawny prefill. Rozwija jedynie lokalna grupe, wykonuje advisory i przekazuje wartosci pol do edytora. Nie nalezy dodawac pozniejszej normalizacji recznego wpisu.
3. Zwykle `Odpowiedz` i `Odpowiedz z cytowaniem` maja zachowac kontrakt pojedynczego adresata. Nie nalezy zamieniac ich w `Odpowiedz wszystkim`.
4. Wiersz Archiwum pokazuje `party` z listingu i nie musi stac sie pelnym podgladem naglowkow.
5. Eksport i import JSON ksiazki adresowej nie zawieraja listow. Nie sa sciezka migracji Archiwum i pozostaja poza ta zmiana.
6. Nie nalezy wlaczac automatycznej wysylki ani ponawiac wysylki w zwiazku z uzupelnianiem naglowkow.

### 19.4. Kontakty i filtry: ograniczenia, ale nie ten sam potwierdzony blad

Obie funkcje filtrowania Archiwum korzystaja z `party`. Kontakty rowniez powstaja z `party`, a `splitParty()` zaklada jednowyrazowe nazwy zlozone wylacznie z liter. Taka sama nazwa wielowyrazowa jest odrzucana jako caly segment. Inna czesc kodu, `splitRecipients()`, potrafi juz rozpoznawac znane nazwy wielowyrazowe i aliasy.

To jest potwierdzone ograniczenie parsera kontaktow. Nie ma jednak w zebranych materialach dowodu, jak czesto serwerowy listing umieszcza w `party` nazwe wielowyrazowa lub alias zamiast rozstrzygnietych osob. Dlatego nie nalezy deklarowac konkretnej skali bledu ani przepisywac kontaktow bez odpowiedniego przypadku testowego.

Pelne naglowki `DW` rowniez nie zasilaja obecnie kontaktow ani filtrow. Nie wiadomo z samego kodu, czy kazdy taki odbiorca jest juz uwzgledniony w `party` listingu. Zmiana licznikow i wynikow filtrowania po dodaniu `headers` bylaby wiec osobna decyzja produktowa, a nie nieskomplikowana naprawa reply-all.

Rekomendacja dla poprawki naglowkow: `party`, kontakty, liczniki i filtry pozostaja niezmienione. Osobny przypadek testowy powinien rozstrzygnac nazwy wielowyrazowe i obecnosc odbiorcow `DW` w listingu, zanim zmieni sie semantyke kontaktow.

### 19.5. Obecny format zapisu i rodzaj potrzebnej migracji

Sterownik IndexedDB ma wersje 2. Kazdy list jest osobnym rekordem w store `letters`, identyfikowanym przez `[character, letter.id]`, a jego zawartosc jest zserializowanym JSON. `WriteThroughStorage` zapisuje caly obiekt danego listu i porownuje wartosci, dzieki czemu zmiana jednego rekordu nie wymaga przepisywania calego Archiwum.

`normalizeArchive()` zachowuje nieznane pola przez spread. Dopasowanie kolejnej strony listingu zwraca istniejacy rekord zamiast zastepowac go nowym rekordem bez tresci. `upsertLetters()` rowniez zachowuje poprzednie pola, gdy przychodzacy obiekt ich nie zawiera. Te wlasnosci pozwalaja dodac naglowki bez zmiany schematu bazy.

Nalezy rozroznic trzy dzialania:

1. **Migracja struktury IndexedDB: niepotrzebna.** Bez nowego store, indeksu, klucza i podniesienia `DATABASE_VERSION`.
2. **Rozszerzenie rekordu JSON: potrzebne.** Opcjonalny `headers` z kompletem `from`, `to`, `cc`, zapisywany wylacznie z poprawnie sparsowanego i zaakceptowanego `LetterContent`.
3. **Uzupelnienie danych historycznych: leniwe, per rekord.** Nie jest to jednorazowa migracja calej bazy i nie wymaga masowego ruchu sieciowego.

Nie jest potrzebny osobny numer wersji rekordu ani znacznik wykonanej migracji. Obecnosc poprawnego `headers` oznacza znany komplet; jego brak oznacza dane historyczne lub rekord tylko z listingu. Nie wolno traktowac pustego `to` albo `cc: null` jako dowodu, ze rekord jest stary.

### 19.6. Zasada nieznanego nie jest pustym

Komplet `headers` musi byc atomowy: wszystkie trzy pola pochodza z tego samego zaakceptowanego odczytu listu. Puste `to` i `cc: null` sa prawidlowymi wartosciami, gdy rzeczywiscie wystapily w pagerze. Natomiast brak calego `headers` oznacza, ze plugin nie zna pelnych naglowkow.

W konsekwencji:

- nie wolno tworzyc `headers` z `party`;
- nie wolno przepisywac aktualnej nazwy postaci jako historycznego nadawcy;
- nie wolno laczyc `from` z jednego rekordu z `to` lub `cc` z innego;
- nie wolno uzupelniac brakow przez podobny list, blizniaka albo replike w innej skrzynce;
- nie wolno przedstawiac nieznanego `Do` lub `DW` jako pustego pola;
- nie wolno kasowac istniejacej tresci z powodu braku naglowkow.

### 19.7. Macierz aktualizacji istniejacych rekordow

| Stan rekordu po aktualizacji | Zachowanie docelowe |
|---|---|
| Bez tresci i bez `headers` | Zwykle otwarcie korzysta z istniejacej sciezki serwerowej; udany odczyt zapisuje jednoczesnie tresc i komplet naglowkow |
| Z trescia, bez `headers` | Tresc nadal otwiera sie z cache, takze offline, bez automatycznej komendy; starych naglowkow nie zgadujemy |
| Z trescia i poprawnym `headers` | Podglad, odpowiedzi i eksport korzystaja z kompletu bez komend |
| Rekord tylko z listingu | Pozostaje bez `headers` do pierwszego pelnego odczytu; listing nie tworzy pozornego kompletu |
| Bez prawidlowej daty | Brak slepych komend; automatyczne odzyskanie moze byc niemozliwe, ale tresc i pozostale dane zostaja |
| List nieobecny na serwerze | Nie ma lokalnej rekonstrukcji; niepowodzenie uzupelnienia nie moze samo w sobie kasowac zachowanej tresci |
| Blizniacze rekordy | Kazdy rekord uzupelnia sie przez wlasne `archiveId`; naglowkow nie kopiuje sie miedzy blizniakami |
| Replika w innej skrzynce | Nie zmienia `id`, wlasciwosci rekordu ani innej repliki; brak przenoszenia naglowkow jako osobnej migracji |
| Zmiana postaci w trakcie odczytu | Operacja jest odrzucana dla nowej postaci; zadne dane i prefill nie przechodza miedzy postaciami |
| Blad trwalego zapisu | Nie wolno raportowac trwalego uzupelnienia; test zamkniecia i ponownego otwarcia sprawdza rzeczywisty stan |

Istniejaca, recznie uruchamiana operacja pobierania tresci po wdrozeniu sekcji 17 rowniez zapisze naglowki dla listow, ktore rzeczywiscie odczyta. Nie nalezy jednak uruchamiac jej ponownie dla rekordow, ktore juz maja tresc, tylko po to, aby wykonac migracje.

### 19.8. Leniwe odzyskanie naglowkow dla reply-all

Dla starego rekordu z trescia i bez `headers` rekomendowane jest jedno kontrolowane pobranie dopiero po wybraniu `Odpowiedz wszystkim`. Zwykly podglad z cache pozostaje natychmiastowy i nie zmienia dotychczasowej zasady zero komend.

Przebieg:

1. Sprawdzic, czy rekord nadal jest tym samym rekordem i czy nie zmienila sie postac lub generacja polaczenia.
2. Odnalezc wlasciwy wpis przez istniejaca kotwice i `archiveId`.
3. Wykonac jeden odczyt pagera w ramach blokady sesji, z jasnym stanem zajetosci i bez automatycznej serii ponowien.
4. Zaakceptowac dopiero odpowiedz zwiazana z zadanym listem, zgodnie z zabezpieczeniami z sekcji 17.
5. Zapisac komplet naglowkow atomowo w tym samym rekordzie.
6. Dopiero z zapisanego, pelnego `LetterContent` zbudowac edytowalny prefill.

Blad, brak daty, brak listu, przelaczenie postaci albo przerwanie operacji nie moze utworzyc niepelnego prefillu. Dotychczasowa zawartosc compose zostaje nietknieta, nic nie jest wysylane, a uzytkownik dostaje konkretny komunikat. Nie wolno w takiej sytuacji wracac po cichu do samego nadawcy.

Nowe rekordy oraz rekordy juz uzupelnione nie potrzebuja tej komendy. Zwykle `Odpowiedz` i cytowanie nie powinny powodowac dodatkowego pobierania tylko w celu zachowania ich obecnego kontraktu; nadal jednak nie moga przedstawiac nieznanych danych jako pewnych.

### 19.9. Podglad i eksport rekordow historycznych

Po dodaniu `headers` podglad i `archiveLetterTxt()` powinny uzywac kompletu jako jednej migawki. Fallback z `party` moze sluzyc wylacznie do pokazania pol rzeczywiscie zapisanych w starym listingu, a nie do tworzenia pelnego kompletu.

Eksport zbiorczy powinien pozostac operacja lokalna, bez automatycznego pobierania setek listow. Dla starego rekordu nie ma uczciwego sposobu na wygenerowanie pelnego historycznego TXT bez ponownego odczytu serwera. Rekomendowane zachowanie:

1. Rekord z `headers`: eksport pelny.
2. Rekord bez `headers`: eksport tylko wiarygodnych danych z listingu i tresci, bez zgadnietych pol.
3. Podsumowanie eksportu wskazuje liczbe rekordow z niepelnymi historycznymi naglowkami, zamiast sugerowac, ze wszystkie pliki zawieraja komplet.
4. Brak naglowkow nie blokuje eksportu pozostalych rekordow i nie kasuje danych.
5. Pozniejsze udane uzupelnienie rekordu powoduje, ze kolejny eksport jest juz pelny.

Nie nalezy dopisywac do tresci listu technicznych ostrzezen ani zmieniac historycznej korespondencji. Informacja o ograniczeniu nalezy do podsumowania operacji eksportu.

### 19.10. Niezmienniki scalania i zapisu

Implementacja po osobnym poleceniu musi zapewnic:

1. `fromMailboxEntry()` nigdy nie tworzy `headers`.
2. `fromOpenedLetter()` zapisuje komplet z tego samego `LetterContent` i pod tym samym `archiveId`.
3. Kolejny listing bez naglowkow nie usuwa wczesniej zapisanego kompletu.
4. `upsertLetters()` nie kasuje kompletu przez rekord, w ktorym pole jest nieobecne; nowy, zaakceptowany komplet moze natomiast zastapic stary jako jedna migawka.
5. `normalizeArchive()` zachowuje poprawne `headers`, a niepoprawny ksztalt traktuje jako brak danych zamiast zgadywac.
6. `mergeArchiveDuplicates()` nie wybiera pustego lub niekompletnego wariantu kosztem kompletu i nie sklada naglowkow z roznych duplikatow.
7. Pozna lub niepowiazana odpowiedz pagera nie nadpisuje naglowkow innego rekordu.
8. Zapis, odczyt, normalizacja i restart zachowuja dokladnie puste `to` oraz `cc: null`.
9. Zmiana naglowkow nie zmienia `id`, `party`, `contentKeyOf()`, kolejnosci, kontaktow ani filtrow.
10. Dodanie pola nie zmienia wersji IndexedDB ani kluczy rekordow.

Starsza wersja pluginu nadal bedzie ignorowac nowe pole i zachowywac stary blad. Brak podniesienia wersji bazy unika technicznej blokady otwarcia bazy, ale nie nalezy bez testow deklarowac pelnej zgodnosci przy downgrade, zwlaszcza dla scalania duplikatow.

### 19.11. Wymagane testy przed implementacja

Kazda nowa asercja ma najpierw zaliczyc lokalny dowod, ze pada na starym kodzie. Test i implementacja trafia do jednego commita, a przed commitem caly zestaw projektu ma przechodzic. Nie nalezy pokazywac czerwieni na CI.

Zakres testow:

1. Odebrany z pelnymi `Do` i `DW`: podglad z cache i TXT zachowuja wszystkie pola.
2. Wyslany z pelnymi `Do` i `DW`: podglad i TXT zachowuja takze `Od`.
3. Wyslany tylko na `DW`: puste `Do` pozostaje puste, a odbiorcy nie znikaja.
4. Eksport pojedynczy po restarcie jest identyczny z eksportem po swiezym odczycie.
5. Eksport calego Archiwum korzysta z `headers`, a nie rekonstruuje ich z `party`.
6. Stary rekord bez `headers` zachowuje tresc i nie dostaje zgadnietych naglowkow.
7. Reply-all na starym rekordzie wykonuje co najwyzej jeden kontrolowany odczyt i dopiero potem tworzy pelny prefill.
8. Blad tego odczytu pozostawia compose bez zmian, nie wysyla nic i nie wpisuje samego nadawcy.
9. Rekord z naglowkami otwiera sie i odpowiada bez komend.
10. Restart IndexedDB zachowuje `headers`, a stara baza w wersji 2 otwiera sie bez migracji schematu.
11. Listing i upsert bez nowego pola nie kasuja zapisanego kompletu.
12. Normalizacja i scalanie duplikatow zachowuja komplet atomowo i deterministycznie.
13. Blizniak uzupelnia wylacznie wlasny rekord.
14. Zmiana postaci lub generacji odrzuca pozny wynik i nie zmienia cudzego Archiwum ani compose.
15. Brak daty i brak listu na serwerze nie powoduja slepych komend ani kasowania zachowanej tresci.
16. Kontakty, liczniki i filtry daja niezmienione wyniki dla dotychczasowych przypadkow.
17. Podsumowanie eksportu poprawnie liczy historyczne rekordy bez pelnych naglowkow.

### 19.12. Odpowiedz dla istniejacych uzytkownikow

Aktualizacja ma byc przezroczysta: bez czyszczenia danych, bez ponownej indeksacji, bez recznej migracji i bez masowego pobierania poczty. Nowe odczyty automatycznie zachowaja wiecej danych. Stare rekordy pozostaja czytelne, a brakujace naglowki sa uzupelniane tylko przy naturalnym odczycie albo gdy uzytkownik zazada operacji wymagajacej pelnego kompletu.

Nie da sie jednak przywrocic danych, ktorych stara wersja nigdy nie zapisala, bez dostepu do oryginalnego listu na serwerze. W takim przypadku plugin ma jasno zachowac niepewnosc zamiast zgadywac odbiorcow. To jest jedyna istotna granica migracji historycznych rekordow.
