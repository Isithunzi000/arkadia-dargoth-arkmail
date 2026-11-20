# Plan roboczy poprawek ArkMail 1.30.14

Data utworzenia: 2026-11-21.

## Status i przeznaczenie

To jest tymczasowy, roboczy dokument wykonawczy. Ma zachowac kompletny
zakres prac niezaleznie od kompresji rozmowy. Dokument aktualizujemy po
kazdym istotnym ustaleniu. Po wykonaniu calego planu usuwamy go wraz z
innymi tymczasowymi artefaktami, pozostawiajac jedynie wlasciwa dokumentacje
produktu.

Plan obejmuje wszystkie dotychczas znalezione problemy z komunikatami
reply-all, reconnectem, przeładowaniem, replayem proxy, pagerem, edytorem,
reczna poczta gracza, archiwum, importem, timerami i zwierzeciem.

Plan nie jest jeszcze zatwierdzeniem implementacji. Nie wolno uznac go za
w pelni gotowy, dopoki analiza replayu nie wskaze wiarygodnego mechanizmu
odroznienia starych i aktualnych linii.

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

## Etap 0 - zamkniecie projektu ochrony przed replayem

Przed implementacja ochrony sesji wykonac pelna analize read-only aktualnego
kodu proxy, klienta, PluginApi oraz zainstalowanych typow.

Ustalic i zapisac w tym dokumencie:

1. Kolejnosc client.connect, proxy.session, replayu bufora, GMCP i nowego
   ruchu z gry.
2. Znaczenie resumed, upstreamClosed, replayedBytes, droppedBytes oraz
   dostepnych offsetow i potwierdzen odbioru.
3. Czy publiczne API udostepnia poczatek lub koniec replayu, pochodzenie
   linii, offset albo inna jednoznaczna granice.
4. Czy replay moze przeplatac sie z nowym ruchem.
5. Jak plugin moze zablokowac nowe sesje do konca replayu bez modyfikowania
   klienta i bez wysylania komend probnych do gry.

Nie wolno zastepowac granicy replayu pauza, pierwszym promptem, pierwszym
GMCP ani zalozeniem, ze identyczna odpowiedz jest nowa.

Jesli API daje wiarygodna granice, projekt ma wskazac konkretne zdarzenie
zamykajace kwarantanne i konkretna sciezke testowa.

Jesli publiczne API nie daje wystarczajacej informacji, nalezy jawnie zapisac
ograniczenie i nie deklarowac pelnej naprawy replayu. Nie dostarczamy
pozornej poprawki. Ewentualna zmiana kontraktu klienta wymaga odrebnej
decyzji i nie jest wykonywana w repozytorium klienta w ramach tego planu.

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

setOnline(true) nie zdejmuje synchronizacji. Gotowosc wyznacza wylacznie
mechanizm zamkniety projektowo w etapie 0.

Automatyczne odswiezenie po wznowieniu nie startuje przed gotowoscia, wykonuje
sie dokladnie raz po gotowosci, nie znika przez recovering i nie duplikuje sie
przez kolejne GMCP.

Testy: reconnect z/bez disconnect, powtorne connect/proxy.session, reconnect
podczas recznej poczty, stare opoznione odswiezenie, stare Slucham?, pozne
resolve zwierzecia, brak komend na logowaniu i jedno odswiezenie przy wielu
sygnalach obecnosci.

## Etap 3 - centralna ochrona przed replayem i poznymi odpowiedziami

Implementacja zalezy od wyniku etapu 0. Centralny punkt wejscia linii ma:

- przypisywac linie do wlasciwego okresu polaczenia;
- blokowac replay przed wszystkimi aktywnymi maszynami sesji;
- blokowac stare prompty przed recovering i playerMailMode;
- blokowac stare echo przed wejsciem w playerMailMode;
- blokowac stare zdarzenia przed odswiezeniami, archiwum i zwierzeciem;
- po zakonczeniu replayu przepuszczac aktualny ruch bez komend uzytkownika.

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

Testy wykonuja rzeczywista sciezke adaptera i integracji, nie wylacznie
sztucznie oznaczone obiekty ProtoLine.

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
