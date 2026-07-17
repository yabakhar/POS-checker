import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// In Docker dev mode, backend is reachable via service name.
// On host machine dev, it's localhost:3001.
const apiTarget = process.env.VITE_API_TARGET || 'http://localhost:3001';

export default defineConfig({
  plugins: [react()],
  server: {
    host: '0.0.0.0', // required when running inside Docker
    port: 5173,
    proxy: {
      '/api': {
        target: apiTarget,
        changeOrigin: true,
      },
    },
  },
});
