# ArkMail 1.30.15 — plan naprawy pagera, kolejek i otwierania listow

## Stan i zakres

Baza: main 1.30.14, przed pracami ponownie zweryfikowac HEAD i kopie 1:1.
Cel: usunac potwierdzone usterki bez zmian w Dargothie, bez zgadywania stanu gry i bez dodatkowych automatycznych q/~q.
Zakres: dargothTransport.ts, pager.ts, editor.ts, index.ts, testy Node/happy-dom, plan roboczy, wersja i GitHub Release.
Poza zakresem: marketplace, katalog, Vercel, zmiany klienta, pelne lokalne E2E.

## Zasady wykonania

- Kazdy etap najpierw lokalnie RED na starym kodzie, potem implementacja i GREEN; test+fix w jednym commicie.
- Przed kazdym commitem: npm test, npm run typecheck, npm run build na Node 26.
- Commity po polsku ASCII, rzeczowe; bez force-push.
- Zdalny zapis przez Git Data API z jawnymi sciezkami; po zapisie weryfikacja HEAD, rodzica, opisu, sciezek i blobow.
- CI nigdy nie sluzy do dowodu RED. Pelna macierz tylko raz na koncu.
- Plan trzymany jako docs/PLAN-ROBOCZY-1.30.15.md po zatwierdzeniu; aktualizowany i usuniety po wykonaniu.

## Etap 1 — wspolne przejecie pagera i transakcyjne zamykanie

Status: zakonczony lokalnie. Nowe kontrole: 7 bledow na starej bazie, 8/8 po poprawce. Pelny zestaw Node 26: 1320 testow, 1319 zaliczonych, 1 pominety, 0 bledow; typecheck i build zielone. Wyrownano tez istniejacy wyscig w boxMemory.test.ts potwierdzony na czystej bazie 1.30.14.

Pliki: src/arkmail/adapters/dargothTransport.ts, src/arkmail/core/session/pager.ts, tests/modalPagerCommands.test.ts, testy pager/recovery.

Implementacja:
1. Jedna procedura przejecia pierwszej odlozonej komendy pagerowej dla jawnego promptu i idle-completion.
2. q/x gracza wysylane raz jako source=user; przy przejeciu ArkMail nie wysyla wlasnego q.
3. Bez przejecia automatyczne q pozostaje jedna komenda; pagerCloseSent obowiazuje tylko do promptu albo awarii.
4. Odrzucenie wysylki cofa zatrzask, uruchamia recovery dla nierozstrzygnietego kanalu i pozwala graczowi ponowic q/x.
5. Timeout po przyjetym q konczy koalescencje; kolejne reczne q/x przechodzi po sprzatnieciu modalu.
6. PagerSession po awarii potwierdzonego pagera/zamykania uruchamia recovery i podejrzenie sieroty; przed odpowiedzia serwera nie wysyla q i nie zgaduje stanu.
7. Normalny prompt zdejmuje recovery i stary hook. Reconnect zachowuje obecne czyszczenie.

Kontrola RED/GREEN:
- q i x; echo i brak echa; prompt jawny i idle-completion; dokladnie jedna komenda user na drucie.
- Wczesne, bezposrednie i odlozone q/x; odrzucenie automatycznego q bez komendy gracza.
- Powtorzenia przed awaria koalescencja; po awarii/timeoutcie ponowienie przechodzi.
- Pozny prompt pagera nie wysyla duplikatu; zwykly prompt zwalnia kanal.
- Spozniona tresc gagowana do promptu; nowa sesja blokowana w recovery.
- Odczyt oraz wspolne sciezki delete/forward/archive; reply-all headers korzysta z tej samej sciezki archive.

## Etap 2 — bezpieczne kolejki modalne

Pliki: dargothTransport.ts, index.ts lub notify tylko jesli potrzebne, testy modalne.

Implementacja:
1. Sukces potwierdzony zachowuje odtwarzanie komend niepagerowych w kolejnosci.
2. Recovery, nierozstrzygnieta awaria albo przejecie pagera przez gracza porzuca cala stara kolejke; zero automatycznego replay.
3. Jedno ogolne powiadomienie o niewykonaniu odlozonych komend i koniecznosci ponowienia; bez kaskady komunikatow.
4. Swieze komendy gracza po zdjeciu modalu nie sa blokowane przez recovery; dotyczy to tylko nowych dzialan, nie starej kolejki.
5. Reconnect/replay/destroy czyszcza kolejke bez replay.

Kontrola RED/GREEN:
- Nieudane q nie zwalnia spojrz ani innych komend do pagera.
- Przejecie przez r nie zmienia kolejnosci i nie odtwarza wczesniejszych komend do recznego pagera.
- Timeout/bled nie odtwarza kolejki; sukces nadal odtwarza.
- Dokladnie jedno powiadomienie, brak nieobslugiwanych rejectionow.

## Etap 3 — edytor

Pliki: src/arkmail/core/session/editor.ts, tests/composeTransport.test.ts, tests/editorTimeout.test.ts.

Implementacja:
1. Sledzic przyjecie pierwszej komendy napisz list.
2. Odrzucenie pierwszej komendy pozostaje bez recovery i nie zwalnia adresata.
3. Kazde pozniejsze odrzucenie uruchamia recovery; bez automatycznego ~q poza istniejaca potwierdzona sciezka timeoutu.
4. Stara kolejka uzytkownika nie jest odtwarzana po bledzie/timeoutcie (wspolny etap 2).
5. Nowa wysylka czeka na zwykly prompt albo reconnect; pozne linie nie uruchamiaja kolejnych etapow.

Kontrola RED/GREEN:
- Odrzucenie na adresacie, temacie, DW, kazdej linii tresci i **.
- Potwierdzony edytor: recovery, brak replay, brak nowej sesji do promptu.
- Pierwsza komenda odrzucona: dotychczasowe bezpieczne zachowanie.
- Istniejace kontrole ~q, Zaniechane. i promptu pozostaja zielone.

## Etap 4 — otwarcie listu podczas automatycznego odswiezania

Pliki: src/arkmail/index.ts, nowy test integracyjny happy-dom.

Implementacja:
1. Tylko aktywne automatyczne odswiezenie moze zatrzymac najnowsza intencje otwarcia; zwykla reczna operacja nadal zwraca komunikat o zajetosci.
2. Przechowywany jest maksymalnie jeden najnowszy wybor {box, entry, generation}; zadna surowa komenda nie jest kolejkowana.
3. Po odswiezeniu startuje zwykle openWithResolve, wiec wpis przechodzi ponowna re-kotwice i dopasowanie tresci.
4. Kolejny klik zastepuje poprzedni; Zamknij, reczna poczta, reconnect, replay i destroy kasuja odlozony wybor.
5. Brak otwierania po zmianie generacji lub gdy wpis zniknal; obsluga bledu pozostaje istniejaca.

Kontrola RED/GREEN:
- Klik podczas auto-refresh otwiera drugi list po zakonczeniu refreshu.
- Klikniecia drugiego i trzeciego otwieraja tylko trzeci, jedna re-kotwica i jeden odczyt.
- Zmiana numeracji podczas refreshu nie uzywa starego numeru.
- Anulowania nie wysylaja poznych komend.
- Dwa pelne odczyty bez zamykania pierwszego pozostaja zielone.

## Etap 5 — kontrola calego zestawu i wydanie

1. Pelne npm test, typecheck i build; zapisac rzeczywiste liczby.
2. Zbiorczy zdalny zapis zweryfikowanych commitow; zielone zwykle CI.
3. Jedna pelna macierz ArkMail E2E na GitHub Actions; wymagane 47/47 albo wiecej, jesli macierz sie zmieni.
4. Podbic PLUGIN_VERSION do 1.30.15, usunac plan roboczy, zbudowac arkmail_1_30_15.zip.
5. ZIP zawiera dokladnie index.ts i plugin.json; porownac asset bajtowo i podac SHA-256 w raporcie.
6. Tag v1.30.15 i GitHub Release „ArkMail v1.30.15”; krotki opis uzytkowy zgodny z docs/ZASADY.md, jeden asset.
7. Release odpowiada najnowszemu main. Zero publikacji zewnetrznych.
8. Usunac lokalne artefakty diagnostyczne i plan po wykonaniu; raport koncowy rozdziela testy kodu, macierz i paczke release.

## Warunki bezpieczenstwa

- Nie dodawac opoznien jako rozwiazania wyscigow.
- Nie wysylac q/~q na podstawie samego promptu cudzego pagera.
- Nie odtwarzac odlozonych komend przy recovery lub przejeciu.
- Nie uruchamiac pelnych lokalnych E2E.
- Po timeoutcie/504 najpierw ustalic stan, potem ewentualnie ponowic.
- Brak implementacji przed jawnym zielonym swiatlem.
