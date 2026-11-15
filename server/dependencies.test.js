import test from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');
const serverDir = path.resolve(__dirname);

test('semua package yang di-import di server/ harus masuk ke production dependencies', () => {
  const pkg = JSON.parse(fs.readFileSync(path.join(rootDir, 'package.json'), 'utf8'));
  const prodDeps = Object.keys(pkg.dependencies || {});

  const files = fs.readdirSync(serverDir).filter(f => f.endsWith('.js') && !f.endsWith('.test.js'));
  const extImports = new Set();
  const builtins = new Set([
    'fs', 'path', 'http', 'https', 'crypto', 'os', 'stream', 'util', 'url',
    'events', 'buffer', 'child_process', 'querystring', 'assert', 'zlib',
    'node:fs', 'node:path', 'node:http', 'node:https', 'node:crypto', 'node:os',
    'node:stream', 'node:util', 'node:url', 'node:events', 'node:buffer',
    'node:child_process', 'node:querystring', 'node:assert', 'node:zlib', 'node:test'
  ]);

  for (const f of files) {
    const content = fs.readFileSync(path.join(serverDir, f), 'utf8');
    const matches = content.matchAll(/(?:from|import)\s+['"]([^.'"/][^'"]*)['"]/g);
    for (const m of matches) {
      const pkgName = m[1].startsWith('@') ? m[1].split('/').slice(0, 2).join('/') : m[1].split('/')[0];
      if (!builtins.has(pkgName)) extImports.add(pkgName);
    }
    const reqMatches = content.matchAll(/require\(['"]([^.'"/][^'"]*)['"]\)/g);
    for (const m of reqMatches) {
      const pkgName = m[1].startsWith('@') ? m[1].split('/').slice(0, 2).join('/') : m[1].split('/')[0];
      if (!builtins.has(pkgName)) extImports.add(pkgName);
    }
  }

  const missing = [];
  for (const imp of extImports) {
    if (!prodDeps.includes(imp)) {
      missing.push(imp);
    }
  }

  assert.deepStrictEqual(missing, [], `Package berikut dipakai di server/ tapi tidak ada di dependencies: ${missing.join(', ')}`);
});

test('pizzip dan dependensinya tidak boleh berstatus dev di package-lock.json', () => {
  const lockPath = path.join(rootDir, 'package-lock.json');
  if (!fs.existsSync(lockPath)) return;
  const lock = JSON.parse(fs.readFileSync(lockPath, 'utf8'));
  if (lock.packages && lock.packages['node_modules/pizzip']) {
    assert.strictEqual(lock.packages['node_modules/pizzip'].dev, undefined, 'pizzip masih ditandai dev: true di package-lock.json');
  }
});
