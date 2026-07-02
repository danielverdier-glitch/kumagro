-- Esquema inicial del sistema SNGM (migrado desde Google Sheets).
-- Se ejecuta con: npm run migrate  (idempotente: usa IF NOT EXISTS donde aplica)

BEGIN;

CREATE TABLE IF NOT EXISTS productores (
  id                    SERIAL PRIMARY KEY,
  razon_social          TEXT NOT NULL UNIQUE,
  cuit                  TEXT,
  direccion             TEXT,
  email_contrato        TEXT,
  representante_nombre  TEXT,
  representante_dni     TEXT,
  representante_rol     TEXT,
  plazo_entrega_dias    INTEGER,
  comision_pct          NUMERIC(5,2),
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS lotes (
  id                      SERIAL PRIMARY KEY,
  id_lote                 TEXT NOT NULL UNIQUE,
  productor_id            INTEGER NOT NULL REFERENCES productores(id),
  nombre_campo            TEXT NOT NULL,
  lote                    TEXT NOT NULL DEFAULT '',
  variedad                TEXT,
  fecha_siembra_estimada  DATE,
  campana                 TEXT NOT NULL,
  provincia               TEXT,
  departamento            TEXT,
  region                  TEXT,
  siembra                 TEXT DEFAULT '1ra',
  area_ha                 NUMERIC(10,2),
  poligono_geojson        JSONB,
  latitud_centroide       NUMERIC(9,6),
  longitud_centroide      NUMERIC(9,6),
  kmz_filename            TEXT,
  fecha_carga             TIMESTAMPTZ NOT NULL DEFAULT now(),
  -- Reemplaza el chequeo anti-duplicado manual del Apps Script
  UNIQUE (productor_id, nombre_campo, lote, campana)
);

-- Log append-only: el dato vigente de un lote es la fila más reciente
-- (mismo patrón "última fila gana" que la hoja Visitas).
CREATE TABLE IF NOT EXISTS visitas (
  id                      SERIAL PRIMARY KEY,
  id_visita               TEXT NOT NULL,
  lote_id                 INTEGER REFERENCES lotes(id),
  id_lote                 TEXT NOT NULL,
  fecha_visita            DATE,
  tecnico                 TEXT DEFAULT '',
  productor               TEXT NOT NULL,
  nombre_campo            TEXT NOT NULL,
  lote                    TEXT DEFAULT '',
  lat_visita              NUMERIC(9,6),
  lng_visita              NUMERIC(9,6),
  lote_sembrado           BOOLEAN DEFAULT false,
  fecha_siembra           TEXT DEFAULT '',
  fecha_cosecha_estimada  TEXT DEFAULT '',
  estado_fenologico       TEXT DEFAULT '',
  estado_malezas          TEXT DEFAULT '',
  malezas_resistentes     BOOLEAN DEFAULT false,
  observacion_plagas      TEXT DEFAULT '',
  condicion_cultivo       TEXT DEFAULT '',
  rinde_estimado_qqha     TEXT DEFAULT '',
  notas                   TEXT DEFAULT '',
  imagenes                TEXT DEFAULT '',
  fecha_carga             TIMESTAMPTZ NOT NULL DEFAULT now(),
  lote_cosechado          TEXT DEFAULT 'No',
  tipo_registro           TEXT DEFAULT 'visita',
  ha_plan                 TEXT DEFAULT '',
  semilla_up              TEXT DEFAULT '',
  variedad                TEXT DEFAULT '',
  siembra                 TEXT DEFAULT ''
);
CREATE INDEX IF NOT EXISTS idx_visitas_id_lote ON visitas (id_lote, fecha_visita DESC);

CREATE TABLE IF NOT EXISTS visita_imagenes (
  id          SERIAL PRIMARY KEY,
  id_visita   TEXT,
  filename    TEXT NOT NULL,
  path        TEXT NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Cabecera de entregas: cada guardado agrega una fila nueva (historial);
-- la vigente es la última por id_campo, igual que en la hoja Entregas.
CREATE TABLE IF NOT EXISTS entregas_snapshots (
  id                    SERIAL PRIMARY KEY,
  id_campo              TEXT NOT NULL,
  productor             TEXT NOT NULL,
  nombre_campo          TEXT NOT NULL,
  campana               TEXT NOT NULL,
  tn_embolse            NUMERIC(12,2),
  fecha_actualizacion   TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_entregas_id_campo ON entregas_snapshots (id_campo, fecha_actualizacion DESC);

-- Detalle semanal: reemplaza las columnas dinámicas por semana del Sheet.
CREATE TABLE IF NOT EXISTS entregas_semanales (
  id             SERIAL PRIMARY KEY,
  snapshot_id    INTEGER NOT NULL REFERENCES entregas_snapshots(id) ON DELETE CASCADE,
  semana_inicio  DATE NOT NULL,
  tn_entregada   NUMERIC(12,2)
);

CREATE TABLE IF NOT EXISTS kmz_archivos (
  id          SERIAL PRIMARY KEY,
  id_lote     TEXT,
  filename    TEXT NOT NULL,
  path        TEXT NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Convenios: antes solo existían como PDF en Drive + estado manual en
-- localStorage del navegador. Acá pasan a ser registro real y multiusuario.
DO $$ BEGIN
  CREATE TYPE estado_convenio AS ENUM
    ('generado','enviado','visto','firmado','rechazado','expirado','cancelado');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS convenios (
  id                SERIAL PRIMARY KEY,
  productor_id      INTEGER NOT NULL REFERENCES productores(id),
  tipo_convenio     TEXT NOT NULL DEFAULT 'Semilla' CHECK (tipo_convenio IN ('Semilla','UP')),
  campana           TEXT,
  datos_formulario  JSONB,
  nombre_archivo    TEXT NOT NULL,
  pdf_path          TEXT NOT NULL,
  estado            estado_convenio NOT NULL DEFAULT 'generado',
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Tracking de Adobe Acrobat Sign (un agreement por envío de convenio).
CREATE TABLE IF NOT EXISTS convenio_firmas (
  id                   SERIAL PRIMARY KEY,
  convenio_id          INTEGER NOT NULL REFERENCES convenios(id) ON DELETE CASCADE,
  agreement_id         TEXT NOT NULL UNIQUE,
  estado_adobe         TEXT NOT NULL,
  participante_email   TEXT,
  participante_nombre  TEXT,
  fecha_envio          TIMESTAMPTZ,
  fecha_visto          TIMESTAMPTZ,
  fecha_firmado        TIMESTAMPTZ,
  pdf_firmado_path     TEXT,
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS usuarios (
  id             SERIAL PRIMARY KEY,
  nombre         TEXT NOT NULL,
  email          TEXT NOT NULL UNIQUE,
  password_hash  TEXT NOT NULL,
  rol            TEXT NOT NULL DEFAULT 'operador',
  activo         BOOLEAN NOT NULL DEFAULT true,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMIT;
