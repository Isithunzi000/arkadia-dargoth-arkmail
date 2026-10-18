/**
 * Wiring szerokosci popupu -> uklad (Fala 10c): ResizeObserver na
 * kontenerze popupu ustawia store.wide (prog 900px). Startowy rozmiar
 * popupu otwiera go dwupanelowego na normalnym ekranie, a na komorce
 * waskiego (80vw); rozmiar ustawiony przez gracza zawsze wygrywa
 * (gwarantuje API Dargotha).
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { startHarness, stopHarness } from './harness';

type ROEntry = { contentRect: { width: number } };
type ROCallback = (entries: ROEntry[], obs: unknown) => void;

class FakeRO {
  static instances: FakeRO[] = [];
  readonly cb: ROCallback;
  readonly observed: unknown[] = [];
  disconnected = false;
  constructor(cb: ROCallback) {
    this.cb = cb;
    FakeRO.instances.push(this);
  }
  observe(el: unknown): void {
    this.observed.push(el);
  }
  disconnect(): void {
    this.disconnected = true;
  }
}

test('wide-watch: ResizeObserver ustawia uklad, startowy rozmiar dwupanelowy', async () => {
  FakeRO.instances = [];
  (globalThis as { ResizeObserver?: unknown }).ResizeObserver = FakeRO;
  try {
    const h = await startHarness();
    const cfg = h.f.popupConfig as unknown as { initialWidth: string; initialHeight: string };
    assert.equal(cfg.initialWidth, 'min(1400px, 85vw)', 'start: szeroki, dwupanelowy');
    assert.equal(cfg.initialHeight, 'min(850px, 80vh)');
    assert.equal(FakeRO.instances.length, 1, 'obserwator podpiety pod kontener popupu');
    const ro = FakeRO.instances[0]!;
    assert.equal(ro.observed.length, 1);
    assert.ok(!h.content.querySelector('.arkmail-wide'), 'przed pomiarem: uklad waski');
    ro.cb([{ contentRect: { width: 1200 } }], ro);
    assert.ok(h.content.querySelector('.arkmail-wide'), '>= 900px: dwa panele');
    ro.cb([{ contentRect: { width: 500 } }], ro);
    assert.ok(!h.content.querySelector('.arkmail-wide'), '< 900px: jeden panel');
    await stopHarness();
    assert.ok(ro.disconnected, 'destroy odpina obserwatora');
  } finally {
    delete (globalThis as { ResizeObserver?: unknown }).ResizeObserver;
  }
});
