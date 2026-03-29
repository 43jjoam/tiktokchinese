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

const CANONICAL_RAW = Deno.env.get("CANONICAL_GIFT_SITE_URL") ?? "https://chineseflash.com";
const CANONICAL_SITE = CANONICAL_RAW.replace(/\/$/, "");
const DEFAULT_BUCKET = (Deno.env.get("DEFAULT_VIDEO_STORAGE_BUCKET") ?? "chinese character 1 _videos").trim();

const HEX64 = /^[0-9a-f]{64}$/i;
function validDeviceHash(h: string): boolean {
  if (HEX64.test(h)) return true;
  if (h.startsWith("dev-") && h.length >= 10 && h.length <= 128) return true;
  return false;
}

function randomTokenHex32(): string {
  const b = new Uint8Array(16);
  crypto.getRandomValues(b);
  return [...b].map((x) => x.toString(16).padStart(2, "0")).join("");
}

function corsHeaders(origin: string | null): HeadersInit {
  const o = origin && ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0] ?? "*";
  return {
    "Access-Control-Allow-Origin": o,
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
  };
}

type Body = { word_id?: string; device_hash?: string };

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

  const word_id = body.word_id?.trim() ?? "";
  const device_hash = body.device_hash?.trim() ?? "";
  if (!word_id || !device_hash) {
    return new Response(JSON.stringify({ error: "missing_fields" }), {
      status: 400,
      headers: { ...corsHeaders(origin), "Content-Type": "application/json" },
    });
  }

  if (word_id.length > 100 || !validDeviceHash(device_hash)) {
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

  const { data: meta, error: metaErr } = await supabase
    .from("word_metadata")
    .select("character, pinyin, en_meaning, video_storage_path, video_storage_bucket")
    .eq("word_id", word_id)
    .maybeSingle();

  if (metaErr || !meta) {
    return new Response(JSON.stringify({ error: "word_not_giftable" }), {
      status: 400,
      headers: { ...corsHeaders(origin), "Content-Type": "application/json" },
    });
  }

  const storage_bucket = (meta.video_storage_bucket?.trim() || DEFAULT_BUCKET).trim();
  const storage_path = meta.video_storage_path.trim();
  if (!storage_path || !storage_bucket) {
    return new Response(JSON.stringify({ error: "invalid_metadata" }), {
      status: 500,
      headers: { ...corsHeaders(origin), "Content-Type": "application/json" },
    });
  }

  const token = randomTokenHex32();

  const { error: insErr } = await supabase.from("gift_tokens").insert({
    token,
    word_id,
    sender_device_hash: device_hash,
    character: meta.character,
    pinyin: meta.pinyin,
    en_meaning: meta.en_meaning,
    storage_path,
    storage_bucket,
  });

  if (insErr) {
    console.error("create-gift insert", insErr);
    return new Response(JSON.stringify({ error: "write_failed" }), {
      status: 500,
      headers: { ...corsHeaders(origin), "Content-Type": "application/json" },
    });
  }

  const share_path = `/g/${token}`;
  const share_url = `${CANONICAL_SITE}${share_path}`;

  return new Response(JSON.stringify({ ok: true, token, share_url, share_path }), {
    status: 200,
    headers: { ...corsHeaders(origin), "Content-Type": "application/json" },
  });
});
