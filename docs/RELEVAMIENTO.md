# Relevamiento del proyecto — Lustre Turnos

> Regla número uno del curso: **no empezar escribiendo código, sino entendiendo el problema.** Este documento recoge ese entendimiento.
> La dueña del estudio es una **clienta ficticia** creada para este trabajo; las respuestas de la entrevista son el insumo de la spec.

## 1. El negocio
**Lustre** es un estudio de uñas con dos profesionales (Camila y Lucía). Hoy los turnos se agendan por mensajes de WhatsApp e Instagram.

**Dolores detectados**
1. Se pierden mensajes y se pisan turnos (dos clientas para el mismo horario).
2. Muchas cancelaciones de último momento que dejan huecos sin vender.
3. Clientas que no se presentan y no pagan nada por ello.
4. La dueña pierde tiempo respondiendo “¿tenés lugar el jueves?” y recalculando precios (sábados, martes).

**Objetivo**: que la clienta reserve sola, a cualquier hora, con las reglas del estudio aplicadas **automáticamente**, y que la administración tenga la agenda y las deudas en un solo lugar.

## 2. Actores
| Actor | Qué necesita |
|---|---|
| Clienta | Ver servicios y precios, elegir día y horario libre, reservar, cancelar, saber si debe algo |
| Administración (dueña) | Ver la agenda del día, marcar quién vino o faltó, cobrar deudas, cerrar feriados, cambiar precios |
| Profesionales | Que la agenda no tenga superposiciones (se asignan automáticamente) |

## 3. Entrevista de relevamiento (resumen)
| Pregunta | Respuesta | Regla resultante |
|---|---|---|
| ¿Qué días y horarios atienden? | Lunes a sábado de 10 a 19. Domingos cerrado. | R01 |
| ¿Cada cuánto empiezan los turnos? | En punto o y media. Todo tiene que terminar antes de las 19. | R02 |
| ¿Y los feriados? | Los cargo yo cuando los sé. Si ya hay turnos ese día, primero los reacomodo. | R03 |
| ¿Dos clientas pueden reservar a la vez? | No puede pasar que se pisen. Gana la primera. | R06 |
| ¿Eligen profesional? | Pueden elegir o dejar “cualquiera”. | R07 |
| ¿Con cuánta anticipación? | Mínimo 2 horas; no más de un mes adelante. | R08 |
| ¿Cuántos turnos por clienta? | Dos a futuro y uno por día, para que no acaparen. | R09, R10 |
| ¿Precios? | Los del catálogo. Los sábados +15%. Los martes −10% para llenar el día. | R12–R14 |
| ¿Premian a las que vienen seguido? | A partir del quinto turno hecho, 10% menos. No se junta con el martes. | R15, R16 |
| ¿Qué pasa si cancelan? | Con un día o más, nada. Con menos de 24 h, me quedo con la mitad. | R17, R18 |
| ¿Y si no vienen? | Pagan el total. Mientras deban algo, no reservan. | R20, R11 |
| ¿Cómo cobran la deuda? | En el local, yo la marco como saldada. | R21 |
| ¿Quién puede ver qué? | Cada clienta lo suyo; yo todo. | R23 |

## 4. Requerimientos
**Funcionales**: registro y acceso · catálogo · disponibilidad por día · reserva · mis turnos · cancelación · deudas · agenda del día · completar/ausente · cobro de deudas · días cerrados · edición de servicios.

**No funcionales**
- **Disponibilidad**: accesible desde internet, sin instalar nada (Netlify + Render + Neon).
- **Seguridad**: contraseñas con scrypt, tokens firmados, permisos por rol, secretos fuera del repo, CORS restringido, el backend no confía en el frontend.
- **Consistencia**: sin turnos superpuestos aun con pedidos simultáneos.
- **Usabilidad**: celular primero, mensajes de error en español y accionables, estados de carga/error/vacío.
- **Mantenibilidad**: capas separadas, reglas en un solo lugar, un test por regla, cambios que empiezan en la spec.
- **Zona horaria**: todo en hora de Argentina (R04).

## 5. Alcance
**Dentro**: lo anterior. **Fuera (v1)**: pagos online, WhatsApp, reprogramar, recuperar contraseña, múltiples sucursales.

## 6. Decisiones de diseño cerradas
| Tema | Decisión | Motivo |
|---|---|---|
| Deuda por cancelación tardía | 50% del precio | Pedido de la dueña; compensa el hueco sin ser punitivo |
| Descuentos | No se acumulan | Evita precios inesperados; regla simple de explicar |
| Orden de cálculo | Recargo y después descuento | Resultado determinista y testeable |
| Reprogramar | No existe: se cancela y se reserva | Mantiene las reglas de cancelación simples (KISS) |
| Primer admin | Variables de entorno | No hay contraseñas en el código (R24) |
| Frontend | HTML/JS sin build | Menos piezas que fallen al publicar; el backend es lo importante |

## 7. Riesgos y supuestos
- Se asume **una sola sede** y que ambas profesionales hacen todos los servicios.
- Se asume Argentina sin horario de verano (UTC-3 fijo).
- Render gratuito duerme el servidor: se informa en pantalla.
- Mejoras futuras: límite de intentos de login, recordatorios por correo, recuperación de contraseña.

## 8. Glosario
**Turno**: reserva de una profesional por una duración. **Hueco**: intervalo libre. **Deuda**: monto que la clienta debe al estudio por cancelar tarde o faltar. **Frecuente**: clienta con 5+ turnos completados. **Reloj**: componente que dice “qué hora es” para el club (y se puede fijar en tests).
