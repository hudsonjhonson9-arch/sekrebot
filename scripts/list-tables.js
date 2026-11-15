import { query } from '../server/db.js';

async function main() {
  const tables = ['ket_temp', 'agenda_sppd', 'rekap_lembur', 'notifications', 'libur_nasional'];
  for (const t of tables) {
    try {
      const colRes = await query(`SELECT column_name, data_type FROM information_schema.columns WHERE table_name=$1;`, [t]);
      const countRes = await query(`SELECT COUNT(*)::int AS count FROM "${t}";`);
      console.log(`\nTable ${t} (Rows: ${countRes.rows[0].count}):`);
      console.log(colRes.rows.map(c => `${c.column_name} (${c.data_type})`).join(', '));
      const sampleRes = await query(`SELECT * FROM "${t}" ORDER BY 1 DESC LIMIT 1;`);
      if (sampleRes.rows.length) {
        console.log('Sample:', sampleRes.rows[0]);
      }
    } catch (e) {
      console.log(`Table ${t} error:`, e.message);
    }
  }
  process.exit(0);
}

main().catch(e => { console.error(e); process.exit(1); });
