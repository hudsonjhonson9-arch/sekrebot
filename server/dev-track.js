import express from 'express';
import { MEDIA_ROLES } from './auth.js';

// Tracking sisi developer: klik tombol + kegagalan fungsi/API per user.
// Penulisan terbuka untuk seluruh ABSEN_ROLES (di-mount di index.js), tetapi
// identitas SELALU dari req.user — klien tidak bisa mengaku sebagai user lain.
// Membaca data (summary/events) khusus MEDIA_ROLES.

export const KINDS = ['click', 'error', 'api_fail'];
export const MAX_BATCH = 50;
export const RATE_LIMIT = 60;           // event per menit per NIP
export const RETENTION_DAYS = 30;
const RATE_WINDOW_MS = 60 * 1000;
const TS_PAST_MS = 7 * 24 * 60 * 60 * 1000;
const TS_FUTURE_MS = 5 * 60 * 1000;
const RETENTION_INTERVAL_MS = 24 * 60 * 60 * 1000;
const MAX_PAGE = 200;
const MAX_LABEL = 300;
const MAX_DETAIL_JSON = 4000;

export const DDL = [
  `CREATE TABLE IF NOT EXISTS dev_track_events (
    id          BIGSERIAL PRIMARY KEY,
    ts          TIMESTAMPTZ NOT NULL,
    received_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    user_nip    TEXT NOT NULL DEFAULT '',
    user_nama   TEXT NOT NULL DEFAULT '',
    kind        TEXT NOT NULL CHECK (kind IN ('click','error','api_fail')),
    page        TEXT NOT NULL DEFAULT '',
    label       TEXT NOT NULL DEFAULT '',
    detail      JSONB NOT NULL DEFAULT '{}'
  )`,
  'CREATE INDEX IF NOT EXISTS dev_track_events_ts_idx ON dev_track_events (ts DESC)',
  'CREATE INDEX IF NOT EXISTS dev_track_events_nip_ts_idx ON dev_track_events (user_nip, ts DESC)',
  'CREATE INDEX IF NOT EXISTS dev_track_events_kind_ts_idx ON dev_track_events (kind, ts DESC)',
];

const ensured = new WeakSet();
export async function ensureDevTrackTable({ query }) {
  if (ensured.has(query)) return;
  for (const sql of DDL) await query(sql);
  ensured.add(query);
}

const str = (v, max) => (v === undefined || v === null ? '' : String(v)).slice(0, max);

// Entri tidak valid dibuang (bukan menggagalkan seluruh batch).
export function normalizeEvent(raw, now) {
  if (!raw || typeof raw !== 'object' || !KINDS.includes(raw.kind)) return null;
  let ts = raw.ts === undefined || raw.ts === null ? now : new Date(raw.ts).getTime();
  if (!Number.isFinite(ts)) ts = now;
  ts = Math.min(Math.max(ts, now - TS_PAST_MS), now + TS_FUTURE_MS);
  let detail = raw.detail && typeof raw.detail === 'object' && !Array.isArray(raw.detail) ? raw.detail : {};
  let json = JSON.stringify(detail);
  if (json.length > MAX_DETAIL_JSON) json = JSON.stringify({ truncated: true });
  return {
    kind: raw.kind,
    ts: new Date(ts).toISOString(),
    page: str(raw.page, MAX_PAGE),
    label: str(raw.label, MAX_LABEL),
    detail: json,
  };
}

export function createDevTrackRouter({ query, now = () => Date.now() }) {
  const router = express.Router();
  // shortcut: Map proses tunggal — pindah ke store bersama bila multi-process.
  const hits = new Map();
  // req.user hanya membawa id/nip/role — nama diambil dari user_list lalu di-cache.
  // shortcut: cache tanpa TTL (nama jarang berubah; dibatasi 500 entri).
  const names = new Map();

  async function resolveNama(id) {
    if (!id) return '';
    if (names.has(id)) return names.get(id);
    let nama = '';
    try {
      const { rows } = await query('SELECT username FROM "user_list" WHERE id = $1::bigint', [id]);
      nama = String(rows[0]?.username || '');
    } catch { return ''; }
    if (names.size >= 500) names.delete(names.keys().next().value);
    names.set(id, nama);
    return nama;
  }

  function takeQuota(key, want) {
    const t = now();
    const recent = (hits.get(key) || []).filter((x) => x > t - RATE_WINDOW_MS);
    const allowed = Math.max(0, Math.min(want, RATE_LIMIT - recent.length));
    for (let i = 0; i < allowed; i++) recent.push(t);
    if (recent.length) hits.set(key, recent); else hits.delete(key);
    return allowed;
  }

  function requireMedia(req, res, next) {
    if (!MEDIA_ROLES.has(String(req.user?.role || '').toUpperCase())) {
      return res.status(403).json({ ok: false, message: 'Forbidden' });
    }
    return next();
  }

  router.post('/', async (req, res) => {
    try {
      const events = req.body?.events;
      if (!Array.isArray(events) || events.length === 0) {
        return res.status(400).json({ ok: false, message: 'events wajib berupa array tidak kosong.' });
      }
      if (events.length > MAX_BATCH) {
        return res.status(400).json({ ok: false, message: `Maksimal ${MAX_BATCH} event per request.` });
      }
      const t = now();
      const valid = events.map((e) => normalizeEvent(e, t)).filter(Boolean);
      const nip = String(req.user?.nip || '');
      const quotaKey = nip || String(req.user?.id || '');
      const allowed = valid.length ? takeQuota(quotaKey, valid.length) : 0;
      const accepted = valid.slice(0, allowed);

      if (accepted.length) {
        await ensureDevTrackTable({ query });
        const nama = await resolveNama(String(req.user?.id || ''));
        const params = [];
        const rows = accepted.map((e) => {
          params.push(e.ts, nip, nama, e.kind, e.page, e.label, e.detail);
          const n = params.length;
          return `($${n - 6}::timestamptz, $${n - 5}, $${n - 4}, $${n - 3}, $${n - 2}, $${n - 1}, $${n}::jsonb)`;
        });
        await query(
          `INSERT INTO dev_track_events (ts, user_nip, user_nama, kind, page, label, detail) VALUES ${rows.join(', ')}`,
          params,
        );
      }
      return res.json({ ok: true, accepted: accepted.length, rejected: events.length - accepted.length });
    } catch {
      return res.status(500).json({ ok: false, message: 'Gagal menyimpan tracking.' });
    }
  });

  router.get('/summary', requireMedia, async (req, res) => {
    try {
      const days = Math.min(Math.max(parseInt(req.query?.days, 10) || 7, 1), 90);
      await ensureDevTrackTable({ query });
      const { rows } = await query(
        `SELECT user_nip, MAX(user_nama) AS user_nama,
                COUNT(*) FILTER (WHERE kind = 'click')::int    AS clicks,
                COUNT(*) FILTER (WHERE kind = 'error')::int    AS errors,
                COUNT(*) FILTER (WHERE kind = 'api_fail')::int AS api_fails,
                MAX(ts) AS last_seen
           FROM dev_track_events
          WHERE ts >= now() - ($1::int * interval '1 day')
          GROUP BY user_nip
          ORDER BY MAX(ts) DESC`,
        [days],
      );
      return res.json({ ok: true, days, data: rows });
    } catch {
      return res.status(500).json({ ok: false, message: 'Gagal mengambil ringkasan.' });
    }
  });

  router.get('/events', requireMedia, async (req, res) => {
    try {
      const q = req.query || {};
      const limit = Math.min(Math.max(parseInt(q.limit, 10) || 100, 1), 500);
      const params = [];
      const where = [];
      if (q.nip) { params.push(String(q.nip)); where.push(`user_nip = $${params.length}`); }
      if (q.kind) {
        if (!KINDS.includes(String(q.kind))) {
          return res.status(400).json({ ok: false, message: 'kind tidak valid.' });
        }
        params.push(String(q.kind)); where.push(`kind = $${params.length}`);
      }
      if (q.before_id) {
        if (!/^\d+$/.test(String(q.before_id))) {
          return res.status(400).json({ ok: false, message: 'before_id tidak valid.' });
        }
        params.push(String(q.before_id)); where.push(`id < $${params.length}::bigint`);
      }
      params.push(limit);
      await ensureDevTrackTable({ query });
      const { rows } = await query(
        `SELECT id::text AS id, ts, user_nip, user_nama, kind, page, label, detail
           FROM dev_track_events${where.length ? ` WHERE ${where.join(' AND ')}` : ''}
          ORDER BY id DESC LIMIT $${params.length}`,
        params,
      );
      return res.json({
        ok: true,
        data: rows,
        next_before_id: rows.length === limit ? rows[rows.length - 1].id : null,
      });
    } catch {
      return res.status(500).json({ ok: false, message: 'Gagal mengambil event.' });
    }
  });

  return router;
}

export async function purgeOldDevTrack({ query }) {
  await ensureDevTrackTable({ query });
  return query(
    `DELETE FROM dev_track_events WHERE ts < now() - ($1::int * interval '1 day')`,
    [RETENTION_DAYS],
  );
}

// Pengganti pg_cron: purge harian dari proses server. Timer di-unref agar tidak
// menahan proses keluar; kembalikan handle supaya bisa di-clear saat shutdown.
export function startDevTrackRetention({ query, intervalMs = RETENTION_INTERVAL_MS }) {
  const run = () => purgeOldDevTrack({ query }).catch((e) => console.error('[dev-track] purge error:', e.message));
  run();
  const timer = setInterval(run, intervalMs);
  timer.unref?.();
  return timer;
}
