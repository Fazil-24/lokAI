import { NextResponse } from "next/server";
import { runQuery } from "@/lib/neo4j";
import { fetchProjectsByIds } from "@/lib/themeDetail";

export async function GET() {
  const rows = await runQuery<{ id: string }>("MATCH (p:ProjectOption) RETURN p.id AS id");
  const projects = await fetchProjectsByIds(rows.map((r) => r.id));
  return NextResponse.json({ projects });
}
