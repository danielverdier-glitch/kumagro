// Polling de Adobe Sign: cada POLL_MINUTOS consulta el estado de todos los
// agreements que todavía no llegaron a un estado final y actualiza
// convenio_firmas + convenios.estado. Elegido en lugar de webhooks para no
// exponer ningún endpoint fuera de la VPN.
const path = require('path');
const pool = require('../db');
const adobe = require('../services/adobeSign');

const ESTADOS_FINALES = ['SIGNED', 'CANCELLED', 'EXPIRED', 'ARCHIVED'];

function mapearEstado(estadoAdobe) {
  switch (estadoAdobe) {
    case 'SIGNED': return 'firmado';
    case 'CANCELLED': return 'cancelado';
    case 'EXPIRED': return 'expirado';
    case 'DECLINED': return 'rechazado';
    default: return 'enviado';
  }
}

async function revisarPendientes(storageDir) {
  const { rows } = await pool.query(
    `SELECT f.id, f.convenio_id, f.agreement_id, f.estado_adobe, f.fecha_visto,
            c.nombre_archivo
     FROM convenio_firmas f JOIN convenios c ON c.id = f.convenio_id
     WHERE f.estado_adobe NOT IN (${ESTADOS_FINALES.map((_, i) => `$${i + 1}`).join(',')})`,
    ESTADOS_FINALES);

  for (const fila of rows) {
    try {
      const info = await adobe.estadoAgreement(fila.agreement_id);
      const estado = info.status;
      let fechaVisto = fila.fecha_visto;

      // "Visto": primer evento de vista del documento por el firmante.
      if (!fechaVisto) {
        const eventos = await adobe.eventosAgreement(fila.agreement_id);
        const visto = eventos.find(e => ['AGREEMENT_VIEWED', 'EMAIL_VIEWED'].includes(e.type));
        if (visto) fechaVisto = visto.date;
      }

      let pdfFirmadoPath = null;
      if (estado === 'SIGNED') {
        const nombre = fila.nombre_archivo.replace(/\.pdf$/i, '') + '_FIRMADO.pdf';
        await adobe.descargarFirmado(fila.agreement_id, path.join(storageDir, 'firmados', nombre));
        pdfFirmadoPath = `firmados/${nombre}`;
      }

      await pool.query(
        `UPDATE convenio_firmas SET estado_adobe=$1,
           fecha_visto = COALESCE($2::timestamptz, fecha_visto),
           fecha_firmado = CASE WHEN $1 = 'SIGNED' THEN now() ELSE fecha_firmado END,
           pdf_firmado_path = COALESCE($3, pdf_firmado_path),
           updated_at = now()
         WHERE id = $4`,
        [estado, fechaVisto || null, pdfFirmadoPath, fila.id]);
      await pool.query(
        `UPDATE convenios SET estado = $1, updated_at = now() WHERE id = $2`,
        [mapearEstado(estado), fila.convenio_id]);

      if (estado !== fila.estado_adobe) {
        console.log(`[firmas] ${fila.nombre_archivo}: ${fila.estado_adobe} -> ${estado}`);
      }
    } catch (err) {
      console.error(`[firmas] error consultando ${fila.agreement_id}:`, err.message);
    }
  }
}

function iniciarPollingFirmas() {
  if (!process.env.ADOBE_SIGN_TOKEN) {
    console.log('[firmas] ADOBE_SIGN_TOKEN no configurado: polling desactivado.');
    return;
  }
  const minutos = Number(process.env.POLL_MINUTOS || 10);
  const storageDir = process.env.STORAGE_DIR ||
    path.join(__dirname, '..', '..', '..', 'storage');
  const correr = () => revisarPendientes(storageDir)
    .catch(err => console.error('[firmas] error en polling:', err.message));
  correr();
  setInterval(correr, minutos * 60 * 1000);
  console.log(`[firmas] polling de Adobe Sign cada ${minutos} minutos.`);
}

// Permite correrlo suelto: node src/jobs/pollFirmas.js --once
if (require.main === module) {
  require('dotenv').config({ path: path.join(__dirname, '..', '..', '.env') });
  const storageDir = process.env.STORAGE_DIR ||
    path.join(__dirname, '..', '..', '..', 'storage');
  revisarPendientes(storageDir).then(() => process.exit(0))
    .catch(err => { console.error(err); process.exit(1); });
}

module.exports = { iniciarPollingFirmas, revisarPendientes };
