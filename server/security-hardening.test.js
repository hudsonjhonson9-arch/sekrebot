import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { createApp } from './index.js';

async function withServer(fn) {
  const app = createApp();
  const server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address();
  const base = `http://127.0.0.1:${port}`;
  try {
    return await fn(base);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
}

test('Security: file sensitif (/server/*, /package.json, /AGENTS.md, /db/*) diblokir 404 oleh static guard', async () => {
  await withServer(async (base) => {
    for (const p of ['/server/index.js', '/server/auth.js', '/package.json', '/AGENTS.md', '/Dockerfile', '/graphify-out/GRAPH_REPORT.md']) {
      const res = await fetch(`${base}${p}`);
      assert.equal(res.status, 404, `Path sensitif ${p} harus diblokir 404, dapat ${res.status}`);
    }
  });
});

test('Security: CORS menolak refleksi Origin asing & tidak mengirim Access-Control-Allow-Credentials untuk origin asing', async () => {
  await withServer(async (base) => {
    const evil = await fetch(`${base}/api/health`, {
      headers: { Origin: 'https://evil-attacker.example.com' },
    });
    assert.equal(evil.status, 200);
    assert.equal(evil.headers.get('access-control-allow-origin'), null);
    assert.equal(evil.headers.get('access-control-allow-credentials'), null);

    const trusted = await fetch(`${base}/api/health`, {
      headers: { Origin: 'https://absensi.mindcloud.my.id' },
    });
    assert.equal(trusted.headers.get('access-control-allow-origin'), 'https://absensi.mindcloud.my.id');
    assert.equal(trusted.headers.get('access-control-allow-credentials'), 'true');
  });
});

test('Security: HTTP security headers terpasang dan X-Powered-By dimatikan', async () => {
  await withServer(async (base) => {
    const res = await fetch(`${base}/api/health`);
    assert.equal(res.headers.get('x-powered-by'), null);
    assert.equal(res.headers.get('x-content-type-options'), 'nosniff');
    assert.equal(res.headers.get('referrer-policy'), 'strict-origin-when-cross-origin');
    assert.equal(res.headers.get('x-frame-options'), 'SAMEORIGIN');
  });
});
