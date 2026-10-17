/**
 * Renderer listow: ramki + justowanie + wypelnienie {...}.
 *
 * Port 1:1 implementacji z oficjalnego klienta WWW Arkadii
 * (plik letterRenderer.ts, licencja MIT - projekt Arkadia,
 * https://arkadia.rpg.pl). Port jest celowo bajtowo zgodny:
 * zarysowana ramka i justowanie staja sie fizyczna trescia listu
 * wysylanego do gry. Zgodnosc pilnuja goldeny w tests/letterRender.test.ts
 * wygenerowane referencyjna implementacja.
 *
 * Samowystarczalny (zero zaleznosci) - ten sam plik zasili port Mudlet.
 */

export const MIN_LINE_WIDTH = 20;
export const MAX_LINE_WIDTH = 120;
export const DEFAULT_LINE_WIDTH = 60;

export type LetterTemplate = 'none' | 'plain' | 'parchment' | 'parchment2' | 'parchment3' | 'raw';

export function clampLineWidth(width: number): number {
  const rounded = Math.round(width);
  return Math.min(MAX_LINE_WIDTH, Math.max(MIN_LINE_WIDTH, rounded));
}

function normalizeLine(line: string): string {
  return line.replace(/\s+/g, ' ').trim();
}

function splitLongWord(word: string, width: number): string[] {
  const parts: string[] = [];
  for (let i = 0; i < word.length; i += width) {
    parts.push(word.slice(i, i + width));
  }
  return parts;
}

/** Jak tekst body lezy wewnatrz szablonu. */
export const LETTER_ALIGNMENTS = ['justify', 'left', 'center', 'right'] as const;

export type LetterAlignment = (typeof LETTER_ALIGNMENTS)[number];

export const DEFAULT_LETTER_ALIGNMENT: LetterAlignment = 'justify';

export function isLetterAlignment(value: unknown): value is LetterAlignment {
  return typeof value === 'string' && (LETTER_ALIGNMENTS as readonly string[]).includes(value);
}

function justifyWords(words: string[], lettersLength: number, width: number): string {
  if (words.length === 1) {
    return words[0];
  }
  const gaps = words.length - 1;
  const totalSpaces = width - lettersLength;
  const baseSpace = Math.max(1, Math.floor(totalSpaces / gaps));
  let extra = totalSpaces - baseSpace * gaps;
  let line = words[0];
  for (let i = 1; i < words.length; i += 1) {
    let spaces = baseSpace;
    if (extra > 0) {
      spaces += 1;
      extra -= 1;
    }
    line += ' '.repeat(spaces) + words[i];
  }
  return line;
}

function alignWords(words: string[], width: number, alignment: LetterAlignment, isLastLine: boolean): string {
  if (alignment === 'justify' && !isLastLine) {
    return justifyWords(words, words.reduce((sum, word) => sum + word.length, 0), width);
  }
  const text = words.join(' ');
  if (alignment === 'right') {
    return text.padStart(width, ' ');
  }
  if (alignment === 'center') {
    return ' '.repeat(Math.max(0, Math.floor((width - text.length) / 2))) + text;
  }
  return text;
}

/** Slowa linii zgrupowane w linie o najwyzej `width` znakach. */
function wrapWords(normalizedLine: string, width: number): string[][] {
  if (!normalizedLine) {
    return [];
  }
  const groups: string[][] = [];
  let currentWords: string[] = [];
  let lettersLength = 0;

  const flush = () => {
    if (currentWords.length) {
      groups.push(currentWords);
    }
    currentWords = [];
    lettersLength = 0;
  };

  normalizedLine.split(' ').forEach((word) => {
    if (word.length > width) {
      flush();
      const parts = splitLongWord(word, width);
      const lastPart = parts.pop();
      parts.forEach((part) => groups.push([part]));
      if (lastPart) {
        currentWords = [lastPart];
        lettersLength = lastPart.length;
      }
      return;
    }

    const minimalSpaces = currentWords.length;
    if (lettersLength + word.length + minimalSpaces > width && currentWords.length) {
      flush();
    }

    currentWords.push(word);
    lettersLength += word.length;
  });

  flush();

  return groups;
}

function wrapLine(line: string, width: number, letterAlignment: LetterAlignment): string[] {
  // Linia od `>` jest wyrownana w prawo niezaleznie od wyrownania listu
  const alignRight = line.startsWith('>');
  const alignment = alignRight ? 'right' : letterAlignment;
  const groups = wrapWords(normalizeLine(alignRight ? line.slice(1) : line), width);
  return groups.map((words, index) => alignWords(words, width, alignment, index === groups.length - 1));
}

function formatContent(content: string, width: number, alignment: LetterAlignment): string[] {
  const rawLines = content.split(/\r?\n/);
  const result: string[] = [];
  let pendingBlankLine = false;
  let hasContent = false;

  rawLines.forEach((line) => {
    const wrapped = wrapLine(normalizeLine(line), width, alignment);
    if (!wrapped.length) {
      if (hasContent) {
        pendingBlankLine = true;
      }
      return;
    }

    if (pendingBlankLine && result.length) {
      result.push('');
      pendingBlankLine = false;
    }

    result.push(...wrapped);
    hasContent = true;
  });

  return result;
}

/**
 * Ramka listu. Linie naglowka i stopki wpisywane sa jak sa, poza tym,
 * ze `{...}` powtarza tekst w klamrach dokladnie do szerokosci body
 * (ucinajac wzorzec w polowie, gdy nie dzieli sie rowno), dzieki czemu
 * ramka rosnie z szerokoscia linii. Linie body laduja miedzy prefixem
 * a suffixem; wielolinijkowy prefix/suffix (`\n`) stosowany jest linia
 * po linii, od poczatku po ostatniej.
 */
export interface LetterLayout {
  header: readonly string[];
  footer: readonly string[];
  bodyPrefix: string;
  bodySuffix: string;
  /** Wyslij tresc dokladnie jak wpisana: bez zawijania i ramki. */
  raw?: boolean;
}

const FILL_PATTERN = /\{([^{}]+)\}/g;

export function expandFillLine(line: string, width: number): string {
  return line.replace(FILL_PATTERN, (_match, pattern: string) =>
    pattern.repeat(Math.ceil(width / pattern.length)).slice(0, width));
}

/** Linie prefixu/suffixu body, bez koncowych pustych. */
export function splitBodyPattern(pattern: string): string[] {
  const lines = pattern.split(/\r?\n/);
  while (lines.length > 1 && lines[lines.length - 1] === '') {
    lines.pop();
  }
  return lines;
}

function longestLength(lines: readonly string[]): number {
  return lines.reduce((max, line) => Math.max(max, line.length), 0);
}

/** Szerokosc body wewnatrz ramki dla calkowitej szerokosci linii. */
export function getLayoutBodyWidth(layout: LetterLayout, totalWidth: number): number {
  if (layout.raw) {
    return Infinity;
  }
  const prefixWidth = longestLength(splitBodyPattern(layout.bodyPrefix));
  const suffixWidth = longestLength(splitBodyPattern(layout.bodySuffix));
  return Math.max(1, totalWidth - prefixWidth - suffixWidth);
}

function formatBody(layout: LetterLayout, lines: readonly string[], width: number): string[] {
  if (layout.raw) {
    return [...lines];
  }
  const prefixes = splitBodyPattern(layout.bodyPrefix);
  const suffixes = splitBodyPattern(layout.bodySuffix);
  // Krotsze prefixy sa dopełniane, aby tekst trzymal jedna kolumne
  const prefixWidth = longestLength(prefixes);
  const framed = prefixWidth > 0 || longestLength(suffixes) > 0;
  return lines.map((line, index) => {
    const trimmed = line.length > width ? line.slice(0, width) : line;
    if (!framed) {
      return trimmed.trimEnd();
    }
    const prefix = prefixes[index % prefixes.length].padEnd(prefixWidth, ' ');
    const suffix = suffixes[index % suffixes.length];
    return `${prefix}${trimmed.padEnd(width, ' ')}${suffix}`;
  });
}

export const BUILTIN_LETTER_LAYOUTS: Readonly<Record<LetterTemplate, LetterLayout>> = {
  none: {
    header: [],
    footer: [],
    bodyPrefix: '',
    bodySuffix: '',
  },
  plain: {
    header: [
      ' +--{-}--+ ',
      ' |  { }  | ',
      ' |  { }  | ',
    ],
    footer: [
      ' |  { }  | ',
      ' |  { }  | ',
      ' +--{-}--+ ',
    ],
    bodyPrefix: ' |  ',
    bodySuffix: '  | ',
  },
  parchment: {
    header: [
      '  ____{_}___  ',
      '/ \\   { }   \\.',
      '|  |  { }   |.',
      '\\_ |  { }   |.',
      '   |  { }   |.',
    ],
    footer: [
      '   |  { }   |.   ',
      '   |   {_}__|___ ',
      '   |  /{ }     /.',
      '   \\_/_{_}____/. ',
    ],
    bodyPrefix: '   |   ',
    bodySuffix: '  |.',
  },
  parchment2: {
    header: [
      ' ______{_}_____  ',
      ' / _\\  { }     \\ ',
      '|/ >|  { }     | ',
      ' |\\_/__{_}______/',
      ' \\.    { }   ./  ',
      ' |     { }   |   ',
    ],
    footer: [
      ' |  ___{_}___|   ',
      ' |/\\   { }     \\ ',
      ' \\_|   { }      |',
      '  \\_/_ {_}_____/ ',
    ],
    bodyPrefix: ' |     ',
    bodySuffix: '   |   ',
  },
  parchment3: {
    header: [
      '             { }  .---.   ',
      '             { } /  .  \\ ',
      '             { }|\\_/|   |',
      '             { }|   |  /| ',
      '   .---------{-}-------\'|',
      '  /  .-.     { }        | ',
      ' |  /   \\   { }         |',
      ' | |\\_.  |  { }         |',
      ' |\\|  | /|  { }         |',
      ' | `---\' |  { }         |',
    ],
    footer: [
      ' |       |   { }        /   ',
      ' |       |---{-}--------\' ',
      ' \\       |  { }            ',
      ' \\.___./    { }            ',
    ],
    bodyPrefix: ' |       |   ',
    bodySuffix: '        | ',
  },
  raw: {
    header: [],
    footer: [],
    bodyPrefix: '',
    bodySuffix: '',
    raw: true,
  },
};

export interface LetterRenderResult {
  lines: string[];
  hasContent: boolean;
}

export function renderLetterLayout(
  content: string,
  layout: LetterLayout,
  lineWidth: number = DEFAULT_LINE_WIDTH,
  alignment: LetterAlignment = DEFAULT_LETTER_ALIGNMENT,
): LetterRenderResult {
  const bodyWidth = getLayoutBodyWidth(layout, lineWidth);
  // Surowy uklad zachowuje biale znaki dokladnie jak wpisane
  const baseLines = layout.raw
    ? content.split(/\r?\n/)
    : formatContent(content, bodyWidth, alignment);
  const bodySource = baseLines.length ? baseLines : [''];
  const lines = [
    ...layout.header.map((line) => expandFillLine(line, bodyWidth)),
    ...formatBody(layout, bodySource, bodyWidth),
    ...layout.footer.map((line) => expandFillLine(line, bodyWidth)),
  ];
  const hasContent = baseLines.some((line) => line.length > 0);
  return { lines, hasContent };
}

export function renderLetter(
  content: string,
  template: LetterTemplate,
  lineWidth: number = DEFAULT_LINE_WIDTH,
  alignment: LetterAlignment = DEFAULT_LETTER_ALIGNMENT,
): LetterRenderResult {
  return renderLetterLayout(content, BUILTIN_LETTER_LAYOUTS[template], lineWidth, alignment);
}
