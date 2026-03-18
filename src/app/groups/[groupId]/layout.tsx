import { ReactNode } from "react";
import { notFound } from "next/navigation";
import { GroupTabs } from "@/components/group-tabs";
import { formatDate } from "@/lib/format";
import {
  currentUserId,
  getCurrentMatchweek,
  getGroupById,
  getMembersForGroup,
  getSubmissionsForGroupMatchweek,
} from "@/lib/mock-data";

export default async function GroupLayout({
  children,
  params,
}: {
  children: ReactNode;
  params: Promise<{ groupId: string }>;
}) {
  const { groupId } = await params;
  const group = getGroupById(groupId);
  if (!group) return notFound();

  const matchweek = getCurrentMatchweek();
  const members = getMembersForGroup(group.id);
  const submissions = getSubmissionsForGroupMatchweek(
    group.id,
    matchweek.id,
  );
  const youSubmitted = submissions.some((s) => s.userId === currentUserId);

  return (
    <div className="space-y-6">
      <div className="card space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-sm uppercase tracking-[0.2em] text-slate-400">
              Group
            </p>
            <h1 className="text-2xl font-semibold">{group.name}</h1>
            <p className="text-sm text-slate-400">{group.description}</p>
          </div>
          <div className="flex flex-wrap items-center gap-2 text-sm text-slate-300">
            <span className="rounded-full border border-slate-800 px-3 py-1">
              {members.length} players
            </span>
            <span className="rounded-full border border-slate-800 px-3 py-1">
              Invite {group.inviteCode}
            </span>
            <span className="rounded-full border border-brand-secondary/60 bg-brand-secondary/10 px-3 py-1 text-brand-secondary">
              {submissions.length} of {members.length} submitted
            </span>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-3 text-sm text-slate-300">
          <span className="rounded-full bg-slate-800 px-3 py-1">
            {matchweek.label}
          </span>
          <span className="rounded-full bg-slate-800 px-3 py-1">
            Deadline {formatDate(matchweek.deadline)}
          </span>
          <span
            className={`rounded-full px-3 py-1 ${
              youSubmitted
                ? "bg-green-400/20 text-green-200"
                : "bg-amber-400/20 text-amber-200"
            }`}
          >
            {youSubmitted ? "You submitted" : "Submit picks to reveal others"}
          </span>
        </div>
        <GroupTabs basePath={`/groups/${groupId}`} />
      </div>
      {children}
    </div>
  );
}
