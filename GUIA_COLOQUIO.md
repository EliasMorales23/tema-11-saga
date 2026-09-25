# Tema 3: guion de coloquio de 15 minutos

Este guion aborda **solo mensajería**. Si los dos temas se exponen en los mismos 15 minutos, hay que reducir los tiempos de esta sección y reservar espacio para el tema 11. Los tres integrantes deben comprender y ensayar todos los pasos.

## 0:00 a 3:00 · Problema y conceptos

**Integrante 1 (aprox. 1:30):** «Cuando creamos un pedido, dos procesos diferentes necesitan enterarse: notificaciones para registrar un aviso, y estadísticas para contarlo. Si pedidos llamara directamente a ambos, conocería a todos sus destinatarios. Con publicación/suscripción, pedidos anuncia el hecho `PedidoCreado` en un canal. El canal distribuye el mismo evento a los dos consumidores. Un evento describe algo que ya sucedió; un comando como `CrearPedido` pide ejecutar una acción. `PedidoCreado` significa creado, no pagado ni confirmado».

**Integrante 2 (aprox. 1:30):** «Pedidos es el productor, `PedidoCreado` es el evento, el canal lo distribuye y notificaciones y estadísticas son consumidores. Cada uno realiza su propio trabajo. Conviene cuando varios procesos reaccionan al mismo hecho, por ejemplo avisos, estadísticas o auditoría. El productor no implementa la lógica interna de cada consumidor. Todos deben conocer el contrato del evento: el tipo y los campos que contiene».

## 3:00 a 12:00 · Demostración con contenedores

| Momento | Quién actúa | Acción y explicación |
|---|---|---|
| 3:00–4:00 | Integrante 3 | Mostrar `docker compose ps`. Identificar los cuatro servicios separados y las conexiones de la arquitectura. |
| 4:00–6:00 | Integrante 1 | Ejecutar `docker compose exec -T pedidos node demo.mjs`. Señalar el ID del evento y las dos entregas `OK`. |
| 6:00–7:30 | Integrante 2 | Señalar el aviso y el contador que aumentó en uno. Mostrar logs de canal y consumidores; buscar el mismo ID de evento. |
| 7:30–8:30 | Integrante 3 | Detener notificaciones con `docker compose stop notificaciones`. Explicar que se simula un consumidor no disponible. |
| 8:30–10:30 | Integrante 1 | Ejecutar `docker compose exec -T pedidos node fallo.mjs`. Señalar `ERROR` para notificaciones y `OK` para estadísticas. |
| 10:30–12:00 | Integrante 2 | Mostrar los logs del canal y estadísticas; explicar el límite: el aviso perdido no se reentrega. Integrante 3 vuelve a iniciar notificaciones. |

## 12:00 a 15:00 · Conclusiones, límites y preguntas

**Integrante 3 (aprox. 1 min):** «La primera prueba mostró que un evento `PedidoCreado` llegó a dos consumidores distintos. La segunda mostró que, al detener notificaciones, estadísticas pudo seguir recibiéndolo. Esto demuestra la separación de responsabilidades entre los consumidores. Nuestro canal HTTP es intencionalmente sencillo: espera respuestas y no guarda eventos. Por eso el aviso fallido no se recupera al iniciar el contenedor».

**Integrante 2 (aprox. 1 min):** «En un sistema real deberíamos decidir cómo conservar mensajes, reintentar entregas y evitar que un evento duplicado se procese dos veces. También debemos coordinar el guardado del pedido y la publicación: si falla el canal después de guardar, el pedido existe pero los demás no lo saben. La outbox transaccional es una respuesta a ese problema».

**Integrante 1 (aprox. 1 min):** «En conclusión, pub/sub permite alimentar varios procesos con un mismo hecho sin escribir el trabajo de cada uno dentro del servicio emisor. Lo usaríamos cuando las reacciones son independientes. Sus garantías concretas dependen de la tecnología y de su configuración. Quedamos atentos a las preguntas».

## Preguntas posibles

**¿Por qué esto es pub/sub y no una cola de trabajo?** Porque cada uno de los dos consumidores necesita recibir una copia. En una cola de trabajo, varios trabajadores pueden competir por realizar la misma tarea.

**¿Este canal es un broker de producción?** No. Es un canal didáctico HTTP sin persistencia ni reintentos. Un broker real ofrece mecanismos adicionales que deben configurarse según las garantías buscadas.

**¿Qué pasa si llega dos veces el mismo evento?** Los consumidores usan su ID para no duplicar el aviso ni el conteo durante la vida del proceso. Una solución durable guardaría ese control en almacenamiento persistente.

**¿Qué significa desacoplar al emisor?** Pedidos publica `PedidoCreado` sin conocer la ubicación ni el trabajo interno de notificaciones y estadísticas. Sí conoce el contrato del evento y la dirección del canal.
