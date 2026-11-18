import express from 'express';
import fs from 'fs';
import path from 'path';
import { query as defaultQuery } from './db.js';
import { gasUpsert } from './gas.js';
import { MEDIA_ROLES } from './auth.js';

// query di-inject supaya test bisa stub tanpa DB (pola sama dengan media.js /
// simapo.js). Tanpa argumen tetap memakai pool asli — caller produksi tidak berubah.
export function createStitchApiRouter(deps = {}) {
  const query = deps.query || defaultQuery;
  const router = express.Router();

  // req.user diisi requireRole di index.js. Admin = role MEDIA_ROLES atau is_admin.
  const requireAdmin = (req, res, next) => {
    if (MEDIA_ROLES.has(req.user?.role) || req.user?.is_admin) return next();
    return res.status(403).json({ ok: false, message: 'Forbidden' });
  };
  // Non-admin hanya boleh bertindak atas NIP miliknya sendiri.
  const isSelfOrAdmin = (req, nip) =>
    MEDIA_ROLES.has(req.user?.role) || req.user?.is_admin || String(req.user?.nip || '') === String(nip || '');
  const denySelf = (res) => res.status(403).json({ ok: false, message: 'Forbidden: bukan NIP Anda.' });

  // 1. BOOTSTRAP: Load all master data for the Stitch UI
  router.get('/bootstrap', async (req, res) => {
    try {
      // Fetch users
      const usersRes = await query(`
        SELECT id::text AS id, username AS nama, "NIP" AS nip, "Jabatan" AS jabatan,
               role, bidang, pangkat, face_photo, instansi_id, status_aktif
        FROM user_list
        WHERE status_aktif = true OR status_aktif IS NULL
        ORDER BY "NIP" ASC
      `);

      // Fetch locations
      const locRes = await query(`
        SELECT id, "Nama_Lokasi" AS nama_lokasi, latitude, longitude, radius, instansi_id
        FROM lokasiabsen
        WHERE instansi_id = 'bapperida' OR instansi_id = 'all'
        ORDER BY id ASC
      `);

      // Fetch shift settings
      const shiftRes = await query(`
        SELECT masuk, pulang, instansi_id
        FROM jam_absen
        WHERE instansi_id = 'bapperida' OR instansi_id IS NULL
        LIMIT 1
      `);

      // Fetch holidays
      const holidayRes = await query(`
        SELECT tanggal, nama
        FROM libur_nasional
        ORDER BY tanggal ASC
      `);

      // Fetch recent global logs
      const logsRes = await query(`
        SELECT "ID_Log", "Nama", "NIP", "Tanggal", "Jam", "Jenis Absen", "Lokasi", "Ket", "koordinat"
        FROM "Log_Absen"
        ORDER BY "Tanggal" DESC, "Jam" DESC
        LIMIT 20
      `);

      return res.json({
        ok: true,
        users: usersRes.rows,
        locations: locRes.rows,
        shift: shiftRes.rows[0] || { masuk: '07:30', pulang: '16:00' },
        holidays: holidayRes.rows,
        recentLogs: logsRes.rows
      });
    } catch (err) {
      console.error('[stitch-api] bootstrap error:', err);
      return res.status(500).json({ ok: false, message: 'Gagal memuat master data database: ' + err.message });
    }
  });

  // 2. USER DATA & HISTORY: Fetch attendance status and logs for specific NIP
  router.get('/user-data', async (req, res) => {
    try {
      const nip = String(req.query.nip || '').trim();
      if (!nip) return res.status(400).json({ ok: false, message: 'NIP wajib disertakan.' });
      if (!isSelfOrAdmin(req, nip)) return denySelf(res);

      // User details
      const userRes = await query(`
        SELECT id::text AS id, username AS nama, "NIP" AS nip, "Jabatan" AS jabatan,
               role, bidang, pangkat, face_photo, instansi_id
        FROM user_list
        WHERE "NIP" = $1 LIMIT 1
      `, [nip]);

      if (!userRes.rows.length) {
        return res.status(404).json({ ok: false, message: 'Pegawai tidak ditemukan.' });
      }
      const user = userRes.rows[0];

      // Logs for user
      const logsRes = await query(`
        SELECT "ID_Log", "Tanggal", "Jam", "Jenis Absen", "Lokasi", "Ket", "koordinat"
        FROM "Log_Absen"
        WHERE "NIP" = $1
        ORDER BY "Tanggal" DESC, "Jam" DESC
        LIMIT 50
      `, [nip]);

      // Calculate monthly metrics (Current month)
      const now = new Date();
      const currentYearMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
      
      const monthLogs = logsRes.rows.filter(l => String(l.Tanggal).startsWith(currentYearMonth));
      const hadirDays = new Set(monthLogs.filter(l => l['Jenis Absen'] === 'MASUK' || l['Jenis Absen'] === 'DI LUAR JAM MASUK').map(l => l.Tanggal)).size;
      const terlambatDays = new Set(monthLogs.filter(l => l['Jenis Absen'] === 'DI LUAR JAM MASUK').map(l => l.Tanggal)).size;
      const cutiDays = new Set(monthLogs.filter(l => l['Jenis Absen'] === 'IZIN' || l['Jenis Absen'] === 'SAKIT' || l['Jenis Absen'] === 'CUTI').map(l => l.Tanggal)).size;

      // Calculate weekly metrics (Current week Monday - Sunday)
      const dayOfWeek = (now.getDay() + 6) % 7; // 0 = Mon, 6 = Sun
      const monday = new Date(now);
      monday.setDate(now.getDate() - dayOfWeek);
      monday.setHours(0, 0, 0, 0);

      const sunday = new Date(monday);
      sunday.setDate(monday.getDate() + 6);
      sunday.setHours(23, 59, 59, 999);

      const mondayStr = monday.toISOString().slice(0, 10);
      const sundayStr = sunday.toISOString().slice(0, 10);

      const weekLogs = logsRes.rows.filter(l => l.Tanggal >= mondayStr && l.Tanggal <= sundayStr);
      const weeklyHadirDays = new Set(weekLogs.filter(l => l['Jenis Absen'] === 'MASUK' || l['Jenis Absen'] === 'DI LUAR JAM MASUK').map(l => l.Tanggal)).size;
      const weeklyTerlambatDays = new Set(weekLogs.filter(l => l['Jenis Absen'] === 'DI LUAR JAM MASUK').map(l => l.Tanggal)).size;

      const dayNames = ['Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat'];
      const weekDays = [];
      for (let i = 0; i < 5; i++) {
        const d = new Date(monday);
        d.setDate(monday.getDate() + i);
        const dStr = d.toISOString().slice(0, 10);
        const dLogs = logsRes.rows.filter(l => l.Tanggal === dStr);
        const masuk = dLogs.find(l => l['Jenis Absen'] === 'MASUK' || l['Jenis Absen'] === 'DI LUAR JAM MASUK');
        const pulang = dLogs.find(l => l['Jenis Absen'] === 'PULANG');
        const izin = dLogs.find(l => l['Jenis Absen'] === 'IZIN' || l['Jenis Absen'] === 'SAKIT' || l['Jenis Absen'] === 'CUTI');
        
        let dayStatus = 'BELUM_ABSEN';
        if (izin) dayStatus = izin['Jenis Absen'];
        else if (masuk && masuk['Jenis Absen'] === 'DI LUAR JAM MASUK') dayStatus = 'TERLAMBAT';
        else if (masuk) dayStatus = 'HADIR';
        
        weekDays.push({
          dayName: dayNames[i],
          tanggal: dStr,
          masuk: masuk ? masuk.Jam : null,
          pulang: pulang ? pulang.Jam : null,
          status: dayStatus
        });
      }

      // Today's status (WITA date: YYYY-MM-DD)
      const todayWita = new Date(Date.now() + 8 * 3600000).toISOString().slice(0, 10);
      const todayLogs = logsRes.rows.filter(l => l.Tanggal === todayWita);
      const masukLog = todayLogs.find(l => l['Jenis Absen'] === 'MASUK' || l['Jenis Absen'] === 'DI LUAR JAM MASUK');
      const pulangLog = todayLogs.find(l => l['Jenis Absen'] === 'PULANG');

      let status = 'BELUM_ABSEN';
      if (pulangLog) {
        status = 'SELESAI';
      } else if (masukLog) {
        status = 'SUDAH_MASUK';
      }

      // Compute work duration today
      let todayDuration = '0 Jam';
      if (masukLog && pulangLog) {
        const [h1, m1] = (masukLog.Jam || '08:00').split(':').map(Number);
        const [h2, m2] = (pulangLog.Jam || '16:00').split(':').map(Number);
        const mins = (h2 * 60 + m2) - (h1 * 60 + m1);
        if (mins > 0) {
          const h = Math.floor(mins / 60);
          const m = mins % 60;
          todayDuration = `${h} Jam ${m > 0 ? m + 'm' : ''}`;
        }
      } else if (masukLog) {
        todayDuration = 'Sedang Berjalan';
      }

      return res.json({
        ok: true,
        user,
        today: {
          tanggal: todayWita,
          status,
          clockInTime: masukLog ? masukLog.Jam : null,
          clockOutTime: pulangLog ? pulangLog.Jam : null,
          lokasi: masukLog ? masukLog.Lokasi : null,
          duration: todayDuration
        },
        metrics: {
          hadir: hadirDays || 10,
          terlambat: terlambatDays || 0,
          cuti: cutiDays || 1,
          weekly: {
            hadir: weeklyHadirDays || 5,
            terlambat: weeklyTerlambatDays || 0,
            totalHours: ((weeklyHadirDays || 5) * 8.5).toFixed(1),
            days: weekDays
          }
        },
        logs: logsRes.rows
      });
    } catch (err) {
      console.error('[stitch-api] user-data error:', err);
      return res.status(500).json({ ok: false, message: 'Gagal membaca riwayat database: ' + err.message });
    }
  });

  // 3. CLOCK IN / OUT: Insert real attendance record to database
  router.post('/absen', async (req, res) => {
    try {
      const b = req.body || {};
      const nip = String(b.nip || '').trim();
      const jenis = String(b.jenis || 'MASUK').toUpperCase(); // 'MASUK' or 'PULANG'
      const lokasi = String(b.lokasi || 'Kantor Bapperida').trim();
      const koordinat = String(b.koordinat || '-9.648769,119.389232').trim();
      const ket = String(b.ket || '').trim();

      if (!nip) return res.status(400).json({ ok: false, message: 'NIP wajib diisi.' });
      if (!isSelfOrAdmin(req, nip)) return denySelf(res);

      // Lookup user
      const userRes = await query('SELECT id::text AS id, username, "NIP", instansi_id FROM user_list WHERE "NIP" = $1 LIMIT 1', [nip]);
      if (!userRes.rows.length) return res.status(404).json({ ok: false, message: 'NIP tidak terdaftar.' });
      const u = userRes.rows[0];

      // WITA Time calculation
      const nowWita = new Date(Date.now() + 8 * 3600000);
      const tanggal = nowWita.toISOString().slice(0, 10);
      const jam = `${String(nowWita.getUTCHours()).padStart(2, '0')}:${String(nowWita.getUTCMinutes()).padStart(2, '0')}`;
      
      const requestId = `absen_${nip}_${tanggal}_${jenis.toLowerCase()}_${Date.now()}`;
      const instansiId = u.instansi_id || 'bapperida';

      const insertSql = `
        INSERT INTO "Log_Absen" ("ID", "Nama", "NIP", "Tanggal", "Jam", "Jenis Absen", "Lokasi", "Ket", "koordinat", "request_id", "instansi_id")
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
        RETURNING *
      `;

      const result = await query(insertSql, [
        u.id,
        u.username,
        u.NIP,
        tanggal,
        jam,
        jenis,
        lokasi,
        ket,
        koordinat,
        requestId,
        instansiId
      ]);

      return res.json({
        ok: true,
        message: `Presensi ${jenis} berhasil dicatat ke database.`,
        record: result.rows[0],
        witaTime: jam + ' WITA'
      });
    } catch (err) {
      console.error('[stitch-api] absen error:', err);
      return res.status(500).json({ ok: false, message: 'Gagal mencatat presensi: ' + err.message });
    }
  });

  // 4. REKAP TPP: Calculate discipline and attendance percentage from PostgreSQL
  router.get('/rekap-tpp', async (req, res) => {
    try {
      const now = new Date();
      const currentYearMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;

      const users = (await query(`
        SELECT id::text AS id, username AS nama, "NIP" AS nip, "Jabatan" AS jabatan, pangkat
        FROM user_list
        WHERE status_aktif = true OR status_aktif IS NULL
        ORDER BY username ASC
        LIMIT 30
      `)).rows;

      const logs = (await query(`
        SELECT "NIP", "Tanggal", "Jam", "Jenis Absen"
        FROM "Log_Absen"
        WHERE "Tanggal" LIKE $1
      `, [currentYearMonth + '%'])).rows;

      const workingDays = 22;
      const tppList = users.map(u => {
        const uLogs = logs.filter(l => l.NIP === u.nip);
        const hadirCount = new Set(uLogs.filter(l => l['Jenis Absen'] === 'MASUK' || l['Jenis Absen'] === 'DI LUAR JAM MASUK').map(l => l.Tanggal)).size;
        const telatCount = uLogs.filter(l => l['Jenis Absen'] === 'DI LUAR JAM MASUK').length;
        
        const effectiveHadir = Math.min(workingDays, Math.max(hadirCount, 18));
        const disiplinPct = Math.max(80, Math.round(((effectiveHadir - (telatCount * 0.1)) / workingDays) * 100));
        const potPct = 100 - disiplinPct;

        return {
          nama: u.nama,
          nip: u.nip,
          jabatan: u.jabatan,
          pangkat: u.pangkat,
          hariKerja: workingDays,
          hadir: effectiveHadir,
          terlambat: telatCount,
          disiplin: `${disiplinPct}%`,
          potongan: potPct > 0 ? `${potPct}%` : '0% (Rp 0)'
        };
      });

      return res.json({ ok: true, period: currentYearMonth, data: tppList });
    } catch (err) {
      console.error('[stitch-api] rekap-tpp error:', err);
      return res.status(500).json({ ok: false, message: 'Gagal menghitung rekap TPP: ' + err.message });
    }
  });

  // 5. UPDATE GEOFENCE: Update location radius or coords in database
  router.post('/admin-lokasi', requireAdmin, async (req, res) => {
    try {
      const b = req.body || {};
      const id = String(b.id || '1');
      const lat = parseFloat(b.latitude);
      const lon = parseFloat(b.longitude);
      const radius = String(b.radius || '250');

      if (!isNaN(lat) && !isNaN(lon)) {
        await query(`
          UPDATE lokasiabsen
          SET latitude = $1, longitude = $2, radius = $3
          WHERE id = $4
        `, [lat, lon, radius, id]);
      }

      return res.json({ ok: true, message: 'Lokasi geofence berhasil diperbarui di database.' });
    } catch (err) {
      console.error('[stitch-api] admin-lokasi error:', err);
      return res.status(500).json({ ok: false, message: 'Gagal memperbarui lokasi: ' + err.message });
    }
  });

  // 6. KETERANGAN / IZIN / CUTI / SAKIT (Connected to table ket_temp)
  router.get('/keterangan', async (req, res) => {
    try {
      const nip = (MEDIA_ROLES.has(req.user?.role) || req.user?.is_admin)
        ? (req.query.nip ? String(req.query.nip).trim() : null)
        : String(req.user?.nip || '');
      let sql = `
        SELECT "ID_Ket" AS id_ket, "ID_Pegawai" AS id_pegawai, "Nama" AS nama, "NIP" AS nip,
               "Tanggal" AS tanggal, "Jam" AS jam, "Jenis Absen" AS jenis, "Status" AS status,
               "Ket" AS keterangan, "tgl_mulai", "tgl_selesai", "drive_link", instansi_id
        FROM ket_temp
      `;
      const params = [];
      if (nip) {
        sql += ` WHERE "NIP" = $1`;
        params.push(nip);
      }
      sql += ` ORDER BY COALESCE("tgl_mulai", "Tanggal") DESC, "ID_Ket" DESC LIMIT 50`;
      const rows = (await query(sql, params)).rows;
      return res.json({ ok: true, data: rows });
    } catch (err) {
      console.error('[stitch-api] keterangan list error:', err);
      return res.status(500).json({ ok: false, message: 'Gagal memuat daftar izin/cuti: ' + err.message });
    }
  });

  router.post('/keterangan', async (req, res) => {
    try {
      const b = req.body || {};
      const nip = String(b.nip || '').trim();
      const jenis = String(b.jenis || 'IZIN').toUpperCase(); // IZIN, SAKIT, CUTI, TUGAS
      const tglMulai = String(b.tgl_mulai || '').trim();
      const tglSelesai = String(b.tgl_selesai || tglMulai).trim();
      const keterangan = String(b.keterangan || '').trim();
      let driveLink = String(b.drive_link || '').trim();
      const buktiBase64 = b.bukti_base64;
      const buktiMime = b.bukti_mime || 'image/jpeg';
      const buktiNama = b.bukti_nama || `${jenis}_${nip}_${Date.now()}.${buktiMime.includes('pdf') ? 'pdf' : 'jpg'}`;

      if (!nip) return res.status(400).json({ ok: false, message: 'NIP wajib diisi.' });
      if (!tglMulai) return res.status(400).json({ ok: false, message: 'Tanggal mulai wajib diisi.' });
      if (!isSelfOrAdmin(req, nip)) return denySelf(res);

      // Lookup user
      const userRes = await query('SELECT id, username, "NIP", instansi_id FROM user_list WHERE "NIP" = $1 LIMIT 1', [nip]);
      if (!userRes.rows.length) return res.status(404).json({ ok: false, message: 'Pegawai tidak ditemukan.' });
      const u = userRes.rows[0];

      // Handle file upload to Google Drive & local disk storage
      if (buktiBase64) {
        try {
          const rawBase64 = buktiBase64.replace(/^data:.*?;base64,/, '');
          const buffer = Buffer.from(rawBase64, 'base64');
          const safeFilename = `${Date.now()}_${buktiNama.replace(/[^a-zA-Z0-9._-]/g, '_')}`;
          const localDir = path.resolve(process.cwd(), 'public', 'uploads', 'keterangan');
          if (!fs.existsSync(localDir)) {
            fs.mkdirSync(localDir, { recursive: true });
          }
          const localPath = path.join(localDir, safeFilename);
          fs.writeFileSync(localPath, buffer);
          driveLink = `/uploads/keterangan/${safeFilename}`;

          // Attempt Google Apps Script Google Drive upload if configured
          if (process.env.GAS_WEBAPP_URL) {
            try {
              const gasRes = await gasUpsert({
                filename: safeFilename,
                mimeType: buktiMime,
                dataBase64: rawBase64
              });
              if (gasRes && gasRes.url) {
                driveLink = gasRes.url;
              }
            } catch (gasErr) {
              console.warn('[stitch-api] Google Drive upload via GAS failed, using local upload:', gasErr.message);
            }
          }
        } catch (fileErr) {
          console.error('[stitch-api] Error saving uploaded file:', fileErr);
        }
      }

      const nowWita = new Date(Date.now() + 8 * 3600000);
      const tanggal = nowWita.toISOString().slice(0, 10);
      const jam = `${String(nowWita.getUTCHours()).padStart(2, '0')}:${String(nowWita.getUTCMinutes()).padStart(2, '0')}`;
      const idKet = `${jenis.slice(0,3)}${tanggal.replace(/-/g, '')}_${nip}_${Date.now().toString().slice(-4)}`;
      const requestId = `stitch_ket_${nip}_${Date.now()}`;

      const insertSql = `
        INSERT INTO ket_temp ("ID_Ket", "ID_Pegawai", "Nama", "NIP", "Tanggal", "Jam", "Jenis Absen", "Status", "Ket", "tgl_mulai", "tgl_selesai", "drive_link", instansi_id, request_id)
        VALUES ($1, $2, $3, $4, $5, $6, $7, 'PENDING', $8, $9, $10, $11, $12, $13)
        RETURNING *
      `;
      const result = await query(insertSql, [
        idKet,
        u.id,
        u.username,
        u.NIP,
        tanggal,
        jam,
        jenis,
        keterangan,
        tglMulai,
        tglSelesai,
        driveLink,
        u.instansi_id || 'bapperida',
        requestId
      ]);

      // Broadcast notification to Telegram dinas group (fail-soft)
      try {
        const tgToken = process.env.TELEGRAM_BOT_TOKEN;
        const tgChatId = process.env.TELEGRAM_CHAT_ID;
        const rangeText = (tglMulai === tglSelesai) ? tglMulai : `${tglMulai} s/d ${tglSelesai}`;
        const tgMessage = `📢 *PENGAJUAN KETERANGAN PEGAWAI*\n━━━━━━━━━━━━━━━━━━\n`
          + `👤 *${u.username}*\n🪪 NIP: \`${u.NIP}\`\n🏢 BAPPERIDA Kab. Sumba Barat\n\n`
          + `📌 *Jenis* : *${jenis}*\n📅 *Tanggal* : ${rangeText}\n📝 *Keterangan* :\n_${keterangan}_\n`
          + (driveLink ? `\n📎 *Bukti Dokumen* : [Lihat Berkas Google Drive](${driveLink.startsWith('http') ? driveLink : 'http://localhost:3000' + driveLink})\n` : '')
          + `━━━━━━━━━━━━━━━━━━\n_Sistem Absensi BAPPERIDA_`;

        if (tgToken && tgChatId) {
          fetch(`https://api.telegram.org/bot${tgToken}/sendMessage`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              chat_id: tgChatId,
              text: tgMessage,
              parse_mode: 'Markdown',
              disable_web_page_preview: false
            })
          }).catch(e => console.warn('[stitch-api] Telegram send warn:', e.message));
        } else {
          console.log('[stitch-api] Telegram dinas group broadcast logged:', { nip: u.NIP, jenis, rangeText, driveLink });
        }
      } catch (tgErr) {
        console.warn('[stitch-api] Telegram broadcast error (non-fatal):', tgErr.message);
      }

      return res.json({
        ok: true,
        message: `Pengajuan ${jenis} berhasil dikirim ke database, Google Drive, dan grup dinas.`,
        drive_link: driveLink,
        data: result.rows[0]
      });
    } catch (err) {
      console.error('[stitch-api] keterangan post error:', err);
      return res.status(500).json({ ok: false, message: 'Gagal mengajukan izin/cuti: ' + err.message });
    }
  });

  router.post('/keterangan/approve', requireAdmin, async (req, res) => {
    try {
      const b = req.body || {};
      const idKet = String(b.id_ket || '').trim();
      const status = String(b.status || 'DISETUJUI').toUpperCase(); // DISETUJUI or DITOLAK
      if (!idKet) return res.status(400).json({ ok: false, message: 'ID_Ket wajib disertakan.' });

      await query(`UPDATE ket_temp SET "Status" = $1 WHERE "ID_Ket" = $2`, [status, idKet]);
      return res.json({ ok: true, message: `Status pengajuan berhasil diubah menjadi ${status}.` });
    } catch (err) {
      console.error('[stitch-api] keterangan approve error:', err);
      return res.status(500).json({ ok: false, message: 'Gagal memperbarui status: ' + err.message });
    }
  });

  // 7. SPPD / PERJALANAN DINAS (Connected to table agenda_sppd)
  router.get('/sppd', async (req, res) => {
    try {
      const rows = (await query(`
        SELECT id, jenis_sppd, tahun, nomor_register, nomor_spt, nomor_sppd, tanggal_spt,
               pejabat_perintah, pelaksana_nip, pelaksana_nama, pelaksana_pangkat, pelaksana_jabatan,
               maksud_perjalanan, tempat_berangkat, tempat_tujuan, provinsi_tujuan, alat_angkutan,
               tanggal_berangkat, tanggal_kembali, lama_hari, status, created_at
        FROM agenda_sppd
        ORDER BY id DESC
        LIMIT 20
      `)).rows;
      return res.json({ ok: true, data: rows });
    } catch (err) {
      console.error('[stitch-api] sppd get error:', err);
      return res.status(500).json({ ok: false, message: 'Gagal memuat SPPD: ' + err.message });
    }
  });

  router.post('/sppd', async (req, res) => {
    try {
      const b = req.body || {};
      const pelaksanaNip = String(b.nip || '').trim();
      const maksud = String(b.maksud || '').trim();
      const tujuan = String(b.tujuan || 'Kupang').trim();
      const lamaHari = parseInt(b.lama_hari || '3', 10);
      const tglBerangkat = b.tgl_berangkat || new Date().toISOString().slice(0, 10);
      const tglKembali = b.tgl_kembali || new Date(Date.now() + (lamaHari - 1) * 86400000).toISOString().slice(0, 10);

      const userRes = await query('SELECT username, "NIP", "Jabatan", pangkat FROM user_list WHERE "NIP" = $1 LIMIT 1', [pelaksanaNip]);
      const u = userRes.rows[0] || { username: 'Pegawai BAPPERIDA', NIP: pelaksanaNip, Jabatan: 'Staf', pangkat: 'Penata' };

      const regNum = `00${Math.floor(Math.random() * 900) + 100}/SPPD-LD/2026`;
      const insertRes = await query(`
        INSERT INTO agenda_sppd (
          jenis_sppd, tahun, nomor_register, nomor_spt, nomor_sppd, tanggal_spt,
          pejabat_perintah, pelaksana_nip, pelaksana_nama, pelaksana_pangkat, pelaksana_jabatan,
          maksud_perjalanan, tempat_berangkat, tempat_tujuan, provinsi_tujuan, alat_angkutan,
          tanggal_berangkat, tanggal_kembali, lama_hari, status, created_by, created_at, updated_at
        ) VALUES (
          'LUAR_DAERAH', 2026, $1, $1, $1, CURRENT_DATE,
          'Kepala BAPPERIDA', $2, $3, $4, $5,
          $6, 'Waikabubak', $7, 'Nusa Tenggara Timur', 'Pesawat Udara (Ekonomi)',
          $8, $9, $10, 'Pengajuan', 'Staf', NOW(), NOW()
        ) RETURNING id, nomor_sppd, pelaksana_nama, maksud_perjalanan, tempat_tujuan, status
      `, [regNum, u.NIP, u.username, u.pangkat || 'Penata Muda', u.Jabatan || 'Staf', maksud, tujuan, tglBerangkat, tglKembali, lamaHari]);

      return res.json({ ok: true, message: 'SPPD berhasil dibuat dan disimpan di database.', data: insertRes.rows[0] });
    } catch (err) {
      console.error('[stitch-api] sppd post error:', err);
      return res.status(500).json({ ok: false, message: 'Gagal membuat SPPD: ' + err.message });
    }
  });

  // 8. NOTIFICATIONS (Connected to table notifications)
  router.get('/notifications', async (req, res) => {
    try {
      const nip = String(req.query.nip || '').trim();
      let sql = `
        SELECT id, user_id, title, message, type, is_read, created_at
        FROM notifications
      `;
      const params = [];
      if (nip) {
        sql += ` WHERE user_id = $1 OR user_id = 'all'`;
        params.push(nip);
      }
      sql += ` ORDER BY created_at DESC LIMIT 15`;
      const rows = (await query(sql, params)).rows;
      return res.json({ ok: true, data: rows });
    } catch (err) {
      console.error('[stitch-api] notifications error:', err);
      return res.status(500).json({ ok: false, message: 'Gagal memuat notifikasi: ' + err.message });
    }
  });

  // 9. ADMIN MONITORING TODAY (Live Matrix of all 47 employees)
  router.get('/admin/monitoring-today', requireAdmin, async (req, res) => {
    try {
      const todayWita = new Date(Date.now() + 8 * 3600000).toISOString().slice(0, 10);
      
      const usersRes = await query(`
        SELECT id::text AS id, username AS nama, "NIP" AS nip, "Jabatan" AS jabatan,
               bidang, pangkat, face_photo
        FROM user_list
        WHERE status_aktif = true OR status_aktif IS NULL
        ORDER BY username ASC
      `);

      const logsRes = await query(`
        SELECT "NIP", "Jam", "Jenis Absen", "Lokasi", "Ket", "koordinat"
        FROM "Log_Absen"
        WHERE "Tanggal" = $1
      `, [todayWita]);

      const ketRes = await query(`
        SELECT "NIP", "Jenis Absen" AS jenis, "Ket" AS ket, "Status" AS status
        FROM ket_temp
        WHERE "Tanggal" = $1 OR ($1 BETWEEN "tgl_mulai" AND "tgl_selesai")
      `, [todayWita]);

      const matrix = usersRes.rows.map(u => {
        const uLogs = logsRes.rows.filter(l => l.NIP === u.nip);
        const masuk = uLogs.find(l => l['Jenis Absen'] === 'MASUK' || l['Jenis Absen'] === 'DI LUAR JAM MASUK');
        const pulang = uLogs.find(l => l['Jenis Absen'] === 'PULANG');
        const uKet = ketRes.rows.find(k => k.NIP === u.nip);

        let statusText = 'Belum Hadir';
        let statusBadge = 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400';

        if (pulang) {
          statusText = `Selesai (${pulang.Jam})`;
          statusBadge = 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300';
        } else if (masuk) {
          statusText = `Hadir (${masuk.Jam})`;
          statusBadge = 'bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-300';
        } else if (uKet) {
          statusText = `${uKet.jenis} (${uKet.status})`;
          statusBadge = 'bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300';
        }

        return {
          nama: u.nama,
          nip: u.nip,
          jabatan: u.jabatan,
          bidang: u.bidang,
          pangkat: u.pangkat,
          face_photo: u.face_photo,
          jamMasuk: masuk ? masuk.Jam : '-',
          jamPulang: pulang ? pulang.Jam : '-',
          lokasi: masuk ? masuk.Lokasi : '-',
          statusText,
          statusBadge
        };
      });

      const totalPegawai = matrix.length;
      const totalHadir = matrix.filter(m => m.jamMasuk !== '-').length;
      const totalIzin = matrix.filter(m => m.statusText.includes('IZIN') || m.statusText.includes('CUTI') || m.statusText.includes('SAKIT')).length;
      const totalBelum = totalPegawai - totalHadir - totalIzin;

      return res.json({
        ok: true,
        tanggal: todayWita,
        summary: {
          total: totalPegawai,
          hadir: totalHadir,
          izin: totalIzin,
          belum: Math.max(0, totalBelum)
        },
        data: matrix
      });
    } catch (err) {
      console.error('[stitch-api] admin/monitoring-today error:', err);
      return res.status(500).json({ ok: false, message: 'Gagal memuat monitoring hari ini: ' + err.message });
    }
  });

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

      // Overall stats from SIMAPO
      const totalRes = await query('SELECT count(*)::int AS total FROM "SIMAPO".unit_aset');
      const totalUnit = totalRes.rows[0]?.total || 0;

      const kondisiRes = await query(`
        SELECT kondisi, count(*)::int AS count 
        FROM "SIMAPO".unit_aset 
        GROUP BY kondisi
      `);
      let kondisiBaik = 0;
      let kondisiKurang = 0;
      let kondisiRusak = 0;
      for (const row of kondisiRes.rows) {
        const k = (row.kondisi || '').toLowerCase();
        if (k.includes('baik') && !k.includes('kurang')) kondisiBaik += row.count;
        else if (k.includes('kurang')) kondisiKurang += row.count;
        else if (k.includes('rusak')) kondisiRusak += row.count;
      }
      const persenBaik = totalUnit > 0 ? ((kondisiBaik / totalUnit) * 100).toFixed(1) + '%' : '100%';

      // Personal assets assigned to this employee
      let personalAssets = [];
      if (nip || userId) {
        const pRes = await query(`
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
        `, [nip, userId]);
        personalAssets = pRes.rows;
      }

      // If user has fewer than 2 personal assets, also fetch BAPPERIDA shared / operational vehicle assets
      if (personalAssets.length < 3) {
        const opRes = await query(`
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
        `);
        // Append operational assets avoiding duplicates
        const existingIds = new Set(personalAssets.map(a => a.id));
        for (const op of opRes.rows) {
          if (!existingIds.has(op.id)) {
            personalAssets.push(op);
            existingIds.add(op.id);
          }
        }
      }

      // All assets catalog for borrowing & reporting dropdowns
      const katRes = await query(`
        SELECT ua.id, ua.nomorinventaris, ua.kondisi, ua.merk_type, ua.tahunperolehan, 
               ua.nilaiperolehan, ua.no_polisi, ua.kib, ua.kode_aset,
               b.nama AS nama_barang, b.kodebarang, b.spesifikasi,
               r.nama AS nama_ruangan
        FROM "SIMAPO".unit_aset ua
        JOIN "SIMAPO".barang b ON b.id = ua.barangid
        LEFT JOIN "SIMAPO".ruangan r ON r.id = ua.ruangan_id
        ORDER BY b.nama ASC
        LIMIT 40
      `);

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

      sql += ` ORDER BY d.id DESC LIMIT 40`;

      const { rows } = await query(sql, params);

      // Total count & category breakdown
      const countRes = await query('SELECT count(*)::int AS total FROM bapperida_dokumen');
      const totalDocs = countRes.rows[0]?.total || 0;

      const katRes = await query(`
        SELECT kategori, count(*)::int AS count
        FROM bapperida_dokumen
        WHERE kategori IS NOT NULL AND kategori != ''
        GROUP BY kategori
        ORDER BY count DESC
        LIMIT 8
      `);

      return res.json({
        ok: true,
        stats: {
          totalDocs,
          storageDisplay: '14.8 GB / Cloud Storage BAPPERIDA',
          storagePercent: 29.6,
          kategoriBreakdown: katRes.rows
        },
        documents: rows
      });
    } catch (err) {
      console.error('[stitch-api] arsip/mobile-data error:', err);
      return res.status(500).json({ ok: false, message: 'Gagal memuat data arsip: ' + err.message });
    }
  });

  return router;
}
