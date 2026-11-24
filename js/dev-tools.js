/**
 * Dev Tools & Feature Health Diagnostics Tracker
 * Modul pemantauan kesehatan fitur, pengujian diagnostik otomatis, dan activity log.
 */

export function createDevTracker(options = {}) {
  const storageKey = options.storageKey !== undefined ? options.storageKey : 'absen_dev_logs';
  const maxLogs = options.maxLogs || 200;

  let logs = [];

  // Restore dari localStorage jika ada
  if (storageKey && typeof localStorage !== 'undefined') {
    try {
      const saved = localStorage.getItem(storageKey);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed)) logs = parsed.slice(0, maxLogs);
      }
    } catch (_) {}
  }

  function save() {
    if (!storageKey || typeof localStorage === 'undefined') return;
    try {
      localStorage.setItem(storageKey, JSON.stringify(logs.slice(0, maxLogs)));
    } catch (_) {}
  }

  function formatWita(date = new Date()) {
    try {
      return new Intl.DateTimeFormat('id-ID', {
        timeZone: 'Asia/Makassar',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: false,
      }).format(date).replace(/\./g, ':');
    } catch (_) {
      return date.toISOString();
    }
  }

  function log(level, module, action, details = null) {
    const entry = {
      id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
      timestamp: new Date().toISOString(),
      timeWita: formatWita(new Date()),
      level: String(level || 'INFO').toUpperCase(),
      module: String(module || 'SYSTEM').toUpperCase(),
      action: String(action || ''),
      details: details !== null && details !== undefined ? details : null,
    };

    logs.unshift(entry);
    if (logs.length > maxLogs) {
      logs = logs.slice(0, maxLogs);
    }
    save();
    return entry;
  }

  function getLogs(filter = {}) {
    let result = logs.slice();
    if (filter.level && filter.level !== 'ALL') {
      const lvl = String(filter.level).toUpperCase();
      result = result.filter((l) => l.level === lvl);
    }
    if (filter.search) {
      const q = String(filter.search).toLowerCase();
      result = result.filter((l) => {
        const m = l.module.toLowerCase();
        const a = l.action.toLowerCase();
        const d = l.details ? JSON.stringify(l.details).toLowerCase() : '';
        return m.includes(q) || a.includes(q) || d.includes(q);
      });
    }
    return result;
  }

  function clearLogs() {
    logs = [];
    if (storageKey && typeof localStorage !== 'undefined') {
      try { localStorage.removeItem(storageKey); } catch (_) {}
    }
  }

  function exportLogs(format = 'json') {
    if (format === 'txt') {
      return logs.map((l) => {
        const dStr = l.details ? ' | ' + JSON.stringify(l.details) : '';
        return `[${l.timeWita || l.timestamp}] [${l.level}] [${l.module}] ${l.action}${dStr}`;
      }).join('\n');
    }
    return JSON.stringify(logs, null, 2);
  }

  async function runDiagnostics(customProbers = null) {
    const results = {};
    const probers = customProbers || getDefaultProbers();
    const keys = Object.keys(probers);

    for (const key of keys) {
      const t0 = Date.now();
      try {
        const res = await probers[key]();
        const latency = res.latencyMs !== undefined ? res.latencyMs : (Date.now() - t0);
        results[key] = {
          status: res.ok ? 'OK' : (res.warning ? 'WARN' : 'ERROR'),
          message: res.message || (res.ok ? 'Operasional' : 'Gangguan'),
          latencyMs: latency,
          details: res.details || null,
        };
      } catch (err) {
        results[key] = {
          status: 'ERROR',
          message: err.message || 'Gagal terhubung',
          latencyMs: Date.now() - t0,
          details: String(err),
        };
      }
    }

    const total = keys.length;
    let passed = 0;
    let failed = 0;
    for (const k of keys) {
      if (results[k].status === 'OK' || results[k].status === 'WARN') {
        passed++;
      } else {
        failed++;
      }
    }

    const score = total > 0 ? Math.round((passed / total) * 100) : 100;

    log('INFO', 'DIAGNOSTIC', `Pengujian sistem selesai: skor ${score}% (${passed}/${total} subsistem normal)`, results);

    return {
      total,
      passed,
      failed,
      score,
      timestamp: new Date().toISOString(),
      results,
    };
  }

  function getDevAuthHeaders() {
    const headers = {};
    let token = null;
    if (typeof window !== 'undefined' && typeof window.getStitchToken === 'function') {
      token = window.getStitchToken();
    }
    if (!token && typeof _nativeToken !== 'undefined' && _nativeToken) {
      token = _nativeToken;
    }
    if (!token && typeof localStorage !== 'undefined') {
      try {
        token = localStorage.getItem('_native_token')
          || localStorage.getItem('native_token')
          || localStorage.getItem('_sess_token');
      } catch (_) {}
    }
    if (!token && typeof window !== 'undefined' && window._session?.token) {
      token = window._session.token;
    }
    if (token) {
      headers['Authorization'] = 'Bearer ' + token;
    }
    return headers;
  }

  function getDefaultProbers() {
    let healthPromise = null;
    const fetchServerHealth = () => {
      if (!healthPromise) {
        const t0 = Date.now();
        healthPromise = fetch('/api/dev/health', { headers: getDevAuthHeaders() })
          .then(async (res) => {
            const lat = Date.now() - t0;
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            const data = await res.json();
            return { data, lat };
          });
      }
      return healthPromise;
    };

    return {
      database: async () => {
        const { data } = await fetchServerHealth();
        return {
          ok: !!(data.db && data.db.ok),
          latencyMs: data.db?.latencyMs || 0,
          message: data.db?.ok ? `PostgreSQL Pool OK (${data.db.latencyMs}ms)` : 'PostgreSQL terputus',
        };
      },
      backend_api: async () => {
        const { data, lat } = await fetchServerHealth();
        const up = data.uptime ? `${Math.floor(data.uptime / 60)}m` : '0m';
        const sched = data.scheduler?.active ? ' • Scheduler Aktif' : '';
        return {
          ok: true,
          latencyMs: lat,
          message: `Express API Normal (Uptime: ${up}, Node ${data.nodeVersion || ''}${sched})`,
        };
      },
      openwa_gateway: async () => {
        const { data } = await fetchServerHealth();
        const ow = data.openwa || {};
        if (!ow.configured) {
          return {
            ok: false,
            warning: true,
            latencyMs: 0,
            message: ow.message || 'OPENWA_URL belum diatur di environment server.',
            details: ow,
          };
        }
        const wdNote = ow.watchdogActive
          ? ` • Auto-Watchdog 5m${ow.autoRestartCount ? ` (Auto-start: ${ow.autoRestartCount}x)` : ''}`
          : '';
        return {
          ok: !!ow.ok,
          warning: !ow.ok && ow.status === 'SCAN_QR',
          latencyMs: Number(ow.latencyMs) || 0,
          message: `${ow.message || ow.status || 'Tidak aktif'}${wdNote}`,
          details: ow,
        };
      },
      telegram_bot: async () => {
        const { data } = await fetchServerHealth();
        const tg = data.telegram || {};
        return {
          ok: !!tg.ok,
          warning: !tg.configured,
          latencyMs: 0,
          message: tg.message || (tg.configured ? 'Bot Telegram aktif' : 'TELEGRAM_BOT_TOKEN belum diatur'),
        };
      },
      media_drive: async () => {
        const { data } = await fetchServerHealth();
        const md = data.media || {};
        return {
          ok: !!md.ok,
          warning: !md.configured,
          latencyMs: 0,
          message: md.message || (md.configured ? 'Google Drive Media (GAS) siap' : 'GAS_WEBAPP_URL belum diatur'),
        };
      },
      server_memory: async () => {
        const { data, lat } = await fetchServerHealth();
        const mem = data.memory || {};
        const rssMb = Math.round((Number(mem.rss) || 0) / (1024 * 1024));
        const heapUsedMb = Math.round((Number(mem.heapUsed) || 0) / (1024 * 1024));
        const heapTotalMb = Math.round((Number(mem.heapTotal) || 0) / (1024 * 1024));
        const highUsage = rssMb > 1536;
        return {
          ok: !highUsage && (rssMb > 0 || heapUsedMb > 0),
          warning: highUsage,
          latencyMs: lat,
          message: `RSS ${rssMb} MB • Heap ${heapUsedMb}/${heapTotalMb || heapUsedMb} MB`,
          details: mem,
        };
      },
      face_ai: async () => {
        if (typeof window !== 'undefined' && typeof window.checkHumanJsCache === 'function') {
          const cached = await window.checkHumanJsCache();
          return {
            ok: !!cached,
            warning: !cached,
            message: cached ? 'Model Human.js Offline Ready di Cache' : 'Cache model belum diunduh (butuh internet)',
          };
        }
        const humanLoaded = typeof window !== 'undefined' && Boolean(window.Human || window.HumanInstance);
        let idbAvailable = false;
        if (typeof indexedDB !== 'undefined') {
          try {
            if (typeof indexedDB.databases === 'function') {
              const dbs = await indexedDB.databases();
              idbAvailable = Array.isArray(dbs) && dbs.some((d) => /human|tensorflow|tfjs/i.test(d.name || ''));
            } else {
              idbAvailable = true;
            }
          } catch (_) {
            idbAvailable = false;
          }
        }
        return {
          ok: true,
          message: humanLoaded
            ? 'Runtime Human.js Aktif'
            : (idbAvailable ? 'Cache Model IndexedDB Tersedia' : 'Modul Face AI Siap'),
        };
      },
      client_env: async () => {
        const gpsOk = typeof navigator !== 'undefined' && Boolean(navigator.geolocation);
        const idbOk = typeof indexedDB !== 'undefined';
        const lsOk = typeof localStorage !== 'undefined';
        const allOk = gpsOk && idbOk && lsOk;
        return {
          ok: allOk,
          warning: !allOk,
          message: allOk
            ? 'GPS Geolocation, IndexedDB & LocalStorage Siap'
            : `Terbatas (GPS: ${gpsOk ? 'OK' : 'Off'}, Storage: ${idbOk && lsOk ? 'OK' : 'Off'})`,
        };
      },
    };
  }

  return {
    log,
    getLogs,
    clearLogs,
    exportLogs,
    runDiagnostics,
  };
}

// ── Tracking developer: klik tombol + kegagalan fungsi/API per user ──
// Pipeline terpisah dari DEV_TRACKER.log() (diagnostik lokal). Event diantre di
// memori lalu dikirim batch ke POST /api/dev/track; identitas user diambil server
// dari sesi, bukan dari klien.
export const TRACK_ENDPOINT = '/api/dev/track';
export const TRACK_SELECTOR = 'button, [onclick], [role="button"], a[href]';
export const DEV_PANEL_SELECTOR = '#adminSectionDev, #devHealthCard, #devLogCard, #devTrackCard';
const TRACK_MAX_QUEUE = 500;
const TRACK_FLUSH_AT = 20;
const TRACK_BATCH = 50;
const TRACK_KEEPALIVE_BYTES = 60000; // batas body fetch keepalive browser = 64KB

// Label tombol: aria-label -> teks -> id -> nama tag.
export function trackLabelFor(el) {
  if (!el) return '';
  const aria = el.getAttribute?.('aria-label');
  if (aria && String(aria).trim()) return String(aria).trim().slice(0, 80);
  const text = String(el.innerText ?? el.textContent ?? '').replace(/\s+/g, ' ').trim();
  if (text) return text.slice(0, 80);
  if (el.id) return String(el.id).slice(0, 80);
  return String(el.tagName || '').toLowerCase();
}

// Buang query/hash: URL bisa membawa token atau NIP.
export function trackStripQuery(url) {
  return String(url ?? '').split(/[?#]/)[0].slice(0, 200);
}

function trackClampDetail(detail) {
  const out = {};
  for (const [k, v] of Object.entries(detail && typeof detail === 'object' ? detail : {})) {
    out[k] = typeof v === 'string' ? v.slice(0, k === 'stack' ? 1500 : 500) : v;
  }
  return out;
}

function trackTakeBatch(queue, maxCount, maxBytes) {
  const batch = [];
  let bytes = 0;
  for (const ev of queue) {
    if (batch.length >= maxCount) break;
    bytes += JSON.stringify(ev).length;
    if (batch.length && bytes > maxBytes) break;
    batch.push(ev);
  }
  return batch;
}

export function createTrackQueue(options = {}) {
  const endpoint = options.endpoint || TRACK_ENDPOINT;
  const maxQueue = options.maxQueue || TRACK_MAX_QUEUE;
  const flushAt = options.flushAt || TRACK_FLUSH_AT;
  const batchSize = options.batchSize || TRACK_BATCH;
  const now = options.now || (() => Date.now());
  const getPage = options.getPage || (() => '');
  const send = options.fetchImpl || ((...a) => globalThis.fetch(...a));

  const queue = [];
  let flushing = false;

  // Gagal jaringan / non-OK: event tetap di antrean, dicoba lagi flush berikutnya.
  async function flushNow({ keepalive = false } = {}) {
    if (flushing || !queue.length) return false;
    flushing = true;
    try {
      let sent = false;
      do {
        const batch = trackTakeBatch(queue, batchSize, keepalive ? TRACK_KEEPALIVE_BYTES : Infinity);
        const res = await send(endpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ events: batch }),
          keepalive,
        });
        // 400 = batch ditolak server karena bentuknya; dibuang agar tidak macet.
        if (!(res && (res.ok || res.status === 400))) break;
        queue.splice(0, batch.length);
        sent = true;
      } while (queue.length > 0 && !keepalive);
      return sent;
    } catch (_) {
      return false;
    } finally {
      flushing = false;
    }
  }

  function track(kind, data = {}) {
    queue.push({
      kind,
      ts: now(),
      page: String(getPage() || '').slice(0, 200),
      label: String(data.label ?? '').slice(0, 300),
      detail: trackClampDetail(data.detail),
    });
    while (queue.length > maxQueue) queue.shift();
    if (queue.length >= flushAt) flushNow().catch(() => {});
  }

  return { track, flushNow, queue };
}

// Bungkus fetch untuk menangkap kegagalan API. Perilaku app tidak berubah:
// response dikembalikan apa adanya, error dilempar ulang. Request ke endpoint
// tracking sendiri dilewati agar tidak berputar (loop guard).
export function wrapFetchForTracking(origFetch, track) {
  return async function trackedFetch(input, init) {
    const url = typeof input === 'string' ? input : (input && input.url) || String(input ?? '');
    const method = String((init && init.method) || (input && input.method) || 'GET').toUpperCase();
    const skip = url.includes(TRACK_ENDPOINT);
    try {
      const res = await origFetch.call(this, input, init);
      if (!skip && res && res.status >= 400) {
        track('api_fail', { label: trackStripQuery(url), detail: { url: trackStripQuery(url), method, status: res.status } });
      }
      return res;
    } catch (e) {
      if (!skip && !(e && e.name === 'AbortError')) {
        track('api_fail', { label: trackStripQuery(url), detail: { url: trackStripQuery(url), method, status: 0, message: String(e && e.message || e) } });
      }
      throw e;
    }
  };
}

// Inisialisasi global jika di lingkungan browser
if (typeof window !== 'undefined') {
  window.createDevTracker = createDevTracker;
  if (!window.DEV_TRACKER) {
    window.DEV_TRACKER = createDevTracker();

    // Auto-capture global runtime errors
    window.addEventListener('error', (event) => {
      try {
        window.DEV_TRACKER.log('ERROR', 'RUNTIME', event.message || 'Uncaught Error', {
          filename: event.filename,
          lineno: event.lineno,
          colno: event.colno,
          stack: event.error?.stack || null,
        });
        window.__devTrack?.track('error', {
          label: event.message || 'Uncaught Error',
          detail: { filename: event.filename, lineno: event.lineno, colno: event.colno, stack: event.error?.stack || null },
        });
      } catch (_) {}
    });

    window.addEventListener('unhandledrejection', (event) => {
      try {
        const reason = event.reason;
        window.DEV_TRACKER.log('ERROR', 'PROMISE', reason?.message || String(reason), {
          stack: reason?.stack || null,
        });
        window.__devTrack?.track('error', {
          label: reason?.message || String(reason),
          detail: { source: 'promise', stack: reason?.stack || null },
        });
      } catch (_) {}
    });
  }

  // Pipeline tracking klik + kegagalan per user (kirim batch ke server).
  // __devTrack dibuka hanya untuk pengujian; tanpa UI.
  if (!window.__devTrack) {
    const tq = createTrackQueue({
      getPage: () => window.location.pathname,
      fetchImpl: (...a) => window.fetch(...a),
    });
    window.__devTrack = tq;

    window.fetch = wrapFetchForTracking(window.fetch, tq.track);

    document.addEventListener('click', (ev) => {
      try {
        const el = ev.target?.closest?.(TRACK_SELECTOR);
        if (!el || el.closest(DEV_PANEL_SELECTOR)) return;
        const href = el.tagName === 'A' ? trackStripQuery(el.getAttribute('href')) : undefined;
        tq.track('click', { label: trackLabelFor(el), detail: { id: el.id || undefined, href } });
      } catch (_) {}
    }, true);

    setInterval(() => { tq.flushNow(); }, 15000);
    window.addEventListener('pagehide', () => { tq.flushNow({ keepalive: true }); });
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'hidden') tq.flushNow({ keepalive: true });
    });
  }

  function escapeHtml(val) {
    return String(val ?? '').replace(/[&<>"']/g, (c) => ({
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#39;',
    }[c]));
  }

  function updateDiagMetaUI(diag) {
    if (!diag) return;
    const badge = document.getElementById('devDiagScoreBadge');
    if (badge) {
      badge.textContent = `Skor: ${diag.score}% (${diag.passed}/${diag.total})`;
      const allGood = diag.failed === 0 && diag.score === 100;
      const warnOnly = diag.failed === 0 && diag.score < 100;
      badge.className = allGood
        ? 'inline-flex items-center px-3 py-1 rounded-full bg-emerald-100 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 text-xs font-bold font-mono tabular-nums'
        : warnOnly
          ? 'inline-flex items-center px-3 py-1 rounded-full bg-amber-100 dark:bg-amber-950/60 text-amber-700 dark:text-amber-300 text-xs font-bold font-mono tabular-nums'
          : 'inline-flex items-center px-3 py-1 rounded-full bg-rose-100 dark:bg-rose-950/60 text-rose-700 dark:text-rose-300 text-xs font-bold font-mono tabular-nums';
    }

    const summary = document.getElementById('devDiagSummary');
    if (summary) {
      summary.classList.remove('hidden');
      summary.style.display = 'block';
      const timeStr = new Date().toLocaleTimeString('id-ID', {
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        timeZone: 'Asia/Makassar',
      });
      summary.innerHTML = `<span class="font-bold text-slate-900 dark:text-white">Hasil Pengujian:</span> ${diag.passed} dari ${diag.total} subsistem operasional (<span class="font-mono font-bold tabular-nums">${diag.score}%</span>) &bull; Diperiksa pukul <span class="font-mono tabular-nums">${escapeHtml(timeStr)} WITA</span>.`;
    }
  }

  // Helper UI functions (Stitch UI Design System)
  window.renderDevHealthMatrix = async function (diagResults = null) {
    const container = document.getElementById('devHealthMatrix');
    if (!container) return;

    let results = diagResults;
    if (!results && window.DEV_TRACKER) {
      container.innerHTML = `
        <div class="col-span-full py-6 px-4 rounded-2xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700/80 flex items-center justify-center gap-2 text-xs font-medium text-slate-500 dark:text-slate-400">
          <span class="material-symbols-outlined text-[18px] text-[#2563eb] animate-spin">progress_activity</span>
          <span>Memeriksa status kesehatan 8 subsistem...</span>
        </div>`;
      try {
        const diag = await window.DEV_TRACKER.runDiagnostics();
        results = diag.results;
        updateDiagMetaUI(diag);
      } catch (e) {
        container.innerHTML = `
          <div class="col-span-full p-4 rounded-2xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800/60 text-xs font-semibold text-rose-700 dark:text-rose-300">
            Gagal memuat diagnostik: ${escapeHtml(e.message)}
          </div>`;
        return;
      }
    }

    if (!results) return;

    const subsysLabels = {
      database: { name: 'PostgreSQL Database', icon: 'database' },
      backend_api: { name: 'Backend Express & Cron', icon: 'dns' },
      openwa_gateway: { name: 'OpenWA WhatsApp Gateway', icon: 'chat' },
      telegram_bot: { name: 'Telegram Bot Gateway', icon: 'send' },
      media_drive: { name: 'Google Drive Media (GAS)', icon: 'cloud_done' },
      server_memory: { name: 'Memori Server Node.js', icon: 'memory' },
      face_ai: { name: 'Face AI Biometrik', icon: 'face' },
      client_env: { name: 'GPS & Client Storage', icon: 'my_location' },
    };

    let html = '';
    for (const [key, res] of Object.entries(results)) {
      const meta = subsysLabels[key] || { name: key.toUpperCase(), icon: 'settings' };
      const isOk = res.status === 'OK';
      const isWarn = res.status === 'WARN';
      const iconTone = isOk
        ? 'bg-emerald-50 dark:bg-emerald-950/60 text-emerald-600 dark:text-emerald-400'
        : isWarn
          ? 'bg-amber-50 dark:bg-amber-950/60 text-amber-600 dark:text-amber-400'
          : 'bg-rose-50 dark:bg-rose-950/60 text-rose-600 dark:text-rose-400';
      const badgeTone = isOk
        ? 'bg-emerald-100 dark:bg-emerald-950/70 text-emerald-700 dark:text-emerald-300 border-emerald-200/80 dark:border-emerald-800/70'
        : isWarn
          ? 'bg-amber-100 dark:bg-amber-950/70 text-amber-700 dark:text-amber-300 border-amber-200/80 dark:border-amber-800/70'
          : 'bg-rose-100 dark:bg-rose-950/70 text-rose-700 dark:text-rose-300 border-rose-200/80 dark:border-rose-800/70';
      const statusTextTone = isOk
        ? 'text-emerald-600 dark:text-emerald-400'
        : isWarn
          ? 'text-amber-600 dark:text-amber-400'
          : 'text-rose-600 dark:text-rose-400';
      const statusLabel = isOk ? 'Normal' : (isWarn ? 'Warning' : 'Error');

      html += `
        <div class="p-3.5 rounded-2xl bg-slate-50 dark:bg-slate-800/70 border border-slate-200/90 dark:border-slate-700/80 flex flex-col justify-between gap-2.5 transition-colors">
          <div class="flex items-start justify-between gap-2">
            <div class="flex items-center gap-2.5 min-w-0">
              <span class="w-8 h-8 rounded-xl ${iconTone} flex items-center justify-center shrink-0">
                <span class="material-symbols-outlined text-[18px]">${meta.icon}</span>
              </span>
              <strong class="text-xs font-bold text-slate-900 dark:text-white leading-snug truncate">${escapeHtml(meta.name)}</strong>
            </div>
            <span class="px-2 py-0.5 rounded-full border text-[10px] font-bold shrink-0 ${badgeTone}">
              ${statusLabel}
            </span>
          </div>
          <p class="text-[11px] text-slate-600 dark:text-slate-300 leading-relaxed break-words">
            ${escapeHtml(res.message || '-')}
          </p>
          <div class="flex items-center justify-between gap-2 pt-2 border-t border-slate-200/70 dark:border-slate-700/70 text-[10.5px] text-slate-500 dark:text-slate-400">
            <span>Latensi: <strong class="font-mono tabular-nums text-slate-800 dark:text-slate-200">${Number(res.latencyMs) || 0} ms</strong></span>
            ${key === 'openwa_gateway'
              ? `<div class="flex items-center gap-1.5 flex-wrap justify-end">
                   <button type="button" onclick="restartOpenwaFromDev(this)" class="inline-flex items-center gap-1 px-2 py-1 rounded-lg bg-[#2563eb] hover:bg-blue-700 text-white text-[10px] font-bold transition-colors cursor-pointer"><span class="material-symbols-outlined text-[13px]">restart_alt</span><span>Start</span></button>
                   <button type="button" onclick="showOpenwaQrFromDev()" class="inline-flex items-center gap-1 px-2 py-1 rounded-lg bg-slate-200/80 dark:bg-slate-700 hover:bg-slate-300 dark:hover:bg-slate-600 text-slate-800 dark:text-slate-100 text-[10px] font-bold transition-colors cursor-pointer"><span class="material-symbols-outlined text-[13px]">qr_code_2</span><span>QR</span></button>
                   <button type="button" onclick="testOpenwaFromDev()" class="inline-flex items-center gap-1 px-2 py-1 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-[10px] font-bold transition-colors cursor-pointer"><span class="material-symbols-outlined text-[13px]">send</span><span>Tes</span></button>
                 </div>`
              : `<span>Status: <strong class="font-mono ${statusTextTone}">${escapeHtml(res.status)}</strong></span>`}
          </div>
        </div>
      `;
    }

    container.innerHTML = html;
  };

  window.renderDevLogTable = function () {
    const container = document.getElementById('devLogViewer');
    if (!container || !window.DEV_TRACKER) return;

    const level = (document.getElementById('devLogLevelFilter')?.value) || 'ALL';
    const search = (document.getElementById('devLogSearchInput')?.value) || '';

    const logs = window.DEV_TRACKER.getLogs({ level, search });

    if (!logs.length) {
      container.innerHTML = `
        <div class="py-8 px-4 rounded-2xl bg-slate-50 dark:bg-slate-800/60 border border-dashed border-slate-200 dark:border-slate-700 text-center text-xs text-slate-500 dark:text-slate-400">
          Tidak ada log aktivitas sesuai kriteria filter.
        </div>`;
      return;
    }

    let html = '';
    for (const l of logs) {
      const isErr = l.level === 'ERROR';
      const isWarn = l.level === 'WARN';
      const isDebug = l.level === 'DEBUG';
      const badgeTone = isErr
        ? 'bg-rose-100 dark:bg-rose-950/70 text-rose-700 dark:text-rose-300'
        : isWarn
          ? 'bg-amber-100 dark:bg-amber-950/70 text-amber-700 dark:text-amber-300'
          : isDebug
            ? 'bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-300'
            : 'bg-blue-100 dark:bg-blue-950/70 text-[#2563eb] dark:text-blue-300';

      const detailsJson = l.details ? escapeHtml(JSON.stringify(l.details, null, 2)) : '';
      const hasDetails = Boolean(detailsJson);

      html += `
        <div class="p-3 rounded-2xl bg-slate-50 dark:bg-slate-800/70 border border-slate-200/80 dark:border-slate-700/80 flex flex-col gap-1.5">
          <div class="flex flex-wrap items-center justify-between gap-2 text-xs">
            <div class="flex flex-wrap items-center gap-1.5 min-w-0">
              <span class="px-2 py-0.5 rounded-md font-mono font-bold text-[10px] shrink-0 ${badgeTone}">${escapeHtml(l.level)}</span>
              <span class="font-mono font-bold text-[11px] text-[#2563eb] dark:text-blue-400 shrink-0">[${escapeHtml(l.module)}]</span>
              <span class="font-semibold text-slate-800 dark:text-slate-100 break-words">${escapeHtml(l.action)}</span>
            </div>
            <span class="font-mono tabular-nums text-[10.5px] text-slate-500 dark:text-slate-400 shrink-0">${escapeHtml(l.timeWita || l.timestamp)}</span>
          </div>
          ${hasDetails ? `
            <details class="mt-0.5">
              <summary class="cursor-pointer text-[11px] font-medium text-slate-500 dark:text-slate-400 hover:text-[#2563eb] dark:hover:text-blue-400 select-none">Detail Payload / Stack Trace</summary>
              <pre class="mt-1.5 p-2.5 rounded-xl bg-slate-900 text-slate-100 font-mono text-[10.5px] overflow-x-auto leading-relaxed">${detailsJson}</pre>
            </details>
          ` : ''}
        </div>
      `;
    }

    container.innerHTML = html;
  };

  // ── Viewer User Tracking (data terpusat dari /api/dev/track) ──
  // Kartu dibuat dari JS di bawah #devLogCard (markup HTML tidak disentuh); kelas
  // dan data-admin-tab disalin dari kartu log agar ikut tab/tema yang sama.
  const trk = { days: 7, nip: '', kind: '', rows: [], next: null, loadedAt: 0, loading: false };
  const TRK_KIND_TONE = {
    click: 'bg-blue-100 dark:bg-blue-950/70 text-[#2563eb] dark:text-blue-300',
    error: 'bg-rose-100 dark:bg-rose-950/70 text-rose-700 dark:text-rose-300',
    api_fail: 'bg-amber-100 dark:bg-amber-950/70 text-amber-700 dark:text-amber-300',
  };
  const TRK_NOTE = 'py-6 px-4 rounded-2xl bg-slate-50 dark:bg-slate-800/60 border border-dashed border-slate-200 dark:border-slate-700 text-center text-xs text-slate-500 dark:text-slate-400';

  function trkWita(ts) {
    const d = new Date(ts);
    if (Number.isNaN(d.getTime())) return String(ts ?? '');
    return d.toLocaleString('id-ID', { timeZone: 'Asia/Makassar', day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit', second: '2-digit' });
  }

  async function trkGet(path) {
    const res = await fetch(path, { headers: getDevBearerHeaders(false) });
    const data = await res.json().catch(() => ({}));
    if (res.status === 403) { const e = new Error('forbidden'); e.code = 403; throw e; }
    if (!res.ok || !data.ok) throw new Error(data.message || `HTTP ${res.status}`);
    return data;
  }

  function trkEnsureCard() {
    let card = document.getElementById('devTrackCard');
    if (card) return card;
    const anchor = document.getElementById('devLogCard');
    if (!anchor || !anchor.parentNode) return null;
    card = document.createElement('div');
    card.id = 'devTrackCard';
    card.className = anchor.className;
    const tab = anchor.getAttribute('data-admin-tab');
    if (tab) card.setAttribute('data-admin-tab', tab);
    card.innerHTML = `
      <div class="flex flex-wrap items-center justify-between gap-2">
        <div class="min-w-0">
          <h3 class="font-bold text-sm text-slate-900 dark:text-white">User Tracking</h3>
          <p class="text-xs text-slate-500 dark:text-slate-400">Klik tombol dan kegagalan fungsi/API per user (terpusat).</p>
        </div>
        <div class="flex items-center gap-2">
          <select id="devTrackDays" class="text-xs rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 px-2 py-1">
            <option value="7">7 hari</option>
            <option value="30">30 hari</option>
          </select>
          <button type="button" id="devTrackRefresh" class="text-xs font-semibold px-3 py-1 rounded-lg bg-blue-100 dark:bg-blue-950/60 text-[#2563eb] dark:text-blue-300">Refresh</button>
        </div>
      </div>
      <div id="devTrackSummary"></div>
      <div id="devTrackFilters" class="flex flex-wrap items-center gap-1.5"></div>
      <div id="devTrackList" class="flex flex-col gap-2"></div>
      <button type="button" id="devTrackMore" class="hidden self-center text-xs font-semibold px-4 py-1.5 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200">Muat lebih</button>`;
    anchor.parentNode.insertBefore(card, anchor.nextSibling);
    if (window.StitchPicker && typeof window.StitchPicker.enhanceSelect === 'function') {
      window.StitchPicker.enhanceSelect('devTrackDays', { searchable: false });
    }
    card.querySelector('#devTrackDays').addEventListener('change', (e) => {
      trk.days = Number(e.target.value) || 7;
      window.renderDevTrackViewer({ force: true });
    });
    card.querySelector('#devTrackRefresh').addEventListener('click', () => window.renderDevTrackViewer({ force: true }));
    card.querySelector('#devTrackMore').addEventListener('click', () => trkLoadEvents(false));
    card.querySelector('#devTrackSummary').addEventListener('click', (e) => {
      const row = e.target.closest('[data-nip]');
      if (!row) return;
      trk.nip = trk.nip === row.dataset.nip ? '' : row.dataset.nip;
      trkLoadEvents(true);
      trkRenderFilters();
    });
    card.querySelector('#devTrackFilters').addEventListener('click', (e) => {
      const chip = e.target.closest('[data-kind]');
      if (!chip) return;
      if (chip.dataset.kind === '__nip') trk.nip = '';
      else trk.kind = chip.dataset.kind;
      trkLoadEvents(true);
      trkRenderFilters();
    });
    return card;
  }

  function trkRenderFilters() {
    const box = document.getElementById('devTrackFilters');
    if (!box) return;
    const chip = (kind, label) => {
      const on = trk.kind === kind;
      const tone = on ? 'bg-[#2563eb] text-white' : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300';
      return `<button type="button" data-kind="${kind}" class="text-[11px] font-semibold px-2.5 py-1 rounded-full ${tone}">${label}</button>`;
    };
    box.innerHTML = chip('', 'Semua') + chip('click', 'click') + chip('error', 'error') + chip('api_fail', 'api_fail')
      + (trk.nip ? `<button type="button" data-kind="__nip" class="text-[11px] font-mono font-semibold px-2.5 py-1 rounded-full bg-amber-100 dark:bg-amber-950/60 text-amber-700 dark:text-amber-300">NIP ${escapeHtml(trk.nip)} &times;</button>` : '');
  }

  function trkRenderSummary(rows) {
    const box = document.getElementById('devTrackSummary');
    if (!box) return;
    if (!rows.length) { box.innerHTML = `<div class="${TRK_NOTE}">Belum ada data tracking</div>`; return; }
    box.innerHTML = `<div class="overflow-x-auto"><table class="w-full text-xs">
      <thead><tr class="text-left text-slate-500 dark:text-slate-400"><th class="py-1 pr-3">User</th><th class="py-1 pr-3 text-right">Klik</th><th class="py-1 pr-3 text-right">Error</th><th class="py-1 pr-3 text-right">API gagal</th><th class="py-1">Terakhir aktif</th></tr></thead>
      <tbody>${rows.map((r) => `
        <tr data-nip="${escapeHtml(r.user_nip)}" class="cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-800/60 ${trk.nip === r.user_nip ? 'bg-blue-50 dark:bg-blue-950/30' : ''}">
          <td class="py-1.5 pr-3"><span class="font-semibold text-slate-800 dark:text-slate-100">${escapeHtml(r.user_nama || '-')}</span> <span class="font-mono text-[10.5px] text-slate-500 dark:text-slate-400">${escapeHtml(r.user_nip)}</span></td>
          <td class="py-1.5 pr-3 text-right font-mono tabular-nums">${Number(r.clicks) || 0}</td>
          <td class="py-1.5 pr-3 text-right font-mono tabular-nums text-rose-600 dark:text-rose-400">${Number(r.errors) || 0}</td>
          <td class="py-1.5 pr-3 text-right font-mono tabular-nums text-amber-600 dark:text-amber-400">${Number(r.api_fails) || 0}</td>
          <td class="py-1.5 font-mono text-[10.5px] text-slate-500 dark:text-slate-400">${escapeHtml(trkWita(r.last_seen))}</td>
        </tr>`).join('')}
      </tbody></table></div>`;
  }

  function trkRenderRows() {
    const list = document.getElementById('devTrackList');
    const more = document.getElementById('devTrackMore');
    if (!list) return;
    if (more) more.classList.toggle('hidden', !trk.next);
    if (!trk.rows.length) { list.innerHTML = `<div class="${TRK_NOTE}">Belum ada data tracking</div>`; return; }
    list.innerHTML = trk.rows.map((r) => {
      const detail = r.detail && Object.keys(r.detail).length ? escapeHtml(JSON.stringify(r.detail, null, 2)) : '';
      return `
        <div class="p-3 rounded-2xl bg-slate-50 dark:bg-slate-800/70 border border-slate-200/80 dark:border-slate-700/80 flex flex-col gap-1">
          <div class="flex flex-wrap items-center justify-between gap-2 text-xs">
            <div class="flex flex-wrap items-center gap-1.5 min-w-0">
              <span class="px-2 py-0.5 rounded-md font-mono font-bold text-[10px] shrink-0 ${TRK_KIND_TONE[r.kind] || ''}">${escapeHtml(r.kind)}</span>
              <span class="font-semibold text-slate-800 dark:text-slate-100 break-words">${escapeHtml(r.label || '-')}</span>
            </div>
            <span class="font-mono tabular-nums text-[10.5px] text-slate-500 dark:text-slate-400 shrink-0">${escapeHtml(trkWita(r.ts))}</span>
          </div>
          <div class="text-[11px] text-slate-500 dark:text-slate-400">${escapeHtml(r.user_nama || '-')} <span class="font-mono">${escapeHtml(r.user_nip)}</span> &bull; <span class="font-mono">${escapeHtml(r.page)}</span></div>
          ${detail ? `<details><summary class="cursor-pointer text-[11px] font-medium text-slate-500 dark:text-slate-400 select-none">Detail</summary><pre class="mt-1.5 p-2.5 rounded-xl bg-slate-900 text-slate-100 font-mono text-[10.5px] overflow-x-auto leading-relaxed">${detail}</pre></details>` : ''}
        </div>`;
    }).join('');
  }

  function trkShowError(e) {
    const msg = e && e.code === 403 ? 'Fitur ini hanya untuk media/admin' : `Gagal memuat tracking: ${e && e.message ? e.message : e}`;
    const note = `<div class="${TRK_NOTE}">${escapeHtml(msg)}</div>`;
    const s = document.getElementById('devTrackSummary');
    const l = document.getElementById('devTrackList');
    if (s) s.innerHTML = note;
    if (l) l.innerHTML = '';
    const more = document.getElementById('devTrackMore');
    if (more) more.classList.add('hidden');
  }

  async function trkLoadEvents(reset) {
    const params = new URLSearchParams({ limit: '100' });
    if (trk.nip) params.set('nip', trk.nip);
    if (trk.kind) params.set('kind', trk.kind);
    if (!reset && trk.next) params.set('before_id', trk.next);
    try {
      const data = await trkGet(`/api/dev/track/events?${params}`);
      trk.rows = reset ? data.data : trk.rows.concat(data.data);
      trk.next = data.next_before_id || null;
      trkRenderRows();
    } catch (e) { trkShowError(e); }
  }

  window.renderDevTrackViewer = async function (opts = {}) {
    const card = trkEnsureCard();
    if (!card) return;
    // Dipanggil otomatis bersama renderDevLogTable (tiap ketikan filter log);
    // muat ulang dari server hanya bila data sudah > 10 dtk atau diminta paksa.
    if (trk.loading || (!opts.force && Date.now() - trk.loadedAt < 10000)) return;
    trk.loading = true;
    try {
      const l = document.getElementById('devTrackList');
      if (l && !trk.rows.length) l.innerHTML = `<div class="${TRK_NOTE}">Memuat...</div>`;
      trkRenderFilters();
      const sum = await trkGet(`/api/dev/track/summary?days=${trk.days}`);
      trkRenderSummary(sum.data || []);
      await trkLoadEvents(true);
    } catch (e) {
      trkShowError(e);
    } finally {
      // Termasuk saat gagal (mis. 403): jangan menembak ulang server tiap ketikan filter log.
      trk.loadedAt = Date.now();
      trk.loading = false;
    }
  };

  // Setiap pembukaan panel dev memanggil renderDevLogTable; viewer ikut dimuat
  // di sana supaya titik panggil di ui.js/stitch-app.js/admin tidak perlu diubah.
  const baseRenderDevLogTable = window.renderDevLogTable;
  window.renderDevLogTable = function () {
    const out = baseRenderDevLogTable.apply(this, arguments);
    window.renderDevTrackViewer();
    return out;
  };

  window.runDevDiagnostics = async function () {
    const buttons = ['btnRunDevDiag', 'btnRunDiagnostics']
      .map((id) => document.getElementById(id))
      .filter(Boolean);
    const savedHtml = buttons.map((b) => b.innerHTML);

    buttons.forEach((btn) => {
      btn.disabled = true;
      btn.innerHTML = '<span class="material-symbols-outlined text-[18px] animate-spin">progress_activity</span><span>Memeriksa 8 Subsistem...</span>';
    });

    try {
      if (window.DEV_TRACKER) {
        const diag = await window.DEV_TRACKER.runDiagnostics();
        updateDiagMetaUI(diag);
        if (window.renderDevHealthMatrix) await window.renderDevHealthMatrix(diag.results);
        if (window.renderDevLogTable) window.renderDevLogTable();
        return diag;
      }
      return null;
    } catch (e) {
      if (typeof window.showDynamicIsland === 'function') {
        window.showDynamicIsland({ type: 'error', title: 'Diagnostik Gagal', message: e.message });
      } else if (window.Swal) {
        window.Swal.fire('Diagnostik Gagal', e.message, 'error');
      } else {
        alert('Gagal menjalankan diagnostik: ' + e.message);
      }
      return null;
    } finally {
      buttons.forEach((btn, idx) => {
        btn.disabled = false;
        btn.innerHTML = savedHtml[idx];
      });
    }
  };

  window.exportDevLogs = function (fmt = 'json') {
    if (!window.DEV_TRACKER) return;
    const content = window.DEV_TRACKER.exportLogs(fmt);
    const mime = fmt === 'json' ? 'application/json' : 'text/plain';
    const blob = new Blob([content], { type: mime });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `absensi_dev_logs_${new Date().toISOString().slice(0, 10)}.${fmt}`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  window.clearDevLogs = async function () {
    let confirmed = false;
    if (window.Swal) {
      const r = await window.Swal.fire({
        title: 'Bersihkan Log Developer?',
        text: 'Seluruh riwayat log aktivitas & error lokal akan dihapus.',
        icon: 'warning',
        showCancelButton: true,
        confirmButtonColor: '#2563eb',
        cancelButtonColor: '#64748b',
        confirmButtonText: 'Ya, Bersihkan',
        cancelButtonText: 'Batal',
      });
      confirmed = Boolean(r.isConfirmed);
    } else {
      confirmed = confirm('Yakin ingin membersihkan seluruh riwayat log developer?');
    }
    if (confirmed && window.DEV_TRACKER) {
      window.DEV_TRACKER.clearLogs();
      if (window.renderDevLogTable) window.renderDevLogTable();
      if (typeof window.showDynamicIsland === 'function') {
        window.showDynamicIsland({ type: 'info', title: 'Log Dibersihkan', message: 'Riwayat log developer telah dikosongkan.' });
      }
    }
  };

  window.restartOpenwaFromDev = async function (btnEl) {
    const origHtml = btnEl ? btnEl.innerHTML : '';
    if (btnEl) {
      btnEl.disabled = true;
      btnEl.innerHTML = '<span class="material-symbols-outlined text-[13px] animate-spin">progress_activity</span><span>Memulai...</span>';
    }
    try {
      const headers = { 'Content-Type': 'application/json' };
      const tok = (typeof window.getStitchToken === 'function' && window.getStitchToken())
        || localStorage.getItem('_native_token')
        || localStorage.getItem('native_token')
        || localStorage.getItem('_sess_token')
        || '';
      if (tok) headers['Authorization'] = 'Bearer ' + tok;

      const res = await fetch('/api/dev/openwa/restart', { method: 'POST', headers });
      const data = await res.json().catch(() => ({}));
      if (res.ok && data.ok) {
        window.DEV_TRACKER?.log('INFO', 'OPENWA', data.message || 'Restart OpenWA dikirim', data);
        if (typeof window.showDynamicIsland === 'function') {
          window.showDynamicIsland({ type: 'success', title: 'OpenWA Dimulai Ulang', message: data.message || 'Sesi OpenWA sedang dinyalakan.' });
        } else if (window.Swal) {
          window.Swal.fire({ icon: 'success', title: 'OpenWA Dimulai Ulang', text: data.message || 'Sesi OpenWA sedang dinyalakan.' });
        }
        setTimeout(() => { window.runDevDiagnostics?.(); }, 1500);
      } else {
        const msg = data.message || `HTTP ${res.status}`;
        window.DEV_TRACKER?.log('ERROR', 'OPENWA', `Gagal restart OpenWA: ${msg}`, data);
        if (window.Swal) {
          window.Swal.fire({ icon: 'error', title: 'Gagal Restart OpenWA', text: msg });
        } else if (typeof window.showDynamicIsland === 'function') {
          window.showDynamicIsland({ type: 'error', title: 'Gagal Restart OpenWA', message: msg });
        }
      }
    } catch (e) {
      window.DEV_TRACKER?.log('ERROR', 'OPENWA', e.message || 'Gagal menghubungi server');
      if (window.Swal) {
        window.Swal.fire({ icon: 'error', title: 'Koneksi Gagal', text: e.message || 'Gagal menghubungi server' });
      }
    } finally {
      if (btnEl) {
        btnEl.disabled = false;
        btnEl.innerHTML = origHtml;
      }
    }
  };

  function getDevBearerHeaders(withJson = false) {
    const h = withJson ? { 'Content-Type': 'application/json' } : {};
    const tok = (typeof window.getStitchToken === 'function' && window.getStitchToken())
      || localStorage.getItem('_native_token')
      || localStorage.getItem('native_token')
      || localStorage.getItem('_sess_token')
      || '';
    if (tok) h['Authorization'] = 'Bearer ' + tok;
    return h;
  }

  window.showOpenwaQrFromDev = async function () {
    try {
      const res = await fetch('/api/dev/openwa/qr', { headers: getDevBearerHeaders(false) });
      const data = await res.json().catch(() => ({}));
      if (data.alreadyConnected) {
        if (window.Swal) {
          window.Swal.fire({ icon: 'success', title: 'OpenWA Sudah Terhubung', text: data.message });
        }
        return;
      }
      if (!res.ok || !data.ok) {
        if (window.Swal) {
          window.Swal.fire({ icon: 'info', title: 'QR OpenWA Belum Tersedia', text: data.message || `HTTP ${res.status}` });
        }
        return;
      }
      if (window.Swal) {
        const qrHtml = data.qrDataUrl
          ? `<div class="flex flex-col items-center gap-3"><img src="${escapeHtml(data.qrDataUrl)}" alt="QR OpenWA" class="w-60 h-60 rounded-2xl border border-slate-200 p-2 bg-white shadow-sm"><p class="text-xs text-slate-500">Pindai QR ini dari WhatsApp &gt; Perangkat Tertaut.</p></div>`
          : `<pre class="text-[11px] font-mono bg-slate-100 p-3 rounded-xl overflow-x-auto text-left">${escapeHtml(data.qrRaw || '')}</pre>`;
        window.Swal.fire({ title: 'QR Code OpenWA', html: qrHtml, confirmButtonText: 'Tutup', confirmButtonColor: '#2563eb' });
      }
    } catch (e) {
      if (window.Swal) window.Swal.fire({ icon: 'error', title: 'Gagal Mengambil QR', text: e.message || 'Koneksi gagal' });
    }
  };

  window.testOpenwaFromDev = async function () {
    if (!window.Swal) return;
    const saved = localStorage.getItem('stitch_openwa_test_target') || '';
    const ask = await window.Swal.fire({
      title: 'Tes Kirim WhatsApp (OpenWA)',
      input: 'text',
      inputValue: saved,
      inputLabel: 'Nomor HP (0812...) atau JID Grup (... @g.us)',
      inputPlaceholder: 'Contoh: 081234567890',
      showCancelButton: true,
      confirmButtonText: 'Kirim Pesan Tes',
      cancelButtonText: 'Batal',
      confirmButtonColor: '#2563eb',
    });
    if (!ask.isConfirmed || !String(ask.value || '').trim()) return;
    const target = String(ask.value).trim();
    try { localStorage.setItem('stitch_openwa_test_target', target); } catch (_) {}
    try {
      const res = await fetch('/api/dev/openwa/test', {
        method: 'POST',
        headers: getDevBearerHeaders(true),
        body: JSON.stringify({ target }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok && data.ok) {
        window.DEV_TRACKER?.log('INFO', 'OPENWA', data.message || 'Tes WA terkirim', data);
        window.Swal.fire({ icon: 'success', title: 'Pesan WA Terkirim', text: data.message });
      } else {
        window.DEV_TRACKER?.log('ERROR', 'OPENWA', data.message || `HTTP ${res.status}`, data);
        window.Swal.fire({ icon: 'error', title: 'Gagal Kirim WA', text: data.message || `HTTP ${res.status}` });
      }
    } catch (e) {
      window.Swal.fire({ icon: 'error', title: 'Koneksi Gagal', text: e.message || 'Gagal menghubungi server' });
    }
  };
}
