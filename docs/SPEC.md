# SPEC — Lustre Turnos

Sistema de reservas de turnos para **Lustre**, un estudio de uñas (manicuría) con dos profesionales.
Esta spec es la **fuente de verdad**: todo código y todo test salen de acá. Cada regla tiene un número (R01…R26) y
cada test del backend lleva ese número en su nombre. Si el cliente pide un cambio, **empieza en este archivo**.

## 1. Contexto

- **Cliente final**: persona que quiere reservar un turno por internet, sin llamar.
- **Administración**: la dueña del estudio, que ve la agenda, marca asistencias, cobra deudas y cierra días.
- **Servicios** (catálogo inicial; el admin puede editar precios y agregar servicios):

| Servicio | Duración | Precio base |
|---|---|---|
| Esmaltado semipermanente | 60 min | $12.000 |
| Capping gel | 90 min | $18.000 |
| Uñas esculpidas | 120 min | $25.000 |
| Retiro de material | 30 min | $5.000 |

- **Profesionales**: Camila y Lucía (ambas hacen todos los servicios).

## 2. Reglas de negocio

### Calendario y horarios
- **R01** El estudio atiende de **lunes a sábado de 10:00 a 19:00** (hora de Argentina). Los **domingos está cerrado**.
- **R02** Los turnos empiezan en múltiplos de 30 minutos y deben **terminar a más tardar a las 19:00**.
- **R03** El admin puede cerrar días puntuales (feriados). En un día cerrado no se ofrecen ni se aceptan turnos. No se puede cerrar un día que ya tiene turnos confirmados.
- **R04** Todas las reglas usan la **hora local de Argentina (UTC-3)**; la base guarda UTC. El sistema usa un **Reloj** inyectable para poder probar el tiempo sin esperar.

### Reservas
- **R05** La duración la define el servicio; el turno ocupa al profesional durante toda esa duración.
- **R06** Un profesional **no puede tener dos turnos confirmados superpuestos**. Si dos personas reservan a la vez el mismo hueco, **solo una avanza y la otra recibe 409**. Un turno que termina a las 12:00 y otro que empieza a las 12:00 no se superponen.
- **R07** Si la clienta no elige profesional, el sistema asigna el primero libre (orden alfabético).
- **R08** Se reserva con **al menos 2 horas de anticipación** y **hasta 30 días** hacia adelante.
- **R09** Una clienta puede tener como máximo **2 turnos confirmados a futuro**.
- **R10** Una clienta puede tener como máximo **1 turno confirmado por día**.
- **R11** Con una **deuda pendiente** no se puede reservar hasta que se salde.

### Precios
- **R12** El **precio lo calcula el backend** a partir del catálogo; el cliente nunca lo envía. Queda congelado en el turno (cambios posteriores del catálogo no lo afectan).
- **R13** Los **sábados** hay un **recargo del 15%**.
- **R14** Los **martes** hay un **10% de descuento** (“Martes de descuento”).
- **R15** La **clienta frecuente** (5 o más turnos completados) tiene **10% de descuento**.
- **R16** Los descuentos **no se acumulan** (se aplica uno solo, de 10%). El recargo se aplica antes del descuento y el total se redondea al peso.

### Cancelaciones y deudas
- **R17** Cancelar con **24 h o más** de anticipación **no tiene cargo**.
- **R18** Cancelar con **menos de 24 h** (y antes del inicio) genera una **deuda del 50%** del precio del turno.
- **R19** Solo se puede cancelar un turno **confirmado que todavía no comenzó**.
- **R20** Si la clienta **no se presenta** (el admin lo marca como *ausente*), la deuda es del **100%** del precio.
- **R21** Las deudas las **salda el admin** (pago en el local). Al saldarla, la clienta vuelve a poder reservar.

### Usuarios y permisos
- **R22** Registro con nombre (2–60), email único y contraseña de 8 o más caracteres. La contraseña se guarda con hash (scrypt) y **nunca** se devuelve.
- **R23** Hay dos roles: **cliente** y **admin**. La clienta solo ve y cancela **sus** turnos; el admin gestiona todo.
- **R24** El primer admin se crea desde variables de entorno (`ADMIN_EMAIL`, `ADMIN_PASSWORD`), nunca desde el código.
- **R25** El admin solo puede marcar *completado* o *ausente* un turno confirmado **desde que empezó**.
- **R26** Todo error devuelve un **código estable** y un **mensaje en español** (`{"error":{"code","message"}}`).

## 3. Casos de aceptación (ejemplos)

| Caso | Resultado esperado |
|---|---|
| Esmaltado semipermanente un miércoles | $12.000 |
| Mismo servicio un martes | $10.800 (R14) |
| Mismo servicio un sábado | $13.800 (R13) |
| Mismo servicio un sábado, clienta frecuente | $12.420 (recargo y luego 10%) |
| Dos reservas simultáneas al mismo hueco y profesional | una 201, la otra 409 |
| Miércoles 22:30 local | es jueves 01:30 UTC; el sistema lo trata como miércoles |
| Cancelar con 23 h de anticipación sobre un turno de $12.000 | deuda de $6.000 |
| Reservar un domingo | 422 `DIA_CERRADO` |

## 4. Fuera de alcance (v1)
Pagos online, recordatorios por WhatsApp, reprogramación (se cancela y se reserva de nuevo), recuperación de contraseña.
