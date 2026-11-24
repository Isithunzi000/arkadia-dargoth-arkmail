# Naprawa ArkMail 1.30.19

## Zakres uproszczenia

Usunięto globalny mechanizm odzyskiwania, który po błędzie lub niejednoznacznej odpowiedzi mógł blokować także kolejne, niezależne operacje. Nie dodano zastępczego globalnego stanu ani kolejnych timerów.

1. Timeout, błąd wysyłki i niejednoznaczna odpowiedź kończą wyłącznie bieżącą operację. Jej zakończenie zwalnia sesję przez istniejące sprzątanie, a blokadę interfejsu przez istniejące `finally`.
2. Usunięto globalne `recovering`, `beginRecovery`, `finishRecovery`, `isRecovering`, limit czasu odzyskiwania, timer i komunikat blokady.
3. Późne linie nie są tłumione po zakończeniu operacji na podstawie dawnego stanu odzyskiwania. Aktywna operacja zachowuje dotychczasowe tłumienie własnych linii.
4. Po reconnect nowa operacja nie czeka na stary ani nowy prompt. Stara sesja jest zamykana, a jej odpowiedzi nie trafiają do nowej.
5. Nieudane automatyczne `q` porzuca starą kolejkę komend modalnych. Nie blokuje jednak nowych komend ani nowej sesji; do tego służy wyłącznie lokalny stan zamknięcia pagera.
6. Zachowano jedną aktywną operację, `SessionLock`, `SessionScopeRegistry` oraz blokadę komend pluginu podczas ręcznej poczty gracza.
7. Zachowano kontrolowane `q` i `~q` wyłącznie dla potwierdzonej własnej sesji. Nieznany pager nie dostaje automatycznego `q`.
8. Usuwanie i wysyłka nadal oceniają rzeczywiste odpowiedzi serwera. Nie dodano automatycznych ponowień operacji zmieniających stan ani dodatkowych pytań interfejsu.
9. Lokalny stan `recovering` wewnątrz `PagerSession` pozostaje bez zmian. Obsługuje on ponowienie po jednoznacznym odrzuceniu przez własną sierotę pagera i nie jest globalną blokadą.

## Dowody lokalne

- Przed implementacją nowe kontrole uruchomiono na starym kodzie: 7 kontrolek, 0 zaliczonych i 7 oczekiwanych błędów. Obejmowały listing, odczyt, edytor, import, adapter oraz statyczny brak globalnego mechanizmu.
- Po implementacji wszystkie 7 nowych kontrolek przechodzi.
- Powiązane testy sesji, transportu, pagera, edytora i interfejsu: 90/90.
- Dodatkowy przebieg czterech dostosowanych plików: 53/53.
- Osobne powtórzenie czterech plików, których wcześniejszy przebieg przerwały błędy odczytu systemu plików: 20/20.
- Końcowy pełny zestaw z Node 26 również dla procesów potomnych: **1358 kontrolek, 1357 zaliczonych, 0 błędów, 0 anulowanych i 1 pominięta**. Pominięcie dotyczy wyłącznie kontroli opisu commita poza CI.
- Osobne typowanie, bundle i build zakończyły się kodem 0.
- Kontrola higieny, danych wrażliwych, wulgaryzmów, ASCII, wersji i docelowego opisu commita: 24/24.
- Statyczna kontrola potwierdziła brak globalnych symboli odzyskiwania w produkcie. W testach występują one wyłącznie jako zakazane wzorce kontrolki.

Wcześniejsze błędy `EAGAIN`, komunikaty o braku istniejących modułów i przerwane przebiegi nie zostały uznane za wynik produktu. Dowodem końcowym jest dopiero kompletny, nieprzerwany zielony zestaw.

## Wydanie 1.30.19

- Przed zmianą numeru zaktualizowana kontrola wersji zakończyła się wynikiem 11 kontrolek, 10 zaliczonych i 1 oczekiwany błąd: źródło nadal wskazywało 1.30.18 zamiast 1.30.19.
- Po zmianie numeru skrypt wydania zsynchronizował `meta.ts`, oba pola wersji w `plugin.json`, datę builda, bundle i paczkę. Kontrola wersji przeszła 11/11.
- Paczka `arkmail_1_30_19.zip` zawiera dokładnie `index.ts` i `plugin.json`. Dwa kolejne zbudowania dały identyczny SHA-256: `ec743bcfb42e708ea1517678ace231c51af4eb79f2147dd7a63a85e9bcfb8d9c`.
- Osobne typowanie oraz build z paczki 1.30.19 zakończyły się kodem 0. Kontrola układu wydania przeszła 1/1.
- Oba pliki ZIP są bajtowo zgodne z katalogiem staging `build/arkmail`. Bundle zawiera lokalną obsługę błędu zamknięcia pagera i nie zawiera globalnych symboli odzyskiwania.

## Ograniczenie wyniku

Dowód obejmuje wyłącznie lokalne testy syntetyczne oraz zdalne workflow. Nie logowano do gry, nie łączono z realnym serwerem, nie uruchamiano klienta Dargoth ani testów online. Test na realnej grze nie należy do tej naprawy.
