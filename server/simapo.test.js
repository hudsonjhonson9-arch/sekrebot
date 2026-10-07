// Test router SIMAPO dengan stub query/withTransaction, jadi tidak ada DB atau
// jaringan yang tersentuh. Yang dijaga tiga hal: (1) nilai dari client tidak pernah
// masuk ke teks SQL, (2) transaksi untuk penerimaan, (3) bentuk respons
// yang dipakai frontend lewat parseApiResponse(). Router requireRole diuji
// terpisah di index.test.js sebagai mount smoke test.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import express from 'express';

import {
  createSimapoRouter,
  barisBKU,
  instansiOtomatis,
  normalJenis,
  buatKodeBarang,
  MASTER_SQL,
  INSERT_NOTA_SQL,
  INSERT_DETAIL_SQL,
  UPDATE_STOK_SQL,
  INSERT_BKU_SQL,
  KATEGORI_LIST_SQL,
  KATEGORI_SAVE_SQL,
  KATEGORI_DELETE_SQL,
  KATALOG_SQL,
  MASTER_LIST_SQL,
  MASTER_SAVE_SQL,
  MASTER_DELETE_SQL,
  MUTASI_LIST_SQL,
  MUTASI_INSERT_SQL,
  MUTASI_STOK_SQL,
} from './simapo.js';

// Semua SQL yang dibungkus router, dipakai guard "tidak ada nilai user hardcoded".
const SEMUA_SQL = [
  MASTER_SQL, INSERT_NOTA_SQL, INSERT_DETAIL_SQL, UPDATE_STOK_SQL, INSERT_BKU_SQL,
  KATEGORI_LIST_SQL, KATEGORI_SAVE_SQL, KATEGORI_DELETE_SQL,
  KATALOG_SQL, MASTER_LIST_SQL, MASTER_SAVE_SQL, MASTER_DELETE_SQL,
  MUTASI_LIST_SQL, MUTASI_INSERT_SQL, MUTASI_STOK_SQL,
];

// ── stub ──
function stub({ rows = [], failAt = 0 } = {}) {
  const calls = [];
  const tx = { calls, began: false, rolledBack: false, committed: false };

  const runner = async (sql, params) => {
    calls.push({ sql, params });
    if (failAt && calls.length === failAt) throw new Error('db exploded');
    return { rows: Array.isArray(rows) ? rows : [rows] };
  };

  // Meniru kontrak withTransaction() di db.js: BEGIN di awal, COMMIT kalau fn
  // selesai, ROLLBACK kalau fn melempar. BEGIN/COMMIT/ROLLBACK sengaja tidak
  // masuk ke calls supaya failAt tetap menghitung hanya query yang benar-benar
  // menyentuh tabel.
  tx.query = runner;
  tx.withTransaction = async (fn) => {
    const client = { query: async (sql, params) => {
      if (sql === 'BEGIN') { tx.began = true; return { rows: [] }; }
      if (sql === 'COMMIT') { tx.committed = true; return { rows: [] }; }
      if (sql === 'ROLLBACK') { tx.rolledBack = true; return { rows: [] }; }
      return runner(sql, params);
    } };
    await client.query('BEGIN');
    try {
      const out = await fn(client);
      await client.query('COMMIT');
      return out;
    } catch (e) {
      await client.query('ROLLBACK');
      throw e;
    }
  };
  return tx;
}

function app(tx, user) {
  const a = express();
  a.use(express.json());
  a.use((req, _res, next) => { req.user = user; next(); });
  a.use('/api/simapo', createSimapoRouter({ query: tx.query, withTransaction: tx.withTransaction }));
  return a;
}

// NIP selalu ikut supaya test bisa memastikan createdbyid datang dari sesi, bukan
// dari body yang gampang dipalsukan client.
const ADMIN = { id: '1', nip: '198704121994031005', role: 'ADMIN', instansi_id: 'bapperida' };

function call(a, method, url, body) {
  return new Promise((resolve) => {
    let err;
    const done = () => resolve({ err, status: res.statusCode, body: res.body });
    const req = { method, url, headers: { 'content-type': 'application/json' } };
    const res = {
      statusCode: 0, body: null,
      status(c) { this.statusCode = c; return this; },
      json(p) { this.body = p; this.statusCode ||= 200; done(); return this; },
      end() { this.statusCode ||= 200; done(); return this; },
      setHeader() {},
    };
    // Body harus diserialkan: stub req tidak punya stream seperti req Express asli.
    if (body !== undefined) req.body = body;
    a(req, res, (e) => { err = e; done(); });
  });
}

// ── helper murni ──
test('barisBKU menerima tiga bentuk kiriman yang dipakai frontend', () => {
  assert.equal(barisBKU({ rows: [{ uraian: 'a' }, { uraian: 'b' }] }).length, 2);
  assert.equal(barisBKU({ uraian: 'satu baris' }).length, 1);
  assert.equal(barisBKU({ body: { rows: [{ uraian: 'nested' }] } }).length, 1);
  assert.equal(barisBKU({}).length, 0);
});

test('instansiOtomatis mengabaikan instansi_id dari body untuk non-SUPERADMIN', () => {
  // Kalau ini bocor, admin instansi lain bisa menulis baris ke instansi target.
  const req = { user: ADMIN };
  assert.equal(instansiOtomatis(req, 'instansi_lain'), 'bapperida');
  assert.equal(instansiOtomatis({ user: { role: 'SUPERADMIN' } }, 'instansi_lain'), 'instansi_lain');
});

// ── keamanan: tidak ada interpolasi client ke SQL ──
test('nilai berbahaya dari client tidak pernah masuk ke teks SQL', async () => {
  const jahat = "'; DROP TABLE \"SIMAPO\".barang; --";
  const tx = stub({ rows: { id: 'nota-1' } });
  const a = app(tx, ADMIN);

  await call(a, 'POST', '/api/simapo/penerimaan', {
    no_nota: jahat, tgl_nota: '2026-01-05', penyedia: jahat,
    items: [{ barang_id: jahat, volume: 2, harga_satuan: 10 }],
  });
  await call(a, 'POST', '/api/simapo/pemeliharaan', {
    barang_id: jahat, jenis_pemeliharaan: jahat, keterangan: jahat,
  });
  await call(a, 'POST', '/api/simapo/bku', { rows: [{ uraian: jahat, kode_rekening: jahat }] });

  assert.ok(tx.calls.length > 0, 'tidak ada query yang jalan, test tidak berarti');
  for (const c of tx.calls) {
    assert.ok(!c.sql.includes('DROP TABLE'), `SQL mengandung SQL mentah: ${c.sql}`);
    assert.ok(!c.sql.includes('SIMAPO".barang;'), `SQL mentah: ${c.sql}`);
  }
  // Nilai harus sampai ke DB lewat params, bukan lewat string SQL.
  const paramText = JSON.stringify(tx.calls.flatMap((c) => c.params));
  assert.ok(paramText.includes('DROP TABLE'), 'nilai jahat tidak pernah masuk ke params');
});

// ── master ──
test('GET /penerimaan mengembalikan {ok, data} dan mengoper instansi lewat $1', async () => {
  const tx = stub({ rows: { data: { kodefikasi: [], rekening: [], barang: [], periode: { bulan: 10, tahun: 2026 } } } });
  const { status, body } = await call(app(tx, ADMIN), 'GET', '/api/simapo/penerimaan');

  assert.equal(status, 200);
  assert.equal(body.ok, true);
  // parseApiResponse() membaca json.data -> harus berupa objek, bukan array.
  assert.equal(typeof body.data, 'object');
  assert.ok(Array.isArray(body.data.barang));
  assert.equal(tx.calls[0].params[0], 'bapperida');
  assert.ok(tx.calls[0].sql.includes('$1'));
});

// ── penerimaan: transaksi ──
test('POST /penerimaan menolak kiriman tidak lengkap dengan 400', async () => {
  const tx = stub();
  const { status, body } = await call(app(tx, ADMIN), 'POST', '/api/simapo/penerimaan', {
    no_nota: 'N1', tgl_nota: '', penyedia: 'PT', items: [{ barang_id: 'B' }],
  });
  assert.equal(status, 400);
  assert.equal(body.ok, false);
  assert.match(body.message, /wajib diisi/);
  assert.equal(tx.calls.length, 0, 'tidak boleh ada query kalau validasi gagal');
});

test('POST /penerimaan menyimpan nota, detail, dan stok dalam satu transaksi', async () => {
  const tx = stub({ rows: { id: 'nota-uuid' } });
  const { status, body } = await call(app(tx, ADMIN), 'POST', '/api/simapo/penerimaan', {
    no_nota: 'N1', tgl_nota: '2026-01-05', penyedia: 'PT A',
    items: [{ barang_id: 'B1', volume: 3, harga_satuan: 100 }],
  });

  assert.equal(status, 200);
  assert.equal(body.id, 'nota-uuid');
  assert.equal(tx.began, true);
  assert.equal(tx.committed, true);

  const [nota, detail, stok] = tx.calls;
  assert.ok(nota.sql.includes('INSERT INTO "SIMAPO".penerimaan_barang'));
  assert.equal(nota.params[3], 'PT A');

  // total_nilai kosong -> dihitung dari volume x harga (3 x 100).
  assert.equal(nota.params[4], 300);
  assert.ok(detail.sql.includes('INSERT INTO "SIMAPO".detail_penerimaan'));
  assert.equal(detail.sql.includes('%VALUES%'), false, 'placeholder VALUES belum diganti');
  assert.equal(detail.params[0], 'nota-uuid');
  assert.ok(stok.sql.includes('UPDATE "SIMAPO".barang'));
  assert.equal(stok.params[0], 'nota-uuid');
});

test('detail penerimaan yang gagal membuat transaksi rollback, bukan meninggalkan nota yatim', async () => {
  // failAt 2 = query kedua (INSERT detail) gagal, setelah nota tersimpan.
  const tx = stub({ rows: { id: 'nota-uuid' }, failAt: 2 });
  const { status, body } = await call(app(tx, ADMIN), 'POST', '/api/simapo/penerimaan', {
    no_nota: 'N1', tgl_nota: '2026-01-05', penyedia: 'PT A',
    items: [{ barang_id: 'B1', volume: 1, harga_satuan: 10 }],
  });

  assert.equal(status, 500);
  assert.equal(body.ok, false);
  assert.equal(tx.rolledBack, true, 'nota harus di-rollback, tidak boleh yatim');
  assert.equal(tx.committed, false);
});

test('total_nilai yang dikirim tidak dipercaya kalau nol', async () => {
  const tx = stub({ rows: { id: 'x' } });
  await call(app(tx, ADMIN), 'POST', '/api/simapo/penerimaan', {
    no_nota: 'N1', tgl_nota: '2026-01-05', penyedia: 'PT',
    total_nilai: 0,
    items: [{ barang_id: 'B1', volume: 2, harga_satuan: 50 }],
  });
  assert.equal(tx.calls[0].params[4], 100, 'harus dihitung ulang dari items');
});

// ── pemeliharaan ──
test('GET /pemeliharaan menambah filter barang hanya kalau ada', async () => {
  const tx = stub({ rows: [] });
  const a = app(tx, ADMIN);

  await call(a, 'GET', '/api/simapo/pemeliharaan');
  assert.ok(!tx.calls[0].sql.includes('AND p.barang_id'));
  assert.equal(tx.calls[0].params.length, 1);

  await call(a, 'GET', '/api/simapo/pemeliharaan?barang_id=B7');
  assert.ok(tx.calls[1].sql.includes('AND p.barang_id = $2'));
  assert.equal(tx.calls[1].params[1], 'B7');
});

test('POST /pemeliharaan menolak biaya negatif jadi nol', async () => {
  const tx = stub({ rows: { id: 'p1' } });
  const { status } = await call(app(tx, ADMIN), 'POST', '/api/simapo/pemeliharaan', {
    barang_id: 'B1', jenis_pemeliharaan: 'Ganti Bearing', biaya: -5000,
  });
  assert.equal(status, 200);
  // index 4 = biaya pada INSERT_PEMELIHARAAN_SQL.
  assert.equal(tx.calls[0].params[4], 0);
});

test('POST /pemeliharaan menolak tanpa barang_id atau jenis', async () => {
  const tx = stub();
  const { status, body } = await call(app(tx, ADMIN), 'POST', '/api/simapo/pemeliharaan', { jenis_pemeliharaan: 'x' });
  assert.equal(status, 400);
  assert.equal(body.ok, false);
  assert.equal(tx.calls.length, 0);
});

// ── BKU ──
test('POST /bku menolak kiriman kosong dengan 400', async () => {
  const tx = stub();
  const { status, body } = await call(app(tx, ADMIN), 'POST', '/api/simapo/bku', { rows: [] });
  assert.equal(status, 400);
  assert.match(body.message, /kosong/);
  assert.equal(tx.calls.length, 0);
});

test('POST /bku menyisipkan satu tuple per baris dan mengembalikan ids', async () => {
  const tx = stub({ rows: [{ id: 1 }, { id: 2 }] });
  const { status, body } = await call(app(tx, ADMIN), 'POST', '/api/simapo/bku', {
    rows: [{ uraian: 'A', penerimaan: 10 }, { uraian: 'B', pengeluaran: 5, saldo: 5 }],
  });

  assert.equal(status, 200);
  assert.deepEqual(body.ids, [1, 2]);
  assert.equal(tx.calls[0].sql.includes('%VALUES%'), false);
  // 2 baris x 10 kolom = 20 param.
  assert.equal(tx.calls[0].params.length, 20);
  assert.equal(tx.calls[0].params[0], 'bapperida');
});

test('POST /bku dibatasi 500 baris supaya satu request tidak menulis tabel penuh', async () => {
  const tx = stub({ rows: [] });
  const rows = Array.from({ length: 501 }, () => ({ uraian: 'x' }));
  const { status, body } = await call(app(tx, ADMIN), 'POST', '/api/simapo/bku', { rows });
  assert.equal(status, 400);
  assert.match(body.message, /500/);
  assert.equal(tx.calls.length, 0);
});

// ── bentuk SQL yang dipakai bersama ──
test('SQL yang dipakai bersama punya placeholder jelas dan tanpa nilai user hardcoded', () => {
  // Guardrails: kalau ada yang menulis nilai ke dalam string SQL, test ini gagal.
  assert.ok(MASTER_SQL.includes('$1'));
  assert.ok(INSERT_NOTA_SQL.includes('$10'));
  assert.ok(UPDATE_STOK_SQL.includes('$1::uuid'));
  assert.ok(INSERT_DETAIL_SQL.includes('%VALUES%'));
  assert.ok(INSERT_BKU_SQL.includes('%VALUES%'));
  for (const sql of SEMUA_SQL) {
    assert.ok(!/bapperida/.test(sql), 'nilai default tidak boleh masuk ke SQL');
  }
});

// ── helper murni kategori & master ──
test('normalJenis memetakan apa pun di luar "Habis Pakai" ke "Aset Tetap"', () => {
  assert.equal(normalJenis('Habis Pakai'), 'Habis Pakai');
  assert.equal(normalJenis('habis_pakai'), 'Habis Pakai');
  assert.equal(normalJenis('HABIS PAKAI'), 'Habis Pakai');
  assert.equal(normalJenis('Aset Tetap'), 'Aset Tetap');
  assert.equal(normalJenis(''), 'Aset Tetap');
  assert.equal(normalJenis(undefined), 'Aset Tetap');
  // Bentuk tidak dikenal jatuh ke Aset Tetap, sama seperti n8n. Kalau tidak,
  // barang baru bisa punya jenis yang tidak terhitung unit_aset-nya di katalog.
  assert.equal(normalJenis('ngawur'), 'Aset Tetap');
});

test('buatKodeBarang mengikuti AT/HP + kategori + timestamp n8n', () => {
  assert.match(buatKodeBarang('Aset Tetap', 'furnitur'), /^AT-FURNI-\d{4}$/);
  assert.match(buatKodeBarang('Habis Pakai', 'abc'), /^HP-ABC-\d{4}$/);
  // Kategori kosong/aneh tidak boleh bikin kode jadi kosong atau berisi tanda baca.
  assert.match(buatKodeBarang('Aset Tetap', ''), /^AT-KTG-\d{4}$/);
  assert.match(buatKodeBarang('Aset Tetap', 'a-b c!'), /^AT-ABC-\d{4}$/);
});

// ── kategori barang ──
test('GET /kategori-list mengembalikan data array dan mengoper instansi lewat $1', async () => {
  const tx = stub({ rows: { items: [{ id: 'k1', nama: 'Furnitur', jumlah_aset: 2 }] } });
  const { status, body } = await call(app(tx, ADMIN), 'GET', '/api/simapo/kategori-list');

  assert.equal(status, 200);
  assert.equal(body.ok, true);
  // parseApiResponse() hanya bisa menampilkan ini kalau data-nya array.
  assert.ok(Array.isArray(body.data));
  assert.equal(body.data[0].nama, 'Furnitur');
  assert.equal(tx.calls[0].params[0], 'bapperida');
});

test('GET /kategori-list mengembalikan array kosong, bukan undefined, saat items null', async () => {
  // COALESCE(json_agg,'[]') di SQL sudah menutup kasus ini; guard ini mencegah
  // regresi kalau nanti query-nya berubah dan items jadi null.
  const tx = stub({ rows: { items: null } });
  const { status, body } = await call(app(tx, ADMIN), 'GET', '/api/simapo/kategori-list');
  assert.equal(status, 200);
  assert.deepEqual(body.data, []);
});

test('POST /kategori-save menolak nama kosong tanpa menyentuh DB', async () => {
  const tx = stub({ rows: { id: 'k1' } });
  const { status, body } = await call(app(tx, ADMIN), 'POST', '/api/simapo/kategori-save', { nama: '   ' });
  assert.equal(status, 400);
  assert.match(body.message, /nama/);
  assert.equal(tx.calls.length, 0);
});

test('POST /kategori-save mengirim nama, deskripsi, dan instansi sebagai parameter', async () => {
  const tx = stub({ rows: { id: 'k1', nama: 'Furnitur' } });
  const { status, body } = await call(app(tx, ADMIN), 'POST', '/api/simapo/kategori-save', {
    nama: 'Furnitur', deskripsi: 'kursi dan meja',
  });
  assert.equal(status, 200);
  assert.equal(body.id, 'k1');
  assert.deepEqual(tx.calls[0].params, ['Furnitur', 'kursi dan meja', 'bapperida']);
});

test('POST /kategori-delete 404 saat id milik instansi lain, bukan melaporkan sukses', async () => {
  const tx = stub({ rows: [] });
  const { status, body } = await call(app(tx, ADMIN), 'POST', '/api/simapo/kategori-delete', { id: 'k_milik_lain' });
  assert.equal(status, 404);
  assert.equal(body.ok, false);
  // Scoping ditegakkan di SQL, bukan dicek ulang di JS setelah query.
  assert.ok(KATEGORI_DELETE_SQL.includes('instansi_id = $2'));
});

test('POST /kategori-delete menolak id kosong tanpa menyentuh DB', async () => {
  const tx = stub({ rows: [] });
  const { status } = await call(app(tx, ADMIN), 'POST', '/api/simapo/kategori-delete', {});
  assert.equal(status, 400);
  assert.equal(tx.calls.length, 0);
});

// ── katalog ──
test('GET /katalog menghitung stok Aset Tetap dari unit_aset, bukan kolom stok', async () => {
  const tx = stub({ rows: { items: [{ id: 'b1', nama: 'Kursi', stok_saat_ini: 3 }] } });
  const { status, body } = await call(app(tx, ADMIN), 'GET', '/api/simapo/katalog');
  assert.equal(status, 200);
  assert.equal(body.data[0].stok_saat_ini, 3);
  assert.equal(tx.calls[0].params[0], 'bapperida');
  assert.ok(KATALOG_SQL.includes('COUNT(*)::int'), 'stok aset tetap harus dihitung');
  assert.ok(KATALOG_SQL.includes('unit_aset'));
});

test('GET /katalog mengembalikan array kosong saat tidak ada barang', async () => {
  const tx = stub({ rows: { items: [] } });
  const { body } = await call(app(tx, ADMIN), 'GET', '/api/simapo/katalog');
  assert.deepEqual(body.data, []);
});

// ── master barang ──
test('GET /admin-master-list mengembalikan data array dan nama kategori', async () => {
  const tx = stub({ rows: { items: [{ id: 'b1', nama: 'Kursi', nama_kategori: 'Furnitur' }] } });
  const { status, body } = await call(app(tx, ADMIN), 'GET', '/api/simapo/admin-master-list');
  assert.equal(status, 200);
  assert.ok(Array.isArray(body.data));
  assert.equal(body.data[0].nama_kategori, 'Furnitur');
  assert.equal(tx.calls[0].params[0], 'bapperida');
});

test('POST /admin-master-save menolak nama kosong tanpa menyentuh DB', async () => {
  const tx = stub({ rows: { id: 'b1' } });
  const { status, body } = await call(app(tx, ADMIN), 'POST', '/api/simapo/admin-master-save', { nama: '' });
  assert.equal(status, 400);
  assert.match(body.message, /Nama barang/);
  assert.equal(tx.calls.length, 0);
});

test('POST /admin-master-save mengarang kode barang saat body tidak mengirimnya', async () => {
  const tx = stub({ rows: { id: 'b1', nama: 'Kursi' } });
  const { status } = await call(app(tx, ADMIN), 'POST', '/api/simapo/admin-master-save', {
    nama: 'Kursi', jenisbarang: 'Aset Tetap', kategoriid: 'furnitur', stok_saat_ini: 2,
  });
  assert.equal(status, 200);
  const p = tx.calls[0].params;
  assert.match(p[1], /^AT-FURNI-\d{4}$/);
  // id kosong berarti barang baru: null, bukan string kosong yang menggagalkan COALESCE.
  assert.equal(p[0], null);
  assert.equal(p[3], 'Aset Tetap');
  assert.equal(p[11], 'bapperida');
});

test('POST /admin-master-save memakai id dari body untuk update dan clamp angka negatif', async () => {
  const tx = stub({ rows: { id: 'b1', nama: 'Kursi' } });
  await call(app(tx, ADMIN), 'POST', '/api/simapo/admin-master-save', {
    id: 'b1', nama: 'Kursi', stok_saat_ini: -5, minimumstok: -2, hargasatuan: -100,
  });
  const p = tx.calls[0].params;
  assert.equal(p[0], 'b1');
  assert.equal(p[7], 0);
  assert.equal(p[8], 0);
  assert.equal(p[9], 0);
  // Satuan kosong harus dapat default, bukan string kosong tersimpan ke DB.
  assert.equal(p[4], 'Unit');
});

test('POST /admin-master-save 404 saat DO UPDATE kena scope guard, bukan diam-diam sukses', async () => {
  // RETURNING kosong = WHERE di DO UPDATE tidak terpenuhi = id milik instansi lain.
  // Melaporkan "berhasil" di sini berarti admin mengira datanya tersimpan padahal tidak.
  const tx = stub({ rows: [] });
  const { status, body } = await call(app(tx, ADMIN), 'POST', '/api/simapo/admin-master-save', {
    id: 'b_milik_lain', nama: 'Paksa',
  });
  assert.equal(status, 404);
  assert.equal(body.ok, false);
  assert.ok(MASTER_SAVE_SQL.includes('DO UPDATE'));
  assert.ok(MASTER_SAVE_SQL.includes('WHERE "SIMAPO".barang.instansi_id = EXCLUDED.instansi_id'));
});

// unit_aset.instansi_id dan barang.instansi_id sama-sama default 'bapperida'.
// Kalau INSERT unit_aset tidak menyebutKolomnya, admin dinsos yang membuat Aset
// Tetap akan mendapat barang(instansi=dinsos) berisi unit_aset(instansi=bapperida).
// Katalog memfilter per instansi, jadi unit_aset salahbnbound = unit hilang dari
// daftar aset instansi itu tanpa ada error.
test('POST /admin-master-save menulis unit_aset dengan instansi yang sama', async () => {
  const tx = stub({ rows: { id: 'b1', nama: 'Kursi' } });
  await call(app(tx, { ...ADMIN, instansi_id: 'dinsos' }), 'POST',
    '/api/simapo/admin-master-save', { nama: 'Kursi', jenisbarang: 'Aset Tetap' });
  assert.equal(tx.calls[0].params[11], 'dinsos', 'barang harus memakai instansi pemanggil');
  // Kolom unit_aset harus eksplisit, bukan DEFAULT kolom.
  assert.match(MASTER_SAVE_SQL, /INSERT INTO "SIMAPO"\.unit_aset \([^)]*instansi_id/i);
  assert.match(MASTER_SAVE_SQL, /ins_ua AS[\s\S]*?instansi_id\s*\n?\s*FROM new_barang/i);
});

test('kolom yang dibaca dari CTE new_barang harus ada di RETURNING-nya', () => {
  // Bug nyata yang lolos dari assertion di atas: ins_ua men-select nb.instansi_id
  // sementara new_barang tidak mengembalikannya. Assertion tekstual tetap hijau,
  // tapi Postgres menolak statement-nya saat dijalankan (500). Yang menguji
  // eksekusinya PREPARE di scripts/prepare-check.mjs, bukan suite ini.
  const returning = new Set(
    MASTER_SAVE_SQL.match(/RETURNING\s+([\s\S]*?)\n\s*\)/)[1]
      .split(',').map((s) => s.trim()).filter(Boolean),
  );
  const dipakai = new Set([...MASTER_SAVE_SQL.matchAll(/\bnb\.(\w+)/g)].map((m) => m[1]));
  const hilang = [...dipakai].filter((c) => !returning.has(c));
  assert.deepEqual(hilang, [], `kolom dibaca tapi tidak di-RETURNING: ${hilang.join(', ')}`);
});

test('POST /admin-master-delete menonaktifkan barang, bukan menghapus barisnya', async () => {
  const tx = stub({ rows: { id: 'b1', nama: 'Kursi' } });
  const { status, body } = await call(app(tx, ADMIN), 'POST', '/api/simapo/admin-master-delete', { id: 'b1' });
  assert.equal(status, 200);
  assert.equal(body.ok, true);
  // Soft delete: isactive = false. Menghapus baris akan memutus unit_aset dan riwayat mutasi.
  assert.ok(MASTER_DELETE_SQL.includes('isactive = false'));
  assert.ok(!/^\s*DELETE\s+FROM/m.test(MASTER_DELETE_SQL));
  assert.deepEqual(tx.calls[0].params, ['b1', 'bapperida']);
});

test('POST /admin-master-delete menolak id kosong dan 404 untuk milik instansi lain', async () => {
  const kosong = stub({ rows: [] });
  assert.equal((await call(app(kosong, ADMIN), 'POST', '/api/simapo/admin-master-delete', {})).status, 400);
  assert.equal(kosong.calls.length, 0);

  const milikLain = stub({ rows: [] });
  assert.equal((await call(app(milikLain, ADMIN), 'POST', '/api/simapo/admin-master-delete', { id: 'x' })).status, 404);
});

// ── keamanan: nilai client pada 7 endpoint baru tidak masuk ke teks SQL ──
test('nilai berbahaya pada kategori/katalog/master tidak pernah masuk ke teks SQL', async () => {
  const jahat = "'; DROP TABLE \"SIMAPO\".barang; --";
  const tx = stub({ rows: { id: 'x', items: [] } });
  const a = app(tx, ADMIN);

  await call(a, 'GET', '/api/simapo/kategori-list?instansi_id=' + encodeURIComponent(jahat));
  await call(a, 'POST', '/api/simapo/kategori-save', { nama: jahat, deskripsi: jahat });
  await call(a, 'POST', '/api/simapo/kategori-delete', { id: jahat });
  await call(a, 'GET', '/api/simapo/katalog');
  await call(a, 'GET', '/api/simapo/admin-master-list');
  await call(a, 'POST', '/api/simapo/admin-master-save', {
    id: jahat, nama: jahat, jenisbarang: jahat, kategoriid: jahat, satuan: jahat, spesifikasi: jahat,
  });
  await call(a, 'POST', '/api/simapo/admin-master-delete', { id: jahat });

  assert.equal(tx.calls.length, 7, 'ada endpoint yang tidak menyentuh query');
  for (const c of tx.calls) {
    assert.ok(!c.sql.includes('DROP TABLE'), `SQL mengandung input mentah: ${c.sql}`);
  }
  const paramText = JSON.stringify(tx.calls.flatMap((c) => c.params));
  assert.ok(paramText.includes('DROP TABLE'), 'nilai jahat tidak pernah masuk ke params');
});

// ── SuperAdmin boleh lintas instansi, non-SuperAdmin tidak ──
test('SUPERADMIN boleh menulis ke instansi lain, admin biasa tidak', async () => {
  const sa = stub({ rows: { id: 'k1' } });
  await call(app(sa, { id: 9, role: 'SUPERADMIN', instansi_id: 'bapperida' }), 'POST', '/api/simapo/kategori-save', {
    nama: 'X', instansi_id: 'dinsos',
  });
  assert.equal(sa.calls[0].params[2], 'dinsos');

  const admin = stub({ rows: { id: 'k1' } });
  await call(app(admin, ADMIN), 'POST', '/api/simapo/kategori-save', { nama: 'X', instansi_id: 'dinsos' });
  assert.equal(admin.calls[0].params[2], 'bapperida', 'instansi_id dari body tidak boleh dipakai admin biasa');
});

test('SUPERADMIN tetap boleh menghapus kategori instansi lain, admin biasa tidak', async () => {
  const sa = stub({ rows: [] });
  await call(app(sa, { id: 9, role: 'SUPERADMIN', instansi_id: 'bapperida' }), 'POST', '/api/simapo/kategori-delete', {
    id: 'k1', instansi_id: 'dinsos',
  });
  assert.deepEqual(sa.calls[0].params, ['k1', 'dinsos']);

  const admin = stub({ rows: [] });
  await call(app(admin, ADMIN), 'POST', '/api/simapo/kategori-delete', { id: 'k1', instansi_id: 'dinsos' });
  assert.deepEqual(admin.calls[0].params, ['k1', 'bapperida']);
});

// ── error database ──
// Stub baru per endpoint: failAt menghitung query ke-n, jadi satu stub dipakai
// berulang hanya akan melempar sekali di endpoint pertama.
test('query yang menolak pada tiap endpoint kategori/master membalas 500, bukan melempar keluar', async () => {
  const cases = [
    ['GET', '/api/simapo/kategori-list', {}],
    ['POST', '/api/simapo/kategori-save', { nama: 'x' }],
    ['POST', '/api/simapo/kategori-delete', { id: 'x' }],
    ['GET', '/api/simapo/katalog', {}],
    ['GET', '/api/simapo/admin-master-list', {}],
    ['POST', '/api/simapo/admin-master-save', { nama: 'x' }],
    ['POST', '/api/simapo/admin-master-delete', { id: 'x' }],
  ];
  for (const [method, url, body] of cases) {
    const tx = stub({ rows: {}, failAt: 1 });
    const { status, err, body: out } = await call(app(tx, ADMIN), method, url, body);
    assert.equal(err, undefined, `${url} melempar keluar`);
    assert.equal(status, 500, `${url} tidak membalas 500`);
    assert.equal(out.ok, false, `${url} tidak menyetel ok:false`);
  }
});

// ── mutasi stok ──
// Kontrak n8n "Calc Mutasi" membaca barangmasukid/barangkeluarid, tapi frontend
// (submitMutasiBarang) mengirim barang_id + jenis. Aslinya tidak cocok: kolom
// masuk/keluar kosong dan UPDATE barang WHERE id='null' tidak mengubah apa pun.
// Endpoint native jadi menerima bentuk yang benar-benar dikirim frontend.

test('GET /mutasi-list mengembalikan {ok,data} dan mengoper instansi lewat $1', async () => {
  const tx = stub({ rows: { items: [{ id: 'm1', nama_barang: 'Kursi', jenis: 'MASUK' }] } });
  const { status, body } = await call(app(tx, ADMIN), 'GET', '/api/simapo/mutasi-list');

  assert.equal(status, 200);
  assert.equal(body.ok, true);
  assert.ok(Array.isArray(body.data));
  assert.equal(body.data[0].nama_barang, 'Kursi');
  assert.equal(tx.calls[0].params[0], 'bapperida');
  // Riwayat milik orang lain tidak boleh ikut terbawa.
  assert.ok(MUTASI_LIST_SQL.includes('m.instansi_id = $1'));
});

test('GET /mutasi-list mengembalikan array kosong saat items null', async () => {
  const tx = stub({ rows: { items: null } });
  const { status, body } = await call(app(tx, ADMIN), 'GET', '/api/simapo/mutasi-list');
  assert.equal(status, 200);
  assert.deepEqual(body.data, []);
});

test('POST /mutasi-save menolak tanpa barang_id tanpa menyentuh DB', async () => {
  const tx = stub();
  const { status, body } = await call(app(tx, ADMIN), 'POST', '/api/simapo/mutasi-save', { jenis: 'MASUK', jumlah: 1 });
  assert.equal(status, 400);
  assert.equal(body.ok, false);
  assert.equal(tx.calls.length, 0);
});

test('POST /mutasi-save menolak jumlah di bawah 1 tanpa menyentuh DB', async () => {
  const tx = stub();
  for (const jumlah of [0, -5, 'abc', null]) {
    const { status } = await call(app(tx, ADMIN), 'POST', '/api/simapo/mutasi-save', {
      barang_id: 'b1', jenis: 'MASUK', jumlah,
    });
    assert.equal(status, 400, `jumlah=${jumlah} diterima`);
  }
  assert.equal(tx.calls.length, 0);
});

test('POST /mutasi-save MASUK mengisi barangmasukid dan menambah stok dalam satu transaksi', async () => {
  const tx = stub({ rows: { id: 'b1', stok_saat_ini: 8 } });
  const { status, body } = await call(app(tx, ADMIN), 'POST', '/api/simapo/mutasi-save', {
    barang_id: 'b1', jenis: 'MASUK', jumlah: 3, keterangan: 'pembelian',
  });

  assert.equal(status, 200);
  assert.equal(body.ok, true);
  assert.equal(body.stok_saat_ini, 8);
  assert.equal(tx.began, true);
  assert.equal(tx.committed, true);
  assert.equal(tx.rolledBack, false);

  const [ins, upd] = tx.calls;
  assert.equal(ins.params[0], 'b1', 'barang masuk harus mengisi barangmasukid');
  assert.equal(ins.params[1], null, 'barang keluar harus null untuk MASUK');
  assert.equal(ins.params[3], 3);
  assert.equal(ins.params[5], 'bapperida');
  // MASUK menambah stok: delta positif.
  assert.equal(upd.params[1], 3);
});

test('POST /mutasi-save KELUAR, RUSAK, dan TRANSFER mengisi barangkeluarid dan mengurangi stok', async () => {
  for (const jenis of ['KELUAR', 'RUSAK', 'TRANSFER']) {
    const tx = stub({ rows: { id: 'b1', stok_saat_ini: 2 } });
    const { status } = await call(app(tx, ADMIN), 'POST', '/api/simapo/mutasi-save', {
      barang_id: 'b1', jenis, jumlah: 2,
    });
    assert.equal(status, 200, `${jenis} ditolak`);
    assert.equal(tx.calls[0].params[0], null, `${jenis} tidak boleh mengisi barangmasukid`);
    assert.equal(tx.calls[0].params[1], 'b1', `${jenis} tidak mengisi barangkeluarid`);
    assert.equal(tx.calls[1].params[1], -2, `${jenis} tidak mengurangi stok`);
  }
});

test('POST /mutasi-save memakai NIP sesi dan mengabaikan nip dari body', async () => {
  const tx = stub({ rows: { id: 'b1', stok_saat_ini: 5 } });
  await call(app(tx, ADMIN), 'POST', '/api/simapo/mutasi-save', {
    barang_id: 'b1', jenis: 'MASUK', jumlah: 1, nip: 'NIP_PALSU', createdbyid: 'NIP_PALSU',
  });
  assert.equal(tx.calls[0].params[2], ADMIN.nip, 'createdbyid harus dari sesi');
  const allText = JSON.stringify(tx.calls.flatMap((c) => c.params));
  assert.ok(!allText.includes('NIP_PALSU'), 'NIP dari body bocor ke query');
});

test('POST /mutasi-save 404 dan rollback saat barang bukan milik instansi', async () => {
  // UPDATE stok tidak kena baris -> mutasi harus ikut batal, jangan jadi yatim.
  const tx = stub({ rows: [] });
  const { status, body } = await call(app(tx, ADMIN), 'POST', '/api/simapo/mutasi-save', {
    barang_id: 'b1', jenis: 'MASUK', jumlah: 1,
  });

  assert.equal(status, 404);
  assert.equal(body.ok, false);
  assert.equal(tx.began, true);
  assert.equal(tx.rolledBack, true);
  assert.equal(tx.committed, false);
  // Scope ditegakkan di SQL, bukan dicek ulang di JS.
  assert.ok(MUTASI_STOK_SQL.includes('instansi_id = $3'));
});

test('POST /mutasi-save tidak pernah menurunkan stok di bawah nol', async () => {
  assert.ok(MUTASI_STOK_SQL.includes('GREATEST(0,'), 'stok harus dijepit di nol');
});

test('nilai berbahaya pada mutasi tidak pernah masuk ke teks SQL', async () => {
  const jahat = "'; DROP TABLE \"SIMAPO\".mutasi_barang; --";
  const tx = stub({ rows: { id: 'b1', stok_saat_ini: 1, items: [] } });
  const a = app(tx, ADMIN);
  await call(a, 'GET', '/api/simapo/mutasi-list?instansi_id=' + encodeURIComponent(jahat));
  await call(a, 'POST', '/api/simapo/mutasi-save', {
    barang_id: jahat, jenis: 'MASUK', jumlah: 1, keterangan: jahat,
  });

  assert.equal(tx.calls.length, 3);
  for (const c of tx.calls) assert.ok(!c.sql.includes('DROP TABLE'), `SQL mengandung input mentah: ${c.sql}`);
  assert.ok(JSON.stringify(tx.calls.flatMap((c) => c.params)).includes('DROP TABLE'));
});