# Analiza regresji ArkMail 1.30.5–1.30.21

## Zakres i granice dowodu

Porównano tag `v1.30.5` (`f49a6833020a72258ff5da72b9c1d9dccda5b512`) z tagiem
`v1.30.21` (`e4814e1888c14ff0e0cbeee44dbdbf92536d2708`). Zakres obejmuje 119
commitów i 156 zmienionych plików. Analiza dotyczy listingu, wyszukiwania,
odczytu, pagera, transportu, sesji oraz ręcznych `q`/`x`. UI, styli i motywów
nie zakwalifikowano do cofania.

Poniższe ustalenia rozdzielają zmianę potwierdzoną w kodzie od przyczyny
konkretnego zdarzenia w grze. Bez odpowiedzi serwera nie wolno utożsamiać
mechanizmu możliwego do uruchomienia z udowodnioną przyczyną pojedynczego
zgłoszenia.

## Potwierdzone mechanizmy regresji

### Usunięcie odzyskiwania sierocy pagera

Commit `7cef62d7d9b9`, przed 1.30.6, usunął z listingu automatyczne `q`,
oczekiwanie na zwykły prompt i jednokrotne ponowienie po napotkaniu promptu
pagera. Obecna ścieżka kończy operację błędem `UnknownPagerError` bez zamykania
pagera. Ochrona nieznanego pagera gracza jest zasadna, ale usunięto również
odzyskiwanie pagera pozostawionego przez własną operację.

### Odrzucanie odpowiedzi bez zamknięcia własnej sieroty

Commit `bbf87118c569`, przed 1.30.16, zmienił obsługę niezgodnego promptu na
odrzucenie bez `q`. Commit `b2e3e341a9`, przed 1.30.21, dodał odrzucenie
zgodnego promptu przed nagłówkami. Jeżeli serwer pozostawił pager otwarty,
kolejny odczyt i listing mogą powtarzać błąd bez automatycznego wyjścia.
Walidacja numerów nagłówka i promptu pozostaje potrzebna.

### Ręczne q/x nie odblokowuje użytkownika

Commit `54b4757a21`, przed 1.30.6, zastąpił natychmiastowe `exitPlayerMailMode()`
oczekiwaniem na zwykły prompt. Zwykłe ręczne `q`/`x` ma limit awaryjny 180
sekund; limit 500 ms dotyczy tylko zamknięcia zainicjowanego z modalu.

Transport Dargotha dodatkowo kolejkuje `q`/`x` przed rozpoznaniem promptu i
tłumi oryginalną komendę. Jeżeli prompt nie zostanie rozpoznany, polecenie może
nie trafić do gry. Powtórzenie może zostać potraktowane jako koalescencja.
Powstają dwie niezależne warstwy blokady.

### Zwolnienie blokady odsłania późne linie

Commit `0c37b46b0845`, przed 1.30.19, usunął globalne recovery. Gagowanie linii
`type === "mail"` zależy ponownie wyłącznie od lokalnego `lock.locked` i stanu
edytora. Po zakończeniu lokalnej operacji późne linie nie są przechwytywane.
Jeżeli zdalny pager nadal istnieje, treść wraca do konsoli, a kolejna komenda
może trafić do starego pagera. Nie zaleca się przywracania globalnego recovery.

### Kończenie po ciszy nie potwierdza zamknięcia

Commity `858d1c76634c` i `7c5b5ea9dab4` dopuściły zakończenie odczytu po `q`
oraz listingu po ciszy bez pełnego potwierdzenia zakończenia odpowiedzi. Przy
opóźnionej odpowiedzi lokalna blokada może zostać zwolniona przed ostatnimi
liniami. Jest to potwierdzone ryzyko kodu, nie samodzielny dowód przyczyny
konkretnego zdarzenia.

Raport `docs/WYNIK-TESTU-GRY-1.30.17.md` pokazuje, że część problemu występowała
wcześniej: cztery poprawne odczyty, piąty bez listu, pozostawiony pager,
późniejszy listing na prompcie pagera i treść w konsoli. Późniejsze zmiany
ograniczyły możliwość samoczynnego wyjścia z tego stanu.

### Obowiązkowa ponowna kotwica wyników

Commit `38912e995e8e`, przed 1.30.20, wymusił ponowny filtr przy każdym
otwarciu wyniku wyszukiwania. Commit `b2e3e341a9`, przed 1.30.21, dodał kontrolę
numeracji `1..N` i nowe granice odpowiedzi. W 1.30.5 wpis z aktualnym
`listingCtx` był zwracany bezpośrednio. Obecna ścieżka wykonuje ponowne
pobranie, scalenie archiwum, nadanie identyfikatorów i wybór po `archiveId`.

## Warunkowa zamiana numeru dwóch wpisów

Rzeczywisty kod `mergeListingPage()` uruchomiono dla dwóch wpisów o identycznych
metadanych. Wynik:

```json
[
  {"order":[1,2],"selected":1,"resolved":2},
  {"order":[2,1],"selected":1,"resolved":1}
]
```

Dla kolejności `[1,2]` ponowna kotwica zmieniła wybrany numer 1 na 2. Dla
kolejności `[2,1]` wynik pozostał poprawny. Mechanizm wymaga wspólnego klucza
metadanych oraz różnej kolejności kandydatów w archiwum i świeżym listingu.

`contentKeyOf()` obejmuje stronę listu, temat, oznaczenie przekazania i surową
datę. Pula kandydatów jest budowana w kolejności archiwum, a świeży rekord
pobiera pierwszego kandydata przez `shift()`. `uniqueEntryByArchiveId()` dostaje
już przypisane identyfikatory i nie jest źródłem zamiany.

**Nie jest to dowód przyczyny konkretnego zdarzenia.** Jest to potwierdzony
warunkowy defekt kodu i kandydat na mechanizm złego numeru. Naprawa aktualnego
wyniku nie może polegać na losowym lub pozycyjnym zgadywaniu tożsamości przy
starym, niejednoznacznym kontekście.

## Dodatkowe ryzyka

Commit `3017a60c14f3`, przed 1.30.15, umożliwia zwrócenie znalezionego wpisu przy
stronie oznaczonej jako `clamped`, mimo braku pełnego potwierdzenia. Nie
powiązano tego mechanizmu dowodowo z bieżącym wyszukiwaniem dwóch wyników.

`SessionScopeRegistry` dopuszcza jedną aktywną sesję. Produkcja najpierw wykonuje
`sessions.dispatch(proto)`, potem powiadamia subskrybentów. `MockTransport`
wykonuje te kroki odwrotnie. Jest to różnica wierności testów, bez dowodu jej
samodzielnego wpływu na zgłoszone objawy.

## Luki testowe

- Brak dwóch identycznych, niezmienionych wyników przy kliknięciu każdego wiersza.
- Brak dowodu idempotencji ponownej kotwicy.
- Testy `playerMailMode.test.ts` utrwalają oczekiwanie na prompt lub 180 sekund.
- Testy modalne dopuszczają zatrzymanie `q` przed rozpoznaniem promptu.
- Testy pagera oczekują braku `q` również tam, gdzie brakuje rozróżnienia własnej
  sieroty od nieznanego pagera gracza.
- Kolejność zdarzeń w `MockTransport` nie odpowiada produkcji.

Zielony zestaw potwierdza zgodność z obecnymi oczekiwaniami testów, nie brak
regresji względem 1.30.5.

## Zmiany poza zakresem cofania

Nie cofać UI, kosmetyki, motywów, prezentacji archiwum, odpowiedzi wszystkim,
eksportów, niezależnych poprawek edytora, walidacji numerów, ochrony pagera
gracza ani całej architektury sesji. Nie przywracać ślepego `q` dla każdego
promptu ani globalnego recovery.

## Łańcuch zgłoszonych objawów

1. Operacja może zakończyć się lokalnie bez zamknięcia zdalnego pagera.
2. Kolejny listing lub odczyt odrzuca prompt bez `q` i ponowienia.
3. Zwolnienie lokalnej blokady odsłania późne linie do konsoli.
4. Ręczne `q` czeka na prompt albo 180 sekund i może zostać zatrzymane w kolejce.
5. Obowiązkowa ponowna kotwica może dodatkowo zmienić identyfikator wyniku.

Ten łańcuch łączy zły numer, brak kolejnych odczytów, treść w konsoli i blokadę
pluginu. Dokładnej kolejności zdarzenia użytkownika nie da się ustalić bez
odpowiednich danych, których klient Dargotha nie rejestruje.
