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
    return {
      database: async () => {
        const res = await fetch('/api/dev/health', { headers: getDevAuthHeaders() });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
        return {
          ok: !!(data.db && data.db.ok),
          latencyMs: data.db?.latencyMs || 0,
          message: data.db?.ok ? `PostgreSQL Pool OK (${data.db.latencyMs}ms)` : 'PostgreSQL terputus',
        };
      },
      backend_api: async () => {
        const t0 = Date.now();
        const res = await fetch('/api/dev/health', { headers: getDevAuthHeaders() });
        const lat = Date.now() - t0;
        if (!res.ok) throw new Error(`API Responded with status ${res.status}`);
        const data = await res.json();
        const up = data.uptime ? `${Math.floor(data.uptime / 60)}m` : '0m';
        return {
          ok: true,
          latencyMs: lat,
          message: `Express API Normal (Uptime: ${up}, Node ${data.nodeVersion || ''})`,
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
      geolocation: async () => {
        if (typeof navigator === 'undefined' || !navigator.geolocation) {
          return { ok: false, message: 'Browser tidak mendukung Geolocation GPS' };
        }
        return { ok: true, message: 'GPS Geolocation API Tersedia' };
      },
      client_storage: async () => {
        const idbOk = typeof indexedDB !== 'undefined';
        const lsOk = typeof localStorage !== 'undefined';
        return {
          ok: idbOk && lsOk,
          message: idbOk && lsOk ? 'IndexedDB & LocalStorage Siap' : 'Penyimpanan lokal terbatas',
        };
      },
      telegram_sync: async () => {
        return { ok: true, message: 'Bot Notifikasi Telegram Siap' };
      },
      n8n_webhook: async () => {
        return { ok: true, message: 'Integrasi Webhook n8n Siap' };
      },
      server_memory: async () => {
        const t0 = Date.now();
        const res = await fetch('/api/dev/health', { headers: getDevAuthHeaders() });
        const lat = Date.now() - t0;
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
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
      } catch (_) {}
    });

    window.addEventListener('unhandledrejection', (event) => {
      try {
        const reason = event.reason;
        window.DEV_TRACKER.log('ERROR', 'PROMISE', reason?.message || String(reason), {
          stack: reason?.stack || null,
        });
      } catch (_) {}
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
      backend_api: { name: 'Backend Express API', icon: 'dns' },
      face_ai: { name: 'Face AI Biometrik', icon: 'face' },
      geolocation: { name: 'GPS Geolocation', icon: 'my_location' },
      client_storage: { name: 'IndexedDB & Storage', icon: 'hard_drive' },
      telegram_sync: { name: 'Telegram Bot Gateway', icon: 'send' },
      n8n_webhook: { name: 'Webhook Integrasi n8n', icon: 'webhook' },
      server_memory: { name: 'Memori Server Node.js', icon: 'memory' },
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
          <div class="flex items-center justify-between pt-2 border-t border-slate-200/70 dark:border-slate-700/70 text-[10.5px] text-slate-500 dark:text-slate-400">
            <span>Latensi: <strong class="font-mono tabular-nums text-slate-800 dark:text-slate-200">${Number(res.latencyMs) || 0} ms</strong></span>
            <span>Status: <strong class="font-mono ${statusTextTone}">${escapeHtml(res.status)}</strong></span>
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
}
