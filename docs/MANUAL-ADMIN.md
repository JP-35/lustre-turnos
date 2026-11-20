# Manual de administración

Entrá con el email y la contraseña configurados en `ADMIN_EMAIL` / `ADMIN_PASSWORD`. Vas a ver **Administración** en el menú.

## Agenda
Elegí un día: ves cada turno con horario, clienta, servicio, profesional, precio y estado.
Cuando el turno **ya empezó** aparecen dos botones:
- **Completado**: la clienta vino. Suma para el descuento de clienta frecuente (5 turnos).
- **Ausente**: no vino. Se genera una **deuda del 100%**.
Antes del inicio no se puede cerrar un turno.

## Deudas
Lista de deudas pendientes con clienta, motivo y monto. Cuando cobrás en el local, tocá **Marcar como saldada**; la clienta vuelve a poder reservar.

## Días cerrados
Para feriados o capacitaciones: elegí fecha y motivo y tocá **Cerrar día**. No se puede cerrar un día que ya tiene turnos confirmados (primero hay que reacomodarlos). **Reabrir** lo vuelve a habilitar. Los domingos ya están cerrados siempre.

## Servicios
Cambiá el **precio** o desactivá un servicio con **Guardar**; o agregá uno nuevo (duración en múltiplos de 30 minutos). Los turnos ya reservados **conservan el precio** con el que se tomaron.

## Cambios en las reglas del negocio
Si la dueña pide algo nuevo (por ejemplo, otro descuento): se escribe primero en `docs/SPEC.md`, luego pasa por test en rojo → código en verde → revisión, y se publica con `git push`.
