// Test router SIMAPO dengan stub query/withTransaction, jadi tidak ada DB atau
// jaringan yang tersentuh. Yang dijaga tiga hal: (1) nilai dari client tidak pernah
// masuk ke teks SQL, (2) transaksi untuk penerimaan, (3) bentuk respons
// yang dipakai frontend lewat parseApiResponse(). Router requireRole diuji
// terpisah di index.test.js sebagai mount smoke test.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import express from 'express';
import PizZip from 'pizzip';

import { groupPermen47Rows } from './simapo-excel.js';
import {
  createSimapoRouter,
  barisBKU,
  instansiOtomatis,
  normalJenis,
  buatKodeBarang,
  bolehUbahSimapo,
  idUuid,
  bacaPenerimaan,
  MASTER_SQL,
  PKS_TAHUN_SQL,
  PKS_TREE_KEGIATAN_SQL,
  PKS_TREE_SUBKEGIATAN_SQL,
  PENERIMAAN_RIWAYAT_SQL,
  INSERT_NOTA_SQL,
  INSERT_DETAIL_SQL,
  UPDATE_STOK_SQL,
  STOK_KURANG_SQL,
  INSERT_BKU_SQL,
  CARI_BARANG_BY_NAMA_SQL,
  BUAT_BARANG_PENERIMAAN_SQL,
  PENERIMAAN_LIST_SQL,
  PENERIMAAN_NOTA_SQL,
  PENERIMAAN_UPDATE_NOTA_SQL,
  PENERIMAAN_DELETE_DETAIL_SQL,
  PENERIMAAN_DELETE_SQL,
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
  PEMELIHARAAN_SQL,
  PEMELIHARAAN_UPDATE_SQL,
  PEMELIHARAAN_DELETE_SQL,
  KARTU_PEMELIHARAAN_BARANG_SQL,
  LAPORAN_PERMEN47_PENERIMAAN_SQL,
  LAPORAN_PERMEN47_FALLBACK_SQL,
} from './simapo.js';

// Semua SQL yang dibungkus router, dipakai guard "tidak ada nilai user hardcoded".
const SEMUA_SQL = [
  MASTER_SQL, INSERT_NOTA_SQL, INSERT_DETAIL_SQL, UPDATE_STOK_SQL, INSERT_BKU_SQL,
  CARI_BARANG_BY_NAMA_SQL, BUAT_BARANG_PENERIMAAN_SQL, PENERIMAAN_LIST_SQL,
  PENERIMAAN_NOTA_SQL, PENERIMAAN_UPDATE_NOTA_SQL, PENERIMAAN_DELETE_DETAIL_SQL,
  PENERIMAAN_DELETE_SQL, STOK_KURANG_SQL,
  KATEGORI_LIST_SQL, KATEGORI_SAVE_SQL, KATEGORI_DELETE_SQL,
  KATALOG_SQL, MASTER_LIST_SQL, MASTER_SAVE_SQL, MASTER_DELETE_SQL,
  MUTASI_LIST_SQL, MUTASI_INSERT_SQL, MUTASI_STOK_SQL,
  PEMELIHARAAN_SQL, PEMELIHARAAN_UPDATE_SQL, PEMELIHARAAN_DELETE_SQL,
  KARTU_PEMELIHARAAN_BARANG_SQL,
  LAPORAN_PERMEN47_PENERIMAAN_SQL, LAPORAN_PERMEN47_FALLBACK_SQL,
  PKS_TAHUN_SQL, PKS_TREE_KEGIATAN_SQL, PKS_TREE_SUBKEGIATAN_SQL,
  PENERIMAAN_RIWAYAT_SQL,
];

// ── stub ──
function stub({ rows = [], failAt = 0 } = {}) {
  const calls = [];
  const tx = { calls, began: false, rolledBack: false, committed: false };

  const runner = async (sql, params) => {
    calls.push({ sql, params });
    if (failAt && calls.length === failAt) throw new Error('db exploded');
    if (typeof rows === 'function') {
      const res = await rows(sql, params, calls.length);
      return { rows: Array.isArray(res) ? res : [res] };
    }
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
// Dua role yang berhak mengubah data, plus satu role yang hanya boleh melihat.
const BENDAHARA = { id: '2', nip: '198801011990031002', role: 'BENDAHARA BARANG', instansi_id: 'bapperida' };
const KEPALA = { id: '3', nip: '197501011998031001', role: 'KEPALA', instansi_id: 'bapperida' };

function call(a, method, url, body) {
  return new Promise((resolve) => {
    let err;
    const res = {
      statusCode: 0,
      body: null,
      headers: {},
      status(c) { this.statusCode = c; return this; },
      json(p) { this.body = p; this.statusCode ||= 200; done(); return this; },
      end(b) { if (b) this.body = b; this.statusCode ||= 200; done(); return this; },
      send(b) { if (b) this.body = b; this.statusCode ||= 200; done(); return this; },
      setHeader(k, v) { this.headers[k.toLowerCase()] = v; },
    };
    const done = () => resolve({ err, status: res.statusCode, body: res.body, headers: res.headers });
    const req = { method, url, headers: { 'content-type': 'application/json' } };
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
test('GET /penerimaan mengembalikan daftar nota sebagai data dan master terpisah', async () => {
  const tx = stub({
    rows: (sql) => (sql.includes('json_build_object')
      ? { data: { kodefikasi: [], rekening: [], barang: [], periode: { bulan: 10, tahun: 2026 } } }
      : { id: 'n1', no_nota: 'N1', tgl_nota: '2026-01-05', penyedia: 'PT A' }),
  });
  const { status, body } = await call(app(tx, ADMIN), 'GET', '/api/simapo/penerimaan');

  assert.equal(status, 200);
  assert.equal(body.ok, true);
  // parseApiResponse() hanya mengenal array; objek di `data` membuat daftar kosong.
  assert.ok(Array.isArray(body.data), 'data harus array daftar nota');
  assert.equal(body.data[0].no_nota, 'N1');
  // Master tetap dikirim, hanya tidak lagi menempel di `data`.
  assert.equal(typeof body.master, 'object');
  assert.ok(Array.isArray(body.master.barang));
  assert.equal(tx.calls[0].params[0], 'bapperida');
  assert.ok(tx.calls[0].sql.includes('$1'));
  assert.equal(tx.calls[1].params[0], 'bapperida');
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

// Regresi: tuple detail harus punya placeholder = jumlah kolom INSERT.
// Bentuk lama (5 kolom, 4 placeholder) ditolak Postgres 42601 dan simpan jadi 500.
// Kini 7 kolom: penerimaan_id + barang, volume, harga, total, kode_rekening, uraian_belanja.
test('INSERT detail penerimaan punya tujuh placeholder per baris', async () => {
  const tx = stub({ rows: { id: 'nota-uuid' } });
  const { status } = await call(app(tx, ADMIN), 'POST', '/api/simapo/penerimaan', {
    no_nota: 'N1', tgl_nota: '2026-01-05', penyedia: 'PT A',
    items: [
      { barang_id: 'B1', volume: 1, harga_satuan: 10, kode_rekening: '5.1.02.01.01.0024', uraian_belanja: 'Belanja ATK' },
      { barang_id: 'B2', volume: 2, harga_satuan: 20 },
    ],
  });
  assert.equal(status, 200);

  const detail = tx.calls.find((c) => c.sql.includes('INSERT INTO "SIMAPO".detail_penerimaan'));
  assert.ok(detail.sql.includes('kode_rekening'), 'INSERT detail wajib memuat kode_rekening');
  assert.ok(detail.sql.includes('uraian_belanja'), 'INSERT detail wajib memuat uraian_belanja');
  // penerimaan_id (uuid) selalu $1; 6 kolom sisanya menempel di belakangnya.
  assert.match(
    detail.sql,
    /VALUES \(\$1, \$2, \$3, \$4, \$5, \$6, \$7\), \(\$1, \$8, \$9, \$10, \$11, \$12, \$13\)/,
  );
  assert.equal(detail.params.length, 13, 'nota + 6 kolom x 2 baris');
  assert.equal(detail.params[0], 'nota-uuid');
  assert.equal(detail.params[5], '5.1.02.01.01.0024', 'kode rekening per baris ikut tersimpan');
  assert.equal(detail.params[6], 'Belanja ATK');
  assert.equal(detail.params[7], 'B2', 'tuple kedua dimulai dari barang_id');
  assert.equal(detail.params[11], '', 'kode rekening kosong -> string kosong');
});

test('POST /penerimaan mencari barang per nama lalu membuatnya bila belum ada', async () => {
  const tx = stub({
    rows: (sql) => {
      if (sql.includes('INSERT INTO "SIMAPO".penerimaan_barang')) return { id: 'nota-uuid' };
      if (sql.includes('nama = $2')) return [];
      if (sql.includes('INSERT INTO "SIMAPO".barang')) return { id: 'barang-baru' };
      if (sql.includes('INSERT INTO "SIMAPO".detail_penerimaan')) return { barang_id: 'barang-baru', volume: 2 };
      if (sql.includes('UPDATE "SIMAPO".barang')) return { id: 'barang-baru' };
      return {};
    },
  });
  const { status, body } = await call(app(tx, ADMIN), 'POST', '/api/simapo/penerimaan', {
    no_nota: 'N1', tgl_nota: '2026-01-05', penyedia: 'PT A',
    items: [{ nama_barang: 'Kertas A4', volume: 2, harga_satuan: 50000, satuan: 'Rim' }],
  });

  assert.equal(status, 200);
  assert.equal(body.ok, true);

  const cari = tx.calls.find((c) => c.sql.includes('nama = $2'));
  assert.ok(cari, 'item tanpa barang_id harus dicari per nama dulu');
  assert.deepEqual(cari.params, ['bapperida', 'Kertas A4']);

  const buat = tx.calls.find((c) => c.sql.includes('INSERT INTO "SIMAPO".barang'));
  assert.ok(buat, 'barang yang belum ada dibuat sebagai Habis Pakai');
  assert.equal(buat.params[1], 'Kertas A4');
  assert.equal(buat.params[4], 'bapperida');

  const detail = tx.calls.find((c) => c.sql.includes('INSERT INTO "SIMAPO".detail_penerimaan'));
  assert.equal(detail.params[1], 'barang-baru', 'detail memakai id hasil bukan string kosong');
});

test('item penerimaan tanpa nama barang dijawab 400, bukan 500', async () => {
  const tx = stub({ rows: { id: 'nota-uuid' } });
  const { status, body } = await call(app(tx, ADMIN), 'POST', '/api/simapo/penerimaan', {
    no_nota: 'N1', tgl_nota: '2026-01-05', penyedia: 'PT A',
    items: [{ volume: 1, harga_satuan: 10 }],
  });

  assert.equal(status, 400);
  assert.match(body.message, /nama barang/);
  assert.equal(tx.rolledBack, true, 'nota harus di-rollback');
});

test('barang_id yang tidak dikenal dijawab 400, bukan 500', async () => {
  const tx = stub({
    rows: (sql) => {
      if (sql.includes('INSERT INTO "SIMAPO".detail_penerimaan')) {
        const e = new Error('violates foreign key constraint');
        e.code = '23503';
        throw e;
      }
      return { id: 'nota-uuid' };
    },
  });
  const { status, body } = await call(app(tx, ADMIN), 'POST', '/api/simapo/penerimaan', {
    no_nota: 'N1', tgl_nota: '2026-01-05', penyedia: 'PT A',
    items: [{ barang_id: 'tidak-ada', volume: 1, harga_satuan: 10 }],
  });

  assert.equal(status, 400);
  assert.match(body.message, /master barang/);
  assert.equal(tx.rolledBack, true);
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

// ── Kode & uraian sub kegiatan disimpan terpisah (2 kolom) ──
test('bacaPenerimaan memisahkan kode dan uraian sub kegiatan', () => {
  const out = bacaPenerimaan({
    no_nota: 'N', tgl_nota: '2026-01-01', penyedia: 'PT A',
    sub_kegiatan: '5.01.01.2.09.0009', sub_kegiatan_uraian: 'Pemeliharaan Gedung Kantor',
    items: [{ volume: 1, harga_satuan: 10 }],
  });
  assert.equal(out.error, undefined);
  assert.equal(out.subKeg, '5.01.01.2.09.0009');
  assert.equal(out.subKegUraian, 'Pemeliharaan Gedung Kantor');
});

test('INSERT/UPDATE nota membawa kode DAN uraian sub kegiatan sebagai kolom terpisah', async () => {
  const tx = stub({ rows: { id: 'nota-uuid' } });
  await call(app(tx, ADMIN), 'POST', '/api/simapo/penerimaan', {
    no_nota: 'N1', tgl_nota: '2026-01-05', penyedia: 'PT A',
    sub_kegiatan: '5.01.01.2.09.0009', sub_kegiatan_uraian: 'Pemeliharaan Gedung Kantor',
    items: [{ barang_id: 'B1', volume: 1, harga_satuan: 10 }],
  });
  const nota = tx.calls[0];
  assert.ok(nota.sql.includes('sub_kegiatan_uraian'), 'INSERT harus menyimpan uraian terpisah');
  assert.equal(nota.params[7], '5.01.01.2.09.0009', 'param $8 = kode sub kegiatan');
  assert.equal(nota.params[8], 'Pemeliharaan Gedung Kantor', 'param $9 = uraian sub kegiatan');
  assert.match(PENERIMAAN_UPDATE_NOTA_SQL, /sub_kegiatan_uraian = \$11/);
  assert.ok(PENERIMAAN_LIST_SQL.includes('pb.sub_kegiatan_uraian'), 'daftar nota ikut membawa uraian');
});

test('laporan Permen 47 memakai uraian tersimpan lebih dulu, join hanya fallback', () => {
  assert.ok(
    LAPORAN_PERMEN47_PENERIMAAN_SQL.includes("COALESCE(NULLIF(pb.sub_kegiatan_uraian, ''), sk.nama, '') AS nama_sub_kegiatan"),
    'uraian tersimpan menang atas nama hasil join',
  );
  assert.ok(LAPORAN_PERMEN47_PENERIMAAN_SQL.includes('LEFT JOIN "SIMAPO".subkegiatan sk'), 'join tetap dipakai sebagai fallback');
});

// ── Sumber kegiatan/sub kegiatan (tabel PKS bercadangan tahun) & riwayat ──
test('GET /pks-tahun mengembalikan daftar tahun dengan tahun berjalan disuntik', async () => {
  const tx = stub({ rows: [{ tahun: 2027 }, { tahun: 2026 }] });
  const { status, body } = await call(app(tx, ADMIN), 'GET', '/api/simapo/pks-tahun');

  assert.equal(status, 200);
  assert.ok(Array.isArray(body), 'bentuk array supaya frontend tinggal map');
  const now = new Date().getFullYear();
  assert.ok(body.includes(2027) && body.includes(2026), 'tahun berdata tetap utuh');
  assert.ok(body.includes(now), 'tahun berjalan selalu tersedia walau belum seed');
  assert.ok(tx.calls[0].sql.includes('FROM pks_tahun'));
  assert.equal(tx.calls[0].sql.includes('bapperida'), false, 'instansi tidak boleh dihardcode di SQL');
});

test('GET /pks-tree mengembalikan kegiatan & subkegiatan untuk tahun diminta', async () => {
  const tx = stub({
    rows: (sql) => {
      if (sql.includes('FROM pks_kegiatan')) {
        return [{ id: 'k1', kode: '5.01.01.2.09', nama: 'Keg. Pemeliharaan', program_kode: '5.01.01' }];
      }
      if (sql.includes('FROM pks_subkegiatan')) {
        return [{ id: 's1', kegiatan_id: 'k1', kode: '5.01.01.2.09.0009', nama: 'Pemeliharaan Gedung Kantor' }];
      }
      return [];
    },
  });
  const { status, body } = await call(app(tx, ADMIN), 'GET', '/api/simapo/pks-tree?tahun=2026');

  assert.equal(status, 200);
  assert.equal(body.tahun, 2026);
  assert.equal(body.data.kegiatan[0].kode, '5.01.01.2.09');
  assert.equal(body.data.subkegiatan[0].kegiatan_id, 'k1', 'sub kegiatan harus bisa difilter lewat kegiatan_id');
  assert.deepEqual(tx.calls[0].params, [2026], 'tahun dikirim sebagai parameter, bukan literal');
});

test('GET /penerimaan-riwayat mengembalikan saran penyedia & kontrak instansi pemanggil', async () => {
  const tx = stub({ rows: { penyedia: ['CV Sumber Karya', 'PT Maju'], kontrak: ['Swakelola', 'Langganan'] } });
  const { status, body } = await call(app(tx, ADMIN), 'GET', '/api/simapo/penerimaan-riwayat');

  assert.equal(status, 200);
  assert.deepEqual(body.data.penyedia, ['CV Sumber Karya', 'PT Maju']);
  assert.deepEqual(body.data.kontrak, ['Swakelola', 'Langganan']);
  assert.ok(tx.calls[0].sql.includes('FROM "SIMAPO".penerimaan_barang'));
  assert.ok(tx.calls[0].sql.includes('FROM "SIMAPO".pemeliharaan'), 'riwayat digabung dari kartu pemeliharaan');
  assert.equal(tx.calls[0].params[0], 'bapperida', 'dibatasi instansi pemanggil');
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

  assert.equal(tx.calls.length, 8, 'ada endpoint yang tidak menyentuh query (admin-master-save kini 2 query: simpan + kode_aset unit)');
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

// ── Laporan Pengadaan Permen 47 ──
test('GET /laporan-permen47 mengembalikan data berhirarki sesuai Permen 47', async () => {
  const mockPenerimaan = [
    {
      barang_id: 'b-cat',
      kodebarang: '1.1.7.01.01.01.006',
      nama_barang: 'Cat Tembok 20 kg',
      spesifikasi: 'Warna Putih',
      satuan: 'Kaleng',
      jumlah: 4,
      harga_satuan: 500000,
      total_nilai: 2000000,
      sub_kegiatan: '5.01.01.2.09.0009',
      tgl_nota: '2026-02-15',
      nama_penyedia: 'CV Mandiri',
      bentuk_kontrak: 'SPK',
      dokumen_sumber: 'SP2D-001',
      nama_kategori: 'Bahan Bangunan',
    },
  ];
  const tx = stub({ rows: mockPenerimaan });
  const a = app(tx, ADMIN);

  const { status, body } = await call(a, 'GET', '/api/simapo/laporan-permen47?periode=TW1&tahun=2026');
  assert.equal(status, 200);
  assert.equal(body.ok, true);
  assert.equal(body.data.periode, 'TW1');
  assert.equal(body.data.tahun, 2026);
  assert.equal(body.data.total_nilai, 2000000);

  // Cek struktur hierarki: ASET -> ASET LANCAR -> PERSEDIAAN -> BARANG PAKAI HABIS -> Kategori -> Item
  const rows = body.data.rows;
  assert.ok(rows.length >= 6);
  assert.equal(rows[0].nama, 'ASET');
  assert.equal(rows[0].is_header, true);
  assert.equal(rows[1].nama, 'ASET LANCAR');
  assert.equal(rows[2].nama, 'PERSEDIAAN');
  assert.equal(rows[3].nama, 'BARANG PAKAI HABIS');
  assert.equal(rows[4].nama, 'BAHAN BANGUNAN');

  const leaf = rows.find((r) => !r.is_header);
  assert.ok(leaf);
  assert.equal(leaf.nama_barang, 'Cat Tembok 20 kg');
  assert.equal(leaf.jumlah, 4);
  assert.equal(leaf.harga_satuan, 500000);
  assert.equal(leaf.total_nilai, 2000000);
  assert.equal(leaf.nilai_perolehan, 2000000);
  assert.equal(leaf.biaya_atribusi, 0);

  // Periksa rentang tanggal TW1 (01-01 s/d 03-31) diteruskan sebagai parameter SQL
  assert.equal(tx.calls[0].params[1], '2026-01-01');
  assert.equal(tx.calls[0].params[2], '2026-03-31');
});

test('GET /laporan-permen47 fallback ke SIMAPO.barang bila penerimaan kosong', async () => {
  const mockBarang = [
    {
      barang_id: 'b-atk',
      kodebarang: 'HP-ATK-001',
      nama_barang: 'Kertas HVS A4',
      spesifikasi: '75 gram',
      satuan: 'Rim',
      jumlah: 10,
      harga_satuan: 60000,
      total_nilai: 600000,
      sub_kegiatan: '5.01.01.2.09.0001',
      tgl_nota: '2026-01-10',
      nama_penyedia: '',
      bentuk_kontrak: '',
      dokumen_sumber: '',
      nama_kategori: 'Alat Tulis Kantor',
    },
  ];

  // Query 1: penerimaan -> kosong; Query 2: fallback -> mockBarang
  let queryCount = 0;
  const tx = stub({
    rows: () => {
      queryCount++;
      return queryCount === 1 ? [] : mockBarang;
    },
  });
  const a = app(tx, ADMIN);

  const { status, body } = await call(a, 'GET', '/api/simapo/laporan-permen47?periode=TAHUNAN&tahun=2026');
  assert.equal(status, 200);
  assert.equal(body.ok, true);
  assert.equal(body.data.total_nilai, 600000);
  assert.equal(tx.calls.length, 2);
  assert.ok(tx.calls[1].sql.includes('SIMAPO".barang'));
});

test('GET /laporan-permen47/xlsx menghasilkan file excel biner valid', async () => {
  const mockPenerimaan = [
    {
      barang_id: 'b-cat',
      kodebarang: '1.1.7.01.01.01.006',
      nama_barang: 'Cat Tembok 20 kg',
      spesifikasi: 'Warna Putih',
      satuan: 'Kaleng',
      jumlah: 2,
      harga_satuan: 550000,
      total_nilai: 1100000,
      sub_kegiatan: '5.01.01.2.09.0009',
      tgl_nota: '2026-02-15',
      nama_penyedia: 'CV Mandiri',
      bentuk_kontrak: 'SPK',
      dokumen_sumber: 'SP2D-001',
      nama_kategori: 'Bahan Bangunan',
    },
  ];
  const tx = stub({ rows: mockPenerimaan });
  const a = app(tx, ADMIN);

  const { status, body, headers } = await call(a, 'GET', '/api/simapo/laporan-permen47/xlsx?periode=TW2&tahun=2026');
  assert.equal(status, 200);
  assert.equal(headers['content-type'], 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  assert.match(headers['content-disposition'], /Laporan_Pengadaan_Pakai_Habis_Permen47_TW2_2026\.xlsx/);
  assert.ok(Buffer.isBuffer(body));
  // Magic bytes untuk ZIP file (PK\x03\x04)
  assert.equal(body[0], 0x50);
  assert.equal(body[1], 0x4b);
});

test('Excel Permen 47 memakai merge, label, dan nomor kolom template resmi', async () => {
  const a = app(stub({
    rows: [{
      barang_id: 'b-cat',
      kodebarang: '1.1.7.01.01.01.006',
      nama_barang: 'Cat Tembok 20 kg',
      spesifikasi: 'Warna Putih',
      satuan: 'Kaleng',
      jumlah: 2,
      harga_satuan: 550000,
      total_nilai: 1100000,
      sub_kegiatan: '5.01.01.2.09.0009',
      tgl_nota: '2026-02-15',
      nama_penyedia: 'CV Mandiri',
      bentuk_kontrak: 'SPK',
      dokumen_sumber: 'SP2D-001',
      nama_kategori: 'Bahan Bangunan',
    }],
  }), ADMIN);

  const { status, body } = await call(a, 'GET', '/api/simapo/laporan-permen47/xlsx?periode=TW1&tahun=2026');
  assert.equal(status, 200);

  const sheetXml = new PizZip(body).file('xl/worksheets/sheet1.xml').asText();
  const rowOf = (n) => (sheetXml.match(new RegExp('<row[^>]*\\br="' + n + '"[^>]*>[\\s\\S]*?</row>')) || [''])[0];
  const merges = Array.from(sheetXml.matchAll(/<mergeCell ref="([^"]+)"/g), (m) => m[1]);

  assert.ok(merges.includes('A8:A10') && merges.includes('B8:I8') && merges.includes('B11:H11'), 'merge header utama wajib sama dengan template');
  assert.ok(merges.includes('B9:B10'), 'Kode Barang harus merge vertikal B9:B10');
  assert.ok(!merges.includes('B9:H10'), 'merge lama B9:H10 sudah diganti agar kotak kode tampil');
  assert.ok(!rowOf(8).includes('>Nama Barang</t>'), 'Nama Barang tidak boleh berada di baris 8 (area merge B8:I8)');
  assert.ok(rowOf(9).includes('>Nama Barang</t>'), 'Nama Barang ada di baris 9 seperti template');
  assert.ok(rowOf(10).includes('( Rp)'), 'baris satuan rupiah wajib ada');
  assert.ok(rowOf(11).includes('9 = 6 X 8') && rowOf(11).includes('21'), 'baris nomor kolom 1..21 wajib sama');

  for (const label of [
    'Penggolongan dan Kodefikasi Barang', 'Spesifikasi Nama Barang', 'Total Biaya Atribusi',
    'Harga Satuan Perolehan', 'Kode Sub Kegiatan', 'Nama Sub Kegiatan', 'Kode Rekening',
    'Uraian Belanja', 'Dokumen Sumber Perolehan', 'J U M L A H     T O T A L',
  ]) {
    assert.ok(sheetXml.includes(label), 'label template hilang: ' + label);
  }
});

test('subtotal level 1..5 Permen 47 memuat jumlah & nilai seperti template', () => {
  const { hierarchicalRows, totalNilai } = groupPermen47Rows([
    { nama_barang: 'Cat Tembok', jumlah: 4, harga_satuan: 500000, total_nilai: 2000000, nama_kategori: 'Bahan Bangunan' },
  ]);
  assert.equal(totalNilai, 2000000);

  const lvl = (n) => hierarchicalRows.find((r) => r.is_header && r.level === n);
  assert.equal(lvl(1).jumlah, undefined, 'level 1 (ASET) tanpa jumlah seperti template');
  assert.equal(lvl(2).jumlah, 4, 'level 2 memuat jumlah total');
  assert.equal(lvl(3).jumlah, 4, 'level 3 memuat jumlah total');
  assert.equal(lvl(4).jumlah, 4, 'level 4 memuat jumlah total');
  assert.equal(lvl(5).jumlah, 4, 'level 5 (kategori) memuat jumlah');
  assert.equal(lvl(4).total_nilai, 2000000);
});

test('SQL laporan Permen 47 mengisi nama sub kegiatan, kode & uraian rekening', () => {
  assert.ok(LAPORAN_PERMEN47_PENERIMAAN_SQL.includes('AS nama_sub_kegiatan'), 'kolom nama sub kegiatan wajib ada');
  assert.ok(LAPORAN_PERMEN47_PENERIMAAN_SQL.includes('AS kode_rekening'), 'kolom kode rekening wajib ada');
  assert.ok(LAPORAN_PERMEN47_PENERIMAAN_SQL.includes('AS uraian_belanja'), 'kolom uraian belanja wajib ada');
  assert.ok(
    LAPORAN_PERMEN47_PENERIMAAN_SQL.includes("COALESCE(NULLIF(dp.kode_rekening, ''), NULLIF(b.koderekening, ''), '') AS kode_rekening"),
    'kode rekening diambil dari detail baris lebih dulu, master barang hanya fallback',
  );
  assert.ok(
    LAPORAN_PERMEN47_PENERIMAAN_SQL.includes("COALESCE(NULLIF(dp.uraian_belanja, ''), rb.uraian, '') AS uraian_belanja"),
    'uraian belanja diambil dari detail baris lebih dulu',
  );
  assert.ok(LAPORAN_PERMEN47_PENERIMAAN_SQL.includes('LEFT JOIN "SIMAPO".subkegiatan'), 'join master subkegiatan wajib ada');
  assert.ok(LAPORAN_PERMEN47_PENERIMAAN_SQL.includes('LEFT JOIN "SIMAPO".rekening_belanja'), 'join master rekening wajib ada');
  assert.ok(LAPORAN_PERMEN47_FALLBACK_SQL.includes('AS kode_rekening'), 'jalur fallback ikut memuat kolom yang sama');
  assert.ok(PENERIMAAN_LIST_SQL.includes('dp.kode_rekening'), 'daftar nota ikut membawa kode rekening per item');
});

// ── Kartu Pemeliharaan ──
test('GET /pemeliharaan mengembalikan kodebarang, spesifikasi, satuan, dan nomorinventaris', async () => {
  const tx = stub({
    rows: [
      {
        id: 'p-1',
        barang_id: 'b-printer',
        nama_barang: 'Printer Epson L3110',
        kodebarang: '1.3.2.02.01.04.005',
        spesifikasi: 'Inkjet',
        satuan: 'Unit',
        nomorinventaris: 'AT-PRN-001',
        tgl_pemeliharaan: '2026-02-03',
        jenis_pemeliharaan: 'Servis Head',
        biaya: '250000',
        nama_penyedia: 'B.S. Computer',
        bentuk_kontrak: 'SPK',
        keterangan: 'Baik',
      },
    ],
  });
  const a = app(tx, ADMIN);

  const { status, body } = await call(a, 'GET', '/api/simapo/pemeliharaan?barang_id=b-printer');
  assert.equal(status, 200);
  assert.equal(body.ok, true);
  assert.equal(body.data.length, 1);
  const it = body.data[0];
  assert.equal(it.kodebarang, '1.3.2.02.01.04.005');
  assert.equal(it.spesifikasi, 'Inkjet');
  assert.equal(it.satuan, 'Unit');
  assert.equal(it.nomorinventaris, 'AT-PRN-001');
  assert.ok(PEMELIHARAAN_SQL.includes('b.kodebarang'));
  assert.ok(PEMELIHARAAN_SQL.includes('b.spesifikasi'));
  assert.ok(PEMELIHARAAN_SQL.includes('b.satuan'));
  assert.ok(PEMELIHARAAN_SQL.includes('nomorinventaris'));
  assert.ok(PEMELIHARAAN_SQL.includes('nama_pemegang'));
  assert.ok(KARTU_PEMELIHARAAN_BARANG_SQL.includes('nama_pemegang'));
  assert.ok(MASTER_LIST_SQL.includes('nama_pemegang'));
});

test('GET /kartu-pemeliharaan/xlsx menghasilkan file excel dengan header kartu yang sesuai', async () => {
  let callIdx = 0;
  const mockMaint = [
    {
      id: 'm-1',
      barang_id: 'b-1',
      nama_barang: 'Laptop ThinkPad',
      kodebarang: '1.3.2.10.01.02.001',
      spesifikasi: 'Core i7',
      nomorinventaris: 'AT-NB-001',
      tgl_pemeliharaan: '2026-01-15',
      jenis_pemeliharaan: 'Ganti Keyboard',
      biaya: 450000,
      nama_penyedia: 'Service Center',
      bentuk_kontrak: 'Nota',
      keterangan: 'Selesai',
    },
  ];
  const mockBarang = [
    {
      id: 'b-1',
      nama_barang: 'Laptop ThinkPad',
      kodebarang: '1.3.2.10.01.02.001',
      spesifikasi: 'Core i7',
      satuan: 'Unit',
      nomorinventaris: 'AT-NB-001',
    },
  ];

  const tx = stub({
    rows: () => {
      callIdx++;
      return callIdx === 1 ? mockMaint : mockBarang;
    },
  });
  const a = app(tx, ADMIN);

  const { status, body, headers } = await call(a, 'GET', '/api/simapo/kartu-pemeliharaan/xlsx?barang_id=b-1&tahun=2026');
  assert.equal(status, 200);
  assert.equal(headers['content-type'], 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  assert.match(headers['content-disposition'], /Kartu_Pemeliharaan_b-1_2026\.xlsx/);
  assert.ok(Buffer.isBuffer(body));
  assert.equal(body[0], 0x50);
  assert.equal(body[1], 0x4b);
});
test('POST /api/simapo/pemeliharaan mendukung batch multi-row items', async () => {
  let inserted = [];
  const tx = stub({
    rows: (sql, params) => {
      if (sql.includes('INSERT INTO "SIMAPO".pemeliharaan')) {
        inserted.push(params);
        return [{ id: 'm-' + inserted.length }];
      }
      return [];
    },
  });
  const a = app(tx, ADMIN);

  const payload = {
    barang_id: 'b-100',
    items: [
      { tgl_pemeliharaan: '2026-02-01', jenis_pemeliharaan: 'Servis Ringan', biaya: 150000, nama_penyedia: 'Bengkel A', bentuk_kontrak: 'Nota', keterangan: 'OK' },
      { tgl_pemeliharaan: '2026-03-01', jenis_pemeliharaan: 'Ganti Oli', biaya: 75000, nama_penyedia: 'Bengkel B', bentuk_kontrak: 'Nota', keterangan: 'Ganti rutin' },
    ]
  };

  const { status, body } = await call(a, 'POST', '/api/simapo/pemeliharaan', payload);
  assert.equal(status, 200);
  assert.equal(body.ok, true);
  assert.equal(body.count, 2);
  assert.equal(inserted.length, 2);
  assert.equal(inserted[0][1], 'b-100');
  assert.equal(inserted[0][3], 'Servis Ringan');
  assert.equal(inserted[1][3], 'Ganti Oli');
});

test('POST /api/simapo/pemeliharaan mendukung backward compatibility single-item payload', async () => {
  let inserted = [];
  const tx = stub({
    rows: (sql, params) => {
      if (sql.includes('INSERT INTO "SIMAPO".pemeliharaan')) {
        inserted.push(params);
        return [{ id: 'm-legacy' }];
      }
      return [];
    },
  });
  const a = app(tx, ADMIN);

  const payload = {
    barang_id: 'b-101',
    jenis_pemeliharaan: 'Perbaikan Rem',
    biaya: 200000,
    nama_penyedia: 'Bengkel Rem',
    bentuk_kontrak: 'Swakelola',
    keterangan: 'Darurat'
  };

  const { status, body } = await call(a, 'POST', '/api/simapo/pemeliharaan', payload);
  assert.equal(status, 200);
  assert.equal(body.ok, true);
  assert.equal(body.count, 1);
  assert.equal(inserted.length, 1);
  assert.equal(inserted[0][3], 'Perbaikan Rem');
});

test('POST /api/simapo/pemeliharaan menangani tanggal kosong secara aman (default ke hari ini)', async () => {
  let inserted = [];
  const tx = stub({
    rows: (sql, params) => {
      if (sql.includes('INSERT INTO "SIMAPO".pemeliharaan')) {
        inserted.push(params);
        return [{ id: 'm-date' }];
      }
      return [];
    },
  });
  const a = app(tx, ADMIN);

  const payload = {
    barang_id: 'b-102',
    items: [
      { tgl_pemeliharaan: '', jenis_pemeliharaan: 'Pengecekan Rutin', biaya: 0 }
    ]
  };

  const { status, body } = await call(a, 'POST', '/api/simapo/pemeliharaan', payload);
  assert.equal(status, 200);
  assert.equal(body.ok, true);
  assert.equal(inserted.length, 1);
  assert.ok(inserted[0][2]); // tgl_pemeliharaan defaults to today's date string
});

// ── CRUD penerimaan & kartu pemeliharaan ──
const NOTA_UUID = '11111111-1111-4111-8111-111111111111';

const payloadNota = (id) => ({
  id,
  no_nota: 'N-EDIT',
  tgl_nota: '2026-11-17',
  penyedia: 'PT Uji',
  items: [{ barang_id: 'b1', volume: 3, harga_satuan: 1000 }],
});

const payloadPm = (id) => ({
  id,
  barang_id: 'b1',
  items: [{ tgl_pemeliharaan: '2026-11-17', jenis_pemeliharaan: 'Servis', biaya: 5000 }],
});

test('bolehUbahSimapo mengizinkan SUPERADMIN, ADMIN dan BENDAHARA BARANG', () => {
  assert.equal(bolehUbahSimapo({ user: ADMIN }), true);
  assert.equal(bolehUbahSimapo({ user: BENDAHARA }), true);
  assert.equal(bolehUbahSimapo({ user: { role: 'SUPERADMIN', instansi_id: 'bapperida' } }), true);
  assert.equal(bolehUbahSimapo({ user: KEPALA }), false);
  assert.equal(bolehUbahSimapo({ user: { role: 'SEKRETARIS' } }), false);
  assert.equal(bolehUbahSimapo({}), false);
});

test('idUuid menolak id yang tidak berbentuk uuid supaya 22P02 jadi 400, bukan 500', () => {
  assert.equal(idUuid(NOTA_UUID), true);
  assert.equal(idUuid('abc'), false);
  assert.equal(idUuid(''), false);
  assert.equal(idUuid(undefined), false);
});

test('GET /penerimaan mengirim rincian items agar form ubah bisa diisi ulang', async () => {
  const tx = stub({ rows: (sql) => (sql.includes('json_build_object') ? { data: {} } : { id: 'n1', no_nota: 'N1' }) });
  const { status } = await call(app(tx, ADMIN), 'GET', '/api/simapo/penerimaan');
  assert.equal(status, 200);
  assert.ok(tx.calls[1].sql.includes('AS items'), 'daftar nota harus menyertakan kolom items');
});

test('POST /penerimaan-update ditolak 403 untuk role selain SUPERADMIN/ADMIN/BENDAHARA BARANG', async () => {
  const tx = stub({ rows: { id: NOTA_UUID } });
  const { status, body } = await call(app(tx, KEPALA), 'POST', '/api/simapo/penerimaan-update', payloadNota(NOTA_UUID));
  assert.equal(status, 403);
  assert.equal(body.ok, false);
  assert.match(body.message, /SUPERADMIN, ADMIN dan BENDAHARA BARANG/);
  assert.equal(tx.calls.length, 0, 'role tanpa hak tidak boleh menyentuh query sama sekali');
});

test('POST /penerimaan-update jalan untuk SUPERADMIN', async () => {
  const sa = { id: '9', role: 'SUPERADMIN', instansi_id: 'bapperida' };
  const tx = stub({
    rows: (sql) => {
      if (sql.includes('FOR UPDATE')) return { id: NOTA_UUID };
      if (sql.includes('INSERT INTO "SIMAPO".detail_penerimaan')) return { barang_id: 'b1', volume: 3 };
      if (sql.includes('UPDATE "SIMAPO".penerimaan_barang')) return { id: NOTA_UUID };
      if (sql.includes('DELETE')) return {};
      return { id: 'b1' };
    },
  });
  const { status, body } = await call(app(tx, sa), 'POST', '/api/simapo/penerimaan-update', payloadNota(NOTA_UUID));
  assert.equal(status, 200);
  assert.equal(body.ok, true);
  assert.equal(tx.began && tx.committed, true, 'transaksi superadmin juga harus COMMIT');
});

test('POST /penerimaan-update mengunci baris, membalik stok lama, lalu menulis detail baru', async () => {
  const tx = stub({
    rows: (sql) => {
      if (sql.includes('FOR UPDATE')) return { id: NOTA_UUID };
      if (sql.includes('INSERT INTO "SIMAPO".detail_penerimaan')) return { barang_id: 'b1', volume: 3 };
      if (sql.includes('UPDATE "SIMAPO".penerimaan_barang')) return { id: NOTA_UUID };
      if (sql.includes('DELETE')) return {};
      return { id: 'b1' };
    },
  });
  const { status, body } = await call(app(tx, BENDAHARA), 'POST', '/api/simapo/penerimaan-update', payloadNota(NOTA_UUID));

  assert.equal(status, 200);
  assert.equal(body.ok, true);
  assert.equal(tx.began && tx.committed, true, 'harus berakhir COMMIT');
  assert.equal(tx.rolledBack, false);

  const idx = (needle) => tx.calls.findIndex((c) => c.sql.includes(needle));
  const iKunci = idx('FOR UPDATE');
  const iKurang = idx('- t.vol');
  const iHapusDetail = idx('DELETE FROM "SIMAPO".detail_penerimaan');
  const iUbahNota = idx('UPDATE "SIMAPO".penerimaan_barang');
  const iTulisDetail = idx('INSERT INTO "SIMAPO".detail_penerimaan');
  const iTambahStok = tx.calls.reduce((acc, c, i) => (c.sql.includes('+ t.vol') ? i : acc), -1);

  assert.ok(iKunci >= 0 && iKurang > iKunci, 'baris dikunci dulu, baru stok dibalik');
  assert.ok(iHapusDetail > iKurang, 'stok lama dikembalikan sebelum detail dihapus');
  assert.ok(iUbahNota > iHapusDetail, 'detail habis sebelum notanya ditimpa');
  assert.ok(iTulisDetail > iUbahNota, 'detail baru ditulis setelah nota diubah');
  assert.ok(iTambahStok > iTulisDetail, 'stok dihitung ulang dari detail tersimpan');

  // Stok hanya memakai id nota: volume tersimpan di DB, bukan angka dari payload.
  assert.deepEqual(tx.calls[iKurang].params, [NOTA_UUID]);
});

test('POST /penerimaan-update 404 dan rollback bila id bukan milik instansi ini', async () => {
  const tx = stub({ rows: (sql) => (sql.includes('FOR UPDATE') ? [] : { id: NOTA_UUID }) });
  const { status, body } = await call(app(tx, ADMIN), 'POST', '/api/simapo/penerimaan-update', payloadNota(NOTA_UUID));
  assert.equal(status, 404);
  assert.equal(body.ok, false);
  assert.equal(tx.rolledBack, true, 'tidak boleh menyisakan perubahan sebagian');
  assert.equal(tx.calls.length, 1, 'berhenti setelah kunci tidak menemukan baris');
});

test('POST /penerimaan-update menolak id rusak dan kiriman tidak lengkap tanpa query', async () => {
  const tx = stub({ rows: { id: NOTA_UUID } });
  const a = app(tx, ADMIN);

  const rusak = await call(a, 'POST', '/api/simapo/penerimaan-update', payloadNota('bukan-uuid'));
  assert.equal(rusak.status, 400);

  const kosong = await call(a, 'POST', '/api/simapo/penerimaan-update', { id: NOTA_UUID, no_nota: 'N' });
  assert.equal(kosong.status, 400);
  assert.match(kosong.body.message, /wajib diisi/);

  assert.equal(tx.calls.length, 0, 'validasi gagal berarti nol query');
});

test('POST /penerimaan-delete ditolak 403 untuk KEPALA', async () => {
  const tx = stub({ rows: { id: NOTA_UUID } });
  const { status } = await call(app(tx, KEPALA), 'POST', '/api/simapo/penerimaan-delete', { id: NOTA_UUID });
  assert.equal(status, 403);
  assert.equal(tx.calls.length, 0);
});

test('POST /penerimaan-delete mengembalikan stok lalu menghapus detail sebelum nota', async () => {
  const tx = stub({
    rows: (sql) => {
      if (sql.includes('FOR UPDATE')) return { id: NOTA_UUID };
      if (sql.includes('DELETE FROM "SIMAPO".penerimaan_barang')) return { id: NOTA_UUID };
      if (sql.includes('DELETE')) return {};
      return { id: 'b1' };
    },
  });
  const { status, body } = await call(app(tx, ADMIN), 'POST', '/api/simapo/penerimaan-delete', { id: NOTA_UUID });
  assert.equal(status, 200);
  assert.equal(body.ok, true);
  assert.equal(tx.committed, true);

  const idx = (needle) => tx.calls.findIndex((c) => c.sql.includes(needle));
  const iKunci = idx('FOR UPDATE');
  const iKurang = idx('- t.vol');
  const iHapusDetail = idx('DELETE FROM "SIMAPO".detail_penerimaan');
  const iHapusNota = idx('DELETE FROM "SIMAPO".penerimaan_barang');
  assert.ok(iKunci < iKurang && iKurang < iHapusDetail && iHapusDetail < iHapusNota,
    'urutan wajib: kunci → balik stok → hapus detail → hapus nota (FK tanpa CASCADE)');
});

test('POST /pemeliharaan-update ditolak 403 untuk role tanpa hak', async () => {
  const tx = stub({ rows: { id: NOTA_UUID } });
  const { status, body } = await call(app(tx, KEPALA), 'POST', '/api/simapo/pemeliharaan-update', payloadPm(NOTA_UUID));
  assert.equal(status, 403);
  assert.equal(body.ok, false);
  assert.match(body.message, /SUPERADMIN, ADMIN dan BENDAHARA BARANG/);
  assert.equal(tx.calls.length, 0);
});

test('POST /pemeliharaan-update jalan untuk BENDAHARA BARANG dan mengembalikan 404 bila baris tidak ada', async () => {
  const ada = stub({ rows: { id: NOTA_UUID } });
  const ok = await call(app(ada, BENDAHARA), 'POST', '/api/simapo/pemeliharaan-update', payloadPm(NOTA_UUID));
  assert.equal(ok.status, 200);
  assert.equal(ok.body.ok, true);
  assert.ok(ada.calls[0].sql.includes('UPDATE "SIMAPO".pemeliharaan'));

  const hilang = stub({ rows: [] });
  const tidakAda = await call(app(hilang, ADMIN), 'POST', '/api/simapo/pemeliharaan-update', payloadPm(NOTA_UUID));
  assert.equal(tidakAda.status, 404);
});

test('POST /pemeliharaan-update menolak multi-baris dan id rusak', async () => {
  const tx = stub({ rows: { id: NOTA_UUID } });
  const a = app(tx, ADMIN);

  const multi = await call(a, 'POST', '/api/simapo/pemeliharaan-update', {
    ...payloadPm(NOTA_UUID),
    items: [
      { jenis_pemeliharaan: 'Servis' },
      { jenis_pemeliharaan: 'Cat' },
    ],
  });
  assert.equal(multi.status, 400);
  assert.match(multi.body.message, /satu baris/);

  const rusak = await call(a, 'POST', '/api/simapo/pemeliharaan-update', payloadPm('id-salah'));
  assert.equal(rusak.status, 400);

  assert.equal(tx.calls.length, 0, 'validasi gagal berarti nol query');
});

test('POST /pemeliharaan-delete dibatasi role, 404 bila bukan milik instansi', async () => {
  const tx = stub({ rows: { id: NOTA_UUID } });
  const ditolak = await call(app(tx, KEPALA), 'POST', '/api/simapo/pemeliharaan-delete', { id: NOTA_UUID });
  assert.equal(ditolak.status, 403);
  assert.equal(tx.calls.length, 0);

  const ada = stub({ rows: { id: NOTA_UUID } });
  const ok = await call(app(ada, BENDAHARA), 'POST', '/api/simapo/pemeliharaan-delete', { id: NOTA_UUID });
  assert.equal(ok.status, 200);
  assert.equal(ok.body.ok, true);
  assert.ok(ada.calls[0].sql.includes('DELETE FROM "SIMAPO".pemeliharaan'));
  assert.equal(ada.calls[0].params[1], 'bapperida', 'instansi ikut di WHERE');

  const hilang = stub({ rows: [] });
  const tidakAda = await call(app(hilang, ADMIN), 'POST', '/api/simapo/pemeliharaan-delete', { id: NOTA_UUID });
  assert.equal(tidakAda.status, 404);
});
