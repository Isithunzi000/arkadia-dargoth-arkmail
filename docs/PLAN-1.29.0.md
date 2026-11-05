# Plan wydania ArkMail 1.29.0

Data: 2026-11-05. Zatwierdzony plan wydania — audyt regresyjny (K1–K4)
plus ujednolicenie systemu projektowego interfejsu (D1–D9, S1–S3).
Ten dokument jest jedynym źródłem zakresu fali; po wykonaniu w 100%
należy go usunąć z repo (ostatni krok ostatniej fali).

## Zasady wykonania (wg docs/ZASADY.md)

1. Test na nowe zachowanie pisany jest najpierw i weryfikowany lokalnie
   (uruchomienie konkretnego pliku testu), że pada na starym kodzie.
   Dowód czerwieni notujemy w raporcie fali — CI widzi wyłącznie zieleń.
2. Test i poprawka idą w jednym commicie.
3. Przed każdym commitem pełny zestaw testów lokalnie na zielono
   (obecnie 787 testów) oraz `tsc --noEmit`.
4. Po commicie: weryfikacja sha i komunikatu przez API, potem oczekiwanie
   na zielony CI — dopiero następna fala. Bez wymuszonych pushy.
5. Marketplace Dargoth/Vercel: poza zakresem, wymaga osobnego rozkazu.

## Decyzje zablokowane

- Motyw zostaje bez zmian; zmiana dotyczy wyłącznie dyscypliny tokenów,
  stanów i kontrastów.
- Tier `arkmail-btn-reset` (styles.ts 102–107) zostaje jako
  udokumentowana martwa klasa (decyzja 2026-11-02, nagłówek
  tests/buttonTiers.test.ts). Zero zmian.
- Wiersze list nie dostają tabindex (wzorzec nawigacji jak w Gmailu);
  focus-visible dotyczy wyłącznie prawdziwych elementów interaktywnych.
- S3 (przejścia 100 ms na przyciskach) jest elementem opcjonalnym —
  odrzucenie nie wpływa na resztę planu.
- Timer flasha (index.ts, 3000 ms) poza zakresem K3 — osobna koncepcja.
- `GUARD_ARM_MS` (render.ts 291) jest już nazwaną stałą — bez zmian.

## F0b — Higiena nazewnictwa wydań (bez zmian w kodzie)

Wykonanie PRZED F1 — wylacznie operacje na GitHub API (edycja metadanych
release'ow), zero zmian w kodzie, jeden commit dokumentacyjny dla ZASADY.md.
Standard obowiazujacy od wydania 1.29.0 w tym repo (docelowo wspolny dla
wszystkich projektow):

- Nazwa release: "ArkMail vX.Y.Z" — wylacznie nazwa produktu i numer
  wersji. Tag: vX.Y.Z. Asset: dokladnie jeden, arkmail_X_Y_Z.zip.
- Opis release: jeden krotki akapit prostym jezykiem — co sie zmienilo
  i po co; zakaz: zargonu ("fala", "RED/GREEN", "higiena"), dat sesji,
  sha, numerow przebiegow CI, naglowkow markdown, prefiksu "release:".
- Commity: jezyk polski, rzeczowy opis zmiany, zakaz jezyka angielskiego
  i zargonu. Historii git NIE przepisujemy (zakaz force-push) — konwencja
  obowiazuje commity od 1.29.0.

Kroki:

1. Nazwy 43 istniejacych release'ow: dopisanie litery "v" do numeru
   (np. "ArkMail 1.28.0" -> "ArkMail v1.28.0") — 43/43 przez API PATCH,
   w jednym przebiegu razem z opisem.
2. Przepisanie opisow wszystkich 43 release'ow do standardu (API PATCH,
   po jednym akapicie, wylacznie fakty o funkcjach, po polsku).
3. docs/ZASADY.md: dopisanie konwencji nazewnictwa wydan i commitow
   (jeden commit dokumentacyjny; zielone przez reczny dispatch builda).
4. F6 tworzy opis wydania 1.29.0 juz wg tego standardu.

## F1 — Kontrasty (K1): styles.ts, 9 poprawek kolorów

Nowa stała `ACCENT_BRIGHT = '#6b93ea'` (tekst/elementy akcentowe na tle
nieprzeczytanym; kontrast 3.79 na BG_UNREAD, minimum 3.0 dla elementów
graficznych).

1. `.arkmail-send` (ok. linii 406–413): background i border-color
   ACCENT → ACCENT_DEEP (biały na nim 5.74).
2. `.arkmail-send:hover` (414): #5a8ae6 → ACCENT_DEEPER (7.87); dodać
   border-color ACCENT_DEEPER (spójnie z btn-primary).
3. `.arkmail-btn-danger:hover` (97): #c2564d → #c04a40 (biały 4.89),
   tło i obramowanie.
4. `.arkmail-del:hover` (369): #c2564d → #c04a40 oraz dodać
   border-color #c04a40 (symetria z btn-danger — ustalenie D6).
5. `.arkmail-btn-action:hover` (91): color #6b93ea → #ffffff (8.85 na
   #454a58); border-color #6b93ea → ACCENT_SOFT (3.49, element
   graficzny); background zostaje #454a58 (token w F5).
6. `.arkmail-unread` (282): inset box-shadow ACCENT → ACCENT_BRIGHT.
7. `.arkmail-unread::before` (293): background kropki ACCENT →
   ACCENT_BRIGHT.
8. `.arkmail-tab-active` (145–148) i `:hover` (151): ACCENT →
   ACCENT_DEEP (tło i obramowanie; hover tła).
9. `.arkmail-box-active` (231–234) i `:hover` (237): ACCENT →
   ACCENT_DEEP.
10. `@keyframes arkmailFlash` (597–600): klatka 50% ACCENT →
    ACCENT_DEEP.

Po zmianach ACCENT (#4a7de0) pełni wyłącznie role elementów graficznych
(min. 3.18) oraz ACCENT_SOFT jako tekst — żadnego białego tekstu na
ACCENT. Minimum tekstowe 4.65 (FG_DIM/BG_RAISED).

Testy: nowy tests/contrast.test.ts (asercje ruleBody na wszystkie
powyższe reguły) plus aktualizacja tests/unreadAccent.test.ts (1
asercja: pasek nieprzeczytanego #4a7de0 → #6b93ea i komentarz
kontrastu; asercja obwodki box-attention ZOSTAJE #4a7de0 — zamknięty
wyjątek z F5). Czerwień weryfikowana lokalnie na starym kodzie przed
commitem.

## F2 — ASCII (K2): meta.ts, plugin.json, komentarze

Nowy test (np. tests/srcAscii.test.mjs): całe src/ bez znaków spoza
ASCII z białą listą wyłącznie U+2192 (strzałka echa komend).

Poprawki (21 linii, stan na 2026-11-05):

- meta.ts:14 i plugin.json:9: „listów" → „listow" (opisy wtyczki).
- Komentarze → ASCII, 19 linii w 7 plikach:
  index.ts (689, 715, 742, 743, 826, 1301, 1388, 2236),
  render.ts (1925, 2072, 2073), orphanPager.ts (6, 8),
  pager.ts (82, 83 — wielokropki), styles.ts (245 — znak ↻ zastąpiony
  opisem słownym, 279), letterRender.ts (214), store.ts (533).

Bez zmian (same dozwolone strzałki): dargothTransport.ts:177,
lines.ts:5 i :11, mailbox.ts:8, index.ts:2423.

Etykiety i komunikaty interfejsu są już w czystym ASCII — bez zmian.
Uwaga: plugin.json musi być zgodny z meta.ts (test wersji porównuje
oba źródła).

## F2b — Strażnik komunikatów commitów

Wzorzec: test straznika z obu repozytoriow arkszeptu (ostatnie commity
obu repo). Test czyta komunikat commita i weryfikuje konwencje z F0b:
jezyk polski, bez zargonu, bez jezyka angielskiego; identyfikatory
techniczne (nazwy plikow, symboli) dozwolone. Red lokalnie: test
importuje nieistniejacy jeszcze modul / fixture komunikatu z lamaniem
konwencji; potem implementacja straznika. Jeden commit (test + kod).

## F3 — ERROR_LABEL_MS (K3): render.ts

Stała `ERROR_LABEL_MS = 3000` zamiast 7 literałów: render.ts 613, 893,
959, 1225, 1513, 1543, 2742. Test (tests/errorLabelMs.test.mjs): stała
zdefiniowana dokładnie raz; poza nią pozostają wyłącznie GUARD_ARM_MS
(291) i timer flasha w index.ts (poza zakresem).

## F4 — Stałe magazynowe i deduplikacja (K4)

- mailbox.ts: eksport `LISTS_LOADING_RETRY_MS = 2000` (podmiana
  literalu w 169) oraz `DEFAULT_IDLE_FLUSH_MS = 600` (zamiast
  `?? 600` w 106).
- pager.ts: import obu stałych; podmiana `?? 600` (278), literalu 2000
  (491); nowa stała `CLOSE_GRACE_MS = 400` zamiast
  `Math.max(idleMs, 400)` (414).
- parser.ts: `SERVER_LISTING_LIMIT` (65) staje się eksportem.
- pagination.ts: komunikat luki (73) używa SERVER_LISTING_LIMIT
  zamiast literału 50.
- entryKey: definicja przeniesiona do mailbox.ts (właściciel typu
  MailboxEntry); import w pagination.ts i bulkDelete.ts (obecnie
  identyczne definicje w pagination.ts:45 i bulkDelete.ts:5).
- Test (tests/constants.test.mjs): eksporty istnieją, entryKey jedna
  definicja, brak zastąpionych literałów.

## F5 — System projektowy: styles.ts (D1, D3, D4, D5, D7, D9, S1, S2)

- Tokeny hover: `HOVER_BASE '#454a58'`, `HOVER_RESET '#2b2d34'`,
  `HOVER_DANGER '#c04a40'` zastępują literały (77, 91, 97, 107, 369).
- D1 rodzina mini (467–480): promień 4px → 6px; hover zmienia tło na
  HOVER_BASE zamiast wyłącznie obramowania; jawny wariant kompaktowy
  tieru action (komentarz).
- D3 jeden mechanizm disabled: usunąć override
  `.arkmail-deletion-delete:disabled` (452) i blok opacity 0.4
  (477–480); zostaje generyczne `button:disabled` (248–249).
- D4 dividery: `.arkmail-deletion-results` border-top (436) oraz
  `.arkmail-deletion-entry` border-bottom (442) BORDER → BG (jak
  pozostałe wiersze).
- D5 `.arkmail-archive-step` border-left (526): 4px → 3px (jak pasek
  zajętości, 157).
- D9 `.arkmail-archive-steps` gap (518): 18px → 10px.
- S1 focus-visible: outline 2px ACCENT_BRIGHT, offset 1px dla
  `.arkmail-root button:focus-visible`, `.arkmail-tab:focus-visible`,
  `.arkmail-box:focus-visible` i rodziny mini.
- S2 `.arkmail-root button:not([data-armed="1"]):active`:
  background HOVER_RESET.
- S3 (opcjonalnie): transition 100 ms (background-color, border-color,
  color) na `.arkmail-root button`.

Świadome wyjątki bez zmian: padding 18px `.arkmail-send` (408),
wcięcie `.arkmail-arch-occ-list` (506), promień 3px paska postępu
(182, 188), `.arkmail-box-attention` obramowanie ACCENT (240–243).

Testy: rozszerzenie tests/uiStyles.test.ts, około 14–16 asercji
(tokeny zamiast literałów, jedna reguła disabled, dividery BG,
accent width 3px, brak 4px i 18px, focus-visible, :active).

## F6 — Wydanie 1.29.0

1. Lokalnie: zmiana oczekiwanej wersji w tests/version.test.mjs
   (25–26: 1.28.0 → 1.29.0), weryfikacja czerwieni na starym kodzie.
2. meta.ts: PLUGIN_VERSION „1.28.0" → „1.29.0", PLUGIN_BUILD_DATE na
   datę wydania. plugin.json: oba pola wersji.
3. Pełny zestaw lokalnie na zielono (szacunek: około 820 testów).
4. Jeden commit, CI zielone.
5. Tag `v1.29.0`; release o nazwie „ArkMail v1.29.0", opis zwykłym
   językiem użytkownika wg standardu z F0b (jeden akapit, zakaz żargonu:
   bez numerów przebiegów CI, identyfikatorów commitów, haseł typu
   red→green, sha, znaczków).
6. Dokładnie jeden asset: `arkmail_1_29_0.zip` (wersjonowana nazwa —
   wymóg potoku publikacji).
7. Usunąć docs/PLAN-1.29.0.md (commit). Marketplace: poza zakresem.

## Definicja ukończenia

- Wszystkie fale F1–F6 wykonane, CI zielone na każdym kroku.
- Pełny zestaw testów zielony, `tsc --noEmit` czysty.
- Żadnych literałów kolorów poza tokenami; żadnego białego tekstu
  poniżej 4.5; elementy graficzne min. 3.0.
- src/ w czystym ASCII + U+2192 (test whitelist na zielono).
- Wydanie 1.29.0 opublikowane na GitHub (tag + release + asset);
  dokument planu usunięty z repo.
- Opisy wszystkich 43 istniejących release'ów zgodne ze standardem F0b;
  docs/ZASADY.md zawiera konwencję nazewnictwa wydań i commitów.
