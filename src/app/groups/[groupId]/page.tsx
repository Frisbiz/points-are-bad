import { redirect } from "next/navigation";

export default function GroupIndex({
  params,
}: {
  params: { groupId: string };
}) {
  redirect(`/groups/${params.groupId}/picks`);
}
