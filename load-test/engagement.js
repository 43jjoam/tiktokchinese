/**
 * k6 load sketch (Pre-Push Test Plan §7.2).
 * Adjust the JSON body to match your record-engagement contract after auth/CORS rules.
 *
 *   STAGING_FUNCTIONS_URL=https://xxx.supabase.co/functions/v1 \
 *   STAGING_ANON_KEY=xxx \
 *   k6 run load-test/engagement.js
 *
 * Never run against production.
 */
import http from 'k6/http'
import { check, sleep } from 'k6'

const base = __ENV.STAGING_FUNCTIONS_URL
const key = __ENV.STAGING_ANON_KEY

export const options = {
  vus: 20,
  duration: '60s',
  thresholds: {
    http_req_failed: ['rate<0.01'],
    http_req_duration: ['p(95)<1500'],
  },
}

export default function () {
  if (!base || !key) return
  const url = `${base.replace(/\/$/, '')}/record-engagement`
  const res = http.post(
    url,
    JSON.stringify({
      op: 'like_set',
      word_id: 'k6-smoke-word',
      device_hash: 'b'.repeat(64),
      clip_key: 'k6-smoke',
    }),
    {
      headers: {
        'Content-Type': 'application/json',
        apikey: key,
      },
    },
  )
  check(res, {
    'not server error': (r) => r.status < 500,
  })
  sleep(0.5)
}
