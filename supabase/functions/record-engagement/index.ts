import { createClient } from "https://esm.sh/@supabase/supabase-js@2.100.0";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const ALLOWED_RAW = (Deno.env.get("ALLOWED_ORIGINS") ?? "").trim();
const ALLOWED_ORIGINS = ALLOWED_RAW
  ? ALLOWED_RAW.split(",").map((s) => s.trim()).filter(Boolean)
  : ["https://chineseflash.com", "https://www.chineseflash.com"];

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

type Op =
  | "like_set"
  | "like_clear"
  | "save_set"
  | "save_clear"
  | "share_tap"
  | "share_success";

type Body = {
  op: Op;
  word_id: string;
  clip_key: string;
  device_hash: string;
  payload?: { method?: string };
};

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

  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return new Response(JSON.stringify({ error: "invalid_json" }), {
      status: 400,
      headers: { ...corsHeaders(origin), "Content-Type": "application/json" },
    });
  }

  const { op, word_id, clip_key, device_hash, payload } = body;
  if (!op || !word_id || !clip_key || !device_hash) {
    return new Response(JSON.stringify({ error: "missing_fields" }), {
      status: 400,
      headers: { ...corsHeaders(origin), "Content-Type": "application/json" },
    });
  }

  if (word_id.length > 100 || clip_key.length > 200 || !validDeviceHash(device_hash)) {
    return new Response(JSON.stringify({ error: "invalid_shape" }), {
      status: 400,
      headers: { ...corsHeaders(origin), "Content-Type": "application/json" },
    });
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

  const { data: wordOk, error: wordErr } = await supabase
    .from("words")
    .select("id")
    .eq("id", word_id)
    .eq("is_active", true)
    .maybeSingle();

  if (wordErr || !wordOk) {
    return new Response(JSON.stringify({ error: "unknown_word" }), {
      status: 400,
      headers: { ...corsHeaders(origin), "Content-Type": "application/json" },
    });
  }

  try {
    if (op === "like_set") {
      const { error: insErr } = await supabase.from("engagement_events").insert({
        type: "like",
        word_id,
        clip_key,
        device_hash,
        payload: null,
        is_deleted: false,
      });
      if (insErr && insErr.code !== "23505") {
        throw insErr;
      }
    } else if (op === "like_clear") {
      await supabase.from("engagement_events").delete().eq("type", "like").eq("word_id", word_id).eq(
        "device_hash",
        device_hash,
      );
    } else if (op === "save_set") {
      const { error: sErr } = await supabase.from("engagement_events").insert({
        type: "save",
        word_id,
        clip_key,
        device_hash,
        payload: null,
        is_deleted: false,
      });
      if (sErr && sErr.code !== "23505") {
        throw sErr;
      }
    } else if (op === "save_clear") {
      await supabase.from("engagement_events").delete().eq("type", "save").eq("word_id", word_id).eq(
        "device_hash",
        device_hash,
      );
    } else if (op === "share_tap") {
      await supabase.from("engagement_events").insert({
        type: "share_tap",
        word_id,
        clip_key,
        device_hash,
        payload: payload ?? null,
        is_deleted: false,
      });
    } else if (op === "share_success") {
      await supabase.from("engagement_events").insert({
        type: "share_success",
        word_id,
        clip_key,
        device_hash,
        payload: payload ?? null,
        is_deleted: false,
      });
    } else {
      return new Response(JSON.stringify({ error: "unknown_op" }), {
        status: 400,
        headers: { ...corsHeaders(origin), "Content-Type": "application/json" },
      });
    }
  } catch (e) {
    console.error("record-engagement", e);
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
