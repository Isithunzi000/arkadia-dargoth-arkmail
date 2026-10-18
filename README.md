# ArkMail

Kompleksowy system pocztowy dla klienta WWW Dargoth (Arkadia MUD).

Skrzynki (odebrane / nieprzeczytane / wysłane / niewysłane), czytanie,
pisanie i przekazywanie listów, kasowanie, kontakty z licznikami
korespondencji, lokalne archiwum wykraczające poza serwerowy limit
50 listów oraz powiadomienia o nowej poczcie.

## Instalacja

W kliencie Dargoth dodaj wtyczkę z adresu:

```
https://isithunzi000.github.io/arkadia-dargoth-arkmail/arkmail.js
```

Po załadowaniu: alias `/arkmail` (otwiera/zamyka okno), pozycja
"ArkMail" w menu wtyczek oraz klawisz ArkMail w stopce klienta
(z licznikiem nieprzeczytanych).

## Możliwości

- **Listy** — cztery skrzynki, wyróżnienie nieprzeczytanych, przycisk
  "Wczytaj starsze" (paginacja `listy <skrzynka> przed <data>`) albo
  "Wczytaj wszystkie" — pętla stron do końca archiwum (limit 40 stron,
  pauza 400 ms między stronami, przycisk zamienia się w "Przerwij").
- **List** — nagłówek i treść; operacje Usuń i Przekaż (subdialog DW
  obsługiwany automatycznie, błędy adresata zgłaszane tostem).
- **Napisz list** — adresat / temat / DW / treść, sześć szablonów ramki
  (w tym trzy pergaminy), szerokość linii 20–120 i żywy podgląd —
  ramka i justowanie stają się fizyczną treścią listu, dokładnie jak
  w oficjalnym kliencie. Pusty list nie wylatuje.
- **Kontakty** — wyłącznie nadawcy i adresaci z pobranych listowań;
  listy do kilku osób (`Odbiorcy: A, B`) liczą się każdemu osobno,
  duplikaty scalane bez względu na wielkość liter; liczniki
  odebranych/wysłanych i data ostatniego kontaktu; filtr (nazwa/alias)
  i sortowanie (nazwa, liczba listów, ostatni kontakt).
- **Archiwum** — lokalne, per postać; filtry po temacie.
- Powiadomienie `[ POCZTA ] Masz nowa poczte od ...` odświeża skrzynki
  i badge; opcjonalny tost (przełącznik w panelu Listy).

## Prywatność i zgodność z regulaminem

Wtyczka wysyła do gry wyłącznie komendy pocztowe odpalane świadomym
kliknięciem gracza (i odświeżenie listingów po powiadomieniu serwera).
Cały stan (archiwum, ustawienia, szablon) trzymany jest w localStorage
przeglądarki, w przestrzeni kluczy per postać (`arkmail.<postac>.*`).
Nic nie opuszcza przeglądarki poza normalnym ruchem gry.

## Rozwój

```bash
npm install
npm test          # tsc + pelny zestaw (core, sesje, adaptery, UI, smoke)
npm run typecheck
node scripts/release.mjs   # buduje releases/arkmail_X_Y_Z.zip
```

Architektura: czysty core (`src/arkmail/core`) — parser protokołu,
efemeryczne sesje (skrzynka / pager / edytor) nad abstrakcyjnym
transportem, archiwum, renderer listów; adaptery Dargoth
(`src/arkmail/adapters`); UI vanilla DOM (`src/arkmail/ui`).
Testy jedzą golden fixtures z prawdziwych logów gry
(`tests/fixtures`). Specyfikacja protokołu dla portów (oficjalny
klient WWW, Mudlet): `docs/PROTOCOL.md`.

Renderer listów (`src/arkmail/core/letterRender.ts`) jest portem 1:1
implementacji z oficjalnego klienta WWW Arkadii (licencja MIT,
projekt Arkadia — https://arkadia.rpg.pl), z zachowaniem zgodności
bajtowej pilnowanej goldenami.
