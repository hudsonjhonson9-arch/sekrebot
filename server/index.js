import express from 'express';
import { closePool } from './db.js';

export function createApp() {
  const app = express();
  app.use(express.json({ limit: '8mb' }));

  app.get('/api/health', (_req, res) => {
    res.json({ ok: true, service: 'absensi-media' });
  });

  return app;
}

const isMain = process.argv[1] && import.meta.url.endsWith(process.argv[1].replace(/\\/g, '/').split('/').pop());
if (isMain) {
  const port = Number(process.env.PORT || 8081);
  const server = createApp().listen(port, () => console.log(`[media] listening on :${port}`));
  for (const sig of ['SIGINT', 'SIGTERM']) {
    process.on(sig, () => {
      // N-1: response yang sudah started tapi belum ended menahan callback server.close(),
      // jadi jangan bergantung pada callback itu — drop koneksi, lalu keluar tanpa syarat.
      server.close();
      server.closeAllConnections?.();
      closePool().finally(() => process.exit(0));
    });
  }
}