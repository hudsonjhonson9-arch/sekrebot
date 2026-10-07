WITH inp AS (
  SELECT '{{ $items("WH Bast Import")[0].json.body.nomorinventaris }}'::text AS ninv,
         {{ ($items("WH Bast Import")[0].json.body.nilaiperolehan != null ? Number($items("WH Bast Import")[0].json.body.nilaiperolehan) : "NULL") }}::numeric AS nilai,
         {{ ($items("WH Bast Import")[0].json.body.tahunperolehan ? Number($items("WH Bast Import")[0].json.body.tahunperolehan) : "NULL") }}::int AS thn,
         '{{ $items("PG Bast Import")[0].json.unit_id }}'::text AS uids
)
UPDATE "SIMAPO".unit_aset ua
SET nilaiperolehan = inp.nilai,
    tahunperolehan = inp.thn,
    barangid = COALESCE(
      (SELECT b.id FROM "SIMAPO".barang b
       WHERE b.kodebarang='{{ ($items("WH Bast Import")[0].json.body.kodebarang || "").toString().replace(/'/g,"''") }}'
         AND b.nama='{{ ($items("WH Bast Import")[0].json.body.nama || "").toString().replace(/'/g,"''") }}'
         AND b.instansi_id='{{ (($items("WH Bast Import")[0].json.body.instansi_id)||"bapperida").toString().replace(/'/g,"''") }}'),
      ua.barangid),
    qrcode = 'https://mindcloud.my.id/?qr=SIMAPO-' || ua.id,
    updatedat = NOW()
FROM inp
WHERE ua.nomorinventaris = inp.ninv
RETURNING ua.barangid,
       CASE WHEN inp.uids ~ '^[0-9a-fA-F-]{36}$' THEN inp.uids::uuid END AS unit_id;