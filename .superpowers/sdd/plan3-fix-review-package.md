# Paket Review Fix Round (Important #1 + #2) - bcf72cb..8aae9a2

Base: bcf72cb (review NEEDS-FIX) -> 8aae9a2 (fix). 682616a = docs-only (ledger + amandemen plan), tak perlu direview.

## git diff bcf72cb..8aae9a2 -- js/ www/ index.html tests/
```diff
diff --git a/index.html b/index.html
index 7908102..ac06329 100644
--- a/index.html
+++ b/index.html
@@ -1,4 +1,4 @@
-∩╗┐<!DOCTYPE html>
+<!DOCTYPE html>
 <html lang="id">
 
 <head>
@@ -3339,7 +3339,7 @@
 <script src="js/aset-nav.js?v=20261013a"></script>
   <script src="js/simapo-ext.js?v=20261014g"></script>
   <script src="js/simapo-bast.js?v=20261016a"></script>
-  <script src="js/tugas-spt.js?v=20261018"></script>
+  <script src="js/tugas-spt.js?v=20261019"></script>
 
   <!-- 6. Supplementary features -->
 
@@ -3711,6 +3711,18 @@
         <div class="form-group"><label class="form-label">Tingkat Biaya</label><input class="form-input" name="tingkatBiaya"></div>
         <div class="form-group"><label class="form-label">Tanggal Penetapan</label><input type="date" class="form-input" name="tanggalPenetapan"></div>
         <div class="form-group"><label class="form-label">Mata Anggaran</label><input class="form-input" name="mataAnggaran"></div>
+        <div style="margin-top:12px; padding-top:10px; border-top:1px solid var(--border)">
+          <div style="font-weight:700; font-size:11px; color:var(--muted); margin-bottom:6px">Penandatangan</div>
+          <div class="form-group"><label class="form-label">Ditetapkan Di</label><input class="form-input" name="ditetapkanDi"></div>
+          <div class="form-group"><label class="form-label">Kepala - Nama</label><input class="form-input" name="kepalaNama"></div>
+          <div class="form-group"><label class="form-label">Kepala - Pangkat/Gol</label><input class="form-input" name="kepalaPangkat"></div>
+          <div class="form-group"><label class="form-label">Kepala - NIP</label><input class="form-input" name="kepalaNIP"></div>
+          <div class="form-group"><label class="form-label">Sekretaris - Nama</label><input class="form-input" name="sekretarisNama"></div>
+          <div class="form-group"><label class="form-label">Sekretaris - NIP</label><input class="form-input" name="sekretarisNIP"></div>
+          <div class="form-group"><label class="form-label">Paraf 1</label><input class="form-input" name="paraf1"></div>
+          <div class="form-group"><label class="form-label">Paraf 2</label><input class="form-input" name="paraf2"></div>
+          <div class="form-group"><label class="form-label">Paraf 3</label><input class="form-input" name="paraf3"></div>
+        </div>
         <div style="display:flex; gap:8px; margin-top:14px">
           <button type="button" id="perjadinCancel" class="btn-secondary" style="flex:1">Batal</button>
           <button type="submit" class="btn-primary" style="flex:2"><i class="fas fa-print"></i> Cetak SPT &amp; SPPD</button>
diff --git a/js/tugas-spt.js b/js/tugas-spt.js
index b914bbc..17ef23e 100644
--- a/js/tugas-spt.js
+++ b/js/tugas-spt.js
@@ -89,6 +89,36 @@
     return out;
   }
 
+  // Pejabat dari master: entri pertama yang jabatannya cocok (spec ┬º6, mis. /^Kepala Badan/i).
+  function cariPejabat(masterIndex, re) {
+    const idx = masterIndex || {};
+    for (const nip of Object.keys(idx)) {
+      const m = idx[nip] || {};
+      if (m.jabatan && re.test(String(m.jabatan))) return m;
+    }
+    return null;
+  }
+
+  // Default penandatangan dari master; null bila tak ada yang cocok (pakai DEFAULT_PERJADIN).
+  function defaultsDariMaster(masterIndex) {
+    const k = cariPejabat(masterIndex, /^Kepala Badan/i);
+    const s = cariPejabat(masterIndex, /^Sekretaris/i);
+    return {
+      kepala: k ? { nama: k.nama || '', pangkat: k.pangkat || '', nip: k.nip || '' } : null,
+      sekretaris: s ? { nama: s.nama || '', nip: s.nip || '' } : null
+    };
+  }
+
+  // Field wajib sebelum generate (spec ┬º11) -> label yang masih kosong.
+  const FIELD_WAJIB = [
+    ['maksud', 'Maksud'], ['tempatTujuan', 'Tempat Tujuan'],
+    ['tanggalBerangkat', 'Tanggal Berangkat'], ['tanggalKembali', 'Tanggal Kembali']
+  ];
+  function validasiPerjadin(p) {
+    const q = merge(p);
+    return FIELD_WAJIB.filter(f => !String(q[f[0]] || '').trim()).map(f => f[1]);
+  }
+
   function personTag(row, masterIndex) {
     const m = (masterIndex && masterIndex[String(row.nip)]) || {};
     return {
@@ -199,6 +229,11 @@
   }
 
   async function generate(grup, perjadin) {
+    const kurang = validasiPerjadin(perjadin);
+    if (kurang.length) {
+      if (typeof showToast === 'function') showToast('Wajib diisi: ' + kurang.join(', '), 'error');
+      return false;
+    }
     if (!window.bastRenderDocx) { showToast('Fungsi render dokumen belum siap.', 'error'); return false; }
     const instansiId = (grup.items[0] && grup.items[0].instansi_id) || '';
     const idx = await masterIndex(instansiId);
@@ -247,6 +282,21 @@
     p.tingkatBiaya = g('tingkatBiaya') || p.tingkatBiaya;
     p.tanggalPenetapan = g('tanggalPenetapan');
     p.mataAnggaran = g('mataAnggaran') || p.mataAnggaran;
+    p.ditetapkanDi = g('ditetapkanDi') || p.ditetapkanDi;
+    p.kepala = {
+      nama: g('kepalaNama') || p.kepala.nama,
+      pangkat: g('kepalaPangkat') || p.kepala.pangkat,
+      nip: g('kepalaNIP') || p.kepala.nip
+    };
+    p.sekretaris = {
+      nama: g('sekretarisNama') || p.sekretaris.nama,
+      nip: g('sekretarisNIP') || p.sekretaris.nip
+    };
+    p.paraf = [
+      { jabatan: g('paraf1') || (p.paraf[0] || {}).jabatan || '' },
+      { jabatan: g('paraf2') || (p.paraf[1] || {}).jabatan || '' },
+      { jabatan: g('paraf3') || (p.paraf[2] || {}).jabatan || '' }
+    ];
     return p;
   }
 
@@ -265,9 +315,19 @@
     set('tingkatBiaya', perjadin.tingkatBiaya);
     set('tanggalPenetapan', perjadin.tanggalPenetapan);
     set('mataAnggaran', perjadin.mataAnggaran);
+    const k = perjadin.kepala || {}, s = perjadin.sekretaris || {}, pf = perjadin.paraf || [];
+    set('ditetapkanDi', perjadin.ditetapkanDi);
+    set('kepalaNama', k.nama);
+    set('kepalaPangkat', k.pangkat);
+    set('kepalaNIP', k.nip);
+    set('sekretarisNama', s.nama);
+    set('sekretarisNIP', s.nip);
+    set('paraf1', (pf[0] || {}).jabatan);
+    set('paraf2', (pf[1] || {}).jabatan);
+    set('paraf3', (pf[2] || {}).jabatan);
   }
 
-  function bukaModal(grup) {
+  async function bukaModal(grup) {
     _grupAktif = grup;
     const modal = $('perjadinModal');
     if (!modal) return;
@@ -276,7 +336,19 @@
       const nama = grup.items.map(r => r.nama || r.nip).join(', ');
       info.textContent = grup.items.length + ' pelaksana: ' + nama + ' ΓÇö ' + ((grup.items[0] || {}).keterangan || '');
     }
-    fillForm(merge(grup.perjadin));
+    const p = merge(grup.perjadin);
+    // Pejabat dari master (spec ┬º6) hanya bila grup belum punya nilai tersimpan -
+    // supaya surat instansi lain tidak mewarisi nama BAPPERIDA yang di-hardcode.
+    const punya = grup.perjadin || {};
+    if (!punya.kepala || !punya.sekretaris) {
+      try {
+        const idx = await masterIndex((grup.items[0] || {}).instansi_id || '');
+        const d = defaultsDariMaster(idx);
+        if (d.kepala && !punya.kepala) p.kepala = d.kepala;
+        if (d.sekretaris && !punya.sekretaris) p.sekretaris = d.sekretaris;
+      } catch (e) { console.error('[SPT] default pejabat gagal:', e); }
+    }
+    fillForm(p);
     modal.style.display = 'flex';
   }
 
@@ -296,7 +368,17 @@
       const btn = form.querySelector('button[type="submit"]');
       if (btn) btn.disabled = true;
       try {
-        if (await generate(_grupAktif, readForm())) tutupModal();
+        const p = readForm();
+        const kurang = validasiPerjadin(p);
+        FIELD_WAJIB.forEach(f => {
+          const el = form.elements[f[0]];
+          if (el) el.style.borderColor = String(el.value || '').trim() ? '' : '#dc3545';
+        });
+        if (kurang.length) {
+          if (typeof showToast === 'function') showToast('Wajib diisi: ' + kurang.join(', '), 'error');
+          return;
+        }
+        if (await generate(_grupAktif, p)) tutupModal();
       } finally {
         if (btn) btn.disabled = false;
       }
@@ -311,6 +393,7 @@
   window.TugasSPT = {
     terbilang, tanggalID, lamaHari, kunciGrup, kelompokkan,
     personTag, bangunTagsSPT, bangunTagsSPPD, DEFAULT_PERJADIN, merge,
+    cariPejabat, defaultsDariMaster, validasiPerjadin,
     masterIndex, bukaModal, generate, simpanPerjadin
   };
 })();
diff --git a/tests/tugas-spt.test.mjs b/tests/tugas-spt.test.mjs
index 4556794..791ae46 100644
--- a/tests/tugas-spt.test.mjs
+++ b/tests/tugas-spt.test.mjs
@@ -140,3 +140,77 @@ test('masterIndex: meneruskan instansi_id grup ke apiGet', async () => {
   await win2.TugasSPT.masterIndex();
   assert.deepEqual(got2, {});
 });
+
+test('validasiPerjadin: kosong -> 4 label wajib, lengkap -> lolos', () => {
+  assert.deepEqual(T.validasiPerjadin({}), ['Maksud', 'Tempat Tujuan', 'Tanggal Berangkat', 'Tanggal Kembali']);
+  assert.deepEqual(T.validasiPerjadin({ maksud: 'Rakor', tempatTujuan: 'Kupang', tanggalBerangkat: '2026-07-02', tanggalKembali: '2026-07-04' }), []);
+  // spasi saja dihitung kosong
+  assert.deepEqual(T.validasiPerjadin({ maksud: '  ', tempatTujuan: 'Kupang', tanggalBerangkat: '2026-07-02', tanggalKembali: '2026-07-04' }), ['Maksud']);
+});
+
+test('defaultsDariMaster: Kepala Badan & Sekretaris diambil dari jabatan master', () => {
+  const idx = {
+    '111': { nip: '111', nama: 'Bukan', pangkat: 'III/a', jabatan: 'Pranata Komputer' },
+    '222': { nip: '222', nama: 'Kepala', pangkat: 'IV/c', jabatan: 'Kepala Badan' },
+    '333': { nip: '333', nama: 'Sek', pangkat: 'IV/a', jabatan: 'Sekretaris' }
+  };
+  const d = T.defaultsDariMaster(idx);
+  assert.deepEqual(d.kepala, { nama: 'Kepala', pangkat: 'IV/c', nip: '222' });
+  assert.deepEqual(d.sekretaris, { nama: 'Sek', nip: '333' });
+  // tidak ada yang cocok -> null (pemanggil kembali ke DEFAULT_PERJADIN)
+  assert.deepEqual(T.defaultsDariMaster({ '111': { jabatan: 'Staf' } }), { kepala: null, sekretaris: null });
+  assert.deepEqual(T.defaultsDariMaster(null), { kepala: null, sekretaris: null });
+});
+
+test('generate: field wajib kosong -> batal + TIDAK menyentuh render (kontrol positif ikut diuji)', async () => {
+  const toasts = [];
+  const lamaToast = globalThis.showToast;
+  globalThis.showToast = (m, t) => toasts.push([m, t]);
+  const grup = { items: [{ id: '1', nip: '111', nama: 'A', tanggal: '2026-07-02', keterangan: 'Rakor', instansi_id: 'INS' }] };
+  try {
+    const win = fresh();
+    const calls = [];
+    win.bastRenderDocx = async () => { calls.push(1); return true; };
+    win.apiGet = async () => ({ rows: [] });
+
+    const tolak = await win.TugasSPT.generate(grup, { maksud: '', tempatTujuan: '' });
+    assert.equal(tolak, false);
+    assert.deepEqual(calls, [], 'render tidak boleh dipanggil saat validasi gagal');
+    assert.ok(toasts.some(x => /Wajib diisi: .*Maksud/.test(x[0])), 'toast menyebut field wajib');
+
+    // kontrol positif: perjadin lengkap harus tetap lanjut merender (1 SPT + 1 SPPD)
+    const win2 = fresh();
+    const calls2 = [];
+    win2.bastRenderDocx = async () => { calls2.push(1); return true; };
+    win2.apiGet = async () => ({ rows: [] });
+    const lanjut = await win2.TugasSPT.generate(grup, {
+      maksud: 'Rakor', tempatTujuan: 'Kupang', tanggalBerangkat: '2026-07-02', tanggalKembali: '2026-07-04'
+    });
+    assert.equal(lanjut, true);
+    assert.equal(calls2.length, 2, 'SPT + 1 SPPD di-render');
+  } finally {
+    if (lamaToast === undefined) delete globalThis.showToast; else globalThis.showToast = lamaToast;
+  }
+});
+
+test('modal #perjadinModal: tiap field ter-wiring di readForm DAN fillForm (index.html + www)', () => {
+  const iRead = src.indexOf('function readForm() {');
+  const iFill = src.indexOf('function fillForm(');
+  const iBuka = src.indexOf('async function bukaModal(');
+  assert.ok(iRead > 0 && iFill > iRead && iBuka > iFill, 'struktur readForm/fillForm/bukaModal wajar');
+  const baca = new Set([...src.slice(iRead, iFill).matchAll(/\bg\('([A-Za-z0-9]+)'\)/g)].map(m => m[1]));
+  const isi = new Set([...src.slice(iFill, iBuka).matchAll(/\bset\('([A-Za-z0-9]+)'/g)].map(m => m[1]));
+  assert.ok(baca.size >= 20 && isi.size >= 20, 'ekstraksi nama field wajar: baca=' + baca.size + ' isi=' + isi.size);
+  for (const file of ['index.html', 'www/index.html']) {
+    const html = fs.readFileSync(path.join(ROOT, file), 'utf8');
+    const modalAll = html.slice(html.indexOf('id="perjadinModal"'), html.indexOf('</form>', html.indexOf('id="perjadinForm"')));
+    const namaHtml = new Set([...modalAll.matchAll(/name="([A-Za-z0-9]+)"/g)].map(m => m[1]));
+    assert.ok(namaHtml.size >= 20, file + ': field modal terbaca, dapat ' + namaHtml.size);
+    for (const [label, kumpulan] of [['readForm', baca], ['fillForm', isi]]) {
+      const kurang = [...namaHtml].filter(n => !kumpulan.has(n));
+      const lebih = [...kumpulan].filter(n => !namaHtml.has(n));
+      assert.deepEqual(kurang, [], file + ': field di form tapi tak di-' + label + ' -> ' + kurang.join(', '));
+      assert.deepEqual(lebih, [], file + ': ' + label + ' menunjuk field yang tak ada di form -> ' + lebih.join(', '));
+    }
+  }
+});
diff --git a/www/index.html b/www/index.html
index e98a29c..6ccca56 100644
--- a/www/index.html
+++ b/www/index.html
@@ -3217,7 +3217,7 @@
 <script src="js/aset-nav.js?v=20261013a"></script>
   <script src="js/simapo-ext.js?v=20261014g"></script>
   <script src="js/simapo-bast.js?v=20261016a"></script>
-  <script src="js/tugas-spt.js?v=20261018"></script>
+  <script src="js/tugas-spt.js?v=20261019"></script>
 
   <!-- 6. Supplementary features -->
 
@@ -3589,6 +3589,18 @@
         <div class="form-group"><label class="form-label">Tingkat Biaya</label><input class="form-input" name="tingkatBiaya"></div>
         <div class="form-group"><label class="form-label">Tanggal Penetapan</label><input type="date" class="form-input" name="tanggalPenetapan"></div>
         <div class="form-group"><label class="form-label">Mata Anggaran</label><input class="form-input" name="mataAnggaran"></div>
+        <div style="margin-top:12px; padding-top:10px; border-top:1px solid var(--border)">
+          <div style="font-weight:700; font-size:11px; color:var(--muted); margin-bottom:6px">Penandatangan</div>
+          <div class="form-group"><label class="form-label">Ditetapkan Di</label><input class="form-input" name="ditetapkanDi"></div>
+          <div class="form-group"><label class="form-label">Kepala - Nama</label><input class="form-input" name="kepalaNama"></div>
+          <div class="form-group"><label class="form-label">Kepala - Pangkat/Gol</label><input class="form-input" name="kepalaPangkat"></div>
+          <div class="form-group"><label class="form-label">Kepala - NIP</label><input class="form-input" name="kepalaNIP"></div>
+          <div class="form-group"><label class="form-label">Sekretaris - Nama</label><input class="form-input" name="sekretarisNama"></div>
+          <div class="form-group"><label class="form-label">Sekretaris - NIP</label><input class="form-input" name="sekretarisNIP"></div>
+          <div class="form-group"><label class="form-label">Paraf 1</label><input class="form-input" name="paraf1"></div>
+          <div class="form-group"><label class="form-label">Paraf 2</label><input class="form-input" name="paraf2"></div>
+          <div class="form-group"><label class="form-label">Paraf 3</label><input class="form-input" name="paraf3"></div>
+        </div>
         <div style="display:flex; gap:8px; margin-top:14px">
           <button type="button" id="perjadinCancel" class="btn-secondary" style="flex:1">Batal</button>
           <button type="submit" class="btn-primary" style="flex:2"><i class="fas fa-print"></i> Cetak SPT &amp; SPPD</button>
diff --git a/www/js/tugas-spt.js b/www/js/tugas-spt.js
index b914bbc..17ef23e 100644
--- a/www/js/tugas-spt.js
+++ b/www/js/tugas-spt.js
@@ -89,6 +89,36 @@
     return out;
   }
 
+  // Pejabat dari master: entri pertama yang jabatannya cocok (spec ┬º6, mis. /^Kepala Badan/i).
+  function cariPejabat(masterIndex, re) {
+    const idx = masterIndex || {};
+    for (const nip of Object.keys(idx)) {
+      const m = idx[nip] || {};
+      if (m.jabatan && re.test(String(m.jabatan))) return m;
+    }
+    return null;
+  }
+
+  // Default penandatangan dari master; null bila tak ada yang cocok (pakai DEFAULT_PERJADIN).
+  function defaultsDariMaster(masterIndex) {
+    const k = cariPejabat(masterIndex, /^Kepala Badan/i);
+    const s = cariPejabat(masterIndex, /^Sekretaris/i);
+    return {
+      kepala: k ? { nama: k.nama || '', pangkat: k.pangkat || '', nip: k.nip || '' } : null,
+      sekretaris: s ? { nama: s.nama || '', nip: s.nip || '' } : null
+    };
+  }
+
+  // Field wajib sebelum generate (spec ┬º11) -> label yang masih kosong.
+  const FIELD_WAJIB = [
+    ['maksud', 'Maksud'], ['tempatTujuan', 'Tempat Tujuan'],
+    ['tanggalBerangkat', 'Tanggal Berangkat'], ['tanggalKembali', 'Tanggal Kembali']
+  ];
+  function validasiPerjadin(p) {
+    const q = merge(p);
+    return FIELD_WAJIB.filter(f => !String(q[f[0]] || '').trim()).map(f => f[1]);
+  }
+
   function personTag(row, masterIndex) {
     const m = (masterIndex && masterIndex[String(row.nip)]) || {};
     return {
@@ -199,6 +229,11 @@
   }
 
   async function generate(grup, perjadin) {
+    const kurang = validasiPerjadin(perjadin);
+    if (kurang.length) {
+      if (typeof showToast === 'function') showToast('Wajib diisi: ' + kurang.join(', '), 'error');
+      return false;
+    }
     if (!window.bastRenderDocx) { showToast('Fungsi render dokumen belum siap.', 'error'); return false; }
     const instansiId = (grup.items[0] && grup.items[0].instansi_id) || '';
     const idx = await masterIndex(instansiId);
@@ -247,6 +282,21 @@
     p.tingkatBiaya = g('tingkatBiaya') || p.tingkatBiaya;
     p.tanggalPenetapan = g('tanggalPenetapan');
     p.mataAnggaran = g('mataAnggaran') || p.mataAnggaran;
+    p.ditetapkanDi = g('ditetapkanDi') || p.ditetapkanDi;
+    p.kepala = {
+      nama: g('kepalaNama') || p.kepala.nama,
+      pangkat: g('kepalaPangkat') || p.kepala.pangkat,
+      nip: g('kepalaNIP') || p.kepala.nip
+    };
+    p.sekretaris = {
+      nama: g('sekretarisNama') || p.sekretaris.nama,
+      nip: g('sekretarisNIP') || p.sekretaris.nip
+    };
+    p.paraf = [
+      { jabatan: g('paraf1') || (p.paraf[0] || {}).jabatan || '' },
+      { jabatan: g('paraf2') || (p.paraf[1] || {}).jabatan || '' },
+      { jabatan: g('paraf3') || (p.paraf[2] || {}).jabatan || '' }
+    ];
     return p;
   }
 
@@ -265,9 +315,19 @@
     set('tingkatBiaya', perjadin.tingkatBiaya);
     set('tanggalPenetapan', perjadin.tanggalPenetapan);
     set('mataAnggaran', perjadin.mataAnggaran);
+    const k = perjadin.kepala || {}, s = perjadin.sekretaris || {}, pf = perjadin.paraf || [];
+    set('ditetapkanDi', perjadin.ditetapkanDi);
+    set('kepalaNama', k.nama);
+    set('kepalaPangkat', k.pangkat);
+    set('kepalaNIP', k.nip);
+    set('sekretarisNama', s.nama);
+    set('sekretarisNIP', s.nip);
+    set('paraf1', (pf[0] || {}).jabatan);
+    set('paraf2', (pf[1] || {}).jabatan);
+    set('paraf3', (pf[2] || {}).jabatan);
   }
 
-  function bukaModal(grup) {
+  async function bukaModal(grup) {
     _grupAktif = grup;
     const modal = $('perjadinModal');
     if (!modal) return;
@@ -276,7 +336,19 @@
       const nama = grup.items.map(r => r.nama || r.nip).join(', ');
       info.textContent = grup.items.length + ' pelaksana: ' + nama + ' ΓÇö ' + ((grup.items[0] || {}).keterangan || '');
     }
-    fillForm(merge(grup.perjadin));
+    const p = merge(grup.perjadin);
+    // Pejabat dari master (spec ┬º6) hanya bila grup belum punya nilai tersimpan -
+    // supaya surat instansi lain tidak mewarisi nama BAPPERIDA yang di-hardcode.
+    const punya = grup.perjadin || {};
+    if (!punya.kepala || !punya.sekretaris) {
+      try {
+        const idx = await masterIndex((grup.items[0] || {}).instansi_id || '');
+        const d = defaultsDariMaster(idx);
+        if (d.kepala && !punya.kepala) p.kepala = d.kepala;
+        if (d.sekretaris && !punya.sekretaris) p.sekretaris = d.sekretaris;
+      } catch (e) { console.error('[SPT] default pejabat gagal:', e); }
+    }
+    fillForm(p);
     modal.style.display = 'flex';
   }
 
@@ -296,7 +368,17 @@
       const btn = form.querySelector('button[type="submit"]');
       if (btn) btn.disabled = true;
       try {
-        if (await generate(_grupAktif, readForm())) tutupModal();
+        const p = readForm();
+        const kurang = validasiPerjadin(p);
+        FIELD_WAJIB.forEach(f => {
+          const el = form.elements[f[0]];
+          if (el) el.style.borderColor = String(el.value || '').trim() ? '' : '#dc3545';
+        });
+        if (kurang.length) {
+          if (typeof showToast === 'function') showToast('Wajib diisi: ' + kurang.join(', '), 'error');
+          return;
+        }
+        if (await generate(_grupAktif, p)) tutupModal();
       } finally {
         if (btn) btn.disabled = false;
       }
@@ -311,6 +393,7 @@
   window.TugasSPT = {
     terbilang, tanggalID, lamaHari, kunciGrup, kelompokkan,
     personTag, bangunTagsSPT, bangunTagsSPPD, DEFAULT_PERJADIN, merge,
+    cariPejabat, defaultsDariMaster, validasiPerjadin,
     masterIndex, bukaModal, generate, simpanPerjadin
   };
 })();
```
## Spec acuan (kutipan)

- spec:47: di baris 47). Jadi tiap dokumen template baru **wajib ditambah** ke baris itu, dan tiap
- spec:230: blok penandatangan (Kepala/Sekretaris/KTU) yang bisa diedit. Pakai kelas form yang sudah
- spec:240: - Validasi sebelum generate: maksud, tempat tujuan, tanggal berangkat/kembali wajib; kalau

## Status git
```
?? .superpowers/sdd/plan3-fix-review-package.md
?? 8656838432_2026-07-02_2026-07-02_TUGAS.docx
?? "Salinan Surat Tugas.docx"
?? aset.db
```
