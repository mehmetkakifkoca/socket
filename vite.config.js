import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    host: '0.0.0.0', // Allow access via IP (like 192.168.x.x or 127.0.0.1)
    hmr: {
      overlay: false // Disable HMR overlay which sometimes breaks Safari
    }
  }
})
