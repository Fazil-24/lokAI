/**
 * Minimal stateless admin session: a signed cookie, no session store.
 * Uses Web Crypto (not node:crypto) so it works in both the Node and
 * Edge runtimes without extra config.
 */
export const ADMIN_COOKIE_NAME = "lokai_admin";
const SESSION_PAYLOAD = "lokai-admin-session";

function toHex(buffer: ArrayBuffer): string {
  return Array.from(new Uint8Array(buffer))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

async function sign(value: string): Promise<string> {
  const secret = process.env.ADMIN_PASSWORD || "";
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    enc.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const signature = await crypto.subtle.sign("HMAC", key, enc.encode(value));
  return toHex(signature);
}

export async function createAdminToken(): Promise<string> {
  return sign(SESSION_PAYLOAD);
}

export async function verifyAdminToken(token: string | undefined | null): Promise<boolean> {
  if (!token || !process.env.ADMIN_PASSWORD) return false;
  const expected = await sign(SESSION_PAYLOAD);
  return token === expected;
}

export function checkAdminCredentials(email: string, password: string): boolean {
  return (
    Boolean(process.env.ADMIN_EMAIL) &&
    Boolean(process.env.ADMIN_PASSWORD) &&
    email === process.env.ADMIN_EMAIL &&
    password === process.env.ADMIN_PASSWORD
  );
}
