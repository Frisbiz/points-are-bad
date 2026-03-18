import { NextResponse } from "next/server";
import {
  getCurrentMatchweek,
  getFixturesForMatchweek,
} from "@/lib/mock-data";

export async function GET() {
  const matchweek = getCurrentMatchweek();
  const fixtures = getFixturesForMatchweek(matchweek.id);
  return NextResponse.json({ matchweek, fixtures });
}
