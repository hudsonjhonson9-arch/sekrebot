function isBoss(jabatan) {
  const j = String(jabatan || '').toUpperCase();
  if (/BIDANG|SEKSI|SUB|BAGIAN|UPTD|PELAKSANA|FUNGSIONAL/.test(j)) return false;
  return /KEPALA BADAN|KEPALA DINAS|INSPEKTUR|SEKRETARIS DAERAH|CAMAT/.test(j) || j === 'KEPALA' || j.includes('KEPALA');
}

function pickKepala(users) {
  const kp = users.find(u => isBoss(u.jabatan)) || null;
  return kp && {
    nama: kp.nama,
    nip: kp.nip,
    jabatan: kp.jabatan,
    pangkat: kp.pangkat,
    signature: kp.signature || null
  };
}

/**
 * Mounts Stitch rekap routes (`/rekap-tpp`, `/rekap-range`, `/rekap-harian`) on the given router.
 */
export function mountStitchRekapRoutes(router, ctx) {
  const { query, requireAdmin, MEDIA_ROLES } = ctx;

  // 4. REKAP TPP: Calculate discipline and attendance percentage from PostgreSQL
  router.get('/rekap-tpp', requireAdmin, async (req, res) => {
    try {
      const now = new Date(Date.now() + 8 * 3600000);
      const currentYearMonth = String(req.query.periode || `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}`).slice(0, 7);
      const [yNum, mNum] = currentYearMonth.split('-').map(Number);

      const [usersRes, logsRes, shiftRes, liburRes] = await Promise.all([
        query(`
          SELECT u.id::text AS id, u.username AS nama, u."NIP" AS nip, u."Jabatan" AS jabatan, u.pangkat, t.signature
          FROM user_list u LEFT JOIN tanda_tangan t ON t.nip = u."NIP"
          WHERE u.status_aktif = true OR u.status_aktif IS NULL
          ORDER BY u.username ASC
        `),
        query(`
          SELECT "NIP", "Tanggal", "Jam", "Jenis Absen"
          FROM "Log_Absen"
          WHERE "Tanggal" LIKE $1
        `, [currentYearMonth + '%']),
        query(`SELECT masuk, pulang FROM jam_absen WHERE instansi_id = 'bapperida' OR instansi_id IS NULL LIMIT 1`),
        query(`SELECT tanggal FROM libur_nasional WHERE tanggal LIKE $1`, [currentYearMonth + '%'])
      ]);

      const users = usersRes.rows;
      const logs = logsRes.rows;
      const shiftMasuk = (shiftRes.rows[0] && shiftRes.rows[0].masuk) || '07:15';
      const liburSet = new Set(liburRes.rows.map(r => String(r.tanggal).slice(0, 10)));
      const todayIso = now.toISOString().slice(0, 10);

      let workingDays = 0;
      const lastDay = new Date(yNum, mNum, 0).getDate();
      for (let d = 1; d <= lastDay; d++) {
        const iso = `${yNum}-${String(mNum).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
        const dow = new Date(yNum, mNum - 1, d).getDay();
        if (dow === 0 || dow === 6 || liburSet.has(iso) || iso > todayIso) continue;
        workingDays++;
      }

      const kepala = pickKepala(users);

      const tppList = users.map(u => {
        const uLogs = logs.filter(l => l.NIP === u.nip);
        const masukLogs = uLogs.filter(l => /MASUK|TERLAMBAT/.test(String(l['Jenis Absen']).toUpperCase()));
        const hadirCount = new Set(masukLogs.map(l => l.Tanggal)).size;
        const telatCount = new Set(masukLogs.filter(l => l['Jenis Absen'] === 'DI LUAR JAM MASUK' || l['Jenis Absen'] === 'TERLAMBAT' || (l.Jam && l.Jam > shiftMasuk)).map(l => l.Tanggal)).size;

        const disiplinPct = workingDays > 0
          ? Math.max(0, Math.min(100, Math.round(((hadirCount - (telatCount * 0.25)) / workingDays) * 100)))
          : 0;
        const potPct = Math.max(0, 100 - disiplinPct);

        return {
          nama: u.nama,
          nip: u.nip,
          jabatan: u.jabatan,
          pangkat: u.pangkat,
          hariKerja: workingDays,
          hadir: hadirCount,
          terlambat: telatCount,
          disiplinPct,
          potPct,
          disiplin: `${disiplinPct}%`,
          potongan: potPct > 0 ? `${potPct}%` : '0%'
        };
      });

      return res.json({ ok: true, period: currentYearMonth, hariKerja: workingDays, kepala, data: tppList });
    } catch (err) {
      console.error('[stitch-api] rekap-tpp error:', err);
      return res.status(500).json({ ok: false, message: 'Gagal menghitung rekap TPP: ' + err.message });
    }
  });

  // 5d. REKAP RENTANG TANGGAL SELURUH PEGAWAI (port dari D:\Code\absensi\js\rekap.js)
  router.get('/rekap-range', async (req, res) => {
    try {
      const dari = String(req.query.dari || '').trim();
      const sampai = String(req.query.sampai || '').trim();
      if (!/^\d{4}-\d{2}-\d{2}$/.test(dari) || !/^\d{4}-\d{2}-\d{2}$/.test(sampai) || dari > sampai) {
        return res.status(400).json({ ok: false, message: 'Rentang tanggal tidak valid.' });
      }

      const [usersRes, logsRes, ketRes, shiftRes, liburRes] = await Promise.all([
        query(`
          SELECT u.id::text AS id, u.username AS nama, u."NIP" AS nip, u."Jabatan" AS jabatan, u.pangkat, t.signature
          FROM user_list u LEFT JOIN tanda_tangan t ON t.nip = u."NIP"
          WHERE u.status_aktif = true OR u.status_aktif IS NULL
          ORDER BY u.username ASC
        `),
        query(`SELECT "NIP", "Tanggal", "Jam", "Jenis Absen", "Ket" FROM "Log_Absen" WHERE "Tanggal" BETWEEN $1 AND $2`, [dari, sampai]),
        query(`
          SELECT "NIP", "Tanggal", "tgl_mulai", "tgl_selesai", "Jenis Absen" AS jenis, "Ket" AS ket
          FROM ket_temp
          WHERE UPPER("Status") = 'DISETUJUI'
            AND (("Tanggal" BETWEEN $1 AND $2) OR ("tgl_mulai" <= $2 AND "tgl_selesai" >= $1))
        `, [dari, sampai]),
        query(`SELECT masuk, pulang FROM jam_absen WHERE instansi_id = 'bapperida' OR instansi_id IS NULL LIMIT 1`),
        query(`SELECT tanggal FROM libur_nasional WHERE tanggal BETWEEN $1 AND $2`, [dari, sampai])
      ]);

      const shift = shiftRes.rows[0] || { masuk: '07:15', pulang: '14:30' };
      const toMin = (hm) => { const [h, m] = String(hm || '00:00').split(':').map(Number); return (h || 0) * 60 + (m || 0); };
      const masukLimit = toMin(shift.masuk || '07:15');
      const pulangLimit = toMin(shift.pulang || '14:30');
      const liburSet = new Set(liburRes.rows.map(r => String(r.tanggal).slice(0, 10)));
      const todayIso = new Date(Date.now() + 8 * 3600000).toISOString().slice(0, 10);

      // Daftar hari kerja (Sen-Jum, bukan hari libur, tidak melewati hari ini)
      const workDates = [];
      for (let d = new Date(dari + 'T00:00:00Z'), end = new Date(sampai + 'T00:00:00Z'); d <= end; d.setUTCDate(d.getUTCDate() + 1)) {
        const iso = d.toISOString().slice(0, 10);
        const dow = d.getUTCDay();
        if (dow === 0 || dow === 6 || liburSet.has(iso) || iso > todayIso) continue;
        workDates.push(iso);
      }

      const kepala = pickKepala(usersRes.rows);

      const admin = !!(MEDIA_ROLES.has(req.user?.role) || req.user?.is_admin);
      const targetUsers = admin ? usersRes.rows : usersRes.rows.filter(u => u.nip === String(req.user?.nip || ''));

      const data = targetUsers.map(u => {
        const uLogs = logsRes.rows.filter(l => l.NIP === u.nip);
        const uKets = ketRes.rows.filter(k => k.NIP === u.nip);

        const byDate = new Map();
        uLogs.forEach(l => {
          const t = String(l.Tanggal).slice(0, 10);
          const rec = byDate.get(t) || { masuk: null, pulang: null, ket: null };
          const j = String(l['Jenis Absen'] || '').toUpperCase();
          if (j.includes('PULANG')) { if (!rec.pulang || (l.Jam || '') > (rec.pulang.Jam || '')) rec.pulang = l; }
          else if (j.includes('MASUK') || j === 'TERLAMBAT') { if (!rec.masuk || (l.Jam || '') < (rec.masuk.Jam || '')) rec.masuk = l; }
          else if (/IZIN|SAKIT|TUGAS|CUTI|DL|TUBEL/.test(j)) rec.ket = j;
          byDate.set(t, rec);
        });

        let hadir = 0, izin = 0, sakit = 0, tugas = 0, cuti = 0, tubel = 0, alpa = 0;
        let lambatCount = 0, menitLambat = 0, menitCepat = 0;

        workDates.forEach(iso => {
          const rec = byDate.get(iso);
          const ketMatch = uKets.find(k => k.Tanggal === iso || (k.tgl_mulai && k.tgl_selesai && iso >= k.tgl_mulai && iso <= k.tgl_selesai));
          const ketJenis = ketMatch ? String(ketMatch.jenis || '').toUpperCase() : (rec?.ket || '');

          if (ketJenis) {
            if (ketJenis.includes('SAKIT')) sakit++;
            else if (ketJenis.includes('TUBEL')) tubel++;
            else if (ketJenis.includes('CUTI')) cuti++;
            else if (ketJenis.includes('TUGAS') || ketJenis.includes('DL') || ketJenis.includes('DINAS')) tugas++;
            else izin++;
            return;
          }
          if (rec && rec.masuk) {
            hadir++;
            const mMin = toMin(rec.masuk.Jam);
            if (mMin > masukLimit) { lambatCount++; menitLambat += (mMin - masukLimit); }
            if (rec.pulang) {
              const pMin = toMin(rec.pulang.Jam);
              if (pMin < pulangLimit) menitCepat += (pulangLimit - pMin);
            }
          } else if (iso < todayIso) {
            alpa++;
          }
        });

        return {
          nip: u.nip,
          nama: u.nama,
          jabatan: u.jabatan,
          pangkat: u.pangkat,
          hadir,
          izin,
          sakit,
          tugas,
          cuti,
          tubel,
          alpa,
          lambat_count: lambatCount,
          menit_terlambat: menitLambat,
          menit_lebih_awal: menitCepat
        };
      });

      return res.json({ ok: true, dari, sampai, hariKerja: workDates.length, shift, kepala, data });
    } catch (err) {
      console.error('[stitch-api] rekap-range error:', err);
      return res.status(500).json({ ok: false, message: 'Gagal menghitung rekap rentang tanggal: ' + err.message });
    }
  });

  // 9b. REKAP HARIAN (format Daftar Hadir): admin = semua pegawai, non-admin = hanya dirinya.
  // Kepala + tanda tangan selalu disertakan untuk blok TTD.
  router.get('/rekap-harian', async (req, res) => {
    try {
      const tanggal = String(req.query.tanggal || '');
      if (!/^\d{4}-\d{2}-\d{2}$/.test(tanggal)) return res.status(400).json({ ok: false, message: 'Tanggal tidak valid.' });

      const [usersRes, logsRes, ketRes] = await Promise.all([
        query(`
          SELECT u."NIP" AS nip, u.username AS nama, u."Jabatan" AS jabatan, u.pangkat, t.signature
          FROM user_list u LEFT JOIN tanda_tangan t ON t.nip = u."NIP"
          WHERE u.status_aktif = true OR u.status_aktif IS NULL
          ORDER BY u.username ASC
        `),
        query(`SELECT "NIP", "Jam", "Jenis Absen" FROM "Log_Absen" WHERE "Tanggal" = $1`, [tanggal]),
        query(`
          SELECT "NIP", "Jenis Absen" AS jenis, "Ket" AS ket FROM ket_temp
          WHERE UPPER("Status") = 'DISETUJUI' AND ("Tanggal" = $1 OR ($1 BETWEEN "tgl_mulai" AND "tgl_selesai"))
        `, [tanggal]),
      ]);
      const logs = logsRes.rows;
      const kets = ketRes.rows;

      const k = pickKepala(usersRes.rows);
      const admin = !!(MEDIA_ROLES.has(req.user?.role) || req.user?.is_admin);

      let rows = usersRes.rows.map(u => {
        const l = logs.filter(x => x.NIP === u.nip);
        const masuk = l.filter(x => /MASUK|TERLAMBAT/.test(String(x['Jenis Absen']).toUpperCase())).map(x => x.Jam).sort()[0] || null;
        const pulang = l.filter(x => String(x['Jenis Absen']).toUpperCase().includes('PULANG')).map(x => x.Jam).sort().pop() || null;
        const ketRow = kets.find(x => x.NIP === u.nip);
        return {
          nip: u.nip,
          nama: u.nama,
          jabatan: u.jabatan,
          pangkat: u.pangkat,
          jamMasuk: masuk,
          jamPulang: pulang,
          ket: ketRow ? [String(ketRow.jenis).toUpperCase(), ketRow.ket].filter(Boolean).join(': ') : (masuk ? '' : 'TB'),
          signature: u.signature || null
        };
      });
      if (!admin) {
        const me = String(req.user?.nip || '');
        rows = rows.filter(r => r.nip === me);
      }
      return res.json({ ok: true, tanggal, kepala: k, data: rows });
    } catch (err) {
      console.error('[stitch-api] rekap-harian error:', err);
      return res.status(500).json({ ok: false, message: 'Gagal memuat rekap harian: ' + err.message });
    }
  });
}
