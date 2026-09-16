import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

function pngDimensions(path) {
  const file = readFileSync(new URL(`../${path}`, import.meta.url));
  assert.equal(file.subarray(1, 4).toString('ascii'), 'PNG');
  return [file.readUInt32BE(16), file.readUInt32BE(20)];
}

test('PWA manifest is installable and launches the dashboard', () => {
  const config = read('vite.config.js');
  assert.match(config, /VitePWA\s*\(/);
  assert.match(config, /name:\s*['"]Points Are Bad['"]/);
  assert.match(config, /short_name:\s*['"]PAB['"]/);
  assert.match(config, /start_url:\s*['"]\/dashboard['"]/);
  assert.match(config, /scope:\s*['"]\/['"]/);
  assert.match(config, /display:\s*['"]standalone['"]/);
  assert.match(config, /purpose:\s*['"]maskable['"]/);
});

test('service worker never caches or queues API traffic', () => {
  const config = read('vite.config.js');
  assert.match(config, /urlPattern:[\s\S]*\/api\/[\s\S]*handler:\s*['"]NetworkOnly['"]/);
  assert.match(config, /navigateFallbackDenylist/);
  assert.doesNotMatch(config, /BackgroundSync|backgroundSync|NetworkFirst[^\n]*api/i);
});

test('PWA install icons exist at their declared sizes', () => {
  for (const [path, size] of [
    ['public/pwa-192.png', 192],
    ['public/pwa-512.png', 512],
    ['public/pwa-maskable-512.png', 512],
  ]) {
    assert.equal(existsSync(new URL(`../${path}`, import.meta.url)), true, `${path} is missing`);
    assert.deepEqual(pngDimensions(path), [size, size]);
  }
});

test('app mounts connectivity and explicit update controls', () => {
  const main = read('src/main.jsx');
  const status = read('src/PwaStatus.jsx');
  assert.match(main, /<PwaStatus\s*\/>/);
  assert.match(status, /virtual:pwa-register\/react/);
  assert.match(status, /navigator\.onLine/);
  assert.match(status, /addEventListener\(['"]offline['"]/);
  assert.match(status, /addEventListener\(['"]online['"]/);
  assert.match(status, /updateServiceWorker\(true\)/);
  assert.match(status, />Update</);
  assert.match(status, />Later</);
  assert.match(status, /role=['"]status['"]/);
});

test('offline boot has branded explanation and retry', () => {
  const app = read('src/App.jsx');
  assert.match(app, /navigator\.onLine\s*===\s*false/);
  assert.match(app, /You.re offline/);
  assert.match(app, /picks and live scores/i);
  assert.match(app, /onClick=\{runBoot\}/);
});
