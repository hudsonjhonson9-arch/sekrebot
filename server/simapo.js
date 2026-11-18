import express from 'express';
import { buatKodeAset } from './kode-aset.js';
import {
  resolvePeriode,
  groupPermen47Rows,
  generatePermen47Excel,
  generateKartuPemeliharaanExcel,
} from './simapo-excel.js';

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
     (instansi_id, no_nota, tgl_nota, penyedia, total_nilai, no_sp2d, kontrak, sub_kegiatan, sub_kegiatan_uraian, status_spj, created_by)
   VALUES ($1, $2, $3::date, $4, $5, $6, $7, $8, $9, $10, $11)
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

// Item penerimaan diisi dari katalog standar harga, bukan dari master barang:
// hanya 7 dari 4856 nama standar harga punya padanan di "SIMAPO".barang. Karena
// itu item tanpa barang_id dicari dulu per nama pada instansi yang sama, lalu
// dibuatkan sebagai "Habis Pakai" kalau memang belum ada — penerimaan tidak boleh
// gagal hanya karena barangnya belum terdaftar di master.
export const CARI_BARANG_BY_NAMA_SQL =
  `SELECT id FROM "SIMAPO".barang
   WHERE instansi_id = $1 AND nama = $2
   ORDER BY createdat DESC
   LIMIT 1`;

export const BUAT_BARANG_PENERIMAAN_SQL =
  `INSERT INTO "SIMAPO".barang
     (id, kodebarang, nama, jenisbarang, satuan, spesifikasi, foto,
      stok_saat_ini, minimumstok, hargasatuan, kategoriid, isactive, createdat, updatedat, instansi_id)
   VALUES (gen_random_uuid()::text, $1, $2, 'Habis Pakai', $3, '', '', 0, 0, $4, NULL, true, NOW(), NOW(), $5)
   RETURNING id`;

// Daftar nota penerimaan untuk panel riwayat. Bentuknya array agar masuk ke
// parseApiResponse(); master (kodefikasi/rekening/barang) dikirim terpisah.
// `items` ikut dibawa agar form Edit bisa mengisi ulang rincian tanpa request
// kedua; kolom lain tidak berubah bentuk untuk konsumen lama.
export const PENERIMAAN_LIST_SQL =
  `   SELECT pb.id, pb.no_nota, TO_CHAR(pb.tgl_nota, 'YYYY-MM-DD') AS tgl_nota, pb.penyedia, pb.total_nilai,
          pb.no_sp2d, pb.kontrak, pb.sub_kegiatan, pb.sub_kegiatan_uraian, pb.status_spj, pb.created_by,
          TO_CHAR(pb.created_at, 'YYYY-MM-DD') AS created_at,
          (SELECT COALESCE(json_agg(i.*), '[]'::json) FROM (
             SELECT dp.barang_id, COALESCE(b.nama, '') AS nama_barang, COALESCE(b.kodebarang, '') AS kodebarang,
                    dp.volume, COALESCE(b.satuan, 'Unit') AS satuan, dp.harga_satuan,
                    dp.total_harga AS total
             FROM "SIMAPO".detail_penerimaan dp
             LEFT JOIN "SIMAPO".barang b ON b.id = dp.barang_id
             WHERE dp.penerimaan_id = pb.id
           ) i) AS items
   FROM "SIMAPO".penerimaan_barang pb
   WHERE pb.instansi_id = $1
   ORDER BY pb.tgl_nota DESC, pb.created_at DESC
   LIMIT 200`;

// ── Edit & hapus penerimaan ──
// Baris dikunci FOR UPDATE lebih dulu supaya dua edit bersamaan tidak sama-sama
// menghitung ulang stok; stok dikurangi memakai volume tersimpan, bukan payload.
export const PENERIMAAN_NOTA_SQL =
  `SELECT id FROM "SIMAPO".penerimaan_barang
   WHERE id = $1::uuid AND instansi_id = $2
   FOR UPDATE`;

export const PENERIMAAN_UPDATE_NOTA_SQL =
  `UPDATE "SIMAPO".penerimaan_barang
   SET no_nota = $3, tgl_nota = $4::date, penyedia = $5, total_nilai = $6,
       no_sp2d = $7, kontrak = $8, sub_kegiatan = $9, sub_kegiatan_uraian = $11,
       status_spj = $10, updated_at = NOW()
   WHERE id = $1::uuid AND instansi_id = $2
   RETURNING id`;

export const PENERIMAAN_DELETE_DETAIL_SQL =
  `DELETE FROM "SIMAPO".detail_penerimaan WHERE penerimaan_id = $1::uuid`;

export const PENERIMAAN_DELETE_SQL =
  `DELETE FROM "SIMAPO".penerimaan_barang
   WHERE id = $1::uuid AND instansi_id = $2
   RETURNING id`;

export const STOK_KURANG_SQL =
  `UPDATE "SIMAPO".barang b
   SET stok_saat_ini = GREATEST(COALESCE(b.stok_saat_ini, 0) - t.vol, 0), updatedat = NOW()
   FROM (
     SELECT barang_id, SUM(volume) AS vol
     FROM "SIMAPO".detail_penerimaan
     WHERE penerimaan_id = $1::uuid
     GROUP BY barang_id
   ) t
   WHERE b.id = t.barang_id
   RETURNING b.id`;

export const PEMELIHARAAN_SQL =
  `SELECT p.id, p.barang_id, b.nama AS nama_barang, b.kodebarang, b.spesifikasi, b.satuan,
          (SELECT COALESCE(u2."username", '') FROM "SIMAPO".unit_aset ua LEFT JOIN public.user_list u2 ON u2.id::text = ua.pegawai_id WHERE ua.barangid = p.barang_id AND ua.pegawai_id IS NOT NULL LIMIT 1) AS nama_pemegang,
          (SELECT ua.nomorinventaris FROM "SIMAPO".unit_aset ua WHERE ua.barangid = p.barang_id LIMIT 1) AS nomorinventaris,
          TO_CHAR(p.tgl_pemeliharaan, 'YYYY-MM-DD') AS tgl_pemeliharaan,
          p.jenis_pemeliharaan, p.biaya, p.nama_penyedia, p.bentuk_kontrak, p.keterangan
   FROM "SIMAPO".pemeliharaan p
   LEFT JOIN "SIMAPO".barang b ON b.id = p.barang_id
   WHERE p.instansi_id = $1 %FILTER%
   ORDER BY p.tgl_pemeliharaan DESC
   LIMIT 200`;

export const KARTU_PEMELIHARAAN_BARANG_SQL =
  `SELECT b.id, b.nama AS nama_barang, b.kodebarang, b.spesifikasi, b.satuan,
          (SELECT COALESCE(u2."username", '') FROM "SIMAPO".unit_aset ua LEFT JOIN public.user_list u2 ON u2.id::text = ua.pegawai_id WHERE ua.barangid = b.id AND ua.pegawai_id IS NOT NULL LIMIT 1) AS nama_pemegang,
          (SELECT ua.nomorinventaris FROM "SIMAPO".unit_aset ua WHERE ua.barangid = b.id LIMIT 1) AS nomorinventaris
   FROM "SIMAPO".barang b
   WHERE b.instansi_id = $1 %FILTER% AND b.isactive = true
   ORDER BY b.nama ASC`;

export const LAPORAN_PERMEN47_PENERIMAAN_SQL =
  `SELECT b.id AS barang_id, COALESCE(b.kodebarang, '') AS kodebarang, b.nama AS nama_barang,
          COALESCE(b.spesifikasi, '') AS spesifikasi, COALESCE(b.satuan, 'Unit') AS satuan,
          dp.volume AS jumlah, dp.harga_satuan, dp.total_harga AS total_nilai,
          COALESCE(NULLIF(pb.sub_kegiatan, ''), '') AS sub_kegiatan,
          COALESCE(NULLIF(pb.sub_kegiatan_uraian, ''), sk.nama, '') AS nama_sub_kegiatan,
          COALESCE(NULLIF(b.koderekening, ''), '') AS kode_rekening,
          COALESCE(rb.uraian, '') AS uraian_belanja,
          TO_CHAR(pb.tgl_nota, 'YYYY-MM-DD') AS tgl_nota,
          COALESCE(pb.penyedia, '') AS nama_penyedia,
          COALESCE(pb.kontrak, '') AS bentuk_kontrak,
          COALESCE(pb.no_sp2d, pb.no_nota, '') AS dokumen_sumber,
          COALESCE(kb.nama, '') AS nama_kategori
   FROM "SIMAPO".penerimaan_barang pb
   JOIN "SIMAPO".detail_penerimaan dp ON dp.penerimaan_id = pb.id
   JOIN "SIMAPO".barang b ON b.id = dp.barang_id
   LEFT JOIN "SIMAPO".kategori_barang kb ON kb.id = b.kategoriid
   LEFT JOIN "SIMAPO".subkegiatan sk ON sk.kode = NULLIF(pb.sub_kegiatan, '')
   LEFT JOIN "SIMAPO".rekening_belanja rb ON rb.kode = b.koderekening
   WHERE pb.instansi_id = $1
     AND pb.tgl_nota BETWEEN $2::date AND $3::date
   ORDER BY b.kodebarang, b.nama, pb.tgl_nota ASC`;

export const LAPORAN_PERMEN47_FALLBACK_SQL =
  `SELECT b.id AS barang_id, COALESCE(b.kodebarang, '') AS kodebarang, b.nama AS nama_barang,
          COALESCE(b.spesifikasi, '') AS spesifikasi, COALESCE(b.satuan, 'Unit') AS satuan,
          GREATEST(COALESCE(b.stok_saat_ini, 1), 1) AS jumlah,
          COALESCE(b.hargasatuan, 0) AS harga_satuan,
          (GREATEST(COALESCE(b.stok_saat_ini, 1), 1) * COALESCE(b.hargasatuan, 0)) AS total_nilai,
          '' AS sub_kegiatan, '' AS nama_sub_kegiatan,
          COALESCE(NULLIF(b.koderekening, ''), '') AS kode_rekening,
          COALESCE(rb.uraian, '') AS uraian_belanja,
          TO_CHAR(COALESCE(b.createdat, NOW()), 'YYYY-MM-DD') AS tgl_nota,
          '' AS nama_penyedia, '' AS bentuk_kontrak, '' AS dokumen_sumber,
          COALESCE(kb.nama, '') AS nama_kategori
   FROM "SIMAPO".barang b
   LEFT JOIN "SIMAPO".kategori_barang kb ON kb.id = b.kategoriid
   LEFT JOIN "SIMAPO".rekening_belanja rb ON rb.kode = b.koderekening
   WHERE b.instansi_id = $1
     AND b.isactive = true
     AND (
       b.jenisbarang ILIKE '%Pakai Habis%'
       OR b.jenisbarang ILIKE '%Habis Pakai%'
       OR b.kodebarang LIKE '1.1.7%'
       OR b.kodebarang LIKE 'HP-%'
     )
   ORDER BY b.kodebarang, b.nama ASC`;

export const INSERT_PEMELIHARAAN_SQL =
  `INSERT INTO "SIMAPO".pemeliharaan
     (instansi_id, barang_id, tgl_pemeliharaan, jenis_pemeliharaan, biaya, nama_penyedia, bentuk_kontrak, keterangan)
   VALUES ($1, $2, NULLIF($3, '')::date, $4, $5, $6, $7, $8)
   RETURNING id`;

// Edit & hapus kartu pemeliharaan: instansi ikut di WHERE supaya admin instansi
// lain tidak bisa menyentuh barisnya lewat id; nol baris → 404.
export const PEMELIHARAAN_UPDATE_SQL =
  `UPDATE "SIMAPO".pemeliharaan
   SET barang_id = $3, tgl_pemeliharaan = NULLIF($4, '')::date, jenis_pemeliharaan = $5,
       biaya = $6, nama_penyedia = $7, bentuk_kontrak = $8, keterangan = $9
   WHERE id = $1::uuid AND instansi_id = $2
   RETURNING id`;

export const PEMELIHARAAN_DELETE_SQL =
  `DELETE FROM "SIMAPO".pemeliharaan
   WHERE id = $1::uuid AND instansi_id = $2
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
            TO_CHAR(b.createdat, 'YYYY-MM-DD') AS createdat,
            (SELECT COALESCE(u2."username", '') FROM "SIMAPO".unit_aset ua LEFT JOIN public.user_list u2 ON u2.id::text = ua.pegawai_id WHERE ua.barangid = b.id AND ua.pegawai_id IS NOT NULL LIMIT 1) AS nama_pemegang,
            (SELECT ua.nomorinventaris FROM "SIMAPO".unit_aset ua WHERE ua.barangid = b.id AND ua.nomorinventaris IS NOT NULL LIMIT 1) AS nomorinventaris,
            (SELECT MIN(ua.tahunperolehan) FROM "SIMAPO".unit_aset ua WHERE ua.barangid = b.id) AS tahun_mulai,
            (SELECT MAX(ua.tahunperolehan) FROM "SIMAPO".unit_aset ua WHERE ua.barangid = b.id) AS tahun_selesai
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

// id dari body selalu diuji dulu: kolomnya uuid, dan 'abc' yang dilempar ke
// $1::uuid membuat Postgres melempar 22P02 yang berujung 500, bukan 400.
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export function idUuid(v) {
  return UUID_RE.test(String(v || '').trim());
}

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

// Resolusi barang untuk satu item penerimaan: barang_id menang; tanpa id, cari
// per nama pada instansi yang sama; kalau belum ada, buat baru sebagai "Habis
// Pakai" supaya pengadaan pakai habis tidak mentok hanya karena barang belum
// terdaftar. Error ditandai `code` supaya handler bisa menjawab 400, bukan 500.
async function barangIdUntukItem(client, inst, item) {
  const byId = S(item.barang_id);
  if (byId) return byId;

  const nama = S(item.nama_barang || item.nama);
  if (!nama) {
    const e = new Error('nama barang wajib diisi');
    e.code = 'NAMA_BARANG_KOSONG';
    throw e;
  }

  const { rows } = await client.query(CARI_BARANG_BY_NAMA_SQL, [inst, nama]);
  if (rows[0]?.id) return rows[0].id;

  const dibuat = await client.query(BUAT_BARANG_PENERIMAAN_SQL, [
    buatKodeBarang('Habis Pakai', item.kategoriid),
    nama,
    S(item.satuan) || 'Unit',
    N(item.harga_satuan),
    inst,
  ]);
  return dibuat.rows[0].id;
}

// Menulis seluruh rincian satu nota dalam satu statement multi-baris.
// penerimaan_id selalu $1 (uuid) dan empat kolom sisanya menyusul di belakangnya:
// tuple pertama ($1..$5), tuple kedua ($1, $6..$9), dan seterusnya. Bentuk lama
// hanya menulis empat placeholder sehingga Postgres menolak dengan 42601
// "INSERT has more target columns than expressions" dan setiap simpan jadi 500.
async function tulisDetailPenerimaan(client, inst, penerimaanId, items) {
  const params = [penerimaanId];
  const tuples = [];
  for (const it of items) {
    const volume = N(it.volume) || 1;
    const harga = N(it.harga_satuan);
    const barangId = await barangIdUntukItem(client, inst, it);
    const n = params.length;
    params.push(barangId, volume, harga, volume * harga);
    tuples.push(`($1, $${n + 1}, $${n + 2}, $${n + 3}, $${n + 4})`);
  }
  if (!tuples.length) return 0;
  await client.query(INSERT_DETAIL_SQL.replace('%VALUES%', tuples.join(', ')), params);
  return tuples.length;
}

// instances_id milik pemanggil bukan milik body: admin non-SUPERADMIN hanya boleh
// menyentuh baris instansi sendiri. SUPERADMIN boleh, karena memang adminsinistrasi
// lintas instansi.
export function instansiOtomatis(req, diminta) {
  if (req.user?.role === 'SUPERADMIN' && diminta) return S(diminta);
  return S(req.user?.user?.instansi_id || req.user?.instansi_id) || S(diminta) || INSTANSI_DEFAULT;
}

// Edit & hapus Laporan Pengadaan / Kartu Pemeliharaan: SUPERADMIN, ADMIN dan
// BENDAHARA BARANG. Role SIMAPO lain (KEPALA, SEKRETARIS, KABID, IRBAN) tetap
// boleh membuka menunya, hanya tidak boleh mengubah data.
export const ROLE_BOLEH_UBAH = new Set(['SUPERADMIN', 'ADMIN', 'BENDAHARA BARANG']);
export function bolehUbahSimapo(req) {
  return ROLE_BOLEH_UBAH.has(String(req.user?.role || '').trim().toUpperCase());
}
const PESAN_TANPA_HAK_UBAH = 'Hanya SUPERADMIN, ADMIN dan BENDAHARA BARANG yang boleh mengubah data ini.';

// Validasi penerimaan dipakai bersama oleh simpan (POST /penerimaan) dan ubah
// (POST /penerimaan-update): pesan galatnya harus identik supaya form tidak
// bersikap berbeda tergantung mode edit.
export function bacaPenerimaan(body) {
  const src = body || {};
  const items = Array.isArray(src.items) ? src.items : [];
  const data = {
    noNota: S(src.no_nota),
    tglNota: S(src.tgl_nota),
    penyedia: S(src.penyedia),
    noSp2d: S(src.no_sp2d),
    kontrak: S(src.kontrak),
    subKeg: S(src.sub_kegiatan),
    subKegUraian: S(src.sub_kegiatan_uraian),
    statusSpj: S(src.status_spj) || 'belum_dikumpulkan',
    createdBy: S(src.created_by) || 'system',
    items,
    total: 0,
  };
  if (!data.noNota || !data.tglNota || !data.penyedia || !items.length) {
    return { error: 'no_nota, tgl_nota, penyedia, dan items wajib diisi.' };
  }
  if (items.length > BATAS_BKU) {
    return { error: `Maksimal ${BATAS_BKU} item per permintaan.` };
  }
  // total_nilai hanya dipercaya kalau items benar-benar ada isinya; kalau tidak,
  // jumlahkan sendiri dari volume x harga supaya nota tidak bisa bernilai 0 atau
  // salah total hanya karena field yang dikirim tidak cocok.
  data.total = N(src.total_nilai) || items.reduce((s, i) => s + N(i.volume) * N(i.harga_satuan), 0);
  return data;
}

// Galat transaksi penerimaan selalu berujung di sini: rollback sudah dilakukan
// withTransaction, jadi tidak pernah ada nota setengah jadi.
function jawabGalatPenerimaan(res, err, label, pesan500 = 'Gagal menyimpan penerimaan.') {
  if (err?.code === 'TIDAK_ADA') {
    return res.status(404).json({ ok: false, message: 'Data penerimaan tidak ditemukan.' });
  }
  if (err?.code === 'NAMA_BARANG_KOSONG') {
    return res.status(400).json({ ok: false, message: 'Setiap item wajib punya nama barang.' });
  }
  if (err?.code === '23503') {
    return res.status(400).json({
      ok: false,
      message: 'Barang pada item tidak ditemukan di master barang. Periksa kembali nama barangnya.',
    });
  }
  console.error(label, err);
  return res.status(500).json({ ok: false, message: pesan500 });
}

// Kode lama menerima tiga bentuk kiriman: {rows:[...]}, satu objek, dan {uraian}
// tanpa rows (dipakai form BKU satu baris). Pertahankan ketiganya.
export function barisBKU(body) {
  const src = body?.rows ? body : (body?.body || body || {});
  let rows = Array.isArray(src.rows) ? src.rows : [];
  if (!rows.length && src.uraian) rows = [src];
  return rows;
}

// ── Sumber pemilihan Kegiatan/Sub Kegiatan di form penerimaan ──
// Pohon PKS bercadangan tahun (pks_kegiatan/pks_subkegiatan, kolom tahun) —
// beda dengan hierarki "SIMAPO".kegiatan yang tanpa dimensi tahun.
export const PKS_TAHUN_SQL =
  `SELECT t.tahun FROM pks_tahun t
   WHERE EXISTS (SELECT 1 FROM pks_program p WHERE p.tahun = t.tahun)
   ORDER BY t.tahun DESC`;

export const PKS_TREE_KEGIATAN_SQL =
  `SELECT k.id::text AS id, k.kode, k.nama, p.kode AS program_kode
   FROM pks_kegiatan k
   JOIN pks_program p ON p.id = k.program_id
   WHERE k.tahun = $1
   ORDER BY k.urutan, k.kode`;

export const PKS_TREE_SUBKEGIATAN_SQL =
  `SELECT s.id::text AS id, s.kegiatan_id::text AS kegiatan_id, s.kode, s.nama
   FROM pks_subkegiatan s
   WHERE s.tahun = $1
   ORDER BY s.urutan, s.kode`;

// Riwayat penyedia & bentuk kontrak untuk saran datalist: nilai pernah dipakai
// di penerimaan maupun kartu pemeliharaan, terbaru dulu, instansi pemanggil saja.
export const PENERIMAAN_RIWAYAT_SQL =
  `WITH src AS (
     SELECT TRIM(penyedia) AS penyedia, TRIM(kontrak) AS kontrak, created_at
     FROM "SIMAPO".penerimaan_barang WHERE instansi_id = $1
     UNION ALL
     SELECT TRIM(nama_penyedia), TRIM(bentuk_kontrak), created_at
     FROM "SIMAPO".pemeliharaan WHERE instansi_id = $1
   ),
   pen AS (
     SELECT penyedia AS v, MAX(created_at) AS terakhir FROM src
     WHERE penyedia IS NOT NULL AND penyedia <> '' GROUP BY penyedia
   ),
   kon AS (
     SELECT kontrak AS v, MAX(created_at) AS terakhir FROM src
     WHERE kontrak IS NOT NULL AND kontrak <> '' GROUP BY kontrak
   )
   SELECT (SELECT COALESCE(json_agg(v ORDER BY terakhir DESC, v), '[]'::json) FROM (SELECT * FROM pen LIMIT 50) p) AS penyedia,
          (SELECT COALESCE(json_agg(v ORDER BY terakhir DESC, v), '[]'::json) FROM (SELECT * FROM kon LIMIT 50) k) AS kontrak`;

export function createSimapoRouter({ query, withTransaction }) {
  const router = express.Router();

  // ── Penerimaan: daftar nota (data) + master kodefikasi/rekening/barang ──
  // Frontend memakai parseApiResponse() yang hanya mengenal array, jadi daftar
  // nota yang jadi `data`. Master dipisah ke `master` supaya konsumen lama yang
  // membaca objeknya tidak melihat data hilang.
  router.get('/penerimaan', async (req, res) => {
    try {
      const inst = instansiOtomatis(req, req.query?.instansi_id);
      const master = await query(MASTER_SQL, [inst]);
      const list = await query(PENERIMAAN_LIST_SQL, [inst]);
      return res.json({
        ok: true,
        data: list.rows,
        master: master.rows[0]?.data ?? {},
      });
    } catch {
      return res.status(500).json({ ok: false, message: 'Gagal memuat data penerimaan.' });
    }
  });

  // Daftar tahun PKS yang punya data; tahun berjalan disuntik agar select di
  // form selalu punya pilihan walaupun seed tahunan belum dijalankan.
  router.get('/pks-tahun', async (_req, res) => {
    try {
      const { rows } = await query(PKS_TAHUN_SQL, []);
      const now = new Date().getFullYear();
      const ada = rows.map((r) => Number(r.tahun));
      const suntik = [now + 1, now, now - 1].filter((y) => !ada.includes(y));
      return res.json([...ada, ...suntik]);
    } catch {
      return res.status(500).json({ ok: false, message: 'Gagal memuat daftar tahun PKS.' });
    }
  });

  // Pohon kegiatan + sub kegiatan untuk satu tahun (flatten supaya frontend
  // tinggal menyaring sub kegiatan lewat kegiatan_id).
  router.get('/pks-tree', async (req, res) => {
    const tahun = parseInt(req.query?.tahun, 10) || new Date().getFullYear();
    try {
      const [k, s] = await Promise.all([
        query(PKS_TREE_KEGIATAN_SQL, [tahun]),
        query(PKS_TREE_SUBKEGIATAN_SQL, [tahun]),
      ]);
      return res.json({ ok: true, tahun, data: { kegiatan: k.rows, subkegiatan: s.rows } });
    } catch {
      return res.status(500).json({ ok: false, message: 'Gagal memuat pohon PKS.' });
    }
  });

  // Saran penyedia & bentuk kontrak dari riwayat pencatatan (datalist, tetap
  // teks bebas — nilai baru yang belum pernah ada tetap boleh diketik manual).
  router.get('/penerimaan-riwayat', async (req, res) => {
    try {
      const inst = instansiOtomatis(req, req.query?.instansi_id);
      const { rows } = await query(PENERIMAAN_RIWAYAT_SQL, [inst]);
      return res.json({
        ok: true,
        data: { penyedia: rows[0]?.penyedia || [], kontrak: rows[0]?.kontrak || [] },
      });
    } catch {
      return res.status(500).json({ ok: false, message: 'Gagal memuat riwayat penyedia/kontrak.' });
    }
  });

  // ── Simpan penerimaan: nota + detail + update stok, satu transaksi ──
  router.post('/penerimaan', async (req, res) => {
    const baca = bacaPenerimaan(req.body);
    if (baca.error) {
      return res.status(400).json({ ok: false, message: baca.error });
    }
    const inst = instansiOtomatis(req, req.body?.instansi_id);

    try {
      const notaId = await withTransaction(async (client) => {
        const nota = await client.query(INSERT_NOTA_SQL, [
          inst, baca.noNota, baca.tglNota, baca.penyedia, baca.total,
          baca.noSp2d, baca.kontrak, baca.subKeg, baca.subKegUraian, baca.statusSpj, baca.createdBy,
        ]);
        await tulisDetailPenerimaan(client, inst, nota.rows[0].id, baca.items);
        await client.query(UPDATE_STOK_SQL, [nota.rows[0].id]);
        return nota.rows[0].id;
      });

      return res.json({ ok: true, message: 'Penerimaan berhasil disimpan.', id: notaId });
    } catch (err) {
      return jawabGalatPenerimaan(res, err, '[penerimaan/post]');
    }
  });

  // ── Ubah penerimaan: kunci baris, kembalikan stok lama, timpa nota + detail ──
  router.post('/penerimaan-update', async (req, res) => {
    if (!bolehUbahSimapo(req)) {
      return res.status(403).json({ ok: false, message: PESAN_TANPA_HAK_UBAH });
    }
    const body = req.body || {};
    const id = S(body.id);
    if (!idUuid(id)) {
      return res.status(400).json({ ok: false, message: 'id wajib diisi untuk mengubah penerimaan.' });
    }
    const baca = bacaPenerimaan(body);
    if (baca.error) {
      return res.status(400).json({ ok: false, message: baca.error });
    }
    const inst = instansiOtomatis(req, body.instansi_id);

    try {
      await withTransaction(async (client) => {
        const { rows: ada } = await client.query(PENERIMAAN_NOTA_SQL, [id, inst]);
        if (!ada.length) {
          const e = new Error('penerimaan tidak ditemukan');
          e.code = 'TIDAK_ADA';
          throw e;
        }
        // Stok dicopot dulu dari volume tersimpan, baru diganti volume baru:
        // menghitung delta dari payload membuat stok meleset saat volume berubah.
        await client.query(STOK_KURANG_SQL, [id]);
        await client.query(PENERIMAAN_DELETE_DETAIL_SQL, [id]);
        await client.query(PENERIMAAN_UPDATE_NOTA_SQL, [
          id, inst, baca.noNota, baca.tglNota, baca.penyedia, baca.total,
          baca.noSp2d, baca.kontrak, baca.subKeg, baca.statusSpj, baca.subKegUraian,
        ]);
        await tulisDetailPenerimaan(client, inst, id, baca.items);
        await client.query(UPDATE_STOK_SQL, [id]);
      });

      return res.json({ ok: true, message: 'Penerimaan berhasil diperbarui.', id });
    } catch (err) {
      return jawabGalatPenerimaan(res, err, '[penerimaan/update]');
    }
  });

  // ── Hapus penerimaan: stok dikembalikan dulu, lalu detail dan notanya ──
  router.post('/penerimaan-delete', async (req, res) => {
    if (!bolehUbahSimapo(req)) {
      return res.status(403).json({ ok: false, message: PESAN_TANPA_HAK_UBAH });
    }
    const id = S(req.body?.id);
    if (!idUuid(id)) {
      return res.status(400).json({ ok: false, message: 'id wajib diisi untuk menghapus penerimaan.' });
    }
    const inst = instansiOtomatis(req, req.body?.instansi_id);

    try {
      const dihapus = await withTransaction(async (client) => {
        const { rows: ada } = await client.query(PENERIMAAN_NOTA_SQL, [id, inst]);
        if (!ada.length) {
          const e = new Error('penerimaan tidak ditemukan');
          e.code = 'TIDAK_ADA';
          throw e;
        }
        await client.query(STOK_KURANG_SQL, [id]);
        await client.query(PENERIMAAN_DELETE_DETAIL_SQL, [id]);
        // FK detail_penerimaan.penerimaan_id tanpa ON DELETE CASCADE: detail
        // harus habis lebih dulu, baru notanya boleh dihapus.
        const { rows } = await client.query(PENERIMAAN_DELETE_SQL, [id, inst]);
        if (!rows.length) {
          const e = new Error('penerimaan tidak ditemukan');
          e.code = 'TIDAK_ADA';
          throw e;
        }
        return rows[0].id;
      });

      return res.json({ ok: true, message: 'Penerimaan dihapus.', id: dihapus });
    } catch (err) {
      return jawabGalatPenerimaan(res, err, '[penerimaan/delete]', 'Gagal menghapus penerimaan.');
    }
  });

  // ── Laporan Pengadaan Permen 47 (Data JSON) ──
  router.get('/laporan-permen47', async (req, res) => {
    try {
      const inst = instansiOtomatis(req, req.query?.instansi_id);
      const periode = S(req.query?.periode || 'TAHUNAN');
      const tahun = req.query?.tahun || new Date().getFullYear();
      const p = resolvePeriode(periode, tahun);

      let { rows } = await query(LAPORAN_PERMEN47_PENERIMAAN_SQL, [inst, p.startDate, p.endDate]);
      if (!rows || !rows.length) {
        const fallback = await query(LAPORAN_PERMEN47_FALLBACK_SQL, [inst]);
        rows = fallback.rows || [];
      }

      const grouped = groupPermen47Rows(rows);
      return res.json({
        ok: true,
        data: {
          periode: p.periode,
          tahun: p.tahun,
          instansi_id: inst,
          rows: grouped.hierarchicalRows,
          total_nilai: grouped.totalNilai,
        },
      });
    } catch {
      return res.status(500).json({ ok: false, message: 'Gagal memuat Laporan Pengadaan Permen 47.' });
    }
  });

  // ── Laporan Pengadaan Permen 47 (Download Excel .xlsx) ──
  router.get('/laporan-permen47/xlsx', async (req, res) => {
    try {
      const inst = instansiOtomatis(req, req.query?.instansi_id);
      const periode = S(req.query?.periode || 'TAHUNAN');
      const tahun = req.query?.tahun || new Date().getFullYear();
      const p = resolvePeriode(periode, tahun);

      let { rows } = await query(LAPORAN_PERMEN47_PENERIMAAN_SQL, [inst, p.startDate, p.endDate]);
      if (!rows || !rows.length) {
        const fallback = await query(LAPORAN_PERMEN47_FALLBACK_SQL, [inst]);
        rows = fallback.rows || [];
      }

      const grouped = groupPermen47Rows(rows);
      const buf = generatePermen47Excel({
        periode: p.periode,
        tahun: p.tahun,
        instansi_id: inst,
        rows: grouped.hierarchicalRows,
        total_nilai: grouped.totalNilai,
        instansi_nama: inst,
      });

      const filename = `Laporan_Pengadaan_Pakai_Habis_Permen47_${p.periode}_${p.tahun}.xlsx`;
      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
      if (typeof res.send === 'function') {
        return res.send(buf);
      }
      return res.end(buf);
    } catch {
      return res.status(500).json({ ok: false, message: 'Gagal membuat file Excel Laporan Permen 47.' });
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
    const barangId = body.barang_id;
    if (!S(barangId)) {
      return res.status(400).json({ ok: false, message: 'barang_id wajib diisi.' });
    }

    let items = [];
    if (Array.isArray(body.items) && body.items.length > 0) {
      items = body.items;
    } else if (body.jenis_pemeliharaan) {
      items = [body];
    } else {
      return res.status(400).json({ ok: false, message: 'barang_id dan jenis_pemeliharaan atau items wajib diisi.' });
    }

    // Validate each item has jenis_pemeliharaan
    for (const it of items) {
      if (!S(it.jenis_pemeliharaan)) {
        return res.status(400).json({ ok: false, message: 'Setiap item pemeliharaan harus memiliki jenis_pemeliharaan.' });
      }
    }

    try {
      const inst = instansiOtomatis(req, body.instansi_id);
      let insertedCount = 0;
      let lastId = null;
      const todayStr = new Date().toISOString().split('T')[0];

      for (const it of items) {
        const tgl = S(it.tgl_pemeliharaan) || todayStr;
        const { rows } = await query(INSERT_PEMELIHARAAN_SQL, [
          inst,
          S(barangId),
          tgl,
          S(it.jenis_pemeliharaan),
          BIAYA_MIN(it.biaya),
          S(it.nama_penyedia || it.penyedia),
          S(it.bentuk_kontrak || it.kontrak),
          S(it.keterangan),
        ]);
        insertedCount++;
        if (rows[0]?.id) lastId = rows[0].id;
      }

      return res.json({
        ok: true,
        message: 'Pemeliharaan berhasil disimpan.',
        count: insertedCount,
        id: lastId
      });
    } catch (err) {
      console.error('[pemeliharaan/post]', err);
      return res.status(500).json({ ok: false, message: 'Gagal menyimpan pemeliharaan.' });
    }
  });

  // ── Ubah & hapus kartu pemeliharaan (satu baris per permintaan) ──
  // Sama seperti simpan: role dibatasi, instansi ikut di WHERE, nol baris → 404.
  router.post('/pemeliharaan-update', async (req, res) => {
    if (!bolehUbahSimapo(req)) {
      return res.status(403).json({ ok: false, message: PESAN_TANPA_HAK_UBAH });
    }
    const body = req.body || {};
    const id = S(body.id);
    if (!idUuid(id)) {
      return res.status(400).json({ ok: false, message: 'id wajib diisi untuk mengubah data pemeliharaan.' });
    }
    const barangId = S(body.barang_id);
    if (!barangId) {
      return res.status(400).json({ ok: false, message: 'barang_id wajib diisi.' });
    }

    const items = Array.isArray(body.items) && body.items.length
      ? body.items
      : (body.jenis_pemeliharaan ? [body] : []);
    if (!items.length) {
      return res.status(400).json({ ok: false, message: 'jenis_pemeliharaan wajib diisi.' });
    }
    if (items.length > 1) {
      return res.status(400).json({ ok: false, message: 'Ubah data hanya menerima satu baris. Hapus baris tambahan terlebih dahulu.' });
    }
    const it = items[0];
    if (!S(it.jenis_pemeliharaan)) {
      return res.status(400).json({ ok: false, message: 'Setiap item pemeliharaan harus memiliki jenis_pemeliharaan.' });
    }

    try {
      const inst = instansiOtomatis(req, body.instansi_id);
      const { rows } = await query(PEMELIHARAAN_UPDATE_SQL, [
        id, inst, barangId, S(it.tgl_pemeliharaan) || new Date().toISOString().split('T')[0],
        S(it.jenis_pemeliharaan), BIAYA_MIN(it.biaya),
        S(it.nama_penyedia || it.penyedia), S(it.bentuk_kontrak || it.kontrak), S(it.keterangan),
      ]);
      if (!rows.length) {
        return res.status(404).json({ ok: false, message: 'Data pemeliharaan tidak ditemukan.' });
      }
      return res.json({ ok: true, message: 'Data pemeliharaan berhasil diubah.', id: rows[0].id });
    } catch (err) {
      console.error('[pemeliharaan/update]', err);
      return res.status(500).json({ ok: false, message: 'Gagal mengubah data pemeliharaan.' });
    }
  });

  router.post('/pemeliharaan-delete', async (req, res) => {
    if (!bolehUbahSimapo(req)) {
      return res.status(403).json({ ok: false, message: PESAN_TANPA_HAK_UBAH });
    }
    const id = S(req.body?.id);
    if (!idUuid(id)) {
      return res.status(400).json({ ok: false, message: 'id wajib diisi untuk menghapus data pemeliharaan.' });
    }

    try {
      const inst = instansiOtomatis(req, req.body?.instansi_id);
      const { rows } = await query(PEMELIHARAAN_DELETE_SQL, [id, inst]);
      if (!rows.length) {
        return res.status(404).json({ ok: false, message: 'Data pemeliharaan tidak ditemukan.' });
      }
      return res.json({ ok: true, message: 'Data pemeliharaan dihapus.', id: rows[0].id });
    } catch (err) {
      console.error('[pemeliharaan/delete]', err);
      return res.status(500).json({ ok: false, message: 'Gagal menghapus data pemeliharaan.' });
    }
  });

router.get('/kartu-pemeliharaan/xlsx', async (req, res) => {
    try {
      const inst = instansiOtomatis(req, req.query?.instansi_id);
      const barangId = S(req.query?.barang_id);
      const tahun = req.query?.tahun ? Number(req.query.tahun) : null;

      let maintFilter = '';
      const maintParams = [inst];
      if (barangId && barangId !== 'ALL') {
        maintParams.push(barangId);
        maintFilter += ` AND p.barang_id = $${maintParams.length}`;
      }
      if (tahun && Number.isInteger(tahun)) {
        maintParams.push(tahun);
        maintFilter += ` AND EXTRACT(YEAR FROM p.tgl_pemeliharaan) = $${maintParams.length}`;
      }

      const maintSql = PEMELIHARAAN_SQL.replace('%FILTER%', maintFilter);
      const { rows: maintRows } = await query(maintSql, maintParams);

      let barangFilter = '';
      const barangParams = [inst];
      if (barangId && barangId !== 'ALL') {
        barangParams.push(barangId);
        barangFilter += ` AND b.id = $${barangParams.length}`;
      }
      const barangSql = KARTU_PEMELIHARAAN_BARANG_SQL.replace('%FILTER%', barangFilter);
      const { rows: barangRows } = await query(barangSql, barangParams);

      const cardMap = new Map();
      (barangRows || []).forEach((b) => {
        cardMap.set(b.id, {
          nama_barang: b.nama_barang,
          nama_pemegang: b.nama_pemegang,
          kodebarang: b.kodebarang,
          spesifikasi: b.spesifikasi,
          nomorinventaris: b.nomorinventaris,
          items: [],
        });
      });

      (maintRows || []).forEach((m) => {
        const bid = m.barang_id || 'UNKNOWN';
        if (!cardMap.has(bid)) {
          cardMap.set(bid, {
            nama_barang: m.nama_barang,
            nama_pemegang: m.nama_pemegang,
            kodebarang: m.kodebarang,
            spesifikasi: m.spesifikasi,
            nomorinventaris: m.nomorinventaris,
            items: [],
          });
        }
        cardMap.get(bid).items.push(m);
      });

      let cards = [];
      if (barangId && barangId !== 'ALL') {
        const c = cardMap.get(barangId);
        cards = c ? [c] : [];
      } else {
        cards = Array.from(cardMap.values()).filter((c) => c.items.length > 0);
        if (!cards.length) {
          cards = Array.from(cardMap.values()).slice(0, 10);
        }
      }

      const buf = generateKartuPemeliharaanExcel({
        cards,
        instansi_nama: inst,
        tahun,
      });

      const filePrefix = barangId && barangId !== 'ALL' ? barangId : 'ALL';
      const fileTahun = tahun || 'SEMUA';
      const filename = `Kartu_Pemeliharaan_${filePrefix}_${fileTahun}.xlsx`;

      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
      if (typeof res.send === 'function') {
        return res.send(buf);
      }
      return res.end(buf);
    } catch {
      return res.status(500).json({ ok: false, message: 'Gagal membuat file Excel Kartu Pemeliharaan.' });
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
      // Best-effort: beri kode aset unik pada unit baru yang belum punya.
      try {
        const ka = buatKodeAset({
          nama: S(body.nama), kodeBarang: S(body.kodebarang) || undefined,
          tahun: new Date().getFullYear(), harga: N(body.hargasatuan),
        });
        await query(`UPDATE "SIMAPO".unit_aset SET kode_aset=$1 WHERE barangid=$2 AND (kode_aset IS NULL OR kode_aset='')`, [ka, rows[0].id]);
      } catch { /* kode_aset diisi ulang oleh scripts/gen-kode-aset.mjs bila gagal */ }
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