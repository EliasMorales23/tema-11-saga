# Tema 11: guion de coloquio

Esta es una práctica **individual del tema 11** para estudiar y ensayar. El coloquio final de 15 minutos debe cubrir **también el tema 3**, por lo que el equipo tendrá que condensar ambos bloques. Los tres integrantes deben conocer el código, las decisiones y los límites.

## 0:00–3:00 · Problema y conceptos

**Integrante 1 (aprox. 1 min):** «Una compra requiere reservar stock, registrar el pago y confirmar el pedido. Si falla confirmar después de los dos pasos anteriores, quedan una reserva y un cobro para una compra que no terminó. Cada servicio controla su propio estado. Un rollback hecho únicamente en pedidos no revierte lo que hicieron inventario y pagos».

**Integrante 2 (aprox. 1 min):** «Una saga divide la operación en pasos y define compensaciones para los pasos ya completados. Si falla la confirmación, el orquestador pide primero un reembolso y después libera la reserva. Reembolsar es una operación nueva; el cobro ocurrió. La saga busca un estado final de negocio válido».

**Integrante 3 (aprox. 1 min):** «Elegimos orquestación: pedidos conoce y dirige el orden. La otra variante es coreografía, donde los participantes reaccionan a eventos. Aquí mostramos la lógica de coordinación de la saga por separado, sin involucrar el ejemplo de publicación/suscripción».

## 3:00–12:00 · Ejecución y evidencia

| Minutos | Quién | Qué mostrar y explicar |
|---|---|---|
| 3:00–4:00 | Integrante 3 | `docker compose ps`: tres contenedores independientes. |
| 4:00–6:00 | Integrante 1 | Ejecutar `docker compose exec -T pedidos node demo.mjs`. En caso A, pedido confirmado, pago cobrado y una unidad reservada. |
| 6:00–8:00 | Integrante 2 | En caso B, mostrar que `failConfirmation` simula el fallo final, después de reservar y cobrar. |
| 8:00–10:00 | Integrante 3 | Mostrar pedido `CANCELADO`, pago `REEMBOLSADO` y stock antes = stock después del caso B. |
| 10:00–12:00 | Integrantes 1 y 2 | `docker compose logs --no-color --tail=45 pedidos inventario pagos`. Señalar el orden de reserva, cobro, fallo, reembolso y liberación. |

## 12:00–15:00 · Conclusiones, límites y preguntas

**Integrante 1:** «La evidencia demuestra que la operación exitosa conserva el cobro y la reserva. En la que falla al confirmar, el orquestador ejecuta compensaciones y el pedido termina cancelado».

**Integrante 2:** «La compensación no es un rollback global. El reembolso puede tardar o fallar. Si una llamada tiene timeout, debemos averiguar si el servicio ejecutó el paso antes de repetirlo. Por eso importan la persistencia, la idempotencia y la conciliación».

**Integrante 3:** «Nuestra implementación usa estados en memoria y pagos simulados. Muestra el patrón y el orden de compensación, pero no transacciones durables de producción. Quedamos atentos a las preguntas».

## Preguntas probables

**¿Por qué un rollback de base de datos no alcanza?** Porque cada servicio controla su estado; un rollback local no revierte automáticamente los estados de los otros servicios.

**¿Por qué se reembolsa antes de liberar el stock?** Se compensa en orden inverso al avance normal: primero se trata el paso de pagos, después el de inventario.

**¿Es el reembolso un rollback?** No. Es una nueva operación de negocio; el cobro original existió y debe conservarse en el historial.

**¿Qué pasa si falla reembolsar?** El pedido queda `REQUIERE_INTERVENCION` en el ejemplo. Un sistema real necesita reintentos, alertas y seguimiento.

**¿Qué variante eligieron?** Orquestación: pedidos es el coordinador. Coreografía haría avanzar a los participantes mediante eventos.
