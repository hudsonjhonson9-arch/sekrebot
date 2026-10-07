import express from 'express';
import { closePool, query, withTransaction } from './db.js';
import { gasUpsert } from './gas.js';
import { createMediaRouter } from './media.js';
import { createAbsenRouter } from './absen.js';
import { createAuthSessionRouter } from './auth-session.js';
import { createAuthDeviceRouter } from './auth-device.js';
import { createLogRouter } from './log.js';
import { createSimapoRouter } from './simapo.js';
import { createSimapoNativeExtraRouter } from './simapo-native-extra.js';
import { verifyInitData } from './telegram.js';
import { createAttendanceDataRouter } from './attendance-data.js';
import { createOvertimeRouter } from './overtime.js';
import { createNotifyRouter } from './notify.js';
import { createCoreAdminRouter } from './core-admin.js';
import { createCoreUserRouter } from './core-user.js';
import { ABSEN_ROLES, MEDIA_ROLES, requireRole } from './auth.js';

export function createApp() {
  const app = express();
  app.use(express.json({ limit: '8mb' }));

  // req.ip (dipakai gate ip_range di absen) hanya akurat kalau jumlah hop proxy
  // diketahui. Rantai produksi: Traefik (Coolify) -> nginx (container ini) ->
  // Express, jadi 2 hop. Tapi angka itu bergantung pada topologi, dan tebakan
  // yang kelewat besar membuat klien bisa memalsukan X-Forwarded-For lalu
  // melewati gate IP. Jadi: default tidak percaya, set lewat env setelah
  // topologi-production dikonfirmasi.
  // ponytail: TRUST_PROXY=2 untuk Coolify+nginx; 1 kalau nginx satu-satunya
  // proxy; kosong/biarkan kalau Express diakses langsung (dev).
  if (process.env.TRUST_PROXY) {
    const hops = Number(process.env.TRUST_PROXY);
    if (Number.isInteger(hops) && hops > 0) app.set('trust proxy', hops);
  }

  app.get('/api/health', (_req, res) => {
    res.json({ ok: true, service: 'absensi-media' });
  });

  // Router dan query di-inject, bukan di-import di dalam media.js: media.js tidak
  // pernah menyentuh pool atau Apps Script secara global, jadi test bisa instantiate
  // createMediaRouter({ query, gasUpsert }) dengan stub tanpa DB dan tanpa jaringan.
  app.use('/api/media', requireRole(ABSEN_ROLES), createMediaRouter({ query, gasUpsert }));

  // Tanpa requireRole: endpoint ini yang menerbitkan sesi, jadi tidak mungkin
  // dijaga oleh pemeriksa sesi. Keamanannya datang dari verifikasi init_data Telegram,
  // bukan dari bearer token.
  app.use(createAuthSessionRouter({ query }));

  // Fase 2: keterangan/dokumen/rekap. Fase 3: penugasan/lembur. Dipasang
  // setelah /api/auth agar catch-all /api middleware tidak memblokir penerbitan sesi.
  app.use('/api', requireRole(ABSEN_ROLES), createAttendanceDataRouter({ query, withTransaction }));
  app.use('/api', requireRole(ABSEN_ROLES), createOvertimeRouter({ query }));
  app.use('/api', requireRole(ABSEN_ROLES), createNotifyRouter());
  // Fase 1: seluruh master/core absensi dipindahkan dari webhook n8n ke Express.
  app.use('/api', requireRole(ABSEN_ROLES), createCoreUserRouter({ query }));
  app.use('/api', requireRole(MEDIA_ROLES), createCoreAdminRouter({ query }));

  // Pairing perangkat Meja hanya SUPERADMIN: yang menerbitkan token perangkat adalah
  // sesi Telegram, bukan InitData Meja. Kalau endpoint ini dibiarkan terbuka, siapa pun
  // bisa membuat device dan memaksa Meja Absen memakai token miliknya.
  // Prefiks /api/auth wajib, dan path di auth-device.js relatif terhadapnya. Dulu
  // router ini di-mount di root, jadi gate-nya jadi catch-all: /, /login,
  // /favicon.ico, dan semua path typo dapat 401 "sesi berakhir" alih-alih 404.
  app.use('/api/auth', requireRole(new Set(['SUPERADMIN'])), createAuthDeviceRouter({ query }));

  // ABSEN_ROLES, bukan MEDIA_ROLES: presence absen boleh dipakai role apa pun
  // yang bisa absen, dan verifyInitData di-inject supaya test tidak butuh bot token.
  app.use(
    '/api/absen',
    requireRole(ABSEN_ROLES),
    createAbsenRouter({ query, verifyInitData, botToken: process.env.TELEGRAM_BOT_TOKEN })
  );

  // Log absen manual: admin mencatat/mengoreksi log pegawai yang tidak bisa absen
  // sendiri (kena acara, lupa tombol). MEDIA_ROLES, sama seperti media: wewenang
  // pemanggil berasal dari sesi, bukan dari body.admin_id kiriman browser.
  app.use('/api/log', requireRole(MEDIA_ROLES), createLogRouter({ query }));

  // SIMAPO (penerimaan barang, pemeliharaan, BKU). requireRole MEDIA_ROLES: di n8n
  // webhook ini `authentication: none`, jadi endpoint tulisnya terbuka publik tanpa
  // token. requireRole menutup lubang itu tanpa mengubah bentuk respons, dan
  // frontend sudah siap menangani 401 (pesan "Sesi Anda sudah berakhir").
  app.use(
    '/api/simapo',
    requireRole(MEDIA_ROLES),
    createSimapoRouter({ query, withTransaction })
  );
  app.use('/api/simapo', requireRole(MEDIA_ROLES), createSimapoNativeExtraRouter({ query, withTransaction }));

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