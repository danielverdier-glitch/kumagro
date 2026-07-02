// Cliente mínimo de la API REST v6 de Adobe Acrobat Sign.
// Autenticación por Integration Key (token fijo generado desde el panel de
// Admin de Acrobat Sign → Account → Adobe Sign API → API Information →
// Integration Key). Va en .env como ADOBE_SIGN_TOKEN.
//
// ADOBE_SIGN_BASE_URI depende del shard de tu cuenta (ej.
// https://api.na1.adobesign.com o https://api.eu1.adobesign.com). Se puede
// averiguar con GET /baseUris usando el token; el instalador lo pide.
const fs = require('fs');
const path = require('path');
const axios = require('axios');

function cliente() {
  const base = process.env.ADOBE_SIGN_BASE_URI;
  const token = process.env.ADOBE_SIGN_TOKEN;
  if (!base || !token) {
    throw new Error('Faltan ADOBE_SIGN_BASE_URI / ADOBE_SIGN_TOKEN en el .env');
  }
  return axios.create({
    baseURL: base.replace(/\/$/, '') + '/api/rest/v6',
    headers: { Authorization: `Bearer ${token}` },
    timeout: 60000
  });
}

// Sube el PDF como documento transitorio; devuelve transientDocumentId.
async function subirDocumento(rutaPdf, nombre) {
  const FormData = require('form-data');
  const form = new FormData();
  form.append('File', fs.createReadStream(rutaPdf), { filename: nombre, contentType: 'application/pdf' });
  form.append('Mime-Type', 'application/pdf');
  const { data } = await cliente().post('/transientDocuments', form, { headers: form.getHeaders() });
  return data.transientDocumentId;
}

// Crea el agreement y lo manda a firmar. Devuelve agreementId.
// emailsFirmantes: array; con varios, cualquiera de ellos puede firmar.
async function enviarAFirmar({ transientDocumentId, nombreConvenio, emailsFirmantes, mensaje }) {
  const { data } = await cliente().post('/agreements', {
    fileInfos: [{ transientDocumentId }],
    name: nombreConvenio,
    participantSetsInfo: [{
      role: 'SIGNER', order: 1,
      memberInfos: emailsFirmantes.map(email => ({ email }))
    }],
    signatureType: 'ESIGN',
    state: 'IN_PROCESS',
    message: mensaje || 'Le enviamos el convenio para su firma.'
  });
  return data.id;
}

// Estado actual del agreement: OUT_FOR_SIGNATURE, SIGNED, CANCELLED, EXPIRED...
async function estadoAgreement(agreementId) {
  const { data } = await cliente().get(`/agreements/${agreementId}`);
  return data; // { status, name, ... }
}

// Eventos del agreement (para detectar "visto" = ACTION_REQUESTED/EMAIL_VIEWED).
async function eventosAgreement(agreementId) {
  const { data } = await cliente().get(`/agreements/${agreementId}/events`);
  return data.events || [];
}

// Descarga el PDF firmado (solo cuando status = SIGNED).
async function descargarFirmado(agreementId, destino) {
  const { data } = await cliente().get(`/agreements/${agreementId}/combinedDocument`, {
    responseType: 'arraybuffer'
  });
  fs.mkdirSync(path.dirname(destino), { recursive: true });
  fs.writeFileSync(destino, data);
}

module.exports = { subirDocumento, enviarAFirmar, estadoAgreement, eventosAgreement, descargarFirmado };
