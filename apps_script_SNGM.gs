const SHEET_ID     = '1_IslJKixdyIbuYZf88pEdz3kXqDfDCWMoHENSDq3Mf4';
const KMZ_FOLDER   = '1Kq53DGEb9G--LODHemEP0yca0MyDaZxP';
const IMG_FOLDER   = '1J_RKGS1qDM-gdARQhwM6NuIN_FnQY0D9'; // carpeta de Drive para fotos de visitas

// Generación de convenios (administrativo_SNGM.html → action 'generarConvenio').
// La plantilla es un Google Doc NATIVO con marcadores {{...}}; el resultado se
// graba como PDF en la subcarpeta Convenios. Al ser Doc nativo se copia con
// makeCopy (no hace falta el Servicio Avanzado de Drive ni convertir nada).
const CONVENIO_TEMPLATE_ID = '1ghudeYpGsSd6Ccs76F0TUbGoBfK9Uk1SjT_Z-pIDsL0'; // Convenio_semilla (Google Doc)
const CONVENIO_TEMPLATE_UP_ID = '1pZYKy_8E-NF-vV0PXr_1IGzZma2a-epyWD5mnlRmBRM'; // Convenio_UP (Google Doc)
const CONVENIOS_FOLDER     = '19-WOikRaRQmKh2rX1i2ZCzRgDPc66BMB'; // subcarpeta "Convenios" dentro de "Programa SNGM"

// Elige la plantilla según el modelo de convenio (UP o Semilla).
function plantillaConvenio_(tipo) {
  return tipo === 'UP' ? CONVENIO_TEMPLATE_UP_ID : CONVENIO_TEMPLATE_ID;
}

// Base de clientes (carga_lote_SNGM.html → selector de Productor + botón
// "Nuevo"). Vive en una Hoja de Google APARTE de SHEET_ID (convertida desde
// "lista de clientes.xlsx"), con más columnas de las que usamos acá; solo
// se leen/escriben "Ficha de cliente Name" (razón social) y "Nº CUIT".
const CLIENTES_SHEET_ID = '1-JMen__6QiKTKGwjc1EXuiXMwJtyCxvf';
const COL_CLIENTE_NOMBRE = 'Ficha de cliente Name';
const COL_CLIENTE_CUIT   = 'Nº CUIT';

function hojaClientes_() {
  return SpreadsheetApp.openById(CLIENTES_SHEET_ID).getSheets()[0];
}

// Ejecutá esta función UNA vez desde el editor (dropdown de funciones →
// "autorizar" → ▶ Ejecutar) y aceptá los permisos nuevos: van a incluir el
// acceso a "Documentos de Google", que es el que faltaba para DocumentApp.
// Después de aceptar, la generación de convenios ya funciona (no hace falta
// re-desplegar: el permiso queda concedido a nivel del proyecto).
function autorizar() {
  const nombre = DocumentApp.openById(CONVENIO_TEMPLATE_ID).getName();
  const nombreUp = DocumentApp.openById(CONVENIO_TEMPLATE_UP_ID).getName();
  DriveApp.getFolderById(CONVENIOS_FOLDER).getName();
  return nombre + ' / ' + nombreUp; // debería devolver "Convenio_semilla / Convenio_UP"
}

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

      // Anti-duplicado: no guardar si ya existe el mismo lote (productor +
      // nombre_campo + lote + campana) en la base. Como doPost corre bajo
      // LockService, este chequeo es atómico y cubre el caso de dos sesiones
      // que intentan cargar el mismo lote. Si es duplicado, no agrega la fila.
      const filas = sheet.getDataRange().getValues();
      const cab   = filas[0];
      const iP = cab.indexOf('productor'), iC = cab.indexOf('nombre_campo'),
            iL = cab.indexOf('lote'), iK = cab.indexOf('campana');
      const norm = v => String(v == null ? '' : v).trim().toLowerCase();
      const duplicado = filas.slice(1).some(r =>
        norm(r[iP]) === norm(d.productor) && norm(r[iC]) === norm(d.nombre_campo) &&
        norm(r[iL]) === norm(d.lote)      && norm(r[iK]) === norm(d.campana)
      );
      if (duplicado) {
        return ContentService
          .createTextOutput(JSON.stringify({status:'duplicado'}))
          .setMimeType(ContentService.MimeType.JSON);
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

    // Usado por carga_lote_SNGM.html (botón "Nuevo" del selector de
    // Productor): agrega un cliente a la hoja "lista de clientes",
    // completando solo las columnas que usa la app (el resto queda vacío).
    if (payload.action === 'appendCliente') {
      const d = payload.data;
      const sheet = hojaClientes_();
      const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
      const iNombre = headers.indexOf(COL_CLIENTE_NOMBRE);
      const iCuit   = headers.indexOf(COL_CLIENTE_CUIT);
      const fila = new Array(headers.length).fill('');
      if (iNombre > -1) fila[iNombre] = d.razonSocial;
      if (iCuit > -1) fila[iCuit] = d.cuit;
      sheet.appendRow(fila);
    }

    // Usado por administrativo_SNGM.html: rellena la plantilla (Google Doc) con
    // los datos del formulario y graba el resultado COMO PDF en la subcarpeta
    // Convenios. El nombre lo arma el cliente: 2026_<cliente>_<Semilla|UP>.
    if (payload.action === 'generarConvenio') {
      const r = generarConvenioPDF_(payload.data);
      return ContentService
        .createTextOutput(JSON.stringify({status:'ok', url:r.url, nombre:r.nombre}))
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

// Genera el PDF del convenio a partir de la plantilla (Google Doc) y los datos
// del formulario. Devuelve { url, nombre }. Lanza la excepción si algo falla
// (el llamador decide qué hacer con el error).
function generarConvenioPDF_(d) {
  let docId = null;
  try {
    // 1. Copiar la plantilla (Google Doc nativo) a un Doc temporal en la
    //    carpeta Convenios. makeCopy no necesita el Servicio Avanzado.
    //    UP y Semilla usan plantillas distintas (ver plantillaConvenio_).
    docId = DriveApp.getFileById(plantillaConvenio_(d.tipo_convenio))
      .makeCopy('tmp_convenio_' + Date.now(), DriveApp.getFolderById(CONVENIOS_FOLDER))
      .getId();

    // 2. Reemplazar los marcadores de texto.
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
      ['{{direccion}}',       d.domicilio],   // domicilio del Productor (clausula SEPTIMA)
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

    // 3. {{imagen}} (Anexo I): defensivo. Si la imagen falla, se borra el
    //    marcador y se sigue, para no perder el resto del convenio.
    try {
      if (d.imagen_base64) {
        const imgBlob = Utilities.newBlob(Utilities.base64Decode(d.imagen_base64), 'image/png', 'mapa.png');
        insertarImagenEnMarcador(body, '{{imagen}}', imgBlob);
      } else {
        body.replaceText(escaparRegex('{{imagen}}'), '');
      }
    } catch (imgErr) {
      body.replaceText(escaparRegex('{{imagen}}'), '');
    }

    doc.saveAndClose();

    // 4. Exportar a PDF y grabarlo en la carpeta Convenios.
    const nombre  = sanitizarNombre(d.nombre_archivo || ('convenio_' + Date.now())) + '.pdf';
    const carpeta = DriveApp.getFolderById(CONVENIOS_FOLDER);

    // Sobrescribir: si ya hay un convenio con el mismo nombre (regenerado),
    // se manda a la papelera el/los anteriores para no dejar duplicados.
    const previos = carpeta.getFilesByName(nombre);
    while (previos.hasNext()) previos.next().setTrashed(true);

    const pdf  = DriveApp.getFileById(docId).getAs('application/pdf').setName(nombre);
    const file = carpeta.createFile(pdf);

    // 5. Descartar el Google Doc temporal (queda solo el PDF).
    DriveApp.getFileById(docId).setTrashed(true);

    return { url: file.getUrl(), nombre: nombre };
  } catch (err) {
    if (docId) { try { DriveApp.getFileById(docId).setTrashed(true); } catch (limpErr) {} }
    throw err;
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

  // Usado por carga_lote_SNGM.html para poblar el selector de Productor
  // (razón social + CUIT de la hoja "lista de clientes").
  if (action === 'getClientes') {
    const sheet = hojaClientes_();
    const rows = sheet.getDataRange().getValues();
    if (rows.length < 2) {
      return ContentService.createTextOutput(JSON.stringify([])).setMimeType(ContentService.MimeType.JSON);
    }
    const headers = rows[0];
    const iNombre = headers.indexOf(COL_CLIENTE_NOMBRE);
    const iCuit   = headers.indexOf(COL_CLIENTE_CUIT);
    const data = rows.slice(1)
      .map(r => ({
        razonSocial: String(iNombre > -1 && r[iNombre] != null ? r[iNombre] : '').trim(),
        cuit: String(iCuit > -1 && r[iCuit] != null ? r[iCuit] : '').trim()
      }))
      .filter(c => c.razonSocial);
    return ContentService.createTextOutput(JSON.stringify(data)).setMimeType(ContentService.MimeType.JSON);
  }

  // Lista los nombres de archivo de los convenios ya generados (subcarpeta
  // "Convenios"). administrativo_SNGM.html lo usa para saber qué clientes ya
  // tienen convenio y mostrar "Regenerar" en vez de "Generar".
  if (action === 'getConvenios') {
    const archivos = DriveApp.getFolderById(CONVENIOS_FOLDER).getFiles();
    const nombres = [];
    while (archivos.hasNext()) nombres.push(archivos.next().getName());
    return ContentService.createTextOutput(JSON.stringify(nombres)).setMimeType(ContentService.MimeType.JSON);
  }

  // DIAGNÓSTICO: corre la generación del convenio con datos dummy y devuelve el
  // resultado (o el error completo) en texto legible en el navegador. Sirve
  // para ver el error real, que con no-cors el navegador no puede leer del POST.
  // Crea un PDF de prueba "ZZZ_TEST_borrar.pdf" en la carpeta Convenios.
  if (action === 'probarConvenio') {
    try {
      const r = generarConvenioPDF_({
        fecha:'25 de junio de 2026', razonsocial:'CLIENTE TEST', cuit:'20-12345678-9',
        nombrecompleto:'Juan Test', dni:'12345678', rol:'Apoderado', domicilio:'Calle Falsa 123',
        hastotales:'100', provincia:'Buenos Aires', departamento:'Test', coordenadas:'-34.5, -60.0',
        establecimiento:'Campo Test', kilos:'6000', variedad:'K46C25', plazo:'120 dias', comision:'2',
        nombre_archivo:'ZZZ_TEST_borrar'
      });
      return ContentService.createTextOutput(JSON.stringify({status:'ok', resultado:r}, null, 2))
        .setMimeType(ContentService.MimeType.JSON);
    } catch (err) {
      return ContentService.createTextOutput(JSON.stringify({
        status:'error', message: err.message || String(err), stack: err.stack || ''
      }, null, 2)).setMimeType(ContentService.MimeType.JSON);
    }
  }

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
