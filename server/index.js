import express from 'express';
import { closePool, query, withTransaction } from './db.js';
import { gasUpsert } from './gas.js';
import { createMediaRouter } from './media.js';
import { createAbsenRouter } from './absen.js';
import { createAuthSessionRouter } from './auth-session.js';
import { pasangArsipCookie, lepasArsipCookie, bersihkanSecret } from './arsip-sso.js';
import { createAuthDeviceRouter } from './auth-device.js';
import { createLogRouter } from './log.js';
import { createSimapoRouter } from './simapo.js';
import { createSimapoNativeExtraRouter } from './simapo-native-extra.js';
import { verifyInitData } from './telegram.js';
import { createAttendanceDataRouter } from './attendance-data.js';
import { createKeteranganNotify, telegramSender, wahaSender } from './keterangan-notify.js';
import { createScheduler } from './scheduler.js';
import { createOvertimeRouter } from './overtime.js';
import { createNotifyRouter } from './notify.js';
import { createCoreAdminRouter } from './core-admin.js';
import { createCoreUserRouter } from './core-user.js';
import { ABSEN_ROLES, SIMAPO_ROLES, requireRole } from './auth.js';

// Endpoint SIMAPO yang aman untuk pegawai biasa (USER/INSPEKTUR): baca katalog &
// QR, pinjam (manual & via QR), baca riwayat pinjaman sendiri, dan buat tiket
// kerusakan. Semua endpoint admin (master, mutasi, opname, BAST, impor, pengaturan,
// pasar stan-harga/PKS, dll.) tidak boleh diakses oleh non-SIMAPO_ROLES.
// Method-agnostic: endpoint pinjam hanya POST, katalog/unit-by-qr hanya GET — path
// yang cocok sudah cukup, dan POST ke path GET akan tetap 400 dari router.
const SIMAPO_USER_PATHS = new Set([
  '/katalog',
  '/pinjam',
  '/pinjam-list',
  '/tiket',
  '/kategori-list',
  '/unit-by-qr',
  '/qr-pinjam',
]);

function simapoGate(req, res, next) {
  const role = req.user?.role;
  if (SIMAPO_ROLES.has(role)) return next();
  if (ABSEN_ROLES.has(role) && SIMAPO_USER_PATHS.has(req.path)) return next();
  return res.status(403).json({ ok: false, message: 'Forbidden' });
}

export function createApp() {
  const app = express();
  // 16mb: base64 10 MB ≈ 13.3 MB JSON, sisa ruang untuk field lain
  app.use(express.json({ limit: '16mb' }));

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
  // arsipSso: bila ARSIP_SESSION_SECRET ada, sekalian terbitkan cookie SSO arsip.
  if (!bersihkanSecret(process.env.ARSIP_SESSION_SECRET)) {
    console.warn('[arsip-sso] ARSIP_SESSION_SECRET belum diatur/pendek (min 16); cookie arsip tidak diterbitkan.');
  }
  app.use(createAuthSessionRouter({ query, arsipSso: { pasangArsipCookie, lepasArsipCookie } }));

  // Fase 2: keterangan/dokumen/rekap. Fase 3: penugasan/lembur. Dipasang
  // setelah /api/auth agar catch-all /api middleware tidak memblokir penerbitan sesi.
  const botToken = process.env.TELEGRAM_BOT_TOKEN;
  const sendTelegram = botToken ? telegramSender(botToken) : null;
  const wahaCfg = process.env.WAHA_URL
    ? { url: process.env.WAHA_URL, apiKey: process.env.WAHA_API_KEY, session: process.env.WAHA_SESSION }
    : null;
  const notifyKeterangan = createKeteranganNotify({
    query,
    sendTelegram,
    sendWA: wahaCfg
      ? wahaSender({ ...wahaCfg, chatId: process.env.WAHA_KET_GROUP || '6281239788212-1551250724@g.us' })
      : null,
  });
  // Jadwal cron pengganti workflow n8n "Notif Absensi". Hanya di-start saat server
  // jadi entrypoint (blok isMain), tidak saat test meng-import createApp. Reminder
  // absen lewat Telegram; peringatan akumulasi lewat Telegram PM + WA pribadi
  // pegawai (chatId dihitung dari nomorhp tiap pengiriman). WhatsApp grup tetap
  // hanya untuk keterangan (lihat notifyKeterangan di atas).
  app.locals.scheduler = createScheduler({
    query,
    sendTelegram,
    sendWhatsApp: wahaCfg ? wahaSender(wahaCfg) : null,
  });
  app.use('/api', requireRole(ABSEN_ROLES), createAttendanceDataRouter({ query, withTransaction, notify: notifyKeterangan, gasUpsert }));
  app.use('/api', requireRole(ABSEN_ROLES), createOvertimeRouter({ query }));
  app.use('/api', requireRole(ABSEN_ROLES), createNotifyRouter());
  // Fase 1: seluruh master/core absensi dipindahkan dari webhook n8n ke Express.
  app.use('/api', requireRole(ABSEN_ROLES), createCoreUserRouter({ query }));
  // Di-mount ABSEN_ROLES, bukan MEDIA_ROLES: pegawai biasa butuh baca profil,
  // jam, periode, lokasi, dan kontrol instansinya sendiri. Endpoint tulis dan
  // daftar lintas-instansi (instansi-list, admin-list) tetap ditolak untuk
  // non-media oleh requireMedia di dalam core-admin.js.
  app.use('/api', requireRole(ABSEN_ROLES), createCoreAdminRouter({ query }));

  // Pairing perangkat Meja hanya SUPERADMIN: yang menerbitkan token perangkat adalah
  // sesi Telegram, bukan InitData Meja. Kalau endpoint ini dibiarkan terbuka, siapa pun
  // bisa membuat device dan memaksa Meja Absen memakai token miliknya.
  // Prefiks /api/auth wajib, dan path di auth-device.js relatif terhadapnya. Dulu
  // router ini di-mount di root, jadi gate-nya jadi catch-all: /, /login,
  // /favicon.ico, dan semua path typo dapat 401 "sesi berakhir" alih-alih 404.
  app.use('/api/auth', requireRole(new Set(['SUPERADMIN'])), createAuthDeviceRouter({ query }));

  // ABSEN_ROLES, bukan MEDIA_ROLES: presence absen boleh dipakai role apa pun
  // yang bisa absen, dan verifyInitData di-inject supaya test tidak butuh bot token.
  // verifyInitData fail-closed TANPA token: tanpa TELEGRAM_BOT_TOKEN, seluruh
  // initData Telegram ditolak dan tiap /api/auth/session dan /api/absen balas 401.
  if (!botToken) {
    console.warn(
      '[startup] TELEGRAM_BOT_TOKEN TIDAK di-set — semua sesi Telegram dan absen akan balas 401. ' +
        'Set env ini (di Coolify > "Environmental Variables") lalu redeploy.'
    );
  }
  app.use(
    '/api/absen',
    requireRole(ABSEN_ROLES),
    createAbsenRouter({ query, verifyInitData, botToken })
  );

  // Log absen: pegawai biasa membaca RIWAYATNYA SENDIRI (GET, dipaksa user_id
  // sendiri untuk non-media), sedangkan mencatat/mengoreksi manual tetap khusus
  // admin (gate requireMedia di dalam log.js).
  app.use('/api/log', requireRole(ABSEN_ROLES), createLogRouter({ query }));

  // SIMAPO (penerimaan barang, pemeliharaan, BKU). Simapo gate: role SIMAPO_ROLES
  // (media + BENDAHARA BARANG) lalu lintas penuh; role ABSEN_ROLES lain (USER,
  // INSPEKTUR) hanya boleh lewat ke endpoint user-facing (scan QR, pinjam, katalog,
  // tiket) — endpoint admin ditolak 403 tanpa membocorkan restu ke n8n webhook.
  app.use(
    '/api/simapo',
    requireRole(ABSEN_ROLES),
    simapoGate,
    createSimapoRouter({ query, withTransaction })
  );
  app.use(
    '/api/simapo',
    requireRole(ABSEN_ROLES),
    simapoGate,
    createSimapoNativeExtraRouter({ query, withTransaction })
  );

  return app;
}

const isMain = process.argv[1] && import.meta.url.endsWith(process.argv[1].replace(/\\/g, '/').split('/').pop());
if (isMain) {
  const port = Number(process.env.PORT || 8081);
  const app = createApp();
  const server = app.listen(port, () => console.log(`[media] listening on :${port}`));
  // Pengganti cron n8n. Matikan dengan SCHEDULER=off (mis. saat debugging).
  if (process.env.SCHEDULER !== 'off') app.locals.scheduler.start();
  for (const sig of ['SIGINT', 'SIGTERM']) {
    process.on(sig, () => {
      // N-1: response yang sudah started tapi belum ended menahan callback server.close(),
      // jadi jangan bergantung pada callback itu — drop koneksi, lalu keluar tanpa syarat.
      app.locals.scheduler.stop();
      server.close();
      server.closeAllConnections?.();
      closePool().finally(() => process.exit(0));
    });
  }
}