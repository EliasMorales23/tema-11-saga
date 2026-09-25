import assert from 'node:assert/strict';

const local = process.env.LOCAL_DEMO === '1';
const base = (name, port) => `http://${local ? '127.0.0.1' : name}:${port}`;
async function get(name, port) {
  const response = await fetch(`${base(name, port)}/estado`);
  if (!response.ok) throw new Error(`${name}: HTTP ${response.status}`);
  return response.json();
}
async function order(data) {
  const response = await fetch(`${base('pedidos', 8090)}/pedidos`, {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(data),
  });
  assert.equal(response.status, 201);
  return response.json();
}
for (let i = 0; i < 40; i++) {
  try { await Promise.all([get('pedidos', 8090), get('inventario', 8091), get('pagos', 8092)]); break; }
  catch { if (i === 39) throw new Error('Los tres servicios no están listos'); await new Promise((r) => setTimeout(r, 250)); }
}

const before = await get('inventario', 8091);
const success = await order({ amount: 15000 });
const afterSuccess = await get('inventario', 8091);
assert.equal(success.status, 'CONFIRMADO');
assert.equal(afterSuccess.available, before.available - 1);
console.log('CASO A: COMPRA EXITOSA');
console.log(JSON.stringify({ order: success, stockBefore: before.available, stockAfter: afterSuccess.available }, null, 2));

const failed = await order({ amount: 20000, failConfirmation: true });
const afterFailure = await get('inventario', 8091);
const pay = await get('pagos', 8092);
assert.equal(failed.status, 'CANCELADO');
assert.equal(afterFailure.available, afterSuccess.available);
assert.ok(!afterFailure.reservations.includes(failed.id));
assert.equal(pay.payments[failed.id].status, 'REEMBOLSADO');
assert.equal(pay.payments[success.id].status, 'COBRADO');
console.log('CASO B: FALLA AL CONFIRMAR');
console.log(JSON.stringify({ order: failed, stockBefore: afterSuccess.available,
  stockAfter: afterFailure.available, payment: pay.payments[failed.id], retainedReservation: false }, null, 2));
console.log('VERIFICADO: la saga compensó el cobro y la reserva del pedido fallido.');
