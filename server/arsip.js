import { Router } from 'express';
import { buatTokenArsip, bersihkanSecret } from './arsip-sso.js';
import { MEDIA_ROLES } from './auth.js';
import { gasUpsert } from './gas.js';

// Proxy ke API arsipdigital (peta-ekonomi). Token arsip_session di-mint di sini
// dari req.user.nip, bukan dari cookie browser — jadi panel arsip native tidak
// butuh SSO cookie lintas-subdomain maupun CORS. GET = baca; PATCH/POST/DELETE
// diteruskan apa adanya (peta sebagai otoritas akhir).
export function createArsipRouter(deps = {}) {
  const router = Router();
  const baseUrl = (deps.baseUrl ?? process.env.PETA_API_URL ?? '').replace(/\/+$/, '');
  const secret = bersihkanSecret(deps.secret ?? process.env.ARSIP_SESSION_SECRET);
  const doFetch = deps.fetchImpl ?? globalThis.fetch;
  // ponytail: gate tulis = MEDIA_ROLES; USER/INSPEKTUR/BENDAHARA BARANG hanya baca.
  const tulisRoles = new Set(MEDIA_ROLES);

  const siap = () => Boolean(baseUrl && secret);
  const bolehTulis = (req) => tulisRoles.has(req.user?.role);

  async function forward(req, res, target) {
    if (!siap()) {
      return res.status(503).json({
        ok: false,
        message: 'Proxy arsip belum dikonfigurasi (PETA_API_URL / ARSIP_SESSION_SECRET).',
      });
    }
    const isWrite = req.method !== 'GET' && req.method !== 'HEAD';
    if (isWrite && !bolehTulis(req)) {
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
    if (!bolehTulis(req)) return res.status(403).json({ ok: false, message: 'Tidak berwenang.' });
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

  return router;
}
