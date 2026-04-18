import Link from "next/link";
import {
  getCurrentMatchweek,
  getGroupsForUser,
  getMembersForGroup,
} from "@/lib/mock-data";
import { formatDate } from "@/lib/format";
import { GroupActions } from "@/components/group-actions";

export default function GroupsPage() {
  const groups = getGroupsForUser();
  const matchweek = getCurrentMatchweek();

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-sm uppercase tracking-[0.2em] text-slate-400">
            Groups
          </p>
          <h1 className="text-3xl font-semibold">Your private leagues</h1>
          <p className="text-sm text-slate-400">
            Create a group or join with an invite code. Picks stay hidden until you submit.
          </p>
        </div>
        <div className="rounded-full border border-slate-800 px-4 py-2 text-sm text-slate-300">
          {matchweek.label} • Deadline {formatDate(matchweek.deadline)}
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-[2fr_1fr]">
        <div className="space-y-3">
          {groups.map((group, idx) => {
            const memberList = getMembersForGroup(group.id);
            return (
              <div key={group.id} className="card fade" style={{ animationDelay: `${idx * 0.06}s` }}>
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <p className="text-lg font-semibold">{group.name}</p>
                    <p className="text-sm text-slate-400">
                      {group.description}
                    </p>
                  </div>
                  <Link
                    href={`/groups/${group.id}/picks`}
                    className="rounded-full bg-gradient-to-r from-brand-primary to-brand-secondary px-4 py-2 text-sm font-semibold text-slate-950 hover:opacity-90"
                  >
                    Open group
                  </Link>
                </div>
                <div className="mt-3 flex flex-wrap items-center gap-3 text-sm text-slate-300">
                  <span className="rounded-full bg-slate-800 px-3 py-1">
                    {memberList.length} members
                  </span>
                  <span className="rounded-full border border-slate-800 px-3 py-1">
                    Invite code {group.inviteCode}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
        <GroupActions />
      </div>
    </div>
  );
}
