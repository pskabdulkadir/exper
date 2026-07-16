import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
  ],
  root: __dirname,
  build: {
    // İstemci (client) build çıktısı için
    outDir: resolve(__dirname, '../../dist/public'),
    emptyOutDir: true, // Önceki build dosyalarını temizler
    rollupOptions: {
      input: {
        main: resolve(__dirname, 'index.html'),
      },
      // Sunucu (server) build'i için ek yapılandırma
      output: {
        entryFileNames: `assets/[name].js`,
        chunkFileNames: `assets/[name].js`,
        assetFileNames: `assets/[name].[ext]`
      }
    },
    // Sunucu build'i için SSR (Server-Side Rendering) yapılandırması
    ssr: 'server-production.ts',
    ssrManifest: true,
  },
});