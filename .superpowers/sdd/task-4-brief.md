### Task 4: Verifikasi end-to-end di Chrome (produksi)

**Files:**
- Tidak ada edit — verifikasi saja via browser-harness di `https://absensi.mindcloud.my.id/`.

**Interfaces:**
- Konsumsi: hasil Task 1-3 yang sudah di-push/di-redeploy (atau lokal kalau sudah cukup).

- [ ] **Step 1: Pastikan perubahan sudah di-push & redeploy**

Run: `git log --oneline -3` dan `git status`
Expected: bersih, 3 commit terakhir (design, server, frontend) ada. Kalau push/redploy belum dilakukan, minta instruksi push ke `sekrebot` (live) + `origin` (test) dan redeploy via Coolify dulu, lalu lanjut.

- [ ] **Step 2: Buka login di Chrome (browser-harness)**

Aksi (via browser-harness): buka `https://absensi.mindcloud.my.id/`, pastikan `#authOverlay` tampil, isi `#loginNip` = `200206302025061002`, klik `#btnLogin`.

Expected: tidak ada alert error; halaman reload; `#authOverlay` hilang; tidak ada pesan "Sesi native tidak tersedia".

- [ ] **Step 3: Cek data ter-load**

Aksi: setelah reload, tunggu render, ambil snapshot/screenshot.

Expected: dashboard memuat data (bagian "LOG ABSEN HARI INI" terisi atau ada baris data), TIDAK muncul "Gagal memuat. Pastikan n8n aktif.".

- [ ] **Step 4: Cek token di Network**

Aksi: periksa request `/api/*` via browser-harness (daftar request).

Expected: header `Authorization: Bearer <192-hex>` (bukan `Bearer usr_...`), dan status 200.

- [ ] **Step 5: Cek jalur error**

Aksi: logout (atau buka tab privat), login dengan NIP `000000`.

Expected: alert "NIP tidak terdaftar." (404), tidak ada sesi yang terbit (cek `localStorage._native_token` tetap kosong).

- [ ] **Step 6: Verifikasi selesai — laporkan hasil**

Kumpulkan: status 4 langkah di atas. Kalau ada yang gagal, catat pesan error + Network status persis, lalu berhenti dan laporkan ke user (jangan lanjut Task 5 sebelum login terbukti jalan).

---

### Task 5: Push ke dua remote + redeploy
