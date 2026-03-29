import { createClient } from "https://esm.sh/@supabase/supabase-js@2.100.0";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const ALLOWED_RAW = (Deno.env.get("ALLOWED_ORIGINS") ?? "").trim();
const ALLOWED_ORIGINS = ALLOWED_RAW
  ? ALLOWED_RAW.split(",").map((s) => s.trim()).filter(Boolean)
  : [
      "https://chineseflash.com",
      "https://www.chineseflash.com",
      "http://localhost:5173",
      "http://127.0.0.1:5173",
    ];

const MAX_PAYLOAD_BYTES = Math.min(
  Math.max(Number(Deno.env.get("SESSION_SUMMARY_MAX_BYTES") ?? "24000") || 24000, 1024),
  120000,
);

const HEX64 = /^[0-9a-f]{64}$/i;
function validDeviceHash(h: string): boolean {
  if (HEX64.test(h)) return true;
  if (h.startsWith("dev-") && h.length >= 10 && h.length <= 128) return true;
  return false;
}

function corsHeaders(origin: string | null): HeadersInit {
  const o = origin && ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0] ?? "*";
  return {
    "Access-Control-Allow-Origin": o,
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
  };
}

type Body = { device_hash?: string; payload?: unknown };

Deno.serve(async (req) => {
  const origin = req.headers.get("origin");

  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders(origin) });
  }

  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405, headers: corsHeaders(origin) });
  }

  if (!origin || !ALLOWED_ORIGINS.includes(origin)) {
    return new Response("Forbidden", { status: 403 });
  }

  let raw: string;
  try {
    raw = await req.text();
  } catch {
    return new Response(JSON.stringify({ error: "invalid_body" }), {
      status: 400,
      headers: { ...corsHeaders(origin), "Content-Type": "application/json" },
    });
  }

  if (raw.length > MAX_PAYLOAD_BYTES) {
    return new Response(JSON.stringify({ error: "payload_too_large" }), {
      status: 413,
      headers: { ...corsHeaders(origin), "Content-Type": "application/json" },
    });
  }

  let body: Body;
  try {
    body = JSON.parse(raw) as Body;
  } catch {
    return new Response(JSON.stringify({ error: "invalid_json" }), {
      status: 400,
      headers: { ...corsHeaders(origin), "Content-Type": "application/json" },
    });
  }

  const device_hash = body.device_hash?.trim() ?? "";
  if (!device_hash || !validDeviceHash(device_hash)) {
    return new Response(JSON.stringify({ error: "invalid_device_hash" }), {
      status: 400,
      headers: { ...corsHeaders(origin), "Content-Type": "application/json" },
    });
  }

  const payload = body.payload;
  if (payload === undefined || typeof payload !== "object" || payload === null || Array.isArray(payload)) {
    return new Response(JSON.stringify({ error: "invalid_payload" }), {
      status: 400,
      headers: { ...corsHeaders(origin), "Content-Type": "application/json" },
    });
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
  const { error } = await supabase.from("session_summaries").insert({
    device_hash,
    payload,
  });

  if (error) {
    console.error("record-session-summary", error);
    return new Response(JSON.stringify({ error: "write_failed" }), {
      status: 500,
      headers: { ...corsHeaders(origin), "Content-Type": "application/json" },
    });
  }

  return new Response(JSON.stringify({ ok: true }), {
    status: 200,
    headers: { ...corsHeaders(origin), "Content-Type": "application/json" },
  });
});
