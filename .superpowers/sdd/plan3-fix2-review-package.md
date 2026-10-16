# Paket Review Fix Round 2 - 682616a..c36809a (hanya kode; 2cc3aa0 docs-only)

Menutup temuan reviewer: lubang tes paritas (M3/M4), Medium #1 (dialog sebelum await), Medium #2 (cache saat gagal), Low #3 (border merah sisa).

## git diff 682616a..c36809a -- js/ www/ index.html tests/
```diff
diff --git a/index.html b/index.html
index ac06329..05acfdf 100644
--- a/index.html
+++ b/index.html
@@ -3339,7 +3339,7 @@
 <script src="js/aset-nav.js?v=20261013a"></script>
   <script src="js/simapo-ext.js?v=20261014g"></script>
   <script src="js/simapo-bast.js?v=20261016a"></script>
-  <script src="js/tugas-spt.js?v=20261019"></script>
+  <script src="js/tugas-spt.js?v=20261020"></script>
 
   <!-- 6. Supplementary features -->
 
diff --git a/js/tugas-spt.js b/js/tugas-spt.js
index 17ef23e..528be40 100644
--- a/js/tugas-spt.js
+++ b/js/tugas-spt.js
@@ -210,8 +210,10 @@
           pangkat: u.pangkat || u.Pangkat || '', jabatan: u.jabatan || u.Jabatan || ''
         };
       }
+      // ponytail: cache HANYA saat fetch sukses ΓÇö kegagalan sesaat jangan meracuni sesi
+      // (kalau di-cache, semua dialog berikutnya kehilangan pejabat/pangkat sampai reload).
+      _masterCache = out;
     } catch (e) { console.error('[SPT] goldmaster pegawai gagal dimuat:', e); }
-    _masterCache = out;
     return out;
   }
 
@@ -266,10 +268,18 @@
 
   let _grupAktif = null;
 
-  function readForm() {
+  // ponytail: penyalin field tunggal ΓÇö dipakai fillForm & bukaModal (master menyusul).
+  // Sekaligus membersihkan tanda merah validasi supaya dialog yang dibuka ulang tidak
+  // mewarisi border merah dari submit sebelumnya.
+  function setField(n, v) {
+    const el = $('perjadinForm').elements[n];
+    if (el) { el.value = v || ''; el.style.borderColor = ''; }
+  }
+
+  function readForm(perjadinAwal) {
     const f = $('perjadinForm');
     const g = n => { const el = f.elements[n]; return el ? el.value : ''; };
-    const p = merge(_grupAktif.perjadin);
+    const p = merge(perjadinAwal || (_grupAktif && _grupAktif.perjadin));
     p.nomor = g('nomor') || p.nomor;
     p.nomorSPPD = g('nomorSPPD') || p.nomorSPPD;
     p.dasar = g('dasar') || p.dasar;
@@ -301,8 +311,7 @@
   }
 
   function fillForm(perjadin) {
-    const f = $('perjadinForm');
-    const set = (n, v) => { const el = f.elements[n]; if (el) el.value = v || ''; };
+    const set = setField;
     set('nomor', perjadin.nomor);
     set('nomorSPPD', perjadin.nomorSPPD);
     set('dasar', perjadin.dasar);
@@ -337,19 +346,23 @@
       info.textContent = grup.items.length + ' pelaksana: ' + nama + ' ΓÇö ' + ((grup.items[0] || {}).keterangan || '');
     }
     const p = merge(grup.perjadin);
-    // Pejabat dari master (spec ┬º6) hanya bila grup belum punya nilai tersimpan -
-    // supaya surat instansi lain tidak mewarisi nama BAPPERIDA yang di-hardcode.
+    // Dialog tampil lebih dulu (nilai tersimpan/default), master dimuat menyusul ΓÇö
+    // supaya /api/user-list yang lambat tidak menahan munculnya dialog.
+    fillForm(p);
+    modal.style.display = 'flex';
     const punya = grup.perjadin || {};
     if (!punya.kepala || !punya.sekretaris) {
       try {
         const idx = await masterIndex((grup.items[0] || {}).instansi_id || '');
         const d = defaultsDariMaster(idx);
-        if (d.kepala && !punya.kepala) p.kepala = d.kepala;
-        if (d.sekretaris && !punya.sekretaris) p.sekretaris = d.sekretaris;
+        if (d.kepala && !punya.kepala) {
+          setField('kepalaNama', d.kepala.nama); setField('kepalaPangkat', d.kepala.pangkat); setField('kepalaNIP', d.kepala.nip);
+        }
+        if (d.sekretaris && !punya.sekretaris) {
+          setField('sekretarisNama', d.sekretaris.nama); setField('sekretarisNIP', d.sekretaris.nip);
+        }
       } catch (e) { console.error('[SPT] default pejabat gagal:', e); }
     }
-    fillForm(p);
-    modal.style.display = 'flex';
   }
 
   function tutupModal() { const m = $('perjadinModal'); if (m) m.style.display = 'none'; }
@@ -394,6 +407,7 @@
     terbilang, tanggalID, lamaHari, kunciGrup, kelompokkan,
     personTag, bangunTagsSPT, bangunTagsSPPD, DEFAULT_PERJADIN, merge,
     cariPejabat, defaultsDariMaster, validasiPerjadin,
-    masterIndex, bukaModal, generate, simpanPerjadin
+    masterIndex, bukaModal, generate, simpanPerjadin,
+    readForm, fillForm
   };
 })();
diff --git a/tests/tugas-spt.test.mjs b/tests/tugas-spt.test.mjs
index 791ae46..f769669 100644
--- a/tests/tugas-spt.test.mjs
+++ b/tests/tugas-spt.test.mjs
@@ -141,6 +141,42 @@ test('masterIndex: meneruskan instansi_id grup ke apiGet', async () => {
   assert.deepEqual(got2, {});
 });
 
+test('masterIndex: kegagalan fetch TIDAK di-cache (bisa pulih tanpa reload)', async () => {
+  const win = fresh();
+  let gagal = true;
+  win.apiGet = async () => {
+    if (gagal) throw new Error('jaringan putus');
+    return { rows: [{ nip: '7', nama: 'A', jabatan: 'Kepala Badan', pangkat: 'IV' }] };
+  };
+  const kosong = await win.TugasSPT.masterIndex('INS');
+  assert.deepEqual(kosong, {}, 'gagal -> indeks kosong, tidak melempar');
+  gagal = false;
+  const idx = await win.TugasSPT.masterIndex('INS');
+  assert.equal((idx['7'] || {}).jabatan, 'Kepala Badan', 'percobaan berikutnya mencoba fetch ulang (tidak teracuni)');
+});
+
+test('bukaModal: dialog tampil SEBELUM master termuat (apiGet lambat tidak menahan dialog)', async () => {
+  const win = fresh();
+  const modal = { style: { display: 'none' } };
+  const elements = {};
+  const lama = globalThis.document;
+  globalThis.document = {
+    getElementById: id => ({ perjadinModal: modal, perjadinInfo: { textContent: '' }, perjadinForm: { elements } }[id] || null)
+  };
+  try {
+    let lepas = () => {};
+    win.apiGet = () => new Promise(r => { lepas = () => r({ rows: [] }); });
+    const grup = { items: [{ id: '1', nip: '111', nama: 'A', tanggal: '2026-07-02', keterangan: 'R', instansi_id: 'INS' }], perjadin: null };
+    const jalan = win.TugasSPT.bukaModal(grup);
+    assert.equal(modal.style.display, 'flex', 'dialog sudah tampil walau /api/user-list belum balas');
+    lepas();
+    await jalan;
+    assert.equal(modal.style.display, 'flex');
+  } finally {
+    if (lama === undefined) delete globalThis.document; else globalThis.document = lama;
+  }
+});
+
 test('validasiPerjadin: kosong -> 4 label wajib, lengkap -> lolos', () => {
   assert.deepEqual(T.validasiPerjadin({}), ['Maksud', 'Tempat Tujuan', 'Tanggal Berangkat', 'Tanggal Kembali']);
   assert.deepEqual(T.validasiPerjadin({ maksud: 'Rakor', tempatTujuan: 'Kupang', tanggalBerangkat: '2026-07-02', tanggalKembali: '2026-07-04' }), []);
@@ -179,22 +215,69 @@ test('generate: field wajib kosong -> batal + TIDAK menyentuh render (kontrol po
     assert.ok(toasts.some(x => /Wajib diisi: .*Maksud/.test(x[0])), 'toast menyebut field wajib');
 
     // kontrol positif: perjadin lengkap harus tetap lanjut merender (1 SPT + 1 SPPD)
+    // sekaligus membuktikan nilai pejabat benar-benar SAMPAI ke tag dokumen.
     const win2 = fresh();
-    const calls2 = [];
-    win2.bastRenderDocx = async () => { calls2.push(1); return true; };
+    const tags = [];
+    win2.bastRenderDocx = async (t) => { tags.push(t); return true; };
     win2.apiGet = async () => ({ rows: [] });
     const lanjut = await win2.TugasSPT.generate(grup, {
-      maksud: 'Rakor', tempatTujuan: 'Kupang', tanggalBerangkat: '2026-07-02', tanggalKembali: '2026-07-04'
+      maksud: 'Rakor', tempatTujuan: 'Kupang', tanggalBerangkat: '2026-07-02', tanggalKembali: '2026-07-04',
+      kepala: { nama: 'Kepala Uji', pangkat: 'IV/c', nip: '900' },
+      sekretaris: { nama: 'Sek Uji', nip: '901' },
+      paraf: [{ jabatan: 'Sekretaris BAPPERIDA' }, { jabatan: 'Kabid X' }, { jabatan: 'Kasubbag Y' }]
     });
     assert.equal(lanjut, true);
-    assert.equal(calls2.length, 2, 'SPT + 1 SPPD di-render');
+    assert.equal(tags.length, 2, 'SPT + 1 SPPD di-render');
+    assert.equal(tags[0].KepalaNama, 'Kepala Uji', 'nama kepala masuk tag SPT');
+    assert.equal(tags[0].KepalaNIP, '900');
+    assert.equal(tags[0].Paraf1, 'Sekretaris BAPPERIDA');
+    assert.equal(tags[0].Paraf3, 'Kasubbag Y');
+    assert.equal(tags[1].SekretarisNama, 'Sek Uji', 'nama sekretaris masuk tag SPPD');
+    assert.equal(tags[1].SekretarisNIP, '901');
   } finally {
     if (lamaToast === undefined) delete globalThis.showToast; else globalThis.showToast = lamaToast;
   }
 });
 
+// Membuktikan editan pejabat di form benar-benar sampai ke objek perjadin (dan sebaliknya),
+// bukan sekadar "nama field ada di sumber" ΓÇö lubang yang ditemukan reviewer fix round.
+test('readForm/fillForm: dua arah lewat DOM tiruan (editan pejabat sampai ke perjadin)', () => {
+  const Mod = load();
+  const isi = {
+    nomor: '005/SPT', ditetapkanDi: 'Kupang', kepalaNama: 'Kepala Uji', kepalaPangkat: 'IV/c',
+    kepalaNIP: '900', sekretarisNama: 'Sek Uji', sekretarisNIP: '901',
+    paraf1: 'Sekretaris BAPPERIDA', paraf2: 'Kabid X', paraf3: 'Kasubbag Y'
+  };
+  const elements = {};
+  for (const n of Object.keys(isi)) elements[n] = { value: isi[n], style: {} };
+  const lama = globalThis.document;
+  globalThis.document = { getElementById: id => (id === 'perjadinForm' ? { elements } : null) };
+  try {
+    const p = Mod.readForm({});
+    assert.equal(p.ditetapkanDi, 'Kupang');
+    assert.equal(p.kepala.nama, 'Kepala Uji', 'kepala dari form harus menang atas default');
+    assert.equal(p.kepala.pangkat, 'IV/c');
+    assert.equal(p.kepala.nip, '900');
+    assert.equal(p.sekretaris.nama, 'Sek Uji');
+    assert.equal(p.sekretaris.nip, '901');
+    assert.equal(p.paraf[0].jabatan, 'Sekretaris BAPPERIDA');
+    assert.equal(p.paraf[2].jabatan, 'Kasubbag Y');
+    // fillForm menulis balik + membersihkan border merah sisa submit sebelumnya
+    elements['kepalaNama'].style.borderColor = 'rgb(220, 53, 69)';
+    elements['sekretarisNama'].value = 'harus tertimpa';
+    Mod.fillForm({ kepala: { nama: 'Hasil Isi', pangkat: 'X', nip: '1' }, sekretaris: { nama: 'Sek Isi', nip: '2' }, paraf: [{ jabatan: 'P1' }] });
+    assert.equal(elements['kepalaNama'].value, 'Hasil Isi');
+    assert.equal(elements['kepalaNama'].style.borderColor, '', 'border merah dibersihkan fillForm');
+    assert.equal(elements['sekretarisNama'].value, 'Sek Isi');
+    assert.equal(elements['paraf1'].value, 'P1');
+    assert.equal(elements['paraf2'].value, '');
+  } finally {
+    if (lama === undefined) delete globalThis.document; else globalThis.document = lama;
+  }
+});
+
 test('modal #perjadinModal: tiap field ter-wiring di readForm DAN fillForm (index.html + www)', () => {
-  const iRead = src.indexOf('function readForm() {');
+  const iRead = src.indexOf('function readForm(');
   const iFill = src.indexOf('function fillForm(');
   const iBuka = src.indexOf('async function bukaModal(');
   assert.ok(iRead > 0 && iFill > iRead && iBuka > iFill, 'struktur readForm/fillForm/bukaModal wajar');
@@ -213,4 +296,9 @@ test('modal #perjadinModal: tiap field ter-wiring di readForm DAN fillForm (inde
       assert.deepEqual(lebih, [], file + ': ' + label + ' menunjuk field yang tak ada di form -> ' + lebih.join(', '));
     }
   }
+  // www = salinan APK yang dikirim; tanpa ini, mirroring bisa lupa dan APK basi lolos.
+  assert.ok(
+    fs.readFileSync(path.join(ROOT, 'js', 'tugas-spt.js')).equals(fs.readFileSync(path.join(ROOT, 'www', 'js', 'tugas-spt.js'))),
+    'www/js/tugas-spt.js harus identik byte-per-byte dengan js/tugas-spt.js'
+  );
 });
diff --git a/www/index.html b/www/index.html
index 6ccca56..54e5d3a 100644
--- a/www/index.html
+++ b/www/index.html
@@ -3217,7 +3217,7 @@
 <script src="js/aset-nav.js?v=20261013a"></script>
   <script src="js/simapo-ext.js?v=20261014g"></script>
   <script src="js/simapo-bast.js?v=20261016a"></script>
-  <script src="js/tugas-spt.js?v=20261019"></script>
+  <script src="js/tugas-spt.js?v=20261020"></script>
 
   <!-- 6. Supplementary features -->
 
diff --git a/www/js/tugas-spt.js b/www/js/tugas-spt.js
index 17ef23e..528be40 100644
--- a/www/js/tugas-spt.js
+++ b/www/js/tugas-spt.js
@@ -210,8 +210,10 @@
           pangkat: u.pangkat || u.Pangkat || '', jabatan: u.jabatan || u.Jabatan || ''
         };
       }
+      // ponytail: cache HANYA saat fetch sukses ΓÇö kegagalan sesaat jangan meracuni sesi
+      // (kalau di-cache, semua dialog berikutnya kehilangan pejabat/pangkat sampai reload).
+      _masterCache = out;
     } catch (e) { console.error('[SPT] goldmaster pegawai gagal dimuat:', e); }
-    _masterCache = out;
     return out;
   }
 
@@ -266,10 +268,18 @@
 
   let _grupAktif = null;
 
-  function readForm() {
+  // ponytail: penyalin field tunggal ΓÇö dipakai fillForm & bukaModal (master menyusul).
+  // Sekaligus membersihkan tanda merah validasi supaya dialog yang dibuka ulang tidak
+  // mewarisi border merah dari submit sebelumnya.
+  function setField(n, v) {
+    const el = $('perjadinForm').elements[n];
+    if (el) { el.value = v || ''; el.style.borderColor = ''; }
+  }
+
+  function readForm(perjadinAwal) {
     const f = $('perjadinForm');
     const g = n => { const el = f.elements[n]; return el ? el.value : ''; };
-    const p = merge(_grupAktif.perjadin);
+    const p = merge(perjadinAwal || (_grupAktif && _grupAktif.perjadin));
     p.nomor = g('nomor') || p.nomor;
     p.nomorSPPD = g('nomorSPPD') || p.nomorSPPD;
     p.dasar = g('dasar') || p.dasar;
@@ -301,8 +311,7 @@
   }
 
   function fillForm(perjadin) {
-    const f = $('perjadinForm');
-    const set = (n, v) => { const el = f.elements[n]; if (el) el.value = v || ''; };
+    const set = setField;
     set('nomor', perjadin.nomor);
     set('nomorSPPD', perjadin.nomorSPPD);
     set('dasar', perjadin.dasar);
@@ -337,19 +346,23 @@
       info.textContent = grup.items.length + ' pelaksana: ' + nama + ' ΓÇö ' + ((grup.items[0] || {}).keterangan || '');
     }
     const p = merge(grup.perjadin);
-    // Pejabat dari master (spec ┬º6) hanya bila grup belum punya nilai tersimpan -
-    // supaya surat instansi lain tidak mewarisi nama BAPPERIDA yang di-hardcode.
+    // Dialog tampil lebih dulu (nilai tersimpan/default), master dimuat menyusul ΓÇö
+    // supaya /api/user-list yang lambat tidak menahan munculnya dialog.
+    fillForm(p);
+    modal.style.display = 'flex';
     const punya = grup.perjadin || {};
     if (!punya.kepala || !punya.sekretaris) {
       try {
         const idx = await masterIndex((grup.items[0] || {}).instansi_id || '');
         const d = defaultsDariMaster(idx);
-        if (d.kepala && !punya.kepala) p.kepala = d.kepala;
-        if (d.sekretaris && !punya.sekretaris) p.sekretaris = d.sekretaris;
+        if (d.kepala && !punya.kepala) {
+          setField('kepalaNama', d.kepala.nama); setField('kepalaPangkat', d.kepala.pangkat); setField('kepalaNIP', d.kepala.nip);
+        }
+        if (d.sekretaris && !punya.sekretaris) {
+          setField('sekretarisNama', d.sekretaris.nama); setField('sekretarisNIP', d.sekretaris.nip);
+        }
       } catch (e) { console.error('[SPT] default pejabat gagal:', e); }
     }
-    fillForm(p);
-    modal.style.display = 'flex';
   }
 
   function tutupModal() { const m = $('perjadinModal'); if (m) m.style.display = 'none'; }
@@ -394,6 +407,7 @@
     terbilang, tanggalID, lamaHari, kunciGrup, kelompokkan,
     personTag, bangunTagsSPT, bangunTagsSPPD, DEFAULT_PERJADIN, merge,
     cariPejabat, defaultsDariMaster, validasiPerjadin,
-    masterIndex, bukaModal, generate, simpanPerjadin
+    masterIndex, bukaModal, generate, simpanPerjadin,
+    readForm, fillForm
   };
 })();
```
