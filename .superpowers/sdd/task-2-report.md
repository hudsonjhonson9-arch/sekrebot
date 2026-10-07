# Task 2 Report — Deploy "SIMAPO - Aset Data" ke n8n + verifikasi gate/endpoint baca

**Status: DONE_WITH_CONCERNS** — semua step brief terverifikasi aktif & benar, TAPI ada 3 bug yang ditemukan & diperbaiki saat deploy, plus 2 drift ekspektasi brief vs kenyataan.

Workflow live: `id=2IokI4edPaz2WswB`, `active=true`, 41 nodes, 7 webhook terdaftar (production).

---

## 1. Perintah yang dijalankan (token di-redact)

Semua pemanggilan API deploy/list memakai token inline dalam satu invocation PowerShell:

```powershell
$env:N8N_TOKEN=<set>; node scripts/build-aset-data-workflow.mjs --deploy
$env:N8N_TOKEN=<set>; <node/Invoke-WebRequest one-liner untuk list/GET/executions>
```

Token TIDAK pernah ditulis ke file, tidak ada di report ini, tidak di-commit.

Webhook test (tanpa token): `curl.exe -s ... https://mindcloud.my.id/webhook/...`
Cross-check DB: MCP `postgres-mcp` (read-only).

---

## 2. Jalannya task (chronological, termasuk bug & perbaikan)

### Step 1: Deploy — GAGAL dulu, lalu OK

Percobaan 1:
```
POST gagal 400 {"message":"request/body/settings must NOT have additional properties"}
```
Penyebab: `settings.binaryMode` ditolak API n8n saat CREATE (jalur PUT di script sudah punya fallback, jalur POST belum — lihat pola sama di `scripts/n8n-patch-qr.mjs:68`).

**Fix 1:** tambah fallback settings di jalur POST `scripts/build-aset-data-workflow.mjs` (retry `{executionOrder:'v1'}` lalu `{}`).

Percobaan 2:
```
created 2IokI4edPaz2WswB
activate: HTTP 200
```
(deploys ulang setelah fix fix: `updated 2IokI4edPaz2WswB` + `activate: HTTP 200`)

### Step 2: Verifikasi aktif — OK

`GET /api/v1/workflows?limit=200` (via node fetch):
```
matches=1
id=2IokI4edPaz2WswB active=true
```
Catatan: perintah persis brief pakai `Invoke-RestMethod`/`ConvertFrom-Json` gagal di PowerShell 5.1 (response di-parse sebagai string; `ConvertFrom-Json` juga error `DuplicateKeysInJsonString` karena workflow lain punya key connection beda kapitalisasi). Verifikasi dilakukan via `node -e fetch(...)` terhadap endpoint yang sama — hasil identik dengan ekspektasi (`active=True`).

### Step 3/4 awal: semua webhook 404 — BUG BESAR, diperbaiki

Setelah activate 200, production webhook masih 404:
```
{"code":404,"message":"The requested webhook \"GET simapo-aset-summary\" is not registered.", ...}
```
Bukan masalah instance: webhook workflow lain (`simapo-katalog`, `simapo-unit-list`, `simapo-mutasi-list`) balas 200.

Reproduksi terisolasi: workflow probe minimal (satu WH + satu Res) dibuat via API + activate → juga 404. Workflow BAST (yang jalan) punya `webhookId` di **level node**; JSON hasil generator punya `webhookId` di dalam `parameters`.

**Fix 2:** generator menaruh `webhookId` di level node (bukan di parameters), lalu PUT + deactivate/activate ulang. Workflow probe → `HTTP 200`. Workflow SIMAPO - Aset Data → webhooks terdaftar.

### Step 4: gate & 3 endpoint — BUG Agg, diperbaiki

Temuan pertama: summary balas `total_unit:0` padahal PG node benar (`"2"`). Eksekusi node menunjukkan:

```
PG simapo-aset-summary :: {"total_unit":"2","total_nilai":"17000000", ...}
Agg simapo-aset-summary :: {"data":{"total_unit":0,...}}   ← nilai hilang di Agg
```

Penyebab: semua kode Agg memakai `$input.all()[0]` — elemen pertama adalah ITEM `{json:...}`, bukan json, jadi `j.total_unit` selalu `undefined`. Bug ini bikin:
- summary selalu 0,
- pengaturan-get selalu `{}` meski ada data (selamanya),
- ttd-get selalu `null` meski sudah ada tanda tangan.

**Fix 3:** semua Agg (`AGG_UPSERT`, `AGG_SUMMARY`, `AGG_PENG_GET`, `AGG_TTD`) dibaca dari `($input.all()[0] || {}).json`. Node code lain (`$input.item.json.*`) sudah benar. Deploy ulang + toggle.

---

## 3. Output verifikasi FINAL (setelah 3 fix)

### Step 2 — workflow aktif
```
active=true, nodes=41   (GET /api/v1/workflows/2IokI4edPaz2WswB)
```

### Step 3 — Gate menolak TANPA kunci
```
curl.exe -s -w '|%{http_code}' https://mindcloud.my.id/webhook/simapo-aset-summary
→ |200        (body KOSONG, 0 bytes)
```
Eksekusi tercatat `344924 status=error` dengan:
```
"BAST: unauthorized [line 3]" (Error: BAST: unauthorized, dari Gate/GATE_JS)
```
→ Gate MENOLAK (tidak ada data yang bocor, tidak ada query jalan), TAPI HTTP status = **200 + body kosong**, bukan non-200/500 seperti ekspektasi brief. Lihat drift #1 di bawah.

### Step 4 — 3 endpoint baca dengan kunci (`x-bast-key`)

| Endpoint | HTTP | Body |
|---|---|---|
| `simapo-aset-summary` | 200 | `{"data":{"total_unit":2,"total_nilai":17000000,"pemegang":0,"ruangan":0,"per_kategori":[{"kategori":"Komputer & Laptop","jumlah":1},{"kategori":"Peralatan Audio Visual","jumlah":1}]}}` |
| `simapo-pengaturan-get` | 200 | `{"data":{}}` |
| `simapo-ttd-get?nip=196803241999031003` | 200 | `{"data":{"signature":null}}` |

Semua sesuai bentuk skema brief.

### Step 5 — Cross-check vs DB (MCP read-only)

```sql
select count(*) as unit from "SIMAPO".unit_aset ua
join "SIMAPO".barang b on b.id = ua.barangid and b.isactive = true
where b.instansi_id = 'bapperida'
```
→ **DB: `unit = 2`**; endpoint summary: **`total_unit = 2`** → **COCOK**.
Nilai: 12.500.000 (Laptop Asus) + 4.500.000 (Proyektor) = **17.000.000** = `total_nilai` ✓.

Pendukung: `public.pengaturan` (key sekda_*/p1_*, instansi bapperida) = 0 baris → `{}` benar; `public.tanda_tangan` nip 196803241999031003 = 0 baris → `null` benar.

---

## 4. Drift vs brief (dilaporkan apa adanya)

1. **Gate tanpa kunci: brief harap `bukan 200` (biasanya 500); kenyataan `200` + body kosong.**
   Ini BUKkan spesifik workflow kita: endpoint BAST ber-gate milik workflow lama (`simapo-bast-save` tanpa kunci) di instance yang sama JUGA balas `HTTP 200` (eksekusi tercatat `error`, gate aktif menolak). Jadi perilaku instance = 200-kosong untuk gate rejection; brief/`bastSubmit` pattern (non-200) tidak berlaku di instance live ini. Gate tetap bekerja: eksekusi error, tanpa data, tanpa query jalan.
2. **`total_unit` brief ≥ 16; kenyataan DB = 2 (dan endpoint = 2, cocok).** Angka 16 sudah basi (data di DB kini 2 unit aktif bapperida). Cross-check ke DB tetap PASS.
3. Deploy sempat gagal 2× karena bug di sisi kita (settings `binaryMode` ditolak + `webhookId` salah tempat) — sudah diperbaiki di generator; bukan masalah token (401 tidak pernah terjadi).

## 5. Perubahan file (TIDAK di-commit — brief tanpa commit)

Working tree berubah dari keadaan bersih (untuk file ini) karena fix wajib agar deploy/verifikasi lolos:

- `scripts/build-aset-data-workflow.mjs` — (a) fallback settings saat POST create, (b) `webhookId` di level node, (c) baca `.json` pada 4 kode Agg.
- `n8n/SIMAPO - Aset Data.json` — regenerated dari generator (ikut fix di atas).

Tidak ada commit (brief: "tanpa commit"). Workflow probe sementara `ZZ tmp probe (hapus)` sudah di-DELETE dari n8n (HTTP 200).

## 6. Self-review expected output brief

| Step | Expected brief | Actual | Status |
|---|---|---|---|
| 1 Deploy | `created <id>` + `activate: HTTP 200` | `created 2IokI4edPaz2WswB` + `activate: HTTP 200` (setelah 2 fix) | ✓ (drift: 2 kegagalan awal) |
| 2 Aktif | `active = True` | `active=true` | ✓ |
| 3 Gate tanpa kunci | kode ≠ 200 | **200 + body kosong** (gate tetap tolak, eksekusi error) | ✗ drift |
| 4 summary | `total_unit ≥ 16`, bentuk JSON | `total_unit=2`, bentuk ✓ | bentuk ✓, angka drift (DB memang 2) |
| 4 pengaturan-get | `{"data":{...}}` boleh `{}` | `{"data":{}}` 200 | ✓ |
| 4 ttd-get | signature null/data | `{"data":{"signature":null}}` 200 | ✓ |
| 5 Cross-check | endpoint == DB | 2 == 2 | ✓ |

---

## Fix round 3 (temuan deploy Task 2)

Sinkronisasi plan ↔ generator setelah 3 bug deploy. Commit: `85ca2b4 fix(aset): webhookId level-node, akses .json Agg, fallback settings — sinkron plan` (persis 3 file: plan .md, .mjs, JSON).

**3 fix (sudah ada di working tree, kini ter-commit):**
1. `wh()` — `webhookId` dipindah dari `parameters` ke level node (+ komentar: tanpa ini n8n tidak mendaftarkan production webhook saat activate).
2. 4 konstanta Agg (`AGG_UPSERT`, `AGG_SUMMARY`, `AGG_PENG_GET`, `AGG_TTD`) — baca `($input.all()[0] || {}).json` (item, bukan json) + komentar `// Semua Agg: $input.all()[0] = ITEM ({json:...}), bukan json — wajib \`.json\``.
3. `deploy()` — fallback loop saat POST-create settings (API n8n menolak `binaryMode`), pola sama dengan jalur PUT.

**Bagian plan yang diamandemen (`docs/superpowers/plans/2026-09-30-aset-backend-pengaturan.md`):**
- Task 1 Step 1 (blok kode generator): blok `wh`, 4 konstanta Agg (+komentar), blok fallback POST `deploy()` — disalin eksak dari .mjs.
- Task 2 Step 3: gate tanpa kunci → ekspektasi **200 + body kosong** (eksekusi error `BAST: unauthorized` di n8n; workflow BAST di instance yang sama juga 200), bukan "non-200".
- Task 2 Step 4: ekspektasi summary `total_unit 16` → kesetaraan endpoint == DB saat verifikasi (pencatatan: 2 unit, total_nilai 17.000.000).
- Task 2 Step 5: cross-check → kesetaraan nilai saat itu (bukan angka absolut).

**Validasi (setelah regenerate `node scripts/build-aset-data-workflow.mjs`, tanpa `--deploy`/token):**
- `node --check scripts/build-aset-data-workflow.mjs` → OK.
- JSON: 41 nodes / 34 links; 7 webhook semua punya `webhookId` level node (0 di `parameters`); 9 node PG semuanya `alwaysOutputData`; 7 node Agg semua baca `.json` → `JSON VALID`.
- Mojibake: `Select-String -Pattern 'â|Ã|�'` → 0 hits di .mjs dan seluruh plan.
- Plan ≡ .mjs: blok kode Task 1 diekstrak & dibandingkan byte-per-byte → **PASS (359 baris, identik)**.
