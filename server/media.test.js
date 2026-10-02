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