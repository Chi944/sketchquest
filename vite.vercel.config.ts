import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

/** Vercel serves the SPA and its Node API separately; no Cloudflare bindings are bundled. */
export default defineConfig({
  plugins: [react()],
  build: { outDir: 'dist/vercel' },
});
