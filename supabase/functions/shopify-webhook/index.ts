import { createClient } from "https://esm.sh/@supabase/supabase-js@2.100.0";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const SHOPIFY_WEBHOOK_SECRET = Deno.env.get("SHOPIFY_WEBHOOK_SECRET") ?? "";
/** Must be a domain verified in Resend. Default matches the historical sender (before chineseflash.com). */
const RESEND_FROM =
  Deno.env.get("RESEND_FROM")?.trim() ||
  "Bestling <noreply@bestling.net>";

/** Same env as streak / referrer emails; activation instructions link in purchase email. */
const APP_URL = (
  Deno.env.get("ACTIVATION_EMAIL_APP_URL")?.trim() ||
  Deno.env.get("STREAK_REMINDER_APP_URL")?.trim() ||
  "https://chineseflash.com"
).replace(/\/$/, "");
const APP_LINK_LABEL = APP_URL.replace(/^https?:\/\//, "");

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

/** PostgREST / Postgres when allocation columns were not migrated yet. */
function missingShopifyAllocationColumn(err: { message?: string } | null | undefined): boolean {
  const m = (err?.message ?? "").toLowerCase();
  return (
    (m.includes("shopify_allocation_ref") || m.includes("shopify_assigned_at")) &&
    (m.includes("does not exist") || m.includes("could not find") || m.includes("schema cache"))
  );
}

function rowIsUnallocated(ref: string | null | undefined): boolean {
  return ref == null || String(ref).trim() === "";
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

/** Shopify usually sends the Order at the root; some proxies or tools wrap `{ order: { ... } }`. */
function parseOrderFromWebhookBody(body: string): Record<string, unknown> {
  const parsed: unknown = JSON.parse(body);
  if (parsed === null || typeof parsed !== "object") {
    throw new Error("Webhook JSON must be an object");
  }
  if (Array.isArray(parsed)) {
    throw new Error("Webhook JSON must not be an array");
  }
  const root = parsed as Record<string, unknown>;
  const inner = root["order"];
  if (inner !== null && typeof inner === "object" && !Array.isArray(inner)) {
    return inner as Record<string, unknown>;
  }
  return root;
}

function emailFromAddressField(addr: unknown): string | null {
  if (addr === null || typeof addr !== "object" || Array.isArray(addr)) return null;
  const e = (addr as Record<string, unknown>)["email"];
  return typeof e === "string" && e.trim() ? e.trim() : null;
}

/**
 * Shopify puts the buyer email on the order root for most checkouts; Apple Pay / Shop Pay / wallets
 * sometimes only duplicate it onto billing or shipping address — check those too.
 */
function orderEmail(order: Record<string, unknown>): string | null {
  const direct =
    order["email"] ?? order["contact_email"] ?? order["customer_email"];
  if (typeof direct === "string" && direct.trim()) return direct.trim();

  const customer = order["customer"];
  if (customer !== null && typeof customer === "object" && !Array.isArray(customer)) {
    const cr = customer as Record<string, unknown>;
    const e = cr["email"];
    if (typeof e === "string" && e.trim()) return e.trim();
    const fromDefault = emailFromAddressField(cr["default_address"]);
    if (fromDefault) return fromDefault;
  }

  const billing = emailFromAddressField(order["billing_address"]);
  if (billing) return billing;

  const shipping = emailFromAddressField(order["shipping_address"]);
  if (shipping) return shipping;

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

function requireResendApiKey(): string {
  const k = Deno.env.get("RESEND_API_KEY")?.trim();
  if (!k) {
    throw new Error(
      "RESEND_API_KEY is missing — add it under Supabase → Project Settings → Edge Functions → Secrets, then redeploy shopify-webhook",
    );
  }
  return k;
}

/** Domain only — avoids logging full buyer email in logs. */
function emailDomain(addr: string): string {
  const i = addr.lastIndexOf("@");
  return i === -1 ? "?" : addr.slice(i + 1);
}

async function sendEmail(to: string, code: string, deckName: string) {
  const apiKey = requireResendApiKey();
  console.log(
    JSON.stringify({
      tag: "shopify_webhook_resend_request",
      from: RESEND_FROM,
      toDomain: emailDomain(to),
      deckName,
    }),
  );
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: RESEND_FROM,
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
            <li>Open the app at <a href="${APP_URL}/">${APP_LINK_LABEL}</a></li>
            <li>Tap the <strong>Library</strong> tab at the bottom</li>
            <li>Enter your code and tap <strong>Activate</strong></li>
          </ol>
          <p style="color: #999; font-size: 12px; margin-top: 32px;">This code can only be used once. If you have any issues, please reply to this email.</p>
        </div>
      `,
    }),
  });
  const bodyText = await res.text();
  let resendId: string | null = null;
  try {
    const j = JSON.parse(bodyText) as { id?: string };
    if (typeof j?.id === "string") resendId = j.id;
  } catch {
    /* not JSON */
  }
  console.log(
    JSON.stringify({
      tag: "shopify_webhook_resend_http",
      status: res.status,
      ok: res.ok,
      resendId,
      bodySnippet: bodyText.slice(0, 500),
    }),
  );
  if (!res.ok) {
    throw new Error(`Resend API ${res.status}: ${bodyText}`);
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
  const hmacRequired = Boolean(SHOPIFY_WEBHOOK_SECRET);
  console.log(
    JSON.stringify({
      tag: "shopify_webhook_post",
      bodyBytes: body.length,
      hasHmacHeader: Boolean(hmac),
      hmacVerificationEnabled: hmacRequired,
    }),
  );
  if (hmacRequired && !(await verifyShopifyHmac(body, hmac))) {
    console.warn(
      JSON.stringify({
        tag: "shopify_webhook_hmac_invalid",
        hint: "Set Supabase SHOPIFY_WEBHOOK_SECRET to the exact signing secret shown in Shopify for this webhook URL",
      }),
    );
    return new Response("Invalid signature", { status: 401 });
  }

  let order: Record<string, unknown>;
  try {
    order = parseOrderFromWebhookBody(body);
  } catch (parseErr) {
    console.warn(
      JSON.stringify({
        tag: "shopify_webhook_bad_json",
        error: String(parseErr),
      }),
    );
    return new Response(
      JSON.stringify({ error: "Invalid JSON or order payload" }),
      { status: 400, headers: { "Content-Type": "application/json" } },
    );
  }

  const email = orderEmail(order);

  const lineItemsRaw = order["line_items"];
  const lineItems = Array.isArray(lineItemsRaw) ? lineItemsRaw : [];

  const paymentGateways = order["payment_gateway_names"];
  const paymentGatewayNames = Array.isArray(paymentGateways)
    ? paymentGateways.filter((x): x is string => typeof x === "string")
    : [];

  console.log(
    JSON.stringify({
      tag: "shopify_webhook_order",
      orderId: order["id"] ?? order["name"] ?? null,
      hasEmail: Boolean(email),
      lineItemCount: lineItems.length,
      paymentGatewayNames,
      resendConfigured: Boolean(Deno.env.get("RESEND_API_KEY")?.trim()),
      supabaseConfigured: Boolean(
        SUPABASE_URL?.trim() && SUPABASE_SERVICE_ROLE_KEY?.trim(),
      ),
    }),
  );

  if (!email) {
    console.warn(
      JSON.stringify({
        tag: "shopify_webhook_no_email",
        orderKeys: Object.keys(order).slice(0, 40),
      }),
    );
    return new Response("No email in order", { status: 400 });
  }

  if (lineItems.length === 0) {
    console.warn(
      JSON.stringify({
        tag: "shopify_webhook_no_line_items",
        orderId: order["id"] ?? order["name"] ?? null,
        hint: "Order has no line_items — Resend is never called; check Shopify webhook API version / payload",
      }),
    );
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
  const results: string[] = [];
  const orderKey = String(order["id"] ?? order["name"] ?? "unknown");

  for (let lineIndex = 0; lineIndex < lineItems.length; lineIndex++) {
    const item = lineItems[lineIndex] as Record<string, unknown>;
    if (!item || typeof item !== "object") continue;
    const deckId = findDeckId(
      typeof item["sku"] === "string" ? item["sku"] : "",
      typeof item["title"] === "string" ? item["title"] : "",
    );
    if (!deckId) {
      console.log(
        JSON.stringify({
          tag: "shopify_webhook_skip_line",
          sku: typeof item["sku"] === "string" ? item["sku"] : null,
          title: typeof item["title"] === "string" ? item["title"] : null,
          reason: "no_matching_deck",
        }),
      );
      results.push(
        `Skipped: ${typeof item["title"] === "string" ? item["title"] : "?"} (no matching deck)`,
      );
      continue;
    }

    /** One stable ref per order line — Shopify retries reuse the same code + email. */
    const lineId = item["id"];
    const allocationRef = `${orderKey}:${lineId ?? `idx${lineIndex}`}`;

    const { data: alreadyRow, error: alreadyErr } = await supabase
      .from("activation_codes")
      .select("code")
      .eq("shopify_allocation_ref", allocationRef)
      .maybeSingle();

    let codeToSend: string | null = !alreadyErr && alreadyRow?.code ? alreadyRow.code : null;

    /** False → DB has no allocation columns (run setup_activation_codes_shopify_allocation.sql). */
    let useAllocation = !missingShopifyAllocationColumn(alreadyErr);
    if (alreadyErr && missingShopifyAllocationColumn(alreadyErr)) {
      console.warn(
        JSON.stringify({
          tag: "shopify_webhook_allocation_columns_missing",
          hint: "Run supabase/setup_activation_codes_shopify_allocation.sql",
        }),
      );
    }

    if (!codeToSend) {
      const maxAttempts = 12;
      for (let attempt = 0; attempt < maxAttempts; attempt++) {
        if (!useAllocation) {
          const { data: legacyRow, error: legErr } = await supabase
            .from("activation_codes")
            .select("code")
            .eq("deck_id", deckId)
            .or("redeemed_by.is.null,redeemed_by.eq.,redeemed_by.eq.EMPTY")
            .order("id", { ascending: true })
            .limit(1)
            .maybeSingle();
          if (legErr || !legacyRow?.code) {
            console.error(
              JSON.stringify({
                tag: "shopify_webhook_no_code",
                deckId,
                allocationRef,
                mode: "legacy",
                pickErr: legErr?.message ?? null,
              }),
            );
            break;
          }
          codeToSend = legacyRow.code;
          console.warn(
            JSON.stringify({
              tag: "shopify_webhook_legacy_pool",
              deckId,
              warning: "Duplicate-email risk until allocation SQL is applied",
            }),
          );
          break;
        }

        const { data: poolRows, error: poolErr } = await supabase
          .from("activation_codes")
          .select("id, code, shopify_allocation_ref")
          .eq("deck_id", deckId)
          .or("redeemed_by.is.null,redeemed_by.eq.,redeemed_by.eq.EMPTY")
          .order("id", { ascending: true })
          .limit(100);

        if (poolErr) {
          if (missingShopifyAllocationColumn(poolErr)) {
            useAllocation = false;
            attempt--;
            continue;
          }
          console.error(
            JSON.stringify({
              tag: "shopify_webhook_no_code",
              deckId,
              allocationRef,
              pickErr: poolErr.message,
              attempt,
            }),
          );
          break;
        }

        const candidate = (poolRows ?? []).find((r: { shopify_allocation_ref?: string | null }) =>
          rowIsUnallocated(r.shopify_allocation_ref),
        );
        if (!candidate?.id || !candidate.code) {
          console.error(
            JSON.stringify({
              tag: "shopify_webhook_no_code",
              deckId,
              allocationRef,
              reason: "no_unallocated_row",
              scanned: poolRows?.length ?? 0,
            }),
          );
          break;
        }

        const assignedAt = new Date().toISOString();
        let claimed = await supabase
          .from("activation_codes")
          .update({
            shopify_allocation_ref: allocationRef,
            shopify_assigned_at: assignedAt,
          })
          .eq("id", candidate.id)
          .or("redeemed_by.is.null,redeemed_by.eq.,redeemed_by.eq.EMPTY")
          .is("shopify_allocation_ref", null)
          .select("code")
          .maybeSingle();

        if (!claimed.data?.code && !claimed.error) {
          claimed = await supabase
            .from("activation_codes")
            .update({
              shopify_allocation_ref: allocationRef,
              shopify_assigned_at: assignedAt,
            })
            .eq("id", candidate.id)
            .or("redeemed_by.is.null,redeemed_by.eq.,redeemed_by.eq.EMPTY")
            .eq("shopify_allocation_ref", "")
            .select("code")
            .maybeSingle();
        }

        if (claimed.error) {
          if (missingShopifyAllocationColumn(claimed.error)) {
            useAllocation = false;
            codeToSend = candidate.code;
            console.warn(
              JSON.stringify({
                tag: "shopify_webhook_send_without_claim",
                deckId,
                warning: "Apply setup_activation_codes_shopify_allocation.sql to fix",
              }),
            );
            break;
          }
          console.error(
            JSON.stringify({
              tag: "shopify_webhook_claim_err",
              deckId,
              claimErr: claimed.error.message,
              attempt,
            }),
          );
          continue;
        }

        if (claimed.data?.code) {
          codeToSend = claimed.data.code;
          break;
        }
      }
    }

    if (!codeToSend) {
      results.push(
        `ERROR: No unused codes left for deck ${deckId} (check deck_id matches this product UUID; rows need redeemed_by empty and shopify_allocation_ref empty — run setup_activation_codes_shopify_allocation.sql if missing columns).`,
      );
      continue;
    }

    const { data: deck } = await supabase
      .from("decks")
      .select("name")
      .eq("id", deckId)
      .single();

    const deckName =
      deck?.name ??
      (typeof item["title"] === "string" ? item["title"] : null) ??
      "Flashcard Deck";

    try {
      await sendEmail(email, codeToSend, deckName);
      console.log(
        JSON.stringify({
          tag: "shopify_webhook_email_sent",
          deckId,
          deckName,
          allocationRef,
          idempotentResend: Boolean(alreadyRow?.code),
        }),
      );
    } catch (e) {
      console.error(
        JSON.stringify({
          tag: "shopify_webhook_resend_failed",
          deckId,
          allocationRef,
          error: String(e),
        }),
      );
      throw e;
    }

    results.push(`Sent code for ${deckName} to ${email}`);
  }

  const sentCount = results.filter((r) => r.startsWith("Sent code")).length;
  console.log(
    JSON.stringify({
      tag: "shopify_webhook_summary",
      lineItemCount: lineItems.length,
      sentCount,
      results,
    }),
  );
  if (lineItems.length > 0 && sentCount === 0) {
    console.warn(
      JSON.stringify({
        tag: "shopify_webhook_no_resend",
        hint:
          "No activation email was sent — usually SKU/title did not match a deck (see shopify_webhook_skip_line), or activation_codes pool empty (see ERROR lines in results), or RESEND_API_KEY missing",
      }),
    );
  }

  return new Response(JSON.stringify({ ok: true, results }), {
    headers: { "Content-Type": "application/json" },
  });
  } catch (err) {
    const message = String(err);
    console.error(
      JSON.stringify({
        tag: "shopify_webhook_500",
        error: message,
      }),
    );
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
});
