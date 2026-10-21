/**
 * Podejrzenie sierocego pagera (Fala 24g).
 *
 * Sierocy pager (otwarty na serwerze po awarii NASZEJ sesji) konsumuje
 * wszystkie komendy gracza az do "q" - straznik w index.ts zamyka go
 * automatycznie. Ale prompt pagera serwera jest NIEROZRÓŻNIALNY od
 * promptu trybu czytania poczty, ktory gracz otworzyl recznie
 * ("[1-50 ...] (aktualny: N) -- "), wiec straznik NIE MOŻE strzelac
 * na sam widok promptu (Fala 11g zabijala reczne sesje gracza - log
 * 2026-10-21: "d" ladowalo jako ruch na dol, "?" dawalo pomoc gry
 * zamiast pomocy edytora poczty).
 *
 * Rozwiazanie: straznik reaguje tylko na POZYTYWNE podejrzenie - flage
 * stawiaja wylacznie wlasne sesje, ktore zakonczyly sie awaryjnie
 * z potencjalnie otwartym pagerem (timeout sesji pagerowej, sierocy
 * pager przetrwaly "q" w fetchu). Flage zdejmuje:
 * - kazda UDANA transakcja (listing/odczyt doszedl = komendy dochodza,
 *   sieroty nie ma),
 * - echo komendy gracza wchodzacej w tryb poczty (jego sesja jest
 *   legalna; gdyby sierota istniala, straznik i tak domknie ja przy
 *   najblizszym fetchu - mechanizm 17a w mailbox.ts),
 * - wyslanie "q" przez straznika ("q" to komenda-wyjscie pagera -
 *   po niej sieroty juz nie ma).
 *
 * Stan w RAM (podejrzenie dotyczy biezacej sesji serwera), bez storage.
 */

let suspected = false;

/** Stawia podejrzenie: awaryjny koniec wlasnej sesji z pagera na serwerze. */
export function suspectPagerOrphan(): void {
  suspected = true;
}

/** Zdejmuje podejrzenie (udana transakcja / sesja gracza / q straznika). */
export function clearPagerOrphan(): void {
  suspected = false;
}

/** Czy straznik ma pozytywne podejrzenie sierocego pagera. */
export function isPagerOrphanSuspected(): boolean {
  return suspected;
}
