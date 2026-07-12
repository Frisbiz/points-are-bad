export const LIVE_POLL_INTERVAL_MS = 5_000;
export const FINALIZATION_RETRY_INTERVAL_MS = 60_000;
export const SCHEDULE_SYNC_INTERVAL_MS = 15 * 60_000;

export function setLiveSuccessCacheHeaders(res) {
  res.setHeader("Cache-Control", "public, max-age=0, must-revalidate");
  res.setHeader("Vercel-CDN-Cache-Control", "public, max-age=15, stale-while-revalidate=30");
}

export function shouldRunVisibleTask({ visibilityState, lastRunAt = 0, now = Date.now(), intervalMs }) {
  return visibilityState === "visible" && (!lastRunAt || now - lastRunAt >= intervalMs);
}

function optionalNumber(value) {
  if (value === null || value === undefined || value === "") return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function finishedLivePatch(liveMatch) {
  const homeScore = optionalNumber(liveMatch?.homeScore);
  const awayScore = optionalNumber(liveMatch?.awayScore);
  if (liveMatch?.status !== "finished" || homeScore === null || awayScore === null) return null;

  const patch = { result: `${homeScore}-${awayScore}`, status: "FINISHED" };
  const winningTeamId = liveMatch.winningTeamId ?? liveMatch.winnerTeamId;
  const homeShootoutScore = optionalNumber(liveMatch.homeShootoutScore ?? liveMatch.homePenaltyScore);
  const awayShootoutScore = optionalNumber(liveMatch.awayShootoutScore ?? liveMatch.awayPenaltyScore);
  if (winningTeamId) patch.winningTeamId = winningTeamId;
  if (liveMatch.winnerSide) patch.winnerSide = liveMatch.winnerSide;
  if (homeShootoutScore !== null) patch.homeShootoutScore = homeShootoutScore;
  if (awayShootoutScore !== null) patch.awayShootoutScore = awayShootoutScore;
  return patch;
}

export function hasUnpersistedFinishedLiveScores(group, liveScores = {}) {
  if (!group || !liveScores || Object.keys(liveScores).length === 0) return false;

  return (group.gameweeks || []).some(gameweek => (gameweek.fixtures || []).some(fixture => {
    const patch = finishedLivePatch(liveScores[`${fixture.home}|${fixture.away}`]);
    if (!patch) return false;
    return Object.entries(patch).some(([key, value]) => {
      if (key === "homeShootoutScore" || key === "awayShootoutScore") {
        return optionalNumber(fixture[key]) !== value;
      }
      return fixture[key] !== value;
    });
  }));
}
