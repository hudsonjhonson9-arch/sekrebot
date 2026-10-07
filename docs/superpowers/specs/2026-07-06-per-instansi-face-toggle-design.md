# Per-Instansi Face Recognition Toggle

## Problem

Face toggle saat ini global (`FACE_RECOGNITION_ENABLED`), tapi setiap instansi mungkin punya kebijakan berbeda. Admin login dengan NIP dari instansi A harusnya mengikuti setting instansi A, bukan setting global.

## Design

### 1. Database (`pengaturan`)

Tidak ada perubahan struktur tabel. Key baru:

| key | value | instansi_id |
|-----|-------|-------------|
| `face_recognition_enabled` | `"1"` / `"0"` | `bapperida` |
| `face_recognition_enabled` | `"1"` / `"0"` | `dinas_pendidikan` |

Default untuk instansi tanpa entry = `"0"` (OFF).

### 2. Admin UI — Visibility

- **Superadmin**: toggle tetap muncul di admin panel seperti sekarang. Saat disimpan, n8n endpoint menerima `instansi_id` dari scope aktif dan INSERT/UPDATE ke `pengaturan`.
- **Admin biasa**: toggle HIDDEN (tidak bisa melihat atau mengubah).

### 3. Login Flow (auth.js)

Sekarang (global):
```
enter NIP → fetch user → cek FACE_RECOGNITION_ENABLED global → face scan / skip
```

Nanti (per-instansi):
```
enter NIP → fetch user → dapat instansi_id → 
  apiGet(P.faceToggle + '?instansi_id=' + instansi_id) →
  if enabled === false atau error → skip face → finalizeLogin()
  if enabled === true → face scan
```

Tidak perlu global `FACE_RECOGNITION_ENABLED` lagi — keputusan dibuat setelah user data tersedia.

### 4. n8n Endpoint `face-toggle`

**GET** `/webhook/face-toggle?instansi_id=xxx`
- Query: `SELECT value FROM pengaturan WHERE key='face_recognition_enabled' AND instansi_id=xxx`
- Return: `{ enabled: true/false }`
- Jika tidak ditemukan: `{ enabled: false }`

**POST** `/webhook/face-toggle`
- Body: `{ enabled: true/false, instansi_id: "xxx" }`
- INSERT or UPDATE ke `pengaturan WHERE key='face_recognition_enabled' AND instansi_id=xxx`

### 5. Default Safety

- Instansi tanpa entry → `false` (OFF) — user tetap bisa login tanpa face
- API error/timeout → `false` (OFF) — jangan blokir login
- Hanya superadmin yang bisa mengubah; admin biasa tidak bisa

### 6. Files Changed

| File | Change |
|------|--------|
| `js/auth.js` | Ganti `FACE_RECOGNITION_ENABLED` global check dengan API call per-instansi |
| `js/face.js` | Hapus `FACE_RECOGNITION_ENABLED = true` default (gak dipakai) |
| `js/face.js` | `loadFaceToggle()` → gunakan `getScopedInstansiId()` |
| `js/face.js` | `loadFaceSettingsGlobal()` → hapus setting `FACE_RECOGNITION_ENABLED` |
| `js/admin-face.js` | `simpanFaceToggle()` → tambah `instansi_id` di payload |
| `js/admin-face.js` | Sembunyikan toggle untuk non-superadmin |
| `js/admin-face.js` | Hapus localStorage fallback untuk face toggle |
| `js/admin.js` | Sinkron dengan admin-face.js |
| `js/app.js` | Hapus safety guard localStorage untuk face toggle (gak perlu) |
| `js/constants.js` | Hapus `FACE_RECOGNITION_ENABLED` jika ada |
| `n8n/AbsensiBot V.5.1.json` | Update Security Gate face-toggle `instansi_id` |
| `scripts/migration_006_face_toggle_per_instansi.sql` | Migration SQL |

### 7. Migration SQL

```sql
-- Tidak ada perubahan struktur. Hanya contoh entry yang perlu ada:
-- INSERT INTO pengaturan (key, value, instansi_id) 
-- VALUES ('face_recognition_enabled', '0', 'bapperida')
-- ON CONFLICT (key, instansi_id) DO NOTHING;
```

### 8. Edge Cases

- **User tanpa instansi_id**: instansi_id kosong → fallback OFF → skip face
- **API face-toggle down**: error → fallback OFF → skip face, jangan blokir login
- **Superadmin ganti scope**: toggle mengikuti scope yang aktif
- **Multiple instansi, satu setting**: setiap instansi punya setting sendiri-sendiri di `pengaturan`
