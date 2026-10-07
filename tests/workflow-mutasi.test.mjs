import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// Node "Calc Mutasi" hidup di dalam JSON workflow, bukan di file .js, jadi tidak
// ikut tertangkap test server. Padahal di situlah penentuan MASUK/KELUAR dan
// arah delta stok terjadi; kalau salah, mutasi MASUK tersimpan dengan delta
// negatif dan tanpa barang_id tanpa error apa pun.
//
// Test ini mengeksekusi jsCode-nya apa adanya, lalu membandingkan hasilnya.
// Edge yang dijaga: bentuk payload lama (barangmasukid / barangkeluarid) tidak
// boleh berubah perilaku, dan bentuk modern harus menghasilkan nilai yang sama
// dengan route native POST /api/simapo/mutasi-save.

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const FILES = [
  'n8n/SIMAPO - Mutasi Stok.json',
  'n8n/export/SIMAPO - Mutasi Stok.json',
  'n8n/simapo/04_mutasi_stok.json',
];

// Export n8n modern menyimpan graph dua kali: di `nodes` dan di `activeVersion`.
// Keduanya wajib sama, kalau tidak satu representasi diam-diam masih logic lama.
function nodeCopies(doc, nama) {
  const out = [];
  for (const node of doc.nodes || []) {
    if (node.name === nama) out.push(['nodes', node.parameters?.jsCode || node.parameters?.query || '']);
  }
  const av = doc.activeVersion;
  const avNodes = Array.isArray(av) ? av : (av?.nodes || av?.workflow?.nodes || []);
  for (const node of avNodes) {
    if (node.name === nama) out.push(['activeVersion', node.parameters?.jsCode || node.parameters?.query || '']);
  }
  return out;
}

function jalankan(code, body) {
  return new Function('$input', code)({ item: { json: { body } } })[0].json;
}

const KASUS = [
  // [nama, body, { barangmasukid, barangkeluarid, barangid, delta }]
  ['legacy MASUK', { barangmasukid: 'A', jumlah: 5 }, { barangmasukid: 'A', barangkeluarid: null, barangid: 'A', delta: 5 }],
  ['legacy KELUAR', { barangkeluarid: 'B', jumlah: 3 }, { barangmasukid: null, barangkeluarid: 'B', barangid: 'B', delta: -3 }],
  ['modern MASUK', { barang_id: 'C', jenis: 'MASUK', jumlah: 7 }, { barangmasukid: 'C', barangkeluarid: null, barangid: 'C', delta: 7 }],
  ['modern KELUAR', { barang_id: 'D', jenis: 'KELUAR', jumlah: 2 }, { barangmasukid: null, barangkeluarid: 'D', barangid: 'D', delta: -2 }],
  // jenis kosong harus MASUK, sama dengan route native (simapo.js:537)
  ['modern jenis kosong', { barang_id: 'E', jumlah: 1 }, { barangmasukid: 'E', barangkeluarid: null, barangid: 'E', delta: 1 }],
  ['legacy kedua kolom', { barangmasukid: 'F', barangkeluarid: 'G', jumlah: 1 }, { barangmasukid: 'F', barangkeluarid: null, barangid: 'F', delta: 1 }],
  // tanpa id / jumlah tidak valid tidak lagi masuk daftar ini: guard di node
  // yang melempar, diuji di test "menolak payload yang tidak valid" di bawah.
  // id dibaca dengan trim, sama seperti helper S() di route native.
  ['id berspasi', { barang_id: '  H  ', jenis: 'MASUK', jumlah: 2 }, { barangmasukid: 'H', barangkeluarid: null, barangid: 'H', delta: 2 }],
];

for (const rel of FILES) {
  test(`Calc Mutasi di ${rel} menormalkan kedua bentuk payload`, () => {
    const full = path.join(ROOT, rel);
    if (!fs.existsSync(full)) return; // repo ini tidak punya workflow tersebut
    const copies = nodeCopies(JSON.parse(fs.readFileSync(full, 'utf8')), 'Calc Mutasi');
    assert.ok(copies.length, `node "Calc Mutasi" tidak ditemukan di ${rel}`);

    for (const [asal, code] of copies) {
      assert.ok(/b\.barang_id/.test(code),
        `${rel} (${asal}) masih membaca bentuk lama saja: payload barang_id akan jadi barangid null`);

      for (const [nama, body, exp] of KASUS) {
        const got = jalankan(code, body);
        assert.equal(got.barangmasukid, exp.barangmasukid, `${rel} (${asal}) ${nama}: barangmasukid`);
        assert.equal(got.barangkeluarid, exp.barangkeluarid, `${rel} (${asal}) ${nama}: barangkeluarid`);
        assert.equal(got.barangid, exp.barangid, `${rel} (${asal}) ${nama}: barangid`);
        assert.equal(got.delta, exp.delta, `${rel} (${asal}) ${nama}: delta`);
      }
    }
  });

  test(`Calc Mutasi di ${rel} menolak payload yang tidak valid`, () => {
    const full = path.join(ROOT, rel);
    if (!fs.existsSync(full)) return;
    const copies = nodeCopies(JSON.parse(fs.readFileSync(full, 'utf8')), 'Calc Mutasi');
    assert.ok(copies.length, `node "Calc Mutasi" tidak ditemukan di ${rel}`);

    // Guard yang sama dengan route native (server/simapo.js:531-534). Tanpa ini
    // payload tanpa id tetap menulis baris mutasi yatim, dan jumlah 0 tersimpan
    // sebagai mutasi sungguhan.
    const HARUS_DITOLAK = [
      ['tanpa id sama sekali', {}, 'barang_id wajib diisi'],
      ['id null', { barang_id: null, jumlah: 5 }, 'barang_id wajib diisi'],
      ['id kosong string', { barang_id: '   ', jumlah: 5 }, 'barang_id wajib diisi'],
      ['tanpa jumlah', { barang_id: 'A' }, 'jumlah harus bilangan bulat'],
      ['jumlah nol', { barang_id: 'A', jumlah: 0 }, 'jumlah harus bilangan bulat'],
      ['jumlah negatif', { barang_id: 'A', jumlah: -3 }, 'jumlah harus bilangan bulat'],
      ['jumlah pecahan', { barang_id: 'A', jumlah: 1.5 }, 'jumlah harus bilangan bulat'],
      ['jumlah bukan angka', { barang_id: 'A', jumlah: 'abc' }, 'jumlah harus bilangan bulat'],
    ];

    for (const [asal, code] of copies) {
      for (const [nama, body,crumb] of HARUS_DITOLAK) {
        assert.throws(() => jalankan(code, body), (e) => {
          assert.match(e.message, new RegExp(crumb), `${rel} (${asal}) ${nama}: pesan galat`);
          return true;
        }, `${rel} (${asal}) ${nama}: seharusnya ditolak`);
      }
      // Pemanggil lama mengirim jumlah sebagai string; jangan sampai rapuh.
      assert.equal(jalankan(code, { barang_id: 'A', jenis: 'MASUK', jumlah: '5' }).delta, 5,
        `${rel} (${asal}) jumlah string harus tetap diterima`);
    }
  });

  test(`PG Save Mutasi di ${rel} menolak barang yang tidak bisa diubah stoknya`, () => {
    const full = path.join(ROOT, rel);
    if (!fs.existsSync(full)) return;
    const copies = nodeCopies(JSON.parse(fs.readFileSync(full, 'utf8')), 'PG Save Mutasi');
    assert.ok(copies.length, `node "PG Save Mutasi" tidak ditemukan di ${rel}`);

    for (const [asal, q] of copies) {
      // Guard harus mendahului INSERT: kalau tidak, exception terjadi setelah
      // baris mutasi terlanjur ditulis dan tidak ada yang membatalkannya.
      const posisiGuard = q.search(/RAISE EXCEPTION/);
      const posisiInsert = q.search(/INSERT INTO "SIMAPO"\.mutasi_barang/);
      assert.ok(posisiGuard > -1, `${rel} (${asal}) tidak punya guard barang`);
      assert.ok(posisiInsert > posisiGuard,
        `${rel} (${asal}) guard harus sebelum INSERT, tidak sesudahnya`);

      // UPDATE harus membatasi instansi + isactive, sama seperti
      // MUTASI_STOK_SQL di route native; tanpa ini pemanggil lain instansi
      // masih bisa mengubah stok.
      const update = q.slice(q.search(/UPDATE "SIMAPO"\.barang/));
      assert.match(update, /AND instansi_id =/, `${rel} (${asal}) UPDATE tanpa batas instansi`);
      assert.match(update, /AND isactive/, `${rel} (${asal}) UPDATE tanpa batas isactive`);
    }
  });
}