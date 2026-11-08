// Trends and standings depend on finals, not the ticking clock of live matches.
export function finishedScoresKey(liveScores = {}) {
  return JSON.stringify(Object.entries(liveScores)
    .filter(([, match]) => match?.status === "finished")
    .sort(([a], [b]) => a.localeCompare(b)));
}

// Preserve React state identity when a poll returns the same score data.
export function retainUnchangedLiveScores(previous = {}, next = {}) {
  const previousKeys = Object.keys(previous);
  const nextKeys = Object.keys(next);
  if (previousKeys.length !== nextKeys.length) return next;
  return nextKeys.every(key => Object.hasOwn(previous, key) && JSON.stringify(previous[key]) === JSON.stringify(next[key]))
    ? previous : next;
}
