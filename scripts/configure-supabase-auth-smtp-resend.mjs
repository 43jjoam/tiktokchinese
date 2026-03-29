#!/usr/bin/env node
/**
 * One-shot: enable Supabase Auth custom SMTP via Resend (magic link, confirm, reset).
 *
 * I cannot run this for you — it needs your Supabase access token and Resend API key.
 *
 * Prerequisites:
 * - Resend: domain verified (e.g. chineseflash.com) — same as Edge Function emails
 * - Token: https://supabase.com/dashboard/account/tokens
 * - Project ref: from VITE_SUPABASE_URL → https://<REF>.supabase.co
 *
 * Usage (use REAL values — not the words "your token"):
 *   export SUPABASE_ACCESS_TOKEN="<paste from Account → Access Tokens>"
 *   export SUPABASE_PROJECT_REF="abcdxyz"
 *   export RESEND_API_KEY="re_..."
 *   # optional — must use an address on a Resend-verified domain
 *   export SMTP_ADMIN_EMAIL="noreply@chineseflash.com"
 *   export SMTP_SENDER_NAME="Chinese Flash"
 *   npm run configure:supabase-auth-smtp
 *
 * Docs: https://supabase.com/docs/guides/auth/auth-smtp
 *       https://resend.com/docs/send-with-supabase-smtp
 */

const token = process.env.SUPABASE_ACCESS_TOKEN?.trim()
const ref = process.env.SUPABASE_PROJECT_REF?.trim()
const resendKey = process.env.RESEND_API_KEY?.trim()
const smtpAdminEmail = (process.env.SMTP_ADMIN_EMAIL ?? 'noreply@chineseflash.com').trim()
const smtpSenderName = (process.env.SMTP_SENDER_NAME ?? 'Chinese Flash').trim()

function fail(msg) {
  console.error(msg)
  process.exit(1)
}

if (!token) fail('Missing SUPABASE_ACCESS_TOKEN (create at https://supabase.com/dashboard/account/tokens )')
if (!ref) fail('Missing SUPABASE_PROJECT_REF (subdomain of your project URL, e.g. xxxx from xxxx.supabase.co)')
if (!resendKey) fail('Missing RESEND_API_KEY (same secret you use for RESEND_API_KEY on Edge Functions)')

const looksLikePlaceholder =
  /\.\.\.|your token|paste here|^sbp_\.\.\.$/i.test(token) ||
  ref === '...' ||
  /^\.{3}$/.test(ref) ||
  resendKey.includes('...')
if (looksLikePlaceholder) {
  fail(
    'SUPABASE_ACCESS_TOKEN, SUPABASE_PROJECT_REF, or RESEND_API_KEY still looks like a placeholder.\n' +
      'Replace with real secrets: no "...", no comment text copied into the value.',
  )
}
if (token.length < 32) {
  fail(
    'SUPABASE_ACCESS_TOKEN looks too short. Generate a new token at:\n' +
      'https://supabase.com/dashboard/account/tokens\n' +
      'Use the full string shown once — not the project anon/service_role keys.',
  )
}

const body = {
  external_email_enabled: true,
  smtp_admin_email: smtpAdminEmail,
  smtp_host: 'smtp.resend.com',
  smtp_port: 465,
  smtp_user: 'resend',
  smtp_pass: resendKey,
  smtp_sender_name: smtpSenderName,
}

const url = `https://api.supabase.com/v1/projects/${encodeURIComponent(ref)}/config/auth`

const res = await fetch(url, {
  method: 'PATCH',
  headers: {
    Authorization: `Bearer ${token}`,
    'Content-Type': 'application/json',
  },
  body: JSON.stringify(body),
})

const text = await res.text()
let json
try {
  json = JSON.parse(text)
} catch {
  json = null
}

if (!res.ok) {
  console.error(`Supabase API error ${res.status} ${res.statusText}`)
  console.error(json ? JSON.stringify(json, null, 2) : text)
  if (res.status === 401 && String(json?.message ?? text).toLowerCase().includes('jwt')) {
    console.error(`
This almost always means the wrong value is in SUPABASE_ACCESS_TOKEN:

  • Create a token under YOUR USER account (not the project):
    https://supabase.com/dashboard/account/tokens
  • Do NOT use: Project Settings → API → anon key or service_role key.
  • Paste the entire token once; no spaces, quotes inside the string, or "sbp_..." placeholders.
`)
  }
  process.exit(1)
}

console.log('OK — Supabase Auth SMTP updated to use Resend.')
console.log(`   From: ${smtpSenderName} <${smtpAdminEmail}>`)
console.log('   Next: Dashboard → Authentication → Rate Limits — raise email cap if needed.')
console.log('   Test: send a magic link from the app to a non-team email.')
