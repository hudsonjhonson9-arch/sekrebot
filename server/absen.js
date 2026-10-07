import express from 'express';
import { validateAbsen, evaluateGates } from './absen-validate.js';
import { witaNow, hariIndonesia } from './absen-util.js';

// ── SQL ──
// Semua nilai client masuk lewat $n. Canonical n8n menyisipkan string ke dalam
// SQL dengan .replace(/'/g,"''"); itu bukan parameterisasi dan hanya kebetulan
// aman untuk kutip tunggal.

// Identitas diambil dari req.user.id, bukan body.nip: id adalah primary key jadi
// satu baris pasti, sedangkan "NIP" di user_list tidak dijamin unik. Ambil
// berdasarkan NIP berarti "baris mana yang kebetulan duluan" menentukan siapa
// yang absen.
export const PEGAWAI_SQL =
  'SELECT id::text AS id, username, "NIP", "Status", "Jabatan", bidang, pangkat, nomorhp, instansi_id '
  + 'FROM "user_list" WHERE id = $1::bigint';

// Masuk/pulang dibaca dari tabel jam_absen (node "Get Jam Absen"), bukan dari
// jam_masuk/jam_pulang di user_list: kolom latter hanya default per-user saat
//_user dibuat, dan tidak dipakai validasi absen canonical.
export const JAM_SQL =
  'SELECT masuk, pulang FROM "jam_absen" WHERE "key" = \'jam_absen_global\' '
  + 'AND (instansi_id = $1 OR instansi_id IS NULL OR instansi_id = \'\') '
  + 'ORDER BY CASE WHEN instansi_id = $1 THEN 0 ELSE 1 END LIMIT 1';

export const LOKASI_SQL =
  'SELECT * FROM "lokasiabsen" WHERE instansi_id LIKE $1 OR instansi_id = \'all\'';

// "ID" dikembalikan ::text supaya perbandingan dengan req.user.id tidak pernah
// bergantung pada driver mengubah bigint jadi string atau number.
export const LOG_HARIAN_SQL =
  'SELECT "ID"::text AS "ID", "Tanggal", "Jam", "Jenis Absen" FROM "Log_Absen" '
  + 'WHERE "NIP" = $1 AND "Tanggal" = $2';

export const REQUEST_ID_SQL =
  'SELECT 1 FROM "Log_Absen" WHERE request_id = $1 LIMIT 1';

// Kolom mengikuti node "Simpan Log" canonical. client_jam sengaja belum ikut:
// migration 008 belum diterapkan ke database, dan menyebut kolom yang belum ada
// akan membuat SETIAP insert absen gagal. Tambahkan setelah migration lands.
// ponytail: naikkan ke sini setelah migration_008_native_absen.sql diterapkan.
export const INSERT_LOG_SQL =
  'INSERT INTO "Log_Absen" ("ID", "Nama", "NIP", "Tanggal", "Jam", "Jenis Absen", '
  + '"Lokasi", "Ket", "koordinat", "request_id", "instansi_id") '
  + 'VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11) '
  + 'ON CONFLICT ("request_id") DO NOTHING RETURNING *';

// req.ip untuk klien IPv4 datang sebagai ::ffff:127.0.0.1. Tanpa normalisasi ini
// tidak ada ip_range IPv4 pun yang akan cocok, jadi gate IP mati diam-diam.
function clientIp(req) {
  const raw = String(req.ip || req.socket?.remoteAddress || '');
  return raw.startsWith('::ffff:') ? raw.slice(7) : raw;
}

const tolak = (kode, keterangan) =>
  ({ validasi: { is_valid: false, kode_tolak: kode, keterangan } });

export function createAbsenRouter({ query, verifyInitData, botToken, now = () => new Date() }) {
  const router = express.Router();

  router.post('/', async (req, res) => {
    // Seluruh handler di dalam try: Express 4 tidak meneruskan rejected promise
    // ke error handler, jadi penolakan di sini akan menggantung request selamanya.
    try {
      const body = req.body || {};
      const user = req.user || {};

      // init_data Telegram membuktikan kepemilikan akun di sisi Telegram; session
      // membuktikan siapa yang login di sisi kita. Keduanya harus cocok, kalau tidak
      // siapa pun bisa absen atas nama orang lain hanya dengan menebak request_id.
      const init = String(body.init_data || '');
      if (req.authKind !== 'device') {
        const init1 = await verifyInitData(init, botToken);
        if (!init1?.ok) {
          return res.status(401).json({ ok: false, message: 'init_data tidak valid' });
        }
        if (String(init1.user?.id ?? '') !== String(user.id ?? '')) {
          return res.status(403).json({ ok: false, message: 'init_data tidak sesuai dengan sesi login' });
        }
      }

      const requestId = String(body.request_id || '').trim();
      if (!requestId || requestId.length > 128) {
        return res.status(400).json({ ok: false, message: 'request_id tidak valid' });
      }

      // Idempotensi dicek paling awal: request yang sama punya jawaban sama
      // walau gate sudah berubah karena log ikut bertambah.
      const dup = await query(REQUEST_ID_SQL, [requestId]);
      if (dup.rows.length) {
        return res.json({ ok: true, message: 'Data sudah tercatat (Idempotent)' });
      }

      const peg = await query(PEGAWAI_SQL, [user.id]);
      if (peg.rows.length !== 1) {
        return res.status(403).json({ ok: false, message: 'Data pegawai tidak dapat dipastikan' });
      }
      const row = peg.rows[0];
      // validateAbsen memakai kunci huruf kecil; baris database capitalize.
      const employee = { ...row, nip: row.NIP, status: row.Status };

      const at = now();
      const serverTime = witaNow(at);
      const hari = hariIndonesia(at);

      const jam = await query(JAM_SQL, [employee.instansi_id]);
      const jamRow = jam.rows[0] || {};
      const lok = await query(LOKASI_SQL, [`%${employee.instansi_id || ''}%`]);

      // body.nip, body.jam, dan body.tanggal_iso sengaja tidak diteruskan:
      // ketiganya milik klien, dan ketiganya pernah dipakai canonical untuk
      // menentukan siapa yang absen, jam berapa, dan hari tanggal berapa.
      const payload = {
        init_data: init,
        source: body.source,
        meja_token: body.meja_token,
        lokasi_nama: body.lokasi_nama,
        jenis_absen: body.jenis_absen,
        keterangan: body.keterangan,
        skip_radius_check: body.skip_radius_check === true,
        latitude: body.latitude,
        longitude: body.longitude,
        horizontal_accuracy: body.horizontal_accuracy,
        gps_fingerprint: body.gps_fingerprint,
        clientIp: clientIp(req),
      };

      const settings = {
        hariIni: hari,
        jamMasuk: jamRow.masuk || '07:15',
        jamPulang: jamRow.pulang || '14:30',
        lokasi: lok.rows,
      };

      const v = validateAbsen({ payload, serverTime, employee, settings });

// Gate berjalan lebih dulu: canonical mengecek duplikasi/keterangan di
      // awal ("Pengecekan Duplikasi & Keterangan di Awal"), supaya hari yang
      // sudah punya alasan mendapat pesan yang tepat, bukan keluhan radius.
      const logs = await query(LOG_HARIAN_SQL, [employee.nip, serverTime.tanggal]);
      const gate = evaluateGates({
        jenisAbsen: v.jenisAbsen,
        serverTime,
        tanggal: serverTime.tanggal,
        employeeId: employee.id,
        rows: logs.rows,
      });
      if (gate) return res.json(tolak(gate.kodeTolak, gate.keterangan));
      if (!v.ok) return res.json(tolak(v.kodeTolak, v.keterangan));

      const koordinat = Number.isFinite(Number(payload.latitude)) && Number.isFinite(Number(payload.longitude))
        ? `${payload.latitude},${payload.longitude}`
        : '';

      const ins = await query(INSERT_LOG_SQL, [
        String(employee.id),
        // Kolom "Nama" diisi dari username: itu satu-satunya kolom nama di
        // user_list ("username" berisi nama lengkap, lihat Format Respon
        // canonical). Simpan Log canonical menulis pegawai.nama yang tidak pernah
        // di-select, jadi nilainya undefined.
        employee.username || '',
        employee.nip || '',
        serverTime.tanggal,
        serverTime.jam.slice(0, 5),
        v.jenisAbsen,
        v.namaLokasi || '',
        v.keterangan || '',
        koordinat,
        requestId,
        employee.instansi_id || '',
      ]);

      // 0 baris = request_id bentrok karena request paralel lain yang menang.
      // Tetap sukses: pemanggilnya akan melihat record yang sama.
      const saved = ins.rows[0];
      return res.json({
        validasi: {
          is_valid: true,
          keterangan: v.keterangan || '',
          nama_lokasi: saved?.Lokasi || v.namaLokasi || '',
        },
      });
    } catch (err) {
      console.error('[absen]', err);
      return res.status(503).json({ ok: false, message: 'Layanan absen sedang tidak tersedia' });
    }
  });

  return router;
}