import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

// GitHub Pages serves the site under /<repo>/. Override with BASE=/ for other hosts.
export default defineConfig({
  base: process.env.BASE ?? '/CLLGE/',
  plugins: [react()],
  // mediabunny (video decode/encode) is most of the bundle; splitting it is on the roadmap.
  build: {
    target: 'es2022',
    sourcemap: true,
    chunkSizeWarningLimit: 700,
    rollupOptions: { output: { manualChunks: { media: ['mediabunny'], motion: ['motion'], react: ['react', 'react-dom'] } } },
  },
  test: { include: ['tests/unit/**/*.test.ts'], environment: 'node' },
});
