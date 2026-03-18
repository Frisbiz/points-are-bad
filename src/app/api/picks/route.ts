import { NextResponse } from "next/server";
import {
  currentUserId,
  getCurrentMatchweek,
  getGroupById,
  getPicksForGroupMatchweek,
} from "@/lib/mock-data";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const groupId = searchParams.get("groupId");
  if (!groupId || !getGroupById(groupId)) {
    return NextResponse.json({ error: "Missing or invalid groupId" }, { status: 400 });
  }
  const matchweek = getCurrentMatchweek();
  const picks = getPicksForGroupMatchweek(groupId, matchweek.id).filter(
    (p) => p.userId === currentUserId,
  );
  return NextResponse.json({ matchweekId: matchweek.id, picks });
}

export async function POST(request: Request) {
  const body = await request.json();
  // For now this just echoes the payload to show the expected shape.
  return NextResponse.json({
    message: "Persist picks here. This endpoint is mocked.",
    received: body,
  });
}
