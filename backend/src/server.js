require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const path = require('path');
const fs = require('fs');
const express = require('express');

const gsRouter = require('./routes/gs');
const conveniosRouter = require('./routes/convenios');
const exportarRouter = require('./routes/exportar');
const { iniciarPollingFirmas } = require('./jobs/pollFirmas');

const app = express();
// Los uploads (KMZ, fotos, mapa del convenio) viajan como base64 dentro del
// JSON, igual que contra Apps Script — de ahí el límite alto. type:()=>true
// porque los HTML (herencia del modo no-cors) postean JSON sin Content-Type.
app.use(express.json({ limit: '50mb', type: () => true }));

const RAIZ = path.join(__dirname, '..', '..');
const STORAGE = process.env.STORAGE_DIR || path.join(RAIZ, 'storage');
for (const sub of ['pdf', 'kmz', 'fotos', 'firmados']) {
  fs.mkdirSync(path.join(STORAGE, sub), { recursive: true });
}
app.locals.storage = STORAGE;

// API compatible con las actions del Apps Script (mínimo cambio en los HTML)
app.use('/api/gs', gsRouter);
// API nueva: convenios + firmas Adobe Sign
app.use('/api/convenios', conveniosRouter);
// Exportación a Excel
app.use('/api/exportar', exportarRouter);

// Archivos generados/subidos (PDFs, KMZ, fotos) — servidos de solo lectura
app.use('/archivos', express.static(STORAGE));

// Frontend: los 6 HTML
app.use(express.static(path.join(RAIZ, 'public')));

app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ status: 'error', message: err.message });
});

const PORT = Number(process.env.PORT || 3000);
app.listen(PORT, () => {
  console.log(`Kumagro SNGM escuchando en http://localhost:${PORT}`);
  iniciarPollingFirmas();
});
