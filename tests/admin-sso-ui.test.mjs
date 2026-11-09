import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '..');
const src = fs.readFileSync(path.join(ROOT, 'js/admin-pegawai.js'), 'utf8');

test('admin-pegawai.js menyertakan tombol bukaModalSSO di tabel', () => {
  assert.ok(src.includes('bukaModalSSO'), 'harus ada pemanggilan bukaModalSSO');
  assert.ok(src.includes('fa-user-shield') || src.includes('fa-shield-alt'), 'harus ada ikon perisai');
});

test('admin-pegawai.js mendefinisikan fungsi bukaModalSSO dan simpanWewenangSSO', () => {
  assert.ok(src.includes('async function bukaModalSSO') || src.includes('function bukaModalSSO'), 'bukaModalSSO harus terdefinisi');
  assert.ok(src.includes('/api/user-permissions'), 'harus memanggil endpoint /api/user-permissions');
  assert.ok(src.includes('/api/user-reset-password'), 'harus memanggil endpoint /api/user-reset-password');
});

