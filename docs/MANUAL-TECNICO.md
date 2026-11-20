# Manual técnico

## Requisitos
Node.js **22.13 o superior**. Para producción: una base PostgreSQL (Neon). Para local: nada más (SQLite integrado).

## Variables de entorno (`backend/.env`, nunca en git)
| Variable | Uso |
|---|---|
| `PORT` | Puerto HTTP (Render lo define solo) |
| `DATABASE_URL` | PostgreSQL. Vacía = SQLite local |
| `JWT_SECRET` | Firma de tokens. Obligatoria en producción (≥ 16 caracteres) |
| `ADMIN_EMAIL`, `ADMIN_PASSWORD` | Crean el primer admin al arrancar (R24) |
| `FRONTEND_URL` | Orígenes permitidos por CORS, separados por coma |

## Comandos (en `backend/`)
| Comando | Qué hace |
|---|---|
| `npm start` | Levanta API y sirve `frontend/` en `http://localhost:3000` |
| `npm test` | Corre toda la suite |
| `TEST_DATABASE_URL=postgresql://… npm test` | La misma suite contra PostgreSQL |
| `npm run informe` | Regenera `docs/INFORME-PRUEBAS.md` |

E2E con navegador (opcional): `NODE_PATH=$(npm root -g) node e2e/e2e.mjs` desde la raíz.

## Estructura
```
backend/src   app.js (HTTP) · service.js (casos de uso) · rules.js (reglas puras) · clock.js (Reloj)
              db.js / schema.js (SQLite y PostgreSQL) · auth.js · context.js · server.js
backend/test  una suite por área; cada test lleva el id de la regla (R01…R26)
frontend/     index.html · app.js · styles.css · config.js
docs/         SPEC · PLAN · TAREAS · RELEVAMIENTO · INFORME-PRUEBAS · DEPLOY · manuales
```

## Contrato de errores
Siempre `{"error":{"code":"TURNO_OCUPADO","message":"…"}}`. Códigos principales: `DIA_CERRADO`, `FUERA_DE_HORARIO`, `HORARIO_INVALIDO`, `ANTICIPACION_MINIMA`, `FUERA_DE_HORIZONTE`, `LIMITE_TURNOS`, `UN_TURNO_POR_DIA`, `DEUDA_PENDIENTE` (403), `TURNO_OCUPADO` (409), `NO_CANCELABLE`, `TURNO_COMENZADO`, `AUN_NO_COMENZO`, `SIN_PERMISO` (403), `NO_AUTENTICADO` (401).

## Concurrencia
`reservar` y `cancelar` corren en una transacción que toma el candado `agenda` (`pg_advisory_xact_lock` en PostgreSQL; cola de una sola vía en SQLite). Dentro del candado se comprueba el solapamiento ⇒ no hay doble reserva.
