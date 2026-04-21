import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  build: {
    // Raise chunk size warning threshold to prevent Railway CI from treating
    // Vite chunk warnings (written to stderr) as build failures
    chunkSizeWarningLimit: 1500,
  },
})

