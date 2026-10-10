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
  const setCookies = [];
  const res = {
    statusCode: 200,
    status(c) { status = c; return this; },
    json(p) { payload = p; return this; },
    set() { return this; },
    cookie(name, val, opts) {
      const attrs = [];
      if (opts) {
        if (opts.domain) attrs.push(`Domain=${opts.domain}`);
        if (opts.path) attrs.push(`Path=${opts.path}`);
        if (opts.maxAge != null) attrs.push(`Max-Age=${Math.floor(opts.maxAge / 1000)}`);
        if (opts.httpOnly) attrs.push('HttpOnly');
        if (opts.secure) attrs.push('Secure');
        if (opts.sameSite) attrs.push(`SameSite=${opts.sameSite}`);
      }
      setCookies.push([`${name}=${val}`, ...attrs].join('; '));
      return this;
    },
    clearCookie(name, opts) {
      const attrs = [];
      if (opts?.domain) attrs.push(`Domain=${opts.domain}`);
      if (opts?.path) attrs.push(`Path=${opts.path}`);
      setCookies.push([`${name}=`, ...attrs, 'Expires=Thu, 01 Jan 1970 00:00:00 GMT', 'Max-Age=0'].join('; '));
      return this;
    },
    end() { return this; },
  };
  const layer = router.stack.find((l) => l.route?.path && l.route.methods[method.toLowerCase()] && url.startsWith(l.route.path));
  if (!layer) throw new Error('route not found');
  const handlers = layer.route.stack;
  let i = 0;
  const next = async (e) => { if (e) throw e; const h = handlers[i++]; if (h) await h.handle(req, res, next); };
  await next();
  return { status, body: payload, setCookies };
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

// ── Login NIP (web, non-Telegram, tanpa password) ──

// public.user_list mengembalikan kolom apa adanya: "NIP" (huruf besar) dan
// username — TIDAK ada nip/nama. Alias di SELECT hanya muncul di hasil kalau
// SQL-nya meminta, jadi mock meniru perilaku DB itu apa adanya.
function userListRows(sql, ...rows) {
  const nip = /"NIP"\s+AS\s+nip/i.test(sql);
  const nama = /username\s+AS\s+nama/i.test(sql);
  return {
    rows: rows.map((r) => ({
      ...r,
      ...(nip ? { nip: r.NIP } : {}),
      ...(nama ? { nama: r.username } : {}),
    })),
  };
}

test('login NIP valid menerbitkan sesi 192 hex dan baris user', async () => {
  const { createAuthSessionRouter } = await import('./auth-session.js');
  const seen = [];
  const query = async (sql, params) => {
    seen.push({ sql: String(sql), params });
    if (/user_list/i.test(sql)) return userListRows(sql, { id: '9', NIP: '200206302025061002', role: 'SUPERADMIN', instansi_id: 'bapperida', username: 'Achmad', face_histogram: '[0.1,0.2]', face_photo: 'data:image/jpeg;base64,AAA' });
    if (/INSERT INTO auth_sessions/i.test(sql)) return { rows: [{ session_token: 'd'.repeat(192) }] };
    return { rows: [] };
  };
  const r = createAuthSessionRouter({ query });
  const out = await drive(r, 'POST', '/api/auth/login', { nip: '200206302025061002' });
  assert.equal(out.status, 200);
  assert.equal(out.body.ok, true);
  assert.match(out.body.session_token, /^[0-9a-f]{192}$/);
  assert.equal(out.body.user.nip, '200206302025061002');
  assert.equal(out.body.user.nama, 'Achmad');
  // Kontrak full-row: kolom biometrik harus ikut dikirim ke client.
  // Kalau USERS_BY_NIP_SQL di-narrow (mis. SELECT id,nip,role), fallback
  // regenerasi descriptor di js/auth.js mati → login terkunci. Test ini gagal.
  assert.ok('face_histogram' in out.body.user, 'kontrak full-row: face_histogram wajib ada');
  assert.ok('face_photo' in out.body.user, 'kontrak full-row: face_photo wajib ada');
  assert.equal(out.body.user.face_histogram, '[0.1,0.2]');
  const ins = seen.find((s) => /INSERT INTO auth_sessions/i.test(s.sql));
  assert.ok(ins.params.includes('SUPERADMIN'), 'role harus dari baris DB');
  assert.ok(ins.params.includes('bapperida'), 'instansi harus dari baris DB');
});

test('login NIP tidak terdaftar ditolak 404', async () => {
  const { createAuthSessionRouter } = await import('./auth-session.js');
  const r = createAuthSessionRouter({ query: async () => ({ rows: [] }) });
  const out = await drive(r, 'POST', '/api/auth/login', { nip: '00000' });
  assert.equal(out.status, 404);
  assert.equal(out.body.ok, false);
});

test('login NIP ambigu ditolak 409, bukan memilih baris pertama', async () => {
  const { createAuthSessionRouter } = await import('./auth-session.js');
  let dbTouched = 0;
  const r = createAuthSessionRouter({
    query: async (sql) => {
      if (/user_list/i.test(String(sql))) { dbTouched++; return userListRows(String(sql), { id: '1', NIP: 'X' }, { id: '2', NIP: 'X' }); }
      dbTouched++;
      return { rows: [] };
    },
  });
  const out = await drive(r, 'POST', '/api/auth/login', { nip: 'X' });
  assert.equal(out.status, 409);
  const onlyLookup = dbTouched === 1;
  assert.ok(onlyLookup, 'baris ambigu harus berhenti di lookup, tidak boleh INSERT');
});

test('login tanpa NIP ditolak 400 tanpa menyentuh DB', async () => {
  const { createAuthSessionRouter } = await import('./auth-session.js');
  let called = 0;
  const r = createAuthSessionRouter({ query: async () => { called++; return { rows: [] }; } });
  for (const nip of [undefined, '', '   ']) {
    const out = await drive(r, 'POST', '/api/auth/login', { nip });
    assert.equal(out.status, 400, `nip ${JSON.stringify(nip)} harus 400`);
  }
  assert.equal(called, 0, 'DB tidak boleh disentuh untuk input kosong');
});

test('login mengabaikan role/instansi yang disuntik di body', async () => {
  const { createAuthSessionRouter } = await import('./auth-session.js');
  const seen = [];
  const query = async (sql, params) => {
    seen.push({ sql: String(sql), params });
    if (/user_list/i.test(sql)) return userListRows(sql, { id: '7', NIP: 'NIP1', role: 'USER', instansi_id: 'bapperida' });
    if (/INSERT INTO auth_sessions/i.test(sql)) return { rows: [{ session_token: 'e'.repeat(192) }] };
    return { rows: [] };
  };
  const r = createAuthSessionRouter({ query });
  const out = await drive(r, 'POST', '/api/auth/login', { nip: 'NIP1', role: 'SUPERADMIN', instansi_id: 'lain' });
  assert.equal(out.status, 200);
  const ins = seen.find((s) => /INSERT INTO auth_sessions/i.test(s.sql));
  assert.ok(ins.params.includes('USER'), 'role dari body tidak boleh dipakai');
  assert.ok(!ins.params.includes('SUPERADMIN'), 'role body harus diabaikan');
});

test('login tidak membaca init_data Telegram (pure NIP)', async (t) => {
  const prevToken = process.env.TELEGRAM_BOT_TOKEN;
  process.env.TELEGRAM_BOT_TOKEN = 'x'.repeat(30);
  t.after(() => {
    if (prevToken === undefined) delete process.env.TELEGRAM_BOT_TOKEN;
    else process.env.TELEGRAM_BOT_TOKEN = prevToken;
  });
  const { createAuthSessionRouter } = await import('./auth-session.js');
  const r = createAuthSessionRouter({ query: async () => ({ rows: [] }) });
  // Tanpa init_data pun harus tetap 404 (NIP tak dikenal), bukan 401.
  const out = await drive(r, 'POST', '/api/auth/login', { nip: '99999' });
  assert.equal(out.status, 404);
});

// ── Error DB tidak boleh menjatuhkan proses ──
// Sebelumnya tak ada try/catch: query yang melempar jadi unhandled rejection →
// Node exit → SEMUA rute 502 termasuk /api/health. Kontrak baru: balas 500.

test('login: error DB dibalas 500, bukan melempar', async () => {
  const { createAuthSessionRouter } = await import('./auth-session.js');
  const r = createAuthSessionRouter({ query: async () => { throw new Error('could not write init file'); } });
  const out = await drive(r, 'POST', '/api/auth/login', { nip: '200206302025061002' });
  assert.equal(out.status, 500);
  assert.equal(out.body.ok, false);
});

test('session: error DB dibalas 500, bukan melempar', async () => {
  process.env.TELEGRAM_BOT_TOKEN = BOT;
  const { createAuthSessionRouter } = await import('./auth-session.js');
  const r = createAuthSessionRouter({ query: async () => { throw new Error('down'); } });
  const out = await drive(r, 'POST', '/api/auth/session', { init_data: signInitData(TG_ID) });
  assert.equal(out.status, 500);
  assert.equal(out.body.ok, false);
});

test('logout: error DB dibalas 500, bukan melempar', async () => {
  const { createAuthSessionRouter } = await import('./auth-session.js');
  const r = createAuthSessionRouter({ query: async () => { throw new Error('down'); } });
  const out = await drive(r, 'POST', '/api/auth/logout', { session_token: 'c'.repeat(192) });
  assert.equal(out.status, 500);
});

// ── SSO cookie arsip (injeksi util asli + secret dummy) ──

test('login NIP sukses menerbitkan cookie arsip_session', async () => {
  process.env.ARSIP_SESSION_SECRET = 'arsip-secret-16-chars-ok';
  const { createAuthSessionRouter } = await import('./auth-session.js');
  const { pasangArsipCookie, lepasArsipCookie } = await import('./arsip-sso.js');
  const r = createAuthSessionRouter({
    query: async (sql) => {
      if (/user_list/i.test(sql)) return userListRows(sql, { id: '9', NIP: '12345', role: 'USER', instansi_id: 'bapperida' });
      if (/INSERT INTO auth_sessions/i.test(sql)) return { rows: [{ session_token: 'd'.repeat(192) }] };
      return { rows: [] };
    },
    arsipSso: { pasangArsipCookie, lepasArsipCookie },
  });
  const out = await drive(r, 'POST', '/api/auth/login', { nip: '12345' });
  assert.equal(out.status, 200);
  const set = out.setCookies.find((h) => /^arsip_session=/.test(h));
  assert.ok(set, 'wajib ada header arsip_session');
  assert.match(set, /Domain=\.mindcloud\.my\.id/);
  assert.match(set, /HttpOnly/);
  assert.match(set, /Path=\//);
});

test('login sukses TANPA secret arsip tidak set cookie (fail-open)', async () => {
  delete process.env.ARSIP_SESSION_SECRET;
  const { createAuthSessionRouter } = await import('./auth-session.js');
  const { pasangArsipCookie, lepasArsipCookie } = await import('./arsip-sso.js');
  const r = createAuthSessionRouter({
    query: async (sql) => {
      if (/user_list/i.test(sql)) return userListRows(sql, { id: '9', NIP: '12345', role: 'USER', instansi_id: 'bapperida' });
      if (/INSERT INTO auth_sessions/i.test(sql)) return { rows: [{ session_token: 'd'.repeat(192) }] };
      return { rows: [] };
    },
    arsipSso: { pasangArsipCookie, lepasArsipCookie },
  });
  const out = await drive(r, 'POST', '/api/auth/login', { nip: '12345' });
  assert.equal(out.status, 200, 'login tetap sukses meski secret arsip kosong');
  assert.ok(!out.setCookies.some((h) => /^arsip_session=/.test(h)));
});

test('logout membersihkan cookie arsip', async () => {
  process.env.ARSIP_SESSION_SECRET = 'arsip-secret-16-chars-ok';
  const { createAuthSessionRouter } = await import('./auth-session.js');
  const { pasangArsipCookie, lepasArsipCookie } = await import('./arsip-sso.js');
  const r = createAuthSessionRouter({
    query: async () => ({ rows: [] }),
    arsipSso: { pasangArsipCookie, lepasArsipCookie },
  });
  const out = await drive(r, 'POST', '/api/auth/logout', { session_token: 'c'.repeat(192) });
  assert.equal(out.status, 200);
  const cleared = out.setCookies.find((h) => /^arsip_session=;/.test(h));
  assert.ok(cleared, 'clearCookie harus mengosongkan arsip_session');
  assert.match(cleared, /Max-Age=0/);
});
