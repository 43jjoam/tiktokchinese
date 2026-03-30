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
      // `host: true` makes Vite call os.networkInterfaces() to print LAN URLs; that can throw
      // ERR_SYSTEM_ERROR (uv_interface_addresses) in sandboxes and some locked-down setups.
      // Default loopback is enough for http://localhost:5173 — use `npm run dev:lan` for same Wi‑Fi devices.
      // Web Share API is usually unavailable on http://<LAN-ip>; use HTTPS or localhost to test it.
      host: process.env.VITE_DEV_LISTEN_ALL === '1' ? true : '127.0.0.1',
    },
  }
})

