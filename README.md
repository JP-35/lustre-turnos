# Lustre Turnos

Sistema de **reservas de turnos para un estudio de uñas** con reglas de negocio reales: horarios y feriados, dos profesionales, precios por día (sábado +15%, martes −10%), cliente frecuente, límite de turnos, cancelaciones con deuda, ausencias y cobranza. Proyecto final de **Generación T** (desarrollo AI-First: spec → plan → tareas → tests → código → revisión).

| | |
|---|---|
| 🌐 **App publicada (frontend, Netlify)** | [lustre-turnos.netlify.app](https://lustre-turnos.netlify.app) |
| ⚙️ **API (Render)** | `COMPLETAR: https://….onrender.com/api/salud` |
| 🗄️ **Base de datos** | PostgreSQL en Neon |
| 🔑 **Usuario admin de prueba** | `COMPLETAR (email y clave que cargues en Render)` |

## Qué hace
- **Clienta**: crea cuenta, elige servicio/día/profesional, ve solo horarios libres y el precio final, reserva, cancela y ve sus deudas.
- **Administración**: agenda del día, marca *completado/ausente*, cobra deudas, cierra feriados y edita servicios.
- **Backend** (Node, sin frameworks): aplica **todas** las reglas; el frontend solo muestra.

## Correrlo en tu compu
```bash
cd backend
cp .env.example .env        # completar JWT_SECRET, ADMIN_EMAIL, ADMIN_PASSWORD
npm install
npm start                   # http://localhost:3000  (API + frontend, SQLite local)
npm test                    # 78 pruebas
```

## Documentación (todo dentro del repo)
| Documento | Contenido |
|---|---|
| [`docs/SPEC.md`](docs/SPEC.md) | Especificación con **26 reglas numeradas** (R01–R26) — fuente de verdad |
| [`AGENTS.md`](AGENTS.md) | Reglas para los agentes de IA |
| [`docs/PLAN.md`](docs/PLAN.md) | Plan técnico: arquitectura, tablas, endpoints, riesgos |
| [`docs/TAREAS.md`](docs/TAREAS.md) | Tareas T01–T14, todas hechas, un commit por tarea |
| [`docs/INFORME-PRUEBAS.md`](docs/INFORME-PRUEBAS.md) | Informe de pruebas con trazabilidad regla → test |
| [`docs/RELEVAMIENTO.md`](docs/RELEVAMIENTO.md) | Relevamiento completo: negocio, entrevista, requerimientos, decisiones |
| [`docs/MANUAL-USUARIO.md`](docs/MANUAL-USUARIO.md) · [`docs/MANUAL-ADMIN.md`](docs/MANUAL-ADMIN.md) · [`docs/MANUAL-TECNICO.md`](docs/MANUAL-TECNICO.md) | Manuales |
| [`docs/DEPLOY.md`](docs/DEPLOY.md) | Publicación en Neon + Render + Netlify |
| [`docs/VERIFICACION-POSTGRES.md`](docs/VERIFICACION-POSTGRES.md) | Suite completa verificada contra PostgreSQL 16 |

## Reglas principales (resumen)
Lun–sáb 10–19 h · turnos cada 30 min · sin superposición (simultáneos → 409) · 2 h de anticipación, 30 días de horizonte · máx. 2 turnos a futuro y 1 por día · sábado +15% · martes −10% · frecuente −10% (no se acumulan) · cancelar con ≥ 24 h gratis, con menos 50% de deuda · ausencia 100% · con deuda no se reserva · el precio lo calcula siempre el backend.

## Checklist de entrega
- [x] Spec con cada regla numerada (`docs/SPEC.md`)
- [x] `AGENTS.md` con reglas para agentes
- [x] Tareas marcadas como hechas (`docs/TAREAS.md`)
- [x] Todos los tests pasando (ver informe)
- [x] Un commit por tarea (`git log --oneline`)
- [x] Sin secretos en el repo (`.env` ignorado, solo `.env.example`)
- [x] README
- [x] Informe de pruebas y documento del plan
- [ ] Link público funcionando (completar tras publicar, ver `docs/DEPLOY.md`)

> *Construir un sistema con IA es sencillo; lo difícil es saber con exactitud qué sistema hay que construir.*
