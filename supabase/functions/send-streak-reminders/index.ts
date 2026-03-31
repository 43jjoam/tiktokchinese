import { createClient } from "https://esm.sh/@supabase/supabase-js@2.100.0";

const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY") ?? "";
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const CRON_SECRET = (Deno.env.get("STREAK_REMINDER_CRON_SECRET") ?? "").trim();
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
    headers: { "Content-Type": "application/json" },
  });
}

async function sendReminderEmail(to: string, streakDays: number): Promise<void> {
  if (!RESEND_API_KEY) {
    throw new Error("RESEND_API_KEY not configured");
  }
  const streakLine =
    streakDays > 0
      ? `You’re on a <strong>${streakDays}-day</strong> streak — nice work.`
      : "Your learning streak is ready when you are.";
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${RESEND_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: RESEND_FROM,
      to: [to],
      subject: "Your Chinese Flash streak is waiting",
      html: `
        <div style="font-family: system-ui, sans-serif; max-width: 480px; margin: 0 auto; padding: 32px 20px; color: #1a1a2e;">
          <h2 style="margin-top: 0;">Time to come back</h2>
          <p>You asked for a reminder — <strong>10 more free cards</strong> unlock when you return today.</p>
          <p>${streakLine}</p>
          <p style="margin-top: 24px;">
            <a href="${APP_URL}/" style="display: inline-block; background: #4f46e5; color: #fff; text-decoration: none; padding: 12px 24px; border-radius: 10px; font-weight: 600;">Open Chinese Flash</a>
          </p>
          <p style="color: #666; font-size: 13px; margin-top: 32px;">If you’re not learning Chinese anymore, you can ignore this email.</p>
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
    return new Response(null, { status: 204 });
  }

  const auth = req.headers.get("authorization")?.trim() ?? "";
  const m = /^Bearer\s+(.+)$/i.exec(auth);
  const token = m?.[1]?.trim() ?? "";
  if (!CRON_SECRET) {
    return json(401, { error: "unauthorized", reason: "no_secret_in_function_env" });
  }
  if (!token) {
    return json(401, { error: "unauthorized", reason: "no_bearer_token" });
  }
  if (token !== CRON_SECRET) {
    return json(401, { error: "unauthorized", reason: "secret_mismatch" });
  }

  if (req.method !== "POST" && req.method !== "GET") {
    return new Response("Method not allowed", { status: 405 });
  }

  const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
  const nowIso = new Date().toISOString();

  // Only `user_id` — `current_streak` exists only after setup_user_profile_stats_columns.sql; email copy defaults to generic streak line when absent.
  const { data: rows, error: qErr } = await admin
    .from("user_learning_profiles")
    .select("user_id")
    .not("streak_reminder_scheduled_at", "is", null)
    .is("streak_reminder_sent_at", null)
    .lte("streak_reminder_scheduled_at", nowIso)
    .limit(100);

  if (qErr) {
    console.error("send-streak-reminders query", qErr);
    return json(500, { error: "query_failed", detail: qErr.message });
  }

  const list = rows ?? [];
  let sent = 0;
  const errors: string[] = [];

  for (const row of list) {
    const uid = row.user_id as string;
    const streakDays = 0;
    try {
      const { data: authData, error: uErr } = await admin.auth.admin.getUserById(uid);
      const emailRaw = authData?.user?.email?.trim();
      if (uErr || !emailRaw) {
        errors.push(`${uid}: no email`);
        continue;
      }
      const email = emailRaw;
      if (!email) continue;

      await sendReminderEmail(email, streakDays);

      const { error: upErr } = await admin
        .from("user_learning_profiles")
        .update({ streak_reminder_sent_at: nowIso })
        .eq("user_id", uid)
        .is("streak_reminder_sent_at", null);

      if (upErr) {
        errors.push(`${uid}: update ${upErr.message}`);
        continue;
      }

      const { error: evErr } = await admin.from("app_events").insert({
        user_id: uid,
        name: "reminder_email_sent",
        payload: {},
      });
      if (evErr) {
        console.warn("send-streak-reminders app_events", uid, evErr.message);
      }

      sent++;
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      errors.push(`${uid}: ${msg}`);
    }
  }

  return json(200, {
    ok: true,
    due: list.length,
    sent,
    errors: errors.length ? errors : undefined,
  });
});
