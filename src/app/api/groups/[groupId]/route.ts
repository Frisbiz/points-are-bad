import { NextResponse } from "next/server";
import { getGroupById, getMembersForGroup } from "@/lib/mock-data";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ groupId: string }> },
) {
  const { groupId } = await params;
  const group = getGroupById(groupId);
  if (!group) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  const members = getMembersForGroup(groupId);
  return NextResponse.json({ group, members });
}
