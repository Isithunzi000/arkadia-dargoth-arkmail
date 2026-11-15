# Plan naprawy pobierania poczty 1.30.9

## Cel

Przywrocic odswiezanie skrzynek, indeksacje i odswiezanie po usuwaniu bez cofania pozniejszych poprawek. Podstawa jest dokladnie commit wydania 1.30.8: `c9d4906c55be72f9509f061eed83cc71e61b2dc5`.

## Zakres

Dozwolona jest wylacznie wspolna sciezka: zadanie odswiezenia, `MailboxSession.fetch()`, transport, zakonczenie listingu, zwolnienie operacji i zastosowanie wyniku. W `index.ts` wolno zmieniac tylko funkcje pobierania i odswiezania, jesli bedzie to konieczne.

Nie wolno zmieniac UI, motywow, responsywnosci, funkcji „Odpowiedz wszystkim”, `replyRecipients.ts`, compose, edytora, eksportu, kontaktow, aliasow, grup, dat, formatu IndexedDB ani zrodel klienta Dargoth. Pozostaja zachowane: brak automatycznego `q` dla nieznanego pagera, ochrona przed niejednoznacznymi odpowiedziami, brak rownoleglych odczytow i lokalny cleanup po reconnect.

## Dowod regresji

1. Porownac zachowanie 1.30.5, 1.30.6 i 1.30.8 na identycznych odpowiedziach.
2. Dodac test kompletnego listingu bez docierajacego promptu, po ktorym mozna wykonac kolejna operacje.
3. Objac testem zwykle odswiezenie, kolejna skrzynke indeksacji, odswiezenie po usuwaniu i ponowna probe po bledzie.
4. Uruchomic test lokalnie na niezmienionym 1.30.8 i zachowac wynik RED. Implementacja przed tym wynikiem jest zabroniona.
5. Dodac ukierunkowany scenariusz w prawdziwym kliencie Dargoth; pelna macierz pozostaje na GitHub Actions.

## Zasada poprawki

Prompt pozostaje podstawowym potwierdzeniem konca odpowiedzi. Brak promptu nie moze powodowac bezterminowej blokady kolejnych operacji. Wynik bez promptu musi miec odrebny status potwierdzenia; odpowiedz czesciowa albo niejednoznaczna nie moze kasowac archiwum ani oznaczac indeksacji jako kompletnej. Nie wolno przywracac bezwarunkowej reguly, w ktorej krotka cisza dowodzi kompletnosci i pozwala usuwac rekordy.

Opozniony prompt przed limitem ciszy pozostaje akceptowany. Po zwroceniu niepotwierdzonego wyniku pozny prompt nie zmienia go wstecznie. Odpowiedz innej skrzynki nie zmienia danych zadanej skrzynki. Reconnect i `dispose()` nie wysylaja `q` ani `~q`.

## Kontrole

- Lokalne RED przed implementacja, nastepnie GREEN na tym samym tescie.
- Macierz: prompt natychmiastowy, opozniony i nieobecny; listing urwany; pusta skrzynka i filtr; inna skrzynka; nieznany pager; reconnect; blad IndexedDB; powtarzalne odswiezanie; indeksacja; usuwanie.
- Pelny lokalny zestaw z `COMMIT_MSG`, rzeczywisty `tsc --noEmit`, build i bundle na Node 26.
- Kontrola zasobow po `destroy()`, higieny repo, danych wrazliwych i zakresu diffu.
- Test i implementacja trafia do jednego commita. Dokumentacja protokolu jest aktualizowana razem z poprawka.
- Po commicie sprawdzony jest SHA, komunikat, drzewo, sciezki i zawartosc; CI musi byc zielone.
- Pelne `ArkMail E2E` na poprawce, z wynikami Playwright, artefaktami i `ALL-GATES-OK`.

## Wydanie

Dopiero po zielonych kontrolach nastepuje wersja 1.30.9 z osobnym lokalnym dowodem RED do GREEN dla numeru wersji. ZIP ma byc deterministyczny i zbudowany dwukrotnie. Release zawiera dokladnie jeden asset. Koncowa macierz ma pobrac oficjalny opublikowany ZIP i zapisac jego SHA-256 w artefaktach, zamiast ograniczac sie do paczki roboczej z tagu.
