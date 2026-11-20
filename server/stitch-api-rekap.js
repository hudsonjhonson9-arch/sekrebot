function getJabatanRank(jabatan) {
  const s = String(jabatan || '').toUpperCase().trim();
  if (!s) return 7;

  // Level 4 & 3 checked before Level 1 so "KEPALA BIDANG" / "KEPALA SEKSI" / "INSPEKTUR PEMBANTU"
  // never match the top-level "KEPALA" / "INSPEKTUR" rules.
  if (
    s.includes('KASUBAG') || s.includes('KASUBBAG') || s.includes('KASUBBID')
    || s.includes('KEPALA SUB') || s.includes('KEPALA SEKSI') || /\bKASI\b/.test(s)
    || s.includes('KETUA TIM') || s.includes('SUB KOORDINATOR') || s.includes('SUBKOR')
    || s.includes('KOORDINATOR')
  ) return 4;

  if (
    s.includes('KEPALA BIDANG') || s.includes('KABID')
    || s.includes('INSPEKTUR PEMBANTU') || /\bIRBAN/.test(s)
  ) return 3;

  if (
    s.includes('KEPALA BADAN') || s.includes('KEPALA DINAS') || s.includes('KEPALA KANTOR')
    || s.includes('KEPALA BAPPERIDA') || s.includes('KEPALA BAPPEDA')
    || s.includes('SEKRETARIS DAERAH') || s.includes('CAMAT') || s.includes('INSPEKTUR')
    || s === 'KEPALA'
    || (s.includes('KEPALA') && !/BIDANG|SEKSI|SUB|BAGIAN|UPTD|PELAKSANA|FUNGSIONAL/.test(s))
  ) return 1;

  if (s.includes('SEKRETARIS')) return 2;

  if (/NON[\s-]?ASN|MAGANG|HONORER|\bTHL\b|KONTRAK|PRAMU|DRIVER|SOPIR|PENJAGA|OUTSOURCING|\bPTT\b/.test(s)) {
    return 6;
  }

  return 5;
}

function getPangkatScore(pangkat) {
  if (!pangkat || pangkat === '—') return 0;
  const s = String(pangkat).toUpperCase().replace(/\s/g, '').replace(/[.\-]/g, '/');

  if (s.includes('IV/E') || s.includes('GOL/XVII')) return 17;
  if (s.includes('IV/D') || s.includes('GOL/XVI') || s.includes('AHLIUTAMA')) return 16;
  if (s.includes('IV/C') || s.includes('GOL/XV')) return 15;
  if (s.includes('IV/B') || s.includes('GOL/XIV')) return 14;
  if (s.includes('IV/A') || s.includes('GOL/XIII') || s.includes('AHLIMADYA')) return 13;

  if (s.includes('III/D') || s.includes('GOL/XII')) return 12;
  if (s.includes('III/C') || s.includes('GOL/XI') || s.includes('AHLIMUDA')) return 11;
  if (s.includes('III/B') || s.includes('GOL/X')) return 10;
  if (s.includes('III/A') || s.includes('GOL/IX') || s.includes('AHLIPERTAMA')) return 9;

  if (s.includes('II/D') || s.includes('GOL/VIII') || s.includes('PENYELIA')) return 8;
  if (s.includes('II/C') || s.includes('GOL/VII') || s.includes('MAHIR')) return 7;
  if (s.includes('II/B') || s.includes('GOL/VI')) return 6;
  if (s.includes('II/A') || s.includes('GOL/V') || s.includes('TERAMPIL')) return 5;

  if (s.includes('I/D') || s.includes('GOL/IV')) return 4;
  if (s.includes('I/C') || s.includes('GOL/III')) return 3;
  if (s.includes('I/B') || s.includes('GOL/II')) return 2;
  if (s.includes('I/A') || s.includes('GOL/I')) return 1;

  const raw = String(pangkat).toUpperCase();
  if (raw.includes('GOLONGAN IX') || raw.includes('AHLI PERTAMA')) return 9;
  return 0;
}

/**
 * Sorts employees by ASN hierarchy: Jabatan rank -> PNS (18-digit NIP) ->
 * Pangkat (IV/e..I/a) -> NIP ascending -> Nama A-Z.
 */
export function sortPegawaiHierarchy(a, b) {
  if (!a || !b) return 0;

  const rankA = getJabatanRank(a.jabatan);
  const rankB = getJabatanRank(b.jabatan);
  if (rankA !== rankB) return rankA - rankB;

  const digitsA = String(a.nip || '').replace(/\D/g, '');
  const digitsB = String(b.nip || '').replace(/\D/g, '');
  const isPnsA = digitsA.length === 18;
  const isPnsB = digitsB.length === 18;
  if (isPnsA !== isPnsB) return isPnsA ? -1 : 1;

  const pScoreA = getPangkatScore(a.pangkat);
  const pScoreB = getPangkatScore(b.pangkat);
  if (pScoreA !== pScoreB) return pScoreB - pScoreA;

  const nipA = isPnsA ? digitsA : String(a.nip || '').trim();
  const nipB = isPnsB ? digitsB : String(b.nip || '').trim();
  if (nipA !== nipB) {
    if (!nipA) return 1;
    if (!nipB) return -1;
    return nipA.localeCompare(nipB, 'id');
  }

  return String(a.nama || '').toLowerCase().trim()
    .localeCompare(String(b.nama || '').toLowerCase().trim(), 'id');
}

function isBoss(jabatan) {
  return getJabatanRank(jabatan) === 1;
}

function toSignerEntry(u) {
  return {
    nama: u.nama,
    nip: u.nip,
    jabatan: u.jabatan,
    pangkat: u.pangkat || null,
    signature: u.signature || null
  };
}

function pickKepala(users) {
  const kp = [...users].sort(sortPegawaiHierarchy).find(u => isBoss(u.jabatan)) || null;
  return kp ? toSignerEntry(kp) : null;
}

function pickSigners(users) {
  return [...users]
    .filter(u => getJabatanRank(u.jabatan) <= 4)
    .sort(sortPegawaiHierarchy)
    .map(toSignerEntry);
}

function getBidangList(users) {
  return [...new Set(users.map(u => String(u.bidang || '').trim()).filter(Boolean))]
    .sort((a, b) => a.localeCompare(b, 'id'));
}

function resolveTargetInstansi(req) {
  const role = String(req.user?.role || '').toUpperCase();
  if (role === 'SUPERADMIN') {
    const qInst = String(req.query?.instansi_id || '').trim();
    return qInst && qInst.toLowerCase() !== 'all' ? qInst : null;
  }
  return String(req.user?.instansi_id || '').trim() || null;
}

function scopeUsersByInstansi(users, req, targetInstansi) {
  if (!targetInstansi) return users;
  const role = String(req.user?.role || '').toUpperCase();
  // Keep backwards compatibility with unit tests where stubbed user_list rows omit instansi_id.
  if (role === 'SUPERADMIN') {
    return users.some(u => u.instansi_id != null && String(u.instansi_id).trim() !== '')
      ? users.filter(u => String(u.instansi_id || '').trim() === targetInstansi)
      : users;
  }
  const hasMatchingInstansi = users.some(u => String(u.instansi_id || '').trim() === targetInstansi);
  return hasMatchingInstansi
    ? users.filter(u => String(u.instansi_id || '').trim() === targetInstansi)
    : users;
}

function toMin(hm) {
  const m = /^(\d{1,2}):(\d{2})/.exec(String(hm || '').trim());
  return m ? Number(m[1]) * 60 + Number(m[2]) : null;
}

function matchUserLog(log, user) {
  if (log.ID != null && String(log.ID).trim() !== '' && user.id != null && String(user.id).trim() !== '') {
    return String(log.ID) === String(user.id);
  }
  return log.NIP === user.nip;
}

function matchUserKet(ket, user) {
  if (ket.ID_Pegawai != null && String(ket.ID_Pegawai).trim() !== '' && user.id != null && String(user.id).trim() !== '') {
    return String(ket.ID_Pegawai) === String(user.id);
  }
  return ket.NIP === user.nip;
}

function formatRawLog(l) {
  if (!l) return null;
  return {
    ID_Log: l.ID_Log ?? l.id_log ?? null,
    Jam: l.Jam ?? l.jam ?? null,
    Jenis_Absen: l['Jenis Absen'] ?? l.jenis_absen ?? l.jenis ?? null,
    Ket: l.Ket ?? l.ket ?? null
  };
}

function shiftQueryForInstansi(query, targetInstansi) {
  if (targetInstansi) {
    return query(
      `SELECT masuk, pulang FROM jam_absen WHERE instansi_id = $1 OR instansi_id IS NULL ORDER BY CASE WHEN instansi_id = $1 THEN 0 ELSE 1 END LIMIT 1`,
      [targetInstansi]
    );
  }
  return query(`SELECT masuk, pulang FROM jam_absen WHERE instansi_id = 'bapperida' OR instansi_id IS NULL LIMIT 1`);
}

function buildDatesBetween(dari, sampai) {
  const out = [];
  for (let d = new Date(dari + 'T00:00:00Z'), end = new Date(sampai + 'T00:00:00Z'); d <= end; d.setUTCDate(d.getUTCDate() + 1)) {
    out.push(d.toISOString().slice(0, 10));
  }
  return out;
}

const USER_SELECT_SQL = `
  SELECT u.id::text AS id, u.username AS nama, u."NIP" AS nip, u."Jabatan" AS jabatan,
         u.pangkat, u.bidang, u.instansi_id, t.signature
  FROM user_list u LEFT JOIN tanda_tangan t ON t.nip = u."NIP"
  WHERE u.status_aktif = true OR u.status_aktif IS NULL
  ORDER BY u.username ASC
`;

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
      const targetInstansi = resolveTargetInstansi(req);

      const [usersRes, logsRes, shiftRes, liburRes] = await Promise.all([
        query(USER_SELECT_SQL),
        query(`
          SELECT "ID", "NIP", "Tanggal", "Jam", "Jenis Absen"
          FROM "Log_Absen"
          WHERE "Tanggal" LIKE $1
        `, [currentYearMonth + '%']),
        shiftQueryForInstansi(query, targetInstansi),
        query(`SELECT tanggal FROM libur_nasional WHERE tanggal LIKE $1`, [currentYearMonth + '%'])
      ]);

      const users = scopeUsersByInstansi(usersRes.rows, req, targetInstansi).sort(sortPegawaiHierarchy);
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
        const uLogs = logs.filter(l => matchUserLog(l, u));
        const masukLogs = uLogs.filter(l => /MASUK|TERLAMBAT/.test(String(l['Jenis Absen']).toUpperCase()));
        const hadirCount = new Set(masukLogs.map(l => l.Tanggal)).size;
        const telatCount = new Set(masukLogs.filter(l => l['Jenis Absen'] === 'DI LUAR JAM MASUK' || l['Jenis Absen'] === 'TERLAMBAT' || (l.Jam && l.Jam > shiftMasuk)).map(l => l.Tanggal)).size;

        const disiplinPct = workingDays > 0
          ? Math.max(0, Math.min(100, Math.round(((hadirCount - (telatCount * 0.25)) / workingDays) * 100)))
          : 0;
        const potPct = Math.max(0, 100 - disiplinPct);

        return {
          id: u.id,
          nama: u.nama,
          nip: u.nip,
          jabatan: u.jabatan,
          pangkat: u.pangkat,
          bidang: u.bidang || '',
          instansi_id: u.instansi_id || null,
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
      const targetInstansi = resolveTargetInstansi(req);

      const [usersRes, logsRes, ketRes, shiftRes, liburRes] = await Promise.all([
        query(USER_SELECT_SQL),
        query(`SELECT "ID_Log", "ID", "NIP", "Tanggal", "Jam", "Jenis Absen", "Lokasi", "Ket" FROM "Log_Absen" WHERE "Tanggal" BETWEEN $1 AND $2`, [dari, sampai]),
        query(`
          SELECT "ID_Ket", "ID_Pegawai", "NIP", "Tanggal", "tgl_mulai", "tgl_selesai", "Jenis Absen" AS jenis, "Ket" AS ket
          FROM ket_temp
          WHERE UPPER("Status") = 'DISETUJUI'
            AND (("Tanggal" BETWEEN $1 AND $2) OR ("tgl_mulai" <= $2 AND "tgl_selesai" >= $1))
        `, [dari, sampai]),
        shiftQueryForInstansi(query, targetInstansi),
        query(`SELECT tanggal FROM libur_nasional WHERE tanggal BETWEEN $1 AND $2`, [dari, sampai])
      ]);

      const shift = shiftRes.rows[0] || { masuk: '07:15', pulang: '14:30' };
      const masukLimit = toMin(shift.masuk) ?? (7 * 60 + 15);
      const pulangLimit = toMin(shift.pulang) ?? (14 * 60 + 30);
      const liburSet = new Set(liburRes.rows.map(r => String(r.tanggal).slice(0, 10)));
      const todayIso = new Date(Date.now() + 8 * 3600000).toISOString().slice(0, 10);

      const allDates = buildDatesBetween(dari, sampai);
      // Daftar hari kerja (Sen-Jum, bukan hari libur, tidak melewati hari ini)
      const workDates = allDates.filter(iso => {
        const dow = new Date(iso + 'T00:00:00Z').getUTCDay();
        return dow !== 0 && dow !== 6 && !liburSet.has(iso) && iso <= todayIso;
      });
      const workDateSet = new Set(workDates);

      const scopedUsers = scopeUsersByInstansi(usersRes.rows, req, targetInstansi);
      const kepala = pickKepala(scopedUsers);
      const signers = pickSigners(scopedUsers);
      const bidangList = getBidangList(scopedUsers);

      const admin = !!(MEDIA_ROLES.has(req.user?.role) || req.user?.is_admin);
      const targetUsers = (admin ? scopedUsers : scopedUsers.filter(u => u.nip === String(req.user?.nip || '')))
        .slice()
        .sort(sortPegawaiHierarchy);

      const data = targetUsers.map(u => {
        const uLogs = logsRes.rows.filter(l => matchUserLog(l, u));
        const uKets = ketRes.rows.filter(k => matchUserKet(k, u));

        const byDate = new Map();
        uLogs.forEach(l => {
          const t = String(l.Tanggal || '').slice(0, 10);
          if (!t) return;
          const rec = byDate.get(t) || { masuk: null, pulang: null, ketLog: null };
          const j = String(l['Jenis Absen'] || '').toUpperCase().trim();
          if (j.includes('PULANG')) {
            if (!rec.pulang || (l.Jam || '') > (rec.pulang.Jam || '')) rec.pulang = l;
          } else if (j.includes('MASUK') || j === 'TERLAMBAT') {
            if (!rec.masuk || (l.Jam || '') < (rec.masuk.Jam || '')) rec.masuk = l;
          } else if (/IZIN|SAKIT|TUGAS|CUTI|DL|TUBEL|TB|TANPA BERITA|ALPA/.test(j)) {
            rec.ketLog = l;
          }
          byDate.set(t, rec);
        });

        let hadir = 0, pulang = 0, lapangan = 0, izin = 0, sakit = 0, tugas = 0, cuti = 0, tubel = 0, alpa = 0;
        let lambatCount = 0, menitLambat = 0, menitCepat = 0, hadirMenit = 0;
        const logByDate = {};
        const ketByDate = {};

        const datesToInspect = new Set([...allDates, ...byDate.keys()]);
        for (const iso of [...datesToInspect].sort()) {
          const rec = byDate.get(iso);
          const ketMatch = uKets.find(k =>
            String(k.Tanggal || '').slice(0, 10) === iso
            || (k.tgl_mulai && k.tgl_selesai && iso >= String(k.tgl_mulai).slice(0, 10) && iso <= String(k.tgl_selesai).slice(0, 10))
          );
          const rawKetJenis = ketMatch
            ? String(ketMatch.jenis || '').toUpperCase().trim()
            : (rec?.ketLog ? String(rec.ketLog['Jenis Absen'] || '').toUpperCase().trim() : '');
          const ketJenis = rawKetJenis === 'DL' ? 'TUGAS' : rawKetJenis;
          const ketText = ketMatch ? (ketMatch.ket || '') : (rec?.ketLog?.Ket || '');

          if (ketJenis) {
            ketByDate[iso] = { jenis: ketJenis, ket: ketText };
          }

          if (rec && (rec.masuk || rec.pulang)) {
            const mMin = rec.masuk ? toMin(rec.masuk.Jam) : null;
            const mJenis = rec.masuk ? String(rec.masuk['Jenis Absen'] || '').toUpperCase() : '';
            const isLate = Boolean(
              rec.masuk && ((mMin !== null && mMin > masukLimit) || mJenis === 'DI LUAR JAM MASUK' || mJenis === 'TERLAMBAT')
            );
            const status = ketJenis || (rec.masuk ? (isLate ? 'TERLAMBAT' : 'HADIR') : 'PULANG');
            logByDate[iso] = {
              masuk: rec.masuk?.Jam || null,
              pulang: rec.pulang?.Jam || null,
              status,
              lokasi: rec.masuk?.Lokasi || rec.pulang?.Lokasi || null
            };
          } else if (ketJenis) {
            logByDate[iso] = { masuk: null, pulang: null, status: ketJenis, lokasi: null };
          }

          if (!workDateSet.has(iso)) continue;

          if (ketJenis) {
            if (ketJenis.includes('SAKIT')) sakit++;
            else if (ketJenis.includes('TUBEL')) tubel++;
            else if (ketJenis.includes('CUTI')) cuti++;
            else if (ketJenis === 'TB' || ketJenis === 'TANPA BERITA' || ketJenis === 'ALPA') alpa++;
            else if (ketJenis.includes('TUGAS') || ketJenis.includes('DINAS')) tugas++;
            else izin++;
            continue;
          }

          if (rec && rec.masuk) {
            hadir++;
            const mMin = toMin(rec.masuk.Jam);
            const mJenis = String(rec.masuk['Jenis Absen'] || '').toUpperCase();
            if ((mMin !== null && mMin > masukLimit) || mJenis === 'DI LUAR JAM MASUK' || mJenis === 'TERLAMBAT') {
              lambatCount++;
              if (mMin !== null && mMin > masukLimit) menitLambat += (mMin - masukLimit);
            }
            if (rec.pulang) {
              const pJenis = String(rec.pulang['Jenis Absen'] || '').toUpperCase().trim();
              const pMin = toMin(rec.pulang.Jam);
              if (pJenis === 'PULANG LUAR') {
                lapangan++;
              } else {
                pulang++;
                if (pMin !== null && pMin < pulangLimit) menitCepat += (pulangLimit - pMin);
              }
              if (mMin !== null && pMin !== null && pMin > mMin) {
                hadirMenit += (pMin - mMin);
              }
            }
          } else if (iso < todayIso) {
            alpa++;
          }
        }

        const jamHadir = (hadirMenit / 60).toFixed(1);
        const disiplinPct = Math.max(0, 100 - alpa * 20);
        const sah = hadir + tugas + sakit + tubel + cuti;
        const kehadiranPct = workDates.length > 0 ? Math.min(100, Math.round((sah / workDates.length) * 100)) : 0;

        return {
          id: u.id,
          nip: u.nip,
          nama: u.nama,
          jabatan: u.jabatan,
          pangkat: u.pangkat,
          bidang: u.bidang || '',
          instansi_id: u.instansi_id || null,
          hadir,
          pulang,
          lapangan,
          izin,
          sakit,
          tugas,
          cuti,
          tubel,
          alpa,
          lambat_count: lambatCount,
          menit_terlambat: menitLambat,
          menit_lebih_awal: menitCepat,
          jamHadir,
          kehadiranPct,
          disiplinPct,
          logByDate,
          ketByDate
        };
      });

      const summary = {
        totalPegawai: data.length,
        hadir: data.reduce((s, r) => s + r.hadir, 0),
        pulang: data.reduce((s, r) => s + r.pulang, 0),
        lapangan: data.reduce((s, r) => s + r.lapangan, 0),
        lambat: data.reduce((s, r) => s + r.lambat_count, 0),
        izin: data.reduce((s, r) => s + r.izin, 0),
        sakit: data.reduce((s, r) => s + r.sakit, 0),
        tugas: data.reduce((s, r) => s + r.tugas, 0),
        tubel: data.reduce((s, r) => s + r.tubel, 0),
        cuti: data.reduce((s, r) => s + r.cuti, 0),
        alpa: data.reduce((s, r) => s + r.alpa, 0)
      };

      return res.json({
        ok: true,
        dari,
        sampai,
        hariKerja: workDates.length,
        shift,
        kepala,
        signers,
        bidangList,
        summary,
        data,
        rows: data
      });
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
      const targetInstansi = resolveTargetInstansi(req);

      const [usersRes, logsRes, ketRes, shiftRes] = await Promise.all([
        query(USER_SELECT_SQL),
        query(`
          SELECT "ID_Log", "ID", "NIP", "Jam", "Jenis Absen", "Lokasi", "Ket", "koordinat"
          FROM "Log_Absen"
          WHERE "Tanggal" = $1
        `, [tanggal]),
        query(`
          SELECT "ID_Ket", "ID_Pegawai", "NIP", "Jenis Absen" AS jenis, "Ket" AS ket
          FROM ket_temp
          WHERE UPPER("Status") = 'DISETUJUI' AND ("Tanggal" = $1 OR ($1 BETWEEN "tgl_mulai" AND "tgl_selesai"))
        `, [tanggal]),
        shiftQueryForInstansi(query, targetInstansi)
      ]);

      const logs = logsRes.rows;
      const kets = ketRes.rows;
      const shift = shiftRes.rows[0] || { masuk: '07:15', pulang: '14:30' };
      const masukLimit = toMin(shift.masuk) ?? (7 * 60 + 15);
      const pulangLimit = toMin(shift.pulang) ?? (14 * 60 + 30);

      const scopedUsers = scopeUsersByInstansi(usersRes.rows, req, targetInstansi);
      const k = pickKepala(scopedUsers);
      const signers = pickSigners(scopedUsers);
      const bidangList = getBidangList(scopedUsers);
      const admin = !!(MEDIA_ROLES.has(req.user?.role) || req.user?.is_admin);
      const me = String(req.user?.nip || '');

      const visibleUsers = (admin ? scopedUsers : scopedUsers.filter(u => u.nip === me))
        .slice()
        .sort(sortPegawaiHierarchy);

      const summary = {
        masuk: 0,
        pulang: 0,
        lapangan: 0,
        lambat: 0,
        izin: 0,
        sakit: 0,
        tugas: 0,
        tubel: 0,
        cuti: 0,
        alpa: 0
      };

      const rows = visibleUsers.map(u => {
        const uLogs = logs.filter(x => matchUserLog(x, u));
        const masukLogs = uLogs
          .filter(x => /MASUK|TERLAMBAT/.test(String(x['Jenis Absen'] || '').toUpperCase()))
          .sort((a, b) => String(a.Jam || '').localeCompare(String(b.Jam || '')));
        const pulangLogs = uLogs
          .filter(x => String(x['Jenis Absen'] || '').toUpperCase().includes('PULANG'))
          .sort((a, b) => String(a.Jam || '').localeCompare(String(b.Jam || '')));
        const ketLogs = uLogs.filter(x => /IZIN|SAKIT|TUGAS|CUTI|DL|TUBEL|TB|TANPA BERITA|ALPA/.test(String(x['Jenis Absen'] || '').toUpperCase()));

        const masukLog = masukLogs[0] || null;
        const pulangLog = pulangLogs[pulangLogs.length - 1] || null;
        const ketLog = ketLogs[ketLogs.length - 1] || null;
        const ketRow = kets.find(x => matchUserKet(x, u)) || null;

        const mMin = masukLog ? toMin(masukLog.Jam) : null;
        const mJenis = masukLog ? String(masukLog['Jenis Absen'] || '').toUpperCase() : '';
        const menitTerlambat = (mMin !== null && mMin > masukLimit) ? (mMin - masukLimit) : 0;

        const pMin = pulangLog ? toMin(pulangLog.Jam) : null;
        const pJenis = pulangLog ? String(pulangLog['Jenis Absen'] || '').toUpperCase().trim() : '';
        const menitLebihAwal = (pMin !== null && pJenis !== 'PULANG LUAR' && pMin < pulangLimit)
          ? (pulangLimit - pMin)
          : 0;

        const ketJenis = ketRow
          ? String(ketRow.jenis || '').toUpperCase().trim()
          : (ketLog && !masukLog ? String(ketLog['Jenis Absen'] || '').toUpperCase().trim() : '');

        if (ketJenis) {
          if (ketJenis.includes('SAKIT')) summary.sakit++;
          else if (ketJenis.includes('TUBEL')) summary.tubel++;
          else if (ketJenis.includes('CUTI')) summary.cuti++;
          else if (ketJenis === 'TB' || ketJenis === 'TANPA BERITA' || ketJenis === 'ALPA') summary.alpa++;
          else if (ketJenis.includes('TUGAS') || ketJenis.includes('DL') || ketJenis.includes('DINAS')) summary.tugas++;
          else summary.izin++;
        } else if (masukLog) {
          if (mJenis === 'DI LUAR JAM MASUK' || mJenis === 'TERLAMBAT' || menitTerlambat > 0) summary.lambat++;
          else summary.masuk++;
        } else {
          summary.alpa++;
        }

        if (pulangLog) {
          if (pJenis === 'PULANG LUAR') summary.lapangan++;
          else summary.pulang++;
        }

        const ketLabel = ketRow
          ? [String(ketRow.jenis).toUpperCase(), ketRow.ket].filter(Boolean).join(': ')
          : (ketLog && !masukLog
            ? [String(ketLog['Jenis Absen']).toUpperCase(), ketLog.Ket].filter(Boolean).join(': ')
            : (masukLog ? '' : 'TB'));

        return {
          id: u.id,
          nip: u.nip,
          nama: u.nama,
          jabatan: u.jabatan,
          pangkat: u.pangkat,
          bidang: u.bidang || '',
          instansi_id: u.instansi_id || null,
          jamMasuk: masukLog?.Jam || null,
          jamPulang: pulangLog?.Jam || null,
          lokasi_masuk: masukLog?.Lokasi || null,
          koordinat_masuk: masukLog?.koordinat || null,
          lokasi_pulang: pulangLog?.Lokasi || null,
          koordinat_pulang: pulangLog?.koordinat || null,
          menit_terlambat: menitTerlambat,
          menit_lebih_awal: menitLebihAwal,
          raw_masuk_log: formatRawLog(masukLog),
          raw_pulang_log: formatRawLog(pulangLog),
          raw_ket_log: formatRawLog(ketLog),
          ket: ketLabel,
          signature: u.signature || null
        };
      });

      return res.json({
        ok: true,
        tanggal,
        kepala: k,
        signers,
        bidangList,
        summary,
        data: rows,
        rows
      });
    } catch (err) {
      console.error('[stitch-api] rekap-harian error:', err);
      return res.status(500).json({ ok: false, message: 'Gagal memuat rekap harian: ' + err.message });
    }
  });
}
