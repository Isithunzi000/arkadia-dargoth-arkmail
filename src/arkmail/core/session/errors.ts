/** Odpowiedz protokolu nie nalezy do zadanej operacji. */
export class AmbiguousResponseError extends Error {
  readonly code = 'niejednoznaczna_odpowiedz' as const;

  constructor(detail: string) {
    super(`niejednoznaczna_odpowiedz: ${detail}`);
    this.name = 'AmbiguousResponseError';
  }
}
