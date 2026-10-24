# ArkMail

Poczta Arkadii w oknie klienta Dargoth.

## Instalacja

W kliencie Dargoth dodaj wtyczkę z adresu:

```
https://isithunzi000.github.io/arkadia-dargoth-arkmail/arkmail.js
```

## Co potrafi

- czytanie i pisanie listów we wszystkich skrzynkach (odebrane,
  nieprzeczytane, wysłane, niewysłane)
- wczytywanie starszych listów — skrzynka nie kończy się na 50
- szukanie po osobie, temacie i dacie
- usuwanie i przekazywanie listów
- kontakty z licznikami listów
- archiwum per postać: filtry, zapis treści, eksport do TXT i ZIP
- powiadomienia o nowej poczcie (opcjonalne)

## Użycie

`/arkmail` — otwiera i zamyka okno. Reszta to przyciski w oknie.

## Dla developerów

Do pracy nad wtyczką wymagany jest Node 24 lub nowszy.

```bash
npm ci
npm test
```

Specyfikacja protokołu: `docs/PROTOCOL.md`. Renderer listów to port 1:1
z oficjalnego klienta WWW Arkadii (licencja MIT, https://arkadia.rpg.pl).
