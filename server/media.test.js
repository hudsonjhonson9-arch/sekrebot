import test from 'node:test';
import assert from 'node:assert/strict';
import { parseToken, bearerToken } from './auth.js';

test('parseToken membaca user id dari token sesi', () => {
  assert.equal(parseToken('usr_1383864355_1750000000000'), 1383864355);
});

test('parseToken menolak bentuk token lain', () => {
  for (const bad of ['', 'abc', 'usr_', 'usr_abc_123', 'usr_12', null, undefined, 12345]) {
    assert.equal(parseToken(bad), null, `harus menolak: ${String(bad)}`);
  }
});

test('parseToken menolak prefix yang bukan usr', () => {
  assert.equal(parseToken('admin_1383864355_1750000000000'), null);
});

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
