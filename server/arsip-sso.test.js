import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { buatTokenArsip, pasangArsipCookie, lepasArsipCookie, bersihkanSecret, NAMA_COOKIE } from './arsip-sso.js';

const SECRET = 'secret-16-chars-ok';

// Replika verifikasi: meniru peta-ekonomi/server/session.js verifikasiTokenDetail.
function verifikasi(token, secret) {
  const i = token.indexOf('.');
  if (i < 1) return null;
  const isi = token.slice(0, i);
  const expect = crypto.createHmac('sha256', secret).update(isi).digest('base64url');
  const a = Buffer.from(expect);
  const b = Buffer.from(token.slice(i + 1));
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  const m = JSON.parse(Buffer.from(isi, 'base64url').toString('utf8'));
  if (!m.sub || typeof m.exp !== 'number' || m.exp <= Math.floor(Date.now() / 1000)) return null;
  return m;
}

function resMock() {
  const cookies = [];
  return {
    cookies,
    cookie(name, val, opts) { cookies.push({ name, val, opts, cleared: false }); },
    clearCookie(name, opts) { cookies.push({ name, val: '', opts, cleared: true }); },
  };
}

test('buatTokenArsip: format <b64url>.<b64url>', () => {
  const t = buatTokenArsip('123', SECRET);
  assert.match(t, /^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/);
});

test('buatTokenArsip: payload berisi sub dan exp', () => {
  const t = buatTokenArsip('200206302025061002', SECRET);
  const isi = t.slice(0, t.indexOf('.'));
  const m = JSON.parse(Buffer.from(isi, 'base64url').toString('utf8'));
  assert.equal(m.sub, '200206302025061002');
  assert.ok(m.exp > Math.floor(Date.now() / 1000));
});

test('token yang dibuat lolos verifikasi replika, ditolak bila secret salah', () => {
  const t = buatTokenArsip('123', SECRET);
  assert.equal(verifikasi(t, SECRET)?.sub, '123');
  assert.equal(verifikasi(t, 'secret-lain-16-char'), null);
});

test('buatTokenArsip menolak secret kosong', () => {
  assert.throws(() => buatTokenArsip('123', ''));
});

test('bersihkanSecret: guard panjang minimum', () => {
  assert.equal(bersihkanSecret(''), '');
  assert.equal(bersihkanSecret(null), '');
  assert.equal(bersihkanSecret('  pendek  '), '');
  assert.equal(bersihkanSecret('  ' + SECRET + '  '), SECRET);
});

test('pasangArsipCookie: set cookie arsip_session domain .mindcloud.my.id, HttpOnly', () => {
  const res = resMock();
  const ok = pasangArsipCookie(res, '123', { secret: SECRET });
  assert.equal(ok, true);
  assert.equal(res.cookies.length, 1);
  const c = res.cookies[0];
  assert.equal(c.name, NAMA_COOKIE);
  assert.equal(c.opts.domain, '.mindcloud.my.id');
  assert.equal(c.opts.httpOnly, true);
  assert.equal(c.opts.sameSite, 'lax');
  assert.equal(c.opts.secure, true);
  assert.equal(c.opts.path, '/');
  assert.equal(verifikasi(c.val, SECRET)?.sub, '123');
});

test('pasangArsipCookie: fail-open tanpa secret valid', () => {
  const res = resMock();
  assert.equal(pasangArsipCookie(res, '123', { secret: '' }), false);
  assert.equal(pasangArsipCookie(res, '123', { secret: 'pendek' }), false);
  assert.equal(pasangArsipCookie(res, '123', {}), false);
  assert.equal(res.cookies.length, 0);
});

test('lepasArsipCookie: clearCookie dengan domain + path', () => {
  const res = resMock();
  lepasArsipCookie(res);
  assert.equal(res.cookies.length, 1);
  assert.equal(res.cookies[0].name, NAMA_COOKIE);
  assert.equal(res.cookies[0].cleared, true);
  assert.equal(res.cookies[0].opts.domain, '.mindcloud.my.id');
  assert.equal(res.cookies[0].opts.path, '/');
});
