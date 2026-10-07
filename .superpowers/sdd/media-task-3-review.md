# Review package - media plan Task 3

## Commits b689346..9dfb3f6

9dfb3f6 feat(server): validate image payloads and call Apps Script upsert

## Diff stat

 server/gas.js           |  49 +++++++++++++++++
 server/media-payload.js |  23 ++++++++
 server/media.test.js    | 140 ++++++++++++++++++++++++++++++++++++++++++++++++
 3 files changed, 212 insertions(+)

## Full diff (-U10)

diff --git a/server/gas.js b/server/gas.js
new file mode 100644
index 0000000..1cb1a10
--- /dev/null
+++ b/server/gas.js
@@ -0,0 +1,49 @@
+import { fileIdFromDriveUrl } from './media-payload.js';
+
+const TIMEOUT_MS = 45_000;
+
+// Fail-fast saat dipanggil, bukan saat import: test meng-import modul tanpa env.
+function gasUrl_() {
+  const url = process.env.GAS_WEBAPP_URL;
+  if (!url) throw new Error('GAS_WEBAPP_URL belum diset');
+  return url;
+}
+
+async function callGas_(path, init = {}) {
+  const ctrl = new AbortController();
+  const tid = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
+  try {
+    const res = await fetch(gasUrl_() + path, { ...init, signal: ctrl.signal });
+    const json = await res.json().catch(() => ({}));
+    if (!res.ok || !json.ok) {
+      // pesan dari Apps Script diteruskan apa adanya (mis. batas 5 MB)
+      throw new Error(json.message || `Apps Script HTTP ${res.status}`);
+    }
+    return json;
+  } finally {
+    clearTimeout(tid);
+  }
+}
+
+export function gasHealth() {
+  return callGas_('/?action=health');
+}
+
+export async function gasUpsert({ filename, mimeType, dataBase64, fileId }) {
+  // dataBase64 dikirim verbatim, tanpa re-wrap: Code.gs menghitung panjang string
+  // sebelum decode dan akan 413 kalau ada line break. Buffer#toString('base64')
+  // sudah tidak menghasilkan newline.
+  const out = await callGas_('', {
+    method: 'POST',
+    headers: { 'Content-Type': 'application/json' },
+    body: JSON.stringify({ action: 'mediaUpsert', filename, mimeType, dataBase64, fileId: fileId || null }),
+  });
+  if (!out.fileId || !out.url) throw new Error('Apps Script tidak mengembalikan fileId');
+  return { fileId: out.fileId, url: out.url };
+}
+
+// Code.gs hanya menerima id file Drive polos, bukan URL ΓÇö URL disimpan di DB,
+// jadi id diekstrak di sisi server ini.
+export function existingFileId(previousUrl) {
+  return fileIdFromDriveUrl(previousUrl);
+}
diff --git a/server/media-payload.js b/server/media-payload.js
new file mode 100644
index 0000000..c9efcf8
--- /dev/null
+++ b/server/media-payload.js
@@ -0,0 +1,23 @@
+// Batas ini dikunci sama dengan MAX_BYTES di google-apps-script/Code.gs.
+// Kalau salah satu berubah, upload ditolak Apps Script dengan 413 yang membingungkan.
+export const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
+
+const DATA_URL = /^data:(image\/[a-z0-9.+-]+);base64,([\s\S]+)$/i;
+
+export function decodeDataUrl(dataUrl) {
+  const m = DATA_URL.exec(String(dataUrl || ''));
+  if (!m) throw new Error('foto harus berupa data URL image/*;base64');
+  const mimeType = m[1].toLowerCase();
+  // svg ditolak juga di server, aturan sama dengan Code.gs: bisa membawa <script>,
+  // tidak pernah dibutuhkan untuk foto wajah atau tanda tangan.
+  if (/svg/.test(mimeType)) throw new Error('foto svg tidak boleh');
+  const buffer = Buffer.from(m[2], 'base64');
+  if (!buffer.length) throw new Error('base64 kosong');
+  if (buffer.length > MAX_IMAGE_BYTES) throw new Error('ukuran foto melebihi 5 MB');
+  return { buffer, mimeType };
+}
+
+export function fileIdFromDriveUrl(url) {
+  const m = /\/file\/d\/([-\w]+)/.exec(String(url || ''));
+  return m ? m[1] : null;
+}
diff --git a/server/media.test.js b/server/media.test.js
index e9e1dd1..f1793e8 100644
--- a/server/media.test.js
+++ b/server/media.test.js
@@ -14,11 +14,151 @@ test('parseToken menolak bentuk token lain', () => {
 
 test('parseToken menolak prefix yang bukan usr', () => {
   assert.equal(parseToken('admin_1383864355_1750000000000'), null);
 });
 
 test('bearerToken membaca header Authorization', () => {
   assert.equal(bearerToken({ headers: { authorization: 'Bearer usr_1_2' } }), 'usr_1_2');
   assert.equal(bearerToken({ headers: { authorization: 'usr_1_2' } }), 'usr_1_2');
   assert.equal(bearerToken({ headers: {} }), null);
   assert.equal(bearerToken({ headers: { authorization: 'Basic abc' } }), null);
+});
+
+// --- Task 3: validasi payload + klien Apps Script -----------------------------
+// fetch di-stub, tidak ada jaringan. gas.js tetap butuh GAS_WEBAPP_URL ada,
+// jadi diset di sini supaya `node --test` tanpa env eksternal tetap hijau.
+const GAS_URL = process.env.GAS_WEBAPP_URL || 'https://example.invalid/exec';
+process.env.GAS_WEBAPP_URL = GAS_URL;
+
+import { decodeDataUrl, fileIdFromDriveUrl, MAX_IMAGE_BYTES } from './media-payload.js';
+import { gasHealth, gasUpsert, existingFileId } from './gas.js';
+
+const REAL_FETCH = globalThis.fetch;
+
+function stubFetch(handler) {
+  globalThis.fetch = handler;
+}
+
+function restoreFetch() {
+  globalThis.fetch = REAL_FETCH;
+}
+
+function okJson(body) {
+  return { ok: true, status: 200, json: async () => body };
+}
+
+test('decodeDataUrl memecah data URL gambar', () => {
+  const png = Buffer.from([0x89, 0x50, 0x4e, 0x47]).toString('base64');
+  const out = decodeDataUrl(`data:image/png;base64,${png}`);
+  assert.equal(out.mimeType, 'image/png');
+  assert.deepEqual([...out.buffer], [0x89, 0x50, 0x4e, 0x47]);
+});
+
+test('decodeDataUrl menolak input yang bukan data URL gambar', () => {
+  const bad = [
+    '',
+    'https://drive.google.com/file/d/abc/view',
+    'data:text/plain;base64,aGk=',
+    'data:image/png,notbase64',
+    'data:image/png;base64,',
+    'data:image/svg+xml;base64,PHN2Zz48L3N2Zz4=',
+    null,
+    undefined,
+  ];
+  for (const value of bad) {
+    assert.throws(() => decodeDataUrl(value), `harus menolak: ${String(value)}`);
+  }
+  // svg ditolak karena alasan svg, bukan sekadar gagal regex ΓÇö aturan sama dengan Code.gs
+  assert.throws(() => decodeDataUrl('data:image/svg+xml;base64,PHN2Zz48L3N2Zz4='), /svg/);
+  assert.equal(fileIdFromDriveUrl('https://drive.google.com/file/d/1AbCdEfGh/view'), '1AbCdEfGh');
+  assert.equal(fileIdFromDriveUrl('https://drive.google.com/open?id=1AbCdEfGh'), null);
+  assert.equal(fileIdFromDriveUrl(''), null);
+  assert.equal(fileIdFromDriveUrl(null), null);
+});
+
+test('decodeDataUrl menolak gambar melebihi 5 MB', () => {
+  const big = Buffer.alloc(5 * 1024 * 1024 + 1).toString('base64');
+  assert.throws(() => decodeDataUrl(`data:image/png;base64,${big}`), /5 MB/);
+  // batas pas 5 MB masih diterima; nilai ini harus sama dengan MAX_BYTES di Code.gs
+  assert.equal(MAX_IMAGE_BYTES, 5 * 1024 * 1024);
+  const exact = decodeDataUrl(`data:image/png;base64,${Buffer.alloc(MAX_IMAGE_BYTES).toString('base64')}`);
+  assert.equal(exact.buffer.length, MAX_IMAGE_BYTES);
+  // base64 yang tidak menghasilkan byte apa pun -> buffer kosong
+  assert.throws(() => decodeDataUrl('data:image/png;base64,####'), /kosong/);
+});
+
+test('gasUpsert mengirim base64 dan mengembalikan fileId + url', async () => {
+  const calls = [];
+  stubFetch(async (url, init) => {
+    calls.push({ url, init, body: JSON.parse(init.body || 'null') });
+    return okJson({ ok: true, fileId: 'F1', url: 'https://drive.google.com/file/d/F1/view' });
+  });
+  try {
+    // id diambil dari URL yang tersimpan; Code.gs hanya menerima id polos, bukan URL
+    const previousUrl = 'https://drive.google.com/file/d/1AbCdEfGh/view';
+    const out = await gasUpsert({
+      filename: 'a.png',
+      mimeType: 'image/png',
+      dataBase64: 'AAA+/w==',
+      fileId: existingFileId(previousUrl),
+    });
+    assert.equal(out.fileId, 'F1');
+    assert.equal(out.url, 'https://drive.google.com/file/d/F1/view');
+    assert.equal(calls[0].url, GAS_URL);
+    assert.equal(calls[0].body.action, 'mediaUpsert');
+    assert.equal(calls[0].body.filename, 'a.png');
+    assert.equal(calls[0].body.mimeType, 'image/png');
+    assert.equal(calls[0].body.dataBase64, 'AAA+/w==');
+    assert.ok(calls[0].init.signal instanceof AbortSignal);
+    // Code.gs menolak fileId yang berisi URL; id hasil ekstraksi harus lolos FILE_ID_RE
+    assert.equal(calls[0].body.fileId, '1AbCdEfGh');
+    assert.match(calls[0].body.fileId, /^[-\w]{5,200}$/);
+    // tidak boleh ada line break: Code.gs menghitung panjang sebelum decode dan akan 413
+    assert.ok(!/\s/.test(calls[0].body.dataBase64), 'base64 tidak boleh dibungkus baris');
+
+    const health = await gasHealth();
+    assert.equal(health.ok, true);
+    assert.equal(calls[1].url, `${GAS_URL}/?action=health`);
+  } finally {
+    restoreFetch();
+  }
+});
+
+test('gasUpsert melempar error saat Apps Script menolak', async () => {
+  stubFetch(async () => ({
+    ok: false,
+    status: 413,
+    json: async () => ({ ok: false, message: 'ukuran file melebihi 5 MB' }),
+  }));
+  try {
+    await assert.rejects(
+      () => gasUpsert({ filename: 'a.png', mimeType: 'image/png', dataBase64: 'AAAA' }),
+      /5 MB/,
+    );
+
+    stubFetch(async () => okJson({ ok: true, fileId: 'F1' }));
+    await assert.rejects(
+      () => gasUpsert({ filename: 'a.png', mimeType: 'image/png', dataBase64: 'AAAA' }),
+      /fileId/,
+    );
+
+    stubFetch(async () => okJson({ ok: true, url: 'https://drive.google.com/file/d/F1/view' }));
+    await assert.rejects(
+      () => gasUpsert({ filename: 'a.png', mimeType: 'image/png', dataBase64: 'AAAA' }),
+      /fileId/,
+    );
+
+    stubFetch(async () => okJson({ ok: true, fileId: 'F1', url: 'u' }));
+    const saved = process.env.GAS_WEBAPP_URL;
+    delete process.env.GAS_WEBAPP_URL;
+    try {
+      await assert.rejects(
+        () => gasUpsert({ filename: 'a.png', mimeType: 'image/png', dataBase64: 'AAAA' }),
+        /GAS_WEBAPP_URL/,
+      );
+    } finally {
+      process.env.GAS_WEBAPP_URL = saved;
+    }
+  } finally {
+    restoreFetch();
+  }
 });
\ No newline at end of file

