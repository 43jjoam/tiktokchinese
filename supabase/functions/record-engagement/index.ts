import { createClient } from "https://esm.sh/@supabase/supabase-js@2.100.0";
import { corsHeaders, DEFAULT_ALLOWED_ORIGINS } from "../_shared/cors.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const HEX64 = /^[0-9a-f]{64}$/i;
function validDeviceHash(h: string): boolean {
  if (HEX64.test(h)) return true;
  if (h.startsWith("dev-") && h.length >= 10 && h.length <= 128) return true;
  return false;
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

  if (!origin || !DEFAULT_ALLOWED_ORIGINS.includes(origin)) {
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

  const authHeader = req.headers.get("authorization")?.trim() ?? "";
  const bearer = authHeader.toLowerCase().startsWith("bearer ") ? authHeader.slice(7).trim() : "";

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
  let userId: string | null = null;
  if (bearer) {
    const { data: userData, error: userErr } = await supabase.auth.getUser(bearer);
    if (!userErr && userData?.user?.id) userId = userData.user.id;
  }

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

  const baseRow = {
    word_id,
    clip_key,
    device_hash,
    user_id: userId,
    payload: null as { method?: string } | null,
    is_deleted: false,
  };

  try {
    if (op === "like_set") {
      const { error: insErr } = await supabase.from("engagement_events").insert({
        ...baseRow,
        type: "like",
        payload: null,
      });
      if (insErr && insErr.code !== "23505") {
        throw insErr;
      }
    } else if (op === "like_clear") {
      let q = supabase.from("engagement_events").delete().eq("type", "like").eq("word_id", word_id);
      q = userId ? q.eq("user_id", userId) : q.eq("device_hash", device_hash).is("user_id", null);
      await q;
    } else if (op === "save_set") {
      const { error: sErr } = await supabase.from("engagement_events").insert({
        ...baseRow,
        type: "save",
        payload: null,
      });
      if (sErr && sErr.code !== "23505") {
        throw sErr;
      }
    } else if (op === "save_clear") {
      let q = supabase.from("engagement_events").delete().eq("type", "save").eq("word_id", word_id);
      q = userId ? q.eq("user_id", userId) : q.eq("device_hash", device_hash).is("user_id", null);
      await q;
    } else if (op === "share_tap") {
      await supabase.from("engagement_events").insert({
        ...baseRow,
        type: "share_tap",
        payload: payload ?? null,
      });
    } else if (op === "share_success") {
      await supabase.from("engagement_events").insert({
        ...baseRow,
        type: "share_success",
        payload: payload ?? null,
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
