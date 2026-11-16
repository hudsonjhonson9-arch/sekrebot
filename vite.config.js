import { defineConfig } from 'vite';
import { resolve } from 'path';
import fs from 'fs';

function copyStaticAssetsPlugin() {
  return {
    name: 'copy-static-assets',
    closeBundle() {
      const dist = resolve(import.meta.dirname, 'dist');
      const jsDir = resolve(import.meta.dirname, 'js');
      const catalogDir = resolve(import.meta.dirname, 'catalog');
      try {
        fs.cpSync(jsDir, resolve(dist, 'js'), { recursive: true, force: true });
        fs.cpSync(catalogDir, resolve(dist, 'catalog'), { recursive: true, force: true });
      } catch (e) {
        console.warn('[vite-copy] warning:', e.message);
      }
    }
  };
}

export default defineConfig({
  plugins: [copyStaticAssetsPlugin()],
  server: {
    port: 3000,
    open: false,
    proxy: {
      '/api': 'http://127.0.0.1:8081'
    }
  },
  build: {
    rollupOptions: {
      input: {
        main: resolve(import.meta.dirname, 'index.html'),
        login: resolve(import.meta.dirname, 'login.html'),
        desktop: resolve(import.meta.dirname, 'desktop.html'),
        rekap: resolve(import.meta.dirname, 'rekap.html'),
        layanan: resolve(import.meta.dirname, 'layanan.html'),
        asetkir: resolve(import.meta.dirname, 'aset-kir.html'),
        arsip: resolve(import.meta.dirname, 'arsip.html'),
        admin: resolve(import.meta.dirname, 'admin.html'),
        cetaktpp: resolve(import.meta.dirname, 'cetak-tpp.html'),
        kiosk: resolve(import.meta.dirname, 'kiosk.html'),
        eslip: resolve(import.meta.dirname, 'e-slip.html')
      }
    }
  }
});
