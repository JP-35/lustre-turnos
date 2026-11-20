# Plan técnico — Lustre Turnos

Puente entre **qué debe hacer** (`SPEC.md`) y **cómo lo construimos**.

## 1. Arquitectura

```
Navegador (Netlify)  --HTTPS/JSON-->  API Node (Render)  --SQL-->  PostgreSQL (Neon)
 frontend estático                    app.js → service.js → rules.js / db.js
```

| Capa | Archivo | Responsabilidad |
|---|---|---|
| HTTP | `backend/src/app.js` | Rutas, CORS, JSON, autenticación, mapeo de errores (R26) |
| Casos de uso | `backend/src/service.js` | Orquesta reglas + datos; transacciones |
| Reglas puras | `backend/src/rules.js` | Precio, horario, ventana, deuda (R01–R21) |
| Reloj | `backend/src/clock.js` | Hora de Argentina, reloj fijo para tests (R04) |
| Datos | `backend/src/db.js`, `schema.js` | Adaptadores SQLite (tests/local) y PostgreSQL (producción) |
| Seguridad | `backend/src/auth.js` | scrypt y tokens firmados HMAC-SHA256 (R22) |
| Frontend | `frontend/` | SPA sin build: HTML + JS + CSS. No calcula reglas |

**Decisión: cero dependencias en tiempo de ejecución salvo `pg`.** Se usa `node:http`, `node:crypto`, `node:test`
y `node:sqlite` (Node ≥ 22). Menos superficie de ataque y nada que “anda porque sí”.

**Decisión: concurrencia (R06).** Reservar y cancelar corren en una transacción que toma un candado global de
agenda: `pg_advisory_xact_lock` en PostgreSQL; en SQLite, una cola de una sola vía. Verificación de solapamiento
dentro del candado ⇒ solo una de dos reservas simultáneas avanza, la otra recibe 409.

## 2. Modelo de datos

| Tabla | Columnas principales |
|---|---|
| `usuarios` | id, nombre, email (único), password_hash, rol, creado |
| `servicios` | id, nombre, duracion_min, precio, activo |
| `profesionales` | id, nombre, activo |
| `turnos` | id, usuario_id→usuarios, servicio_id→servicios, profesional_id→profesionales, inicio, fin (UTC), precio, estado (`confirmado/cancelado/completado/ausente`), cancelado_en, creado |
| `deudas` | id, usuario_id, turno_id, monto, motivo (`cancelacion_tardia/ausencia`), estado (`pendiente/saldada`), creado, saldada_en |
| `dias_cerrados` | fecha (PK, `YYYY-MM-DD`), motivo |

Relaciones: usuario 1—N turnos; servicio 1—N turnos; profesional 1—N turnos; turno 1—0..1 deuda.

## 3. API (prefijo `/api`)

| Método y ruta | Acceso | Qué hace | Reglas |
|---|---|---|---|
| `GET /salud` | público | Estado y hora del Reloj | R04 |
| `POST /registro` · `POST /entrada` | público | Crear cuenta / iniciar sesión | R22 |
| `GET /yo` | sesión | Usuario actual | R23 |
| `GET /servicios` · `GET /profesionales` | público | Catálogo | R05 |
| `GET /disponibilidad?servicio_id&fecha[&profesional_id]` | público (token opcional) | Huecos libres y precio del día | R01–R08, R12–R16 |
| `POST /turnos` | sesión | Reservar | R05–R16 |
| `GET /turnos/mios` | sesión | Mis turnos | R23 |
| `POST /turnos/:id/cancelar` | sesión | Cancelar | R17–R19 |
| `GET /deudas/mias` | sesión | Mis deudas | R11, R21 |
| `GET /admin/agenda?fecha` | admin | Agenda del día | R23 |
| `POST /admin/turnos/:id/completar` · `/ausente` | admin | Cerrar turno | R20, R25 |
| `GET /admin/deudas` · `POST /admin/deudas/:id/saldar` | admin | Cobranzas | R21 |
| `GET/POST/DELETE /admin/dias-cerrados` | admin | Feriados | R03 |
| `GET/POST/PATCH /admin/servicios` | admin | Catálogo | R12 |

Códigos HTTP: 200/201 ok · 400 datos inválidos · 401 sin sesión · 403 sin permiso o deuda · 404 no existe · 409 conflicto · 422 regla de negocio.

## 4. Estrategia de pruebas
Rojo → verde → refactor por tarea. Pruebas unitarias de reglas puras, de servicio (SQLite en memoria + Reloj fijo),
de concurrencia y de la API HTTP real. La misma suite corre contra PostgreSQL si se define `TEST_DATABASE_URL` (CI).
El informe se genera con `npm run informe` en `docs/INFORME-PRUEBAS.md`.

## 5. Publicación
Netlify (frontend estático) · Render (backend Node) · Neon (PostgreSQL). Pasos en `docs/DEPLOY.md`.
Variables: `DATABASE_URL`, `JWT_SECRET`, `ADMIN_EMAIL`, `ADMIN_PASSWORD`, `FRONTEND_URL` (Render) y `API_URL` (Netlify).
Publicar = `git push`: ambos servicios se reconstruyen solos.

## 6. Riesgos
| Riesgo | Mitigación |
|---|---|
| Render gratuito se duerme (~30 s la primera vez) | Pantalla de “despertando servidor” en el front; `/api/salud` |
| Reservas simultáneas | Candado transaccional + test de concurrencia |
| Zona horaria | Reloj local + tests de borde (R04) |
| Fuga de secretos | `.gitignore`, `.env.example`, revisión de diff |
