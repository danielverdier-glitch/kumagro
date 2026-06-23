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
          'region']);
      }

      sheet.appendRow([
        d.id_lote, d.productor, d.nombre_campo, d.lote||'', d.variedad,
        d.fecha_siembra_estimada, d.campana, d.provincia, d.departamento, d.area_ha,
        d.poligono_geojson, d.fecha_carga, d.latitud_centroide, d.longitud_centroide,
        d.kmz_filename||'', d.region||''
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
          'fecha_carga','lote_cosechado']);
      }

      sheet.appendRow([
        d.id_visita, d.fecha_visita, d.tecnico||'', d.productor, d.nombre_campo,
        d.id_lote, d.lote||'', d.lat_visita, d.lng_visita, d.lote_sembrado?1:0, d.fecha_siembra||'',
        d.fecha_cosecha_estimada||'', d.estado_fenologico||'', d.estado_malezas||'', d.malezas_resistentes?1:0,
        d.observacion_plagas||'', d.condicion_cultivo||'', d.rinde_estimado_qqha||'',
        d.notas||'', d.imagenes||'', d.fecha_carga, d.lote_cosechado||'No'
      ]);
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

// Usado por dashboard_SNGM.html (?action=getLotes) y visitas_SNGM.html (?action=getVisitas).
function doGet(e) {
  const action = (e.parameter && e.parameter.action) || 'getLotes';
  const ss = SpreadsheetApp.openById(SHEET_ID);
  const sheet = action === 'getVisitas' ? ss.getSheetByName('Visitas') : ss.getActiveSheet();
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
