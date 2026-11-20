# Plan roboczy poprawek ArkMail 1.30.14

Data utworzenia: 2026-11-21.
Ostatnia aktualizacja: 2026-11-21, przyjecie resetu i recznego ponowienia.

## Status i przeznaczenie

To jest tymczasowy, roboczy dokument wykonawczy. Ma zachowac kompletny
zakres prac niezaleznie od kompresji rozmowy. Dokument aktualizujemy po
kazdym istotnym ustaleniu. Po wykonaniu calego planu usuwamy go wraz z
innymi tymczasowymi artefaktami, pozostawiajac jedynie wlasciwa dokumentacje
produktu.

Plan obejmuje wszystkie dotychczas znalezione problemy z komunikatami
reply-all, reconnectem, przeładowaniem, replayem proxy, pagerem, edytorem,
reczna poczta gracza, archiwum, importem, timerami i zwierzeciem.

Plan nie jest zatwierdzeniem implementacji. Etap 0 zostal zakonczony.
Publiczne API nie daje wiarygodnej granicy replayu ani pochodzenia linii
we wszystkich scenariuszach, dlatego plugin nie probuje odtwarzac nieznanego
stanu gry. Przyjetym i kompletnym modelem obslugi jest: przerwij stara operacje,
wyczysc kolejki i timery, poinformuj uzytkownika, jesli cos przerwano, oraz
pozwol mu swiadomie powtorzyc czynnosc od czystego stanu.

Zakres 100% dotyczy tego modelu bezpiecznego przerwania i recznego ponowienia.
Nie obejmuje automatycznego wznawiania starej operacji ani zgadywania, ktora
linia pochodzi z replayu. Nie sa one warunkiem wydania. Rozwiazanie wykonujemy
wylacznie w ArkMailu, bez zmiany klienta Dargoth.

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

## Etap 0 - zakonczona analiza replayu i decyzja produktowa

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

### Wniosek wiazacy i przyjety model obslugi

Nie istnieje pluginowa, deterministyczna metoda rozroznienia wszystkich
starych i aktualnych linii bez modyfikowania klienta. Nie wolno uzywac pauzy,
pierwszego promptu, pierwszego GMCP, samego replayedBytes, timestampow z
flushLines, identycznej odpowiedzi ani lokalnej generacji linii jako
substytutu. Nie jest to jednak blokada prac, poniewaz celem nie jest
automatyczne kontynuowanie starej operacji.

Po connect, disconnect, zamknieciu upstreamu, powrocie do logowania oraz przy
niepustym albo nieznanym replayu ArkMail wykonuje wspolny reset:

1. Anuluje aktywne operacje i uniewaznia ich pozne wyniki.
2. Zatrzymuje timery, kolejki, automatyczne komendy i automatyczne odswiezenia.
3. Czysci stan pagerow, edytora, importu, recznej poczty, archiwum w toku i
   wysylki zwierzecia, pozostawiajac dane trwale oraz tresc formularza.
4. Nie wysyla q, ~q, znakow sterujacych ani komend probnych.
5. Przy przerwanej operacji uzytkownika pokazuje jeden zrozumialy komunikat
   z poleceniem powtorzenia. Reset podczas bezczynnosci jest cichy.
6. Umozliwia nowa operacje wylacznie po jawnym dzialaniu uzytkownika. Nowa
   operacja dostaje nowa generacje i zaczyna sie od czystego stanu.
7. Powtorzone sygnaly resetu sa idempotentne: nie duplikuja komunikatow,
   timerow, komend ani odswiezen.

Dane przychodzace w stanie bezczynnosci po resecie nie moga same otwierac sesji,
zmieniac archiwum, zdejmowac blokady ani uruchamiac komend. Dotyczy to takze
zaleglego bufora dostarczonego bez proxy.session. Swiadome ponowienie przez
uzytkownika jest decyzja o rozpoczeciu nowej operacji, a nie dowodem
rozroznienia kazdej pozniejszej linii; plan nie obiecuje takiej klasyfikacji.

Przy zywym attachu z replayedBytes === 0 wolno wykonac dokladnie jedno
automatyczne odswiezenie. Przy replayu niepustym albo nieznanym automatyczne
odswiezenie nie startuje. Uzytkownik moze recznie ponowic potrzebna czynnosc.
Zadne dodatkowe API klienta ani zmiana Dargotha nie sa wymagane do tego modelu.

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

setOnline(true) nie odtwarza zadnej przerwanej sesji. Po resecie transport
pozostaje rozbrojony dla automatyzmu, a przychodzace linie i GMCP nie moga
utworzyc nowej operacji bez dzialania uzytkownika. Sam client.connect, dowolne
GMCP, prompt ani proxy.session nie sa dowodem aktualnosci i nie zdejmuja
blokady automatycznych dzialan.

Reczne polecenie uzytkownika po komunikacie o przerwaniu otwiera jedna nowa
generacje operacji. Nie poprzedza sie jej q ani innymi komendami probnymi.
Automatyczne odswiezenie po wznowieniu z replayedBytes === 0 wykonuje sie
dokladnie raz i nie duplikuje sie przez kolejne GMCP. Przy niepustym albo
nieznanym replayu zadanie nie startuje i nie jest zastepowane odswiezeniem po
pierwszym promptcie.

Testy: reconnect z/bez disconnect, powtorne connect/proxy.session, reconnect
podczas recznej poczty, stare opoznione odswiezenie, stare Slucham?, pozne
resolve zwierzecia, brak komend na logowaniu, zachowanie formularza i danych
trwalych, jedno ponowienie przez uzytkownika, brak odswiezenia przy niepustym
replayu i jedno odswiezenie przy pustym replayu oraz wielu sygnalach obecnosci.

## Etap 3 - centralne przerwanie, ochrona archiwum i reczne ponowienie

Etap jest w pelni wykonalny w ArkMailu. Nie implementujemy licznika
replayedBytes jako pozornej granicy ani automatycznego wznawiania operacji.

### Centralna bramka stanu

Jeden punkt wejscia obsluguje caly ruch ArkMaila przed maszynami sesji,
recovering, playerMailMode, odswiezeniami, archiwum i zwierzeciem. Po resecie
oraz w stanie bezczynnosci:

- zadna przychodzaca linia ani GMCP nie otwiera sesji i nie uruchamia komendy;
- stary listing, pusta odpowiedz, list, prompt lub potwierdzenie nie zmienia
  archiwum i nie konczy zadnej nowej operacji;
- replayowane echo nie wlacza recznej poczty;
- replayowany zwykly prompt nie zdejmuje recovering i nie synchronizuje stanu;
- automatyczne odswiezenie jest dopuszczone tylko wedlug etapu 2;
- brak q, ~q, kasowania, przekazania i innych komend na podstawie starych danych.

Aktywna operacja uzytkownika jest anulowana przez zdarzenia resetujace z etapu
0 i etapu 2. Jej pozne odpowiedzi maja stara generacje i sa ignorowane. Nowa
operacja moze powstac tylko z nowego polecenia uzytkownika. Powtorzenie jest
jednorazowe, nie uruchamia zadnych zaparkowanych komend z poprzedniej sesji.

### Komunikat i powrot do pracy

Jesli reset przerwal reczna operacje, pokaz jeden komunikat:

"Polaczenie zostalo wznowione. Poprzednia operacja pocztowa zostala przerwana. Wykonaj ja ponownie."

Jesli bezposrednia przyczyna jest replay, wolno uzyc:

"Klient odtworzyl dane poprzedniej sesji. ArkMail przerwal poprzednia operacje, aby nie wykonywac komend na podstawie starych danych. Wykonaj operacje ponownie."

Komunikat nie sugeruje otwartego pagera, koniecznosci q ani kolejnego reloadu.
Po swiadomym ponowieniu plugin wykonuje normalna sciezke nowej operacji.
Automatyczne operacje w tle nie generuja powiadomien i nie sa wznawiane.

### Testy

Kazdy przypadek najpierw musi pasc na starym kodzie:

1. Reconnect i replay podczas bezczynnosci nie wysylaja komend i nie pokazuja
   zbednego komunikatu.
2. Reset podczas aktywnej operacji anuluje ja, kasuje timery i pokazuje jeden
   wlasciwy komunikat.
3. Powtorzone connect, disconnect i proxy.session nie duplikuja efektow.
4. Replayowany prompt nie zdejmuje blokady, a stare echo nie wlacza recznej
   poczty.
5. Stary listing, pusta odpowiedz i stary list o tym samym numerze nie zmienia
   archiwum.
6. Stary prompt lub stare potwierdzenie nie uruchamia kasowania, przekazania,
   compose, importu ani q.
7. Stare linie nie daja sukcesu compose/importu i nie czyscza formularza.
8. Jawne ponowienie otwiera dokladnie jedna nowa operacje bez q, komend
   probnych i drenazu starej kolejki.
9. Pozne wyniki starej generacji nie zmieniaja nowej operacji.
10. Zalegly bufor bez proxy.session w stanie bezczynnosci pozostaje bez wplywu
    na sesje, archiwum i komendy.
11. Pusty replay dopuszcza jedno automatyczne odswiezenie, a niepusty lub
    nieznany replay go nie uruchamia.
12. Zwykla nowa operacja bez replayu dziala bez zmian.

Testy wykonuja rzeczywista sciezke adaptera i integracji, nie wylacznie
sztucznie oznaczone obiekty ProtoLine. Kryterium zakonczenia etapu jest opisane
powyzej bezpieczne przerwanie i reczne ponowienie, nie automatyczna klasyfikacja
kazdej linii.

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
powiadomien automatycznych, jedno pozniejsze zbiorcze odswiezenie i nietkniete komendy
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

Rozroznic anulowanie przez reconnect, replay, reczna poczte, timeout i
zamierzone anulowanie automatyczne. Dla reconnectu i replayu obowiazuja tresci
z etapu 3. Pozostale komunikaty maja nazywac rzeczywisty powod i sposob powrotu
do pracy.

- Reczna operacja uzytkownika zawsze ma zrozumialy komunikat o przerwaniu.
- Automatyczne anulowanie oraz reset podczas bezczynnosci nie generuja
  zbednych powiadomien.
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
| Zalegly bufor po obudzeniu karty bez ramki kontrolnej | 2 i 3 |
| Pozne wyniki i stare callbacki zmieniaja nowa operacje | 2 i 3 |
| Reset musi zachowac dane trwale i tresc formularza | 2, 3 i 6 |
| Reczne ponowienie bez reloadu, q i komend probnych | 3 i 8 |

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

Wydanie zamyka caly plan po wykonaniu wszystkich etapow w przyjetym modelu
bezpiecznego przerwania i recznego ponowienia. Zmiana klienta Dargoth ani
automatyczne wznawianie starej operacji nie sa warunkiem wydania. Opis wydania
nie moze obiecywac automatycznego kontynuowania przerwanej operacji.

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
