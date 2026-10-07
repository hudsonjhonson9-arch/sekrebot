import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';

const BOT = '123456:TESTTOKEN-not-real';
const TG_ID = 987654321;

function signInitData(userId) {
  const pairs = {
    auth_date: String(Math.floor(Date.now() / 1000)),
    query_id: 'AAH',
    user: JSON.stringify({ id: userId, first_name: 'Budi' }),
  };
  const dcs = Object.entries(pairs).map(([k, v]) => `${k}=${v}`).sort().join('\n');
  const secret = crypto.createHash('sha256').update(BOT).digest();
  return new URLSearchParams({
    ...pairs,
    hash: crypto.createHmac('sha256', secret).update(dcs).digest('hex'),
  }).toString();
}

async function drive(router, method, url, body = {}) {
  const req = { method, url, headers: { authorization: 'Bearer x' }, body, ip: '10.0.0.1' };
  let status = 200;
  let payload = null;
  const res = {
    statusCode: 200,
    status(c) { status = c; return this; },
    json(p) { payload = p; return this; },
    set() { return this; },
    end() { return this; },
  };
  const layer = router.stack.find((l) => l.route?.path && l.route.methods[method.toLowerCase()] && url.startsWith(l.route.path));
  if (!layer) throw new Error('route not found');
  const handlers = layer.route.stack;
  let i = 0;
  const next = async (e) => { if (e) throw e; const h = handlers[i++]; if (h) await h.handle(req, res, next); };
  await next();
  return { status, body: payload };
}

test('role dari body diabaikan, selalu dari user_list', async () => {
  process.env.TELEGRAM_BOT_TOKEN = BOT;
  const { createAuthSessionRouter } = await import('./auth-session.js');
  const seen = [];
  const query = async (sql, params) => {
    seen.push({ sql: String(sql), params });
    if (/user_list/i.test(sql)) return { rows: [{ id: String(TG_ID), nip: '12345', role: 'USER', instansi_id: 'bapperida' }] };
    if (/INSERT INTO auth_sessions/i.test(sql)) return { rows: [{ session_token: 'a'.repeat(192) }] };
    return { rows: [] };
  };
  const r = createAuthSessionRouter({ query });
  const out = await drive(r, 'POST', '/api/auth/session', { nip: '12345', role: 'SUPERADMIN', init_data: signInitData(TG_ID) });
  assert.equal(out.status, 200);
  const ins = seen.find((s) => /INSERT INTO auth_sessions/i.test(s.sql));
  assert.ok(ins.params.includes('USER'), 'role harus USER dari DB, bukan SUPERADMIN dari body');
  assert.ok(!ins.params.includes('SUPERADMIN'), 'role dari body tidak boleh ikut tersimpan');
});

test('nip di body diabaikan: sesi milik id Telegram, bukan pemilik NIP itu', async () => {
  process.env.TELEGRAM_BOT_TOKEN = BOT;
  const { createAuthSessionRouter } = await import('./auth-session.js');
  const seen = [];
  const query = async (sql, params) => {
    seen.push({ sql: String(sql), params });
    if (/user_list/i.test(sql)) return { rows: [{ id: String(TG_ID), nip: '12345', role: 'USER', instansi_id: 'bapperida' }] };
    if (/INSERT INTO auth_sessions/i.test(sql)) return { rows: [{ session_token: 'a'.repeat(192) }] };
    return { rows: [] };
  };
  const r = createAuthSessionRouter({ query });
  // NIP milik orang lain di body: kalau NIP menentukan sesi, orang ini bisa
  // mengambil sesi orang tersebut. Lookup harus pakai id Telegram saja.
  const out = await drive(r, 'POST', '/api/auth/session', { nip: 'NIP_ORANG_LAIN', init_data: signInitData(TG_ID) });
  assert.equal(out.status, 200);
  const lookup = seen.find((s) => /user_list/i.test(s.sql));
  assert.deepEqual(lookup.params, [String(TG_ID)], 'lookup wajib pakai id Telegram, bukan NIP');
  assert.ok(!JSON.stringify(lookup.params).includes('NIP_ORANG_LAIN'), 'NIP dari body tidak boleh masuk ke query');
});

test('init_data tidak valid ditolak 401 tanpa menyentuh DB', async () => {
  process.env.TELEGRAM_BOT_TOKEN = BOT;
  const { createAuthSessionRouter } = await import('./auth-session.js');
  let called = 0;
  const query = async () => { called++; return { rows: [] }; };
  const r = createAuthSessionRouter({ query });
  const out = await drive(r, 'POST', '/api/auth/session', { nip: '12345', init_data: 'user=%7B%22id%22%3A1%7D&hash=deadbeef' });
  assert.equal(out.status, 401);
  assert.equal(called, 0, 'DB tidak boleh disentuh sebelum identitas terverifikasi');
});

test('pegawai tidak dikenal ditolak 404', async () => {
  process.env.TELEGRAM_BOT_TOKEN = BOT;
  const { createAuthSessionRouter } = await import('./auth-session.js');
  const r = createAuthSessionRouter({ query: async () => ({ rows: [] }) });
  const out = await drive(r, 'POST', '/api/auth/session', { nip: '99999', init_data: signInitData(TG_ID) });
  assert.equal(out.status, 404);
});

test('token yang terbit 192 hex huruf kecil', async () => {
  process.env.TELEGRAM_BOT_TOKEN = BOT;
  const { createAuthSessionRouter } = await import('./auth-session.js');
  const query = async (sql) => {
    if (/user_list/i.test(sql)) return { rows: [{ id: String(TG_ID), nip: '12345', role: 'ADMIN', instansi_id: 'bapperida' }] };
    if (/INSERT INTO auth_sessions/i.test(sql)) return { rows: [{ session_token: 'b'.repeat(192) }] };
    return { rows: [] };
  };
  const r = createAuthSessionRouter({ query });
  const out = await drive(r, 'POST', '/api/auth/session', { nip: '12345', init_data: signInitData(TG_ID) });
  assert.equal(out.status, 200);
  assert.match(out.body.session_token, /^[0-9a-f]{192}$/);
});

test('logout menonaktifkan sesi', async () => {
  process.env.TELEGRAM_BOT_TOKEN = BOT;
  const { createAuthSessionRouter } = await import('./auth-session.js');
  const seen = [];
  const query = async (sql, params) => { seen.push({ sql: String(sql), params }); return { rows: [] }; };
  const r = createAuthSessionRouter({ query });
  const out = await drive(r, 'POST', '/api/auth/logout', { session_token: 'c'.repeat(192) });
  assert.equal(out.status, 200);
  assert.ok(seen.some((s) => /is_active\s*=\s*false/i.test(s.sql)));
});

test('logout menolak token dengan bentuk salah', async () => {
  process.env.TELEGRAM_BOT_TOKEN = BOT;
  const { createAuthSessionRouter } = await import('./auth-session.js');
  let called = 0;
  const query = async () => { called++; return { rows: [] }; };
  const r = createAuthSessionRouter({ query });
  for (const bad of [undefined, '', 'pendek', 'C'.repeat(192), 'g'.repeat(192)]) {
    const out = await drive(r, 'POST', '/api/auth/logout', { session_token: bad });
    assert.equal(out.status, 400, `token ${String(bad).slice(0, 8)} harus ditolak`);
  }
  assert.equal(called, 0, 'SQL tidak boleh dijalankan untuk token tidak valid');
});