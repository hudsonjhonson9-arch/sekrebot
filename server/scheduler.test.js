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

test('akumulasi: total > 435 menit memicu peringatan', async () => {
  const tg = [];
  const query = async () => ({
    rows: [{ ID: '5', Nama: 'Cici', Tanggal: '2026-10-01', Jam: '16:00', 'Jenis Absen': 'DI LUAR JAM MASUK' }],
  });
  const sched = createScheduler({ query, sendTelegram: (m) => { tg.push(m); return Promise.resolve(); }, logger: silent });
  await sched.tick(new Date(2026, 9, 5, 7, 0));
  assert.equal(tg[0].chatId, '5');
  assert.match(tg[0].text, /PERINGATAN AKUMULASI WAKTU/);
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
