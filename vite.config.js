import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  // './' base makes the built app work when opened directly from the filesystem
  // (double-click dist/index.html) without needing a web server.
  base: './',
  server: {
    port: 5173,
    open: true,
  },
  build: {
    outDir: 'dist',
    // Inline everything < 4kb so we have fewer files to ship
    assetsInlineLimit: 4096,
  },
})
