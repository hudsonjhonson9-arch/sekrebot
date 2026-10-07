### Task 5: Amandemen spec (cakupan kosongkan) + verifikasi UI

**Files:**
- Modify: `docs/superpowers/specs/2026-09-30-aset-admin-port-design.md:97`

**Interfaces:**
- Consumes: hasil Task 4, endpoint Task 2.
- Produces: spec konsisten dengan implementasi; bukti UI jalan.

- [ ] **Step 1: Edit spec baris 97**

Ganti seluruh isi baris 97 (mulai `| \`simapo-aset-kosongkan\` ...`) menjadi:

```markdown
| `simapo-aset-kosongkan` | destructive; wajib konfirmasi "HAPUS" di client **dan** guard server-side; cakupan hapus (per instansi — `instansi_id` dari query, default `bapperida`; baris instansi lain tidak tersentuh): semua tabel domain aset yang jadi FK-referen `barang`/`unit_aset` (riwayat transaksi ikut terhapus — dipaksa FK Postgres: `riwayat_pemeliharaan`, `detail_distribusi_aset`, `jadwal_maintenance`, `peminjaman`, `detail_opname`, `detail_request`, `detail_pemeliharaan`, `mutasi_barang`, `detail_penerimaan`, `pemeliharaan`, lalu `unit_aset`, `barang`), sedangkan ruangan/kategori/pegawai/pengaturan/tanda_tangan/arsip BAST tetap |
```

- [ ] **Step 2: Verifikasi UI via browser**

Jalankan dev server: `npm run dev` (vite), lalu dengan skill `browser-harness` buka URL dev → login (kredensial dari user; kalau tidak tersedia, minta user verifikasi manual) → Admin SIMAPO → group **📐 Referensi** → tab **⚙️ Pengaturan**. Cek:
1. Tab tampil di group Referensi dan section form tampil saat diklik (data termuat / placeholder defaults terlihat).
2. Ubah satu field (mis. Alamat Pihak Pertama) → **Simpan** → toast sukses → reload tab → nilai tersimpan (GET roundtrip).
3. Zona Bahaya: klik **🗑 Kosongkan** tanpa mengetik → toast error, server TIDAK dipanggil (guard client).
4. Kembali ke tab 📐 PKS dan group 📦 Kelola Aset → semuanya masih tampil normal (regresi `switchSATab`).

- [ ] **Step 3: Verifikasi regresi singkat endpoint lama**

```powershell
$K = 'ogsbIpBCCzi3yndE85JkxFmPJeECw_5u'
curl.exe -s -H "x-bast-key: $K" 'https://mindcloud.my.id/webhook/simapo-bast-list'
```
Expected: JSON `{"data":[...]}` (workflow BAST lama tidak terdampak; gate memakai kode yang sama).

- [ ] **Step 4: Commit**

```powershell
git add docs/superpowers/specs/2026-09-30-aset-admin-port-design.md
git commit -m "docs(aset): amandemen cakupan kosongkan (FK child ikut terhapus)"
```
Expected: commit sukses.

---

## Self-Review (sudah dijalankan)

- **Spec coverage (Plan 1):** endpoint 7/7 (spec §tabel endpoint) ✓; tab Pengaturan group Referensi + ketik "HAPUS" client & server ✓; pengaturan keys `sekda_*`+`p1_*` ✓; kosongkan uji guard saja ✓ (spec baris 107); amandemen cakupan kosongkan di Task 5 ✓; import massal/KIB/summary-ringkasan/UI taste = Plan 2-3 (di luar plan ini, sesuai split "pisah saja").
- **Placeholder scan:** tidak ada TBD/TODO; semua langkah berisi kode/perintah lengkap + expected output.
- **Type consistency:** `bastGet → object|null` dipakai konsisten; `bastSubmit → boolean`; `P.simapoAset*`/`simapoPengaturan*`/`simapoTtdGet`/`simapoAsetKosongkan` sama persis antara config.js, smoke test (path literal identik dengan entri `isTest=false`), dan handler JS; id HTML `setSekda*`/`setP1*`/`kosongkanKonfirmasi` sama antara Step 3 dan Step 5.

**Catatan eksekusi:**
- `n8n/export/` dan `n8n/simapo/` adalah salinan sinkron — jangan diedit; sinkron berikutnya lewat `node scripts/n8n-pull.mjs` (butuh `N8N_TOKEN`), opsional setelah semua plan selesai.
- Kalau `GET /api/v1/workflows` balas 401 → token kedaluwarsa, minta token baru ke user (AGENTS.md).
