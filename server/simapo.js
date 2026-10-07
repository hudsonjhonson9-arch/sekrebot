import express from 'express';

// ── SQL ──
// Workflow n8n "SIMAPO Ext" menyisipkan nilai client ke teks SQL dengan
// .replace(/'/g,"''"). Itu bukan parameterisasi: meng-escape kutip tunggal tidak
// menutup jalur injeksi (backslash, comment, dan type confusion tetap lolos) dan
// angka mentah tanpa kutip membuat kolom numeric bisa disuntik lewat UNION.
// Di sini semua nilai masuk lewat $n.

const INSTANSI_DEFAULT = 'bapperida';
const BATAS_BKU = 500;

export const MASTER_SQL =
  `SELECT json_build_object(
     'kodefikasi', (SELECT COALESCE(json_agg(k.* ORDER BY k.path), '[]'::json) FROM "SIMAPO".kodefikasi_barang k),
     'rekening',   (SELECT COALESCE(json_agg(r.* ORDER BY r.kode),   '[]'::json) FROM "SIMAPO".rekening_belanja r),
     'barang',     (SELECT COALESCE(json_agg(b.* ORDER BY b.nama),   '[]'::json) FROM "SIMAPO".barang b WHERE b.instansi_id = $1),
     'periode',    (SELECT json_build_object('bulan', EXTRACT(MONTH FROM NOW())::int, 'tahun', EXTRACT(YEAR FROM NOW())::int))
   ) AS data`;

export const INSERT_NOTA_SQL =
  `INSERT INTO "SIMAPO".penerimaan_barang
     (instansi_id, no_nota, tgl_nota, penyedia, total_nilai, no_sp2d, kontrak, sub_kegiatan, status_spj, created_by)
   VALUES ($1, $2, $3::date, $4, $5, $6, $7, $8, $9, $10)
   RETURNING id`;

// Volume boleh desimal dari form; kolomnya numeric, jadi biarkan Postgres yang
// memotong. NUMERIC(10,2)-kan di sini akan menolak volume pecahan yang sah.
export const INSERT_DETAIL_SQL =
  `INSERT INTO "SIMAPO".detail_penerimaan (penerimaan_id, barang_id, volume, harga_satuan, total_harga)
   VALUES %VALUES%
   RETURNING barang_id, volume`;

// Stok naik sesuai barang yang benar-benar tercatat di detail, bukan dari payload
// caller. Kalau keduanya berbeda, stok akan melenceng dari nota yang tersimpan.
export const UPDATE_STOK_SQL =
  `UPDATE "SIMAPO".barang b
   SET stok_saat_ini = COALESCE(b.stok_saat_ini, 0) + t.vol
   FROM (
     SELECT barang_id, SUM(volume) AS vol
     FROM "SIMAPO".detail_penerimaan
     WHERE penerimaan_id = $1::uuid
     GROUP BY barang_id
   ) t
   WHERE b.id = t.barang_id
   RETURNING b.id`;

export const PEMELIHARAAN_SQL =
  `SELECT p.id, p.barang_id, b.nama AS nama_barang, b.satuan, p.tgl_pemeliharaan,
          p.jenis_pemeliharaan, p.biaya, p.nama_penyedia, p.bentuk_kontrak, p.keterangan
   FROM "SIMAPO".pemeliharaan p
   LEFT JOIN "SIMAPO".barang b ON b.id = p.barang_id
   WHERE p.instansi_id = $1 %FILTER%
   ORDER BY p.tgl_pemeliharaan DESC
   LIMIT 200`;

export const INSERT_PEMELIHARAAN_SQL =
  `INSERT INTO "SIMAPO".pemeliharaan
     (instansi_id, barang_id, tgl_pemeliharaan, jenis_pemeliharaan, biaya, nama_penyedia, bentuk_kontrak, keterangan)
   VALUES ($1, $2, NULLIF($3, '')::date, $4, $5, $6, $7, $8)
   RETURNING id`;

export const BKU_LIST_SQL =
  `SELECT no_urut, tgl, uraian, kode_rekening, penerimaan, pengeluaran, saldo
   FROM "SIMAPO".bku
   WHERE instansi_id = $1
   ORDER BY tgl DESC, no_urut ASC
   LIMIT 200`;

export const INSERT_BKU_SQL =
  `INSERT INTO "SIMAPO".bku
     (instansi_id, bulan, tahun, no_urut, tgl, uraian, kode_rekening, penerimaan, pengeluaran, saldo)
   VALUES %VALUES%
   RETURNING id`;

// ── Kategori & master barang ──
// Bentuk responsnya sekarang pasti: query n8n mengembalikan {items:[...]} lalu
// Code node "Agg" membungkusnya jadi {data:[...]}. parseApiResponse() hanya
// mengenal data/items-as-array, jadi {ok, data} yang dipakai di sini aman dan
// tidak menyentuh frontend.

export const KATEGORI_LIST_SQL =
  `SELECT COALESCE(json_agg(t.*), '[]'::json) AS items FROM (
     SELECT k.id, k.nama, k.deskripsi, COUNT(b.id) AS jumlah_aset
     FROM "SIMAPO".kategori_barang k
     LEFT JOIN "SIMAPO".barang b
       ON b.kategoriid = k.id AND b.isactive = true AND b.instansi_id = $1
     WHERE k.instansi_id = $1
     GROUP BY k.id, k.nama, k.deskripsi
     ORDER BY k.nama ASC
   ) t`;

export const KATEGORI_SAVE_SQL =
  `INSERT INTO "SIMAPO".kategori_barang (id, nama, deskripsi, createdat, instansi_id)
   VALUES (gen_random_uuid()::text, $1, $2, NOW(), $3)
   RETURNING id, nama`;

// Kolom ini punya DEFAULT 'bapperida' sejak ALTER TABLE, jadi tidak ada baris NULL
// yang perlu diladeni. Nol baris berarti id salah atau milik instansi lain, dan
// handler membalas 404 - gagal tertutup, bukan bocor.
export const KATEGORI_DELETE_SQL =
  `DELETE FROM "SIMAPO".kategori_barang
   WHERE id = $1 AND instansi_id = $2
   RETURNING id, nama`;

// Aset tetap tidak punya kolom stok yang bisa dipercaya: yang dihitung unitnya.
export const KATALOG_SQL =
  `SELECT COALESCE(json_agg(t.*), '[]'::json) AS items FROM (
     SELECT b.id, b.kodebarang, b.nama, b.jenisbarang, b.satuan, b.spesifikasi, b.foto,
            CASE WHEN LOWER(REPLACE(b.jenisbarang, ' ', '_')) IN ('aset_tetap', 'asettetap')
                 THEN (SELECT COUNT(*)::int FROM "SIMAPO".unit_aset ua
                        WHERE ua.barangid = b.id AND ua.instansi_id = $1)
                 ELSE b.stok_saat_ini
            END AS stok_saat_ini,
            b.minimumstok, b.hargasatuan, b.kategoriid, b.isactive
     FROM "SIMAPO".barang b
     WHERE b.isactive = true AND b.instansi_id = $1
     ORDER BY b.nama ASC
   ) t`;

export const MASTER_LIST_SQL =
  `SELECT COALESCE(json_agg(t.*), '[]'::json) AS items FROM (
     SELECT b.id, b.kodebarang, b.nama, b.jenisbarang, b.satuan, b.spesifikasi, b.foto,
            b.stok_saat_ini, b.minimumstok, b.hargasatuan, b.kategoriid,
            k.nama AS nama_kategori, b.isactive,
            TO_CHAR(b.createdat, 'YYYY-MM-DD') AS createdat
     FROM "SIMAPO".barang b
     LEFT JOIN "SIMAPO".kategori_barang k ON k.id = b.kategoriid
     WHERE b.isactive = true AND b.instansi_id = $1
     ORDER BY b.nama ASC
   ) t`;

// COALESCE($1, gen_random_uuid()::text): id kosong berarti barang baru. Indeks $1
// dipakai untuk insert maupun update supaya tidak ada dua bentuk SQL.
//
// WHERE di DO UPDATE itu pengaman, bukan hiasan: tanpa itu admin instansi lain
// bisa menabrak id milik instansi ini lewat body dan menimpa datanya. Kalau WHERE
// tidak terpenuhi, RETURNING kosong dan handler membalas 404.
export const MASTER_SAVE_SQL =
  `WITH new_barang AS (
     INSERT INTO "SIMAPO".barang
       (id, kodebarang, nama, jenisbarang, satuan, spesifikasi, foto,
        stok_saat_ini, minimumstok, hargasatuan, kategoriid, isactive,
        createdat, updatedat, instansi_id)
     VALUES (COALESCE($1, gen_random_uuid()::text), $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, true, NOW(), NOW(), $12)
     ON CONFLICT (id) DO UPDATE SET
       nama = EXCLUDED.nama, kodebarang = EXCLUDED.kodebarang,
       jenisbarang = EXCLUDED.jenisbarang, satuan = EXCLUDED.satuan,
       spesifikasi = EXCLUDED.spesifikasi, foto = EXCLUDED.foto,
       stok_saat_ini = EXCLUDED.stok_saat_ini, minimumstok = EXCLUDED.minimumstok,
       hargasatuan = EXCLUDED.hargasatuan, kategoriid = EXCLUDED.kategoriid,
       updatedat = NOW(), instansi_id = EXCLUDED.instansi_id
     WHERE "SIMAPO".barang.instansi_id = EXCLUDED.instansi_id
      RETURNING id, nama, kodebarang, jenisbarang, stok_saat_ini, instansi_id
   ), ins_ua AS (
     INSERT INTO "SIMAPO".unit_aset (id, barangid, nomorinventaris, kondisi, statuspinjam, tahunperolehan, updatedat, instansi_id)
     SELECT gen_random_uuid()::text, nb.id,
            nb.kodebarang || '-' || LPAD(g::text, 3, '0'),
            'Baik', false, EXTRACT(YEAR FROM NOW())::int, NOW(), nb.instansi_id
     FROM new_barang nb
     CROSS JOIN LATERAL generate_series(1, GREATEST(COALESCE(nb.stok_saat_ini, 0), 1)) AS g
     WHERE LOWER(REPLACE(nb.jenisbarang, ' ', '_')) IN ('aset_tetap', 'asettetap')
       AND NOT EXISTS (SELECT 1 FROM "SIMAPO".unit_aset ua WHERE ua.barangid = nb.id)
   )
   SELECT id, nama FROM new_barang`;

export const MASTER_DELETE_SQL =
  `UPDATE "SIMAPO".barang SET isactive = false, updatedat = NOW()
   WHERE id = $1 AND instansi_id = $2
   RETURNING id, nama`;

// ── Mutasi stok ──
// Alias kolom dipertahankan persis seperti query n8n supaya frontend yang sudah
// memakai /simapo-mutasi-list tidak perlu diubah.
export const MUTASI_LIST_SQL = `
  SELECT COALESCE(json_agg(t.*), '[]'::json) AS items FROM (
    SELECT m.id, b.nama AS nama_barang, b.kodebarang, m.jumlah, m.keterangan, m.createdbyid,
           COALESCE(u."username", m.createdbyid) AS nama_petugas,
           TO_CHAR(m.tanggal,'YYYY-MM-DD HH24:MI') AS createdat,
           CASE WHEN m.barangmasukid IS NOT NULL THEN 'MASUK' ELSE 'KELUAR' END AS jenis
    FROM "SIMAPO".mutasi_barang m
    LEFT JOIN "SIMAPO".barang b ON b.id = COALESCE(m.barangmasukid, m.barangkeluarid)
    LEFT JOIN public.user_list u ON u."NIP" = m.createdbyid
    WHERE m.instansi_id = $1
    ORDER BY m.tanggal DESC
    LIMIT 50
  ) t`;

// createdbyid diisi NIP dari sesi, bukan dari body: kolom ini menentukan siapa yang
// tercatat di audit, dan audit yang bisa dipalsukan client tidak berguna.
// tanggal dibiarkan default CURRENT_TIMESTAMP.
export const MUTASI_INSERT_SQL = `
  INSERT INTO "SIMAPO".mutasi_barang
    (id, barangmasukid, barangkeluarid, createdbyid, jumlah, keterangan, instansi_id)
  VALUES (gen_random_uuid()::text, $1, $2, $3, $4, $5, $6)
  RETURNING id`;

// Instansi masuk ke WHERE, bukan cuma ke INSERT: tanpa itu pemanggil yang tidak
// punya akses ke instansi lain masih bisa mengubah stoknya.
export const MUTASI_STOK_SQL = `
  UPDATE "SIMAPO".barang
  SET stok_saat_ini = GREATEST(0, stok_saat_ini + $2), updatedat = NOW()
  WHERE id = $1 AND instansi_id = $3 AND isactive
  RETURNING id, stok_saat_ini`;

// ── Helper ──
const S = (v) => (v === undefined || v === null ? '' : String(v).trim());
const N = (v) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};
// Keterangan/absen kontrol: biaya negatif tidak pernah sah, dan n8n lama memaksa
// nol lewat Math.max(0, ...). Ikuti aturan yang sama supaya tidak ada data yang
// tiba-tiba muncul dengan biaya minus.
const BIAYA_MIN = (v) => Math.max(0, N(v));

const kosongkan = (v) => (v === '' ? null : v);

// Workflow lama hanya mengenal dua jenis barang dan memetakan apa pun di luar
// "Habis Pakai" ke "Aset Tetap". Ikuti aturan yang sama supaya jenis yang tersimpan
// tidak berubah bentuk saat path-nya pindah ke native.
export function normalJenis(v) {
  return S(v).toLowerCase().replace(/[_ ]+/g, ' ') === 'habis pakai' ? 'Habis Pakai' : 'Aset Tetap';
}

// ponytail: 4 digit terakhir timestamp, sama seperti n8n. Dua barang dibuat pada
// milidetik yang sama bisa mendapat kode sama, tapi kodebarang tidak punya
// constraint unique di DB - ini label, bukan kunci. Beralih ke nomor urut hanya
// kalau nanti kode dipakai sebagai identitas.
export function buatKodeBarang(jenis, kategoriid) {
  const prefix = jenis === 'Aset Tetap' ? 'AT' : 'HP';
  const kat = (S(kategoriid) || 'KTG').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 5);
  return `${prefix}-${kat}-${String(Date.now()).slice(-4)}`;
}

// instances_id milik pemanggil bukan milik body: admin non-SUPERADMIN hanya boleh
// menyentuh baris instansi sendiri. SUPERADMIN boleh, karena memang adminsinistrasi
// lintas instansi.
export function instansiOtomatis(req, diminta) {
  if (req.user?.role === 'SUPERADMIN' && diminta) return S(diminta);
  return S(req.user?.user?.instansi_id || req.user?.instansi_id) || S(diminta) || INSTANSI_DEFAULT;
}

// Kode lama menerima tiga bentuk kiriman: {rows:[...]}, satu objek, dan {uraian}
// tanpa rows (dipakai form BKU satu baris). Pertahankan ketiganya.
export function barisBKU(body) {
  const src = body?.rows ? body : (body?.body || body || {});
  let rows = Array.isArray(src.rows) ? src.rows : [];
  if (!rows.length && src.uraian) rows = [src];
  return rows;
}

export function createSimapoRouter({ query, withTransaction }) {
  const router = express.Router();

  // ── Master penerimaan (kodefikasi, rekening, barang, periode) ──
  router.get('/penerimaan', async (req, res) => {
    try {
      const inst = instansiOtomatis(req, req.query?.instansi_id);
      const { rows } = await query(MASTER_SQL, [inst]);
      // Bentuk {data:...} dipakai frontend lewat parseApiResponse(). Versi n8n
      // membungkus jadi [{data:...}]; keduanya diterima, jadi yang bersih dipakai.
      return res.json({ ok: true, data: rows[0]?.data ?? {} });
    } catch {
      return res.status(500).json({ ok: false, message: 'Gagal memuat data master penerimaan.' });
    }
  });

  // ── Simpan penerimaan: nota + detail + update stok, satu transaksi ──
  router.post('/penerimaan', async (req, res) => {
    const body = req.body || {};
    const noNota = S(body.no_nota);
    const tglNota = S(body.tgl_nota);
    const penyedia = S(body.penyedia);
    const items = Array.isArray(body.items) ? body.items : [];

    if (!noNota || !tglNota || !penyedia || !items.length) {
      return res.status(400).json({ ok: false, message: 'no_nota, tgl_nota, penyedia, dan items wajib diisi.' });
    }
    if (items.length > BATAS_BKU) {
      return res.status(400).json({ ok: false, message: `Maksimal ${BATAS_BKU} item per permintaan.` });
    }

    // total_nilai hanya dipercaya kalau items benar-benar ada isinya; kalau tidak,
    // jumlahkan sendiri dari volume x harga supaya nota tidak bisa bernilai 0 atau
    // salah total hanya karena field yang dikirim tidak cocok.
    const total = N(body.total_nilai) || items.reduce((s, i) => s + N(i.volume) * N(i.harga_satuan), 0);
    const inst = instansiOtomatis(req, body.instansi_id);

    try {
      const notaId = await withTransaction(async (client) => {
        const nota = await client.query(INSERT_NOTA_SQL, [
          inst, noNota, tglNota, penyedia, total,
          S(body.no_sp2d), S(body.kontrak), S(body.sub_kegiatan),
          S(body.status_spj) || 'belum_dikumpulkan', S(body.created_by) || 'system',
        ]);

        const params = [nota.rows[0].id];
        const tuples = items.map((it) => {
          const volume = N(it.volume) || 1;
          const harga = N(it.harga_satuan);
          const n = params.length;
          params.push(S(it.barang_id), volume, harga, volume * harga);
          return `($${n}, $${n + 1}, $${n + 2}, $${n + 3})`;
        });
        await client.query(INSERT_DETAIL_SQL.replace('%VALUES%', tuples.join(', ')), params);
        await client.query(UPDATE_STOK_SQL, [nota.rows[0].id]);
        return nota.rows[0].id;
      });

      return res.json({ ok: true, message: 'Penerimaan berhasil disimpan.', id: notaId });
    } catch {
      // ROLLBACK sudah dilakukan withTransaction, jadi tidak ada nota yatim.
      return res.status(500).json({ ok: false, message: 'Gagal menyimpan penerimaan.' });
    }
  });

  // ── Riwayat pemeliharaan ──
  router.get('/pemeliharaan', async (req, res) => {
    try {
      const inst = instansiOtomatis(req, req.query?.instansi_id);
      const barang = S(req.query?.barang_id);
      const sql = PEMELIHARAAN_SQL.replace('%FILTER%', barang ? 'AND p.barang_id = $2' : '');
      const params = barang ? [inst, barang] : [inst];
      const { rows } = await query(sql, params);
      return res.json({ ok: true, data: rows });
    } catch {
      return res.status(500).json({ ok: false, message: 'Gagal memuat riwayat pemeliharaan.' });
    }
  });

  // ── Simpan pemeliharaan ──
  router.post('/pemeliharaan', async (req, res) => {
    const body = req.body || {};
    if (!S(body.barang_id) || !S(body.jenis_pemeliharaan)) {
      return res.status(400).json({ ok: false, message: 'barang_id dan jenis_pemeliharaan wajib diisi.' });
    }
    try {
      const inst = instansiOtomatis(req, body.instansi_id);
      const { rows } = await query(INSERT_PEMELIHARAAN_SQL, [
        inst, S(body.barang_id), S(body.tgl_pemeliharaan), S(body.jenis_pemeliharaan),
        BIAYA_MIN(body.biaya), S(body.nama_penyedia), S(body.bentuk_kontrak), S(body.keterangan),
      ]);
      return res.json({ ok: true, message: 'Pemeliharaan berhasil disimpan.', id: rows[0]?.id ?? null });
    } catch {
      return res.status(500).json({ ok: false, message: 'Gagal menyimpan pemeliharaan.' });
    }
  });

  // ── Daftar BKU ──
  router.get('/bku', async (req, res) => {
    try {
      const inst = instansiOtomatis(req, req.query?.instansi_id);
      const { rows } = await query(BKU_LIST_SQL, [inst]);
      return res.json({ ok: true, data: rows });
    } catch {
      return res.status(500).json({ ok: false, message: 'Gagal memuat data BKU.' });
    }
  });

  // ── Simpan BKU (satu baris atau bulk) ──
  router.post('/bku', async (req, res) => {
    const body = req.body || {};
    const rows = barisBKU(body);
    if (!rows.length) {
      return res.status(400).json({ ok: false, message: 'Data BKU kosong.' });
    }
    if (rows.length > BATAS_BKU) {
      return res.status(400).json({ ok: false, message: `Maksimal ${BATAS_BKU} baris per permintaan.` });
    }

    const inst = instansiOtomatis(req, body.instansi_id);
    // Default bulan/tahun mengikuti jam lokal server, sama seperti n8n. Pakai UTC
    // karena zona produksi Asia/Jakarta tidak diasumsikan di sini: yang penting
    // angka yang sama untuk satu request, dan angka itulah yang disimpan.
    const now = new Date();
    const bulanDefault = body.bulan || now.getUTCMonth() + 1;
    const tahunDefault = body.tahun || now.getUTCFullYear();

    try {
      const params = [];
      const tuples = rows.map((r) => {
        const n = params.length;
        params.push(
          inst,
          N(r.bulan) || bulanDefault,
          N(r.tahun) || tahunDefault,
          kosongkan(r.no_urut),
          kosongkan(r.tgl),
          S(r.uraian),
          S(r.kode_rekening),
          N(r.penerimaan),
          N(r.pengeluaran),
          N(r.saldo)
        );
        return `($${n + 1}, $${n + 2}, $${n + 3}, $${n + 4}, $${n + 5}, $${n + 6}, $${n + 7}, $${n + 8}, $${n + 9}, $${n + 10})`;
      });
      const { rows: out } = await query(INSERT_BKU_SQL.replace('%VALUES%', tuples.join(', ')), params);
      return res.json({ ok: true, message: 'BKU berhasil disimpan.', ids: out.map((r) => r.id) });
    } catch {
      return res.status(500).json({ ok: false, message: 'Gagal menyimpan BKU.' });
    }
  });

  // ── Kategori barang ──
  // Path native memakai nama path n8n (bukan REST bersih) supaya peta
  // NATIVE_TO_LEGACY di config.js mekanis dan tidak ambigu saat 30 endpoint
  // berikutnya ikut dipindah. "Delete" tetap POST karena simapoSubmit() di
  // frontend memang hardcoded POST; mengubahnya jadi DELETE menyentuh client
  // tanpa perlu.
  router.get('/kategori-list', async (req, res) => {
    try {
      const inst = instansiOtomatis(req, req.query?.instansi_id);
      const { rows } = await query(KATEGORI_LIST_SQL, [inst]);
      return res.json({ ok: true, data: rows[0]?.items ?? [] });
    } catch {
      return res.status(500).json({ ok: false, message: 'Gagal memuat daftar kategori.' });
    }
  });

  router.post('/kategori-save', async (req, res) => {
    const nama = S(req.body?.nama);
    if (!nama) return res.status(400).json({ ok: false, message: 'nama wajib diisi.' });
    try {
      const inst = instansiOtomatis(req, req.body?.instansi_id);
      const { rows } = await query(KATEGORI_SAVE_SQL, [nama, S(req.body?.deskripsi), inst]);
      return res.json({ ok: true, message: 'Kategori berhasil disimpan.', ...(rows[0] || {}) });
    } catch {
      return res.status(500).json({ ok: false, message: 'Gagal menyimpan kategori.' });
    }
  });

  router.post('/kategori-delete', async (req, res) => {
    const id = S(req.body?.id);
    if (!id) return res.status(400).json({ ok: false, message: 'id wajib diisi.' });
    try {
      const inst = instansiOtomatis(req, req.body?.instansi_id);
      const { rows } = await query(KATEGORI_DELETE_SQL, [id, inst]);
      if (!rows.length) return res.status(404).json({ ok: false, message: 'Kategori tidak ditemukan.' });
      return res.json({ ok: true, message: 'Kategori berhasil dihapus.', ...rows[0] });
    } catch {
      return res.status(500).json({ ok: false, message: 'Gagal menghapus kategori.' });
    }
  });

  // ── Katalog (daftar read-only, tanpa join kategori) ──
  router.get('/katalog', async (req, res) => {
    try {
      const inst = instansiOtomatis(req, req.query?.instansi_id);
      const { rows } = await query(KATALOG_SQL, [inst]);
      return res.json({ ok: true, data: rows[0]?.items ?? [] });
    } catch {
      return res.status(500).json({ ok: false, message: 'Gagal memuat katalog.' });
    }
  });

  // ── Master barang (CRUD admin) ──
  router.get('/admin-master-list', async (req, res) => {
    try {
      const inst = instansiOtomatis(req, req.query?.instansi_id);
      const { rows } = await query(MASTER_LIST_SQL, [inst]);
      return res.json({ ok: true, data: rows[0]?.items ?? [] });
    } catch {
      return res.status(500).json({ ok: false, message: 'Gagal memuat master barang.' });
    }
  });

  router.post('/admin-master-save', async (req, res) => {
    const body = req.body || {};
    if (!S(body.nama)) return res.status(400).json({ ok: false, message: 'Nama barang wajib diisi.' });
    const jenis = normalJenis(body.jenisbarang);
    const kategoriid = S(body.kategoriid) || null;
    try {
      const { rows } = await query(MASTER_SAVE_SQL, [
        S(body.id) || null,
        S(body.kodebarang) || buatKodeBarang(jenis, kategoriid),
        S(body.nama),
        jenis,
        S(body.satuan) || 'Unit',
        S(body.spesifikasi),
        S(body.foto),
        Math.max(0, N(body.stok_saat_ini)),
        Math.max(0, N(body.minimumstok)),
        Math.max(0, N(body.hargasatuan)),
        kategoriid,
        instansiOtomatis(req, body.instansi_id),
      ]);
      // RETURNING kosong berarti DO UPDATE kena WHERE dan baris milik instansi
      // lain:/id tidak ada. Jangan laporkan berhasil kalau tidak ada yang berubah.
      if (!rows.length) {
        return res.status(404).json({ ok: false, message: 'Barang tidak ditemukan atau bukan milik instansi ini.' });
      }
      return res.json({ ok: true, message: 'Barang berhasil disimpan.', ...rows[0] });
    } catch {
      return res.status(500).json({ ok: false, message: 'Gagal menyimpan barang.' });
    }
  });

  router.post('/admin-master-delete', async (req, res) => {
    const id = S(req.body?.id);
    if (!id) return res.status(400).json({ ok: false, message: 'id wajib diisi.' });
    try {
      const inst = instansiOtomatis(req, req.body?.instansi_id);
      const { rows } = await query(MASTER_DELETE_SQL, [id, inst]);
      if (!rows.length) return res.status(404).json({ ok: false, message: 'Barang tidak ditemukan.' });
      return res.json({ ok: true, message: 'Barang berhasil dihapus.', ...rows[0] });
    } catch {
      return res.status(500).json({ ok: false, message: 'Gagal menghapus barang.' });
    }
  });

  // ── Mutasi stok ──
  router.get('/mutasi-list', async (req, res) => {
    try {
      const inst = instansiOtomatis(req, req.query?.instansi_id);
      const { rows } = await query(MUTASI_LIST_SQL, [inst]);
      return res.json({ ok: true, data: rows[0]?.items ?? [] });
    } catch {
      return res.status(500).json({ ok: false, message: 'Gagal memuat riwayat mutasi.' });
    }
  });

  router.post('/mutasi-save', async (req, res) => {
    const body = req.body || {};
    // Frontend mengirim barang_id + jenis. Bentuk lama n8n (barangmasukid /
    // barangkeluarid) tetap diterima supaya tidak ada pemanggil yang ikut patah.
    const barangId = S(body.barang_id) || S(body.barangid)
      || S(body.barangmasukid) || S(body.barangkeluarid);
    const jumlah = Number(body.jumlah);

    if (!barangId) return res.status(400).json({ ok: false, message: 'barang_id wajib diisi.' });
    if (!Number.isInteger(jumlah) || jumlah < 1) {
      return res.status(400).json({ ok: false, message: 'jumlah harus bilangan bulat >= 1.' });
    }

    const inst = instansiOtomatis(req, body.instansi_id);
    const masuk = String(body.jenis || 'MASUK').toUpperCase() === 'MASUK';
    // RUSAK, TRANSFER, dan KELUAR semuanya mengurangi stok: sama dengan
    // perhitungan frontend di submitMutasiBarang.
    const delta = masuk ? jumlah : -jumlah;
    const dibuatOleh = S(req.user?.nip) || null;

    try {
      const hasil = await withTransaction(async (client) => {
        await client.query(MUTASI_INSERT_SQL, [
          masuk ? barangId : null,
          masuk ? null : barangId,
          dibuatOleh,
          jumlah,
          S(body.keterangan),
          inst,
        ]);
        const stok = await client.query(MUTASI_STOK_SQL, [barangId, delta, inst]);
        // RETURNING kosong = barang tidak ada, tidak aktif, atau milik instansi
        // lain. Lempar supaya rollback membatalkan mutasi yang baru ditulis;
        // kalau tidak, riwayat mutasi akan mencatat barang yang tak pernah
        // berubah stoknya.
        if (!stok.rows.length) {
          const e = new Error('barang tidak ditemukan');
          e.kode = 'BARANG_TIDAK_ADA';
          throw e;
        }
        return stok.rows[0];
      });

      return res.json({
        ok: true,
        message: masuk ? 'Barang masuk tersimpan.' : 'Barang keluar tersimpan.',
        ...hasil,
      });
    } catch (e) {
      if (e?.kode === 'BARANG_TIDAK_ADA') {
        return res.status(404).json({ ok: false, message: 'Barang tidak ditemukan atau bukan milik instansi ini.' });
      }
      return res.status(500).json({ ok: false, message: 'Gagal menyimpan mutasi.' });
    }
  });

  return router;
}