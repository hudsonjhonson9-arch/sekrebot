import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '..');
const src = fs.readFileSync(path.join(ROOT, 'js/simapo-ext.js'), 'utf8');

const START = 'window.renderUserSimapoKatFilter = function';
const END = '/* ─── ADMIN: QR GENERATOR';
const from = src.indexOf(START);
const to = src.indexOf(END);
assert.ok(from > 0 && to > from, 'potongan sumber renderUserSimapoKatFilter tidak ditemukan');
const slice = src.slice(from, to);

const CATS = [
  { id: '1', nama: 'Alat Tulis Kantor' },
  { id: '2', nama: 'Kendaraan Roda 2' },
  { id: '3', nama: 'Kertas & Bahan Cetak' },
];

function makeClassList() {
  const set = new Set();
  return {
    add: c => set.add(c),
    remove: c => set.delete(c),
    toggle: (c, force) => (force === undefined
      ? (set.has(c) ? set.delete(c) : set.add(c))
      : (force ? set.add(c) : set.delete(c))),
    has: c => set.has(c),
  };
}

function mount(data = CATS) {
  const items = ['Semua'].concat(data.map(c => c.nama)).map(n => ({
    dataset: { nama: n },
    classList: makeClassList(),
  }));
  items[0].classList.add('selected');
  const nodes = {
    simapoKatFilterBar: { innerHTML: '' },
    simapoKatDd: { classList: makeClassList(), querySelectorAll: () => items },
    simapoKatInput: { value: '' },
    items,
  };
  const picked = [];
  const win = {
    pksEsc: s => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'),
    filterSimapoKatalog: v => picked.push(v),
  };
  win.picked = picked;
  const document = { getElementById: id => (id in nodes ? nodes[id] : null) };
  new Function('window', 'document', slice)(win, document);
  win.renderUserSimapoKatFilter(data);
  return { win, nodes, html: nodes.simapoKatFilterBar.innerHTML };
}

test('baris badge kategori digantikan custom dropdown, bukan select native', () => {
  const { html } = mount();
  assert.doesNotMatch(html, /simapo-kat-badge/, 'baris badge lama masih ada');
  assert.doesNotMatch(html, /<select/, 'jangan pakai select native');
  for (const cls of ['custom-search-dropdown', 'dropdown-trigger', 'dropdown-list-wrap', 'dropdown-item']) {
    assert.ok(html.includes(cls), 'kelas ' + cls + ' tidak dipakai');
  }
});

test('Semua + tiap kategori tetap muncul', () => {
  const { html } = mount();
  assert.ok(html.includes('Semua'), 'opsi Semua hilang');
  for (const c of CATS) {
    assert.ok(html.includes(c.nama.replace('&', '&amp;')), 'kategori hilang: ' + c.nama);
  }
});

test('nama kategori masuk data-*, bukan onclick inline (aman dari tanda kutip)', () => {
  const { html } = mount([{ id: '9', nama: 'Alat "Kantor" & <b>Co</b>' }]);
  assert.doesNotMatch(html, /onclick="filterSimapoKatalog/, 'filter inline masih dipakai');
  assert.ok(html.includes('&lt;b&gt;Co&lt;/b&gt;'), 'HTML kategori tidak di-escape');
  assert.doesNotMatch(html, /<b>Co<\/b>/, 'markup kategori mentah bocor ke HTML');
});

test('memilih kategori menutup dropdown, mengisi input, dan memanggil filter', () => {
  const { win, nodes } = mount();
  win._simapoKatDdOpen();
  assert.equal(nodes.simapoKatDd.classList.has('open'), true, 'dropdown tidak terbuka');
  win._simapoKatPick({ dataset: { nama: 'Alat Tulis Kantor' } });
  assert.equal(nodes.simapoKatDd.classList.has('open'), false, 'dropdown tidak tertutup');
  assert.equal(nodes.simapoKatInput.value, 'Alat Tulis Kantor');
  assert.deepEqual(win.picked, ['Alat Tulis Kantor']);
});

test('penanda kategori terpilih ikut pindah saat memilih', () => {
  const { win, nodes } = mount();
  const sebelum = nodes.simapoKatDd.classList.has('open');
  assert.equal(sebelum, false);
  win._simapoKatPick({ dataset: { nama: 'Kertas & Bahan Cetak' } });
  const tercentang = nodes.items.filter(i => i.classList.has('selected'));
  assert.equal(tercentang.length, 1, 'harus tepat satu opsi selected');
  assert.equal(tercentang[0].dataset.nama, 'Kertas & Bahan Cetak');
});

test('memilih "Semua" mengembalikan filter ke kosong', () => {
  const { win, nodes } = mount();
  win._simapoKatPick({ dataset: { nama: 'Semua' } });
  assert.equal(nodes.simapoKatInput.value, 'Semua');
  assert.deepEqual(win.picked, [''], 'filter harus kosong, bukan nama kategori');
});

test('container filter kategori tidak lagi jadi baris chip horizontal', () => {
  const htmlSrc = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
  const bar = htmlSrc.match(/<div id="simapoKatFilterBar"[^>]*>/);
  assert.ok(bar, '#simapoKatFilterBar tidak ada di index.html');
  assert.doesNotMatch(bar[0], /overflow-x/, 'container masih flex-scroll untuk badge');
  assert.doesNotMatch(htmlSrc, /simapo-kat-badge/, 'CSS badge kategori masih ada');
});