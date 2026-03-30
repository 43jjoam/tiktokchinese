import { createClient } from "https://esm.sh/@supabase/supabase-js@2.100.0";
import { corsHeadersForRequestOrigin, isOriginAllowed } from "../_shared/cors.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

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

type Body = { device_hash?: string; payload?: unknown };

Deno.serve(async (req) => {
  const origin = req.headers.get("origin");
  const ch = corsHeadersForRequestOrigin(origin);

  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: ch });
  }

  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405, headers: ch });
  }

  if (!isOriginAllowed(origin)) {
    return new Response("Forbidden", { status: 403, headers: ch });
  }

  let raw: string;
  try {
    raw = await req.text();
  } catch {
    return new Response(JSON.stringify({ error: "invalid_body" }), {
      status: 400,
      headers: { ...ch, "Content-Type": "application/json" },
    });
  }

  if (raw.length > MAX_PAYLOAD_BYTES) {
    return new Response(JSON.stringify({ error: "payload_too_large" }), {
      status: 413,
      headers: { ...ch, "Content-Type": "application/json" },
    });
  }

  let body: Body;
  try {
    body = JSON.parse(raw) as Body;
  } catch {
    return new Response(JSON.stringify({ error: "invalid_json" }), {
      status: 400,
      headers: { ...ch, "Content-Type": "application/json" },
    });
  }

  const device_hash = body.device_hash?.trim() ?? "";
  if (!device_hash || !validDeviceHash(device_hash)) {
    return new Response(JSON.stringify({ error: "invalid_device_hash" }), {
      status: 400,
      headers: { ...ch, "Content-Type": "application/json" },
    });
  }

  const payload = body.payload;
  if (payload === undefined || typeof payload !== "object" || payload === null || Array.isArray(payload)) {
    return new Response(JSON.stringify({ error: "invalid_payload" }), {
      status: 400,
      headers: { ...ch, "Content-Type": "application/json" },
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
      headers: { ...ch, "Content-Type": "application/json" },
    });
  }

  return new Response(JSON.stringify({ ok: true }), {
    status: 200,
    headers: { ...ch, "Content-Type": "application/json" },
  });
});
