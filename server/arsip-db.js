// Direct PostgreSQL handler & fallback for Arsip endpoints
// (Dokumen, Bank Data, PKS, Agenda Surat Masuk/Keluar, SPPD, dan Master Data).
// Digunakan saat proxy upstream (peta-ekonomi) mengembalikan 401 (auth mismatch /
// secret mismatch / session expired), 502/503 (upstream down), atau saat koneksi gagal.

const BIDANG_BANKDATA = [3, 4, 5];

const BD_CONF = {
  iku: { valA: 'target', valB: 'capaian' },
  ikk: { valA: 'target', valB: 'capaian' },
  sektoral: { valA: null, valB: null },
};

function parseQuery(url) {
  const i = url.indexOf('?');
  if (i === -1) return { pathname: url, query: {} };
  const pathname = url.slice(0, i);
  const search = url.slice(i + 1);
  const query = {};
  for (const pair of search.split('&')) {
    if (!pair) continue;
    const [k, v] = pair.split('=');
    query[decodeURIComponent(k)] = decodeURIComponent((v || '').replace(/\+/g, ' '));
  }
  return { pathname, query };
}

export async function handleArsipDbRequest(req, res, target, doQuery) {
  const { pathname, query } = parseQuery(target);
  const method = req.method;

  // 1. Dokumen (/api/docs*)
  if (pathname === '/api/docs' && method === 'GET') {
    try {
      const { rows } = await doQuery(`
        SELECT
          id,
          judul                               AS title,
          kategori                            AS type,
          tipe                                AS sector,
          file_type                           AS "fileType",
          TO_CHAR(tanggal, 'YYYY')            AS year,
          status,
          COALESCE(uploader_id, '')           AS "uploaderId",
          COALESCE(
            (SELECT up.username FROM user_list up
              WHERE up."NIP" = bapperida_dokumen.uploader_id LIMIT 1),
            uploader_id, ''
          )                                   AS uploader,
          COALESCE("desc", '')                AS "desc",
          COALESCE(tags, '')                  AS "tagsRaw",
          COALESCE(nomor_dokumen, '')         AS "nomorDokumen",
          TO_CHAR(tanggal_dokumen, 'DD Mon YYYY') AS "tanggalDokumen",
          COALESCE(versi, 1)                  AS versi,
          COALESCE(reviewed_by, '—')          AS "reviewedBy",
          COALESCE(review_note, '')           AS "reviewNote",
          ukuran                              AS size,
          COALESCE(pages, 0)                  AS pages,
          TO_CHAR(tanggal, 'DD Mon YYYY')     AS "uploadDate",
          url,
          files,
          icon_data,
          COALESCE(publik, false)             AS publik,
          COALESCE(bidang, '')                AS bidang,
          index_status                        AS "indexStatus"
        FROM bapperida_dokumen
        ORDER BY id DESC
      `);
      const docs = rows.map((d) => {
        let files = [];
        if (d.files) {
          try { files = typeof d.files === 'string' ? JSON.parse(d.files) : d.files; }
          catch (_) { files = []; }
        }
        const tags = d.tagsRaw ? d.tagsRaw.split(',').map((t) => t.trim()).filter(Boolean) : [];
        return { ...d, files, tags };
      });
      res.json(docs);
      return true;
    } catch (err) {
      console.error('[arsip-db] /api/docs error:', err);
      res.status(500).json({ error: 'Gagal mengambil dokumen' });
      return true;
    }
  }

  const mDocHist = pathname.match(/^\/api\/docs\/([^/]+)\/history$/);
  if (mDocHist && method === 'GET') {
    const docId = mDocHist[1];
    try {
      const { rows } = await doQuery(
        `SELECT id, doc_id, action, from_status, to_status, actor_id, actor_name, note,
                TO_CHAR(created_at, 'DD Mon YYYY HH24:MI') AS created_at
         FROM doc_history WHERE doc_id = $1 ORDER BY created_at ASC`,
        [docId]
      );
      res.json(rows);
      return true;
    } catch (err) {
      console.error('[arsip-db] /api/docs/:id/history error:', err);
      res.status(500).json({ error: 'Gagal mengambil riwayat' });
      return true;
    }
  }

  const mDocPublik = pathname.match(/^\/api\/docs\/([^/]+)\/publik$/);
  if (mDocPublik && method === 'PATCH') {
    const docId = mDocPublik[1];
    try {
      const publik = Boolean(req.body?.publik);
      await doQuery('UPDATE bapperida_dokumen SET publik = $1 WHERE id = $2', [publik, docId]);
      res.json({ ok: true, message: 'Status publik diperbarui', publik });
      return true;
    } catch (err) {
      console.error('[arsip-db] /api/docs/:id/publik error:', err);
      res.status(500).json({ error: 'Gagal memperbarui status publik' });
      return true;
    }
  }

  const mDocStatus = pathname.match(/^\/api\/docs\/([^/]+)\/status$/);
  if (mDocStatus && method === 'PATCH') {
    const docId = mDocStatus[1];
    const { status, note } = req.body || {};
    try {
      const actorName = req.user?.name || req.user?.username || req.user?.nip || 'Admin';
      const actorNip = req.user?.nip || '';
      await doQuery(
        `UPDATE bapperida_dokumen
         SET status = $1, reviewed_by = $2, review_note = COALESCE($3, review_note)
         WHERE id = $4`,
        [status, actorName, note || null, docId]
      );
      try {
        await doQuery(
          `INSERT INTO doc_history (doc_id, action, to_status, actor_id, actor_name, note)
           VALUES ($1, 'status_change', $2, $3, $4, $5)`,
          [docId, status, actorNip, actorName, note || '']
        );
      } catch (_) {}
      res.json({ ok: true, message: 'Status berhasil diperbarui' });
      return true;
    } catch (err) {
      console.error('[arsip-db] /api/docs/:id/status error:', err);
      res.status(500).json({ error: 'Gagal memperbarui status dokumen' });
      return true;
    }
  }

  const mDocSingle = pathname.match(/^\/api\/docs\/(\d+)$/);
  if (mDocSingle && method === 'GET') {
    const docId = mDocSingle[1];
    try {
      const { rows } = await doQuery(
        `SELECT
           id, judul AS title, kategori AS type, tipe AS sector, file_type AS "fileType",
           TO_CHAR(tanggal, 'YYYY') AS year, status, COALESCE(uploader_id, '') AS "uploaderId",
           COALESCE("desc", '') AS "desc", COALESCE(tags, '') AS "tagsRaw",
           COALESCE(nomor_dokumen, '') AS "nomorDokumen",
           TO_CHAR(tanggal_dokumen, 'DD Mon YYYY') AS "tanggalDokumen",
           COALESCE(versi, 1) AS versi, ukuran AS size, COALESCE(pages, 0) AS pages,
           TO_CHAR(tanggal, 'DD Mon YYYY') AS "uploadDate", url, files, icon_data,
           COALESCE(publik, false) AS publik, COALESCE(bidang, '') AS bidang
         FROM bapperida_dokumen WHERE id = $1 LIMIT 1`,
        [docId]
      );
      if (!rows.length) {
        res.status(404).json({ error: 'Dokumen tidak ditemukan' });
        return true;
      }
      const d = rows[0];
      let files = [];
      if (d.files) {
        try { files = typeof d.files === 'string' ? JSON.parse(d.files) : d.files; }
        catch (_) { files = []; }
      }
      const tags = d.tagsRaw ? d.tagsRaw.split(',').map((t) => t.trim()).filter(Boolean) : [];
      res.json({ ...d, files, tags });
      return true;
    } catch (err) {
      console.error('[arsip-db] /api/docs/:id error:', err);
      res.status(500).json({ error: 'Gagal mengambil dokumen' });
      return true;
    }
  }

  // 2. PKS (/api/pks/*)
  if (pathname === '/api/pks/tahun' && method === 'GET') {
    try {
      const { rows } = await doQuery(`
        SELECT t.tahun FROM pks_tahun t
        WHERE EXISTS (SELECT 1 FROM pks_program p WHERE p.tahun = t.tahun)
        ORDER BY t.tahun DESC
      `);
      const now = new Date().getFullYear();
      const nums = rows.map((r) => r.tahun);
      for (const y of [now + 1, now, now - 1]) {
        if (!nums.includes(y)) nums.push(y);
      }
      const unik = [...new Set(nums)];
      res.json([
        ...unik.filter((y) => rows.some((r) => r.tahun === y)),
        ...unik.filter((y) => !rows.some((r) => r.tahun === y)),
      ]);
      return true;
    } catch (err) {
      console.error('[arsip-db] /api/pks/tahun error:', err);
      res.status(500).json({ error: 'Gagal mengambil daftar tahun PKS' });
      return true;
    }
  }

  if (pathname === '/api/pks/tree' && method === 'GET') {
    const tahun = parseInt(query.tahun, 10) || new Date().getFullYear();
    try {
      const [pRes, kRes, sRes, kkRes] = await Promise.all([
        doQuery('SELECT id, kode, nama, urutan, tahun FROM pks_program WHERE tahun = $1 ORDER BY urutan, kode', [tahun]),
        doQuery('SELECT id, program_id, kode, nama, urutan FROM pks_kegiatan WHERE tahun = $1 ORDER BY urutan, kode', [tahun]),
        doQuery(`SELECT id, kegiatan_id, kode, nama, urutan, indikator, target, pagu, kode_rekening,
                        realisasi, status_validasi, catatan_validasi, status_oleh, status_at, updated_at
                 FROM pks_subkegiatan WHERE tahun = $1 ORDER BY urutan, kode`, [tahun]),
        doQuery(`SELECT k.id, k.subkegiatan_id, k.nama, k.indikator, k.frekuensi,
                        k.target_per_tahun, k.bulan_wajib, k.deadline_rule, k.pic_id, k.keterangan,
                        COALESCE(ul.username, k.pic_id) AS pic_nama, ul.bidang AS pic_unit,
                        p.id AS periode_id, p.periode, p.periode_label,
                        TO_CHAR(p.deadline, 'YYYY-MM-DD') AS deadline, p.is_wajib,
                        p.doc_id, p.catatan, p.uploaded_by, p.uploaded_at,
                        d.judul AS doc_judul, d.status AS doc_status
                 FROM kertas_kerja k
                 JOIN pks_subkegiatan s ON s.id = k.subkegiatan_id
                 LEFT JOIN user_list ul ON ul."NIP" = k.pic_id
                 LEFT JOIN kertas_kerja_periode p ON p.kertas_kerja_id = k.id AND p.tahun = $1
                 LEFT JOIN bapperida_dokumen d ON d.id = p.doc_id
                 WHERE s.tahun = $1 AND k.is_active
                 ORDER BY k.id, p.periode`, [tahun])
      ]);

      const programs = pRes.rows;
      const kegiatans = kRes.rows;
      const subs = sRes.rows;
      const kkRows = kkRes.rows;

      // Group kertas_kerja and periodes
      const kkMap = new Map();
      for (const r of kkRows) {
        if (!kkMap.has(r.id)) {
          kkMap.set(r.id, {
            id: r.id, subkegiatan_id: r.subkegiatan_id, nama: r.nama, indikator: r.indikator,
            frekuensi: r.frekuensi, target_per_tahun: r.target_per_tahun, bulan_wajib: r.bulan_wajib,
            deadline_rule: r.deadline_rule, pic_id: r.pic_id, pic_nama: r.pic_nama, pic_unit: r.pic_unit,
            keterangan: r.keterangan, periodes: []
          });
        }
        if (r.periode_id) {
          kkMap.get(r.id).periodes.push({
            id: r.periode_id, periode: r.periode, periode_label: r.periode_label,
            deadline: r.deadline, is_wajib: r.is_wajib, doc_id: r.doc_id,
            catatan: r.catatan, uploaded_by: r.uploaded_by, uploaded_at: r.uploaded_at,
            doc_judul: r.doc_judul, doc_status: r.doc_status
          });
        }
      }

      const subMap = new Map(subs.map((s) => [s.id, { ...s, outputs: [] }]));
      for (const kk of kkMap.values()) {
        const sub = subMap.get(kk.subkegiatan_id);
        if (sub) sub.outputs.push(kk);
      }

      const kegMap = new Map(kegiatans.map((k) => [k.id, { ...k, subkegiatans: [] }]));
      for (const s of subMap.values()) {
        const keg = kegMap.get(s.kegiatan_id);
        if (keg) keg.subkegiatans.push(s);
      }

      const progMap = new Map(programs.map((p) => [p.id, { ...p, kegiatans: [] }]));
      for (const k of kegMap.values()) {
        const prog = progMap.get(k.program_id);
        if (prog) prog.kegiatans.push(k);
      }

      res.json(Array.from(progMap.values()));
      return true;
    } catch (err) {
      console.error('[arsip-db] /api/pks/tree error:', err);
      res.status(500).json({ error: 'Gagal mengambil pohon PKS' });
      return true;
    }
  }

  const mRingkasan = pathname.match(/^\/api\/pks\/ringkasan\/(\d+)$/);
  if (mRingkasan && method === 'GET') {
    const tahun = parseInt(mRingkasan[1], 10);
    try {
      const { rows } = await doQuery(`
        SELECT
          COUNT(*) FILTER (WHERE p.is_wajib)                                        AS wajib,
          COUNT(*) FILTER (WHERE p.is_wajib AND p.doc_id IS NOT NULL)               AS terisi,
          COUNT(*) FILTER (WHERE p.is_wajib AND p.doc_id IS NULL
                             AND p.deadline < CURRENT_DATE)                         AS terlambat,
          COUNT(*) FILTER (WHERE p.is_wajib AND p.doc_id IS NULL
                             AND p.deadline BETWEEN CURRENT_DATE
                             AND CURRENT_DATE + 3)                                 AS mauDeadline,
          COUNT(DISTINCT k.id)                                                     AS output,
          COUNT(DISTINCT s.id)                                                     AS subkegiatan
        FROM kertas_kerja_periode p
        JOIN kertas_kerja k ON k.id = p.kertas_kerja_id AND k.is_active
        JOIN pks_subkegiatan s ON s.id = k.subkegiatan_id AND s.tahun = $1
        WHERE p.tahun = $1
      `, [tahun]);
      res.json({ tahun, ...(rows[0] || {}) });
      return true;
    } catch (err) {
      console.error('[arsip-db] /api/pks/ringkasan error:', err);
      res.status(500).json({ error: 'Gagal mengambil ringkasan PKS' });
      return true;
    }
  }

  if (pathname === '/api/pks/deadline-terdekat' && method === 'GET') {
    const hari = parseInt(query.hari, 10) || 14;
    const tahun = query.tahun ? parseInt(query.tahun, 10) : null;
    try {
      const { rows } = await doQuery(`
        SELECT p.id, p.periode_label,
               TO_CHAR(p.deadline, 'YYYY-MM-DD') AS deadline,
               k.nama AS output, s.kode AS sub_kode,
               CASE WHEN p.deadline < CURRENT_DATE THEN true ELSE false END AS lewat
        FROM kertas_kerja_periode p
        JOIN kertas_kerja k ON k.id = p.kertas_kerja_id AND k.is_active
        JOIN pks_subkegiatan s ON s.id = k.subkegiatan_id
        WHERE p.is_wajib AND p.doc_id IS NULL
          AND p.deadline <= CURRENT_DATE + $1::int
          AND ($2::int IS NULL OR p.tahun = $2::int)
        ORDER BY p.deadline ASC
        LIMIT 50
      `, [hari, tahun]);
      res.json(rows);
      return true;
    } catch (err) {
      console.error('[arsip-db] /api/pks/deadline-terdekat error:', err);
      res.status(500).json({ error: 'Gagal mengambil deadline terdekat' });
      return true;
    }
  }

  // 3. Bank Data (/api/bankdata/*)
  if (pathname === '/api/bankdata/tahun' && method === 'GET') {
    try {
      const { rows } = await doQuery('SELECT id, tahun FROM bank_data_tahun ORDER BY tahun');
      res.json(rows);
      return true;
    } catch (err) {
      console.error('[arsip-db] /api/bankdata/tahun error:', err);
      res.status(500).json({ error: 'Gagal mengambil daftar tahun bank data' });
      return true;
    }
  }

  if (pathname === '/api/bankdata/tahun' && method === 'POST') {
    const { tahun } = req.body || {};
    if (!tahun) {
      res.status(400).json({ error: 'Tahun wajib diisi' });
      return true;
    }
    try {
      await doQuery('INSERT INTO bank_data_tahun (tahun) VALUES ($1) ON CONFLICT (tahun) DO NOTHING', [tahun]);
      res.json({ message: 'Tahun berhasil ditambahkan' });
      return true;
    } catch (err) {
      console.error('[arsip-db] POST /api/bankdata/tahun error:', err);
      res.status(500).json({ error: 'Gagal menambahkan tahun' });
      return true;
    }
  }

  const mBdTahunDel = pathname.match(/^\/api\/bankdata\/tahun\/(\d+)$/);
  if (mBdTahunDel && method === 'DELETE') {
    const id = Number(mBdTahunDel[1]);
    try {
      await doQuery('DELETE FROM bank_data_tahun WHERE id = $1 OR tahun = $1', [id]);
      res.json({ message: 'Tahun berhasil dihapus' });
      return true;
    } catch (err) {
      console.error('[arsip-db] DELETE /api/bankdata/tahun/:id error:', err);
      res.status(500).json({ error: 'Gagal menghapus tahun' });
      return true;
    }
  }

  if (pathname === '/api/bankdata' && method === 'GET') {
    try {
      const [
        bidangsRes, opdsRes, ikusRes, ikksRes,
        nilIkuRes, twIkuRes, nilIkkRes, twIkkRes,
        sektRes, indSektRes, nilSektRes, twSektRes
      ] = await Promise.all([
        doQuery(`SELECT id, nama_bidang AS nama FROM bidang_list WHERE instansi_id = 'bapperida' AND id = ANY($1::int[]) ORDER BY id`, [BIDANG_BANKDATA]),
        doQuery(`SELECT id, bidang_id, nama, urutan FROM bank_data_opd ORDER BY bidang_id, urutan, id`),
        doQuery(`SELECT id, opd_id, nama, sumber_data, aspek, satuan, urutan FROM bank_data_iku ORDER BY opd_id, urutan, id`),
        doQuery(`SELECT id, iku_id, nama, sumber_data, aspek, satuan, urutan FROM bank_data_ikk ORDER BY iku_id, urutan, id`),
        doQuery(`SELECT id, iku_id, tahun, target, capaian FROM bank_data_iku_nilai ORDER BY iku_id, tahun`),
        doQuery(`SELECT * FROM bank_data_iku_triwulan ORDER BY iku_id, tahun`),
        doQuery(`SELECT id, ikk_id, tahun, target, capaian FROM bank_data_ikk_nilai ORDER BY ikk_id, tahun`),
        doQuery(`SELECT * FROM bank_data_ikk_triwulan ORDER BY ikk_id, tahun`),
        doQuery(`SELECT id, opd_id, nama, urutan FROM bank_data_sektoral ORDER BY opd_id, urutan, id`),
        doQuery(`SELECT id, sektoral_id, indikator, sumber_data, aspek, satuan, urutan FROM bank_data_sektoral_indikator ORDER BY sektoral_id, urutan, id`),
        doQuery(`SELECT id, indikator_id, tahun, data FROM bank_data_sektoral_nilai ORDER BY indikator_id, tahun`),
        doQuery(`SELECT * FROM bank_data_sektoral_triwulan ORDER BY indikator_id, tahun`)
      ]);

      const bidangs = bidangsRes.rows;
      const opds = opdsRes.rows;
      const ikus = ikusRes.rows;
      const ikks = ikksRes.rows;
      const nilIkuR = nilIkuRes.rows;
      const twIkuR = twIkuRes.rows;
      const nilIkkR = nilIkkRes.rows;
      const twIkkR = twIkkRes.rows;
      const sektorals = sektRes.rows;
      const indSektR = indSektRes.rows;
      const nilSektR = nilSektRes.rows;
      const twSektR = twSektRes.rows;

      const nilMap = (arr, key) => {
        const m = new Map();
        for (const r of arr) {
          const k = String(r[key]);
          if (!m.has(k)) m.set(k, []);
          m.get(k).push(r);
        }
        return m;
      };

      const twMap = (rows, conf, key = 'indikator_id') => {
        const m = new Map();
        for (const r of rows) {
          const k = String(r[key]);
          if (!m.has(k)) m.set(k, new Map());
          const obj = {};
          for (let i = 1; i <= 4; i++) {
            const a = conf.valA ? r[`${conf.valA}_tw${i}`] : r[`data_tw${i}`];
            const b = conf.valB ? r[`${conf.valB}_tw${i}`] : null;
            const cell = {};
            if (a !== null && a !== undefined) cell.a = a;
            if (b !== null && b !== undefined) cell.b = b;
            if (Object.keys(cell).length) obj[`tw${i}`] = cell;
          }
          if (Object.keys(obj).length) m.get(k).set(r.tahun, obj);
        }
        return m;
      };

      const nilIkk = nilMap(nilIkkR, 'ikk_id');
      const twIkk = twMap(twIkkR, BD_CONF.ikk, 'ikk_id');
      const ikkNodes = ikks.map((i) => {
        const nils = nilIkk.get(String(i.id)) || [];
        const twByYear = twIkk.get(String(i.id));
        return {
          id: i.id, nama: i.nama,
          sumber_data: i.sumber_data ?? null,
          aspek: i.aspek ?? null,
          satuan: i.satuan ?? null,
          nilai: nils.map((n) => {
            const o = { id: n.id, tahun: n.tahun };
            if (n.target !== null && n.target !== undefined) o.target = n.target;
            if (n.capaian !== null && n.capaian !== undefined) o.capaian = n.capaian;
            const t = twByYear?.get(n.tahun);
            if (t) o.tw = t;
            return o;
          })
        };
      });
      const ikkMap = new Map(ikkNodes.map((n) => [String(n.id), n]));

      const nilSekt = nilMap(nilSektR, 'indikator_id');
      const twSekt = twMap(twSektR, BD_CONF.sektoral, 'indikator_id');
      const indSektMap = new Map();
      for (const r of indSektR) {
        const pd = String(r.sektoral_id);
        const nils = nilSekt.get(String(r.id)) || [];
        const twByYear = twSekt.get(String(r.id));
        const node = {
          id: r.id, indikator: r.indikator,
          sumber_data: r.sumber_data ?? null,
          aspek: r.aspek ?? null,
          satuan: r.satuan ?? null,
          nilai: nils.map((n) => {
            const o = { id: n.id, tahun: n.tahun };
            if (n.data !== null && n.data !== undefined) o.data = n.data;
            const t = twByYear?.get(n.tahun);
            if (t) o.tw = t;
            return o;
          })
        };
        if (!indSektMap.has(pd)) indSektMap.set(pd, []);
        indSektMap.get(pd).push(node);
      }

      const nilIku = nilMap(nilIkuR, 'iku_id');
      const twIku = twMap(twIkuR, BD_CONF.iku, 'iku_id');
      const ikuNodes = ikus.map((i) => {
        const nils = nilIku.get(String(i.id)) || [];
        const twByYear = twIku.get(String(i.id));
        return {
          id: i.id, nama: i.nama,
          sumber_data: i.sumber_data ?? null,
          aspek: i.aspek ?? null,
          satuan: i.satuan ?? null,
          ikks: [],
          nilai: nils.map((n) => {
            const o = { id: n.id, tahun: n.tahun };
            if (n.target !== null && n.target !== undefined) o.target = n.target;
            if (n.capaian !== null && n.capaian !== undefined) o.capaian = n.capaian;
            const t = twByYear?.get(n.tahun);
            if (t) o.tw = t;
            return o;
          })
        };
      });
      const ikuMap = new Map(ikuNodes.map((n) => [String(n.id), n]));
      for (const i of ikks) {
        const p = ikuMap.get(String(i.iku_id));
        if (p) p.ikks.push(ikkMap.get(String(i.id)));
      }

      const sektMap = new Map(sektorals.map((s) => [String(s.id), { id: s.id, nama: s.nama, indikator: indSektMap.get(String(s.id)) || [] }]));
      const opdMap = new Map(opds.map((o) => [String(o.id), { id: o.id, nama: o.nama, ikus: [], sektorals: [] }]));
      for (const i of ikus) {
        const p = opdMap.get(String(i.opd_id));
        if (p) p.ikus.push(ikuMap.get(String(i.id)));
      }
      for (const s of sektorals) {
        const p = opdMap.get(String(s.opd_id));
        if (p) p.sektorals.push(sektMap.get(String(s.id)));
      }

      const tree = bidangs.map((b) => ({ ...b, opds: [] }));
      for (const o of opds) {
        const b = tree.find((x) => String(x.id) === String(o.bidang_id));
        if (b) b.opds.push(opdMap.get(String(o.id)));
      }

      res.json(tree);
      return true;
    } catch (err) {
      console.error('[arsip-db] /api/bankdata error:', err);
      res.status(500).json({ error: 'Gagal mengambil data bank data' });
      return true;
    }
  }

  // 4. Agenda (/api/agenda/*)
  if (pathname === '/api/agenda/surat-masuk' && method === 'GET') {
    try {
      const tahun = parseInt(query.tahun, 10) || new Date().getFullYear();
      const q = query.q ? `%${query.q.trim()}%` : null;
      const status = query.status || null;
      const limit = Math.min(100, Math.max(1, parseInt(query.limit, 10) || 30));
      const offset = Math.max(0, parseInt(query.offset, 10) || 0);

      let sql = `
        SELECT sm.*, 
               d.id as disposisi_id, d.status_tindaklanjut, d.diteruskan_kepada, d.batas_waktu,
               d.pemberi_disposisi, d.catatan_instruksi
        FROM agenda_surat_masuk sm
        LEFT JOIN (
          SELECT DISTINCT ON (surat_masuk_id) *
          FROM agenda_disposisi
          ORDER BY surat_masuk_id, id DESC
        ) d ON d.surat_masuk_id = sm.id
        WHERE sm.tahun = $1
      `;
      const params = [tahun];
      let pIdx = 2;

      if (status) {
        sql += ` AND sm.status = $${pIdx++}`;
        params.push(status);
      }
      if (q) {
        sql += ` AND (sm.nomor_agenda ILIKE $${pIdx} OR sm.nomor_surat_asli ILIKE $${pIdx} OR sm.asal_surat ILIKE $${pIdx} OR sm.perihal ILIKE $${pIdx})`;
        params.push(q);
        pIdx++;
      }

      sql += ` ORDER BY sm.id DESC LIMIT $${pIdx++} OFFSET $${pIdx++}`;
      params.push(limit, offset);

      const itemsRes = await doQuery(sql, params);
      const countRes = await doQuery(`SELECT COUNT(*)::int as total FROM agenda_surat_masuk WHERE tahun = $1`, [tahun]);

      res.json({
        ok: true,
        total: countRes.rows[0]?.total || 0,
        items: itemsRes.rows
      });
      return true;
    } catch (err) {
      console.error('[arsip-db] /api/agenda/surat-masuk error:', err);
      res.status(500).json({ ok: false, message: 'Gagal mengambil agenda surat masuk' });
      return true;
    }
  }

  if (pathname === '/api/agenda/surat-keluar' && method === 'GET') {
    try {
      const tahun = parseInt(query.tahun, 10) || new Date().getFullYear();
      const q = query.q ? `%${query.q.trim()}%` : null;
      const bidang = query.bidang || null;
      const status = query.status || null;
      const limit = Math.min(100, Math.max(1, parseInt(query.limit, 10) || 30));
      const offset = Math.max(0, parseInt(query.offset, 10) || 0);

      let sql = `SELECT * FROM agenda_surat_keluar WHERE tahun = $1`;
      const params = [tahun];
      let pIdx = 2;

      if (bidang) {
        sql += ` AND bidang_pengonsep = $${pIdx++}`;
        params.push(bidang);
      }
      if (status) {
        sql += ` AND status = $${pIdx++}`;
        params.push(status);
      }
      if (q) {
        sql += ` AND (nomor_surat ILIKE $${pIdx} OR tujuan_surat ILIKE $${pIdx} OR perihal ILIKE $${pIdx})`;
        params.push(q);
        pIdx++;
      }

      sql += ` ORDER BY nomor_urut DESC LIMIT $${pIdx++} OFFSET $${pIdx++}`;
      params.push(limit, offset);

      const itemsRes = await doQuery(sql, params);
      const countRes = await doQuery(`SELECT COUNT(*)::int as total FROM agenda_surat_keluar WHERE tahun = $1`, [tahun]);

      res.json({
        ok: true,
        total: countRes.rows[0]?.total || 0,
        items: itemsRes.rows
      });
      return true;
    } catch (err) {
      console.error('[arsip-db] /api/agenda/surat-keluar error:', err);
      res.status(500).json({ ok: false, message: 'Gagal mengambil agenda surat keluar' });
      return true;
    }
  }

  if (pathname === '/api/agenda/sppd' && method === 'GET') {
    try {
      const tahun = parseInt(query.tahun, 10) || new Date().getFullYear();
      const jenis = query.jenis; // 'DALAM_DAERAH' atau 'LUAR_DAERAH'
      const status = query.status || null;
      const q = query.q ? `%${query.q.trim()}%` : null;
      const limit = Math.min(100, Math.max(1, parseInt(query.limit, 10) || 30));
      const offset = Math.max(0, parseInt(query.offset, 10) || 0);

      let sql = `SELECT * FROM agenda_sppd WHERE tahun = $1`;
      const params = [tahun];
      let pIdx = 2;

      if (jenis) {
        sql += ` AND jenis_sppd = $${pIdx++}`;
        params.push(jenis);
      }
      if (status) {
        sql += ` AND status = $${pIdx++}`;
        params.push(status);
      }
      if (q) {
        sql += ` AND (nomor_spt ILIKE $${pIdx} OR nomor_sppd ILIKE $${pIdx} OR pelaksana_nama ILIKE $${pIdx} OR tempat_tujuan ILIKE $${pIdx} OR maksud_perjalanan ILIKE $${pIdx})`;
        params.push(q);
        pIdx++;
      }

      sql += ` ORDER BY id DESC LIMIT $${pIdx++} OFFSET $${pIdx++}`;
      params.push(limit, offset);

      const itemsRes = await doQuery(sql, params);
      const countRes = await doQuery(
        `SELECT COUNT(*)::int as total FROM agenda_sppd WHERE tahun = $1 ${jenis ? 'AND jenis_sppd = $2' : ''}`,
        jenis ? [tahun, jenis] : [tahun]
      );

      res.json({
        ok: true,
        total: countRes.rows[0]?.total || 0,
        items: itemsRes.rows
      });
      return true;
    } catch (err) {
      console.error('[arsip-db] /api/agenda/sppd error:', err);
      res.status(500).json({ ok: false, message: 'Gagal mengambil register SPPD' });
      return true;
    }
  }

  // 4b. Agenda Master & Write Fallbacks (peta-ekonomi parity)
  if (pathname === '/api/agenda/pegawai-list' && method === 'GET') {
    try {
      const { rows } = await doQuery(`SELECT "NIP" AS nip, username AS nama, COALESCE("Jabatan", '') AS jabatan FROM user_list ORDER BY username ASC`);
      res.json({ ok: true, items: rows });
      return true;
    } catch (err) {
      res.status(500).json({ ok: false, message: 'Gagal mengambil daftar pegawai' });
      return true;
    }
  }

  if (pathname === '/api/agenda/bidang-list' && method === 'GET') {
    try {
      const { rows } = await doQuery(`SELECT id, nama_bidang AS nama FROM bidang_list WHERE instansi_id = 'bapperida' ORDER BY id ASC`);
      res.json({ ok: true, items: rows });
      return true;
    } catch (err) {
      res.status(500).json({ ok: false, message: 'Gagal mengambil daftar bidang' });
      return true;
    }
  }

  if (pathname === '/api/agenda/surat-masuk' && method === 'POST') {
    try {
      const b = req.body || {};
      const tahun = parseInt(b.tahun, 10) || new Date().getFullYear();
      const cnt = await doQuery(`SELECT COUNT(*)::int AS c FROM agenda_surat_masuk WHERE tahun = $1`, [tahun]);
      const urut = (cnt.rows[0]?.c || 0) + 1;
      const nomorAgenda = b.nomor_agenda || `SM-${String(urut).padStart(3, '0')}/${tahun}`;
      const actor = req.user?.nip || req.user?.name || 'Admin';
      const { rows } = await doQuery(
        `INSERT INTO agenda_surat_masuk
         (tahun, nomor_agenda, tanggal_terima, nomor_surat_asli, tanggal_surat, asal_surat, perihal, sifat, kode_klasifikasi, file_url, created_by)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
         RETURNING *`,
        [
          tahun, nomorAgenda, b.tanggal_terima || b.tanggal_surat || new Date().toISOString().slice(0, 10),
          b.nomor_surat_asli || '', b.tanggal_surat || new Date().toISOString().slice(0, 10),
          b.asal_surat || '', b.perihal || '', b.sifat || 'Biasa', b.kode_klasifikasi || '050',
          b.file_url || null, actor,
        ]
      );
      res.status(201).json({ ok: true, item: rows[0] });
      return true;
    } catch (err) {
      console.error('[arsip-db] POST /api/agenda/surat-masuk error:', err);
      res.status(500).json({ ok: false, message: 'Gagal menyimpan surat masuk: ' + err.message });
      return true;
    }
  }

  const mSmDisp = pathname.match(/^\/api\/agenda\/surat-masuk\/(\d+)\/disposisi$/);
  if (mSmDisp && method === 'GET') {
    try {
      const { rows } = await doQuery(`SELECT * FROM agenda_disposisi WHERE surat_masuk_id = $1 ORDER BY id DESC`, [Number(mSmDisp[1])]);
      res.json({ ok: true, items: rows });
      return true;
    } catch (err) {
      res.status(500).json({ ok: false, message: 'Gagal mengambil disposisi' });
      return true;
    }
  }

  if (mSmDisp && method === 'POST') {
    try {
      const smId = Number(mSmDisp[1]);
      const b = req.body || {};
      const arahanArr = Array.isArray(b.arahan) ? b.arahan : (b.arahan ? [b.arahan] : []);
      const diteruskanArr = Array.isArray(b.diteruskan_kepada) ? b.diteruskan_kepada : (b.diteruskan_kepada ? [b.diteruskan_kepada] : []);
      const pemberi = b.pemberi_disposisi || req.user?.name || req.user?.username || 'Pimpinan BAPPERIDA';
      const { rows } = await doQuery(
        `INSERT INTO agenda_disposisi
         (surat_masuk_id, tanggal_disposisi, pemberi_disposisi, arahan, catatan_instruksi, diteruskan_kepada, batas_waktu, status_tindaklanjut)
         VALUES ($1, $2, $3, $4::jsonb, $5, $6::jsonb, $7, $8)
         RETURNING *`,
        [
          smId, b.tanggal_disposisi || new Date().toISOString().slice(0, 10), pemberi,
          JSON.stringify(arahanArr), b.catatan_instruksi || '', JSON.stringify(diteruskanArr),
          b.batas_waktu || null, b.status_tindaklanjut || 'Didisposisi',
        ]
      );
      await doQuery(`UPDATE agenda_surat_masuk SET status = 'Didisposisi', updated_at = NOW() WHERE id = $1`, [smId]).catch(() => {});
      res.status(201).json({ ok: true, item: rows[0] });
      return true;
    } catch (err) {
      console.error('[arsip-db] POST disposisi error:', err);
      res.status(500).json({ ok: false, message: 'Gagal menyimpan disposisi: ' + err.message });
      return true;
    }
  }

  const mSmDel = pathname.match(/^\/api\/agenda\/surat-masuk\/(\d+)$/);
  if (mSmDel && method === 'DELETE') {
    try {
      await doQuery(`DELETE FROM agenda_surat_masuk WHERE id = $1`, [Number(mSmDel[1])]);
      res.json({ ok: true, message: 'Surat masuk dihapus' });
      return true;
    } catch (err) {
      res.status(500).json({ ok: false, message: 'Gagal menghapus surat masuk' });
      return true;
    }
  }

  if (pathname === '/api/agenda/surat-keluar/preview-nomor' && method === 'GET') {
    try {
      const tahun = parseInt(query.tahun, 10) || new Date().getFullYear();
      const kode = String(query.kode || '050').trim();
      const bulanIdx = Math.max(1, Math.min(12, parseInt(query.bulan, 10) || (new Date().getMonth() + 1)));
      const ROMAN = ['', 'I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X', 'XI', 'XII'];
      const { rows } = await doQuery(`SELECT COALESCE(MAX(nomor_urut), 0)::int AS max_urut FROM agenda_surat_keluar WHERE tahun = $1`, [tahun]);
      const nextUrut = (rows[0]?.max_urut || 0) + 1;
      const nomor = `${kode}/${String(nextUrut).padStart(3, '0')}/BAPPERIDA/${ROMAN[bulanIdx]}/${tahun}`;
      res.json({ ok: true, nomor_urut: nextUrut, nomor_surat: nomor });
      return true;
    } catch (err) {
      res.status(500).json({ ok: false, message: 'Gagal membuat preview nomor surat' });
      return true;
    }
  }

  if (pathname === '/api/agenda/surat-keluar' && method === 'POST') {
    try {
      const b = req.body || {};
      const tahun = parseInt(b.tahun, 10) || new Date().getFullYear();
      const maxRes = await doQuery(`SELECT COALESCE(MAX(nomor_urut), 0)::int AS max_urut FROM agenda_surat_keluar WHERE tahun = $1`, [tahun]);
      const urut = (maxRes.rows[0]?.max_urut || 0) + 1;
      const kode = b.kode_klasifikasi || '050';
      const nomorSurat = b.nomor_surat || `${kode}/${String(urut).padStart(3, '0')}/BAPPERIDA/${tahun}`;
      const actor = req.user?.nip || req.user?.name || 'Admin';
      const { rows } = await doQuery(
        `INSERT INTO agenda_surat_keluar
         (tahun, nomor_agenda, nomor_surat, kode_klasifikasi, nomor_urut, tanggal_surat, tujuan_surat, perihal, sifat, bidang_pengonsep, penandatangan, file_final_url, status, created_by)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
         RETURNING *`,
        [
          tahun, `SK-${String(urut).padStart(3, '0')}/${tahun}`, nomorSurat, kode, urut,
          b.tanggal_surat || new Date().toISOString().slice(0, 10),
          b.tujuan_surat || '', b.perihal || '', b.sifat || 'Biasa',
          b.bidang_pengonsep || 'Sekretariat', b.penandatangan || 'Kepala BAPPERIDA',
          b.file_final_url || b.file_url || null, b.status || 'Terbit', actor,
        ]
      );
      res.status(201).json({ ok: true, item: rows[0] });
      return true;
    } catch (err) {
      console.error('[arsip-db] POST /api/agenda/surat-keluar error:', err);
      res.status(500).json({ ok: false, message: 'Gagal menyimpan surat keluar: ' + err.message });
      return true;
    }
  }

  const mSkDel = pathname.match(/^\/api\/agenda\/surat-keluar\/(\d+)$/);
  if (mSkDel && method === 'DELETE') {
    try {
      await doQuery(`DELETE FROM agenda_surat_keluar WHERE id = $1`, [Number(mSkDel[1])]);
      res.json({ ok: true, message: 'Surat keluar dihapus' });
      return true;
    } catch (err) {
      res.status(500).json({ ok: false, message: 'Gagal menghapus surat keluar' });
      return true;
    }
  }

  if (pathname === '/api/agenda/sppd/preview-nomor' && method === 'GET') {
    try {
      const tahun = parseInt(query.tahun, 10) || new Date().getFullYear();
      const jenis = query.jenis === 'LUAR_DAERAH' ? 'LUAR_DAERAH' : 'DALAM_DAERAH';
      const { rows } = await doQuery(`SELECT COUNT(*)::int AS c FROM agenda_sppd WHERE tahun = $1 AND jenis_sppd = $2`, [tahun, jenis]);
      const urut = (rows[0]?.c || 0) + 1;
      const pad = String(urut).padStart(3, '0');
      const kode = jenis === 'LUAR_DAERAH' ? '094' : '090';
      res.json({
        ok: true,
        nomor_register: pad,
        nomor_spt: `${kode}/${pad}/SPT/BAPPERIDA/${tahun}`,
        nomor_sppd: `${kode}/${pad}/SPPD/BAPPERIDA/${tahun}`,
      });
      return true;
    } catch (err) {
      res.status(500).json({ ok: false, message: 'Gagal membuat preview nomor SPPD' });
      return true;
    }
  }

  if (pathname === '/api/agenda/sppd' && method === 'POST') {
    try {
      const b = req.body || {};
      const tahun = parseInt(b.tahun, 10) || new Date().getFullYear();
      const jenis = b.jenis_sppd === 'LUAR_DAERAH' ? 'LUAR_DAERAH' : 'DALAM_DAERAH';
      const cnt = await doQuery(`SELECT COUNT(*)::int AS c FROM agenda_sppd WHERE tahun = $1 AND jenis_sppd = $2`, [tahun, jenis]);
      const urut = (cnt.rows[0]?.c || 0) + 1;
      const pad = String(urut).padStart(3, '0');
      const kode = jenis === 'LUAR_DAERAH' ? '094' : '090';
      const { rows } = await doQuery(
        `INSERT INTO agenda_sppd
         (jenis_sppd, tahun, nomor_register, nomor_spt, nomor_sppd, tanggal_spt, pejabat_perintah,
          pelaksana_nip, pelaksana_nama, maksud_perjalanan, tempat_tujuan, provinsi_tujuan,
          alat_angkutan, tanggal_berangkat, tanggal_kembali, status)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)
         RETURNING *`,
        [
          jenis, tahun, pad,
          b.nomor_spt || `${kode}/${pad}/SPT/BAPPERIDA/${tahun}`,
          b.nomor_sppd || `${kode}/${pad}/SPPD/BAPPERIDA/${tahun}`,
          b.tanggal_spt || b.tanggal_berangkat || new Date().toISOString().slice(0, 10),
          b.pejabat_perintah || 'Kepala BAPPERIDA',
          b.pelaksana_nip || '', b.pelaksana_nama || '', b.maksud_perjalanan || '',
          b.tempat_tujuan || '', b.provinsi_tujuan || 'Nusa Tenggara Timur',
          b.alat_angkutan || 'Kendaraan Dinas Roda 4',
          b.tanggal_berangkat || new Date().toISOString().slice(0, 10),
          b.tanggal_kembali || b.tanggal_berangkat || new Date().toISOString().slice(0, 10),
          b.status || 'Terbit',
        ]
      );
      res.status(201).json({ ok: true, item: rows[0] });
      return true;
    } catch (err) {
      console.error('[arsip-db] POST /api/agenda/sppd error:', err);
      res.status(500).json({ ok: false, message: 'Gagal menyimpan SPPD: ' + err.message });
      return true;
    }
  }

  const mSppdSpj = pathname.match(/^\/api\/agenda\/sppd\/(\d+)\/spj$/);
  if (mSppdSpj && (method === 'POST' || method === 'PATCH')) {
    try {
      const b = req.body || {};
      const lhpUrl = b.file_lhp_url || b.url || '';
      const { rows } = await doQuery(
        `UPDATE agenda_sppd SET file_lhp_url = COALESCE(NULLIF($1, ''), file_lhp_url), status = 'Laporan Masuk', updated_at = NOW() WHERE id = $2 RETURNING *`,
        [lhpUrl, Number(mSppdSpj[1])]
      );
      res.json({ ok: true, item: rows[0] });
      return true;
    } catch (err) {
      res.status(500).json({ ok: false, message: 'Gagal menyimpan SPJ/LHP SPPD' });
      return true;
    }
  }

  const mSppdDel = pathname.match(/^\/api\/agenda\/sppd\/(\d+)$/);
  if (mSppdDel && method === 'DELETE') {
    try {
      await doQuery(`DELETE FROM agenda_sppd WHERE id = $1`, [Number(mSppdDel[1])]);
      res.json({ ok: true, message: 'Agenda SPPD dihapus' });
      return true;
    } catch (err) {
      res.status(500).json({ ok: false, message: 'Gagal menghapus agenda SPPD' });
      return true;
    }
  }

  // 5. Master Data
  if (pathname === '/api/kategori-dokumen' && method === 'GET') {
    try {
      const { rows } = await doQuery(`SELECT id, nama FROM bapperida_kategori_dokumen ORDER BY nama ASC`);
      res.json(rows);
      return true;
    } catch (err) {
      console.error('[arsip-db] /api/kategori-dokumen error:', err);
      res.status(500).json({ error: 'Gagal mengambil data kategori dokumen' });
      return true;
    }
  }

  if (pathname === '/api/sektor' && method === 'GET') {
    try {
      const { rows } = await doQuery(`SELECT id, nama FROM bapperida_sektor ORDER BY nama ASC`);
      res.json(rows);
      return true;
    } catch (err) {
      console.error('[arsip-db] /api/sektor error:', err);
      res.status(500).json({ error: 'Gagal mengambil data sektor' });
      return true;
    }
  }

  if (pathname === '/api/bidang' && method === 'GET') {
    try {
      const { rows } = await doQuery(`
        SELECT id, nama_bidang AS nama FROM bidang_list
        WHERE instansi_id = 'bapperida' ORDER BY id
      `);
      res.json(rows);
      return true;
    } catch (err) {
      console.error('[arsip-db] /api/bidang error:', err);
      res.status(500).json({ error: 'Gagal mengambil data bidang' });
      return true;
    }
  }

  // 6. Kertas kerja kandidat periode
  const mKandidat = pathname.match(/^\/api\/kertas-kerja\/periode\/([^/]+)\/kandidat$/);
  if (mKandidat && method === 'GET') {
    const idPeriode = Number(mKandidat[1]);
    const judul = String(query.judul || '').trim();
    const q = String(query.q || '').trim();
    try {
      const pRes = await doQuery(
        `SELECT p.id, k.nama FROM kertas_kerja_periode p
         JOIN kertas_kerja k ON k.id = p.kertas_kerja_id
         WHERE p.id = $1`, [idPeriode]
      );
      if (!pRes.rows.length) {
        res.status(404).json({ error: 'Periode tidak ditemukan' });
        return true;
      }
      const periode = pRes.rows[0];
      const pola = q ? `%${q}%` : `%${periode.nama}%`;
      const { rows } = await doQuery(
        `SELECT d.id, d.judul,
                TO_CHAR(d.tanggal, 'DD Mon YYYY') AS tanggal,
                (lower(d.judul) = lower($1)) AS persis,
                (SELECT count(*)::int FROM kertas_kerja_periode x
                  WHERE x.doc_id = d.id AND x.id <> $3) AS terpakai
         FROM bapperida_dokumen d
         WHERE lower(d.judul) = lower($1) OR d.judul ILIKE $2
         ORDER BY (lower(d.judul) = lower($1)) DESC, d.id DESC
         LIMIT 25`,
        [judul, pola, idPeriode]
      );
      res.json(rows);
      return true;
    } catch (err) {
      console.error('[arsip-db] kandidat error:', err);
      res.status(500).json({ error: 'Gagal mencari dokumen kandidat' });
      return true;
    }
  }

  return false;
}
