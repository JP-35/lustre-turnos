# Informe de pruebas — Lustre Turnos

Generado automáticamente con `npm run informe` el 20 de noviembre de 2026 a las 7:27 p. m. (hora de Argentina). No se edita a mano: se vuelve a generar.

## 1. Resultado general

| Métrica | Valor |
|---|---|
| Pruebas ejecutadas | **78** |
| Pasaron | **78** |
| Fallaron | **0** |
| Reglas de la spec con al menos una prueba | **26 de 26** |
| Motor de base usado en esta corrida | SQLite en memoria |
| Entorno | Node v22.23.5, `node:test` (sin dependencias de testing) |

**Estado: ✔ TODOS LOS TESTS PASAN y todas las reglas tienen respaldo**

## 2. Estrategia
- **Rojo → verde → refactor** por tarea (ver `docs/TAREAS.md`, un commit por tarea).
- **Unitarias** de reglas puras (`reglas.test.js`, `reloj.test.js`): horarios, precios, deuda, zona horaria.
- **De servicio** con base real en memoria y Reloj fijo (`reservas`, `cancelacion`, `admin`, `disponibilidad`, `auth`).
- **De concurrencia**: 5 reservas simultáneas al mismo hueco → exactamente una confirmada, cuatro 409 (R06, R07).
- **De API HTTP real** (`http.test.js`): servidor levantado, `fetch`, permisos, CORS, formato de errores, archivos estáticos.
- **Extremo a extremo** en navegador real (Playwright, `e2e/e2e.mjs`).
- El **Reloj** se maneja “a control remoto”: se fija una fecha, se reserva, se adelanta y se cancela, sin esperar un día.
- **Casos extremos** cubiertos: bordes exactos (24 h, 2 h, 19:00, 30 días), días cerrados, deuda pendiente, duplicados, JSON roto, token alterado/vencido, intentos de enviar el precio desde el cliente.

## 3. Trazabilidad: regla → pruebas

| Regla | Descripción | Pruebas | Estado |
|---|---|---|---|
| R01 | El estudio atiende de lunes a sábado de 10:00 a 19:00 (hora de Argentina). Los domingos está ce… | 5 | ✔ pasa |
| R02 | Los turnos empiezan en múltiplos de 30 minutos y deben terminar a más tardar a las 19:00. | 5 | ✔ pasa |
| R03 | El admin puede cerrar días puntuales (feriados). En un día cerrado no se ofrecen ni se aceptan … | 5 | ✔ pasa |
| R04 | Todas las reglas usan la hora local de Argentina (UTC-3); la base guarda UTC. El sistema usa un… | 5 | ✔ pasa |
| R05 | La duración la define el servicio; el turno ocupa al profesional durante toda esa duración. | 3 | ✔ pasa |
| R06 | Un profesional no puede tener dos turnos confirmados superpuestos. Si dos personas reservan a l… | 5 | ✔ pasa |
| R07 | Si la clienta no elige profesional, el sistema asigna el primero libre (orden alfabético). | 2 | ✔ pasa |
| R08 | Se reserva con al menos 2 horas de anticipación y hasta 30 días hacia adelante. | 5 | ✔ pasa |
| R09 | Una clienta puede tener como máximo 2 turnos confirmados a futuro. | 1 | ✔ pasa |
| R10 | Una clienta puede tener como máximo 1 turno confirmado por día. | 1 | ✔ pasa |
| R11 | Con una deuda pendiente no se puede reservar hasta que se salde. | 2 | ✔ pasa |
| R12 | El precio lo calcula el backend a partir del catálogo; el cliente nunca lo envía. Queda congela… | 5 | ✔ pasa |
| R13 | Los sábados hay un recargo del 15%. | 3 | ✔ pasa |
| R14 | Los martes hay un 10% de descuento (“Martes de descuento”). | 3 | ✔ pasa |
| R15 | La clienta frecuente (5 o más turnos completados) tiene 10% de descuento. | 3 | ✔ pasa |
| R16 | Los descuentos no se acumulan (se aplica uno solo, de 10%). El recargo se aplica antes del desc… | 3 | ✔ pasa |
| R17 | Cancelar con 24 h o más de anticipación no tiene cargo. | 2 | ✔ pasa |
| R18 | Cancelar con menos de 24 h (y antes del inicio) genera una deuda del 50% del precio del turno. | 4 | ✔ pasa |
| R19 | Solo se puede cancelar un turno confirmado que todavía no comenzó. | 1 | ✔ pasa |
| R20 | Si la clienta no se presenta (el admin lo marca como *ausente*), la deuda es del 100% del preci… | 3 | ✔ pasa |
| R21 | Las deudas las salda el admin (pago en el local). Al saldarla, la clienta vuelve a poder reserv… | 3 | ✔ pasa |
| R22 | Registro con nombre (2–60), email único y contraseña de 8 o más caracteres. La contraseña se gu… | 7 | ✔ pasa |
| R23 | Hay dos roles: cliente y admin. La clienta solo ve y cancela sus turnos; el admin gestiona todo… | 4 | ✔ pasa |
| R24 | El primer admin se crea desde variables de entorno (`ADMIN_EMAIL`, `ADMIN_PASSWORD`), nunca des… | 1 | ✔ pasa |
| R25 | El admin solo puede marcar *completado* o *ausente* un turno confirmado desde que empezó. | 2 | ✔ pasa |
| R26 | Todo error devuelve un código estable y un mensaje en español (`{"error":{"code","message"}}`).… | 6 | ✔ pasa |

## 4. Detalle de cada prueba

- ✔ R23 la agenda del día muestra clienta, servicio y profesional
- ✔ R25 solo se puede cerrar un turno desde que empezó
- ✔ R20 la ausencia genera deuda del 100% y R21 saldarla libera para reservar
- ✔ R21 una deuda no se salda dos veces ni si no existe
- ✔ R15 cinco turnos completados convierten a la clienta en frecuente
- ✔ R03 el admin cierra y reabre días; no puede cerrar uno con turnos confirmados
- ✔ R12 el admin edita precios y servicios sin alterar los turnos ya tomados
- ✔ R26 el catálogo valida precio y duración
- ✔ R22 registrar crea la cuenta, devuelve token y nunca expone el hash
- ✔ R22 valida nombre, email y contraseña con mensajes en español (R26)
- ✔ R22 el email es único sin distinguir mayúsculas
- ✔ R22 entrar con credenciales correctas y rechazar las incorrectas con el mismo mensaje
- ✔ R22 el token se valida, no se puede alterar y vence a los 7 días
- ✔ R22 verificarToken rechaza un payload vencido
- ✔ R24 el admin inicial se crea desde el entorno y es idempotente
- ✔ R17 cancelar con 24 h o más no genera deuda y libera el hueco
- ✔ R18 cancelar con 23 h genera deuda del 50% ($6.000 sobre $12.000)
- ✔ R18 cancelar con una hora de anticipación deja deuda del 50% (caso de la clase)
- ✔ R11 R18 tras una cancelación tardía queda bloqueada para reservar hasta saldar
- ✔ R19 no se puede cancelar un turno ya comenzado, ya cancelado ni ajeno
- ✔ R23 misTurnos lista solo los propios e indica si la cancelación sería sin cargo
- ✔ R05 la semilla carga el catálogo, las profesionales y los feriados
- ✔ la semilla es idempotente (no duplica al correr dos veces)
- ✔ los parámetros $n se respetan aunque se repitan o cambien de orden
- ✔ una transacción con error hace rollback completo
- ✔ R05 el catálogo expone duración y precio de cada servicio
- ✔ R01 R02 un miércoles ofrece huecos de 10:00 a 18:00 cada 30 min para un servicio de 60 min
- ✔ R02 un servicio de 120 min no puede empezar después de las 17:00
- ✔ R01 el domingo figura cerrado y sin huecos
- ✔ R03 un feriado cargado figura cerrado
- ✔ R08 hoy solo se ofrecen horarios con 2 horas de anticipación (lunes 10:00 → desde las 12:00)
- ✔ R08 el pasado no tiene huecos y más allá de 30 días tampoco
- ✔ R12 R13 R14 la respuesta incluye el precio del día calculado por el backend
- ✔ R06 un hueco ocupado por un turno confirmado deja de ofrecerse a esa profesional
- ✔ R26 entradas inválidas devuelven errores claros
- ✔ API: salud responde con la hora del Reloj (R04)
- ✔ R22 R26 registro, entrada y /yo funcionan por HTTP y no filtran el hash
- ✔ R23 sin sesión no se reserva (401) y un token falso tampoco
- ✔ flujo completo por HTTP: disponibilidad → reservar → mis turnos → cancelar sin cargo
- ✔ R06 dos reservas HTTP simultáneas al mismo hueco: una 201 y la otra 409
- ✔ R23 un cliente no entra a rutas de admin (403) y un admin sí
- ✔ R20 R21 R25 el admin marca ausencia por HTTP, queda deuda y la salda
- ✔ R03 R12 el admin cierra días y edita servicios por HTTP
- ✔ R26 errores: JSON inválido 400, ruta inexistente 404 y formato estable {error:{code,message}}
- ✔ CORS: solo el origen de FRONTEND_URL recibe cabeceras de permiso y el preflight responde 204
- ✔ estático: sirve el frontend y bloquea salir de la carpeta
- ✔ R01 de lunes a sábado se atiende y el domingo no
- ✔ R01 antes de las 10:00 está fuera de horario
- ✔ R02 los turnos empiezan en múltiplos de 30 minutos
- ✔ R02 debe terminar a las 19:00 como máximo (borde exacto permitido)
- ✔ R03 un día cerrado por el admin no admite turnos
- ✔ R08 se exige 2 horas de anticipación (borde exacto permitido)
- ✔ R08 el horizonte máximo es de 30 días
- ✔ R06 intervalos pegados no se superponen; los que se pisan, sí
- ✔ R12 un miércoles se cobra el precio de catálogo
- ✔ R13 los sábados hay 15% de recargo
- ✔ R14 los martes hay 10% de descuento
- ✔ R15 la clienta frecuente tiene 10% de descuento
- ✔ R16 los descuentos no se acumulan (martes + frecuente = un solo 10%)
- ✔ R16 el recargo va antes del descuento y se redondea al peso
- ✔ R17 con 24 h exactas no hay cargo; con 23 h sí
- ✔ R18 la cancelación tardía genera deuda del 50% y R20 la ausencia del 100%
- ✔ R04 el miércoles 22:30 local es jueves 01:30 UTC y el sistema lo trata como miércoles
- ✔ R04 el domingo 22:00 local todavía pertenece al domingo (no al lunes UTC)
- ✔ R04 el Reloj se maneja a control remoto: fijar y adelantar
- ✔ R04 fechaValida rechaza fechas imposibles
- ✔ R05 R07 una reserva válida se confirma, bloquea la duración y asigna la primera profesional libre
- ✔ R06 no se pisan turnos de la misma profesional, pero sí pueden quedar pegados
- ✔ R06 con dos reservas simultáneas al mismo hueco y profesional, solo una avanza y la otra recibe 409
- ✔ R07 con tres reservas simultáneas sin elegir profesional hay lugar para dos (Camila y Lucía)
- ✔ R01 R02 R03 R08 los horarios inválidos se rechazan con 422 y código estable
- ✔ R09 como máximo 2 turnos confirmados a futuro
- ✔ R10 como máximo 1 turno confirmado por día
- ✔ R11 con deuda pendiente no se puede reservar
- ✔ R12 el precio lo calcula el backend: un precio enviado por el cliente se ignora y queda congelado
- ✔ R13 R14 sábado con recargo y martes con descuento en la reserva real
- ✔ R15 R16 la clienta frecuente (5 completados) paga 10% menos y el sábado combina recargo y descuento
- ✔ R26 servicio, profesional y fecha inexistentes devuelven errores claros

## 5. Prueba extremo a extremo (navegador)
```
✔ inicio muestra hero y 4 servicios
✔ reservar sin sesión redirige a entrar
✔ registro y vuelta a reservar
✔ reserva confirmada con precio calculado por el backend
✔ cancelación con más de 24 h: sin cargo
✔ admin ve la agenda con la clienta
✔ admin cierra un día
✔ admin cambia un precio
✔ móvil sin desborde horizontal
✔ sin errores de JavaScript en consola
E2E OK
```
Capturas en `e2e/capturas/`.

## 6. Límites conocidos y cómo se cubren
- Esta corrida usó **SQLite en memoria**. El mismo conjunto de pruebas corre contra **PostgreSQL** definiendo `TEST_DATABASE_URL`; el workflow de GitHub Actions (`.github/workflows/ci.yml`, job `postgres`) lo ejecuta en cada push. Conviene mirar que ese job esté en verde una vez subido el repo.
- Sin límite de intentos de login (mejora futura, ver `docs/PLAN.md`).
- El plan gratuito de Render se duerme; la primera solicitud tarda ~30 s (el frontend lo avisa).
