import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  publicDir: 'src/public',
  server: {
    port: 3000,
    open: true
  }
})
