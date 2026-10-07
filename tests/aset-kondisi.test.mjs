// Regression guard: data produksi menyimpan unit_aset.kondisi sebagai 'Baik',
// sementara default kolomnya 'BAIK'. Perbandingan case-sensitive pernah membuat
// seluruh aset tampil sebagai "rusak" di panel QR. Lihat js/simapo.js.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const JS_DIR = join(process.cwd(), 'js');
const files = readdirSync(JS_DIR).filter((f) => f.endsWith('.js'));
const source = files.map((f) => ({ f, src: readFileSync(join(JS_DIR, f), 'utf8') }));

test('tidak ada perbandingan kondisi case-sensitive terhadap BAIK', () => {
  const offenders = [];
  for (const { f, src } of source) {
    // tangkap pola yang membandingkan .kondisi langsung ke literal
    const re = /kondisi\s*(===|!==|==|!=)\s*['"][^'"]*['"]/g;
    for (const m of src.matchAll(re)) {
      const line = src.slice(0, m.index).split('\n').length;
      offenders.push(`${f}:${line} ${m[0]}`);
    }
  }
  assert.deepEqual(offenders, [], `perbaiki normalisasi kapitalisasi kondisi:\n${offenders.join('\n')}`);
});

test('panel QR menormalkan kondisi ke uppercase sebelum menilai', () => {
  const src = readFileSync(join(JS_DIR, 'simapo.js'), 'utf8');
  assert.match(
    src,
    /unitBaik\s*=\s*String\(unit\.kondisi\s*\|\|\s*['"]['"]\)\.toUpperCase\(\)/,
    'panel QR harus punya normalisasi unitBaik'
  );
  assert.ok(!/unit\.kondisi\s*!==\s*['"]BAIK['"]/.test(src), 'perbandingan lama masih ada');
  assert.ok(!/unit\.kondisi\s*===\s*['"]BAIK['"]/.test(src), 'perbandingan lama masih ada');
});

test('varian kapitalisasi kondisi tetap dianggap baik', () => {
  const unitBaik = (k) => String(k || '').toUpperCase() === 'BAIK';
  for (const v of ['BAIK', 'Baik', 'baik', 'BaIk']) {
    assert.equal(unitBaik(v), true, `${v} harus dianggap baik`);
  }
  for (const v of ['RUSAK', 'rusak', 'Rusak Ringan', '', null, undefined]) {
    assert.equal(unitBaik(v), false, `${v} tidak boleh dianggap baik`);
  }
});