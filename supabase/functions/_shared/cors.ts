/** Comma-separated override; defaults include prod hosts + Vite dev. */
const ALLOWED_RAW = (Deno.env.get("ALLOWED_ORIGINS") ?? "").trim();

export const DEFAULT_ALLOWED_ORIGINS = ALLOWED_RAW
  ? ALLOWED_RAW.split(",").map((s) => s.trim()).filter(Boolean)
  : [
      "https://chineseflash.com",
      "https://www.chineseflash.com",
      "http://localhost:5173",
      "http://127.0.0.1:5173",
    ];

/**
 * True for configured origins or typical LAN dev URLs (`npm run dev:lan`), so Edge functions
 * are not stuck on 403 when the phone uses `http://192.168.x.x:5173`.
 */
export function isOriginAllowed(origin: string | null): boolean {
  if (!origin) return false;
  if (DEFAULT_ALLOWED_ORIGINS.includes(origin)) return true;
  try {
    const u = new URL(origin);
    if (u.protocol !== "http:") return false;
    const h = u.hostname;
    if (h === "localhost" || h === "127.0.0.1") return true;
    if (/^192\.168\.\d{1,3}\.\d{1,3}$/.test(h)) return true;
    if (/^10\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(h)) return true;
    const m = /^172\.(\d{1,3})\./.exec(h);
    if (m) {
      const n = Number(m[1]);
      if (n >= 16 && n <= 31) return true;
    }
    return false;
  } catch {
    return false;
  }
}

export function corsHeaders(origin: string | null, allowed: string[] = DEFAULT_ALLOWED_ORIGINS): HeadersInit {
  const o = origin && allowed.includes(origin) ? origin : allowed[0] ?? "*";
  return {
    "Access-Control-Allow-Origin": o,
    "Access-Control-Allow-Headers":
      "authorization, x-client-info, apikey, content-type, idempotency-key",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  };
}

/** Reflect CORS for allowed list + private-LAN dev origins. */
export function corsHeadersForRequestOrigin(origin: string | null): HeadersInit {
  const o = origin && isOriginAllowed(origin) ? origin : DEFAULT_ALLOWED_ORIGINS[0] ?? "*";
  return {
    "Access-Control-Allow-Origin": o,
    "Access-Control-Allow-Headers":
      "authorization, x-client-info, apikey, content-type, idempotency-key",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  };
}
