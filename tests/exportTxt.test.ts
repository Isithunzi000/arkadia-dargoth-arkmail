/**
 * Eksport listow do TXT/ZIP (Fala 17g, zgloszenie 2026-10-19/20 pkt 7).
 *
 * Prosba gracza: "jak jest podglad listu dodac klawisz zapisz list TXT,
 * zeby byl zapisany tak jak wyglada na ekranie; i w archiwum Zapisz
 * wszystkie listy w TXT - kazdy list jeden txt, w zip".
 *
 * Kontrakt:
 *  - TXT jak na ekranie: temat, meta "Od: X | Do: Y | data |
 *    skrzynka: B", pusta linia, tresc; konce linii LF, ANSI zdjete,
 *    konczy sie znakiem nowej linii;
 *  - nazwa pliku: <sortKey>_<strona>_<temat>.txt, slug ASCII;
 *  - eksport archiwum: tylko listy Z trescia (bez-tresciowe pomijane
 *    i liczone), blizniaki nieprzeczytane/odebrane deduplikowane po
 *    kluczu tresci (Fala 17c), foldery per skrzynka;
 *  - ZIP: STORED + CRC32, zero zaleznosci, deterministyczny (staly
 *    znacznik czasu wpisow), nazwa arkmail_listy_RRRR-MM-DD_GGMM.zip;
 *  - klient nie ma API pobierania - Blob + <a download> przez
 *    podmienialny helper (testy podpinaja stub).
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  archiveExportEntries,
  archiveLetterTxt,
  letterTxt,
  slugAscii,
  txtFileName,
} from '../src/arkmail/core/exportTxt';
import { buildZip, crc32 } from '../src/arkmail/core/zipStore';
import { setDownloadImpl } from '../src/arkmail/ui/download';
import { fromMailboxEntry, type ArchiveLetter } from '../src/arkmail/core/archive';
import type { MailboxEntry } from '../src/arkmail/core/session/mailbox';
import {
  startHarness,
  stopHarness,
  loadTruncatedBox,
  click,
  waitRt,
  notifyText,
  type Harness,
} from './harness';

const DATE_RAW = 'Wt, 23 XII 2025, 00:11:12';

test('txt: format jak na ekranie - temat, meta, pusta linia, tresc; LF; ANSI zdjete', () => {
  const txt = letterTxt({
    subject: 'najnowszy',
    from: 'Corge',
    to: 'Waldo',
    cc: 'Bar',
    date: DATE_RAW,
    box: 'odebrane',
    body: ['[1mTresc pierwszego.[0m', 'Druga linia.'],
  });
  assert.equal(
    txt,
    'najnowszy\n' +
      `Od: Corge | Do: Waldo | DW: Bar | ${DATE_RAW} | skrzynka: odebrane\n` +
      '\nTresc pierwszego.\nDruga linia.\n',
  );
  assert.ok(!txt.includes('\r'), 'konce linii LF');
  // Puste Do/DW pomijane (jak meta na ekranie).
  const txt2 = letterTxt({
    subject: 's',
    from: 'A',
    to: '',
    cc: null,
    date: null,
    box: 'wyslane',
    body: ['b'],
  });
  assert.equal(txt2, 's\nOd: A | skrzynka: wyslane\n\nb\n');
});

test('txt: rekord archiwum - strona listu po kierunku skrzynki', () => {
  const mk = (box: ArchiveLetter['box']): ArchiveLetter => ({
    ...fromMailboxEntry(box, {
      number: 1,
      isRead: true,
      subject: 'najnowszy',
      forwarded: false,
      party: 'Corge',
      partyKind: box === 'odebrane' || box === 'nieprzeczytane' ? 'nadawca' : 'odbiorcy',
      date: { raw: DATE_RAW, weekday: 'Wt', day: 23, month: 12, year: 2025, time: '00:11:12' },
    } satisfies MailboxEntry),
    body: ['Tresc.'],
  });
  assert.match(archiveLetterTxt(mk('odebrane')), /\nOd: Corge \|/);
  assert.match(archiveLetterTxt(mk('wyslane')), /\nDo: Corge \|/);
});

test('txt: nazwa pliku - sortKey + slugi ASCII, bezpieczna dla systemu plikow', () => {
  assert.equal(
    txtFileName('Corge', 'Re: test !ok?', DATE_RAW),
    '2025-12-23_00-11-12_genevive_re-test-ok.txt',
  );
  assert.equal(txtFileName('Alvin, Bean', '', null), '0000-00-00_00-00-00_alvin-bean_list.txt');
  assert.equal(slugAscii('  ..::  '), 'list', 'pusty slug ma fallback');
});

test('zip: CRC32 zgodny z referencja, STORED, deterministyczny', () => {
  assert.equal(crc32(new TextEncoder().encode('123456789')), 0xcbf43926, 'CRC32 referencyjny');
  const files = [
    { name: 'odebrane/a.txt', data: new TextEncoder().encode('ala') },
    { name: 'wyslane/b.txt', data: new TextEncoder().encode('ma kota') },
  ];
  const zip1 = buildZip(files);
  const zip2 = buildZip(files);
  assert.deepEqual(zip1, zip2, 'deterministyczny: identyczne bajty przy tym samym wejsciu');
  // Struktura: local header, central directory, EOCD.
  assert.equal(zip1[0], 0x50, 'PK');
  assert.equal(zip1[1], 0x4b);
  assert.equal(zip1[2], 3, 'local file header sig');
  assert.equal(zip1[3], 4);
  const dv = new DataView(zip1.buffer, zip1.byteOffset, zip1.byteLength);
  assert.equal(dv.getUint16(8, true), 0, 'metoda STORED');
  assert.equal(dv.getUint32(14, true), crc32(files[0].data), 'CRC pierwszego wpisu');
  const eocd = zip1.length - 22;
  assert.equal(dv.getUint32(eocd, true), 0x06054b50, 'EOCD sig');
  assert.equal(dv.getUint16(eocd + 10, true), 2, 'dwa wpisy w katalogu centralnym');
});

/** Odczyt nazw wpisow z katalogu centralnego ZIP (testowy parser). */
function zipNames(zip: Uint8Array): string[] {
  const dv = new DataView(zip.buffer, zip.byteOffset, zip.byteLength);
  const eocd = zip.length - 22;
  const count = dv.getUint16(eocd + 10, true);
  let off = dv.getUint32(eocd + 16, true);
  const names: string[] = [];
  const dec = new TextDecoder();
  for (let i = 0; i < count; i++) {
    assert.equal(dv.getUint32(off, true), 0x02014b50, 'central directory sig');
    const nameLen = dv.getUint16(off + 28, true);
    names.push(dec.decode(zip.subarray(off + 46, off + 46 + nameLen)));
    off += 46 + nameLen + dv.getUint16(off + 30, true) + dv.getUint16(off + 32, true);
  }
  return names;
}

test('eksport archiwum: dedup blizniakow, folder per skrzynka, pomijanie bez tresci', () => {
  const base = {
    number: 1,
    isRead: true,
    subject: 'najnowszy',
    forwarded: false,
    party: 'Corge',
    partyKind: 'nadawca' as const,
    date: { raw: DATE_RAW, weekday: 'Wt', day: 23, month: 12, year: 2025, time: '00:11:12' },
  };
  const twinUnread: ArchiveLetter = {
    ...fromMailboxEntry('nieprzeczytane', { ...base, isRead: false }),
    body: ['Tresc.'],
  };
  const twinRead: ArchiveLetter = { ...fromMailboxEntry('odebrane', base), body: ['Tresc.'] };
  const noBody: ArchiveLetter = {
    ...fromMailboxEntry('odebrane', { ...base, subject: 'pusty' }),
    body: [],
  };
  const sent: ArchiveLetter = {
    ...fromMailboxEntry('wyslane', {
      ...base,
      subject: 'wyprawa',
      partyKind: 'odbiorcy',
    }),
    body: ['Tresc wyslanego.'],
  };
  const { entries, skipped } = archiveExportEntries([twinUnread, twinRead, noBody, sent]);
  assert.equal(skipped, 1, 'bez-tresciowy pominiety');
  assert.equal(entries.length, 2, 'blizniak zdeduplikowany, wyslany osobno');
  const names = entries.map((e) => e.name);
  assert.ok(
    names.some((n) => n.startsWith('odebrane/2025-12-23_00-11-12_genevive_najnowszy.txt')),
    'blizniak w kanonicznym folderze odebrane',
  );
  assert.ok(names.some((n) => n.startsWith('wyslane/')), 'wyslany w folderze wyslane');
});

// --- integracja UI ----------------------------------------------------------

interface Captured {
  name: string;
  data: Blob;
}

const captured: Captured[] = [];

function replayListing3(h: Harness): void {
  const { f } = h;
  f.fire('Listy odebrane (prezentowane jest pierwsze 50):', 'mail');
  f.fire(' 3. *R* Temat: najstarszy', 'mail');
  f.fire('Nadawca: Foo                        N, 21 XII 2025, 01:15:04', 'mail');
  f.fire(' 2. *R* Temat: srodkowy', 'mail');
  f.fire('Nadawca: Foo                        Pn, 22 XII 2025, 02:20:05', 'mail');
  f.fire(' 1. *R* Temat: najnowszy', 'mail');
  f.fire('Nadawca: Corge                       Wt, 23 XII 2025, 00:11:12', 'mail');
  f.fire('> ', 'prompt');
}

function replayLetter(h: Harness, numer: number, subject: string, body: string): void {
  const { f } = h;
  f.fire(`List : ${numer}`, 'mail');
  f.fire('Od   : Corge', 'mail');
  f.fire(`Temat: ${subject}`, 'mail');
  f.fire('Data : Wt, 23 XII 2025, 00:11:12', 'mail');
  f.fire('', 'mail');
  f.fire(body, 'mail');
  f.fire(`[1-50 adefFhHmnqrsRux.!?-+<>] (aktualny: ${numer}) -- `, 'mail');
  f.fire('> ', 'prompt');
}

test('widok listu: Zapisz list TXT pobiera plik o tresci jak na ekranie', async () => {
  const h = await startHarness();
  const { f } = h;
  setDownloadImpl((name, data) => captured.push({ name, data }));
  try {
    await loadTruncatedBox(h);
    // Otworz najnowszy list z listingu.
    const row = Array.from(
      h.content.querySelectorAll('.arkmail-entry') as unknown as Iterable<{
        textContent?: string;
        dispatchEvent(e: unknown): void;
      }>,
    ).find((r) => String(r.textContent ?? '').includes('najnowszy'));
    assert.ok(row, 'wiersz listingu');
    row.dispatchEvent(new h.window.Event('click'));
    // Fala 9a: otwarcie re-kotwiczy wpis na swiezym listingu.
    await waitRt(() => f.sent.includes('listy odebrane przed 24 XII 2025'), 're-kotwica');
    f.fire('Listy odebrane (prezentowane jest pierwsze 50):', 'mail');
    f.fire(' 1. *R* Temat: najnowszy', 'mail');
    f.fire('Nadawca: Corge                       Wt, 23 XII 2025, 00:11:12', 'mail');
    f.fire('> ', 'prompt');
    await waitRt(() => f.sent.includes('przeczytaj list 1'), 'odczyt');
    replayLetter(h, 1, 'najnowszy', 'Tresc pierwszego.');
    await waitRt(() => !!h.content.querySelector('.arkmail-export-letter'), 'przycisk eksportu');

    const base = f.sent.length;
    click(h, '.arkmail-export-letter');
    await waitRt(() => captured.length === 1, 'pobieranie TXT');
    assert.match(captured[0].name, /^2025-12-23_00-11-12_genevive_najnowszy\.txt$/, 'nazwa pliku');
    const txt = await captured[0].data.text();
    assert.ok(txt.includes('najnowszy'), 'temat w TXT');
    assert.ok(txt.includes('Od: Corge'), 'meta Od w TXT');
    assert.ok(txt.includes('skrzynka: odebrane'), 'skrzynka w TXT');
    assert.ok(txt.includes('Tresc pierwszego.'), 'tresc w TXT');
    assert.equal(f.sent.length, base, 'eksport bez komend do serwera');
    assert.ok(notifyText(f, 'Zapisano list do pliku TXT.'), 'toast potwierdzenia');
  } finally {
    setDownloadImpl(null);
    captured.length = 0;
    await stopHarness();
  }
});

test('archiwum: Zapisz wszystkie TXT pobiera ZIP per-list, puste archiwum = toast', async () => {
  const h = await startHarness();
  const { f } = h;
  setDownloadImpl((name, data) => captured.push({ name, data }));
  try {
    // Puste archiwum: toast, zero pobran.
    click(h, '[data-tab="archiwum"]');
    // Fala 18e (zgloszenie 2026-10-20 pkt 5): przycisk zapisuje ZIP -
    // etykieta ma to mowic wprost.
    const expBtn = h.content.querySelector('.arkmail-arch-export') as unknown as {
      textContent?: string;
    } | null;
    assert.ok(expBtn, 'przycisk eksportu archiwum');
    assert.equal(expBtn.textContent, 'Zapisz wszystkie (ZIP)', 'etykieta mowi ZIP, nie TXT');
    click(h, '.arkmail-arch-export');
    // Fala 18c (guard, swiadoma zmiana pinu): pusta NIEZINDEKSOWANA
    // baza = najpierw automatyczna indeksacja skrzynek, nie martwy
    // toast. Dopiero po pelnym indeksie "pusto" = faktycznie puste
    // skrzynki.
    await waitRt(() => notifyText(f, 'najpierw indeksuje'), 'guard: indeksacja przed eksportem');
    await waitRt(() => f.sent.includes('listy odebrane'), 'guard: indeksuje odebrane');
    f.fire('Nie masz zadnych odebranych listow.', 'mail');
    await waitRt(() => f.sent.includes('listy nieprzeczytane'), 'guard: indeksuje nieprzeczytane');
    f.fire('Nie masz zadnych nieprzeczytanych listow.', 'mail');
    await waitRt(() => f.sent.includes('listy wyslane'), 'guard: indeksuje wyslane');
    f.fire('Nie masz zadnych wyslanych listow.', 'mail');
    await waitRt(() => f.sent.includes('listy niewyslane'), 'guard: indeksuje niewyslane');
    f.fire('Nie masz zadnych niewyslanych listow.', 'mail');
    await waitRt(
      () => notifyText(f, 'kliknij ponownie Zapisz wszystkie'),
      'kontynuacja eksportu po indeksacji',
    );
    assert.equal(captured.length, 0, 'bez pobierania dla pustego archiwum');

    // Napelnij archiwum tresciami (petla 16i/17c). Prolog wymaga
    // widoku Listy (czeka na przycisk paginacji) - wracamy z Archiwum.
    // Fala 18c: guard wyzej juz wyslal komendy "listy ...", wiec
    // loadTruncatedBox (includes) by sie rozjechal - prolog liczacy.
    click(h, '[data-tab="listy"]');
    const odb = f.sent.filter((c) => c === 'listy odebrane').length;
    const niep = f.sent.filter((c) => c === 'listy nieprzeczytane').length;
    f.fire(' [ POCZTA ] Masz nowa poczte od Foo.');
    await waitRt(
      () => f.sent.filter((c) => c === 'listy odebrane').length === odb + 1,
      'prolog: odebrane',
    );
    f.fire('Listy odebrane (prezentowane jest pierwsze 50):', 'mail');
    f.fire(' 3. *R* Temat: najstarszy', 'mail');
    f.fire('Nadawca: Foo                        N, 21 XII 2025, 01:15:04', 'mail');
    f.fire(' 2. *R* Temat: srodkowy', 'mail');
    f.fire('Nadawca: Foo                        Pn, 22 XII 2025, 02:20:05', 'mail');
    f.fire(' 1. *R* Temat: najnowszy', 'mail');
    f.fire('Nadawca: Corge                       Wt, 23 XII 2025, 00:11:12', 'mail');
    f.fire('> ', 'prompt');
    await waitRt(
      () => f.sent.filter((c) => c === 'listy nieprzeczytane').length === niep + 1,
      'prolog: nieprzeczytane',
    );
    f.fire('Nie masz zadnych nieprzeczytanych listow.', 'mail');
    await waitRt(() => !!h.content.querySelector('.arkmail-older'), 'przycisk Wczytaj starsze');
    await waitRt(() => !h.content.querySelector('.arkmail-busy'), 'koniec sesji prologu');
    click(h, '[data-tab="archiwum"]');
    const dlBtn = () => {
      const b = h.content.querySelector('.arkmail-arch-download') as unknown as {
        dispatchEvent(e: unknown): void;
      } | null;
      assert.ok(b, 'przycisk pobierania');
      return b;
    };
    dlBtn().dispatchEvent(new h.window.Event('click'));
    dlBtn().dispatchEvent(new h.window.Event('click'));
    await waitRt(() => f.sent.includes('listy odebrane przed 24 XII 2025'), 'kotwica 1');
    replayListing3(h);
    await waitRt(() => f.sent.includes('przeczytaj list 1'), 'odczyt 1');
    replayLetter(h, 1, 'najnowszy', 'Tresc pierwszego.');
    await waitRt(() => f.sent.includes('listy odebrane przed 23 XII 2025'), 'kotwica 2');
    replayListing3(h);
    await waitRt(() => f.sent.includes('przeczytaj list 2'), 'odczyt 2');
    replayLetter(h, 2, 'srodkowy', 'Tresc drugiego.');
    await waitRt(() => f.sent.includes('listy odebrane przed 22 XII 2025'), 'kotwica 3');
    replayListing3(h);
    await waitRt(() => f.sent.includes('przeczytaj list 3'), 'odczyt 3');
    replayLetter(h, 3, 'najstarszy', 'Tresc trzeciego.');
    await waitRt(() => notifyText(f, 'Pobrano tresci do archiwum'), 'koniec pobierania');

    click(h, '.arkmail-arch-export');
    await waitRt(() => captured.length === 1, 'pobieranie ZIP');
    assert.match(
      captured[0].name,
      /^arkmail_listy_\d{4}-\d{2}-\d{2}_\d{4}\.zip$/,
      'nazwa ZIP z data',
    );
    const zip = new Uint8Array(await captured[0].data.arrayBuffer());
    const names = zipNames(zip);
    assert.equal(names.length, 3, 'trzy pliki w ZIP');
    assert.ok(
      names.every((n) => n.startsWith('odebrane/') && n.endsWith('.txt')),
      'foldery per skrzynka',
    );
    assert.ok(notifyText(f, 'Zapisano listy do ZIP (plikow: 3)'), 'toast podsumowania');
  } finally {
    setDownloadImpl(null);
    captured.length = 0;
    await stopHarness();
  }
});
