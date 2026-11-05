# Plan wydania 1.30.0 — Kontakty, Archiwum i natywny wygląd okna

Plan zatwierdzony przez właściciela 2026-11-05. Zakres: zgłoszenia z
zakładek Kontakty (K1–K8) i Archiwum (A1–A3) oraz pełna migracja
warstwy wizualnej na zmienne i klasy natywne klienta Dargoth.
Bez półśrodków: własna paleta kolorów znika całkowicie.

Zasady wykonania: test pisany przed poprawką, dowód RED sprawdzany
lokalnie na starym kodzie, test i poprawka w jednym commicie, CI widzi
wyłącznie zielone przebiegi. Stringi UI bez ogonków, ASCII z białą
listą U+2192 w src/.

## F1 — Adresat grupowy i aliasy (bug na linie)

- K4: `partyLabel` składa listę odbiorców przecinkami (`A, B, C`),
  bez spójnika „i”. Walidator odrzuca segmenty zawierające wolne
  słowo „i” (komunikat wskazuje przecinki). Potwierdzone w kodzie:
  pipeline rozbija odbiorców wyłącznie po przecinkach, a pole adresata
  leci do gry surowo. `docs/PROTOCOL.md` doprecyzowany: format „ i ”
  dotyczy wyłącznie parsowania listingów, nie linii do gry.
- K5: notka w sekcji aliasów mówi, że aliasy edytuje się i usuwa
  w grze (dotychczas tylko usuwanie).
- K6: klawisz „Napisz” przy każdym aliasie — otwiera zakładkę Napisz
  z aliasem jako adresatem (serwer sam rozwija aliasy przy wysyłce).

## F2 — Kontakty: struktura

- K3: licznik książki nad listą („N imion”; przy aktywnym filtrze
  „widoczne: X z N”).
- K7: wszystkie klawisze importowania i dodawania w sekcji
  Import-Eksport: import zapamiętanych, import przedstawionych, import
  aliasów, dodawanie imienia, tworzenie grupy. Książka i Grupy
  zostają listami.
- K8: filtry książki i grup z podpowiedziami (ghost): książka —
  osoby i aliasy, grupy — nazwy grup.

## F3 — Archiwum: układ

- A1/A2: panel „Osoby z listow” domyślnie zwinięty (jedna linia).
  Skok z osoby przewija okno tak, że lista listów jest od razu
  widoczna. Rozwinięta lista osób ma własny obszar przewijania
  z ograniczoną wysokością (wzór użyty wcześniej w Książce).

## F4 — Natywny wygląd okna (pełna migracja) + K1 + K2

- styles.ts przepisany na zmienne klienta: kolory wyłącznie
  `var(--popup-…)`, zero własnych wartości hex. Wiersz nieprzeczytany:
  delikatne tło akcentu i wewnętrzny pasek akcentu. Pulsowanie
  zakładek po odłożeniu listu na zmiennych akcentu.
- Kontrolki z klas klienta: przyciski `popup-btn popup-btn--control`
  z wariantami (główna akcja — wypełniona, kasowanie — danger,
  ikona — mały kwadratowy sam znaczek), pola `popup-input
  popup-input--control`, zakładki `dialog-tabs`. Plugin zostaje przy
  czystym DOM, bez własnego Reacta.
- K1: klawisz × w wierszach książki i przy członkach grup mały,
  kwadratowy, bez wypełnienia — czerwień tylko w obwódce i znaczku;
  wypełnienie pojawia się na wskazaniu i uzbrojeniu.
- K2: stan uzbrojony strażnika usuwania widoczny: jaśniejsze tło,
  grubsza jaśniejsza obwódka; tam gdzie się mieści, etykieta zmienia
  się w pytanie o potwierdzenie. Klawisz ikony bez etykiety różni się
  wyglądem, nie tekstem.
- Strażnicy testowi przepięci na nowy kontrakt: brak gołych hex w
  STYLES, kolory tylko ze zmiennych, klasy natywne per kontrolka.
- Reguły układu (siatki, przewijanie, ghost, podział szeroki) bez
  zmian. Skalowanie czcionką okna bez zmian.

## F5 — Pieczęć i wydanie

Podbitka wersji do 1.30.0, paczka zip przez skrypt wydania, tag
v1.30.0, wydanie GitHub „ArkMail v1.30.0” z jednym assettem
`arkmail_1_30_0.zip`, workflow dołączający paczkę. Publikacja na
marketplace poza zakresem — wyłącznie na jednorazowy rozkaz właściciela.

## Odstępstwa świadome (nie ruszać w tej wersji)

- Literał 3000 w timerze flasha w index.ts (poza zakresem).
- Piksele w calc() ze skalowaniem czcionki (zgodne z dokumentacją
  klienta).
- Strzałki echa U+2192 w pięciu plikach (biała lista strażnika ASCII).
