import assert from 'node:assert/strict';
const local = process.env.LOCAL_DEMO === '1';
const base = (name, port) => `http://${local ? '127.0.0.1' : name}:${port}`;
const before = await (await fetch(`${base('estadisticas', 8083)}/estado`)).json();
const response = await fetch(`${base('pedidos', 8080)}/pedidos`, {
  method: 'POST', headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ email: 'fallo@ejemplo.com' }),
});
assert.equal(response.status, 201);
const published = await response.json();
const after = await (await fetch(`${base('estadisticas', 8083)}/estado`)).json();
assert.deepEqual(published.entregas.map((e) => e.estado), ['ERROR', 'OK']);
assert.equal(after.pedidosCreados, before.pedidosCreados + 1);
console.log(JSON.stringify({ pedidoId: published.pedido.id, eventoId: published.evento.id,
  entregas: published.entregas, estadisticas: { antes: before.pedidosCreados, despues: after.pedidosCreados } }, null, 2));
console.log('VERIFICADO: estadísticas procesó el evento aunque notificaciones estaba detenido.');
console.log('LÍMITE: el canal no guarda ni reintenta la entrega fallida.');
