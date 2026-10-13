import test from 'node:test';
import assert from 'node:assert/strict';
import { matchCron, createScheduler } from './scheduler.js';

const silent = { error() {}, info() {} };
const noop = () => {};

test('matchCron: 5-field, hanya hari kerja & menit yang cocok', () => {
  assert.equal(matchCron('0 7 * * 1-5', new Date(2026, 9, 5, 7, 0)), true); // Senin 07:00
  assert.equal(matchCron('0 7 * * 1-5', new Date(2026, 9, 4, 7, 0)), false); // Minggu
  assert.equal(matchCron('0 7 * * 1-5', new Date(2026, 9, 5, 7, 1)), false); // menit 1
  assert.equal(matchCron('0,5,15 7 * * 1-5', new Date(2026, 9, 5, 7, 15)), true);
  assert.equal(matchCron('0,5,15 7 * * 1-5', new Date(2026, 9, 5, 7, 16)), false);
  assert.equal(matchCron('5 0 * * *', new Date(2026, 9, 5, 0, 5)), true);
});

test('reminder-masuk: kirim Telegram ke pegawai AKTIF yang belum absen', async () => {
  const tg = [];
  const query = async (text) => {
    if (text.includes('FROM "Log_Absen" WHERE')) return { rows: [] };
    if (text.includes('FROM user_list')) {
      return { rows: [{ id: '999', username: 'Budi', Nama: 'Budi', nomorhp: '08123', Status: 'AKTIF' }] };
    }
    return { rows: [] };
  };
  const sched = createScheduler({
    query,
    sendTelegram: (m) => { tg.push(m); return Promise.resolve(); },
    logger: silent,
  });
  await sched.tick(new Date(2026, 9, 5, 6, 50));
  assert.equal(tg.length, 1);
  assert.equal(tg[0].chatId, '999');
  assert.match(tg[0].text, /BELUM melakukan absensi MASUK/);
});

test('auto-tubel: catat Log_Absen TUBEL Angelina sekali per hari', async () => {
  const inserts = [];
  const query = async (text, params) => {
    if (text.startsWith('INSERT INTO "Log_Absen"')) { inserts.push(params); return { rows: [] }; }
    return { rows: [] };
  };
  const sched = createScheduler({ query, sendTelegram: null, logger: silent });
  await sched.tick(new Date(2026, 9, 5, 7, 0));
  assert.equal(inserts.length, 1);
  assert.equal(inserts[0][2], '200104262023082002');
  assert.equal(inserts[0][3], '2026-10-05');
});

test('auto-tubel: INSERT tanpa bentrok tipe parameter PG ($1 "ID" bigint vs id::text)', async () => {
  // Insiden produksi 2026-10-12 07:00: PG error 42P08 "inconsistent types deduced
  // for parameter $1" — $1 dipakai untuk kolom bigint "ID" sekaligus dibandingkan
  // id::text, jadi TUBEL harian tidak pernah tercatat.
  const sqls = [];
  const query = async (text) => {
    if (text.startsWith('INSERT INTO "Log_Absen"')) sqls.push(text);
    return { rows: [] };
  };
  const sched = createScheduler({ query, sendTelegram: null, logger: silent });
  await sched.tick(new Date(2026, 9, 5, 7, 0));
  assert.equal(sqls.length, 1);
  assert.ok(!/id::text=\$1(?!\d)/.test(sqls[0]),
    '$1 dipakai untuk "ID" (bigint) dan id::text (text) dalam satu pernyataan → 42P08 di PG');
});

test('tanpa-berita: SQL sesuai skema produksi (tanpa user_list."Nama"; $1 tanpa bentrok tipe)', async () => {
  // Insiden produksi: user_list tidak punya kolom "Nama" (ada di username) → 42703,
  // dan INSERT memakai $1 untuk "ID" bigint sekaligus id::text → 42P08.
  const userSqls = [];
  const insertSqls = [];
  const query = async (text) => {
    if (text.startsWith('INSERT INTO "Log_Absen"')) insertSqls.push(text);
    if (text.startsWith('SELECT') && text.includes('FROM user_list')) userSqls.push(text);
    if (text.includes('libur_nasional')) return { rows: [] };
    if (text.includes('FROM "Log_Absen" WHERE')) return { rows: [] };
    return { rows: [{ id: '42', username: 'Ani', NIP: '123', Status: 'AKTIF' }] };
  };
  const sched = createScheduler({ query, sendTelegram: noop, logger: silent });
  await sched.tick(new Date(2026, 9, 5, 10, 0));
  assert.equal(userSqls.length, 1);
  assert.ok(!userSqls[0].includes('"Nama"'), 'user_list tidak punya kolom "Nama" → 42703 di PG');
  assert.equal(insertSqls.length, 1);
  assert.ok(!/id::text=\$1(?!\d)/.test(insertSqls[0]),
    '$1 dipakai untuk "ID" (bigint) dan id::text (text) dalam satu pernyataan → 42P08 di PG');
});

test('tanpa-berita: catat 1 baris + Telegram; skip bila libur', async () => {
  const inserts = [];
  const tg = [];
  const query = async (text, params) => {
    if (text.startsWith('INSERT INTO "Log_Absen"')) { inserts.push(params); return { rows: [] }; }
    if (text.includes('libur_nasional')) return { rows: [] };
    if (text.includes('FROM "Log_Absen" WHERE')) return { rows: [] };
    if (text.includes('FROM user_list')) {
      return { rows: [{ id: '42', username: 'Ani', Nama: 'Ani', NIP: '123', Status: 'AKTIF' }] };
    }
    return { rows: [] };
  };
  const sched = createScheduler({
    query,
    sendTelegram: (m) => { tg.push(m); return Promise.resolve(); },
    logger: silent,
  });
  await sched.tick(new Date(2026, 9, 5, 10, 0));
  assert.equal(inserts.length, 1);
  assert.equal(inserts[0][5], 'TB_2026-10-05_42');
  assert.equal(tg[0].chatId, '42');
  assert.match(tg[0].text, /TANPA BERITA/);
});

test('sync-status: pegawai tak punya keterangan aktif di-reset ke AKTIF', async () => {
  const updates = [];
  const query = async (text, params) => {
    if (text.includes('FROM user_list WHERE "Status" IN')) return { rows: [{ id: '7', NIP: '9', Status: 'SAKIT' }] };
    if (text.includes('FROM ket_temp')) return { rows: [] };
    if (text.startsWith('UPDATE user_list')) { updates.push(params); return { rows: [] }; }
    return { rows: [] };
  };
  const sched = createScheduler({ query, sendTelegram: noop, logger: silent });
  await sched.tick(new Date(2026, 9, 5, 0, 5));
  assert.deepEqual(updates, [['7']]);
});

test('akumulasi: total > 435 menit dari statistik_pegawai memicu peringatan', async () => {
  const tg = [];
  const query = async (text) => (text.includes('FROM statistik_pegawai')
    ? { rows: [{ id: '5', username: 'Cici', nomorhp: '081234567890', Status: 'AKTIF', total: 525 }] }
    : { rows: [] });
  const sched = createScheduler({ query, sendTelegram: (m) => { tg.push(m); return Promise.resolve(); }, logger: silent });
  await sched.tick(new Date(2026, 9, 5, 7, 0));
  assert.equal(tg[0].chatId, '5');
  assert.match(tg[0].text, /PERINGATAN AKUMULASI WAKTU/);
});

test('akumulasi: kirim WA pribadi (nomorhp) + Telegram; hanya Status AKTIF; ambang 435 menit sesuai teks', async () => {
  const tg = [], wa = [];
  const query = async (text) => {
    if (text.includes('FROM statistik_pegawai')) {
      return {
        rows: [
          { id: '5', username: 'Cici', nomorhp: '081234567890', Status: 'AKTIF', total: 525 },
          { id: '6', username: 'Dedi', nomorhp: '089999999999', Status: 'AKTIF', total: 75 },
          { id: '7', username: 'Eka', nomorhp: '', Status: 'AKTIF', total: 525 },
          { id: '8', username: 'Noni', nomorhp: '081111111111', Status: 'NONAKTIF', total: 900 },
        ],
      };
    }
    return { rows: [] };
  };
  const sched = createScheduler({
    query,
    sendTelegram: (m) => { tg.push(m); return Promise.resolve(); },
    sendWhatsApp: (m) => { wa.push(m); return Promise.resolve(); },
    logger: silent,
  });
  await sched.tick(new Date(2026, 9, 5, 7, 0));

  // Lewat ambang & AKTIF: Cici (525m) + Eka (525m). Dedi (75m) di bawah; Noni NONAKTIF.
  assert.deepEqual(tg.map(m => m.chatId), ['5', '7']);
  // WA pribadi hanya ke yang punya nomorhp.
  assert.equal(wa.length, 1);
  assert.equal(wa[0].chatId, '6281234567890@s.whatsapp.net');
  assert.match(wa[0].text, /PERINGATAN AKUMULASI WAKTU/);
  assert.match(wa[0].text, /7 Jam 15 Menit \(435 Menit\)/);
  // Sumber angka = statistik_pegawai: Tanpa Berita (alpa) ikut dihitung, sebutkan di teks.
  assert.match(wa[0].text, /Keterlambatan, Pulang Cepat & Tanpa Berita/);
  assert.ok(!wa[0].text.includes('480'), 'teks tidak boleh menyebut ambang 480 lagi');
  // Teks Telegram & WA identik.
  assert.equal(tg[0].text, wa[0].text);
});

test('akumulasi: tanpa sendWhatsApp (mis. WAHA mati) tetap kirim Telegram', async () => {
  const tg = [];
  const query = async (text) => (text.includes('FROM statistik_pegawai')
    ? { rows: [{ id: '5', username: 'Cici', nomorhp: '081234567890', Status: 'AKTIF', total: 525 }] }
    : { rows: [] });
  const sched = createScheduler({ query, sendTelegram: (m) => { tg.push(m); return Promise.resolve(); }, sendWhatsApp: null, logger: silent });
  await sched.tick(new Date(2026, 9, 5, 7, 0));
  assert.equal(tg.length, 1);
});

test('idempoten: tick dua kali di menit sama tidak menggandakan kiriman', async () => {
  const tg = [];
  const query = async (text) => {
    if (text.includes('FROM "Log_Absen" WHERE')) return { rows: [] };
    if (text.includes('FROM user_list')) return { rows: [{ id: '1', username: 'X', nomorhp: '08', Status: 'AKTIF' }] };
    return { rows: [] };
  };
  const sched = createScheduler({ query, sendTelegram: (m) => { tg.push(m); return Promise.resolve(); }, logger: silent });
  await sched.tick(new Date(2026, 9, 5, 7, 15));
  await sched.tick(new Date(2026, 9, 5, 7, 15, 30));
  assert.equal(tg.length, 1);
});
