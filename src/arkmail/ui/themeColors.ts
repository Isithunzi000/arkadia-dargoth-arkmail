/** Kolory uzywane przez lokalne tokeny ArkMaila. */

export type Rgba = {
  r: number;
  g: number;
  b: number;
  a: number;
};

const BLACK: Rgba = { r: 0, g: 0, b: 0, a: 1 };
const WHITE: Rgba = { r: 1, g: 1, b: 1, a: 1 };
const NUMBER = /^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?$/i;

function numeric(value: string): number | null {
  const token = value.trim();
  if (!NUMBER.test(token)) return null;
  const parsed = Number(token);
  return Number.isFinite(parsed) ? parsed : null;
}

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value));
}

function alpha(value: string | undefined): number | null {
  if (value === undefined) return 1;
  const token = value.trim();
  if (token.endsWith('%')) {
    const parsed = numeric(token.slice(0, -1));
    return parsed === null ? null : clamp01(parsed / 100);
  }
  const parsed = numeric(token);
  return parsed === null ? null : clamp01(parsed);
}

function channel(value: string, maximum: number): number | null {
  const token = value.trim();
  if (token.endsWith('%')) {
    const parsed = numeric(token.slice(0, -1));
    return parsed === null ? null : clamp01(parsed / 100);
  }
  const parsed = numeric(token);
  return parsed === null ? null : clamp01(parsed / maximum);
}

function splitFunction(body: string): { channels: string[]; alpha?: string } | null {
  const slash = body.split('/');
  if (slash.length > 2) return null;
  const channels = slash[0]!.trim().split(/\s+/).filter(Boolean);
  if (channels.length === 0) return null;
  return { channels, alpha: slash[1]?.trim() };
}

function parseRgb(body: string): Rgba | null {
  let parts: string[];
  if (body.includes(',')) {
    if (body.includes('/')) return null;
    parts = body.split(',').map((part) => part.trim());
  } else {
    const split = splitFunction(body);
    if (!split) return null;
    parts = [...split.channels];
    if (split.alpha !== undefined) parts.push(split.alpha);
  }
  if (parts.length !== 3 && parts.length !== 4) return null;
  const rgb = parts.slice(0, 3).map((part) => channel(part, 255));
  if (rgb.some((part) => part === null)) return null;
  const a = alpha(parts[3]);
  return a === null ? null : { r: rgb[0]!, g: rgb[1]!, b: rgb[2]!, a };
}

function parseSrgb(body: string): Rgba | null {
  const match = body.match(/^srgb\s+([\s\S]+)$/i);
  if (!match) return null;
  const split = splitFunction(match[1]!);
  if (!split || split.channels.length !== 3) return null;
  const rgb = split.channels.map((part) => channel(part, 1));
  if (rgb.some((part) => part === null)) return null;
  const a = alpha(split.alpha);
  return a === null ? null : { r: rgb[0]!, g: rgb[1]!, b: rgb[2]!, a };
}

function oklabPart(value: string): number | null {
  const token = value.trim();
  if (token.endsWith('%')) {
    const parsed = numeric(token.slice(0, -1));
    return parsed === null ? null : (parsed / 100) * 0.4;
  }
  return numeric(token);
}

function parseOklab(body: string): Rgba | null {
  const split = splitFunction(body);
  if (!split || split.channels.length !== 3) return null;
  const lightness = split.channels[0]!.endsWith('%')
    ? numeric(split.channels[0]!.slice(0, -1))
    : numeric(split.channels[0]!);
  if (lightness === null) return null;
  const l = split.channels[0]!.endsWith('%') ? lightness / 100 : lightness;
  const a = oklabPart(split.channels[1]!);
  const b = oklabPart(split.channels[2]!);
  const opacity = alpha(split.alpha);
  if (a === null || b === null || opacity === null) return null;

  const lRoot = l + 0.3963377774 * a + 0.2158037573 * b;
  const mRoot = l - 0.1055613458 * a - 0.0638541728 * b;
  const sRoot = l - 0.0894841775 * a - 1.291485548 * b;
  const l3 = lRoot ** 3;
  const m3 = mRoot ** 3;
  const s3 = sRoot ** 3;
  const r = 4.0767416621 * l3 - 3.3077115913 * m3 + 0.2309699292 * s3;
  const g = -1.2684380046 * l3 + 2.6097574011 * m3 - 0.3413193965 * s3;
  const blue = -0.0041960863 * l3 - 0.7034186147 * m3 + 1.707614701 * s3;
  return { r: clamp01(r), g: clamp01(g), b: clamp01(blue), a: opacity };
}

/** Parsuje postac zwrocona przez getComputedStyle dla uzywanych tokenow. */
export function parseCssColor(value: string): Rgba | null {
  const match = value.trim().match(/^(rgba?|color|oklab)\(\s*([\s\S]*?)\s*\)$/i);
  if (!match) return null;
  const kind = match[1]!.toLowerCase();
  const body = match[2]!;
  if (kind === 'rgb' || kind === 'rgba') return parseRgb(body);
  if (kind === 'color') return parseSrgb(body);
  return parseOklab(body);
}

/** Source-over; wynik zachowuje alfa nieprzezroczystego dopiero tla. */
export function compositeOver(foreground: Rgba, background: Rgba): Rgba {
  const a = foreground.a + background.a * (1 - foreground.a);
  if (a === 0) return { r: 0, g: 0, b: 0, a: 0 };
  const mix = (front: number, back: number): number =>
    (front * foreground.a + back * background.a * (1 - foreground.a)) / a;
  return {
    r: mix(foreground.r, background.r),
    g: mix(foreground.g, background.g),
    b: mix(foreground.b, background.b),
    a,
  };
}

function luminance(value: Rgba): number {
  const linear = (channelValue: number): number =>
    channelValue <= 0.04045 ? channelValue / 12.92 : ((channelValue + 0.055) / 1.055) ** 2.4;
  return 0.2126 * linear(value.r) + 0.7152 * linear(value.g) + 0.0722 * linear(value.b);
}

/** WCAG dla nieprzezroczystych kolorow. */
export function contrastRatio(first: Rgba, second: Rgba): number {
  const a = luminance(first);
  const b = luminance(second);
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
}

/** Wybiera czern albo biel o wiekszym kontrascie z faktycznym akcentem. */
export function onAccentColor(accentValue: string, backgroundValue: string): string | null {
  const accent = parseCssColor(accentValue);
  const background = parseCssColor(backgroundValue);
  if (!accent || !background) return null;
  const actualAccent = compositeOver(accent, background);
  if (actualAccent.a < 1) return null;
  return contrastRatio(actualAccent, BLACK) >= contrastRatio(actualAccent, WHITE)
    ? 'rgb(0, 0, 0)'
    : 'rgb(255, 255, 255)';
}

/** Ustawia lokalny on-accent i sledzi zmiane motywu na html/body. */
export function installThemeColors(root: HTMLElement): () => void {
  const document = root.ownerDocument;
  const view = document.defaultView;
  if (!view) return () => {};

  const refresh = (): boolean => {
    // PersistentPopup najpierw tworzy DOM, a dopiero pozniej osadza go przez
    // React. Na odlaczonym root computed CSS jest pusty - to nie jest powod
    // do zgadywania koloru ani zatrzymywania pomiaru na zawsze.
    if (!root.isConnected) return false;
    const probe = document.createElement('span');
    probe.style.position = 'absolute';
    probe.style.visibility = 'hidden';
    probe.style.pointerEvents = 'none';
    probe.style.color = 'var(--popup-accent)';
    probe.style.backgroundColor = 'var(--popup-bg)';
    root.appendChild(probe);
    try {
      const computed = view.getComputedStyle(probe);
      const selected = onAccentColor(computed.color, computed.backgroundColor);
      if (!selected) return false;
      root.style.setProperty('--arkmail-on-accent', selected);
      return true;
    } finally {
      probe.remove();
    }
  };

  let frame: number | null = null;
  if (!refresh() && view.requestAnimationFrame) {
    let attempts = 0;
    const retry = (): void => {
      frame = null;
      attempts++;
      // Limit chroni przed nieskonczonym cyklem dla root, ktory nigdy nie
      // zostanie osadzony. Przy zwyklym montaz React wystarcza kilka klatek.
      if (refresh() || attempts >= 60) return;
      frame = view.requestAnimationFrame(retry);
    };
    frame = view.requestAnimationFrame(retry);
  }
  const MutationObserver = view.MutationObserver;
  if (!MutationObserver) {
    return () => {
      if (frame !== null) view.cancelAnimationFrame(frame);
    };
  }
  const observer = new MutationObserver(refresh);
  const options = { attributes: true, attributeFilter: ['class', 'style', 'data-theme'] };
  observer.observe(document.documentElement, options);
  observer.observe(document.body, options);
  return () => {
    observer.disconnect();
    if (frame !== null) view.cancelAnimationFrame(frame);
  };
}
