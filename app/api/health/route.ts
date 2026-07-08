import { NextResponse } from "next/server";
import { verifyConnectivity } from "@/lib/neo4j";

export async function GET() {
  const start = Date.now();
  let neo4j: "connected" | "unreachable" | "not-configured";

  if (!process.env.NEO4J_URI) {
    neo4j = "not-configured";
  } else {
    neo4j = (await verifyConnectivity()) ? "connected" : "unreachable";
  }

  return NextResponse.json({
    status: neo4j === "connected" ? "ok" : "degraded",
    neo4j,
    latencyMs: Date.now() - start,
    timestamp: new Date().toISOString(),
  });
}
