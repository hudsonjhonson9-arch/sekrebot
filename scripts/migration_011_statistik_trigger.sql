-- Native: sinkronisasi statistik_pegawai dari Log_Absen.
-- Menggantikan 3 postgresTrigger n8n (INSERT/UPDATE/DELETE di Log_Absen) pada
-- workflow "Absensi Bot V5.2 Postgres" → node "Sync Statistik Pegawai".
--
-- ponytail: trigger men-trigger per baris dan tiap kali menghitung ulang seluruh
-- riwayat NIP itu (sama seperti n8n). Kalau volume Log_Absen sudah besar dan banyak
-- tulis borongan, ubah ke statement-level / debounce di aplikasi. Butuh unique (nip)
-- pada statistik_pegawai karena ON CONFLICT (nip) — sudah ada supaya UPSERT n8n jalan.

CREATE OR REPLACE FUNCTION sync_statistik_pegawai() RETURNS trigger AS $$
DECLARE
  v_nip text := COALESCE(NEW."NIP", OLD."NIP");
  v_id  text := COALESCE(NEW."ID", OLD."ID");
BEGIN
  IF v_nip IS NULL OR v_nip = '' THEN RETURN NULL; END IF;

  INSERT INTO statistik_pegawai (
    nip, instansi_id,
    total_masuk, total_pulang, total_terlambat, total_lebih_awal,
    akum_menit_terlambat, akum_menit_lebih_awal,
    total_izin, total_sakit, total_tugas, total_tubel, total_cuti, total_alpa,
    updated_at
  )
  SELECT
    v_nip,
    COALESCE((SELECT instansi_id FROM user_list WHERE "NIP" = v_nip LIMIT 1),
             (SELECT instansi_id FROM user_list WHERE id::text = v_id LIMIT 1),
             'bapperida'),
    COUNT(*) FILTER (WHERE "Jenis Absen" IN ('MASUK','DI LUAR JAM MASUK')),
    COUNT(*) FILTER (WHERE "Jenis Absen" IN ('PULANG','DI LUAR JAM PULANG','PULANG LUAR')),
    COUNT(*) FILTER (WHERE "Jenis Absen" IN ('DI LUAR JAM MASUK','TANPA BERITA')),
    COUNT(*) FILTER (WHERE "Jenis Absen" = 'DI LUAR JAM PULANG'),
    COALESCE(SUM(CASE
      WHEN "Jenis Absen" = 'TANPA BERITA' THEN 450
      WHEN "Jenis Absen" = 'DI LUAR JAM MASUK' THEN GREATEST(0, EXTRACT(EPOCH FROM (
        "Jam"::time - COALESCE((SELECT masuk::time FROM jam_periode
          WHERE "Log_Absen"."Tanggal"::date BETWEEN dari::date AND sampai::date LIMIT 1),
          '07:15:00'::time))) / 60)
      ELSE 0 END), 0)::integer,
    COALESCE(SUM(CASE
      WHEN "Jenis Absen" = 'DI LUAR JAM PULANG' THEN GREATEST(0, EXTRACT(EPOCH FROM (
        COALESCE((SELECT pulang::time FROM jam_periode
          WHERE "Log_Absen"."Tanggal"::date BETWEEN dari::date AND sampai::date LIMIT 1),
          '14:30:00'::time) - "Jam"::time)) / 60)
      ELSE 0 END), 0)::integer,
    COUNT(*) FILTER (WHERE "Jenis Absen" = 'IZIN'),
    COUNT(*) FILTER (WHERE "Jenis Absen" = 'SAKIT'),
    COUNT(*) FILTER (WHERE "Jenis Absen" IN ('TUGAS','DL')),
    COUNT(*) FILTER (WHERE "Jenis Absen" = 'TUBEL'),
    COUNT(*) FILTER (WHERE "Jenis Absen" = 'CUTI'),
    COUNT(*) FILTER (WHERE "Jenis Absen" = 'TANPA BERITA'),
    NOW()
  FROM "Log_Absen"
  WHERE "NIP" = v_nip
  ON CONFLICT (nip) DO UPDATE SET
    instansi_id          = EXCLUDED.instansi_id,
    total_masuk          = EXCLUDED.total_masuk,
    total_pulang         = EXCLUDED.total_pulang,
    total_terlambat      = EXCLUDED.total_terlambat,
    total_lebih_awal     = EXCLUDED.total_lebih_awal,
    akum_menit_terlambat = EXCLUDED.akum_menit_terlambat,
    akum_menit_lebih_awal= EXCLUDED.akum_menit_lebih_awal,
    total_izin           = EXCLUDED.total_izin,
    total_sakit          = EXCLUDED.total_sakit,
    total_tugas          = EXCLUDED.total_tugas,
    total_tubel          = EXCLUDED.total_tubel,
    total_cuti           = EXCLUDED.total_cuti,
    total_alpa           = EXCLUDED.total_alpa,
    updated_at           = NOW();

  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_sync_statistik_pegawai ON "Log_Absen";
CREATE TRIGGER trg_sync_statistik_pegawai
AFTER INSERT OR UPDATE OR DELETE ON "Log_Absen"
FOR EACH ROW EXECUTE FUNCTION sync_statistik_pegawai();
