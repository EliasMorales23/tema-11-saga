import assert from 'node:assert/strict';

const local = process.env.LOCAL_DEMO === '1';
const base = (name, port) => `http://${local ? '127.0.0.1' : name}:${port}`;
async function get(name, port) {
  const response = await fetch(`${base(name, port)}/estado`);
  if (!response.ok) throw new Error(`${name}: HTTP ${response.status}`);
  return response.json();
}
async function ready() {
  for (let i = 0; i < 40; i++) {
    try { await Promise.all([get('pedidos', 8080), get('canal', 8081), get('notificaciones', 8082), get('estadisticas', 8083)]); return; }
    catch { await new Promise((resolve) => setTimeout(resolve, 250)); }
  }
  throw new Error('Los cuatro servicios no están listos');
}

await ready();
const before = await get('estadisticas', 8083);
const response = await fetch(`${base('pedidos', 8080)}/pedidos`, {
  method: 'POST', headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ email: 'alumna@ejemplo.com' }),
});
assert.equal(response.status, 201);
const published = await response.json();
const aviso = await get('notificaciones', 8082);
const estadisticas = await get('estadisticas', 8083);
assert.deepEqual(published.entregas.map((e) => e.estado), ['OK', 'OK']);
assert.ok(aviso.mensajes.some((m) => m.eventoId === published.evento.id));
assert.equal(estadisticas.pedidosCreados, before.pedidosCreados + 1);

console.log(JSON.stringify({ pedido: published.pedido, evento: published.evento,
  entregas: published.entregas, aviso: aviso.mensajes.find((m) => m.eventoId === published.evento.id),
  estadisticas: { antes: before.pedidosCreados, despues: estadisticas.pedidosCreados } }, null, 2));
console.log('VERIFICADO: el mismo evento llegó a dos consumidores independientes.');
