## commits

b0cf742 feat(spt): logika murni generator SPT/SPPD + tes

## stat

 index.html               |   1 +
 js/tugas-spt.js          | 163 +++++++++++++++++++++++++++++++++++++++++++++++
 package.json             |   2 +-
 tests/tugas-spt.test.mjs |  90 ++++++++++++++++++++++++++
 www/index.html           |   1 +
 www/js/tugas-spt.js      | 163 +++++++++++++++++++++++++++++++++++++++++++++++
 6 files changed, 419 insertions(+), 1 deletion(-)

## diff

diff --git a/index.html b/index.html
index 7df23a4..e4054e6 100644
--- a/index.html
+++ b/index.html
@@ -3332,20 +3332,21 @@
   <script src="js/weather.js"></script>
   <script src="js/admin-face.js?v=20260706c"></script>
 <script src="js/admin-kontrol.js?v=20260811a"></script>
   <!-- simapo-admin.js dihapus (dikonsolidasi ke simapo-ext.js) -->
   
   
   <script src="js/aset-screens.js?v=3"></script>
 <script src="js/aset-nav.js?v=20261013a"></script>
   <script src="js/simapo-ext.js?v=20261014g"></script>
   <script src="js/simapo-bast.js?v=20261014f"></script>
+  <script src="js/tugas-spt.js?v=1"></script>
 
   <!-- 6. Supplementary features -->
 
   <script src="js/desktop.js?v=9993"></script>
   <script src="js/signature.js"></script>
   <script src="js/meja.js"></script>
   <script src="js/rekap-pdf.js?v=20261017b"></script>
   <script src="js/tugas_lembur.js?v=20261017"></script>
   <script src="js/simapo.js?v=20261013b"></script>
 
diff --git a/js/tugas-spt.js b/js/tugas-spt.js
new file mode 100644
index 0000000..c2c2ab7
--- /dev/null
+++ b/js/tugas-spt.js
@@ -0,0 +1,163 @@
+// js/tugas-spt.js G현 generator Surat Perintah Tugas (SPT) & SPPD dari penugasan.
+// Client-side, meniru pola BAST. Top level TIDAK menyentuh DOM supaya bisa diuji.
+(function () {
+  'use strict';
+
+  const BULAN = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni',
+    'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'];
+  const SATUAN = ['', 'Satu', 'Dua', 'Tiga', 'Empat', 'Lima', 'Enam', 'Tujuh',
+    'Delapan', 'Sembilan', 'Sepuluh', 'Sebelas'];
+
+  function terbilang(n) {
+    n = Math.abs(Math.round(Number(n) || 0));
+    if (n < 12) return SATUAN[n];
+    if (n < 20) return terbilang(n - 10) + ' Belas';
+    if (n < 100) return terbilang(Math.floor(n / 10)) + ' Puluh' + sisa(n % 10);
+    if (n < 200) return 'Seratus' + sisa(n - 100);
+    if (n < 1000) return terbilang(Math.floor(n / 100)) + ' Ratus' + sisa(n % 100);
+    return String(n);
+  }
+
+  // ponytail: sambung ekor hanya bila ada, supaya "Tiga Puluh" tak berjejak spasi.
+  function sisa(r) { return r ? ' ' + terbilang(r) : ''; }
+
+  // ponytail: parse tanggal-only sendiri (bukan new Date(str)) supaya tidak geser hari
+  // akibat timezone. Upgrade path: pakai Temporal bila sudah tersedia di target.
+  function toDate(v) {
+    if (!v) return null;
+    const s = String(v);
+    const m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
+    const d = m ? new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])) : new Date(s);
+    return isNaN(d.getTime()) ? null : d;
+  }
+
+  function tanggalID(v) {
+    const d = toDate(v);
+    if (!d) return v ? String(v) : '';
+    return d.getDate() + ' ' + BULAN[d.getMonth()] + ' ' + d.getFullYear();
+  }
+
+  function lamaHari(a, b) {
+    const d1 = toDate(a), d2 = toDate(b);
+    if (!d1 || !d2) return '';
+    const n = Math.round((d2 - d1) / 86400000) + 1;
+    if (n <= 0) return '';
+    return n + ' (' + terbilang(n) + ') Hari';
+  }
+
+  function kunciGrup(r) {
+    return [r.tanggal || '', r.keterangan || '', r.created_by_nip || ''].join('|');
+  }
+
+  function kelompokkan(rows) {
+    const map = new Map();
+    for (const r of rows || []) {
+      const k = kunciGrup(r);
+      if (!map.has(k)) map.set(k, []);
+      map.get(k).push(r);
+    }
+    return Array.from(map.entries()).map(([kunci, items]) => ({
+      kunci, items, perjadin: items[0].perjadin || null
+    }));
+  }
+
+  const DEFAULT_PERJADIN = {
+    nomor: 'BP4D.011.7/69/53.12/ST/01/2026',
+    nomorSPPD: '001/SPPD/2026',
+    dasar: 'DPA Bapperida Kabupaten Sumba Barat TA 2026',
+    maksud: '',
+    tempatBerangkat: 'Waikabubak',
+    tempatTujuan: '',
+    alatAngkut: 'Pesawat',
+    tanggalBerangkat: '',
+    tanggalKembali: '',
+    tingkatBiaya: 'C',
+    instansi: 'Bapperida Kabupaten Sumba Barat',
+    mataAnggaran: 'DPA Bapperida Kabupaten Sumba Barat TA 2026',
+    ditetapkanDi: 'Waikabubak',
+    tanggalPenetapan: '',
+    kepala: { nama: 'CHARLES HERMANA WERU,S.Sos', pangkat: 'Pembina Utama Muda G혀 IV/c', nip: '19721102 200112 1 001' },
+    sekretaris: { nama: 'IMANUEL MOSES KALEGOTAN, ST.,M.Si', nip: '19800315 200501 1 011' },
+    paraf: [{ jabatan: 'Sekretaris BAPPERIDA' }, { jabatan: 'Kepala Bidang Ekonomi' }, { jabatan: 'KTU BAPPERIDA' }]
+  };
+
+  function merge(p) {
+    const out = Object.assign({}, DEFAULT_PERJADIN, p || {});
+    out.kepala = Object.assign({}, DEFAULT_PERJADIN.kepala, (p && p.kepala) || {});
+    out.sekretaris = Object.assign({}, DEFAULT_PERJADIN.sekretaris, (p && p.sekretaris) || {});
+    out.paraf = (p && Array.isArray(p.paraf) && p.paraf.length) ? p.paraf : DEFAULT_PERJADIN.paraf;
+    return out;
+  }
+
+  function personTag(row, masterIndex) {
+    const m = (masterIndex && masterIndex[String(row.nip)]) || {};
+    return {
+      Nama: m.nama || row.nama || '',
+      PangkatGol: m.pangkat || row.pangkat || '',
+      NIP: m.nip || row.nip || '',
+      Jabatan: m.jabatan || row.jabatan || ''
+    };
+  }
+
+  function susunUntuk(p, grup) {
+    let u = p.maksud || (grup.items[0] && grup.items[0].keterangan) || '';
+    if (p.tempatTujuan) u += ' di ' + p.tempatTujuan;
+    u = u.trim();
+    if (u && !/[.!]$/.test(u)) u += '.';
+    return u;
+  }
+
+  function bangunTagsSPT(grup, perjadin, masterIndex) {
+    const p = merge(perjadin);
+    const items = grup.items.map((r, i) => Object.assign({ No: i + 1 }, personTag(r, masterIndex)));
+    return {
+      Nomor: p.nomor,
+      Dasar: p.dasar,
+      pelaksana: items,
+      Untuk: susunUntuk(p, grup),
+      DitetapkanDi: p.ditetapkanDi,
+      TanggalSurat: tanggalID(p.tanggalPenetapan || (grup.items[0] && grup.items[0].tanggal)),
+      KepalaNama: p.kepala.nama,
+      KepalaPangkat: p.kepala.pangkat,
+      KepalaNIP: p.kepala.nip,
+      Paraf1: (p.paraf[0] || {}).jabatan || '',
+      Paraf2: (p.paraf[1] || {}).jabatan || '',
+      Paraf3: (p.paraf[2] || {}).jabatan || ''
+    };
+  }
+
+  function bangunTagsSPPD(row, grup, perjadin, masterIndex) {
+    const p = merge(perjadin);
+    const t = personTag(row, masterIndex);
+    return {
+      NomorSPPD: p.nomorSPPD,
+      KpaNama: p.kepala.nama,
+      Nama: t.Nama,
+      NIP: t.NIP,
+      PangkatGolongan: p.pangkatGolongan || t.PangkatGol,
+      JabatanInstansi: t.Jabatan,
+      TingkatBiaya: p.tingkatBiaya,
+      Maksud: p.maksud || susunUntuk(p, grup),
+      AlatAngkut: p.alatAngkut,
+      TempatBerangkat: p.tempatBerangkat,
+      TempatTujuan: p.tempatTujuan,
+      LamaHari: lamaHari(p.tanggalBerangkat, p.tanggalKembali),
+      TanggalBerangkat: tanggalID(p.tanggalBerangkat),
+      TanggalKembali: tanggalID(p.tanggalKembali),
+      Instansi: p.instansi,
+      MataAnggaran: p.mataAnggaran,
+      DitetapkanDi: p.ditetapkanDi,
+      TanggalPenetapan: tanggalID(p.tanggalPenetapan || (grup.items[0] && grup.items[0].tanggal)),
+      KepalaNama: p.kepala.nama,
+      KepalaPangkat: p.kepala.pangkat,
+      KepalaNIP: p.kepala.nip,
+      SekretarisNama: p.sekretaris.nama,
+      SekretarisNIP: p.sekretaris.nip
+    };
+  }
+
+  window.TugasSPT = {
+    terbilang, tanggalID, lamaHari, kunciGrup, kelompokkan,
+    personTag, bangunTagsSPT, bangunTagsSPPD, DEFAULT_PERJADIN, merge
+  };
+})();
diff --git a/package.json b/package.json
index fb7ca10..b6f9429 100644
--- a/package.json
+++ b/package.json
@@ -2,21 +2,21 @@
   "name": "absensi-app",
   "private": true,
   "version": "0.0.0",
   "type": "module",
   "scripts": {
     "dev": "vite",
     "build": "vite build",
     "lint": "eslint .",
     "preview": "vite preview",
     "start": "node server/index.js",
-    "test": "node --test server/*.test.js tests/gas-media.test.js tests/aset-emoji.test.mjs tests/aset-kategori-dropdown.test.mjs tests/aset-kondisi.test.mjs tests/aset-markup.test.mjs tests/aset-nav.test.mjs tests/aset-router.test.mjs tests/aset-screens.test.mjs tests/workflow-mutasi.test.mjs tests/drive-img-url.test.js tests/deemoji.test.mjs tests/search-dd.test.mjs tests/log-week.test.mjs tests/aset-tahun.test.mjs tests/aset-peg-overview.test.mjs tests/aset-kir-format.test.mjs tests/lembur-ttd.test.mjs tests/kode-aset.test.mjs tests/aset-pemegang.test.mjs tests/aset-satu-barang.test.mjs tests/log-add-edit.test.mjs",
+    "test": "node --test server/*.test.js tests/gas-media.test.js tests/aset-emoji.test.mjs tests/aset-kategori-dropdown.test.mjs tests/aset-kondisi.test.mjs tests/aset-markup.test.mjs tests/aset-nav.test.mjs tests/aset-router.test.mjs tests/aset-screens.test.mjs tests/workflow-mutasi.test.mjs tests/drive-img-url.test.js tests/deemoji.test.mjs tests/search-dd.test.mjs tests/log-week.test.mjs tests/aset-tahun.test.mjs tests/aset-peg-overview.test.mjs tests/aset-kir-format.test.mjs tests/lembur-ttd.test.mjs tests/kode-aset.test.mjs tests/aset-pemegang.test.mjs tests/aset-satu-barang.test.mjs tests/log-add-edit.test.mjs tests/tugas-spt.test.mjs",
     "test:live": "node --test tests/n8n-face.test.mjs tests/pks.test.mjs"
   },
   "dependencies": {
     "@vladmandic/human": "^3.3.6",
     "dotenv": "^18.0.5",
     "express": "^4.22.3",
     "pg": "^8.23.1",
     "react": "^19.2.4",
     "react-dom": "^19.2.4"
   },
diff --git a/tests/tugas-spt.test.mjs b/tests/tugas-spt.test.mjs
new file mode 100644
index 0000000..c060241
--- /dev/null
+++ b/tests/tugas-spt.test.mjs
@@ -0,0 +1,90 @@
+import test from 'node:test';
+import assert from 'node:assert/strict';
+import fs from 'node:fs';
+import path from 'node:path';
+
+// Uji SUMBER SEBENARNYA: jalankan js/tugas-spt.js sebagai script klasik di window palsu,
+// supaya salinan di tes tidak bisa "lolos" padahal implementasinya beda.
+const ROOT = path.resolve(import.meta.dirname, '..');
+const src = fs.readFileSync(path.join(ROOT, 'js', 'tugas-spt.js'), 'utf8');
+
+function load() {
+  const win = {};
+  new Function('window', src)(win); // top-level tidak boleh menyentuh document
+  assert.ok(win.TugasSPT, 'window.TugasSPT harus terdefinisi');
+  return win.TugasSPT;
+}
+const T = load();
+
+test('terbilang: satuan, belasan, puluhan', () => {
+  assert.equal(T.terbilang(4), 'Empat');
+  assert.equal(T.terbilang(11), 'Sebelas');
+  assert.equal(T.terbilang(21), 'Dua Puluh Satu');
+  assert.equal(T.terbilang(30), 'Tiga Puluh');
+});
+
+test('tanggalID: format Indonesia, aman timezone', () => {
+  assert.equal(T.tanggalID('2026-06-29'), '29 Juni 2026');
+  assert.equal(T.tanggalID('2026-01-01T00:00:00.000Z'), '1 Januari 2026');
+  assert.equal(T.tanggalID(''), '');
+});
+
+test('lamaHari: inklusif dari tanggal berangkat s.d. kembali', () => {
+  assert.equal(T.lamaHari('2026-06-29', '2026-07-02'), '4 (Empat) Hari');
+  assert.equal(T.lamaHari('2026-06-29', '2026-06-29'), '1 (Satu) Hari');
+  assert.equal(T.lamaHari('', '2026-07-02'), '');
+});
+
+test('kunciGrup: tanggal|keterangan|pemberi', () => {
+  assert.equal(
+    T.kunciGrup({ tanggal: '2026-06-29', keterangan: 'Rakor', created_by_nip: '123' }),
+    '2026-06-29|Rakor|123'
+  );
+  assert.notEqual(
+    T.kunciGrup({ tanggal: '2026-06-29', keterangan: 'Rakor', created_by_nip: '123' }),
+    T.kunciGrup({ tanggal: '2026-06-29', keterangan: 'Rakor', created_by_nip: '999' })
+  );
+});
+
+test('kelompokkan: baris seperjalanan jadi satu grup + bawa perjadin', () => {
+  const rows = [
+    { id: '1', tanggal: '2026-06-29', keterangan: 'Rakor', created_by_nip: '123', nip: '111', perjadin: { nomor: 'X' } },
+    { id: '2', tanggal: '2026-06-29', keterangan: 'Rakor', created_by_nip: '123', nip: '222' },
+    { id: '3', tanggal: '2026-07-02', keterangan: 'Fasilitasi', created_by_nip: '123', nip: '333' }
+  ];
+  const g = T.kelompokkan(rows);
+  assert.equal(g.length, 2);
+  assert.equal(g[0].items.length, 2);
+  assert.equal(g[0].perjadin.nomor, 'X');
+  assert.equal(g[1].items.length, 1);
+  assert.equal(g[1].perjadin, null);
+});
+
+test('bangunTagsSPT: nomor urut pelaksana, 3 slot paraf, Untuk dari keterangan', () => {
+  const grup = { items: [
+    { tanggal: '2026-06-29', keterangan: 'Rapat Koordinasi', nip: '111', nama: 'A' },
+    { tanggal: '2026-06-29', keterangan: 'Rapat Koordinasi', nip: '222', nama: 'B' }
+  ] };
+  const master = { 111: { nama: 'Acmad', pangkat: 'Penata Muda G혀 III/a', jabatan: 'Pranata Komputer', nip: '111' } };
+  const t = T.bangunTagsSPT(grup, { tempatTujuan: 'Waingapu' }, master);
+  assert.equal(t.pelaksana.length, 2);
+  assert.deepEqual(t.pelaksana.map(x => x.No), [1, 2]);
+  assert.equal(t.pelaksana[0].Nama, 'Acmad');
+  assert.equal(t.pelaksana[0].PangkatGol, 'Penata Muda G혀 III/a');
+  assert.ok(t.Untuk.includes('Waingapu'));
+  assert.equal(t.Paraf1, 'Sekretaris BAPPERIDA');
+  assert.equal(t.Paraf3, 'KTU BAPPERIDA');
+});
+
+test('bangunTagsSPPD: lama hari + nama pegawai dari baris', () => {
+  const grup = { items: [{ tanggal: '2026-06-29', keterangan: 'Fasilitasi RKPD', nip: '111', nama: 'Alvian' }] };
+  const t = T.bangunTagsSPPD(
+    { nip: '111', nama: 'Alvian' }, grup,
+    { tanggalBerangkat: '2026-06-29', tanggalKembali: '2026-07-02', tempatTujuan: 'Kupang' },
+    { 111: { nama: 'Alvian Zadrakh', pangkat: 'Pembina-IV/a', jabatan: 'Kepala Bidang' } }
+  );
+  assert.equal(t.Nama, 'Alvian Zadrakh');
+  assert.equal(t.LamaHari, '4 (Empat) Hari');
+  assert.equal(t.TempatTujuan, 'Kupang');
+  assert.equal(t.Nama === t.KpaNama, false);
+});
diff --git a/www/index.html b/www/index.html
index d75a656..d23a8e9 100644
--- a/www/index.html
+++ b/www/index.html
@@ -3210,20 +3210,21 @@
   <script src="js/weather.js"></script>
   <script src="js/admin-face.js?v=20260706c"></script>
 <script src="js/admin-kontrol.js?v=20260811a"></script>
   <!-- simapo-admin.js dihapus (dikonsolidasi ke simapo-ext.js) -->
   
   
   <script src="js/aset-screens.js?v=3"></script>
 <script src="js/aset-nav.js?v=20261013a"></script>
   <script src="js/simapo-ext.js?v=20261014g"></script>
   <script src="js/simapo-bast.js?v=20261014f"></script>
+  <script src="js/tugas-spt.js?v=1"></script>
 
   <!-- 6. Supplementary features -->
 
   <script src="js/desktop.js?v=9993"></script>
   <script src="js/signature.js"></script>
   <script src="js/meja.js"></script>
   <script src="js/rekap-pdf.js?v=20261017b"></script>
   <script src="js/tugas_lembur.js?v=20261017"></script>
   <script src="js/simapo.js?v=20261013b"></script>
 
diff --git a/www/js/tugas-spt.js b/www/js/tugas-spt.js
new file mode 100644
index 0000000..c2c2ab7
--- /dev/null
+++ b/www/js/tugas-spt.js
@@ -0,0 +1,163 @@
+// js/tugas-spt.js G현 generator Surat Perintah Tugas (SPT) & SPPD dari penugasan.
+// Client-side, meniru pola BAST. Top level TIDAK menyentuh DOM supaya bisa diuji.
+(function () {
+  'use strict';
+
+  const BULAN = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni',
+    'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'];
+  const SATUAN = ['', 'Satu', 'Dua', 'Tiga', 'Empat', 'Lima', 'Enam', 'Tujuh',
+    'Delapan', 'Sembilan', 'Sepuluh', 'Sebelas'];
+
+  function terbilang(n) {
+    n = Math.abs(Math.round(Number(n) || 0));
+    if (n < 12) return SATUAN[n];
+    if (n < 20) return terbilang(n - 10) + ' Belas';
+    if (n < 100) return terbilang(Math.floor(n / 10)) + ' Puluh' + sisa(n % 10);
+    if (n < 200) return 'Seratus' + sisa(n - 100);
+    if (n < 1000) return terbilang(Math.floor(n / 100)) + ' Ratus' + sisa(n % 100);
+    return String(n);
+  }
+
+  // ponytail: sambung ekor hanya bila ada, supaya "Tiga Puluh" tak berjejak spasi.
+  function sisa(r) { return r ? ' ' + terbilang(r) : ''; }
+
+  // ponytail: parse tanggal-only sendiri (bukan new Date(str)) supaya tidak geser hari
+  // akibat timezone. Upgrade path: pakai Temporal bila sudah tersedia di target.
+  function toDate(v) {
+    if (!v) return null;
+    const s = String(v);
+    const m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
+    const d = m ? new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])) : new Date(s);
+    return isNaN(d.getTime()) ? null : d;
+  }
+
+  function tanggalID(v) {
+    const d = toDate(v);
+    if (!d) return v ? String(v) : '';
+    return d.getDate() + ' ' + BULAN[d.getMonth()] + ' ' + d.getFullYear();
+  }
+
+  function lamaHari(a, b) {
+    const d1 = toDate(a), d2 = toDate(b);
+    if (!d1 || !d2) return '';
+    const n = Math.round((d2 - d1) / 86400000) + 1;
+    if (n <= 0) return '';
+    return n + ' (' + terbilang(n) + ') Hari';
+  }
+
+  function kunciGrup(r) {
+    return [r.tanggal || '', r.keterangan || '', r.created_by_nip || ''].join('|');
+  }
+
+  function kelompokkan(rows) {
+    const map = new Map();
+    for (const r of rows || []) {
+      const k = kunciGrup(r);
+      if (!map.has(k)) map.set(k, []);
+      map.get(k).push(r);
+    }
+    return Array.from(map.entries()).map(([kunci, items]) => ({
+      kunci, items, perjadin: items[0].perjadin || null
+    }));
+  }
+
+  const DEFAULT_PERJADIN = {
+    nomor: 'BP4D.011.7/69/53.12/ST/01/2026',
+    nomorSPPD: '001/SPPD/2026',
+    dasar: 'DPA Bapperida Kabupaten Sumba Barat TA 2026',
+    maksud: '',
+    tempatBerangkat: 'Waikabubak',
+    tempatTujuan: '',
+    alatAngkut: 'Pesawat',
+    tanggalBerangkat: '',
+    tanggalKembali: '',
+    tingkatBiaya: 'C',
+    instansi: 'Bapperida Kabupaten Sumba Barat',
+    mataAnggaran: 'DPA Bapperida Kabupaten Sumba Barat TA 2026',
+    ditetapkanDi: 'Waikabubak',
+    tanggalPenetapan: '',
+    kepala: { nama: 'CHARLES HERMANA WERU,S.Sos', pangkat: 'Pembina Utama Muda G혀 IV/c', nip: '19721102 200112 1 001' },
+    sekretaris: { nama: 'IMANUEL MOSES KALEGOTAN, ST.,M.Si', nip: '19800315 200501 1 011' },
+    paraf: [{ jabatan: 'Sekretaris BAPPERIDA' }, { jabatan: 'Kepala Bidang Ekonomi' }, { jabatan: 'KTU BAPPERIDA' }]
+  };
+
+  function merge(p) {
+    const out = Object.assign({}, DEFAULT_PERJADIN, p || {});
+    out.kepala = Object.assign({}, DEFAULT_PERJADIN.kepala, (p && p.kepala) || {});
+    out.sekretaris = Object.assign({}, DEFAULT_PERJADIN.sekretaris, (p && p.sekretaris) || {});
+    out.paraf = (p && Array.isArray(p.paraf) && p.paraf.length) ? p.paraf : DEFAULT_PERJADIN.paraf;
+    return out;
+  }
+
+  function personTag(row, masterIndex) {
+    const m = (masterIndex && masterIndex[String(row.nip)]) || {};
+    return {
+      Nama: m.nama || row.nama || '',
+      PangkatGol: m.pangkat || row.pangkat || '',
+      NIP: m.nip || row.nip || '',
+      Jabatan: m.jabatan || row.jabatan || ''
+    };
+  }
+
+  function susunUntuk(p, grup) {
+    let u = p.maksud || (grup.items[0] && grup.items[0].keterangan) || '';
+    if (p.tempatTujuan) u += ' di ' + p.tempatTujuan;
+    u = u.trim();
+    if (u && !/[.!]$/.test(u)) u += '.';
+    return u;
+  }
+
+  function bangunTagsSPT(grup, perjadin, masterIndex) {
+    const p = merge(perjadin);
+    const items = grup.items.map((r, i) => Object.assign({ No: i + 1 }, personTag(r, masterIndex)));
+    return {
+      Nomor: p.nomor,
+      Dasar: p.dasar,
+      pelaksana: items,
+      Untuk: susunUntuk(p, grup),
+      DitetapkanDi: p.ditetapkanDi,
+      TanggalSurat: tanggalID(p.tanggalPenetapan || (grup.items[0] && grup.items[0].tanggal)),
+      KepalaNama: p.kepala.nama,
+      KepalaPangkat: p.kepala.pangkat,
+      KepalaNIP: p.kepala.nip,
+      Paraf1: (p.paraf[0] || {}).jabatan || '',
+      Paraf2: (p.paraf[1] || {}).jabatan || '',
+      Paraf3: (p.paraf[2] || {}).jabatan || ''
+    };
+  }
+
+  function bangunTagsSPPD(row, grup, perjadin, masterIndex) {
+    const p = merge(perjadin);
+    const t = personTag(row, masterIndex);
+    return {
+      NomorSPPD: p.nomorSPPD,
+      KpaNama: p.kepala.nama,
+      Nama: t.Nama,
+      NIP: t.NIP,
+      PangkatGolongan: p.pangkatGolongan || t.PangkatGol,
+      JabatanInstansi: t.Jabatan,
+      TingkatBiaya: p.tingkatBiaya,
+      Maksud: p.maksud || susunUntuk(p, grup),
+      AlatAngkut: p.alatAngkut,
+      TempatBerangkat: p.tempatBerangkat,
+      TempatTujuan: p.tempatTujuan,
+      LamaHari: lamaHari(p.tanggalBerangkat, p.tanggalKembali),
+      TanggalBerangkat: tanggalID(p.tanggalBerangkat),
+      TanggalKembali: tanggalID(p.tanggalKembali),
+      Instansi: p.instansi,
+      MataAnggaran: p.mataAnggaran,
+      DitetapkanDi: p.ditetapkanDi,
+      TanggalPenetapan: tanggalID(p.tanggalPenetapan || (grup.items[0] && grup.items[0].tanggal)),
+      KepalaNama: p.kepala.nama,
+      KepalaPangkat: p.kepala.pangkat,
+      KepalaNIP: p.kepala.nip,
+      SekretarisNama: p.sekretaris.nama,
+      SekretarisNIP: p.sekretaris.nip
+    };
+  }
+
+  window.TugasSPT = {
+    terbilang, tanggalID, lamaHari, kunciGrup, kelompokkan,
+    personTag, bangunTagsSPT, bangunTagsSPPD, DEFAULT_PERJADIN, merge
+  };
+})();
