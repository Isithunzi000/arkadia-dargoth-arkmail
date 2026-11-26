# Plan poprawy odczytu i recznego zamykania

## Decyzja

Plan zatwierdzony przez wlasciciela. Zakres obejmuje odczyt z filtrow i kolejnych stron oraz natychmiastowe lokalne odblokowanie po recznym `q/x`. Nowy interfejs, archiwum i pozostale funkcje zostaja bez zmian. Nie przywracamy calych plikow z wersji 1.30.5.

## Numer i tozsamosc listu

- Kazdy wpis zachowuje `archiveId`, numer serwera, kontekst skrzynki i strony oraz date.
- Numer wizualnego wiersza nie jest numerem komendy.
- Wpis z aktualnego kontekstu jest otwierany bez dodatkowego listingu i bez przeliczania numeru.
- Wpis z nieaktualnego kontekstu jest odnajdowany przez zwykly listing zakotwiczony na dacie. Wybor odbywa sie wylacznie po jednoznacznym `archiveId`.
- Swiezy listing i odczyt naleza do jednej operacji wylacznej. Zadne odswiezenie ani pobranie strony nie moze zmienic miedzy nimi listingu serwera.
- Po odrzuceniu numeru wolno wykonac najwyzej jedno ponowne odnalezienie. Brak jednoznacznego wpisu konczy operacje bez zgadywania.

## Dwa stany serwera

Rozrozniamy wylacznie stan, w ktorym mozna wyslac kolejna komende, oraz stan wymagajacy najpierw zakonczenia pagera. Prompt pagera nie moze byc podstawa dodatkowych kategorii blokujacych interfejs. Nie wysylamy automatycznego `q` do pagera nieznanego pochodzenia.

## Reczne q/x

- Komenda gracza przechodzi do gry dokladnie raz.
- Samo echo `q/x` natychmiast konczy lokalny tryb poczty gracza i zdejmuje blokade.
- Odblokowanie nie czeka na zwykly prompt ani limit czasu.
- Operacja, ponowienia i czasomierze sa sprzatane jednokrotnie; pozne zdarzenia nie moga ponownie zablokowac interfejsu.
- Automatyczne komendy pozostaja wstrzymane, dopoki serwer nie pozwoli na kolejna komende.

## Dowody lokalne

Kazda zmiana zachowania otrzymuje test uruchomiony najpierw na starym kodzie. Oczekiwany blad zapisujemy lokalnie, a test i implementacje umieszczamy w jednym commicie. CI otrzymuje wylacznie zielone zmiany.

Testy kontekstu obejmuja aktualny filtr, nieaktualny filtr, zmiane strony i skrzynki, jednoznacznosc `archiveId`, brak wpisu oraz jedna ponowna probe. Testy stron obejmuja pozycje 1, 50, 51, 100 i najstarszy wczytany list oraz odswiezenie przed kliknieciem. Testy zamykania obejmuja `q/x` przed i po prompcie pagera, brak kolejnego promptu, automatyczne odswiezanie i pozne zdarzenia.

## Kontrola i wydanie

Przed commitami uruchamiamy pelny zestaw, typowanie, budowanie i kontrole higieny. Dokumentacja 1.30.23 zostaje oznaczona jako obalona przez test realnej gry. Po zielonych commitach sprawdzamy CI, wydajemy kolejna wersje z jednym wersjonowanym ZIP i porownujemy asset z drzewem taga. Bez marketplace.

Testy syntetyczne nie sa dowodem naprawy w realnej grze. Ostateczny odbior obejmuje drugi wynik filtra, najstarszy wczytany list i natychmiastowe odblokowanie po recznym `q/x`.
