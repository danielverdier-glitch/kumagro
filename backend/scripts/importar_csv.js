// Importación única de los datos históricos desde Google Sheets.
//
// Cómo usarlo:
//   1. En Google Sheets: Archivo → Descargar → CSV para cada hoja:
//        - hoja de lotes (la principal)  → lotes.csv
//        - hoja "Visitas"                → visitas.csv
//        - hoja "Entregas"               → entregas.csv
//        - "lista de clientes" (1a hoja) → clientes.csv
//   2. Poner los CSV en backend/importar/
//   3. npm run importar-csv
//
// Es idempotente a nivel lotes (respeta el UNIQUE); visitas y entregas se
// insertan tal cual (correrlo una sola vez o vaciar las tablas antes).
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const fs = require('fs');
const path = require('path');
const pool = require('../src/db');

const DIR = path.join(__dirname, '..', 'importar');

// Parser CSV mínimo con soporte de comillas (suficiente para exports de Sheets).
function parseCSV(texto) {
  const filas = [];
  let fila = [], campo = '', enComillas = false;
  for (let i = 0; i < texto.length; i++) {
    const c = texto[i];
    if (enComillas) {
      if (c === '"' && texto[i + 1] === '"') { campo += '"'; i++; }
      else if (c === '"') enComillas = false;
      else campo += c;
    } else if (c === '"') enComillas = true;
    else if (c === ',') { fila.push(campo); campo = ''; }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && texto[i + 1] === '\n') i++;
      fila.push(campo); campo = '';
      if (fila.some(v => v !== '')) filas.push(fila);
      fila = [];
    } else campo += c;
  }
  if (campo !== '' || fila.length) { fila.push(campo); if (fila.some(v => v !== '')) filas.push(fila); }
  return filas;
}

function comoObjetos(archivo) {
  const ruta = path.join(DIR, archivo);
  if (!fs.existsSync(ruta)) { console.log(`(no está ${archivo}, se saltea)`); return []; }
  const filas = parseCSV(fs.readFileSync(ruta, 'utf8'));
  if (filas.length < 2) return [];
  const headers = filas[0].map(h => String(h).trim());
  return filas.slice(1).map(f => {
    const o = {};
    headers.forEach((h, i) => o[h] = f[i] === undefined ? '' : String(f[i]).trim());
    return o;
  });
}

// Igual que indexColumna_ del Apps Script: tolera espacios/mayúsculas.
function col(obj, nombre) {
  const clave = Object.keys(obj).find(k => k.trim().toLowerCase() === nombre.trim().toLowerCase());
  return clave ? obj[clave] : '';
}

const num = v => { const n = parseFloat(String(v).replace(',', '.')); return isNaN(n) ? null : n; };
const bool = v => ['1', 'true', 'si', 'sí'].includes(String(v).trim().toLowerCase());
const fecha = v => { const s = String(v).trim(); return /^\d{4}-\d{2}-\d{2}/.test(s) ? s.slice(0, 10) : null; };

async function upsertProductor(nombre, extras = {}) {
  const razon = String(nombre || '').trim();
  if (!razon) return null;
  const { rows } = await pool.query(
    `INSERT INTO productores (razon_social, cuit, direccion, email_contrato,
       representante_nombre, representante_dni, representante_rol,
       plazo_entrega_dias, comision_pct)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
     ON CONFLICT (razon_social) DO UPDATE SET
       cuit = COALESCE(NULLIF(EXCLUDED.cuit,''), productores.cuit),
       direccion = COALESCE(NULLIF(EXCLUDED.direccion,''), productores.direccion),
       email_contrato = COALESCE(NULLIF(EXCLUDED.email_contrato,''), productores.email_contrato),
       representante_nombre = COALESCE(NULLIF(EXCLUDED.representante_nombre,''), productores.representante_nombre),
       representante_dni = COALESCE(NULLIF(EXCLUDED.representante_dni,''), productores.representante_dni),
       representante_rol = COALESCE(NULLIF(EXCLUDED.representante_rol,''), productores.representante_rol),
       plazo_entrega_dias = COALESCE(EXCLUDED.plazo_entrega_dias, productores.plazo_entrega_dias),
       comision_pct = COALESCE(EXCLUDED.comision_pct, productores.comision_pct),
       updated_at = now()
     RETURNING id`,
    [razon, extras.cuit || null, extras.direccion || null, extras.email || null,
     extras.repNombre || null, extras.repDni || null, extras.repRol || null,
     extras.plazo == null ? null : parseInt(extras.plazo, 10) || null,
     extras.comision == null ? null : num(extras.comision)]);
  return rows[0].id;
}

async function main() {
  // 1. Clientes (primero, para que los lotes encuentren su productor con datos completos)
  for (const c of comoObjetos('clientes.csv')) {
    await upsertProductor(col(c, 'Ficha de cliente Name'), {
      cuit: col(c, 'Nº CUIT'), direccion: col(c, 'Direccion'),
      email: col(c, 'E-Mail para Contratos'),
      repNombre: col(c, 'Representante Nombre completo'),
      repDni: col(c, 'Representante DNI'), repRol: col(c, 'Representante Rol'),
      plazo: col(c, 'Plazo entrega (dias)'), comision: col(c, 'Comision (%)')
    });
  }
  console.log('clientes.csv importado');

  // 2. Lotes
  let lotes = 0, duplicados = 0;
  for (const l of comoObjetos('lotes.csv')) {
    const pid = await upsertProductor(l.productor);
    if (!pid || !l.id_lote) continue;
    try {
      await pool.query(
        `INSERT INTO lotes (id_lote, productor_id, nombre_campo, lote, variedad,
           fecha_siembra_estimada, campana, provincia, departamento, area_ha,
           poligono_geojson, latitud_centroide, longitud_centroide, kmz_filename,
           region, siembra, fecha_carga)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,NULLIF($11,'')::jsonb,$12,$13,$14,$15,$16,
                 COALESCE(NULLIF($17,'')::timestamptz, now()))`,
        [l.id_lote, pid, l.nombre_campo, l.lote || '', l.variedad,
         fecha(l.fecha_siembra_estimada), l.campana, l.provincia, l.departamento,
         num(l.area_ha), l.poligono_geojson || '', num(l.latitud_centroide),
         num(l.longitud_centroide), l.kmz_filename || '', l.region || '',
         l.siembra || '1ra', l.fecha_carga || '']);
      lotes++;
    } catch (e) {
      if (e.code === '23505') duplicados++; else throw e;
    }
  }
  console.log(`lotes.csv importado (${lotes} filas, ${duplicados} duplicadas salteadas)`);

  // 3. Visitas
  let visitas = 0;
  for (const v of comoObjetos('visitas.csv')) {
    const { rows } = await pool.query('SELECT id FROM lotes WHERE id_lote = $1', [v.id_lote]);
    await pool.query(
      `INSERT INTO visitas (id_visita, lote_id, id_lote, fecha_visita, tecnico,
         productor, nombre_campo, lote, lat_visita, lng_visita, lote_sembrado,
         fecha_siembra, fecha_cosecha_estimada, estado_fenologico, estado_malezas,
         malezas_resistentes, observacion_plagas, condicion_cultivo,
         rinde_estimado_qqha, notas, imagenes, fecha_carga, lote_cosechado,
         tipo_registro, ha_plan, semilla_up, variedad, siembra)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,
               $19,$20,$21,COALESCE(NULLIF($22,'')::timestamptz, now()),$23,$24,$25,$26,$27,$28)`,
      [v.id_visita, rows.length ? rows[0].id : null, v.id_lote, fecha(v.fecha_visita),
       v.tecnico || '', v.productor, v.nombre_campo, v.lote || '',
       num(v.lat_visita), num(v.lng_visita), bool(v.lote_sembrado),
       v.fecha_siembra || '', v.fecha_cosecha_estimada || '', v.estado_fenologico || '',
       v.estado_malezas || '', bool(v.malezas_resistentes), v.observacion_plagas || '',
       v.condicion_cultivo || '', v.rinde_estimado_qqha || '', v.notas || '',
       v.imagenes || '', v.fecha_carga || '', v.lote_cosechado || 'No',
       v.tipo_registro || 'visita', v.ha_plan || '', v.semilla_up || '',
       v.variedad || '', v.siembra || '']);
    visitas++;
  }
  console.log(`visitas.csv importado (${visitas} filas)`);

  // 4. Entregas: columnas fijas + una columna por semana (header yyyy-MM-dd)
  const COLS_FIJAS = ['id_campo', 'productor', 'nombre_campo', 'campana', 'tn_embolse', 'fecha_actualizacion'];
  let entregas = 0;
  for (const e of comoObjetos('entregas.csv')) {
    const { rows } = await pool.query(
      `INSERT INTO entregas_snapshots (id_campo, productor, nombre_campo, campana,
         tn_embolse, fecha_actualizacion)
       VALUES ($1,$2,$3,$4,$5,COALESCE(NULLIF($6,'')::timestamptz, now())) RETURNING id`,
      [e.id_campo, e.productor, e.nombre_campo, e.campana, num(e.tn_embolse),
       e.fecha_actualizacion || '']);
    for (const clave of Object.keys(e)) {
      if (COLS_FIJAS.includes(clave)) continue;
      if (!/^\d{4}-\d{2}-\d{2}$/.test(clave.trim())) continue;
      if (e[clave] === '') continue;
      await pool.query(
        `INSERT INTO entregas_semanales (snapshot_id, semana_inicio, tn_entregada)
         VALUES ($1, $2::date, $3)`,
        [rows[0].id, clave.trim(), num(e[clave])]);
    }
    entregas++;
  }
  console.log(`entregas.csv importado (${entregas} filas)`);

  await pool.end();
  console.log('Importación terminada.');
}

main().catch(err => { console.error(err); process.exit(1); });
