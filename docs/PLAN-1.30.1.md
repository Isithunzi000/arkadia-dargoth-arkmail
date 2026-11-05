# PLAN 1.30.1 — spojnosc UI, migracja klawiszy, archiwum na chipsy

Zatwierdzony plan wydania 1.30.1. Zrodlo: cztery audyty glebokie + analiza
screenshotow + zgloszenia uzytkownika. Pokrycie 100% ustaleń — macierz na koncu.

Protokol bez zmian: RED lokalnie (straznik czerwony na starym kodzie, nigdy przez
CI) -> implementacja -> pelna macierz -> walidacja komunikatu -> commit per etap
z weryfikacja blobow. Bez marketplace. Plan usuwany po wykonaniu 100%.

## Etap 1 — Kontrakt przeciw zapadaniu w kolumnach flex

Pokrywa: zgloszenia 2 i 3 (klawisze z Ksiazki nakladaja sie po imporcie), ryzyko
compose wide.

Zmiany w src/arkmail/ui/styles.ts:
1. `.arkmail-listy > button { flex: none; }` — cztery klawisze zbiorcze Ksiazki
   nie kurcza sie; caly skurcz idzie w kontener listy (ma juz min-height: 0).
2. `.arkmail-split-compose .arkmail-pane > input, ... > textarea, ... > select,
   ... > button { flex: none; }` — ta sama ochrona w compose trybu wide.
3. Jawne `flex: none` dla dywizow-naglowkow w kolumnie (`.arkmail-listy >
   .arkmail-boxes`, `> .arkmail-box-ops`, `> .arkmail-search-row`).

Straznicy: nowy test piniujacy istnienie obu reguł z `flex: none` oraz zakaz
bezposrednich klawiszy/pol jako dzieci kolumn bez ochrony (asercja na render.ts).
RED przed commitem.

## Etap 2 — Przywrocenie reguł komponentowych, kolizje z klientem, sprzatanie

Pokrywa: A1–A5 (regresje specyficznosci F4b), B1 (textarea compose), B2 (ghost),
stale martwe, reguła martwa, dziura straznikowa.

Zmiany w src/arkmail/ui/styles.ts:
1. Przepisanie przegranych reguł na `.arkmail-root button.<klasa>` (0,2,1 —
   remis z catch-allem wygrywany kolejnoscia): `.arkmail-box` + hover (A1),
   `.arkmail-box-active` + hover (A2), `.arkmail-box-attention` (A3),
   mini rodzina `.arkmail-contact-dir`/`.arkmail-contact-addbook`/
   `.arkmail-arch-people-toggle` (A4), `.arkmail-search-clear` (A5).
2. B1: `.arkmail-form textarea` -> `.arkmail-root .arkmail-form textarea` z
   `min-height: calc(120px * var(--window-font-scale, 1))` — wygrywa z klientem
   (0,2,1 vs 0,2,1, kolejnosc nizej); reszty reguł klienta nie ruszamy.
3. B2: `.arkmail-ghost` — `font-size: var(--ui-input-fs, 14px)`; wyrownanie
   pionowe do wysrodkowania pola klienta; komentarz o nowym wyliczeniu.
4. Sprzatanie: usuniecie stalych `ACCENT_DEEPER` i `DANGER` (martwe od F4b)
   oraz reguły `.arkmail-older-row` (zero konsumentow).

Straznicy: nowa rodzina testow specyficznosci (regex na postac selektora
`button.<klasa>`); przeredagowanie straznika fontScale (piniuje wyłacznie
chroniona wysokosc textarea compose z poprawnym calc ze skala). RED przed
commitem.

## Etap 3 — Dokonczenie migracji klawiszy + Listy

Pokrywa: C (26 klawiszy poza natywnymi klasami), zgloszenie 1 (posciskane).

Zmiany w src/arkmail/ui/render.ts — mapowanie 26 miejsc:
- 19 z klasami layoutowymi: letter-close, reply, reply-all, reply-quote, fwd,
  export-letter, preview-open, preview-close, book-write x2, import-btn,
  deletion-select-all, deletion-clear-selection, group-toggle ->
  `popup-btn popup-btn--control` (klasy layoutowe zostaja jako haki);
- 7 bez klasy: filterClear x2, renameOk, write, addMemberOk, groupAddBtn,
  expBtn -> ten sam zestaw;
- martwa klasa `arkmail-subpills` wyniesiona z className wiersza pigułek.

Zmiany w styles.ts: `.arkmail-box-ops button` — `flex: 1 1 140px` ->
`flex: 0 1 auto`; odstep wiersza 6->8 px; zawijanie zostaje.

Straznicy/aktualizacje: buttonTitles, uiTooltips, contrast (jesli piniuje
rozmiary catch-all), liczniki F5 w uiStyles, ewentualnie kontaktySections.
RED: straznik zliczajacy klawisze bez klas natywnych (mini rodzina na liscie
dozwolonych).

## Etap 4 — Reczne dodawanie wraca do wlasciwych sekcji

Pokrywa: zgloszenia 4 i 5.

Zmiany w src/arkmail/ui/render.ts:
1. Wiersz "Imie nowej osoby + Dodaj" (data-book-new, z ghostem) z
   renderImportEksport -> renderKsiazka, naglowek nad lista, pod klawiszami
   zbiorczymi; pusty komunikat ksiazki przestaje sugerowac import jako jedyna
   droge.
2. Wiersz "Nazwa nowej grupy + Utworz grupe" (data-group-add) -> renderGrupy,
   gora sekcji. Edycja grupy bez zmian.
3. renderImportEksport zostaje z czystym importem/eksportem.

Straznicy: aktualizacja ghost, listScroll, importButtons, kontaktySections,
groupsView, bookView, uiTooltips — grep po data-book-new/data-group-add przed
i po; nowy straznik: Import-Eksport bez pol recznego dodawania, Ksiazka i Grupy
z polami. RED przed przeniesieniem.

## Etap 5 — Archiwum na chipsy

Pokrywa: zgloszenie 6.

Zmiany w render.ts: w renderArchiwum dwa chipsy dialog-tab/is-active po wzorze
Kontaktow, stan lokalny (jak contactView.sub), domyslnie "Archiwum listow":
- listy: obecne kontrolki + lista listow;
- osoby: panel "Osoby z listow" jako osobny widok; przełacznik
  [data-arch-people-toggle] znika — role przejmuje chips;
- skok: klik "Odebrane" przy osobie przełacza chips na listy, stawia filtr
  osoby, po malowaniu przewija liste wynikow; kolejnosc: sub -> filtr ->
  scroll (deterministyczna).

Straznicy: przebudowa 13 plikow z klikiem [data-arch-people-toggle]: archPeople,
clearFilters, contactJump, buttonTitles, archiveGone, deletionFlow, indexCounts,
indexViewRefresh, pagination x2, indexAll, indexAllFix, uiRender, ghost —
zamiast klikać zwijanie, przełaczaja chips; semantyka skoku w archPeople
piniowana jako: chips=listy + filtr osoby + scroll na kontener listy. RED przed
zmiana.

## Etap 6 — Wydanie 1.30.1

Pieczec: meta.ts -> 1.30.1 (straznik version.test.mjs RED), node scripts/
release.mjs, pelna macierz, commit z zipem, tag v1.30.1, wydanie GitHub
"ArkMail v1.30.1", dispatch release-asset.yml. Bez marketplace. Usuniecie
docs/PLAN-1.30.1.md na koncu.

## Bramki jakosci (kazdy etap)

tsc -> straznicy etapu z RED udowodnionym lokalnie -> pelna macierz (stan: 826
testow, cel: 0 nieudanych, 1 pominiety) -> walidacja komunikatu -> commit przez
Git Data API z weryfikacja blobow (przy zipie weryfikacja sha256 ze streamem).

## Macierz pokrycia 100%

| Ustalenie | Etap |
|---|---|
| Zgl. 2/3: zapadanie klawiszy Ksiazki po imporcie | 1 |
| Ryzyko compose wide (tej samej klasy) | 1 |
| A1 skrzynki bez ksztaltu | 2 |
| A2 brak akcentu aktywnej skrzynki | 2 |
| A3 martwa obwodka uwagi | 2 |
| A4 mini rodzina urosla | 2 |
| A5 padding search-clear | 2 |
| B1 textarea compose zapada sie (+ straznik fontScale piniujacy regresje) | 2 |
| B2 ghost nierowno z tekstem pola | 2 |
| Stale martwe ACCENT_DEEPER, DANGER | 2 |
| Regula martwa .arkmail-older-row | 2 |
| Dziura straznikowa (specyficznosc niewykrywalna) | 2 |
| C: 26 klawiszy poza natywnymi klasami | 3 |
| Zgl. 1: klawisze posciskane (box-ops) | 3 |
| Martwa klasa .arkmail-subpills | 3 |
| Zgl. 4: dodawanie osoby do Ksiazki | 4 |
| Zgl. 5: tworzenie grupy do Grupy | 4 |
| Zgl. 6: Archiwum na chipsy ze skokiem | 5 |
| Zgl. 1: lewe uciecie tekstow | weryfikacja w zywym kliencie po Etapach 1–3 |
| ARIA (obserwacja) | poza zakresem 1.30.1, odnotowane |
| Czyste wymiary (XSS, montaz, atrybuty 1:1, skalowanie, kolory, warianty) | brak dzialan — pozytywnie zweryfikowane |
