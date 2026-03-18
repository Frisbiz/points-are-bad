import { notFound } from "next/navigation";
import { buildLeaderboard } from "@/lib/scoring";
import {
  currentUserId,
  getCurrentMatchweek,
  getFixturesForMatchweek,
  getGroupById,
  getMembersForGroup,
  getPicksForGroupMatchweek,
  getSubmissionsForGroupMatchweek,
} from "@/lib/mock-data";

export default async function InsightsPage({
  params,
}: {
  params: Promise<{ groupId: string }>;
}) {
  const { groupId } = await params;
  const group = getGroupById(groupId);
  if (!group) return notFound();

  const matchweek = getCurrentMatchweek();
  const fixtures = getFixturesForMatchweek(matchweek.id);
  const members = getMembersForGroup(group.id);
  const picks = getPicksForGroupMatchweek(group.id, matchweek.id);
  const submissions = getSubmissionsForGroupMatchweek(
    group.id,
    matchweek.id,
  );
  const youSubmitted = submissions.some((s) => s.userId === currentUserId);

  const leaderboard = buildLeaderboard(
    members.map((m) => m.user),
    picks,
    fixtures,
  );

  const weekly = [...leaderboard].sort(
    (a, b) => a.weeklyPoints - b.weeklyPoints,
  );
  const perfects = [...leaderboard].sort(
    (a, b) => b.perfectPicks - a.perfectPicks,
  );
  const averages = [...leaderboard].sort(
    (a, b) => a.averageWeekly - b.averageWeekly,
  );

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <InsightCard
        title="Current matchweek leaderboard"
        subtitle={
          youSubmitted
            ? "Live totals show points from finished fixtures."
            : "Submit picks to see current-week standings."
        }
      >
        <ul className="space-y-2">
          {weekly.map((entry, index) => (
            <li
              key={entry.userId}
              className="flex items-center justify-between rounded-lg border border-slate-800 bg-slate-900/70 px-3 py-2 text-sm"
            >
              <span className="flex items-center gap-2">
                <span className="text-xs text-slate-500">
                  #{index + 1}
                </span>
                <span>{entry.displayName}</span>
              </span>
              <span className="font-semibold">
                {youSubmitted ? `${entry.weeklyPoints} pts` : "Locked"}
              </span>
            </li>
          ))}
        </ul>
      </InsightCard>

      <InsightCard
        title="Season-to-date"
        subtitle="Totals roll up every completed matchweek. (Static sample)"
      >
        <ul className="space-y-2">
          {weekly.map((entry, index) => (
            <li
              key={entry.userId}
              className="flex items-center justify-between rounded-lg border border-slate-800 bg-slate-900/70 px-3 py-2 text-sm"
            >
              <span className="flex items-center gap-2">
                <span className="text-xs text-slate-500">
                  #{index + 1}
                </span>
                <span>{entry.displayName}</span>
              </span>
              <span className="font-semibold">{entry.seasonPoints} pts</span>
            </li>
          ))}
        </ul>
      </InsightCard>

      <InsightCard
        title="Average weekly points"
        subtitle="Lower is better. Based on available matchweeks."
      >
        <ul className="space-y-2">
          {averages.map((entry) => (
            <li
              key={entry.userId}
              className="flex items-center justify-between rounded-lg border border-slate-800 bg-slate-900/70 px-3 py-2 text-sm"
            >
              <span>{entry.displayName}</span>
              <span className="font-semibold">
                {entry.averageWeekly.toFixed(1)}
              </span>
            </li>
          ))}
        </ul>
      </InsightCard>

      <InsightCard
        title="Perfect picks leaderboard"
        subtitle="Count of 0-point matches."
      >
        <ul className="space-y-2">
          {perfects.map((entry) => (
            <li
              key={entry.userId}
              className="flex items-center justify-between rounded-lg border border-slate-800 bg-slate-900/70 px-3 py-2 text-sm"
            >
              <span>{entry.displayName}</span>
              <span className="font-semibold">
                {entry.perfectPicks} perfect
              </span>
            </li>
          ))}
        </ul>
      </InsightCard>
    </div>
  );
}

function InsightCard({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle: string;
  children: React.ReactNode;
}) {
  return (
    <div className="card space-y-3">
      <div>
        <p className="text-xs uppercase tracking-[0.2em] text-slate-400">
          Insights
        </p>
        <h3 className="text-lg font-semibold">{title}</h3>
        <p className="text-sm text-slate-400">{subtitle}</p>
      </div>
      {children}
    </div>
  );
}
