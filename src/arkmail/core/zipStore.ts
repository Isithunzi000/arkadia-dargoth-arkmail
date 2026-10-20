/**
 * Minimalny zapis ZIP metoda STORED (bez kompresji) - Fala 17g.
 *
 * Eksportowane listy to krotkie pliki TXT; kompresja nic tu nie daje,
 * a STORED pozwala zbudowac archiwum samodzielnie (zero zaleznosci,
 * dziala w przegladarce klienta). Struktura: naglowki lokalne
 * (0x04034b50), katalog centralny (0x02014b50), EOCD (0x06054b50).
 * Staly znacznik czasu DOS (1980-01-01 00:00) - bajty wyjscia sa
 * deterministyczne przy tym samym wejsciu. Nazwy wpisow sa ASCII
 * (slug z exportTxt), wiec kodowanie bajtowe jest trywialne.
 */

// Tabela CRC32 (wielomian 0xEDB88320, jak w PKZIP/gzip).
const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

/** CRC32 bajtow (unsigned). */
export function crc32(data: Uint8Array): number {
  let c = 0xffffffff;
  for (let i = 0; i < data.length; i++) c = CRC_TABLE[(c ^ data[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

/** Nazwa wpisu -> bajty (nazwy z exportu sa czystym ASCII). */
function nameBytes(name: string): Uint8Array {
  const out = new Uint8Array(name.length);
  for (let i = 0; i < name.length; i++) out[i] = name.charCodeAt(i) & 0x7f;
  return out;
}

/** Prosty skladak bajtow bez realokacji przy kazdym dopisaniu. */
class ByteSink {
  private chunks: Uint8Array[] = [];
  private len = 0;
  push(b: Uint8Array): void {
    this.chunks.push(b);
    this.len += b.length;
  }
  u16(v: number): void {
    this.push(new Uint8Array([v & 0xff, (v >>> 8) & 0xff]));
  }
  u32(v: number): void {
    this.push(new Uint8Array([v & 0xff, (v >>> 8) & 0xff, (v >>> 16) & 0xff, (v >>> 24) & 0xff]));
  }
  get length(): number {
    return this.len;
  }
  concat(): Uint8Array {
    const out = new Uint8Array(this.len);
    let off = 0;
    for (const c of this.chunks) {
      out.set(c, off);
      off += c.length;
    }
    return out;
  }
}

// Staly czas DOS 1980-01-01 00:00:00 (determinizm bajtow archiwum).
const DOS_TIME = 0;
const DOS_DATE = 0x21;

export interface ZipFile {
  name: string;
  data: Uint8Array;
}

/**
 * Buduje archiwum ZIP (STORED) z podanych plikow, w podanej
 * kolejnosci. Deterministyczne: to samo wejscie -> te same bajty.
 */
export function buildZip(files: ZipFile[]): Uint8Array {
  const local = new ByteSink();
  const central = new ByteSink();
  for (const f of files) {
    const name = nameBytes(f.name);
    const crc = crc32(f.data);
    const offset = local.length;
    // Naglowek lokalny.
    local.u32(0x04034b50);
    local.u16(20); // wersja wymagana
    local.u16(0); // flagi
    local.u16(0); // metoda: STORED
    local.u16(DOS_TIME);
    local.u16(DOS_DATE);
    local.u32(crc);
    local.u32(f.data.length); // rozmiar po kompresji (= przed)
    local.u32(f.data.length);
    local.u16(name.length);
    local.u16(0); // dlugosc extra
    local.push(name);
    local.push(f.data);
    // Wpis katalogu centralnego.
    central.u32(0x02014b50);
    central.u16(20); // wersja tworzaca
    central.u16(20); // wersja wymagana
    central.u16(0); // flagi
    central.u16(0); // metoda
    central.u16(DOS_TIME);
    central.u16(DOS_DATE);
    central.u32(crc);
    central.u32(f.data.length);
    central.u32(f.data.length);
    central.u16(name.length);
    central.u16(0); // extra
    central.u16(0); // komentarz
    central.u16(0); // dysk startowy
    central.u16(0); // atrybuty wewnetrzne
    central.u32(0); // atrybuty zewnetrzne
    central.u32(offset);
    central.push(name);
  }
  const cd = central.concat();
  const body = local.concat();
  const eocd = new ByteSink();
  eocd.u32(0x06054b50);
  eocd.u16(0); // dysk
  eocd.u16(0); // dysk katalogu
  eocd.u16(files.length);
  eocd.u16(files.length);
  eocd.u32(cd.length);
  eocd.u32(body.length);
  eocd.u16(0); // komentarz archiwum
  const out = new Uint8Array(body.length + cd.length + eocd.length);
  out.set(body, 0);
  out.set(cd, body.length);
  out.set(eocd.concat(), body.length + cd.length);
  return out;
}
