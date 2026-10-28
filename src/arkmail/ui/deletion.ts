export interface DeletionFilters {
  osoba: string;
  temat: string;
  tresc: string;
  odDaty: string;
  doDaty: string;
}

export function emptyDeletionFilters(): DeletionFilters {
  return { osoba: '', temat: '', tresc: '', odDaty: '', doDaty: '' };
}

/** Zwraca liczbe z poprawna forma slowa "list". */
export function formatListCount(count: number): string {
  const lastTwo = count % 100;
  const last = count % 10;
  const form = count === 1
    ? 'list'
    : last >= 2 && last <= 4 && (lastTwo < 12 || lastTwo > 14)
      ? 'listy'
      : 'listow';
  return `${count} ${form}`;
}
