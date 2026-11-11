/** Cykl zycia dynamicznego on-accent i obserwatora motywu. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { Window } from 'happy-dom';

import { installThemeColors } from '../src/arkmail/ui/themeColors';

const INDEX_SOURCE = readFileSync(
  join(__dirname, '..', '..', 'src', 'arkmail', 'index.ts'),
  'utf-8',
);

const tick = () => new Promise((resolve) => setTimeout(resolve, 0));

test('motyw: instalacja wylicza on-accent, reaguje na zmiane i sprzata', async () => {
  const window = new Window();
  const document = window.document;
  document.documentElement.style.setProperty('--popup-accent', 'rgb(255 215 0)');
  document.documentElement.style.setProperty('--popup-bg', 'rgb(20 20 20)');
  const root = document.createElement('div');
  document.body.appendChild(root);

  const cleanup = installThemeColors(root as unknown as HTMLElement);
  assert.equal(root.style.getPropertyValue('--arkmail-on-accent'), 'rgb(0, 0, 0)');

  document.documentElement.style.setProperty('--popup-accent', 'rgb(30 30 120)');
  await tick();
  assert.equal(root.style.getPropertyValue('--arkmail-on-accent'), 'rgb(255, 255, 255)');

  cleanup();
  document.documentElement.style.setProperty('--popup-accent', 'rgb(255 215 0)');
  await tick();
  assert.equal(root.style.getPropertyValue('--arkmail-on-accent'), 'rgb(255, 255, 255)');
  window.close();
});

test('motyw: pomiar odlozony do czasu osadzenia root w dokumencie', () => {
  const window = new Window();
  const document = window.document;
  document.documentElement.style.setProperty('--popup-accent', 'rgb(255 215 0)');
  document.documentElement.style.setProperty('--popup-bg', 'rgb(20 20 20)');
  const root = document.createElement('div');
  const originalGetComputedStyle = window.getComputedStyle.bind(window);
  const frames = new Map<number, FrameRequestCallback>();
  let nextFrame = 0;
  Object.assign(window, {
    requestAnimationFrame: (callback: FrameRequestCallback): number => {
      const handle = ++nextFrame;
      frames.set(handle, callback);
      return handle;
    },
    cancelAnimationFrame: (handle: number): void => {
      frames.delete(handle);
    },
    getComputedStyle: (element: Element) => {
      if (!root.isConnected) {
        return { color: '', backgroundColor: '' } as ReturnType<typeof window.getComputedStyle>;
      }
      return originalGetComputedStyle(element as never);
    },
  });
  const runNextFrame = (): void => {
    const next = frames.entries().next().value as [number, FrameRequestCallback] | undefined;
    assert.ok(next, 'oczekiwano zaplanowanej klatki pomiaru');
    frames.delete(next[0]);
    next[1](0);
  };

  const cleanup = installThemeColors(root as unknown as HTMLElement);
  assert.equal(root.style.getPropertyValue('--arkmail-on-accent'), '', 'odlaczony root nie ma pomiaru');
  runNextFrame();
  document.body.appendChild(root);
  for (let attempt = 0; attempt < 5 && frames.size > 0; attempt++) runNextFrame();
  assert.equal(root.style.getPropertyValue('--arkmail-on-accent'), 'rgb(0, 0, 0)');

  cleanup();
  assert.equal(frames.size, 0, 'sprzatanie anuluje odlozony pomiar');
  window.close();
});

test('motyw: jeden modul ma jeden MutationObserver dla html i body', () => {
  const source = readFileSync(
    join(__dirname, '..', '..', 'src', 'arkmail', 'ui', 'themeColors.ts'),
    'utf-8',
  );
  assert.equal((source.match(/new MutationObserver\(/g) ?? []).length, 1);
  assert.match(source, /observer\.observe\(document\.documentElement/);
  assert.match(source, /observer\.observe\(document\.body/);
  assert.match(source, /observer\.disconnect\(\)/);
});

test('motyw: index sprzata binding przy remouncie i destroy', () => {
  assert.match(INDEX_SOURCE, /import\s*\{\s*installThemeColors\s*\}\s*from\s*"\.\/ui\/themeColors"/);
  assert.match(INDEX_SOURCE, /let themeColorCleanup:\s*\(\(\)\s*=>\s*void\)\s*\|\s*null\s*=\s*null/);
  assert.ok((INDEX_SOURCE.match(/themeColorCleanup\?\.\(\)/g) ?? []).length >= 2);
  assert.match(INDEX_SOURCE, /root\.querySelector<HTMLElement>\("\.arkmail-root"\)/);
  assert.match(INDEX_SOURCE, /themeColorCleanup\s*=\s*installThemeColors\(themedRoot\)/);
  assert.doesNotMatch(INDEX_SOURCE, /installThemeColors\(root\)/, 'token nie moze zostac na kontenerze nadrzednym');
  assert.match(INDEX_SOURCE, /themeColorCleanup\s*=\s*null/);
});
