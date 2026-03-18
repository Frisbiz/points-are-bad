import { notFound } from "next/navigation";
import { formatScore } from "@/lib/format";
import { pickPoints } from "@/lib/scoring";
import {
  currentUserId,
  getCurrentMatchweek,
  getFixturesForMatchweek,
  getGroupById,
  getMembersForGroup,
  getPicksForGroupMatchweek,
  getSubmissionsForGroupMatchweek,
} from "@/lib/mock-data";
import { Fixture, Pick } from "@/lib/types";

export default async function TablePage({
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

  return (
    <div className="card space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-sm uppercase tracking-[0.2em] text-slate-400">
            Table
          </p>
          <h2 className="text-xl font-semibold">Group picks matrix</h2>
          <p className="text-sm text-slate-400">
            Picks unlock once you submit all fixtures for the matchweek.
          </p>
        </div>
        {!youSubmitted && (
          <span className="rounded-full bg-amber-500/10 px-3 py-1 text-xs text-amber-200">
            Submit all picks to reveal everyone else.
          </span>
        )}
      </div>

      <div className="overflow-x-auto">
        <table className="min-w-full text-sm">
          <thead>
            <tr className="text-left text-xs uppercase tracking-wide text-slate-400">
              <th className="px-3 py-2">Fixture</th>
              <th className="px-3 py-2">Actual</th>
              {members.map((member) => (
                <th key={member.userId} className="px-3 py-2">
                  {member.user.displayName}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800">
            {fixtures.map((fixture) => (
              <tr key={fixture.id}>
                <td className="px-3 py-3 text-sm font-semibold">
                  <span className="underline decoration-brand-secondary">
                    {fixture.homeTeam}
                  </span>{" "}
                  vs {fixture.awayTeam}
                </td>
                <td className="px-3 py-3 text-slate-300">
                  {fixture.finalScore
                    ? formatScore(
                        fixture.finalScore.home,
                        fixture.finalScore.away,
                      )
                    : "—"}
                </td>
                {members.map((member) => (
                  <PickCell
                    key={`${fixture.id}-${member.userId}`}
                    fixture={fixture}
                    pick={picks.find(
                      (p) =>
                        p.userId === member.userId &&
                        p.fixtureId === fixture.id,
                    )}
                    reveal={youSubmitted}
                  />
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function PickCell({
  fixture,
  pick,
  reveal,
}: {
  fixture: Fixture;
  pick?: Pick;
  reveal: boolean;
}) {
  if (!reveal) {
    return (
      <td className="px-3 py-3 text-slate-500">
        <span className="rounded-full bg-slate-800 px-2 py-1 text-[11px] uppercase tracking-wide">
          Hidden
        </span>
      </td>
    );
  }

  if (!pick) {
    return (
      <td className="px-3 py-3 text-slate-500">
        <span className="rounded bg-amber-500/10 px-2 py-1 text-[11px] uppercase text-amber-200">
          Missing
        </span>
      </td>
    );
  }

  const score = `${pick.predictedHomeGoals} - ${pick.predictedAwayGoals}`;
  const points =
    fixture.finalScore && pick
      ? pickPoints(pick, fixture.finalScore)
      : null;

  return (
    <td className="px-3 py-3">
      <div className="text-sm font-semibold text-slate-100">{score}</div>
      {points !== null && (
        <div className="text-xs text-slate-400">{points} pts</div>
      )}
    </td>
  );
}
