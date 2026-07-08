import { NextResponse } from "next/server";
import { fetchThemeDetail, fetchProjectsByIds } from "@/lib/themeDetail";
import { ensureProjectOptionsForTheme } from "@/lib/projectOptions";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const theme = await fetchThemeDetail(id);
  if (!theme) {
    return NextResponse.json({ error: "Theme not found" }, { status: 404 });
  }

  const projectIds = await ensureProjectOptionsForTheme(id);
  const projects = await fetchProjectsByIds(projectIds);

  return NextResponse.json({ theme, projects });
}
