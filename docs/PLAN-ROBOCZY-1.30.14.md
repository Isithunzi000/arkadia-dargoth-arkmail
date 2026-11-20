# Plan roboczy poprawek ArkMail 1.30.14

Data utworzenia: 2026-11-21.
Ostatnia aktualizacja: 2026-11-21, analiza flushLines i timestampow.

## Status i przeznaczenie

To jest tymczasowy, roboczy dokument wykonawczy. Ma zachowac kompletny
zakres prac niezaleznie od kompresji rozmowy. Dokument aktualizujemy po
kazdym istotnym ustaleniu. Po wykonaniu calego planu usuwamy go wraz z
innymi tymczasowymi artefaktami, pozostawiajac jedynie wlasciwa dokumentacje
produktu.

Plan obejmuje wszystkie dotychczas znalezione problemy z komunikatami
reply-all, reconnectem, przeładowaniem, replayem proxy, pagerem, edytorem,
reczna poczta gracza, archiwum, importem, timerami i zwierzeciem.

Plan nie jest zatwierdzeniem implementacji. Etap 0 zostal zakonczony:
publiczne API nie daje wiarygodnej granicy replayu ani pochodzenia linii
we wszystkich scenariuszach. Plan wskazuje bezpieczne blokady mozliwe juz
teraz, ale pelna automatyczna naprawa replayu wymaga odrebnej decyzji o
rozszerzeniu kontraktu klienta. Nie wolno deklarowac naprawy 100% bez tego
warunku.

## Zasady wiazace

- Kazda zmiana kodu ma lokalny dowod: najpierw nowy test pada na starym
  kodzie, potem minimalna poprawka sprawia, ze przechodzi.
- Test i poprawka trafiaja do jednego commita.
- CI sluzy wylacznie do potwierdzenia; nie jest miejscem dowodzenia
  niepowodzenia starego kodu.
- Prace wykonujemy pionowo: jedno zachowanie, jeden test, jedna poprawka.
  Nie piszemy wszystkich testow ani calej implementacji naraz.
- Testy sprawdzaja zachowanie przez publiczne sciezki pluginu, nie tylko
  nowe pola wewnetrzne.
- Przed kazdym commitem przechodza pelne szybkie testy lokalne, rzeczywisty
  tsc --noEmit oraz build.
- Nie uruchamiamy lokalnie pelnych macierzy E2E. Pelna macierz przechodzi
  raz na koncu, przed wydaniem.
- Nie ma force-push. Po niepewnym zapisie najpierw ustalamy stan zdalny.
- Nie modyfikujemy zrodel ani zdalnego repozytorium klienta Dargoth.
- Nie publikujemy w katalogu pluginow, marketplace, Vercelu ani innych
  uslugach bez odrebnego, jawnego polecenia.
- W repozytorium nie umieszczamy tokenow, danych wrazliwych, prywatnych
  korespondencji, prywatnych nazw postaci ani wulgaryzmow. Testy uzywaja
  wylacznie danych syntetycznych.
- Commity sa po polsku, rzeczowe i zgodne ze straznikiem repozytorium.
- Zamknieta pozycja jest odznaczana w tym samym commicie co jej poprawka.
- Wykonane czesci planu sa usuwane z dokumentu, aby pozostal wylacznie
  aktywny zakres.

## Ustalone przyczyny i zakres usterek

### Reply-all

Funkcja buildReplyAllPrefill pomija aktualna postac. Pusty wynik dla Tylko DW
jest poprawny, gdy jedynym odbiorca DW jest aktualna postac. Obecny komunikat
jest jednak zbyt ogolny.

Pusty wynik moze powstac we wszystkich zakresach:

- Tylko DW: DW jest puste albo zawiera wylacznie aktualna postac.
- Tylko DO dla Odebranych/Nieprzeczytanych: nadawca i DO sa puste albo
  zawieraja wylacznie aktualna postac. Zewnetrzny nadawca zapobiega pustemu
  wynikowi.
- Tylko DO dla Wyslanych/Niewyslanych: DO jest puste albo zawiera wylacznie
  aktualna postac; nadawca nie jest dodawany.
- DO + DW dla Odebranych/Nieprzeczytanych: nadawca, DO i DW sa puste albo
  zawieraja wylacznie aktualna postac.
- DO + DW dla Wyslanych/Niewyslanych: DO i DW sa puste albo zawieraja
  wylacznie aktualna postac.

Tylko DO nie pobiera zastepczo osob z DW. DO + DW moze przeniesc pozostale
osoby z DW do Adresata, gdy grupa nadawca/DO jest pusta. Tylko DW przenosi
oryginalnych odbiorcow DW do Adresata i celowo zostawia pole DW puste.

### Polaczenie, replay i sesje

- recovering moze przetrwac reconnect; setOnline(true) go nie konczy.
- Replayowany zwykly prompt moze zdjac recovering bez synchronizacji.
- playerMailMode moze przetrwac reconnect bez disconnect albo powstac ze
  starego echa.
- ProtoLine nie ma wiarygodnego pochodzenia. Sama generacja nadana przy
  wejsciu linii do pluginu nie rozstrzyga, czy proxy wlasnie odtworzyla
  stara linie.
- Stary listing tej samej skrzynki moze zostac uznany za aktualny.
- Stara pusta odpowiedz moze zastapic archiwum pusta lista.
- Stary list o tym samym numerze moze zostac zapisany jako aktualna tresc.
- Stary prompt pagera moze uruchomic kasowanie albo przekazanie.
- Stare potwierdzenie moze zamknac nowa operacje.
- Stare linie moga zakonczyc compose albo import.
- Automatyczne odswiezenie po wznowieniu moze zostac anulowane bez pozniejszego
  ponowienia.
- Ogolne operacja anulowana ukrywa rozne przyczyny, a reczna operacja moze
  zakonczyc sie bez widocznego komunikatu.

### Reczna poczta gracza

playerMailMode blokuje tylko czesc sciezek. Bez pelnej ochrony komendy pluginu
moga trafic do pagera gracza podczas odczytu, wyszukiwania, wczytywania,
indeksowania, kasowania, przekazywania, compose, importu, pobierania archiwum
i wysylania zwierzecia.

### Pager i edytor

- Timeout pagera przed dowodem otwarcia moze wyslac q.
- Nieznany pager ani legalna reczna sesja gracza nie moga dostawac
  automatycznego q.
- Timeout compose nie obsluguje edytora serwera, ktory moze pozostac otwarty.
- Pozne wysylki i stare wyniki moga zmienic lokalny stan albo formularz.

### Import, timery i zwierze

- Wczesny prompt moze zakonczyc import jako pusty wynik; import aliasow moze
  zapisac pusta liste.
- delayedInboxTimers nie sprawdzaja generacji i nie sa czyszczone przy kazdym
  resecie polaczenia.
- Czesc stanu wysylki zwierzecia przezywa reconnect; stare Slucham? albo pozne
  resolve moze zmienic nowy stan.

## Etap 0 - zakonczona analiza replayu i wniosek o API

Analize read-only wykonano na publicznym drzewie
Delwing/arkadia-web-client-extension, commit
616ea27c949097f13b835d4195af26f4b32f6b14, oraz na lokalnych typach
ArkMaila types/plugin-api.d.ts. Kazdy pobrany plik zrodlowy zostal
zweryfikowany przez rozmiar i Git blob SHA. Nie analizowano niekompletnego
archiwum jako pelnego drzewa.

### Kolejnosc i znaczenie sygnalow

1. MudClient.connect otwiera WebSocket. client.connect jest emitowane w
   onopen, przed jakakolwiek ramka proxy.session.
2. Session.attach w proxy wybiera brakujace dane od offsetu klienta, liczy
   replayedBytes, zdejmuje blokade sesji, a nastepnie wysyla ramke attached.
3. MudClient odbiera attached, przy resumed uruchamia ponowna negocjacje GMCP,
   emituje proxy.session i dopiero pozniej przetwarza kolejne ramki danych.
   Proxy wysyla replay po ramce kontrolnej. proxy.session jest poczatkiem
   attachu, nie koncem replayu.
4. resumed oznacza powrot do istniejacej sesji. upstreamClosed oznacza, ze
   gra zakonczyla polaczenie; replay moze wtedy zawierac wylacznie ostatnie
   dane martwej sesji i nie wolno uzbrajac transportu.
5. replayedBytes jest suma bajtow wybranych do replayu. droppedBytes opisuje
   dane utracone przez ograniczenie bufora albo luke wzgledem offsetu.
6. processedBytes i offsety ack sa wewnetrzne dla MudClienta i proxy. Klient
   przekazuje offset w subprotokole, a potwierdzenia ack wysyla jako osobne
   komunikaty. Plugin nie otrzymuje biezacego offsetu ani potwierdzenia
   zakonczenia replayu.

Dowody: src/web/MudClient.ts 415-530 i 562-566,
services/session-proxy/session.go 369-482, src/web/proxySession.ts 178-225,
src/shared/socket/transport.ts 16-49.

### Dostepne API i niedostepna granica

Publiczne PluginApi udostepnia proxy.session z SessionControl,
socket.incoming z samym tekstem, flushLines z opcjonalnym timestampem oraz
proxy.clockOffset. TriggerCallback otrzymuje linie, dopasowania i typ; nie
otrzymuje znacznika replayu ani offsetu. PluginApi nie udostepnia zegara
client.now ani DecodedFrame.at. W ClientEvents nie ma zdarzenia konca
replayu. Lokalne typy ArkMaila potwierdzaja ten sam zakres; nie ma w nich
publicznego pola pochodzenia linii.

replayedBytes nie moze byc samodzielnym licznikiem konca replayu. Attach
zwalnia s.mu przed wyslaniem ramki kontrolnej i petli replayu. Rownolegly
Session.pump wywoluje Session.deliver, ktore po uzyskaniu s.mu wysyla nowe
dane bezposrednio do tego samego klienta. Nowa ramka moze wiec wejsc miedzy
porcje replayu. Zliczenie replayedBytes bajtow z socket.incoming moze wtedy
policzyc nowy ruch i zwolnic blokade przed ostatnia stara porcja.

Dowody: services/session-proxy/session.go 157-171, 214-229 i 442-481;
services/session-proxy/main.go 185-203; src/client/PluginApi/events.ts,
src/client/PluginApi/triggers.ts, src/client/PluginApi/PluginApi.ts,
src/shared/events/clientEvents.ts 679-690.

Dodatkowo reconnect nie jest jedynym zrodlem starych danych. Gdy karta
obudzi sie na tym samym sockecie, Session.write moze wywolac
flushPendingLocked. Ta sciezka wysyla zalegly bufor bez nowej ramki
proxy.session i bez replayedBytes. Publiczne API nie daje wowczas zadnego
sygnalu poczatku ani konca.

Dowod: services/session-proxy/session.go 332-367 i 521-544.

### Odrzucone obejscie przez flushLines i timestampy

Sprawdzono takze mozliwosc opoznienia przetwarzania ArkMaila do flushLines
albo przejscia na flushLines jako zrodlo linii. Zdarzenie ma timestamp i jest
emitowane przed triggerami z grupami tekstu, wiec poczatkowo wyglada na
pluginowy sposob oznaczania replayu. Nie daje jednak pelnego dowodu:

1. MudClient.processIncomingData zapisuje currentEventTime tylko dla biezacej
   ramki. pendingLineTail i pendingMsgTails moga przechowywac tekst z ramki
   wczesniejszej. flushMessageBuffer skleja held + group.text, a calej
   wynikowej linii przypisuje timestamp ostatniej ramki. Stary fragment moze
   wiec zostac polaczony z aktualnym i uznany za aktualny.
2. scheduleTailFlush wywoluje flushMessageBuffer poza runWithEventTime. Taka
   linia trafia do flushLines bez timestampu, niezaleznie od tego, czy byla
   stara czy aktualna. Brak timestampu nie mowi o pochodzeniu.
3. Ramka z samym GMCP i bez tekstu nie musi wyemitowac flushLines. Zdarzenia
   gmcp oraz gmcp.* sa wykonywane wczesniej i nie przekazuja timestampu do
   PluginApi. Nie mozna wiarygodnie opoznic ich do batcha, ktory moze w ogole
   nie istniec.
4. proxy.clockOffset jest estymatorem diagnostycznym raportowanym co najmniej
   co 50 ms roznicy, a nie dokladnym timestampem ramki kontrolnej. Nie dostaje
   sie przez niego publicznego DecodedFrame.at ani offsetu kazdej porcji.
5. socket.incoming nie ma timestampu. Nie uzupelnia wiec brakow dla ramek bez
   flushLines ani nie rozstrzyga sklejonych linii.

Dowody: src/web/MudClient.ts 140-158, 185-201, 462-526, 893-957, 997-1112;
src/web/proxyClockOffset.ts 12-25 i 76-105; src/shared/socket/gmcp.ts 61-91.

Wniosek: timestamp z flushLines moze byc pomocnicza diagnostyka, ale nie moze
byc podstawa gwarantowanej ochrony operacji. Odrzucenie kazdej niejednoznacznej
linii byloby bezpieczne, lecz mogloby odrzucac rowniez poprawne aktualne
odpowiedzi i nie zapewnialoby sprawnego dzialania pluginu. Nie jest to pelne
rozwiazanie i nie wolno przedstawiac go jako 100%.

### Wniosek wiazacy

Nie istnieje pluginowa, deterministyczna metoda rozroznienia wszystkich
starych i aktualnych linii bez modyfikowania klienta. Nie wolno uzywac pauzy,
pierwszego promptu, pierwszego GMCP, samego replayedBytes, timestampow z
flushLines, identycznej odpowiedzi ani lokalnej generacji linii jako
substytutu.

Bez zmiany klienta wolno natomiast:

- przy kazdym connect/disconnect uniewazniac operacje i blokowac transport;
- dla zywego attachu z jawnym replayedBytes === 0 uznac, ze nie ma replayu
  attachu; nadal trzeba uwzglednic pozniejsze flushPendingLocked;
- przy resumed z replayedBytes > 0 albo nieznanym replayedBytes nie uruchamiac
  automatycznego odswiezenia ani nowych sesji na podstawie replayowanych
  danych;
- pokazac jeden jasny komunikat o braku bezpiecznej synchronizacji, bez q i
  bez obiecywania, ze kolejny reconnect rozwiaze problem;
- nie nazywac takiego zachowania pelna naprawa replayu.

Pelne rozwiazanie wymaga nowego, publicznego kontraktu klienta: co najmniej
zdarzenia zakonczenia kazdego replayu/bufora, takze flushPendingLocked, albo
wiarygodnego pochodzenia przekazywanego przed triggerami do kazdej porcji i
linii. Kontrakt musi miec okreslone zachowanie przy przeplataniu nowego
ruchu. Zmiana klienta nie jest wykonywana w tym planie i wymaga odrebnej
decyzji.

## Etap 1 - komunikaty dla wszystkich zakresow reply-all

### Zmiana

Wewnętrzny wynik budowania odpowiedzi ma rozrozniac:

- poprawny prefill;
- no-recipients: wybrany zakres nie zawiera adresatow;
- only-current-character: wszystkie znalezione adresy naleza do aktualnej
  postaci, takze przy powtorzeniach i roznej wielkosci liter.

Wynik ma zawierac zakres all/to/cc. Jedna wspolna klasyfikacja obsluguje
zwykly list i Archiwum. Interfejs nie zgaduje przyczyny samodzielnie.

### Komunikaty

DO + DW, brak adresatow:

"Nie mozna przygotowac odpowiedzi wszystkim, poniewaz list nie zawiera adresatow odpowiedzi."

DO + DW, wylacznie aktualna postac:

"Nie mozna przygotowac odpowiedzi wszystkim, poniewaz Twoja postac jest jedynym adresem odpowiedzi i zostaje pominieta."

Tylko DO, brak adresatow:

"Nie mozna przygotowac odpowiedzi w zakresie Tylko DO, poniewaz ten zakres nie zawiera adresatow."

Tylko DO, wylacznie aktualna postac:

"Nie mozna przygotowac odpowiedzi w zakresie Tylko DO, poniewaz Twoja postac jest jedyna osoba w tym zakresie i zostaje pominieta."

Tylko DW, brak adresatow:

"List nie ma odbiorcow DW, wiec nie mozna przygotowac odpowiedzi tylko do DW."

Tylko DW, wylacznie aktualna postac:

"Nie mozna przygotowac odpowiedzi tylko do DW, poniewaz Twoja postac jest jedynym odbiorca DW i zostaje pominieta."

Sformulowanie zakres Tylko DO jest celowe, poniewaz dla listow odebranych
obejmuje on takze nadawce.

### Testy

Dla kazdego zakresu sprawdzic brak adresatow, wylacznie aktualna postac,
powtorzenia i wielkosc liter, aktualna postac z inna osoba oraz brak aktualnej
postaci. Obejmuja one zwykly list, Archiwum i cytowanie.

Dodatkowo:

- Odebrane/Nieprzeczytane: zewnetrzny nadawca zapobiega pustemu Tylko DO i
  DO + DW, nawet gdy DO i DW zawieraja tylko aktualna postac.
- Wyslane/Niewyslane: nadawca nie ratuje wyniku; puste DO z innymi osobami
  w DW daje puste Tylko DO, ale poprawne DO + DW.
- Wszystkie skrzynki: samotna aktualna postac w DW daje konkretny komunikat.

Nie zmieniamy pomijania wlasnej postaci, deduplikacji, skladu odbiorcow,
braku fallbacku, przenoszenia DW do Adresata, istniejacego formularza ani
braku komend przy pustym wyniku.

## Etap 2 - jednolity reset stanu polaczenia

Wydzielic jedna procedure resetu dla connect, disconnect, zamkniecia upstreamu
i powrotu do logowania. Ma ona:

- uniewazniac stare operacje i ich pozne wyniki;
- czysic playerMailMode i awaitingPlayerMailPrompt takze przy reconnectcie
  bez disconnect;
- kasowac opoznione odswiezenia;
- nadawac timerom generacje i odrzucac juz zakolejkowane stare callbacki;
- czysic niepotwierdzone wyslanie zwierzecia i okno Slucham?;
- zwiekszac animalSendSerial, aby pozne zakonczenie nie zmienilo nowego stanu;
- usuwac stare modale, kolejki i oczekujace echa;
- pozostawiac spojny interfejs;
- byc idempotentna przy powtorzonych zdarzeniach, bez duplikatow komend,
  timerow i odswiezen.

setOnline(true) nie zdejmuje synchronizacji. Przy kazdym nowym connect
transport pozostaje rozbrojony do sygnalu dozwolonego przez etap 0. Sam
client.connect, dowolne GMCP ani proxy.session nie sa dowodem aktualnosci.

Automatyczne odswiezenie po wznowieniu z replayedBytes === 0 wykonuje sie
dokladnie raz i nie duplikuje sie przez kolejne GMCP. Przy niepustym albo
nieznanym replayu zadanie nie startuje; nie wolno zastepowac go odswiezeniem
po pierwszym promptcie. Pelne ponowienie po replayu zalezy od publicznego
sygnalu konca opisanego w etapie 0.

Testy: reconnect z/bez disconnect, powtorne connect/proxy.session, reconnect
podczas recznej poczty, stare opoznione odswiezenie, stare Slucham?, pozne
resolve zwierzecia, brak komend na logowaniu, brak odswiezenia przy niepustym
replayu i jedno odswiezenie przy pustym replayu oraz wielu sygnalach
obecnosci.

## Etap 3 - centralna ochrona przed replayem i poznymi odpowiedziami

Etap jest zablokowany dla pelnego automatycznego wznowienia przez brak API
udowodniony w etapie 0. Nie implementujemy licznika replayedBytes jako
pozornej granicy.

### Czesc wykonalna bez zmiany klienta

Centralny punkt wejscia ma odrzucac caly ruch ArkMaila przez czas aktywnej
blokady synchronizacji, przed:

- wszystkimi aktywnymi maszynami sesji;
- recovering i playerMailMode;
- wejsciem przez stare echo w playerMailMode;
- odswiezeniami, archiwum i zwierzeciem.

Przy niepustym/nieznanym replayu blokada pozostaje fail-closed: zero komend
pluginu, zero automatycznego odswiezenia i jedno zrozumiale powiadomienie.
Nie wolno jej zdejmowac po uplywie czasu ani zwyklym promptem. To ogranicza
szkody, ale nie zapewnia automatycznego powrotu do pracy i nie zamyka etapu
jako pelnej naprawy.

Testy tej czesci: replayowany prompt nie zdejmuje blokady; replayowane echo
nie wlacza recznej poczty; stary listing/list/potwierdzenie nie zmienia
archiwum i nie uruchamia komend; pusty replay attachu dopuszcza jedna nowa
operacje; nowy ruch wplatany przed osiagnieciem replayedBytes nie zdejmuje
blokady; flushPendingLocked bez proxy.session nie jest traktowany jako
aktualny dowod synchronizacji.

### Czesc wymagajaca odrebnego kontraktu klienta

Po dostarczeniu wiarygodnego sygnalu konca kazdego replayu/bufora centralny
punkt wejscia ma przypisywac linie do wlasciwego okresu polaczenia, a po
koncu przepuszczac aktualny ruch i wykonac jedno odswiezenie bez komend
probnych.

Kazdy ponizszy test najpierw musi past na starym kodzie:

1. Stary listing tej samej skrzynki nie konczy nowej operacji i nie zmienia
   archiwum.
2. Stara odpowiedz pusta nie czysci aktualnej skrzynki.
3. Stary list o tym samym numerze nie zostaje zapisany jako aktualny.
4. Stary prompt o zgodnym numerze nie uruchamia d ani f.
5. Stare potwierdzenie kasowania/przekazania nie konczy nowej operacji.
6. Stary prompt nie konczy nowego importu.
7. Stary wynik compose nie daje sukcesu i nie czysci formularza.
8. Replayowany zwykly prompt nie zdejmuje synchronizacji.
9. Replayowane echo list/listy nie wlacza recznej poczty.
10. Po zakonczeniu replayu identyczne aktualne odpowiedzi dzialaja.
11. Nowy ruch wplatany w replay nie jest bledna granica, a po sygnale konca
    zadna stara porcja nie zostaje juz przyjeta.
12. Bufor wypelniony na tym samym sockecie ma rowniez jednoznaczny koniec.

Testy wykonuja rzeczywista sciezke adaptera i integracji, nie wylacznie
sztucznie oznaczone obiekty ProtoLine. Do czasu nowego kontraktu testy 10-12
nie moga byc uczciwie zaliczone przez sam ArkMail.

## Etap 4 - pelna blokada komend pluginu podczas recznej poczty

Wprowadzic centralne zabezpieczenie transportu dla komend ArkMaila zamiast
dodawac niezalezne warunki do pojedynczych handlerow.

Ochrona obejmuje otwieranie sesji, pierwsza komende i kolejke: odczyt,
wyszukiwanie, strony, indeksowanie, kasowanie, przekazywanie, compose, import,
pobieranie archiwum i zwierze. Komendy gracza pozostaja nietkniete.

Reczna operacja UI pokazuje:

"Najpierw zakoncz reczna sesje poczty w grze, a potem powtorz operacje w ArkMailu."

Automatyczne operacje parkuja bez powiadomien. Po wyjsciu nastepuje jedno
zbiorcze odswiezenie.

Test parametryczny przechodzi przez wszystkie publiczne operacje UI i dowodzi:
zero komend pluginu, brak zmian archiwum, komunikat dla uzytkownika, brak
powiadomien automatycznych, jeden pozniejszy drenaz i nietkniete komendy
gracza.

## Etap 5 - pager i timeouty

Timeout przed dowodem otwarcia pagera nie wysyla q.

q jest dozwolone dopiero po dowodzie wlasnego pagera: zgodny naglowek listu,
rozpoznany prompt pagera albo potwierdzone wczesniejsze otwarcie przez
istniejaca sciezke.

Przy calkowitej ciszy przed naglowkami operacja konczy sie timeoutem, bez q,
bez zapisu i bez automatycznego zamykania legalnej sesji gracza. Nieznany
pager pozostaje nietkniety.

Testy: cisza przed naglowkiem bez q; timeout po potwierdzonym pagerze z
kontrolowanym zamknieciem; timeout podczas zamykania z synchronizacja i
wlasciwym komunikatem; reczny pager bez interwencji; stary prompt bez akcji.

## Etap 6 - timeout compose i edytor serwera

Obsluzyc timeout zaleznie od stanu:

1. Przed potwierdzeniem edytora: bez ~q, wynik niepotwierdzony, brak kolejnych
   komend do synchronizacji.
2. Po potwierdzeniu edytora: jedno ~q, oczekiwanie na przerwanie i zwykly
   prompt przez ograniczony czas.
3. Brak potwierdzenia zamkniecia: synchronizacja i blokada komend pluginu,
   bez sukcesu.
4. Disconnect: bez wysylania ~q do zamknietego polaczenia; wspolny reset.

Formularz po bledzie zostaje nietkniety. Po timeoutcie/anulowaniu nie wolno
wyslac kolejnej linii tresci.

Testy dla timeoutu na adresacie, temacie, DW, przed edytorem, w tresci i po
**: najwyzej jedno ~q, zero ~q bez potwierdzonego edytora, brak falszywego
sukcesu, brak czyszczenia formularza, brak poznych wysylek i poprawny powrot
po synchronizacji.

## Etap 7 - import i ochrona archiwum

Wczesny prompt bez rozpoznanej odpowiedzi na komende importu nie jest
prawidlowa pusta lista. Zapis wymaga rozpoznania odpowiedzi, jej aktualnosci
i zakonczenia wlasciwej sesji. Prawidlowa pusta lista jest akceptowana na
podstawie jawnego naglowka albo komunikatu pustego wyniku, nie samego promptu.

Dodatkowa ochrona archiwum:

- zastepowanie rekordow wylacznie przy confirmed === true;
- zero kasowan dla wyniku niejednoznacznego, niepotwierdzonego lub z innej
  generacji;
- zero zapisu tresci po wyniku niejednoznacznym;
- zero komend kasowania/przekazywania z niepotwierdzonego promptu.

Testy: prawidlowy pusty import, przedwczesny prompt, replay pustego listingu,
niekompletny listing, stary list o tym samym numerze i reconnect przed zapisem.

## Etap 8 - komunikaty o anulowaniu i synchronizacji

Rozroznic anulowanie przez reconnect, reczna poczte, brak synchronizacji,
timeout i zamierzone anulowanie automatyczne.

- Reczna operacja uzytkownika zawsze ma zrozumialy komunikat.
- Automatyczne anulowanie nie generuje zbednych powiadomien.
- Komunikat nie sugeruje otwartego pagera ani koniecznosci q bez dowodu.
- Po limicie czasu nie moze zostac niewidoczna trwala blokada i milczace
  klikniecia.

## Mapa pokrycia wszystkich znalezisk

| Znalezisko | Etap |
|---|---|
| Niejasne komunikaty pustego reply-all we wszystkich zakresach | 1 |
| recovering przezywa reconnect | 2 i 3 |
| Replayowany prompt zdejmuje blokade | 3 |
| playerMailMode przezywa reconnect albo powstaje ze starego echa | 2 i 3 |
| Komendy pluginu wychodza podczas recznej poczty | 4 |
| Pomijane automatyczne odswiezenie po wznowieniu | 2 |
| Stary listing albo pusta odpowiedz zmienia archiwum | 3 i 7 |
| Stary list o tym samym numerze zostaje zapisany | 3 i 7 |
| Stare prompty uruchamiaja kasowanie/przekazywanie | 3 |
| Stare linie koncza compose lub import | 3, 6 i 7 |
| Timeout pagera wysyla q bez dowodu pagera | 5 |
| Timeout compose nie obsluguje otwartego edytora | 6 |
| Stare timery odswiezen przezywaja reconnect | 2 |
| Stan zwierzecia reaguje na stare zdarzenia | 2 i 3 |
| Ogolne lub niewidoczne operacja anulowana | 4 i 8 |

## Procedura wykonania kazdego przypadku

1. Jeden nowy przypadek testowy opisuje zachowanie uzytkownika.
2. Test uruchamiamy lokalnie na starym kodzie i zapisujemy rzeczywisty wynik
   niepowodzenia w raporcie.
3. Dodajemy minimalna implementacje.
4. Ten sam test przechodzi.
5. Pelne szybkie testy lokalne, tsc --noEmit i build przechodza.
6. Test i poprawka trafiaja do jednego commita razem z aktualizacja planu.
7. Dopiero potem rozpoczynamy nastepny przypadek.

Raport etapu zawiera nazwe scenariusza, wynik przed i po poprawce, liczbe
testow, wynik typowania/buildu i liste zmienionych plikow. Nie deklarujemy
sprawdzenia w grze, jesli go nie wykonano.

## Kontrole koncowe i wydanie

Wydanie jako zamkniecie calego planu wymaga pelnego etapu 3. Jesli kontrakt
klienta pozostaje niezmieniony, wolno co najwyzej przygotowac osobno
zdecydowany zakres czesciowy; nie wolno opisac go jako naprawy wszystkich
znalezisk ani pelnej obslugi replayu.

1. Pelne lokalne testy, typowanie i build.
2. Jedna pelna macierz scenariuszowa ArkMaila i zgodnosci z klientem na
   GitHubie po ostatnim etapie, przed wydaniem.
3. Dowod, ze kazda pozycja mapy ma test i lokalny wynik na starym kodzie.
4. Kontrola repozytorium pod katem danych wrazliwych, prywatnych nazw i
   niedozwolonego jezyka.
5. Wersja 1.30.14 w meta.ts i plugin.json, zgodna z semver.
6. Deterministyczny arkmail_1_30_14.zip z index.ts i plugin.json; porownanie
   paczki ze zrodlami oraz kontrola SHA-256.
7. GitHub Release ArkMail v1.30.14 z dokladnie jednym poprawnym assetem.
   Opis zgodny z docs/ZASADY.md.
8. Release odpowiada najnowszemu main; nie zamykamy prac z rozjazdem.
9. Raport koncowy rozdziela testy syntetyczne od sprawdzen w grze.
10. Usuniecie wykonanego planu roboczego i pozostalych tymczasowych plikow.
    Zadnych publikacji poza GitHubem bez odrebnego polecenia.
