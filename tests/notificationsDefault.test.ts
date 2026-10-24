import { test } from 'node:test';
import assert from 'node:assert/strict';

import { startHarness, stopHarness } from './harness';

const notificationToggle = (content: unknown): { checked: boolean } => {
  const toggle = (content as { querySelector(s: string): unknown }).querySelector(
    '.arkmail-notify-toggle',
  ) as { checked: boolean } | null;
  assert.ok(toggle, 'przelacznik powiadomien istnieje');
  return toggle;
};

test('powiadomienia: bez zapisanej preferencji sa wlaczone', async () => {
  const h = await startHarness();
  try {
    assert.equal(notificationToggle(h.content).checked, true);
  } finally {
    await stopHarness();
  }
});

test('powiadomienia: zapisane wylaczenie zostaje zachowane', async () => {
  const h = await startHarness({ notifyEnabled: false });
  try {
    assert.equal(notificationToggle(h.content).checked, false);
  } finally {
    await stopHarness();
  }
});
