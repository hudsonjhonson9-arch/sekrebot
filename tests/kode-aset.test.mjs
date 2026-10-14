import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { singkatanNama, kategoriDariKode, guessKategori, bersihKategori, buatKodeAset, beriUrutan } from '../server/kode-aset.js';

const ROOT = path.resolve(import.meta.dirname, '..');
const extraSrc = fs.readFileSync(path.join(ROOT, 'server', 'simapo-native-extra.js'), 'utf8');
const simapoSrc = fs.readFileSync(path.join(ROOT, 'server', 'simapo.js'), 'utf8');
const extSrc = fs.readFileSync(path.join(ROOT, 'js', 'simapo-ext.js'), 'utf8');
const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');

test('singkatanNama: contoh disetujui user → KPC', () => {
  assert.equal(singkatanNama('Komputer PC/-All in one'), 'KPC');
});

test('singkatanNama: akronim kapital diambil utuh, kata biasa huruf awal', () => {
  assert.equal(singkatanNama('Mobil Pickup'), 'MP');
  assert.equal(singkatanNama('Sepeda Motor'), 'SM');
  assert.equal(singkatanNama('AC Spilit 1 PK'), 'ACSPK');
  assert.equal(singkatanNama('Router'), 'R');
});

test('singkatanNama: kata penghubung/angka dilewati, maks 6 karakter', () => {
  assert.equal(singkatanNama('Komputer PC Tipe 1'), 'KPC');
  assert.equal(singkatanNama('Meja 1/2 Biro'), 'MB');
  assert.ok(singkatanNama('Hardisk Eksternal SSD 1 TB').length <= 6);
  assert.equal(singkatanNama(''), 'ASSET');
});

test('kategoriDariKode: segmen KIB menentukan kategori', () => {
  assert.equal(kategoriDariKode('1.3.2.10.01.02.001'), 'Elektronik/TIK');
  assert.equal(kategoriDariKode('1.3.2.02.01.04.001'), 'Kendaraan');
  assert.equal(kategoriDariKode('1.3.2.05.02.01.024'), 'Mebel');
  assert.equal(kategoriDariKode('1.3.2.05.01.04.002'), 'Peralatan Kantor');
  assert.equal(kategoriDariKode('bukan-kode'), null);
});

test('guessKategori fallback dari nama', () => {
  assert.equal(guessKategori('Laptop'), 'Elektronik/TIK');
  assert.equal(guessKategori('Kursi tamu'), 'Mebel');
  assert.equal(guessKategori('Gorden'), 'Lainnya');
});

test('buatKodeAset: format lengkap sesuai contoh user', () => {
  assert.equal(buatKodeAset({ nama: 'Komputer PC/-All in one', kategori: 'Elektronik/TIK', tahun: '2025', harga: 8702400 }),
    'KPC-ELEKTRONIKTIK-2025-8702400');
  assert.equal(buatKodeAset({ nama: 'Komputer PC/-All in one', kategori: 'Elektronik/TIK', tahun: 2025, harga: 11523680 }),
    'KPC-ELEKTRONIKTIK-2025-11523680');
});

test('buatKodeAset: kategori diambil dari kode KIB bila kolom kategori kosong', () => {
  assert.equal(buatKodeAset({ nama: 'Mobil Pickup', kodeBarang: '1.3.2.02.01.01.003', tahun: '2012', harga: 192896000 }),
    'MP-KENDARAAN-2012-192896000');
});

test('buatKodeAset: tahun/harga kosong jadi 0000/0', () => {
  assert.equal(buatKodeAset({ nama: 'Almari', kategori: 'Mebel' }), 'A-MEBEL-0000-0');
});

test('beriUrutan: kode dasar tabrak diberi akhiran -2, -3', () => {
  const out = beriUrutan([
    { key: 'u3', dasar: 'KBM-MEBEL-2017-550000' },
    { key: 'u1', dasar: 'KBM-MEBEL-2017-550000' },
    { key: 'u2', dasar: 'KBM-MEBEL-2017-550000' },
    { key: 'u9', dasar: 'X-Y-2020-1' },
  ]);
  assert.equal(out.get('u1'), 'KBM-MEBEL-2017-550000');
  assert.equal(out.get('u2'), 'KBM-MEBEL-2017-550000-2');
  assert.equal(out.get('u3'), 'KBM-MEBEL-2017-550000-3');
  assert.equal(out.get('u9'), 'X-Y-2020-1');
});

test('bersihKategori: huruf besar, bukan alfanumerik dibuang', () => {
  assert.equal(bersihKategori('Elektronik/TIK'), 'ELEKTRONIKTIK');
  assert.equal(bersihKategori(''), null);
});

test('server: kode_aset dipilih di bast-list/unit-list dan disimpan saat import', () => {
  assert.match(extraSrc, /COALESCE\(ua\.kode_aset,''\) kode_aset/,
    'bast-list mengirim kode_aset');
  assert.match(extraSrc, /ua\.id,ua\.nomorinventaris,ua\.qrcode,ua\.kondisi,ua\.statuspinjam,ua\.tahunperolehan,ua\.pegawai_id,ua\.kode_aset/,
    'unit-list mengirim kode_aset');
  assert.match(extraSrc, /ua\.tahunperolehan,ua\.barangid,ua\.kode_aset/,
    'unit-list-all mengirim kode_aset');
  assert.match(extraSrc, /unit_aset ADD COLUMN IF NOT EXISTS kode_aset TEXT/,
    'bast-init menyiapkan kolom kode_aset');
  assert.match(extraSrc, /import \{ buatKodeAset \} from '\.\/kode-aset\.js'/);
  assert.equal((extraSrc.match(/buatKodeAset\(/g) || []).length >= 3, true,
    'bast-import-unit, aset-massal, dan import-bapperida mengisi kode_aset');
  assert.match(simapoSrc, /kode_aset=\$1 WHERE barangid=\$2/,
    'admin-master-save memberi kode_aset pada unit baru');
});

test('client: list aset & export menampilkan kode_aset; cache-buster di-bump', () => {
  assert.match(extSrc, /u\.kode_aset \? '<b style="color:var\(--gold\);">/,
    'kartu daftar aset menampilkan kode_aset');
  assert.match(extSrc, /u\.kode_aset && u\.kode_aset\.toLowerCase\(\)\.includes\(q\)/,
    'pencarian daftar aset mencakup kode_aset');
  assert.match(extSrc, /'Kode Aset'/, 'export Excel punya kolom Kode Aset');
  assert.match(html, /js\/simapo-ext\.js\?v=\d{8}[a-z]?/);
  assert.match(html, /js\/simapo-bast\.js\?v=\d{8}[a-z]?/);
});
