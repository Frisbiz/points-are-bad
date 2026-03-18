import { notFound } from "next/navigation";
import { PicksPanel } from "@/components/picks-panel";
import {
  currentUserId,
  getCurrentMatchweek,
  getFixturesForMatchweek,
  getGroupById,
  getMembersForGroup,
  getPicksForGroupMatchweek,
  getSubmissionsForGroupMatchweek,
} from "@/lib/mock-data";
import { formatDate } from "@/lib/format";

export default function PicksPage({
  params,
}: {
  params: { groupId: string };
}) {
  const group = getGroupById(params.groupId);
  if (!group) return notFound();

  const matchweek = getCurrentMatchweek();
  const fixtures = getFixturesForMatchweek(matchweek.id);
  const picks = getPicksForGroupMatchweek(group.id, matchweek.id);
  const myPicks = picks.filter((pick) => pick.userId === currentUserId);
  const members = getMembersForGroup(group.id);
  const submissions = getSubmissionsForGroupMatchweek(
    group.id,
    matchweek.id,
  );
  const hasSubmitted = submissions.some((s) => s.userId === currentUserId);

  return (
    <div className="grid gap-4 lg:grid-cols-[2fr_1fr]">
      <PicksPanel
        fixtures={fixtures}
        initialPicks={myPicks}
        hasSubmitted={hasSubmitted}
        submissionCount={submissions.length}
        totalMembers={members.length}
      />
      <aside className="card space-y-3 text-sm text-slate-300">
        <h3 className="text-base font-semibold text-slate-100">
          Rules for this matchweek
        </h3>
        <ul className="space-y-2">
          <li>• All fixtures must have a pick before submission.</li>
          <li>• Picks lock at kickoff per match.</li>
          <li>
            • Other players&apos; picks stay hidden until you submit all picks.
          </li>
          <li>
            • Deadline for first kickoff:{" "}
            <span className="font-semibold text-brand-secondary">
              {formatDate(matchweek.deadline)}
            </span>
          </li>
        </ul>
        <div className="rounded-lg border border-slate-800 bg-slate-900 px-3 py-2 text-xs text-slate-300">
          Final scores are pulled automatically from the data provider. Points
          update once each fixture finishes.
        </div>
      </aside>
    </div>
  );
}
