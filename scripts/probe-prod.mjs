const { query } = await import('file:///D:/Code/absensi_refactored_v6/server/db.js');
const r = await query(
  `SELECT tablename, indexname, indexdef
   FROM pg_indexes
   WHERE schemaname = 'public'
     AND tablename IN ('tanda_tangan', 'user_list', 'auth_sessions')
   ORDER BY tablename, indexname`);
for (const x of r.rows) {
  console.log(x.tablename.padEnd(15), x.indexdef.replace(/^CREATE (UNIQUE )?INDEX \S+ ON \S+ USING btree\s*/, (m, u) => (u ? 'UNIQUE ' : '') + m.replace(/^.*USING btree\s*/, '')));
}
console.log('--- cek unik tanda_tangan(nip) ---');
const u = await query(
  `SELECT i.indisunique AS uniq, array_agg(a.attname ORDER BY k.ord) AS cols
   FROM pg_index i
   JOIN pg_class c ON c.oid = i.indrelid
   JOIN unnest(i.indkey) WITH ORDINALITY AS k(attnum, ord) ON true
   JOIN pg_attribute a ON a.attrelid = c.oid AND a.attnum = k.attnum
   WHERE c.relname = 'tanda_tangan'
   GROUP BY i.indisunique, i.indexrelid`);
for (const x of u.rows) console.log(x.uniq ? 'UNIQUE' : 'non-unique', JSON.stringify(x.cols));
console.log('--- NIP duplikat di user_list? ---');
const d = await query('SELECT "NIP", count(*)::int AS n FROM "user_list" GROUP BY 1 HAVING count(*) > 1 LIMIT 5');
console.log('NIP duplikat:', d.rows.length === 0 ? 'tidak ada (aman untuk login)' : JSON.stringify(d.rows));
const nul = await query('SELECT count(*)::int AS n FROM "user_list" WHERE "NIP" IS NULL');
console.log('NIP null:', nul.rows[0].n);