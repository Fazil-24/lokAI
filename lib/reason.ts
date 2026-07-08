/**
 * The only place an LLM is ever called. Hard architectural rule: reason()
 * may only (a) extract structured JSON fields from raw input, or (b)
 * generate narration text for a score/number that lib/scoring.ts or a
 * Cypher query already computed. It must never return a priority score,
 * a metric value, or a ranking directly.
 */
import OpenAI from "openai";
import { GoogleGenerativeAI } from "@google/generative-ai";
import { Agent, fetch as undiciFetch } from "undici";
import tls from "node:tls";

/**
 * This network's corporate root CA isn't in Node's default trust store
 * inside the dev server process (only ~120 bundled Mozilla certs, vs 307
 * when the system CA store is merged in), which breaks TLS to Cerebras
 * with UNABLE_TO_GET_ISSUER_CERT_LOCALLY. tls.getCACertificates('system')
 * reads the OS store directly regardless of Node's default-trust config,
 * so we build a dedicated fetch dispatcher trusting default + system CAs.
 */
let cerebrasFetch: typeof fetch | undefined;
function getCerebrasFetch(): typeof fetch {
  if (!cerebrasFetch) {
    let ca: string[] | undefined;
    try {
      // getCACertificates() is Node 22+; @types/node doesn't declare it yet.
      const getCACertificates = (
        tls as unknown as { getCACertificates?: (scope: "default" | "system") => string[] }
      ).getCACertificates;
      ca = getCACertificates
        ? [...getCACertificates("default"), ...getCACertificates("system")]
        : undefined;
    } catch {
      ca = undefined; // fall back to undici's own defaults
    }
    const agent = new Agent(ca ? { connect: { ca } } : undefined);
    cerebrasFetch = ((url: string | URL | Request, init?: RequestInit) =>
      undiciFetch(url as never, {
        ...(init as Record<string, unknown>),
        dispatcher: agent,
      } as never)) as unknown as typeof fetch;
  }
  return cerebrasFetch;
}

export type ReasonMode = "explain" | "extract" | "cluster";

export interface ReasonMultimodalInput {
  mimeType: string;
  dataBase64: string;
}

export interface ReasonRequest {
  prompt: string;
  mode: ReasonMode;
  multimodal?: ReasonMultimodalInput;
}

export type ReasonProvider = "cerebras" | "gemini";

export interface ReasonResult {
  text: string;
  provider: ReasonProvider;
}

export interface ProviderLogEntry {
  timestamp: string;
  mode: ReasonMode;
  provider: ReasonProvider;
  latencyMs: number;
  success: boolean;
  error?: string;
}

const MAX_LOG_ENTRIES = 50;
const providerLog: ProviderLogEntry[] = [];

function logProvider(entry: Omit<ProviderLogEntry, "timestamp">) {
  providerLog.unshift({ ...entry, timestamp: new Date().toISOString() });
  providerLog.length = Math.min(providerLog.length, MAX_LOG_ENTRIES);
}

export function getProviderLog(): ProviderLogEntry[] {
  return providerLog;
}

let cerebrasClient: OpenAI | null = null;
function getCerebrasClient(): OpenAI {
  if (!cerebrasClient) {
    const apiKey = process.env.CEREBRAS_API_KEY;
    if (!apiKey) throw new Error("CEREBRAS_API_KEY is not set");
    cerebrasClient = new OpenAI({
      apiKey,
      baseURL: "https://api.cerebras.ai/v1",
      fetch: getCerebrasFetch(),
    });
  }
  return cerebrasClient;
}

let geminiClient: GoogleGenerativeAI | null = null;
function getGeminiClient(): GoogleGenerativeAI {
  if (!geminiClient) {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) throw new Error("GEMINI_API_KEY is not set");
    geminiClient = new GoogleGenerativeAI(apiKey);
  }
  return geminiClient;
}

async function callCerebras(req: ReasonRequest): Promise<string> {
  const client = getCerebrasClient();
  const model = process.env.CEREBRAS_MODEL || "llama-3.3-70b";
  const completion = await client.chat.completions.create({
    model,
    messages: [{ role: "user", content: req.prompt }],
    temperature: req.mode === "extract" ? 0 : 0.4,
  });
  const text = completion.choices[0]?.message?.content;
  if (!text) throw new Error("Cerebras returned an empty completion");
  return text;
}

async function callGemini(req: ReasonRequest): Promise<string> {
  const client = getGeminiClient();
  const modelName = process.env.GEMINI_MODEL || "gemini-2.0-flash";
  const model = client.getGenerativeModel({ model: modelName });

  const parts: Array<{ text: string } | { inlineData: { mimeType: string; data: string } }> = [
    { text: req.prompt },
  ];
  if (req.multimodal) {
    parts.push({
      inlineData: {
        mimeType: req.multimodal.mimeType,
        data: req.multimodal.dataBase64,
      },
    });
  }

  const result = await model.generateContent(parts);
  const text = result.response.text();
  if (!text) throw new Error("Gemini returned an empty response");
  return text;
}

/**
 * Routes text-only requests to Cerebras first (low latency, fires on every
 * UI click) with automatic Gemini fallback on error; multimodal requests
 * (photo/audio) always go straight to Gemini.
 */
export async function reason(req: ReasonRequest): Promise<ReasonResult> {
  if (req.multimodal) {
    const start = Date.now();
    try {
      const text = await callGemini(req);
      logProvider({ mode: req.mode, provider: "gemini", latencyMs: Date.now() - start, success: true });
      return { text, provider: "gemini" };
    } catch (err) {
      logProvider({
        mode: req.mode,
        provider: "gemini",
        latencyMs: Date.now() - start,
        success: false,
        error: String(err),
      });
      throw err;
    }
  }

  const cerebrasStart = Date.now();
  try {
    const text = await callCerebras(req);
    logProvider({
      mode: req.mode,
      provider: "cerebras",
      latencyMs: Date.now() - cerebrasStart,
      success: true,
    });
    return { text, provider: "cerebras" };
  } catch (err) {
    console.error("[reason] Cerebras failed, falling back to Gemini:", err);
    logProvider({
      mode: req.mode,
      provider: "cerebras",
      latencyMs: Date.now() - cerebrasStart,
      success: false,
      error: String(err),
    });
  }

  const geminiStart = Date.now();
  try {
    const text = await callGemini(req);
    logProvider({
      mode: req.mode,
      provider: "gemini",
      latencyMs: Date.now() - geminiStart,
      success: true,
    });
    return { text, provider: "gemini" };
  } catch (err) {
    logProvider({
      mode: req.mode,
      provider: "gemini",
      latencyMs: Date.now() - geminiStart,
      success: false,
      error: String(err),
    });
    throw err;
  }
}

function extractJsonBlock(text: string): string {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fenced) return fenced[1].trim();

  // The response may be a JSON object or a JSON array — match whichever
  // opening bracket appears first to its corresponding closing bracket.
  const firstBrace = text.indexOf("{");
  const firstBracket = text.indexOf("[");
  const candidates = [firstBrace, firstBracket].filter((i) => i !== -1);
  if (candidates.length === 0) return text.trim();

  const start = Math.min(...candidates);
  const isArray = text[start] === "[";
  const end = isArray ? text.lastIndexOf("]") : text.lastIndexOf("}");
  if (end > start) {
    return text.slice(start, end + 1);
  }
  return text.trim();
}

/** Convenience wrapper for mode: "extract" calls that expect a single JSON object back. */
export async function reasonExtractJson<T>(
  prompt: string,
  multimodal?: ReasonMultimodalInput
): Promise<{ data: T; provider: ReasonProvider }> {
  const result = await reason({ prompt, mode: "extract", multimodal });
  const jsonText = extractJsonBlock(result.text);
  try {
    return { data: JSON.parse(jsonText) as T, provider: result.provider };
  } catch (err) {
    throw new Error(
      `Failed to parse JSON from ${result.provider} extraction: ${String(err)}. Raw: ${result.text.slice(0, 500)}`
    );
  }
}
