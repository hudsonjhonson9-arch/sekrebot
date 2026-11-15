import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '..');

test('index.html memuat library jsQR dan komponen modal pemindai kamera live QR & Barcode BMD', () => {
  const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');

  // 1. Library jsQR
  assert.ok(html.includes('src="js/lib/jsQR.min.js"'), 'index.html harus memuat js/lib/jsQR.min.js');

  // 2. Elemen Modal Kamera Viewfinder
  assert.ok(html.includes('id="modalQrScanner"'), 'index.html harus memiliki elemen #modalQrScanner');
  assert.ok(html.includes('id="scannerVideo"'), 'index.html harus memiliki viewport <video id="scannerVideo">');
  assert.ok(html.includes('id="scannerLaser"'), 'index.html harus memiliki laser bar #scannerLaser');
  assert.ok(html.includes('id="btnScannerTorch"'), 'index.html harus memiliki kontrol senter #btnScannerTorch');
  assert.ok(html.includes('id="scannerFallbackBox"'), 'index.html harus memiliki fallback UI saat kamera belum diizinkan');

  // 3. Fungsi JS Pemindai Kamera
  assert.ok(html.includes('function openMobileQrScanModal()'), 'index.html harus mendefinisikan openMobileQrScanModal()');
  assert.ok(html.includes('function startScannerCamera()'), 'index.html harus mendefinisikan startScannerCamera()');
  assert.ok(html.includes('function stopScannerStream()'), 'index.html harus mendefinisikan stopScannerStream()');
  assert.ok(html.includes('function onCodeDetected('), 'index.html harus mendefinisikan onCodeDetected()');
  assert.ok(html.includes('function handleScannerFilePicked('), 'index.html harus mendefinisikan handleScannerFilePicked()');

  // 4. Barcode Hero Card di Aset bisa di-klik untuk scan
  assert.ok(html.includes('onclick="openMobileQrScanModal()"'), 'Scan Barcode Card harus memanggil openMobileQrScanModal()');
});

test('Endpoint API /api/stitch/aset/scan memvalidasi parameter dan merespons data aset riil', async () => {
  // Test 1: Tolak parameter q kosong
  const resEmpty = await fetch('http://localhost:3000/api/stitch/aset/scan');
  assert.strictEqual(resEmpty.status, 400, 'q kosong harus dibalas status 400');
  const jsonEmpty = await resEmpty.json();
  assert.strictEqual(jsonEmpty.ok, false);

  // Test 2: Cari aset berdasarkan Nopol Kendaraan
  const resNopol = await fetch('http://localhost:3000/api/stitch/aset/scan?q=ED%202780%20WB');
  assert.strictEqual(resNopol.status, 200, 'nopol valid harus 200 OK');
  const jsonNopol = await resNopol.json();
  assert.strictEqual(jsonNopol.ok, true);
  assert.ok(jsonNopol.asset && jsonNopol.asset.nama_barang, 'aset harus memuat nama_barang');

  // Test 3: Cari aset berdasarkan format QR SIMAPO-UUID
  const resQr = await fetch('http://localhost:3000/api/stitch/aset/scan?q=SIMAPO-a46bbe27-abca-4bb4-a37b-1b8966d0d20b');
  assert.strictEqual(resQr.status, 200, 'QR SIMAPO-UUID harus 200 OK');
  const jsonQr = await resQr.json();
  assert.strictEqual(jsonQr.ok, true);
  assert.strictEqual(jsonQr.asset.id, 'a46bbe27-abca-4bb4-a37b-1b8966d0d20b');

  // Test 4: Kode yang tidak terdaftar harus mengembalikan 404
  const res404 = await fetch('http://localhost:3000/api/stitch/aset/scan?q=BARANG-FIKTIF-XYZ-999');
  assert.strictEqual(res404.status, 404, 'kode tidak ditemukan harus 404');
  const json404 = await res404.json();
  assert.strictEqual(json404.ok, false);
});
