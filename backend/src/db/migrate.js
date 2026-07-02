// Ejecuta en orden todos los .sql de backend/migrations que todavía no
// se hayan aplicado (registro en la tabla _migraciones).
require('dotenv').config({ path: require('path').join(__dirname, '..', '..', '.env') });
const fs = require('fs');
const path = require('path');
const pool = require('../db');

async function main() {
  await pool.query(`CREATE TABLE IF NOT EXISTS _migraciones (
    nombre TEXT PRIMARY KEY, aplicada TIMESTAMPTZ NOT NULL DEFAULT now())`);

  const dir = path.join(__dirname, '..', '..', 'migrations');
  const archivos = fs.readdirSync(dir).filter(f => f.endsWith('.sql')).sort();
  const { rows } = await pool.query('SELECT nombre FROM _migraciones');
  const aplicadas = new Set(rows.map(r => r.nombre));

  for (const archivo of archivos) {
    if (aplicadas.has(archivo)) { console.log(`= ${archivo} (ya aplicada)`); continue; }
    const sql = fs.readFileSync(path.join(dir, archivo), 'utf8');
    console.log(`> aplicando ${archivo}...`);
    await pool.query(sql);
    await pool.query('INSERT INTO _migraciones (nombre) VALUES ($1)', [archivo]);
  }
  console.log('Migraciones al día.');
  await pool.end();
}

main().catch(err => { console.error(err); process.exit(1); });
