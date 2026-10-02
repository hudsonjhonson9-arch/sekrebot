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
    // Tutup HTTP dulu, lalu keluar apa pun hasil closePool (I-1: jangan andalkan await di listener).
    process.on(sig, () => {
      server.close(() => closePool().finally(() => process.exit(0)));
    });
  }
}