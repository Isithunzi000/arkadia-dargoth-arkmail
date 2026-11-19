# Plan: reczne zamkniecie pagera i wybor zakresu odpowiedzi

## Punkt wyjscia

- Baza: commit `997b0d80b5903b294f0b226fc6614aedfe1304ec`, ArkMail 1.30.11.
- Plan dotyczy wylacznie przekazania recznego `q`/`x` bez zaleznosci od echa oraz nowego panelu „Odpowiedz wszystkim”.
- Nie obejmuje zmiany wersji, wydania ani publikacji zewnetrznej.

## 1. Reczne zamkniecie pagera

### Potwierdzona sciezka

`DargothTransport` zna tresc komendy przechwyconej przez `commandHooks`, ale `PagerModalHooks.onUserCommand` nie przekazuje jej dalej. Warstwa glowna rozpoznaje zamkniecie dopiero z echa. Brak obsluzonego echa pozostawia `playerMailMode`, a zwykly prompt nie konczy trybu bez `awaitingPlayerMailPrompt`.

### Zmiana

1. `onUserCommand` otrzymuje tresc przechwyconej komendy.
2. Przechwycone `q` albo `x` od razu ustawia oczekiwanie na zwykly prompt.
3. Echo jest dodatkowym, idempotentnym sygnalem i nie jest wymagane.
4. Dopiero zwykly prompt konczy `playerMailMode` i `awaitingPlayerMailPrompt`.
5. Opoznione echo po zakonczeniu nie przywraca blokady.
6. Istniejaca kontrola pobierania tresci po prawidlowym zamknieciu przechodzi bez zmiany samej procedury pobierania.

### Poza zakresem

Bez zmian pozostaja `PagerSession`, wykrywanie pagera, puste komendy przewijania, czasy oczekiwania, automatyczne zamykanie wlasnej sesji, osierocony pager, gagowanie, recovery, rozpoznawanie promptow, `SessionLock`, kolejka komend, pobieranie, odswiezanie, usuwanie, wysylka i reconnect. Nie dodajemy opoznien czasowych ani drugiego `q`.

### Wymagane dowody

- `q` i `x` bez echa, zakonczone zwyklym promptem.
- Echo przed promptem, po prompcie, powtorzone i nieobecne.
- Brak zwyklego promptu i prompt pagera nie koncza oczekiwania.
- Komenda inna niz `q`/`x` nie ustawia oczekiwania na zamkniecie.
- Brak podwojnego `q` i brak automatycznego zamkniecia nieznanego pagera.
- Pobieranie przed promptem pozostaje zablokowane, a po promptcie uzywa istniejacej sciezki.
- Istniejace testy pagera, recovery, gagowania, kolejki i Archiwum przechodza bez zmiany zalozen.

## 2. Odpowiedz wszystkim

### Panel

Klikniecie otwiera panel przypisany do konkretnego listu. Zawiera:

- DO + DW, domyslnie;
- Tylko DO;
- Tylko DW;
- niezalezne „Z cytowaniem”, domyslnie wylaczone;
- Kontynuuj i Anuluj.

Otwarcie, zmiana wyboru i anulowanie nie wysylaja komend, nie odczytuja gry i nie zmieniaja draftu. Kontynuuj przygotowuje formularz, ale nie wysyla listu. Stare „Odpowiedz” i „Odpowiedz z cytowaniem” pozostaja bez zmian.

### Adresaci

Najpierw powstaja kanoniczne zbiory DO i DW zgodnie z obecnymi regulami: usuniecie biezacej postaci, deduplikacja bez rozrozniania wielkosci liter, pierwszenstwo DO, obsluga aliasow i znanych nazw wielowyrazowych oraz rozroznienie listow odebranych i wyslanych.

- DO + DW zachowuje obecny wynik, lacznie z promocja DW przy pustym DO.
- Tylko DO uzywa wylacznie oryginalnego DO i nie promuje DW.
- Tylko DW uzywa wylacznie oryginalnego DW; technicznie osoby trafiaja do pola `Adresat`, a `DW` jest puste, poniewaz edytor wymaga adresata podstawowego.
- Pusty wybrany zbior blokuje Kontynuuj. Nie ma cichego wyboru innego zakresu.

### Cytowanie

Bez cytowania temat i tresc pozostaja puste. Z cytowaniem ArkMail lokalnie ustawia:

- temat: `Odp: <oryginalny temat>`;
- tresc: puste dwie linie, `---`, oryginalna tresc, `---` i koncowa nowa linia zgodnie z istniejacym formatem.

Cytat pochodzi z aktualnego listu, nie uzywa pagerowego `R` i nie wymaga dodatkowego odczytu zwyklego listu. Wysylka pozostaje na istniejacym `napisz list`. Walidacja znakow i pol nie ulega zmianie.

### Archiwum i draft

- Pelne naglowki lokalne nie powoduja odczytu z gry.
- Brakujace naglowki sa odzyskiwane dopiero po Kontynuuj, najwyzej jednym odczytem.
- Pozny wynik jest odrzucany po anulowaniu, zmianie listu, reconnectcie, zmianie postaci lub zmianie draftu.
- Blad odczytu albo zapisu nie stosuje czesciowego wyniku.
- Zmodyfikowany draft nie jest nadpisywany.
- Naglowki i cytat nie moga pochodzic z roznych rekordow.

### UI

Panel uzywa natywnych radio i checkboxa, obsluguje klawiature i Escape, przywraca focus do przycisku oraz resetuje wybor przy kolejnym otwarciu. Kontrolki nie moga wykraczac poza okno przy 390×520 i skali 1,8. Kolory pochodza ze zmiennych motywu, a istniejace klasy kontrolek pozostaja w uzyciu.

## 3. Procedura

1. Potwierdzic zdalny HEAD, zgodnosc kopii i bazowy pelny zestaw lokalny.
2. Kazdy test nowego zachowania uruchomic najpierw lokalnie na starym kodzie i zachowac wynik bledu.
3. Test i poprawka zapisac w jednym commicie dopiero po zielonym pelnym zestawie lokalnym, typowaniu i buildzie.
4. Po commicie sprawdzic SHA, komunikat, drzewo, sciezki i zawartosc blobow.
5. Nie wykonywac pelnych scenariuszy przegladarkowych lokalnie. Koncowa macierz zdalna uruchomic dokladnie raz po wszystkich zmianach.
6. Uzywac wylacznie syntetycznych danych. Nie dodawac danych wrazliwych, prywatnych korespondencji ani nazw postaci.
7. Nie przedstawiac testow automatycznych jako kontroli w realnej grze.

## 4. Warunek zakonczenia

- Reczne `q`/`x` dziala bez echa, a blokade zdejmuje dopiero zwykly prompt.
- Opoznione echo nie zmienia zakonczonego stanu.
- Pobieranie po prawidlowym zamknieciu dziala bez zmiany innych mechanik.
- Wszystkie szesc kombinacji zakresu i cytowania jest pokrytych testami.
- Archiwum, stare odpowiedzi i draft nie maja regresji.
- Pelny zestaw lokalny, typowanie, build i koncowa macierz sa zielone.
- Koncowy diff zawiera wylacznie zatwierdzony zakres.
