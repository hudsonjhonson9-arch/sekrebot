import test from 'node:test';
import assert from 'node:assert/strict';
import {
  bearerToken,
  requireRole,
  sameInstansi,
  isSessionToken,
  MEDIA_ROLES,
  SESSION_LOOKUP_SQL,
  singleSessionRow,
} from './auth.js';

test('bearerToken membaca header Authorization', () => {
  assert.equal(bearerToken({ headers: { authorization: 'Bearer usr_1_2' } }), 'usr_1_2');
  assert.equal(bearerToken({ headers: { authorization: 'usr_1_2' } }), 'usr_1_2');
  assert.equal(bearerToken({ headers: {} }), null);
  assert.equal(bearerToken({ headers: { authorization: 'Basic abc' } }), null);
});

// --- Task 3: validasi payload + klien Apps Script -----------------------------
// fetch di-stub, tidak ada jaringan. gas.js tetap butuh GAS_WEBAPP_URL ada,
// jadi diset di sini supaya `node --test` tanpa env eksternal tetap hijau.
const GAS_URL = process.env.GAS_WEBAPP_URL || 'https://example.invalid/exec';
process.env.GAS_WEBAPP_URL = GAS_URL;

import { decodeDataUrl, fileIdFromDriveUrl, MAX_IMAGE_BYTES } from './media-payload.js';
import { gasHealth, gasUpsert, existingFileId } from './gas.js';

const REAL_FETCH = globalThis.fetch;

function stubFetch(handler) {
  globalThis.fetch = handler;
}

function restoreFetch() {
  globalThis.fetch = REAL_FETCH;
}

function okJson(body) {
  return { ok: true, status: 200, json: async () => body };
}

test('decodeDataUrl memecah data URL gambar', () => {
  const png = Buffer.from([0x89, 0x50, 0x4e, 0x47]).toString('base64');
  const out = decodeDataUrl(`data:image/png;base64,${png}`);
  assert.equal(out.mimeType, 'image/png');
  assert.deepEqual([...out.buffer], [0x89, 0x50, 0x4e, 0x47]);
});

test('decodeDataUrl menolak input yang bukan data URL gambar', () => {
  const bad = [
    '',
    'https://drive.google.com/file/d/abc/view',
    'data:text/plain;base64,aGk=',
    'data:image/png,notbase64',
    'data:image/png;base64,',
    'data:image/svg+xml;base64,PHN2Zz48L3N2Zz4=',
    // varian huruf besar: .toLowerCase() di media-payload.js:10 wajib ada, karena
    // /svg/ di Code.gs:52 juga case-sensitive dan tidak bisa diandalkan
    'data:image/SVG+XML;base64,PHN2Zz48L3N2Zz4=',
    'data:image/Svg+xml;base64,PHN2Zz48L3N2Zz4=',
    'data:image/SVG+xml;base64,PHN2Zz48L3N2Zz4=',
    'DATA:image/SVG+xml;base64,PHN2Zz48L3N2Zz4=',
    null,
    undefined,
  ];
  for (const value of bad) {
    assert.throws(() => decodeDataUrl(value), `harus menolak: ${String(value)}`);
  }
  // svg ditolak karena alasan svg, bukan sekadar gagal regex — aturan sama dengan Code.gs
  for (const svg of [
    'data:image/svg+xml;base64,PHN2Zz48L3N2Zz4=',
    'data:image/SVG+XML;base64,PHN2Zz48L3N2Zz4=',
    'data:image/Svg+xml;base64,PHN2Zz48L3N2Zz4=',
    'data:image/SVG+xml;base64,PHN2Zz48L3N2Zz4=',
    'DATA:image/SVG+xml;base64,PHN2Zz48L3N2Zz4=',
  ]) {
    assert.throws(() => decodeDataUrl(svg), /svg/, `harus ditolak karena svg: ${svg}`);
  }
  assert.equal(fileIdFromDriveUrl('https://drive.google.com/file/d/1AbCdEfGh/view'), '1AbCdEfGh');
  assert.equal(fileIdFromDriveUrl('https://drive.google.com/open?id=1AbCdEfGh'), null);
  assert.equal(fileIdFromDriveUrl(''), null);
  assert.equal(fileIdFromDriveUrl(null), null);
  // id di luar 5..200 karakter ditolak di sini, bukan diteruskan ke Apps Script
  // yang akan membalas 400 "fileId harus id file Drive, bukan URL"
  assert.equal(fileIdFromDriveUrl('https://drive.google.com/file/d/abc/view'), null);
  assert.equal(fileIdFromDriveUrl('https://drive.google.com/file/d/ab/view'), null);
  assert.equal(fileIdFromDriveUrl(`https://drive.google.com/file/d/${'x'.repeat(201)}/view`), null);
  // spasi di tengah id: regex lama memotong jadi '1Ab' yang ditolak Apps Script
  assert.equal(fileIdFromDriveUrl('https://drive.google.com/file/d/1Ab CdEf/view'), null);
  // round 2: prefix hasil pemotongan yang PANJANGNYA sudah >= 5 lolos FILE_ID_RE
  // lalu gasUpsert menunjuk file Drive lain. Harus null, bukan prefix.
  assert.equal(fileIdFromDriveUrl('https://drive.google.com/file/d/1AbCd EfGh/view'), null);
  assert.equal(fileIdFromDriveUrl('https://drive.google.com/file/d/1AbCd.EfGh/view'), null);
  assert.equal(fileIdFromDriveUrl('https://drive.google.com/file/d/1AbCd%EfGh/view'), null);
  // '/' itu pemisah segment sungguhan, bukan pemotongan: id-nya memang '1AbCd'
  assert.equal(fileIdFromDriveUrl('https://drive.google.com/file/d/1AbCd/EfGh/view'), '1AbCd');
  // batas belakang lain tetap diekstraksi penuh (Share link & path tanpa /view)
  assert.equal(fileIdFromDriveUrl('https://drive.google.com/file/d/1AbCdEfGh?usp=sharing'), '1AbCdEfGh');
  assert.equal(fileIdFromDriveUrl('https://drive.google.com/file/d/1AbCdEfGh#x'), '1AbCdEfGh');
  assert.equal(fileIdFromDriveUrl('https://drive.google.com/file/d/1AbCdEfGh'), '1AbCdEfGh');
  // batas panjang tetap diterima: 5 dan 200 karakter lolos FILE_ID_RE
  assert.equal(fileIdFromDriveUrl(`https://drive.google.com/file/d/${'x'.repeat(200)}/view`), 'x'.repeat(200));
  assert.equal(fileIdFromDriveUrl('https://drive.google.com/file/d/abcde/view'), 'abcde');
});

test('decodeDataUrl menolak gambar melebihi 5 MB', () => {
  const big = Buffer.alloc(5 * 1024 * 1024 + 1).toString('base64');
  assert.throws(() => decodeDataUrl(`data:image/png;base64,${big}`), /5 MB/);
  // batas pas 5 MB masih diterima; nilai ini harus sama dengan MAX_BYTES di Code.gs
  assert.equal(MAX_IMAGE_BYTES, 5 * 1024 * 1024);
  const exact = decodeDataUrl(`data:image/png;base64,${Buffer.alloc(MAX_IMAGE_BYTES).toString('base64')}`);
  assert.equal(exact.buffer.length, MAX_IMAGE_BYTES);
  // base64 yang tidak menghasilkan byte apa pun -> buffer kosong
  assert.throws(() => decodeDataUrl('data:image/png;base64,####'), /kosong/);
});

test('gasUpsert mengirim base64 dan mengembalikan fileId + url', async () => {
  const calls = [];
  stubFetch(async (url, init) => {
    calls.push({ url, init, body: JSON.parse(init.body || 'null') });
    return okJson({ ok: true, fileId: 'F1', url: 'https://drive.google.com/file/d/F1/view' });
  });
  try {
    // id diambil dari URL yang tersimpan; Code.gs hanya menerima id polos, bukan URL
    const previousUrl = 'https://drive.google.com/file/d/1AbCdEfGh/view';
    const out = await gasUpsert({
      filename: 'a.png',
      mimeType: 'image/png',
      dataBase64: 'AAA+/w==',
      fileId: existingFileId(previousUrl),
    });
    assert.equal(out.fileId, 'F1');
    assert.equal(out.url, 'https://drive.google.com/file/d/F1/view');
    assert.equal(calls[0].url, GAS_URL);
    assert.equal(calls[0].body.action, 'mediaUpsert');
    assert.equal(calls[0].body.filename, 'a.png');
    assert.equal(calls[0].body.mimeType, 'image/png');
    assert.equal(calls[0].body.dataBase64, 'AAA+/w==');
    assert.ok(calls[0].init.signal instanceof AbortSignal);
    // Code.gs menolak fileId yang berisi URL; id hasil ekstraksi harus lolos FILE_ID_RE
    assert.equal(calls[0].body.fileId, '1AbCdEfGh');
    assert.match(calls[0].body.fileId, /^[-\w]{5,200}$/);
    // tidak boleh ada line break: Code.gs menghitung panjang sebelum decode dan akan 413
    assert.ok(!/\s/.test(calls[0].body.dataBase64), 'base64 tidak boleh dibungkus baris');

    const health = await gasHealth();
    assert.equal(health.ok, true);
    assert.equal(calls[1].url, `${GAS_URL}/?action=health`);
  } finally {
    restoreFetch();
  }
});

test('gasUpsert melempar error saat Apps Script menolak', async () => {
  stubFetch(async () => ({
    ok: false,
    status: 413,
    json: async () => ({ ok: false, message: 'ukuran file melebihi 5 MB' }),
  }));
  try {
    await assert.rejects(
      () => gasUpsert({ filename: 'a.png', mimeType: 'image/png', dataBase64: 'AAAA' }),
      /5 MB/,
    );

    stubFetch(async () => okJson({ ok: true, fileId: 'F1' }));
    await assert.rejects(
      () => gasUpsert({ filename: 'a.png', mimeType: 'image/png', dataBase64: 'AAAA' }),
      /fileId/,
    );

    stubFetch(async () => okJson({ ok: true, url: 'https://drive.google.com/file/d/F1/view' }));
    await assert.rejects(
      () => gasUpsert({ filename: 'a.png', mimeType: 'image/png', dataBase64: 'AAAA' }),
      /fileId/,
    );

    stubFetch(async () => okJson({ ok: true, fileId: 'F1', url: 'u' }));
    const saved = process.env.GAS_WEBAPP_URL;
    delete process.env.GAS_WEBAPP_URL;
    try {
      await assert.rejects(
        () => gasUpsert({ filename: 'a.png', mimeType: 'image/png', dataBase64: 'AAAA' }),
        /GAS_WEBAPP_URL/,
      );
    } finally {
      process.env.GAS_WEBAPP_URL = saved;
    }
  } finally {
    restoreFetch();
  }
});

test('callGas_ melapor respons bukan JSON dan body JSON null', async () => {
  // body HTML dengan status 200 = deployment belum di-deploy untuk "Anyone".
  // Error wajib menyebut bukan JSON, bukan "HTTP 200" yang menyesatkan.
  stubFetch(async () => ({
    ok: true,
    status: 200,
    json: async () => {
      throw new SyntaxError('Unexpected token < in JSON at position 0');
    },
  }));
  try {
    await assert.rejects(
      () => gasUpsert({ filename: 'a.png', mimeType: 'image/png', dataBase64: 'AAAA' }),
      (err) => {
        assert.ok(err instanceof Error, 'harus Error biasa');
        assert.equal(err.name, 'Error', 'harus Error, bukan TypeError');
        assert.match(err.message, /respons bukan JSON/);
        assert.match(err.message, /"Anyone"/);
        assert.match(err.message, /\/exec/);
        return true;
      },
    );

    // body JSON `null` dulu bocor TypeError: Cannot read properties of null
    stubFetch(async () => ({ ok: true, status: 200, json: async () => null }));
    await assert.rejects(
      () => gasUpsert({ filename: 'a.png', mimeType: 'image/png', dataBase64: 'AAAA' }),
      (err) => {
        assert.equal(err.name, 'Error', 'harus Error, bukan TypeError');
        assert.doesNotMatch(err.message, /Cannot read properties/);
        assert.match(err.message, /Apps Script HTTP 200/);
        return true;
      },
    );

    // body `{}` tanpa field ok: pesan default, tidak bocor undefined
    stubFetch(async () => ({ ok: true, status: 200, json: async () => ({}) }));
    await assert.rejects(
      () => gasUpsert({ filename: 'a.png', mimeType: 'image/png', dataBase64: 'AAAA' }),
      /Apps Script HTTP 200/,
    );
  } finally {
    restoreFetch();
  }
});

// --- Task 4: middleware autentikasi sesi -----------------------------------------
// Token sesi nyata = encode(gen_random_bytes(48),'hex') -> 192 hex huruf kecil.
const TOKEN = 'a1b2c3d4'.repeat(24);

function fakeRes() {
  const out = { status: 0, body: null };
  return {
    out,
    status(code) {
      out.status = code;
      return this;
    },
    json(body) {
      out.body = body;
      return this;
    },
  };
}

async function runAuth(mw, req) {
  const res = fakeRes();
  let nexted = false;
  await mw(req, res, () => {
    nexted = true;
  });
  return { ...res.out, nexted };
}

// lookup yang dipanggil selalu melempar — jadi "tidak menyentuh database" bisa
// dibuktikan dari calls.count, bukan sekadar diklaim dari status 401.
function forbiddenLookup(calls) {
  return async () => {
    calls.count += 1;
    throw new Error('lookup tidak boleh dipanggil');
  };
}

test('MEDIA_ROLES memuat tepat enam peran yang diizinkan', () => {
  assert.deepEqual(
    [...MEDIA_ROLES].sort(),
    ['ADMIN', 'IRBAN', 'KABID', 'KEPALA', 'SEKRETARIS', 'SUPERADMIN'],
  );
  assert.ok(MEDIA_ROLES instanceof Set);
});

test('isSessionToken hanya menerima 192 hex huruf kecil', () => {
  assert.equal(isSessionToken(TOKEN), true);
  assert.equal(isSessionToken('a'.repeat(191)), false, '191 hex');
  assert.equal(isSessionToken('a'.repeat(193)), false, '193 hex');
  assert.equal(isSessionToken('A'.repeat(192)), false, 'huruf besar: encode hex PG lowercase');
  assert.equal(isSessionToken(`${'a'.repeat(191)}z`), false, 'bukan hex');
  assert.equal(isSessionToken(` ${TOKEN}`), false, 'spasi');
  for (const bad of [null, undefined, 123, '', 'usr_7_1']) {
    assert.equal(isSessionToken(bad), false, `harus menolak: ${String(bad)}`);
  }
});

test('requireRole menolak request tanpa header Authorization', async () => {
  const calls = { count: 0 };
  const { status, body, nexted } = await runAuth(
    requireRole(MEDIA_ROLES, { lookup: forbiddenLookup(calls) }),
    { headers: {} },
  );
  assert.equal(status, 401);
  assert.equal(body.ok, false);
  assert.equal(nexted, false);
  assert.equal(calls.count, 0, 'tanpa token tidak boleh menyentuh database');
});

test('requireRole menolak token legacy usr_<id>_<ts> tanpa query', async () => {
  // Format lama n8n: id dibaca langsung dari token tanpa tanda tangan, jadi
  // `usr_1_1` berarti user 1. Di sini harus mati di gerbang bentuk token, bukan
  // di gerbang 192-hex, dan tidak boleh sampai ke database.
  const calls = { count: 0 };
  for (const legacy of ['usr_7_1', 'usr_1_1750000000000', 'usr_1383864355_1']) {
    const { status, body, nexted } = await runAuth(
      requireRole(MEDIA_ROLES, { lookup: forbiddenLookup(calls) }),
      { headers: { authorization: `Bearer ${legacy}` } },
    );
    assert.equal(status, 401, legacy);
    assert.equal(body.ok, false, legacy);
    assert.equal(nexted, false, legacy);
  }
  assert.equal(calls.count, 0);
});

test('requireRole menolak token yang bukan 192 hex tanpa query', async () => {
  const calls = { count: 0 };
  const junk = ['', 'Bearer', 'abc', 'a'.repeat(191), 'a'.repeat(193), 'z'.repeat(192), 'A'.repeat(192)];
  for (const token of junk) {
    const { status, nexted } = await runAuth(
      requireRole(MEDIA_ROLES, { lookup: forbiddenLookup(calls) }),
      { headers: { authorization: `Bearer ${token}` } },
    );
    assert.equal(status, 401, token);
    assert.equal(nexted, false, token);
  }
  assert.equal(calls.count, 0);
});

test('requireRole memberi 401 saat lookup tidak menemukan sesi', async () => {
  const calls = { count: 0 };
  let seen = null;
  const { status, body, nexted } = await runAuth(
    requireRole(MEDIA_ROLES, {
      lookup: async (token) => {
        calls.count += 1;
        seen = token;
        return null; // unknown atau sudah expired — query tidak membedakan keduanya
      },
    }),
    { headers: { authorization: `Bearer ${TOKEN}` } },
  );
  assert.equal(status, 401);
  assert.equal(body.ok, false);
  assert.equal(nexted, false);
  assert.equal(calls.count, 1);
  assert.equal(seen, TOKEN, 'token mentah harus diteruskan ke lookup apa adanya');
});

test('requireRole memberi 500 dan tidak memanggil next() saat database error', async () => {
  const { status, body, nexted } = await runAuth(
    requireRole(MEDIA_ROLES, {
      lookup: async () => {
        throw new Error('ECONNREFUSED 127.0.0.1:5432');
      },
    }),
    { headers: { authorization: `Bearer ${TOKEN}` } },
  );
  assert.equal(status, 500, 'outage database bukan 401/403');
  assert.equal(body.ok, false);
  assert.equal(nexted, false, 'next() di sini = outage jadi bypass otorisasi');
  // pesan tidak boleh membocorkan detail internal
  assert.doesNotMatch(JSON.stringify(body), /ECONNREFUSED|5432/);
});

test('requireRole memberi 403 untuk role di luar allowlist', async () => {
  const { status, body, nexted } = await runAuth(
    requireRole(MEDIA_ROLES, {
      lookup: async () => ({ id: '7', nip: '1990', role: 'USER', instansi_id: 'bapperida' }),
    }),
    { headers: { authorization: `Bearer ${TOKEN}` } },
  );
  assert.equal(status, 403);
  assert.equal(body.ok, false);
  assert.equal(nexted, false);
});

test('requireRole meneruskan request dan menempelkan identitas untuk role yang diizinkan', async () => {
  const req = { headers: { authorization: `Bearer ${TOKEN}` } };
  const { status, body, nexted } = await runAuth(
    requireRole(MEDIA_ROLES, {
      lookup: async () => ({ id: '7', nip: '1990', role: 'ADMIN', instansi_id: 'bapperida' }),
    }),
    req,
  );
  assert.equal(status, 0, 'tidak boleh membalas sendiri kalau sudah lolos');
  assert.equal(body, null);
  assert.equal(nexted, true);
  assert.deepEqual(req.user, { id: '7', nip: '1990', role: 'ADMIN', instansi_id: 'bapperida' });
  // Kontrak tipe id: STRING, bukan number. user_list.id itu bigint dan parser default
  // node-postgres (OID 20) sudah jadi string; ::text di SQL mengunci itu. Kalau ini
  // jadi number, `req.user.id === 7` di Task 5 diam-diam salah.
  assert.equal(typeof req.user.id, 'string');
  assert.ok(!Object.is(req.user.id, 7), 'id tidak boleh number');
  // tidak ada perbandingan === terhadap number di server/ — nilai-looking-numeric
  // dipakai lewat String(), bukan identitas tipe.
  assert.match(SESSION_LOOKUP_SQL, /SELECT\s+u\.id::text AS id,/i);
  assert.doesNotMatch(SESSION_LOOKUP_SQL, /u\.id::(int|integer|int4|bigint|numeric)/i);
});

test('role hidup dari user_list menang atas snapshot role di baris sesi', () => {
  // Bagian SQL: kolom yang dibaca adalah u.role, bukan s.role.
  assert.match(
    SESSION_LOOKUP_SQL,
    /SELECT\s+u\.id::text AS id,\s*u\."NIP" AS nip,\s*u\.role,\s*u\.instansi_id/i,
  );
  assert.doesNotMatch(SESSION_LOOKUP_SQL, /\bs\.role\b/, 'snapshot role sesi tidak boleh dipakai');
  assert.match(SESSION_LOOKUP_SQL, /JOIN\s+user_list\s+u\s+ON\s+u\."NIP"\s*=\s*s\.nip/i);
  assert.match(SESSION_LOOKUP_SQL, /s\.is_active/i);
  assert.match(SESSION_LOOKUP_SQL, /s\.expires_at\s*>\s*now\(\)/i);
  // M-1: tanpa LIMIT 1, fan-out NIP dobel terlihat dan singleSessionRow yang menolak.
  assert.doesNotMatch(SESSION_LOOKUP_SQL, /\bLIMIT\b/i, 'LIMIT 1 menyembunyikan NIP dobel');
  assert.doesNotMatch(SESSION_LOOKUP_SQL, /\bOFFSET\b/i);
});

test('singleSessionRow hanya menerima tepat satu baris, tidak pernah memilih', () => {
  const row = { id: '7', nip: '1990', role: 'ADMIN', instansi_id: 'bapperida' };
  assert.equal(singleSessionRow([row]), row);
  // nol baris = sesi tak dikenal/kedaluwarsa
  assert.equal(singleSessionRow([]), null);
  // lebih dari satu = NIP dobel di user_list (index-nya NON-unique). Memilih rows[0]
  // di sini berarti otorisasi bergantung pada urutan yang tidak dijamin.
  assert.equal(singleSessionRow([row, { ...row, id: '8', role: 'SUPERADMIN' }]), null);
  assert.equal(singleSessionRow([row, row, row]), null);
});

test('requireRole memberi 500, bukan menggantung, saat roles bukan Set', async () => {
  // roles.has() di luar try dulu membuat pemanggil yang salah bentuk (Array, bukan
  // Set) menolak di dalam async middleware — Express 4 tidak meneruskan rejected
  // promise, jadi request menggantung selamanya, bukan 403/500.
  const { status, nexted } = await runAuth(
    requireRole(['ADMIN'], { lookup: async () => ({ id: '7', nip: '1990', role: 'ADMIN' }) }),
    { headers: { authorization: `Bearer ${TOKEN}` } },
  );
  assert.equal(status, 500);
  assert.equal(nexted, false);
});

test('requireRole menolak session yang role live-nya USER walau snapshot-nya ADMIN', async () => {
  // Baris hasil query hanya punya role live; kalau ada kolom snapshot ikut terbawa,
  // middleware tetap harus menolak.
  const { status, nexted } = await runAuth(
    requireRole(MEDIA_ROLES, {
      lookup: async () => ({
        id: '7',
        nip: '1990',
        role: 'USER',
        sesi_role: 'ADMIN',
        session_role: 'ADMIN',
      }),
    }),
    { headers: { authorization: `Bearer ${TOKEN}` } },
  );
  assert.equal(status, 403);
  assert.equal(nexted, false);
});

test('semua jalur 401 memakai pesan yang sama dan tidak membocorkan token', async () => {
  const messages = [];
  const push = (r) => messages.push([r.status, r.body.message]);
  push(
    await runAuth(requireRole(MEDIA_ROLES, { lookup: forbiddenLookup({ count: 0 }) }), {
      headers: {},
    }),
  );
  push(
    await runAuth(requireRole(MEDIA_ROLES, { lookup: forbiddenLookup({ count: 0 }) }), {
      headers: { authorization: 'Bearer usr_7_1' },
    }),
  );
  push(
    await runAuth(requireRole(MEDIA_ROLES, { lookup: async () => null }), {
      headers: { authorization: `Bearer ${TOKEN}` },
    }),
  );
  for (const [status, message] of messages) {
    assert.equal(status, 401);
    assert.equal(message, 'Unauthorized', 'pesan 401 harus seragam');
  }
  const joined = JSON.stringify(messages);
  assert.doesNotMatch(joined, new RegExp(TOKEN.slice(0, 16)));
  assert.doesNotMatch(joined, /usr_7_1/);
});

test('sameInstansi: SUPERADMIN lolos, null/undefined tanpa filter, string dibandingkan', () => {
  assert.equal(sameInstansi({ role: 'SUPERADMIN', instansi_id: 'bapperida' }, 'lain'), true);
  assert.equal(sameInstansi({ role: 'ADMIN', instansi_id: 'bapperida' }, 'bapperida'), true);
  assert.equal(sameInstansi({ role: 'ADMIN', instansi_id: 'bapperida' }, 'lain'), false);
  // user_list menyimpan instansi_id sebagai text, target bisa number dari param
  assert.equal(sameInstansi({ role: 'ADMIN', instansi_id: '3' }, 3), true);
  assert.equal(sameInstansi({ role: 'ADMIN', instansi_id: '3' }, null), true);
  assert.equal(sameInstansi({ role: 'ADMIN', instansi_id: '3' }, undefined), true);
});

test('sameInstansi: target kosong fail-closed, bukan lolos', () => {
  // auth_sessions.user_list menyimpan '' (bukan null) untuk user tanpa instansi.
  // Kalau '' diperlakukan sebagai "tanpa filter", setiap user tanpa instansi cocok
  // dengan setiap target tanpa instansi -> kebocoran lintas instansi.
  assert.equal(sameInstansi({ role: 'ADMIN', instansi_id: 'bapperida' }, ''), false);
  assert.equal(sameInstansi({ role: 'ADMIN', instansi_id: '' }, ''), false);
  assert.equal(sameInstansi({ role: 'ADMIN', instansi_id: '' }, 'bapperida'), false);
  // hanya SUPERADMIN yang tetap boleh melewati
  assert.equal(sameInstansi({ role: 'SUPERADMIN', instansi_id: '' }, ''), true);
});

test('⚠️ risiko diketahui: id polos bukan URL -> Apps Script buat duplikat diam-diam', () => {
  // Code.gs:63 hanya menolak fileId yang ADA tapi tidak lolos FILE_ID_RE.
  // fileId null berarti "buat file baru" tanpa error sama sekali. Kalau kolom DB
  // menyimpan id polos (bukan URL /file/d/<id>/view hasil canonicalUrl_), setiap
  // upload membuat duplikat dan foto lama tidak pernah di-update.
  // Batas-batas ini tidak bisa memutuskan masalahnya — Task 4/5 harus query nilainya.
  assert.equal(existingFileId('1AbCdEfGh'), null);
  assert.equal(existingFileId('1AbCdEfGh'), fileIdFromDriveUrl('1AbCdEfGh'));
  // bentuk yang benar tetap jadi id polos, jadi gasUpsert mengirim fileId, bukan URL
  assert.equal(existingFileId('https://drive.google.com/file/d/1AbCdEfGh/view'), '1AbCdEfGh');
});

// --- Task 5: router tulis media (foto wajah + tanda tangan) ----------------------
// Router diuji lewat app Express sungguhan dengan requireRole ASLI, jadi rantai
// token 192-hex -> allowlist role -> req.user -> route ikut teruji, bukan cuma handler.
// Router SENGAJA belum dipasang di server/index.js: js/auth.js:386 membuat token
// 'tg_<id>_<ts>' sendiri di sisi klien (bukan auth_sessions) dengan role 'USER', jadi
// dipasang sebelum Task 12 akan memblokir semua pengguna Telegram WebApp.
import express from 'express';
import { createMediaRouter } from './media.js';

const ME = { id: '42', nip: '199001012010011001', role: 'ADMIN', instansi_id: 'bapperida' };
const PNG = `data:image/png;base64,${Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a]).toString('base64')}`;
const CANON = 'https://drive.google.com/file/d/NEW1/view';

// Baris user_list yang dikembalikan stub. Default = pemanggil sendiri, tanpa media.
function row(over = {}) {
  return {
    id: ME.id,
    nip: ME.nip,
    instansi_id: ME.instansi_id,
    face_photo: null,
    signature: null,
    ...over,
  };
}

function harness({ user = ME, userRow = row(), auth = true, query, gasUpsert } = {}) {
  const sql = [];
  const gas = [];
  const deps = {
    query: async (text, params) => {
      sql.push({ text, params });
      if (query) return query(text, params);
      if (/INSERT\s+INTO\s+"tanda_tangan"/i.test(text)) return { rows: [{ nip: ME.nip }] };
      if (/UPDATE\s+"user_list"/i.test(text)) return { rows: [{ id: String(params[4]) }] };
      if (/\bFROM\s+"user_list"/i.test(text)) return { rows: [userRow] };
      return { rows: [] };
    },
    gasUpsert: async (arg) => {
      gas.push(arg);
      if (gasUpsert) return gasUpsert(arg);
      return { fileId: 'NEW1', url: CANON };
    },
  };
  const app = express();
  app.use(express.json({ limit: '8mb' }));
  if (auth) {
    app.use(requireRole(MEDIA_ROLES, { lookup: async () => ({ ...user }) }));
  }
  app.use('/api/media', createMediaRouter(deps));
  return { app, sql, gas };
}

async function post(h, path, body, headers = {}) {
  const server = await new Promise((resolve) => {
    const s = h.app.listen(0, () => resolve(s));
  });
  try {
    const res = await fetch(`http://127.0.0.1:${server.address().port}${path}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        // 192 hex asli, bukan `usr_<id>_<ts>` yang ditolak isSessionToken() (D-5).
        // Header ini bukan hiasan: requireRole di app uji membacanya.
        Authorization: `Bearer ${TOKEN}`,
        ...headers,
      },
      body: JSON.stringify(body),
    });
    return { status: res.status, body: await res.json().catch(() => null) };
  } finally {
    server.close();
    server.closeAllConnections?.();
  }
}

const FACE = {
  user_id: 42,
  foto_base64: PNG,
  face_descriptor: [0.1, 0.2],
  face_model: 'v1',
  saved_at: '2026-10-02T00:00:00.000Z',
};
const SIG = { nip: ME.nip, signature: PNG };

// --- D-1: perbandingan "dir sendiri" -------------------------------------------
// Plan lama: `targetId !== req.user.id` dengan targetId = Number(user_id) dan
// req.user.id = string ::text. '42' !== 42 selalu true, jadi SETIAP user
// non-SUPERADMIN dapat 403 saat mengupload fotonya sendiri.
test('face: pemanggil menulis fotonya sendiri -> 200 (regresi D-1)', async () => {
  const h = harness();
  const res = await post(h, '/api/media/face', { ...FACE });
  assert.equal(res.status, 200);
  assert.equal(res.body.ok, true);
  assert.equal(res.body.photoUrl, CANON);
  assert.equal(res.body.fileId, 'NEW1');
  const upd = h.sql.find((s) => /UPDATE\s+"user_list"/i.test(s.text));
  assert.ok(upd, 'harus ada UPDATE user_list');
  assert.match(upd.text, /WHERE\s+"id"/i, 'PK user_list adalah "id"');
  assert.ok(upd.params.includes(CANON), 'URL kanonik dikirim sebagai parameter');
  assert.equal(h.gas.length, 1);
});

test('face: user_id string dan number dianggap sama (req.user.id itu ::text)', async () => {
  assert.equal((await post(harness(), '/api/media/face', { ...FACE, user_id: 42 })).status, 200);
  assert.equal((await post(harness(), '/api/media/face', { ...FACE, user_id: '42' })).status, 200);
});

test('face: pegawai lain dalam instansi yang sama -> 200', async () => {
  const h = harness({
    userRow: row({ id: '77', nip: '199501012015011003', instansi_id: 'bapperida' }),
  });
  const res = await post(h, '/api/media/face', { ...FACE, user_id: 77 });
  assert.equal(res.status, 200);
  assert.equal(h.gas.length, 1);
});

test('face: pegawai instansi lain -> 403 dan Drive tidak dipanggil', async () => {
  const h = harness({
    userRow: row({ id: '77', nip: '199501012015011003', instansi_id: 'dpmptsp' }),
  });
  const res = await post(h, '/api/media/face', { ...FACE, user_id: 77 });
  assert.equal(res.status, 403);
  assert.equal(h.gas.length, 0, '403 harus sebelum gasUpsert');
  assert.equal(h.sql.filter((s) => /UPDATE/i.test(s.text)).length, 0);
});

test('face: SUPERADMIN boleh menulis untuk pegawai instansi mana pun', async () => {
  const h = harness({
    user: { ...ME, role: 'SUPERADMIN' },
    userRow: row({ id: '77', nip: '199501012015011003', instansi_id: 'dpmptsp' }),
  });
  const res = await post(h, '/api/media/face', { ...FACE, user_id: 77 });
  assert.equal(res.status, 200);
  assert.equal(h.gas.length, 1);
});

test("face: user tanpa ('') instansi hanya boleh dirinya sendiri", async () => {
  const anonymous = { ...ME, instansi_id: '' };
  const own = harness({ user: anonymous, userRow: row({ instansi_id: '' }) });
  assert.equal((await post(own, '/api/media/face', { ...FACE })).status, 200);

  // '' == '' BUKAN izin: tanpa ini setiap user tanpa instansi cocok dengan setiap
  // target tanpa instansi, 즉 kebocoran lintas instansi.
  const other = harness({
    user: anonymous,
    userRow: row({ id: '77', nip: '199501012015011003', instansi_id: '' }),
  });
  const res = await post(other, '/api/media/face', { ...FACE, user_id: 77 });
  assert.equal(res.status, 403);
  assert.equal(other.gas.length, 0);
});

test('face: target dengan instansi_id NULL -> 403, bukan lolos sebagai "tanpa filter"', async () => {
  // Kolomnya nullable, dan sameInstansi memakai null sebagai "panggil tidak membatasi"
  // (untuk endpoint global). Tanpa normalisasi ke '', user mana pun yang lolos
  // role boleh menulis media pegawai tanpa instansi.
  const h = harness({
    userRow: row({ id: '77', nip: '199501012015011003', instansi_id: null }),
  });
  const res = await post(h, '/api/media/face', { ...FACE, user_id: 77 });
  assert.equal(res.status, 403);
  assert.equal(h.gas.length, 0);
});

test('face: router tanpa requireRole gagal tertutup (403), bukan 200', async () => {
  // Router dipasang tanpa middleware auth = req.user undefined. Perbandingan
  // "dir sendiri" tidak boleh berubah jadi '' === '' dan meloloskan semua orang.
  const h = harness({ auth: false });
  const res = await post(h, '/api/media/face', { ...FACE });
  assert.equal(res.status, 403);
  assert.equal(h.gas.length, 0);
});

// --- validasi & kegagalan upstream ---------------------------------------------
test('face: user_id bukan integer positif -> 400 tanpa menyentuh database', async () => {
  for (const bad of [undefined, null, 0, -1, 1.5, 'abc', '', {}, []]) {
    const h = harness();
    const res = await post(h, '/api/media/face', { ...FACE, user_id: bad });
    assert.equal(res.status, 400, JSON.stringify(bad));
    assert.equal(h.sql.length, 0);
    assert.equal(h.gas.length, 0);
  }
});

test('face: payload bukan data URL image -> 400 dan tidak sampai ke Drive', async () => {
  const bad = [
    '',
    'https://drive.google.com/file/d/abc/view',
    'data:text/plain;base64,aGk=',
    'data:image/svg+xml;base64,PHN2Zz48L3N2Zz4=',
    null,
    undefined,
  ];
  for (const value of bad) {
    const h = harness();
    const res = await post(h, '/api/media/face', { ...FACE, foto_base64: value });
    assert.equal(res.status, 400, JSON.stringify(value));
    assert.equal(h.gas.length, 0);
  }
});

test('face: foto di atas 5 MB -> 400 dan tidak sampai ke Drive', async () => {
  const big = `data:image/png;base64,${Buffer.alloc(MAX_IMAGE_BYTES + 1).toString('base64')}`;
  const h = harness();
  const res = await post(h, '/api/media/face', { ...FACE, foto_base64: big });
  assert.equal(res.status, 400);
  assert.match(res.body.message, /5 MB/);
  assert.equal(h.gas.length, 0);
});

test('face: Apps Script gagal -> 502 dan database tetap bersih', async () => {
  const h = harness({
    gasUpsert: async () => {
      throw new Error('Drive penuh');
    },
  });
  const res = await post(h, '/api/media/face', { ...FACE });
  assert.equal(res.status, 502);
  assert.equal(h.sql.filter((s) => /UPDATE/i.test(s.text)).length, 0, 'tidak ada query tulis');
  assert.equal(h.sql.length, 1, 'hanya resolusi target');
});

test('face: user_id tidak ada -> 404 dan Drive tidak dipanggil', async () => {
  const h = harness({ query: async () => ({ rows: [] }) });
  const res = await post(h, '/api/media/face', { ...FACE, user_id: 999 });
  assert.equal(res.status, 404);
  assert.equal(h.gas.length, 0);
});

test('face: UPDATE 0 baris -> 403 fail-closed (gate scope di SQL menolak)', async () => {
  const h = harness({
    query: async (text) => (/UPDATE/i.test(text) ? { rows: [] } : { rows: [row()] }),
  });
  const res = await post(h, '/api/media/face', { ...FACE });
  assert.equal(res.status, 403, '0 baris = scope SQL tidak cocok = tolak');
});

test('face: descriptor, model, dan saved_at diteruskan apa adanya', async () => {
  const h = harness();
  await post(h, '/api/media/face', { ...FACE, face_descriptor: [0.1, 0.2, 0.3] });
  const upd = h.sql.find((s) => /UPDATE/i.test(s.text));
  assert.equal(upd.params[1], JSON.stringify([0.1, 0.2, 0.3]));
  assert.equal(upd.params[2], '2026-10-02T00:00:00.000Z');
  assert.equal(upd.params[3], 'v1');
  // scope harus ikut di WHERE, bukan hanya di if: route lain yang lupa memanggil
  // sameInstansi() tetap terkunci oleh klausa WHERE-nya sendiri.
  assert.match(upd.text, /"instansi_id"/i);
  assert.match(upd.text, /OR\s+\$7::boolean/i);
});

test('face: nama file Drive memakai NIP dari user_list, bukan dari body', async () => {
  const h = harness({ userRow: row({ id: '77', nip: '199501012015011003' }) });
  const res = await post(h, '/api/media/face', {
    ...FACE,
    user_id: 77,
    nip: 'PALANG-BOHONG',
    nama: '<script>alert(1)</script>',
  });
  assert.equal(res.status, 200);
  assert.equal(h.gas[0].filename, 'face-77-199501012015011003.png');
});

// --- D-4: tanda tangan harus punya otorisasi ------------------------------------
// Plan lama menulis tanda_tangan dari `nip` body apa adanya: user allowlist mana pun
// bisa menimpa tanda tangan pegawai instansi mana pun.
test('signature: NIP seinstansi -> 200 dan upsert berdasarkan nip', async () => {
  const h = harness({
    userRow: row({ id: '77', nip: '199501012015011003', instansi_id: 'bapperida' }),
  });
  const res = await post(h, '/api/media/signature', { ...SIG, nip: '199501012015011003' });
  assert.equal(res.status, 200);
  assert.equal(res.body.signature, CANON);
  assert.equal(res.body.fileId, 'NEW1');
  const up = h.sql.find((s) => /INSERT\s+INTO\s+"tanda_tangan"/i.test(s.text));
  assert.ok(up, 'harus ada upsert tanda_tangan');
  assert.match(up.text, /ON\s+CONFLICT\s*\("nip"\)/i, 'index unik tanda_tangan_nip_key');
  assert.match(up.text, /NOW\(\)/);
  assert.doesNotMatch(up.text, /NOW\(\)\s*::\s*text/, 'saved_at timestamptz, bukan text');
  assert.match(up.text, /FROM\s+"user_list"/i, 'upsert digerakkan user_list supaya scope ikut di SQL');
  assert.ok(up.params.includes(ME.id), 'saved_by = id pemanggil');
});

test('signature: NIP sendiri -> 200 walau ini tanda tangan pertama', async () => {
  const h = harness();
  const res = await post(h, '/api/media/signature', SIG);
  assert.equal(res.status, 200);
  assert.equal(h.gas.length, 1);
});

test('signature: NIP instansi lain -> 403 dan Drive tidak dipanggil (regresi D-4)', async () => {
  const h = harness({
    userRow: row({ id: '77', nip: '199501012015011003', instansi_id: 'dpmptsp' }),
  });
  const res = await post(h, '/api/media/signature', { ...SIG, nip: '199501012015011003' });
  assert.equal(res.status, 403);
  assert.equal(h.gas.length, 0);
  assert.equal(h.sql.filter((s) => /INSERT/i.test(s.text)).length, 0);
});

test('signature: NIP kosong -> 400 tanpa menyentuh database', async () => {
  for (const bad of ['', '   ', null, undefined]) {
    const h = harness();
    const res = await post(h, '/api/media/signature', { ...SIG, nip: bad });
    assert.equal(res.status, 400, JSON.stringify(bad));
    assert.equal(h.sql.length, 0);
    assert.equal(h.gas.length, 0);
  }
});

test('signature: NIP tidak dikenal -> 404 (keputusan tetap: 404, bukan 403)', async () => {
  const h = harness({ query: async () => ({ rows: [] }) });
  const res = await post(h, '/api/media/signature', { ...SIG, nip: '000000000000000000' });
  assert.equal(res.status, 404);
  assert.equal(h.gas.length, 0);
});

test('signature: NIP dobel di user_list -> 403, tidak pernah memilih salah satu', async () => {
  const h = harness({ query: async () => ({ rows: [row(), row({ id: '78' })] }) });
  const res = await post(h, '/api/media/signature', SIG);
  assert.equal(res.status, 403, 'baris mana yang terpilih menentukan otorisasi');
  assert.equal(h.gas.length, 0);
});

// --- D-7: nilai kolom lama tidak boleh membuat file Drive kedua -------------------
// Bentuk yang BENAR-BENAR ada di produksi: 48/48 baris tanda_tangan berisi
// `https://drive.google.com/uc?export=view&id=<id>`, bukan `/file/d/<id>/view`.
// fileIdFromDriveUrl() hanya kena bentuk /file/d/, jadi tanpa penanganan ini setiap
// upload tanda tangan akan membuat file Drive kedua dan foto lama tidak pernah
// ter-update.
test('signature: URL lama uc?export=view&id=<id> diteruskan, bukan diBuat duplikat', async () => {
  const previous = 'https://drive.google.com/uc?export=view&id=1QS_k34SxIkP5EsRy';
  const h = harness({ userRow: row({ signature: previous }) });
  const res = await post(h, '/api/media/signature', SIG);
  assert.equal(res.status, 200);
  assert.equal(h.gas.length, 1);
  assert.equal(h.gas[0].fileId, '1QS_k34SxIkP5EsRy', 'fileId lama wajib diteruskan');
  assert.match(h.gas[0].fileId, /^[-\w]{5,200}$/, 'harus lolos FILE_ID_RE Code.gs');
});

test('media: semua bentuk nilai kolom dipetakan eksplisit, tidak ada jatuh-through', async () => {
  const cases = [
    ['https://drive.google.com/file/d/1AbCdEfGh/view', '1AbCdEfGh'], // kanonik ( hasil canonicalUrl_ )
    ['https://drive.google.com/uc?export=view&id=1QS_k34SxIkP5EsRy', '1QS_k34SxIkP5EsRy'], // bentuk produksi
    ['https://drive.google.com/open?id=1AbCdEfGh', '1AbCdEfGh'],
    ['https://drive.google.com/file/d/1AbCdEfGh/view?usp=sharing', '1AbCdEfGh'],
    ['1AbCdEfGh', '1AbCdEfGh'], // id polos: TIDAK boleh jadi null -> file kedua
    [null, null], // belum ada
    ['', null],
    ['   ', null], // satu baris user_list berisi spasi
    ['data:image/png;base64,AAAA', null], // legacy inline, belum ada file Drive
    ['https://cdn.example.com/p/foto-12345.png', null], // bukan Drive -> jangan tebak
  ];
  for (const [previous, expected] of cases) {
    const h = harness({ userRow: row({ face_photo: previous }) });
    const res = await post(h, '/api/media/face', { ...FACE });
    assert.equal(res.status, 200, JSON.stringify(previous));
    assert.equal(h.gas[0].fileId, expected, JSON.stringify(previous));
  }
});

// --- D-6 + D-8: pesan internal dan orphan Drive ----------------------------------
test('D-6: detail error internal tidak bocor ke klien tapi masuk log server', async () => {
  const logs = [];
  const realError = console.error;
  console.error = (...args) => logs.push(args.map(String).join(' '));
  try {
    const h = harness({
      gasUpsert: async () => {
        throw new Error('https://script.google.com/macros/s/DEPLOY-ID/exec 403 quota habis');
      },
    });
    const res = await post(h, '/api/media/face', { ...FACE });
    assert.equal(res.status, 502);
    assert.doesNotMatch(JSON.stringify(res.body), /script\.google\.com|quota|DEPLOY-ID/);
    assert.match(logs.join('\n'), /quota/, 'detail harus tetap tercatat di sisi server');
  } finally {
    console.error = realError;
  }
});

test('D-8: gagal simpan DB -> 500 pesan tetap, file Drive yatim tercatat, tidak ada delete', async () => {
  const logs = [];
  const realError = console.error;
  console.error = (...args) => logs.push(args.map(String).join(' '));
  try {
    const h = harness({
      query: async (text) => {
        if (/UPDATE/i.test(text)) throw new Error('permission denied for table user_list');
        return { rows: [row()] };
      },
    });
    const res = await post(h, '/api/media/face', { ...FACE });
    assert.equal(res.status, 500);
    assert.doesNotMatch(JSON.stringify(res.body), /permission denied|user_list/);
    assert.match(logs.join('\n'), /NEW1/, 'fileId yatim harus tercatat supaya bisa direkonsiliasi');
    assert.equal(h.gas.length, 1, 'tidak ada upaya menghapus file Drive: delete yang salah lebih buruk');
  } finally {
    console.error = realError;
  }
});
