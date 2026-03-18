import { Fixture, LeaderboardEntry, Pick, Score, User } from "./types";

export function pickPoints(pick: Pick, finalScore: Score): number {
  return (
    Math.abs(pick.predictedHomeGoals - finalScore.home) +
    Math.abs(pick.predictedAwayGoals - finalScore.away)
  );
}

export function fixtureIsLocked(
  fixture: Fixture,
  now: Date = new Date(),
): boolean {
  return new Date(fixture.kickoffTime).getTime() <= now.getTime();
}

export function fixtureDeadline(fixtures: Fixture[]): Date | null {
  if (!fixtures.length) return null;
  const sorted = [...fixtures].sort(
    (a, b) =>
      new Date(a.kickoffTime).getTime() - new Date(b.kickoffTime).getTime(),
  );
  return new Date(sorted[0].kickoffTime);
}

export function buildLeaderboard(
  users: User[],
  picks: Pick[],
  fixtures: Fixture[],
): LeaderboardEntry[] {
  return users.map((user) => {
    const userPicks = picks.filter((pick) => pick.userId === user.id);

    let weeklyPoints = 0;
    let perfectPicks = 0;

    fixtures.forEach((fixture) => {
      if (!fixture.finalScore) return;
      const pick = userPicks.find((p) => p.fixtureId === fixture.id);
      if (!pick) return;
      const points = pickPoints(pick, fixture.finalScore);
      weeklyPoints += points;
      if (points === 0) perfectPicks += 1;
    });

    return {
      userId: user.id,
      displayName: user.displayName,
      weeklyPoints,
      seasonPoints: weeklyPoints,
      perfectPicks,
      averageWeekly: weeklyPoints,
    };
  });
}
