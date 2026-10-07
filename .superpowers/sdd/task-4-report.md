# Task 4 Report — Frontend panel admin aset (tab Pengaturan)

**Status: DONE** · commit `800014d` `feat(aset): tab Pengaturan (P1 sekda/kepala + kosongkan) dan entri endpoint aset data` (4 files, 90+/1-)

## Apa yang ditambahkan di mana

### 1. `js/config.js` — 7 entri `P.*` (setelah `simapoBastHistory`, baris ~277)
```js
simapoAsetMassal, simapoAsetKib, simapoAsetSummary,
simapoPengaturanGet, simapoPengaturanSet, simapoTtdGet, simapoAsetKosongkan
```
Semua pola `isTest ? '/webhook-test/...' : '/webhook/...'`, sesuai brief Step 1 verbatim.

### 2. `index.html` — tombol tab (sesudah `sa-tab-pks`, ~baris 1558)
```html
<button class="sa-tab" id="sa-tab-pengaturan" onclick="switchSATab('pengaturan')" data-group="ref">⚙️ Pengaturan</button>
```
`data-group="ref"` → grup `sa-group-ref` (Referensi, berisi PKS) sudah ada; `switchSAGroup('ref')` menampilkan tab baru otomatis tanpa perubahan tambahan.

### 3. `index.html` — section `#sa-sect-pengaturan` (sebelum `<!-- [TAB] BKU -->`, ~baris 1852)
Markup brief Step 3 verbatim: form 7 field (`setSekdaNama|Nip|Jabatan|Alamat`, `setP1Nip|Jabatan|Alamat`), tombol Simpan, blok "⚠️ Zona Bahaya" dengan input `kosongkanKonfirmasi` + tombol 🗑 Kosongkan.

### 4. `js/simapo-ext.js` — case `switchSATab` (baris ~151)
```js
else if (name === 'pengaturan') window.loadSAPengaturan();
```

### 5. `js/simapo-ext.js` — blok akhir file (sesudah `deletePKS`)
Brief Step 5 verbatim:
- `window.bastGet(endpoint)` → GET via `apiFetch` + header `[BAST_API_HEADER]: BAST_API_KEY`, return `body.data` atau `null`.
- `window.loadSAPengaturan()` — isi form dari `P.simapoPengaturanGet`.
- `window.saveSAPengaturan()` — POST via `window.bastSubmit(P.simapoPengaturanSet, …)`.
- `window.kosongkanAset()` — cek input `=== 'HAPUS'` → `bastSubmit(P.simapoAsetKosongkan, {confirm:'HAPUS'})`, kosongkan input bila sukses.

### 6. `js/simapo-bast.js` — +1 baris (DEVASI dari daftar-file brief, disengaja)
```js
const ok = res.ok && body !== null && (typeof isApiSuccess === 'function' ? isApiSuccess(body, true) : true);
```
plus komentar `// ponytail: gate/guard instance ini balas 200 + body kosong saat menolak → body null = gagal`.

**Alasan:** kontrak task = gate/guard rejection = **HTTP 200 + body kosong** (diverifikasi live di `task-2-report.md:99,127-128,147`). `isApiSuccess(null, true)` di `js/api.js:95` sengaja mengembalikan `true` ("200 no body = success") → `bastSubmit` tanpa perbaikan ini akan menampilkan toast **sukses palsu** saat gate menolak / workflow error di tengah (kondisi 200-kosong = satu-satunya sinyal kegagalan). Fix ditaruh di helper bersama (akar masalah) bukan di tiap pemanggil.

**Keamanan regresi (diverifikasi):** kelima endpoint ber-gate yang memakai `bastSubmit` (`simapo-bast-init|assign|save|ruangan` + `simapo-pengaturan-set|aset-kosongkan`) semuanya membalas `={{ JSON.stringify($json) }}` pada sukses (dicek di `n8n/SIMAPO - BAST.json` & `n8n/SIMAPO - Aset Data.json`) → body tak-pernah-kosong saat sukses → tak ada fitur lama yang bergantung pada "200 kosong = sukses". Pemanggil lama: `simapo-bast.js:110,247,382`.

## Validasi (PowerShell)

| Cek | Hasil |
|---|---|
| `node --check js/config.js` | OK |
| `node --check js/simapo-ext.js` | OK |
| `node --check js/simapo-bast.js` | OK |
| `npm install` (vite hilang dari node_modules) | 138 pkgs, `package-lock.json` tidak berubah |
| `npm run build` (vite) | `✓ built in 1.01s` |
| 7 path endpoint vs kontrak live | ✅ identik: `simapo-aset-massal`, `simapo-aset-kib`, `simapo-aset-summary`, `simapo-pengaturan-get`, `simapo-pengaturan-set`, `simapo-ttd-get`, `simapo-aset-kosongkan` |
| `x-bast-key` via helper (tanpa duplikasi key) | ✅ `BAST_API_HEADER`/`BAST_API_KEY` saja; literal `ogsbIpBCC…` tidak muncul di `simapo-ext.js` |
| Secret literal (`eyJ`/`N8N_TOKEN`/`Bearer`) di file berubah | 0 di keempat file |
| Mojibake (karakter ter-encoding ganda) di file berubah | 0 |
| `git status` setelah commit | bersih untuk `js/` + `index.html`; `package-lock.json`/`dist` tidak ikut |

## Catatan penting: diskrepansi path (konteks vs repo)

Ringkasan konteks task menyebut `simapo-aset-pengaturan-get|set` dan `simapo-aset-ttd-get`. Repo (otoritatif) menyebut **`simapo-pengaturan-get`, `simapo-pengaturan-set`, `simapo-ttd-get`** (tanpa prefix `aset-`):
- `task-1-brief.md:9` / `task-1-report.md:32-34` — 7 webhook yang dibuat.
- `task-2-report.md:106-107` — **verifikasi live curl** ke path tersebut (200 + body).
- `n8n/SIMAPO - Aset Data.json` — `"path": "simapo-pengaturan-get"` dsb.
- `task-3-brief.md:46-48` — konstanta test smoke pakai path yang sama.

Brief Task 4 konsisten dengan semua bukti di atas → mengikuti brief/repo. Tidak ada yang di-`BLOCKED` (kontrak tidak benar-benar bertentangan; hanya satu sumber yang tidak akurat).

## Self-review vs brief

- [x] Step 1: 7 entri `P.*`, teks identik brief.
- [x] Step 2: tombol tab setelah `sa-tab-pks`, sebelum `</div>` penutup bar.
- [x] Step 3: section sebelum `<!-- [TAB] BKU -->`, semua id cocok dengan handler.
- [x] Step 4: case `pengaturan` di `switchSATab`.
- [x] Step 5: 4 fungsi (`bastGet`, `loadSAPengaturan`, `saveSAPengaturan`, `kosongkanAset`) di akhir `simapo-ext.js`, verbatim.
- [x] Step 6: `node --check` ×3 OK; `npm run build` sukses.
- [x] Step 7: commit dengan pesan persis brief (4 file — 3 dari brief + `js/simapo-bast.js` fix empty-body).
- [x] **Empty-body-200 ditangani?** Ya dua jalur: GET → `res.json()` throw → `null` (brief); POST → `body !== null` di `bastSubmit` (tambahan saya). Tanpa tambahan itu, toast sukses palsu saat gate menolak.
- [x] **Kosongkan double-confirm?** Ya: (1) input harus `HAPUS` di client, (2) payload `{confirm:'HAPUS'}` + guard server-side `Code Konfirmasi Kosongkan` (throw → 200-kosong → kini ditandai gagal).
- [x] **Instansi via apiFetch?** Ya — `apiFetch` (`js/config.js:355`) menambah `instansi_id` ke URL; `pengaturan-set`/`kosongkan` membacanya dari query; tidak ada instansi manual di handler.
- [x] Bahasa Indonesia, kelas (`sa-tab`, `glass-card`, `form-group`, `btn-sm-admin`, `btn-primary`), pola toast/`btn-inner` mengikuti section tetangga.
- [x] Tidak mengedit `n8n/`, `scripts/`, plan/spec, `www/`, template BAST; tanpa dependensi baru; tanpa komentar di luar yang dipreskripsikan brief + 1 komentar `ponytail:` pada fix.

## Concerns (non-blocking)

1. **Deviasi scope:** `js/simapo-bast.js` (1 baris + 1 komentar) di luar daftar 3 file brief — wajib agar syarat "empty-body-200 = gagal" terpenuhi untuk POST; aman untuk semua pemanggil lama (bukti di atas).
2. Context task menyebut 3 path dengan prefix `aset-` yang tidak ada di repo — dipastikan salah sumber, brief/repo yang dipakai.
3. `npm install` dijalankan karena `vite` hilang dari `node_modules` (tidak terkait perubahan task); lockfile tidak berubah.


## Fix round 5 (review Critical)

**Bug chain:** `bastSubmit` (`js/simapo-bast.js`) mengambil body via `apiFetch` (`js/config.js:407-411`) yang membungkus `res.json()` — body kosong (0 byte) menjadi truthy `{ data: [], message: 'Empty N8n Response' }`, bukan `null`. Guard lama `body !== null` tidak pernah aktif → `isApiSuccess(sentinel, true)` (`js/api.js:95-101`) jatuh ke fallback `return httpOk` = `true` → toast sukses palsu saat gate/guard menolak (200 + kosong).

**Fix (lokal di `bastSubmit`, `js/simapo-bast.js` saja):** deteksi sentinel `body.message === 'Empty N8n Response'` → `empty = true`, `body.message` dinormalkan ke `Respons kosong dari server — permintaan gagal atau ditolak` (jadi `getApiErrorMsg` tidak pernah menampilkan teks Inggris ke user), dan `ok = res.ok && body !== null && !empty && isApiSuccess(...)`. `isApiSuccess` / `apiFetch` tidak disentuh (blast radius global, di luar scope).

**Dampak call site (5 kini gagal dengan benar):** 3 lama (`js/simapo-bast.js:113,250,385` — init/assign/save) + 2 baru (`js/simapo-ext.js:1861,1878` — `saveSAPengaturan`, `kosongkanAset`). Semua tetap terima body valid; tidak ada perubahan di pemanggil.

**Validasi:**
1. `node --check js/simapo-bast.js` OK.
2. Grep `bastSubmit(P.` — 5 call site tak berubah, body valid semua.
3. Semua 14 respond node di `n8n/SIMAPO - BAST.json` + `n8n/SIMAPO - Aset Data.json` = `={{ JSON.stringify($json) }}` → non-kosong, non-sentinel → sukses normal tetap `ok = true` (tanpa panggilan jaringan).
4. Tracing: gate tolak simpan → toast error, input tidak di-clear (saveSAPengaturan tanpa onSuccess); guard tolak kosongkan → toast error, input `HAPUS` dipertahankan (`if (ok) inp.value = ''` tidak jalan); sukses normal → toast sukses.
5. Plan `docs/superpowers/plans/2026-09-30-aset-backend-pengaturan.md` tidak mengutip baris guard `bastSubmit` (hanya handler + `bastGet`) → plan tidak diubah.
6. Mojibake 0 (pola Select-String sesuai brief) di `js/simapo-bast.js` + file ini.
