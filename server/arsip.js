import { Router } from 'express';
import { buatTokenArsip, bersihkanSecret } from './arsip-sso.js';
import { query as queryDb } from './db.js';
import { gasUpsert } from './gas.js';
import { roleArsip, R_ADMIN } from './arsip-role.js';
import { handleArsipDbRequest } from './arsip-db.js';
import { renderSppdDocxBuffer, renderSppdBundleZipBuffer } from './arsip-sppd-docx.js';

// Proxy ke API arsipdigital (peta-ekonomi). Token arsip_session di-mint di sini
// dari req.user.nip, bukan dari cookie browser — jadi panel arsip native tidak
// butuh SSO cookie lintas-subdomain maupun CORS. GET = baca; PATCH/POST/DELETE
// diteruskan apa adanya (peta sebagai otoritas akhir).
export function createArsipRouter(deps = {}) {
  const router = Router();
  const baseUrl = (deps.baseUrl ?? process.env.PETA_API_URL ?? '').replace(/\/+$/, '');
  const secret = bersihkanSecret(deps.secret ?? process.env.ARSIP_SESSION_SECRET);
  const doFetch = deps.fetchImpl ?? globalThis.fetch;
  const doQuery = deps.query ?? queryDb;

  const siap = () => Boolean(baseUrl && secret);
  async function getUserRolePerms(req) {
    const role = String(req.user?.role || '').trim().toUpperCase().replace(/\s+/g, '_');
    if (!role) return [];
    if (role === 'SUPERADMIN') return ['*'];
    try {
      const rp = await doQuery('SELECT permissions FROM absen_roles WHERE id = $1 LIMIT 1', [role]);
      const raw = rp?.rows?.[0]?.permissions;
      if (Array.isArray(raw)) return raw;
      if (typeof raw === 'string') return JSON.parse(raw) || [];
    } catch (_) {}
    return [];
  }

  // Gate tulis: izinkan jika Admin di arsipdigital (user_credentials) ATAU memiliki
  // hak akses yang sesuai di absen_roles.permissions (perjadin.create/approve untuk SPPD,
  // arsip.agenda_surat/upload untuk Agenda Surat, arsip.upload untuk dokumen arsip).
  const bolehTulis = async (req, target = '') => {
    const r = await roleArsip(doQuery, req.user?.nip);
    if (r === R_ADMIN) return true;
    const perms = await getUserRolePerms(req);
    if (!perms.length) return false;
    if (perms.includes('*')) return true;
    const t = String(target || '');
    if (t.startsWith('/api/agenda/sppd')) {
      return perms.includes('perjadin.create') || perms.includes('perjadin.approve');
    }
    if (t.startsWith('/api/agenda/surat') || t.startsWith('/api/agenda/disposisi') || t === '/api/agenda') {
      return perms.includes('arsip.agenda_surat') || perms.includes('arsip.upload');
    }
    return perms.includes('arsip.upload');
  };

  // Pastikan NIP pengguna terisi dari user_list jika sesi hanya membawa id
  router.use(async (req, res, next) => {
    if (req.user && !req.user.nip && req.user.id) {
      try {
        const { rows } = await doQuery('SELECT "NIP" AS nip FROM user_list WHERE id::text = $1 LIMIT 1', [String(req.user.id)]);
        if (rows[0]?.nip) req.user.nip = rows[0].nip;
      } catch (_) {}
    }
    next();
  });

  // Role arsip si pengguna, untuk menentukan tombol admin di panel (FAB unggah,
  // aksi massal). Dipisah dari window.IS_ADMIN absensi karena sumbernya beda.
  router.get('/me', async (req, res) => {
    const role = await roleArsip(doQuery, req.user?.nip);
    res.json({ ok: true, role, isAdmin: role === R_ADMIN });
  });

  async function forward(req, res, target) {
    // 0. Daftar pegawai untuk SPPD/SPT selalu gunakan data pegawai lokal yang lengkap dengan NIP, Pangkat, Golongan & Jabatan
    if (target.startsWith('/api/agenda/pegawai-list')) {
      const handled = await handleArsipDbRequest(req, res, target, doQuery);
      if (handled) return;
    }

    if (!siap()) {
      return res.status(503).json({
        ok: false,
        message: 'Proxy arsip belum dikonfigurasi (PETA_API_URL / ARSIP_SESSION_SECRET).',
      });
    }
    const isWrite = req.method !== 'GET' && req.method !== 'HEAD';
    if (isWrite && !(await bolehTulis(req, target))) {
      return res.status(403).json({ ok: false, message: 'Tidak berwenang.' });
    }
    try {
      const r = await doFetch(baseUrl + target, {
        method: req.method,
        headers: {
          cookie: `arsip_session=${buatTokenArsip(req.user?.nip || '', secret)}`,
          accept: 'application/json',
          'content-type': 'application/json',
        },
        body: isWrite ? JSON.stringify(req.body ?? {}) : undefined,
      });

      // Upstream 401 (auth cookie ditolak oleh arsipdigital, mis. secret mismatch atau
      // sesi arsip kedaluwarsa) atau 502/503: fallback ke database PostgreSQL lokal
      // agar pengguna absensi yang sesinya aktif tetap dapat mengakses data arsip.
      if (r.status === 401 || r.status === 502 || r.status === 503 || (r.status === 403 && isWrite)) {
        console.warn(`[arsip-proxy] Upstream returned ${r.status} for ${target}, fallback to db.`);
        const handled = await handleArsipDbRequest(req, res, target, doQuery);
        if (handled) return;
      }

      const text = await r.text().catch(() => '');
      res.status(r.status || 502);
      if (text) res.type('application/json').send(text);
      else res.end();
    } catch {
      // Upstream down atau network timeout: fallback ke query database langsung
      const handled = await handleArsipDbRequest(req, res, target, doQuery);
      if (handled) return;
      res.status(502).json({ ok: false, message: 'Gagal menghubungi server arsip' });
    }
  }

  // Generate DOCX SPT / SPPD memakai template resmi peta-ekonomi (spt_template.docx & sppd_template.docx)
  router.post('/sppd-docx', (req, res) => {
    try {
      const { kind = 'sppd', item = {}, person = null } = req.body || {};
      const buf = renderSppdDocxBuffer(kind, item, person);
      const isSpt = String(kind).toLowerCase() === 'spt';
      const cleanNo = String(isSpt ? (item.nomor_spt || 'SPT') : (item.nomor_sppd || 'SPPD')).replace(/[^a-zA-Z0-9._-]+/g, '_').slice(0, 80) || 'DOK';
      const nama = String(person?.nama || item.pelaksana_nama || 'Pelaksana').replace(/[^a-zA-Z0-9_-]+/g, '_').slice(0, 60) || 'Pelaksana';
      const filename = isSpt ? `Surat_Tugas_${cleanNo}.docx` : `SPPD_${cleanNo}_${nama}.docx`;
      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
      res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
      res.send(buf);
    } catch (err) {
      console.error('[arsip] sppd-docx error:', err);
      res.status(500).json({ ok: false, message: 'Gagal membuat dokumen Word dari template: ' + err.message });
    }
  });

  // Unduh Paket ZIP (1 SPT + semua SPPD pelaksana & pengikut)
  router.post('/sppd-bundle-zip', (req, res) => {
    try {
      const { item = {} } = req.body || {};
      const buf = renderSppdBundleZipBuffer(item);
      const cleanNo = String(item.nomor_sppd || item.nomor_spt || 'SPPD').replace(/[^a-zA-Z0-9._-]+/g, '_').slice(0, 80) || 'SPPD';
      const filename = `Paket_SPPD_${cleanNo}.zip`;
      res.setHeader('Content-Type', 'application/zip');
      res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
      res.send(buf);
    } catch (err) {
      console.error('[arsip] sppd-bundle-zip error:', err);
      res.status(500).json({ ok: false, message: 'Gagal membuat paket ZIP SPPD: ' + err.message });
    }
  });

  // Upload file ke Drive lewat Apps Script, balikan { fileId, url }. Bukan proxy:
  // GAS dipanggil langsung dari server absensi (secret GAS tidak pernah ke browser).
  router.post('/docs/upload-file', async (req, res) => {
    if (!(await bolehTulis(req))) return res.status(403).json({ ok: false, message: 'Tidak berwenang.' });
    try {
      const { filename, mimeType, dataBase64, fileId } = req.body ?? {};
      if (!filename || !dataBase64) {
        return res.status(400).json({ ok: false, message: 'filename dan dataBase64 wajib.' });
      }
      const out = await gasUpsert({ filename, mimeType, dataBase64, fileId });
      res.json({ ok: true, ...out });
    } catch (e) {
      res.status(502).json({ ok: false, message: e.message });
    }
  });

  // Urutan penting: path statis & sub-path sebelum '/docs/:id' (router.all).
  router.all('/docs/:id/history', (req, res) => forward(req, res, `/api/docs/${encodeURIComponent(req.params.id)}/history`));
  router.all('/docs/bulk', (req, res) => forward(req, res, '/api/docs/bulk'));
  router.all('/docs/:id/status', (req, res) => forward(req, res, `/api/docs/${encodeURIComponent(req.params.id)}/status`));
  router.all('/docs/:id/publik', (req, res) => forward(req, res, `/api/docs/${encodeURIComponent(req.params.id)}/publik`));
  router.all('/docs/:id', (req, res) => forward(req, res, `/api/docs/${encodeURIComponent(req.params.id)}`));
  router.all('/docs', (req, res) => forward(req, res, '/api/docs'));

  // ── Proxy generik domain lain (Kertas Kerja / Bank Data / PKS) ──
  // ponytail: whitelist, bukan handler per endpoint. Gate tulis tetap dua lapis —
  // forward() (MEDIA_ROLES) lalu peta (kebijakan.js) — jadi di sini cukup daftar
  // path yang boleh lewat supaya panel arsip tidak jadi open proxy.
  const IZIN = {
    GET: [
      /^\/api\/docs$/, /^\/api\/docs\/[^/]+$/,
      /^\/api\/docs\/[^/]+\/(history|versions|index-status|shares)$/,
      /^\/api\/pks\/[a-z-]+$/, /^\/api\/pks\/ringkasan\/\d+$/, /^\/api\/pks\/deadline-terdekat$/,
      /^\/api\/kertas-kerja$/, /^\/api\/kertas-kerja\/[^/]+$/,
      /^\/api\/kertas-kerja\/periode\/[^/]+\/kandidat$/,
      /^\/api\/bankdata$/, /^\/api\/bankdata\/tahun$/,
      /^\/api\/agenda(\/.*)?$/,
      // master data untuk dropdown unggah (hanya baca)
      /^\/api\/kategori-dokumen$/, /^\/api\/sektor$/, /^\/api\/bidang$/,
    ],
    POST: [
      /^\/api\/docs$/, /^\/api\/docs\/bulk$/,
      /^\/api\/docs\/[^/]+\/(status|publik|shares|versions)$/,
      /^\/api\/pks\/[a-z-]+$/,
      /^\/api\/kertas-kerja$/, /^\/api\/kertas-kerja\/bulk$/,
      /^\/api\/kertas-kerja\/[^/]+\/(generate|sinkron-wajib|pengingat)$/,
      /^\/api\/kertas-kerja\/periode\/[^/]+\/tautan$/,
      /^\/api\/bankdata\/[a-z]+$/,
      /^\/api\/agenda(\/.*)?$/,
    ],
    PUT: [
      /^\/api\/docs\/[^/]+$/, /^\/api\/pks\/[a-z-]+\/[^/]+$/,
      /^\/api\/kertas-kerja\/[^/]+$/, /^\/api\/bankdata\/[a-z]+\/[^/]+$/,
      /^\/api\/agenda(\/.*)?$/,
    ],
    PATCH: [
      /^\/api\/docs\/[^/]+\/(status|publik)$/, /^\/api\/kertas-kerja\/periode\/[^/]+$/,
      /^\/api\/bankdata\/[a-z]+(\/[^/]+)*$/,
      /^\/api\/agenda(\/.*)?$/,
    ],
    DELETE: [
      /^\/api\/docs\/[^/]+$/, /^\/api\/docs\/[^/]+\/shares\/[^/]+$/, /^\/api\/pks\/[a-z-]+\/[^/]+$/,
      /^\/api\/kertas-kerja\/[^/]+$/, /^\/api\/bankdata\/[a-z]+\/[^/]+$/, /^\/api\/bankdata\/tahun\/[^/]+$/,
      /^\/api\/agenda(\/.*)?$/,
    ],
  };

  router.all(/^\/p\/(.*)$/, (req, res) => {
    const rest = req.params[0];
    const i = req.originalUrl.indexOf('?');
    const qs = i === -1 ? '' : req.originalUrl.slice(i);
    const pola = IZIN[req.method] || [];
    if (!pola.some((re) => re.test('/' + rest))) {
      return res.status(403).json({ ok: false, message: 'Path arsip tidak diizinkan.' });
    }
    return forward(req, res, '/' + rest + qs);
  });

  return router;
}
