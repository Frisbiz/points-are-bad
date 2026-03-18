import { NextResponse } from "next/server";
import { buildLeaderboard } from "@/lib/scoring";
import {
  getCurrentMatchweek,
  getFixturesForMatchweek,
  getGroupById,
  getMembersForGroup,
  getPicksForGroupMatchweek,
} from "@/lib/mock-data";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const groupId = searchParams.get("groupId");
  if (!groupId || !getGroupById(groupId)) {
    return NextResponse.json({ error: "Missing or invalid groupId" }, { status: 400 });
  }

  const matchweek = getCurrentMatchweek();
  const fixtures = getFixturesForMatchweek(matchweek.id);
  const members = getMembersForGroup(groupId).map((m) => m.user);
  const picks = getPicksForGroupMatchweek(groupId, matchweek.id);
  const leaderboard = buildLeaderboard(members, picks, fixtures);

  return NextResponse.json({ leaderboard });
}
