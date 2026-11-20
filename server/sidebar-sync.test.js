import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '..');

const desktopPages = [
  { file: 'desktop.html', activeHref: 'desktop.html', activeText: 'Meja admin' },
  { file: 'rekap.html', activeHref: 'rekap.html', activeText: 'Rekap dan Laporan' },
  { file: 'layanan.html', activeHref: 'layanan.html', activeText: 'Layanan Kedinasan' },
  { file: 'aset-kir.html', activeHref: 'aset-kir.html', activeText: 'Manajemen Aset' },
  { file: 'arsip.html', activeHref: 'arsip.html', activeText: 'Arsip Digital' },
  { file: 'admin.html', activeHref: 'admin.html', activeText: 'Panel Admin' }
];

const standard7Hrefs = [
  'desktop.html',
  'rekap.html',
  'layanan.html',
  'aset-kir.html',
  'arsip.html',
  'admin.html',
  'kiosk.html'
];

test('Seluruh 6 halaman portal desktop memiliki <aside> sidebar tersinkronisasi 7 menu tanpa href="#"', () => {
  for (const page of desktopPages) {
    const html = fs.readFileSync(path.join(ROOT, page.file), 'utf8');
    const asideMatch = html.match(/<aside[\s\S]*?<\/aside>/i);
    assert.ok(asideMatch, `${page.file} harus memiliki elemen <aside>`);

    const aside = asideMatch[0];
    assert.ok(!aside.includes('href="#"'), `${page.file} tidak boleh memiliki href="#" di sidebar`);

    // Periksa bahwa 7 link standar semuanya hadir
    for (const href of standard7Hrefs) {
      assert.ok(aside.includes(`href="${href}"`), `${page.file} harus memiliki link href="${href}"`);
    }

    // Periksa bahwa aria-current="page" tepat satu dan mengarah ke activeHref
    const activeMatches = [...aside.matchAll(/aria-current="page"/g)];
    assert.strictEqual(activeMatches.length, 1, `${page.file} harus memiliki tepat satu aria-current="page"`);
    assert.ok(
      aside.includes(`aria-current="page"`) && aside.includes(`href="${page.activeHref}"`),
      `${page.file} harus menandai ${page.activeHref} sebagai aria-current="page"`
    );
  }
});

test('Header portal desktop memiliki switcher ke Mode HP (Mobile) dan tautan kembali yang valid', () => {
  for (const page of desktopPages) {
    const html = fs.readFileSync(path.join(ROOT, page.file), 'utf8');
    const headerMatch = html.match(/<header[\s\S]*?<\/header>/i);
    assert.ok(headerMatch, `${page.file} harus memiliki elemen <header>`);
    assert.ok(headerMatch[0].includes('href="index.html"'), `${page.file} harus memiliki tombol ke index.html di header`);
  }

  // Kiosk Lobi memiliki tombol kembali ke desktop.html
  const kioskHtml = fs.readFileSync(path.join(ROOT, 'kiosk.html'), 'utf8');
  assert.ok(kioskHtml.includes('href="desktop.html"'), 'kiosk.html harus memiliki link kembali ke desktop.html');

  // Cetak TPP memiliki tombol kembali ke rekap.html
  const cetakTppHtml = fs.readFileSync(path.join(ROOT, 'cetak-tpp.html'), 'utf8');
  assert.ok(cetakTppHtml.includes('href="rekap.html"'), 'cetak-tpp.html harus memiliki link kembali ke rekap.html');

  // Index mobile memiliki shortcut ke desktop.html
  const indexHtml = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
  assert.ok(
    indexHtml.includes('href="desktop.html"') || indexHtml.includes('href="desktop.html?mode=desktop"'),
    'index.html harus memiliki shortcut ke desktop.html'
  );
});
