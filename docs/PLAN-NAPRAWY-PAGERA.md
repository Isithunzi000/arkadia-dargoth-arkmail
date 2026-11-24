# Plan naprawy stronicowanego odczytu ArkMail

## Punkt wyjscia

- Podstawa: commit `848a99175b49361779b9ab0620d07b785cceb93b`.
- Dowod z gry: `docs/WYNIK-TESTU-GRY-1.30.17.md`.
- Zakres zatwierdzony przez wlasciciela: diagnoza i naprawa wylacznie lokalna, bez logowania do gry, bez polaczenia z realnym serwerem i bez uruchamiania przegladarki.
- Srodowisko: Node 26 zgodny z `package.json`, `MockTransport`, syntetyczny harness interfejsu oraz wylacznie zanonimizowane metadane zaobserwowanej sekwencji.

## Granice bezpieczenstwa

1. Nie wolno laczyc sie z Arkadia, klientem Dargoth ani zadnym realnym kontem. Dozwolone sa tylko lokalne procesy kompilacji i testow.
2. Nie wolno dodawac do repo tresci listow, nazw postaci, adresatow, tematow, surowych logow, danych logowania ani stanu sesji.
3. Nie wolno zlagodzic zasady bezpieczenstwa: prompt o niezgodnym numerze bez wczesniejszego wlasnego pustego przejscia pozostaje niejednoznaczny i nie moze powodowac automatycznego `q`.
4. Pustego przejscia nie wolno traktowac jako zgody na pobranie kolejnego listu. Wynik ma zawierac wylacznie list zazadany przez uzytkownika.
5. Bez nowego wydania przed zielonymi testami lokalnymi i zielonym CI. Bez publikacji do katalogu lub innych uslug zewnetrznych.

## Etap 1: regresja stronicowanego odczytu

1. Dodac test `PagerSession` dla syntetycznego listu podzielonego na strony.
2. Odtworzyc zaleznosc: wlasne puste przejscie na koncu listu moze zmienic numer w kolejnym promptcie pagera. Nie zakladac, ze to juz potwierdzona przyczyna zdarzenia z gry.
3. Oczekiwany kontrakt: sesja zamyka wlasny pager jednym `q`, zwraca kompletna tresc zadanego listu, nie dopisuje tresci kolejnego listu i konczy bez recovery.
4. Dodac kontrolny przypadek niezgodnego numeru bez wlasnego przejscia: brak automatycznego `q`, zachowana dotychczasowa ochrona cudzego pagera.
5. Uruchomic nowy test na niezmienionym kodzie i zapisac lokalny wynik RED. Implementacji wolno rozpoczac dopiero po takim dowodzie.
6. Poprawka ma byc minimalna: rozroznic zmiane numeru wywolana wlasnym pustym przejsciem od nieznanego pagera. Bez nowych timerow, ponawiania odczytu i rozbudowy recovery.
7. Dodac kontrole wielu stron, jednego zamkniecia i braku dopisania kolejnego listu. Test oraz implementacja trafia do jednego commita.

## Etap 2: kontrolka starszych stron

1. Osobno sprawdzic `Wczytaj starsze` w stanie po poprawnie zamknietym odczycie oraz po chronionej niejednoznacznosci.
2. Pierwszy test ma rozstrzygnac, czy brak reakcji jest skutkiem bledu pagera, czy niezaleznym defektem blokady albo kontrolki.
3. Nie laczyc drugiej poprawki z pierwsza bez dowodu wspolnej przyczyny. Kazda zmiana zachowania wymaga wlasnego lokalnego RED.
4. Nie ponawiac testu na grze i nie symulowac zadnych operacji wysylki lub usuwania.

## Etap 3: kontrola i zapis

1. Uruchomic pelny lokalny zestaw testow, `typecheck` i budowanie.
2. Sprawdzic higiene repo, opisy commitow i brak danych wrazliwych.
3. Zaktualizowac `docs/PROTOCOL.md` tylko o wnioski potwierdzone testem. Raport z gry zachowuje rozroznienie miedzy obserwacja a hipoteza.
4. Wynik RED i GREEN zapisac w raporcie naprawy. Wykonane czesci usunac z tego planu; pozostawic wylacznie prace niewykonane.
5. Commit kodu zawiera test i implementacje razem. Po commicie zweryfikowac HEAD, opis, rodzica, sciezki i bloby przez GitHub REST API, nastepnie zielone CI.
6. Test na realnej grze wymaga osobnej zgody i nie nalezy do tego planu.
