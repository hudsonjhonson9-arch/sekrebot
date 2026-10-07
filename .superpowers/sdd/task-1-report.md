# Task 1 Report — Generator `build-aset-data-workflow.mjs` + JSON lokal

**Status:** DONE
**Commit:** `7f0dedb` — feat(aset): generator workflow SIMAPO Aset Data (7 endpoint bergate)

## What I implemented

- **`scripts/build-aset-data-workflow.mjs`** (318 lines): the generator from the brief, transcribed byte-for-byte. To guarantee faithful transcription of the 319-line code block (multi-byte chars, `String.raw`, backslash escapes), I extracted the fenced ```js block directly from `task-1-brief.md` via a throwaway helper script in the temp dir instead of retyping it. Verified with `node --check` (SYNTAX OK).
- **`n8n/SIMAPO - Aset Data.json`** (1111 lines): generated output, produced by running the generator (no `--deploy`, per task instructions — Task 2 owns deployment).

Reference assumptions pre-verified against `n8n/SIMAPO - BAST.json` (untouched):
- typeVersions present: webhook 2, code 2, postgres 2.6, respondToWebhook 1.1
- Gate node with `x-bast-key` in `jsCode` found (235 chars) → copied verbatim into all 7 Gate nodes
- `credentials.postgres` (`vYOiyrTftLtD3zzd` / Postgres account) inherited by all 9 PG nodes

## Commands run + exact output

Generator (Step 2):
```
$ node scripts/build-aset-data-workflow.mjs
OK: 41 nodes, 34 links â†’ D:\Code\absensi_refactored_v6\n8n\SIMAPO - Aset Data.json
```
(41/34 exactly as the brief predicts: 6+6+5+5+6+5+8=41, links = 41−7 = 34.)

Structural validation (Step 3, verbatim from brief):
```
$ node -e "const w=require('./n8n/SIMAPO - Aset Data.json'); ..."
webhooks 7 gates 7 pg 9
simapo-aset-massal
simapo-aset-kib
simapo-aset-summary
simapo-pengaturan-get
simapo-pengaturan-set
simapo-ttd-get
simapo-aset-kosongkan
VALID
```

Extra self-review check (temp script, not committed):
```
$ node C:\...\check-aset.cjs
wh/resp/gate/link/agg checks done; tails=7 aggs=7
ALL EXTRA CHECKS PASS
```
Checks covered: each webhook → its `Gate <path>` with `responseMode: responseNode`; correct methods (POST: massal/kib/pengaturan-set/kosongkan; GET: summary/pengaturan-get/ttd-get); all 7 gate `jsCode` byte-identical to BAST's; all 7 respond nodes use `={{ JSON.stringify($json) }}` + `Content-Type: application/json`; 34 links with no dangling targets; 7 tail nodes all respond nodes; all 7 Agg nodes wrap `data:`; all 9 PG nodes `operation: executeQuery` with `credentials.postgres`.

Commit (Step 4):
```
$ git add scripts/build-aset-data-workflow.mjs "n8n/SIMAPO - Aset Data.json"
$ git commit -m "feat(aset): generator workflow SIMAPO Aset Data (7 endpoint bergate)"
[master 7f0dedb] feat(aset): generator workflow SIMAPO Aset Data (7 endpoint bergate)
 2 files changed, 1429 insertions(+)
```

## Files changed

- `scripts/build-aset-data-workflow.mjs` (new)
- `n8n/SIMAPO - Aset Data.json` (new, generated)
- `n8n/SIMAPO - BAST.json` — **not modified** (git confirms only the 2 files in the commit)

## Self-review findings

- Completeness: all 7 endpoints present, each chain starts WH → Gate, response contract `{data: ...}` via Agg + `JSON.stringify($json)`.
- Quality: brief's validation passes (7/7/9 + VALID); deeper structural checks pass.
- Discipline: exactly 2 files committed, no extra features, no reference-file edits, no `--deploy` run.
- Testing: all validation commands from the brief ran green.

## Concerns

1. **Mojibake in the brief, carried over verbatim.** The brief file itself contains double-encoded chars (`â†’` for `→`, `â”€` for `──`) — in comments and the `console.log` arrow only. Expected output in the brief shows the same mojibake, so transcription is byte-faithful; cosmetic only, no functional impact. Can be cleaned up globally later if desired.
2. Git printed the usual Windows `LF will be replaced by CRLF` warning on add (repo has `core.autocrlf` behavior); harmless, JSON parses fine.

## Fix round 1

**Status:** DONE
**Commit:** `87a5ab3` — fix(aset): skop instansi idempotensi unit_aset, kosongkan per instansi, bersihkan mojibake (3 files: plan, generator, JSON)

4 temuan review dieksekusi, plan diubah dulu (requirements source), lalu kode dicocokkan:

1. **Idempotensi `unit_aset` kini per-instansi** — predicate `WHERE NOT EXISTS (... ua.nomorinventaris = src.nomor)` ditambah `AND ua.instansi_id = '<inst>'` (pola identik dengan predicate barang), instansi di-escape runtime via `esc(inst)` seperti SET_JS.
2. **Kosongkan per-instansi** (semua 12 baris FK, diverifikasi dari DB live: 12 FK, semua `NO ACTION`, satu-satunya cucu = `detail_pemeliharaan.riwayatid` → sudah dicakup klausul khusus):
   - `SQL_KIDS` kini fungsi `(e) => ...` — 10 CTE anak dalam SATU statement, setiap subquery `instansi_id = '${e}'` (di-resolve n8n saat eksekusi); `detail_pemeliharaan` skop `barangid OR riwayatid`; `mutasi_barang` skop `barangkeluarid OR barangmasukid`; agregat `rows_dihapus` dipertahankan.
   - `CONFIRM_JS`: guard `HAPUS` dipertahankan, lalu baca `inst` dari `$input.item.json.query` (Gate = passthrough `return $input.all()` → query utuh), escape `'`, bangun SQL → `return [{ json: { sql } }]`.
   - `PG Kosongkan Anak` → `={{ $json.sql }}` (pola `PG Aset Upsert`); `PG Kosongkan Unit`/`Barang` → `DELETE ... WHERE instansi_id = '<INST_EXPR_KOSONG>'`.
   - **Rekonsiliasi:** `$input.item.json.query` TIDAK bisa dipakai di p2/p3 — input mereka baris hasil p1 (`{rows_dihapus}`), bukan payload webhook → akan jatuh ke fallback bapperida senyap. Solusi: konstanta baru `INST_EXPR_KOSONG` merujuk `$('WH simapo-aset-kosongkan').first().json.query` (sintaks `$('...')` dalam query PG terbukti di workflow produksi repo: `tugas_lembur_wf.json`, dll). Urutan tetap anak → unit → barang (check FK NO ACTION per statement).
3. **`const INST = 'bapperida'` dihapus** — diverifikasi tidak dipakai di mana pun.
4. **Mojibake 13 baris diperbaiki** (`â†’`→`→`, `â”€`→`─`): baris 2,3,4,18,29,89,155,170,175,223,263,286,288. Plan file bersih (0 mojibake).

Teks plan ikut diamandemen bila bertabrakan: blok kode Task 1 (kini byte-equal dengan `.mjs`), snippet Zona Bahaya ("seluruh data aset **instansi ini**"), dan baris spec Task 5 (scope per-instansi). Teks smoke test Task 3 tidak bertabrakan (guard tetap diuji tanpa data dihapus) → tidak diubah.

### Validasi

```
node --check scripts/build-aset-data-workflow.mjs     → SYNTAX OK
mojibake grep (â|Ã|�) di .mjs                          → 0 hits
plan ```js block vs .mjs (byte-equal)                 → identical
node scripts/build-aset-data-workflow.mjs              → OK: 41 nodes, 34 links
structural: 41 nodes / 34 links / pg 9 / gates 7 / wh 7 / resp 7 / 7 paths / creds ok
p1: "={{ $json.sql }}"
p2/p3: DELETE ... WHERE instansi_id = '{{ $('WH simapo-aset-kosongkan').first().json.query ... }}'
git status (tracked)                                   → exactly 3 files
commit                                                 → [master 87a5ab3] 3 files changed
```

Dry-run CONFIRM_JS (sandbox `$input`, tanpa DB): guard melempar `Konfirmasi salah: ketik HAPUS`; default → `bapperida`; `dpmpt's` → `dpmpt''s`; `${i}` semua resolve; satu statement; 10 tabel anak; hanya tabel anak jadi target DELETE; setiap DELETE ber-skop instansi.

EXPLAIN (plan-only, tanpa eksekusi) terhadap SQL anak ter-scope `bapperida` di DB live → parse OK, semua kolom/table valid, filter `instansi_id = 'bapperida'` terpasang di tiap CTE.

### Concerns

1. Regenerasi mengubah semua UUID node di JSON lokal (generator tidak menstabilkan id) — berdampak lokal saja; deploy (Task 2) memetakan node by name.
2. Tidak ada DELETE yang dieksekusi kapan pun selama fix ini; MCP tetap read-only.

## Fix round 2 (alwaysOutputData)

**Status:** DONE
**Commit:** `84ddd33` — fix(aset): alwaysOutputData pada node PG agar ttd-get balas null saat TTD kosong (3 files: generator, plan, JSON)

Akar masalah: n8n Postgres node typeVersion 2.6 mengembalikan `[]` untuk SELECT 0 baris (tanpa `alwaysOutputData`), sehingga Agg + Respond node pada rantai `simapo-ttd-get` tidak pernah dieksekusi saat `responseMode: 'responseNode'` → webhook menggantung, padahal brief mensyaratkan `{"data":{"signature":null}}` untuk NIP tanpa baris `tanda_tangan`.

Perubahan (exact scope, 3 file): helper `pg()` di `scripts/build-aset-data-workflow.mjs` kini mengeset `alwaysOutputData: true` pada setiap node PG yang dibangunnya (`nodes.at(-1).alwaysOutputData = true` setelah `add(...)`); blok kode `pg` di plan Task 1 (`docs/superpowers/plans/2026-09-30-aset-backend-pengaturan.md`) diamandemen byte-equal dengan `.mjs`. Tidak ada properti node lain yang diubah; `readChain` tidak berubah; tanpa `--deploy`, tanpa DB write, tanpa N8N_TOKEN.

### Validasi

```
node --check scripts/build-aset-data-workflow.mjs     → SYNTAX OK (node v22.22.0)
node scripts/build-aset-data-workflow.mjs             → OK: 41 nodes, 34 links
JSON parse + struktur                                 → 41 nodes / 34 links / pg 9
alwaysOutputData pada node PG                         → 9/9 true (pgMissingFlag=0)
node non-PG dengan properti alwaysOutputData          → 0 (tidak ada properti node lain berubah)
blok `pg` plan vs .mjs (byte-equal)                   → identical, 1 occurrence di tiap file
git diff JSON: 9 baris +alwaysOutputData, 18 baris koma (`}`→`},`), 82 baris UUID (regen) → tidak ada perubahan lain
mojibake grep (â|Ã|�) di .mjs                         → 0 hits (plan juga 0)
git status (tracked)                                  → exactly 3 files
commit                                                → [master 84ddd33] 3 files changed
```

### Concerns

1. Regenerasi kembali mengubah semua 41 UUID node di JSON lokal (sama seperti fix round 1) — berdampak lokal saja; deploy (Task 2) memetakan node by name.
2. Fix ini menyangkut semua node PG (9), bukan hanya `simapo-ttd-get` — pola yang sama dengan `n8n/AbsensiBot V.5.1.json`; tidak ada efek samping karena `alwaysOutputData` hanya menjamin output kosong berupa `[]`/item kosong, bukan mengubah baris yang ada.
