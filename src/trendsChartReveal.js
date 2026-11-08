export function observeTrendsCharts(root, browser = globalThis) {
  if (!root || !browser.IntersectionObserver || browser.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return () => {};

  const pending = new Map();
  const observer = new browser.IntersectionObserver(entries => {
    for (const { target, isIntersecting } of entries) {
      const state = pending.get(target);
      if (!state) continue;
      state.visible = isIntersecting;
      state.reveal();
    }
  }, { threshold: 0.1 });

  for (const chart of root.querySelectorAll('.recharts-responsive-container')) {
    const state = { visible: false, mutation: null, reveal: null };
    state.reveal = () => {
      if (!pending.has(chart) || !state.visible || !chart.querySelector('svg')) return;
      state.mutation?.disconnect();
      pending.delete(chart);
      observer.unobserve(chart);
      chart.classList.add('trends-chart-revealed');
    };
    pending.set(chart, state);
    if (browser.MutationObserver) {
      state.mutation = new browser.MutationObserver(state.reveal);
      state.mutation.observe(chart, { childList: true, subtree: true });
    }
    observer.observe(chart);
  }

  return () => {
    observer.disconnect();
    for (const state of pending.values()) state.mutation?.disconnect();
    pending.clear();
  };
}
