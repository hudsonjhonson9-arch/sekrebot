import { defineConfig } from 'vite';
import { resolve } from 'path';

export default defineConfig({
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
