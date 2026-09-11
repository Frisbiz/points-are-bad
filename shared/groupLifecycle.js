import { getCurrentLeagueSeason } from './season.js';

export function fixtureBelongsToSeason(fixture, competition, season) {
  const time = Date.parse(fixture?.date);
  if (!Number.isFinite(time)) return true; // Unknown dates are not evidence of contamination.
  if (competition === 'WC') return new Date(time).getUTCFullYear() === Number(season);
  return getCurrentLeagueSeason(new Date(time)) === Number(season);
}

export function groupLifecycle(group, now = new Date()) {
  if (group?.completedAt || group?.status === 'completed') return 'completed';
  const season = Number(group?.season || 2025);
  const competition = group?.competition || 'PL';
  const ended = competition === 'WC'
    ? Number(now) > Date.UTC(season, 6, 20)
    : season < getCurrentLeagueSeason(now);
  if (!ended) return 'active';
  const fixtures = (group?.gameweeks || []).filter(w => Number(w.season || season) === season)
    .flatMap(w => w.fixtures || []).filter(f => fixtureBelongsToSeason(f, competition, season));
  return fixtures.length && fixtures.every(f => f.result || group.results?.[f.id] || ['FINISHED','CANCELLED','CANCELED'].includes(f.status))
    ? 'completed' : 'results-pending';
}

export function isPastGroup(group, now = new Date()) {
  return groupLifecycle(group, now) !== 'active';
}
