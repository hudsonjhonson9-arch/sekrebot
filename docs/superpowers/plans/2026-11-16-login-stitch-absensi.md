# Integrasi Fitur Login & Registrasi Google Stitch ke absensi-STICH

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Mengintegrasikan antarmuka Login & Registrasi berstandar Google Stitch (Screen 21 *Vibrant Enterprise Mobile Attendance*) ke dalam `D:\Code\absensi-STICH`, terhubung langsung dengan backend autentikasi dan logika presensi dari `D:\Code\absensi` (`js/auth.js`).

**Architecture:** 
- Membuat halaman standalone [login.html](file:///D:/Code/absensi-STICH/login.html) berbasis hasil Google Stitch Screen 21.
- Menerapkan komponen modal `#authOverlay` di [index.html](file:///D:/Code/absensi-STICH/index.html) menggunakan desain Stitch yang sama, dengan seluruh ID elemen kompatibel 100% terhadap `js/auth.js`.
- Menyambungkan alur sesi di `bootstrapFromDatabase()`: jika belum login, tampilkan `#authOverlay`; jika sudah login, muat data pegawai via `selectUserByNip(nip)`.
- Menambahkan tombol Logout di profil pegawai dan header untuk mengembalikan pengguna ke form login.

**Tech Stack:** Vanilla JavaScript (ES6+), HTML5, Tailwind CSS, Google Material Symbols, SweetAlert2, Express/PostgreSQL backend API.

**Spec:** Desain Stitch Screen 21 `Login & Registrasi Pegawai - HADIR BAPPERIDA` ([catalog/screens/21-login-registrasi-pegawai-hadir-bapperida.html](file:///D:/Code/absensi-STICH/catalog/screens/21-login-registrasi-pegawai-hadir-bapperida.html)), [DESIGN.md](file:///D:/Code/absensi-STICH/DESIGN.md), dan logika autentikasi [absensi/js/auth.js](file:///D:/Code/absensi/js/auth.js).

## Global Constraints

- Wajib mempertahankan semua ID elemen HTML yang dikonsumsi oleh `js/auth.js`: `#authOverlay`, `#tabLogin`, `#tabRegister`, `#formLogin`, `#formRegister`, `#loginNip`, `#loginPasswordWrapper`, `#loginPassword`, `#btnLogin`, `#regNama`, `#regNip`, `#regJabatan`, `#regNomor`, `#regTelegramWrapper`, `#regTelegram`, `#regInstansi`, `#regBidang`, `#regTipe`, `#regPangkat`, `#btnRegister`.
- Selaras dengan prinsip *Vibrant Enterprise Mobile Attendance* & 20 Anti-Slop UI/UX Rules (Plus Jakarta Sans, Royal Blue `#2563EB`, kontras teks tinggi, tombol sentuh ergonomis).
- Tidak merusak backend yang sudah ada di `server/`.

## Review Focus

1. **Unauthenticated initial state:** Saat `localStorage` bersih dari token/NIP, `#authOverlay` harus langsung terbuka dan dashboard tidak boleh menampilkan data dummy atau memicu error API.
2. **Tab switcher interaction:** Klik pada tab `Masuk` dan `Daftar` harus beralih mulus tanpa page reload.
3. **Invalid credentials feedback:** Input NIP tidak valid atau password salah harus menampilkan pesan error jelas dari `SweetAlert2` / UI.
4. **Login session persistence:** Setelah login berhasil, reload halaman harus mempertahankan akun yang login tanpa memunculkan form login kembali.
5. **Logout transition:** Klik tombol Logout harus menghapus token/sesi dan membuka kembali `#authOverlay`.

---

### Task 1: Buat Halaman Standalone `login.html` Berstandar Google Stitch

**Files:**
- Create: `D:\Code\absensi-STICH\login.html`
- Source: `D:\Code\absensi-STICH\catalog\screens\21-login-registrasi-pegawai-hadir-bapperida.html`

- [ ] **Step 1: Buat template `login.html`**
  Salin rancangan Screen 21 Google Stitch ke `login.html` dengan penyesuaian:
  - Sertakan script pustaka: `sweetalert2.all.min.js`, `constants.js`, `helpers.js`, `api.js`, dan `auth.js`.
  - Pasang ID form yang sesuai dengan `auth.js`: `#tabLogin`, `#tabRegister`, `#formLogin`, `#formRegister`, `#loginNip`, `#loginPassword`, `#btnLogin`, dll.
  - Tambahkan handler redirect ke `index.html` jika login berhasil.

- [ ] **Step 2: Verifikasi file `login.html`**
  Periksa keberadaan file dan kelengkapan ID form menggunakan powershell/node.

---

### Task 2: Terapkan Modal `#authOverlay` Desain Stitch ke `index.html`

**Files:**
- Modify: `D:\Code\absensi-STICH\index.html`

- [ ] **Step 1: Pasang elemen `#authOverlay` ke dalam `index.html`**
  Letakkan komponen modal container `#authOverlay` dengan styling backdrop blur dan card container Stitch Screen 21 di bagian penutup `main` atau sebelum script penutup `body`.
  Sertakan:
  - Header identitas Sistem HADIR & status enkripsi SSL.
  - Tab switcher ergonomis: `#tabLogin` dan `#tabRegister`.
  - Form login: `#formLogin`, `#loginNip`, `#loginPasswordWrapper`, `#loginPassword`, `#btnLogin`.
  - Opsi verifikasi wajah AI & bantuan helpdesk IT.
  - Form registrasi: `#formRegister`, `#regNama`, `#regNip`, `#regJabatan`, `#regNomor`, `#regInstansi`, `#regBidang`, `#regTipe`, `#regPangkat`, `#btnRegister`.

- [ ] **Step 2: Tambahkan tombol Logout di `view-profil` dan header**
  Tambahkan tombol `Keluar dari Akun` di kartu profil pegawai untuk memicu `logoutUser()`.

---

### Task 3: Sambungkan Modul `js/auth.js` dan Siklus Sesi di `index.html`

**Files:**
- Modify: `D:\Code\absensi-STICH\index.html`
- Check: `D:\Code\absensi-STICH\js\auth.js`

- [ ] **Step 1: Muat dependensi skrip di `index.html`**
  Pastikan skrip penting termuat sebelum `auth.js`:
  ```html
  <script src="js/config.js"></script>
  <script src="js/constants.js"></script>
  <script src="js/api.js"></script>
  <script src="js/auth.js"></script>
  ```
  Definisikan helper `const $ = id => document.getElementById(id);` jika belum ada.

- [ ] **Step 2: Sesuaikan fungsi `bootstrapFromDatabase()` & `checkAuth()`**
  Perbarui logic bootstrap di `index.html`:
  - Cek apakah terdapat sesi login aktif (`getNativeToken()` atau `localStorage.getItem('stitch_active_nip')`).
  - Jika belum ada, tampilkan `$('authOverlay').style.display = 'flex'`.
  - Jika sudah ada, sembunyikan `$('authOverlay').style.display = 'none'` dan panggil `selectUserByNip(savedNip)`.
  - Implementasikan `window.logoutUser = function() { ... }` yang membersihkan token dan memunculkan kembali `#authOverlay`.

---

### Task 4: Verifikasi & Uji Alur Autentikasi

**Files:**
- Test verification: run test suite & browser inspection

- [ ] **Step 1: Uji render sintaks dan struktur DOM**
  Jalankan script verifikasi untuk memastikan tidak ada tag yang rusak atau ID duplikat di `index.html` dan `login.html`.
- [ ] **Step 2: Uji endpoint autentikasi `/api/web-login`**
  Jalankan curl/fetch test ke backend auth untuk memastikan kredensial NIP direspon dengan benar.
- [ ] **Step 3: Uji simulasi login & logout di browser/unit script**
  Verifikasi alur `Masuk -> simpan sesi -> muat user` dan `Logout -> hapus sesi -> buka authOverlay`.
