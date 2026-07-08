import { NextResponse } from "next/server";
import { getProviderLog } from "@/lib/reason";

export async function GET() {
  const log = getProviderLog();
  const lastByProvider = (provider: "cerebras" | "gemini") =>
    log.find((entry) => entry.provider === provider) ?? null;

  return NextResponse.json({
    configured: {
      cerebras: Boolean(process.env.CEREBRAS_API_KEY),
      gemini: Boolean(process.env.GEMINI_API_KEY),
    },
    lastCerebras: lastByProvider("cerebras"),
    lastGemini: lastByProvider("gemini"),
    recent: log.slice(0, 20),
  });
}
