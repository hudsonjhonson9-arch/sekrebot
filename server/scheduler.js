// server/scheduler.js
//
// Pengganti native workflow n8n "Notif Absensi" (5 scheduleTrigger) supaya
// aplikasi n8n di server bisa dimatikan total. Sinkronisasi statistik_pegawai
// (postgresTrigger Log_Absen di Absensi Bot V5.2) ditangani trigger DB —
// lihat scripts/migration_011_statistik_trigger.sql.
//
// ponytail: jam lokal server = WITA (Dockerfile ENV TZ=Asia/Makassar), jadi pakai
// getters lokal, tanpa library timezone. Kalau TZ server diubah, ubah di sini.
import { waChatId } from './keterangan-notify.js';

const pad = (n) => String(n).padStart(2, '0');
export const ymd = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
export const hm = (d) => `${pad(d.getHours())}:${pad(d.getMinutes())}`;

const RANGE = [[0, 59], [0, 23], [1, 31], [1, 12], [0, 6]];

function fieldMatch(spec, value, min, max) {
  if (!spec || spec === '*') return true;
  for (const part of spec.split(',')) {
    const [range, stepStr] = part.split('/');
    const step = stepStr ? Number(stepStr) : 1;
    if (!Number.isInteger(step) || step < 1) continue;
    let lo;
    let hi;
    if (range === '*') {
      lo = min;
      hi = max;
    } else if (range.includes('-')) {
      [lo, hi] = range.split('-').map(Number);
    } else {
      lo = Number(range);
      hi = lo;
    }
    if (!Number.isFinite(lo) || !Number.isFinite(hi)) continue;
    if (value >= lo && value <= hi && (value - lo) % step === 0) return true;
  }
  return false;
}

// Cocokkan ekspresi cron 5-field (menit jam tgl bulan hari[0=Minggu]) terhadap waktu lokal.
export function matchCron(expr, date) {
  const f = String(expr).trim().split(/\s+/);
  if (f.length < 5) return false;
  const v = [date.getMinutes(), date.getHours(), date.getDate(), date.getMonth() + 1, date.getDay()];
  return f.slice(0, 5).every((spec, i) => fieldMatch(spec, v[i], RANGE[i][0], RANGE[i][1]));
}

const nama = (p) => p.username || p.Nama || '—';

// 0 7 * * 1-5 — catat Log_Absen TUBEL harian untuk pegawai yang sedang bertugas
// (pengganti hardcode dataKaryawan di workflow n8n "Absensi Bot V5.2"). Ini override
// sementara per-orang: edit/hapus baris saat penugasannya berakhir.
// ponytail: const statis cukup untuk 1 orang; pindah ke tabel config kalau >1 atau sering berubah.
export const AUTO_TUBEL = [
  { ID: '2897', username: 'Angelina Kamila Lalo, S.Tr.I.P', NIP: '200104262023082002' },
];

export function buildReminderMasuk(p, jam) {
  return `⚠️ *PENGINGAT ABSENSI MASUK*\n\n`
    + `Halo *${nama(p)}*,\n`
    + `Hingga pukul *${jam}* WITA, Anda tercatat *BELUM melakukan absensi MASUK* hari ini.\n\n`
    + `Mohon segera melakukan absensi melalui aplikasi.`;
}

export function buildReminderPulang(p) {
  return `⚠️ *PENGINGAT ABSENSI PULANG*\n\n`
    + `Halo *${nama(p)}*,\n`
    + `Anda tercatat sudah hadir, namun *belum melakukan absensi PULANG*.\n`
    + `Batas jam pulang: 14:30 WITA.`;
}

// Default ambang (7j15m = 1 hari kerja). Bisa dioverride per instansi lewat
// tabel pengaturan (key='peringatan_akumulasi', lihat /api/peringatan-akumulasi).
export const AMBANG_AKUMULASI_DEFAULT = 435;

const fmtAmbang = (m) => `${Math.floor(m / 60)} Jam ${m % 60} Menit (${m} Menit)`;

export function buildAkumulasi(p, waktu, ambangMenit = AMBANG_AKUMULASI_DEFAULT) {
  return `🔔 *PERINGATAN AKUMULASI WAKTU*\n`
    + `───────────────────\n`
    + `Yth. Bapak/Ibu *${p.nama}*,\n\n`
    + `Melalui pesan otomatis ini, kami menginformasikan bahwa akumulasi waktu "Di Luar Jam" (Keterlambatan, Pulang Cepat & Tanpa Berita) Anda telah mencapai batas maksimum.\n\n`
    + `📊 *Detail Akumulasi:*\n`
    + `• Total Waktu: *${waktu}*\n`
    + `• Ambang Batas: ${fmtAmbang(ambangMenit)}\n\n`
    + `Sesuai dengan peraturan yang berlaku, akumulasi ini setara dengan 1 hari kerja. Mohon segera melakukan konfirmasi ke bagian Kepegawaian untuk klarifikasi atau tindak lanjut administratif.\n\n`
    + `_Terima kasih atas perhatiannya._\n`
    + `───────────────────\n`
    + `*Sistem Absensi Digital*`;
}

export function buildTanpaBerita(item) {
  return `🚨 *PERINGATAN TANPA BERITA*\n`
    + `───────────────────\n`
    + `Yth. Bapak/Ibu *${item.Nama}*,\n\n`
    + `Sistem mencatat bahwa hingga pukul *${item.Jam} WITA* pada tanggal *${item.Tanggal}*, `
    + `Anda tercatat *TIDAK HADIR TANPA KETERANGAN* (Tanpa Berita).\n\n`
    + `📋 *Detail Pencatatan:*\n`
    + `• NIP      : ${item.NIP}\n`
    + `• Tanggal  : ${item.Tanggal}\n`
    + `• Status   : ❌ TANPA BERITA\n\n`
    + `Apabila Anda memiliki alasan ketidakhadiran (Izin/Sakit/Tugas), `
    + `mohon segera mengajukan keterangan melalui aplikasi atau menghubungi bagian Kepegawaian.\n\n`
    + `_Terima kasih atas perhatiannya._\n`
    + `───────────────────\n`
    + `*Sistem Absensi Digital*`;
}

const MASUK = ['MASUK', 'DI LUAR JAM MASUK'];
const PULANG = ['PULANG', 'DI LUAR JAM PULANG', 'PULANG LUAR'];
const KET = ['IZIN', 'SAKIT', 'TUGAS', 'TUBEL', 'CUTI', 'TANPA BERITA'];
const has = (row, list) => list.includes(String(row['Jenis Absen'] || '').toUpperCase().trim());

export function createScheduler({ query, sendTelegram, sendWhatsApp, logger = console, now = () => new Date() }) {
  const tg = (chatId, text) => (sendTelegram && chatId
    ? Promise.resolve(sendTelegram({ chatId: String(chatId), text })).catch((e) => logger.error('[sched/tg]', chatId, e.message))
    : Promise.resolve());
  // WhatsApp pribadi pegawai via WAHA — chatId = nomorhp sudah dinormalkan
  // (0812… → 62812…@s.whatsapp.net). Fail-soft seperti Telegram.
  const wa = (chatId, text) => (sendWhatsApp && chatId
    ? Promise.resolve(sendWhatsApp({ chatId, text })).catch((e) => logger.error('[sched/wa]', chatId, e.message))
    : Promise.resolve());

  // 0 7 * * 1-5 — catat TUBEL harian untuk AUTO_TUBEL, sekali per NIP per hari.
  async function autoTubel(date) {
    if (!AUTO_TUBEL.length) return;
    const tanggal = ymd(date);
    const jam = hm(date);
    const { rows: ada } = await query(`SELECT "NIP" FROM "Log_Absen" WHERE "Tanggal"=$1 AND "Jenis Absen"='TUBEL'`, [tanggal]);
    const done = new Set(ada.map((r) => String(r.NIP)));
    for (const k of AUTO_TUBEL) {
      if (done.has(String(k.NIP))) continue;
      await query(
        `INSERT INTO "Log_Absen" ("ID","Nama","NIP","Tanggal","Jam","Jenis Absen","Lokasi","Ket","koordinat","instansi_id")
         VALUES ($1,$2,$3,$4,$5,'TUBEL','-','TUBEL','-',
         COALESCE((SELECT instansi_id FROM user_list WHERE "NIP"=$3 LIMIT 1),
                  (SELECT instansi_id FROM user_list WHERE id=$1 LIMIT 1),'bapperida'))`,
        [k.ID, k.username, k.NIP, tanggal, jam],
      );
    }
  }

  // 0 7 * * 1-5 — akumulasi "Di Luar Jam" dari tabel agregat statistik_pegawai
  // (dipelihara trigger trg_sync_statistik_pegawai di Log_Absen). Ambang & on/off
  // per instansi dibaca dari tabel pengaturan (key='peringatan_akumulasi').
  // DEFAULT OFF: tanpa baris config, peringatan TIDAK dikirim — diaktifkan dari
  // menu admin Panel → Peringatan Akumulasi (permintaan "matikan dulu").
  // Hanya pegawai AKTIF; kirim Telegram PM + WA pribadi (nomorhp user_list).
  async function akumulasi() {
    const cfg = {}; // instansi_id -> { enabled, ambang_menit }
    const { rows: cfgRows } = await query(
      `SELECT instansi_id, value FROM pengaturan WHERE "key"='peringatan_akumulasi'`,
    );
    for (const r of cfgRows) {
      try {
        const v = r.value ? JSON.parse(r.value) : {};
        const ambang = Number.parseInt(v.ambang_menit, 10);
        cfg[String(r.instansi_id || '')] = {
          enabled: v.enabled === true,
          ambang_menit: Number.isFinite(ambang) && ambang >= 30 ? ambang : AMBANG_AKUMULASI_DEFAULT,
        };
      } catch { /* baris rusak diabaikan -> instansi tanpa config = off */ }
    }
    if (!Object.values(cfg).some((c) => c.enabled)) {
      logger.info('[sched/akumulasi] nonaktif di semua instansi (pengaturan peringatan_akumulasi), skip');
      return;
    }
    const { rows } = await query(
      'SELECT u.id::text AS id, u.username, u.nomorhp, u."Status", u.instansi_id, '
      + '(s.akum_menit_terlambat + s.akum_menit_lebih_awal) AS total '
      + 'FROM statistik_pegawai s JOIN user_list u ON u."NIP" = s.nip '
      + 'WHERE (s.akum_menit_terlambat + s.akum_menit_lebih_awal) > 0',
    );
    for (const p of rows) {
      if (String(p.Status || '').toUpperCase() !== 'AKTIF') continue;
      const c = cfg[String(p.instansi_id || '')] || cfg.all;
      if (!c?.enabled) continue;
      const total = Number(p.total) || 0;
      if (total < c.ambang_menit) continue;
      const text = buildAkumulasi(
        { nama: p.username || '—' },
        `${Math.floor(total / 60)}j ${total % 60}m`,
        c.ambang_menit,
      );
      await tg(p.id, text);
      await wa(waChatId(p.nomorhp), text);
    }
  }

  // 50,55 6 * * 1-5 + 0,5,15 7 * * 1-5 — ingatkan yang belum absen MASUK.
  async function reminderMasuk(date) {
    const tanggal = ymd(date);
    const jam = hm(date);
    const { rows: logs } = await query(`SELECT "ID","Jenis Absen" FROM "Log_Absen" WHERE "Tanggal"=$1`, [tanggal]);
    const sudah = new Set(logs.filter((l) => has(l, MASUK)).map((l) => String(l.ID)));
    const { rows: peg } = await query(`SELECT id::text AS id, username, "nomorhp", "Status" FROM user_list`);
    for (const p of peg) {
      if (String(p.Status || '').toUpperCase() !== 'AKTIF' || sudah.has(String(p.id))) continue;
      await tg(p.id, buildReminderMasuk(p, jam));
    }
  }

  // 30..55 14 * * 1-5 + 0,5,10 15 * * 1-5 — ingatkan yang sudah masuk tapi belum PULANG.
  async function reminderPulang(date) {
    const tanggal = ymd(date);
    const { rows: logs } = await query(`SELECT "ID","Jenis Absen" FROM "Log_Absen" WHERE "Tanggal"=$1`, [tanggal]);
    const sudahMasuk = new Set(logs.filter((l) => has(l, MASUK)).map((l) => String(l.ID)));
    const sudahPulang = new Set(logs.filter((l) => has(l, PULANG)).map((l) => String(l.ID)));
    const { rows: peg } = await query(`SELECT id::text AS id, username, "nomorhp", "Status" FROM user_list`);
    for (const p of peg) {
      const id = String(p.id);
      if (String(p.Status || '').toUpperCase() !== 'AKTIF' || !sudahMasuk.has(id) || sudahPulang.has(id)) continue;
      await tg(p.id, buildReminderPulang(p));
    }
  }

  // 0 10 * * 1-5 — catat & beri tahu pegawai AKTIF tanpa absen/keterangan.
  async function tanpaBerita(date) {
    const tanggal = ymd(date);
    const jam = hm(date);
    const { rows: libur } = await query(`SELECT "tanggal" FROM libur_nasional WHERE "tanggal"=$1`, [tanggal]);
    if (libur.length) {
      logger.info(`[sched/tanpa-berita] ${tanggal} libur, skip`);
      return;
    }
    const { rows: logs } = await query(`SELECT "ID","Jenis Absen" FROM "Log_Absen" WHERE "Tanggal"=$1`, [tanggal]);
    const sudahMasuk = new Set(logs.filter((l) => has(l, MASUK)).map((l) => String(l.ID)));
    const sudahKet = new Set(logs.filter((l) => has(l, KET)).map((l) => String(l.ID)));
    const { rows: peg } = await query(`SELECT id::text AS id, username, "NIP", "Status" FROM user_list`);
    for (const p of peg) {
      const id = String(p.id || '').trim();
      if (!id || String(p.Status || '').toUpperCase().trim() !== 'AKTIF' || sudahMasuk.has(id) || sudahKet.has(id)) continue;
      const nm = p.Nama || p.username || '—';
      const nip = p.NIP || '—';
      await query(
        `INSERT INTO "Log_Absen" ("ID","Nama","NIP","Tanggal","Jam","Jenis Absen","Lokasi","Ket","koordinat","instansi_id","request_id")
         VALUES ($1,$2,$3,$4,$5,'TANPA BERITA','-','Otomatis — tidak hadir tanpa keterangan','-',
           COALESCE((SELECT instansi_id FROM user_list WHERE "NIP"=$3 LIMIT 1),
                    (SELECT instansi_id FROM user_list WHERE id=$1 LIMIT 1),'bapperida'),$6)`,
        [id, nm, nip, tanggal, jam, `TB_${tanggal}_${id}`],
      );
      await tg(p.id, buildTanpaBerita({ Nama: nm, NIP: nip, Jam: jam, Tanggal: tanggal }));
    }
  }

  // 5 0 * * * — reset Status pegawai yang masa keterangannya sudah lewat.
  async function syncStatus() {
    const { rows: peg } = await query(`SELECT id::text AS id, "NIP","Status" FROM user_list WHERE "Status" IN ('SAKIT','IZIN','CUTI','TUGAS','TUBEL')`);
    if (!peg.length) return;
    const { rows: aktif } = await query(
      `SELECT "ID_Pegawai","NIP" FROM ket_temp WHERE "Status"='DISETUJUI' AND "tgl_mulai"<>'' AND "tgl_selesai"<>''
         AND TO_CHAR(NOW() AT TIME ZONE 'Asia/Makassar','YYYY-MM-DD') BETWEEN "tgl_mulai" AND "tgl_selesai"`,
    );
    const ids = new Set(aktif.map((k) => String(k.ID_Pegawai || '').trim()).filter(Boolean));
    const nips = new Set(aktif.map((k) => String(k.NIP || '').trim()).filter(Boolean));
    for (const p of peg) {
      const id = String(p.id || '').trim();
      const nip = String(p.NIP || '').trim();
      if (ids.has(id) || (nip && nips.has(nip))) continue;
      await query(`UPDATE user_list SET "Status"='AKTIF' WHERE id=$1`, [id]);
    }
  }

  const jobs = [
    { name: 'auto-tubel', crons: ['0 7 * * 1-5'], run: autoTubel },
    { name: 'akumulasi', crons: ['0 7 * * 1-5'], run: () => akumulasi() },
    { name: 'reminder-masuk', crons: ['50,55 6 * * 1-5', '0,5,15 7 * * 1-5'], run: reminderMasuk },
    { name: 'reminder-pulang', crons: ['30,35,40,45,50,55 14 * * 1-5', '0,5,10 15 * * 1-5'], run: reminderPulang },
    { name: 'tanpa-berita', crons: ['0 10 * * 1-5'], run: tanpaBerita },
    { name: 'sync-status', crons: ['5 0 * * *'], run: () => syncStatus() },
  ];

  let timer = null;

  async function tick(date = now()) {
    const key = `${date.getFullYear()}${date.getMonth()}${date.getDate()}${date.getHours()}${date.getMinutes()}`;
    for (const job of jobs) {
      if (job.last === key || !job.crons.some((c) => matchCron(c, date))) continue;
      job.last = key;
      try {
        await job.run(date);
      } catch (e) {
        logger.error(`[sched/${job.name}]`, e.message);
      }
    }
  }

  function start(intervalMs = 30000) {
    if (timer) return;
    timer = setInterval(() => {
      tick().catch((e) => logger.error('[sched]', e.message));
    }, intervalMs);
    if (timer.unref) timer.unref();
  }

  function stop() {
    if (timer) clearInterval(timer);
    timer = null;
  }

  return { tick, start, stop, jobs };
}
