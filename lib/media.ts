/**
 * Local demo-mode media handling. Deliberately stores media as base64 data
 * URLs (in Neo4j, on the Submission node) instead of writing to disk:
 * Vercel's serverless functions don't reliably serve files written to
 * /public at runtime, so a disk-based /public/uploads approach that works
 * in `npm run dev` would silently break once deployed. Data URLs have no
 * filesystem dependency and render directly in <img>/<audio> tags.
 */

/** Raw (pre-base64) file size cap — keeps the base64-inflated JSON body safely under Vercel's ~4.5MB request limit. */
export const MAX_MEDIA_BYTES = 3 * 1024 * 1024;

export function parseDataUrl(dataUrl: string): { mimeType: string; base64: string } {
  const match = dataUrl.match(/^data:([^;]+);base64,([\s\S]+)$/);
  if (!match) throw new Error("Expected a base64 data URL");
  return { mimeType: match[1], base64: match[2] };
}
