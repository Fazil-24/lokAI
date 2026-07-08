import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { runWrite } from "@/lib/neo4j";
import { reasonExtractJson } from "@/lib/reason";
import { parseDataUrl } from "@/lib/media";
import { matchOrCreateIssueTheme } from "@/lib/issueThemes";
import { ALL_SECTORS, type Sector } from "@/lib/sectors";
import { KNOWN_BLOCK_NAMES } from "@/lib/locations";

const IngestSchema = z.object({
  rawText: z.string().max(4000).optional().default(""),
  submitterName: z.string().max(200).optional().default(""),
  submitterContact: z.string().max(200).optional().default(""),
  constituencyNumber: z.string().max(100).optional().default("Chikballapur"),
  language: z.string().max(50).optional(),
  locationHint: z.string().max(200).optional().default(""),
  mediaUrl: z.string().optional(),
  mediaKind: z.enum(["photo", "voice"]).optional(),
});

interface ExtractionResult {
  languageDetected: string;
  translatedText: string;
  issueTheme: string;
  sector: string;
  location: string;
  urgency: number;
  affectedGroup: string;
  summary: string;
  confidence: number;
  tags: string[];
}

function buildExtractionPrompt(
  input: z.infer<typeof IngestSchema>,
  hasMedia: boolean,
  mediaKind?: "photo" | "voice"
): string {
  const mediaInstruction = !hasMedia
    ? ""
    : mediaKind === "voice"
      ? "\nThe attached audio is the citizen describing the issue in their own words — transcribe and translate it into translatedText, factoring its content into every field below."
      : "\nThe attached image shows the issue — describe what you see and factor it into sector, severity and urgency.";

  return `You are a civic-intake assistant for LokAI, helping structure public infrastructure complaints for the Chikballapur constituency, Karnataka, India. Citizen input may be in any language.

Citizen's typed message: """${input.rawText || "(no text provided — see attached media)"}"""
${input.locationHint ? `Citizen indicated the area as: ${input.locationHint}` : ""}${mediaInstruction}

Known constituency areas: ${KNOWN_BLOCK_NAMES.join(", ")}.
Known sectors: ${ALL_SECTORS.join(", ")}.

Extract and return ONLY a single JSON object with exactly these fields, nothing else:
{
  "languageDetected": string,
  "translatedText": string,
  "issueTheme": string,
  "sector": one of ${JSON.stringify(ALL_SECTORS)},
  "location": string,
  "urgency": number between 0 and 1,
  "affectedGroup": string,
  "summary": string (1-2 sentences, English),
  "confidence": number between 0 and 1,
  "tags": string[] (2-5 short keywords)
}`;
}

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null);
  const parsed = IngestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid submission", details: parsed.error.flatten() },
      { status: 400 }
    );
  }
  const input = parsed.data;

  if (!input.rawText.trim() && !input.mediaUrl) {
    return NextResponse.json(
      { error: "Provide a message or attach a photo/audio recording." },
      { status: 400 }
    );
  }

  let multimodal: { mimeType: string; dataBase64: string } | undefined;
  if (input.mediaUrl) {
    try {
      const { mimeType, base64 } = parseDataUrl(input.mediaUrl);
      multimodal = { mimeType, dataBase64: base64 };
    } catch {
      return NextResponse.json({ error: "Invalid media payload" }, { status: 400 });
    }
  }

  const prompt = buildExtractionPrompt(input, Boolean(multimodal), input.mediaKind);

  let extraction: ExtractionResult;
  let provider: string;
  try {
    const result = await reasonExtractJson<ExtractionResult>(prompt, multimodal);
    extraction = result.data;
    provider = result.provider;
  } catch (err) {
    return NextResponse.json({ error: `Extraction failed: ${String(err)}` }, { status: 502 });
  }

  const sector: Sector = (ALL_SECTORS as readonly string[]).includes(extraction.sector)
    ? (extraction.sector as Sector)
    : "other";
  const submissionType = multimodal ? (input.mediaKind ?? "photo") : "text";
  const trackingId = `LOKAI-${randomUUID().slice(0, 8).toUpperCase()}`;

  const theme = await matchOrCreateIssueTheme({
    issueTheme: extraction.issueTheme || "Untitled issue",
    sector,
    summary: extraction.summary || input.rawText,
    locationName: extraction.location || input.locationHint || "Unspecified",
  });

  const urgencySignal = Math.min(1, Math.max(0, Number(extraction.urgency) || 0));
  const confidence = Math.min(1, Math.max(0, Number(extraction.confidence) || 0));

  await runWrite(
    `MATCH (loc:Location {id: $locationId})
     MERGE (s:Submission {id: $id})
     SET s.type = $type,
         s.rawText = $rawText,
         s.translatedText = $translatedText,
         s.language = $language,
         s.mediaUrl = $mediaUrl,
         s.submitterName = $submitterName,
         s.submitterContact = $submitterContact,
         s.constituencyNumber = $constituencyNumber,
         s.urgencySignal = $urgencySignal,
         s.timestamp = datetime(),
         s.status = 'new',
         s.summary = $summary,
         s.confidence = $confidence,
         s.tags = $tags,
         s.sector = $sector,
         s.provider = $provider,
         s.trackingId = $trackingId
     MERGE (s)-[:SUBMITTED_IN]->(loc)
     WITH s
     MATCH (t:IssueTheme {id: $themeId})
     MERGE (s)-[:MENTIONS_ISSUE]->(t)`,
    {
      id: trackingId,
      type: submissionType,
      rawText: input.rawText,
      translatedText: extraction.translatedText || input.rawText,
      language: extraction.languageDetected || input.language || "unknown",
      mediaUrl: input.mediaUrl ?? null,
      submitterName: input.submitterName,
      submitterContact: input.submitterContact,
      constituencyNumber: input.constituencyNumber,
      urgencySignal,
      summary: extraction.summary,
      confidence,
      tags: extraction.tags ?? [],
      sector,
      provider,
      trackingId,
      locationId: theme.locationId,
      themeId: theme.id,
    }
  );

  return NextResponse.json({
    trackingId,
    theme: { id: theme.id, created: theme.created, locationName: theme.locationName },
    extraction: { ...extraction, sector },
    provider,
  });
}
