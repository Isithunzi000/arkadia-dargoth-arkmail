# Protokół poczty Arkadii — specyfikacja dla ArkMail (i przyszłych portów)

Źródła prawdy: prawdziwe logi gry (`tests/fixtures/*.json`, sesje 2025-12 → 2026-10),
`arkadia.rpg.pl/help/command/*`, wiki `Poczta`, kod klienta Dargoth (`poczta.ts`,
`letter.ts` — MIT). Każda reguła poniżej jest przypięta testem do fixture'a.

## Warstwy protokołu

1. **Komendy globalne** — działają wszędzie: `listy [skrzynka] [filtry]`,
   `napisz list`, `przeczytaj list N` / `list N`, `doslij`, `aliasy pocztowe`,
   `poczta`, `wyslij zwierze`, `opcje poczta wlacz|wylacz`.
2. **Pager** — po `przeczytaj list N` serwer wchodzi w tryb pagera:
   prompt `[1-50 adefFhHmnqrsRux.!?-+<>] (aktualny: N) -- ` konsumuje
   WSZYSTKIE linie wejścia gracza aż do `q`. Tu żyją: usuwanie (`d`),
   oznaczanie (`-`/`+`), forward (`f`/`F`), doslij (`a`), notatki (`n`),
   nawigacja (`<`/`>`/numer). **Blokuje linię komend — stąd efemeryczne
   sesje pagerowe w ArkMail (otwórz → akcja → `q`, ~1 s).**
3. **Edytor** — po `napisz list` (i promptach adresat/temat/DW) serwer
   wchodzi w tryb edytora: każda linia to treść listu, `**` kończy,
   `~?` pomoc, `~q` porzuca, `~l` lista linii, `~dw`/`~udw` CC/BCC.

## Klasy gmcp_msgs

Linie pocztowe przychodzą z klasami: `mail` (listingi, listy, pager),
`editor.mail` (edytor, numeracja linii), `notification.mail` (nowa poczta).
Część komunikatów ma klasę `other` (`Goniec przyniosl...`, `Wysylasz ...`).
Klasa jest wskazówką, NIE gwarancją — parser rozpoznaje po treści.

**Uwaga na prefix klienta:** klient Dargoth dokleja `[ POCZTA ] ` do linii
`Masz nowa poczte od X.` (newMail.ts). Logi zapisują tekst PO triggerach.
Parser zawsze najpierw robi `stripClientPrefix`.

## Listing (`listy [skrzynka]`)

```
Listy odebrane:                                  <- naglowek, wariant bez suffixu
Listy wyslane (prezentowane jest pierwsze 50):   <- wariant uciety do 50
 3. *R* Temat: Elementy rozbitego szkielka       <- wpis: numer desc, *R* = przeczytany
Nadawca: Foo                        N, 21 XII 2025, 01:15:04
 2. Temat: Opowiesci...                          <- brak *R* = nieprzeczytany
Odbiorcy: Xyzzy                N, 21 XII 2025, 00:31:18   <- wyslane/niewyslane
 2. Temat: zalakowany pergamin (forwardowany)    <- suffix dla forwardowanych
```

- Numery malejąco (najnowszy najpierw), zakres 1..50.
- `*R*` występuje tylko przy przeczytanych (na `nieprzeczytane` brak).
- Strona `Nadawca:` (odebrane/nieprzeczytane) lub `Odbiorcy:`/`Odbiorca:`
  (wysłane/niewysłane); data oddzielona 2+ spacjami, może jej nie być.
- Data: `<DzienTygodnia>, <d> <MiesiacRzymski> <rrrr>, <gg:mm:ss>`
  (np. `Wt, 23 XII 2025, 00:11:12`).

### Warianty puste

```
Nie masz zadnych nieprzeczytanych listow.              <- skrzynka pusta
Nie masz zadnych niewyslanych listow.
Nie znaleziono zadnych takich wyslanych listow.        <- filtr bez trafien
```

## List (`przeczytaj list N`)

```
List : 1
Od   : Corge
Temat: --
Do   : Gracz i Baz
Data : Wt, 23 XII 2025, 00:11:12
<tresc, dowolne linie, w tym ramki rysowane przez gre>
[1-3 adefFhHmnqrsRux.!?-+<>] (aktualny: 1) --          <- pager prompt
```

Opcjonalny nagłówek `DW   : ...`. Treść kończy się pager promptem.

## Pager

- Prompt: `[<lo>-<hi> <dostepne-komendy>] (aktualny: <n>) -- ` (spacja na końcu).
- `d [zakres]` → `Zaznaczono do skasowania: 1.`; fizyczne kasowanie przy `q`:
  `Kasuje listy...` / `Kasuje: 1.`
- `f <imie>` → subdialog `DW: ` — konsumuje WSZYSTKIE linie aż do pustej;
  błędny adresat: `Nie ma takiego adresata (gracza, aliasu): <x>.` (lowercase!)
  i prompt `DW: ` wraca. Sukces: `List jest gotowy do wyslania.` i powrót pagera.
- Błędy: `Zly numer listu: 4.`, `Zadne listy nie zostaly wybrane.`

## Compose (`napisz list`)

Przy pipeliningu (wszystkie odpowiedzi naraz) serwer echa promptów skleja:

```
→ napisz list
→ Garply
→ Perly
Adresat: Temat: DW:              <- sklejone echo (mail)
→ <linie listu, z ramka jesli szablon>
→ **
Wpisz ~?, zeby uzyskac pomoc, lub **, by zakonczyc edycje.   (editor.mail)
 1] 2] 3] ...                    <- echo numeracji, moze byc sklejone
 14]15]16]...List zostal pomyslnie wyslany.    <- wynik moze byc sklejony z numeracja
```

Wyniki: `List zostal pomyslnie wyslany.` (urząd pocztowy) albo
`List jest gotowy do wyslania.` (poza urzędem → kolejka `niewyslane`;
fizyczna wysyłka na poczcie lub `wyslij zwierze`).

Błąd adresata na starcie: `Adresat: Nie ma takiego adresata (gracza, aliasu): thud.`
— compose przerywa się, wraca zwykły prompt `> `.

## Aliasy pocztowe

```
Posiadasz nastepujace zdefiniowane aliasy pocztowe:
	poltorak: Bar
```

Wpis: tab, nazwa, dwukropek, rozwiniecie (możliwe wiele celów — parsowane
po przecinku). ArkMail aliasów NIE tworzy — tylko odczyt i użycie.

## Powiadomienia

```
Masz nowa poczte od Foo.         (notification.mail; imię w dopełniaczu)
Goniec przyniosl nowa partie listow. (other)
Wysylasz Kruk na poczte.           (other; też "Wysylasz Kruka...")
```

GMCP: moduł `Mail 1`, pakiet `mail.state` = `{unread, unreceived, unsent}`
(auto-push po zmianie). Klient Dargoth ma chip w stopce na tym stanie.

## Przedstawieni / zapamietani (baza kontaktów)

```
[28] Osoby, ktore zostaly ci ostatnio przedstawione, to Foo, Quux, ..., Zonk i Waldo.
```

Licznik w nawiasie kwadratowym, imiona po przecinku, ostatni separator ` i `.

## Limit 50 i archiwum

Serwer pokazuje max 50 najnowszych (`prezentowane jest pierwsze 50`).
Starsze: `listy <skrzynka> przed <data>` — ArkMail paginuje wstecz
i buduje lokalne archiwum (IndexedDB) poza limitem.

## Reguły dla portów (WWW / Mudlet)

- Klasy gmcp_msgs na oficjalnym kliencie WWW są jedynym źródłem tekstu —
  tam klasyfikacja jest ŁATWIEJSZA (linie przychodzą już otagowane).
- Regexy są PCRE-zgodne (Mudlet) — bez lookbehind, bez flag specyficznych
  dla JS poza case-insensitive tam, gdzie zaznaczono.
- Golden fixtures (`tests/fixtures/*.json`) są formatowo neutralne:
  `{cls, text}` — te same pliki zasilają testy TS i testy Lua.
