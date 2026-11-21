import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createTrackQueue,
  trackLabelFor,
  trackStripQuery,
  wrapFetchForTracking,
  TRACK_ENDPOINT,
} from '../js/dev-tools.js';

const okRes = (status = 200) => ({ ok: status >= 200 && status < 300, status });
const el = (o = {}) => ({ getAttribute: (n) => (n === 'aria-label' ? o.aria : null), innerText: o.text, id: o.id, tagName: o.tag || 'BUTTON' });

function makeQueue(over = {}) {
  const calls = [];
  const q = createTrackQueue({
    fetchImpl: async (url, init) => { calls.push({ url, init, body: JSON.parse(init.body) }); return over.res ? over.res(calls.length) : okRes(); },
    now: () => 1000,
    getPage: () => '/index.html',
    ...over.opts,
  });
  return { q, calls };
}

test('trackLabelFor: aria-label -> teks -> id -> tag', () => {
  assert.equal(trackLabelFor(el({ aria: ' Tutup ', text: 'x', id: 'b' })), 'Tutup');
  assert.equal(trackLabelFor(el({ text: '  Absen\n   Masuk ', id: 'b' })), 'Absen Masuk');
  assert.equal(trackLabelFor(el({ text: '   ', id: 'btnSimpan' })), 'btnSimpan');
  assert.equal(trackLabelFor(el({ text: '', tag: 'DIV' })), 'div');
  assert.equal(trackLabelFor(el({ text: 'a'.repeat(200) })).length, 80);
});

test('trackStripQuery: query dan hash dibuang (token/NIP tidak ikut tersimpan)', () => {
  assert.equal(trackStripQuery('/api/x?token=rahasia&nip=1#h'), '/api/x');
  assert.equal(trackStripQuery('/api/x'), '/api/x');
});

test('track: event berisi kind, ts, page, label, detail', async () => {
  const { q } = makeQueue();
  q.track('click', { label: 'Absen', detail: { id: 'b1' } });
  assert.deepEqual(q.queue[0], { kind: 'click', ts: 1000, page: '/index.html', label: 'Absen', detail: { id: 'b1' } });
});

test('antrean dibatasi 500: yang terlama dibuang', () => {
  const { q } = makeQueue({ opts: { flushAt: 100000 } });
  for (let i = 0; i < 520; i++) q.track('click', { label: `b${i}` });
  assert.equal(q.queue.length, 500);
  assert.equal(q.queue[0].label, 'b20');
});

test('flush otomatis saat antrean >= 20; antrean kosong setelah sukses', async () => {
  const { q, calls } = makeQueue();
  for (let i = 0; i < 20; i++) q.track('click', { label: `b${i}` });
  await new Promise((r) => setTimeout(r, 10));
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, TRACK_ENDPOINT);
  assert.equal(calls[0].body.events.length, 20);
  assert.equal(q.queue.length, 0);
});

test('flushNow mengirim maks 50 per request dan melanjutkan sisa', async () => {
  const { q, calls } = makeQueue({ opts: { flushAt: 1000 } });
  for (let i = 0; i < 120; i++) q.track('click', { label: `b${i}` });
  await q.flushNow();
  assert.deepEqual(calls.map((c) => c.body.events.length), [50, 50, 20]);
  assert.equal(q.queue.length, 0);
});

test('gagal jaringan: event tetap di antrean untuk dicoba lagi', async () => {
  let fail = true;
  const q = createTrackQueue({ fetchImpl: async () => { if (fail) throw new TypeError('offline'); return okRes(); }, flushAt: 1000 });
  q.track('click', { label: 'a' });
  assert.equal(await q.flushNow(), false);
  assert.equal(q.queue.length, 1);
  fail = false;
  assert.equal(await q.flushNow(), true);
  assert.equal(q.queue.length, 0);
});

test('non-OK (401/500): event dipertahankan; 400: batch dibuang', async () => {
  const keep = makeQueue({ res: () => okRes(401), opts: { flushAt: 1000 } });
  keep.q.track('click', { label: 'a' });
  await keep.q.flushNow();
  assert.equal(keep.q.queue.length, 1);
  const drop = makeQueue({ res: () => okRes(400), opts: { flushAt: 1000 } });
  drop.q.track('click', { label: 'a' });
  await drop.q.flushNow();
  assert.equal(drop.q.queue.length, 0);
});

test('flag _flushing: dua flush bersamaan hanya mengirim satu request', async () => {
  let release;
  const gate = new Promise((r) => { release = r; });
  let n = 0;
  const q = createTrackQueue({ fetchImpl: async () => { n++; await gate; return okRes(); }, flushAt: 1000 });
  q.track('click', { label: 'a' });
  const p1 = q.flushNow();
  const p2 = q.flushNow();
  release();
  await Promise.all([p1, p2]);
  assert.equal(n, 1);
});

test('pagehide (keepalive): keepalive:true dan body dibatasi ~60KB', async () => {
  const { q, calls } = makeQueue({ opts: { flushAt: 1000 } });
  for (let i = 0; i < 50; i++) q.track('error', { label: 'e', detail: { stack: 'x'.repeat(1500), a: 'y'.repeat(500) } });
  await q.flushNow({ keepalive: true });
  assert.equal(calls[0].init.keepalive, true);
  assert.ok(calls[0].init.body.length <= 62000, `body ${calls[0].init.body.length}`);
  assert.ok(q.queue.length > 0, 'sisa tetap di antrean');
});

test('detail dipangkas: stack 1500, string lain 500, label 300', () => {
  const { q } = makeQueue({ opts: { flushAt: 1000 } });
  q.track('error', { label: 'l'.repeat(999), detail: { stack: 's'.repeat(9999), message: 'm'.repeat(9999), status: 500 } });
  const e = q.queue[0];
  assert.equal(e.label.length, 300);
  assert.equal(e.detail.stack.length, 1500);
  assert.equal(e.detail.message.length, 500);
  assert.equal(e.detail.status, 500);
});

test('wrapFetchForTracking: status >= 400 dicatat sebagai api_fail, response utuh', async () => {
  const seen = [];
  const f = wrapFetchForTracking(async () => okRes(500), (k, d) => seen.push([k, d]));
  const res = await f('/api/log/add?token=rahasia', { method: 'post' });
  assert.equal(res.status, 500);
  assert.equal(seen.length, 1);
  assert.equal(seen[0][0], 'api_fail');
  assert.deepEqual(seen[0][1].detail, { url: '/api/log/add', method: 'POST', status: 500 });
});

test('wrapFetchForTracking: sukses tidak dicatat', async () => {
  const seen = [];
  const f = wrapFetchForTracking(async () => okRes(200), (...a) => seen.push(a));
  await f('/api/x');
  assert.equal(seen.length, 0);
});

test('wrapFetchForTracking: network error dicatat lalu DILEMPAR ULANG', async () => {
  const seen = [];
  const boom = new TypeError('Failed to fetch');
  const f = wrapFetchForTracking(async () => { throw boom; }, (k, d) => seen.push([k, d]));
  await assert.rejects(() => f('/api/x'), (e) => e === boom);
  assert.equal(seen[0][1].detail.status, 0);
  assert.equal(seen[0][1].detail.message, 'Failed to fetch');
});

test('wrapFetchForTracking: AbortError tidak dicatat', async () => {
  const seen = [];
  const abort = Object.assign(new Error('aborted'), { name: 'AbortError' });
  const f = wrapFetchForTracking(async () => { throw abort; }, (...a) => seen.push(a));
  await assert.rejects(() => f('/api/x'));
  assert.equal(seen.length, 0);
});

test('wrapFetchForTracking: loop guard — request ke /api/dev/track tidak dicatat (sukses maupun gagal)', async () => {
  const seen = [];
  const bad = wrapFetchForTracking(async () => okRes(500), (...a) => seen.push(a));
  await bad(TRACK_ENDPOINT, { method: 'POST' });
  await bad('/api/dev/track/summary?days=7');
  const down = wrapFetchForTracking(async () => { throw new TypeError('offline'); }, (...a) => seen.push(a));
  await assert.rejects(() => down(TRACK_ENDPOINT, { method: 'POST' }));
  assert.equal(seen.length, 0);
});
