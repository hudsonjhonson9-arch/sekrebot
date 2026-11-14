import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '..');
const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');

test('Panel Admin memiliki struktur Menu Grid per Grup (ui-ux-pro-max)', () => {
  assert.ok(html.includes('id="admin-grid-view"'), 'Harus ada container #admin-grid-view');
  assert.ok(html.includes('admin-grid-group'), 'Harus ada pengelompokan class admin-grid-group');
  assert.ok(html.includes('id="admin-detail-head"'), 'Harus ada header drill-down #admin-detail-head');
  assert.ok(html.includes('showAdminGrid()'), 'Harus ada fungsi showAdminGrid() untuk kembali ke grid');
});

test('Panel Admin memiliki 4 grup fungsional dan kartu grid', () => {
  assert.match(html, /Operasional\s*(&amp;|&)\s*Kehadiran/i, 'Grup 1 Operasional harus ada');
  assert.match(html, /Manajemen Kepegawaian/i, 'Grup 2 Kepegawaian harus ada');
  assert.match(html, /Konfigurasi Sistem/i, 'Grup 3 Konfigurasi harus ada');
  assert.match(html, /Developer\s*(&amp;|&)\s*Diagnostik/i, 'Grup 4 Developer & Diagnostik harus ada');

  // Minimal 10 kartu navigasi admin
  const cards = [...html.matchAll(/class="[^"]*admin-menu-card[^"]*"/g)];
  assert.ok(cards.length >= 10, `Harus memiliki minimal 10 kartu menu admin, ditemukan ${cards.length}`);
});

test('Section dev tools (health matrix & log viewer) tersedia di Panel Admin', () => {
  assert.ok(html.includes('id="admin-section-dev"'), 'Harus ada #admin-section-dev');
  assert.ok(html.includes('id="devHealthMatrix"'), 'Harus ada container #devHealthMatrix');
  assert.ok(html.includes('id="devLogViewer"'), 'Harus ada container #devLogViewer');
  assert.ok(html.includes('runDevDiagnostics()'), 'Harus ada pemanggilan runDevDiagnostics()');
  assert.ok(html.includes('exportDevLogs('), 'Harus ada pemanggilan exportDevLogs()');
});

test('Kontrak switchAdminSection tetap valid dan semua section ada', () => {
  for (const s of ['ops', 'user', 'config', 'dev']) {
    assert.ok(html.includes(`id="admin-section-${s}"`), `Section #admin-section-${s} harus ada`);
  }
});
