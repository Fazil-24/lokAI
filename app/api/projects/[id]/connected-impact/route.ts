import { NextResponse } from "next/server";
import { fetchConnectedImpact } from "@/lib/connectedImpact";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const impact = await fetchConnectedImpact(id);
  return NextResponse.json(impact);
}
