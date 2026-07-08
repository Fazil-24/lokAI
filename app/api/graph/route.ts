import { NextRequest, NextResponse } from "next/server";
import { getGraphSnapshot } from "@/lib/graphSnapshot";

export async function GET(request: NextRequest) {
  const forceRefresh = request.nextUrl.searchParams.get("refresh") === "1";
  const snapshot = await getGraphSnapshot(forceRefresh);
  return NextResponse.json(snapshot);
}
