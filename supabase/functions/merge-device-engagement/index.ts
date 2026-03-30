import { createClient } from "https://esm.sh/@supabase/supabase-js@2.100.0";
import { corsHeadersForRequestOrigin, isOriginAllowed } from "../_shared/cors.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const HEX64 = /^[0-9a-f]{64}$/i;
function validDeviceHash(h: string): boolean {
  if (HEX64.test(h)) return true;
  if (h.startsWith("dev-") && h.length >= 10 && h.length <= 128) return true;
  return false;
}

type Body = { device_hash?: string };

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
    return new Response("Forbidden", { status: 403, headers: ch });
  }

  const auth = req.headers.get("authorization")?.trim() ?? "";
  const token = auth.toLowerCase().startsWith("bearer ") ? auth.slice(7).trim() : "";
  if (!token) {
    return new Response(JSON.stringify({ error: "missing_authorization" }), {
      status: 401,
      headers: { ...ch, "Content-Type": "application/json" },
    });
  }

  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return new Response(JSON.stringify({ error: "invalid_json" }), {
      status: 400,
      headers: { ...ch, "Content-Type": "application/json" },
    });
  }

  const device_hash = body.device_hash?.trim() ?? "";
  if (!device_hash || !validDeviceHash(device_hash)) {
    return new Response(JSON.stringify({ error: "invalid_device_hash" }), {
      status: 400,
      headers: { ...ch, "Content-Type": "application/json" },
    });
  }

  const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
  const { data: userData, error: userErr } = await admin.auth.getUser(token);
  if (userErr || !userData?.user?.id) {
    return new Response(JSON.stringify({ error: "invalid_token" }), {
      status: 401,
      headers: { ...ch, "Content-Type": "application/json" },
    });
  }

  const userId = userData.user.id;
  const { data: rpcData, error: rpcErr } = await admin.rpc("merge_engagement_device_to_user", {
    p_user_id: userId,
    p_device_hash: device_hash,
  });

  if (rpcErr) {
    console.error("merge-device-engagement rpc", rpcErr);
    return new Response(JSON.stringify({ error: "merge_failed" }), {
      status: 500,
      headers: { ...ch, "Content-Type": "application/json" },
    });
  }

  return new Response(JSON.stringify({ ok: true, result: rpcData }), {
    status: 200,
    headers: { ...ch, "Content-Type": "application/json" },
  });
});
