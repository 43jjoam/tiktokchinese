import { createClient } from "https://esm.sh/@supabase/supabase-js@2.100.0";

const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY")!;
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const SHOPIFY_WEBHOOK_SECRET = Deno.env.get("SHOPIFY_WEBHOOK_SECRET") ?? "";

const SKU_TO_DECK: Record<string, string> = {
  "hsk1": "4d0a4205-8770-4c0e-ad4c-90ea8401eea9",
  "hsk2": "538ccb54-df66-4bac-a220-f651ad1ca392",
  "hsk3": "d1843746-2869-4bc9-bfce-a9e9e057fb87",
  "hsk4": "efc3925d-54bd-4304-8854-c34e22e64561",
  "hsk5": "efe88cf9-649c-4565-babb-5e14a2c1b7f2",
  "hsk6": "fbfec73c-413b-452c-9d75-8ee59e6cb6b8",
  "pinyin": "53f85f39-2242-4b4f-8bbc-4b24cfb4fa74",
  "pinyinflashcard": "53f85f39-2242-4b4f-8bbc-4b24cfb4fa74",
};

const UUID_WITH_HYPHENS =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Shopify SKU can be the Supabase deck UUID (with or without hyphens). */
function parseDeckUuidFromSku(sku: string): string | null {
  const raw = (sku || "").trim();
  if (UUID_WITH_HYPHENS.test(raw)) return raw.toLowerCase();
  const compact = raw.replace(/-/g, "").toLowerCase();
  if (/^[0-9a-f]{32}$/.test(compact)) {
    return `${compact.slice(0, 8)}-${compact.slice(8, 12)}-${compact.slice(12, 16)}-${compact.slice(16, 20)}-${compact.slice(20)}`;
  }
  return null;
}

function normalizeSku(sku: string): string {
  return sku.toLowerCase().replace(/[\s\-_\.]/g, "");
}

function findDeckId(sku: string, title: string): string | null {
  const fromUuid = parseDeckUuidFromSku(sku);
  if (fromUuid) return fromUuid;

  const normalized = normalizeSku(sku || "");
  if (SKU_TO_DECK[normalized]) return SKU_TO_DECK[normalized];

  for (const [key, deckId] of Object.entries(SKU_TO_DECK)) {
    if (normalized.includes(key)) return deckId;
  }

  const normalizedTitle = normalizeSku(title || "");
  for (const [key, deckId] of Object.entries(SKU_TO_DECK)) {
    if (normalizedTitle.includes(key)) return deckId;
  }

  return null;
}

async function verifyShopifyHmac(
  body: string,
  hmacHeader: string,
): Promise<boolean> {
  if (!SHOPIFY_WEBHOOK_SECRET) return true;
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(SHOPIFY_WEBHOOK_SECRET),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(body));
  const computed = btoa(String.fromCharCode(...new Uint8Array(sig)));
  return computed === hmacHeader;
}

async function sendEmail(to: string, code: string, deckName: string) {
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${RESEND_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: "Bestling <noreply@bestling.net>",
      to: [to],
      subject: `Your activation code for ${deckName}`,
      html: `
        <div style="font-family: system-ui, sans-serif; max-width: 480px; margin: 0 auto; padding: 32px 20px;">
          <h2 style="color: #1a1a2e;">Thank you for your purchase!</h2>
          <p>Your <strong>${deckName}</strong> is ready to activate.</p>
          <div style="background: #f0f0ff; border-radius: 12px; padding: 20px; text-align: center; margin: 24px 0;">
            <div style="font-size: 12px; color: #666; margin-bottom: 8px;">YOUR ACTIVATION CODE</div>
            <div style="font-size: 28px; font-weight: bold; letter-spacing: 2px; color: #4f46e5;">${code}</div>
          </div>
          <p><strong>How to activate:</strong></p>
          <ol>
            <li>Open the app at <a href="https://chineseflash.com/">chineseflash.com</a></li>
            <li>Tap the <strong>Library</strong> tab at the bottom</li>
            <li>Enter your code and tap <strong>Activate</strong></li>
          </ol>
          <p style="color: #999; font-size: 12px; margin-top: 32px;">This code can only be used once. If you have any issues, please reply to this email.</p>
        </div>
      `,
    }),
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Resend error: ${err}`);
  }
}

Deno.serve(async (req) => {
  try {
  if (req.method === "GET") {
    return new Response(
      JSON.stringify({
        ok: true,
        message:
          "Shopify webhook endpoint — only POST requests from Shopify are accepted. Open in browser shows this info page.",
      }),
      { headers: { "Content-Type": "application/json" } },
    );
  }
  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405 });
  }

  const body = await req.text();

  const hmac = req.headers.get("x-shopify-hmac-sha256") ?? "";
  if (SHOPIFY_WEBHOOK_SECRET && !(await verifyShopifyHmac(body, hmac))) {
    return new Response("Invalid signature", { status: 401 });
  }

  const order = JSON.parse(body);
  const email = order.email || order.contact_email;
  if (!email) {
    return new Response("No email in order", { status: 400 });
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
  const results: string[] = [];

  for (const item of order.line_items ?? []) {
    const deckId = findDeckId(item.sku ?? "", item.title ?? "");
    if (!deckId) {
      results.push(`Skipped: ${item.title} (no matching deck)`);
      continue;
    }

    const { data: codeRows, error: codeErr } = await supabase
      .from("activation_codes")
      .select("id, code, deck_id, redeemed_by")
      .eq("deck_id", deckId)
      .limit(50);

    const codeRow = codeRows?.find(
      (r: any) => !r.redeemed_by || r.redeemed_by === "",
    ) ?? null;

    if (codeErr || !codeRow) {
      results.push(`ERROR: No unused codes left for deck ${deckId}`);
      continue;
    }

    const { data: deck } = await supabase
      .from("decks")
      .select("name")
      .eq("id", deckId)
      .single();

    const deckName = deck?.name ?? item.title ?? "Flashcard Deck";

    await sendEmail(email, codeRow.code, deckName);

    results.push(`Sent code for ${deckName} to ${email}`);
  }

  return new Response(JSON.stringify({ ok: true, results }), {
    headers: { "Content-Type": "application/json" },
  });
  } catch (err) {
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
});
