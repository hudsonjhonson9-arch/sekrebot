# SIMAPO Aset Data Backend + Tab Pengaturan (Plan 1 dari 3) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Membangun workflow n8n `SIMAPO - Aset Data` (7 endpoint bergate `x-bast-key`) + tab "⚙️ Pengaturan" (data P1 Sekda/Kepala + Kosongkan Aset) di panel admin SIMAPO.

**Architecture:** Satu workflow n8n baru berisi 7 rantai webhook→Gate→(Code/PG)→Agg→Respond, dibangkitkan oleh script generator lokal (`scripts/build-aset-data-workflow.mjs`) yang menyalin `typeVersion`/`credentials` dari `n8n/SIMAPO - BAST.json` yang sudah terbukti jalan. Frontend memanggil endpoint via pola `apiFetch` + `bastSubmit` yang sudah ada. Deploy lewat n8n Public API (`--deploy`, token via env `N8N_TOKEN`).

**Tech Stack:** n8n (self-hosted `https://mindcloud.my.id`), Postgres (`n8n_storage`, schema `SIMAPO` + `public`), vanilla JS (config.js/simapo-ext.js), Node ≥18 (fetch global) untuk generator & smoke test.

## Global Constraints

- Output dokumen BAST **identik** dengan `D:\Code\aset-bapperida\docx_template\` — plan ini tidak menyentuh template/logika render BAST sama sekali.
- DB ditulis **hanya lewat webhook n8n**; MCP `postgres-mcp` read-only (dipakai untuk verifikasi baca saja).
- Semua endpoint baru wajib lewat Gate `x-bast-key` (nilai sama dengan `BAST_API_KEY` di `js/config.js` — sudah publik di klien, bukan rahasia).
- `N8N_TOKEN` (API key n8n) **tidak boleh masuk git / tidak boleh di-echo ke file** — hanya via env var.
- Tabel `pengaturan` punya unique index `(key, instansi_id)` → `ON CONFLICT (key, instansi_id)` legal. Tabel `barang`/`unit_aset` **tidak punya unique selain PK** → idempotensi wajib `WHERE NOT EXISTS` (atau `ON CONFLICT` berbasis PK deterministik `md5(instansi:kode)`).
- `unit_aset` kolom yang dipakai wajib ada persis: `id, barangid, nomorinventaris, kondisi, statuspinjam, qrcode, merk_type, model_jenis, warna, tahun_pembuatan (text), roda, keterangan, instansi_id, updatedat` (`createdat` punya DEFAULT, tidak perlu diisi — terbukti dari `PG UPSERT Barang` workflow Katalog yang jalan produksi).
- `unit_aset`/`barang` punya 11 FK child (lihat Task 4) → kosongkan harus menghapus child dahulu; semua child saat ini **0 baris**.
- Bahasa UI Indonesia, gaya penamaan & class (`card glass-card`, `form-input`, `btn-primary`, `btn-sm-admin`) mengikuti section yang ada.
- Batas token UI: `sa-tab`/`sa-sect` id + `data-group` mengikuti mekanisme `switchSATab`/`switchSAGroup` yang ada (jangan ubah mekanismenya).

## File Structure

- Create: `scripts/build-aset-data-workflow.mjs` — generator + deployer workflow (satu file, dua mode).
- Create: `n8n/SIMAPO - Aset Data.json` — output generator (di-commit, di-regenerate setiap generator berubah).
- Create: `scripts/test-aset-data.mjs` — smoke test endpoint (roundtrip pengaturan, idempotensi massal + cleanup, guard kosongkan).
- Modify: `js/config.js:277-278` — 7 entri `P.*` baru sebelum `};`.
- Modify: `index.html:1557` — tombol tab `sa-tab-pengaturan` (group `ref`); `index.html:1850` — section `sa-sect-pengaturan`.
- Modify: `js/simapo-ext.js:150` — case `pengaturan` di `switchSATab`; akhir file — `bastGet`/`loadSAPengaturan`/`saveSAPengaturan`/`kosongkanAset`.
- Modify: `docs/superpowers/specs/2026-09-30-aset-admin-port-design.md:97` — amandemen cakupan kosongkan (FK child ikut terhapus).

---

### Task 1: Generator `build-aset-data-workflow.mjs` + JSON lokal

**Files:**
- Create: `scripts/build-aset-data-workflow.mjs`
- Create: `n8n/SIMAPO - Aset Data.json` (generated)

**Interfaces:**
- Consumes: `n8n/SIMAPO - BAST.json` (referensi `typeVersion` webhook/code/postgres/respond + `credentials.postgres`), env `N8N_TOKEN` (hanya untuk `--deploy`, Task 2).
- Produces: file JSON workflow dengan tepat 7 webhook: `simapo-aset-massal` (POST), `simapo-aset-kib` (POST), `simapo-aset-summary` (GET), `simapo-pengaturan-get` (GET), `simapo-pengaturan-set` (POST), `simapo-ttd-get` (GET), `simapo-aset-kosongkan` (POST) — masing-masing diawali node `Gate <path>` yang menyalin verbatim `jsCode` gate dari BAST. Kontrak respons: semua membalas `{data: ...}`.

- [ ] **Step 1: Tulis generator (kode lengkap)**

Buat `scripts/build-aset-data-workflow.mjs`:

```js
#!/usr/bin/env node
/* Generator workflow "SIMAPO - Aset Data" → n8n/SIMAPO - Aset Data.json
   node scripts/build-aset-data-workflow.mjs            → tulis JSON lokal
   node scripts/build-aset-data-workflow.mjs --deploy   → tulis + create/update + activate (butuh N8N_TOKEN)
*/
import { randomUUID } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(ROOT, 'n8n', 'SIMAPO - Aset Data.json');
const NAME = 'SIMAPO - Aset Data';
const BASE = 'https://mindcloud.my.id';
const PG_KEYS = ['sekda_nama', 'sekda_nip', 'sekda_jabatan', 'sekda_alamat', 'p1_id', 'p1_jabatan', 'p1_alamat'];

// ── referensi dari workflow BAST yang sudah terbukti jalan ──────────────
const BAST = JSON.parse(readFileSync(join(ROOT, 'n8n', 'SIMAPO - BAST.json'), 'utf8'));
const refOf = (type) => BAST.nodes.find(n => n.type === type);
const refWh = refOf('n8n-nodes-base.webhook');
const refCode = refOf('n8n-nodes-base.code');
const refPg = refOf('n8n-nodes-base.postgres');
const refRes = refOf('n8n-nodes-base.respondToWebhook');
const GATE_JS = BAST.nodes
  .find(n => n.type === 'n8n-nodes-base.code' && n.parameters.jsCode.includes('x-bast-key'))
  .parameters.jsCode;

// ── builder ─────────────────────────────────────────────────────────────
const nodes = [];
const connections = {};
let cx = 0, cy = 0;

function add(name, type, parameters, extra = {}) {
  const node = { parameters, id: randomUUID(), name, type, typeVersion: extra.typeVersion, position: [120 + cx, cy] };
  if (extra.creds) node.credentials = extra.creds;
  nodes.push(node);
  cx += 230;
  return name;
}
function link(from, to) { connections[from] = { main: [[{ node: to, type: 'main', index: 0 }]] }; }
function newChain() { cx = 0; }
function endChain() { cy += 240; }

const wh = (p, method) => add(`WH ${p}`, 'n8n-nodes-base.webhook', {
  path: p,
  ...(method ? { httpMethod: method } : {}),
  responseMode: 'responseNode',
  options: { allowedOrigins: '*' },
  webhookId: p,
}, { typeVersion: refWh.typeVersion });

const gate = (p) => add(`Gate ${p}`, 'n8n-nodes-base.code', { jsCode: GATE_JS }, { typeVersion: refCode.typeVersion });
const code = (n, jsCode) => add(n, 'n8n-nodes-base.code', { jsCode }, { typeVersion: refCode.typeVersion });
const pg = (n, query) => {
  add(n, 'n8n-nodes-base.postgres',
    { operation: 'executeQuery', query, options: {} },
    { typeVersion: refPg.typeVersion, creds: refPg.credentials });
  nodes.at(-1).alwaysOutputData = true;
  return n;
};
const res = (n) => add(n, 'n8n-nodes-base.respondToWebhook', {
  respondWith: 'text',
  responseBody: '={{ JSON.stringify($json) }}',
  options: { responseHeaders: { entries: [{ name: 'Content-Type', value: 'application/json' }] } },
}, { typeVersion: refRes.typeVersion });

// instansi dari query (apiFetch selalu menyisipkan instansi_id), fallback bapperida
const INST_EXPR = "{{ (($input.item.json.query || {}).instansi_id || \"bapperida\").toString().replace(/'/g, \"''\") }}";

// instansi untuk node PG kosongkan setelah PG Kosongkan Anak — input node itu sudah
// baris hasil query (bukan payload webhook), jadi rujuk node WH-nya secara eksplisit
const INST_EXPR_KOSONG = "{{ (($('WH simapo-aset-kosongkan').first().json.query || {}).instansi_id || \"bapperida\").toString().replace(/'/g, \"''\") }}";

const AGG_OK = `return [{ json: { data: { ok: true } } }];`;

const AGG_UPSERT = `const j = $input.all()[0] || {};
return [{ json: { data: {
  total: Number(j.total || 0),
  barang_baru: Number(j.barang_baru || 0),
  unit_baru: Number(j.unit_baru || 0),
  barang_ids: j.barang_ids || []
} } }];`;

const AGG_SUMMARY = `const j = $input.all()[0] || {};
return [{ json: { data: {
  total_unit: Number(j.total_unit || 0),
  total_nilai: Number(j.total_nilai || 0),
  pemegang: Number(j.pemegang || 0),
  ruangan: Number(j.ruangan || 0),
  per_kategori: j.per_kategori || []
} } }];`;

const AGG_PENG_GET = `return [{ json: { data: ($input.all()[0] || {}).data || {} } }];`;
const AGG_TTD = `return [{ json: { data: { signature: ($input.all()[0] || {}).signature || null } } }];`;

// ── Code: upsert massal/KIB (idempoten, tanpa unique constraint) ────────
const UPSERT_JS = String.raw`const b = $input.item.json.body || {};
const rows = Array.isArray(b.rows) ? b.rows : [];
if (!rows.length) throw new Error('rows kosong');
const esc = s => String(s == null ? '' : s).replace(/'/g, "''");
const q = $input.item.json.query || {};
const inst = String(b.instansi_id || q.instansi_id || 'bapperida');
const seq = new Map();
const vals = [];
for (const r of rows) {
  const kode = String(r.kodebarang || '').trim();
  const nama = String(r.nama || '').trim();
  if (!kode || !nama) continue;
  const n = (seq.get(kode) || 0) + 1;
  seq.set(kode, n);
  const nomor = r.nomorinventaris ? String(r.nomorinventaris) : kode + '-' + String(n).padStart(3, '0');
  vals.push(
    "('" + esc(kode) + "','" + esc(nama) + "'," + Math.max(0, Number(r.hargasatuan) || 0) +
    ',' + (r.kategoriid ? "'" + esc(r.kategoriid) + "'" : 'NULL') +
    ",'" + esc(r.kondisi || 'Baik') + "'" +
    ",NULLIF('" + esc(r.merk_type || '') + "','')" +
    ",NULLIF('" + esc(r.model_jenis || '') + "','')" +
    ",NULLIF('" + esc(r.warna || '') + "','')" +
    ",NULLIF('" + esc(r.tahun_pembuatan || '') + "','')" +
    ",NULLIF('" + esc(r.roda || '') + "','')" +
    ",NULLIF('" + esc(r.keterangan || '') + "','')" +
    ",'" + esc(nomor) + "')"
  );
}
if (!vals.length) throw new Error('tidak ada baris valid (kodebarang & nama wajib)');
const L = [];
L.push('WITH src AS (');
L.push('  SELECT * FROM (VALUES');
L.push('    ' + vals.join(',\n    '));
L.push('  ) AS v(kode, nama, harga, kategoriid, kondisi, merk, model, warna, tahun, roda, keterangan, nomor)');
L.push('),');
L.push('ins_barang AS (');
L.push('  INSERT INTO "SIMAPO".barang (id, kodebarang, nama, jenisbarang, satuan, stok_saat_ini, minimumstok, hargasatuan, kategoriid, isactive, createdat, updatedat, instansi_id)');
L.push("  SELECT DISTINCT ON (src.kode) md5('" + esc(inst) + ":' || src.kode), src.kode, src.nama, 'Aset Tetap', 'unit', 1, 0, src.harga, src.kategoriid, true, NOW(), NOW(), '" + esc(inst) + "'");
L.push('  FROM src');
L.push("  WHERE NOT EXISTS (SELECT 1 FROM \"SIMAPO\".barang b WHERE b.kodebarang = src.kode AND b.instansi_id = '" + esc(inst) + "')");
L.push('  RETURNING id, kodebarang');
L.push('),');
L.push('all_barang AS (');
L.push('  SELECT id, kodebarang FROM ins_barang');
L.push('  UNION ALL');
L.push('  SELECT b.id, b.kodebarang FROM "SIMAPO".barang b');
L.push('  JOIN src ON b.kodebarang = src.kode AND b.instansi_id = \'' + esc(inst) + '\'');
L.push('  WHERE NOT EXISTS (SELECT 1 FROM ins_barang ib WHERE ib.kodebarang = b.kodebarang)');
L.push('),');
L.push('ins_unit AS (');
L.push('  INSERT INTO "SIMAPO".unit_aset (id, barangid, nomorinventaris, kondisi, statuspinjam, qrcode, merk_type, model_jenis, warna, tahun_pembuatan, roda, keterangan, instansi_id, updatedat)');
L.push("  SELECT gen_random_uuid(), ab.id, src.nomor, src.kondisi, false,");
L.push("         'https://mindcloud.my.id/?qr=SIMAPO-' || gen_random_uuid(),");
L.push("         src.merk, src.model, src.warna, src.tahun, src.roda, src.keterangan, '" + esc(inst) + "', NOW()");
L.push('  FROM src');
L.push('  JOIN all_barang ab ON ab.kodebarang = src.kode');
  L.push("  WHERE NOT EXISTS (SELECT 1 FROM \"SIMAPO\".unit_aset ua WHERE ua.nomorinventaris = src.nomor AND ua.instansi_id = '" + esc(inst) + "')");
L.push('  RETURNING id');
L.push(')');
L.push('SELECT (SELECT count(*) FROM src) AS total,');
L.push('       (SELECT count(*) FROM ins_barang) AS barang_baru,');
L.push('       (SELECT count(*) FROM ins_unit) AS unit_baru,');
L.push("       (SELECT COALESCE(json_agg(id), '[]'::json) FROM ins_barang) AS barang_ids;");
return [{ json: { sql: L.join('\n') } }];`;

// ── Code: simpan pengaturan ─────────────────────────────────────────────
const SET_JS = `const b = $input.item.json.body || {};
const q = $input.item.json.query || {};
const inst = String(q.instansi_id || 'bapperida');
const esc = s => String(s == null ? '' : s).replace(/'/g, "''");
const KEYS = ${JSON.stringify(PG_KEYS)};
const pairs = [];
for (const k of KEYS) {
  if (b[k] !== undefined) pairs.push("('" + k + "', '" + esc(b[k]) + "', '" + esc(inst) + "')");
}
if (!pairs.length) throw new Error('tidak ada field untuk disimpan');
const sql = 'INSERT INTO public.pengaturan (key, value, instansi_id) VALUES ' + pairs.join(', ') +
  ' ON CONFLICT (key, instansi_id) DO UPDATE SET value = EXCLUDED.value RETURNING key;';
return [{ json: { sql } }];`;

// ── SQL kosongkan anak per instansi ─────────────────────────────────────
// Semua child FK NO ACTION dihapus dalam SATU statement (dicek di akhir
// statement); unit_aset/barang dihapus terpisah oleh node PG sesudahnya.
// arg e = ekspresi runtime berisi instansi yang sudah di-escape; ${e}
// di-resolve n8n saat eksekusi, bukan saat build.
const SQL_KIDS = (e) => `WITH d1 AS (DELETE FROM "SIMAPO".riwayat_pemeliharaan
     WHERE unitasetid IN (SELECT id FROM "SIMAPO".unit_aset WHERE instansi_id = '${e}') RETURNING 1),
 d2 AS (DELETE FROM "SIMAPO".detail_distribusi_aset
     WHERE unitasetid IN (SELECT id FROM "SIMAPO".unit_aset WHERE instansi_id = '${e}') RETURNING 1),
 d3 AS (DELETE FROM "SIMAPO".jadwal_maintenance
     WHERE unitasetid IN (SELECT id FROM "SIMAPO".unit_aset WHERE instansi_id = '${e}') RETURNING 1),
 d4 AS (DELETE FROM "SIMAPO".peminjaman
     WHERE unitasetid IN (SELECT id FROM "SIMAPO".unit_aset WHERE instansi_id = '${e}') RETURNING 1),
 d5 AS (DELETE FROM "SIMAPO".detail_opname
     WHERE barangid IN (SELECT id FROM "SIMAPO".barang WHERE instansi_id = '${e}') RETURNING 1),
 d6 AS (DELETE FROM "SIMAPO".detail_request
     WHERE barangid IN (SELECT id FROM "SIMAPO".barang WHERE instansi_id = '${e}') RETURNING 1),
 d7 AS (DELETE FROM "SIMAPO".detail_pemeliharaan
     WHERE barangid IN (SELECT id FROM "SIMAPO".barang WHERE instansi_id = '${e}')
        OR riwayatid IN (SELECT id FROM "SIMAPO".riwayat_pemeliharaan
                         WHERE unitasetid IN (SELECT id FROM "SIMAPO".unit_aset WHERE instansi_id = '${e}')) RETURNING 1),
 d8 AS (DELETE FROM "SIMAPO".mutasi_barang
     WHERE barangkeluarid IN (SELECT id FROM "SIMAPO".barang WHERE instansi_id = '${e}')
        OR barangmasukid IN (SELECT id FROM "SIMAPO".barang WHERE instansi_id = '${e}') RETURNING 1),
 d9 AS (DELETE FROM "SIMAPO".detail_penerimaan
     WHERE barang_id IN (SELECT id FROM "SIMAPO".barang WHERE instansi_id = '${e}') RETURNING 1),
 d10 AS (DELETE FROM "SIMAPO".pemeliharaan
     WHERE barang_id IN (SELECT id FROM "SIMAPO".barang WHERE instansi_id = '${e}') RETURNING 1)
SELECT (SELECT count(*) FROM d1) + (SELECT count(*) FROM d2) + (SELECT count(*) FROM d3)
     + (SELECT count(*) FROM d4) + (SELECT count(*) FROM d5) + (SELECT count(*) FROM d6)
     + (SELECT count(*) FROM d7) + (SELECT count(*) FROM d8) + (SELECT count(*) FROM d9)
     + (SELECT count(*) FROM d10) AS rows_dihapus;`;

// ── Code: guard konfirmasi kosongkan ────────────────────────────────────
const CONFIRM_JS = `const b = $input.item.json.body || {};
if (String(b.confirm || '') !== 'HAPUS') throw new Error('Konfirmasi salah: ketik HAPUS');
const q = $input.item.json.query || {};
const inst = String(q.instansi_id || 'bapperida');
const esc = s => String(s == null ? '' : s).replace(/'/g, "''");
const i = esc(inst);
const sql = \`${SQL_KIDS('${i}')}\`;
return [{ json: { sql } }];`;

// ── SQL statis ──────────────────────────────────────────────────────────
const SQL_SUMMARY = `SELECT
  (SELECT COUNT(*) FROM "SIMAPO".unit_aset ua
     JOIN "SIMAPO".barang b ON b.id = ua.barangid AND b.isactive = true
    WHERE b.instansi_id = '${INST_EXPR}') AS total_unit,
  (SELECT COALESCE(SUM(COALESCE(NULLIF(ua.nilaiperolehan, 0), b.hargasatuan)), 0)
     FROM "SIMAPO".unit_aset ua
     JOIN "SIMAPO".barang b ON b.id = ua.barangid AND b.isactive = true
    WHERE b.instansi_id = '${INST_EXPR}') AS total_nilai,
  (SELECT COUNT(DISTINCT ua.pegawai_id) FROM "SIMAPO".unit_aset ua
     JOIN "SIMAPO".barang b ON b.id = ua.barangid AND b.isactive = true
    WHERE b.instansi_id = '${INST_EXPR}' AND ua.pegawai_id IS NOT NULL) AS pemegang,
  (SELECT COUNT(DISTINCT ua.ruangan_id) FROM "SIMAPO".unit_aset ua
     JOIN "SIMAPO".barang b ON b.id = ua.barangid AND b.isactive = true
    WHERE b.instansi_id = '${INST_EXPR}' AND ua.ruangan_id IS NOT NULL) AS ruangan,
  (SELECT COALESCE(json_agg(t ORDER BY t.jumlah DESC), '[]'::json) FROM (
     SELECT COALESCE(k.nama, 'Tanpa Kategori') AS kategori, COUNT(*) AS jumlah
       FROM "SIMAPO".unit_aset ua
       JOIN "SIMAPO".barang b ON b.id = ua.barangid AND b.isactive = true
       LEFT JOIN "SIMAPO".kategori_barang k ON k.id = b.kategoriid
      WHERE b.instansi_id = '${INST_EXPR}'
      GROUP BY k.nama
   ) t) AS per_kategori;`;

const SQL_PENG_GET = `SELECT COALESCE(json_object_agg(key, value), '{}'::json) AS data
FROM public.pengaturan
WHERE instansi_id = '${INST_EXPR}'
  AND key IN ('sekda_nama','sekda_nip','sekda_jabatan','sekda_alamat','p1_id','p1_jabatan','p1_alamat');`;

const SQL_TTD = `SELECT signature FROM public.tanda_tangan
WHERE nip = '{{ (($input.item.json.query || {}).nip || "").toString().replace(/'/g, "''") }}'
LIMIT 1;`;

// ── 7 rantai ────────────────────────────────────────────────────────────
function upsertChain(path) {
  newChain();
  const w = wh(path, 'POST'), g = gate(path);
  const c = code(`Code Aset Upsert (${path})`, UPSERT_JS);
  const p = pg(`PG Aset Upsert (${path})`, '={{ $json.sql }}');
  const a = code(`Agg Aset Upsert (${path})`, AGG_UPSERT);
  const r = res(`Res Aset Upsert (${path})`);
  link(w, g); link(g, c); link(c, p); link(p, a); link(a, r);
  endChain();
}
function readChain(path, query, aggJs) {
  newChain();
  const w = wh(path), g = gate(path);
  const p = pg(`PG ${path}`, query);
  const a = code(`Agg ${path}`, aggJs);
  const r = res(`Res ${path}`);
  link(w, g); link(g, p); link(p, a); link(a, r);
  endChain();
}

upsertChain('simapo-aset-massal');
upsertChain('simapo-aset-kib');

readChain('simapo-aset-summary', SQL_SUMMARY, AGG_SUMMARY);
readChain('simapo-pengaturan-get', SQL_PENG_GET, AGG_PENG_GET);

{ // simapo-pengaturan-set (POST)
  newChain();
  const w = wh('simapo-pengaturan-set', 'POST'), g = gate('simapo-pengaturan-set');
  const c = code('Code Pengaturan Set', SET_JS);
  const p = pg('PG Pengaturan Set', '={{ $json.sql }}');
  const a = code('Agg Pengaturan Set', AGG_OK);
  const r = res('Res Pengaturan Set');
  link(w, g); link(g, c); link(c, p); link(p, a); link(a, r);
  endChain();
}

readChain('simapo-ttd-get', SQL_TTD, AGG_TTD);

{ // simapo-aset-kosongkan (POST): guard → anak → unit → barang (per instansi)
  newChain();
  const w = wh('simapo-aset-kosongkan', 'POST'), g = gate('simapo-aset-kosongkan');
  const c = code('Code Konfirmasi Kosongkan', CONFIRM_JS);
  const p1 = pg('PG Kosongkan Anak', '={{ $json.sql }}');
  const p2 = pg('PG Kosongkan Unit', `DELETE FROM "SIMAPO".unit_aset WHERE instansi_id = '${INST_EXPR_KOSONG}';`);
  const p3 = pg('PG Kosongkan Barang', `DELETE FROM "SIMAPO".barang WHERE instansi_id = '${INST_EXPR_KOSONG}';`);
  const a = code('Agg Kosongkan', AGG_OK);
  const r = res('Res Kosongkan');
  link(w, g); link(g, c); link(c, p1); link(p1, p2); link(p2, p3); link(p3, a); link(a, r);
  endChain();
}

const wf = {
  name: NAME,
  nodes,
  connections,
  settings: { executionOrder: 'v1', binaryMode: 'separate' },
  staticData: null,
  pinData: {},
  meta: { templateCredsSetupCompleted: true },
};
writeFileSync(OUT, JSON.stringify(wf, null, 2) + '\n');
console.log(`OK: ${nodes.length} nodes, ${Object.keys(connections).length} links → ${OUT}`);

// ── deploy (Task 2): create/update + activate ───────────────────────────
async function deploy() {
  const token = process.env.N8N_TOKEN;
  if (!token) { console.error('N8N_TOKEN belum di-set'); process.exit(1); }
  const hdr = { 'X-N8N-API-KEY': token, 'content-type': 'application/json' };
  const list = await (await fetch(BASE + '/api/v1/workflows?limit=200', { headers: hdr })).json();
  const found = (list.data || []).find(x => x.name === NAME);
  let id;
  if (found) {
    id = found.id;
    const live = await (await fetch(`${BASE}/api/v1/workflows/${id}`, { headers: hdr })).json();
    const idByName = new Map((live.nodes || []).map(n => [n.name, n.id]));
    const outNodes = wf.nodes.map(n => (idByName.has(n.name) ? { ...n, id: idByName.get(n.name) } : n));
    const body = { name: wf.name, nodes: outNodes, connections: wf.connections, settings: wf.settings };
    let put = await fetch(`${BASE}/api/v1/workflows/${id}`, { method: 'PUT', headers: hdr, body: JSON.stringify(body) });
    for (const st of [{ executionOrder: 'v1', binaryMode: 'separate' }, { executionOrder: 'v1' }, {}]) {
      if (put.ok) break;
      put = await fetch(`${BASE}/api/v1/workflows/${id}`, { method: 'PUT', headers: hdr, body: JSON.stringify({ ...body, settings: st }) });
    }
    if (!put.ok) { console.error('PUT gagal', put.status, await put.text()); process.exit(1); }
    console.log(`updated ${id}`);
  } else {
    const post = await fetch(BASE + '/api/v1/workflows', { method: 'POST', headers: hdr, body: JSON.stringify({ name: wf.name, nodes: wf.nodes, connections: wf.connections, settings: wf.settings }) });
    if (!post.ok) { console.error('POST gagal', post.status, await post.text()); process.exit(1); }
    id = (await post.json()).id;
    console.log(`created ${id}`);
  }
  const act = await fetch(`${BASE}/api/v1/workflows/${id}/activate`, { method: 'POST', headers: hdr });
  console.log(`activate: HTTP ${act.status}`);
}
if (process.argv.includes('--deploy')) await deploy();
```

- [ ] **Step 2: Jalankan generator**

Run: `node scripts/build-aset-data-workflow.mjs` (workdir `D:\Code\absensi_refactored_v6`)
Expected: `OK: 41 nodes, 34 links → ...\n8n\SIMAPO - Aset Data.json` (angka nodes/links tepat 41/34; jika beda, hitung ulang rantai: 6+6+5+5+6+5+8=41, links = nodes − 7 rantai = 34).

- [ ] **Step 3: Validasi struktural JSON**

Run:
```powershell
node -e "const w=require('./n8n/SIMAPO - Aset Data.json'); const paths=w.nodes.filter(n=>n.type==='n8n-nodes-base.webhook').map(n=>n.parameters.path); const gates=w.nodes.filter(n=>n.name.startsWith('Gate')).length; const pg=w.nodes.filter(n=>n.type==='n8n-nodes-base.postgres'); console.log('webhooks',paths.length,'gates',gates,'pg',pg.length); console.log(paths.join('\n')); if(paths.length!==7||gates!==7||pg.length!==9) process.exit(1); if(pg.some(n=>!n.credentials||!n.credentials.postgres)) process.exit(2); console.log('VALID');"
```
Expected: `webhooks 7 gates 7 pg 9` + daftar 7 path + `VALID`. (9 node PG = 2 upsert + summary + peng-get + peng-set + ttd + 3 kosongkan.)

- [ ] **Step 4: Commit**

```powershell
git add scripts/build-aset-data-workflow.mjs "n8n/SIMAPO - Aset Data.json"
git commit -m "feat(aset): generator workflow SIMAPO Aset Data (7 endpoint bergate)"
```
Expected: commit sukses, 2 file masuk.

---

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
Expected: kode **bukan** `200` (biasanya `500`) — pola yang sama dipakai `bastSubmit` untuk deteksi gagal.

- [ ] **Step 4: Cek 3 endpoint baca dengan kunci**

(Kunci = `BAST_API_KEY` yang sudah ada di `js/config.js`, nilai publik klien.)
```powershell
$K = 'ogsbIpBCCzi3yndE85JkxFmPJeECw_5u'
curl.exe -s -H "x-bast-key: $K" 'https://mindcloud.my.id/webhook/simapo-aset-summary'
curl.exe -s -H "x-bast-key: $K" 'https://mindcloud.my.id/webhook/simapo-pengaturan-get'
curl.exe -s -H "x-bast-key: $K" 'https://mindcloud.my.id/webhook/simapo-ttd-get?nip=196803241999031003'
```
Expected:
- summary → JSON `{"data":{"total_unit":16,"total_nilai":<angka>,"pemegang":<n>,"ruangan":<n>,"per_kategori":[...]}}` (angka ≥ data saat ini: 16 unit).
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
Expected: angka = `total_unit` dari respons summary.

---

### Task 3: Smoke test `scripts/test-aset-data.mjs` + jalankan

**Files:**
- Create: `scripts/test-aset-data.mjs`

**Interfaces:**
- Consumes: endpoint hasil Task 2; `simapo-admin-master-delete` (POST `{id}`, soft delete `isactive=false`, webhook tanpa gate — terverifikasi di `n8n/SIMAPO Katalog & Master Barang.json`).
- Produces: exit code 0 = semua pass; baris test massal dibersihkan (soft-delete), pengaturan dikembalikan ke nilai sebelum test. Efek samping yang diterima: 1 baris `unit_aset` orphan (barang-nya isactive=false) — tidak dihitung summary karena filter `b.isactive = true`, dan 1 baris `pengaturan` yang nilainya kembali semula.

- [ ] **Step 1: Tulis script (kode lengkap)**

Buat `scripts/test-aset-data.mjs`:

```js
#!/usr/bin/env node
/* Smoke test endpoint SIMAPO - Aset Data. Aman diulang:
   - pengaturan di-restore ke nilai sebelum test,
   - baris test massal dihapus via simapo-admin-master-delete (soft delete),
   - kosongkan HANYA diuji guard-nya (tidak pernah hapus data).
   Env opsional: N8N_BASE, TTD_NIP (nip yang sudah punya tanda tangan).
*/
const BASE = process.env.N8N_BASE || 'https://mindcloud.my.id';
const KEY = 'ogsbIpBCCzi3yndE85JkxFmPJeECw_5u';
const HDR = { 'content-type': 'application/json', 'x-bast-key': KEY };
let fails = 0;
const say = (name, cond, extra = '') => {
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}${extra ? ' — ' + extra : ''}`);
  if (!cond) fails++;
};
async function call(method, path, body) {
  const opt = { method, headers: HDR };
  if (body) opt.body = JSON.stringify(body);
  try {
    const r = await fetch(BASE + path, opt);
    let j = null;
    try { j = await r.json(); } catch (_) {}
    return { status: r.status, ok: r.ok, j };
  } catch (e) {
    return { status: 0, ok: false, j: null, err: e.message };
  }
}

const P = {
  massal: '/webhook/simapo-aset-massal',
  summary: '/webhook/simapo-aset-summary',
  pgGet: '/webhook/simapo-pengaturan-get',
  pgSet: '/webhook/simapo-pengaturan-set',
  ttd: '/webhook/simapo-ttd-get',
  kosong: '/webhook/simapo-aset-kosongkan',
  masterDel: '/webhook/simapo-admin-master-delete',
};

// 1. tanpa x-bast-key harus ditolak
{
  const r = await fetch(BASE + P.summary);
  say('summary tolak tanpa x-bast-key', !r.ok, `status ${r.status}`);
}

// 2. summary terbaca + bentuk data
{
  const r = await call('GET', P.summary);
  const d = r.j && r.j.data;
  say('summary bentuk data',
    r.ok && d && typeof d.total_unit === 'number' && typeof d.total_nilai === 'number' && Array.isArray(d.per_kategori),
    JSON.stringify(d));
}

// 3. pengaturan roundtrip (set → baca → restore)
{
  const before = await call('GET', P.pgGet);
  const old = (before.j && before.j.data && before.j.data.p1_jabatan) || '';
  say('pengaturan-get bentuk objek', before.ok && before.j && typeof before.j.data === 'object', JSON.stringify(before.j));
  const set = await call('POST', P.pgSet, { p1_jabatan: 'SMOKE-P1-JABATAN' });
  say('pengaturan-set ok', set.ok, `status ${set.status}`);
  const after = await call('GET', P.pgGet);
  say('pengaturan roundtrip', after.ok && after.j && after.j.data.p1_jabatan === 'SMOKE-P1-JABATAN', JSON.stringify(after.j));
  const back = await call('POST', P.pgSet, { p1_jabatan: old });
  say('pengaturan restore', back.ok, `kembali ke '${old}'`);
}

// 4. massal: insert baru → ulang (idempoten) → cleanup
const kode = 'SMOKE-TEST-' + Date.now();
{
  const a = await call('POST', P.massal, { rows: [{ kodebarang: kode, nama: 'Smoke Test Aset', hargasatuan: 1 }] });
  const d = a.j && a.j.data;
  say('massal insert baru', a.ok && d && d.barang_baru === 1 && d.unit_baru === 1, JSON.stringify(d));
  const ids = (d && d.barang_ids) || [];
  const b = await call('POST', P.massal, { rows: [{ kodebarang: kode, nama: 'Smoke Test Aset', hargasatuan: 1 }] });
  const d2 = b.j && b.j.data;
  say('massal idempoten (ulang = 0 baru)', b.ok && d2 && d2.barang_baru === 0 && d2.unit_baru === 0, JSON.stringify(d2));
  let cleaned = ids.length > 0;
  for (const id of ids) {
    const c = await call('POST', P.masterDel, { id });
    if (!c.ok) cleaned = false;
  }
  say('cleanup via master-delete', cleaned, `${ids.length} baris`);
}

// 5. kosongkan: guard konfirmasi (TIDAK test happy-path)
{
  const r = await call('POST', P.kosong, { confirm: 'salah' });
  say('kosongkan tolak konfirmasi salah', !r.ok, `status ${r.status}`);
}

// 6. ttd-get (opsional)
if (process.env.TTD_NIP) {
  const r = await call('GET', `${P.ttd}?nip=${encodeURIComponent(process.env.TTD_NIP)}`);
  say('ttd-get signature terbaca', r.ok && r.j && r.j.data && typeof r.j.data.signature === 'string' && r.j.data.signature.length > 0, JSON.stringify(r.j));
} else {
  console.log('SKIP  ttd-get (set env TTD_NIP=<nip dengan tanda tangan> untuk test ini)');
}

console.log(fails ? `\n${fails} GAGAL` : '\nSEMUA PASS');
process.exit(fails ? 1 : 0);
```

- [ ] **Step 2: Jalankan**

Run: `node scripts/test-aset-data.mjs`
Expected: semua baris `PASS` (ttd-get boleh `SKIP`), diakhiri `SEMUA PASS`, exit code 0.

- [ ] **Step 3: Verifikasi DB untuk baris massal (read-only MCP)**

```sql
select count(*) from "SIMAPO".barang where kodebarang like 'SMOKE-TEST-%' and isactive = true
```
Expected: `0` (sudah soft-delete oleh cleanup). Kalau > 0, jalankan ulang cleanup manual via `simapo-admin-master-delete`.

- [ ] **Step 4: Commit**

```powershell
git add scripts/test-aset-data.mjs
git commit -m "test(aset): smoke test endpoint aset data (roundtrip, idempoten, guard)"
```
Expected: commit sukses.

---

### Task 4: Frontend — entri `P.*`, tab + form Pengaturan, handler JS

**Files:**
- Modify: `js/config.js:277-278`
- Modify: `index.html:1557` (tombol), `index.html:1850` (section)
- Modify: `js/simapo-ext.js:150` (case switchSATab), akhir file (fungsi baru)

**Interfaces:**
- Consumes: endpoint Task 2; helper global yang sudah ada: `apiFetch(path, opts)` (config.js — selalu menambah `_t` + `instansi_id`), `bastSubmit(endpoint, payload, opts)` (js/simapo-bast.js:12, return `boolean`, sudah toast), `BAST_API_KEY`/`BAST_API_HEADER` (config.js), `showToast(msg, type)`.
- Produces: `window.bastGet(endpoint) → object|null` (GET ber-header `x-bast-key`, mengembalikan `body.data`); `window.loadSAPengaturan()`; `window.saveSAPengaturan()`; `window.kosongkanAset()`; key `P.simapoAsetMassal|simapoAsetKib|simapoAsetSummary|simapoPengaturanGet|simapoPengaturanSet|simapoTtdGet|simapoAsetKosongkan`. (Plan 2 memakai `bastGet` + `bastSubmit`; Plan 3 memakai `simapoAsetMassal`/`simapoAsetKib`/`simapoAsetSummary`.)

- [ ] **Step 1: `js/config.js` — 7 entri `P.*` baru**

Ganti baris 277-278 (anchor: entri terakhir `simapoBastHistory` lalu `};`) menjadi:

```js
  simapoBastHistory: isTest ? '/webhook-test/simapo-bast-history' : '/webhook/simapo-bast-history',
  simapoAsetMassal: isTest ? '/webhook-test/simapo-aset-massal' : '/webhook/simapo-aset-massal',
  simapoAsetKib: isTest ? '/webhook-test/simapo-aset-kib' : '/webhook/simapo-aset-kib',
  simapoAsetSummary: isTest ? '/webhook-test/simapo-aset-summary' : '/webhook/simapo-aset-summary',
  simapoPengaturanGet: isTest ? '/webhook-test/simapo-pengaturan-get' : '/webhook/simapo-pengaturan-get',
  simapoPengaturanSet: isTest ? '/webhook-test/simapo-pengaturan-set' : '/webhook/simapo-pengaturan-set',
  simapoTtdGet: isTest ? '/webhook-test/simapo-ttd-get' : '/webhook/simapo-ttd-get',
  simapoAsetKosongkan: isTest ? '/webhook-test/simapo-aset-kosongkan' : '/webhook/simapo-aset-kosongkan',
};
```

- [ ] **Step 2: `index.html` — tombol tab (sesudah baris 1557, anchor `sa-tab-pks`)**

Tambahkan satu baris setelah tombol `sa-tab-pks` (sebelum `</div>` penutup `#sa-tab-bar`):

```html
            <button class="sa-tab"        id="sa-tab-pengaturan" onclick="switchSATab('pengaturan')" data-group="ref">⚙️ Pengaturan</button>
```

- [ ] **Step 3: `index.html` — section form (sesudah baris 1850, sebelum komentar `<!-- [TAB] BKU -->`)**

```html
        <!-- [TAB] PENGATURAN -->
        <div id="sa-sect-pengaturan" class="sa-sect" style="display:none">
          <div class="card glass-card">
            <div class="card-title" style="display:flex;justify-content:space-between;align-items:center;">
              <span>⚙️ Pengaturan Aset</span>
              <button class="btn-sm-admin" onclick="loadSAPengaturan()" style="background:var(--primary)">🔄</button>
            </div>
            <div style="font-size:10px;color:var(--muted);margin-bottom:10px;">Data Pihak Pertama untuk BAST. Mode Sekda dipakai saat Pihak Kedua = NIP Sekda; selain itu mode Kepala (NIP di bawah).</div>
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;">
              <div class="form-group"><label class="form-label">Nama Sekretaris Daerah</label><input class="form-input" id="setSekdaNama" placeholder="Yermia Ndapa Doda, S.Sos"></div>
              <div class="form-group"><label class="form-label">NIP Sekretaris Daerah</label><input class="form-input" id="setSekdaNip" placeholder="196803241999031003"></div>
              <div class="form-group"><label class="form-label">Jabatan Sekretaris Daerah</label><input class="form-input" id="setSekdaJabatan" placeholder="Sekretaris Daerah Kabupaten Sumba Barat"></div>
              <div class="form-group"><label class="form-label">Alamat Sekretaris Daerah</label><input class="form-input" id="setSekdaAlamat" placeholder="Waikabubak"></div>
              <div class="form-group"><label class="form-label">NIP Pihak Pertama (Kepala)</label><input class="form-input" id="setP1Nip" placeholder="197211022001121001"></div>
              <div class="form-group"><label class="form-label">Jabatan Pihak Pertama</label><input class="form-input" id="setP1Jabatan" placeholder="Kepala Badan Perencanaan Kabupaten Sumba Barat"></div>
              <div class="form-group" style="grid-column:1/-1;"><label class="form-label">Alamat Pihak Pertama</label><input class="form-input" id="setP1Alamat" placeholder="Waikabubak"></div>
            </div>
            <button class="btn-primary" onclick="saveSAPengaturan()" style="width:100%;margin-top:12px;">
              <div class="btn-inner"><span>💾</span> Simpan Pengaturan</div>
            </button>
            <hr style="border-color:rgba(255,255,255,0.08);margin:18px 0;">
            <div class="form-label" style="color:#f87171;">⚠️ Zona Bahaya</div>
            <div style="font-size:11px;color:var(--muted);margin-bottom:8px;">Kosongkan seluruh data aset instansi ini (katalog + unit + riwayat transaksi yang merujuknya). Pegawai, ruangan, kategori, pengaturan, dan arsip BAST TIDAK terhapus.</div>
            <div style="display:flex;gap:8px;">
              <input class="form-input" id="kosongkanKonfirmasi" placeholder="Ketik HAPUS untuk mengaktifkan">
              <button class="btn-sm-admin" onclick="kosongkanAset()" style="background:rgba(248,113,113,0.2);color:#f87171;white-space:nowrap;">🗑 Kosongkan</button>
            </div>
          </div>
        </div>

```

- [ ] **Step 4: `js/simapo-ext.js` — case baru di `switchSATab` (baris 150)**

Ganti:

```js
  else if (name === 'bast') window.loadAdminBast(force);
```

menjadi:

```js
  else if (name === 'bast') window.loadAdminBast(force);
  else if (name === 'pengaturan') window.loadSAPengaturan();
```

- [ ] **Step 5: `js/simapo-ext.js` — tambahkan blok berikut di AKHIR FILE (setelah baris terakhir)**

```js
/* ─── PENGATURAN (P1) + KOSONGKAN ASET ─────────────────────────────── */
window.bastGet = async function(endpoint) {
  try {
    const res = await apiFetch(endpoint, { headers: { [BAST_API_HEADER]: BAST_API_KEY } });
    if (!res.ok) return null;
    const body = await res.json();
    return (body && body.data) || null;
  } catch (e) {
    console.error('[SIMAPO] GET gagal:', endpoint, e);
    return null;
  }
};

window.loadSAPengaturan = async function() {
  const data = (await window.bastGet(P.simapoPengaturanGet)) || {};
  const fill = (id, v) => { const el = document.getElementById(id); if (el && v) el.value = v; };
  fill('setSekdaNama', data.sekda_nama);
  fill('setSekdaNip', data.sekda_nip);
  fill('setSekdaJabatan', data.sekda_jabatan);
  fill('setSekdaAlamat', data.sekda_alamat);
  fill('setP1Nip', data.p1_id);
  fill('setP1Jabatan', data.p1_jabatan);
  fill('setP1Alamat', data.p1_alamat);
};

window.saveSAPengaturan = async function() {
  const v = id => ((document.getElementById(id) || {}).value || '').trim();
  await window.bastSubmit(P.simapoPengaturanSet, {
    sekda_nama: v('setSekdaNama'),
    sekda_nip: v('setSekdaNip'),
    sekda_jabatan: v('setSekdaJabatan'),
    sekda_alamat: v('setSekdaAlamat'),
    p1_id: v('setP1Nip'),
    p1_jabatan: v('setP1Jabatan'),
    p1_alamat: v('setP1Alamat')
  }, { successMsg: 'Pengaturan disimpan', errorMsg: 'Gagal menyimpan pengaturan.' });
};

window.kosongkanAset = async function() {
  const inp = document.getElementById('kosongkanKonfirmasi');
  if (!inp || inp.value.trim() !== 'HAPUS') {
    showToast('Ketik HAPUS dulu di kolom konfirmasi.', 'error');
    return;
  }
  const ok = await window.bastSubmit(P.simapoAsetKosongkan, { confirm: 'HAPUS' },
    { successMsg: 'Data aset dikosongkan', errorMsg: 'Gagal mengosongkan data aset.' });
  if (ok) inp.value = '';
};
```

- [ ] **Step 6: Cek sintaks + build**

```powershell
node --check js/simapo-ext.js; if (-not $?) { exit 1 }
node --check js/config.js; if (-not $?) { exit 1 }
npm run build
```
Expected: tanpa error; `npm run build` selesai (vite).

- [ ] **Step 7: Commit**

```powershell
git add js/config.js index.html js/simapo-ext.js
git commit -m "feat(aset): tab Pengaturan (P1 sekda/kepala + kosongkan) dan entri endpoint aset data"
```
Expected: commit sukses, 3 file masuk.

---

### Task 5: Amandemen spec (cakupan kosongkan) + verifikasi UI

**Files:**
- Modify: `docs/superpowers/specs/2026-09-30-aset-admin-port-design.md:97`

**Interfaces:**
- Consumes: hasil Task 4, endpoint Task 2.
- Produces: spec konsisten dengan implementasi; bukti UI jalan.

- [ ] **Step 1: Edit spec baris 97**

Ganti seluruh isi baris 97 (mulai `| \`simapo-aset-kosongkan\` ...`) menjadi:

```markdown
| `simapo-aset-kosongkan` | destructive; wajib konfirmasi "HAPUS" di client **dan** guard server-side; cakupan hapus (per instansi — `instansi_id` dari query, default `bapperida`; baris instansi lain tidak tersentuh): semua tabel domain aset yang jadi FK-referen `barang`/`unit_aset` (riwayat transaksi ikut terhapus — dipaksa FK Postgres: `riwayat_pemeliharaan`, `detail_distribusi_aset`, `jadwal_maintenance`, `peminjaman`, `detail_opname`, `detail_request`, `detail_pemeliharaan`, `mutasi_barang`, `detail_penerimaan`, `pemeliharaan`, lalu `unit_aset`, `barang`), sedangkan ruangan/kategori/pegawai/pengaturan/tanda_tangan/arsip BAST tetap |
```

- [ ] **Step 2: Verifikasi UI via browser**

Jalankan dev server: `npm run dev` (vite), lalu dengan skill `browser-harness` buka URL dev → login (kredensial dari user; kalau tidak tersedia, minta user verifikasi manual) → Admin SIMAPO → group **📐 Referensi** → tab **⚙️ Pengaturan**. Cek:
1. Tab tampil di group Referensi dan section form tampil saat diklik (data termuat / placeholder defaults terlihat).
2. Ubah satu field (mis. Alamat Pihak Pertama) → **Simpan** → toast sukses → reload tab → nilai tersimpan (GET roundtrip).
3. Zona Bahaya: klik **🗑 Kosongkan** tanpa mengetik → toast error, server TIDAK dipanggil (guard client).
4. Kembali ke tab 📐 PKS dan group 📦 Kelola Aset → semuanya masih tampil normal (regresi `switchSATab`).

- [ ] **Step 3: Verifikasi regresi singkat endpoint lama**

```powershell
$K = 'ogsbIpBCCzi3yndE85JkxFmPJeECw_5u'
curl.exe -s -H "x-bast-key: $K" 'https://mindcloud.my.id/webhook/simapo-bast-list'
```
Expected: JSON `{"data":[...]}` (workflow BAST lama tidak terdampak; gate memakai kode yang sama).

- [ ] **Step 4: Commit**

```powershell
git add docs/superpowers/specs/2026-09-30-aset-admin-port-design.md
git commit -m "docs(aset): amandemen cakupan kosongkan (FK child ikut terhapus)"
```
Expected: commit sukses.

---

## Self-Review (sudah dijalankan)

- **Spec coverage (Plan 1):** endpoint 7/7 (spec §tabel endpoint) ✓; tab Pengaturan group Referensi + ketik "HAPUS" client & server ✓; pengaturan keys `sekda_*`+`p1_*` ✓; kosongkan uji guard saja ✓ (spec baris 107); amandemen cakupan kosongkan di Task 5 ✓; import massal/KIB/summary-ringkasan/UI taste = Plan 2-3 (di luar plan ini, sesuai split "pisah saja").
- **Placeholder scan:** tidak ada TBD/TODO; semua langkah berisi kode/perintah lengkap + expected output.
- **Type consistency:** `bastGet → object|null` dipakai konsisten; `bastSubmit → boolean`; `P.simapoAset*`/`simapoPengaturan*`/`simapoTtdGet`/`simapoAsetKosongkan` sama persis antara config.js, smoke test (path literal identik dengan entri `isTest=false`), dan handler JS; id HTML `setSekda*`/`setP1*`/`kosongkanKonfirmasi` sama antara Step 3 dan Step 5.

**Catatan eksekusi:**
- `n8n/export/` dan `n8n/simapo/` adalah salinan sinkron — jangan diedit; sinkron berikutnya lewat `node scripts/n8n-pull.mjs` (butuh `N8N_TOKEN`), opsional setelah semua plan selesai.
- Kalau `GET /api/v1/workflows` balas 401 → token kedaluwarsa, minta token baru ke user (AGENTS.md).
