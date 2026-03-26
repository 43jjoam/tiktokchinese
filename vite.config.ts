import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Relative base so assets work on custom domain (chineseflash.com) and on
// github.io/tiktokchinese/ until you fully switch traffic.
export default defineConfig({
  plugins: [react()],
  base: process.env.GITHUB_ACTIONS ? './' : '/',
  server: {
    port: 5173,
  },
})

