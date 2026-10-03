import express from 'express';
import { decodeDataUrl, fileIdFromDriveUrl } from './media-payload.js';
import { sameInstansi } from './auth.js';

// Router ini SENGAJA belum dipasang di server/index.js: js/auth.js:386 membuat
// token 'tg_<id>_<ts>' sendiri (bukan auth_sessions), jadi dipasang sebelum Task 12
// akan memblokir semua pengguna Telegram WebApp.

const FACE_TARGET_SQL = `SELECT "id"::text AS id, "NIP" AS nip, "instansi_id", "face_photo"
  FROM "user_list" WHERE "id" = $1::bigint`;

const FACE_UPDATE_SQL = `UPDATE "user_list"
  SET "face_photo" = $5, "face_descriptor" = $2, "face_saved_at" = $3,
      "face_model" = $4, "updated_at" = NOW()
  WHERE "id" = $1::bigint
    AND ("instansi_id" IS NOT DISTINCT FROM $6 OR $7::boolean)`;

const SIGNATURE_TARGET_SQL = `SELECT u."id"::text AS id, u."NIP" AS nip, u."instansi_id", t.signature
  FROM "user_list" u
  LEFT JOIN "tanda_tangan" t ON t.nip = u."NIP"
  WHERE UPPER(u."NIP") = UPPER($1)`;

// Dipicu user_list supaya scope ikut jadi WHERE (bukan hanya if di JS), dan ON
// CONFLICT mengikuti index unik tanda_tangan_nip_key. saved_at/updated_at timestamptz
// -> NOW() langsung, tanpa ::text.
const SIGNATURE_UPSERT_SQL = `INSERT INTO "tanda_tangan" ("nip","signature","saved_by","saved_at","updated_at")
  SELECT $1, $2, $3::bigint, NOW(), NOW()
  FROM "user_list"
  WHERE "NIP" = $1 AND ("instansi_id" IS NOT DISTINCT FROM $4 OR $5::boolean)
  ON CONFLICT ("nip") DO UPDATE SET "signature" = EXCLUDED."signature",
    "saved_by" = EXCLUDED."saved_by", "updated_at" = NOW()`;

const ok = (res, body) => res.json({ ok: true, ...body });
const fail = (res, code, message) => res.status(code).json({ ok: false, message });

function norm(value) {
  return value == null ? '' : String(value);
}

// Self selalu boleh (kecuali tanpa req.user). Target scope null -> '' supaya
// sameInstansi() tidak fail-open di endpoint global (kolomnya nullable).
function inScope(user, target) {
  if (!user) return false;
  if (norm(user.id) === norm(target.id)) return true;
  return sameInstansi(user, norm(target.instansi_id));
}

function scopeParams(user) {
  return [norm(user?.instansi_id), user?.role === 'SUPERADMIN'];
}

// Bentuk produksi 48/48 baris tanda_tangan = uc?export=view&id=<id>, yang tidak
// dikenali fileIdFromDriveUrl (/file/d/ saja). Tanpa cabut id di sini tiap upload
// membuat file Drive kedua. Batas {5,200} dikunci FILE_ID_RE di Code.gs.
function driveFileId(value) {
  const s = String(value ?? '').trim();
  if (!s) return null;
  const canonical = fileIdFromDriveUrl(s);
  if (canonical) return canonical;
  const query = /[?&]id=([-\w]{5,200})(?=$|[&#])/.exec(s);
  if (query) return query[1];
  if (/^[-\w]{5,200}$/.test(s)) return s;
  return null;
}

async function upload(gasUpsert, { filename, mimeType, buffer, fileId }) {
  return gasUpsert({
    filename,
    mimeType,
    dataBase64: buffer.toString('base64'),
    fileId: fileId || null,
  });
}

export function createMediaRouter({ query, gasUpsert }) {
  const router = express.Router();

  router.post('/face', async (req, res) => {
    if (!req.user) return fail(res, 403, 'Forbidden');

    const targetId = Number(req.body?.user_id);
    if (!Number.isInteger(targetId) || targetId <= 0) {
      return fail(res, 400, 'user_id harus integer positif');
    }

    const target = (await query(FACE_TARGET_SQL, [String(targetId)])).rows[0];
    if (!target) return fail(res, 404, 'Pengguna tidak ditemukan');
    if (!inScope(req.user, target)) return fail(res, 403, 'Forbidden');

    let image;
    try {
      image = decodeDataUrl(req.body?.foto_base64);
    } catch (e) {
      return fail(res, 400, e.message);
    }

    const ext = image.mimeType.split('/')[1] || 'png';
    const filename = `face-${target.id}-${target.nip}.${ext}`;
    const previous = driveFileId(target.face_photo);

    let uploaded;
    try {
      uploaded = await upload(gasUpsert, {
        filename,
        mimeType: image.mimeType,
        buffer: image.buffer,
        fileId: previous,
      });
    } catch (e) {
      console.error('[media/face] gasUpsert gagal', e);
      return fail(res, 502, 'Layanan penyimpanan sedang bermasalah');
    }

    try {
      const result = await query(FACE_UPDATE_SQL, [
        String(targetId),
        JSON.stringify(req.body?.face_descriptor ?? null),
        req.body?.saved_at || new Date().toISOString(),
        req.body?.face_model ?? null,
        uploaded.url,
        ...scopeParams(req.user),
      ]);
      if (result.rows.length === 0) return fail(res, 403, 'Forbidden');
    } catch (e) {
      console.error('[media/face] simpan DB gagal, file Drive yatim fileId=' + uploaded.fileId, e);
      return fail(res, 500, 'Gagal menyimpan foto');
    }

    return ok(res, { photoUrl: uploaded.url, fileId: uploaded.fileId });
  });

  router.post('/signature', async (req, res) => {
    if (!req.user) return fail(res, 403, 'Forbidden');

    const wanted = String(req.body?.nip ?? '').trim();
    if (!wanted) return fail(res, 400, 'nip wajib diisi');

    const rows = (await query(SIGNATURE_TARGET_SQL, [wanted])).rows;
    if (rows.length === 0) return fail(res, 404, 'Pengguna tidak ditemukan');
    if (rows.length > 1) return fail(res, 403, 'Forbidden');
    const target = rows[0];
    if (!inScope(req.user, target)) return fail(res, 403, 'Forbidden');

    let image;
    try {
      image = decodeDataUrl(req.body?.signature);
    } catch (e) {
      return fail(res, 400, e.message);
    }

    const ext = image.mimeType.split('/')[1] || 'png';
    const filename = `signature-${target.id}-${target.nip}.${ext}`;
    const previous = driveFileId(target.signature);

    let uploaded;
    try {
      uploaded = await upload(gasUpsert, {
        filename,
        mimeType: image.mimeType,
        buffer: image.buffer,
        fileId: previous,
      });
    } catch (e) {
      console.error('[media/signature] gasUpsert gagal', e);
      return fail(res, 502, 'Layanan penyimpanan sedang bermasalah');
    }

    try {
      const result = await query(SIGNATURE_UPSERT_SQL, [
        target.nip,
        uploaded.url,
        String(req.user.id),
        ...scopeParams(req.user),
      ]);
      if (result.rows.length === 0) return fail(res, 403, 'Forbidden');
    } catch (e) {
      console.error(
        '[media/signature] simpan DB gagal, file Drive yatim fileId=' + uploaded.fileId,
        e,
      );
      return fail(res, 500, 'Gagal menyimpan tanda tangan');
    }

    return ok(res, { signature: uploaded.url, fileId: uploaded.fileId });
  });

  return router;
}