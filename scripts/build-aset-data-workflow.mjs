#!/usr/bin/env node
/* Generator workflow "SIMAPO - Aset Data" â†’ n8n/SIMAPO - Aset Data.json
   node scripts/build-aset-data-workflow.mjs            â†’ tulis JSON lokal
   node scripts/build-aset-data-workflow.mjs --deploy   â†’ tulis + create/update + activate (butuh N8N_TOKEN)
*/
import { randomUUID } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(ROOT, 'n8n', 'SIMAPO - Aset Data.json');
const NAME = 'SIMAPO - Aset Data';
const BASE = 'https://mindcloud.my.id';
const INST = 'bapperida';
const PG_KEYS = ['sekda_nama', 'sekda_nip', 'sekda_jabatan', 'sekda_alamat', 'p1_id', 'p1_jabatan', 'p1_alamat'];

// â”€â”€ referensi dari workflow BAST yang sudah terbukti jalan â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
const BAST = JSON.parse(readFileSync(join(ROOT, 'n8n', 'SIMAPO - BAST.json'), 'utf8'));
const refOf = (type) => BAST.nodes.find(n => n.type === type);
const refWh = refOf('n8n-nodes-base.webhook');
const refCode = refOf('n8n-nodes-base.code');
const refPg = refOf('n8n-nodes-base.postgres');
const refRes = refOf('n8n-nodes-base.respondToWebhook');
const GATE_JS = BAST.nodes
  .find(n => n.type === 'n8n-nodes-base.code' && n.parameters.jsCode.includes('x-bast-key'))
  .parameters.jsCode;

// â”€â”€ builder â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
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
const pg = (n, query) => add(n, 'n8n-nodes-base.postgres',
  { operation: 'executeQuery', query, options: {} },
  { typeVersion: refPg.typeVersion, creds: refPg.credentials });
const res = (n) => add(n, 'n8n-nodes-base.respondToWebhook', {
  respondWith: 'text',
  responseBody: '={{ JSON.stringify($json) }}',
  options: { responseHeaders: { entries: [{ name: 'Content-Type', value: 'application/json' }] } },
}, { typeVersion: refRes.typeVersion });

// instansi dari query (apiFetch selalu menyisipkan instansi_id), fallback bapperida
const INST_EXPR = "{{ (($input.item.json.query || {}).instansi_id || \"bapperida\").toString().replace(/'/g, \"''\") }}";

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

// â”€â”€ Code: upsert massal/KIB (idempoten, tanpa unique constraint) â”€â”€â”€â”€â”€â”€â”€â”€
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
L.push('  WHERE NOT EXISTS (SELECT 1 FROM "SIMAPO".unit_aset ua WHERE ua.nomorinventaris = src.nomor)');
L.push('  RETURNING id');
L.push(')');
L.push('SELECT (SELECT count(*) FROM src) AS total,');
L.push('       (SELECT count(*) FROM ins_barang) AS barang_baru,');
L.push('       (SELECT count(*) FROM ins_unit) AS unit_baru,');
L.push("       (SELECT COALESCE(json_agg(id), '[]'::json) FROM ins_barang) AS barang_ids;");
return [{ json: { sql: L.join('\n') } }];`;

// â”€â”€ Code: simpan pengaturan â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
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

// â”€â”€ Code: guard konfirmasi kosongkan â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
const CONFIRM_JS = `const b = $input.item.json.body || {};
if (String(b.confirm || '') !== 'HAPUS') throw new Error('Konfirmasi salah: ketik HAPUS');
return $input.all();`;

// â”€â”€ SQL statis â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
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

const SQL_KIDS = `WITH d1 AS (DELETE FROM "SIMAPO".riwayat_pemeliharaan RETURNING 1),
     d2 AS (DELETE FROM "SIMAPO".detail_distribusi_aset RETURNING 1),
     d3 AS (DELETE FROM "SIMAPO".jadwal_maintenance RETURNING 1),
     d4 AS (DELETE FROM "SIMAPO".peminjaman RETURNING 1),
     d5 AS (DELETE FROM "SIMAPO".detail_opname RETURNING 1),
     d6 AS (DELETE FROM "SIMAPO".detail_request RETURNING 1),
     d7 AS (DELETE FROM "SIMAPO".detail_pemeliharaan RETURNING 1),
     d8 AS (DELETE FROM "SIMAPO".mutasi_barang RETURNING 1),
     d9 AS (DELETE FROM "SIMAPO".detail_penerimaan RETURNING 1),
     d10 AS (DELETE FROM "SIMAPO".pemeliharaan RETURNING 1)
SELECT (SELECT count(*) FROM d1) + (SELECT count(*) FROM d2) + (SELECT count(*) FROM d3)
     + (SELECT count(*) FROM d4) + (SELECT count(*) FROM d5) + (SELECT count(*) FROM d6)
     + (SELECT count(*) FROM d7) + (SELECT count(*) FROM d8) + (SELECT count(*) FROM d9)
     + (SELECT count(*) FROM d10) AS rows_dihapus;`;

// â”€â”€ 7 rantai â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
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

{ // simapo-aset-kosongkan (POST): guard â†’ anak â†’ unit â†’ barang
  newChain();
  const w = wh('simapo-aset-kosongkan', 'POST'), g = gate('simapo-aset-kosongkan');
  const c = code('Code Konfirmasi Kosongkan', CONFIRM_JS);
  const p1 = pg('PG Kosongkan Anak', SQL_KIDS);
  const p2 = pg('PG Kosongkan Unit', 'DELETE FROM "SIMAPO".unit_aset;');
  const p3 = pg('PG Kosongkan Barang', 'DELETE FROM "SIMAPO".barang;');
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
console.log(`OK: ${nodes.length} nodes, ${Object.keys(connections).length} links â†’ ${OUT}`);

// â”€â”€ deploy (Task 2): create/update + activate â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
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
