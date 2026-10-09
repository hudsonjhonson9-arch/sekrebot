import express from 'express';
import { MEDIA_ROLES, sameInstansi } from './auth.js';

// ── SQL ──
// Canonical n8n ("Supabase Log-Insert" / "Log-Update") menyisipkan nilai client
// ke dalam teks SQL dengan .replace(/'/g,"''"). Itu bukan parameterisasi:
// meng-escape kutip tunggal tidak menutup jalur injeksi, dan "Nama"/"NIP"/
// "instansi_id" diambil dari body sehingga admin bisa menulis nama dan NIP palsu
// untuk pegawai mana pun. Di sini semua nilai masuk lewat $n, dan kolom yang
// harus mencerminkan user_list ditentukan dari database.

// Field bernama telegram_id itu misleading: isinya user_list.id, bukan Telegram
// ID (user_list tidak punya kolom telegram; satu-satunya kolom telegram_id di
// DB ada di admin_list yang tidak dipakai). Log_Absen.ID = user_list.id.
export const SUBJECT_SQL =
  'SELECT id::text AS id, username, "NIP", instansi_id FROM "user_list" WHERE id = $1::bigint';

export const INSERT_SQL =
  'INSERT INTO "Log_Absen" ("ID", "Nama", "NIP", "Tanggal", "Jam", "Jenis Absen", "Ket", "instansi_id", "request_id") '
  + 'VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) ON CONFLICT ("request_id") DO NOTHING RETURNING *';

// "ID", "Nama", dan "NIP" sengaja tidak ikut di-set: ketiganya milik pegawai yang
// dicatat, dan sudah tercermin dari user_list. Mengedit log tidak boleh memindahkan
// catatan ke orang lain atau menulis NIP yang tidak cocok dengan aslinya.
const UPDATE_SET = '"Tanggal" = $1, "Jam" = $2, "Jenis Absen" = $3, "Ket" = $4';

export const UPDATE_SQL =
  `UPDATE "Log_Absen" SET ${UPDATE_SET} WHERE "ID_Log" = $5 RETURNING *`;

// Admin non-SUPERADMIN hanya boleh mengedit baris instansi sendiri. Filter-nya
// di SQL, bukan di aplikasi: baris instansi lain tidak mungkin bocor karena
// tidak pernah dibaca sama sekali.
export const UPDATE_SQL_INSTANSI =
  `UPDATE "Log_Absen" SET ${UPDATE_SET} WHERE "ID_Log" = $5 AND "instansi_id" = $6 RETURNING *`;

const PESAN_TIDAK_LENGKAP = 'Data tidak lengkap (ID, Tanggal, Jam, Jenis wajib).';

const S = (v) => (v === undefined || v === null ? '' : String(v).trim());

export function pickLog(body) {
  return {
    subjectId: S(body.telegram_id),
    logId: S(body.ID_Log),
    tanggal: S(body.tanggal),
    jam: S(body.jam),
    jenis: S(body.jenis_absen),
    ket: S(body.keterangan),
    // request_id kosong -> null, bukan ''. Kolomnya punya unique index, jadi dua
    // request tanpa request_id akan saling memblokir kalau dikirim sebagai ''.
    requestId: S(body.request_id) || null,
  };
}

export function createLogRouter({ query }) {
  const router = express.Router();

  router.get('/', async (req, res) => {
    try {
      const q = req.query || {};
      let params = []; const where = [];
      const media = MEDIA_ROLES.has(String(req.user?.role || '').toUpperCase());
      if (media) {
        const subject = String(q.user_id || q.id || '').trim();
        if (subject) { params.push(subject); where.push(`"ID"::text=$${params.length}`); }
        if (q.nip) { params.push(String(q.nip)); where.push(`"NIP"=$${params.length}`); }
      } else {
        // Pegawai biasa hanya boleh melihat catatan miliknya sendiri, apa pun
        // user_id/nip yang dikirim — riwayat orang lain adalah wewenang media.
        params.push(req.user.id); where.push(`"ID"::text=$${params.length}`);
      }
      if (q.tanggal) { params.push(String(q.tanggal).slice(0,10)); where.push(`"Tanggal"=$${params.length}`); }
      if (q.dari && q.sampai) { params.push(String(q.dari).slice(0,10), String(q.sampai).slice(0,10)); where.push(`"Tanggal">=$${params.length-1} AND "Tanggal"<=$${params.length}`); }
      if (req.user.role !== 'SUPERADMIN') { params.push(req.user.instansi_id); where.push(`instansi_id=$${params.length}`); }
      const sql = `SELECT * FROM "Log_Absen"${where.length ? ' WHERE '+where.join(' AND ') : ''} ORDER BY "Tanggal" DESC, "Jam" DESC`;
      const { rows } = await query(sql, params);
      return res.json({ ok:true, data:rows, rows });
    } catch { return res.status(500).json({ ok:false, message:'Gagal mengambil log.' }); }
  });

  router.post('/add', async (req, res) => {
    try {
      if (!MEDIA_ROLES.has(String(req.user?.role || '').toUpperCase())) {
        return res.status(403).json({ ok: false, message: 'Forbidden' });
      }
      const v = pickLog(req.body || {});
      if (!v.subjectId || !v.tanggal || !v.jam || !v.jenis) {
        return res.status(400).json({ ok: false, message: PESAN_TIDAK_LENGKAP });
      }

      const { rows } = await query(SUBJECT_SQL, [v.subjectId]);
      if (rows.length !== 1) {
        return res.status(404).json({ ok: false, message: 'Pegawai tidak ditemukan.' });
      }
      const p = rows[0];

      if (!sameInstansi(req.user, p.instansi_id)) {
        return res.status(403).json({ ok: false, message: 'Forbidden' });
      }

      // 0 baris = request_id-nya sudah ada (ON CONFLICT DO NOTHING). Itu hasil
      // yang benar untuk kirim ulang, jadi tetap sukses; Error hanya untuk 404
      // di atas dan 500 di bawah.
      await query(INSERT_SQL, [p.id, p.username, p.NIP, v.tanggal, v.jam, v.jenis, v.ket, p.instansi_id, v.requestId]);
      return res.json({ ok: true, message: 'Log berhasil disimpan.' });
    } catch {
      return res.status(500).json({ ok: false, message: 'Gagal menyimpan log.' });
    }
  });

  router.post('/edit', async (req, res) => {
    try {
      if (!MEDIA_ROLES.has(String(req.user?.role || '').toUpperCase())) {
        return res.status(403).json({ ok: false, message: 'Forbidden' });
      }
      const v = pickLog(req.body || {});
      if (!v.logId || !v.tanggal || !v.jam || !v.jenis) {
        return res.status(400).json({ ok: false, message: PESAN_TIDAK_LENGKAP });
      }

      const bebas = req.user?.role === 'SUPERADMIN';
      const sql = bebas ? UPDATE_SQL : UPDATE_SQL_INSTANSI;
      const params = bebas
        ? [v.tanggal, v.jam, v.jenis, v.ket, v.logId]
        : [v.tanggal, v.jam, v.jenis, v.ket, v.logId, req.user?.instansi_id];

      const { rows } = await query(sql, params);
      // 0 baris = ID_Log salah atau barisnya milik instansi lain. Harus 404:
      // kalau dibalas sukses, admin mengira edit-nya masuk padahal tidak, dan
      // tidak ada cara know bedanya.
      if (rows.length === 0) {
        return res.status(404).json({ ok: false, message: 'Log tidak ditemukan.' });
      }
      return res.json({ ok: true, message: 'Log berhasil disimpan.' });
    } catch {
      return res.status(500).json({ ok: false, message: 'Gagal menyimpan log.' });
    }
  });

  return router;
}