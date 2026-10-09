import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { verifyInitData } from './telegram.js';

// Token di-pin di dalam test: bot token sungguhan tidak boleh masuk output CI.
const BOT = '123456:TESTTOKEN-not-real';
const USER_ID = 987654321;

// Reimplementasi signer agar test benar-benar menguji verifier kita,
// bukan implementasi yang sama persis.
function sign(payloadPairs) {
  const dataCheckString = Object.entries(payloadPairs)
    .map(([k, v]) => `${k}=${v}`)
    .sort()
    .join('\n');
  const secret = crypto.createHash('sha256').update(BOT).digest();
  const hmac = crypto.createHmac('sha256', secret).update(dataCheckString).digest('hex');
  // Semua pair harus ikut ke query string, kalau tidak verifier menghitung
  // ulang data-check-string yang berbeda dan signature yang sah jadi ditolak.
  return `${new URLSearchParams(payloadPairs).toString()}&hash=${hmac}`;
}

// Meniru initData bot modern (Bot API 7.2+): menyertakan field `signature`
// (Ed25519). Telegram menghitung HMAC hash atas SEMUA field selain hash,
// jadi `signature` tetap ikut di data-check-string HMAC.
function signWithSignature(payloadPairs) {
  const sig = 'test-only-ed25519-signature-field-aaaa-bbbb-cccc-dddd';
  const dataCheckString = Object.entries({ ...payloadPairs, signature: sig })
    .map(([k, v]) => `${k}=${v}`)
    .sort()
    .join('\n');
  const secret = crypto.createHash('sha256').update(BOT).digest();
  const hmac = crypto.createHmac('sha256', secret).update(dataCheckString).digest('hex');
  const qs = new URLSearchParams({ ...payloadPairs, signature: sig }).toString();
  return `${qs}&hash=${hmac}`;
}

// Skema secret key yang ditulis docs saat ini: HMAC_SHA256(key="WebAppData",
// msg=bot_token). Varian include-signature dan exclude-signature dua-duanya
// harus diterima verifier.
function signWebAppData(payloadPairs, { withSignature = false } = {}) {
  const pairs = withSignature ? { ...payloadPairs, signature: 'ed-25519-field' } : { ...payloadPairs };
  const dataCheckString = Object.entries(pairs)
    .map(([k, v]) => `${k}=${v}`)
    .sort()
    .join('\n');
  const secret = crypto.createHmac('sha256', 'WebAppData').update(BOT).digest();
  const hmac = crypto.createHmac('sha256', secret).update(dataCheckString).digest('hex');
  return `${new URLSearchParams(pairs).toString()}&hash=${hmac}`;
}

function goodPairs(over = {}) {
  return {
    auth_date: String(Math.floor(Date.now() / 1000)),
    query_id: 'AAH',
    user: JSON.stringify({ id: USER_ID, first_name: 'Budi', username: 'budi' }),
    ...over,
  };
}

test('initData valid menghasilkan user', () => {
  const r = verifyInitData(sign(goodPairs()), BOT, { maxAgeSeconds: 86400 });
  assert.equal(r.ok, true);
  assert.equal(r.user.id, USER_ID);
});

test('initData modern dengan field signature (Bot API 7.2+) tetap diterima', () => {
  // Hash dihitung atas SEMUA field (termasuk signature), cocok dengan verifier.
  const r = verifyInitData(signWithSignature(goodPairs()), BOT, { maxAgeSeconds: 86400 });
  assert.equal(r.ok, true);
  assert.equal(r.user.id, USER_ID);
});

test('skema secret key WebAppData (docs saat ini) diterima', () => {
  const r = verifyInitData(signWebAppData(goodPairs()), BOT, { maxAgeSeconds: 86400 });
  assert.equal(r.ok, true);
  assert.equal(r.user.id, USER_ID);
});

test('skema WebAppData dengan signature di data-check-string diterima', () => {
  const r = verifyInitData(signWebAppData(goodPairs(), { withSignature: true }), BOT, { maxAgeSeconds: 86400 });
  assert.equal(r.ok, true);
  assert.equal(r.user.id, USER_ID);
});

test('initData dengan signature tapi hash salah tetap ditolak', () => {
  let bad = signWithSignature(goodPairs());
  bad = bad.replace(/hash=.*/, 'hash=' + '0'.repeat(64));
  const r = verifyInitData(bad, BOT, { maxAgeSeconds: 86400 });
  assert.equal(r.ok, false);
  assert.equal(r.reason, 'bad_signature');
});

test('hash ditolak', () => {
  const bad = sign(goodPairs()).replace(/hash=.*/, 'hash=' + '0'.repeat(64));
  const r = verifyInitData(bad, BOT, { maxAgeSeconds: 86400 });
  assert.equal(r.ok, false);
  assert.equal(r.reason, 'bad_signature');
});

test('auth_date kedaluwarsa ditolak', () => {
  const lama = Math.floor(Date.now() / 1000) - 90000;
  const r = verifyInitData(sign(goodPairs({ auth_date: String(lama) })), BOT, { maxAgeSeconds: 86400 });
  assert.equal(r.ok, false);
  assert.equal(r.reason, 'expired');
});

test('initData kosong dan rusak ditolak', () => {
  assert.equal(verifyInitData('', BOT, {}).reason, 'missing');
  assert.equal(verifyInitData('!!!', BOT, {}).ok, false);
});

test('tanpa field user ditolak', () => {
  const r = verifyInitData(sign({ auth_date: String(Math.floor(Date.now() / 1000)), query_id: 'AAH' }), BOT, {});
  assert.equal(r.ok, false);
});

test('token bot salah menolak signature yang mirip', () => {
  const r = verifyInitData(sign(goodPairs()), '999:OTHER', { maxAgeSeconds: 86400 });
  assert.equal(r.ok, false);
  assert.equal(r.reason, 'bad_signature');
});