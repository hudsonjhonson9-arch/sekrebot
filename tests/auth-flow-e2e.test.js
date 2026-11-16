import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '..');
const configSrc = fs.readFileSync(path.join(ROOT, 'js/config.js'), 'utf8');
const authSrc = fs.readFileSync(path.join(ROOT, 'js/auth.js'), 'utf8');
const indexHtml = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
const loginHtml = fs.readFileSync(path.join(ROOT, 'login.html'), 'utf8');

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

test('Verification: config.js exposes getNativeToken and clearNativeToken', () => {
  const { window, store } = setupEnv();

  assert.equal(typeof window.setNativeToken, 'function', 'setNativeToken should be a function');
  assert.equal(typeof window.getNativeToken, 'function', 'getNativeToken should be exposed on window');
  assert.equal(typeof window.clearNativeToken, 'function', 'clearNativeToken should be exposed on window');

  window.setNativeToken('test_token_123');
  assert.equal(window.getNativeToken(), 'test_token_123');
  assert.equal(store._native_token, 'test_token_123');
  assert.equal(store.native_token, 'test_token_123');

  window.clearNativeToken();
  assert.equal(window.getNativeToken(), null);
  assert.equal(store._native_token, undefined);
  assert.equal(store.native_token, undefined);
  assert.equal(store._sess_token, undefined);
});

test('Verification: getNativeToken retrieves from _sess_token fallback if native token is unset', () => {
  const { window } = setupEnv({
    _sess_token: 'fallback_sess_token_456'
  });

  assert.equal(window.getNativeToken(), 'fallback_sess_token_456');
});

test('Verification: index.html contains immediate checkAuthStatus on DOMContentLoaded', () => {
  assert.match(indexHtml, /function\s+checkAuthStatus\s*\(/, 'index.html must define checkAuthStatus');
  assert.match(indexHtml, /checkAuthStatus\(\);/, 'index.html must invoke checkAuthStatus immediately on DOM ready');
  assert.match(indexHtml, /id="authOverlay"/, 'index.html must contain authOverlay element');
  assert.match(indexHtml, /handleAuthAction\('login'\)/, 'index.html must connect to handleAuthAction login');
  assert.match(indexHtml, /window\.logoutUser\s*=/, 'index.html must provide logoutUser function');
});

test('Verification: login.html auto-redirect and auth logic uses getNativeToken', () => {
  assert.match(loginHtml, /getNativeToken\(\)/, 'login.html must use getNativeToken for auth check');
  assert.match(loginHtml, /handleAuthAction\('login'\)/, 'login.html must contain login submission handler');
});

test('Verification: auth.js finalizeLogin properly stores active NIP and session tokens', () => {
  assert.match(authSrc, /localStorage\.setItem\('stitch_active_nip',\s*userNip\)/, 'finalizeLogin must set stitch_active_nip');
  assert.match(authSrc, /localStorage\.setItem\('MY_NIP',\s*userNip\)/, 'finalizeLogin must set MY_NIP');
  assert.match(authSrc, /setNativeToken\(sessionToken\)/, 'finalizeLogin must set native token');
  assert.match(authSrc, /setSession\(sessionToken,/, 'finalizeLogin must call setSession');
});
