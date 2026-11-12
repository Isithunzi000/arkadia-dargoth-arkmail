/** Odpowiedz protokolu nie nalezy do zadanej operacji. */
export class AmbiguousResponseError extends Error {
  readonly code = 'niejednoznaczna_odpowiedz' as const;

  constructor(detail: string) {
    super(`niejednoznaczna_odpowiedz: ${detail}`);
    this.name = 'AmbiguousResponseError';
  }
}

/** Listing zatrzymal pager, ktorego nie wolno automatycznie zamknac. */
export class UnknownPagerError extends Error {
  readonly code = 'nieznany_pager' as const;

  constructor() {
    super('nieznany_pager: przerwano listing');
    this.name = 'UnknownPagerError';
  }
}
