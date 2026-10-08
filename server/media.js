import express from 'express';
import { decodeDataUrl, fileIdFromDriveUrl } from './media-payload.js';
import { sameInstansi } from './auth.js';

// Router ini dipasang di server/index.js pada /api/media, di belakang
// requireRole(ABSEN_ROLES) yang mengisi req.user. Handler tetap checking req.user
// dan scope lewat inScope()/scopeParams() supaya router tetap aman kalau di-mount
// tanpa middleware itu (mis. di test atau mount tambahan).
//
// CATATAN CUTOVER: requireRole() hanya menerima token sesi asli (192 hex, dari
// auth_sessions). js/auth.js masih membuat token 'tg_<id>_<ts>' sendiri, jadi
// frontend HARUS pindah ke sesi native sebelum /api/media dipanggil — kalau tidak,
// setiap pengguna Telegram WebApp dapat 401.

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
// user_list tidak punya kolom "face_descriptor" maupun "updated_at" -- keduanya
// hasil asumsi, akan 500 di production. Deskriptor disimpan di "face_histogram"
// (kolom yang sama dipakai frontend sebagai sumber utama: auth.js, meja.js,
// desktop.js, admin-face.js semua baca face_histogram dulu). Field request tetap
// "face_descriptor" karena itu yang dikirim face.js:155.
const FACE_UPDATE_SQL = `UPDATE "user_list"
  SET "face_photo" = $5, "face_histogram" = $2, "face_saved_at" = $3,
      "face_model" = $4
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

// Scope jadi WHERE, bukan filter di JS: satu query untuk SUPERADMIN (melihat semua)
// dan ADMIN (instansinya saja), dengan bentuk parameter yang sama seperti
// SIGNATURE_UPSERT_SQL. Kolom eksplisit — lihat catatan di route /signatures.
const SIGNATURE_LIST_SQL = `SELECT t."nip", t.signature
  FROM "tanda_tangan" t
  LEFT JOIN "user_list" u ON u."NIP" = t."nip"
  WHERE t.signature IS NOT NULL
    AND (COALESCE(u."instansi_id",'') IS NOT DISTINCT FROM $1 OR $2::boolean)
  ORDER BY t."nip"`;

// Siapa saja yang menyimpan fileId ini. C-5: dua bentuk URL hidup berdampingan —
// wajah /file/d/<id>/, tanda tangan ?export=view&id=<id>. Dual LIKE wajib; salah
// satu saja berarti setiap file tanda tangan 404 padahal jelas milik orang itu.
// UNION (bukan OR) supaya tanda tangan milik orang yang tidak ada di user_list
// tetap ikut terhitung. LIMIT 50: di luar itu, 403 sudah cukup — jangan diam-diam
// jadi 200 untuk pegawai ke-51 yang kebetulan satu instansi.
const RAW_OWNER_SQL = `SELECT u."instansi_id" FROM "user_list" u
  WHERE u."face_photo" LIKE $1 OR u."face_photo" LIKE $2
  UNION
  SELECT u."instansi_id" FROM "tanda_tangan" t
  LEFT JOIN "user_list" u ON u."NIP" = t.nip
  WHERE t.signature LIKE $1 OR t.signature LIKE $2
  LIMIT 50`;

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

      if (req.body?._reset) {
        const result = await query(`UPDATE "user_list" SET "face_histogram"='[]', "face_photo"='', "face_saved_at"=NULL, "face_model"='faceapi' WHERE id=$1::bigint AND (COALESCE("instansi_id",'') IS NOT DISTINCT FROM $2 OR $3::boolean) RETURNING id::text AS id`, [targetId, norm(req.user.instansi_id), req.user.role === 'SUPERADMIN']);
        if (!result.rows.length) return fail(res, 500, 'Gagal mereset data wajah');
        return ok(res, { message: 'Data wajah berhasil direset.' });
      }

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

  // Baca foto wajah. Params route SELALU string, jadi targetUserId() di sini juga
  // menolak ' 42 ', '0x2a', '1e3' — bukan hanya number seperti di POST /face.
  router.get('/face/:user_id', async (req, res) => {
    try {
      if (!req.user) return fail(res, 403, 'Forbidden');

      const targetId = targetUserId(req.params.user_id);
      if (!targetId) return fail(res, 400, 'user_id harus integer positif');

      const target = (await query(FACE_TARGET_SQL, [targetId])).rows[0];
      if (!target) return fail(res, 404, 'Pengguna tidak ditemukan');
      if (!inScope(req.user, target)) return fail(res, 403, 'Forbidden');

      return ok(res, { photoUrl: target.face_photo || null });
    } catch (e) {
      console.error('[media/face] tak tertangani', e);
      return fail(res, 503, 'Layanan sedang tidak tersedia');
    }
  });

  // SELECT-nya sudah bring-the-user: tanda_tangan LEFT JOIN user_list, jadi
  // inScope() punya id + instansi_id tanpa query kedua.
  // Face profile lookup by query is kept for frontend compatibility during cutover.
  router.get('/face', async (req, res) => {
    try {
      const targetId = targetUserId(req.query.user_id || req.user?.id);
      if (!targetId) return fail(res, 400, 'user_id tidak valid');
      const target = (await query(`SELECT id::text AS id, "NIP" AS nip, instansi_id, face_histogram, face_photo, face_saved_at, face_model FROM user_list WHERE id=$1::bigint LIMIT 1`, [targetId])).rows[0];
      if (!target || !inScope(req.user, target)) return fail(res, 403, 'Forbidden');
      const hist = String(target.face_histogram || '').trim();
      if (!hist || hist === '[]') return ok(res, { ok: false, message: 'Belum ada data wajah', histogram: null, face_descriptor: null, descriptor: null, dataUrl: target.face_photo || null });
      let histogram; try { histogram = JSON.parse(hist); } catch { return fail(res, 500, 'Data wajah tidak valid'); }
      return ok(res, { histogram, face_descriptor: histogram, descriptor: histogram, face_model: target.face_model || (histogram.length >= 512 ? 'human' : 'faceapi'), saved_at: target.face_saved_at || null, savedAt: target.face_saved_at || null, dataUrl: target.face_photo || null });
    } catch (e) { console.error('[media/face-get]', e); return fail(res, 503, 'Layanan sedang tidak tersedia'); }
  });

  router.get('/faces', async (req, res) => {
    try {
      const params = scopeParams(req.user);
      const rows = (await query(`SELECT id::text AS id, "NIP" AS nip, username AS nama, instansi_id, face_histogram, face_photo, face_saved_at, face_model FROM user_list WHERE (COALESCE(instansi_id,'') IS NOT DISTINCT FROM $1 OR $2::boolean) ORDER BY "no" ASC NULLS LAST`, params)).rows;
      return ok(res, { rows, data: rows });
    } catch (e) { console.error('[media/faces]', e); return fail(res, 503, 'Layanan sedang tidak tersedia'); }
  });

  router.get('/face-toggle', async (req, res) => {
    try {
      const inst = req.query.instansi_id || req.user.instansi_id || '';
      if (!sameInstansi(req.user, inst)) return fail(res, 403, 'Forbidden');
      const row = (await query(`SELECT value FROM pengaturan WHERE key='face_recognition' AND instansi_id=$1 LIMIT 1`, [inst])).rows[0];
      return ok(res, { enabled: row ? !['0','false','off'].includes(String(row.value).toLowerCase()) : true });
    } catch (e) { console.error('[media/face-toggle/get]', e); return fail(res, 503, 'Layanan tidak tersedia'); }
  });

  router.post('/face-toggle', async (req, res) => {
    if (!['ADMIN','SUPERADMIN','KEPALA','SEKRETARIS','KABID','IRBAN'].includes(req.user?.role)) return fail(res, 403, 'Forbidden');
    try {
      const inst=req.body?.instansi_id || req.user.instansi_id || '';
      if (!sameInstansi(req.user,inst)) return fail(res,403,'Forbidden');
      const value=req.body?.enabled===true||String(req.body?.enabled).toLowerCase()==='true'?'1':'0';
      await query(`INSERT INTO pengaturan (key,value,instansi_id) VALUES ('face_recognition',$1,$2) ON CONFLICT (key,instansi_id) DO UPDATE SET value=EXCLUDED.value`,[value,inst]);
      return ok(res,{enabled:value==='1'});
    } catch(e){console.error('[media/face-toggle/post]',e);return fail(res,500,'Gagal menyimpan pengaturan face recognition.');}
  });

  router.get('/face-settings', async (req,res) => {
    try { const inst=req.query.instansi_id || req.user.instansi_id || ''; if(!sameInstansi(req.user,inst))return fail(res,403,'Forbidden'); const rows=(await query(`SELECT key,value FROM pengaturan WHERE instansi_id=$1 AND key IN ('face_liveness_enabled','face_threshold','face_meja_threshold','face_liveness_score','face_mandatory_nips','face_recognition')`,[inst])).rows; const settings={liveness_enabled:true,face_threshold:0.55,meja_threshold:0.55,liveness_score:0.40,mandatory_nips:[]}; for(const x of rows){if(x.key==='face_liveness_enabled')settings.liveness_enabled=!['0','false','off'].includes(String(x.value).toLowerCase()); else if(x.key==='face_threshold')settings.face_threshold=parseFloat(x.value)||0.55; else if(x.key==='face_meja_threshold')settings.meja_threshold=parseFloat(x.value)||0.55; else if(x.key==='face_liveness_score')settings.liveness_score=parseFloat(x.value)||0.40; else if(x.key==='face_mandatory_nips'){try{settings.mandatory_nips=JSON.parse(x.value)||[];}catch{settings.mandatory_nips=[];}}} return ok(res,{settings}); } catch(e){console.error('[media/face-settings/get]',e);return fail(res,503,'Layanan tidak tersedia');}
  });

  router.post('/face-settings', async (req,res) => {
    if (!['ADMIN','SUPERADMIN','KEPALA','SEKRETARIS','KABID','IRBAN'].includes(req.user?.role)) return fail(res,403,'Forbidden');
    try { const inst=req.body?.instansi_id || req.user.instansi_id || ''; if(!sameInstansi(req.user,inst))return fail(res,403,'Forbidden'); const s=req.body?.settings||{}; const fields=[['face_liveness_enabled',s.liveness_enabled],['face_threshold',s.face_threshold],['face_meja_threshold',s.meja_threshold],['face_liveness_score',s.liveness_score],['face_mandatory_nips',Array.isArray(s.mandatory_nips)?JSON.stringify(s.mandatory_nips):s.mandatory_nips]]; for(const [key,val] of fields){if(val!==undefined&&val!==null)await query(`INSERT INTO pengaturan (key,value,instansi_id) VALUES ($1,$2,$3) ON CONFLICT (key,instansi_id) DO UPDATE SET value=EXCLUDED.value`,[key,String(val),inst]);} return ok(res,{updated:fields.filter(([,v])=>v!==undefined&&v!==null).map(([k])=>k)}); }catch(e){console.error('[media/face-settings/post]',e);return fail(res,500,'Gagal menyimpan pengaturan face.');}
  });

  router.get('/signature', async (req, res) => {
    try {
      const wanted = norm(req.query.nip || '');
      if (!wanted) return fail(res, 400, 'nip wajib diisi');
      const rows = (await query(SIGNATURE_TARGET_SQL, [wanted])).rows;
      if (rows.length === 0) return fail(res, 404, 'Data tanda tangan tidak ditemukan');
      const target = rows[0];
      if (!inScope(req.user, target)) return fail(res, 403, 'Forbidden');
      return ok(res, { signature: target.signature || null });
    } catch (e) { console.error('[media/signature-get]', e); return fail(res, 503, 'Layanan sedang tidak tersedia'); }
  });

  router.get('/signature/:nip', async (req, res) => {
    try {
      if (!req.user) return fail(res, 403, 'Forbidden');

      const nip = norm(req.params.nip);
      if (!nip) return fail(res, 400, 'nip wajib diisi');

      const target = (await query(SIGNATURE_TARGET_SQL, [nip])).rows[0];
      if (!target) return fail(res, 404, 'Data tanda tangan tidak ditemukan');
      if (!inScope(req.user, target)) return fail(res, 403, 'Forbidden');

      return ok(res, { signature: target.signature || null });
    } catch (e) {
      console.error('[media/signature] tak tertangani', e);
      return fail(res, 503, 'Layanan sedang tidak tersedia');
    }
  });

  // Daftar tanda tangan untuk form. Kolom ditulis eksplisit: tanda_tangan juga
  // punya saved_by/saved_at, dan operacionais tidak butuh keduanya di sini.
  router.get('/signatures', async (req, res) => {
    try {
      if (!req.user) return fail(res, 403, 'Forbidden');

      const rows = (await query(SIGNATURE_LIST_SQL, scopeParams(req.user))).rows;
      // Kontrak client: rekap-pdf.js, tugas_lembur.js, signature.js mem-parse
      // `data` array (parseApiResponse / sd.data). Tanpa ini sigMap kosong dan
      // tanda tangan tidak pernah digambar di PDF rekap.
      return ok(res, { data: rows, rows });
    } catch (e) {
      console.error('[media/signatures] tak tertangani', e);
      return fail(res, 503, 'Layanan sedang tidak tersedia');
    }
  });

  // C-5: dua bentuk URL hidup berdampingan — wajah /file/d/<id>/, tanda tangan
  // ?export=view&id=<id>. Dual LIKE wajib; salah satu saja = file tanda tangan
  // selalu 404 padahal jelas milik orang itu.

  router.get('/raw/:fileId', async (req, res) => {
    try {
      if (!req.user) return fail(res, 403, 'Forbidden');

      // driveFileId(), bukan regex sendiri: sudah menolak host non-Google dan
      // kata sentinel ('undefined' dsb) yang akan jadi 502 permanen.
      const fileId = driveFileId(req.params.fileId);
      if (!fileId) return fail(res, 400, 'fileId tidak valid');

      const rows = (
        await query(RAW_OWNER_SQL, [`%/file/d/${fileId}/%`, `%export=view&id=${fileId}%`])
      ).rows;
      if (!rows.length) return fail(res, 404, 'File tidak ditemukan');

      const allowed = rows.some((r) => sameInstansi(req.user, norm(r.instansi_id)));
      if (!allowed) return fail(res, 403, 'Forbidden');

      const upstream = await fetch(`https://drive.google.com/uc?export=download&id=${fileId}`);
      if (!upstream.ok) return fail(res, 502, 'Layanan penyimpanan sedang bermasalah');

      const type = upstream.headers.get('content-type') || '';
      if (!type.startsWith('image/')) return fail(res, 415, 'Bukan file gambar');

      res.setHeader('Content-Type', type);
      res.setHeader('Cache-Control', 'private, max-age=3600');
      return res.end(Buffer.from(await upstream.arrayBuffer()));
    } catch (e) {
      console.error('[media/raw] tak tertangani', e);
      return fail(res, 503, 'Layanan sedang tidak tersedia');
    }
  });

  return router;
}