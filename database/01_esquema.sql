CREATE TABLE roles (
  id SMALLSERIAL PRIMARY KEY,
  nombre TEXT NOT NULL UNIQUE
);

CREATE TABLE clientes (
  id SERIAL PRIMARY KEY,
  nombre TEXT NOT NULL,
  email_contacto TEXT NOT NULL,
  origen TEXT NOT NULL DEFAULT 'registro' CHECK (origen IN ('registro', 'admin')),
  activo BOOLEAN NOT NULL DEFAULT true,
  creado_en TIMESTAMPTZ NOT NULL DEFAULT now(),
  suspendido_en TIMESTAMPTZ
);

CREATE TABLE usuarios (
  id SERIAL PRIMARY KEY,
  rol_id SMALLINT NOT NULL REFERENCES roles (id),
  cliente_id INTEGER REFERENCES clientes (id),
  nombre TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  debe_cambiar_clave BOOLEAN NOT NULL DEFAULT false,
  ultimo_login TIMESTAMPTZ,
  activo BOOLEAN NOT NULL DEFAULT true,
  creado_en TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE ubicaciones (
  id SERIAL PRIMARY KEY,
  cliente_id INTEGER NOT NULL REFERENCES clientes (id),
  localidad TEXT NOT NULL DEFAULT '',
  nombre TEXT NOT NULL,
  descripcion TEXT,
  archivada BOOLEAN NOT NULL DEFAULT false,
  espera_sin_conexion_s INTEGER NOT NULL DEFAULT 120 CHECK (espera_sin_conexion_s IN (60, 120, 300)),
  creado_en TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE dispositivos (
  id SERIAL PRIMARY KEY,
  mac_address CHAR(17) NOT NULL UNIQUE CHECK (mac_address ~ '^([0-9A-F]{2}:){5}[0-9A-F]{2}$'),
  codigo CHAR(9) NOT NULL UNIQUE CHECK (codigo ~ '^[A-Z0-9]{4}-[A-Z0-9]{4}$'),
  cliente_id INTEGER REFERENCES clientes (id),
  ubicacion_id INTEGER REFERENCES ubicaciones (id),
  nombre TEXT,
  estado TEXT NOT NULL DEFAULT 'disponible'
    CHECK (estado IN ('disponible', 'reservado', 'en_uso', 'desactivado', 'retirado')),
  mq135_r0_kohm NUMERIC(8, 3) CHECK (mq135_r0_kohm > 0),
  notas TEXT NOT NULL DEFAULT '',
  ultima_lectura_en TIMESTAMPTZ,
  ultimo_rssi SMALLINT,
  ultimo_uptime_s INTEGER,
  fw TEXT,
  creado_en TIMESTAMPTZ NOT NULL DEFAULT now(),
  asignado_en TIMESTAMPTZ,
  asignado_por INTEGER REFERENCES usuarios (id)
);

CREATE TABLE eventos_dispositivo (
  id BIGSERIAL PRIMARY KEY,
  dispositivo_id INTEGER NOT NULL REFERENCES dispositivos (id),
  fecha TIMESTAMPTZ NOT NULL DEFAULT now(),
  texto TEXT NOT NULL,
  usuario_id INTEGER REFERENCES usuarios (id)
);

CREATE TABLE lecturas (
  id BIGSERIAL PRIMARY KEY,
  dispositivo_id INTEGER NOT NULL REFERENCES dispositivos (id),
  ubicacion_id INTEGER NOT NULL REFERENCES ubicaciones (id),
  fecha_hora TIMESTAMPTZ NOT NULL DEFAULT now(),
  ts_dispositivo TIMESTAMPTZ,
  latencia_ms INTEGER,
  temperatura NUMERIC(5, 2),
  humedad NUMERIC(5, 2),
  presion NUMERIC(6, 2),
  mq135_v NUMERIC(5, 3),
  rs_r0 NUMERIC(6, 3),
  nivel_aire TEXT CHECK (nivel_aire IN ('bueno', 'moderado', 'malo')),
  uptime_s INTEGER
);

CREATE INDEX idx_lecturas_disp_fecha ON lecturas (dispositivo_id, fecha_hora DESC);
CREATE INDEX idx_lecturas_ubic_fecha ON lecturas (ubicacion_id, fecha_hora DESC);

CREATE TABLE lecturas_minuto (
  dispositivo_id INTEGER NOT NULL REFERENCES dispositivos (id),
  ubicacion_id INTEGER NOT NULL REFERENCES ubicaciones (id),
  minuto TIMESTAMPTZ NOT NULL,
  temp_avg NUMERIC(5, 2),
  temp_min NUMERIC(5, 2),
  temp_max NUMERIC(5, 2),
  hum_avg NUMERIC(5, 2),
  hum_min NUMERIC(5, 2),
  hum_max NUMERIC(5, 2),
  pres_avg NUMERIC(6, 2),
  pres_min NUMERIC(6, 2),
  pres_max NUMERIC(6, 2),
  rs_r0_avg NUMERIC(6, 3),
  rs_r0_min NUMERIC(6, 3),
  n_lecturas INTEGER NOT NULL,
  PRIMARY KEY (dispositivo_id, minuto)
);

CREATE TABLE umbrales (
  id SERIAL PRIMARY KEY,
  ubicacion_id INTEGER NOT NULL REFERENCES ubicaciones (id),
  variable TEXT NOT NULL CHECK (variable IN ('temperatura', 'humedad', 'presion', 'calidad_aire')),
  valor_min NUMERIC(7, 2),
  valor_max NUMERIC(7, 2),
  activo BOOLEAN NOT NULL DEFAULT true,
  actualizado_por INTEGER REFERENCES usuarios (id),
  actualizado_en TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (ubicacion_id, variable),
  CHECK (valor_min IS NULL OR valor_max IS NULL OR valor_min < valor_max)
);

CREATE TABLE alertas (
  id BIGSERIAL PRIMARY KEY,
  dispositivo_id INTEGER NOT NULL REFERENCES dispositivos (id),
  ubicacion_id INTEGER NOT NULL REFERENCES ubicaciones (id),
  tipo TEXT NOT NULL CHECK (tipo IN ('UMBRAL', 'SENSOR', 'SIN_CONEXION')),
  variable TEXT,
  mensaje TEXT NOT NULL,
  valor_inicio NUMERIC(8, 3),
  peor_valor NUMERIC(8, 3),
  abierta_en TIMESTAMPTZ NOT NULL DEFAULT now(),
  cerrada_en TIMESTAMPTZ,
  motivo_cierre TEXT
);

CREATE UNIQUE INDEX uq_alerta_abierta ON alertas (dispositivo_id, tipo, variable) NULLS NOT DISTINCT
  WHERE cerrada_en IS NULL;
