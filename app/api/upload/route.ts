import { NextRequest, NextResponse } from "next/server";
import { MAX_MEDIA_BYTES } from "@/lib/media";

export async function POST(request: NextRequest) {
  const formData = await request.formData().catch(() => null);
  const file = formData?.get("file");

  if (!(file instanceof File)) {
    return NextResponse.json({ error: "No file provided" }, { status: 400 });
  }

  if (file.size > MAX_MEDIA_BYTES) {
    return NextResponse.json(
      {
        error: `File too large (max ${(MAX_MEDIA_BYTES / 1024 / 1024).toFixed(1)}MB for the demo).`,
      },
      { status: 413 }
    );
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  const base64 = buffer.toString("base64");
  const mimeType = file.type || "application/octet-stream";

  return NextResponse.json({
    url: `data:${mimeType};base64,${base64}`,
    mimeType,
    sizeBytes: file.size,
  });
}
