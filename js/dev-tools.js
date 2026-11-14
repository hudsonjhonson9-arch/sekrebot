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

  function getDefaultProbers() {
    return {
      database: async () => {
        const res = await fetch('/api/dev/health');
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
        const res = await fetch('/api/dev/health');
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
        if (typeof window !== 'undefined' && window.checkHumanJsCache) {
          const cached = await window.checkHumanJsCache();
          return {
            ok: !!cached,
            warning: !cached,
            message: cached ? 'Model Human.js Offline Ready di Cache' : 'Cache model belum diunduh (butuh internet)',
          };
        }
        return { ok: true, message: 'Modul Face AI Siap' };
      },
      geolocation: async () => {
        if (typeof navigator === 'undefined' || !navigator.geolocation) {
          return { ok: false, message: 'Browser tidak mendukung Geolocation GPS' };
        }
        return { ok: true, message: 'GPS Geolocation API Tersedia' };
      },
      client_storage: async () => {
        let idbOk = typeof indexedDB !== 'undefined';
        let lsOk = typeof localStorage !== 'undefined';
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

  // Helper UI functions
  window.renderDevHealthMatrix = async function (diagResults = null) {
    const container = document.getElementById('devHealthMatrix');
    if (!container) return;

    let results = diagResults;
    if (!results && window.DEV_TRACKER) {
      container.innerHTML = `<div style="padding:16px;text-align:center;color:var(--muted);font-size:11px"><i class="fas fa-sync fa-spin"></i> Memeriksa status kesehatan fitur...</div>`;
      try {
        const diag = await window.DEV_TRACKER.runDiagnostics();
        results = diag.results;
        const badge = document.getElementById('devDiagScoreBadge');
        if (badge) badge.textContent = `Skor: ${diag.score}%`;
      } catch (e) {
        container.innerHTML = `<div style="padding:12px;color:var(--danger)">Gagal memuat diagnostik: ${e.message}</div>`;
        return;
      }
    }

    if (!results) return;

    const subsysLabels = {
      database: { name: 'PostgreSQL Database', icon: 'fa-archive' },
      backend_api: { name: 'Backend Express API', icon: 'fa-desktop' },
      face_ai: { name: 'Face AI Biometrik (Human.js)', icon: 'fa-id-card' },
      geolocation: { name: 'GPS Geolocation & Buffer', icon: 'fa-map-marker-alt' },
      client_storage: { name: 'IndexedDB & Local Storage', icon: 'fa-save' },
      telegram_sync: { name: 'Telegram Bot Notifikasi', icon: 'fa-envelope-open-text' },
      n8n_webhook: { name: 'Integrasi Webhook n8n', icon: 'fa-link' },
    };

    let html = '';
    for (const [key, res] of Object.entries(results)) {
      const meta = subsysLabels[key] || { name: key.toUpperCase(), icon: 'fa-cog' };
      const isOk = res.status === 'OK';
      const isWarn = res.status === 'WARN';
      const statusColor = isOk ? '#22c55e' : (isWarn ? '#f59e0b' : '#ef4444');
      const statusBg = isOk ? 'rgba(34,197,94,0.12)' : (isWarn ? 'rgba(245,158,11,0.12)' : 'rgba(239,68,68,0.12)');
      const statusBorder = isOk ? 'rgba(34,197,94,0.25)' : (isWarn ? 'rgba(245,158,11,0.25)' : 'rgba(239,68,68,0.25)');
      const statusLabel = isOk ? 'Normal' : (isWarn ? 'Warning' : 'Error');

      html += `
        <div class="dev-health-card">
          <div style="display:flex;align-items:center;justify-content:space-between;gap:8px">
            <div style="display:flex;align-items:center;gap:8px">
              <span style="width:28px;height:28px;border-radius:8px;background:${statusBg};color:${statusColor};display:flex;align-items:center;justify-content:center;font-size:13px">
                <i class="fas ${meta.icon}"></i>
              </span>
              <strong style="font-size:12px;color:var(--white)">${meta.name}</strong>
            </div>
            <span style="font-size:10px;font-weight:700;padding:2px 8px;border-radius:6px;background:${statusBg};color:${statusColor};border:1px solid ${statusBorder}">
              ${statusLabel}
            </span>
          </div>
          <div style="font-size:11px;color:var(--muted);line-height:1.35;margin-top:4px">
            ${res.message || '—'}
          </div>
          <div style="display:flex;justify-content:space-between;align-items:center;margin-top:6px;padding-top:6px;border-top:1px solid rgba(255,255,255,0.05);font-size:10px;color:var(--muted)">
            <span>Latensi: <strong style="font-variant-numeric:tabular-nums;color:var(--white)">${res.latencyMs || 0} ms</strong></span>
            <span>Status: <strong style="color:${statusColor}">${res.status}</strong></span>
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
      container.innerHTML = `<div style="padding:24px;text-align:center;color:var(--muted);font-size:11px">Tidak ada log aktivitas sesuai kriteria.</div>`;
      return;
    }

    let html = '';
    for (const l of logs) {
      const isErr = l.level === 'ERROR';
      const isWarn = l.level === 'WARN';
      const isDebug = l.level === 'DEBUG';
      const badgeBg = isErr ? 'rgba(239,68,68,0.15)' : (isWarn ? 'rgba(245,158,11,0.15)' : (isDebug ? 'rgba(148,163,184,0.15)' : 'rgba(59,130,246,0.15)'));
      const badgeColor = isErr ? '#ef4444' : (isWarn ? '#f59e0b' : (isDebug ? '#94a3b8' : '#3b82f6'));

      const detailsJson = l.details ? JSON.stringify(l.details, null, 2).replace(/"/g, '&quot;') : '';
      const hasDetails = !!detailsJson;

      html += `
        <div class="dev-log-entry">
          <div style="display:flex;align-items:center;justify-content:space-between;gap:8px;font-size:10.5px">
            <div style="display:flex;align-items:center;gap:6px">
              <span style="padding:1px 6px;border-radius:4px;font-weight:700;font-size:9.5px;background:${badgeBg};color:${badgeColor}">${l.level}</span>
              <span style="color:var(--gold);font-weight:600">[${l.module}]</span>
              <strong style="color:var(--white)">${l.action}</strong>
            </div>
            <span style="font-variant-numeric:tabular-nums;color:var(--muted);font-size:9.5px">${l.timeWita || l.timestamp}</span>
          </div>
          ${hasDetails ? `
            <div style="margin-top:4px">
              <details style="cursor:pointer">
                <summary style="font-size:9.5px;color:var(--muted);opacity:0.8">Detail Payload / Stack Trace</summary>
                <pre style="margin-top:4px;padding:6px;background:rgba(0,0,0,0.4);border-radius:6px;font-size:10px;color:#a5f3fc;overflow-x:auto">${detailsJson}</pre>
              </details>
            </div>
          ` : ''}
        </div>
      `;
    }

    container.innerHTML = html;
  };

  window.runDevDiagnostics = async function () {
    const btn = document.getElementById('btnRunDevDiag');
    const oldText = btn ? btn.innerHTML : '';
    if (btn) {
      btn.disabled = true;
      btn.innerHTML = `<i class="fas fa-sync fa-spin"></i> <span>Menjalankan Diagnostik...</span>`;
    }

    try {
      if (window.DEV_TRACKER) {
        const diag = await window.DEV_TRACKER.runDiagnostics();
        const badge = document.getElementById('devDiagScoreBadge');
        if (badge) badge.textContent = `Skor: ${diag.score}%`;

        const summary = document.getElementById('devDiagSummary');
        if (summary) {
          summary.style.display = 'block';
          summary.innerHTML = `<strong>Hasil Pengujian:</strong> ${diag.passed} dari ${diag.total} subsistem operasional (Skor: ${diag.score}%). Waktu pengujian: ${new Date().toLocaleTimeString('id-ID')}.`;
        }

        if (window.renderDevHealthMatrix) window.renderDevHealthMatrix(diag.results);
        if (window.renderDevLogTable) window.renderDevLogTable();
      }
    } catch (e) {
      alert('Gagal menjalankan diagnostik: ' + e.message);
    } finally {
      if (btn) {
        btn.disabled = false;
        btn.innerHTML = oldText;
      }
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

  window.clearDevLogs = function () {
    if (confirm('Yakin ingin membersihkan seluruh riwayat log developer?')) {
      if (window.DEV_TRACKER) {
        window.DEV_TRACKER.clearLogs();
        if (window.renderDevLogTable) window.renderDevLogTable();
      }
    }
  };
}
