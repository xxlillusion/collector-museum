import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

const inDocker = process.env.DOCKER === 'true'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  resolve: {
    // stats-gl (a drei sub-dependency) bundles its own copy of three;
    // force a single instance to avoid "Multiple instances of Three.js"
    dedupe: ['three'],
  },
  server: {
    host: '0.0.0.0',
    port: 5175,
    // Bind-mount file watching is unreliable on macOS/Windows Docker;
    // polling keeps HMR working without restarting the container.
    watch: inDocker ? { usePolling: true, interval: 300 } : undefined,
    hmr: inDocker ? { clientPort: 5175 } : undefined,
  },
})
