/**
 * Podejrzenie wlasnego sierocego pagera, ograniczone do generacji polaczenia.
 *
 * Flage stawia wylacznie wlasna sesja po potwierdzonej odpowiedzi pagera,
 * gdy zakonczenie nie dowiodlo powrotu do zwyklego promptu. Sam prompt pagera
 * poza operacja nigdy nie uruchamia automatycznego "q": moze nalezec do gracza.
 *
 * Podejrzenie konsumuje lokalna sesja Mailbox/Pager. Moze ona wyslac jedno
 * "q", poczekac na zwykly prompt i ponowic operacje raz. Sama cisza ani
 * wyslanie "q" nie potwierdzaja zamkniecia. Stan zdejmuje udana transakcja,
 * zwykly prompt, przejecie poczty przez gracza albo zmiana generacji.
 *
 * Stan jest wylacznie w RAM i nie trafia do storage.
 */

/** null = stan bez przypisanej generacji, uzywany przez jawne wywolania globalne. */
let suspectedGeneration: number | null | undefined;

/** Stawia podejrzenie: awaryjny koniec wlasnej sesji z pagera na serwerze. */
export function suspectPagerOrphan(generation?: number): void {
  suspectedGeneration = generation ?? null;
}

/** Zdejmuje podejrzenie wylacznie w tej samej generacji; bez argumentu czysci globalnie. */
export function clearPagerOrphan(generation?: number): void {
  if (suspectedGeneration === undefined) return;
  if (
    generation !== undefined &&
    suspectedGeneration !== null &&
    suspectedGeneration !== generation
  ) return;
  suspectedGeneration = undefined;
}

/** Czy biezaca generacja ma pozytywne podejrzenie sierocego pagera. */
export function isPagerOrphanSuspected(generation?: number): boolean {
  if (suspectedGeneration === undefined) return false;
  return generation === undefined || suspectedGeneration === null || suspectedGeneration === generation;
}
