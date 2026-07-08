import { NextResponse } from "next/server";
import { fetchProjectsByIds } from "@/lib/themeDetail";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const [project] = await fetchProjectsByIds([id]);
  if (!project) {
    return NextResponse.json({ error: "Project not found" }, { status: 404 });
  }
  return NextResponse.json({ project });
}
