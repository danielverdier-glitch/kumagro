const SHEET_ID     = '1_IslJKixdyIbuYZf88pEdz3kXqDfDCWMoHENSDq3Mf4';
const KMZ_FOLDER   = '1Kq53DGEb9G--LODHemEP0yca0MyDaZxP';
const IMG_FOLDER   = '1J_RKGS1qDM-gdARQhwM6NuIN_FnQY0D9'; // carpeta de Drive para fotos de visitas

// Generación de convenios (administrativo_SNGM.html → action 'generarConvenio').
// La plantilla es un .docx con marcadores {{...}}; el resultado se graba como
// PDF en la carpeta del programa. CONVENIOS_FOLDER es la carpeta "Programa SNGM"
// (la misma donde están la plantilla y el Sheet).
const CONVENIO_TEMPLATE_ID = '1IBgIwaHPRx0JRHPwitFRlzredqLUeCk1'; // Convenio_semilla.docx
const CONVENIOS_FOLDER     = '1WYLlbUGBXeU3sTOziLwKLtf8LBkKqS6c'; // carpeta "Programa SNGM"

function doPost(e) {
  // Varios usuarios pueden guardar filas casi al mismo tiempo (ej. carga
  // masiva, varios clicks rápidos en "Guardar"). Sin lock, dos ejecuciones
  // de doPost pueden leer la misma "última fila" antes de escribir y una
  // pisa o pierde la escritura de la otra, dejando guardados que parecen
  // exitosos en la página pero que nunca llegan a la planilla.
  const lock = LockService.getScriptLock();
  lock.waitLock(30000);
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
      const semanasRecibidas = d.semanas || [];
      const faltantes = [...new Set(semanasRecibidas.map(s => s.inicio).filter(inicio => headers.indexOf(inicio) === -1))];

      if (faltantes.length) {
        sheet.getRange(1, sheet.getLastColumn() + 1, 1, faltantes.length)
          .setNumberFormat('@').setValues([faltantes]);
        headers = headers.concat(faltantes);
      }

      const fila = new Array(headers.length).fill('');
      fila[headers.indexOf('id_campo')] = d.id_campo;
      fila[headers.indexOf('productor')] = d.productor;
      fila[headers.indexOf('nombre_campo')] = d.nombre_campo;
      fila[headers.indexOf('campana')] = d.campana;
      fila[headers.indexOf('tn_embolse')] = d.tn_embolse;
      fila[headers.indexOf('fecha_actualizacion')] = new Date().toISOString();
      semanasRecibidas.forEach(s => { fila[headers.indexOf(s.inicio)] = s.tn_entregada; });

      sheet.getRange(sheet.getLastRow() + 1, 1, 1, fila.length).setValues([fila]);
    }

    // Usado por administrativo_SNGM.html: toma la plantilla del convenio
    // (Convenio_semilla.docx), reemplaza los marcadores {{...}} con los datos
    // del formulario y graba el resultado COMO PDF en la carpeta del programa.
    // El nombre del archivo lo arma el cliente: 2026_<cliente>_<Semilla|UP>.
    //
    // IMPORTANTE: requiere el Servicio Avanzado "Drive" habilitado en el
    // proyecto de Apps Script (Editor → Servicios → "Drive API"), que se usa
    // para convertir el .docx a Google Doc y poder reemplazar el texto.
    if (payload.action === 'generarConvenio') {
      const d = payload.data;

      // 1. Copiar la plantilla .docx convirtiéndola a un Google Doc temporal.
      const copia = Drive.Files.copy(
        { title: 'tmp_convenio_' + Date.now(), mimeType: 'application/vnd.google-apps.document' },
        CONVENIO_TEMPLATE_ID
      );
      const docId = copia.id;

      // 2. Reemplazar los marcadores. {{imagen}} queda vacío por ahora (el
      //    Anexo I con el polígono georreferenciado se agrega más adelante).
      const doc  = DocumentApp.openById(docId);
      const body = doc.getBody();
      const reemplazos = [
        ['{{fecha}}',           d.fecha],
        ['{{razonsocial}}',     d.razonsocial],
        ['{{cuit}}',            d.cuit],
        ['{{nombrecompleto}}',  d.nombrecompleto],
        ['{{dni}}',             d.dni],
        ['{{rol}}',             d.rol],
        ['{{domicilio}}',       d.domicilio],
        ['{{hastotales}}',      d.hastotales],
        ['{{provincia}}',       d.provincia],
        ['{{departamento}}',    d.departamento],
        ['{{coordenadas}}',     d.coordenadas],
        ['{{establecimiento}}', d.establecimiento],
        ['{{kilos}}',           d.kilos],
        ['{{variedad}}',        d.variedad],
        ['{{plazo}}',           d.plazo],
        ['{{comision}}',        d.comision]
      ];
      reemplazos.forEach(function(par) {
        body.replaceText(escaparRegex(par[0]), par[1] != null ? String(par[1]) : '');
      });

      // {{imagen}}: captura del mapa (Anexo I). Si vino la imagen, se inserta
      // escalada a 15 cm de ancho; si no, se borra el marcador para no dejar
      // el texto crudo en el PDF.
      if (d.imagen_base64) {
        const imgBlob = Utilities.newBlob(Utilities.base64Decode(d.imagen_base64), 'image/png', 'mapa.png');
        insertarImagenEnMarcador(body, '{{imagen}}', imgBlob);
      } else {
        body.replaceText(escaparRegex('{{imagen}}'), '');
      }

      doc.saveAndClose();

      // 3. Exportar a PDF, grabarlo en la carpeta y descartar el Doc temporal.
      const nombre = sanitizarNombre(d.nombre_archivo || ('convenio_' + Date.now())) + '.pdf';
      const pdf    = DriveApp.getFileById(docId).getAs('application/pdf').setName(nombre);
      const file   = DriveApp.getFolderById(CONVENIOS_FOLDER).createFile(pdf);
      DriveApp.getFileById(docId).setTrashed(true);

      return ContentService
        .createTextOutput(JSON.stringify({status:'ok', url:file.getUrl(), nombre:nombre}))
        .setMimeType(ContentService.MimeType.JSON);
    }

    return ContentService
      .createTextOutput(JSON.stringify({status:'ok'}))
      .setMimeType(ContentService.MimeType.JSON);

  } catch(err) {
    return ContentService
      .createTextOutput(JSON.stringify({status:'error',message:err.toString()}))
      .setMimeType(ContentService.MimeType.JSON);
  } finally {
    lock.releaseLock();
  }
}

// Escapa los caracteres especiales de regex de un marcador (las llaves {{ }}
// son metacaracteres) para que replaceText lo trate como texto literal.
function escaparRegex(texto) {
  return texto.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// Limpia un nombre de archivo de caracteres no válidos en Drive.
function sanitizarNombre(nombre) {
  return String(nombre).replace(/[\\/:*?"<>|]/g, '').replace(/\s+/g, '_');
}

// Reemplaza cada aparición de un marcador de texto por una imagen inline,
// escalada a un ancho máximo de 15 cm conservando la proporción. Se vuelve a
// buscar el marcador desde el principio en cada vuelta porque al borrar el
// texto cambian los offsets; el while termina cuando ya no quedan marcadores.
function insertarImagenEnMarcador(body, marcador, blob) {
  const MAX_ANCHO_PT = 15 * 28.3465; // 15 cm en puntos (1 cm = 28.3465 pt)
  let encontrado = body.findText(escaparRegex(marcador));
  while (encontrado) {
    const el = encontrado.getElement().asText();
    el.deleteText(encontrado.getStartOffset(), encontrado.getEndOffsetInclusive());
    const parrafo = el.getParent();
    let imagen;
    if (parrafo.getType() === DocumentApp.ElementType.LIST_ITEM) {
      imagen = parrafo.asListItem().appendInlineImage(blob);
    } else {
      imagen = parrafo.asParagraph().appendInlineImage(blob);
    }
    const w = imagen.getWidth(), h = imagen.getHeight();
    if (w > MAX_ANCHO_PT && w > 0) {
      imagen.setHeight(Math.round(h * (MAX_ANCHO_PT / w)));
      imagen.setWidth(Math.round(MAX_ANCHO_PT));
    }
    encontrado = body.findText(escaparRegex(marcador));
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
