# AGENTS.md

## Database

Project ini (absensi_refactored_v6) pakai PostgreSQL lewat MCP `postgres-mcp`:
`n8n_storage` (user `n8n_admin`, host `mindcloud.my.id`) — schema `public` (tabel absensi/bapperida) + schema `SIMAPO`.
Bukan Supabase. n8n workflow di server yang sama (`https://mindcloud.my.id`, API key via `N8N_TOKEN`).

## n8n API

- Token publik (`X-N8N-API-KEY`) **punya masa berlaku** dan bisa kedaluwarsa di tengah sesi → kalau `GET /api/v1/workflows` balik 401, minta token baru (n8n → Settings → n8n API). Webhook `/webhook/*` tidak butuh token.
- MCP `postgres-mcp` **read-only** (`CREATE`/`INSERT` ditolak). Untuk tulis data: lewat webhook aplikasi (mis. `simapo-admin-master-save` — SQL-nya juga bikin baris `unit_aset`), bukan lewat SQL langsung.
- `scripts/n8n-pull.mjs` — tarik semua workflow ke `n8n/export/` (butuh `N8N_TOKEN`).
- `scripts/n8n-patch-qr.mjs --files` — patch salinan JSON lokal; tanpa `--files` patch workflow live (butuh `N8N_TOKEN`).

