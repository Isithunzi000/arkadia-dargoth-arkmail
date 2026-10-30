import { test } from 'node:test';
import assert from 'node:assert/strict';

import { startHarness, stopHarness, type Harness } from './harness';

/**
 * Fala 26: rozbrojenie bramy na proxy.session z upstreamClosed=true.
 *
 * Klient po kicku dostaje ramke kontrolna proxy ZANIM gra narysuje
 * ekran logowania i zanim doleci gmcp_msg.system.login: albo
 * {Type:'ended', UpstreamClosed:true}, albo {Type:'attached',
 * UpstreamClosed:true} przy ponownym attachu (proxy/session.go).
 *
 * Realistyczny scenariusz szczeliny: gracz jest w recznym trybie
 * poczty (pager), w tym czasie przychodzi powiadomienie POCZTA -
 * odswiezenie parkuje (Fala 24f2). Wtedy nadchodzi kick. Gdy gracz
 * wychodzi z poczty ("q"), zaparkowany drenaz chce leciec - na
 * martwym upstrimie, zanim dotrze system.login. Guard generacji
 * lagodzil skutki (operacja padala i sie czyscila), ale brama ma
 * byc rozbrojona od razu, skoro proxy wprost mowi, ze gra zamknela
 * polaczenie.
 *
 * Uwaga: gmcp.mail.state jest JEDNOCZESNIE sygnalem uzbrajajacym
 * (Fala 25) i zrodlem parkowanego refresha, wiec intruzem w tescie
 * NIE moze byc kolejne powiadomienie Mail.State - ono samo by
 * ponownie uzbroilo brame. W scenariuszu realnym gra w szczelinie
 * i tak nie wysyla GMCP (upstream martwy); realnym zrodlem ruchu
 * jest drenaz zaparkowany PRZED kickiem, wypluwany po wyjsciu z
 * trybu poczty gracza.
 */

const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

async function expectSilentDrainAfterKick(
  kickFrame: Record<string, unknown>,
  label: string,
): Promise<void> {
  const h: Harness = await startHarness();
  try {
    const { f } = h;
    // Sesja w grze: brama uzbrojona.
    f.fireEvent('client.disconnect', undefined);
    f.fireEvent('client.connect', undefined);
    f.fireEvent('gmcp.char.info', { name: 'Foo' });
    // Gracz wchodzi w poczte recznie; powiadomienie parkuje odswiezenie.
    f.fire('→ listy');
    f.fire(' [ POCZTA ] Masz nowa poczte od Foo.', 'mail');
    await sleep(300);
    assert.deepEqual(f.sent, [], 'w recznym trybie poczty nic nie wychodzi (parkowane)');
    // Kick: gra zamknela upstream; ramka kontrolna przychodzi przed
    // ekranem logowania / system.login. Brak client.disconnect (to
    // scenariusz, w ktorym socket do proxy zyje, martwy jest upstream).
    f.fireEvent('proxy.session', kickFrame);
    // Gracz wychodzi z poczty: drenaz zaparkowanego refresha.
    f.fire('→ q');
    await sleep(300);
    assert.deepEqual(
      f.sent,
      [],
      `${label}: po ramce upstreamClosed=true brama ma byc rozbrojona natychmiast - drenaz po "q" nie wychodzi`,
    );
  } finally {
    await stopHarness();
  }
}

test('brama gry: proxy.session ended z upstreamClosed=true rozbraja natychmiast, wczesniej niz system.login', async () => {
  await expectSilentDrainAfterKick({ type: 'ended', upstreamClosed: true }, 'ended');
});

test('brama gry: proxy.session attached z upstreamClosed=true (ponowny attach po kicku) tez rozbraja', async () => {
  await expectSilentDrainAfterKick(
    { type: 'attached', resumed: false, upstreamClosed: true },
    'attached',
  );
});
