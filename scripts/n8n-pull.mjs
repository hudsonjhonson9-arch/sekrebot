// Pull semua workflow JSON dari n8n public API.
// Pakai: $env:N8N_TOKEN='...'; node scripts/n8n-pull.mjs [outdir]
const TOKEN = process.env.N8N_TOKEN;
const BASE = process.env.N8N_BASE || 'https://mindcloud.my.id';
const OUT = process.argv[2] || 'n8n/export';

if (!TOKEN) { console.error('N8N_TOKEN kosong'); process.exit(1); }

const H = { 'X-N8N-API-KEY': TOKEN };
const get = async (p) => {
  const r = await fetch(BASE + p, { headers: H });
  if (!r.ok) throw new Error(`${p} -> HTTP ${r.status}`);
  return r.json();
};

const safe = (s) => s.replace(/[<>:"/\\|?*\x00-\x1f]/g, '-').replace(/\s+/g, ' ').trim();

const list = (await get('/api/v1/workflows?limit=200')).data;
console.log(`workflows: ${list.length}`);

const { mkdir, writeFile } = await import('node:fs/promises');
await mkdir(OUT, { recursive: true });

const seen = new Set();
for (const w of list) {
  try {
    const wf = await get(`/api/v1/workflows/${w.id}`);
    let file = safe(wf.name) + '.json';
    if (seen.has(file.toLowerCase())) file = safe(wf.name) + ` (${wf.id}).json`;
    seen.add(file.toLowerCase());
    await writeFile(`${OUT}/${file}`, JSON.stringify(wf, null, 2));
    console.log(`ok   ${wf.id}  active=${wf.active}  ${file}`);
  } catch (e) {
    console.error(`FAIL ${w.id} ${w.name}: ${e.message}`);
  }
}
console.log(`done -> ${OUT}`);
