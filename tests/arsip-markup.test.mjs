import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '..');
const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
const lines = html.split(/\r?\n/);
const css = fs.readFileSync(path.join(ROOT, 'css', 'styles.css'), 'utf8');
const arsipJs = fs.readFileSync(path.join(ROOT, 'js', 'arsip.js'), 'utf8');
const arsipUi = fs.readFileSync(path.join(ROOT, 'js', 'arsip-ui.js'), 'utf8');
const runeicons = fs.readFileSync(path.join(ROOT, 'css', 'lib', 'runeicons.css'), 'utf8');

test('landmark beranda, section, dan overlay preview ada', () => {
  for (const id of [
    'arsipHome', 'arsipDokumen', 'arsipKK', 'arsipBD',
    'arsipPreview', 'arsipPreviewTitle', 'arsipPreviewBody',
    'arsipPreviewOpen', 'arsipPreviewDl', 'arsipPreviewClose', 'arsipTileCount',
  ]) {
    assert.match(html, new RegExp('id="' + id + '"'), 'hilang #' + id);
  }
});

test('empat tile sesuai keputusan: Dokumen, Kertas Kerja, Bank Data, Aplikasi Lengkap', () => {
  const tiles = [...html.matchAll(/data-tile="([a-z]+)"/g)].map((m) => m[1]);
  assert.deepEqual(tiles, ['dokumen', 'kk', 'bd', 'app']);
  for (const label of ['Dokumen', 'Kertas Kerja', 'Bank Data', 'Aplikasi Lengkap']) {
    assert.ok(html.includes(label), 'label tile hilang: ' + label);
  }
});

test('tombol unggah tetap id lama tapi jadi FAB, dan punya gaya .arsip-fab', () => {
  const tag = html.match(/<button[^>]*id="arsipUploadBtn"[^>]*>/);
  assert.ok(tag, '#arsipUploadBtn hilang');
  assert.match(tag[0], /arsip-fab/, 'tombol unggah harus berkelas arsip-fab');
  assert.match(css, /\.arsip-fab\s*\{/);
});

test('ID lama yang dipakai kode lain tetap ada', () => {
  for (const id of ['arsipNative', 'arsipList', 'arsipDetail', 'arsipQuery', 'arsipStatus',
    'arsipCount', 'arsipUploadBtn', 'arsipUploadModal', 'arsipUploadForm', 'arsipFullBtn', 'arsipFrame']) {
    assert.match(html, new RegExp('id="' + id + '"'), 'hilang #' + id);
  }
});

test('tombol Kembali punya #arsipBackBtn dan memanggil arsipBack()', () => {
  // render() mengatur visibilitas tombol lewat id ini; kalau id-nya berubah,
  // tombolnya diam-diam tidak pernah muncul di panel native.
  assert.match(html, /id="arsipBackBtn"/, '#arsipBackBtn hilang');
  assert.match(html, /id="arsipBackBtn"[^>]*onclick="arsipBack\(\)"/, 'arsipBackBtn harus memanggil arsipBack()');
});

test('panel-arsip kembali punya #arsipList di dalam #arsipDokumen', () => {
  const iDok = lines.findIndex((l) => l.includes('id="arsipDokumen"'));
  const iList = lines.findIndex((l) => l.includes('id="arsipList"'));
  assert.ok(iDok > 0 && iList > iDok, '#arsipList harus berada setelah #arsipDokumen');
});

test('arsip-ui.js dimuat dan mendahului arsip.js', () => {
  const at = (f) => lines.findIndex((l) => l.includes('src="js/' + f));
  const iUi = at('arsip-ui.js'), iArsip = at('arsip.js');
  assert.ok(iUi > 0, 'js/arsip-ui.js belum dimuat');
  assert.ok(iUi < iArsip, 'arsip-ui.js harus mendahului arsip.js');
});

test('tidak ada tautan dokumen yang membuka tab baru di js/arsip.js', () => {
  assert.doesNotMatch(arsipJs, /href="\$\{escapeHtml\(d\.url\)\}"/, 'tautan dokumen keluar tab masih ada');
});

test('semua ikon yang dipakai panel arsip terdaftar di runeicons.css', () => {
  // css/lib/runeicons.css di-generate (scripts/runeicons-sync.mjs) dan hanya
  // memuat daftar nama terbatas. Nama yang tidak terdaftar tidak error — ikonnya
  // cuma tampil kosong, jadi dicek di sini supaya tidak balik lagi.
  const start = html.indexOf('id="panel-arsip"');
  assert.ok(start > 0, 'panel-arsip hilang dari index.html');
  const rest = html.slice(start);
  const end = rest.indexOf('id="panel-', 1);
  const blokPanel = end === -1 ? rest : rest.slice(0, end);

  const sumber = [blokPanel, arsipUi, arsipJs].join('\n');
  const nama = [...new Set([...sumber.matchAll(/fa-[a-z0-9-]+/g)].map((m) => m[0]))];
  assert.ok(nama.length > 0, 'tidak menemukan ikon sama sekali — pola pencarian salah?');

  const punya = (n) => new RegExp('\\.' + n + '\\s*\\{').test(runeicons);
  const hilang = nama.filter((n) => !punya(n));
  assert.deepEqual(hilang, [], 'ikon tidak terdaftar di runeicons.css (akan tampil kosong): ' + hilang.join(', '));
});

test('loadArsipMe baca isi body dari amplop apiGet (r.data), bukan level atas', () => {
  // js/api.js apiGet membalikan {ok, rows, data, status}; isi /api/arsip/me ada di
  // .data. Membaca r.isAdmin langsung selalu undefined -> FAB unggah hilang untuk
  // SEMUA orang (termasuk admin), dan tidak ada error di console.
  assert.match(arsipJs, /r\.data\b/, 'arsip.js harus mengambil isi body lewat r.data');
  assert.doesNotMatch(arsipJs, /r\.ok && r\.isAdmin/, 'r.isAdmin di level atas apiGet selalu undefined');
});

test('FAB hanya di view Dokumen; Kembali di semua view selain beranda', () => {
  // render() HANYA dipanggil untuk view 'dokumen' (lihat applyView). Kalau
  // penyinkronan tombol cuma ada di sana, beranda/KK/BD tidak pernah jalan.
  // FAB unggah sengaja hanya di Dokumen (keputusan produk, sama seperti arsipdigital).
  assert.match(arsipJs, /function syncChrome\(\)/, 'syncChrome() hilang');
  const iApply = arsipJs.indexOf('function applyView()');
  const iRender = arsipJs.indexOf('function render()');
  assert.ok(iApply > 0, 'applyView() hilang');
  assert.ok(iRender > iApply, 'fungsi tidak ditemukan urut — pola salah?');
  const blokApply = arsipJs.slice(iApply, iRender);
  assert.match(blokApply, /syncChrome\(\)/, 'applyView() harus memanggil syncChrome() di setiap navigasi');
  assert.match(arsipJs, /backBtn\.style\.display = \(view\.view !== 'home' && !view\.detail\) \? 'flex' : 'none'/, 'Kembali tampil di semua view selain beranda, sembunyi di detail');
  assert.match(arsipJs, /view\.view === 'dokumen' && !view\.detail/, 'FAB harus dikunci ke view Dokumen dan disembunyikan saat detail terbuka');
  assert.match(arsipJs, /IS_ADMIN\(\) && diDokumen/, 'FAB harus tetap untuk admin saja');
});

test('form unggah panel native mengirim desc & tags seperti arsipdigital', () => {
  // peta (POST /api/docs) menyimpan 'desc' dan 'tags', dan GET /api/docs sudah
  // membalikkannya. Tanpa keduanya dokumen dari panel native tidak punya
  // deskripsi maupun kata kunci, padahal form arsipdigital punya keduanya.
  assert.match(html, /name="desc"/, 'textarea Deskripsi hilang dari form unggah');
  assert.match(html, /name="tags"/, 'input Tag / Kata Kunci hilang dari form unggah');
  assert.match(arsipJs, /desc:\s*val\('desc'\)/, 'arsip.js tidak mengirim desc');
  assert.match(arsipJs, /tags:\s*val\('tags'\)/, 'arsip.js tidak mengirim tags');
});

test('role disinkronkan begitu diketahui, tidak menunggu render()', () => {
  // Laporan pengguna: FAB tidak pernah muncul di beranda, hanya di Dokumen.
  // applyView() jalan duluan (dari tab switch) dan render() bisa terlewat kalau
  // daftar sudah pernah dimuat — jadi sinkronisasi harus terjadi di loadArsipMe().
  const a = arsipJs.indexOf('async function loadArsipMe');
  const b = arsipJs.indexOf('async function loadArsipDocs');
  assert.ok(a > 0 && b > a, 'loadArsipMe/loadArsipDocs tidak ditemukan urut');
  assert.match(arsipJs.slice(a, b), /syncChrome\(\)/, 'loadArsipMe() harus memanggil syncChrome() setelah role diketahui');
});

test('Kategori & Sektor unggah punya dropdown cari (datalist) dari master', () => {
  // Kolomnya tetap teks bebas (dokumen lama punya nilai di luar master);
  // <datalist> hanya menawarkan saran supaya mengetik lebih cepat & konsisten.
  assert.match(html, /name="type"\s+list="arsipKategoriList"/, 'input Kategori tidak terhubung ke datalist');
  assert.match(html, /name="sector"\s+list="arsipSektorList"/, 'input Sektor tidak terhubung ke datalist');
  assert.match(html, /id="arsipKategoriList"/, '#arsipKategoriList hilang');
  assert.match(html, /id="arsipSektorList"/, '#arsipSektorList hilang');
  assert.match(arsipJs, /function isiOpsiUnggah\(\)/, 'isiOpsiUnggah() hilang');
  const iOpen = arsipJs.indexOf('function openUpload()');
  const iClose = arsipJs.indexOf('function closeUpload()');
  assert.ok(iOpen > 0 && iClose > iOpen, 'openUpload/closeUpload tidak ditemukan urut');
  assert.match(arsipJs.slice(iOpen, iClose), /isiOpsiUnggah\(\)/, 'openUpload() harus mengisi opsi');
  assert.match(arsipJs, /kategori-dokumen/, 'arsip.js tidak memuat master kategori');
  assert.match(arsipJs, /\/api\/sektor/, 'arsip.js tidak memuat master sektor');
});

test('modul Kertas Kerja dimuat setelah arsip.js dan punya kontrak mount/unmount', () => {
  const iArsip = html.indexOf('js/arsip.js?v=');
  const iKK = html.indexOf('js/arsip-kk.js?v=');
  assert.ok(iArsip >= 0, 'tag arsip.js ada');
  assert.ok(iKK >= 0, 'tag arsip-kk.js ada');
  assert.ok(iKK > iArsip, 'arsip-kk.js harus setelah arsip.js (butuh window.ARSIP)');

  const kk = fs.readFileSync(path.join(ROOT, 'js', 'arsip-kk.js'), 'utf8');
  assert.match(kk, /window\.ArsipKK\s*=/, 'window.ArsipKK tidak diekspor');
  ['mount', 'unmount', 'setTahun'].forEach((k) => assert.ok(kk.includes(k), 'kunci ' + k + ' hilang'));
  assert.match(kk, /window\.ARSIP\s*&&\s*window\.ARSIP\.IS_ADMIN/, 'cek peran harus lewat ARSIP.IS_ADMIN');
  assert.match(kk, /window\.ARSIP\.previewDocById/, 'aksi Lihat harus memakai previewDocById arsip.js');
  assert.match(arsipJs, /previewDocById,\s*IS_ADMIN/, 'previewDocById belum diekspor di window.ARSIP');
  assert.match(arsipJs, /function pasangModul\(/, 'pasangModul() hilang dari arsip.js');
});

test('modul Bank Data dimuat setelah arsip.js dan punya kontrak mount/unmount', () => {
  const iArsip = html.indexOf('js/arsip.js?v=');
  const iBD = html.indexOf('js/arsip-bd.js?v=');
  assert.ok(iArsip >= 0, 'tag arsip.js ada');
  assert.ok(iBD >= 0, 'tag arsip-bd.js ada');
  assert.ok(iBD > iArsip, 'arsip-bd.js harus setelah arsip.js (butuh window.ARSIP)');

  const bd = fs.readFileSync(path.join(ROOT, 'js', 'arsip-bd.js'), 'utf8');
  assert.match(bd, /window\.ArsipBD\s*=/, 'window.ArsipBD tidak diekspor');
  ['mount', 'unmount'].forEach((k) => assert.ok(bd.includes(k), 'kunci ' + k + ' hilang'));
  assert.match(bd, /window\.ARSIP\s*&&\s*window\.ARSIP\.IS_ADMIN/, 'cek peran harus lewat ARSIP.IS_ADMIN');
  assert.match(bd, /\/api\/bankdata/, 'tidak memakai endpoint bankdata');
  assert.match(bd, /nilai\//, 'endpoint nilai tidak dipakai');
  assert.match(bd, /triwulan\//, 'endpoint triwulan tidak dipakai');
  // sel kosong harus rapi, bukan "undefined": dijaga helper angka() + CSS td:empty
  assert.match(bd, /const angka = \(v\)/, 'helper angka() hilang — nilai kosong akan jadi "undefined"');
  assert.match(bd, /angka\(c\.a\)/, 'sel triwulan harus lewat angka()');
  assert.match(css, /\.kk-tabel td:empty::after/, 'sel kosong tabel bank data tidak diisi tanda —');
  assert.match(css, /\.kk-tabel/, 'CSS tabel bank data hilang');
  assert.match(css, /\.kk-label/, 'CSS form bank data hilang');
});

test('setiap wadah tempat data-view/data-detail muncul diikat ke onListClick', () => {
  // Laporan pengguna: klik "Lihat dokumen" tidak melakukan apa pun di semua jenis
  // berkas. Sebabnya data-view ada di dalam #arsipDetail, sedangkan onListClick
  // hanya diikat ke #arsipList dan #arsipHome — jadi handler-nya hidup tapi tidak
  // pernah dipanggil. Pola yang sama gampang terulang, jadi tiap wadah diuji.
  for (const id of ['arsipList', 'arsipHome', 'arsipDetail']) {
    const pola = new RegExp("\\$\\('" + id + "'\\)[\\s\\S]{0,90}?addEventListener\\('click', onListClick\\)");
    assert.match(arsipJs, pola, '#' + id + ' tidak diikat ke onListClick');
  }
  assert.match(arsipJs, /closest\('\[data-view\]'\)/, 'cabang data-view hilang dari onListClick');
  assert.match(arsipJs, /return openPreview\(vw\.dataset\.view\)/, 'data-view harus memanggil openPreview');
});

test('apiSend meneruskan path apa adanya (tanpa prefix ganda /api/arsip)', () => {
  // Laporan: "Gagal memuat riwayat." di detail dokumen. Sebabnya apiSend
  // menambah '/api/arsip' lagi padahal semua pemanggil sudah mengirim path
  // penuh ('/api/arsip/docs/...') -> URL jadi /api/arsip/api/arsip/... (404).
  // Kena juga hapus/setujui/publik/bulk/upload-file/create — semua lewat apiSend.
  assert.doesNotMatch(arsipJs, /apiFetch\('\/api\/arsip' \+ path/, 'apiSend melipatgandakan prefix /api/arsip');
  assert.match(arsipJs, /async function apiSend\(method, path, body\)[\s\S]{0,300}?await apiFetch\(path,/, 'apiSend harus memanggil apiFetch(path) apa adanya');
  const pemanggil = [...arsipJs.matchAll(/apiSend\(\s*'([A-Z]+)'\s*,\s*'([^']+)'/g)];
  assert.ok(pemanggil.length >= 5, 'pemanggil apiSend tidak ditemukan, cuma ' + pemanggil.length);
  for (const [, , p] of pemanggil) {
    assert.ok(p.startsWith('/api/arsip/'), 'pemanggil harus mengirim path penuh: ' + p);
  }
});

test('kartu detail memuat pratinjau media + metadata lewat helper bersama', () => {
  // Laporan: detail hanya teks, isinya baru keluar lewat overlay "Lihat dokumen".
  // Media kini disematkan di kartu (dua kolom di desktop) memakai mediaHtml()
  // yang sama dengan overlay, supaya keduanya tidak bisa beda perilaku.
  assert.match(arsipUi, /function mediaHtml\(d\)/, 'mediaHtml() hilang dari arsip-ui.js');
  assert.match(arsipUi, /mediaHtml: mediaHtml/, 'mediaHtml belum diekspor ke window.ArsipUI');
  assert.match(arsipJs, /class="arsip-detail-grid"/, 'grid detail tidak dirender');
  assert.match(arsipJs, /class="arsip-detail-media( arsip-detail-media-klik)?/, 'wadah media di detail hilang');
assert.match(arsipJs, /data-view="\$\{escapeHtml\(d\.id\)\}"/, 'tombol pratinjau (data-view) di detail hilang');
assert.match(arsipJs, /class="arsip-detail-head"/, 'header identitas dokumen di detail hilang');
assert.match(arsipJs, /class="arsip-detail-side"/, 'kolom metadata di detail hilang');
assert.match(arsipJs, /class="arsip-meta-row"/, 'baris metadata (gaya arsipdigital) hilang');
assert.match(arsipJs, /Kembali ke Daftar/, 'tombol kembali harus bergaya arsipdigital');
assert.match(arsipJs, /window\.ArsipUI\.mediaHtml\(d\)/, 'openDetail tidak memakai mediaHtml');
assert.match(arsipJs, /box\.innerHTML = window\.ArsipUI\.mediaHtml\(d\)/, 'previewDoc harus memakai mediaHtml yang sama');
  assert.match(arsipJs, /pasangFallbackGambar/, 'cadangan gambar weserv tidak dipasang');
  // mediaHtml: gambar + embed Drive + fallback pesan
  assert.match(arsipUi, /arsip-media arsip-media-img/, 'cabang gambar mediaHtml hilang');
  assert.match(arsipUi, /arsip-media arsip-media-frame/, 'cabang embed mediaHtml hilang');
  assert.match(arsipUi, /data-fallback/, 'cadangan weserv untuk gambar hilang');
  assert.match(css, /\.arsip-detail-grid\s*\{/, 'CSS grid detail hilang');
assert.match(css, /grid-template-columns: minmax\(0, 1fr\) 340px/, 'layout dua kolom desktop hilang');
assert.match(css, /grid-template-areas: "media side"/, 'area dua kolom desktop (media kiri) hilang');
assert.match(css, /grid-template-areas: "media" "side"/, 'urutan mobile: pratinjau lalu kolom metadata hilang');
assert.match(css, /\.arsip-meta-label\s*\{[\s\S]{0,160}?text-transform: uppercase/, 'label metadata huruf besar (gaya arsipdigital) hilang');
assert.match(css, /\.arsip-detail-side\s*\{\s*position: sticky/, 'kolom metadata menempel di desktop hilang');
assert.match(css, /\.arsip-detail-grid\s*\{\s*align-items: stretch; grid-template-columns: minmax\(0, 1fr\) 340px/, 'pratinjau tidak direntangkan setinggi kolom metadata di desktop');
assert.match(css, /\.arsip-detail-media \.arsip-media-frame\s*\{\s*aspect-ratio: auto; height: 100%; max-height: none/, 'pratinjau tidak diisi setinggi kartu di desktop');
assert.match(css, /\.arsip-media-img/, 'CSS media bersama hilang');
});
