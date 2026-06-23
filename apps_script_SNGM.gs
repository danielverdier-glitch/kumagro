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

    // Usado por entregas_SNGM.html para registrar el Tn embolse y las Tn
    // entregadas de cada semana de un campo (productor + nombre_campo +
    // campaña). Cada guardado AGREGA una fila nueva (no pisa la anterior),
    // para que quede historial de todo lo ingresado. La página siempre
    // toma la última fila de cada id_campo como valor vigente. Cada semana
    // es una columna dinámica cuyo encabezado es su fecha (semana_inicio);
    // si la semana no existe todavía como columna, se crea con formato de
    // texto para que la fecha no se autoconvierta y rompa la comparación.
    if (payload.action === 'guardarEntrega') {
      const d = payload.data;
      const ss = SpreadsheetApp.openById(SHEET_ID);
      let sheet = ss.getSheetByName('Entregas');
      if (!sheet) sheet = ss.insertSheet('Entregas');

      const COLS_FIJAS = ['id_campo','productor','nombre_campo','campana','tn_embolse','fecha_actualizacion'];
      if (sheet.getLastRow() === 0) sheet.appendRow(COLS_FIJAS);

      let headers = headersComoTexto(sheet);

      (d.semanas || []).forEach(s => {
        if (headers.indexOf(s.inicio) === -1) {
          sheet.getRange(1, sheet.getLastColumn() + 1).setNumberFormat('@').setValue(s.inicio);
          headers = headersComoTexto(sheet);
        }
      });

      const fila = new Array(headers.length).fill('');
      fila[headers.indexOf('id_campo')] = d.id_campo;
      fila[headers.indexOf('productor')] = d.productor;
      fila[headers.indexOf('nombre_campo')] = d.nombre_campo;
      fila[headers.indexOf('campana')] = d.campana;
      fila[headers.indexOf('tn_embolse')] = d.tn_embolse;
      fila[headers.indexOf('fecha_actualizacion')] = new Date().toISOString();
      (d.semanas || []).forEach(s => { fila[headers.indexOf(s.inicio)] = s.tn_entregada; });

      sheet.getRange(sheet.getLastRow() + 1, 1, 1, fila.length).setValues([fila]);
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

// Devuelve los encabezados de la fila 1 normalizados a string. Las columnas
// de semana se crean con formato de texto (ver guardarEntrega), pero esto
// también cubre columnas viejas que Sheets haya autoconvertido a fecha.
function headersComoTexto(sheet) {
  return sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0].map(h =>
    h instanceof Date ? Utilities.formatDate(h, Session.getScriptTimeZone(), 'yyyy-MM-dd') : h
  );
}

// Usado por dashboard_SNGM.html (?action=getLotes), visitas_SNGM.html (?action=getVisitas)
// y entregas_SNGM.html (?action=getEntregas). En getEntregas, cada fila trae
// además de las columnas fijas (id_campo, productor, etc.) una columna por
// cada semana cargada, con el encabezado siendo la fecha de inicio de semana.
function doGet(e) {
  const action = (e.parameter && e.parameter.action) || 'getLotes';
  const ss = SpreadsheetApp.openById(SHEET_ID);
  const nombresHoja = {
    getVisitas: 'Visitas',
    getEntregas: 'Entregas'
  };
  const sheet = nombresHoja[action] ? ss.getSheetByName(nombresHoja[action]) : ss.getActiveSheet();
  if (!sheet) {
    return ContentService.createTextOutput(JSON.stringify([])).setMimeType(ContentService.MimeType.JSON);
  }
  const rows = sheet.getDataRange().getValues();
  if (rows.length < 2) {
    return ContentService.createTextOutput(JSON.stringify([])).setMimeType(ContentService.MimeType.JSON);
  }
  const headers = rows[0].map(h =>
    h instanceof Date ? Utilities.formatDate(h, Session.getScriptTimeZone(), 'yyyy-MM-dd') : h
  );
  const data = rows.slice(1).map(row => {
    const obj = {};
    headers.forEach((h,i) => obj[h] = row[i] instanceof Date ? row[i].toISOString() : row[i]);
    return obj;
  });
  return ContentService.createTextOutput(JSON.stringify(data)).setMimeType(ContentService.MimeType.JSON);
}
