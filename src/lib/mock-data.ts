import {
  Fixture,
  Group,
  GroupMember,
  Matchweek,
  Pick,
  Submission,
  User,
} from "./types";

const users: User[] = [
  { id: "u-me", displayName: "You" },
  { id: "u-sam", displayName: "Sam" },
  { id: "u-lee", displayName: "Lee" },
  { id: "u-riley", displayName: "Riley" },
];

const groups: Group[] = [
  {
    id: "g-friends",
    name: "Saturday FC",
    adminUserId: "u-me",
    inviteCode: "NLD9JK",
    description: "Predict every matchweek and roast whoever tops the table.",
  },
];

const members: GroupMember[] = [
  { groupId: "g-friends", userId: "u-me", role: "admin", joinedAt: "2024-08-01" },
  { groupId: "g-friends", userId: "u-sam", role: "member", joinedAt: "2024-08-01" },
  { groupId: "g-friends", userId: "u-lee", role: "member", joinedAt: "2024-08-02" },
  { groupId: "g-friends", userId: "u-riley", role: "member", joinedAt: "2024-08-04" },
];

const matchweeks: Matchweek[] = [
  {
    id: "mw-21-24",
    season: "2024/25",
    weekNumber: 21,
    label: "Matchweek 21",
    start: "2025-01-03T12:00:00Z",
    deadline: "2025-01-04T12:30:00Z",
    end: "2025-01-06T22:00:00Z",
  },
];

const fixtures: Fixture[] = [
  {
    id: "fx-001",
    providerFixtureId: "1234",
    matchweekId: "mw-21-24",
    kickoffTime: "2025-01-04T12:30:00Z",
    homeTeam: "Spurs",
    awayTeam: "Arsenal",
    status: "scheduled",
  },
  {
    id: "fx-002",
    providerFixtureId: "1235",
    matchweekId: "mw-21-24",
    kickoffTime: "2025-01-04T15:00:00Z",
    homeTeam: "Man City",
    awayTeam: "Chelsea",
    status: "final",
    finalScore: { home: 2, away: 1 },
  },
  {
    id: "fx-003",
    providerFixtureId: "1236",
    matchweekId: "mw-21-24",
    kickoffTime: "2025-01-04T17:30:00Z",
    homeTeam: "Liverpool",
    awayTeam: "Newcastle",
    status: "final",
    finalScore: { home: 3, away: 0 },
  },
  {
    id: "fx-004",
    providerFixtureId: "1237",
    matchweekId: "mw-21-24",
    kickoffTime: "2025-01-05T14:00:00Z",
    homeTeam: "Brighton",
    awayTeam: "West Ham",
    status: "scheduled",
  },
  {
    id: "fx-005",
    providerFixtureId: "1238",
    matchweekId: "mw-21-24",
    kickoffTime: "2025-01-06T20:00:00Z",
    homeTeam: "Aston Villa",
    awayTeam: "Man United",
    status: "scheduled",
  },
];

const picks: Pick[] = [
  // You
  {
    groupId: "g-friends",
    matchweekId: "mw-21-24",
    fixtureId: "fx-001",
    userId: "u-me",
    predictedHomeGoals: 2,
    predictedAwayGoals: 1,
  },
  {
    groupId: "g-friends",
    matchweekId: "mw-21-24",
    fixtureId: "fx-002",
    userId: "u-me",
    predictedHomeGoals: 2,
    predictedAwayGoals: 1,
  },
  {
    groupId: "g-friends",
    matchweekId: "mw-21-24",
    fixtureId: "fx-003",
    userId: "u-me",
    predictedHomeGoals: 2,
    predictedAwayGoals: 1,
  },
  {
    groupId: "g-friends",
    matchweekId: "mw-21-24",
    fixtureId: "fx-004",
    userId: "u-me",
    predictedHomeGoals: 1,
    predictedAwayGoals: 1,
  },
  {
    groupId: "g-friends",
    matchweekId: "mw-21-24",
    fixtureId: "fx-005",
    userId: "u-me",
    predictedHomeGoals: 1,
    predictedAwayGoals: 0,
  },
  // Sam
  {
    groupId: "g-friends",
    matchweekId: "mw-21-24",
    fixtureId: "fx-001",
    userId: "u-sam",
    predictedHomeGoals: 1,
    predictedAwayGoals: 1,
  },
  {
    groupId: "g-friends",
    matchweekId: "mw-21-24",
    fixtureId: "fx-002",
    userId: "u-sam",
    predictedHomeGoals: 1,
    predictedAwayGoals: 1,
  },
  {
    groupId: "g-friends",
    matchweekId: "mw-21-24",
    fixtureId: "fx-003",
    userId: "u-sam",
    predictedHomeGoals: 2,
    predictedAwayGoals: 2,
  },
  // Lee
  {
    groupId: "g-friends",
    matchweekId: "mw-21-24",
    fixtureId: "fx-001",
    userId: "u-lee",
    predictedHomeGoals: 2,
    predictedAwayGoals: 3,
  },
  {
    groupId: "g-friends",
    matchweekId: "mw-21-24",
    fixtureId: "fx-002",
    userId: "u-lee",
    predictedHomeGoals: 2,
    predictedAwayGoals: 0,
  },
  {
    groupId: "g-friends",
    matchweekId: "mw-21-24",
    fixtureId: "fx-003",
    userId: "u-lee",
    predictedHomeGoals: 3,
    predictedAwayGoals: 1,
  },
  // Riley
  {
    groupId: "g-friends",
    matchweekId: "mw-21-24",
    fixtureId: "fx-001",
    userId: "u-riley",
    predictedHomeGoals: 1,
    predictedAwayGoals: 2,
  },
  {
    groupId: "g-friends",
    matchweekId: "mw-21-24",
    fixtureId: "fx-002",
    userId: "u-riley",
    predictedHomeGoals: 3,
    predictedAwayGoals: 2,
  },
  {
    groupId: "g-friends",
    matchweekId: "mw-21-24",
    fixtureId: "fx-003",
    userId: "u-riley",
    predictedHomeGoals: 2,
    predictedAwayGoals: 0,
  },
];

const submissions: Submission[] = [
  { groupId: "g-friends", matchweekId: "mw-21-24", userId: "u-me", submittedAt: "2025-01-03T16:00:00Z" },
  { groupId: "g-friends", matchweekId: "mw-21-24", userId: "u-sam", submittedAt: "2025-01-03T17:00:00Z" },
  { groupId: "g-friends", matchweekId: "mw-21-24", userId: "u-lee", submittedAt: "2025-01-03T18:00:00Z" },
];

export const currentUserId = "u-me";

export function getCurrentUser(): User {
  return users.find((u) => u.id === currentUserId)!;
}

export function getGroupsForUser(userId: string = currentUserId) {
  const myGroupIds = members
    .filter((m) => m.userId === userId)
    .map((m) => m.groupId);
  return groups.filter((g) => myGroupIds.includes(g.id));
}

export function getGroupById(id: string) {
  return groups.find((g) => g.id === id) ?? null;
}

export function getMembersForGroup(groupId: string) {
  const groupMembers = members.filter((m) => m.groupId === groupId);
  return groupMembers.map((gm) => ({
    ...gm,
    user: users.find((u) => u.id === gm.userId)!,
  }));
}

export function getCurrentMatchweek(): Matchweek {
  return matchweeks[0];
}

export function getFixturesForMatchweek(matchweekId: string) {
  return fixtures
    .filter((f) => f.matchweekId === matchweekId)
    .sort(
      (a, b) =>
        new Date(a.kickoffTime).getTime() -
        new Date(b.kickoffTime).getTime(),
    );
}

export function getPicksForGroupMatchweek(
  groupId: string,
  matchweekId: string,
) {
  return picks.filter(
    (p) => p.groupId === groupId && p.matchweekId === matchweekId,
  );
}

export function getSubmissionsForGroupMatchweek(
  groupId: string,
  matchweekId: string,
) {
  return submissions.filter(
    (s) => s.groupId === groupId && s.matchweekId === matchweekId,
  );
}

export function getUsers() {
  return users;
}
