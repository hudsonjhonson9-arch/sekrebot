import express from 'express';
import { validateAbsen, evaluateGates, analisisRiwayatLokasi } from './absen-validate.js';
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

// Penugasan/SPT hari ini (tabel penugasan, ditulis lewat /api/overtime/penugasan).
// LEFT(...,10) supaya cocok baik kolom bertipe DATE, TEXT, maupun TIMESTAMP.
export const PENUGASAN_HARI_INI_SQL =
  'SELECT 1 FROM penugasan WHERE nip = $1 AND LEFT(tanggal::text, 10) = $2 '
  + 'AND instansi_id = $3 LIMIT 1';

// Koordinat absen sebelumnya, terbaru dulu, untuk analisis teleport/identik.
// Urutan kondisi sengaja "Tanggal" dulu: jangan ditulis serupa LOG_HARIAN_SQL.
export const RIWAYAT_LOKASI_SQL =
  'SELECT "Tanggal"::text AS "Tanggal", "Jam", koordinat FROM "Log_Absen" '
  + 'WHERE "Tanggal"::text >= $2 AND "NIP" = $1 AND koordinat IS NOT NULL AND koordinat <> \'\' '
  + 'ORDER BY "Tanggal" DESC, "Jam" DESC LIMIT 5';

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

// ── Audit penolakan ──
// Log_Absen hanya menyaratkan absen sukses, jadi tanpa baris ini frekuensi
// tiap kode_tolak (mis. LOKASI_TIDAK_VALID) mustahil dipantau dari mana pun.
// Satu baris JSON per penolakan → mudah di-grep/di-agregasi dari log container:
//   grep '\[absen-tolak\]' | jq -r .kode | sort | uniq -c
function logTolak({ employee = {}, serverTime = {}, payload = {}, kode = '', diag = null }) {
  try {
    console.warn('[absen-tolak]', JSON.stringify({
      kode,
      nip: employee.nip || '',
      user_id: employee.id ?? '',
      tanggal: serverTime.tanggal || '',
      jam: serverTime.jam || '',
      jenis_client: payload.jenis_absen || '',
      source: payload.source || '',
      latitude: payload.latitude ?? null,
      longitude: payload.longitude ?? null,
      accuracy: payload.horizontal_accuracy ?? null,
      ...(diag || {}),
    }));
  } catch { /* logging tidak boleh menggagalkan request */ }
}

// ── Konfirmasi absen ke Telegram ──
// Format mempertahankan teks node n8n "Format Konfirmasi Absen" (V5.2), tapi
// dibangun dari data yang sudah divalidasi native (jenis absen + batas jam
// efektif yang benar-benar dipakai validasi), bukan dari body klien.
const JENIS_DISPLAY = {
  'DI LUAR JAM MASUK': '⏰ TERLAMBAT',
  'DI LUAR JAM PULANG': '⚠️ Pulang Lebih Awal',
  'PULANG LUAR': '🏃 Pulang dari Lapangan',
  MASUK: '✅ Masuk Tepat Waktu',
  PULANG: '🔵 Pulang Tepat Waktu',
  KONTROL: '🛡️ Kontrol Kehadiran',
};

function parseHHMM(s) {
  const m = String(s || '').match(/(\d{1,2}):(\d{2})/);
  return m ? Number(m[1]) * 60 + Number(m[2]) : null;
}

export function formatAbsenMessage({
  nama = '—', nip = '—', jenisAbsen = '', namaLokasi = '—',
  tanggal = '—', jam = '—', jamMasuk = '', jamPulang = '',
} = {}) {
  const jenis = String(jenisAbsen || '');
  const jenisDisplay = JENIS_DISPLAY[jenis] || jenis || '—';
  const menit = parseHHMM(jam);
  let infoWaktu = '';
  const mMasuk = parseHHMM(jamMasuk);
  const mPulang = parseHHMM(jamPulang);
  if (jenis === 'DI LUAR JAM MASUK' && menit !== null && mMasuk !== null) {
    const t = menit - mMasuk;
    const j = Math.floor(t / 60); const m = t % 60;
    infoWaktu = j > 0 ? `\n⏰ Terlambat ${j} jam ${m} menit` : `\n⏰ Terlambat ${m} menit`;
  } else if (jenis === 'DI LUAR JAM PULANG' && menit !== null && mPulang !== null) {
    const c = mPulang - menit;
    const j = Math.floor(c / 60); const m = c % 60;
    infoWaktu = j > 0 ? `\n⚠️ Pulang lebih awal ${j} jam ${m} menit` : `\n⚠️ Pulang lebih awal ${m} menit`;
  }
  return `✅ *KONFIRMASI ABSENSI BERHASIL*\n`
    + `Halo, *${nama}*!\n\n`
    + `📌 *Jenis* : ${jenisDisplay}${infoWaktu}\n`
    + `👤 *NIP*   : ${nip}\n`
    + `📍 *Lokasi*: ${namaLokasi}\n`
    + `📅 *Tgl*   : ${tanggal}\n`
    + `🕒 *Waktu* : ${jam} WITA\n`
    + `⏳ Batas: Masuk ≤${jamMasuk} | Pulang ≥${jamPulang}\n\n`
    + `Terima kasih, selamat melanjutkan aktivitas!`;
}

async function sendTelegramMessage({ botToken, chatId, text }) {
  const r = await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: chatId, text, parse_mode: 'Markdown', disable_web_page_preview: true }),
  });
  const d = await r.json().catch(() => ({}));
  if (!r.ok || !d.ok) throw new Error(d.description || `Telegram HTTP ${r.status}`);
  return d;
}

// teleportBlokKmh: ambang tolak kecepatan perpindahan (km/jam) dari absen sebelumnya.
// 0 = hanya menandai di log [absen-curiga]. Aktifkan lewat ABSEN_TELEPORT_BLOK_KMH
// setelah log beberapa minggu menunjukkan tidak ada false positive (mis. dinas
// naik pesawat).
//
// pulangLuarWajibPenugasan: true = PULANG LUAR ditolak tanpa baris penugasan hari
// ini (ABSEN_PULANG_LUAR_WAJIB_PENUGASAN=true). Default false ("tandai"): tetap
// diterima tapi dicatat [absen-curiga] PULANG_LUAR_TANPA_PENUGASAN, untuk instansi
// yang belum memakai menu Penugasan/SPT. Ubah ke true setelah penugasan rutin diinput.
export function createAbsenRouter({
  query, verifyInitData, botToken, notifyAbsen, now = () => new Date(),
  teleportBlokKmh = Number(process.env.ABSEN_TELEPORT_BLOK_KMH) || 0,
  pulangLuarWajibPenugasan = process.env.ABSEN_PULANG_LUAR_WAJIB_PENUGASAN === 'true',
}) {
  const router = express.Router();
  // notifyAbsen bisa di-inject (test memakai spy, bukan jaringan). Default: kirim
  // ke Telegram memakai botToken; tanpa token, notifikasi dimatikan.
  const notify = notifyAbsen
    || (botToken ? ({ chatId, text }) => sendTelegramMessage({ botToken, chatId, text }) : null);

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
      // Absen web/NIP atau Capacitor tidak punya init_data Telegram; frontend
      // menandainya lewat source 'telegram_x_fallback' dan identitas datang dari
      // sesi (token 192-hex terbit lewat /api/auth/login). Fail-closed: selama
      // init_data ada TETAP diverifikasi (absen Telegram), fallback hanya berlaku
      // saat init_data kosong.
      const webFallback = !init && body.source === 'telegram_x_fallback';
      if (req.authKind !== 'device' && !webFallback) {
        const init1 = await verifyInitData(init, botToken);
        if (!init1?.ok) {
          return res.status(401).json({ ok: false, message: 'init_data tidak valid', reason: init1?.reason || 'unknown' });
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

      // Hanya PULANG LUAR yang membutuhkan penugasan, jadi query ini tidak
      // menambah beban untuk absen biasa.
      let penugasanHariIni = false;
      if (body.jenis_absen === 'PULANG LUAR') {
        const pg = await query(PENUGASAN_HARI_INI_SQL, [employee.nip, serverTime.tanggal, employee.instansi_id || '']);
        penugasanHariIni = pg.rows.length > 0;
      }

      const settings = {
        penugasanHariIni,
        wajibPenugasan: pulangLuarWajibPenugasan,
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
      if (gate) {
        logTolak({ employee, serverTime, payload, kode: gate.kodeTolak });
        return res.json(tolak(gate.kodeTolak, gate.keterangan));
      }
      if (!v.ok) {
        logTolak({ employee, serverTime, payload, kode: v.kodeTolak, diag: v.diag || null });
        return res.json(tolak(v.kodeTolak, v.keterangan));
      }

      const koordinat = Number.isFinite(Number(payload.latitude)) && Number.isFinite(Number(payload.longitude))
        ? `${payload.latitude},${payload.longitude}`
        : '';

      // Analisis riwayat bersifat penasihat: kegagalan query-nya tidak boleh
      // menggagalkan absen yang sudah lolos validasi.
      const curiga = [...(v.peringatan || [])];
      const catatCuriga = (blok) => {
        if (!curiga.length) return;
        console.warn('[absen-curiga]', JSON.stringify({
          nip: employee.nip || '',
          user_id: employee.id ?? '',
          tanggal: serverTime.tanggal,
          jam: serverTime.jam,
          jenis: v.jenisAbsen,
          flags: curiga,
          blok,
        }));
      };
      if (koordinat) {
        try {
          const batas = new Date(Date.parse(`${serverTime.tanggal}T00:00:00Z`) - 2 * 86400000)
            .toISOString().slice(0, 10);
          const rw = await query(RIWAYAT_LOKASI_SQL, [employee.nip, batas]);
          const a = analisisRiwayatLokasi({
            lat: Number(payload.latitude),
            lng: Number(payload.longitude),
            serverTime,
            riwayat: rw.rows,
            blokKmh: teleportBlokKmh,
          });
          curiga.push(...a.flags);
          if (a.blok) {
            catatCuriga(true);
            logTolak({ employee, serverTime, payload, kode: 'GPS_TELEPORT', diag: a.teleport });
            return res.json(tolak('GPS_TELEPORT', 'Perpindahan lokasi dari absen sebelumnya tidak masuk akal. Hubungi admin bila ini benar.'));
          }
        } catch (e) {
          console.error('[absen] analisis riwayat lokasi dilewati:', e?.message || e);
        }
      }
      catatCuriga(false);

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
      // Fire-and-forget: notifikasi tak boleh menahan respons absen (nginx 30s)
      // maupun menggagalkan absen yang sudah tercatat. chatId = user_list.id,
      // yang di jalur Telegram sudah dipastikan sama dengan id Telegram pegawai
      // (cek init_data di atas). Kalau id itu tidak punya chat / bot diblokir,
      // Telegram membalas error -> di-skip, absen tetap 200.
      if (saved && notify) {
        const text = formatAbsenMessage({
          nama: employee.username || '—',
          nip: employee.nip || '—',
          jenisAbsen: v.jenisAbsen,
          namaLokasi: saved.Lokasi || v.namaLokasi || '—',
          tanggal: serverTime.tanggal,
          jam: serverTime.jam.slice(0, 5),
          jamMasuk: settings.jamMasuk,
          jamPulang: settings.jamPulang,
        });
        notify({ chatId: String(employee.id), text })
          .catch((e) => console.error('[absen] notif Telegram dilewati:', e?.message || e));
      }
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