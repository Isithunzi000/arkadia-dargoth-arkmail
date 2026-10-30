import { test } from 'node:test';
import assert from 'node:assert/strict';

import { startHarness, stopHarness } from './harness';

/**
 * Fala 25 (blad 3, krytyczny): brama gry.
 *
 * client.connect odpala na OTWARCIU WebSocketa - takze na EKRANIE
 * LOGOWANIA, zanim gracz poda nazwe postaci. Login w kliencie jest
 * prompt-driven: KAZDA linia na ekranie logowania jest traktowana
 * jako nazwa postaci. Auto-refresh "listy ..." po connect ladowal
 * komende na prompt nazwy i zabijal logowanie ("Nie ma takiej
 * postaci" - potwierdzone przez dwoch graczy; dzialalo dopiero
 * czyszczenie danych + usuniecie pluginu + ctrl+r; z arkadia.rpg.pl
 * logowanie dzialalo, wiec to wina pluginu w kliencie).
 *
 * Oczekiwanie: connect kasuje operacje poprzedniej sesji, ale brame
 * otwieraja WYLACZNIE sygnaly potwierdzajace obecnosc w grze
 * (GMCP postaci / pokoju / stanu poczty) albo faktyczne wznowienie
 * sesji przez proxy (resumed && !upstreamClosed). Rozbrojenie:
 * client.disconnect oraz gmcp_msg.system.login (komunikat serwera
 * o zamknieciu sesji - wylapuje tez kick).
 */

test('brama gry: samo otwarcie polaczenia (client.connect) nic nie wysyla', async () => {
  const h = await startHarness();
  try {
    const { f } = h;
    f.sent.length = 0;
    f.fireEvent('client.disconnect', undefined);
    f.fireEvent('client.connect', undefined);
    await new Promise((r) => setTimeout(r, 30));
    assert.equal(
      f.sent.length,
      0,
      'na ekranie logowania plugin nie moze wysylac komend (bug 3: "Nie ma takiej postaci")',
    );
  } finally {
    await stopHarness();
  }
});

test('brama gry: gmcp_msg.system.login rozbraja brame (ostatnie zdarzenie wygrywa)', async () => {
  const h = await startHarness();
  try {
    const { f } = h;
    f.sent.length = 0;
    f.fireEvent('client.disconnect', undefined);
    f.fireEvent('gmcp.char.name', { name: 'Foo' });
    f.fireEvent('gmcp_msg.system.login', undefined);
    f.fireEvent('client.connect', undefined);
    await new Promise((r) => setTimeout(r, 30));
    assert.equal(
      f.sent.length,
      0,
      'po system.login zadne otwarcie polaczenia nie moze odswiezac skrzynek',
    );
  } finally {
    await stopHarness();
  }
});

test('brama gry: proxy.session (wznowienie sesji) uzbraja i odswieza skrzynki', async () => {
  const h = await startHarness();
  try {
    const { f, waitFor } = h;
    f.sent.length = 0;
    f.fireEvent('client.disconnect', undefined);
    f.fireEvent('client.connect', undefined);
    f.fireEvent('gmcp.char.info', { name: 'Foo' });
    f.fireEvent('proxy.session', { resumed: true, upstreamClosed: false });
    // Skrzynki leca sekwencyjnie (kazda czeka na odpowiedz poprzedniej),
    // wiec pierwsza komenda wystarczy jako dowod, ze brama jest otwarta
    // i auto-refresh wystartowal.
    await waitFor(() => f.sent.includes('listy odebrane'), 'auto-refresh po wznowieniu sesji');
  } finally {
    await stopHarness();
  }
});

test('brama gry: proxy.session po zamknieciu upstreamu (kick) nie uzbraja; wznowienie po zalogowaniu dziala', async () => {
  const h = await startHarness();
  try {
    const { f, waitFor } = h;
    f.sent.length = 0;
    f.fireEvent('client.disconnect', undefined);
    f.fireEvent('proxy.session', { resumed: true, upstreamClosed: true });
    f.fireEvent('client.connect', undefined);
    await new Promise((r) => setTimeout(r, 30));
    assert.equal(f.sent.length, 0, 'kick = upstream zamkniety, brak autoryzacji do wysylki');
    f.fireEvent('gmcp.char.info', { name: 'Foo' });
    f.fireEvent('proxy.session', { resumed: true, upstreamClosed: false });
    await waitFor(() => f.sent.includes('listy odebrane'), 'odswiezenie po faktycznym zalogowaniu');
  } finally {
    await stopHarness();
  }
});
