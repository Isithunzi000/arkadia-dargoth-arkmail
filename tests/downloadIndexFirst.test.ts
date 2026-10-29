/** Pobieranie tresci uzywa aktualnej bazy i nie uruchamia indeksacji. */
import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  startHarness,
  stopHarness,
  loadTruncatedBox,
  click,
  waitRt,
  notifyText,
  type Harness,
} from './harness';

const ERROR_LINE = 'Data zostala podana w zlym formacie.';

const anchors = (h: Harness): string[] =>
  h.f.sent.filter((c) => / przed \d+ [IVX]+ \d{4}$/.test(c));

const downloadBtn = (h: Harness): { dispatchEvent(e: unknown): void } => {
  const b = h.content.querySelector('.arkmail-arch-download') as unknown as {
    dispatchEvent(e: unknown): void;
  } | null;
  assert.ok(b, 'przycisk pobierania istnieje');
  return b;
};

function clickDownloadTwice(h: Harness): void {
  click(h, '[data-tab="archiwum"]');
  downloadBtn(h).dispatchEvent(new h.window.Event('click'));
  downloadBtn(h).dispatchEvent(new h.window.Event('click'));
}

test('pobieranie tresci: bez automatycznej indeksacji, z re-kotwicami dostepnych wpisow', async () => {
  const h = await startHarness();
  const { f } = h;
  try {
    await loadTruncatedBox(h);
    const listingCount = f.sent.filter((c) => c === 'listy odebrane').length;
    clickDownloadTwice(h);

    await waitRt(() => anchors(h).length === 1, 'pierwsza re-kotwica pobierania');
    assert.equal(
      f.sent.filter((c) => c === 'listy odebrane').length,
      listingCount,
      'pobieranie nie dodaje listingu indeksacyjnego',
    );
    assert.ok(!notifyText(f, 'najpierw indeksuje'), 'brak starego komunikatu');

    for (let n = 1; n <= 3; n++) {
      await waitRt(() => anchors(h).length === n, `re-kotwica ${n}`);
      f.fire(ERROR_LINE, 'mail');
    }
    await waitRt(
      () => notifyText(f, 'Przerwano pobieranie - serwer poczty nie odpowiada'),
      'breaker domyka petle',
    );
  } finally {
    await stopHarness();
  }
});
