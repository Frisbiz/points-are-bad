import { NextResponse } from "next/server";
import { getGroupsForUser } from "@/lib/mock-data";

export async function GET() {
  const groups = getGroupsForUser();
  return NextResponse.json({ groups });
}
