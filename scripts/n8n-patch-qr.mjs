// Fix SIMAPO - QR Aset (workflow id mMu0TTKP3Meorh5D):
//  1. PG Unit List  : kolom qrcode tidak di-select -> UI selalu "❌ QR", viewQRCode kosong
//  2. PG QR Update  : SQL filter body.id, frontend kirim unitasetid -> UPDATE 0 baris (silent)
//  3. PG Unit By QR : token SIMAPO-<unitId> dibandingkan ke barangid + qrcode disimpan
//                     sebagai URL penuh -> scan tidak pernah cocok
// Usage:
//   N8N_TOKEN=... node scripts/n8n-patch-qr.mjs [--dry-run]        (patch live via n8n API)
//   node scripts/n8n-patch-qr.mjs --files [--dry-run]              (patch salinan JSON lokal)
const BASE = process.env.N8N_BASE || 'https://mindcloud.my.id';
const ID = 'mMu0TTKP3Meorh5D';
const LOCAL_FILES = [
  'n8n/SIMAPO - QR Aset.json',
  'n8n/export/SIMAPO - QR Aset.json',
];

const UPDATE_OLD = `SET qrcode = '{{ ($json.body.qrcode).toString().replace(/'/g, "''") }}', updatedat = CURRENT_TIMESTAMP WHERE id = '{{ ($json.body.id).toString().replace(/'/g, "''") }}'`;
const UPDATE_NEW = `SET qrcode = '{{ ($json.body.qrcode ?? '').toString().replace(/'/g, "''") }}', updatedat = CURRENT_TIMESTAMP WHERE id = COALESCE(NULLIF('{{ ($json.body.id ?? '').toString().replace(/'/g, "''") }}', ''), '{{ ($json.body.unitasetid ?? '').toString().replace(/'/g, "''") }}')`;

const FIXES = [
  {
    node: 'PG Unit List',
    old: 'SELECT ua.id, ua.nomorinventaris, ua.kondisi, ua.statuspinjam,',
    new: 'SELECT ua.id, ua.nomorinventaris, ua.qrcode, ua.kondisi, ua.statuspinjam,',
  },
  { node: 'PG QR Update', old: UPDATE_OLD, new: UPDATE_NEW },
  {
    node: 'PG Unit By QR',
    old: `  WHERE (ua.qrcode = '{{ ($json.query.q).toString().replace(/'/g, "''") }}' OR ua.barangid = REPLACE('{{ ($json.query.q).toString().replace(/'/g, "''") }}', 'SIMAPO-', ''))`,
    new: `  WHERE (
    ua.qrcode = '{{ ($json.query.q).toString().replace(/'/g, "''") }}'
    OR ua.qrcode LIKE '%qr=' || '{{ ($json.query.q).toString().replace(/'/g, "''") }}'
    OR ua.id = REPLACE('{{ ($json.query.q).toString().replace(/'/g, "''") }}', 'SIMAPO-', '')
    OR ua.barangid = REPLACE('{{ ($json.query.q).toString().replace(/'/g, "''") }}', 'SIMAPO-', '')
  )`,
  },
];
const N = FIXES.length;

const dry = process.argv.includes('--dry-run');

function apply(workflow) {
  let changed = 0;
  for (const f of FIXES) {
    const n = workflow.nodes.find(x => x.name === f.node);
    if (!n) throw new Error('node tidak ketemu: ' + f.node);
    if (n.parameters.query.includes(f.new)) continue; // sudah ter-patch
    if (!n.parameters.query.includes(f.old)) throw new Error('pola lama tidak cocok di ' + f.node);
    n.parameters.query = n.parameters.query.replace(f.old, f.new);
    changed++;
  }
  return changed;
}

async function patchLive() {
  const H = { 'X-N8N-API-KEY': process.env.N8N_TOKEN, 'Content-Type': 'application/json' };
  const r = await fetch(`${BASE}/api/v1/workflows/${ID}`, { headers: H });
  if (!r.ok) throw new Error(`GET live gagal: HTTP ${r.status} ${(await r.text()).slice(0, 120)}`);
  const wf = await r.json();
  const changed = apply(wf);
  console.log(`live: ${changed}/${N} node diubah${changed ? '' : ' (sudah ter-patch)'}`);
  if (dry || !changed) return;

  const put = await fetch(`${BASE}/api/v1/workflows/${ID}`, {
    method: 'PUT', headers: H,
    body: JSON.stringify({ name: wf.name, nodes: wf.nodes, connections: wf.connections, settings: wf.settings }),
  });
  if (!put.ok) {
    // API menolak key settings tertentu (binaryMode, availableInMCP) -> kirim varian lebih kecil
    const s = wf.settings;
    const variants = [{ executionOrder: s.executionOrder, binaryMode: s.binaryMode }, { executionOrder: s.executionOrder }, {}];
    let used = null;
    for (const v of variants) {
      const r = await fetch(`${BASE}/api/v1/workflows/${ID}`, {
        method: 'PUT', headers: H,
        body: JSON.stringify({ name: wf.name, nodes: wf.nodes, connections: wf.connections, settings: v }),
      });
      console.log('PUT settings=' + JSON.stringify(v) + ' ->', r.status, (await r.text()).slice(0, 140));
      if (r.ok) { used = v; break; }
    }
    // kembalikan key yang hilang (availableInMCP) kalau lolos schema
    if (used && wf.settings.availableInMCP !== undefined && used.availableInMCP === undefined) {
      const r = await fetch(`${BASE}/api/v1/workflows/${ID}`, {
        method: 'PUT', headers: H,
        body: JSON.stringify({ name: wf.name, nodes: wf.nodes, connections: wf.connections, settings: { ...used, availableInMCP: wf.settings.availableInMCP } }),
      });
      console.log('restore settings availableInMCP ->', r.status, (await r.text()).slice(0, 120));
    }
  } else {
    console.log('PUT 200');
  }

  const after = await (await fetch(`${BASE}/api/v1/workflows/${ID}`, { headers: H })).json();
  console.log('active setelah patch:', after.active, '| settings:', JSON.stringify(after.settings));
  if (!after.active) {
    const act = await fetch(`${BASE}/api/v1/workflows/${ID}/activate`, { method: 'POST', headers: H });
    console.log('re-activate:', act.status, (await act.text()).slice(0, 160));
  }
  const ok = FIXES.every(f => after.nodes.find(n => n.name === f.node).parameters.query.includes(f.new.slice(0, 40)));
  console.log(ok ? 'VERIFIED: live OK (fetch ulang)' : 'VERIFIED: GAGAL');
}

async function patchFiles() {
  const fs = await import('node:fs');
  for (const f of LOCAL_FILES) {
    const raw = fs.readFileSync(f, 'utf8');
    const wf = JSON.parse(raw);
    const orig = Object.fromEntries(wf.nodes.filter(n => n.parameters.query).map(n => [n.name, n.parameters.query]));
    const changed = apply(wf);
    console.log(`${f}: ${changed}/${N} node diubah${changed ? '' : ' (sudah ter-patch)'}`);
    if (dry || !changed) continue;
    let out = raw;
    for (const fix of FIXES) {
      out = out.replace(JSON.stringify(orig[fix.node]), JSON.stringify(wf.nodes.find(x => x.name === fix.node).parameters.query));
    }
    JSON.parse(out); // sanity: masih JSON valid
    fs.writeFileSync(f, out);
    console.log(`  -> ditulis (${out.length} bytes)`);
  }
}

(async () => {
  if (process.argv.includes('--files')) await patchFiles();
  else await patchLive();
})().catch(e => { console.error('ERR', e.message); process.exit(1); });
