import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  resolve: {
    // stats-gl (a drei sub-dependency) bundles its own copy of three;
    // force a single instance to avoid "Multiple instances of Three.js"
    dedupe: ['three'],
  },
})
