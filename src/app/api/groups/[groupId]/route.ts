import { NextResponse } from "next/server";
import { getGroupById, getMembersForGroup } from "@/lib/mock-data";

export async function GET(
  _request: Request,
  { params }: { params: { groupId: string } },
) {
  const group = getGroupById(params.groupId);
  if (!group) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  const members = getMembersForGroup(group.id);
  return NextResponse.json({ group, members });
}
