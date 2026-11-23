import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import { requireRole, ABSEN_ROLES } from './auth.js';

const { createCoreAdminRouter } = await import('./core-admin.js');

const TOKEN = 'a'.repeat(192);

const ADMIN = {
  id: '7',
  nip: '198001012000011001',
  role: 'ADMIN',
  instansi_id: 'bapperida',
};

const USER = {
  id: '42',
  nip: '199900000000001001',
  role: 'USER',
  instansi_id: 'bapperida',
};

// Bentuk baris asli dari lokasiabsen: kolomnya CamelCase `Nama_Lokasi`.
// Kontrak client (6 tempat / 3 file: admin-lokasi-v9.js, admin.js, admin-face.js)
// membaca `l.nama_lokasi` — tanpa alias SQL, semua kartu/tooltip/LOK_DEF jadi ''.
const LOKASI_ROWS = [
  { id: 1, Nama_Lokasi: 'Kantor Bapperida', instansi_id: 'bapperida', radius: 30 },
];

function harness({ session = ADMIN, query } = {}) {
  const sql = [];
  const app = express();
  app.use(express.json({ limit: '256kb' }));
  // Montasi produksi: router core-admin di-mount untuk seluruh ABSEN_ROLES;
  // endpoint tulis dan daftar lintas-instansi ditolak di dalam handler.
  app.use('/api', requireRole(ABSEN_ROLES, { lookup: async () => ({ ...session }) }));
  app.use('/api', createCoreAdminRouter({
    query: async (text, params) => {
      sql.push({ text, params });
      const r = query ? await query(text, params) : { rows: LOKASI_ROWS.map((x) => ({ ...x })) };
      // Emulasi Postgres: alias `AS nama_lokasi` hanya lahir kalau SQL-nya benar.
      if (text.includes('AS nama_lokasi')) {
        r.rows = r.rows.map((row) => ({ ...row, nama_lokasi: row.Nama_Lokasi }));
      }
      return r;
    },
  }));
  return { app, sql };
}

async function req(h, method, path, body) {
  const server = await new Promise((r) => { const s = h.app.listen(0, () => r(s)); });
  const port = server.address().port;
  try {
    const headers = { authorization: `Bearer ${TOKEN}` };
    if (body !== undefined) headers['content-type'] = 'application/json';
    const res = await fetch(`http://127.0.0.1:${port}${path}`, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    return { status: res.status, body: await res.json() };
  } finally {
    await new Promise((r) => server.close(r));
  }
}

function get(h, path) { return req(h, 'GET', path); }

test('lokasi-list: baris membawa nama_lokasi (kontrak client) selain kolom asli', async () => {
  const h = harness();
  const res = await get(h, '/api/lokasi-list');
  assert.equal(res.status, 200);
  assert.equal(res.body.ok, true);
  const row = res.body.data[0];
  assert.equal(row.Nama_Lokasi, 'Kantor Bapperida', 'kolom asli tetap ikut');
  assert.equal(row.nama_lokasi, 'Kantor Bapperida', 'alias kontrak client');
  const sqlText = h.sql[0].text;
  assert.equal(sqlText.includes('AS nama_lokasi'), true, sqlText);
});

test('USER: user-list dipaksa ke baris miliknya sendiri (bukan instansi/pegawai lain)', async () => {
  const h = harness({ session: USER });
  const res = await get(h, '/api/user-list?user_id=999&instansi_id=instansi_lain');
  assert.equal(res.status, 200);
  assert.equal(res.body.ok, true);
  const q = h.sql.find((s) => /FROM user_list/.test(s.text) && /WHERE/.test(s.text));
  assert.ok(q, 'user-list wajib punya WHERE');
  assert.equal(q.params[0], USER.id, 'akan menarik id sesi sendiri');
});

test('USER: dapat membaca jam-absen, jam-periode-list, kontrol-absen, lokasi-list, bidang-list', async () => {
  for (const p of ['/api/jam-absen', '/api/jam-periode-list', '/api/kontrol-absen', '/api/peringatan-akumulasi', '/api/lokasi-list', '/api/bidang-list']) {
    const h = harness({ session: USER });
    const res = await get(h, p);
    assert.equal(res.status, 200, `${p} harus boleh dibaca pegawai biasa`);
    assert.equal(res.body.ok, true, `${p} ok`);
  }
});

test('USER: instansi-list dan admin-list tetap larangan (broad listing)', async () => {
  for (const p of ['/api/instansi-list', '/api/admin-list']) {
    const h = harness({ session: USER });
    const res = await get(h, p);
    assert.equal(res.status, 403, `${p} harus 403 untuk USER`);
  }
});

test('USER: endpoint tulis master ditolak', async () => {
  const writes = [
    ['POST', '/api/user-add', { id: '1', nama: 'x', nip: '1' }],
    ['POST', '/api/jam-absen', { masuk: '07:00', pulang: '15:00' }],
    ['POST', '/api/jam-periode-add', { nama: 'P', dari: '2026-01-01', sampai: '2026-12-31', masuk: '07:00', pulang: '15:00' }],
    ['POST', '/api/kontrol-absen', { enabled: true }],
    ['POST', '/api/peringatan-akumulasi', { enabled: true }],
    ['POST', '/api/lokasi-add', { nama_lokasi: 'X', latitude: -1, longitude: 120, radius: 50 }],
    ['POST', '/api/libur-add', { tanggal: '2026-08-17', nama: 'Kemerdekaan' }],
  ];
  for (const [method, p, body] of writes) {
    const h = harness({ session: USER });
    const res = await req(h, method, p, body);
    assert.equal(res.status, 403, `${method} ${p} harus 403 untuk USER`);
  }
});

// Bug "Gagal menghapus" = DELETE 0 baris (404) saat SUPERADMIN menghapus lokasi
// yang instansi_id-nya bukan miliknya (mis. filter instansi lain di UI). Otorisasi
// harus lewat sameInstansi (SUPERADMIN bypass), bukan instansi_id pemanggil.
test('lokasi-delete: SUPERADMIN boleh menghapus lokasi instansi lain', async () => {
  const SUPER = { id: '1', nip: '1', role: 'SUPERADMIN', instansi_id: '' };
  const ran = [];
  const q = async (text) => {
    ran.push(text);
    if (/SELECT instansi_id FROM lokasiabsen/.test(text)) return { rows: [{ instansi_id: 'bapperida2' }] };
    if (/DELETE FROM lokasiabsen/.test(text)) return { rows: [{ id: 9, instansi_id: 'bapperida2' }] };
    return { rows: [] };
  };
  const h = harness({ session: SUPER, query: q });
  const res = await req(h, 'DELETE', '/api/lokasi-delete?id=9');
  assert.equal(res.status, 200, JSON.stringify(res.body));
  assert.equal(res.body.ok, true);
  assert.ok(ran.some((t) => /DELETE FROM lokasiabsen/.test(t)), 'DELETE benar-benar dijalankan');
});

test('lokasi-delete: non-superadmin ditolak menghapus instansi lain, DELETE tidak jalan', async () => {
  const ran = [];
  const q = async (text) => {
    ran.push(text);
    if (/SELECT instansi_id FROM lokasiabsen/.test(text)) return { rows: [{ instansi_id: 'instansi_lain' }] };
    return { rows: [] };
  };
  const h = harness({ session: ADMIN, query: q });
  const res = await req(h, 'DELETE', '/api/lokasi-delete?id=9');
  assert.equal(res.status, 403);
  assert.equal(ran.some((t) => /DELETE FROM lokasiabsen/.test(t)), false, 'tidak boleh menghapus');
});

test('lokasi-delete: baris instansi "all" tetap bisa dihapus admin biasa', async () => {
  const q = async (text) => {
    if (/SELECT instansi_id FROM lokasiabsen/.test(text)) return { rows: [{ instansi_id: 'all' }] };
    if (/DELETE FROM lokasiabsen/.test(text)) return { rows: [{ id: 9, instansi_id: 'all' }] };
    return { rows: [] };
  };
  const h = harness({ session: ADMIN, query: q });
  const res = await req(h, 'DELETE', '/api/lokasi-delete?id=9');
  assert.equal(res.status, 200, JSON.stringify(res.body));
});

test('lokasi-update: tidak menimpa instansi_id bila body tidak mengirimnya', async () => {
  let updated = null;
  const q = async (text, params) => {
    if (/SELECT instansi_id FROM lokasiabsen/.test(text)) return { rows: [{ instansi_id: 'bapperida2' }] };
    if (/UPDATE lokasiabsen/.test(text)) { updated = params; return { rows: [{ id: 9 }] }; }
    return { rows: [] };
  };
  const SUPER = { id: '1', nip: '1', role: 'SUPERADMIN', instansi_id: '' };
  const h = harness({ session: SUPER, query: q });
  const res = await req(h, 'POST', '/api/lokasi-update', { id: '9', nama_lokasi: 'X', hari: 'senin', radius: 30 });
  assert.equal(res.status, 200, JSON.stringify(res.body));
  assert.equal(updated[4], 'bapperida2', 'instansi_id lama dipertahankan');
});

test('lokasi-update: latitude/longitude dikirim ikut di-update (bug pin tak bisa diperbaiki)', async () => {
  let updated = null;
  let sqlText = '';
  const q = async (text, params) => {
    if (/SELECT instansi_id FROM lokasiabsen/.test(text)) return { rows: [{ instansi_id: 'bapperida' }] };
    if (/UPDATE lokasiabsen/.test(text)) { updated = params; sqlText = text; return { rows: [{ id: 9 }] }; }
    return { rows: [] };
  };
  const h = harness({ session: ADMIN, query: q });
  const res = await req(h, 'POST', '/api/lokasi-update', {
    id: '9', nama_lokasi: 'X', hari: 'senin', radius: 30,
    latitude: -9.648769, longitude: 119.389232,
  });
  assert.equal(res.status, 200, JSON.stringify(res.body));
  assert.match(sqlText, /latitude=\$7/);
  assert.match(sqlText, /longitude=\$8/);
  assert.equal(updated[6], -9.648769, 'latitude masuk $7');
  assert.equal(updated[7], 119.389232, 'longitude masuk $8');
  assert.equal(updated[4], 'bapperida', 'posisi instansi_id tidak bergeser');
});

test('lokasi-update: tanpa latitude/longitude, kolom koordinat tidak disentuh', async () => {
  let sqlText = '';
  const q = async (text) => {
    if (/SELECT instansi_id FROM lokasiabsen/.test(text)) return { rows: [{ instansi_id: 'bapperida' }] };
    if (/UPDATE lokasiabsen/.test(text)) { sqlText = text; return { rows: [{ id: 9 }] }; }
    return { rows: [] };
  };
  const h = harness({ session: ADMIN, query: q });
  const res = await req(h, 'POST', '/api/lokasi-update', { id: '9', nama_lokasi: 'X', hari: 'senin', radius: 30 });
  assert.equal(res.status, 200, JSON.stringify(res.body));
  assert.doesNotMatch(sqlText, /latitude=/);
});

test('lokasi-update: koordinat tidak valid atau sebagian ditolak 400 tanpa UPDATE', async () => {
  const cases = [
    { latitude: 999, longitude: 119.389232, why: 'latitude di luar rentang' },
    { latitude: 'abc', longitude: 119.389232, why: 'latitude bukan angka' },
    { latitude: -9.648769, why: 'longitude hilang' },
    { longitude: 119.389232, why: 'latitude hilang' },
  ];
  for (const c of cases) {
    let ranUpdate = false;
    const q = async (text) => {
      if (/SELECT instansi_id FROM lokasiabsen/.test(text)) return { rows: [{ instansi_id: 'bapperida' }] };
      if (/UPDATE lokasiabsen/.test(text)) { ranUpdate = true; return { rows: [{ id: 9 }] }; }
      return { rows: [] };
    };
    const h = harness({ session: ADMIN, query: q });
    const res = await req(h, 'POST', '/api/lokasi-update', { id: '9', nama_lokasi: 'X', hari: 'senin', radius: 30, ...c });
    assert.equal(res.status, 400, `${c.why}: harus 400, dapat ${res.status}`);
    assert.equal(ranUpdate, false, `${c.why}: UPDATE tidak boleh jalan`);
  }
});

// ── Peringatan akumulasi waktu (config scheduler, key='peringatan_akumulasi') ──

test('peringatan-akumulasi: GET tanpa baris config -> default OFF (enabled:false, ambang 435)', async () => {
  const q = async (text) => {
    if (/FROM pengaturan/.test(text)) return { rows: [] };
    return { rows: [] };
  };
  const h = harness({ session: ADMIN, query: q });
  const res = await get(h, '/api/peringatan-akumulasi');
  assert.equal(res.status, 200, JSON.stringify(res.body));
  assert.equal(res.body.data.config.enabled, false, 'default wajib OFF — scheduler tidak boleh kirim tanpa admin mengaktifkan');
  assert.equal(res.body.data.config.ambang_menit, 435);
});

test('peringatan-akumulasi: GET membaca config tersimpan (enabled + ambang)', async () => {
  const q = async (text) => {
    if (/FROM pengaturan/.test(text)) return { rows: [{ value: JSON.stringify({ enabled: true, ambang_menit: 300 }) }] };
    return { rows: [] };
  };
  const h = harness({ session: ADMIN, query: q });
  const res = await get(h, '/api/peringatan-akumulasi');
  assert.equal(res.status, 200);
  assert.equal(res.body.data.config.enabled, true);
  assert.equal(res.body.data.config.ambang_menit, 300);
});

test('peringatan-akumulasi: POST simpan enabled+ambang ke pengaturan (instansi pemanggil)', async () => {
  let saved = null, sqlText = '';
  const q = async (text, params) => {
    if (/INSERT INTO pengaturan/.test(text)) {
      saved = params; sqlText = text;
      return { rows: [{ key: 'peringatan_akumulasi', value: params[0], instansi_id: params[1] }] };
    }
    return { rows: [] };
  };
  const h = harness({ session: ADMIN, query: q });
  const res = await req(h, 'POST', '/api/peringatan-akumulasi', { enabled: true, ambang_menit: 300 });
  assert.equal(res.status, 200, JSON.stringify(res.body));
  assert.ok(sqlText.includes("'peringatan_akumulasi'"), sqlText);
  const value = JSON.parse(saved[0]);
  assert.equal(value.enabled, true);
  assert.equal(value.ambang_menit, 300);
  assert.equal(saved[1], 'bapperida', 'instansi default = milik pemanggil');
});

// BENDAHARA BARANG = admin aset saja. Jangan bocor ke daftar admin absensi
// (admin_ids → ADMIN_NIPS frontend → IS_ADMIN → tab admin absensi ikut terbuka).
test('jam-absen: query admin mengecualikan BENDAHARA BARANG', async () => {
  const h = harness();
  const res = await get(h, '/api/jam-absen');
  assert.equal(res.status, 200);
  const q = h.sql.find((s) => /FROM user_list WHERE instansi_id/.test(s.text));
  assert.ok(q, 'jam-absen wajib query daftar admin');
  assert.ok(
    /NOT IN \('USER','BENDAHARA BARANG'\)/.test(q.text),
    'BENDAHARA BARANG harus dikeluarkan dari daftar admin jam-absen'
  );
});

// user-edit harus menerima role BENDAHARA BARANG (masuk daftar ROLES) dan
// menyetel is_admin=false (bukan media) sehingga keterangan-notify dll tidak terpicu.
test('user-edit: role BENDAHARA BARANG diterima, is_admin di-set false', async () => {
  let updated = null;
  const q = async (text, params) => {
    if (/SELECT id::text AS id,instansi_id FROM user_list/.test(text)) return { rows: [{ id: '5', instansi_id: 'bapperida' }] };
    if (/UPDATE user_list SET/.test(text)) { updated = params; return { rows: [{ id: '5', nama: 'Bendahara', nip: '1', role: 'BENDAHARA BARANG', instansi_id: 'bapperida' }] }; }
    return { rows: [] };
  };
  const h = harness({ session: ADMIN, query: q });
  const res = await req(h, 'POST', '/api/user-edit', { id: '5', role: 'BENDAHARA BARANG' });
  assert.equal(res.status, 200, JSON.stringify(res.body));
  const roleIdx = updated.indexOf('BENDAHARA BARANG');
  assert.ok(roleIdx !== -1, 'role BENDAHARA BARANG ikut di-UPDATE');
  assert.equal(updated[roleIdx + 1], false, 'is_admin=false (bukan media)');
});

// ── SSO Wewenang & Password Reset ──
test('user-list: query menyertakan status_aktif dan app_permissions', async () => {
  const h = harness();
  const res = await get(h, '/api/user-list');
  assert.equal(res.status, 200);
  const q = h.sql.find((s) => /FROM user_list/.test(s.text));
  assert.ok(q, 'harus ada query user_list');
  assert.ok(q.text.includes('status_aktif'), 'query harus menyertakan status_aktif');
  assert.ok(q.text.includes('app_permissions'), 'query harus menyertakan app_permissions');
});

test('user-permissions: admin bisa update app_permissions dan status_aktif', async () => {
  let updatedParams = null;
  const q = async (text, params) => {
    if (/SELECT id::text AS id,instansi_id FROM user_list/.test(text)) {
      return { rows: [{ id: '10', instansi_id: 'bapperida' }] };
    }
    if (/UPDATE user_list SET/.test(text)) {
      updatedParams = params;
      return { rows: [{ id: '10', username: 'Test', NIP: '19850101', status_aktif: true, app_permissions: params[0] }] };
    }
    return { rows: [] };
  };
  const h = harness({ session: ADMIN, query: q });
  const permissions = {
    absensi: { enabled: true, role: 'PEGAWAI' },
    simapo: { enabled: true, role: 'BENDAHARA_BARANG' },
    satudata: { enabled: true, role: 'KONTRIBUTOR' },
    perencanaan: { enabled: false, role: null },
    webadmin: { enabled: false, role: null }
  };
  const res = await req(h, 'POST', '/api/user-permissions', {
    id: '10',
    app_permissions: permissions,
    status_aktif: true
  });
  assert.equal(res.status, 200, JSON.stringify(res.body));
  assert.ok(updatedParams, 'query update harus terpanggil');
  assert.deepEqual(JSON.parse(updatedParams[0]), permissions);
  assert.equal(updatedParams[1], true);
  assert.equal(updatedParams[2], '10');
});

test('user-permissions: ditolak jika bukan admin (403)', async () => {
  const h = harness({ session: USER });
  const res = await req(h, 'POST', '/api/user-permissions', {
    id: '10',
    app_permissions: {}
  });
  assert.equal(res.status, 403);
});

test('user-reset-password: admin bisa mereset password ke default BapperidaSB2026', async () => {
  let updatedHash = null;
  const q = async (text, params) => {
    if (/SELECT id::text AS id,instansi_id FROM user_list/.test(text)) {
      return { rows: [{ id: '10', instansi_id: 'bapperida' }] };
    }
    if (/UPDATE user_list SET password_hash/.test(text)) {
      updatedHash = params[0];
      return { rows: [{ id: '10', NIP: '19850101' }] };
    }
    return { rows: [] };
  };
  const h = harness({ session: ADMIN, query: q });
  const res = await req(h, 'POST', '/api/user-reset-password', { id: '10' });
  assert.equal(res.status, 200, JSON.stringify(res.body));
  assert.ok(updatedHash, 'hash password harus diupdate');
  assert.ok(updatedHash.startsWith('$2'), 'hash harus berbentuk bcrypt');
});

test('GET /password-toggle: membaca status dari pengaturan', async () => {
  const q = async (text) => {
    if (/FROM pengaturan WHERE.*require_password/i.test(text)) {
      return { rows: [{ key: 'require_password', value: '1' }] };
    }
    return { rows: [] };
  };
  const h = harness({ session: USER, query: q });
  const res = await req(h, 'GET', '/api/password-toggle');
  assert.equal(res.status, 200);
  assert.equal(res.body.enabled, true);
  assert.equal(res.body.value, '1');
});

test('POST /password-toggle: admin bisa menyimpan status require_password', async () => {
  let savedVal = null;
  const q = async (text, params) => {
    if (/INSERT INTO pengaturan/i.test(text)) {
      savedVal = params[0];
      return { rows: [{ key: 'require_password', value: params[0] }] };
    }
    return { rows: [] };
  };
  const h = harness({ session: ADMIN, query: q });
  const res = await req(h, 'POST', '/api/password-toggle', { enabled: true, instansi_id: 'bapperida' });
  assert.equal(res.status, 200);
  assert.equal(res.body.enabled, true);
  assert.equal(savedVal, '1');
});

test('POST /password-toggle: non-admin ditolak 403', async () => {
  const h = harness({ session: USER });
  const res = await req(h, 'POST', '/api/password-toggle', { enabled: true });
  assert.equal(res.status, 403);
});

test('user-list: sesi perangkat Meja Absen (authKind=device) boleh menarik daftar pegawai se-instansi walau role USER', async () => {
  const sql = [];
  const app = express();
  app.use(express.json());
  app.use('/api', (req, _res, next) => {
    req.user = { ...USER };
    req.authKind = 'device';
    next();
  });
  app.use('/api', createCoreAdminRouter({
    query: async (text, params) => {
      sql.push({ text, params });
      return { rows: [{ id: '1', NIP: '111', instansi_id: 'bapperida' }, { id: '2', NIP: '222', instansi_id: 'bapperida' }] };
    },
  }));
  const res = await get({ app, sql }, '/api/user-list?format=full');
  assert.equal(res.status, 200);
  const q = sql.find((s) => /FROM user_list/.test(s.text));
  assert.ok(q, 'user-list query dijalankan');
  assert.match(q.text, /instansi_id=\$1/, 'device token harus menarik satu instansi penuh, bukan hanya id sendiri');
  assert.deepEqual(q.params, ['bapperida']);
});

test('GET /dev/health: admin menerima status kesehatan subsistem backend & DB', async () => {
  const h = harness({
    session: ADMIN,
    query: async (text) => {
      if (/SELECT 1/i.test(text)) return { rows: [{ '?column?': 1 }] };
      return { rows: [] };
    },
  });
  const res = await req(h, 'GET', '/api/dev/health');
  assert.equal(res.status, 200);
  assert.equal(res.body.ok, true);
  assert.equal(res.body.db.ok, true);
  assert.equal(typeof res.body.db.latencyMs, 'number');
  assert.equal(typeof res.body.uptime, 'number');
  assert.ok(res.body.memory && typeof res.body.memory.heapUsed === 'number');
});

test('GET /dev/health: non-admin ditolak 403', async () => {
  const h = harness({ session: USER });
  const res = await req(h, 'GET', '/api/dev/health');
  assert.equal(res.status, 403);
});

test('GET /dev/health: bila DB gagal, db.ok bernilai false', async () => {
  const h = harness({
    session: ADMIN,
    query: async (text) => {
      if (/SELECT 1/i.test(text)) throw new Error('DB Connection Timeout');
      return { rows: [] };
    },
  });
  const res = await req(h, 'GET', '/api/dev/health');
  assert.equal(res.status, 200);
  assert.equal(res.body.ok, true);
  assert.equal(res.body.db.ok, false);
  assert.equal(typeof res.body.db.latencyMs, 'number');
});

test('OPD & Bidang CRUD: instansi-add, instansi-delete (tolak jika masih ada pegawai), bidang CRUD', async () => {
  let deletedBidang = false;
  const q = async (text, params) => {
    if (/INSERT INTO instansi_list/i.test(text)) return { rows: [{ id: params[0], nama_instansi: params[1] }] };
    if (/SELECT 1 FROM user_list WHERE instansi_id/i.test(text)) {
      return { rows: params[0] === 'opd_aktif' ? [{ '?column?': 1 }] : [] };
    }
    if (/DELETE FROM bidang_list WHERE instansi_id/i.test(text)) { deletedBidang = true; return { rows: [] }; }
    if (/DELETE FROM instansi_list WHERE id/i.test(text)) return { rows: [{ id: params[0] }] };
    if (/INSERT INTO bidang_list/i.test(text)) return { rows: [{ id: '9', nama_bidang: params[0], instansi_id: params[1] }] };
    if (/SELECT instansi_id FROM bidang_list WHERE id/i.test(text)) return { rows: [{ instansi_id: 'bapperida' }] };
    if (/UPDATE bidang_list SET nama_bidang/i.test(text)) return { rows: [{ id: params[1], nama_bidang: params[0] }] };
    if (/DELETE FROM bidang_list WHERE id/i.test(text)) return { rows: [{ id: params[0] }] };
    return { rows: [] };
  };
  const hSuper = harness({ session: { ...ADMIN, role: 'SUPERADMIN' }, query: q });
  const hAdmin = harness({ session: ADMIN, query: q });

  const rAdd = await req(hAdmin, 'POST', '/api/instansi-add', { id: 'opd_baru', nama_instansi: 'Dinas Baru' });
  assert.equal(rAdd.status, 201);

  const rDelNonSuper = await req(hAdmin, 'DELETE', '/api/instansi-delete?id=opd_baru');
  assert.equal(rDelNonSuper.status, 403);

  const rDelUsed = await req(hSuper, 'DELETE', '/api/instansi-delete?id=opd_aktif');
  assert.equal(rDelUsed.status, 400);

  const rDelOk = await req(hSuper, 'DELETE', '/api/instansi-delete?id=opd_baru');
  assert.equal(rDelOk.status, 200);
  assert.equal(deletedBidang, true, 'bidang_list milik OPD harus ikut dibersihkan');

  const rBidAdd = await req(hAdmin, 'POST', '/api/bidang-add', { instansi_id: 'bapperida', nama_bidang: 'Sekretariat' });
  assert.equal(rBidAdd.status, 201);
  const rBidUpd = await req(hAdmin, 'POST', '/api/bidang-update', { id: '9', nama_bidang: 'Sekretariat Umum' });
  assert.equal(rBidUpd.status, 200);
  const rBidDel = await req(hAdmin, 'DELETE', '/api/bidang-delete?id=9');
  assert.equal(rBidDel.status, 200);
});
