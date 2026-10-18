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

## Szukanie po stronie serwera (`?listy`)

Pelna skladnia z pomocy w grze (`?listy`, przechwycona 2026-04):

```
listy [nieprzeczytane/otrzymane/wyslane/niewyslane]
      [do kogo] [od kogo]
      [dzis|wczoraj|przedwczoraj | dnia data | przed data | po data]
      [o temacie temat] [o tresci tresc]
```

- Argumenty mozna **dowolnie laczyc**, ale `o temacie` / `o tresci` zawsze
  jako **ostatni** z nich (serwer parsuje reszte linii jako wartosc).
- Za kazdym razem zwracane jest **do 50 najnowszych** pasujacych listow.
- `data` = `<d> <miesiac rzymski> <yyyy>` (np. `7 III 2002`); serwer waliduje
  kalendarz (30 II odrzuci).
- Pomoc mowi `otrzymane`, ale `odebrane` tez dziala (zweryfikowane w logach);
  ArkMail uzywa nazw skrzynek `odebrane|wyslane|niewyslane|nieprzeczytane`.
- `do [kogo]` = adresat (skrzynki wyslane/niewyslane), `od [kogo]` = nadawca
  (odebrane/nieprzeczytane). Serwer i tak akceptuje obie formy, ArkMail
  dobiera wlasciwa po skrzynce.
- Przyklady z pomocy (kanoniczne):
  `listy wyslane do alvina przed 7 III 2002 o temacie pomoc`,
  `listy otrzymane od alvina po 28 V 2005`.

### Semantyka granic dat (zweryfikowane w logach)

- `przed <data>` jest **dzienno-granularne i WYLACZNE**: list z dnia
  granicznego NIE wchodzi w wynik. Wlaczny koniec zakresu w UI
  realizujemy wysylajac `przed <dzien po>` (ArkMail liczy kolejny dzien
  kalendarzowo — funkcja `nextDay`).
- `po <data>` ArkMail wysyla **doslownie** (bez przesuniecia) — semantyka
  wlaczna/wylaczna tej granicy: **do weryfikacji w grze**.
- `dzis|wczoraj|przedwczoraj` i `dnia <data>` sa alternatywa dla pary
  `po`/`przed` — ArkMail uzywa wylacznie `po`/`przed` (deterministyczne).

### Wynik szukania

```
**Wybrane listy** odebrane:          <- naglowek przefiltrowanego listingu
 1. *R* Temat: ...                   <- wpisy PRZENUMEROWANE od 1
```

- Naglowek to `**Wybrane listy** <skrzynka>` (+ suffix odcinajacy, odmienia
  sie z liczba — dopasowujemy luzno, `pierwsz`).
- Numery sa **renumerowane** w kontekscie wyniku — NIE odnosza sie do
  numerow pelnego listingu. Dlatego wyniki szukania w ArkMail nie maja
  paginacji ani wczytywania starszych; otwarcie listu dziala w kontekscie
  ostatniego (przefiltrowanego) listingu.

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

Opcjonalny nagłówek `DW   : ...`. Nagłówek `Do   :` BYWA PUSTY (list do
siebie wysłany z samym DW — log 2026-10-18). List wysłany z DW ląduje
u odbiorców DW w odebranych (Od: nadawca, Do: ktoś inny, DW: my).
Treść kończy się pager promptem.

## Pager

- Prompt: `[<lo>-<hi> <dostepne-komendy>] (aktualny: <n>) -- ` (spacja na końcu).
- `d [zakres]` → `Zaznaczono do skasowania: 1.`; fizyczne kasowanie przy `q`:
  `Kasuje listy...` / `Kasuje: 1.`
- `f <imie>` → subdialog `DW: ` — konsumuje WSZYSTKIE linie aż do pustej;
  błędny adresat: `Nie ma takiego adresata (gracza, aliasu): <x>.` (lowercase!)
  i prompt `DW: ` wraca. Sukces: `List jest gotowy do wyslania.` i powrót pagera.
- Błędy: `Zly numer listu: 4.`, `Zadne listy nie zostaly wybrane.`

### Pelna pomoc pagera (`?` w trakcie czytania, log 2026-10-18)

Serwer nazywa pager **"edytorem poczty"** (naglowek pomocy: "Komendy
dostepne w edytorze poczty"). Komplet komend:

```
x lub q     wyjscie z pagera
h [<kogo>]  naglowki wszystkich listow / listow od <kogo> (dopelniacz!)
H [<kogo>]  naglowki nieprzeczytanych / od <kogo>
r [<num>]   odpowiedz na aktualny list [lub <num>]
R [<num>]   odpowiedz z cytowaniem tresci
m           nowy list
f/F [<num>] <imie>   forward (F: z edycja)
d/u [<przedzial>]    zaznacz/odznacz do skasowania (przedzial np. "1,9,5-7")
-/+ [<przedzial>]    oznacz nieprzeczytany / przeczytany
a <imie>    doslij ostatnio wyslany list
e           skasuj WSZYSTKIE zaznaczone
.           pokaz aktualny list
<num>       pokaz list <num>
<           poprzedni list
> lub ENTER nastepny list (pusta linia = nastepny; log 2026-10-18)
n [<num>]   zapisz tresc jako notatke
!<komenda>  wykonaj komende spoza pagera (dziala nawet w trakcie pisania)
?           ta pomoc
```

- Prompt zawiera litere **`s`, ktorej pomoc nie dokumentuje** —
  nieudokumentowane, nie uzywac.
- Po potwierdzeniach akcji (`d`, ...) serwer WRACA do promptu pagera —
  sesja ArkMail wysyla `q` dopiero na powrocie promptu, nie na samej
  linii potwierdzenia.
- Kontekst numerow: `przeczytaj list N` i komendy pagerowe rozumieja N
  wzgledem OSTATNIEGO listingu (`listy ...`); kazdy listing (pelny,
  stronicowany, filtrowany) ma wlasna numeracje 1..N (1 = najnowszy
  z selekcji). ArkMail pokazuje graczowi wlasne numery ciagle, a przed
  operacja pagerowa re-kotwiczy wpis na swiezym listingu po dacie
  (Fala 9a).

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
Starsze: `listy <skrzynka> przed <d> <miesiac rzymski> <yyyy>`
(zweryfikowane w logach: `listy wyslane przed 9 iii 2026`) — ArkMail
paginuje wstecz i buduje lokalne archiwum poza limitem.
Trwalosc: localStorage per postac (`arkmail.<postac>.<klucz>`) — listy
to krotkie teksty, limit ~5 MB wystarcza na tysiace; IndexedDB
swiadomie odlozone (prostszy kontrakt, w pelni testowalny).

## Reguły dla portów (WWW / Mudlet)

- Klasy gmcp_msgs na oficjalnym kliencie WWW są jedynym źródłem tekstu —
  tam klasyfikacja jest ŁATWIEJSZA (linie przychodzą już otagowane).
- Regexy są PCRE-zgodne (Mudlet) — bez lookbehind, bez flag specyficznych
  dla JS poza case-insensitive tam, gdzie zaznaczono.
- Golden fixtures (`tests/fixtures/*.json`) są formatowo neutralne:
  `{cls, text}` — te same pliki zasilają testy TS i testy Lua.
