const SHEET_ID     = '1_IslJKixdyIbuYZf88pEdz3kXqDfDCWMoHENSDq3Mf4';
const KMZ_FOLDER   = '1Kq53DGEb9G--LODHemEP0yca0MyDaZxP';
const IMG_FOLDER   = '1J_RKGS1qDM-gdARQhwM6NuIN_FnQY0D9'; // carpeta de Drive para fotos de visitas

function doPost(e) {
  try {
    const payload = JSON.parse(e.postData.contents);

    if (payload.action === 'appendRow') {
      const d = payload.data;
      const sheet = SpreadsheetApp.openById(SHEET_ID).getActiveSheet();

      // Agregar encabezados si la hoja está vacía
      if (sheet.getLastRow() === 0) {
        sheet.appendRow(['id_lote','productor','nombre_campo','lote','variedad',
          'fecha_siembra_estimada','campana','provincia','departamento','area_ha',
          'poligono_geojson','fecha_carga','latitud_centroide','longitud_centroide','kmz_filename',
          'region','siembra']);
      }

      sheet.appendRow([
        d.id_lote, d.productor, d.nombre_campo, d.lote||'', d.variedad,
        d.fecha_siembra_estimada, d.campana, d.provincia, d.departamento, d.area_ha,
        d.poligono_geojson, d.fecha_carga, d.latitud_centroide, d.longitud_centroide,
        d.kmz_filename||'', d.region||'', d.siembra||'1ra'
      ]);
    }

    if (payload.action === 'uploadKmz') {
      const folder  = DriveApp.getFolderById(KMZ_FOLDER);
      const decoded = Utilities.base64Decode(payload.base64);
      const blob    = Utilities.newBlob(decoded, payload.mimeType, payload.filename);
      folder.createFile(blob);
    }

    // Usado por visitas_SNGM.html para subir fotos de la visita
    if (payload.action === 'uploadImagen') {
      const folder  = DriveApp.getFolderById(IMG_FOLDER);
      const decoded = Utilities.base64Decode(payload.base64);
      const blob    = Utilities.newBlob(decoded, payload.mimeType, payload.filename);
      folder.createFile(blob);
    }

    // Usado por visitas_SNGM.html para registrar una visita a un lote.
    // Se guarda una fila por cada lote visitado; varias filas pueden
    // compartir el mismo id_visita (misma visita, varios lotes del mismo campo).
    if (payload.action === 'appendVisita') {
      const d = payload.data;
      const ss = SpreadsheetApp.openById(SHEET_ID);
      let sheet = ss.getSheetByName('Visitas');
      if (!sheet) sheet = ss.insertSheet('Visitas');

      if (sheet.getLastRow() === 0) {
        sheet.appendRow(['id_visita','fecha_visita','tecnico','productor','nombre_campo',
          'id_lote','lote','lat_visita','lng_visita','lote_sembrado','fecha_siembra',
          'fecha_cosecha_estimada','estado_fenologico','estado_malezas','malezas_resistentes',
          'observacion_plagas','condicion_cultivo','rinde_estimado_qqha','notas','imagenes',
          'fecha_carga','lote_cosechado','tipo_registro','ha_plan','semilla_up','variedad','siembra']);
      }

      sheet.appendRow([
        d.id_visita, d.fecha_visita, d.tecnico||'', d.productor, d.nombre_campo,
        d.id_lote, d.lote||'', d.lat_visita, d.lng_visita, d.lote_sembrado?1:0, d.fecha_siembra||'',
        d.fecha_cosecha_estimada||'', d.estado_fenologico||'', d.estado_malezas||'', d.malezas_resistentes?1:0,
        d.observacion_plagas||'', d.condicion_cultivo||'', d.rinde_estimado_qqha||'',
        d.notas||'', d.imagenes||'', d.fecha_carga, d.lote_cosechado||'No',
        d.tipo_registro||'visita', d.ha_plan||'', d.semilla_up||'', d.variedad||'', d.siembra||''
      ]);
    }

    // Usado por entregas_SNGM.html para guardar/actualizar el Tn embolse
    // de un campo (productor + nombre_campo + campaña). Upsert por id_campo.
    if (payload.action === 'updateEntregaCabecera') {
      const d = payload.data;
      const ss = SpreadsheetApp.openById(SHEET_ID);
      let sheet = ss.getSheetByName('Entregas');
      if (!sheet) sheet = ss.insertSheet('Entregas');
      if (sheet.getLastRow() === 0) {
        sheet.appendRow(['id_campo','productor','nombre_campo','campana','tn_embolse','fecha_actualizacion']);
      }
      const filaIdx = buscarFilaPorIdCampo(sheet, d.id_campo);
      const fila = [d.id_campo, d.productor, d.nombre_campo, d.campana, d.tn_embolse, new Date().toISOString()];
      if (filaIdx > -1) sheet.getRange(filaIdx, 1, 1, fila.length).setValues([fila]);
      else sheet.appendRow(fila);
    }

    // Usado por entregas_SNGM.html para guardar/actualizar las Tn entregadas
    // de una semana puntual de un campo. Upsert por id_campo + semana_inicio.
    if (payload.action === 'updateEntregaSemana') {
      const d = payload.data;
      const ss = SpreadsheetApp.openById(SHEET_ID);
      let sheet = ss.getSheetByName('EntregasSemanas');
      if (!sheet) sheet = ss.insertSheet('EntregasSemanas');
      if (sheet.getLastRow() === 0) {
        sheet.appendRow(['id_campo','semana_inicio','tn_entregada','fecha_actualizacion']);
      }
      const filas = sheet.getDataRange().getValues();
      let filaIdx = -1;
      for (let i = 1; i < filas.length; i++) {
        if (filas[i][0] === d.id_campo && filas[i][1] === d.semana_inicio) { filaIdx = i + 1; break; }
      }
      const fila = [d.id_campo, d.semana_inicio, d.tn_entregada, new Date().toISOString()];
      if (filaIdx > -1) sheet.getRange(filaIdx, 1, 1, fila.length).setValues([fila]);
      else sheet.appendRow(fila);
    }

    return ContentService
      .createTextOutput(JSON.stringify({status:'ok'}))
      .setMimeType(ContentService.MimeType.JSON);

  } catch(err) {
    return ContentService
      .createTextOutput(JSON.stringify({status:'error',message:err.toString()}))
      .setMimeType(ContentService.MimeType.JSON);
  }
}

// Busca la fila (1-based, incluye encabezado) cuya columna id_campo coincide.
// Devuelve -1 si no existe.
function buscarFilaPorIdCampo(sheet, idCampo) {
  const filas = sheet.getDataRange().getValues();
  for (let i = 1; i < filas.length; i++) {
    if (filas[i][0] === idCampo) return i + 1;
  }
  return -1;
}

// Usado por dashboard_SNGM.html (?action=getLotes), visitas_SNGM.html (?action=getVisitas)
// y entregas_SNGM.html (?action=getEntregas / ?action=getEntregasSemanas).
function doGet(e) {
  const action = (e.parameter && e.parameter.action) || 'getLotes';
  const ss = SpreadsheetApp.openById(SHEET_ID);
  const nombresHoja = {
    getVisitas: 'Visitas',
    getEntregas: 'Entregas',
    getEntregasSemanas: 'EntregasSemanas'
  };
  const sheet = nombresHoja[action] ? ss.getSheetByName(nombresHoja[action]) : ss.getActiveSheet();
  if (!sheet) {
    return ContentService.createTextOutput(JSON.stringify([])).setMimeType(ContentService.MimeType.JSON);
  }
  const rows = sheet.getDataRange().getValues();
  if (rows.length < 2) {
    return ContentService.createTextOutput(JSON.stringify([])).setMimeType(ContentService.MimeType.JSON);
  }
  const headers = rows[0];
  const data = rows.slice(1).map(row => {
    const obj = {};
    headers.forEach((h,i) => obj[h] = row[i] instanceof Date ? row[i].toISOString() : row[i]);
    return obj;
  });
  return ContentService.createTextOutput(JSON.stringify(data)).setMimeType(ContentService.MimeType.JSON);
}
