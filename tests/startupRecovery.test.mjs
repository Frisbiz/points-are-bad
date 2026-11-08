import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

function boot({ online = true, attempted = false } = {}) {
  const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
  const source = html.match(/<script id="startup-recovery">([\s\S]*?)<\/script>/)?.[1];
  assert.ok(source, 'startup recovery must run before the app module');
  const listeners = {};
  const timers = [];
  let reloads = 0;
  let updates = 0;
  const values = new Map(attempted ? [['pab-startup-retry', '1']] : []);
  const message = { hidden: true, firstElementChild: { textContent: '' } };
  const window = {
    addEventListener: (name, callback) => { listeners[name] = callback; },
    location: { reload: () => { reloads++; } },
    sessionStorage: {
      getItem: key => values.get(key) ?? null,
      setItem: (key, value) => values.set(key, value),
      removeItem: key => values.delete(key),
    },
    setTimeout: (callback, delay) => { timers.push({ callback, delay }); },
  };
  const navigator = { onLine: online, serviceWorker: { getRegistration: async () => ({ update: async () => { updates++; } }) } };
  const document = { getElementById: id => id === 'startup-recovery-message' ? message : null };
  vm.runInNewContext(source, { window, navigator, document, Promise });
  return { listeners, timers, message, get reloads() { return reloads; }, get updates() { return updates; } };
}

const failedModule = { target: { tagName: 'SCRIPT', type: 'module', src: 'https://example.com/assets/index.js' } };

test('a missing app module checks for an update and retries startup once', async () => {
  const app = boot();
  app.listeners.error(failedModule);
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(app.updates, 1);
  app.timers.find(timer => timer.delay === 1500).callback();
  assert.equal(app.reloads, 1);
});

test('a repeated startup failure does not cause a reload loop', async () => {
  const app = boot({ attempted: true });
  app.listeners.error(failedModule);
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(app.reloads, 0);
  assert.equal(app.message.hidden, false);
});

test('an offline startup failure offers recovery without reloading', () => {
  const app = boot({ online: false });
  app.listeners.error(failedModule);
  assert.equal(app.reloads, 0);
  assert.equal(app.message.hidden, false);
});
