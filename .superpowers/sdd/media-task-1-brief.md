# Task 1 brief - plan 2026-10-02-media-drive.md

BASE commit: 07ebdd8 (master)

---

### Task 1: Backend skeleton â€” dependencies, database pool, token parsing, health route

Establishes the Express app and the two pure functions every later task depends on. No media logic yet.

**Files:**
- Modify: `package.json`
- Create: `server/db.js`
- Create: `server/auth.js`
- Create: `server/index.js`
- Create: `server/media.test.js`

**Interfaces:**
- Produces: `query(text, params)` â†’ `Promise<pg.QueryResult>`, `closePool()` â†’ `Promise<void>`
- Produces: `parseToken(token)` â†’ `number | null`, `bearerToken(req)` â†’ `string | null`
- Produces: `createApp()` â†’ `express.Application`

- [ ] **Step 1: Write the failing test**

Create `server/media.test.js`:

```js
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
```

- [ ] **Step 2: Run the test to confirm it fails**

```
cd D:\Code\absensi_refactored_v6
node --test server/media.test.js
```

Expected: `ERR_MODULE_NOT_FOUND` for `./auth.js`.

- [ ] **Step 3: Install dependencies**

```
cd D:\Code\absensi_refactored_v6
npm install express@^4.21.2 pg@^8.13.1
```

- [ ] **Step 4: Add the test script**

In `package.json`, change the `scripts` block to:

```json
"scripts": {
  "dev": "vite",
  "build": "vite build",
  "lint": "eslint .",
  "preview": "vite preview",
  "start": "node server/index.js",
  "test": "node --test"
}
```

- [ ] **Step 5: Create `server/db.js`**

```js
import pg from 'pg';

const { Pool } = pg;

let pool = null;

export function getPool() {
  if (!pool) {
    pool = new Pool({
      connectionString: process.env.DATABASE_URL,
      ssl: process.env.PGSSL === 'require' ? { rejectUnauthorized: false } : undefined,
      max: 5,
    });
    pool.on('error', (e) => console.error('[db] idle client error', e.message));
  }
  return pool;
}

export function query(text, params) {
  return getPool().query(text, params);
}

export async function closePool() {
  if (pool) {
    const p = pool;
    pool = null;
    await p.end();
  }
}
```

- [ ] **Step 6: Create `server/auth.js`**

Only the pure helpers live here for now; `requireRole` is added in Task 4.

```js
export function parseToken(token) {
  if (typeof token !== 'string') return null;
  const parts = token.split('_');
  if (parts.length < 3 || parts[0] !== 'usr') return null;
  const id = Number(parts[1]);
  return Number.isSafeInteger(id) && id > 0 ? id : null;
}

export function bearerToken(req) {
  const raw = req.headers?.authorization || '';
  const [scheme, ...rest] = raw.split(' ');
  const value = rest.join(' ').trim();
  if (!value) return null;
  return scheme.toLowerCase() === 'bearer' ? value : value === raw.trim() ? raw.trim() : null;
}
```

- [ ] **Step 7: Create `server/index.js`**

```js
import express from 'express';
import { closePool } from './db.js';

export function createApp() {
  const app = express();
  app.use(express.json({ limit: '8mb' }));

  app.get('/api/health', (_req, res) => {
    res.json({ ok: true, service: 'absensi-media' });
  });

  return app;
}

const isMain = process.argv[1] && import.meta.url.endsWith(process.argv[1].replace(/\\/g, '/').split('/').pop());
if (isMain) {
  const port = Number(process.env.PORT || 8081);
  createApp().listen(port, () => console.log(`[media] listening on :${port}`));
  for (const sig of ['SIGINT', 'SIGTERM']) {
    process.on(sig, async () => {
      await closePool();
      process.exit(0);
    });
  }
}
```

- [ ] **Step 8: Run the test to confirm it passes**

```
cd D:\Code\absensi_refactored_v6
node --test server/media.test.js
```

Expected: 4 passing.

- [ ] **Step 9: Verify nothing regressed**

```
cd D:\Code\absensi_refactored_v6
npm test
```

Expected: 57 passing (53 baseline + 4 new).

- [ ] **Step 10: Commit**

```
cd D:\Code\absensi_refactored_v6
git add package.json package-lock.json server/
git commit -m "feat(server): add Express skeleton, pg pool, and session token parser"
```

---

