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

export function corsHeaders(origin: string | null, allowed: string[] = DEFAULT_ALLOWED_ORIGINS): HeadersInit {
  const o = origin && allowed.includes(origin) ? origin : allowed[0] ?? "*";
  return {
    "Access-Control-Allow-Origin": o,
    "Access-Control-Allow-Headers":
      "authorization, x-client-info, apikey, content-type, idempotency-key",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  };
}
