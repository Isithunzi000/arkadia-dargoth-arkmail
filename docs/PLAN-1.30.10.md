# Plan naprawy ArkMail 1.30.10

## Stan wyjściowy i przyczyna

- Baza produktu: `main` = `d36c85a14eb6a02fb14a503e4d17eba93f1f6ef4`, drzewo `bad1777fd49efcb4ba9fe72704a97e950e422b77`, wersja 1.30.9. Lokalna kopia 329 plików jest zgodna 1:1 z tym drzewem.
- Baza testów: `main` = `ed5b0b31e33a42fd8d4ad4ad34df8b65939f61f1`, drzewo `4f6175df247771cdd442491f726c392b46a63662`.
- Zgłoszenie z gry: „Wczytaj wszystkie” pokazuje `W widoku: 190 (dodano: 49). nie potwierdzono pelnej odpowiedzi - sprobuj ponownie.` i nie pobiera dalszych stron. „Wczytaj starsze” działa u użytkownika.
- Bezpośrednia przyczyna znajduje się w `src/arkmail/core/pagination.ts`: po scaleniu strony warunek `result.confirmed === false` zwraca `incomplete` przed obsługą `header.truncated`, `singlePage`, `visit.stop` i kolejnej kotwicy. Dlatego wpisy są już w widoku, ale pętla nie wysyła następnej komendy.
- Testy 1.30.9 obejmowały pojedyncze listingi bez promptu oraz wiele stron z promptem. Nie było scenariusza wielu kolejnych stron bez promptu; ta luka przepuściła regresję mimo zielonych wyników.

## Decyzje projektowe

1. `PageScanResult` otrzyma pole `unconfirmedPages: number`. Licznik obejmie każdą stronę `kind: "lista"` zwróconą po ciszy z `confirmed: false`, także listing bazowy pobrany podczas ponawiania kotwicy.
2. `end` nadal opisuje wyłącznie strukturalny wynik: `complete`, `partial`, `clamped`, `incomplete` albo `cancelled`. `skipWhy` nadal opisuje strukturalną przeszkodę. Brak promptu nie zmienia sam w sobie strukturalnego `complete` w `incomplete`.
3. Jednoznaczna odpowiedź `kind: "pusta"` nie zwiększa licznika. Nie jest wynikiem po ciszy; parser przyjmuje ją na podstawie pełnej, jednoznacznej odpowiedzi serwera.
4. Każda poprawna strona, potwierdzona lub niepotwierdzona, jest scalana z widokiem i archiwum oraz zapisywana. Skan zachowuje istniejące kotwice, pauzy, ponawianie powtórzonych stron, sondę ściany dnia, wykrywanie luk i anulowanie.
5. Operacje pełnej prawdy są dozwolone tylko przy `unconfirmedPages === 0`:
   - `replaceBoxLetters(...)` jako zastąpienie zawartości skrzynki;
   - `pruneGoneFromView(...)`;
   - `markGoneFromServerNewerThan(...)`;
   - `clearArchiveGaps(...)` jako potwierdzenie pełności;
   - ustawienie `indexMeta[box]` jako kompletnego indeksu.
6. `loadAll()` po strukturalnym końcu z niepotwierdzonymi stronami zamyka paginację widoku, ale pozostawia archiwum jako sumę wpisów, zachowuje luki i poprzedni stan indeksu. Komunikat ma tytuł `Wczytano wszystkie strony`, poziom `warning` i treść z liczbą widocznych oraz dodanych wpisów: `Nie potwierdzono zamkniecia odpowiedzi: N. Archiwum zachowano bez usuwania wpisow.` Nie może zawierać starego błędu `nie potwierdzono pelnej odpowiedzi - sprobuj ponownie`.
7. `loadOlder()` również korzysta z dalszego działania skanera. Pojedyncza strona bez promptu jest pokazywana i zapisywana; podsumowanie informuje o braku potwierdzenia ostrzeżeniem zamiast dawnego błędu. Stempel przy pustej odpowiedzi końcowej pozostaje dodatkowo chroniony warunkiem `unconfirmedPages === 0`.
8. `indexAllBoxes()` traktuje strukturalnie zakończoną skrzynkę z dowolną niepotwierdzoną stroną jako pominiętą, przechodzi do kolejnej skrzynki i nie wykonuje żadnej operacji pełnej prawdy. Dotyczy to zarówno `complete`, jak i `clamped`. W raporcie powodem jest `nie potwierdzono zamkniecia odpowiedzi: N`.
9. `resolveEntry()` zachowuje obecne działanie: znaleziony wpis może zostać zwrócony także ze strony bez promptu; nie znaleziono go = zwykłe ostrzeżenie. Ta ścieżka nie wykonuje operacji pełnej prawdy.
10. Potwierdzone odpowiedzi zachowują dotychczasowe komunikaty, kasowanie, zastępowanie i stemplowanie. Nie zmieniamy UI, „Odpowiedz wszystkim”, compose, edytora, eksportu, kontaktów, aliasów, grup, dat, IndexedDB ani źródeł Dargotha.

## Dowody lokalne przed implementacją

1. Dodać test integracyjny „Wczytaj wszystkie”: co najmniej dwie kolejne strony bez promptu, pierwsza ucięta i druga kończąca listing.
2. Na niezmienionym kodzie 1.30.9 test musi zakończyć się błędem po pierwszej stronie albo wykazać stary komunikat. Wynik zapisać trwale przed zmianą produktu.
3. Test docelowy sprawdzi dokładne kolejne komendy, wszystkie wpisy w widoku i trwałym archiwum, brak duplikatów, brak starego komunikatu, zachowanie wcześniejszego rekordu, zachowanie zapisanej luki i brak nowego stempla indeksu.
4. Dodać kontrolę wielostronicowej indeksacji bez promptu: pobranie kolejnej strony, przejście do następnej skrzynki, raport niekompletny, zachowanie starego rekordu i brak stempla dla skrzynki z niepotwierdzonymi stronami.
5. Dodać kontrolę pojedynczego „Wczytaj starsze” bez promptu oraz jednostkową kontrolę licznika `unconfirmedPages`, w tym wyniku strukturalnie kompletnego.
6. Testy i implementacja trafią w jednym commicie. Dowód niepowodzenia pozostaje wyłącznie lokalny; CI zobaczy dopiero zielony zestaw.

## Uzyskane dowody przed pełnym zestawem

- Finalny zestaw `mailboxNoPrompt` uruchomiony na osobnej kopii z oryginalnymi `pagination.ts` i `index.ts` z 1.30.9: 8 testów, 3 zaliczone, 5 błędów, kod 1. „Wczytaj wszystkie” zatrzymało się na jednej komendzie zamiast dwóch, indeksacja nie wysłała drugiej kotwicy, a skan zwrócił `incomplete` zamiast strukturalnego `complete`.
- Te same 8 testów po poprawce: 8 zaliczonych, 0 błędów, 0 pominiętych, kod 0. Obejmują także zachowanie rekordu i luki, brak stempla oraz niebezpieczną ścieżkę `clamped` w indeksacji przyrostowej.
- Dwie pośrednie kontrole testu „Wczytaj wszystkie” odrzucono jako błędy samego testu: najpierw bezpośrednie wywołanie `.map()` na `NodeList`, potem rekord kontrolny nowszy niż granica wcześniejszego, potwierdzonego listingu. Ostateczny test używa `Array.from` i rekordu starszego niż granica; dopiero ten wynik jest dowodem zachowania produktu.

## Implementacja i kontrole

1. Zmienić `src/arkmail/core/pagination.ts`, `src/arkmail/index.ts`, właściwe testy oraz `docs/PROTOCOL.md` w jednym commicie naprawczym.
2. Nie zmieniać `MailboxSession.fetch()` ani limitu ciszy. Poprawka dotyczy wspólnego skanera i decyzji po jego wyniku.
3. Uruchomić najpierw ukierunkowane testy, potem pełny zestaw na Node 26, prawdziwe `tsc --noEmit`, bundle, build, kontrolę deterministyczności paczki, strażniki tekstów i higieny.
4. Po commicie sprawdzić przez REST SHA, komunikat, drzewo, dokładne ścieżki i zawartość. Bez wymuszonych pushy. Poczekać na zielony build produktu przed pracą zależną.
5. W repo testów na świeżym `main` dodać syntetyczny scenariusz E2E wielu stron bez promptu. Test ma obejmować prawdziwy build Dargotha, kolejne komendy, pełny widok i zachowanie archiwum bez fałszywego kompletu.
6. Pełną macierz `ArkMail E2E` uruchomić raz po ostatnim etapie kodu i przed podbiciem wersji. Nie uruchamiać równolegle dużych zestawów.

## Wydanie i końcowa kontrola

1. Dopiero po zielonych testach produktu i E2E wykonać osobny lokalny RED→GREEN wersji 1.30.10.
2. Zaktualizować `src/arkmail/meta.ts`, `tests/version.test.mjs`, wygenerować `plugin.json`, datę buildu i deterministyczny `releases/arkmail_1_30_10.zip` istniejącym skryptem wydania.
3. Usunąć wykonany plan; właściwy dokument naprawy zachowa przyczynę, zakres i rzeczywiste wyniki kontroli.
4. Commit wydania, annotated tag `v1.30.10`, GitHub Release `ArkMail v1.30.10`, dokładnie jeden asset `arkmail_1_30_10.zip`. Opis krótki, polski, ASCII, zgodny z `docs/ZASADY.md` i zasadą nazewnictwa.
5. Pobrać opublikowany asset, porównać bajtowo z lokalną paczką i zweryfikować SHA-256 z API. Nie kasować ani nie wysyłać assetu ponownie po błędzie odczytu.
6. Uruchomić końcowe E2E na oficjalnym ZIP, sprawdzić raport, brak pominiętych i nieoczekiwanych testów oraz zgodność SHA-256. Potwierdzić końcowe HEAD-y, tag, release, asset i zielone kontrole.
7. Koniec pracy to GitHub Release. Bez marketplace, katalogu, Vercela i innych publikacji zewnętrznych.

## Idempotencja i bezpieczeństwo

- Każdy etap zaczyna od odczytu aktualnego HEAD i stanu artefaktu; istniejący wynik nie jest powielany.
- Po timeoutcie lub HTTP 504 najpierw następuje odczyt stanu; żadna operacja zapisu nie jest ponawiana w ciemno.
- Dane testowe są syntetyczne. Do repo nie trafiają tokeny, dane wrażliwe, prywatne korespondencje, prywatne zrzuty, nicki ani wulgaryzmy.
- Nie modyfikujemy źródeł ani repozytorium klienta Dargoth. Nie wykonujemy force-push.
- Nie uznajemy przerwanego lub niepełnego przebiegu za zielony. Test w realnej grze pozostaje osobnym sprawdzeniem użytkownika po instalacji oficjalnego wydania.
