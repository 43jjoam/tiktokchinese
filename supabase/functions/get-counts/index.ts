import { createClient } from "https://esm.sh/@supabase/supabase-js@2.100.0";
import { corsHeaders, DEFAULT_ALLOWED_ORIGINS } from "../_shared/cors.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

Deno.serve(async (req) => {
  const origin = req.headers.get("origin");

  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders(origin) });
  }

  if (req.method !== "GET") {
    return new Response("Method not allowed", { status: 405, headers: corsHeaders(origin) });
  }

  if (!origin || !DEFAULT_ALLOWED_ORIGINS.includes(origin)) {
    return new Response("Forbidden", { status: 403, headers: corsHeaders(origin) });
  }

  const url = new URL(req.url);
  const word_id = url.searchParams.get("word_id")?.trim() ?? "";
  if (!word_id || word_id.length > 100) {
    return new Response(JSON.stringify({ error: "bad_word_id" }), {
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

  const [likesRes, savesRes] = await Promise.all([
    supabase
      .from("engagement_events")
      .select("*", { count: "exact", head: true })
      .eq("word_id", word_id)
      .eq("type", "like")
      .eq("is_deleted", false),
    supabase
      .from("engagement_events")
      .select("*", { count: "exact", head: true })
      .eq("word_id", word_id)
      .eq("type", "save")
      .eq("is_deleted", false),
  ]);

  if (likesRes.error || savesRes.error) {
    console.error("get-counts", likesRes.error, savesRes.error);
    return new Response(JSON.stringify({ error: "count_failed" }), {
      status: 500,
      headers: { ...corsHeaders(origin), "Content-Type": "application/json" },
    });
  }

  return new Response(
    JSON.stringify({
      likes: likesRes.count ?? 0,
      saves: savesRes.count ?? 0,
    }),
    {
      status: 200,
      headers: {
        ...corsHeaders(origin),
        "Content-Type": "application/json",
        "Cache-Control": "public, max-age=30",
      },
    },
  );
});
