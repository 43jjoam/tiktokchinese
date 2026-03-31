import { createClient } from "https://esm.sh/@supabase/supabase-js@2.100.0";

const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY") ?? "";
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const RESEND_FROM =
  Deno.env.get("RESEND_FROM")?.trim() ||
  "Chinese Flash <noreply@bestling.net>";
const APP_URL = (Deno.env.get("STREAK_REMINDER_APP_URL") ?? "https://chineseflash.com").replace(
  /\/$/,
  "",
);

function json(status: number, body: Record<string, unknown>): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...corsHeaders() },
  });
}

function corsHeaders(): HeadersInit {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  };
}

/** `sub` from JWT after gateway verify_jwt — avoids depending on SUPABASE_ANON_KEY in Edge. */
function getBearerJwtSub(req: Request): string | null {
  const m = /^Bearer\s+(.+)$/i.exec(req.headers.get("authorization")?.trim() ?? "");
  const jwt = m?.[1]?.trim();
  if (!jwt) return null;
  try {
    const parts = jwt.split(".");
    if (parts.length < 2) return null;
    const b64 = parts[1].replace(/-/g, "+").replace(/_/g, "/");
    const json = atob(b64);
    const p = JSON.parse(json) as { sub?: string };
    return typeof p.sub === "string" ? p.sub : null;
  } catch {
    return null;
  }
}

async function sendReferrerEmail(to: string): Promise<void> {
  if (!RESEND_API_KEY) {
    throw new Error("RESEND_API_KEY not configured");
  }
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${RESEND_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: RESEND_FROM,
      to: [to],
      subject: "Your friend just joined ChineseFlash",
      html: `
        <div style="font-family: system-ui, sans-serif; max-width: 480px; margin: 0 auto; padding: 32px 20px; color: #1a1a2e;">
          <h2 style="margin-top: 0;">Someone you invited just signed up</h2>
          <p>You unlocked <strong>20 more free cards</strong>; they get <strong>10</strong> when they join.</p>
          <p>Keep sharing — every friend earns you more free content.</p>
          <p style="margin-top: 24px;">
            <a href="${APP_URL}/" style="display: inline-block; background: #4f46e5; color: #fff; text-decoration: none; padding: 12px 24px; border-radius: 10px; font-weight: 600;">Open Chinese Flash</a>
          </p>
        </div>
      `,
    }),
  });
  if (!res.ok) {
    const t = await res.text();
    throw new Error(`Resend error: ${t}`);
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders() });
  }

  if (req.method !== "POST") {
    return new Response("Method not allowed", {
      status: 405,
      headers: { "Content-Type": "text/plain", ...corsHeaders() },
    });
  }

  const inviteeId = getBearerJwtSub(req);
  if (!inviteeId) {
    return json(401, { error: "invalid_session" });
  }
  const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

  const { data: row, error: rowErr } = await admin
    .from("user_learning_profiles")
    .select("referred_by, referral_bonus_applied, referrer_join_email_sent_at")
    .eq("user_id", inviteeId)
    .maybeSingle();

  if (rowErr) {
    console.error("notify-referrer-join profile", rowErr);
    return json(500, { error: "profile_read_failed", detail: rowErr.message });
  }

  if (!row?.referred_by) {
    return json(400, { error: "no_referral" });
  }

  if (!row.referral_bonus_applied) {
    return json(409, { error: "bonus_not_applied_yet" });
  }

  if (row.referrer_join_email_sent_at) {
    return json(200, { ok: true, alreadySent: true });
  }

  const referrerId = row.referred_by as string;
  if (referrerId === inviteeId) {
    return json(400, { error: "self_referral" });
  }

  const { data: refUser, error: refErr } = await admin.auth.admin.getUserById(referrerId);
  const emailRaw = refUser?.user?.email?.trim();
  if (refErr || !emailRaw) {
    return json(500, { error: "referrer_email_unavailable" });
  }

  try {
    await sendReferrerEmail(emailRaw);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("notify-referrer-join resend", msg);
    return json(500, { error: "email_failed", detail: msg });
  }

  const nowIso = new Date().toISOString();
  const { error: upErr } = await admin
    .from("user_learning_profiles")
    .update({ referrer_join_email_sent_at: nowIso })
    .eq("user_id", inviteeId)
    .is("referrer_join_email_sent_at", null);

  if (upErr) {
    console.error("notify-referrer-join update", upErr);
    return json(500, { error: "update_failed", detail: upErr.message });
  }

  return json(200, { ok: true, sent: true });
});
