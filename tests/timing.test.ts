import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  cancelFlag,
  clearWaitDiagnostics,
  DownloadEta,
  readWaitDiagnostics,
  waitOrCancel,
  type CancellationFlag,
} from '../src/arkmail/core/timing';

interface FakeTimer {
  callback: () => void;
  ms: number;
  cleared: boolean;
}

async function withFakeClock(
  run: (timers: FakeTimer[], setNow: (value: number) => void) => Promise<void>,
): Promise<void> {
  const realSetTimeout = globalThis.setTimeout;
  const realClearTimeout = globalThis.clearTimeout;
  const realNow = Date.now;
  const timers: FakeTimer[] = [];
  let now = 1000;
  try {
    Date.now = () => now;
    globalThis.setTimeout = ((callback: () => void, ms = 0) => {
      const timer = { callback, ms, cleared: false };
      timers.push(timer);
      return timer as unknown as ReturnType<typeof setTimeout>;
    }) as typeof setTimeout;
    globalThis.clearTimeout = ((handle: ReturnType<typeof setTimeout>) => {
      (handle as unknown as FakeTimer).cleared = true;
    }) as typeof clearTimeout;
    clearWaitDiagnostics();
    await run(timers, (value) => {
      now = value;
    });
  } finally {
    globalThis.setTimeout = realSetTimeout;
    globalThis.clearTimeout = realClearTimeout;
    Date.now = realNow;
    clearWaitDiagnostics();
  }
}

test('pauza: jeden timer rejestruje planowany i rzeczywisty czas', async () => {
  await withFakeClock(async (timers, setNow) => {
    const flag: CancellationFlag = { cancelled: false };
    const pending = waitOrCancel(400, flag, 'pobieranie');
    assert.deepEqual(timers.map((timer) => timer.ms), [400]);
    assert.equal(flag.waiters?.size, 1);

    setNow(1475);
    timers[0]!.callback();
    await pending;

    assert.equal(timers[0]!.cleared, true, 'timer jest sprzatany takze po sukcesie');
    assert.equal(flag.waiters?.size, 0);
    assert.deepEqual(readWaitDiagnostics(), [
      { stage: 'pobieranie', plannedMs: 400, actualMs: 475, outcome: 'wykonano' },
    ]);

    timers[0]!.callback();
    assert.equal(readWaitDiagnostics().length, 1, 'spoznione wywolanie nie tworzy kolejnego etapu');
    assert.equal(timers.length, 1, 'nie ma timera nadrabiajacego opoznienie');
  });
});

test('pauza: anulowanie natychmiast zdejmuje timer i nasluch', async () => {
  await withFakeClock(async (timers, setNow) => {
    const flag: CancellationFlag = { cancelled: false };
    let cancel: (() => void) | null = null;
    let removed = 0;
    const pending = waitOrCancel(400, flag, 'skan', (callback) => {
      cancel = callback;
      return () => {
        removed += 1;
      };
    });

    setNow(1125);
    cancel!();
    await pending;

    assert.equal(flag.cancelled, true);
    assert.equal(timers[0]!.cleared, true);
    assert.equal(removed, 1);
    assert.equal(flag.waiters?.size, 0);
    assert.deepEqual(readWaitDiagnostics(), [
      { stage: 'skan', plannedMs: 400, actualMs: 125, outcome: 'anulowano' },
    ]);

    cancelFlag(flag);
    assert.equal(removed, 1, 'ponowne anulowanie nie powtarza sprzatania');
  });
});

test('pauza: wczesniej anulowana flaga nie pozostawia aktywnego timera', async () => {
  await withFakeClock(async (timers) => {
    const flag: CancellationFlag = { cancelled: true };
    await waitOrCancel(400, flag, 'pobieranie');
    assert.equal(timers.length, 1);
    assert.equal(timers[0]!.cleared, true);
    assert.equal(readWaitDiagnostics()[0]?.outcome, 'anulowano');
  });
});

test('ETA: reset odcina stara probke i zachowuje nowy pomiar', () => {
  const eta = new DownloadEta(0);
  assert.equal(eta.sample(100, 1, 20), null);
  assert.equal(eta.sample(300, 2, 20), null);
  assert.equal(eta.sample(600, 3, 20), 3077);

  eta.reset(10_000);
  assert.equal(eta.sample(10_100, 4, 20), 1600, 'prognoza korzysta wylacznie z nowego interwalu');
  assert.equal(eta.sample(10_300, 5, 20), 1950, 'kolejne zakonczenie buduje nowa EMA');
});
