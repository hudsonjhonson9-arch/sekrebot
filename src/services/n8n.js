const SERVER_1 = 'https://mindcloud.my.id';
const SERVER_2 = 'https://n8n-sp8dtwslkxal.jkt3.sumopod.my.id';
const HDR = { 'Content-Type': 'application/json', 'ngrok-skip-browser-warning': 'true', 'Accept': 'application/json' };

export async function apiFetch(path, opts = {}) {
  // Auto-append instansi_id scoping
  const urlParams = new URLSearchParams(window.location.search);
  let inst = urlParams.get('instansi') || urlParams.get('instansi_id');
  if (!inst) {
      try {
          const u = JSON.parse(localStorage.getItem('tg_user_obj_v5') || '{}');
          inst = u.instansi_id || 'pusat';
      } catch(e) { inst = 'pusat'; }
  }
  if (inst && !path.includes('instansi_id=')) {
    path += (path.includes('?') ? '&' : '?') + 'instansi_id=' + inst;
  }

  for (const base of [SERVER_1, SERVER_2]) {
    try {
      console.log(`[Fetch] Attempting: ${base}${path}`);
      const r = await fetch(base + path, { ...opts, headers: HDR });
      if (r.ok || (r.status >= 400 && r.status < 500)) {
        console.log(`[Fetch] Success: ${base}${path}`);
        return r;
      }
      throw new Error(`HTTP ${r.status}`);
    } catch (e) {
      console.warn(`[Fetch Fallback] ${base}${path}:`, e.message);
    }
  }
  throw new Error('Semua server offline atau tidak merespons.');
}
