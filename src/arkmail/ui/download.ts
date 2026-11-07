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
  try {
    if (impl) {
      impl(name, data);
      return true;
    }
    const g = globalThis as {
      document?: {
        createElement(tag: string): unknown;
        body?: { appendChild(el: unknown): void; removeChild?(el: unknown): void };
      };
      URL?: { createObjectURL(b: Blob): string; revokeObjectURL(u: string): void };
    };
    const doc = g.document;
    const urlApi = g.URL;
    if (!doc?.body || !urlApi) return false;
    const a = doc.createElement('a') as {
      href: string;
      download: string;
      click(): void;
      remove(): void;
    };
    const url = urlApi.createObjectURL(data);
    a.href = url;
    a.download = name;
    doc.body.appendChild(a);
    a.click();
    a.remove();
    // true = rozpoczeto obsluge pobrania, nie ma dowodu zapisu na dysku.
    // Adres zostaje zywy przez klik i dopiero timer go sprzata.
    setTimeout(() => {
      try {
        urlApi.revokeObjectURL(url);
      } catch {
        // Pozne sprzatanie nie moze wywolac nieobslugonego bledu.
      }
    }, 1000);
    return true;
  } catch {
    return false;
  }
}
