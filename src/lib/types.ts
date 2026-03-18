export type MatchStatus = "scheduled" | "live" | "final";

export type Score = {
  home: number;
  away: number;
};

export type Fixture = {
  id: string;
  providerFixtureId: string;
  matchweekId: string;
  kickoffTime: string;
  homeTeam: string;
  awayTeam: string;
  status: MatchStatus;
  finalScore?: Score;
};

export type Matchweek = {
  id: string;
  season: string;
  weekNumber: number;
  label: string;
  start: string;
  deadline: string;
  end?: string;
};

export type User = {
  id: string;
  displayName: string;
};

export type Group = {
  id: string;
  name: string;
  adminUserId: string;
  inviteCode: string;
  description?: string;
};

export type GroupMember = {
  groupId: string;
  userId: string;
  role: "admin" | "member";
  joinedAt: string;
};

export type Pick = {
  groupId: string;
  matchweekId: string;
  fixtureId: string;
  userId: string;
  predictedHomeGoals: number;
  predictedAwayGoals: number;
};

export type Submission = {
  groupId: string;
  matchweekId: string;
  userId: string;
  submittedAt: string;
};

export type LeaderboardEntry = {
  userId: string;
  displayName: string;
  weeklyPoints: number;
  seasonPoints: number;
  perfectPicks: number;
  averageWeekly: number;
};
