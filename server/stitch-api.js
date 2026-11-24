import express from 'express';
import fs from 'fs';
import path from 'path';
import { query as defaultQuery } from './db.js';
import { gasUpsert } from './gas.js';
import { MEDIA_ROLES } from './auth.js';
import { formatAbsenMessage } from './absen.js';
import { analisisRiwayatLokasi } from './absen-validate.js';
import { mountStitchRekapRoutes } from './stitch-api-rekap.js';
import { mountStitchAsetArsipRoutes } from './stitch-api-aset-arsip.js';

// query di-inject supaya test bisa stub tanpa DB (pola sama dengan media.js /
// simapo.js). Tanpa argumen tetap memakai pool asli — caller produksi tidak berubah.
export function createStitchApiRouter(deps = {}) {
  const query = deps.query || defaultQuery;
  const sendTelegram = deps.sendTelegram || null;
  const notifyKeterangan = deps.notifyKeterangan || null;
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
      // Fetch users (tanpa face_photo base64 agar payload bootstrap tetap ringan)
      // dan seluruh master data secara paralel untuk memangkas latency DB remote.
      const [usersRes, locRes, shiftRes, holidayRes, logsRes] = await Promise.all([
        query(`
          SELECT id::text AS id, username AS nama, "NIP" AS nip, "Jabatan" AS jabatan,
                 role, bidang, pangkat, instansi_id, status_aktif,
                 (face_photo IS NOT NULL AND face_photo != '') AS has_face
          FROM user_list
          WHERE status_aktif = true OR status_aktif IS NULL
          ORDER BY "NIP" ASC
        `),
        query(`
          SELECT id, "Nama_Lokasi" AS nama_lokasi, latitude, longitude, radius, hari, ip_range, instansi_id
          FROM lokasiabsen
          WHERE instansi_id = 'bapperida' OR instansi_id = 'all'
          ORDER BY id ASC
        `),
        query(`
          SELECT masuk, pulang, instansi_id
          FROM jam_absen
          WHERE instansi_id = 'bapperida' OR instansi_id IS NULL
          LIMIT 1
        `),
        query(`
          SELECT tanggal, nama
          FROM libur_nasional
          ORDER BY tanggal ASC
        `),
        query(`
          SELECT "ID_Log", "Nama", "NIP", "Tanggal", "Jam", "Jenis Absen", "Lokasi", "Ket", "koordinat"
          FROM "Log_Absen"
          ORDER BY "Tanggal" DESC, "Jam" DESC
          LIMIT 20
        `),
      ]);

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

      // Today's date (WITA: YYYY-MM-DD) computed upfront so all 3 queries run in parallel
      const todayWita = new Date(Date.now() + 8 * 3600000).toISOString().slice(0, 10);

      const [userRes, logsRes, ketTodayRes] = await Promise.all([
        query(`
          SELECT u.id::text AS id, u.username AS nama, u."NIP" AS nip, u."Jabatan" AS jabatan,
                 u.role, u.bidang, u.pangkat, u.face_photo, u.face_histogram, u.face_saved_at, u.face_model, u.instansi_id,
                 t.signature
          FROM user_list u
          LEFT JOIN tanda_tangan t ON t.nip = u."NIP"
          WHERE u."NIP" = $1 LIMIT 1
        `, [nip]),
        query(`
          SELECT "ID_Log", "Tanggal", "Jam", "Jenis Absen", "Lokasi", "Ket", "koordinat"
          FROM "Log_Absen"
          WHERE "NIP" = $1
          ORDER BY "Tanggal" DESC, "Jam" DESC
          LIMIT 50
        `, [nip]),
        query(`
          SELECT "Jenis Absen" AS jenis, "Ket" AS ket, "Status" AS status FROM ket_temp
          WHERE "NIP" = $1 AND UPPER("Status") = 'DISETUJUI'
            AND ("Tanggal" = $2 OR ($2 BETWEEN "tgl_mulai" AND "tgl_selesai"))
          LIMIT 1
        `, [nip, todayWita]),
      ]);

      if (!userRes.rows.length) {
        return res.status(404).json({ ok: false, message: 'Pegawai tidak ditemukan.' });
      }
      const user = userRes.rows[0];
      let rolePermissions = [];
      try {
        const normRoleId = String(user.role || 'USER').trim().toUpperCase().replace(/\s+/g, '_');
        const rpRes = await query('SELECT permissions FROM absen_roles WHERE id = $1 LIMIT 1', [normRoleId]);
        const rawPerms = rpRes?.rows?.[0]?.permissions;
        if (Array.isArray(rawPerms)) rolePermissions = rawPerms;
        else if (typeof rawPerms === 'string') rolePermissions = JSON.parse(rawPerms) || [];
      } catch (_) {
        rolePermissions = [];
      }
      user.role_permissions = rolePermissions;

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

      // Total jam kerja minggu ini: hanya hari yang punya jam masuk DAN pulang.
      const weeklyHours = weekDays.reduce((sum, d) => {
        if (!d.masuk || !d.pulang) return sum;
        const [h1, m1] = String(d.masuk).split(':').map(Number);
        const [h2, m2] = String(d.pulang).split(':').map(Number);
        const mins = (h2 * 60 + m2) - (h1 * 60 + m1);
        return mins > 0 ? sum + mins / 60 : sum;
      }, 0);

      // Today's status (WITA date: YYYY-MM-DD)
      const todayLogs = logsRes.rows.filter(l => l.Tanggal === todayWita);
      const masukLog = todayLogs.find(l => l['Jenis Absen'] === 'MASUK' || l['Jenis Absen'] === 'DI LUAR JAM MASUK');
      const pulangLog = todayLogs.find(l => String(l['Jenis Absen'] || '').includes('PULANG'));
      const ketToday = ketTodayRes.rows[0] || null;

      let status = 'BELUM_ABSEN';
      if (pulangLog) {
        status = 'SELESAI';
      } else if (masukLog) {
        status = 'SUDAH_MASUK';
      } else if (ketToday) {
        status = 'KETERANGAN';
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
          duration: todayDuration,
          keterangan: ketToday ? String(ketToday.jenis || 'KETERANGAN').toUpperCase() : null
        },
        metrics: {
          hadir: hadirDays,
          terlambat: terlambatDays,
          cuti: cutiDays,
          weekly: {
            hadir: weeklyHadirDays,
            terlambat: weeklyTerlambatDays,
            totalHours: weeklyHours.toFixed(1),
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

      // WITA Time calculation (dukung offline_at tervalidasi untuk sinkronisasi offline native)
      const nowMs = Date.now();
      let effectiveMs = nowMs;
      let isOfflineSync = false;
      if (b.offline_at) {
        const parsedMs = Date.parse(String(b.offline_at));
        const maxFutureMs = 5 * 60 * 1000;
        const maxPastMs = 7 * 24 * 3600 * 1000;
        if (!Number.isFinite(parsedMs) || parsedMs > nowMs + maxFutureMs || parsedMs < nowMs - maxPastMs) {
          return res.status(400).json({ ok: false, message: 'Waktu offline tidak valid atau kedaluwarsa.' });
        }
        effectiveMs = parsedMs;
        isOfflineSync = true;
      }
      const nowWita = new Date(effectiveMs + 8 * 3600000);
      const tanggal = nowWita.toISOString().slice(0, 10);
      const jam = `${String(nowWita.getUTCHours()).padStart(2, '0')}:${String(nowWita.getUTCMinutes()).padStart(2, '0')}`;

      const instansiId = u.instansi_id || 'bapperida';

      if (!['MASUK', 'PULANG', 'PULANG LUAR'].includes(jenis)) return res.status(400).json({ ok: false, message: 'Jenis presensi tidak valid.' });

      const rawReqId = String(b.request_id || '').trim();
      const clientRequestId = /^[a-zA-Z0-9._:-]{8,120}$/.test(rawReqId) ? rawReqId : '';
      if (clientRequestId) {
        const dupRes = await query(
          'SELECT * FROM "Log_Absen" WHERE request_id = $1 AND "NIP" = $2 LIMIT 1',
          [clientRequestId, u.NIP]
        );
        if (dupRes.rows.length) {
          const prev = dupRes.rows[0];
          return res.json({
            ok: true,
            deduplicated: true,
            message: 'Presensi sudah tercatat sebelumnya.',
            record: prev,
            witaTime: (prev.Jam || jam) + ' WITA'
          });
        }
      }

      // Cek apakah hari ini ada keterangan (IZIN / SAKIT / CUTI / DL / TUGAS / TUBEL) yang disetujui
      const ketToday = (await query(`
        SELECT "Jenis Absen" AS jenis FROM ket_temp
        WHERE "NIP" = $1 AND UPPER("Status") = 'DISETUJUI'
          AND ("Tanggal" = $2 OR ($2 BETWEEN "tgl_mulai" AND "tgl_selesai"))
        LIMIT 1
      `, [u.NIP, tanggal])).rows[0];
      if (ketToday) {
        return res.status(409).json({ ok: false, message: `Tidak dapat presensi karena status hari ini adalah ${String(ketToday.jenis).toUpperCase()}.` });
      }

      // Urutan & duplikasi: 1x masuk, pulang hanya setelah masuk, 1x pulang
      const todays = (await query('SELECT "Jenis Absen" FROM "Log_Absen" WHERE "NIP" = $1 AND "Tanggal" = $2', [u.NIP, tanggal])).rows.map(r => String(r['Jenis Absen']).toUpperCase());
      const hasMasuk = todays.some(j => j.includes('MASUK') || j === 'TERLAMBAT');
      const hasPulang = todays.some(j => j.includes('PULANG'));
      if (jenis === 'MASUK' && hasMasuk) return res.status(409).json({ ok: false, message: 'Anda sudah presensi masuk hari ini.' });
      if (jenis.startsWith('PULANG') && !hasMasuk) return res.status(409).json({ ok: false, message: 'Presensi masuk belum tercatat.' });
      if (jenis.startsWith('PULANG') && hasPulang) return res.status(409).json({ ok: false, message: 'Anda sudah presensi pulang hari ini.' });
      if (jenis === 'PULANG LUAR' && !ket) return res.status(400).json({ ok: false, message: 'Tuliskan lokasi/kegiatan lapangan sebelum presensi pulang dari lapangan.' });
      if (jenis === 'PULANG LUAR' && process.env.ABSEN_PULANG_LUAR_WAJIB_PENUGASAN !== 'false') {
        const pgRes = await query(
          `SELECT 1 FROM penugasan WHERE nip = $1 AND tanggal = $2 AND (instansi_id = $3 OR instansi_id IS NULL OR instansi_id = '') LIMIT 1`,
          [u.NIP, tanggal, instansiId]
        );
        if (!pgRes?.rows?.length) {
          return res.status(403).json({ ok: false, message: 'Pulang dari lapangan membutuhkan penugasan/SPT aktif hari ini.' });
        }
      }

      // Geofence: koordinat asli perangkat harus dalam radius salah satu lokasi kantor (kecuali PULANG LUAR)
      const m = koordinat.match(/^(-?\d+(\.\d+)?),\s*(-?\d+(\.\d+)?)$/);
      if (!m) return res.status(400).json({ ok: false, message: 'Koordinat GPS tidak valid.' });
      const [lat, lon] = [parseFloat(m[1]), parseFloat(m[3])];
      const acc = Number(b.akurasi) || 0;
      if (acc > 100) return res.status(400).json({ ok: false, message: `Akurasi GPS rendah (${Math.round(acc)} m). Coba di area terbuka.` });

      // Deteksi teleport GPS berdasarkan riwayat 2 hari terakhir di Log_Absen (default tolak >= 200 km/jam)
      const teleportBlokKmh = process.env.ABSEN_TELEPORT_BLOK_KMH !== undefined
        ? Number(process.env.ABSEN_TELEPORT_BLOK_KMH)
        : 200;
      if (teleportBlokKmh > 0) {
        try {
          const batas = new Date(Date.parse(`${tanggal}T00:00:00Z`) - 2 * 86400000).toISOString().slice(0, 10);
          const rwRes = await query(
            `SELECT "Tanggal", "Jam", koordinat FROM "Log_Absen"
             WHERE "NIP" = $1 AND "Tanggal" >= $2 AND koordinat IS NOT NULL AND koordinat <> '' AND koordinat <> '-'
             ORDER BY "Tanggal" DESC, "Jam" DESC LIMIT 5`,
            [u.NIP, batas]
          );
          const analisis = analisisRiwayatLokasi({
            lat,
            lng: lon,
            serverTime: { tanggal, jam },
            riwayat: rwRes?.rows || [],
            blokKmh: teleportBlokKmh,
          });
          if (analisis.blok) {
            return res.status(403).json({
              ok: false,
              kode_tolak: 'GPS_TELEPORT',
              message: 'Perpindahan lokasi dari absen sebelumnya tidak masuk akal (terdeteksi teleport GPS). Hubungi admin bila ini benar.',
            });
          }
        } catch (e) {
          console.warn('[stitch-api] analisis riwayat lokasi dilewati:', e?.message || e);
        }
      }
      let matchedLoc = lokasi;
      if (jenis !== 'PULANG LUAR') {
        const locs = (await query(`SELECT "Nama_Lokasi" AS nama, latitude, longitude, radius FROM lokasiabsen WHERE instansi_id = $1 OR instansi_id = 'all'`, [instansiId])).rows;
        const dist = (a, b2, c, d) => { const R = 6371000, r = Math.PI / 180, dl = (c - a) * r, dn = (d - b2) * r; const h = Math.sin(dl / 2) ** 2 + Math.cos(a * r) * Math.cos(c * r) * Math.sin(dn / 2) ** 2; return 2 * R * Math.asin(Math.sqrt(h)); };
        if (locs.length) {
          const hit = locs.find(l => dist(lat, lon, Number(l.latitude), Number(l.longitude)) <= (Number(l.radius) || 250) + acc * 0.5);
          if (!hit) return res.status(403).json({ ok: false, message: 'Anda berada di luar radius lokasi presensi.' });
          if (hit.nama) matchedLoc = hit.nama;
        }
      }
      const requestId = clientRequestId || `absen_${nip}_${tanggal}_${jenis.toLowerCase()}_${Date.now()}`;
      const finalKet = isOfflineSync && !ket.includes('[Offline Sync]')
        ? (ket ? `${ket} [Offline Sync]` : '[Offline Sync]')
        : ket;

      const insertSql = `
        INSERT INTO "Log_Absen" ("ID", "Nama", "NIP", "Tanggal", "Jam", "Jenis Absen", "Lokasi", "Ket", "koordinat", "request_id", "instansi_id")
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
        ON CONFLICT ("request_id") DO NOTHING
        RETURNING *
      `;

      const result = await query(insertSql, [
        u.id,
        u.username,
        u.NIP,
        tanggal,
        jam,
        jenis,
        matchedLoc,
        finalKet,
        koordinat,
        requestId,
        instansiId
      ]);

      if (!result.rows.length) {
        return res.json({
          ok: true,
          deduplicated: true,
          message: 'Presensi sudah tercatat sebelumnya.',
          record: null,
          witaTime: jam + ' WITA'
        });
      }

      // Fire-and-forget: kirim konfirmasi absen ke Telegram pribadi pegawai (pola server/absen.js)
      if (sendTelegram && u.id) {
        Promise.resolve().then(async () => {
          let jamMasuk = '07:15';
          let jamPulang = '14:30';
          try {
            const sRes = await query(
              `SELECT masuk, pulang FROM jam_absen WHERE instansi_id = $1 OR instansi_id IS NULL ORDER BY CASE WHEN instansi_id = $1 THEN 0 ELSE 1 END LIMIT 1`,
              [instansiId]
            );
            if (sRes?.rows?.[0]?.masuk) jamMasuk = sRes.rows[0].masuk;
            if (sRes?.rows?.[0]?.pulang) jamPulang = sRes.rows[0].pulang;
          } catch {}
          const text = formatAbsenMessage({
            nama: u.username,
            nip: u.NIP,
            jenisAbsen: jenis,
            namaLokasi: matchedLoc,
            tanggal,
            jam,
            jamMasuk,
            jamPulang,
          });
          await sendTelegram({ chatId: String(u.id), text });
        }).catch((e) => console.warn('[stitch-api] notif Telegram absen dilewati:', e?.message || e));
      }

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

  // 5b. UPDATE JAM KERJA: Simpan jam masuk & pulang ke tabel jam_absen
  router.post('/admin-jam-absen', requireAdmin, async (req, res) => {
    try {
      const b = req.body || {};
      const masuk = String(b.masuk || '07:15').trim();
      const pulang = String(b.pulang || '14:30').trim();
      const instansiId = String(b.instansi_id || req.user?.instansi_id || 'bapperida').trim();
      if (!/^\d{2}:\d{2}$/.test(masuk) || !/^\d{2}:\d{2}$/.test(pulang)) {
        return res.status(400).json({ ok: false, message: 'Format jam harus HH:MM.' });
      }
      await query(`
        INSERT INTO jam_absen (key, instansi_id, masuk, pulang, diubah_oleh, updated_at)
        VALUES ('jam_absen_global', $1, $2, $3, $4, NOW())
        ON CONFLICT (key, instansi_id) DO UPDATE
          SET masuk = EXCLUDED.masuk, pulang = EXCLUDED.pulang, diubah_oleh = EXCLUDED.diubah_oleh, updated_at = NOW()
      `, [instansiId, masuk, pulang, String(req.user?.id || req.user?.nip || 'admin')]);

      return res.json({ ok: true, message: `Jam kerja (${masuk} - ${pulang} WITA) berhasil disimpan di database.`, shift: { masuk, pulang } });
    } catch (err) {
      console.error('[stitch-api] admin-jam-absen error:', err);
      return res.status(500).json({ ok: false, message: 'Gagal menyimpan jam kerja: ' + err.message });
    }
  });

  // 5c. KELOLA HARI LIBUR NASIONAL & CUTI BERSAMA (libur_nasional)
  router.post('/admin-libur', requireAdmin, async (req, res) => {
    try {
      const b = req.body || {};
      const tanggal = String(b.tanggal || '').trim();
      const nama = String(b.nama || 'Hari Libur Resmi').trim();
      if (!/^\d{4}-\d{2}-\d{2}$/.test(tanggal)) {
        return res.status(400).json({ ok: false, message: 'Format tanggal harus YYYY-MM-DD.' });
      }
      await query(`
        INSERT INTO libur_nasional (tanggal, nama, ditambahkan_oleh)
        VALUES ($1, $2, $3)
        ON CONFLICT (tanggal) DO UPDATE SET nama = EXCLUDED.nama
      `, [tanggal, nama, String(req.user?.id || req.user?.nip || 'admin')]);

      const rows = (await query(`SELECT tanggal, nama FROM libur_nasional ORDER BY tanggal ASC`)).rows;
      return res.json({ ok: true, message: 'Hari libur berhasil disimpan.', holidays: rows });
    } catch (err) {
      console.error('[stitch-api] admin-libur add error:', err);
      return res.status(500).json({ ok: false, message: 'Gagal menyimpan hari libur: ' + err.message });
    }
  });

  router.post('/admin-libur/delete', requireAdmin, async (req, res) => {
    try {
      const tanggal = String(req.body?.tanggal || '').trim();
      if (!tanggal) return res.status(400).json({ ok: false, message: 'Tanggal wajib diisi.' });
      await query(`DELETE FROM libur_nasional WHERE tanggal = $1`, [tanggal]);
      const rows = (await query(`SELECT tanggal, nama FROM libur_nasional ORDER BY tanggal ASC`)).rows;
      return res.json({ ok: true, message: 'Hari libur dihapus.', holidays: rows });
    } catch (err) {
      console.error('[stitch-api] admin-libur delete error:', err);
      return res.status(500).json({ ok: false, message: 'Gagal menghapus hari libur: ' + err.message });
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

      // Handle file upload: prioritaskan Google Drive (0 byte ke disk lokal bila sukses),
      // fallback ke disk lokal hanya jika GAS_WEBAPP_URL belum diset atau gagal.
      if (buktiBase64) {
        try {
          const rawBase64 = buktiBase64.replace(/^data:.*?;base64,/, '');
          const safeFilename = `${Date.now()}_${buktiNama.replace(/[^a-zA-Z0-9._-]/g, '_')}`;

          let uploadedToDrive = false;
          if (process.env.GAS_WEBAPP_URL) {
            try {
              const gasRes = await gasUpsert({
                filename: safeFilename,
                mimeType: buktiMime,
                dataBase64: rawBase64
              });
              if (gasRes && gasRes.url) {
                driveLink = gasRes.url;
                uploadedToDrive = true;
              }
            } catch (gasErr) {
              console.warn('[stitch-api] Google Drive upload via GAS failed, falling back to local upload:', gasErr.message);
            }
          }

          if (!uploadedToDrive) {
            const buffer = Buffer.from(rawBase64, 'base64');
            const localDir = path.resolve(process.cwd(), 'public', 'uploads', 'keterangan');
            if (!fs.existsSync(localDir)) {
              fs.mkdirSync(localDir, { recursive: true });
            }
            const localPath = path.join(localDir, safeFilename);
            fs.writeFileSync(localPath, buffer);
            driveLink = `/uploads/keterangan/${safeFilename}`;
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
      const isAdminActor = Boolean(MEDIA_ROLES.has(req.user?.role) || req.user?.is_admin);
      const statusVal = (jenis === 'IZIN' && !(isAdminActor && b.auto_approve === true)) ? 'PENDING' : 'DISETUJUI';

      const insertSql = `
        INSERT INTO ket_temp ("ID_Ket", "ID_Pegawai", "Nama", "NIP", "Tanggal", "Jam", "Jenis Absen", "Status", "Ket", "tgl_mulai", "tgl_selesai", "drive_link", instansi_id, request_id)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
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
        statusVal,
        keterangan,
        tglMulai,
        tglSelesai,
        driveLink,
        u.instansi_id || 'bapperida',
        requestId
      ]);

      // Kirim notifikasi ke WhatsApp grup + Telegram (pola D:\Code\absensi server/keterangan-notify.js)
      if (notifyKeterangan) {
        const startD = new Date(`${tglMulai}T00:00:00Z`);
        const endD = new Date(`${tglSelesai}T00:00:00Z`);
        const durasi = (!Number.isNaN(startD.getTime()) && !Number.isNaN(endD.getTime()) && endD >= startD)
          ? Math.round((endD - startD) / 86400000) + 1
          : 1;
        const tglRange = (tglMulai === tglSelesai) ? tglMulai : `${tglMulai} s.d. ${tglSelesai}`;
        const buktiMime = String(b.bukti_mime || 'image/jpeg');
        const media = b.bukti_base64 ? { base64: String(b.bukti_base64), mime: buktiMime, filename: `bukti-${nip}-${tglMulai}.jpg` } : null;
        const empObj = { id: u.id, username: u.username, nip: u.NIP, jabatan: u.Jabatan || '', instansi_id: u.instansi_id || 'bapperida' };
        notifyKeterangan({
          kind: statusVal === 'DISETUJUI' ? 'auto' : 'admin_pending',
          jenis,
          emp: empObj,
          ket: keterangan,
          tglRange,
          durasi,
          driveLink,
          media,
          instansi_id: empObj.instansi_id,
        }).catch((e) => console.warn('[stitch-api] notif keterangan dilewati:', e?.message || e));
      }

      return res.json({
        ok: true,
        message: statusVal === 'PENDING'
          ? `Pengajuan ${jenis} berhasil dikirim dan menunggu persetujuan admin.`
          : `Keterangan ${jenis} berhasil dicatat dan dikirim ke grup WA & Telegram.`,
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

      const upd = await query(`UPDATE ket_temp SET "Status" = $1 WHERE "ID_Ket" = $2 RETURNING *`, [status, idKet]);
      const row = upd?.rows?.[0];
      if (notifyKeterangan && row) {
        const tglRange = row.tgl_mulai && row.tgl_selesai && row.tgl_mulai !== row.tgl_selesai
          ? `${row.tgl_mulai} s.d. ${row.tgl_selesai}`
          : (row.tgl_mulai || row.Tanggal || '-');
        notifyKeterangan({
          kind: 'approve',
          action: status === 'DISETUJUI' ? 'APPROVE' : 'REJECT',
          jenis: String(row['Jenis Absen'] || 'IZIN').toUpperCase(),
          nama: row.Nama || '-',
          nip: row.NIP || '',
          ket: row.Ket || '',
          tglRange,
          instansi_id: row.instansi_id || 'bapperida',
        }).catch((e) => console.warn('[stitch-api] notif approve keterangan dilewati:', e?.message || e));
      }
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
      const pelaksanaNip = String(b.nip || req.user?.nip || '').trim();
      const maksud = String(b.maksud || '').trim();
      const tujuan = String(b.tujuan || '').trim();
      if (!maksud) return res.status(400).json({ ok: false, message: 'Maksud perjalanan dinas wajib diisi.' });
      if (!tujuan) return res.status(400).json({ ok: false, message: 'Tempat tujuan wajib diisi.' });

      const lamaHari = Math.max(1, parseInt(b.lama_hari || '1', 10) || 1);
      const tglBerangkat = String(b.tgl_berangkat || new Date(Date.now() + 8 * 3600000).toISOString().slice(0, 10)).trim();
      const tglKembali = String(b.tgl_kembali || new Date(Date.parse(`${tglBerangkat}T00:00:00Z`) + (lamaHari - 1) * 86400000).toISOString().slice(0, 10)).trim();
      const tahun = parseInt(tglBerangkat.slice(0, 4), 10) || new Date(Date.now() + 8 * 3600000).getUTCFullYear();
      const jenisSppd = String(b.jenis_sppd || 'LUAR_DAERAH').trim().toUpperCase() === 'DALAM_DAERAH' ? 'DALAM_DAERAH' : 'LUAR_DAERAH';
      const jenisKode = jenisSppd === 'DALAM_DAERAH' ? 'DD' : 'LD';

      const userRes = await query('SELECT username, "NIP", "Jabatan", pangkat, instansi_id FROM user_list WHERE "NIP" = $1 LIMIT 1', [pelaksanaNip]);
      const u = userRes.rows[0] || { username: req.user?.nama || 'Pegawai', NIP: pelaksanaNip, Jabatan: 'Staf', pangkat: '-', instansi_id: req.user?.instansi_id || '' };

      let pejabatPerintah = String(b.pejabat_perintah || '').trim();
      if (!pejabatPerintah && u.instansi_id) {
        const instRes = await query('SELECT nama FROM instansi_list WHERE id = $1 LIMIT 1', [u.instansi_id]).catch(() => ({ rows: [] }));
        const instNama = String(instRes?.rows?.[0]?.nama || '').trim();
        if (instNama) pejabatPerintah = `Kepala ${instNama}`;
      }
      if (!pejabatPerintah) pejabatPerintah = 'Kepala Perangkat Daerah';

      const tempatBerangkat = String(b.tempat_berangkat || 'Waikabubak').trim();
      const provinsiTujuan = String(b.provinsi_tujuan || 'Nusa Tenggara Timur').trim();
      const alatAngkutan = String(b.alat_angkutan || 'Kendaraan Dinas / Umum').trim();
      const createdBy = String(req.user?.nama || req.user?.username || u.username || 'Staf').trim();

      const seqRes = await query(
        `SELECT COALESCE(MAX(NULLIF(regexp_replace(split_part(nomor_register, '/', 1), '\\D', '', 'g'), '')::int), 0) AS max_seq
         FROM agenda_sppd WHERE tahun = $1`,
        [tahun]
      );
      const nextSeq = Number(seqRes?.rows?.[0]?.max_seq || 0) + 1;
      const regNum = `${String(nextSeq).padStart(4, '0')}/SPPD-${jenisKode}/${tahun}`;

      const insertRes = await query(`
        INSERT INTO agenda_sppd (
          jenis_sppd, tahun, nomor_register, nomor_spt, nomor_sppd, tanggal_spt,
          pejabat_perintah, pelaksana_nip, pelaksana_nama, pelaksana_pangkat, pelaksana_jabatan,
          maksud_perjalanan, tempat_berangkat, tempat_tujuan, provinsi_tujuan, alat_angkutan,
          tanggal_berangkat, tanggal_kembali, lama_hari, status, created_by, created_at, updated_at
        ) VALUES (
          $1, $2, $3, $3, $3, CURRENT_DATE,
          $4, $5, $6, $7, $8,
          $9, $10, $11, $12, $13,
          $14, $15, $16, 'Pengajuan', $17, NOW(), NOW()
        ) RETURNING id, nomor_sppd, pelaksana_nama, maksud_perjalanan, tempat_tujuan, status
      `, [
        jenisSppd, tahun, regNum,
        pejabatPerintah, u.NIP, u.username, u.pangkat || '-', u.Jabatan || 'Staf',
        maksud, tempatBerangkat, tujuan, provinsiTujuan, alatAngkutan,
        tglBerangkat, tglKembali, lamaHari, createdBy
      ]);

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

      const [usersRes, logsRes, ketRes] = await Promise.all([
        query(`
          SELECT id::text AS id, username AS nama, "NIP" AS nip, "Jabatan" AS jabatan,
                 bidang, pangkat, face_photo
          FROM user_list
          WHERE status_aktif = true OR status_aktif IS NULL
          ORDER BY username ASC
        `),
        query(`
          SELECT "NIP", "Jam", "Jenis Absen", "Lokasi", "Ket", "koordinat"
          FROM "Log_Absen"
          WHERE "Tanggal" = $1
        `, [todayWita]),
        query(`
          SELECT "NIP", "Jenis Absen" AS jenis, "Ket" AS ket, "Status" AS status
          FROM ket_temp
          WHERE "Tanggal" = $1 OR ($1 BETWEEN "tgl_mulai" AND "tgl_selesai")
        `, [todayWita]),
      ]);

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

  // 16. BIOMETRIK WAJAH & SPESIMEN TTD (sinkronisasi dari Profil / Admin)
  router.post('/face-save', async (req, res) => {
    try {
      const b = req.body || {};
      const nip = String(b.nip || '').trim();
      const facePhoto = String(b.face_photo || '').trim();
      const descriptor = Array.isArray(b.face_descriptor) ? JSON.stringify(b.face_descriptor) : (typeof b.face_descriptor === 'string' ? b.face_descriptor : '[]');
      const faceModel = String(b.face_model || 'human').trim();

      if (!nip) return res.status(400).json({ ok: false, message: 'NIP wajib diisi.' });
      if (!isSelfOrAdmin(req, nip)) return denySelf(res);
      if (!facePhoto.startsWith('data:image')) return res.status(400).json({ ok: false, message: 'Foto wajah tidak valid.' });

      await query(`
        UPDATE user_list
        SET face_photo = $1, face_histogram = $2, face_saved_at = $3, face_model = $4
        WHERE "NIP" = $5
      `, [facePhoto, descriptor, new Date().toISOString(), faceModel, nip]);

      return res.json({ ok: true, message: 'Data wajah biometrik berhasil disimpan.' });
    } catch (err) {
      console.error('[stitch-api] face-save error:', err);
      return res.status(500).json({ ok: false, message: 'Gagal menyimpan wajah: ' + err.message });
    }
  });

  // Reset biometrik wajah pegawai (khusus admin)
  router.post('/admin/face-reset', requireAdmin, async (req, res) => {
    try {
      const b = req.body || {};
      const nip = String(b.nip || '').trim();
      const userId = String(b.userId || b.id || '').trim();
      if (!nip && !/^\d+$/.test(userId)) {
        return res.status(400).json({ ok: false, message: 'NIP atau userId wajib diisi.' });
      }
      const whereSql = nip ? '"NIP" = $1' : 'id = $1::bigint';
      const param = nip || userId;
      const r = await query(
        `UPDATE user_list
         SET face_photo = NULL, face_histogram = NULL, face_saved_at = NULL
         WHERE ${whereSql}
         RETURNING id::text AS id, username AS nama, "NIP" AS nip`,
        [param]
      );
      if (!r.rows || r.rows.length === 0) {
        return res.status(404).json({ ok: false, message: 'Pegawai tidak ditemukan.' });
      }
      return res.json({
        ok: true,
        data: r.rows[0],
        message: 'Data wajah biometrik berhasil direset.'
      });
    } catch (err) {
      console.error('[stitch-api] admin/face-reset error:', err);
      return res.status(500).json({ ok: false, message: 'Gagal mereset data wajah: ' + err.message });
    }
  });

  router.post('/signature-save', async (req, res) => {
    try {
      const b = req.body || {};
      const nip = String(b.nip || '').trim();
      const sig = String(b.signature || '').trim();
      if (!nip || !sig) return res.status(400).json({ ok: false, message: 'NIP dan tanda tangan wajib diisi.' });
      if (!isSelfOrAdmin(req, nip)) return denySelf(res);

      await query(`
        INSERT INTO tanda_tangan (nip, signature, saved_at, updated_at)
        VALUES ($1, $2, NOW(), NOW())
        ON CONFLICT (nip) DO UPDATE SET signature = EXCLUDED.signature, updated_at = NOW()
      `, [nip, sig]);

      return res.json({ ok: true, message: 'Spesimen tanda tangan berhasil disimpan.' });
    } catch (err) {
      console.error('[stitch-api] signature-save error:', err);
      return res.status(500).json({ ok: false, message: 'Gagal menyimpan tanda tangan: ' + err.message });
    }
  });

  const ctx = { query, requireAdmin, isSelfOrAdmin, denySelf, MEDIA_ROLES };
  mountStitchRekapRoutes(router, ctx);
  mountStitchAsetArsipRoutes(router, ctx);

  return router;
}
