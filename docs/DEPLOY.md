# Publicación en internet (Neon + Render + Netlify)

Imagen de la clase: **mudar un restaurante**. Neon es la heladera (la base), Render es la cocina (el backend) y Netlify es el salón (lo que ve la clienta).
Orden: **base → backend → frontend → CORS**.

## 1. Neon (PostgreSQL)
1. Crear cuenta en neon.tech → *New project* (`lustre`).
2. Copiar la **connection string** (`postgresql://usuario:clave@ep-xxx.neon.tech/neondb?sslmode=require`). Es un secreto.
3. No hay que crear tablas: el backend las crea solo al arrancar (`CREATE TABLE IF NOT EXISTS`) y carga el catálogo inicial.

## 2. Render (backend)
1. *New → Blueprint* y elegir este repo (usa `render.yaml`), o *New → Web Service* con **Root Directory** `backend`, build `npm install`, start `npm start`.
2. Cargar las variables de entorno en el panel:

| Variable | Valor |
|---|---|
| `DATABASE_URL` | la cadena de Neon |
| `JWT_SECRET` | una cadena larga aleatoria (Render puede generarla) |
| `ADMIN_EMAIL` / `ADMIN_PASSWORD` | credenciales del primer admin (R24) |
| `FRONTEND_URL` | URL de Netlify (se completa en el paso 4) |
| `NODE_ENV` | `production` |

3. Probar `https://TU-API.onrender.com/api/salud` → debe responder `{"ok":true,...}`.
   *Plan gratuito:* se duerme tras 15 min sin uso; la primera solicitud tarda ~30 s (el frontend muestra un aviso).

## 3. Netlify (frontend)
1. *Add new site → Import from Git* y elegir este repo (usa `netlify.toml`: publica `frontend/`).
2. En *Site settings → Environment variables* crear `API_URL` = `https://TU-API.onrender.com` (sin barra final).
3. Desplegar. El build escribe `frontend/config.js` con esa URL.

## 4. CORS
Volver a Render y completar `FRONTEND_URL` = `https://TU-SITIO.netlify.app`. CORS funciona como una **lista de invitados**: solo esa página puede hablar con la API. Render se reinicia solo.

## 5. Verificación final (lo que va a mirar la revisión)
- [ ] `…/api/salud` responde ok.
- [ ] La página de Netlify carga los servicios (si no, revisar `API_URL` y `FRONTEND_URL`).
- [ ] Crear cuenta → reservar → ver “Mis turnos” → cancelar.
- [ ] Entrar con el admin → ver la agenda.
- [ ] En el repo no hay `.env` ni claves (`git ls-files | grep -i env` solo debe mostrar `.env.example`).

## 6. Actualizar
`git push` → Netlify y Render se reconstruyen solos. Un cambio del cliente empieza en `docs/SPEC.md`.

## 7. Correr todo en tu compu
```bash
cd backend && cp .env.example .env     # completar JWT_SECRET, ADMIN_EMAIL, ADMIN_PASSWORD
npm install && npm start               # http://localhost:3000 sirve API y frontend (SQLite local)
```
