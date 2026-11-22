import { test, describe } from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, '..');

describe('Desktop Real Database Integration', () => {
  test('rekap.html menggunakan shared rekap engine dan tanpa data demo statis', () => {
    const html = fs.readFileSync(path.join(rootDir, 'rekap.html'), 'utf8');
    const rekapJs = fs.readFileSync(path.join(rootDir, 'js', 'stitch-admin-rekap.js'), 'utf8');
    assert.ok(html.includes('js/stitch-admin-rekap.js'), 'Missing js/stitch-admin-rekap.js in rekap.html');
    assert.ok(html.includes('js/stitch-rekap.js'), 'Missing js/stitch-rekap.js in rekap.html');
    assert.ok(rekapJs.includes('/api/stitch/rekap-range'), 'Missing /api/stitch/rekap-range fetch in stitch-admin-rekap.js');
    assert.ok(rekapJs.includes('/api/stitch/rekap-harian'), 'Missing /api/stitch/rekap-harian fetch in stitch-admin-rekap.js');
    assert.ok(!/<tbody[^>]*>\s*<!-- Row 1 -->\s*<tr[^>]*>[\s\S]*?Charles Hermana Weru/i.test(html), 'Found static demo rows in rekap.html');
  });

  test('aset-kir.html contains dynamic tbody and real API call', () => {
    const html = fs.readFileSync(path.join(rootDir, 'aset-kir.html'), 'utf8');
    assert.ok(html.includes('id="asetKirTableBody"'), 'Missing id="asetKirTableBody" in aset-kir.html');
    assert.ok(html.includes('/api/stitch/aset/mobile-data'), 'Missing /api/stitch/aset/mobile-data fetch in aset-kir.html');
    assert.ok(!/<tbody[^>]*>\s*<!-- Row 1 -->\s*<tr[^>]*>[\s\S]*?Charles Hermana Weru/i.test(html), 'Found static demo rows in aset-kir.html');
  });

  test('arsip.html menggunakan 3-Pane Columns View + Agenda Surat & SPPD real API', () => {
    const html = fs.readFileSync(path.join(rootDir, 'arsip.html'), 'utf8');
    const colJs = fs.readFileSync(path.join(rootDir, 'js', 'stitch-arsip-columns.js'), 'utf8');
    const agJs = fs.readFileSync(path.join(rootDir, 'js', 'stitch-arsip-agenda.js'), 'utf8');
    assert.ok(html.includes('id="arsipColDocs"'), 'Missing id="arsipColDocs" in arsip.html');
    assert.ok(html.includes('id="agendaSuratBody"'), 'Missing id="agendaSuratBody" in arsip.html');
    assert.ok(html.includes('id="agendaSppdBody"'), 'Missing id="agendaSppdBody" in arsip.html');
    assert.ok(colJs.includes('/api/stitch/arsip/mobile-data'), 'Missing /api/stitch/arsip/mobile-data fetch in stitch-arsip-columns.js');
    assert.ok(agJs.includes('/api/arsip/p/api/agenda/surat-masuk'), 'Missing /api/arsip/p/api/agenda/surat-masuk in stitch-arsip-agenda.js');
    assert.ok(agJs.includes('/api/arsip/p/api/agenda/sppd'), 'Missing /api/arsip/p/api/agenda/sppd in stitch-arsip-agenda.js');
    assert.ok(!/<tbody[^>]*>\s*<!-- Row 1 -->\s*<tr[^>]*>[\s\S]*?Charles Hermana Weru/i.test(html), 'Found static demo rows in arsip.html');
  });

  test('admin.html memakai AdminCore bersama (keterangan, monitoring, lokasi) dan tanpa data statis', () => {
    const html = fs.readFileSync(path.join(rootDir, 'admin.html'), 'utf8');
    const core = fs.readFileSync(path.join(rootDir, 'js', 'admin-core.js'), 'utf8');
    const index = fs.readFileSync(path.join(rootDir, 'index.html'), 'utf8');
    assert.ok(html.includes('id="adminKeteranganTableBody"'), 'Missing id="adminKeteranganTableBody" in admin.html');
    assert.ok(html.includes('id="adminMonitoringTableBody"'), 'Missing id="adminMonitoringTableBody" in admin.html');
    assert.ok(html.includes('/js/admin-core.js'), 'admin.html harus memuat js/admin-core.js');
    assert.ok(index.includes('js/admin-core.js'), 'index.html harus memuat js/admin-core.js');
    assert.ok(core.includes("'/keterangan'"), 'admin-core.js harus memanggil /keterangan');
    assert.ok(core.includes("'/keterangan/approve'"), 'admin-core.js harus memanggil /keterangan/approve');
    assert.ok(core.includes("'/admin/monitoring-today'"), 'admin-core.js harus memanggil /admin/monitoring-today');
    assert.ok(core.includes("'/admin-lokasi'"), 'admin-core.js harus memanggil /admin-lokasi');
    assert.ok(!/<tbody[^>]*>\s*<tr[^>]*>[\s\S]*?Sri Handayani/i.test(html), 'Found static Sri Handayani in admin.html');
  });

  test('desktop.html contains dynamic attendance log tbody', () => {
    const html = fs.readFileSync(path.join(rootDir, 'desktop.html'), 'utf8');
    assert.ok(html.includes('id="desktopLogsTableBody"'), 'Missing id="desktopLogsTableBody" in desktop.html');
    assert.ok(html.includes('renderDesktopLogsTable'), 'Missing renderDesktopLogsTable in desktop.html');
  });
});
