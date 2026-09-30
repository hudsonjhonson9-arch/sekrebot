#!/usr/bin/env node
/* Smoke test endpoint SIMAPO - Aset Data. Aman diulang:
   - pengaturan di-restore ke nilai sebelum test,
   - baris test massal dihapus via simapo-admin-master-delete (soft delete),
   - kosongkan HANYA diuji guard-nya (tidak pernah hapus data).
   Env opsional: N8N_BASE, TTD_NIP (nip yang sudah punya tanda tangan).
*/
const BASE = process.env.N8N_BASE || 'https://mindcloud.my.id';
const KEY = 'ogsbIpBCCzi3yndE85JkxFmPJeECw_5u';
const HDR = { 'content-type': 'application/json', 'x-bast-key': KEY };
let fails = 0;
const say = (name, cond, extra = '') => {
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}${extra ? ' — ' + extra : ''}`);
  if (!cond) fails++;
};
async function call(method, path, body) {
  const opt = { method, headers: HDR };
  if (body) opt.body = JSON.stringify(body);
  try {
    const r = await fetch(BASE + path, opt);
    let j = null;
    try { j = await r.json(); } catch (_) {}
    return { status: r.status, ok: r.ok, j };
  } catch (e) {
    return { status: 0, ok: false, j: null, err: e.message };
  }
}

const P = {
  massal: '/webhook/simapo-aset-massal',
  summary: '/webhook/simapo-aset-summary',
  pgGet: '/webhook/simapo-pengaturan-get',
  pgSet: '/webhook/simapo-pengaturan-set',
  ttd: '/webhook/simapo-ttd-get',
  kosong: '/webhook/simapo-aset-kosongkan',
  masterDel: '/webhook/simapo-admin-master-delete',
};

// 1. tanpa x-bast-key harus ditolak (kontrak gate: 200 + body kosong, tanpa data)
{
  const r = await fetch(BASE + P.summary);
  let j = null;
  try { j = await r.json(); } catch (_) {}
  say('summary tolak tanpa x-bast-key', !r.ok || j === null,
    `status ${r.status}, body ${j === null ? '(kosong)' : JSON.stringify(j)}`);
}

// 2. summary terbaca + bentuk data
{
  const r = await call('GET', P.summary);
  const d = r.j && r.j.data;
  say('summary bentuk data',
    r.ok && d && typeof d.total_unit === 'number' && typeof d.total_nilai === 'number' && Array.isArray(d.per_kategori),
    JSON.stringify(d));
}

// 3. pengaturan roundtrip (set → baca → restore)
{
  const before = await call('GET', P.pgGet);
  const old = (before.j && before.j.data && before.j.data.p1_jabatan) || '';
  say('pengaturan-get bentuk objek', before.ok && before.j && typeof before.j.data === 'object', JSON.stringify(before.j));
  const set = await call('POST', P.pgSet, { p1_jabatan: 'SMOKE-P1-JABATAN' });
  say('pengaturan-set ok', set.ok, `status ${set.status}`);
  const after = await call('GET', P.pgGet);
  say('pengaturan roundtrip', after.ok && after.j && after.j.data.p1_jabatan === 'SMOKE-P1-JABATAN', JSON.stringify(after.j));
  const back = await call('POST', P.pgSet, { p1_jabatan: old });
  say('pengaturan restore', back.ok, `kembali ke '${old}'`);
}

// 4. massal: insert baru → ulang (idempoten) → cleanup
const kode = 'SMOKE-TEST-' + Date.now();
{
  const a = await call('POST', P.massal, { rows: [{ kodebarang: kode, nama: 'Smoke Test Aset', hargasatuan: 1 }] });
  const d = a.j && a.j.data;
  say('massal insert baru', a.ok && d && d.barang_baru === 1 && d.unit_baru === 1, JSON.stringify(d));
  const ids = (d && d.barang_ids) || [];
  const b = await call('POST', P.massal, { rows: [{ kodebarang: kode, nama: 'Smoke Test Aset', hargasatuan: 1 }] });
  const d2 = b.j && b.j.data;
  say('massal idempoten (ulang = 0 baru)', b.ok && d2 && d2.barang_baru === 0 && d2.unit_baru === 0, JSON.stringify(d2));
  let cleaned = ids.length > 0;
  for (const id of ids) {
    const c = await call('POST', P.masterDel, { id });
    if (!c.ok) cleaned = false;
  }
  say('cleanup via master-delete', cleaned, `${ids.length} baris`);
}

// 5. kosongkan: guard konfirmasi (TIDAK test happy-path) — tolak = 200 body kosong
{
  const r = await call('POST', P.kosong, { confirm: 'salah' });
  const tolak = r.status !== 0 && (!r.ok || r.j === null);
  say('kosongkan tolak konfirmasi salah', tolak,
    `status ${r.status}, body ${r.j === null ? '(kosong)' : JSON.stringify(r.j)}`);
}

// 6. ttd-get (opsional)
if (process.env.TTD_NIP) {
  const r = await call('GET', `${P.ttd}?nip=${encodeURIComponent(process.env.TTD_NIP)}`);
  say('ttd-get signature terbaca', r.ok && r.j && r.j.data && typeof r.j.data.signature === 'string' && r.j.data.signature.length > 0, JSON.stringify(r.j));
} else {
  console.log('SKIP  ttd-get (set env TTD_NIP=<nip dengan tanda tangan> untuk test ini)');
}

console.log(fails ? `\n${fails} GAGAL` : '\nSEMUA PASS');
process.exit(fails ? 1 : 0);
