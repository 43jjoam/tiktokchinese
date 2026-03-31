import { createClient } from "https://esm.sh/@supabase/supabase-js@2.100.0";
import { corsHeadersForRequestOrigin, isOriginAllowed } from "../_shared/cors.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

type DeckRow = {
  id: string;
  name: string;
  cover_image_url: string;
  shopify_url: string | null;
};

function activationCodeLookupValues(trimmed: string): string[] {
  const t = trimmed.trim();
  if (!t) return [];
  const noSpace = t.replace(/\s+/g, "");
  return [
    ...new Set([
      t,
      t.toUpperCase(),
      t.toLowerCase(),
      noSpace,
      noSpace.toUpperCase(),
      noSpace.toLowerCase(),
    ]),
  ].filter((c) => c.length > 0);
}

type CodeRow = {
  id: string;
  code: string;
  deck_id: string;
  redeemed_by: string | null;
};

function redeemedByIsUnset(value: string | null | undefined): boolean {
  const v = (value ?? "").trim();
  if (!v) return true;
  if (/^empty$/i.test(v)) return true;
  return false;
}

function pickActivationCodeRow(list: CodeRow[], candidates: string[]): CodeRow | null {
  if (list.length === 0) return null;
  const matching = list.filter((r) => candidates.includes(r.code));
  const pool = matching.length > 0 ? matching : list;
  const free = pool.find((r) => redeemedByIsUnset(r.redeemed_by));
  return free ?? pool[0] ?? null;
}

function sameDeviceRedemption(redeemedBy: string | null | undefined, deviceId: string): boolean {
  if (redeemedByIsUnset(redeemedBy)) return false;
  return (redeemedBy ?? "").trim() === deviceId.trim();
}

function otherDeviceRedemption(redeemedBy: string | null | undefined, deviceId: string): boolean {
  if (redeemedByIsUnset(redeemedBy)) return false;
  return (redeemedBy ?? "").trim() !== deviceId.trim();
}

function validDeviceId(s: string): boolean {
  if (!s || s.length < 8 || s.length > 128) return false;
  return /^[a-zA-Z0-9_.-]+$/.test(s);
}

function json(origin: string | null, body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeadersForRequestOrigin(origin), "Content-Type": "application/json" },
  });
}

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
    return json(origin, { success: false, error: "Forbidden" }, 403);
  }

  let body: { code?: string; device_id?: string };
  try {
    body = await req.json();
  } catch {
    return json(origin, { success: false, error: "Invalid request." }, 400);
  }

  const rawCode = typeof body.code === "string" ? body.code.trim() : "";
  const deviceId = typeof body.device_id === "string" ? body.device_id.trim() : "";

  if (!rawCode || rawCode.length > 80 || !validDeviceId(deviceId)) {
    return json(origin, { success: false, error: "Invalid request." }, 400);
  }

  const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
  const candidates = activationCodeLookupValues(rawCode);

  const { data: rows, error: fetchErr } = await admin
    .from("activation_codes")
    .select("id, code, deck_id, redeemed_by")
    .in("code", candidates);

  if (fetchErr) {
    console.error("redeem-activation lookup", fetchErr);
    return json(origin, { success: false, error: "Could not verify this code. Try again." }, 500);
  }

  const list = (rows ?? []) as CodeRow[];
  if (list.length === 0) {
    return json(origin, { success: false, error: "Invalid activation code." });
  }

  const codeRow = pickActivationCodeRow(list, candidates);
  if (!codeRow) {
    return json(origin, { success: false, error: "Invalid activation code." });
  }

  if (otherDeviceRedemption(codeRow.redeemed_by, deviceId)) {
    return json(origin, { success: false, error: "This code has already been used." });
  }

  async function loadDeck(deckId: string): Promise<{ deck: DeckRow | null; err: string | null }> {
    const { data: deck, error: deckErr } = await admin
      .from("decks")
      .select("id, name, cover_image_url, shopify_url")
      .eq("id", deckId)
      .maybeSingle();
    if (deckErr) {
      console.error("redeem-activation deck", deckErr);
      return { deck: null, err: "Could not load deck. Try again." };
    }
    return { deck: deck as DeckRow | null, err: null };
  }

  if (sameDeviceRedemption(codeRow.redeemed_by, deviceId)) {
    const { deck, err } = await loadDeck(codeRow.deck_id);
    if (err) return json(origin, { success: false, error: err }, 500);
    if (!deck) return json(origin, { success: false, error: "Deck not found." });
    return json(origin, { success: true, deck });
  }

  /** §1 Cause C: deck must exist before we mark the code redeemed. */
  const { deck: deckPre, err: deckErr } = await loadDeck(codeRow.deck_id);
  if (deckErr) return json(origin, { success: false, error: deckErr }, 500);
  if (!deckPre) return json(origin, { success: false, error: "Deck not found." });

  const now = new Date().toISOString();
  const { data: updated, error: upErr } = await admin
    .from("activation_codes")
    .update({ redeemed_by: deviceId, redeemed_at: now })
    .eq("id", codeRow.id)
    .or("redeemed_by.is.null,redeemed_by.eq.,redeemed_by.eq.EMPTY")
    .select("id")
    .maybeSingle();

  if (upErr) {
    console.error("redeem-activation update", upErr);
    return json(origin, { success: false, error: "Could not save this code. Try again." }, 500);
  }

  if (!updated) {
    return json(origin, { success: false, error: "This code has already been used." });
  }

  return json(origin, { success: true, deck: deckPre });
});
