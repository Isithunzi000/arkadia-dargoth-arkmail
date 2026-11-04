# PLAN — uwagi z testu live (2026-11-05)

Zatwierdzony plan prac nad zakladkami Kontakty i Archiwum + wydanie 1.28.0.
Dokument znika po wykonaniu 100% (konwencja repo-first).

## Zrodlo

Obserwacje z testu live wersji 1.27.1 (zakladka Kontakty: 17 punktow,
zakladka Archiwum: 3 punkty, uwagi o wydaniach). Kazdy punkt zweryfikowany
w kodzie main (HEAD f29bdd14f8) przed ulozeniem planu.

## Decyzje (zatwierdzone przez ownera 2026-11-05)

- D1: ghost w polu "Imie nowej osoby" ORAZ osobne pole filtra nad lista
  ksiazki z klawiszem "Wyczysc filtr".
- D2: 4 sub-pigulki w Kontaktach: Ksiazka adresowa / Aliasy Pocztowe /
  Grupy / Import-Eksport. Eksport/import przeniesione z sekcji Grupy.
- D3: grupy jako wiersze zwijane (naglowek: nazwa + liczba czlonkow +
  znak stanu ASCII: ">" zwiniety, "v" rozwiniety). Domyslnie zwiniete.
- D4: czyszczenie lokalnego lustra aliasow (klawisz w sekcji Aliasy
  Pocztowe; zapis pustej listy; kontakty przebudowane).
- D5: jeden klawisz "Wyczysc cala ksiazke" w sekcji Import-Eksport:
  imiona + grupy + aliasy; guard dwuklikowy; tooltip enumeruje zakres.
- D6: "Dopisz wszystkie osoby z listow" — klawisz aktywny tylko gdy baza
  istnieje (contacts.length > 0); dedup przez unionPeople; bez guarda
  (operacja tylko doklejajaca); komunikat z liczba nowych osob.
- D7: konwencja guardow (ponizej).
- D8: "Wyczysc filtry" w Archiwum czysci wszystkie filtry w zakresie
  widoku, lacznie z filtrem I SORTOWANIEM panelu "Osoby z listow"
  (contactView.filter + contactView.sort -> domyslne "Nazwa A-Z").
- D9: staly naglowek tylko w Ksiazce (sub-pigulki + import + pole
  dodawania + klawisze zbiorcze widoczne; scrolluje sie lista).
  Wzorzec: zakladka Listy (.arkmail-listy + .arkmail-list-scroll).

## Konwencja guardow (D7) — jedna, dla wszystkich klawiszy usuwajacych

1. Klawisze usuwajace: klasa arkmail-btn-danger.
2. Klawisze z napisem: dwuklik z wygasnieciem 3 s; pierwszy klik:
   etykieta "Na pewno usunac?"; drugi kasuje.
3. Klawisze X: dwuklik z wygasnieciem 3 s; po pierwszym kliku czerwone
   tlo (nowa regula CSS [data-armed="1"]) + tooltip "Kliknij ponownie,
   aby usunac".
4. ESC rozbraja wszystkie uzbrojenia w oknie (rejestr uzbrojen na
   poziomie modulu render; istniejacy listener ESC rozszerzony).

## Pakiety (kazdy: RED na CI -> implementacja -> pelna zielen CI -> commit)

- K1: kolorystyka i guardy usuwania (X ksiazki i grup dwuklikowe +
  czerwone; "Usun zaznaczone imiona", "Usun grupe", "Usun wszystkie
  grupy" w btn-danger; ESC rozbraja).
- K2: "Zaznacz wszystkie" / "Odznacz wszystkie" w Ksiazce (operuja na
  widocznych po filtrze).
- K3: struktura sekcji Kontaktow: 4 sub-pigulki; aliasy jako osobna
  sekcja; "Wyczysc aliasy" (guard); "Wyczysc cala ksiazke" (guard);
  "Dopisz wszystkie osoby z listow".
- K4: ghost w polu nowej osoby; filtr listy ksiazki + "Wyczysc filtr";
  filtr grup po nazwie.
- K5: grupy zwijane (D3); staly naglowek Ksiazki (D9).
- K6: Archiwum: usuniety dolny klawisz indeksacji z panelu osob (gorny
  z kroku 1 zostaje); znak stanu rozwiniencia na "Osoby z listow";
  "Wyczysc filtry" czysci tez filtr i sortowanie panelu osob (D8).
- K7: komunikaty: eksport ksiazki na handler (notify + status);
  ujednolicony komunikat kazdej operacji zbiorczej (status + toast).
- K8: wydanie 1.28.0 (RED podbitki -> release.mjs -> GREEN -> tag ->
  release "ArkMail 1.28.0" + asset) + rename release 1.26.0
  ("ArkMail 1.26.0", krotki opis).

## Protokol

- Red->green: dowod RED = log runa na GitHub CI. Lokalnie tylko tsc
  --noEmit + szybkie testy jednostkowe.
- Po kazdym commicie weryfikacja: sha + message + tree 1:1. Bez
  force-push. Po kazdym pushu czekamy na konkluzje CI przed nastepnym
  krokiem.
- Strażniki: uiStrings/uiVocabulary (ASCII, slownictwo), repo-hygiene,
  noSensitiveNames, version/nodeRuntime.
- Zero kontaktu z marketplace. Wydanie konczy sie na GitHub Release.

## Testy planowo pękające w RED

- K1: buttonTiers (+ nowe asercje guardow X).
- K2: bookView.
- K3: groupsView (przeniesienie eksportu), nowy plik sub-pigulek.
- K4: bookView + ghost.
- K5: groupsView (zwijanie), listScroll.
- K6: archPeople (naglowek z znakiem stanu; brak dolnego indeksu),
  clearFilters (sortowanie panelu osob).
- K7: handler eksportu ksiazki.
- K8: version.test.mjs (pin 1.28.0).

## Świadome niedociągnięcia

- Sortowanie listy listow archiwum NIE jest czyszczone przez "Wyczysc
  filtry" (zakres: panel osob + filtry archiwum).
- Po wyczyszczeniu aliasow sekcja pokazuje notke "Brak aliasow — aliasy
  pobiera sie z gry".
