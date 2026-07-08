import { NextResponse } from "next/server";
import { fetchRankableThemes } from "@/lib/dashboardData";

export async function GET() {
  const themes = await fetchRankableThemes();
  return NextResponse.json({ themes });
}
