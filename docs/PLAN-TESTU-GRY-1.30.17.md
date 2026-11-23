# Plan kontrolowanego testu ArkMail 1.30.17 na grze

## Cel i podstawa

Test ma sprawdzic zachowanie oficjalnego wydania 1.30.17 w prawdziwym kliencie Dargoth i na realnym serwerze. Punktem wyjscia jest commit `065fc9b9181c103cc325bfa956ac19a0dd129a86`. Test nie jest zmiana produktu, nie zastepuje lokalnych testow regresji i nie jest podstawa do deklarowania naprawy bez osobnej poprawki.

Pierwszym celem jest ustalenie rzeczywistej kolejnosci zdarzen przy kolejnych odczytach, zwlaszcza listow stronicowanych. Dopiero pozniejsze etapy obejmuja pozostale uzgodnione funkcje. Kazdy etap ma osobny wynik i moze zostac przerwany bez kontynuowania kolejnych dzialan.

## Bezpieczenstwo

- Praca odbywa sie w izolowanym, nieutrwalanym profilu przegladarki, bez zapisu danych logowania, stanu sesji, historii, zrzutow ekranu, nagran, surowych logow ani plikow zawierajacych tresci gry.
- Nie wolno wchodzic w interakcje z graczami, wykonywac komend walki, ruchu, rozmowy, handlu ani innych dzialan swiata gry. Dzialania dotycza wylacznie interfejsu poczty.
- Wszystkie operacje wykonuje sie powoli, pojedynczo i z przerwami miedzy dzialaniami. Bez rownoleglych przebiegow, petli masowych, automatycznego ponawiania bledow i obciazania serwera.
- Wszystkie operacje wykonuje sie bez fizycznego wyslania zadnego listu. Zakaz obejmuje wysylke zwykla, przez zwierze, odpowiedz, odpowiedz z cytowaniem, odpowiedz wszystkim i przekazanie zakonczone wysylka.
- Nie wolno usuwac listow z odebranych ani wyslanych. Nie wolno tez usuwac wczesniej istniejacych niewyslanych listow.
- Usuwanie niewyslanych obejmuje wylacznie listy testowe utworzone podczas tego testu. Przed usunieciem trzeba ponownie ustalic ich tozsamosc w biezacym kontekscie skrzynki.
- Odpowiedzi i ich warianty moga byc sprawdzane tylko do momentu przygotowania lub zapisu niewyslanego listu testowego. Nie wolno zatwierdzic wysylki.
- Dane testowe w edytorze i ksiazce adresowej maja byc syntetyczne. Nie wolno wpisywac do trwalych plikow nazw postaci, adresatow, tematow, tresci ani innych danych pochodzacych z gry.
- Eksporty sa przechwytywane i sprawdzane w pamieci przegladarki, bez zapisywania wygenerowanych archiwow na dysku. Taki test potwierdza wygenerowanie i strukture pliku, ale nie fizyczny zapis i ponowny odczyt z dysku.
- Czyszczenie danych lokalnych dotyczy tylko izolowanego profilu testowego.

## Diagnostyka bez tresci

Dozwolone sa wylacznie zanonimizowane metadane: czas wzgledny, kierunek zdarzenia, klasa linii, dlugosc linii, rozpoznany konstrukt protokolu, stan sesji, liczba prob, rodzaj wyslanej komendy, stan blokady, modalu i odzyskiwania.

Nie rejestruje sie tresci linii, naglowkow listow, nazw, adresatow, tematow, danych logowania, surowych ramek ani identyfikatorow pozwalajacych odtworzyc prywatne dane. Numer listu mozna zapisac tylko jako tymczasowa dana techniczna niezbedna do sprawdzenia zgodnosci odpowiedzi; nie wolno laczyc go z trescia ani zapisujacym go trwalym raportem.

## Etap 1: srodowisko i kontrola ograniczen

1. Uruchomic prawdziwego Dargotha i zainstalowac oficjalna paczke ArkMail 1.30.17.
2. Potwierdzic wersje wtyczki i brak innych wtyczek mogacych zmieniac poczte lub komendy.
3. Przygotowac kontrole zapisow tak, aby eksporty, logi i dane diagnostyczne nie opuscily pamieci procesu.
4. Zalogowac sie i poczekac na stabilny zwykly prompt. Nie wykonywac zadnej komendy swiata gry.
5. Wczytac skrzynki pojedynczo i sprawdzic, czy kanal jest zsynchronizowany przed pierwszym odczytem.

## Etap 2: reprodukcja bledu odczytu

1. Wybrac kilka istniejacych listow o roznym rozmiarze bez zapisywania ich tresci.
2. Odczytywac je pojedynczo, z przerwami, w tym liste stronicowana.
3. Rejestrowac wylacznie metadane: moment naglowkow, stron, promptu pagera, ciszy, pustej komendy, `q`, zwyklego promptu, zwrotu wyniku i zwolnienia blokady.
4. Sprawdzic, czy treść nie pojawia sie w glownej konsoli i czy kolejny odczyt rozpoczyna sie od wlasciwego stanu.
5. Po pierwszym bledzie przerwac ten scenariusz. Nie wykonywac automatycznych ponowien. Stan pagera mozna zamknac tylko w ramach wlasnej operacji odczytu, bez zaznaczania listow do usuniecia.
6. Ustalic, czy pierwszym nieprawidlowym zdarzeniem bylo zbędne przejscie, przedwczesne zakonczenie po `q`, niezgodnosc numeru, opozniona odpowiedz czy inna sekwencja.

## Etap 3: skrzynki, indeksacja i archiwum

1. Wczytac wszystkie cztery skrzynki i sprawdzic liczby wpisow bez zapisywania ich danych.
2. Sprawdzic wczytanie starszych stron w ograniczonym zakresie potrzebnym do potwierdzenia funkcji; nie pobierac calej tresci archiwum.
3. Sprawdzic filtrowanie po stronie serwera i lokalne, wyswietlanie archiwum oraz pobranie kilku lub kilkunastu wybranych listow.
4. Sprawdzic zgodnosc wynikow, zachowanie nieprzeczytanych, paginacje, zapis lokalny i zachowanie po odswiezeniu.
5. Nie usuwac zadnych wpisow serwerowych w tym etapie.

## Etap 4: niewyslane, odpowiedzi i przekazywanie bez wysylki

1. Utworzyc kilka listow testowych wylacznie z syntetyczna trescia i pozostawic je w niewyslanych.
2. Sprawdzic odpowiedz, odpowiedz z cytowaniem i odpowiedz wszystkim dla dostepnych wariantow naglowkow, adresatow i DW.
3. Sprawdzic przygotowanie odbiorcow, tematu, cytatu i tresci bez zatwierdzania wysylki.
4. Sprawdzic przekazanie tylko do punktu utworzenia niewyslanego listu testowego.
5. Sprawdzic zaznaczanie, odznaczanie i rozne dostepne sposoby usuwania wylacznie na utworzonych listach testowych.
6. Usunac wszystkie utworzone listy testowe i potwierdzic ich brak. Nie zmieniac wczesniej istniejacych niewyslanych.

## Etap 5: eksporty i ksiazka adresowa

1. Przechwycic eksport zbiorczy ZIP i eksport pojedynczego listu w pamieci. Sprawdzic sygnature ZIP, mozliwosc rozpakowania, liczbe wpisow, strukture i kompletnosc metadanych bez trwalego zapisu.
2. W ksiazce adresowej uzyc wylacznie syntetycznych kontaktow. Sprawdzic dostepne importy, eksporty w pamieci, filtrowanie i usuwanie utworzonych wpisow.
3. Sprawdzic czyszczenie ksiazki dopiero po upewnieniu sie, ze izolowany profil nie zawiera wczesniejszych danych uzytkownika.
4. Sprawdzic czyszczenie pamieci i zapisanych danych, takze podczas aktywnej operacji lub odzyskiwania, jezeli taki stan wystapi naturalnie. Nie wolno wymuszac niebezpiecznego stanu dodatkowymi komendami.

## Warunki przerwania

Test lub biezacy scenariusz nalezy przerwac przy: probie wykonania komendy spoza zakresu, ostrzezeniu serwera, ograniczeniu czestotliwosci, zadaniu dodatkowej weryfikacji, nieoczekiwanej interakcji z inna postacia, niepewnosci co do skrzynki lub listu przeznaczonego do usuniecia, bledzie synchronizacji oraz podejrzeniu skutku poza poczta.

Po przerwaniu nie wolno ponawiac automatycznie ani probowac obejsc ograniczenia. Najpierw nalezy ustalic stan kanalu i zakres wykonanego dzialania.

## Zapis wynikow

1. Po kazdym etapie zapisac wylacznie liczbe sprawdzen, wynik, kategorie bledow i zanonimizowana kolejnosc zdarzen.
2. Nowe, potwierdzone reguly serwera dodac do `docs/PROTOCOL.md` z wyraznym oznaczeniem zakresu dowodu. Nie przenosic obserwacji pojedynczego przypadku do ogolnych gwarancji.
3. Wynik testu i ograniczenia dowodow zapisac w osobnym dokumencie bez danych wrazliwych. Ten plan usunac po wykonaniu lub zaktualizowac tak, aby zawieral tylko niewykonane czesci.
4. Nie zmieniac kodu produktu podczas testu. Kazda pozniejsza poprawka wymaga osobnego lokalnego testu, ktory pada na starym kodzie, a nastepnie testu i poprawki w jednym commicie.
5. Nie uruchamiac pelnej macierzy scenariuszowej dla samego testu na grze. Nie publikowac niczego poza zapisem zanonimizowanej dokumentacji w repozytorium GitHub.
