/**
 * Mounts Stitch aset & arsip routes (`/aset/*` and `/arsip/mobile-data`) on the given router.
 */
export function mountStitchAsetArsipRoutes(router, ctx) {
  const { query } = ctx;

  // 10. ASET & SIMAPO: List barang with rich details
  router.get('/aset/barang', async (req, res) => {
    try {
      const { rows } = await query(`
        SELECT b.id, b.nama AS nama_barang, b.kodebarang, b.spesifikasi, b.satuan, b.stok_saat_ini,
               COALESCE((SELECT ua.nomorinventaris FROM "SIMAPO".unit_aset ua WHERE ua.barangid = b.id LIMIT 1), b.kodebarang) AS nomorinventaris,
               COALESCE((SELECT r.nama FROM "SIMAPO".ruangan r JOIN "SIMAPO".unit_aset ua ON ua.ruangan_id = r.id WHERE ua.barangid = b.id LIMIT 1), 'Ruang BAPPERIDA') AS nama_ruangan,
               COALESCE((SELECT ua.kondisi FROM "SIMAPO".unit_aset ua WHERE ua.barangid = b.id LIMIT 1), 'Baik') AS kondisi
        FROM "SIMAPO".barang b
        WHERE b.instansi_id = 'bapperida' OR b.instansi_id IS NULL
        ORDER BY b.nama ASC
        LIMIT 100
      `);
      return res.json({ ok: true, data: rows });
    } catch (err) {
      console.error('[stitch-api] aset/barang error:', err);
      return res.status(500).json({ ok: false, message: 'Gagal memuat barang aset: ' + err.message });
    }
  });

  // 11. ASET & SIMAPO: Riwayat Pemeliharaan & Form Save
  router.get('/aset/pemeliharaan', async (req, res) => {
    try {
      const { rows } = await query(`
        SELECT p.id, p.barang_id, b.nama AS nama_barang, b.kodebarang, b.spesifikasi,
               p.tgl_pemeliharaan, p.jenis_pemeliharaan, p.biaya, p.nama_penyedia, p.bentuk_kontrak, p.keterangan
        FROM "SIMAPO".pemeliharaan p
        LEFT JOIN "SIMAPO".barang b ON b.id = p.barang_id
        WHERE p.instansi_id = 'bapperida' OR p.instansi_id IS NULL
        ORDER BY p.tgl_pemeliharaan DESC
        LIMIT 50
      `);
      return res.json({ ok: true, data: rows });
    } catch (err) {
      console.error('[stitch-api] aset/pemeliharaan error:', err);
      return res.status(500).json({ ok: false, message: 'Gagal memuat pemeliharaan: ' + err.message });
    }
  });

  router.post('/aset/pemeliharaan', async (req, res) => {
    try {
      const b = req.body || {};
      const barangId = String(b.barang_id || '').trim();
      const jenis = String(b.jenis_pemeliharaan || 'Perbaikan Rutin').trim();
      const tgl = b.tgl_pemeliharaan || new Date().toISOString().slice(0, 10);
      const biaya = parseInt(b.biaya || '0', 10);
      const penyedia = String(b.nama_penyedia || 'CV. Sumba Mandiri').trim();
      const kontrak = String(b.bentuk_kontrak || 'SPK').trim();
      const ket = String(b.keterangan || '').trim();

      if (!barangId) return res.status(400).json({ ok: false, message: 'Barang Aset wajib dipilih.' });

      const { rows } = await query(`
        INSERT INTO "SIMAPO".pemeliharaan
          (instansi_id, barang_id, tgl_pemeliharaan, jenis_pemeliharaan, biaya, nama_penyedia, bentuk_kontrak, keterangan)
        VALUES ('bapperida', $1, NULLIF($2, '')::date, $3, $4, $5, $6, $7)
        RETURNING id
      `, [barangId, tgl, jenis, biaya, penyedia, kontrak, ket]);

      return res.json({ ok: true, message: 'Kartu pemeliharaan berhasil dicatat di PostgreSQL.', id: rows[0]?.id });
    } catch (err) {
      console.error('[stitch-api] aset/pemeliharaan save error:', err);
      return res.status(500).json({ ok: false, message: 'Gagal mencatat pemeliharaan: ' + err.message });
    }
  });

  // 12. MOBILE REAL ASET DATA (SIMAPO & KIR)
  router.get('/aset/mobile-data', async (req, res) => {
    try {
      const nip = String(req.query.nip || '').trim();
      const userId = String(req.query.userId || '').trim();

      const [kondisiRes, pRes, opRes, katRes] = await Promise.all([
        query(`
          SELECT kondisi, count(*)::int AS count 
          FROM "SIMAPO".unit_aset 
          GROUP BY kondisi
        `),
        (nip || userId)
          ? query(`
              SELECT ua.id, ua.nomorinventaris, ua.kondisi, ua.merk_type, ua.tahunperolehan, 
                     ua.nilaiperolehan, ua.no_polisi, ua.kib, ua.kode_aset, ua.qrcode,
                     b.nama AS nama_barang, b.kodebarang, b.spesifikasi, b.satuan,
                     r.nama AS nama_ruangan,
                     'Dipegang Pribadi' AS status_pemegang
              FROM "SIMAPO".unit_aset ua
              JOIN "SIMAPO".barang b ON b.id = ua.barangid
              LEFT JOIN "SIMAPO".ruangan r ON r.id = ua.ruangan_id
              WHERE ua.pegawai_id = $1 OR ua.pegawai_id = $2
              ORDER BY ua.tahunperolehan DESC, b.nama ASC
            `, [nip, userId])
          : Promise.resolve({ rows: [] }),
        query(`
          SELECT ua.id, ua.nomorinventaris, ua.kondisi, ua.merk_type, ua.tahunperolehan, 
                 ua.nilaiperolehan, ua.no_polisi, ua.kib, ua.kode_aset, ua.qrcode,
                 b.nama AS nama_barang, b.kodebarang, b.spesifikasi, b.satuan,
                 COALESCE(r.nama, 'Operasional BAPPERIDA') AS nama_ruangan,
                 'Operasional Bersama / Kendaraan Dinas' AS status_pemegang
          FROM "SIMAPO".unit_aset ua
          JOIN "SIMAPO".barang b ON b.id = ua.barangid
          LEFT JOIN "SIMAPO".ruangan r ON r.id = ua.ruangan_id
          WHERE (ua.no_polisi IS NOT NULL AND ua.no_polisi != '')
             OR b.nama ILIKE '%motor%' OR b.nama ILIKE '%mobil%'
          ORDER BY ua.tahunperolehan DESC
          LIMIT 4
        `),
        query(`
          SELECT ua.id, ua.nomorinventaris, ua.kondisi, ua.merk_type, ua.tahunperolehan, 
                 ua.nilaiperolehan, ua.no_polisi, ua.kib, ua.kode_aset,
                 b.nama AS nama_barang, b.kodebarang, b.spesifikasi,
                 r.nama AS nama_ruangan
          FROM "SIMAPO".unit_aset ua
          JOIN "SIMAPO".barang b ON b.id = ua.barangid
          LEFT JOIN "SIMAPO".ruangan r ON r.id = ua.ruangan_id
          ORDER BY b.nama ASC
          LIMIT 40
        `),
      ]);

      let totalUnit = 0;
      let kondisiBaik = 0;
      let kondisiKurang = 0;
      let kondisiRusak = 0;
      for (const row of kondisiRes.rows) {
        const cnt = Number(row.count) || 0;
        totalUnit += cnt;
        const k = (row.kondisi || '').toLowerCase();
        if (k.includes('baik') && !k.includes('kurang')) kondisiBaik += cnt;
        else if (k.includes('kurang')) kondisiKurang += cnt;
        else if (k.includes('rusak')) kondisiRusak += cnt;
      }
      const persenBaik = totalUnit > 0 ? ((kondisiBaik / totalUnit) * 100).toFixed(1) + '%' : '100%';

      // Personal assets assigned to this employee
      const personalAssets = [...pRes.rows];

      // If user has fewer than 3 personal assets, also fetch BAPPERIDA shared / operational vehicle assets
      if (personalAssets.length < 3) {
        // Append operational assets avoiding duplicates
        const existingIds = new Set(personalAssets.map(a => a.id));
        for (const op of opRes.rows) {
          if (!existingIds.has(op.id)) {
            personalAssets.push(op);
            existingIds.add(op.id);
          }
        }
      }

      return res.json({
        ok: true,
        stats: {
          totalUnit,
          kondisiBaik,
          kondisiKurang,
          kondisiRusak,
          persenBaik,
          userHeldCount: personalAssets.filter(a => a.status_pemegang === 'Dipegang Pribadi').length || personalAssets.length
        },
        personalAssets,
        katalogAssets: katRes.rows
      });
    } catch (err) {
      console.error('[stitch-api] aset/mobile-data error:', err);
      return res.status(500).json({ ok: false, message: 'Gagal memuat data aset mobile: ' + err.message });
    }
  });

  // 12B. SCAN & CARI ASET BERDASARKAN QR / BARCODE / KODE / NOPOL
  router.get('/aset/scan', async (req, res) => {
    try {
      let q = String(req.query.q || '').trim();
      if (!q) {
        return res.status(400).json({ ok: false, message: 'Parameter q wajib diisi.' });
      }

      // Normalisasi jika q berbentuk URL atau prefix SIMAPO-
      if (q.includes('qr=')) {
        const m = q.match(/[?&]qr=([^&]+)/);
        if (m) q = decodeURIComponent(m[1]);
      }
      if (q.startsWith('SIMAPO-')) {
        q = q.slice(7);
      }

      const cleanQ = q.replace(/\s+/g, ' ');
      const noSpaceQ = q.replace(/\s+/g, '');

      const sql = `
        SELECT ua.id, ua.nomorinventaris, ua.kondisi, ua.merk_type, ua.tahunperolehan, 
               ua.nilaiperolehan, ua.no_polisi, ua.kib, ua.kode_aset, ua.qrcode,
               b.nama AS nama_barang, b.kodebarang, b.spesifikasi, b.satuan,
               COALESCE(r.nama, 'Operasional BAPPERIDA') AS nama_ruangan,
               COALESCE(u.username, 'Inventaris Umum BAPPERIDA') AS nama_pegawai,
               CASE 
                 WHEN ua.pegawai_id IS NOT NULL AND ua.pegawai_id != '' THEN 'Dipegang ASN'
                 ELSE 'Operasional Bersama'
               END AS status_pemegang
        FROM "SIMAPO".unit_aset ua
        JOIN "SIMAPO".barang b ON b.id = ua.barangid
        LEFT JOIN "SIMAPO".ruangan r ON r.id = ua.ruangan_id
        LEFT JOIN user_list u ON u."NIP" = ua.pegawai_id
        WHERE ua.id::text = $1
           OR ua.kode_aset ILIKE $2
           OR ua.nomorinventaris ILIKE $2
           OR ua.no_polisi ILIKE $2
           OR REPLACE(COALESCE(ua.no_polisi, ''), ' ', '') ILIKE $3
           OR ua.qrcode ILIKE $2
           OR b.nama ILIKE $2
        ORDER BY 
          CASE WHEN ua.id::text = $1 THEN 1 ELSE 2 END,
          ua.tahunperolehan DESC
        LIMIT 1
      `;

      const result = await query(sql, [q, `%${cleanQ}%`, `%${noSpaceQ}%`]);
      if (result.rows.length > 0) {
        return res.json({ ok: true, asset: result.rows[0] });
      } else {
        return res.status(404).json({ ok: false, message: `Aset dengan kode "${q}" tidak ditemukan di SIMAPO.` });
      }
    } catch (err) {
      console.error('[stitch-api] aset/scan error:', err);
      return res.status(500).json({ ok: false, message: 'Gagal mencari aset: ' + err.message });
    }
  });

  // 13. TIKET KERUSAKAN / LAPOR KENDALA ASET
  router.post('/aset/tiket', async (req, res) => {
    try {
      const b = req.body || {};
      const judul = String(b.judul || 'Laporan Kerusakan Aset').trim();
      const deskripsi = String(b.deskripsi || '').trim();
      const prioritas = String(b.prioritas || 'Sedang').trim();
      const userid = String(b.userid || b.nip || '').trim();
      const lokasi = String(b.lokasi || 'Kantor BAPPERIDA').trim();

      if (!deskripsi) {
        return res.status(400).json({ ok: false, message: 'Deskripsi kendala wajib diisi.' });
      }

      const id = 'TKT-' + Date.now().toString(36).toUpperCase() + '-' + Math.floor(Math.random() * 1000);
      const nomortiket = 'TKT/' + new Date().getFullYear() + '/' + Math.floor(1000 + Math.random() * 9000);

      await query(`
        INSERT INTO "SIMAPO".tiket_kerusakan
          (id, nomortiket, userid, judul, deskripsi, prioritas, lokasi, status, instansi_id, createdat, updatedat)
        VALUES
          ($1, $2, $3, $4, $5, $6, $7, 'Menunggu Penanganan', 'bapperida', NOW(), NOW())
      `, [id, nomortiket, userid, judul, deskripsi, prioritas, lokasi]);

      return res.json({
        ok: true,
        message: `Tiket perbaikan berhasil dibuat dengan nomor ${nomortiket}.`,
        nomortiket
      });
    } catch (err) {
      console.error('[stitch-api] aset/tiket error:', err);
      return res.status(500).json({ ok: false, message: 'Gagal membuat tiket kerusakan: ' + err.message });
    }
  });

  // 14. PEMINJAMAN ASET
  router.post('/aset/pinjam', async (req, res) => {
    try {
      const b = req.body || {};
      const unitasetid = String(b.unitasetid || '').trim();
      const keperluan = String(b.keperluan || '').trim();
      const tglMulai = b.tgl_mulai || new Date().toISOString().slice(0, 10);
      const tglSelesai = b.tgl_selesai || new Date().toISOString().slice(0, 10);
      const userid = String(b.userid || b.nip || '').trim();

      if (!unitasetid) return res.status(400).json({ ok: false, message: 'Unit aset wajib dipilih.' });
      if (!keperluan) return res.status(400).json({ ok: false, message: 'Keperluan peminjaman wajib diisi.' });

      const id = 'PJM-' + Date.now().toString(36).toUpperCase() + '-' + Math.floor(Math.random() * 1000);
      const nomorpeminjaman = 'PJM/' + new Date().getFullYear() + '/' + Math.floor(1000 + Math.random() * 9000);

      await query(`
        INSERT INTO "SIMAPO".peminjaman
          (id, nomorpeminjaman, userid, unitasetid, tujuanpeminjaman, tanggalmulai, tanggalselesai, status, kondisiawal, instansi_id, createdat, updatedat)
        VALUES
          ($1, $2, $3, $4, $5, $6::timestamp, $7::timestamp, 'Menunggu Persetujuan', 'Baik', 'bapperida', NOW(), NOW())
      `, [id, nomorpeminjaman, userid, unitasetid, keperluan, tglMulai + ' 08:00:00', tglSelesai + ' 17:00:00']);

      return res.json({
        ok: true,
        message: `Permohonan pinjam berhasil diajukan dengan nomor ${nomorpeminjaman}.`,
        nomorpeminjaman
      });
    } catch (err) {
      console.error('[stitch-api] aset/pinjam error:', err);
      return res.status(500).json({ ok: false, message: 'Gagal mengajukan peminjaman: ' + err.message });
    }
  });

  // 15. MOBILE REAL ARSIP DATA (bapperida_dokumen)
  router.get('/arsip/mobile-data', async (req, res) => {
    try {
      const kategori = String(req.query.kategori || '').trim();
      const search = String(req.query.q || '').trim();

      let sql = `
        SELECT
          d.id,
          d.judul AS title,
          d.kategori AS type,
          d.tipe AS sector,
          COALESCE(d.file_type, 'PDF') AS "fileType",
          TO_CHAR(d.tanggal, 'YYYY') AS year,
          d.status,
          COALESCE(d.uploader_id, '') AS "uploaderId",
          COALESCE(u.username, d.uploader_id, 'Admin BAPPERIDA') AS uploader,
          COALESCE(d."desc", '') AS "desc",
          COALESCE(d.nomor_dokumen, '') AS "nomorDokumen",
          TO_CHAR(d.tanggal, 'DD Mon YYYY') AS "tanggalDokumen",
          COALESCE(d.ukuran, '1.2 MB') AS size,
          d.url,
          d.files,
          COALESCE(d.bidang, '') AS bidang,
          COALESCE(d.tags, '') AS tags,
          d.publik
        FROM bapperida_dokumen d
        LEFT JOIN user_list u ON u."NIP" = d.uploader_id
        WHERE 1=1
      `;
      const params = [];
      let idx = 1;

      if (kategori && kategori !== 'Semua') {
        sql += ` AND d.kategori = $${idx++}`;
        params.push(kategori);
      }

      if (search) {
        sql += ` AND (d.judul ILIKE $${idx} OR d.nomor_dokumen ILIKE $${idx})`;
        params.push(`%${search}%`);
        idx++;
      }

      sql += ` ORDER BY d.id DESC LIMIT 200`;

      const [{ rows }, countRes, katRes] = await Promise.all([
        query(sql, params),
        query('SELECT count(*)::int AS total FROM bapperida_dokumen'),
        query(`
          SELECT kategori, count(*)::int AS count
          FROM bapperida_dokumen
          WHERE kategori IS NOT NULL AND kategori != ''
          GROUP BY kategori
          ORDER BY count DESC
          LIMIT 8
        `),
      ]);
      const totalDocs = countRes.rows[0]?.total || 0;
      const parsedDocs = rows.map((row) => {
        let files = [];
        if (row.files) {
          try {
            const f = typeof row.files === 'string' ? JSON.parse(row.files) : row.files;
            if (Array.isArray(f)) files = f;
          } catch (_) {
            files = [];
          }
        }
        return { ...row, files };
      });

      return res.json({
        ok: true,
        stats: {
          totalDocs,
          storageDisplay: '14.8 GB / Cloud Storage BAPPERIDA',
          storagePercent: 29.6,
          kategoriBreakdown: katRes.rows
        },
        documents: parsedDocs
      });
    } catch (err) {
      console.error('[stitch-api] arsip/mobile-data error:', err);
      return res.status(500).json({ ok: false, message: 'Gagal memuat data arsip: ' + err.message });
    }
  });
}
