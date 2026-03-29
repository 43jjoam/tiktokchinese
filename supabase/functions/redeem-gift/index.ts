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

const SIGNED_URL_TTL = Math.min(
  Math.max(Number(Deno.env.get("GIFT_SIGNED_URL_TTL_SEC") ?? "3600") || 3600, 60),
  86400,
);

/** PRD §9.6: max distinct gift redemptions per recipient device per UTC calendar day. */
const DAILY_RECEIVE_CAP = Math.min(
  Math.max(Number(Deno.env.get("GIFT_DAILY_RECEIVE_CAP") ?? "3") || 3, 1),
  50,
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

function utcDayRangeIso(): { start: string; end: string } {
  const n = new Date();
  const y = n.getUTCFullYear();
  const m = n.getUTCMonth();
  const d = n.getUTCDate();
  const start = new Date(Date.UTC(y, m, d, 0, 0, 0, 0));
  const end = new Date(Date.UTC(y, m, d + 1, 0, 0, 0, 0));
  return { start: start.toISOString(), end: end.toISOString() };
}

const TOKEN_RE = /^[0-9a-f]{32}$/i;

type Body = { token?: string; device_hash?: string };

type GiftRow = {
  word_id: string;
  character: string;
  pinyin: string;
  en_meaning: string;
  storage_path: string;
  storage_bucket: string;
  expires_at?: string | null;
  is_revoked?: boolean | null;
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
    return new Response("Forbidden", { status: 403, headers: corsHeaders(origin) });
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

  const token = body.token?.trim() ?? "";
  const device_hash = body.device_hash?.trim() ?? "";
  if (!token || !device_hash) {
    return new Response(JSON.stringify({ error: "missing_fields" }), {
      status: 400,
      headers: { ...corsHeaders(origin), "Content-Type": "application/json" },
    });
  }

  if (!TOKEN_RE.test(token) || !validDeviceHash(device_hash)) {
    return new Response(JSON.stringify({ error: "invalid_shape" }), {
      status: 400,
      headers: { ...corsHeaders(origin), "Content-Type": "application/json" },
    });
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

  const { data: row, error: rowErr } = await supabase
    .from("gift_tokens")
    .select(
      "word_id, character, pinyin, en_meaning, storage_path, storage_bucket, expires_at, is_revoked",
    )
    .eq("token", token)
    .maybeSingle();

  if (rowErr || !row) {
    return new Response(JSON.stringify({ error: "not_found" }), {
      status: 404,
      headers: { ...corsHeaders(origin), "Content-Type": "application/json" },
    });
  }

  const gift = row as GiftRow;

  if (gift.is_revoked === true) {
    return new Response(JSON.stringify({ error: "revoked" }), {
      status: 403,
      headers: { ...corsHeaders(origin), "Content-Type": "application/json" },
    });
  }

  if (gift.expires_at) {
    const expMs = Date.parse(gift.expires_at);
    if (Number.isFinite(expMs) && Date.now() > expMs) {
      return new Response(JSON.stringify({ error: "expired" }), {
        status: 410,
        headers: { ...corsHeaders(origin), "Content-Type": "application/json" },
      });
    }
  }

  const { data: already } = await supabase
    .from("gift_redemptions")
    .select("id")
    .eq("gift_token", token)
    .eq("device_hash", device_hash)
    .maybeSingle();

  if (!already) {
    const { start, end } = utcDayRangeIso();
    const { count, error: cErr } = await supabase
      .from("gift_redemptions")
      .select("*", { count: "exact", head: true })
      .eq("device_hash", device_hash)
      .gte("created_at", start)
      .lt("created_at", end);

    if (cErr) {
      console.error("redeem-gift daily cap count", cErr);
      return new Response(JSON.stringify({ error: "cap_check_failed" }), {
        status: 500,
        headers: { ...corsHeaders(origin), "Content-Type": "application/json" },
      });
    }

    if ((count ?? 0) >= DAILY_RECEIVE_CAP) {
      return new Response(JSON.stringify({ error: "daily_receive_cap", cap: DAILY_RECEIVE_CAP }), {
        status: 429,
        headers: { ...corsHeaders(origin), "Content-Type": "application/json" },
      });
    }

    const { error: redErr } = await supabase.from("gift_redemptions").insert({
      gift_token: token,
      device_hash,
    });

    if (redErr && redErr.code !== "23505") {
      console.error("redeem-gift redemption", redErr);
      return new Response(JSON.stringify({ error: "redemption_failed" }), {
        status: 500,
        headers: { ...corsHeaders(origin), "Content-Type": "application/json" },
      });
    }
  }

  const { data: signed, error: signErr } = await supabase.storage
    .from(gift.storage_bucket)
    .createSignedUrl(gift.storage_path, SIGNED_URL_TTL);

  if (signErr || !signed?.signedUrl) {
    console.error("redeem-gift signed url", signErr);
    return new Response(JSON.stringify({ error: "signed_url_failed" }), {
      status: 500,
      headers: { ...corsHeaders(origin), "Content-Type": "application/json" },
    });
  }

  return new Response(
    JSON.stringify({
      ok: true,
      word_id: gift.word_id,
      character: gift.character,
      pinyin: gift.pinyin,
      en_meaning: gift.en_meaning,
      signed_url: signed.signedUrl,
      expires_in: SIGNED_URL_TTL,
    }),
    { status: 200, headers: { ...corsHeaders(origin), "Content-Type": "application/json" } },
  );
});
