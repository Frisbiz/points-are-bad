export function syncSelectedGameweek(strip, selectedGW) {
  if (!strip) return false;

  const selected = strip.querySelector(`[data-gameweek="${selectedGW}"]`);
  if (!selected) return false;

  const stripRect = strip.getBoundingClientRect();
  const selectedRect = selected.getBoundingClientRect();
  const selectedCenter = selectedRect.left - stripRect.left
    + strip.scrollLeft
    + (selectedRect.width / 2);
  const centeredScrollLeft = Math.max(0, selectedCenter - (strip.clientWidth / 2));
  const maxScrollLeft = Number.isFinite(strip.scrollWidth)
    ? Math.max(0, strip.scrollWidth - strip.clientWidth)
    : centeredScrollLeft;

  strip.scrollLeft = Math.min(centeredScrollLeft, maxScrollLeft);
  return true;
}

export function observeSelectedGameweek(
  strip,
  selectedGW,
  ResizeObserverClass = globalThis.ResizeObserver,
) {
  syncSelectedGameweek(strip, selectedGW);

  if (!strip || typeof ResizeObserverClass !== "function") return () => {};

  const observer = new ResizeObserverClass(() => {
    syncSelectedGameweek(strip, selectedGW);
  });
  observer.observe(strip);

  return () => observer.disconnect();
}

export function gameweekStatus(gameweek, hiddenGameweeks = [], isAdmin = false, now = Date.now()) {
  if (!gameweek) return "empty";
  if (!isAdmin && hiddenGameweeks.includes(gameweek.gw)) return "locked";

  const fixtures = (gameweek.fixtures || []).filter(fixture => fixture.status !== "POSTPONED");
  if (!fixtures.length) return "empty";
  if (fixtures.every(fixture => Boolean(fixture.result))) return "complete";

  const hasStarted = fixtures.some(fixture => {
    if (fixture.result) return true;
    const status = String(fixture.status || "").toUpperCase();
    if (["LIVE", "IN_PLAY", "PAUSED", "FINISHED"].includes(status)) return true;
    const kickoff = Date.parse(fixture.date || "");
    return Number.isFinite(kickoff) && kickoff <= now;
  });

  return hasStarted ? "active" : "future";
}
