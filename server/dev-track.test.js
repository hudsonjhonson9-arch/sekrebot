import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import { requireRole, ABSEN_ROLES } from './auth.js';

const { createDevTrackRouter, purgeOldDevTrack, normalizeEvent, MAX_BATCH, RATE_LIMIT } = await import('./dev-track.js');

const TOKEN = 'a'.repeat(192);
const NOW = Date.parse('2026-11-21T03:00:00.000Z');

const USER = { id: '11', nip: '199001012020011001', username: 'Pegawai Biasa', role: 'USER', instansi_id: 'bapperida' };
const ADMIN = { id: '7', nip: '198001012000011001', username: 'Admin Media', role: 'ADMIN', instansi_id: 'bapperida', is_admin: true };

function harness({ session = USER, query, now } = {}) {
  const sql = [];
  const clock = { t: NOW };
  const app = express();
  app.use(express.json({ limit: '256kb' }));
  app.use('/api/dev/track', requireRole(ABSEN_ROLES, { lookup: async () => ({ ...session }) }));
  app.use('/api/dev/track', createDevTrackRouter({
    query: query || (async (text, params) => {
      sql.push({ text, params });
      if (/FROM "user_list"/.test(text)) return { rows: [{ username: session.username }] };
      return { rows: [] };
    }),
    now: now || (() => clock.t),
  }));
  return { app, sql, clock };
}

async function call(h, method, path, body, { auth = true } = {}) {
  const server = await new Promise((r) => { const s = h.app.listen(0, () => r(s)); });
  const port = server.address().port;
  try {
    const headers = { 'content-type': 'application/json' };
    if (auth) headers.authorization = `Bearer ${TOKEN}`;
    const res = await fetch(`http://127.0.0.1:${port}${path}`, {
      method, headers, body: body === undefined ? undefined : JSON.stringify(body),
    });
    return { status: res.status, body: await res.json() };
  } finally {
    await new Promise((r) => server.close(r));
  }
}

const insertOf = (h) => h.sql.find((s) => /INSERT INTO dev_track_events/i.test(s.text));
const ev = (over = {}) => ({ kind: 'click', page: '/index.html', label: 'Absen Masuk', detail: { id: 'btn1' }, ...over });

test('POST menolak request tanpa bearer (401)', async () => {
  const r = await call(harness(), 'POST', '/api/dev/track', { events: [ev()] }, { auth: false });
  assert.equal(r.status, 401);
});

test('POST: role USER boleh menulis; identitas dari sesi, bukan body', async () => {
  const h = harness();
  const r = await call(h, 'POST', '/api/dev/track', {
    events: [ev({ user_nip: '999', nip: '999', user_nama: 'PALSU' })],
    nip: '999',
  });
  assert.equal(r.status, 200);
  assert.deepEqual({ accepted: r.body.accepted, rejected: r.body.rejected }, { accepted: 1, rejected: 0 });
  const ins = insertOf(h);
  assert.ok(ins, 'harus INSERT');
  assert.equal(ins.params[1], USER.nip);
  assert.equal(ins.params[2], USER.username);
  assert.ok(!ins.params.includes('999') && !ins.params.includes('PALSU'));
});

test('POST: entri invalid dibuang, sisanya diterima', async () => {
  const h = harness();
  const r = await call(h, 'POST', '/api/dev/track', {
    events: [ev(), { kind: 'bogus' }, null, 'x', ev({ kind: 'error', label: 'boom' })],
  });
  assert.equal(r.status, 200);
  assert.equal(r.body.accepted, 2);
  assert.equal(r.body.rejected, 3);
});

test('POST: events kosong / bukan array -> 400; > MAX_BATCH -> 400', async () => {
  const h = harness();
  assert.equal((await call(h, 'POST', '/api/dev/track', { events: [] })).status, 400);
  assert.equal((await call(h, 'POST', '/api/dev/track', { events: 'x' })).status, 400);
  const big = Array.from({ length: MAX_BATCH + 1 }, () => ev());
  assert.equal((await call(h, 'POST', '/api/dev/track', { events: big })).status, 400);
});

test('POST: rate limit 60 event/menit per NIP (sliding window)', async () => {
  const h = harness();
  const batch = (n) => Array.from({ length: n }, () => ev());
  const r1 = await call(h, 'POST', '/api/dev/track', { events: batch(50) });
  assert.equal(r1.body.accepted, 50);
  const r2 = await call(h, 'POST', '/api/dev/track', { events: batch(20) });
  assert.equal(r2.body.accepted, RATE_LIMIT - 50);
  assert.equal(r2.body.rejected, 10);
  const r3 = await call(h, 'POST', '/api/dev/track', { events: batch(5) });
  assert.equal(r3.body.accepted, 0);
  assert.equal(r3.body.rejected, 5);
  h.clock.t += 61 * 1000;
  const r4 = await call(h, 'POST', '/api/dev/track', { events: batch(5) });
  assert.equal(r4.body.accepted, 5);
});

test('POST: rate limit terpisah per NIP', async () => {
  const a = harness({ session: USER });
  const b = harness({ session: { ...USER, nip: '111' } });
  const batch = Array.from({ length: 50 }, () => ev());
  await call(a, 'POST', '/api/dev/track', { events: batch });
  const r = await call(b, 'POST', '/api/dev/track', { events: batch });
  assert.equal(r.body.accepted, 50);
});

test('normalizeEvent: ts diklamping ke [now-7d, now+5min]; detail oversize dipotong', () => {
  const old = normalizeEvent(ev({ ts: NOW - 30 * 86400000 }), NOW);
  assert.equal(Date.parse(old.ts), NOW - 7 * 86400000);
  const future = normalizeEvent(ev({ ts: NOW + 3600000 }), NOW);
  assert.equal(Date.parse(future.ts), NOW + 5 * 60000);
  const noTs = normalizeEvent(ev({ ts: undefined }), NOW);
  assert.equal(Date.parse(noTs.ts), NOW);
  const junk = normalizeEvent(ev({ ts: 'bukan tanggal' }), NOW);
  assert.equal(Date.parse(junk.ts), NOW);
  const huge = normalizeEvent(ev({ detail: { stack: 'x'.repeat(10000) } }), NOW);
  assert.deepEqual(JSON.parse(huge.detail), { truncated: true });
  assert.equal(normalizeEvent(ev({ label: 'y'.repeat(999) }), NOW).label.length, 300);
});

test('GET summary: USER ditolak 403, ADMIN 200', async () => {
  const denied = await call(harness({ session: USER }), 'GET', '/api/dev/track/summary');
  assert.equal(denied.status, 403);
  const h = harness({ session: ADMIN, query: async (text) => (/GROUP BY user_nip/.test(text) ? { rows: [{ user_nip: '1', clicks: 3, errors: 1, api_fails: 0 }] } : { rows: [] }) });
  const ok = await call(h, 'GET', '/api/dev/track/summary?days=30');
  assert.equal(ok.status, 200);
  assert.equal(ok.body.days, 30);
  assert.equal(ok.body.data[0].clicks, 3);
});

test('GET summary: days diklamping 1..90', async () => {
  const h = harness({ session: ADMIN });
  assert.equal((await call(h, 'GET', '/api/dev/track/summary?days=9999')).body.days, 90);
  assert.equal((await call(h, 'GET', '/api/dev/track/summary?days=abc')).body.days, 7);
});

test('GET events: USER ditolak 403', async () => {
  const r = await call(harness({ session: USER }), 'GET', '/api/dev/track/events');
  assert.equal(r.status, 403);
});

test('GET events: filter nip+kind+before_id terparameterisasi; limit default 100, maks 500', async () => {
  const h = harness({ session: ADMIN });
  await call(h, 'GET', '/api/dev/track/events?nip=123&kind=error&before_id=50&limit=9999');
  const q = h.sql.find((s) => /FROM dev_track_events/.test(s.text) && /ORDER BY id DESC/.test(s.text));
  assert.ok(q);
  assert.ok(/user_nip = \$1/.test(q.text) && /kind = \$2/.test(q.text) && /id < \$3::bigint/.test(q.text));
  assert.deepEqual(q.params, ['123', 'error', '50', 500]);
  const h2 = harness({ session: ADMIN });
  await call(h2, 'GET', '/api/dev/track/events');
  const q2 = h2.sql.find((s) => /ORDER BY id DESC/.test(s.text));
  assert.deepEqual(q2.params, [100]);
});

test('GET events: kind / before_id tidak valid -> 400 (tidak masuk SQL)', async () => {
  const h = harness({ session: ADMIN });
  assert.equal((await call(h, 'GET', '/api/dev/track/events?kind=x%27%3B--')).status, 400);
  assert.equal((await call(h, 'GET', '/api/dev/track/events?before_id=1%20OR%201%3D1')).status, 400);
  assert.ok(!h.sql.some((s) => /ORDER BY id DESC/.test(s.text)));
});

test('GET events: next_before_id terisi bila halaman penuh', async () => {
  const rows = [{ id: '30' }, { id: '29' }];
  const h = harness({ session: ADMIN, query: async (text) => (/ORDER BY id DESC/.test(text) ? { rows } : { rows: [] }) });
  const r = await call(h, 'GET', '/api/dev/track/events?limit=2');
  assert.equal(r.body.next_before_id, '29');
  const r2 = await call(h, 'GET', '/api/dev/track/events?limit=5');
  assert.equal(r2.body.next_before_id, null);
});

test('purgeOldDevTrack menghapus event > 30 hari', async () => {
  const sql = [];
  const query = async (text, params) => { sql.push({ text, params }); return { rows: [] }; };
  await purgeOldDevTrack({ query });
  const del = sql.find((s) => /DELETE FROM dev_track_events/.test(s.text));
  assert.ok(del);
  assert.deepEqual(del.params, [30]);
});

test('error DB -> 500 tanpa membocorkan detail', async () => {
  const h = harness({ query: async () => { throw new Error('relation secret does not exist'); } });
  const r = await call(h, 'POST', '/api/dev/track', { events: [ev()] });
  assert.equal(r.status, 500);
  assert.ok(!JSON.stringify(r.body).includes('secret'));
});
