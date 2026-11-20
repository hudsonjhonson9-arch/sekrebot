import express from 'express';
import path from 'path';
import zlib from 'node:zlib';
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
import { createArsipRouter } from './arsip.js';
import { verifyInitData } from './telegram.js';
import { createAttendanceDataRouter } from './attendance-data.js';
import { createKeteranganNotify, openwaSender, telegramSender, wahaSender } from './keterangan-notify.js';
import { createOpenwaWatchdog } from './openwa-health.js';
import { createScheduler } from './scheduler.js';
import { createOvertimeRouter } from './overtime.js';
import { createNotifyRouter } from './notify.js';
import { createCoreAdminRouter } from './core-admin.js';
import { createCoreUserRouter } from './core-user.js';
import { createAbsenRolesRouter } from './absen-roles.js';
import { initAbsenRolesTable } from './absen-roles-db.js';
import { ABSEN_ROLES, SIMAPO_ROLES, createRequireRole } from './auth.js';
import { createStitchApiRouter } from './stitch-api.js';

const GZIP_MIN_BYTES = 1024;
const COMPRESSIBLE_CT_RE = /^text\/|application\/(json|javascript|ecmascript|xml)|[+-]json\b|[+-]xml\b|image\/svg\+xml/i;

function appendVary(res, value) {
  const cur = res.getHeader('vary');
  if (!cur) {
    res.setHeader('Vary', value);
    return;
  }
  const str = Array.isArray(cur) ? cur.join(', ') : String(cur);
  if (!str.toLowerCase().split(',').some((v) => v.trim() === value.toLowerCase())) {
    res.setHeader('Vary', `${str}, ${value}`);
  }
}

function normalizeChunk(chunk, encoding) {
  if (chunk == null) return Buffer.alloc(0);
  if (Buffer.isBuffer(chunk)) return chunk;
  return Buffer.from(String(chunk), typeof encoding === 'string' ? encoding : 'utf8');
}

function gzipCompression() {
  return (req, res, next) => {
    if (
      req.method === 'HEAD' ||
      !/\bgzip\b/i.test(req.headers['accept-encoding'] || '') ||
      typeof res.write !== 'function' ||
      typeof res.end !== 'function' ||
      typeof res.setHeader !== 'function' ||
      typeof res.getHeader !== 'function'
    ) {
      return next();
    }

    const origWrite = res.write.bind(res);
    const origEnd = res.end.bind(res);
    let pendingChunks = [];
    let pendingBytes = 0;
    let gzipStream = null;
    let pausedBySocket = false;
    let waitingGzipDrain = false;
    let bypass = false;
    let ended = false;

    const canCompress = () => {
      if (res.headersSent || res.getHeader('content-encoding')) return false;
      if (res.statusCode === 204 || res.statusCode === 304) return false;
      const ct = String(res.getHeader('content-type') || '');
      return COMPRESSIBLE_CT_RE.test(ct);
    };

    const startStream = () => {
      res.removeHeader('Content-Length');
      res.setHeader('Content-Encoding', 'gzip');
      appendVary(res, 'Accept-Encoding');
      gzipStream = zlib.createGzip();
      gzipStream.on('data', (c) => {
        if (origWrite(c) === false) {
          pausedBySocket = true;
          gzipStream.pause();
        }
      });
      gzipStream.on('drain', () => {
        if (waitingGzipDrain) {
          waitingGzipDrain = false;
          res.emit?.('drain');
        }
      });
      res.on?.('drain', () => {
        if (pausedBySocket) {
          pausedBySocket = false;
          gzipStream?.resume();
        }
      });
      res.once?.('close', () => gzipStream?.destroy());
      gzipStream.on('error', () => {
        if (!ended) { ended = true; origEnd(); }
      });
      for (const c of pendingChunks) {
        if (gzipStream.write(c) === false) waitingGzipDrain = true;
      }
      pendingChunks = [];
      pendingBytes = 0;
    };

    res.write = function (chunk, encoding, cb) {
      if (typeof encoding === 'function') { cb = encoding; encoding = undefined; }
      if (bypass) return origWrite(chunk, encoding, cb);
      if (gzipStream) {
        const ok = gzipStream.write(chunk, encoding, cb);
        if (!ok) waitingGzipDrain = true;
        return ok;
      }

      if (!canCompress()) {
        bypass = true;
        return origWrite(chunk, encoding, cb);
      }
      const cl = Number(res.getHeader('content-length'));
      if (Number.isFinite(cl) && cl <= GZIP_MIN_BYTES) {
        bypass = true;
        return origWrite(chunk, encoding, cb);
      }

      const buf = normalizeChunk(chunk, encoding);
      pendingChunks.push(buf);
      pendingBytes += buf.length;

      if (pendingBytes > GZIP_MIN_BYTES || (Number.isFinite(cl) && cl > GZIP_MIN_BYTES)) {
        startStream();
        if (typeof cb === 'function') cb();
        return !waitingGzipDrain;
      }
      if (typeof cb === 'function') cb();
      return true;
    };

    res.end = function (chunk, encoding, cb) {
      if (typeof chunk === 'function') { cb = chunk; chunk = undefined; encoding = undefined; }
      else if (typeof encoding === 'function') { cb = encoding; encoding = undefined; }

      if (bypass) return origEnd(chunk, encoding, cb);
      if (gzipStream) {
        gzipStream.once('end', () => {
          if (!ended) { ended = true; origEnd(cb); }
        });
        return chunk != null ? gzipStream.end(chunk, encoding) : gzipStream.end();
      }

      const tail = normalizeChunk(chunk, encoding);
      const total = pendingBytes + tail.length;
      if (total <= GZIP_MIN_BYTES || !canCompress()) {
        bypass = true;
        for (const c of pendingChunks) origWrite(c);
        pendingChunks = [];
        pendingBytes = 0;
        return chunk != null ? origEnd(chunk, encoding, cb) : origEnd(cb);
      }

      const full = pendingChunks.length ? Buffer.concat([...pendingChunks, tail], total) : tail;
      pendingChunks = [];
      pendingBytes = 0;
      res.removeHeader('Content-Length');
      res.setHeader('Content-Encoding', 'gzip');
      appendVary(res, 'Accept-Encoding');
      zlib.gzip(full, (err, compressed) => {
        if (err) return origEnd(full, cb);
        if (!res.headersSent) res.setHeader('Content-Length', compressed.length);
        return origEnd(compressed, cb);
      });
      return res;
    };

    next();
  };
}

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
  app.use(gzipCompression());

  const requireRole = createRequireRole({ query });

  app.use((req, res, next) => {
    res.setHeader('Access-Control-Allow-Origin', req.headers.origin || '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With');
    res.setHeader('Access-Control-Allow-Credentials', 'true');
    if (req.method === 'OPTIONS') {
      return res.status(204).end();
    }
    next();
  });

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

  // Dedicated Stitch UI Real Database Engine
  // Seluruh /api/stitch wajib sesi (Bearer). Pembatasan per-endpoint (admin,
  // kepemilikan NIP) ada di stitch-api.js.
  app.use('/api/stitch', requireRole(ABSEN_ROLES), createStitchApiRouter());

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
  app.use(createAuthSessionRouter({
    query,
    arsipSso: { pasangArsipCookie, lepasArsipCookie },
    onLogout: (token) => requireRole.invalidate(token),
  }));

  // Fase 2: keterangan/dokumen/rekap. Fase 3: penugasan/lembur. Dipasang
  // setelah /api/auth agar catch-all /api middleware tidak memblokir penerbitan sesi.
  const botToken = process.env.TELEGRAM_BOT_TOKEN;
  const sendTelegram = botToken ? telegramSender(botToken) : null;
  const openwaCfg = process.env.OPENWA_URL
    ? { url: process.env.OPENWA_URL, apiKey: process.env.OPENWA_API_KEY, session: process.env.OPENWA_SESSION || 'default' }
    : null;
  const wahaCfg = !openwaCfg && process.env.WAHA_URL
    ? { url: process.env.WAHA_URL, apiKey: process.env.WAHA_API_KEY, session: process.env.WAHA_SESSION }
    : null;
  const waKetGroup = process.env.OPENWA_KET_GROUP || process.env.WAHA_KET_GROUP || '6281239788212-1551250724@g.us';
  const sendWA = openwaCfg
    ? openwaSender({ ...openwaCfg, chatId: waKetGroup })
    : (wahaCfg ? wahaSender({ ...wahaCfg, chatId: waKetGroup }) : null);
  const sendWhatsApp = openwaCfg
    ? openwaSender(openwaCfg)
    : (wahaCfg ? wahaSender(wahaCfg) : null);
  const notifyKeterangan = createKeteranganNotify({
    query,
    sendTelegram,
    sendWA,
  });
  // Jadwal cron pengganti workflow n8n "Notif Absensi". Hanya di-start saat server
  // jadi entrypoint (blok isMain), tidak saat test meng-import createApp. Reminder
  // absen lewat Telegram; peringatan akumulasi lewat Telegram PM + WA pribadi
  // pegawai (chatId dihitung dari nomorhp tiap pengiriman). WhatsApp grup tetap
  // hanya untuk keterangan (lihat notifyKeterangan di atas).
  app.locals.openwaWatchdog = createOpenwaWatchdog(openwaCfg || {});
  app.locals.scheduler = createScheduler({
    query,
    sendTelegram,
    sendWhatsApp,
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
  app.use('/api', requireRole(ABSEN_ROLES), createCoreAdminRouter({
    query,
    openwaWatchdog: app.locals.openwaWatchdog,
    sendWhatsApp,
    getSchedulerActive: () => process.env.SCHEDULER !== 'off',
  }));

  // Pairing perangkat Meja hanya SUPERADMIN: yang menerbitkan token perangkat adalah
  // sesi Telegram, bukan InitData Meja. Kalau endpoint ini dibiarkan terbuka, siapa pun
  // bisa membuat device dan memaksa Meja Absen memakai token miliknya.
  // Prefiks /api/auth wajib, dan path di auth-device.js relatif terhadapnya. Dulu
  // router ini di-mount di root, jadi gate-nya jadi catch-all: /, /login,
  // /favicon.ico, dan semua path typo dapat 401 "sesi berakhir" alih-alih 404.
  app.use('/api/auth', requireRole(new Set(['SUPERADMIN'])), createAuthDeviceRouter({
    query,
    onRevoke: (tokenHash) => (tokenHash ? requireRole.invalidateHash(tokenHash) : requireRole.clearCache()),
  }));

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

  // Port Jalur A: panel Dokumen arsipdigital di-render native, backend-nya proxy
  // ke API peta-ekonomi (PETA_API_URL). Token arsip di-mint server dari nip.
  app.use('/api/arsip', requireRole(ABSEN_ROLES), createArsipRouter());

  // Role Management Absensi (terisolasi dari peta-ekonomi / sd_roles)
  const absenRolesRouter = createAbsenRolesRouter({ query });
  app.use('/api/admin/roles', requireRole(ABSEN_ROLES), absenRolesRouter);
  app.use('/api/absen-roles', requireRole(ABSEN_ROLES), absenRolesRouter);

  // Layanan berkas statis antarmuka Stitch (index.html, login.html, catalog, js, css)
  const publicDir = path.resolve(import.meta.dirname, '..');
  app.use(express.static(publicDir, {
    maxAge: '1h',
    setHeaders(res, filePath) {
      const rel = path.relative(publicDir, filePath).replace(/\\/g, '/');
      if (rel.endsWith('.html')) {
        res.setHeader('Cache-Control', 'no-cache');
      } else if (rel.startsWith('js/lib/') || rel.startsWith('css/lib/')) {
        res.setHeader('Cache-Control', 'public, max-age=86400, immutable');
      }
    },
  }));

  return app;
}

const isMain = process.argv[1] && import.meta.url.endsWith(process.argv[1].replace(/\\/g, '/').split('/').pop());
if (isMain) {
  const port = Number(process.env.PORT || 8081);
  const app = createApp();
  const server = app.listen(port, () => console.log(`[media] listening on :${port}`));
  initAbsenRolesTable({ query }).catch((e) => console.error('[rbac] initAbsenRolesTable error:', e.message));
  // Pengganti cron n8n. Matikan dengan SCHEDULER=off (mis. saat debugging).
  if (process.env.SCHEDULER !== 'off') app.locals.scheduler.start();
  // Auto-watchdog OpenWA tiap 5 menit: otomatis start ulang sesi bila STOPPED/DISCONNECTED.
  if (process.env.OPENWA_WATCHDOG !== 'off') app.locals.openwaWatchdog.start();
  for (const sig of ['SIGINT', 'SIGTERM']) {
    process.on(sig, () => {
      // N-1: response yang sudah started tapi belum ended menahan callback server.close(),
      // jadi jangan bergantung pada callback itu — drop koneksi, lalu keluar tanpa syarat.
      app.locals.scheduler.stop();
      app.locals.openwaWatchdog.stop();
      server.close();
      server.closeAllConnections?.();
      closePool().finally(() => process.exit(0));
    });
  }
}