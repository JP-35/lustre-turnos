// SQL portable (SQLite y PostgreSQL). Fechas en texto ISO-8601 UTC; booleanos como 0/1.
export const TABLAS = ['deudas', 'turnos', 'dias_cerrados', 'profesionales', 'servicios', 'usuarios'];

export const ESQUEMA = [
  `CREATE TABLE IF NOT EXISTS usuarios (
    id TEXT PRIMARY KEY,
    nombre TEXT NOT NULL,
    email TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    rol TEXT NOT NULL DEFAULT 'cliente',
    creado TEXT NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS servicios (
    id TEXT PRIMARY KEY,
    nombre TEXT NOT NULL,
    duracion_min INTEGER NOT NULL,
    precio INTEGER NOT NULL,
    activo INTEGER NOT NULL DEFAULT 1
  )`,
  `CREATE TABLE IF NOT EXISTS profesionales (
    id TEXT PRIMARY KEY,
    nombre TEXT NOT NULL,
    activo INTEGER NOT NULL DEFAULT 1
  )`,
  `CREATE TABLE IF NOT EXISTS turnos (
    id TEXT PRIMARY KEY,
    usuario_id TEXT NOT NULL REFERENCES usuarios(id),
    servicio_id TEXT NOT NULL REFERENCES servicios(id),
    profesional_id TEXT NOT NULL REFERENCES profesionales(id),
    inicio TEXT NOT NULL,
    fin TEXT NOT NULL,
    precio INTEGER NOT NULL,
    estado TEXT NOT NULL DEFAULT 'confirmado',
    cancelado_en TEXT,
    creado TEXT NOT NULL
  )`,
  `CREATE INDEX IF NOT EXISTS idx_turnos_prof_inicio ON turnos (profesional_id, inicio)`,
  `CREATE INDEX IF NOT EXISTS idx_turnos_usuario ON turnos (usuario_id)`,
  `CREATE TABLE IF NOT EXISTS deudas (
    id TEXT PRIMARY KEY,
    usuario_id TEXT NOT NULL REFERENCES usuarios(id),
    turno_id TEXT NOT NULL REFERENCES turnos(id),
    monto INTEGER NOT NULL,
    motivo TEXT NOT NULL,
    estado TEXT NOT NULL DEFAULT 'pendiente',
    creado TEXT NOT NULL,
    saldada_en TEXT
  )`,
  `CREATE TABLE IF NOT EXISTS dias_cerrados (
    fecha TEXT PRIMARY KEY,
    motivo TEXT NOT NULL
  )`,
];

export const SEMILLA = {
  servicios: [
    ['svc-semipermanente', 'Esmaltado semipermanente', 60, 12000],
    ['svc-capping', 'Capping gel', 90, 18000],
    ['svc-esculpidas', 'Uñas esculpidas', 120, 25000],
    ['svc-retiro', 'Retiro de material', 30, 5000],
  ],
  profesionales: [['prof-camila', 'Camila'], ['prof-lucia', 'Lucía']],
  diasCerrados: [
    ['2026-12-08', 'Inmaculada Concepción'],
    ['2026-12-25', 'Navidad'],
    ['2027-01-01', 'Año Nuevo'],
  ],
};
