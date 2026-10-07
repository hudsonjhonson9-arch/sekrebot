# Native Migration — Phase 1

Phase 1 memindahkan core absensi dari webhook n8n ke Express/PostgreSQL.

## Native endpoints

- `/api/instansi-list`, `/api/instansi-update`, `/api/bidang-list`
- `/api/user-list`, `/api/user-add`, `/api/user-edit`, `/api/user-delete`
- `/api/admin-list`, `/api/admin-add`, `/api/admin-delete`
- `/api/jam-absen`
- `/api/jam-periode-list`, `/api/jam-periode-add`, `/api/jam-periode-delete`
- `/api/lokasi-list`, `/api/lokasi-add`, `/api/lokasi-delete`, `/api/lokasi-update`
- `/api/libur-list`, `/api/libur-add`, `/api/libur-delete`
- `/api/kontrol-absen`
- `/api/update-status`
- `/api/gps-track`
- `/api/log` (history) + `/api/log/add` + `/api/log/edit`
- `/api/absen`

## Authentication

Telegram tetap memakai `/api/auth/session` dan bearer session native.

Meja Absen/perangkat bersama dapat memakai device token `dv_...` yang diterbitkan
oleh SUPERADMIN melalui `/api/auth/devices`. Token asli hanya diberikan sekali dan
yang disimpan di database adalah SHA-256 hash.

Untuk WebView/perangkat yang tidak memakai Telegram, simpan token device pada
`localStorage` sebagai `_device_token`. `apiFetch()` akan memilih jalur native
selama token tersebut valid secara bentuk.

## Database

Tidak ada migration database baru khusus Phase 1 selain migration yang sudah ada:

- `scripts/migration_003_gps_tracking.sql`
- `scripts/migration_004_auth_sessions.sql`
- `scripts/migration_007_kontrol_absen.sql`
- `scripts/migration_009_device_sessions.sql`

Pastikan semuanya sudah diterapkan di database production.

## n8n

Workflow lama sengaja tidak dihapus dari arsip. Ia dipertahankan sebagai referensi
selama masa cut-over. Frontend Phase 1 sudah tidak menunjuk ke webhook n8n untuk
endpoint core di atas.
