import { Router } from 'express';
import { buatTokenArsip, bersihkanSecret } from './arsip-sso.js';
import { query as queryDb } from './db.js';
import { gasUpsert } from './gas.js';
import { roleArsip, R_ADMIN } from './arsip-role.js';

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
  // Gate tulis mengikuti arsipdigital: user_credentials.role ternormalisasi sama
  // dengan 'Admin'. BUKAN role absensi (user_list) — dua tabel itu memang tidak
  // sinkron, dan arsipdigital-lah yang jadi otoritas akhir. Fail-closed.
  const bolehTulis = (req) => roleArsip(doQuery, req.user?.nip).then((r) => r === R_ADMIN);

  // Role arsip si pengguna, untuk menentukan tombol admin di panel (FAB unggah,
  // aksi massal). Dipisah dari window.IS_ADMIN absensi karena sumbernya beda.
  router.get('/me', async (req, res) => {
    const role = await roleArsip(doQuery, req.user?.nip);
    res.json({ ok: true, role, isAdmin: role === R_ADMIN });
  });

  async function forward(req, res, target) {
    if (!siap()) {
      return res.status(503).json({
        ok: false,
        message: 'Proxy arsip belum dikonfigurasi (PETA_API_URL / ARSIP_SESSION_SECRET).',
      });
    }
    const isWrite = req.method !== 'GET' && req.method !== 'HEAD';
    if (isWrite && !(await bolehTulis(req))) {
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
      const text = await r.text().catch(() => '');
      res.status(r.status || 502);
      if (text) res.type('application/json').send(text);
      else res.end();
    } catch {
      res.status(502).json({ ok: false, message: 'Gagal menghubungi server arsip' });
    }
  }

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
    ],
    PUT: [
      /^\/api\/docs\/[^/]+$/, /^\/api\/pks\/[a-z-]+\/[^/]+$/,
      /^\/api\/kertas-kerja\/[^/]+$/, /^\/api\/bankdata\/[a-z]+\/[^/]+$/,
    ],
    PATCH: [
      /^\/api\/docs\/[^/]+\/(status|publik)$/, /^\/api\/kertas-kerja\/periode\/[^/]+$/,
      /^\/api\/bankdata\/[a-z]+(\/[^/]+)*$/,
    ],
    DELETE: [
      /^\/api\/docs\/[^/]+$/, /^\/api\/docs\/[^/]+\/shares\/[^/]+$/, /^\/api\/pks\/[a-z-]+\/[^/]+$/,
      /^\/api\/kertas-kerja\/[^/]+$/, /^\/api\/bankdata\/[a-z]+\/[^/]+$/, /^\/api\/bankdata\/tahun\/[^/]+$/,
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
