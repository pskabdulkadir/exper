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
      output: {
        // Sunucu derlemesi için SSR manifesti oluşturulur.
        // Bu, sunucunun hangi istemci varlıklarını yükleyeceğini bilmesini sağlar.
        ssrManifest: true,
      }
    },
    // Sunucu tarafı derlemesi (SSR) için giriş noktasını belirtir.
    ssr: resolve(__dirname, '../../server-production.ts'),
  },
});