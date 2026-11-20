# Verificación contra PostgreSQL

Producción usa **PostgreSQL (Neon)** y desarrollo usa SQLite, con el mismo SQL portable. Para no confiar a ciegas en esa equivalencia, la suite completa se ejecutó contra un **PostgreSQL 16 real** (`TEST_DATABASE_URL`).

| Motor | Pruebas | Pasaron | Fallaron |
|---|---|---|---|
| SQLite en memoria | 78 | 78 | 0 |
| PostgreSQL 16 (local) | 78 | 78 | 0 |

Incluye la prueba de **concurrencia** (R06/R07): 5 reservas simultáneas al mismo hueco → una confirmada y cuatro `409`, usando `pg_advisory_xact_lock` dentro de una transacción.

Cómo repetirlo:
```bash
cd backend && npm install
TEST_DATABASE_URL=postgresql://postgres:postgres@localhost:5432/lustre_test npm test
```
El job `postgres` de `.github/workflows/ci.yml` hace lo mismo en cada push (revisar que esté en verde tras subir el repo).

> Nota de alcance: esta verificación se hizo en un entorno sin acceso a la red, por lo que el driver `pg` se reemplazó por un adaptador mínimo sobre `psql` solo para las pruebas. El job de GitHub Actions usa el driver `pg` real y es la confirmación definitiva.
