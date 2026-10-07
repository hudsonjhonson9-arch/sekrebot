### Task 4: Frontend — entri `P.*`, tab + form Pengaturan, handler JS

**Files:**
- Modify: `js/config.js:277-278`
- Modify: `index.html:1557` (tombol), `index.html:1850` (section)
- Modify: `js/simapo-ext.js:150` (case switchSATab), akhir file (fungsi baru)

**Interfaces:**
- Consumes: endpoint Task 2; helper global yang sudah ada: `apiFetch(path, opts)` (config.js — selalu menambah `_t` + `instansi_id`), `bastSubmit(endpoint, payload, opts)` (js/simapo-bast.js:12, return `boolean`, sudah toast), `BAST_API_KEY`/`BAST_API_HEADER` (config.js), `showToast(msg, type)`.
- Produces: `window.bastGet(endpoint) → object|null` (GET ber-header `x-bast-key`, mengembalikan `body.data`); `window.loadSAPengaturan()`; `window.saveSAPengaturan()`; `window.kosongkanAset()`; key `P.simapoAsetMassal|simapoAsetKib|simapoAsetSummary|simapoPengaturanGet|simapoPengaturanSet|simapoTtdGet|simapoAsetKosongkan`. (Plan 2 memakai `bastGet` + `bastSubmit`; Plan 3 memakai `simapoAsetMassal`/`simapoAsetKib`/`simapoAsetSummary`.)

- [ ] **Step 1: `js/config.js` — 7 entri `P.*` baru**

Ganti baris 277-278 (anchor: entri terakhir `simapoBastHistory` lalu `};`) menjadi:

```js
  simapoBastHistory: isTest ? '/webhook-test/simapo-bast-history' : '/webhook/simapo-bast-history',
  simapoAsetMassal: isTest ? '/webhook-test/simapo-aset-massal' : '/webhook/simapo-aset-massal',
  simapoAsetKib: isTest ? '/webhook-test/simapo-aset-kib' : '/webhook/simapo-aset-kib',
  simapoAsetSummary: isTest ? '/webhook-test/simapo-aset-summary' : '/webhook/simapo-aset-summary',
  simapoPengaturanGet: isTest ? '/webhook-test/simapo-pengaturan-get' : '/webhook/simapo-pengaturan-get',
  simapoPengaturanSet: isTest ? '/webhook-test/simapo-pengaturan-set' : '/webhook/simapo-pengaturan-set',
  simapoTtdGet: isTest ? '/webhook-test/simapo-ttd-get' : '/webhook/simapo-ttd-get',
  simapoAsetKosongkan: isTest ? '/webhook-test/simapo-aset-kosongkan' : '/webhook/simapo-aset-kosongkan',
};
```

- [ ] **Step 2: `index.html` — tombol tab (sesudah baris 1557, anchor `sa-tab-pks`)**

Tambahkan satu baris setelah tombol `sa-tab-pks` (sebelum `</div>` penutup `#sa-tab-bar`):

```html
            <button class="sa-tab"        id="sa-tab-pengaturan" onclick="switchSATab('pengaturan')" data-group="ref">⚙️ Pengaturan</button>
```

- [ ] **Step 3: `index.html` — section form (sesudah baris 1850, sebelum komentar `<!-- [TAB] BKU -->`)**

```html
        <!-- [TAB] PENGATURAN -->
        <div id="sa-sect-pengaturan" class="sa-sect" style="display:none">
          <div class="card glass-card">
            <div class="card-title" style="display:flex;justify-content:space-between;align-items:center;">
              <span>⚙️ Pengaturan Aset</span>
              <button class="btn-sm-admin" onclick="loadSAPengaturan()" style="background:var(--primary)">🔄</button>
            </div>
            <div style="font-size:10px;color:var(--muted);margin-bottom:10px;">Data Pihak Pertama untuk BAST. Mode Sekda dipakai saat Pihak Kedua = NIP Sekda; selain itu mode Kepala (NIP di bawah).</div>
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;">
              <div class="form-group"><label class="form-label">Nama Sekretaris Daerah</label><input class="form-input" id="setSekdaNama" placeholder="Yermia Ndapa Doda, S.Sos"></div>
              <div class="form-group"><label class="form-label">NIP Sekretaris Daerah</label><input class="form-input" id="setSekdaNip" placeholder="196803241999031003"></div>
              <div class="form-group"><label class="form-label">Jabatan Sekretaris Daerah</label><input class="form-input" id="setSekdaJabatan" placeholder="Sekretaris Daerah Kabupaten Sumba Barat"></div>
              <div class="form-group"><label class="form-label">Alamat Sekretaris Daerah</label><input class="form-input" id="setSekdaAlamat" placeholder="Waikabubak"></div>
              <div class="form-group"><label class="form-label">NIP Pihak Pertama (Kepala)</label><input class="form-input" id="setP1Nip" placeholder="197211022001121001"></div>
              <div class="form-group"><label class="form-label">Jabatan Pihak Pertama</label><input class="form-input" id="setP1Jabatan" placeholder="Kepala Badan Perencanaan Kabupaten Sumba Barat"></div>
              <div class="form-group" style="grid-column:1/-1;"><label class="form-label">Alamat Pihak Pertama</label><input class="form-input" id="setP1Alamat" placeholder="Waikabubak"></div>
            </div>
            <button class="btn-primary" onclick="saveSAPengaturan()" style="width:100%;margin-top:12px;">
              <div class="btn-inner"><span>💾</span> Simpan Pengaturan</div>
            </button>
            <hr style="border-color:rgba(255,255,255,0.08);margin:18px 0;">
            <div class="form-label" style="color:#f87171;">⚠️ Zona Bahaya</div>
            <div style="font-size:11px;color:var(--muted);margin-bottom:8px;">Kosongkan seluruh data aset instansi ini (katalog + unit + riwayat transaksi yang merujuknya). Pegawai, ruangan, kategori, pengaturan, dan arsip BAST TIDAK terhapus.</div>
            <div style="display:flex;gap:8px;">
              <input class="form-input" id="kosongkanKonfirmasi" placeholder="Ketik HAPUS untuk mengaktifkan">
              <button class="btn-sm-admin" onclick="kosongkanAset()" style="background:rgba(248,113,113,0.2);color:#f87171;white-space:nowrap;">🗑 Kosongkan</button>
            </div>
          </div>
        </div>

```

- [ ] **Step 4: `js/simapo-ext.js` — case baru di `switchSATab` (baris 150)**

Ganti:

```js
  else if (name === 'bast') window.loadAdminBast(force);
```

menjadi:

```js
  else if (name === 'bast') window.loadAdminBast(force);
  else if (name === 'pengaturan') window.loadSAPengaturan();
```

- [ ] **Step 5: `js/simapo-ext.js` — tambahkan blok berikut di AKHIR FILE (setelah baris terakhir)**

```js
/* ─── PENGATURAN (P1) + KOSONGKAN ASET ─────────────────────────────── */
window.bastGet = async function(endpoint) {
  try {
    const res = await apiFetch(endpoint, { headers: { [BAST_API_HEADER]: BAST_API_KEY } });
    if (!res.ok) return null;
    const body = await res.json();
    return (body && body.data) || null;
  } catch (e) {
    console.error('[SIMAPO] GET gagal:', endpoint, e);
    return null;
  }
};

window.loadSAPengaturan = async function() {
  const data = (await window.bastGet(P.simapoPengaturanGet)) || {};
  const fill = (id, v) => { const el = document.getElementById(id); if (el && v) el.value = v; };
  fill('setSekdaNama', data.sekda_nama);
  fill('setSekdaNip', data.sekda_nip);
  fill('setSekdaJabatan', data.sekda_jabatan);
  fill('setSekdaAlamat', data.sekda_alamat);
  fill('setP1Nip', data.p1_id);
  fill('setP1Jabatan', data.p1_jabatan);
  fill('setP1Alamat', data.p1_alamat);
};

window.saveSAPengaturan = async function() {
  const v = id => ((document.getElementById(id) || {}).value || '').trim();
  await window.bastSubmit(P.simapoPengaturanSet, {
    sekda_nama: v('setSekdaNama'),
    sekda_nip: v('setSekdaNip'),
    sekda_jabatan: v('setSekdaJabatan'),
    sekda_alamat: v('setSekdaAlamat'),
    p1_id: v('setP1Nip'),
    p1_jabatan: v('setP1Jabatan'),
    p1_alamat: v('setP1Alamat')
  }, { successMsg: 'Pengaturan disimpan', errorMsg: 'Gagal menyimpan pengaturan.' });
};

window.kosongkanAset = async function() {
  const inp = document.getElementById('kosongkanKonfirmasi');
  if (!inp || inp.value.trim() !== 'HAPUS') {
    showToast('Ketik HAPUS dulu di kolom konfirmasi.', 'error');
    return;
  }
  const ok = await window.bastSubmit(P.simapoAsetKosongkan, { confirm: 'HAPUS' },
    { successMsg: 'Data aset dikosongkan', errorMsg: 'Gagal mengosongkan data aset.' });
  if (ok) inp.value = '';
};
```

- [ ] **Step 6: Cek sintaks + build**

```powershell
node --check js/simapo-ext.js; if (-not $?) { exit 1 }
node --check js/config.js; if (-not $?) { exit 1 }
npm run build
```
Expected: tanpa error; `npm run build` selesai (vite).

- [ ] **Step 7: Commit**

```powershell
git add js/config.js index.html js/simapo-ext.js
git commit -m "feat(aset): tab Pengaturan (P1 sekda/kepala + kosongkan) dan entri endpoint aset data"
```
Expected: commit sukses, 3 file masuk.

---
