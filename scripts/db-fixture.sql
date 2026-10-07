-- Fixture skema untuk testing backend LOKAL (server/media.js + server/auth.js).
-- BUKA migrasi produksi. Jangan pernah dijalankan terhadap DB production --
-- blok di bawah menolak nama database yang bukan lokal.
--
-- Muat:  psql "$DATABASE_URL" -f scripts/db-fixture.sql
-- Dropbox (paling bawah) dan seed contoh, jadi file ini idempotent.

DO $$
BEGIN
  IF current_database() NOT IN ('n8n_test', 'postgres', 'sekrebot_test') THEN
    RAISE EXCEPTION
      'Fixture ini hanya untuk DB lokal, tapi dijalankan di "%". Batal.', current_database();
  END IF;
END $$;

DROP TABLE IF EXISTS auth_sessions, tanda_tangan, user_list;

CREATE TABLE user_list (
  id              bigserial PRIMARY KEY,
  "NIP"           text NOT NULL,
  role            text,
  instansi_id     text,
  face_photo      text,
  face_descriptor text,
  face_saved_at   timestamptz,
  face_model      text,
  updated_at      timestamptz
);

-- "NIP" sengaja NON-unique. auth.js singleSessionRow() mengandalkan NIP dobel
-- menghasilkan 401 (bukan 500) -- kalau di-UNIQUE, fan-out join yang di calves
-- tidak akan pernah terjadi dan ambiguitas data jadi tidak terdeteksi.
CREATE INDEX user_list_nip_idx ON user_list ("NIP");

CREATE TABLE tanda_tangan (
  nip        text PRIMARY KEY,
  signature  text,
  saved_by   bigint,
  saved_at   timestamptz,
  updated_at timestamptz
);

CREATE TABLE auth_sessions (
  session_token text PRIMARY KEY,
  nip           text NOT NULL,
  is_active     boolean NOT NULL DEFAULT true,
  expires_at    timestamptz NOT NULL
);

CREATE INDEX auth_sessions_nip_idx ON auth_sessions (nip);

-- Seed: 19800101 = admin INST-A (punya sesi), 19800102 = user INST-B.
-- Token sesi sengaja 192 hex (repeat 12 char x 16) biar lolos isSessionToken().
INSERT INTO user_list (id, "NIP", role, instansi_id) VALUES
  (1, '19800101', 'admin', 'INST-A'),
  (2, '19800102', 'user',  'INST-B');

INSERT INTO auth_sessions (session_token, nip, is_active, expires_at) VALUES
  (repeat('abc123def456', 16), '19800101', true, now() + interval '1 day');