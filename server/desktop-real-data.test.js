import { test, describe } from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, '..');

describe('Desktop Real Database Integration', () => {
  test('rekap.html contains dynamic tbody and real API call', () => {
    const html = fs.readFileSync(path.join(rootDir, 'rekap.html'), 'utf8');
    assert.ok(html.includes('id="rekapTableBody"'), 'Missing id="rekapTableBody" in rekap.html');
    assert.ok(html.includes('/api/stitch/rekap-tpp'), 'Missing /api/stitch/rekap-tpp fetch in rekap.html');
    assert.ok(!/<tbody[^>]*>\s*<!-- Row 1 -->\s*<tr[^>]*>[\s\S]*?Charles Hermana Weru/i.test(html), 'Found static demo rows in rekap.html');
  });

  test('aset-kir.html contains dynamic tbody and real API call', () => {
    const html = fs.readFileSync(path.join(rootDir, 'aset-kir.html'), 'utf8');
    assert.ok(html.includes('id="asetKirTableBody"'), 'Missing id="asetKirTableBody" in aset-kir.html');
    assert.ok(html.includes('/api/stitch/aset/mobile-data'), 'Missing /api/stitch/aset/mobile-data fetch in aset-kir.html');
    assert.ok(!/<tbody[^>]*>\s*<!-- Row 1 -->\s*<tr[^>]*>[\s\S]*?Charles Hermana Weru/i.test(html), 'Found static demo rows in aset-kir.html');
  });

  test('arsip.html contains dynamic tbody and real API call', () => {
    const html = fs.readFileSync(path.join(rootDir, 'arsip.html'), 'utf8');
    assert.ok(html.includes('id="arsipTableBody"'), 'Missing id="arsipTableBody" in arsip.html');
    assert.ok(html.includes('/api/stitch/arsip/mobile-data'), 'Missing /api/stitch/arsip/mobile-data fetch in arsip.html');
    assert.ok(!/<tbody[^>]*>\s*<!-- Row 1 -->\s*<tr[^>]*>[\s\S]*?Charles Hermana Weru/i.test(html), 'Found static demo rows in arsip.html');
  });

  test('layanan.html contains dynamic tbodies and real SPPD / Lembur calls', () => {
    const html = fs.readFileSync(path.join(rootDir, 'layanan.html'), 'utf8');
    assert.ok(html.includes('id="sppdTableBody"'), 'Missing id="sppdTableBody" in layanan.html');
    assert.ok(html.includes('id="lemburTableBody"'), 'Missing id="lemburTableBody" in layanan.html');
    assert.ok(html.includes('/api/stitch/sppd'), 'Missing /api/stitch/sppd in layanan.html');
    assert.ok(html.includes('/api/stitch/keterangan'), 'Missing /api/stitch/keterangan in layanan.html');
  });

  test('admin.html contains dynamic tbody and real Keterangan approval call', () => {
    const html = fs.readFileSync(path.join(rootDir, 'admin.html'), 'utf8');
    assert.ok(html.includes('id="adminKeteranganTableBody"'), 'Missing id="adminKeteranganTableBody" in admin.html');
    assert.ok(html.includes('/api/stitch/keterangan'), 'Missing /api/stitch/keterangan in admin.html');
    assert.ok(html.includes('/api/stitch/keterangan/approve'), 'Missing /api/stitch/keterangan/approve in admin.html');
    assert.ok(!/<tbody[^>]*>\s*<tr[^>]*>[\s\S]*?Sri Handayani/i.test(html), 'Found static Sri Handayani in admin.html');
  });

  test('desktop.html contains dynamic attendance log tbody', () => {
    const html = fs.readFileSync(path.join(rootDir, 'desktop.html'), 'utf8');
    assert.ok(html.includes('id="desktopLogsTableBody"'), 'Missing id="desktopLogsTableBody" in desktop.html');
    assert.ok(html.includes('renderDesktopLogsTable'), 'Missing renderDesktopLogsTable in desktop.html');
  });
});
