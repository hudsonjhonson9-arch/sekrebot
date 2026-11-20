// Pemantau kesehatan & auto-watchdog OpenWA (NestJS WhatsApp Gateway).
// Menjaga sesi OpenWA agar otomatis di-start ulang bila status STOPPED/DISCONNECTED/FAILED
// sehingga admin tidak perlu menyalakan manual setiap hari.

const HEALTHY_STATUSES = new Set(['WORKING', 'CONNECTED', 'AUTHENTICATED', 'READY', 'OPEN']);
const RESTARTABLE_STATUSES = new Set(['STOPPED', 'DISCONNECTED', 'FAILED', 'ERROR', 'CLOSE', 'CLOSED', 'LOGGED_OUT']);

function cleanBase(url) {
  return String(url || '').trim().replace(/\/+$/, '');
}

function buildHeaders(apiKey, withJson = false) {
  const h = {};
  if (withJson) h['Content-Type'] = 'application/json';
  if (apiKey) h['X-Api-Key'] = apiKey;
  return h;
}

async function fetchWithTimeout(fetchFn, url, opts = {}, timeoutMs = 5000) {
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), timeoutMs);
  try {
    return await fetchFn(url, { ...opts, signal: ac.signal });
  } finally {
    clearTimeout(timer);
  }
}

export async function checkOpenwaStatus(cfg = {}, fetchFn = fetch) {
  const base = cleanBase(cfg.url);
  const session = String(cfg.session || 'default').trim() || 'default';
  if (!base) {
    return {
      configured: false,
      ok: false,
      status: 'NOT_CONFIGURED',
      sessionId: null,
      sessionName: session,
      phone: null,
      latencyMs: 0,
      message: 'OPENWA_URL belum diatur di environment server.',
    };
  }

  const t0 = Date.now();
  try {
    const res = await fetchWithTimeout(fetchFn, `${base}/api/sessions`, {
      method: 'GET',
      headers: buildHeaders(cfg.apiKey, false),
    }, 5000);
    const latencyMs = Date.now() - t0;
    if (!res.ok) {
      return {
        configured: true,
        ok: false,
        status: `HTTP_${res.status}`,
        sessionId: null,
        sessionName: session,
        phone: null,
        latencyMs,
        message: `OpenWA merespons HTTP ${res.status}`,
      };
    }
    const raw = await res.json().catch(() => []);
    const list = Array.isArray(raw) ? raw : (Array.isArray(raw?.data) ? raw.data : []);
    const found = list.find((s) => String(s?.id) === session || String(s?.name) === session) || list[0] || null;

    if (!found) {
      return {
        configured: true,
        ok: false,
        status: 'NO_SESSION',
        sessionId: null,
        sessionName: session,
        phone: null,
        latencyMs,
        message: `Sesi OpenWA "${session}" tidak ditemukan.`,
      };
    }

    const st = String(found.status || found.state || 'UNKNOWN').toUpperCase();
    const ok = HEALTHY_STATUSES.has(st);
    const phone = found.phone || found.me?.id || found.number || null;
    return {
      configured: true,
      ok,
      status: st,
      sessionId: String(found.id || found.name || session),
      sessionName: String(found.name || found.id || session),
      phone,
      latencyMs,
      message: ok
        ? `Sesi ${found.name || found.id || session} aktif (${st})`
        : `Sesi ${found.name || found.id || session} tidak aktif (${st})`,
    };
  } catch (err) {
    return {
      configured: true,
      ok: false,
      status: 'UNREACHABLE',
      sessionId: null,
      sessionName: session,
      phone: null,
      latencyMs: Date.now() - t0,
      message: `OpenWA tidak terjangkau: ${err?.name === 'AbortError' ? 'Timeout 5 detik' : (err?.message || 'Koneksi gagal')}`,
    };
  }
}

export async function restartOpenwaSession(cfg = {}, fetchFn = fetch) {
  const base = cleanBase(cfg.url);
  const session = String(cfg.session || 'default').trim() || 'default';
  if (!base) {
    return { ok: false, status: 'NOT_CONFIGURED', sessionId: null, message: 'OPENWA_URL belum diatur di server.' };
  }

  const current = await checkOpenwaStatus(cfg, fetchFn);
  const sid = current.sessionId || session;
  const encSid = encodeURIComponent(sid);
  const attempts = [
    { method: 'POST', url: `${base}/api/sessions/${encSid}/start` },
    { method: 'POST', url: `${base}/api/sessions/${encSid}/restart` },
    { method: 'POST', url: `${base}/api/sessions/start`, body: JSON.stringify({ name: sid }) },
  ];

  let lastErr = 'Gagal memulai ulang sesi OpenWA.';
  for (const att of attempts) {
    try {
      const res = await fetchWithTimeout(fetchFn, att.url, {
        method: att.method,
        headers: buildHeaders(cfg.apiKey, Boolean(att.body)),
        ...(att.body ? { body: att.body } : {}),
      }, 8000);
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        return {
          ok: true,
          status: String(data?.status || 'STARTING').toUpperCase(),
          sessionId: sid,
          message: `Perintah start/restart sesi OpenWA "${sid}" berhasil dikirim.`,
        };
      }
      if (res.status !== 404 && res.status !== 405) {
        lastErr = data?.message || `OpenWA HTTP ${res.status}`;
      }
    } catch (err) {
      lastErr = err?.name === 'AbortError' ? 'Timeout menghubungi OpenWA' : (err?.message || lastErr);
    }
  }

  return { ok: false, status: 'ERROR', sessionId: sid, message: lastErr };
}

export function createOpenwaWatchdog({
  url = '',
  apiKey = '',
  session = 'default',
  intervalMs = 5 * 60_000,
  cooldownMs = 10 * 60_000,
  logger = console,
  fetchFn = fetch,
} = {}) {
  const cfg = { url, apiKey, session };
  let timer = null;
  let lastCheckAt = null;
  let lastStatus = null;
  let lastAutoRestartAt = 0;
  let autoRestartCount = 0;

  async function checkNow({ allowAutoRestart = false } = {}) {
    const status = await checkOpenwaStatus(cfg, fetchFn);
    lastCheckAt = new Date().toISOString();
    lastStatus = status;

    if (
      allowAutoRestart
      && status.configured
      && !status.ok
      && RESTARTABLE_STATUSES.has(status.status)
      && (Date.now() - lastAutoRestartAt >= cooldownMs)
    ) {
      lastAutoRestartAt = Date.now();
      autoRestartCount += 1;
      logger.warn?.(`[openwa-watchdog] Sesi ${status.sessionName} berstatus ${status.status}, mencoba auto-start (#${autoRestartCount})...`);
      const restarted = await restartOpenwaSession(cfg, fetchFn);
      if (restarted.ok) {
        logger.info?.(`[openwa-watchdog] ${restarted.message}`);
      } else {
        logger.error?.(`[openwa-watchdog] Auto-start gagal: ${restarted.message}`);
      }
    }

    return {
      ...status,
      watchdogActive: Boolean(timer),
      autoRestartCount,
      lastAutoRestartAt: lastAutoRestartAt ? new Date(lastAutoRestartAt).toISOString() : null,
      lastCheckAt,
    };
  }

  async function restartNow() {
    const res = await restartOpenwaSession(cfg, fetchFn);
    if (res.ok) {
      lastAutoRestartAt = Date.now();
    }
    return res;
  }

  function start() {
    if (!cleanBase(url) || timer) return false;
    timer = setInterval(() => {
      checkNow({ allowAutoRestart: true }).catch((e) => logger.error?.('[openwa-watchdog]', e?.message || e));
    }, intervalMs);
    timer.unref?.();
    return true;
  }

  function stop() {
    if (timer) {
      clearInterval(timer);
      timer = null;
    }
  }

  function getState() {
    return {
      configured: Boolean(cleanBase(url)),
      watchdogActive: Boolean(timer),
      autoRestartCount,
      lastAutoRestartAt: lastAutoRestartAt ? new Date(lastAutoRestartAt).toISOString() : null,
      lastCheckAt,
      lastStatus,
    };
  }

  return { checkNow, restartNow, start, stop, getState };
}
