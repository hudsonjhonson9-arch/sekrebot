# Arsip SSO — Langkah Lanjutan (Telegram WebApp)

## Status
- `.env`: `ARSIP_SESSION_SECRET=ARSIPDIGITALBAPPERIDA2026` (dipertahankan)
- `.env.example`: tambah `ARSIP_SESSION_SECRET` dan `PETA_API_URL=https://arsipdigital.mindcloud.my.id`
- Login Telegram sudah menerbitkan cookie `arsip_session`

## Akar Masalah Produksi
`ARSIP_SESSION_SECRET` (absensi) === `SESSION_SECRET` (peta-ekonomi) wajib sama persis.

## Tindakan Coolify
- Peta-ekonomi: set `SESSION_SECRET = ARSIPDIGITALBAPPERIDA2026` → redeploy (opsional)
- Absensi: pastikan `ARSIP_SESSION_SECRET = ARSIPDIGITALBAPPERIDA2026` → redeploy

## Verifikasi
1. Telegram WebApp → login admin → buka menu Arsip → iframe masuk langsung (tanpa login arsip)
2. DevTools → Application → Cookies → `.mindcloud.my.id` ada `arsip_session` (HttpOnly, Secure, SameSite=Lax)
3. Console tidak berulang 401 ke `arsipdigital.mindcloud.my.id/api/*`

## Catatan
- Fail-open: jika secret < 16 atau kosong → cookie tidak diterbitkan (iframe tampil login arsip sendiri)
- Cookie domain `.mindcloud.my.id` agar dikirim ke iframe subdomain
