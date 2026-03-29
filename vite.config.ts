import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'

// Absolute root base so SPA routes (e.g. /auth/callback for magic links) still load /assets/*.
// A relative base like ./ breaks: from /auth/callback the browser requests /auth/assets/… → 404 → white page.
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), 'VITE_')
  const supabaseUrl = env.VITE_SUPABASE_URL?.trim()
  const supabaseKey = env.VITE_SUPABASE_ANON_KEY?.trim()
  if (mode === 'development') {
    if (supabaseUrl && supabaseKey) {
      let host = supabaseUrl
      try {
        host = new URL(supabaseUrl).hostname
      } catch {
        /* keep */
      }
      console.log(`\n  [tiktokchinese] Supabase env OK — ${host} (anon key loaded)\n`)
    } else {
      console.warn(
        '\n  [tiktokchinese] Supabase env missing — set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in .env.local\n',
      )
    }
  }

  return {
    plugins: [react()],
    base: '/',
    server: {
      port: 5173,
      // Listen on LAN so you can open http://<your-mac-ip>:5173 on a phone (same Wi‑Fi).
      // Note: Web Share API (navigator.share) is usually unavailable on http://<LAN-ip> — use HTTPS or localhost to test it.
      host: true,
    },
  }
})

