# Native Backend Migration — Phase 4

## Scope
SIMAPO endpoints and remaining n8n-backed asset workflows are now served by Express/PostgreSQL.

## Native routes added
- /api/simapo/pinjam
- /api/simapo/pinjam-list
- /api/simapo/admin-pinjam-list
- /api/simapo/admin-pinjam-action
- /api/simapo/tiket
- /api/simapo/admin-tiket-list
- /api/simapo/admin-tiket-action
- /api/simapo/unit-by-qr
- /api/simapo/unit-list
- /api/simapo/qr-update
- /api/simapo/qr-pinjam
- /api/simapo/opname-save
- /api/simapo/standar-harga-list
- /api/simapo/standar-harga-save
- /api/simapo/pks-list
- /api/simapo/pks-save
- /api/simapo/pks-delete
- /api/simapo/bast-init
- /api/simapo/bast-list
- /api/simapo/bast-assign
- /api/simapo/bast-ruangan
- /api/simapo/bast-save
- /api/simapo/bast-history
- /api/simapo/bast-import-unit
- /api/simapo/aset-massal
- /api/simapo/aset-kib
- /api/simapo/aset-summary
- /api/simapo/pengaturan-get
- /api/simapo/pengaturan-set
- /api/simapo/ttd-get
- /api/simapo/aset-kosongkan

## Runtime policy
`apiFetch()` is now fail-closed: it accepts only `/api/*` paths and never falls back to n8n.
The Android packaged `config.js` is synchronized with the web `config.js`.

## Security
All migrated SQL uses PostgreSQL parameters. Instansi scoping comes from the authenticated Express session except SUPERADMIN explicitly selecting an instansi. The old `x-bast-key` is no longer the authorization boundary; Express role/session middleware is.

## Legacy n8n
The `n8n/` directory is retained as migration reference/archive only. It is not required by the native runtime.
