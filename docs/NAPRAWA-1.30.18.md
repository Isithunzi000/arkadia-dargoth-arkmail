# Naprawa ArkMail 1.30.18

## Lokalnie odtworzony defekt

W syntetycznym stronicowanym odczycie własne puste przejście na końcu żądanego listu może zakończyć się promptem pagera o numerze kolejnego listu. Dotychczasowy kod traktował każdy niezgodny numer jako niejednoznaczność: uruchamiał odzyskiwanie i zamykał sesję bez `q`. W tym przypadku pager należał jednak do własnej operacji, więc mógł pozostać otwarty, a odpowiedź mogła trafić do konsoli zamiast do ArkMaila.

Jest to potwierdzona przyczyna lokalnie odtworzonego defektu zgodnego z objawem. Nie jest to dowód przyczyny zdarzenia opisanego w `docs/WYNIK-TESTU-GRY-1.30.17.md` ani nowa ogólna reguła serwera.

## Zakres poprawki

1. Sesja zapamiętuje własne puste przejście oraz granicę treści żądanego listu sprzed tego przejścia.
2. Prompt o niezgodnym numerze po własnym przejściu jest traktowany jako kontynuacja własnego pagera. ArkMail odcina dopisane nagłówki i treść kolejnego listu, wysyła dokładnie jedno `q` i zwraca wyłącznie żądany list bez odzyskiwania.
3. Niezgodny numer bez własnego przejścia pozostaje niejednoznaczny. Operacja jest odrzucana, automatyczne `q` jest zabronione, a kolejne komendy czekają na zwykły prompt.
4. Nie dodano nowych timerów, ponawiania odczytu ani rozbudowy odzyskiwania. Usuwanie, przekazywanie, pisanie i pozostałe operacje pozostają bez zmian.

## Kontrolka starszych stron

Rozszerzone testy integracyjne przechodzą przez rzeczywistą ścieżkę interfejsu i `loadOlder`. Po poprawnie zamkniętym stronicowanym odczycie `Wczytaj starsze` działa bez odzyskiwania. Po chronionej niejednoznaczności kontrolka jest blokowana tylko do zwykłego promptu, a następnie działa. Nie potwierdzono niezależnego defektu kontrolki, dlatego nie dodano drugiej poprawki.

## Dowody lokalne

- Przed implementacją, na niezmienionym kodzie: 2 kontrole, 1 zaliczona, 1 błąd. Własne przejście do kolejnego listu nie kończyło się `q`; kontrolny przypadek cudzego pagera zachował ochronę.
- Po poprawce skupiona regresja: 2/2.
- Powiązane testy sesji, transportu, pagera, listingu i interfejsu: 106/106.
- Rozszerzony plik regresji z dwoma przypadkami integracyjnymi: 4/4.
- Osobny ponowny audyt po przejściowym błędzie odczytu katalogów: 4/4.
- Końcowy pełny zestaw z Node 26 również dla procesów potomnych oraz z aktywną kontrolą docelowego opisu commita: **1356/1356 zaliczonych, 0 błędów, 0 anulowanych, 0 pominiętych**.
- Osobne typowanie, bundle i build zakończyły się kodem 0. Zgodnie ze skryptem repozytorium build kontrolny używał ostatniej opublikowanej paczki 1.30.17; paczka 1.30.18 jest osobno sprawdzana podczas wydania.

Wcześniejsze przerwania spowodowane limitem wykonania, błędem systemu plików `EAGAIN` oraz utratą lokalnych zależności po awarii środowiska nie zostały uznane za wynik produktu. Po przywróceniu środowiska powtórzono wymagane kontrole i dopiero kompletny, nieprzerwany przebieg uznano za dowód końcowy.

## Ograniczenie wyniku

Dowód obejmuje wyłącznie `MockTransport` i syntetyczny harness `happy-dom`. Nie logowano do gry, nie łączono z realnym serwerem, nie uruchamiano klienta Dargoth ani przeglądarki. Test na realnej grze wymaga osobnej zgody i nie należy do tej naprawy.
