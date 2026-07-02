// Exportación a Excel (.xlsx) de las tablas principales — reemplaza el
// "abrir el Sheet" de antes como forma de consumir los datos en Excel.
// GET /api/exportar/lotes | /visitas | /entregas | /productores | /convenios
const express = require('express');
const ExcelJS = require('exceljs');
const pool = require('../db');

const router = express.Router();

const CONSULTAS = {
  lotes: `SELECT l.id_lote, p.razon_social AS productor, l.nombre_campo, l.lote,
                 l.variedad, l.fecha_siembra_estimada, l.campana, l.provincia,
                 l.departamento, l.region, l.siembra, l.area_ha,
                 l.latitud_centroide, l.longitud_centroide, l.kmz_filename, l.fecha_carga
          FROM lotes l JOIN productores p ON p.id = l.productor_id ORDER BY l.id`,
  visitas: `SELECT id_visita, fecha_visita, tecnico, productor, nombre_campo, id_lote,
                   lote, estado_fenologico, estado_malezas, condicion_cultivo,
                   rinde_estimado_qqha, lote_cosechado, tipo_registro, semilla_up,
                   variedad, siembra, notas, fecha_carga
            FROM visitas ORDER BY id`,
  entregas: `SELECT s.id_campo, s.productor, s.nombre_campo, s.campana, s.tn_embolse,
                    s.fecha_actualizacion, w.semana_inicio, w.tn_entregada
             FROM entregas_snapshots s
             LEFT JOIN entregas_semanales w ON w.snapshot_id = s.id
             ORDER BY s.id, w.semana_inicio`,
  productores: `SELECT razon_social, cuit, direccion, email_contrato,
                       representante_nombre, representante_dni, representante_rol,
                       plazo_entrega_dias, comision_pct
                FROM productores ORDER BY razon_social`,
  convenios: `SELECT p.razon_social, c.tipo_convenio, c.campana, c.nombre_archivo,
                     c.estado, c.created_at, f.participante_email, f.fecha_envio,
                     f.fecha_firmado
              FROM convenios c JOIN productores p ON p.id = c.productor_id
              LEFT JOIN LATERAL (SELECT * FROM convenio_firmas f
                WHERE f.convenio_id = c.id ORDER BY f.id DESC LIMIT 1) f ON true
              ORDER BY p.razon_social`
};

router.get('/:tabla', async (req, res, next) => {
  try {
    const sql = CONSULTAS[req.params.tabla];
    if (!sql) return res.status(404).json({ status: 'error', message: 'Tabla desconocida' });

    const { rows } = await pool.query(sql);
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet(req.params.tabla);
    if (rows.length) {
      ws.columns = Object.keys(rows[0]).map(k => ({ header: k, key: k, width: 18 }));
      ws.addRows(rows);
      ws.getRow(1).font = { bold: true };
    }
    res.setHeader('Content-Type',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition',
      `attachment; filename="${req.params.tabla}_${new Date().toISOString().slice(0, 10)}.xlsx"`);
    await wb.xlsx.write(res);
    res.end();
  } catch (err) { next(err); }
});

module.exports = router;
