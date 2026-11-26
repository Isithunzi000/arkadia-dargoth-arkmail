# Naprawa ArkMail 1.30.22

## Zakres poprawki

1. Aktualny wynik wyszukiwania otwiera się bez drugiego listingu i bez ponownego scalania archiwum. Ponowna kotwica dotyczy wyłącznie starego kontekstu.
2. Jednoznaczny stary wpis jest odnajdywany po aktualnej tożsamości. Identyczne wpisy na nowej kotwicy przerywają operację przed odczytem; numer nie jest zgadywany.
3. Ręczne `q` i `x` wracają natychmiast do klienta jako oryginalne polecenie, bez kolejki, kopii i koalescencji. Przejęcie przez gracza anuluje automatyzację i czyści stare podejrzenie własnej sieroty.
4. Podejrzenie własnej sieroty pagera jest powiązane z generacją połączenia. Automatyczne `q` przysługuje tylko tej potwierdzonej sierocie; następuje po nim oczekiwanie na zwykły prompt i najwyżej jedno ponowienie. Nieznany pager gracza pozostaje nietknięty.
5. Sama cisza nie potwierdza zamknięcia w ścieżce odzyskiwania. Zwykły prompt zamyka poprzednią operację i zezwala nowemu pagerowi na niezależne zamknięcie. Nie przywrócono globalnego odzyskiwania ani globalnego `q`.
6. Gagowanie pozostaje ograniczone do własnej blokady poczty. Walidacja numerów, paginacja, edytor i globalne `mergeListingPage()` pozostają bez zmian.
7. Testowy `MockTransport` przekazuje zdarzenia najpierw do sesji, a potem do globalnych subskrybentów, zgodnie z kolejnością produkcyjną.
8. Nie zmieniono UI, stylów, motywów ani kosmetyki dodanych po wersji 1.30.5.

Dawne scenariusze zakładające odczyt jednego z bliźniaków po nowej kotwicy zostały dostosowane do zatwierdzonej zasady bezpieczeństwa: taki odczyt ma zostać przerwany. Osobny jednoznaczny listing nadal sprawdza usuwanie wyłącznie brakującego rekordu.

## Dowody lokalne

- Zgodność kolejności dystrybucji: przed poprawką 10/11, po poprawce 11/11.
- Aktualne wyniki wyszukiwania: przed poprawką 0/4, po poprawce 4/4. Rozszerzony zestaw niejednoznaczności: 11/11.
- Ręczne `q`/`x`: przed poprawką 20/24, po poprawce 24/24.
- Generacje sieroty: 1/2 przed poprawką i 2/2 po niej; bezczynność: 0/1 → 1/1; listing: 0/2 → 4/4; pager: 1/4 → 4/4.
- Usunięcie globalnego odzyskiwania: oba nowe scenariusze padały na starym kodzie. Powiązany zestaw po zmianach: 62/62.
- Przejęcie przez gracza: 0/2 przed poprawką, 2/2 po poprawce; powiązany zestaw 129/129.
- Całościowy scenariusz publicznych ścieżek UI: 0/2 na kodzie 1.30.21. Przed ostatnią poprawką transportu również 0/2; po poprawce 2/2, a powiązany zestaw 155/155.
- Archiwum i odpowiedź wszystkim: 13/13. Poprawione scenariusze bliźniaków, odtwarzania widoku i higieny repozytorium: 10/10.
- Pełny zestaw przed commitem naprawy: **1390 kontrolek, 1389 zaliczone, 0 błędów, 0 anulowanych i 1 pominięta**. Pominięcie dotyczyło kontroli opisu commita bez `COMMIT_MSG`.
- Osobne typowanie i budowanie zakończyły się sukcesem. Nie uruchamiano lokalnej pełnej macierzy przeglądarkowej.
- Strażnik wydania przed podbiciem numeru i zapisem tej dokumentacji zgłosił oczekiwane dwa błędy: 11/13 zaliczonych kontrolek. Po wykonaniu wydania zestaw przeszedł 13/13.
- Dwa kolejne zbudowania dały bajtowo identyczny `arkmail_1_30_22.zip` o SHA-256 `c006ca2e78f04e6c884cb70c68dbad692733a20dc3175aefcfbb4ef62364cedb`. Paczka zawiera dokładnie `index.ts` i `plugin.json`, zgodne z katalogiem `build/arkmail`.

## Weryfikacja zdalna

- Commit naprawy `c87fa9cfdf66d132a82ea24d6e250d6c13f5e955` przeszedł `Build plugins` w przebiegu `45831918888`; zadania `build` i `deploy` zakończyły się sukcesem.
- Drzewo tego commita porównano z lokalnym drzewem 1:1: 370 plików, bez braków, dodatków i różnic.
- Przed utworzeniem tagu wymagany jest osobny, zielony przebieg `Build plugins` dokładnie dla commita wydania 1.30.22.

## Wydanie 1.30.22

- GitHub Release: `ArkMail v1.30.22`, tag `v1.30.22`, dokładnie jeden asset `arkmail_1_30_22.zip`.
- Publikacja ogranicza się do GitHuba. Bez katalogu, marketplace i innych usług zewnętrznych.
- Tag i wydanie mają wskazywać najnowszy commit `main` zawierający tę dokumentację i pakiet. Po publikacji asset ma być pobrany i porównany bajtowo z paczką z drzewa tagu.

## Ograniczenie wyniku

Nie wykonano testów na realnej grze. Nie logowano do gry, nie łączono z realnym serwerem i nie wchodzono w interakcje z graczami. Dowód obejmuje lokalne dane syntetyczne oraz zwykły zdalny build.
