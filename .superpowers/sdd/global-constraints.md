## Global Constraints

- Tanpa password, sesuai keputusan user; face-verify per-instansi tetap opsional (toggle lama).
- NIP ambigu (>1 baris `user_list`) → **409**; NIP tidak ada → **404**; tanpa NIP → **400**. Jangan pernah memilih baris sembarangan.
- Role/instansi sesi **selalu dari baris DB**, bukan body request.
- Token sesi = `crypto.randomBytes(96).toString('hex')` (192 hex huruf kecil), masa berlaku 12 jam, via `INSERT_SESSION_SQL` yang sudah ada.
- Route baru DI DALAM `createAuthSessionRouter` (sudah ter-mount tanpa `requireRole`), path absolut `/api/auth/login`.
- Test pakai helper `drive()` yang sudah ada di `server/auth-session.test.js` — JANGAN tulis test server baru dari nol.
- `www/js/*` = salinan `js/*` — setiap edit `js/` wajib di-sync ke `www/js/`.
- PowerShell TIDAK dukung heredoc `<<'PY'`.
- Jangan ubah `/api/auth/session` (Telegram) atau device token `dv_`.
- Setiap langkah berakhir dengan `npm test`/`node --test` hijau (kalaupun ada test yang memang belum relevan, catat hasil apa adanya).

