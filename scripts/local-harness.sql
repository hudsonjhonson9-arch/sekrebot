-- Local harness: skema inti (cocok produksi) + seed untuk webhook-mock.js
-- DB: POSTGRES_DB=absensi (user postgres, port 5433)

CREATE TABLE IF NOT EXISTS user_list (
  id bigint PRIMARY KEY,
  username text,
  "NIP" text,
  "Jabatan" text,
  "Status" text,
  tgl_pangkat text,
  tgl_berkala text,
  face_histogram text,
  face_saved_at text,
  no bigint,
  face_photo text,
  face_model text DEFAULT 'faceapi',
  bidang text DEFAULT '',
  instansi_id text DEFAULT 'bapperida',
  pangkat text DEFAULT '',
  nomorhp varchar(20),
  role varchar(20) DEFAULT 'USER',
  is_admin boolean DEFAULT false,
  jam_masuk text,
  jam_pulang text
);

CREATE TABLE IF NOT EXISTS instansi_list (
  id text PRIMARY KEY,
  nama_instansi text NOT NULL,
  logo_url text,
  alamat text,
  created_at timestamptz DEFAULT now(),
  header text,
  kontak text,
  header_font varchar(50) DEFAULT 'arial',
  header_size varchar(10) DEFAULT '15'
);

CREATE TABLE IF NOT EXISTS bidang_list (
  id bigint PRIMARY KEY,
  instansi_id text NOT NULL DEFAULT 'bapperida',
  nama_bidang text NOT NULL,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS lokasiabsen (
  id bigserial PRIMARY KEY,
  "Nama_Lokasi" text,
  latitude double precision,
  longitude double precision,
  hari text,
  radius bigint,
  ip_range text,
  instansi_id text DEFAULT 'bapperida'
);

CREATE TABLE IF NOT EXISTS jam_absen (
  "key" text NOT NULL,
  masuk text,
  pulang text,
  diubah_oleh bigint,
  updated_at timestamptz,
  instansi_id text NOT NULL DEFAULT 'bapperida',
  PRIMARY KEY ("key", instansi_id)
);

CREATE TABLE IF NOT EXISTS jam_periode (
  id text PRIMARY KEY,
  nama text,
  dari text,
  sampai text,
  masuk text,
  pulang text,
  ditambahkan_oleh bigint,
  timestamp bigint,
  instansi_id text DEFAULT 'bapperida'
);

CREATE TABLE IF NOT EXISTS libur_nasional (
  tanggal text PRIMARY KEY,
  nama text,
  ditambahkan_oleh bigint,
  timestamp text
);

CREATE TABLE IF NOT EXISTS "Log_Absen" (
  "ID_Log" bigserial PRIMARY KEY,
  "ID" bigint,
  "Nama" text,
  "NIP" text,
  "Tanggal" text,
  "Jam" text,
  "Jenis Absen" text,
  "Lokasi" text,
  "Ket" text,
  koordinat text,
  instansi_id text DEFAULT 'bapperida',
  pangkat text DEFAULT '',
  bidang text,
  request_id text
);
CREATE INDEX IF NOT EXISTS idx_log_absen_nip ON "Log_Absen" ("NIP");
CREATE INDEX IF NOT EXISTS idx_log_absen_tgl ON "Log_Absen" ("Tanggal");

CREATE TABLE IF NOT EXISTS statistik_pegawai (
  nip text PRIMARY KEY,
  instansi_id text,
  total_masuk integer DEFAULT 0,
  total_pulang integer DEFAULT 0,
  total_terlambat integer DEFAULT 0,
  total_lebih_awal integer DEFAULT 0,
  akum_menit_terlambat integer DEFAULT 0,
  akum_menit_lebih_awal integer DEFAULT 0,
  total_izin integer DEFAULT 0,
  total_sakit integer DEFAULT 0,
  total_tugas integer DEFAULT 0,
  total_tubel integer DEFAULT 0,
  total_cuti integer DEFAULT 0,
  total_alpa integer DEFAULT 0,
  updated_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS admin_list (
  telegram_id bigint PRIMARY KEY,
  nama text,
  role text,
  instansi_id text DEFAULT 'bapperida'
);

CREATE TABLE IF NOT EXISTS tanda_tangan (
  id bigint,
  signature text NOT NULL,
  saved_at timestamptz DEFAULT now(),
  saved_by bigint,
  updated_at timestamptz DEFAULT now(),
  instansi_id text DEFAULT 'bapperida',
  nip text NOT NULL UNIQUE
);

CREATE TABLE IF NOT EXISTS pengaturan (
  "key" text NOT NULL,
  value text,
  instansi_id text NOT NULL DEFAULT 'bapperida',
  PRIMARY KEY ("key", instansi_id)
);

CREATE TABLE IF NOT EXISTS auth_sessions (
  token text PRIMARY KEY,
  user_id bigint NOT NULL,
  created_at timestamptz DEFAULT now(),
  expires_at timestamptz,
  user_agent text,
  ip text,
  device jsonb
);

CREATE TABLE IF NOT EXISTS gps_tracking (
  id bigserial PRIMARY KEY,
  user_id bigint,
  nip text,
  instansi_id text,
  latitude double precision,
  longitude double precision,
  accuracy double precision,
  status text
);

CREATE TABLE IF NOT EXISTS device_sessions (
  id bigserial PRIMARY KEY,
  user_id bigint,
  device_id text,
  fingerprint text,
  created_at timestamptz DEFAULT now()
);

-- ════ SEED ════
INSERT INTO instansi_list (id, nama_instansi, logo_url, alamat, header, kontak, header_font, header_size) VALUES
('bapperida', 'BAPPERIDA', '', 'Jl. Weekarou, Waikabubak, Sumba Barat, Nusa Tenggara Timur', 'BADAN PERENCANAAN PEMBANGUNAN \nRISET DAN INOVASI DAERAH', 'Telp (0387) 22203 | Fax (0387) 21093 | Email : wesumba@yahoo.com', 'times', '17')
ON CONFLICT (id) DO NOTHING;

INSERT INTO bidang_list (id, instansi_id, nama_bidang) VALUES
(1, 'bapperida', 'Sekretariat'),
(2, 'bapperida', 'Bidang Perencanaan Pengendalian dan Evaluasi Pembangunan Daerah'),
(3, 'bapperida', 'Bidang Perekonomian dan Sumber Daya Alam'),
(4, 'bapperida', 'Bidang Pemerintahan dan Pembangunan Manusia'),
(5, 'bapperida', 'Bidang Infrastruktur dan Kewilayahan'),
(6, 'bapperida', 'Bidang Riset dan Inovasi Daerah')
ON CONFLICT (id) DO NOTHING;

INSERT INTO user_list (id, username, "NIP", "Jabatan", "Status", tgl_pangkat, tgl_berkala, no, face_model, bidang, instansi_id, pangkat, nomorhp, role, is_admin, jam_masuk, jam_pulang) VALUES
(1383864355, 'Achmad Aqil Susanto, S.Kom', '200206302025061002', 'Pranata Komputer Ahli Pertama', 'AKTIF', '2030-06-01', '2030-06-01', 21, 'human', 'Sekretariat', 'bapperida', 'Penata Muda (III/a)', '082237174435', 'ADMIN', true, NULL, NULL)
ON CONFLICT (id) DO NOTHING;

INSERT INTO jam_absen ("key", masuk, pulang, diubah_oleh, instansi_id) VALUES
('jam_absen_global', '7:15', '14:30', 1383864355, 'bapperida')
ON CONFLICT ("key", instansi_id) DO NOTHING;

INSERT INTO lokasiabsen ("Nama_Lokasi", latitude, longitude, hari, radius, ip_range, instansi_id) VALUES
('Kantor BAPPERIDA', -9.6333333, 119.4166667, NULL, 150, '', 'bapperida')
ON CONFLICT DO NOTHING;

INSERT INTO pengaturan ("key", value, instansi_id) VALUES
('face_recognition', '0', 'bapperida'),
('kontrol_absen', '1', 'bapperida'),
('keterangan', 'Izin,Sakit,Tugas,Tubel,Cuti', 'bapperida')
ON CONFLICT ("key", instansi_id) DO NOTHING;