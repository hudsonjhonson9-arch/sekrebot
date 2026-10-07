# SDD Progress — Plan 1 (2026-09-30-aset-backend-pengaturan.md)

Task 1: complete (commits 7f0dedb + 87a5ab3 + 84ddd33, BASE 9a62600, review approved after 2 fix rounds)

## Minor findings roll-up (untuk final whole-branch review)
- kosongkan: rows_dihapus dari kids di-overwrite output {success:true} p2/p3 sebelum AGG_OK (plan-mandated, kosmetik)
- kosongkan = 3 statement terpisah, bukan transaksi; retry konvergen (plan-mandated)
- nomorinventaris duplikat dalam 1 batch bisa lolos (tidak ada unique index instansi+nomor)
- node id randomUUID → diff JSON churn tiap regen (deploy map by name, aman)
- tidak ada index pada SIMAPO.barang/unit_aset.instansi_id (seq scan)
- indent stray mjs:153 (mirror di plan)
- generator belum punya mode --check (regen+diff otomatis)

Task 2: pending — BLOCKED butuh N8N_TOKEN
Task 3-5: pending

Task 2: complete (commit 85ca2b4, BASE 84ddd33, review approved)
- Minor roll-up tambahan:
  - gate reject = 200 + body kosong (plan-mandated, instance-wide; client wajib cek body, bukan status) 
  - report task-2 punya section superseded kontradiktif (doc hygiene)
  - brief/plan Task 2 header masih "(tanpa commit)" padahal 85ca2b4 ada (teks basi)
  - deploy POST fallback retry di semua non-ok → duplikat workflow kalau 500-after-persist (gate sebaiknya post.status===400)
  - wording report "7 Agg baca .json" longgar (5 reader + 2 konstanta)

Task 3: complete (commits 7049e2c + c7d7371 + 8bcf547, BASE 85ca2b4, review approved + fix round 4)
- Minor roll-up tambahan:
  - test-1 assert !r.ok || j===null masih bisa lolos 404 (backstop test-2, Minor)
  - restore pengaturan hanya cek ack.ok, tanpa re-GET persistensi; fallback old='' bisa timpa nilai asli bila GET awal gagal
  - test-1 raw fetch tanpa try/catch (network error = unhandled exception)
- report task-3 state-table "Sebelum" basi (GET {} vs run awal p1_jabatan:'')
- 3 orphan unit_aset SMOKE-TEST-% (isactive barang false → inert dari summary); cleanup hanya via SQL manual (NO ACTION, tak tersentuh webhook) — berikan SQL ke user di handoff final

Task 4: complete (commits 800014d + d7aac6d, BASE 8bcf547, review approved + fix round)
- Critical fix: `bastSubmit` tidak lagi treat gate-reject 200+empty sebagai sukses (sentinel `Empty N8n Response` → pesan Indonesia, input konfirmasi tidak dibersihkan)
- Minor roll-up tambahan:
  - gate reject pada GET `simapo-pengaturan-get` tetap senyap (`bastGet` plan-mandated: return [] tanpa error) → form tampil kosong tanpa tanda; tidak diubah (sesuai plan)
  - wording report task-4 "meng exercises `simapo-bast-ruangan`" tidak persis (client guard, bukan call site)

Task 5: complete (commit 2bb4fe2, BASE d7aac6d) — spec baris 97 dirozen-kan (cakupan kosongkan per instansi + 10 FK child) + verifikasi UI 4/4 PASS
- Browser (browser-harness, vite lokal, login NIP-tunggal role ADMIN): tab `⚙️ Pengaturan` di group `ref` tampil; save roundtrip persist (toast "Pengaturan disimpan", nilai bertahan setelah pindah tab); guard kosongkan tanpa "HAPUS" → toast error + 0 request ke server (fetch spy); regresi PKS & Aset section normal
- Regresi `simapo-bast-list` 200 + body non-empty (BAST tidak terdampak)
- Nilai uji dikosongkan kembali; 7 key aset di `public.pengaturan` kini bernilai `''` (fungsional = belum diisi; baris kosong tersisa karena endpoint set bersifat upsert)

## Review Task 5: approved (2bb4fe2, spec baris 97 identik plan L806; 10 DELETE + unit + barang cocok JSON & pg_constraint)
- Minor roll-up tambahan:
  - spec menyebut daftar tabel sebagai fakta terverifikasi, padahal endpoint kosongkan belum pernah dieksekusi end-to-end (hanya guard client) → DONE (sudah dikualifikasi di task-5-report.md)
  - report: "reload tab" sebenarnya pindah tab Aset→Pengaturan (re-render + GET), bukan page reload
  - report: "normal" pada check 4 dibuktikan dari visibilitas section, bukan render data dalam group
  - report: spy total fetch 0 (bukan hanya 0 ke endpoint); guard server "ketik HAPUS" belum diuji (di luar scope)

## FINAL whole-branch review (9a62600..2bb4fe2): ⚠️ Merge with follow-ups — Issues blocking: tidak ada
Terverifikasi langsung ke DB/diff: blok generator & test byte-identical dengan plan, BAST JSON/logika utuh, 41 node + link resolve + 7 gate identik + 9 alwaysOutputData + 7 responder, cakupan FK 12 kolom = 10 DELETE + unit + barang (ruangan/kategori/pegawai/pengaturan/tanda_tangan/arsip memang tanpa FK), tidak ada SQL injection (semua lewat esc()/Number()), wiring tab resolve by name, tidak ada secret baru di range ini.
- PENTING (follow-up, sengaja tidak diubah sekarang — kode sudah terverifikasi jalan, perubahan butuh re-verifikasi):
  1. `js/simapo-bast.js:29` + `js/config.js:409` — guard Critical Task 4 bergantung string literal 'Empty N8n Response' di dua tempat, tanpa konstanta bersama/test JS; ubah wording di config.js diam-diam mengembalikan false-success. Fix murah nanti: satu konstanta global.
  2. `scripts/test-aset-data.mjs:88-94` — test kosongkan hanya menguji penolakan (tidak ada panggilan destruktif di suite sekarang); kalau suatu saat guard direvisi dan test jadi memanggil confirm='HAPUS', penghapusan terjadi sebelum assert. Tambahkan interlock `ALLOW_DESTRUCTIVE` saat需要的.
- Minor lain: `body !== null` di bastSubmit:31 kondisi mati (apiFetch tidak pernah null); 4 konstanta P.* belum punya konsumen UI dan path test hardcoded terpisah dari config (rename path = ubah 2 tempat).

## Follow-up final: #1 DONE (2 commit), #2/#3/#4 tetap follow-up
- `d173ed4` — satu konstanta global `EMPTY_N8N_RESPONSE` (js\config.js:100) dipakai apiFetch (config.js:411) & bastSubmit (simapo-bast.js:29); literal 'Empty N8n Response' sekarang nol di repo; cache-buster `?v=` di-bump untuk kedua file (config.js → 20260720b, simapo-bast.js → 2) supaya tidak mismatch di browser yang sudah cache.
- `0977873` — review menemukan penghapusan `body !== null` = regresi Important (`res.json()` throw saat 200 → body null → `isApiSuccess(null)` true → false-success); guard dikembalikan + komentar ponytail. Re-review lulus, blocking: tidak ada.
- Review juga menemukan false-success PRE-EXISTING di `isApiSuccess` fallback (js\api.js:101): 200 + body non-JSON → `return httpOk` = true. Di luar scope Plan 1; catat sebagai follow-up (fix murah: `return false` di fallback).
- Chrome remote-debugging permission sudah tidak aktif → verifikasi browser untuk 2 commit terakhir tidak diulang; guard ini identik logikanya dengan versi yang sudah PASS di browser (Task 4/5), `node --check` + load order + grep satu-satunya literal jadi bukti statis.
- Follow-up tersisa: (a) interlock `ALLOW_DESTRUCTIVE` di test kalau suatu saat ada panggilan `confirm='HAPUS'`; (b) 4 konstanta P.* tanpa konsumen UI / path test terduplikasi; (c) false-success non-JSON di js\api.js:101; (d) rapikan skema cache-buster (`2` vs tanggal).
