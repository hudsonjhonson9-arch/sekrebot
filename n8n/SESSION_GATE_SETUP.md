# Session Gate Setup — n8n Workflows

## Sudah Saya Update di File

### ✅ `session_login_wf.json` (baru)
- POST `/webhook/session-login` → create/deactivate session
- Ganti credential Postgres (`CHANGE_ME`), import & aktifkan

### ✅ Semua Security Gate nodes
- Nerima `Authorization: Bearer <session>` — backward compat sudah DIHAPUS
- CORS headers include `Authorization`

### ✅ Semua webhook nodes
- Authentication = `None` (httpHeaderAuth dihapus)

---

## Server-Side Role Validation (Optional tapi Recommended)

Client-side `requireAdmin()` sudah jalan, tapi untuk defense-in-depth, tambah role check di n8n.

### Pattern: Tambah Postgres node setelah Security Gate

**Step 1**: Tambah Postgres node "Check Session Role" setelah Security Gate:
```sql
SELECT role FROM auth_sessions WHERE session_token = $1 AND is_active = true
```
Query params: `={{ [ $json.session_token ] }}` (dari Security Gate output)

**Step 2**: Tambah Code node "Validate Admin Role" setelah Postgres node:
```javascript
const rows = $input.first().json;
const role = (rows?.[0]?.role || '').toLowerCase();
const needsAdmin = true; // ganti sesuai endpoint
if (needsAdmin && !role.includes('admin') && !role.includes('super')) {
  $execution.respond({ statusCode: 403, body: { ok: false, message: 'Admin only' } });
  return [];
}
return $input.all();
```

**Step 3**: Connect "Validate Admin Role" → node operasi asli.

### Endpoint yang wajib ada server-side role check:
| Endpoint | Reason |
|----------|--------|
| `/webhook/user-delete` | Hapus user |
| `/webhook/user-list` | Lihat semua user |
| `/webhook/admin-add` | Tambah admin |
| `/webhook/face-register` | Reset wajah |
| `/webhook/lokasi-add` | Tambah lokasi |
| `/webhook/lokasi-del` | Hapus lokasi |

---

## Legacy Token — SUDAH DIHAPUS

`BAPPERIDA_SECURE_TOKEN_2025` sudah dihapus dari semua Security Gate nodes.
Semua request WAJIB pakai `Authorization: Bearer <session_token>`.
