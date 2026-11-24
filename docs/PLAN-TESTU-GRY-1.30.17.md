# Plan kontrolowanego testu ArkMail 1.30.17 na grze

## Cel i podstawa

Test ma sprawdzic zachowanie oficjalnego wydania 1.30.17 w prawdziwym kliencie Dargoth i na realnym serwerze. Punktem wyjscia jest commit `065fc9b9181c103cc325bfa956ac19a0dd129a86`. Test nie jest zmiana produktu, nie zastepuje lokalnych testow regresji i nie jest podstawa do deklarowania naprawy bez osobnej poprawki.

Srodowisko i etap odczytow zostaly wykonane, a ich zanonimizowany wynik zapisano w `docs/WYNIK-TESTU-GRY-1.30.17.md`. Ponizej pozostaja wylacznie niewykonane etapy. Kazdy etap ma osobny wynik i moze zostac przerwany bez kontynuowania kolejnych dzialan.

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

## Etap 3: pozostala indeksacja i archiwum

Wczytanie czterech skrzynek, probe jednej starszej strony, wyswietlenie archiwum i lokalny filtr zapisano w `docs/WYNIK-TESTU-GRY-1.30.17.md`. Proba paginacji nie wyslala komendy i nie byla ponawiana.

1. Sprawdzic filtrowanie po stronie serwera oraz pobranie kilku lub kilkunastu wybranych listow dopiero po ustaleniu stanu polaczenia.
2. Sprawdzic zgodnosc wynikow, zachowanie nieprzeczytanych, paginacje, zapis lokalny i zachowanie po odswiezeniu.
3. Nie usuwac zadnych wpisow serwerowych w tym etapie.

## Etap 4: niewyslane, odpowiedzi i przekazywanie bez wysylki

Etap pozostaje niewykonany. Warunkiem wstepnym jest jednoznaczne potwierdzenie, ze zakonczenie edytora w biezacym kontekscie pocztowym zapisze list w niewyslanych. Bez takiego potwierdzenia nie wolno rozpoczynac edycji ani wysylac jej zakonczenia, ponieważ kontekst urzedu pocztowego moze spowodowac fizyczna wysylke.

1. Utworzyc kilka listow testowych wylacznie z syntetyczna trescia i pozostawic je w niewyslanych.
2. Sprawdzic odpowiedz, odpowiedz z cytowaniem i odpowiedz wszystkim dla dostepnych wariantow naglowkow, adresatow i DW.
3. Sprawdzic przygotowanie odbiorcow, tematu, cytatu i tresci bez zatwierdzania wysylki.
4. Sprawdzic przekazanie tylko do punktu utworzenia niewyslanego listu testowego.
5. Sprawdzic zaznaczanie, odznaczanie i rozne dostepne sposoby usuwania wylacznie na utworzonych listach testowych.
6. Usunac wszystkie utworzone listy testowe i potwierdzic ich brak. Nie zmieniac wczesniej istniejacych niewyslanych.

Eksporty, syntetyczna ksiazka adresowa i lokalne czyszczenie zostaly wykonane oraz zapisane w `docs/WYNIK-TESTU-GRY-1.30.17.md`.

## Warunki przerwania

Test lub biezacy scenariusz nalezy przerwac przy: probie wykonania komendy spoza zakresu, ostrzezeniu serwera, ograniczeniu czestotliwosci, zadaniu dodatkowej weryfikacji, nieoczekiwanej interakcji z inna postacia, niepewnosci co do skrzynki lub listu przeznaczonego do usuniecia, bledzie synchronizacji oraz podejrzeniu skutku poza poczta.

Po przerwaniu nie wolno ponawiac automatycznie ani probowac obejsc ograniczenia. Najpierw nalezy ustalic stan kanalu i zakres wykonanego dzialania.

## Zapis wynikow

1. Po kazdym etapie zapisac wylacznie liczbe sprawdzen, wynik, kategorie bledow i zanonimizowana kolejnosc zdarzen.
2. Nowe, potwierdzone reguly serwera dodac do `docs/PROTOCOL.md` z wyraznym oznaczeniem zakresu dowodu. Nie przenosic obserwacji pojedynczego przypadku do ogolnych gwarancji.
3. Wynik testu i ograniczenia dowodow zapisac w osobnym dokumencie bez danych wrazliwych. Ten plan usunac po wykonaniu lub zaktualizowac tak, aby zawieral tylko niewykonane czesci.
4. Nie zmieniac kodu produktu podczas testu. Kazda pozniejsza poprawka wymaga osobnego lokalnego testu, ktory pada na starym kodzie, a nastepnie testu i poprawki w jednym commicie.
5. Nie uruchamiac pelnej macierzy scenariuszowej dla samego testu na grze. Nie publikowac niczego poza zapisem zanonimizowanej dokumentacji w repozytorium GitHub.
