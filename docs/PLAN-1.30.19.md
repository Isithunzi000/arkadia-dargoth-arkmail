# ArkMail 1.30.19 — plan uproszczenia operacji

## Stan wyjściowy

- Repo: Isithunzi000/arkadia-dargoth-arkmail, main.
- Zweryfikowany HEAD: c5465f319cb75197d819389ae5bc78ab0b72c1c9.
- Kopia robocza: 356/356 blobow zgodnych z main; brak roznic i plikow dodatkowych.
- Test live 1.30.18 potwierdzil trwaly stan recovering i blokade kolejnych operacji. Nie ustalono i nie zgadujemy konkretnej sciezki wywolania.
- Zadanie: usunac globalne odzyskiwanie i blokady miedzy operacjami. Bez testow live.

## Docelowy kontrakt

1. Jedna operacja naraz; SessionLock i SessionScopeRegistry zostaja.
2. Reczna poczta gracza blokuje komendy pluginu tylko do zakonczenia jej trybu; playerMailMode zostaje.
3. Odpowiedz niezgodna z zadaniem konczy wylacznie biezaca operacje.
4. Timeout, bled wysylki i niejednoznacznosc koncza wylacznie biezaca operacje i zwalniaja kolejna.
5. Brak globalnego recovering, beginRecovery, finishRecovery, isRecovering, timera odzyskiwania i komunikatow blokady odzyskiwania.
6. Brak gaga poznych linii po zakonczeniu operacji; gag dziala tylko wedlug istniejacego predykatu aktywnej operacji.
7. Reconnect zamyka stara sesje; po sygnale online nowa operacja nie czeka na stary ani nowy prompt.
8. Nieudane automatyczne q porzuca stara kolejke komend modalnych, ale nie blokuje nowych komend ani sesji. Do tego sluzy wylacznie stan pojedynczego modala, nie globalna blokada.
9. Kontrolowane q/~q tylko dla potwierdzonej wlasnej sesji; nieznany pager nie dostaje automatycznego q.
10. Usuwanie i wysylka zachowuja dotychczasowa kontrole rzeczywistych odpowiedzi serwera; bez dodatkowych pytan UI i bez automatycznego ponawiania operacji zmieniajacych stan.
11. Usunac pustego subskrybenta promptu w index.ts i wszystkie galezie UI uzaleznione od isRecovering.
12. Nie zmieniac lokalnego stanu recovering w PagerSession uzywanego po jednoznacznym odrzuceniu przez wlasna sierota; to nie jest globalna blokada i pochodzi juz z 1.30.5.

## Zakres plikow produktu

- src/arkmail/core/session/transport.ts: usuniecie API i stanu recovery z Transport/MockTransport.
- src/arkmail/core/session/mailbox.ts: timeout i bledy nie ustawiaja globalnego stanu.
- src/arkmail/core/session/pager.ts: fail, timeout i niezgodny prompt nie ustawiaja globalnego stanu.
- src/arkmail/core/session/editor.ts: timeout i blad koncza tylko compose.
- src/arkmail/core/session/importer.ts: timeout konczy tylko import.
- src/arkmail/adapters/dargothTransport.ts: usuniecie stanu, timera, gaga i bramek recovery; lokalne porzucenie starej kolejki po bledzie q.
- src/arkmail/index.ts: usuniecie komunikatu, bramek i pustego subskrybenta.

## Dowody przed implementacja

Nowe lub zmienione kontrole uruchomic na starym kodzie, przed zmiana produktu:

1. Mailbox timeout -> kolejny fetch wysyla komende; stare: RED.
2. Mailbox niejednoznaczna odpowiedz -> kolejny fetch dziala; stare: RED.
3. Pager niezgodny prompt bez wlasnego przejscia -> odrzucenie, brak q, kolejny odczyt/listing dozwolony; stare: RED.
4. Pager timeout/bled wysylki po potwierdzonym pagerze -> kolejna operacja dozwolona; stare: RED.
5. Editor timeout -> kolejny compose nie jest odrzucany przez poprzedni timeout; stare: RED.
6. Import timeout -> kolejny import nie jest odrzucany przez poprzedni timeout; stare: RED.
7. DargothTransport po timeoutcie nie gaguje poznych linii i przyjmuje nowa sesje bez promptu; stare: RED.
8. Reconnect -> nowa operacja po online bez promptu; stare: RED.
9. UI po bledzie nie pokazuje komunikatu recovery i kolejne klikniecie wykonuje operacje; stare: RED.
10. Nieudane q porzuca stara kolejke, ale nowa komenda i nowa sesja dzialaja bez promptu; stare: RED.
11. Statyczna kontrola produktu: brak beginRecovery, finishRecovery, isRecovering, RECOVERY_LIMIT_MS i RECOVERY_BUSY_MSG; stare: RED.
12. Kontrole zachowawcze: jedna aktywna sesja, playerMailMode, dokladnie jedno q, brak q do nieznanego pagera, wyniki usuwania/wysylki, anulowanie, destroy i reconnect.

Kazdy etap ma lokalny RED na konkretnym pliku przed edycja produktu. Test i implementacja w jednym commicie. CI nigdy nie jest dowodem RED.

## Wykonanie i weryfikacja

1. Zapisac plan trwale; dodac go do pierwszego commita zmiany.
2. Najpierw testy kontraktu, uruchomione na starym kodzie; zapisac liczby i nazwy bledow bez danych wrazliwych.
3. Jedna spojna zmiana produktu i testow, poniewaz API Transport dotyka core, adaptera i UI; bez pozostawiania posredniego commita niespelniajacego typowania.
4. Po zmianie: testy powiazane, potem pelny lokalny zestaw z Node 26 i PATH dla procesow dzieci.
5. tsc --noEmit, build, bundle, kontrole higieny i statyczny brak globalnego recovery.
6. Sprawdzic, ze kazda sciezka konczy sesje i zwalnia lock przez istniejace cleanup/finally.
7. Bez logowania do gry i bez macierzy live. Zdalne potwierdzenie tylko syntetyczne, zgodnie z istniejacymi workflow; pelna macierz najwyzej raz na koncu, nigdy lokalnie.
8. Zaktualizowac dokumentacje wyniku; wykonany plan usunac.
9. Wydanie 1.30.19: meta + test wersji z osobnym lokalnym RED/GREEN, deterministyczny ZIP, dwa identyczne buildy, dokladnie jeden asset.
10. Commit/push przez REST bez force; weryfikacja HEAD, rodzica, sciezek i blobow. CI tylko GREEN.
11. GitHub Release ArkMail v1.30.19, tag v1.30.19, asset arkmail_1_30_19.zip; pobranie i porownanie bajtowe. Bez publikacji do katalogu.

## Warunek zakonczenia

Zadanie jest zamkniete dopiero gdy pelny lokalny zestaw, typowanie, build i higiena sa zielone, zdalne CI jest zielone, release odpowiada main, a w repo nie ma globalnego mechanizmu recovery ani danych wrazliwych. Brak testu live zapisac jako ograniczenie, nie przedstawiac go jako wykonanego.
