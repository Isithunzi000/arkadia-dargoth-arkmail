# Naprawa pobierania poczty 1.30.9

## Ustalenia

Baza: release 1.30.8, commit `c9d4906c55be72f9509f061eed83cc71e61b2dc5`.
Zatwierdzony plan zapisano commitem `bc4569273855a6d47aeae3f0232282b363ec2181`.

Kontrolowane A/B uruchomiono na paczkach 1.30.5, 1.30.6 i 1.30.8 z identyczna,
syntetyczna odpowiedzia: naglowek listingu odebranych, jeden kompletny wpis,
linia nadawcy i brak promptu.

- 1.30.5 zwrocila liste z jednym wpisem i pozwolila na kolejne pobranie.
- 1.30.6 odrzucila listing jako `timeout`, a kolejna operacje jako
  `operacja anulowana`.
- 1.30.8 zachowala sie tak samo jak 1.30.6.

To dowodzi regresji w odtworzonym scenariuszu. Nie jest to dowod, ze kazda
awaria w realnej grze ma te sama przyczyne.

## Dowod RED przed implementacja

Na niezmienionym kodzie 1.30.8 dodano testy i uruchomiono je lokalnie:

- `mailboxNoPrompt.test.ts`: 0/3 zielone; listing pozostawal nierozstrzygniety,
  odswiezenie nie konczylo sie, indeksacja nie przechodzila do kolejnej skrzynki.
- `deletionFlow.test.ts`, nowy scenariusz odswiezenia bez promptu: RED;
  wynik nie pojawial sie w zakladce usuwania.

Dopiero po tych wynikach zmieniono implementacje.

## Zasada poprawki

Prompt albo echo przed limitem ciszy zwraca listing potwierdzony. Po ciszy
poprawny listing wraca jako `confirmed: false` i zwalnia sesje. Nie jest to
pelna prawda o skrzynce.

Wynik niepotwierdzony jest pokazywany i scalany z archiwum. Nie zastepuje
archiwum, nie uruchamia usuwania zakresowego, nie zdejmuje luk i nie ustawia
metadanych kompletnej indeksacji. Skan stron zapisuje pobrane wpisy, konczy
skrzynke jako niekompletna i przechodzi do kolejnej.

Zachowane zostaly: pojedyncza aktywna sesja, ochrona przed odpowiedzia innej
skrzynki, brak automatycznego `q` dla nieznanego pagera, pelny timeout przy
braku poprawnej odpowiedzi oraz recovery do zwyklego promptu.

## Zakres

Zmiany obejmuja wspolna sesje listingu, zastosowanie wyniku, skan stron,
testy i dokumentacje. Nie zmieniano UI, motywow, odpowiedzi wszystkim,
compose, edytora, eksportu, kontaktow, aliasow, grup, dat, formatu IndexedDB
ani zrodel klienta Dargoth.
