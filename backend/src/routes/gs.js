// API compatible con el Web App de Apps Script: mismas actions, mismos
// formatos de respuesta. Así los 6 HTML solo cambian APPS_SCRIPT_URL por
// '/api/gs' (y pueden dejar de usar mode:'no-cors', acá sí hay CORS simple
// por ser mismo origen).
const path = require('path');
const fs = require('fs');
const express = require('express');
const pool = require('../db');
const { generarConvenioPDF } = require('../services/pdfConvenio');

const router = express.Router();

// Igual que en Apps Script: acepta nombres de columna con espacios extra.
const norm = v => String(v == null ? '' : v).trim().toLowerCase();

async function upsertProductor(client, razonSocial, cuit) {
  const { rows } = await client.query(
    `INSERT INTO productores (razon_social, cuit) VALUES ($1, $2)
     ON CONFLICT (razon_social) DO UPDATE
       SET cuit = COALESCE(NULLIF(EXCLUDED.cuit, ''), productores.cuit),
           updated_at = now()
     RETURNING id`,
    [String(razonSocial || '').trim(), cuit || null]
  );
  return rows[0].id;
}

// ---------------------------------------------------------------- GET ----
router.get('/', async (req, res, next) => {
  try {
    const action = req.query.action || 'getLotes';

    if (action === 'getLotes') {
      const { rows } = await pool.query(
        `SELECT l.id_lote, p.razon_social AS productor, l.nombre_campo, l.lote,
                l.variedad, l.fecha_siembra_estimada, l.campana, l.provincia,
                l.departamento, l.area_ha,
                COALESCE(l.poligono_geojson::text, '') AS poligono_geojson,
                l.fecha_carga, l.latitud_centroide, l.longitud_centroide,
                COALESCE(l.kmz_filename,'') AS kmz_filename,
                COALESCE(l.region,'') AS region, COALESCE(l.siembra,'1ra') AS siembra
         FROM lotes l JOIN productores p ON p.id = l.productor_id
         ORDER BY l.id`);
      return res.json(rows);
    }

    if (action === 'getVisitas') {
      const { rows } = await pool.query(
        `SELECT id_visita, fecha_visita, tecnico, productor, nombre_campo,
                id_lote, lote, lat_visita, lng_visita,
                CASE WHEN lote_sembrado THEN 1 ELSE 0 END AS lote_sembrado,
                fecha_siembra, fecha_cosecha_estimada, estado_fenologico,
                estado_malezas,
                CASE WHEN malezas_resistentes THEN 1 ELSE 0 END AS malezas_resistentes,
                observacion_plagas, condicion_cultivo, rinde_estimado_qqha,
                notas, imagenes, fecha_carga, lote_cosechado, tipo_registro,
                ha_plan, semilla_up, variedad, siembra
         FROM visitas ORDER BY id`);
      return res.json(rows);
    }

    if (action === 'getEntregas') {
      // Reconstruye el formato del Sheet: una fila por snapshot con las
      // columnas fijas + una clave por semana ('yyyy-MM-dd': tn_entregada).
      const { rows: snaps } = await pool.query(
        `SELECT id, id_campo, productor, nombre_campo, campana, tn_embolse,
                fecha_actualizacion
         FROM entregas_snapshots ORDER BY id`);
      const { rows: sems } = await pool.query(
        `SELECT snapshot_id, to_char(semana_inicio, 'YYYY-MM-DD') AS semana,
                tn_entregada
         FROM entregas_semanales`);
      const porSnapshot = new Map();
      for (const s of sems) {
        if (!porSnapshot.has(s.snapshot_id)) porSnapshot.set(s.snapshot_id, {});
        porSnapshot.get(s.snapshot_id)[s.semana] = s.tn_entregada;
      }
      return res.json(snaps.map(s => ({
        id_campo: s.id_campo, productor: s.productor, nombre_campo: s.nombre_campo,
        campana: s.campana, tn_embolse: s.tn_embolse,
        fecha_actualizacion: s.fecha_actualizacion,
        ...(porSnapshot.get(s.id) || {})
      })));
    }

    if (action === 'getClientes') {
      const { rows } = await pool.query(
        `SELECT razon_social, cuit, direccion, representante_nombre,
                representante_dni, representante_rol, plazo_entrega_dias,
                comision_pct, email_contrato
         FROM productores ORDER BY razon_social`);
      return res.json(rows.map(r => ({
        razonSocial: r.razon_social || '',
        cuit: r.cuit || '',
        direccion: r.direccion || '',
        nombreCompleto: r.representante_nombre || '',
        dni: r.representante_dni || '',
        rol: r.representante_rol || '',
        plazo: r.plazo_entrega_dias == null ? '' : String(r.plazo_entrega_dias),
        comision: r.comision_pct == null ? '' : String(r.comision_pct),
        email: r.email_contrato || ''
      })).filter(c => c.razonSocial));
    }

    if (action === 'getConvenios') {
      // Antes: nombres de archivo de la carpeta de Drive. Ahora: registro real.
      const { rows } = await pool.query('SELECT nombre_archivo FROM convenios');
      return res.json(rows.map(r => r.nombre_archivo));
    }

    // Estado completo de convenios/firmas (reemplaza el localStorage de
    // administrativo_SNGM.html y el velocímetro del dashboard).
    if (action === 'getEstadoConvenios') {
      const { rows } = await pool.query(
        `SELECT p.razon_social, c.id AS convenio_id, c.tipo_convenio, c.campana,
                c.nombre_archivo, c.estado, c.datos_formulario, c.updated_at,
                f.agreement_id, f.estado_adobe, f.participante_email,
                f.fecha_envio, f.fecha_visto, f.fecha_firmado
         FROM convenios c
         JOIN productores p ON p.id = c.productor_id
         LEFT JOIN LATERAL (
           SELECT * FROM convenio_firmas f
           WHERE f.convenio_id = c.id ORDER BY f.id DESC LIMIT 1
         ) f ON true
         ORDER BY p.razon_social, c.id`);
      return res.json(rows);
    }

    return res.json([]);
  } catch (err) { next(err); }
});

// --------------------------------------------------------------- POST ----
router.post('/', async (req, res, next) => {
  const client = await pool.connect();
  try {
    const { action, data: d } = req.body || {};

    if (action === 'appendRow') {
      const productorId = await upsertProductor(client, d.productor, null);
      try {
        await client.query(
          `INSERT INTO lotes (id_lote, productor_id, nombre_campo, lote, variedad,
             fecha_siembra_estimada, campana, provincia, departamento, area_ha,
             poligono_geojson, latitud_centroide, longitud_centroide,
             kmz_filename, region, siembra, fecha_carga)
           VALUES ($1,$2,$3,$4,$5,NULLIF($6,'')::date,$7,$8,$9,$10,
                   NULLIF($11,'')::jsonb,$12,$13,$14,$15,$16,COALESCE(NULLIF($17,'')::timestamptz, now()))`,
          [d.id_lote, productorId, d.nombre_campo, d.lote || '', d.variedad,
           d.fecha_siembra_estimada || '', d.campana, d.provincia, d.departamento,
           d.area_ha, d.poligono_geojson || '', d.latitud_centroide,
           d.longitud_centroide, d.kmz_filename || '', d.region || '',
           d.siembra || '1ra', d.fecha_carga || '']);
      } catch (e) {
        if (e.code === '23505') return res.json({ status: 'duplicado' });
        throw e;
      }
      return res.json({ status: 'ok' });
    }

    if (action === 'uploadKmz' || action === 'uploadImagen') {
      const sub = action === 'uploadKmz' ? 'kmz' : 'fotos';
      const filename = String(d && d.filename || req.body.filename)
        .replace(/[\\/:*?"<>|]/g, '').replace(/\s+/g, '_');
      const base64 = (d && d.base64) || req.body.base64;
      const destino = path.join(req.app.locals.storage, sub, filename);
      fs.writeFileSync(destino, Buffer.from(base64, 'base64'));
      if (action === 'uploadKmz') {
        await client.query(
          'INSERT INTO kmz_archivos (id_lote, filename, path) VALUES ($1,$2,$3)',
          [(d && d.id_lote) || null, filename, `kmz/${filename}`]);
      } else {
        await client.query(
          'INSERT INTO visita_imagenes (id_visita, filename, path) VALUES ($1,$2,$3)',
          [(d && d.id_visita) || null, filename, `fotos/${filename}`]);
      }
      return res.json({ status: 'ok', url: `/archivos/${sub}/${filename}` });
    }

    if (action === 'appendVisita') {
      const { rows } = await client.query(
        'SELECT id FROM lotes WHERE id_lote = $1', [d.id_lote]);
      await client.query(
        `INSERT INTO visitas (id_visita, lote_id, id_lote, fecha_visita, tecnico,
           productor, nombre_campo, lote, lat_visita, lng_visita, lote_sembrado,
           fecha_siembra, fecha_cosecha_estimada, estado_fenologico, estado_malezas,
           malezas_resistentes, observacion_plagas, condicion_cultivo,
           rinde_estimado_qqha, notas, imagenes, fecha_carga, lote_cosechado,
           tipo_registro, ha_plan, semilla_up, variedad, siembra)
         VALUES ($1,$2,$3,NULLIF($4,'')::date,$5,$6,$7,$8,$9,$10,$11,$12,$13,
                 $14,$15,$16,$17,$18,$19,$20,$21,
                 COALESCE(NULLIF($22,'')::timestamptz, now()),$23,$24,$25,$26,$27,$28)`,
        [d.id_visita, rows.length ? rows[0].id : null, d.id_lote,
         d.fecha_visita || '', d.tecnico || '', d.productor, d.nombre_campo,
         d.lote || '', d.lat_visita || null, d.lng_visita || null,
         !!d.lote_sembrado, d.fecha_siembra || '', d.fecha_cosecha_estimada || '',
         d.estado_fenologico || '', d.estado_malezas || '', !!d.malezas_resistentes,
         d.observacion_plagas || '', d.condicion_cultivo || '',
         String(d.rinde_estimado_qqha || ''), d.notas || '', d.imagenes || '',
         d.fecha_carga || '', d.lote_cosechado || 'No', d.tipo_registro || 'visita',
         String(d.ha_plan || ''), d.semilla_up || '', d.variedad || '', d.siembra || '']);
      return res.json({ status: 'ok' });
    }

    if (action === 'guardarEntrega') {
      await client.query('BEGIN');
      const { rows } = await client.query(
        `INSERT INTO entregas_snapshots (id_campo, productor, nombre_campo, campana, tn_embolse)
         VALUES ($1,$2,$3,$4,$5) RETURNING id`,
        [d.id_campo, d.productor, d.nombre_campo, d.campana, d.tn_embolse || null]);
      const snapshotId = rows[0].id;
      for (const s of d.semanas || []) {
        await client.query(
          `INSERT INTO entregas_semanales (snapshot_id, semana_inicio, tn_entregada)
           VALUES ($1, $2::date, $3)`,
          [snapshotId, s.inicio, s.tn_entregada === '' ? null : s.tn_entregada]);
      }
      await client.query('COMMIT');
      return res.json({ status: 'ok' });
    }

    if (action === 'appendCliente') {
      await upsertProductor(client, d.razonSocial, d.cuit);
      return res.json({ status: 'ok' });
    }

    if (action === 'actualizarCliente') {
      // Solo actualiza los campos presentes en el payload (actualización
      // parcial, igual que el Apps Script). La fila se identifica por
      // clienteOriginal; si cambió la razón social, se renombra.
      const original = String(d.clienteOriginal || '').trim();
      const sets = [];
      const vals = [];
      const set = (col, val) => { vals.push(val); sets.push(`${col} = $${vals.length}`); };
      if (d.razonSocial !== undefined) set('razon_social', String(d.razonSocial).trim());
      if (d.cuit !== undefined) set('cuit', d.cuit);
      if (d.direccion !== undefined) set('direccion', d.direccion);
      if (d.nombreCompleto !== undefined) set('representante_nombre', d.nombreCompleto);
      if (d.dni !== undefined) set('representante_dni', d.dni);
      if (d.rol !== undefined) set('representante_rol', d.rol);
      if (d.plazo !== undefined) set('plazo_entrega_dias', d.plazo === '' ? null : parseInt(d.plazo, 10));
      if (d.comision !== undefined) set('comision_pct', d.comision === '' ? null : d.comision);
      if (d.email !== undefined) set('email_contrato', d.email);
      if (sets.length) {
        vals.push(original);
        const r = await client.query(
          `UPDATE productores SET ${sets.join(', ')}, updated_at = now()
           WHERE lower(trim(razon_social)) = lower($${vals.length})`, vals);
        if (r.rowCount === 0) {
          await upsertProductor(client, d.razonSocial || original, d.cuit || null);
        }
      }
      return res.json({ status: 'ok' });
    }

    if (action === 'generarConvenio') {
      const r = await generarConvenioPDF(d, req.app.locals.storage);
      const productorId = await upsertProductor(client, d.razonsocial, d.cuit);
      // La imagen del mapa no se guarda en el JSONB (pesa cientos de KB y ya
      // quedó dentro del PDF).
      const datosSinImagen = { ...d, imagen_base64: undefined };
      // Regenerar = reemplazar el registro del mismo archivo, no duplicarlo.
      const previo = await client.query(
        'SELECT id FROM convenios WHERE nombre_archivo = $1', [r.nombre]);
      if (previo.rows.length) {
        await client.query(
          `UPDATE convenios SET productor_id=$1, tipo_convenio=$2, campana=$3,
             datos_formulario=$4, pdf_path=$5, updated_at=now()
           WHERE id=$6`,
          [productorId, d.tipo_convenio === 'UP' ? 'UP' : 'Semilla', d.campana || null,
           JSON.stringify(datosSinImagen), r.path, previo.rows[0].id]);
      } else {
        await client.query(
          `INSERT INTO convenios (productor_id, tipo_convenio, campana,
             datos_formulario, nombre_archivo, pdf_path)
           VALUES ($1,$2,$3,$4,$5,$6)`,
          [productorId, d.tipo_convenio === 'UP' ? 'UP' : 'Semilla', d.campana || null,
           JSON.stringify(datosSinImagen), r.nombre, r.path]);
      }
      return res.json({ status: 'ok', url: r.url, nombre: r.nombre });
    }

    return res.json({ status: 'ok' });
  } catch (err) { next(err); }
  finally { client.release(); }
});

module.exports = router;
