# Task 5 Report — Amandemen spec (cakupan kosongkan) + verifikasi UI

## Step 1 — Edit spec baris 97 (commit 2bb4fe2)

File: `docs/superpowers/specs/2026-09-30-aset-admin-port-design.md:97`

Baris lama (port `kosongkan_aset` app.py, "mis. unit_aset + barang") diganti dengan baris
persis dari brief (cakupan per instansi + daftar 10 tabel anak FK → `unit_aset` → `barang`,
ruangan/kategori/pegawai/pengaturan/tanda_tangan/arsip BAST tetap).

Commit: `2bb4fe2 docs(aset): amandemen cakupan kosongkan (FK child ikut terhapus)` — 1 file, +1/-1.

## Step 2 — Verifikasi UI via browser (browser-harness, skillDimuat)

Setup: `npm.cmd run dev` (vite) terdetach via `Start-Process` → `http://localhost:5173/` HTTP 200.
Login: form NIP-tunggal (tanpa password) → NIP `200206302025061002` → role `ADMIN`
(session `_sess_token`, `MY_ROLE=ADMIN`, `MY_NAME` terisi).
Navigasi: PANEL ADMIN → section `📦 Inventaris` (`switchAdminSection('simapo-admin')`).

### Check 1 — tab di group Referensi + section tampil ✅
- `sa-tab-bar` memuat 13 tab termasuk `⚙️ Pengaturan` (`#sa-tab-pengaturan`, `data-group="ref"`).
- Klik tab → `#sa-sect-pengaturan` tampil; hanya section itu yang visible (`otherSectVisible: ["sa-sect-pengaturan"]`).
- 7 field terisi kosong + `⚠️ ZONA BAHAYA` + tombol `🗑 Kosongkan` ada.
- GET `simapo-pengaturan-get` mengembalikan `{}` → sesuai DB (tabel `public.pengaturan` punya 0 baris untuk key aset saat itu).

### Check 2 — save roundtrip ✅
- Set `setSekdaAlamat` = `Jl. Uji Otomatis No. 1, Bapperida` → klik Simpan → toast **"Pengaturan disimpan"**.
- Pindah tab (Aset) lalu kembali ke Pengaturan → `setSekdaAlamat` masih berisi nilai tersebut (GET roundtrip).

### Check 3 — guard kosongkan tanpa "HAPUS" ✅
- `window.fetch` di-spy sebelum klik.
- Kosongkan diklik tanpa mengetik → toast **"Ketik HAPUS dulu di kolom konfirmasi."**
- Spy: **0 request** ke `simapo-aset-kosongkan` (total fetch 0) → server tidak dipanggil.

### Check 4 — regresi switchSATab ✅
- `#sa-tab-pks` → hanya `sa-sect-pks` visible.
- `#sa-tab-master` (🗃️ Aset) → hanya `sa-sect-master` visible.
- Ketiga group (`sa-group-aset`, `sa-group-trans`, `sa-group-ref`) tetap render sesuai aturan group.

## Step 3 — Regresi endpoint lama ✅

```powershell
curl.exe -s -H "x-bast-key: $K" 'https://mindcloud.my.id/webhook/simapo-bast-list'
→ {"data":{"pegawai":[{"id":"200206302025061002", ...}]}}
```
Workflow BAST lama tidak terdampak (gate sama, respons non-empty).

## Step 4 — Commit ✅

`2bb4fe2` (lihat Step 1).

## Kebersihan data uji

Nilai uji disimpan ulang menjadi kosong (ketik 7 field = `""` + Simpan). Kondisi `public.pengaturan`
setelah verifikasi: 7 key aset (`sekda_nama`, `sekda_nip`, `sekda_jabatan`, `sekda_alamat`,
`p1_id`, `p1_jabatan`, `p1_alamat`) bernilai `""` — fungsional sama dengan sebelumnya (belum diisi);
baris kosong tersisa karena endpoint `pengaturan-set` bersifat upsert (tidak ada endpoint delete).

## Catatan

- Row `face_recognition` muncul 3× di `public.pengaturan` — duplikasi yang sudah ada sebelum pekerjaan ini
  (bukan dari aset); tidak diubah.
- Happy path kosongkan (`HAPUS`) tidak dieksekusi, sesuai brief.
