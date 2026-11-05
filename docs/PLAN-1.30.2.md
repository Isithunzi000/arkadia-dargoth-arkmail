# PLAN 1.30.2 — ArkMail (naprawy poaudytowe)

Punkt wyjscia: main @ 17aea6d, macierz 841/841. Wersja docelowa: 1.30.2.
Zrodlo: pelny audyt UI po wydaniu 1.30.1 (znaleziska A1-A3, B, C1-C6, D, E, F).

## Etap 1 — A1: klawisz "Eksportuj ksiazke" + dziura w strazniku

- RED: twardy `nativeButtons.test.ts` — className przypiete do zmiennej
  przycisku (regex na `const <var> = doc.createElement('button')`, potem
  `<var>.className`), okno 14 linii liczone od className, nie od
  createElement. Na starym kodzie pokaze: `linia 2327: przycisk bez className`.
- Implementacja: `expBtn.className = 'popup-btn popup-btn--control
  popup-btn--solid'` (jedyny eksport akcji — solid jak eksport archiwum/listu;
  dopisek do komentarza).
- Zielony: macierz. Commit: `Etap 1: klawisz eksportu ksiazki na klasy natywne`.

## Etap 2 — A2: ghost w polu "Dodaj osobe" w Grupach

- RED: nowy test `ghostMemberAdd.test.ts` — montaz UI z pigulka Grupy,
  rozwiniencie grupy, asercja: `.arkmail-ghost-wrap` istnieje wewnatrz
  `.arkmail-group-members` i zawiera input. Na starym kodzie pada (wrap
  odlaczony).
- Implementacja: w renderGrupy przeniesc `attachGhost` po
  `members.appendChild(addMember)` (kolejnosc jak w Ksiazce, komentarz juz
  istnieje wzorcowo).
- Zielony: macierz. Commit: `Etap 2: ghost-podpowiedzi w polu dodawania
  czlonka grupy`.

## Etap 3 — A3: literowka + straznik ortograficzny

- RED: rozszerzenie `uiVocabulary.test.ts` o liste zakazanych literowek
  (start: `uswasz`), skan stringow UI render.ts. Pada na linii 2215.
- Implementacja: "uswasz" -> "usuniesz" w notce Aliasy.
- Zielony: macierz. Commit: `Etap 3: literowka w notce aliasow, straznik
  zgrzytow`.

## Etap 4 — B: martwy CSS i aliasy kolorow

- RED: test `deadCss.test.ts` — asercje negatywne na STYLES: brak
  `.arkmail-arch-expand`, `.arkmail-arch-occ`, `.arkmail-listy >
  .arkmail-book-filter` oraz brak aliasow `ACCENT_SOFT`, `ACCENT_DEEP`,
  `ACCENT_BRIGHT`, `HOVER_RESET` w definicjach. Pada na starym pliku.
- Implementacja: usuniecie 4 martwych selektorow (styles.ts:472-475, 183);
  kolaps aliasow na bezposrednie `var(--popup-...)` we wszystkich regula.
- Kontrola: `uiStyles.test.ts` i `specificity.test.ts` przechodza bez pinow
  aliasow (sprawdzic, czy piny je wolaja — jesli tak, aktualizacja pinow
  w tym samym commicie).
- Zielony: macierz. Commit: `Etap 4: martwe selektory i aliasy kolorow
  usuniete`.

## Etap 5 — C1: jednolity sygnal uzbrojenia dwukliku

- RED: test `armedGuard.test.ts` — pierwszy klik w "Usun" (listu), "Wyczysc
  zapisane dane", "Wyczysc" (compose), "Pobierz tresci do archiwum" ustawia
  `data-armed="1"`; ESC rozbraja kazde z tych uzbrojen. Na starym kodzie
  pada (brak atrybutu, ESC nie dziala na te cztery).
- Implementacja: migracja czterech miejsc na wspolny `guardDeleteButton`
  (etykiety uzbrojenia przez `armedLabel`, zachowanie "Przerwij" przy
  download bez zmian); jawny `title` przy tworzeniu klawisza, zeby
  rozbrojenie nie gubilo podpowiedzi (kolejnosc przed `fillButtonTitles`).
- Zielony: macierz. Commit: `Etap 5: wspolny guard dwukliku na wszystkich
  klawiszach`.

## Etap 6 — C2: hover mini-rodziny

- RED: pin w `specificity.test.ts` / `uiStyles.test.ts`: hover mini-rodziny
  ma `color: var(--popup-accent)` (nie `var(--popup-bg)`). Pada na starej
  wartosci.
- Implementacja: styles.ts:441 `color: ${ACCENT_FG}` -> kolor akcentu;
  border akcentowy zostaje.
- Uwaga: do weryfikacji wizualnej na kliencie (jasny motyw) po wydaniu —
  wpis na liste F.
- Zielony: macierz. Commit: `Etap 6: hover mini-rodziny w kolorze akcentu`.

## Etap 7 — C4 + C6: hr i disabled klawiszy natywnych

- RED: `uiStyles.test.ts` — dwa piny: (1) `.arkmail-root hr` ma `border-top`
  w BORDER i brak pelnego obramowania; (2) `.arkmail-root
  .popup-btn:disabled` ma obnizona nieprzezroczystosc. Padaja na starym
  STYLES.
- Implementacja: regula hr (border: none, border-top 1px BORDER, marginy
  skalowane); regula `.arkmail-root .popup-btn:disabled { opacity: .45;
  cursor: default; }` — plugin sam pilnuje stanu nieaktywnego, niezaleznie
  od motywu klienta.
- Zielony: macierz. Commit: `Etap 7: reguly hr i disabled dla klawiszy
  natywnych`.

## Etap 8 — C3: przypiety naglowek w Grupach

- RED: `groupHeaderPin.test.ts` — montaz z 30+ grupami: lista grup wewnatrz
  `.arkmail-list-scroll` z `data-pane-key`, rzad tworzenia grupy i filtr
  poza nim. Pada na starym ukladzie.
- Implementacja: renderGrupy — kontener `arkmail-list-scroll` (klucz
  `kontakty:grupy`) na liste grup, naglowek (blad + tworzenie + filtr) jak
  w Ksiazce; sekcja dostaje klase kolumnowa jak Ksiazka.
- Zielony: macierz (testy D3/zwijanie grup musza przejsc bez zmian).
  Commit: `Etap 8: naglowek Grup przypiety, scrolluje sie lista`.

## Etap 9 — C5: import pliku bez etykiety-klawisza

- RED: `importButton.test.ts` — "Importuj ksiazke" to `button` z klasami
  `popup-btn popup-btn--control` (nie `label`), input pliku poza nim, bez
  klasy `popup-btn` na labelu. Pada na starym ukladzie.
- Implementacja: normalny klawisz wywolujacy `input.click()` na niewidocznym
  inpucie (`display: none`, bez klas natywnych inputu — nie jest polem
  tekstowym); tryb dolacz/zastap zostaje jak jest; usuwa sie hack
  label-as-button.
- Zielony: macierz. Commit: `Etap 9: import ksiazki klawiszem, input pliku
  bez widoku`.

## Etap 10 — D: dostepnosc klikalnych wierszy i fokus checkboxow

- RED: `keyboardAccess.test.ts` — (1) imie kontaktu ma `role="button"`,
  `tabindex="0"` i Enter odpala skok; (2) wiersz listu i wiersz archiwum —
  to samo; (3) klik checkboxa w Ksiazce nie gubi fokusu po repaint. Pada na
  starym kodzie (3 asercje).
- Implementacja: wspolny helper `makeClickable(el, handler)` (role,
  tabindex, keydown Enter/Space, klik); zastosowanie w trzech miejscach;
  rozszerzenie `focusKeyOf` o atrybut checkboxow ksiazki/grup (np.
  `data-book-check="<name>"`, `data-member-check` — gdzie checkboxy
  istnieja) i przywracanie `checked` w `restoreView`; regula focus-visible
  dla rol (obwodka jak przy klawiszach).
- Zielony: macierz. Commit: `Etap 10: wiersze klikalne z klawiatury, fokus
  checkboxow`.

## Etap 11 — E: porzadki bez zmian zachowania

- Zakres: wciecia `nativeFieldClass` (~10 miejsc) do poziomu otoczenia;
  osobna stala `ARM_MS` zamiast uzycia `ERROR_LABEL_MS` jako czasu
  uzbrojenia (w czterech miejscach po Etapie 5); komentarz w
  `nativeButtons.test.ts` bez wzmianki o `arkmail-arch-people-toggle`;
  usuniecie zdublowanego fragmentu komentarza render.ts:2729.
- Testy: bez nowych; macierz musi zostac zielona (kontrola regresji).
  Commit: `Etap 11: porzadki formatowania i komentarzy`.

## Etap 12 — pieczec 1.30.2

- RED: `version.test.mjs` przypina 1.30.2 (strategia jak przy 1.30.1: guard
  RED na starym meta).
- `meta.ts` + `plugin.json` -> 1.30.2, `node scripts/release.mjs`, pelna
  macierz, commit ze zipem, tag `v1.30.2`, wydanie "ArkMail v1.30.2",
  dispatch `release-asset.yml`. Bez marketplace.
- Usuniecie `docs/PLAN-1.30.2.md` w ostatnim commicie (konwencja repo-first).
- Commit: `Etap 12: pieczec wersji 1.30.2`.

## Lista F — weryfikacja po wydaniu (po stronie uzytkownika, nie da sie z kodu)

1. Kolor hover mini-rodziny (Etap 6) w jasnym motywie klienta.
2. Wyglad disabled na klawiszach natywnych (Etap 7) w obu motywach.
3. Widget importu pliku po Etapie 9.
4. Padding ghosta 9px vs. realny input klienta (bez popups.css w repo nie
   do potwierdzenia).
5. Otwarty punkt 1.30.1: obcinanie tekstu przy lewej krawedzi Listy.

## Ustalenia proceduralne

- Kazdy etap: RED dowiedzione lokalnie (nigdy przez CI), potem
  implementacja, pelna macierz `node --test --test-concurrency=1`, commit
  przez Git Data API z weryfikacja sha256 per blob, komunikat polski ASCII
  <=100 znakow, bez zargonu.
- Etapy wykonywane falami na zielone swiatlo.
- Plan zapisany do docs/PLAN-1.30.2.md w repo (konwencja repo-first),
  usuwany po 100% wykonania.
- Zadnych publikacji poza GitHub (repo prywatne), zero danych wrazliwych i
  wulgarnych slow w repozytorium.
