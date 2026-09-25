# Monólogo · Tema 11: Saga y transacciones distribuidas

Alineado con el PPTX *Mensajería y consistencia en sistemas distribuidos* (**diapositivas 8 a 13**, la Parte 2). Las diapositivas 1–7 son de publicación/suscripción y las expone otro integrante.

Está escrito para decirlo en voz alta, como hablando con compañeros de la tecnicatura. No lo lean: entiendan la idea de cada bloque y díganlo con sus palabras.

**Tiempos orientativos** (del total de 15 min, 3 integrantes): explicación conceptual ≈ 3 min · demo ≈ 9 min · cierre ≈ 3 min. Las marcas de abajo son para el tema de la saga; si el tiempo aprieta, recorten los ⏱ opcionales.

---

## La idea en una frase (para que la tengan clara antes de hablar)

> Una compra toca **tres servicios con estados separados**. No existe un "rollback global". Entonces, cada paso que hace efecto tiene definida una **acción compensatoria**, y si algo falla más adelante, un **orquestador** las ejecuta **en orden inverso**.

---

## Diapositiva 8 · Portada de la Parte 2 (≈ 15 s)

> «Ahora cambiamos de problema. Hasta acá vimos cómo *avisar* que pasó algo. Ahora vamos a ver qué pasa cuando una compra avanza por varios servicios y se corta a mitad de camino.»

---

## Diapositiva 9 · Una compra, varios estados (≈ 45 s)

**En pantalla:** Reservar stock (Inventario ✔) → Registrar cobro (Pagos ✔) → Confirmar pedido (Pedidos ✘).

> «Pensemos en una tienda online. Para completar una compra no alcanza con crear el pedido. Inventario tiene que reservar el producto, Pagos tiene que registrar el cobro y Pedidos tiene que confirmar la compra.
>
> Si los tres pasos funcionan, perfecto. Pero ¿qué pasa si ya reservamos el stock, ya cobramos, y **falla la confirmación**? Ahora tenemos un producto reservado y un cobro registrado para una compra que nunca terminó. Nadie lo va a deshacer solo. Esa es la pregunta central: **¿cómo coordinamos varios servicios cuando una operación queda a medias?**»

---

## Diapositiva 10 · Transacción local vs. operación distribuida (≈ 1 min)

**En pantalla:** Inventario, Pagos y Pedidos, cada uno con su propia transacción local.

> «Primero, qué es una transacción local: agrupa cambios dentro de **un solo sistema**, por ejemplo una base de datos. O se confirman todos juntos o se revierten todos. Eso lo conocen de bases de datos.
>
> El problema es que acá cada servicio tiene *su propio* estado y *su propia* transacción. La compra atraviesa los tres, pero **no existe una transacción única que los cubra**. Si Pedidos hace rollback, ese rollback solo afecta a Pedidos: no libera la reserva de Inventario ni devuelve la plata de Pagos.
>
> Por eso no alcanza con decir "si falla, hacemos rollback": hay que decidir *dónde* y *qué acciones concretas* se van a deshacer.»

**Si preguntan:** «¿Y no se puede usar una transacción distribuida tipo 2PC?» → Existe, pero bloquea recursos, exige que todos los participantes la soporten y escala mal con servicios independientes. La saga es la alternativa que se usa en microservicios.

---

## Diapositiva 11 · Qué es una saga y cómo compensa (≈ 1 min 30 s)

**En pantalla:** recorrido normal 1-2-3 y compensaciones 1-2-3 en orden inverso.

> «Una **saga** es una secuencia de pasos de negocio. Cada paso que deja un efecto tiene definida una **acción compensatoria**, o sea, qué hacer si algo posterior falla.
>
> En nuestro ejemplo:
> - si reservamos stock, la compensación es **liberar la reserva**;
> - si cobramos, la compensación es **reembolsar**.
>
> Cuando falla la confirmación, las compensaciones se ejecutan en **orden inverso** al que se hizo: primero reembolsamos, después liberamos el stock, y por último el pedido queda cancelado.
>
> Un detalle importante: **reembolsar no borra el cobro**. Es una operación de negocio nueva. En un sistema real quedaría el registro del cobro original *y* el del reembolso. No es un rollback, es *otra operación que compensa la anterior*.»

Tabla para tener a mano:

| Paso normal | Compensación | Estado final del caso B |
|---|---|---|
| 1. Reservar stock | Liberar la reserva | reserva liberada |
| 2. Registrar cobro | Reembolsar | pago `REEMBOLSADO` |
| 3. Confirmar pedido (falla) | Cancelar pedido | pedido `CANCELADO` |

---

## Diapositiva 12 · Orquestación, coreografía, usos y límites (≈ 1 min 30 s)

> «Hay dos formas de coordinar una saga.
>
> En la **orquestación**, un coordinador central conoce todos los pasos y decide cuándo avanzar, reintentar o compensar. En la **coreografía**, no hay jefe: cada servicio reacciona a eventos que publican los otros, y ahí es donde se conecta con el tema de publicación/suscripción.
>
> Nosotros elegimos **orquestación**: el servicio de Pedidos pide la reserva, pide el cobro y, si algo falla, decide qué compensaciones ordenar. La ventaja es que toda la lógica queda en un solo lugar y es fácil de seguir; el costo es que ese coordinador tiene mucha responsabilidad.
>
> ¿Cuándo conviene? Cuando una operación importante cruza servicios con estado propio: una compra, una reserva de viaje, un alta que toca varios sistemas.
>
> ¿Qué necesita una saga real? Dos cosas: **estado persistente**, para que si el orquestador se reinicia sepa en qué paso estaba, e **idempotencia**, para que repetir un mensaje no duplique el efecto, por ejemplo no cobrar dos veces.
>
> Y los **límites**, para ser honestos:
> 1. La **compensación también puede fallar**: ¿y si Pagos no responde cuando pedimos el reembolso?
> 2. Un **timeout genera incertidumbre**: no sabemos si Pagos cobró o no antes de reintentar.
> 3. Hay **estados intermedios visibles**: durante un rato el producto está reservado aunque la compra no esté confirmada. Una saga **no da aislamiento** como una transacción única.
> 4. **Algunos efectos no se pueden deshacer**: un mail ya enviado no se "des-envía", solo se puede mandar una rectificación.»

---

## DEMO con Docker (≈ 9 min · el corazón de la exposición)

### Antes de correr nada (≈ 45 s) — decir esto

> «Tenemos tres contenedores: **pedidos**, **inventario** y **pagos**. Cada uno es un proceso Node aparte con su propio estado en memoria, y se hablan por HTTP usando los nombres que les da Docker Compose. Pedidos es el orquestador.
>
> Vamos a hacer dos compras. La primera sale bien. En la segunda **forzamos una falla justo al confirmar**, después de haber reservado y cobrado. Y vamos a mirar qué pasa con el pedido, el pago y el stock.»

### Paso 1 · Levantar los contenedores (≈ 1 min)

```bash
docker compose up --build -d
docker compose ps
```

> «Acá vemos los tres contenedores corriendo. Solo pedidos expone un puerto al host; inventario y pagos son internos de la red de Compose.»

### Paso 2 · Ejecutar la demo (≈ 3 min)

```bash
docker compose exec -T pedidos node demo.mjs
```

**Caso A: compra exitosa.** Señalar en la salida:

> «Pedido `CONFIRMADO`. El stock pasó de **5 a 4**: la reserva quedó firme porque la compra se completó.»

**Caso B: falla al confirmar.** Señalar en la salida:

> «Acá mandamos `failConfirmation: true`. La saga reservó, cobró, y al confirmar falló. Resultado: pedido **`CANCELADO`**, pago **`REEMBOLSADO`**, y el stock volvió a **4** —o sea, antes y después del caso B es el mismo valor—. La reserva de este pedido ya no existe.
> El script además **verifica todo automáticamente con `assert`**; si algo no cumpliera, terminaría con error.»

### Paso 3 · Mostrar el orden de las acciones en los logs (≈ 2 min)

```bash
docker compose logs --no-color --tail=45 pedidos inventario pagos
```

> «Busquemos el pedido del caso B. En los logs de **pedidos** vemos la secuencia: *saga iniciada → 1 stock reservado → 2 pago registrado → fallo simulado al confirmar; comenzar compensación → compensación reembolsar pago OK → compensación liberar stock OK → estado final CANCELADO.*
>
> Y del lado de los otros servicios: inventario dice `reservado` y después `liberado`; pagos dice `cobrado` y después `reembolsado`. Fíjense que **el reembolso viene antes que la liberación**: compensamos en orden inverso.»

Tip: `docker compose logs` mezcla los servicios, así que las líneas de los tres se intercalan. Concéntrense primero en el log de `pedidos` (es la "película" de la saga) y después confirmen con los otros.

### Paso 4 · Mostrar el estado final de cada servicio (≈ 1 min 30 s) *(opcional pero muy convincente)*

```bash
docker compose exec -T pedidos node -e "for (const [n,p] of [['inventario',8091],['pagos',8092],['pedidos',8090]]) fetch('http://'+n+':'+p+'/estado').then(r=>r.json()).then(j=>console.log(n, JSON.stringify(j)))"
```

> «Esto le pregunta el estado a cada servicio por separado. Inventario: `available: 4` y una sola reserva, la del pedido confirmado. Pagos: un pago `COBRADO` y otro `REEMBOLSADO`. Pedidos: uno `CONFIRMADO` y uno `CANCELADO`. Los tres servicios terminaron coherentes entre sí, **sin ninguna transacción global**.»

### Paso 5 · Mostrar el código clave (≈ 1 min) *(si preguntan o sobra tiempo)*

Abrir [`app.mjs`](app.mjs), función `runSaga`. Es corta, alcanza con esto:

> «Esta es toda la saga. Cada vez que un paso sale bien, **apilamos su compensación** en la lista `completed`. Si algo tira error, el `catch` recorre esa lista **al revés** (`completed.reverse()`) y ejecuta cada compensación. Si alguna compensación falla, el pedido queda en `REQUIERE_INTERVENCION` en vez de `CANCELADO`.»

Explicación del código en 5 líneas (para entenderlo ustedes):

1. `post(.../reservar)` → si va bien, se guarda `['liberar stock', ...]` en `completed`.
2. `post(.../cobrar)` → si va bien, se guarda `['reembolsar pago', ...]`.
3. `if (failConfirmation) throw ...` → **simula la falla del último paso**.
4. `catch` → recorre `completed.reverse()` = reembolsar, después liberar.
5. Estado final: `CANCELADO` (todo compensado) o `REQUIERE_INTERVENCION` (una compensación falló).

### Para reiniciar y repetir la demo

```bash
docker compose down
docker compose up --build -d
```

> El stock vive en memoria: al reiniciar vuelve a 5.

**Plan B si falla la demo en vivo:** mostrar los archivos de [`evidencias/`](evidencias/): `docker-servicios.txt` y `docker-logs.txt` (capturados corriendo en Docker) y `ejecucion-local.log`.

---

## Diapositiva 13 · Conclusión técnica (≈ 1 min 30 s para el tema de saga)

> «Para cerrar: la compra necesitaba acciones en tres servicios. En el caso exitoso, el pedido se confirmó y conservó su cobro y su reserva. En el caso fallido, la confirmación no se completó después de reservar y cobrar; la saga pidió el reembolso, liberó el stock, y el pedido quedó cancelado sin dejar efectos colgados.
>
> **La consistencia acá no es "todo o nada" automático: se diseña.** Hay que decidir los estados, los responsables y qué hacer ante cada fallo. Y no hay que asumir atomicidad global.
>
> Sobre nuestra demo, con honestidad: los servicios guardan datos **en memoria** y el pago es **simulado**. Muestra la coordinación y el orden de las compensaciones, pero no es un sistema de producción. Para uno real necesitaríamos **persistir el progreso de la saga, evitar operaciones duplicadas con idempotencia y resolver fallos durante las propias compensaciones**.
>
> Y para conectar con el otro tema: son problemas **distintos y complementarios**. Publicación/suscripción distribuye información; la saga coordina una operación. De hecho, una saga coreografiada usaría justamente eventos para avanzar.»

---

## Cómo se relacionan los dos temas (pregunta que seguro les hacen)

| | Pub/Sub y eventos | Saga |
|---|---|---|
| Pregunta | ¿Cómo aviso que pasó algo? | ¿Qué hago si un paso falla a mitad? |
| Ejemplo | `PedidoCreado` → Notificaciones y Estadísticas | reservar → cobrar → confirmar |
| Se conectan en… | La saga **coreografiada** avanza publicando y escuchando eventos (`StockReservado`, `PagoCobrado`, `PagoFallido`…) | La saga **orquestada** (la nuestra) usa comandos directos, pero podría publicar eventos de resultado |

Frase útil: *«Pub/sub es el canal; la saga es la lógica de negocio que decide qué hacer cuando algo sale mal.»*

---

## Preguntas probables de la cátedra

**¿Por qué no alcanza un rollback de base de datos?** Porque cada servicio controla su propio estado; un rollback local no revierte lo que hicieron los otros.

**¿Por qué se reembolsa antes de liberar el stock?** Se compensa en orden inverso al avance: lo último que se hizo se deshace primero.

**¿El reembolso es un rollback?** No. Es una nueva operación de negocio; el cobro original existió y se conserva en el historial.

**¿Qué pasa si falla el reembolso?** En el ejemplo el pedido queda `REQUIERE_INTERVENCION`. En producción: reintentos con espera, alertas y un procedimiento manual.

**¿Qué pasa si se cae el orquestador a mitad de la saga?** En nuestra demo se pierde todo (memoria). En un sistema real se guarda el estado de la saga en una base de datos para retomarla.

**¿Qué pasa si un servicio cobra pero la respuesta nunca llega (timeout)?** No sabemos si cobró. Hay que consultar el estado antes de reintentar, y usar identificadores idempotentes (acá el `id` del pedido) para que repetir no duplique el cobro. En nuestro código `/cobrar` y `/reservar` ya son idempotentes por ese `id`.

**¿Por qué orquestación y no coreografía?** Toda la lógica queda en un lugar, es fácil de seguir y de depurar. Contra: el orquestador es un punto de responsabilidad central.

**¿Una saga garantiza consistencia inmediata?** No, garantiza **consistencia eventual**: mientras corre, hay estados intermedios visibles.

**¿Por qué el pago es simulado?** Porque lo que se demuestra es la coordinación y la compensación, no una pasarela de pagos real.

**¿Qué mejorarían?** Persistir el estado de la saga, reintentos con backoff para compensaciones, un log de auditoría (cobro y reembolso como registros separados) y tests de fallo en otros pasos.

---

## Glosario rápido

- **Transacción local:** cambios agrupados dentro de un solo sistema; se confirman o se revierten juntos.
- **Saga:** secuencia de pasos locales con compensaciones para tratar fallos parciales.
- **Acción compensatoria:** operación de negocio que contrarresta el efecto de un paso ya hecho.
- **Orquestación:** un coordinador central dirige la saga.
- **Coreografía:** los participantes reaccionan a eventos, sin coordinador central.
- **Idempotencia:** repetir una operación no produce efectos adicionales.
- **Consistencia eventual:** el sistema llega a un estado coherente, pero pasa por estados intermedios.
