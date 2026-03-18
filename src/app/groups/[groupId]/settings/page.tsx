import { notFound } from "next/navigation";
import {
  currentUserId,
  getGroupById,
  getMembersForGroup,
} from "@/lib/mock-data";
import { SettingsForm } from "./settings-form";

export default function SettingsPage({
  params,
}: {
  params: { groupId: string };
}) {
  const group = getGroupById(params.groupId);
  if (!group) return notFound();

  const member = getMembersForGroup(group.id).find(
    (m) => m.userId === currentUserId,
  );

  return (
    <div className="card space-y-4">
      <div>
        <p className="text-sm uppercase tracking-[0.2em] text-slate-400">
          Settings
        </p>
        <h2 className="text-xl font-semibold">Profile & group</h2>
        <p className="text-sm text-slate-400">
          Update your display name or leave the group.
        </p>
      </div>
      <SettingsForm initialDisplayName={member?.user.displayName ?? ""} />
    </div>
  );
}
