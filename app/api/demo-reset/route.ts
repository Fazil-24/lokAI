import { NextRequest, NextResponse } from "next/server";
import { ADMIN_COOKIE_NAME, verifyAdminToken } from "@/lib/adminAuth";
import { seedBaseData, wipeDynamicData } from "@/lib/seedBaseData";
import { invalidateGraphSnapshotCache } from "@/lib/graphSnapshot";

/**
 * Wipes citizen/officer-generated data (submissions, issue themes, LLM-
 * generated project options) and re-applies the real MPLADS/Census/scheme-
 * rule base seed — returns the graph to a clean pre-demo state regardless
 * of what was clicked during testing. Admin-only: destructive.
 */
export async function POST(request: NextRequest) {
  const token = request.cookies.get(ADMIN_COOKIE_NAME)?.value;
  if (!(await verifyAdminToken(token))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    await wipeDynamicData();
    const summary = await seedBaseData();
    invalidateGraphSnapshotCache();
    return NextResponse.json({ ok: true, resetAt: new Date().toISOString(), summary });
  } catch (err) {
    return NextResponse.json({ error: `Demo reset failed: ${String(err)}` }, { status: 500 });
  }
}
