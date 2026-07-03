// Genera el PDF del convenio a partir de una plantilla HTML con marcadores
// {{...}} (reemplaza a las plantillas de Google Doc + DocumentApp).
// Las plantillas viven en backend/plantillas/convenio_semilla.html y
// convenio_up.html y se pueden editar libremente (son HTML común).
const path = require('path');
const fs = require('fs');
const puppeteer = require('puppeteer');

const PLANTILLAS = path.join(__dirname, '..', '..', 'plantillas');

function sanitizarNombre(nombre) {
  return String(nombre).replace(/[\\/:*?"<>|]/g, '').replace(/\s+/g, '_');
}

function escaparHtml(v) {
  return String(v == null ? '' : v)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

// Un solo navegador compartido: lanzar Chromium por PDF tarda segundos;
// reutilizarlo deja la generación en <1s.
let browserPromise = null;
function browser() {
  if (!browserPromise) {
    browserPromise = puppeteer.launch({
      headless: 'new',
      args: ['--no-sandbox', '--disable-setuid-sandbox'],
      ...(process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : {})
    });
  }
  return browserPromise;
}

async function generarConvenioPDF(d, storageDir) {
  const plantilla = d.tipo_convenio === 'UP' ? 'convenio_up.html' : 'convenio_semilla.html';
  let html = fs.readFileSync(path.join(PLANTILLAS, plantilla), 'utf8');

  const reemplazos = {
    fecha: d.fecha, razonsocial: d.razonsocial, cuit: d.cuit,
    nombrecompleto: d.nombrecompleto, dni: d.dni, rol: d.rol,
    domicilio: d.domicilio, direccion: d.domicilio,
    hastotales: d.hastotales, provincia: d.provincia,
    departamento: d.departamento, coordenadas: d.coordenadas,
    establecimiento: d.establecimiento, kilos: d.kilos,
    variedad: d.variedad, plazo: d.plazo, comision: d.comision
  };
  for (const [clave, valor] of Object.entries(reemplazos)) {
    html = html.split(`{{${clave}}}`).join(escaparHtml(valor));
  }
  // {{imagen}} (Anexo I): igual de defensivo que el Apps Script — si no hay
  // imagen, el marcador desaparece y el resto del convenio sale igual.
  html = html.split('{{imagen}}').join(
    d.imagen_base64
      ? `<img src="data:image/png;base64,${d.imagen_base64}" style="max-width:15cm;">`
      : ''
  );

  const nombre = sanitizarNombre(d.nombre_archivo || ('convenio_' + Date.now())) + '.pdf';
  const destino = path.join(storageDir, 'pdf', nombre);

  const page = await (await browser()).newPage();
  try {
    await page.setContent(html, { waitUntil: 'networkidle0' });
    await page.pdf({
      path: destino, format: 'A4', printBackground: true,
      margin: { top: '2.5cm', bottom: '2.5cm', left: '2.5cm', right: '2.5cm' }
    });
  } finally {
    await page.close();
  }

  return { nombre, path: `pdf/${nombre}`, url: `/archivos/pdf/${nombre}` };
}

module.exports = { generarConvenioPDF, sanitizarNombre };
