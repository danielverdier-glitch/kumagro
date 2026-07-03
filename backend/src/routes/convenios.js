// Endpoints de convenios y firma electrónica (lo que antes era el
// localStorage 'kumagro_admin_convenios' + el envío simulado).
const path = require('path');
const express = require('express');
const pool = require('../db');
const adobe = require('../services/adobeSign');

const router = express.Router();

// Lista de convenios con su última firma (para administrativo y dashboard).
router.get('/', async (req, res, next) => {
  try {
    const { rows } = await pool.query(
      `SELECT c.id, p.razon_social, c.tipo_convenio, c.campana, c.nombre_archivo,
              c.estado, c.pdf_path, c.created_at, c.updated_at,
              f.agreement_id, f.estado_adobe, f.participante_email,
              f.fecha_envio, f.fecha_visto, f.fecha_firmado, f.pdf_firmado_path
       FROM convenios c
       JOIN productores p ON p.id = c.productor_id
       LEFT JOIN LATERAL (
         SELECT * FROM convenio_firmas f
         WHERE f.convenio_id = c.id ORDER BY f.id DESC LIMIT 1
       ) f ON true
       ORDER BY p.razon_social, c.id`);
    res.json(rows);
  } catch (err) { next(err); }
});

// Envía el convenio a firmar vía Adobe Sign.
// Body: { email } (el firmante). Guarda el agreement en convenio_firmas.
router.post('/:id/enviar', async (req, res, next) => {
  try {
    const convenioId = Number(req.params.id);
    // Acepta una o varias direcciones (separadas por espacio, coma o ;), igual
    // que el campo de la página administrativa. Con varias, cualquiera de los
    // destinatarios puede firmar (memberInfos múltiples en Adobe Sign).
    const emails = String(req.body.email || '').split(/[\s,;]+/).filter(Boolean);
    if (!emails.length || !emails.every(e => /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(e))) {
      return res.status(400).json({ status: 'error', message: 'Email inválido' });
    }
    const email = emails.join(',');

    const { rows } = await pool.query(
      `SELECT c.*, p.razon_social FROM convenios c
       JOIN productores p ON p.id = c.productor_id WHERE c.id = $1`, [convenioId]);
    if (!rows.length) {
      return res.status(404).json({ status: 'error', message: 'Convenio no encontrado' });
    }
    const convenio = rows[0];
    const rutaPdf = path.join(req.app.locals.storage, convenio.pdf_path);

    const transientId = await adobe.subirDocumento(rutaPdf, convenio.nombre_archivo);
    const agreementId = await adobe.enviarAFirmar({
      transientDocumentId: transientId,
      nombreConvenio: convenio.nombre_archivo.replace(/\.pdf$/i, ''),
      emailsFirmantes: emails
    });

    await pool.query(
      `INSERT INTO convenio_firmas (convenio_id, agreement_id, estado_adobe,
         participante_email, fecha_envio)
       VALUES ($1, $2, 'OUT_FOR_SIGNATURE', $3, now())`,
      [convenioId, agreementId, email]);
    await pool.query(
      `UPDATE convenios SET estado = 'enviado', updated_at = now() WHERE id = $1`,
      [convenioId]);
    // Persistir el email de contratos del productor (como hacía actualizarCliente)
    await pool.query(
      `UPDATE productores SET email_contrato = $1, updated_at = now() WHERE id = $2`,
      [email, convenio.productor_id]);

    res.json({ status: 'ok', agreement_id: agreementId });
  } catch (err) { next(err); }
});

// Refresca el estado de la firma de UN convenio ahora mismo (sin esperar
// el próximo ciclo de polling) — botón "Actualizar estado" en la UI.
router.post('/:id/refrescar', async (req, res, next) => {
  try {
    const { revisarPendientes } = require('../jobs/pollFirmas');
    await revisarPendientes(req.app.locals.storage);
    const { rows } = await pool.query(
      `SELECT estado FROM convenios WHERE id = $1`, [Number(req.params.id)]);
    res.json({ status: 'ok', estado: rows.length ? rows[0].estado : null });
  } catch (err) { next(err); }
});

module.exports = router;
