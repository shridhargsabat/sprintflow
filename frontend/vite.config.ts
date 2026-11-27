import { defineConfig } from 'vite';
import type { Plugin } from 'vite';
import react from '@vitejs/plugin-react';

/**
 * MOB-LOW-C/C3: inject a preload tag for the self-hosted latin woff2.
 * The hashed filename is read from the build bundle (never hardcoded),
 * so a stale hash can never ship. No-op in dev (no bundle yet) and if
 * the latin subset is ever absent (warns, build still succeeds).
 */
function fontPreloadPlugin(): Plugin {
  return {
    name: 'sprintflow-font-preload',
    transformIndexHtml(html, ctx) {
      const bundle = ctx?.bundle;
      if (!bundle) return html;
      const latin = Object.keys(bundle).find((name) =>
        /inter-latin-wght-normal-[^/]*\.woff2$/.test(name)
      );
      if (!latin) {
        console.warn('[font-preload] latin woff2 not found in bundle; skipping preload tag');
        return html;
      }
      const tag = `<link rel="preload" href="/${latin}" as="font" type="font/woff2" crossorigin />`;
      return html.replace('</head>', `    ${tag}\n  </head>`);
    }
  };
}

export default defineConfig({
  plugins: [react(), fontPreloadPlugin()],
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:8000',
        changeOrigin: true
      }
    }
  }
});
