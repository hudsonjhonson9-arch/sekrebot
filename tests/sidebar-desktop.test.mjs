import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '..');

test('index.html dan www/index.html memiliki toggle collapse & resizer sidebar', () => {
  for (const file of ['index.html', 'www/index.html']) {
    const html = fs.readFileSync(path.join(ROOT, file), 'utf8');
    assert.ok(html.includes('id="sidebarToggleBtn"'), `${file} harus memiliki #sidebarToggleBtn`);
    assert.ok(html.includes('toggleSidebarCollapse()'), `${file} harus memanggil toggleSidebarCollapse()`);
    assert.ok(html.includes('id="sidebarResizer"'), `${file} harus memiliki #sidebarResizer`);
  }
});

test('semua .nav-item di #tabsBar memiliki data-label dan title untuk tooltip icon-only', () => {
  for (const file of ['index.html', 'www/index.html']) {
    const html = fs.readFileSync(path.join(ROOT, file), 'utf8');
    const tabsBarMatch = html.match(/<nav class="bottom-nav" id="tabsBar">([\s\S]*?)<\/nav>/);
    assert.ok(tabsBarMatch, `${file} harus memiliki #tabsBar`);

    const navContent = tabsBarMatch[1];
    const navItems = [...navContent.matchAll(/<button[^>]*class="[^"]*nav-item[^"]*"[^>]*>/g)];
    assert.ok(navItems.length >= 8, `${file} harus memiliki minimal 8 tombol navigasi`);

    for (const item of navItems) {
      const tag = item[0];
      // Hanya nav-item biasa yang butuh data-label (mobile-only 'Lainnya' tidak tampil di desktop)
      if (!tag.includes('mobile-only')) {
        assert.ok(tag.includes('data-label='), `${tag} di ${file} harus memiliki data-label`);
        assert.ok(tag.includes('title='), `${tag} di ${file} harus memiliki title`);
      }
    }
  }
});

test('css/styles.css mendefinisikan variabel dan aturan sidebar collapsed', () => {
  const css = fs.readFileSync(path.join(ROOT, 'css/styles.css'), 'utf8');
  assert.ok(css.includes('--sidebar-w:'), 'harus ada --sidebar-w di css');
  assert.ok(css.includes('--sidebar-collapsed-w:'), 'harus ada --sidebar-collapsed-w di css');
  assert.ok(css.includes('.bottom-nav.collapsed'), 'harus ada kelas .bottom-nav.collapsed di css');
  assert.ok(css.includes('body.sidebar-collapsed'), 'harus ada kelas body.sidebar-collapsed di css');
  assert.ok(css.includes('.sidebar-resizer'), 'harus ada gaya .sidebar-resizer di css');
  assert.ok(css.includes('.sidebar-toggle-btn'), 'harus ada gaya .sidebar-toggle-btn di css');
});

test('js/desktop.js dan www/js/desktop.js mengekspos toggleSidebarCollapse dan initSidebarResize', () => {
  for (const file of ['js/desktop.js', 'www/js/desktop.js']) {
    const js = fs.readFileSync(path.join(ROOT, file), 'utf8');
    assert.ok(js.includes('window.toggleSidebarCollapse = toggleSidebarCollapse'), `${file} harus mengekspos toggleSidebarCollapse`);
    assert.ok(js.includes('window.initSidebarResize = initSidebarResize'), `${file} harus mengekspos initSidebarResize`);
  }
});
