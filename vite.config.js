import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { loadEnv } from 'vite'
import viteReportEmailPlugin from './server/viteReportEmailPlugin.js'

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  process.env.VITE_SUPABASE_URL ||= env.VITE_SUPABASE_URL
  process.env.VITE_SUPABASE_ANON_KEY ||= env.VITE_SUPABASE_ANON_KEY
  process.env.GMAIL_USER ||= env.GMAIL_USER
  process.env.GMAIL_APP_PASS ||= env.GMAIL_APP_PASS

  return {
    plugins: [react(), viteReportEmailPlugin()],
    publicDir: 'src/public',
    server: {
      port: 3000,
      strictPort: true,
      open: true
    }
  }
})
