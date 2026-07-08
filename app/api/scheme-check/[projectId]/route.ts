import { NextResponse } from "next/server";
import { fetchProjectsByIds } from "@/lib/themeDetail";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ projectId: string }> }
) {
  const { projectId } = await params;
  const [project] = await fetchProjectsByIds([projectId]);
  if (!project) {
    return NextResponse.json({ error: "Project not found" }, { status: 404 });
  }
  return NextResponse.json({ feasibility: project.feasibility });
}
