import { query } from '../server/db.js';

async function main() {
  try {
    const users = await query('SELECT id, username, "NIP", "Jabatan", role, bidang, face_photo FROM user_list LIMIT 5');
    console.log('--- SAMPLE REAL USERS ---');
    console.log(users.rows);

    const locations = await query('SELECT * FROM lokasiabsen LIMIT 5');
    console.log('--- SAMPLE LOCATIONS ---');
    console.log(locations.rows);

    const shifts = await query('SELECT * FROM jam_absen LIMIT 5');
    console.log('--- SAMPLE SHIFTS ---');
    console.log(shifts.rows);

    const logs = await query('SELECT * FROM "Log_Absen" ORDER BY "Tanggal" DESC LIMIT 5');
    console.log('--- SAMPLE RECENT ATTENDANCE LOGS ---');
    console.log(logs.rows);

    process.exit(0);
  } catch (err) {
    console.error('ERROR:', err);
    process.exit(1);
  }
}

main();
