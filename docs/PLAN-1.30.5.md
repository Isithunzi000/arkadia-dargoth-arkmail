# Plan poprawki widoku list i wydania 1.30.5

Dokument tymczasowy. Po zakonczeniu calego zakresu i zweryfikowaniu wydania nalezy usunac ten plik.

## Problem

Po ponownym uruchomieniu widoki skrzynek sa puste, natomiast archiwum i znaczniki indeksacji pozostaja zapisane. Poprawny przeczes inkrementalny bez zmian na serwerze zatrzymuje sie na znanej pierwszej stronie. Widok otrzymuje swieza pierwsza strone, ale nie odzyskuje starszych wpisow, ktore nadal znajduja sie w lokalnym archiwum.

Skrzynka z dziennym limitem serwera moze zachowywac sie inaczej: luka dniowa uniemozliwia oznaczenie archiwum jako kompletnego i wymusza pelny przeczes, ktory odbudowuje takze starsze strony widoku.

## Zakres poprawki

Po poprawnym przeczesie inkrementalnym nalezy lokalnie uzupelnic brakujace starsze wpisy widoku List z archiwum danej skrzynki.

Poprawka musi:

- zachowac swieza glowe widoku i kontekst serwera jej wpisow;
- dodawac tylko brakujace rekordy archiwum, z deduplikacja po `archiveId`;
- zachowac kolejnosc po `sortKey`, a nastepnie po `id`;
- odtwarzac pola wiersza z rekordu archiwum i pozostawiac starsze wpisy bez kontekstu serwera, aby otwarcie korzystalo z bezpiecznej re-kotwicy;
- dzialac idempotentnie i nie wysylac dodatkowych komend do Arkadii;
- pozostawiac archiwum niezmienione poza dotychczasowymi regulami indeksacji;
- nie odtwarzac widoku po anulowaniu, bledzie, niekompletnej indeksacji ani w obecnosci luki;
- nie oznaczac skrzynki z luka jako kompletnej;
- nie zmieniac zwyklego odswiezania, kasowania listow, storage, kontaktow, UI, zasad indeksacji ani pobierania tresci.

Istniejace zalozenie indeksacji inkrementalnej pozostaje bez zmian: starsza czesc archiwum ponizej miejsca zatrzymania moze byc nieaktualna do pelnego przeczesu, jesli zostala zmieniona poza pluginem. Otwarcie takiego wpisu nadal wymaga bezpiecznej re-kotwicy.

## Kolejnosc wykonania

1. Zweryfikowac zdalne HEAD repozytoriow pluginu i testow oraz zapisac ten plan.
2. Dodac testy regresji w `tests/indexViewRestore.test.ts`.
3. Uruchomic nowe testy na niezmienionym kodzie i zapisac lokalny dowod RED.
4. Wdrożyc odtwarzanie widoku w `src/arkmail/index.ts` bez rozszerzania zakresu.
5. Uruchomic nowe testy do GREEN oraz pelne lokalne kontrole projektu.
6. Zatwierdzic test i implementacje jednym commitem: `Uzupelnij widok skrzynki po indeksacji`.
7. Dodac scenariusz E2E w `arkadia-dargoth-testy`: 51 listow, pelna indeksacja, prawdziwy reload, druga indeksacja tylko z pierwsza strona, 51 wierszy, brak pobrania starszej strony, niezmienny storage i otwarcie starszego listu.
8. Wykazac RED scenariusza E2E na paczce 1.30.4, a nastepnie GREEN na paczce kandydackiej.
9. Zatwierdzic test E2E commitem: `Dodaj test widoku list po ponownym uruchomieniu`.
10. Wykazac lokalny RED testu wersji, podbic wersje do 1.30.5 i uruchomic `node scripts/release.mjs`.
11. Powtorzyc build i porownac SHA-256 obu paczek.
12. Zatwierdzic wydanie commitem: `Wydaj wersje 1.30.5`.
13. Uzyskac zielone CI obu repozytoriow.
14. Uruchomic jedna pelna zdalna macierz E2E na finalnej paczce kandydackiej.
15. Utworzyc tag `v1.30.5` i GitHub Release `ArkMail v1.30.5` z jednym assetem `arkmail_1_30_5.zip`.
16. Uruchomic workflow `Release asset`, pobrac opublikowany asset i porownac go bajt po bajcie z finalna paczka.
17. Po kompletnych dowodach usunac ten plan i wszystkie utworzone pliki tymczasowe.
18. Sprawdzic koncowy stan repozytoriow, CI, tagu i wydania.

## Zasady wykonania

- Dowod RED wykonac lokalnie na starym kodzie; nie wysylac celowo czerwonego testu do CI.
- Test i implementacje zatwierdzic w jednym commicie.
- Przed kazdym commitem wykonac wymagane kontrole, a po commicie zweryfikowac SHA, komunikat, rodzica, sciezki i zawartosc drzewa.
- Nie uzywac force-push. Nieoczekiwany blad CI naprawiac kolejnym commitem.
- Nie publikowac wersji 1.30.5 w katalogu Dargoth bez osobnego polecenia.
