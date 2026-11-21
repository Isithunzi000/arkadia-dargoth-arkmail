# Plan roboczy poprawek ArkMail 1.30.14

Data utworzenia: 2026-11-21.
Ostatnia aktualizacja: 2026-11-21, reset wskaznika niewyslanych zakonczony.

## Status i zakres

To jest tymczasowy dokument wykonawczy. Aktualizujemy go po kazdym istotnym
ustaleniu, a po wykonaniu calego planu usuwamy. Wykonane czesci usuwamy z
aktywnego zakresu, pozostawiajac mape pokrycia i wyniki kontroli do zamkniecia
prac.

Plan obejmuje wszystkie zgloszone problemy z komunikatami reply-all,
reconnectem, przeladowaniem, replayem proxy, pagerem, edytorem, reczna poczta
gracza, archiwum, importem, timerami i zwierzeciem. Nie jest zatwierdzeniem
implementacji.

Przyjety model obslugi reconnectu i replayu jest prosty: przerwij stara
operacje, wyczysc kolejki i timery, poinformuj uzytkownika, jesli cos przerwano,
oraz pozwol mu swiadomie powtorzyc czynnosc od czystego stanu. Nie wznawiamy
automatycznie starej operacji i nie zgadujemy stanu gry.

Publiczne API nie oznacza pochodzenia kazdej linii ani konca replayu. Dlatego
zakres 100% dotyczy wszystkich zachowan opisanych w tym planie, a nie
niemozliwej klasyfikacji kazdej starej i aktualnej linii. Nie potrzebujemy do
tego zmiany klienta Dargoth.

Kontrola CI wykazala jednorazowy brak wyniku DOM przy kodzie wyjscia 0 w tescie
pol dat. Wykonawca testu ponawia takie uruchomienie najwyzej trzy razy i zapisuje
diagnostyke wszystkich prob. Bledne wartosci color-scheme nadal koncza test
natychmiast. To utwardzenie kontroli, bez zmiany zachowania pluginu.

## Zasady wiazace

- Kazda zmiana kodu ma lokalny dowod: najpierw nowy test pada na starym kodzie,
  potem minimalna poprawka sprawia, ze przechodzi.
- Dowod RED dotyczy rzeczywistych zmian i usterek, a nie istniejacych testow
  regresji. Dla zachowan, ktore juz sa poprawne i maja pozostac bez zmian,
  wystarczy istniejacy lub nowy test regresji przechodzacy przed i po zmianie.
  Nie tworzymy sztucznych awarii ani nie falszujemy dowodu RED.
- Test i poprawka trafiaja do jednego commita. CI potwierdza wynik, ale nie jest
  miejscem dowodzenia RED.
- Prace wykonujemy pionowo: jedno zachowanie, jeden test, jedna poprawka.
- Testy sprawdzaja zachowanie przez publiczne sciezki pluginu, nie tylko nowe
  pola wewnetrzne.
- Przed kazdym commitem przechodza pelne szybkie testy lokalne, rzeczywisty
  tsc --noEmit oraz build.
- Nie uruchamiamy lokalnie pelnych macierzy E2E. Pelna macierz przechodzi raz na
  koncu, przed wydaniem.
- Nie ma force-push. Po niepewnym zapisie najpierw ustalamy stan zdalny.
- Nie modyfikujemy zrodel ani zdalnego repozytorium klienta Dargoth.
- Nie publikujemy w katalogu pluginow, marketplace, Vercelu ani innych uslugach
  bez odrebnego, jawnego polecenia.
- W repozytorium nie umieszczamy tokenow, danych wrazliwych, prywatnych
  korespondencji, prywatnych nazw postaci ani wulgaryzmow. Testy uzywaja
  wylacznie danych syntetycznych.
- Commity sa po polsku, rzeczowe i zgodne ze straznikiem repozytorium.
- Zamknieta pozycja jest odznaczana w tym samym commicie co jej poprawka.

## Ustalone przyczyny i zakres usterek

### Reply-all

Funkcja buildReplyAllPrefill poprawnie pomija aktualna postac. Pusty wynik Tylko
DW jest prawidlowy, gdy jedynym odbiorca DW jest aktualna postac. Do zmiany jest
klasyfikacja przyczyny i komunikat, nie algorytm odbiorcow.

Pusty wynik moze powstac we wszystkich zakresach:

- Tylko DW: DW jest puste albo zawiera wylacznie aktualna postac.
- Tylko DO dla Odebranych/Nieprzeczytanych: nadawca i DO sa puste albo zawieraja
  wylacznie aktualna postac. Zewnetrzny nadawca zapobiega pustemu wynikowi.
- Tylko DO dla Wyslanych/Niewyslanych: DO jest puste albo zawiera wylacznie
  aktualna postac; nadawca nie jest dodawany.
- DO + DW dla Odebranych/Nieprzeczytanych: nadawca, DO i DW sa puste albo
  zawieraja wylacznie aktualna postac.
- DO + DW dla Wyslanych/Niewyslanych: DO i DW sa puste albo zawieraja wylacznie
  aktualna postac.

Tylko DO nie pobiera zastepczo osob z DW. DO + DW moze przeniesc pozostale osoby
z DW do Adresata, gdy grupa nadawca/DO jest pusta. Tylko DW przenosi oryginalnych
odbiorcow DW do Adresata i celowo zostawia pole DW puste.

### Polaczenie, replay i sesje

- recovering moze przetrwac reconnect, a replayowany zwykly prompt moze je
  zdjac bez synchronizacji.
- playerMailMode moze przetrwac reconnect bez disconnect albo powstac ze starego
  echa, jezeli replay zostal juz dostarczony.
- Stary listing, pusta odpowiedz, list albo prompt moze zostac uznany za
  aktualny i zmienic archiwum lub uruchomic kolejna komende.
- Stare linie moga zakonczyc compose albo import.
- Automatyczne odswiezenie po wznowieniu moze zostac anulowane bez pozniejszego
  ponowienia.
- Ogolne operacja anulowana ukrywa rozne przyczyny, a reczna operacja moze
  zakonczyc sie bez widocznego komunikatu.

### Reczna poczta gracza

playerMailMode blokuje tylko czesc sciezek. Komendy pluginu moga trafic do
pagera gracza podczas odczytu, wyszukiwania, wczytywania, indeksowania,
kasowania, przekazywania, compose, importu, pobierania archiwum i wysylania
zwierzecia.

### Pager, edytor, import i zwierze

- Timeout pagera przed dowodem otwarcia moze wyslac q. Nieznany pager ani
  legalna reczna sesja gracza nie moga dostawac automatycznego q.
- Timeout compose nie obsluguje edytora serwera, ktory moze pozostac otwarty.
- Pozne wysylki i stare wyniki moga zmienic lokalny stan albo formularz.
- Wczesny prompt moze zakonczyc import jako pusty wynik, a import aliasow moze
  zapisac pusta liste.
- delayedInboxTimers nie sprawdzaja generacji i nie sa czyszczone przy kazdym
  resecie polaczenia.
- Czesc stanu wysylki zwierzecia przezywa reconnect; stare Slucham? albo pozne
  resolve moze zmienic nowy stan.

## Etap 0 - zakonczona analiza i granice rozwiazania

Analize read-only wykonano na Delwing/arkadia-web-client-extension, commit
616ea27c949097f13b835d4195af26f4b32f6b14, oraz na lokalnych typach ArkMaila.
Pobrane pliki zweryfikowano rozmiarem i Git blob SHA.

Ustalenia wiazace:

1. client.connect poprzedza proxy.session. proxy.session poprzedza replay, wiec
   nie jest jego koncem.
2. Proxy wysyla replayedBytes jako liczbe, takze gdy wynosi zero. Pusty replay
   mozna rozroznic od niepustego. Brak lub niepoprawna wartosc traktujemy jako
   replay nieznany.
3. Plugin nie otrzymuje znacznika pochodzenia linii ani zdarzenia konca replayu.
   replayedBytes nie moze byc licznikiem odbieranych bajtow ani dowodem, ze
   wszystkie pozniejsze linie sa aktualne.
4. flushLines i timestampy nie rozwiazuja problemu: linie moga byc sklejane,
   timestamp moze zniknac, a czyste GMCP nie musi miec flushLines.
5. Session.flushPendingLocked moze dostarczyc zalegly bufor na tym samym
   sockecie bez proxy.session i bez replayedBytes.
6. Przeplot replayu z nowym ruchem jest przypadkiem brzegowym. Nie projektujemy
   dla niego automatycznego wznawiania ani nowej infrastruktury.

Dowody w kodzie klienta: src/web/MudClient.ts, src/web/proxySession.ts,
src/web/proxyClockOffset.ts, src/shared/socket/transport.ts,
src/client/PluginApi/events.ts, src/client/PluginApi/triggers.ts,
src/shared/events/clientEvents.ts oraz services/session-proxy/session.go.
Dowody w ArkMailu: src/arkmail/adapters/dargothTransport.ts,
src/arkmail/core/session/transport.ts i src/arkmail/index.ts.

### Przyjety model

- Swieze logowanie zachowuje obecne automatyczne odswiezanie. Istniejaca ochrona
  przed replayem martwej sesji i obsluga hot-load pozostaja nietkniete.
- Zywe wznowienie z replayedBytes === 0 wykonuje dokladnie jedno automatyczne
  odswiezenie. Kolejne GMCP nie moga go zduplikowac.
- Niepusty albo nieznany replay przerywa operacje, czysci stan i wstrzymuje
  automatyczne dzialania do jawnego ponowienia przez uzytkownika.
- Disconnect, zamkniecie upstreamu i powrot do logowania resetuja oraz rozbrajaja
  transport. Pozniejsze swieze logowanie moze normalnie uzbroic go przez obecne
  sygnaly obecnosci.
- Reset nie wysyla q, ~q, znakow sterujacych ani komend probnych.
- Reset podczas bezczynnosci jest cichy. Przerwanie recznej operacji daje jeden
  komunikat z poleceniem powtorzenia. Operacji automatycznych nie wznawiamy.
- Jawna nowa operacja uzytkownika dostaje nowa generacje. Nie jest poprzedzana q
  i nie uruchamia zaparkowanych komend starej sesji.
- Powtorzone zdarzenia resetu sa idempotentne.

Nie gwarantujemy rozpoznania zaleglego bufora bez zadnego zdarzenia. Nie
gwarantujemy tez, ze kazde replayowane echo zostanie odroznione od aktualnej
komendy gracza. Nie usuwamy wykrywania aktualnych komend gracza i nie blokujemy
globalnie ręcznej poczty, poniewaz to psuloby poprawna funkcje. Te ograniczenia
sa jawne; zadny test ani raport nie moze przedstawiac ich jako rozwiazanych.

## Etap 2 - jeden reset na istniejacej infrastrukturze

Rozszerzyc istniejaca cancelConnectionOperations zamiast tworzyc rownolegly
system. Reset wykorzystuje connectionGeneration, SessionScopeRegistry.reconnect
i istniejace zamykanie sesji.

Reset ma:

- uniewazniac stare operacje i ich pozne wyniki;
- zamykac aktywne sesje, czyszczac kolejke komend i oczekujace echa;
- kasowac lastMailState, listingCtx, pendingRefresh, drainScheduled i
  archiveDownloadEta zgodnie z dotychczasowa odpowiedzialnoscia procedury;
- kasowac flagi i wskazniki operacji w toku oraz pozostawiac spojny interfejs;
- zachowywac dane trwale, archiwum, ustawienia i tresc formularza;
- byc idempotentny, bez duplikatow komunikatow, komend, timerow i odswiezen.

Nie budujemy centralnej bramki calego ruchu. Zmiana dotyczy resetu, decyzji w
onProxySession i blokad automatycznych dzialan. Aktualne komendy gracza oraz ich
istniejace wykrywanie pozostaja poza blokada ArkMaila.

Testy: reconnect z/bez disconnect, powtorne connect/proxy.session, brak
komend na logowaniu, zachowanie formularza i danych trwalych oraz
idempotentnosc. Swieze logowanie i hot-load sa testami regresji,
nie maja stracic obecnego automatycznego dzialania.

## Etap 3 - reconnect, replay i reczne ponowienie

### Minimalna zmiana przeplywu

1. onClientConnect nadal anuluje poprzednia sesje. Nie ustawia trwalej blokady
   automatyzmu dla zwyklego, swiezego logowania.
2. onProxySession odczytuje resumed, upstreamClosed i replayedBytes.
3. Dla zywego resumed z replayedBytes === 0 uzbraja transport i wykonuje jedno
   odswiezenie.
4. Dla resumed z replayem niepustym albo nieznanym wykonuje wspolny reset i
   ustawia jeden prosty stan wymagajacy recznego ponowienia. W tym stanie
   onAnyGmcp, onGamePresence i automatyczne odswiezenia nie uzbrajaja transportu
   ani nie uruchamiaja komend.
5. Pierwsza swiadoma operacja uzytkownika po takim replayu zdejmuje ten stan,
   uzbraja transport i rozpoczyna dokladnie jedna nowa operacje. Operacje
   automatyczne nie zdejmuja blokady.
6. Zamkniecie upstreamu, disconnect i system.login uzywaja wspolnego resetu.
   Pozniejsze swieze logowanie wraca do obecnej obslugi sygnalow obecnosci.

Nie ma nowego dyspozytora linii, licznika konca replayu ani automatycznego
wznowienia. Sesje zamkniete przez reset nie przyjmuja starych odpowiedzi, a pozne
wyniki odrzuca istniejaca generacje. Nie zmieniamy publicznego ProtoLine.

Po rozpoczeciu nowej operacji plugin nie obiecuje rozroznienia kazdej linii, ktora
moglaby jeszcze pochodzic z replayu. Nie rozszerzamy zakresu o taka klasyfikacje.

### Komunikaty

Jesli reset przerwal reczna operacje, pokaz jeden komunikat:

"Polaczenie zostalo wznowione. Poprzednia operacja pocztowa zostala przerwana. Wykonaj ja ponownie."

Jesli bezposrednia przyczyna jest replay, wolno uzyc:

"Klient odtworzyl dane poprzedniej sesji. ArkMail przerwal poprzednia operacje, aby nie wykonywac komend na podstawie starych danych. Wykonaj operacje ponownie."

Komunikat nie sugeruje otwartego pagera, koniecznosci q ani kolejnego reloadu.
Automatyczne operacje w tle i reset podczas bezczynnosci nie generuja
powiadomien.

### Testy nowego zachowania

1. Pusty replay dopuszcza jedno odswiezenie przy wielu sygnalach obecnosci.
2. Niepusty i nieznany replay nie uruchamia automatycznego odswiezenia.
3. Replay podczas bezczynnosci nie wysyla komend i nie pokazuje komunikatu.
4. Reset podczas aktywnej recznej operacji anuluje ja, kasuje timery i pokazuje
   jeden wlasciwy komunikat.
5. Powtorzone connect, disconnect i proxy.session nie duplikuja efektow.
6. Jawne ponowienie otwiera jedna nowa operacje bez q, komend probnych i drenazu
   starej kolejki.
7. Pozne wyniki starej generacji nie zmieniaja nowej operacji ani archiwum.
8. Brak komend naprawczych na podstawie replayu.

Testy regresji bez wymuszania RED: swieze logowanie i hot-load uzbrajaja
transport; aktualna reczna komenda gracza nadal wlacza playerMailMode; legalna
sesja gracza nie dostaje q; zwykla nowa operacja bez replayu dziala bez zmian.

Istniejace testy do swiadomej aktualizacji kontraktu:

- gateHotLoad.test.ts: swieze logowanie i hot-load pozostaja regresja; przypadek
  resumed bez replayedBytes zmienia sie z automatycznego odswiezenia na replay
  nieznany bez odswiezenia.
- reconnectCancel.test.ts: zachowuje anulowanie i brak q/~q, a komunikat oraz
  ponowienie dopasowuje do nowego kontraktu.

Nie dodajemy testu udajacego pewne wykrycie bufora bez zdarzenia ani testu
gwarantujacego rozroznienie kazdego replayowanego echa.

## Etap 4 - pelna blokada komend pluginu podczas recznej poczty

Wprowadzic centralne zabezpieczenie transportu dla komend ArkMaila zamiast
dodawac niezalezne warunki do pojedynczych handlerow. To jest blokada komend
pluginu, nie nowa bramka calego ruchu przychodzacego.

Ochrona obejmuje otwieranie sesji, pierwsza komende i kolejke: odczyt,
wyszukiwanie, strony, indeksowanie, kasowanie, przekazywanie, compose, import,
pobieranie archiwum i zwierze. Komendy gracza pozostaja nietkniete.

Reczna operacja UI pokazuje:

"Najpierw zakoncz reczna sesje poczty w grze, a potem powtorz operacje w ArkMailu."

Automatyczne operacje parkuja bez powiadomien. Po wyjsciu nastepuje jedno
zbiorcze odswiezenie.

Test parametryczny przechodzi przez wszystkie publiczne operacje UI i dowodzi:
zero komend pluginu, brak zmian archiwum, komunikat dla uzytkownika, brak
powiadomien automatycznych, jedno pozniejsze zbiorcze odswiezenie i nietkniete
komendy gracza. Istniejace testy playerMailMode.test.ts pozostaja regresja.

## Etap 5 - pager i timeouty

Timeout przed dowodem otwarcia pagera nie wysyla q.

q jest dozwolone dopiero po dowodzie wlasnego pagera: zgodny naglowek listu,
rozpoznany prompt pagera albo potwierdzone wczesniejsze otwarcie przez
istniejaca sciezke.

Przy calkowitej ciszy przed naglowkami operacja konczy sie timeoutem, bez q,
bez zapisu i bez automatycznego zamykania legalnej sesji gracza. Nieznany pager
pozostaje nietkniety. Nie przebudowujemy istniejacego straznika sierocych
pagerow, ktory juz wymaga podejrzenia przed q.

Testy: cisza przed naglowkiem bez q; timeout po potwierdzonym pagerze z
kontrolowanym zamknieciem; timeout podczas zamykania z synchronizacja i
wlasciwym komunikatem; stary prompt bez akcji. Istniejace testy
pagerWatchdog.test.ts pozostaja regresja dla recznego pagera i braku duplikatu q.

## Etap 6 - timeout compose i edytor serwera

Obsluzyc timeout zaleznie od istniejacego stanu editorReady, bodyStarted i stage:

1. Przed potwierdzeniem edytora: bez ~q, wynik niepotwierdzony, brak kolejnych
   komend do synchronizacji.
2. Po potwierdzeniu edytora: jedno ~q, oczekiwanie na przerwanie i zwykly prompt
   przez ograniczony czas.
3. Brak potwierdzenia zamkniecia: synchronizacja i blokada komend pluginu, bez
   sukcesu.
4. Disconnect: bez wysylania ~q do zamknietego polaczenia; wspolny reset.

Formularz po bledzie zostaje nietkniety. Po timeoutcie lub anulowaniu nie wolno
wyslac kolejnej linii tresci.

Testy dla timeoutu na adresacie, temacie, DW, przed edytorem, w tresci i po **:
najwyzej jedno ~q, zero ~q bez potwierdzonego edytora, brak falszywego sukcesu,
brak czyszczenia formularza, brak poznych wysylek i poprawny powrot po
synchronizacji. Zachowanie formularza jest testem regresji, jezeli dany przypadek
juz dziala na starym kodzie.

## Etap 7 - import i ochrona archiwum

Wczesny prompt bez rozpoznanej odpowiedzi na komende importu nie jest prawidlowa
pusta lista. Zapis wymaga rozpoznania odpowiedzi, jej aktualnosci i zakonczenia
wlasciwej sesji. Prawidlowa pusta lista jest akceptowana na podstawie jawnego
naglowka albo komunikatu pustego wyniku, nie samego promptu.

Dodatkowa ochrona wykorzystuje istniejace confirmed i generacje:

- zastepowanie rekordow wylacznie przy confirmed === true;
- zero kasowan dla wyniku niejednoznacznego, niepotwierdzonego lub z innej
  generacji;
- zero zapisu tresci po wyniku niejednoznacznym;
- zero komend kasowania lub przekazywania z niepotwierdzonego promptu.

Nie powstaje nowy system klasyfikacji odpowiedzi.

Testy: prawidlowy pusty import, przedwczesny prompt, replay pustego listingu,
niekompletny listing, stary list o tym samym numerze i reconnect przed zapisem.

## Etap 8 - komunikaty o anulowaniu i synchronizacji

Rozroznic anulowanie przez reconnect, replay, reczna poczte, timeout i zamierzone
anulowanie automatyczne. Dla reconnectu i replayu obowiazuja tresci z etapu 3.
Pozostale komunikaty maja nazywac rzeczywisty powod i sposob powrotu do pracy.

- Reczna operacja uzytkownika zawsze ma zrozumialy komunikat o przerwaniu.
- Automatyczne anulowanie oraz reset podczas bezczynnosci nie generuja zbednych
  powiadomien.
- Komunikat nie sugeruje otwartego pagera ani koniecznosci q bez dowodu.
- Po limicie czasu nie moze zostac niewidoczna trwala blokada i milczace
  klikniecia.
- Komunikat wystepuje raz dla jednego przerwania, takze przy wielu sygnalach
  resetu.
- Po komunikacie uzytkownik moze powtorzyc operacje bez reloadu i bez recznego
  czyszczenia stanu gry.

Testy obejmuja kazda przyczyne, duplikaty zdarzen, bezczynnosc, ponowienie oraz
brak komend naprawczych.

## Mapa pokrycia wszystkich znalezisk

| Znalezisko | Etap i zakres |
|---|---|
| Niejasne komunikaty pustego reply-all we wszystkich zakresach | 1, zakonczone |
| recovering przezywa reconnect | 2, zakonczone; blokada niepustego replayu pozostaje w 3 |
| Replayowany prompt zdejmuje blokade | 2 i 3, bez zdejmowania blokady przez prompt |
| playerMailMode przezywa reconnect albo powstaje ze starego echa | Reset przy reconnectcie zakonczony w 2; replay i przypadek bez sygnalu pozostaja zgodnie z 0 i 3 |
| Komendy pluginu wychodza podczas recznej poczty | 4 |
| Pomijane automatyczne odswiezenie po wznowieniu | 2 i 3, jedno odswiezenie przy pustym replayu |
| Stary listing albo pusta odpowiedz zmienia archiwum | 3 i 7 |
| Stary list o tym samym numerze zostaje zapisany | 3 i 7 |
| Stare prompty uruchamiaja kasowanie/przekazywanie | 3 i 7 |
| Stare linie koncza compose lub import | 3, 6 i 7 |
| Timeout pagera wysyla q bez dowodu pagera | 5 |
| Timeout compose nie obsluguje otwartego edytora | 6 |
| Stare timery odswiezen przezywaja reconnect | 2, zakonczone |
| Wskaznik niewyslanych i jego timer przezywaja reconnect | 2, zakonczone |
| Stan zwierzecia reaguje na stare zdarzenia | Reset zakonczony w 2; granice wykrywania replayu pozostaja zgodne z 0 i 3 |
| Ogolne lub niewidoczne operacja anulowana | 4 i 8 |
| Zalegly bufor po obudzeniu karty bez ramki kontrolnej | Ograniczenie API opisane w etapie 0; bez falszywej gwarancji wykrycia |
| Pozne wyniki i stare callbacki zmieniaja nowa operacje | 2 i 3 |
| Reset musi zachowac dane trwale i tresc formularza | 2, 3 i 6, testy regresji |
| Reczne ponowienie bez reloadu, q i komend probnych | 3 i 8 |

Wszystkie zgloszone usterki maja etap naprawczy. Dwie pozycje dotyczace
nierozroznialnych danych bez sygnalu maja natomiast jawnie opisane ograniczenie;
nie wolno raportowac ich jako w pelni wyeliminowane.

## Procedura wykonania kazdego przypadku

1. Jedno zachowanie uzytkownika i jeden przypadek testowy.
2. Dla rzeczywistej zmiany lub usterki test uruchamiamy lokalnie na starym kodzie
   i zapisujemy rzeczywisty wynik RED. Dla regresji zapisujemy wynik przed
   zmiana bez wymuszania niepowodzenia.
3. Dodajemy minimalna implementacje.
4. Ten sam test przechodzi.
5. Pelne szybkie testy lokalne, tsc --noEmit i build przechodza.
6. Test i poprawka trafiaja do jednego commita razem z aktualizacja planu.
7. Dopiero potem rozpoczynamy nastepny przypadek.

Raport etapu zawiera nazwe scenariusza, wynik przed i po poprawce, liczbe
testow, wynik typowania i buildu oraz liste zmienionych plikow. Nie deklarujemy
sprawdzenia w grze, jesli go nie wykonano.

## Kontrole koncowe i wydanie

Wydanie zamyka caly wykonalny zakres planu. Zmiana klienta Dargoth, automatyczne
wznowienie starej operacji ani klasyfikacja kazdej linii replayu nie sa warunkiem
wydania. Opis wydania nie moze obiecywac tych zachowan ani pelnej eliminacji
przypadku bez sygnalu.

1. Pelne lokalne testy, typowanie i build.
2. Jedna pelna macierz scenariuszowa ArkMaila i zgodnosci z klientem na GitHubie
   po ostatnim etapie, przed wydaniem.
3. Dowod RED dla kazdej rzeczywistej poprawki oraz zielone testy regresji dla
   zachowan chronionych. Zadnych sztucznych dowodow dla wymagan juz spelnionych.
4. Kontrola repozytorium pod katem danych wrazliwych, prywatnych nazw i
   niedozwolonego jezyka.
5. Wersja 1.30.14 w meta.ts i plugin.json, zgodna z semver.
6. Deterministyczny arkmail_1_30_14.zip z index.ts i plugin.json; porownanie
   paczki ze zrodlami oraz kontrola SHA-256.
7. GitHub Release ArkMail v1.30.14 z dokladnie jednym poprawnym assetem. Opis
   zgodny z docs/ZASADY.md.
8. Release odpowiada najnowszemu main; nie zamykamy prac z rozjazdem.
9. Raport koncowy rozdziela testy syntetyczne od sprawdzen w grze i przypomina
   ograniczenie braku znacznika pochodzenia linii.
10. Usuniecie wykonanego planu roboczego i pozostalych tymczasowych plikow.
    Zadnych publikacji poza GitHubem bez odrebnego polecenia.
