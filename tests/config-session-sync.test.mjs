import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '..');
const configSrc = fs.readFileSync(path.join(ROOT, 'js/config.js'), 'utf8');

function setupEnv(initialStorage = {}) {
  const store = { ...initialStorage };
  const mockLocalStorage = {
    getItem: (k) => store[k] ?? null,
    setItem: (k, v) => { store[k] = String(v); },
    removeItem: (k) => { delete store[k]; },
    clear: () => { for (const k in store) delete store[k]; }
  };
  const mockWindow = {
    location: { pathname: '/' },
    Telegram: { WebApp: { platform: 'unknown' } },
    tg: {},
    localStorage: mockLocalStorage
  };
  const mockDocument = {
    getElementById: () => null,
    addEventListener: () => {}
  };

  const fn = new Function('window', 'document', 'localStorage', configSrc);
  fn(mockWindow, mockDocument, mockLocalStorage);

  return { window: mockWindow, store };
}

const HEX192 = 'f'.repeat(192);

test('restoreSession: memulihkan _nativeToken dari _sess_token jika _native_token belum ada', () => {
  const { window, store } = setupEnv({
    _sess_token: HEX192,
    _sess_nip: '199001012010011001',
    _sess_role: 'ADMIN',
    _sess_inst: 'bapperida'
  });

  assert.equal(window._session.token, HEX192);
  assert.equal(window._session.isLoggedIn, true);
  assert.equal(store._native_token, HEX192);
});

test('ensureNativeSession: memakai _sess_token ketika _nativeToken belum terisi', async () => {
  const { window, store } = setupEnv({
    _sess_token: HEX192
  });

  const tok = await window.ensureNativeSession();
  assert.equal(tok, HEX192);
  assert.equal(store._native_token, HEX192);
});

test('setSession: otomatis menyetel native token jika token 192 hex', () => {
  const { window, store } = setupEnv();
  window.setSession(HEX192, { nip: '12345', role: 'ADMIN', instansi_id: 'bapperida' });

  assert.equal(store._sess_token, HEX192);
  assert.equal(store._native_token, HEX192);
  assert.equal(window._session.isLoggedIn, true);
});

test('clearSession: membersihkan _sess_token dan _native_token', () => {
  const { window, store } = setupEnv({
    _sess_token: HEX192,
    _native_token: HEX192
  });

  window.clearSession();
  assert.equal(store._sess_token, undefined);
  assert.equal(store._native_token, undefined);
  assert.equal(window._session.token, null);
  assert.equal(window._session.isLoggedIn, false);
});
