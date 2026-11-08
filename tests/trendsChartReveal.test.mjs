import test from 'node:test';
import assert from 'node:assert/strict';
import { observeTrendsCharts } from '../src/trendsChartReveal.js';

test('a chart reveals only after it is visible and its graphic exists, and only once', () => {
  let intersectionCallback, mutationCallback;
  let hasSvg = false;
  const added = [];
  const chart = {
    querySelector: () => hasSvg ? {} : null,
    classList: { add: name => added.push(name) },
  };
  const root = { querySelectorAll: () => [chart] };
  class Intersection {
    constructor(callback) { intersectionCallback = callback; }
    observe() {}
    unobserve() {}
    disconnect() {}
  }
  class Mutation {
    constructor(callback) { mutationCallback = callback; }
    observe() {}
    disconnect() {}
  }
  const cleanup = observeTrendsCharts(root, { IntersectionObserver: Intersection, MutationObserver: Mutation });
  assert.deepEqual(added, []);
  intersectionCallback([{ target: chart, isIntersecting: true }]);
  assert.deepEqual(added, []);
  hasSvg = true;
  mutationCallback();
  assert.deepEqual(added, ['trends-chart-revealed']);
  intersectionCallback([{ target: chart, isIntersecting: true }]);
  mutationCallback();
  assert.deepEqual(added, ['trends-chart-revealed']);
  cleanup();
});

test('a chart does not reveal before entering the viewport, even when its graphic is ready', () => {
  let intersectionCallback;
  const added = [];
  const chart = { querySelector: () => ({}), classList: { add: name => added.push(name) } };
  class Intersection {
    constructor(callback) { intersectionCallback = callback; }
    observe() {}
    unobserve() {}
    disconnect() {}
  }
  const cleanup = observeTrendsCharts({ querySelectorAll: () => [chart] }, { IntersectionObserver: Intersection });
  intersectionCallback([{ target: chart, isIntersecting: false }]);
  assert.deepEqual(added, []);
  intersectionCallback([{ target: chart, isIntersecting: true }]);
  assert.deepEqual(added, ['trends-chart-revealed']);
  cleanup();
});

test('reduced motion leaves charts visible without scheduling animations', () => {
  const chart = { classList: { add: () => assert.fail('should not animate') } };
  const cleanup = observeTrendsCharts({ querySelectorAll: () => [chart] }, {
    IntersectionObserver: class { constructor() { assert.fail('should not observe'); } },
    matchMedia: () => ({ matches: true }),
  });
  cleanup();
});
