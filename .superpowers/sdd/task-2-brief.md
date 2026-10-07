### Task 2: Deploy ke n8n + cek gate & endpoint baca (tanpa commit)

**Files:** tidak ada perubahan repo (token via env).

**Interfaces:**
- Consumes: output Task 1, env `N8N_TOKEN` (minta ke user kalau belum ada; n8n → Settings → n8n API; kalau 401 berarti token kedaluwarsa — minta baru, lihat AGENTS.md).
- Produces: workflow `SIMAPO - Aset Data` aktif di `https://mindcloud.my.id`; 3 endpoint baca terverifikasi.

- [ ] **Step 1: Deploy**

```powershell
node scripts/build-aset-data-workflow.mjs --deploy
```
(Wajibkan env `N8N_TOKEN` dulu di sesi ini, mis. `$env:N8N_TOKEN = '<dari user>'` — nilai token jangan ditulis ke file mana pun.)
Expected: `created <id>` (atau `updated <id>`) lalu `activate: HTTP 200`.

- [ ] **Step 2: Verifikasi workflow aktif**

```powershell
$r = Invoke-RestMethod -Uri 'https://mindcloud.my.id/api/v1/workflows?limit=200' -Headers @{'X-N8N-API-KEY'=$env:N8N_TOKEN}
($r.data | Where-Object { $_.name -eq 'SIMAPO - Aset Data' }) | Select-Object id, active
```
Expected: `active = True`.

- [ ] **Step 3: Cek Gate menolak tanpa kunci**

```powershell
curl.exe -s -o NUL -w "%{http_code}" https://mindcloud.my.id/webhook/simapo-aset-summary
```
Expected: **200 + body kosong** (eksekusi tercatat error `BAST: unauthorized` di n8n — gate menolak, tidak ada query jalan; tidak ada data bocor). Workflow BAST di instance yang sama juga membalas 200 untuk gate rejection, jadi pola instance ini memang 200-kosong, bukan non-200.

- [ ] **Step 4: Cek 3 endpoint baca dengan kunci**

(Kunci = `BAST_API_KEY` yang sudah ada di `js/config.js`, nilai publik klien.)
```powershell
$K = 'ogsbIpBCCzi3yndE85JkxFmPJeECw_5u'
curl.exe -s -H "x-bast-key: $K" 'https://mindcloud.my.id/webhook/simapo-aset-summary'
curl.exe -s -H "x-bast-key: $K" 'https://mindcloud.my.id/webhook/simapo-pengaturan-get'
curl.exe -s -H "x-bast-key: $K" 'https://mindcloud.my.id/webhook/simapo-ttd-get?nip=196803241999031003'
```
Expected:
- summary → JSON `{"data":{"total_unit":<n>,"total_nilai":<angka>,"pemegang":<n>,"ruangan":<n>,"per_kategori":[...]}}` (kesetaraan: nilai endpoint = nilai DB saat verifikasi; pencatatan saat verifikasi: `total_unit` = 2, `total_nilai` = 17.000.000 — data berubah sejak plan ditulis, jangan hardcode angka absolut).
- pengaturan-get → JSON `{"data":{...}}` (objek, boleh kosong `{}`).
- ttd-get → JSON `{"data":{"signature":null}}` atau `{"data":{"signature":"data:..."}}` (tergantung NIP pernah simpan tanda tangan atau tidak).

- [ ] **Step 5: Cross-check summary against DB (read-only MCP)**

Jalankan query MCP `postgres-mcp`:
```sql
select count(*) as unit
from "SIMAPO".unit_aset ua
join "SIMAPO".barang b on b.id = ua.barangid and b.isactive = true
where b.instansi_id = 'bapperida'
```
Expected: kesetaraan — nilai endpoint = nilai DB **saat itu** (data bisa berubah sejak plan ditulis; pencatatan saat verifikasi: endpoint `total_unit` = 2 == DB 2, `total_nilai` = 17.000.000).

---
