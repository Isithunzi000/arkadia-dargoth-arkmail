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
3. `r` nie moze zostac przeniesione z zakonczonego pagera do zwyklego trybu gry;
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
