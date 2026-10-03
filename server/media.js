import express from 'express';
import { decodeDataUrl, fileIdFromDriveUrl } from './media-payload.js';
import { sameInstansi } from './auth.js';

// Router ini SENGAJA belum dipasang di server/index.js: js/auth.js:386 membuat
// token 'tg_<id>_<ts>' sendiri (bukan auth_sessions), jadi dipasang sebelum Task 12
// akan memblokir semua pengguna Telegram WebApp.

const FACE_TARGET_SQL = `SELECT "id"::text AS id, "NIP" AS nip, "instansi_id", "face_photo"
  FROM "user_list" WHERE "id" = $1::bigint`;

// COALESCE("instansi_id",'') itu wajib, bukan gaya: user_list.instansi_id nullable, dan
// tanpa normalisasi kedua sisi WHERE ini tidak ekuivalen dengan inScope() di JS dalam
// ARAH MANA pun. ('' IS NOT DISTINCT FROM '') -> true, jadi SQL dulu menganggap setiap
// user tanpa instansi boleh menulis media user tanpa instansi; (NULL IS NOT DISTINCT
// FROM '') -> false, jadi SQL dulu menolak apa yang JS izinkan (mis. menulis untuk
// diri sendiri dengan instansi_id NULL). Klausa ini ada supaya jadi defence in depth —
// route berikutnya yang lupa memanggil inScope() tetap terkunci WHERE-nya sendiri — jadi
// ekuivalensi itu syarat, bukan sesuatu yang harus diasumsikan.
const FACE_UPDATE_SQL = `UPDATE "user_list"
  SET "face_photo" = $5, "face_descriptor" = $2, "face_saved_at" = $3,
      "face_model" = $4, "updated_at" = NOW()
  WHERE "id" = $1::bigint
    AND (COALESCE("instansi_id",'') IS NOT DISTINCT FROM $6 OR $7::boolean)`;

const SIGNATURE_TARGET_SQL = `SELECT u."id"::text AS id, u."NIP" AS nip, u."instansi_id", t.signature
  FROM "user_list" u
  LEFT JOIN "tanda_tangan" t ON t.nip = u."NIP"
  WHERE UPPER(u."NIP") = UPPER($1)`;

// Dipicu user_list supaya scope ikut jadi WHERE (bukan hanya if di JS), dan ON
// CONFLICT mengikuti index unik tanda_tangan_nip_key. saved_at/updated_at timestamptz
// -> NOW() langsung, tanpa ::text. COALESCE di WHERE: sama seperti FACE_UPDATE_SQL.
const SIGNATURE_UPSERT_SQL = `INSERT INTO "tanda_tangan" ("nip","signature","saved_by","saved_at","updated_at")
  SELECT $1, $2, $3::bigint, NOW(), NOW()
  FROM "user_list"
  WHERE "NIP" = $1 AND (COALESCE("instansi_id",'') IS NOT DISTINCT FROM $4 OR $5::boolean)
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
const DRIVE_LIKE_TOKEN = /^[-\w]{5,200}$/;

// Host Google yang memang menyajikan file Drive. Nilai kolom yang bisa diurai jadi
// URL tapi hosnya di sini berarti BUKAN file Drive kita: meneruskan id-nya hanya
// membuat DriveApp.getFileById() melempar di dalam Apps Script, yang muncul sebagai
// 502 permanen untuk pegawai itu dan tidak bisa ditindaklanjuti. Code.gs sudah
// fail-closed soal ini (folder operator dicek lewat parents), jadi ini soal
// ketersediaan layanan, bukan otorisasi.
function isDriveHost(host) {
  const h = host.toLowerCase();
  return h === 'google.com' || h.endsWith('.google.com') || h.endsWith('.googleusercontent.com');
}

// Kata sentinel ('undefined', 'DELETED', 'NOT_SET') juga lolos pola id polos, dan
// meneruskannya ke Apps Script = 502 permanen. Id Drive selalu memuat digit (dasar
//nya base64-ish dari server Drive), jadi "ada digit" membedakan keduanya tanpa
// daftar id yang harus/raw dan bisa basi.
function looksLikeDriveId(value) {
  return DRIVE_LIKE_TOKEN.test(value) && /\d/.test(value);
}

function driveFileId(value) {
  const s = String(value ?? '').trim();
  if (!s) return null;

  let url;
  try {
    url = new URL(s);
  } catch {
    url = null;
  }

  if (!url) return looksLikeDriveId(s) ? s : null;
  if (!isDriveHost(url.hostname)) return null;

  const canonical = fileIdFromDriveUrl(s);
  if (canonical) return canonical;
  const query = /[?&]id=([-\w]{5,200})(?=$|[&#])/.exec(s);
  return query ? query[1] : null;
}

// user_list.id itu bigint dan Postgres menyimpan presisi penuh. Number() dulu
// menerima apa saja ([5] -> 5, true -> 1, '0x2a' -> 42, '1e3' -> 1000) dan, lebih
// serius, membulatkan diam-diam di atas 2^53: request untuk 9007199254740993 menulis
// ke 9007199254740992. Itu target yang salah, murni kesalahan koersi sisi server.
// Jadi hanya number yang integer AMAN atau string digit polos, dan nilainya tetap
// teks selamanya supaya tidak pernah menyentuh pembulatan float.
function targetUserId(value) {
  if (typeof value === 'number') {
    return Number.isSafeInteger(value) && value > 0 ? String(value) : null;
  }
  // Regex ini juga yang menolak ' 42 ', '0x2a', '1e3', '', dan apa pun non-string
  // (array, boolean, object) — tidak ada normalisasi yang diam-diam mengubah bentuk.
  if (typeof value === 'string' && /^[1-9]\d*$/.test(value)) return value;
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

// D-8: gasUpsert sudah jadi, jadi file Drive ADA di sana walau penulisan DB ditolak.
// Dua kelas yatim — error dan 0 baris — dicatat dengan bentuk kalimat yang sama
// supaya operator bisa merekonsiliasi keduanya, dan kelas yatim yang hilang
// dari log adalah bug. Delete TIDAK dicoba: file yang salah dihapus lebih buruk dari
// file yatim.
function reportOrphan(tag, fileId, why, e) {
  console.error(`[media/${tag}] ${why}, file Drive yatim fileId=${fileId}`, ...(e ? [e] : []));
}

export function createMediaRouter({ query, gasUpsert }) {
  const router = express.Router();

  router.post('/face', async (req, res) => {
    // SELURUH isi handler ada DI DALAM try, jadi fungsi async ini tidak pernah
    // menolak: Express 4 tidak meneruskan rejected promise ke error handler, dan
    // penolakan yang lolos ke sini akan menggantung request itu selamanya — atau,
    // tanpa listener unhandledRejection, mematikan proses beserta /health dan
    // semua request lain. Pola yang sama dan alasan yang sama di auth.js:64-85.
    try {
      if (!req.user) return fail(res, 403, 'Forbidden');

      const targetId = targetUserId(req.body?.user_id);
      if (!targetId) {
        return fail(res, 400, 'user_id harus integer positif');
      }

      const target = (await query(FACE_TARGET_SQL, [targetId])).rows[0];
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
          targetId,
          JSON.stringify(req.body?.face_descriptor ?? null),
          req.body?.saved_at || new Date().toISOString(),
          req.body?.face_model ?? null,
          uploaded.url,
          ...scopeParams(req.user),
        ]);
        if (result.rows.length === 0) {
          // 0 baris SETELAH inScope() mengizinkan = invarian WHERE dilanggar (mis.
          // instansi_id berubah antara SELECT dan UPDATE), bukan penolakan otorisasi
          // biasa — yang itu sudah tertangkap di atas dan balasnya 403. Jadi laporkan
          // sebagai 500 dan catat fileId-nya, jangan disamarkan jadi 403 yang tenang.
          reportOrphan('face', uploaded.fileId, 'UPDATE 0 baris, invarian scope dilanggar');
          return fail(res, 500, 'Gagal menyimpan foto');
        }
      } catch (e) {
        reportOrphan('face', uploaded.fileId, 'simpan DB gagal', e);
        return fail(res, 500, 'Gagal menyimpan foto');
      }

      return ok(res, { photoUrl: uploaded.url, fileId: uploaded.fileId });
    } catch (e) {
      // 503, bukan 500: ECONNREFUSED atau pool habis berarti "database tidak tersedia",
      // dan itulah yang sebenarnya terjadi. Detail tetap masuk log server (D-6).
      console.error('[media/face] tak tertangani', e);
      return fail(res, 503, 'Layanan sedang tidak tersedia');
    }
  });

  router.post('/signature', async (req, res) => {
    try {
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
        if (result.rows.length === 0) {
          // Sama seperti /face: setelah normalisasi COALESCE, 0 baris = invarian
          // scope yang jebol, bukan penolakan otorisasi.
          reportOrphan('signature', uploaded.fileId, 'upsert 0 baris, invarian scope dilanggar');
          return fail(res, 500, 'Gagal menyimpan tanda tangan');
        }
      } catch (e) {
        reportOrphan('signature', uploaded.fileId, 'simpan DB gagal', e);
        return fail(res, 500, 'Gagal menyimpan tanda tangan');
      }

      return ok(res, { signature: uploaded.url, fileId: uploaded.fileId });
    } catch (e) {
      console.error('[media/signature] tak tertangani', e);
      return fail(res, 503, 'Layanan sedang tidak tersedia');
    }
  });

  return router;
}