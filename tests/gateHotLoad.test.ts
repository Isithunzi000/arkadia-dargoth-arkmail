import { test } from 'node:test';
import assert from 'node:assert/strict';

import { startHarness, stopHarness, click } from './harness';

/**
 * Fala 27: brama połączenia v3 — trzy defekty gate z Fali 25/26.
 *
 * A (hot-load w grze): pluginy Dargoth laduja sie hot-load
 * (PluginManager.loadPlugin -> init natychmiast po instalacji,
 * bez reloadu strony). Gdy gracz instaluje/enable'uje plugin BEDAC
 * w grze, sygnaly obecnosci (gmcp.char.info itd.) przeminely, zanim
 * plugin zdazyl je zasubskrybowac - brama zostaje rozbrojona na
 * zawsze i KAZDA komenda jest upuszczana w enqueue (timeout
 * "serwer nie odpowiedzial" po ~8 s).
 *
 * B (omitempty): proxy Go wysyla upstreamClosed WYLACZNIE gdy true
 * (json:"upstreamClosed,omitempty", proxy/session.go). Sesja zywa =
 * klucza nie ma w ramce, wiec warunek `upstreamClosed === false`
 * nigdy nie przechodzi i uzbrajanie na wznowieniu sesji (reload
 * strony w grze) nigdy nie odpala. Klient sam uzywa poprawnego
 * `!info.upstreamClosed` (PlayerIdentity.ts).
 *
 * C (anti-replay): attach do sesji zamknietej przez gre = proxy
 * odtwarza bufor (w tym stare envelope'y GMCP) i zamyka socket
 * (main.go). Odtworzone sygnaly obecnosci NIE MOGA uzbraiac bramy
 * na ekranie logowania - to bylby powrot buga 3 ("Nie ma takiej
 * postaci"). Ochrona: flaga lastUpstreamClosed kasowana wylacznie
 * przez client.connect albo attach z resumed && !upstreamClosed.
 */

test('A: install/enable pluginu W GRZE - pierwszy zywy envelope GMCP uzbraia brame', async () => {
  // skipArm = sygnaly obecnosci przeminely przed init (hot-load).
  const h = await startHarness({ skipArm: true });
  try {
    const { f, waitFor } = h;
    f.sent.length = 0;
    // Zaden z 4 sygnalow gate nie odpala sie ponownie - tylko zywy
    // ruch GMCP (char.state leci przy kazdym ticku postaci).
    f.fireEvent('gmcp', { path: 'char.state', value: { hp: 6, mana: 8 } });
    // Dowod uzbrojenia: przycisk indeksacji w archiwum odpala
    // fetchBoxes prosto przez transport - bez zadnego sygnalu gate.
    click(h, '[data-tab="archiwum"]');
    click(h, '.arkmail-index-all');
    await waitFor(() => f.sent.includes('listy odebrane'), 'brama uzbrojona na zywym GMCP, fetch leci');
  } finally {
    await stopHarness();
  }
});

test('C: replay GMCP z martwej sesji proxy NIE uzbraia bramy (ochrona buga 3)', async () => {
  const h = await startHarness();
  try {
    const { f } = h;
    f.sent.length = 0;
    f.fireEvent('client.disconnect', undefined);
    f.fireEvent('client.connect', undefined);
    // Proxy: attach do sesji zamknietej przez gre (idle/quit/restart).
    f.fireEvent('proxy.session', { type: 'attached', upstreamClosed: true, closeReason: 'idle timeout' });
    // Proxy odtwarza bufor: stare envelope'y z przed smierci sesji.
    // Zadne z nich nie moze uzbroic bramy na ekranie logowania.
    f.fireEvent('gmcp.char.info', { name: 'Foo' });
    f.fireEvent('gmcp.char.name', { name: 'Foo' });
    f.fireEvent('gmcp_msg.room.long', { name: 'Droga' });
    f.fireEvent('gmcp.mail.state', { unread: true, unreceived: false, unsent: false });
    await new Promise((r) => setTimeout(r, 50));
    assert.deepEqual(
      [...f.sent],
      [],
      'replay z martwej sesji: brama ma byc rozbrojona, zadna komenda nie wychodzi',
    );
    // Gracz loguje sie na swiezym polaczeniu: client.connect kasuje
    // flage, char.info uzbraia - plugin wraca do zycia.
    f.fireEvent('client.connect', undefined);
    f.fireEvent('gmcp.char.info', { name: 'Foo' });
    f.fireEvent('gmcp.mail.state', { unread: false, unreceived: false, unsent: false });
    await new Promise((r) => setTimeout(r, 50));
    assert.ok(
      f.sent.includes('listy odebrane'),
      'po swiezym zalogowaniu brama ma byc uzbrojona i refresh leci',
    );
  } finally {
    await stopHarness();
  }
});

test('B: proxy.session resumed BEZ klucza upstreamClosed (ksztalt produkcyjny Go) uzbraia', async () => {
  const h = await startHarness();
  try {
    const { f, waitFor } = h;
    f.sent.length = 0;
    f.fireEvent('client.disconnect', undefined);
    f.fireEvent('client.connect', undefined);
    // Dokladnie to wysyla Go przy zywej sesji: resumed, upstreamClosed
    // pominiety przez omitempty. Zadnego jawnego false.
    f.fireEvent('proxy.session', { type: 'attached', resumed: true });
    await waitFor(
      () => f.sent.includes('listy odebrane'),
      'uzbrojenie na wznowieniu sesji bez klucza upstreamClosed',
    );
  } finally {
    await stopHarness();
  }
});
