import { createClient } from "https://esm.sh/@supabase/supabase-js@2.100.0";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const CANONICAL_SITE = (Deno.env.get("CANONICAL_GIFT_SITE_URL") ?? "https://chineseflash.com").replace(
  /\/$/,
  "",
);
const DEFAULT_OG_IMAGE = (Deno.env.get("DEFAULT_OG_IMAGE_URL") ??
  "https://chineseflash.com/decks/chinese-characters-1.png").trim();

function escAttr(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

const TOKEN_RE = /^[0-9a-f]{32}$/i;

Deno.serve(async (req) => {
  if (req.method !== "GET" && req.method !== "HEAD") {
    return new Response("Method not allowed", { status: 405 });
  }

  const url = new URL(req.url);
  const qp = url.searchParams.get("token")?.trim();
  const pathParts = url.pathname.split("/").filter(Boolean);
  const last = pathParts[pathParts.length - 1]?.trim() ?? "";
  const token = (qp && qp.length ? qp : last) || "";

  if (!token || !TOKEN_RE.test(token)) {
    return new Response("Not found", { status: 404, headers: { "Content-Type": "text/plain; charset=utf-8" } });
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
  const { data: row, error } = await supabase
    .from("gift_tokens")
    .select("character, pinyin, en_meaning")
    .eq("token", token)
    .maybeSingle();

  if (error || !row) {
    return new Response("Not found", { status: 404, headers: { "Content-Type": "text/plain; charset=utf-8" } });
  }

  const title = `Chinese Flash — ${row.character} (${row.pinyin})`;
  const desc = row.en_meaning;
  const canonical = `${CANONICAL_SITE}/g/${token}`;
  const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${escAttr(title)}</title>
<link rel="canonical" href="${escAttr(canonical)}" />
<meta property="og:type" content="website" />
<meta property="og:url" content="${escAttr(canonical)}" />
<meta property="og:title" content="${escAttr(title)}" />
<meta property="og:description" content="${escAttr(desc)}" />
<meta property="og:image" content="${escAttr(DEFAULT_OG_IMAGE)}" />
<meta name="twitter:card" content="summary_large_image" />
<meta name="twitter:title" content="${escAttr(title)}" />
<meta name="twitter:description" content="${escAttr(desc)}" />
</head>
<body></body>
</html>`;

  return new Response(html, {
    status: 200,
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "public, max-age=300",
    },
  });
});
