# Review package - media plan Task 1 FIX ROUND 1

## Commits 73a2b6d..0ef3fc0

0ef3fc0 fix(server): harden shutdown, pool timeouts, env fail-fast, and bearer parsing

## Diff stat

 server/auth.js  | 7 ++++---
 server/db.js    | 5 +++++
 server/index.js | 8 ++++----
 3 files changed, 13 insertions(+), 7 deletions(-)

## Full diff (-U10)

diff --git a/server/auth.js b/server/auth.js
index 7a401bd..4190023 100644
--- a/server/auth.js
+++ b/server/auth.js
@@ -3,14 +3,15 @@ export function parseToken(token) {
   const parts = token.split('_');
   if (parts.length < 3 || parts[0] !== 'usr') return null;
   const id = Number(parts[1]);
   return Number.isSafeInteger(id) && id > 0 ? id : null;
 }
 
 // Header tanpa skema ("usr_1_2") juga diterima; skema selain "bearer" ditolak.
 export function bearerToken(req) {
   const raw = (req.headers?.authorization || '').trim();
   if (!raw) return null;
-  const sp = raw.indexOf(' ');
-  if (sp === -1) return raw;
-  return raw.slice(0, sp).toLowerCase() === 'bearer' && raw.slice(sp + 1).trim() ? raw.slice(sp + 1).trim() : null;
+  const m = /^Bearer\s+(\S+)$/i.exec(raw);
+  if (m) return m[1];
+  // Skema tanpa kredensial ("Bearer") ditolak; bentuk tanpa skema harus satu kata tanpa spasi.
+  return /^\S+$/.test(raw) && !/^bearer$/i.test(raw) ? raw : null;
 }
\ No newline at end of file
diff --git a/server/db.js b/server/db.js
index bcc7248..da572aa 100644
--- a/server/db.js
+++ b/server/db.js
@@ -1,22 +1,27 @@
+import 'dotenv/config';
 import pg from 'pg';
 
 const { Pool } = pg;
 
 let pool = null;
 
 export function getPool() {
   if (!pool) {
+    // Fail-fast di sini, bukan di import: test suite meng-import modul tanpa DATABASE_URL.
+    if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is not set');
     pool = new Pool({
       connectionString: process.env.DATABASE_URL,
       ssl: process.env.PGSSL === 'require' ? { rejectUnauthorized: false } : undefined,
       max: 5,
+      connectionTimeoutMillis: 10000,
+      query_timeout: 30000,
     });
     pool.on('error', (e) => console.error('[db] idle client error', e.message));
   }
   return pool;
 }
 
 export function query(text, params) {
   return getPool().query(text, params);
 }
 
diff --git a/server/index.js b/server/index.js
index 3dae83a..ab6dabc 100644
--- a/server/index.js
+++ b/server/index.js
@@ -8,18 +8,18 @@ export function createApp() {
   app.get('/api/health', (_req, res) => {
     res.json({ ok: true, service: 'absensi-media' });
   });
 
   return app;
 }
 
 const isMain = process.argv[1] && import.meta.url.endsWith(process.argv[1].replace(/\\/g, '/').split('/').pop());
 if (isMain) {
   const port = Number(process.env.PORT || 8081);
-  createApp().listen(port, () => console.log(`[media] listening on :${port}`));
+  const server = createApp().listen(port, () => console.log(`[media] listening on :${port}`));
   for (const sig of ['SIGINT', 'SIGTERM']) {
-    process.on(sig, async () => {
-      await closePool();
-      process.exit(0);
+    // Tutup HTTP dulu, lalu keluar apa pun hasil closePool (I-1: jangan andalkan await di listener).
+    process.on(sig, () => {
+      server.close(() => closePool().finally(() => process.exit(0)));
     });
   }
 }
\ No newline at end of file

