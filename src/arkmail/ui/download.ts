/**
 * Pobieranie plikow z pluginu (Fala 17g): klient Dargoth nie ma API
 * download, wiec Blob + <a download>. Implementacja podmienialna -
 * testy (happy-dom) podpinaja stub przez setDownloadImpl.
 */

type DownloadFn = (name: string, data: Blob) => void;

let impl: DownloadFn | null = null;

/** Testy: podpiecie wlasnej implementacji (null = powrot do DOM). */
export function setDownloadImpl(fn: DownloadFn | null): void {
  impl = fn;
}

/** Zapisuje blob pod zadana nazwa. false = klient nie umie pobierac. */
export function downloadBlob(name: string, data: Blob): boolean {
  if (impl) {
    impl(name, data);
    return true;
  }
  try {
    const g = globalThis as {
      document?: {
        createElement(tag: string): unknown;
        body?: { appendChild(el: unknown): void; removeChild?(el: unknown): void };
      };
      URL?: { createObjectURL(b: Blob): string; revokeObjectURL(u: string): void };
    };
    const doc = g.document;
    if (!doc?.body || !g.URL) return false;
    const a = doc.createElement('a') as {
      href: string;
      download: string;
      click(): void;
      remove(): void;
    };
    const url = g.URL.createObjectURL(data);
    a.href = url;
    a.download = name;
    doc.body.appendChild(a);
    a.click();
    a.remove();
    g.URL.revokeObjectURL(url);
    return true;
  } catch {
    return false;
  }
}
