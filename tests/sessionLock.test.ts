/**
 * SessionLock: mutex serializujacy transakcje pocztowe na wspoldzielonym
 * transporcie (pager i edytor konsumuja caly wejsciowy strumien gry,
 * wiec dwie sesje naraz bylyby katastrofa).
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { SessionLock } from '../src/arkmail/core/sessionLock';

test('lock: wzajemne wykluczanie - drugi nabywca czeka na zwolnienie', async () => {
  const lock = new SessionLock();
  const order: string[] = [];
  const release1 = await lock.acquire();
  order.push('a-start');
  assert.equal(lock.locked, true);
  const p2 = (async () => {
    const release2 = await lock.acquire();
    order.push('b-start');
    release2();
  })();
  await new Promise((r) => setImmediate(r));
  assert.deepEqual(order, ['a-start'], 'b nie moze wejsc, gdy a trzyma');
  release1();
  await p2;
  assert.deepEqual(order, ['a-start', 'b-start']);
  assert.equal(lock.locked, false);
});

test('lock: kolejka FIFO trzech nabywcow', async () => {
  const lock = new SessionLock();
  const order: string[] = [];
  const hold = await lock.acquire();
  const p1 = lock.acquire().then((r) => { order.push('pierwszy'); r(); });
  const p2 = lock.acquire().then((r) => { order.push('drugi'); r(); });
  await new Promise((r) => setImmediate(r));
  hold();
  await Promise.all([p1, p2]);
  assert.deepEqual(order, ['pierwszy', 'drugi']);
});

test('lock: runExclusive serializuje i zwalnia mimo bledu', async () => {
  const lock = new SessionLock();
  assert.equal(await lock.runExclusive(async () => 42), 42);
  await assert.rejects(
    lock.runExclusive(async () => { throw new Error('boom'); }),
    /boom/,
  );
  assert.equal(lock.locked, false, 'blad nie moze zostawic zamknietej blokady');
  assert.equal(await lock.runExclusive(async () => 'ok'), 'ok');
});

test('lock: zwolnienie jest idempotentne', async () => {
  const lock = new SessionLock();
  const release = await lock.acquire();
  release();
  release();
  assert.equal(lock.locked, false);
});
