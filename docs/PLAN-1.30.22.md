# Plan naprawy ArkMail 1.30.22

## Zakres i decyzje

Celem jest przywrócenie poprawnego otwierania wyników wyszukiwania, kolejnych
odczytów oraz ręcznych `q`/`x`, bez cofania UI, kosmetyki, motywów i niezależnych
ulepszeń. Decyzje zatwierdzone do wykonania:

1. Aktualny wynik wyszukiwania jest otwierany bez drugiego listingu i ponownego
   scalania archiwum.
2. Ponowna kotwica dotyczy tylko starego kontekstu. Przy nierozstrzygalnej
   niejednoznaczności operacja kończy się przed odczytem, bez zgadywania numeru.
3. Automatyczne `q` jest dozwolone tylko dla potwierdzonej własnej sieroty pagera.
   Nieznany pager gracza pozostaje nietknięty.
4. Odzyskiwanie wykonuje najwyżej jedno zamknięcie i jedno ponowienie. Bez
   globalnego recovery i pętli naprawczych.
5. Zwykły prompt potwierdza zamknięcie przed zwolnieniem kolejnej operacji. Sama
   cisza nie jest takim potwierdzeniem w ścieżce odzyskiwania.
6. Ręczne `q`/`x` nie jest kolejkowane, połykane ani koalescowane przez automatykę.
   Użytkownik odzyskuje kontrolę natychmiast, a automatyzacja czeka na bezpieczny
   stan.
7. Walidacja numerów nagłówka i promptu pozostaje bez zmian.
8. Bez osobnego lokalnego dowodu nie zmieniamy paginacji, kontroli `1..N`, nagłówka
   `Wybrane`, edytora, importera ani globalnego `mergeListingPage()`.
9. Testy wykorzystują wyłącznie dane syntetyczne. Bez testów live, interakcji z
   graczami i publikacji zewnętrznej.

## Sposób dowodzenia

Każda zmiana zachowania ma osobny, pionowy cykl: jeden nowy test pada lokalnie na
starym kodzie, następnie minimalna implementacja przechodzi ten test i cały zestaw.
Test i poprawka trafiają do jednego commita. CI służy tylko do potwierdzenia.
Pełna macierz przeglądarkowa nie jest uruchamiana lokalnie ani po każdym commicie.

Przed każdym commitem wymagane są pełne lokalne testy, rzeczywiste typowanie i
build. Po commicie sprawdzany jest SHA, komunikat, drzewo i zielony wynik zwykłego
workflow. Nie wolno używać force-push.

## Etapy wykonania

### 0. Punkt wyjścia

- Potwierdzić aktualny HEAD, drzewo, zasady i zielony workflow.
- Uruchomić baseline na Node 26.
- Zapisać analizę i ten plan w repozytorium.

### 1. Zgodność transportu testowego

- Test kolejności dystrybucji ma najpierw wykazać różnicę względem produkcji.
- `MockTransport` ma najpierw przekazywać zdarzenie do sesji, potem do subskrybentów.
- Nie zmieniać logiki produktu w tym etapie.

### 2. Aktualne wyniki wyszukiwania

- Test ma wykazać dodatkowy listing przed otwarciem aktualnego wyniku.
- Przywrócić bezpośredni wybór dla zgodnego kontekstu skrzynki, listingu i filtra.
- Sprawdzić dwa identyczne wyniki w kolejności `[1,2]` i `[2,1]`, kliknięcie każdego
  wiersza, powtórzenie filtra i idempotencję wyboru.

### 3. Stary kontekst

- Jednoznaczny wpis ma być odnajdowany po aktualnym numerze.
- Niejednoznaczni bliźniacy mają przerwać operację przed odczytem.
- Nie zmieniać globalnego archiwum ani istniejących oczekiwań testów tylko dla
  uzyskania zielonego wyniku.

### 4. Ręczne q/x

- Sprawdzić polecenie przed i po prompcie, po automatycznym `q`, bez echa i bez
  zwykłego promptu.
- Oryginalne polecenie przechodzi dokładnie raz; nie powstaje druga kopia.
- Anulować oczekujące komendy pluginu, które mogłyby wejść w nieznany pager.
- Oddzielić natychmiastową kontrolę użytkownika od wznowienia automatyzacji.

### 5. Własna sierota pagera

- Zapisać pochodzenie pagera tylko po własnej komendzie i potwierdzonej odpowiedzi.
- Powiązać stan z sesją i generacją połączenia; czyścić po zwykłym prompcie,
  przejęciu przez gracza lub zmianie generacji.
- Przy własnej sierocie wysłać jedno `q`, poczekać na zwykły prompt i ponowić raz.
- Przy nieznanym pagerze nie wysyłać `q` i nie ponawiać.
- W trakcie kontrolowanego zamykania zachować przechwytywanie linii poczty; po
  zakończeniu nie pozostawiać globalnego zatrzasku.

### 6. Pełny scenariusz

Jeden test przez publiczne ścieżki obejmuje: dwa identyczne wyniki, poprawny wybór,
opóźnioną odpowiedź, własną sierotę, kolejny odczyt, jedno zamknięcie, jedno
ponowienie, brak wycieku podczas zamykania i sprawne ręczne odblokowanie w osobnym
wariancie.

### 7. Kontrola końcowa

- Sprawdzić diff pod kątem dozwolonego zakresu i braku zmian UI.
- Wykonać pełne testy, typowanie, build i zdalne kontrole na danych syntetycznych.
- Sprawdzić dodane treści pod kątem wulgaryzmów, danych wrażliwych, nazw postaci,
  adresatów i surowych logów.
- Usunąć wykonany plan; dokumentacja naprawy zachowuje wyniki i ograniczenia.

### 8. Wydanie

Po zielonym workflow dokładnego commita wydania: wersja 1.30.22, tag `v1.30.22`,
GitHub Release `ArkMail v1.30.22` i dokładnie jeden asset `arkmail_1_30_22.zip`.
Asset ma zostać pobrany i porównany bajtowo z paczką z drzewa tagu. Release musi
odpowiadać najnowszemu `main`. Bez katalogu Dargotha i innych usług zewnętrznych.

## Warunek ukończenia

- Każdy z dwóch identycznych wyników otwiera właściwy numer bez drugiego listingu.
- Własna sierota jest zamykana, a operacja ponawiana najwyżej raz.
- Nieznany pager gracza nie jest ruszany.
- Podczas kontrolowanego zamykania treść nie trafia do konsoli.
- Ręczne `q`/`x` przywraca kontrolę bez czekania 180 sekund.
- Pełny zestaw, typowanie, build i zwykły workflow są zielone.
- Release i asset są opublikowane oraz zweryfikowane.

Bez testów live nie wolno deklarować sprawdzenia na realnej grze.
