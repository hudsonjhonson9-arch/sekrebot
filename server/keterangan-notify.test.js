import test from 'node:test';
import assert from 'node:assert/strict';
import { buildAutoText, buildApproveText, createKeteranganNotify, waChatId, wahaSender } from './keterangan-notify.js';

test('buildAutoText: label SAKIT vs TUGAS + link bukti opsional', () => {
  const sakit = buildAutoText({ jenis: 'SAKIT', nama: 'Budi', nip: '1', jabatan: 'Staf', ket: 'demam', tglRange: '2026-10-01', durasi: 1, instansi_id: 'bapperida' });
  assert.match(sakit, /🤧 \*INFO SAKIT — TERCATAT OTOMATIS\*/);
  assert.match(sakit, /BAPPERIDA Sumba Barat/);
  assert.ok(!sakit.includes('Google Drive'));
  const tugas = buildAutoText({ jenis: 'TUGAS', nama: 'Budi', nip: '1', jabatan: 'Staf', ket: 'dinas', tglRange: '2026-10-01', durasi: 2, driveLink: 'https://d/x', instansi_id: 'bapperida' });
  assert.match(tugas, /💼 \*INFO SURAT TUGAS \/ DINAS LUAR \(DL\)/);
  assert.match(tugas, /📎 \*Bukti\*.*Lihat di Google Drive/);
});

test('buildApproveText: APPROVE→DISETUJUI, REJECT→DITOLAK', () => {
  assert.match(buildApproveText({ action: 'APPROVE', jenis: 'IZIN', nama: 'Budi', ket: 'k', tglRange: '2026-10-01', instansi_id: 'bapperida' }), /✅ \*STATUS: DISETUJUI\*/);
  assert.match(buildApproveText({ action: 'REJECT', jenis: 'IZIN', nama: 'Budi', ket: 'k', tglRange: '2026-10-01', instansi_id: 'bapperida' }), /❌ \*STATUS: DITOLAK\*/);
});

test('broadcast: 1× WA grup + Telegram PM ke tiap pegawai aktif (non-aktif difilter SQL)', async () => {
  const wa = [];
  const tg = [];
  const notify = createKeteranganNotify({
    query: async () => ({ rows: [{ id: '111' }, { id: '222' }] }),
    sendTelegram: async m => tg.push(m),
    sendWA: async m => wa.push(m),
  });
  await notify({ kind: 'auto', jenis: 'TUGAS', emp: { username: 'Budi', nip: '1', instansi_id: 'bapperida' }, ket: 'dinas', tglRange: '2026-10-01', durasi: 1 });
  assert.equal(wa.length, 1);
  assert.deepEqual(tg.map(m => m.chatId), ['111', '222']);
  assert.match(wa[0].text, /TERCATAT OTOMATIS/);
});

test('admin_pending: pakai daftar admin, fallback ke 1383864355 bila kosong', async () => {
  const tg = [];
  const wa = [];
  const notify = createKeteranganNotify({
    query: async () => ({ rows: [] }),
    sendTelegram: async m => tg.push(m),
    sendWA: async m => wa.push(m),
  });
  await notify({ kind: 'admin_pending', jenis: 'IZIN', emp: { username: 'Budi', nip: '1', instansi_id: 'bapperida' }, ket: 'izin', tglRange: '2026-10-01', durasi: 1 });
  assert.deepEqual(tg.map(m => m.chatId), ['1383864355']);
  assert.match(tg[0].text, /PENGAJUAN IZIN/);
  assert.equal(wa.length, 0, 'IZIN pending tidak dikirim ke WhatsApp');
});

test('waChatId: nomorhp lokal → chatId WhatsApp personal', () => {
  assert.equal(waChatId('085253264539'), '6285253264539@s.whatsapp.net');
  assert.equal(waChatId('0812-3970-2272'), '6281239702272@s.whatsapp.net');
  assert.equal(waChatId('6285253264539'), '6285253264539@s.whatsapp.net');
  assert.equal(waChatId(''), '');
  assert.equal(waChatId(null), '');
  assert.equal(waChatId('-'), '');
});

test('wahaSender: chatId bawaan (grup) bisa ditimpa per pesan', async () => {
  const calls = [];
  const real = globalThis.fetch;
  globalThis.fetch = async (url, opts) => {
    calls.push({ url: String(url), body: JSON.parse(opts.body) });
    return { ok: true, json: async () => ({ ok: true }) };
  };
  try {
    const send = wahaSender({ url: 'https://waha.test/', apiKey: 'k', session: 's1', chatId: '123@g.us' });
    await send({ text: 'grup' });
    await send({ text: 'pribadi', chatId: '6281234567890@s.whatsapp.net' });
    assert.equal(calls[0].url, 'https://waha.test/api/sendText');
    assert.equal(calls[0].body.chatId, '123@g.us');
    assert.equal(calls[1].body.chatId, '6281234567890@s.whatsapp.net');
    assert.equal(calls[1].body.session, 's1');
    assert.equal(calls[1].body.text, 'pribadi');
  } finally {
    globalThis.fetch = real;
  }
});
