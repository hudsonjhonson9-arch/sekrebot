# Desain: Tracking Sisi Developer (Kegagalan Fungsi + Klik Tombol) Terpusat

Tanggal: 2026-11-21
Status: DISETUJUI (4 bagian desain lolos review pengguna)
Pendekatan: **A** — pipeline `track()` terpisah di `dev-tools.js` + batch POST ke server

## 1. Latar & Tujuan

Developer perlu melacak **per user**:
- **Kegagalan fungsi**: error JS tak tertangani, promise reject, dan API yang gagal (status >= 400 / network error) — otomatis, tanpa menyentuh ratusan fungsi.
- **Klik tombol**: semua elemen interaktif, untuk melacak alur pengguna saat debugging.

Keputusan yang sudah dikunci lewat brainstorming:
1. **Storage**: server terpusat (PostgreSQL) + view developer terpusat — bukan localStorage.
2. **Capture failure**: otomatis — global error listener + wrapper fetch.
3. **Cakupan klik**: semua elemen interaktif (`button`, `[onclick]`, `[role=button]`, `a[href]`), label dari `aria-label`/teks/id.
4. **View**: perluas halaman dev-tools yang ada — bukan halaman baru.

Alternatif yang ditolak:
- Pendekatan B (semua lewat `DEV_TRACKER.log()` yang ada): mencampur diagnostik dengan tracking, mengubah perilaku `log()` yang sudah diuji.
- Pendekatan C (modul baru, POST per event): chatty, hilang saat tab ditutup mendadak, file + script tag baru tanpa perlu.

## 2. Arsitektur & Komponen

```
Klien (js/dev-tools.js — sudah dimuat di index.html + admin.html)
├─ track(kind, data) -> antrean memori (cap 500, buang terlama)
│   ├─ klik: 1 listener delegasi document (capture), match
│   │   button / [onclick] / [role=button] / a[href]
│   │   label = aria-label || innerText (potong 80 char) || id || nama tag
│   │   klik di dalam panel dev-tools sendiri di-skip (anti self-log)
│   ├─ error: 2 hook global yang sudah ada (uncaught + unhandledrejection)
│   │   -> enqueue kind:'error' + message + stack
│   └─ api_fail: patch window.fetch sekali saat init -> status >= 400
│       atau network error -> kind:'api_fail' {url, method, status}
│       guard loop: URL mengandung /api/dev/track dilewati; error tetap di-rethrow
├─ Identitas: TIDAK dikirim klien — server mengambil dari req.user
└─ Flush: POST /api/dev/track batch {kind, ts, page, label, detail}
    saat queue >= 20 || interval 15 dtk || pagehide/visibility hidden
    pagehide pakai fetch(..., {keepalive:true}) — sendBeacon tidak bisa
    menyematkan header Authorization (shim stitch-auth hanya membungkus fetch)
    flag _flushing cegah flush bersamaan; gagal jaringan -> event tetap
    di antrean, coba lagi

Server (Express)
├─ POST /api/dev/track   — requireRole(ABSEN_ROLES), identitas dari req.user
├─ GET  /api/dev/track/summary — requireRole(MEDIA_ROLES)
├─ GET  /api/dev/track/events  — requireRole(MEDIA_ROLES)
├─ Tabel dev_track_events (PostgreSQL)
├─ Rate limit in-memory per NIP: 60 event/menit (sliding window, Map)
│   ponytail: Map proses tunggal; pindah ke store bersama bila multi-process
└─ Retention: setInterval 24 jam, DELETE ts < now() - interval '30 days'
    (tanpa pg_cron)

Viewer (tab baru di halaman dev-tools yang ada)
├─ Ringkasan per user (filter 7/30 hari) dari GET .../summary
└─ Tabel detail: filter kind + per-user, pagination before_id,
    dari GET .../events; stack/status via tooltip/ekspansi
```

Yang tidak berubah: `DEV_TRACKER.log()` lokal, `tests/dev-tools.test.js` yang ada, semua file di luar `dev-tools.js` + satu file route server baru. Nol file JS frontend baru.

Cakupan: hanya halaman yang memuat `dev-tools.js` (index.html, admin.html). kiosk.html / desktop.html / e-slip.html tidak dilacak — cukup tambah `<script>` bila nanti perlu (YAGNI).

## 3. Skema Data & Kontrak API

```sql
CREATE TABLE dev_track_events (
  id          BIGSERIAL PRIMARY KEY,
  ts          TIMESTAMPTZ NOT NULL,        -- jam klien, diklamping server
  received_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  user_nip    TEXT NOT NULL DEFAULT '',
  user_nama   TEXT NOT NULL DEFAULT '',
  kind        TEXT NOT NULL CHECK (kind IN ('click','error','api_fail')),
  page        TEXT NOT NULL DEFAULT '',    -- pathname halaman
  label       TEXT NOT NULL DEFAULT '',    -- teks tombol / pesan error / URL API
  detail      JSONB NOT NULL DEFAULT '{}'  -- stack, method, status, href, dst
);
CREATE INDEX dev_track_events_ts_idx     ON dev_track_events (ts DESC);
CREATE INDEX dev_track_events_nip_ts_idx ON dev_track_events (user_nip, ts DESC);
CREATE INDEX dev_track_events_kind_ts_idx ON dev_track_events (kind, ts DESC);
```

| Endpoint | Gate | Kontrak |
|---|---|---|
| `POST /api/dev/track` | `requireRole(ABSEN_ROLES)` | Body `{events:[{kind, ts?, page, label, detail}]}` maks 50/request. Identitas (nip/nama) dari `req.user`, bukan body — klien tidak bisa mengklaim user lain. Entri invalid dibuang (Postel), balas `{ok, accepted, rejected}`. 401 tanpa sesi. |
| `GET /api/dev/track/summary?days=7` | `requireRole(MEDIA_ROLES)` | Ringkasan per NIP: jumlah klik/error/gagal API + waktu terakhir. User biasa menulis tapi tidak membaca data orang lain. |
| `GET /api/dev/track/events?nip=&kind=&limit=100&before_id=` | `requireRole(MEDIA_ROLES)` | Tabel detail, pagination via `before_id` (default 100, maks 500). |

Proteksi:
- `ts` klien diklamping ke `[now-7d, now+5min]` — flush offline tetap berurutan, tidak bisa menulis waktu acak.
- Rate limit: 60 event/menit per NIP (hitung event, bukan request).
- Retention: purge > 30 hari, jalan tiap 24 jam dari server.
- Shim `stitch-auth.js` yang sudah mencakup `/api/dev/*` otomatis menyematkan token sesi pada fetch klien.

## 4. Klien: Capture, Antrean, Flush

Semua di `js/dev-tools.js`:

1. **Klik**: listener delegasi `document` `capture:true`, `closest('button, [onclick], [role="button"], a[href]')`. Urutan label: `aria-label` -> `innerText.trim().slice(0,80)` -> `id` -> `el.tagName.toLowerCase()`. `detail` minimal (`href` untuk link, `id` bila ada). Klik pada elemen di dalam panel dev-tools diabaikan.
2. **Error**: hook `window.onerror` / `unhandledrejection` yang sudah ada kini juga meng-`enqueue` `kind:'error'` dengan `message` + `stack`. `DEV_TRACKER.log()` tetap berjalan seperti sebelumnya.
3. **API gagal**: patch `window.fetch` sekali; `status >= 400` atau `throw` -> enqueue lalu **rethrow** (perilaku app tidak berubah). Lewati request ke `/api/dev/track` sendiri.
4. **Antrean**: array, cap 500 (buang terlama). Flush saat `queue >= 20`, interval 15 detik, atau `pagehide`/`visibilitychange -> hidden`. Gagal jaringan -> biarkan di antrean, coba pada flush berikutnya. `_flushing` mencegah flush bersamaan.
5. **Expose minimal untuk test**: `window.__devTrack = { track, flushNow, queue }` (hanya untuk pengujian, tanpa UI).

## 5. Viewer (Halaman Dev-Tools)

1. Tab baru **"User Tracking"** di samping tabel log lokal, pola `renderDevLogTable`, gaya `dark:` mengikuti yang ada.
2. **Ringkasan per user** (filter 7/30 hari): NIP, nama, jumlah klik/error/gagal API, terakhir aktif; baris bisa diklik untuk meng-filter tabel detail.
3. **Tabel detail**: chip filter kind (`click`/`error`/`api_fail`) + filter per-user; kolom waktu-WITA / user / label / halaman; `stack` & `status` via tooltip/ekspansi; tombol "Muat lebih" (`before_id`); tombol refresh.
4. **State**: loading = teks ringan; kosong = "Belum ada data tracking"; 403 = "Fitur ini hanya untuk media/admin".

## 6. Kriteria Sukses (Verifikasi Wajib)

1. Klik tombol di index/admin -> event `click` berlabel benar muncul di viewer <= ~15 dtk atau setelah pindah halaman.
2. `throw` error / promise reject -> event `error` + stack; API >= 400 -> `api_fail` dengan url/method/status.
3. Tanpa sesi -> POST 401; role `USER` membaca summary -> 403; identitas event selalu milik pengirim.
4. Rate limit 60 event/menit/NIP teruji; purge 30 hari teruji.
5. `DEV_TRACKER.log()` lama tak tersentuh — `tests/dev-tools.test.js` tetap lulus tanpa ubahan.
6. Verifikasi standar lulus: `npm test`, `npm run lint`, `npm run build`, `graphify update .`.

Test baru:
- `server/dev-track.test.js` — pola `server/log.test.js`: validasi skema, gate (401/403), identitas dari sesi bukan body, rate limit.
- Ekstensi `tests/dev-tools.test.js` — antrean, flush, ekstraksi label, guard loop fetch.

## 7. File yang Disentuh

| File | Perubahan |
|---|---|
| `js/dev-tools.js` | pipeline `track()`, listener klik/error, patch fetch, antrean/flush, tab viewer |
| `server/dev-track.js` (baru) | router POST/GET + rate limit + retention |
| `server/index.js` | mount `/api/dev/track` + interval retention |
| `server/dev-track.test.js` (baru) | test server |
| `tests/dev-tools.test.js` | ekstensi unit klien |
| `docs/superpowers/specs/...` | dokumen ini |

Tidak disentuh: `js/stitch-*.js`, `index.html` markup (logika tetap di JS), `DEV_TRACKER.log()` semantics.

## 8. Shortcut & Batas yang Disengaja

- `shortcut:` rate limit in-memory per proses — cukup untuk express tunggal; pindah ke store bersama bila berjalan multi-process.
- `shortcut:` label klik dari teks/id saja (tanpa selector path) — cukup untuk identifikasi tombol; upgrade ke CSS path bila perlu diskriminasi elemen serupa.
- `shortcut:` retensi tetap 30 hari regardless volume — naikkan/turunkan konstanta bila tabel tumbuh cepat.
- Tracking hanya di index.html + admin.html — tambah `<script>` untuk halaman lain bila diminta.
