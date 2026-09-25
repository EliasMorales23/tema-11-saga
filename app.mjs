import http from 'node:http';
import { randomUUID } from 'node:crypto';

const role = process.env.ROLE;
const port = Number(process.env.PORT);
const inventoryUrl = process.env.INVENTARIO_URL ?? 'http://127.0.0.1:8091';
const paymentUrl = process.env.PAGOS_URL ?? 'http://127.0.0.1:8092';
const inventory = { initial: 5, available: 5, reservations: new Set() };
const payments = new Map();
const orders = new Map();

function json(res, status, payload) {
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(payload));
}

async function readJson(req) {
  let raw = '';
  for await (const chunk of req) {
    raw += chunk;
    if (raw.length > 20_000) throw new Error('Mensaje demasiado grande');
  }
  try { return JSON.parse(raw); } catch { throw new Error('JSON inválido'); }
}

async function post(url, data) {
  const response = await fetch(url, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify(data), signal: AbortSignal.timeout(2000),
  });
  const value = await response.json();
  if (!response.ok) throw new Error(value.error ?? `HTTP ${response.status}`);
  return value;
}

async function runSaga(order, failConfirmation) {
  const completed = [];
  try {
    await post(`${inventoryUrl}/reservar`, { id: order.id });
    completed.push(['liberar stock', () => post(`${inventoryUrl}/liberar`, { id: order.id })]);
    console.log(`[pedidos] ${order.id}: 1 stock reservado`);

    await post(`${paymentUrl}/cobrar`, { id: order.id, amount: order.amount });
    completed.push(['reembolsar pago', () => post(`${paymentUrl}/reembolsar`, { id: order.id })]);
    console.log(`[pedidos] ${order.id}: 2 pago registrado`);

    if (failConfirmation) throw new Error('fallo simulado al confirmar');
    order.status = 'CONFIRMADO';
    console.log(`[pedidos] ${order.id}: 3 pedido CONFIRMADO`);
  } catch (error) {
    console.log(`[pedidos] ${order.id}: ${error.message}; comenzar compensación`);
    let failure = false;
    for (const [name, undo] of completed.reverse()) {
      try { await undo(); console.log(`[pedidos] ${order.id}: compensación ${name} OK`); }
      catch (cause) { failure = true; console.error(`[pedidos] ${order.id}: ERROR en ${name}: ${cause.message}`); }
    }
    order.status = failure ? 'REQUIERE_INTERVENCION' : 'CANCELADO';
    console.log(`[pedidos] ${order.id}: estado final ${order.status}`);
  }
  return order;
}

async function handle(req, res) {
  const path = new URL(req.url, 'http://localhost').pathname;
  if (req.method === 'GET' && path === '/estado') {
    if (role === 'pedidos') return json(res, 200, { orders: [...orders.values()] });
    if (role === 'inventario') return json(res, 200, { initial: inventory.initial, available: inventory.available, reservations: [...inventory.reservations] });
    return json(res, 200, { payments: Object.fromEntries(payments) });
  }
  if (req.method !== 'POST') return json(res, 404, { error: 'Ruta desconocida' });
  const body = await readJson(req);

  if (role === 'inventario' && path === '/reservar') {
    if (inventory.reservations.has(body.id)) return json(res, 200, { reservation: 'existente' });
    if (inventory.available < 1) return json(res, 409, { error: 'Sin stock' });
    inventory.available--;
    inventory.reservations.add(body.id);
    console.log(`[inventario] reservado ${body.id}; disponible=${inventory.available}`);
    return json(res, 200, { reservation: 'realizada' });
  }
  if (role === 'inventario' && path === '/liberar') {
    if (inventory.reservations.delete(body.id)) inventory.available++;
    console.log(`[inventario] liberado ${body.id}; disponible=${inventory.available}`);
    return json(res, 200, { released: true });
  }
  if (role === 'pagos' && path === '/cobrar') {
    if (!payments.has(body.id)) payments.set(body.id, { amount: body.amount, status: 'COBRADO' });
    console.log(`[pagos] cobrado ${body.id}`);
    return json(res, 200, { payment: payments.get(body.id) });
  }
  if (role === 'pagos' && path === '/reembolsar') {
    const payment = payments.get(body.id);
    if (!payment) return json(res, 404, { error: 'Pago inexistente' });
    payment.status = 'REEMBOLSADO';
    console.log(`[pagos] reembolsado ${body.id}`);
    return json(res, 200, { payment });
  }
  if (role === 'pedidos' && path === '/pedidos') {
    if (!Number.isFinite(body.amount) || body.amount <= 0) return json(res, 400, { error: 'Se requiere amount positivo' });
    const order = { id: randomUUID(), amount: body.amount, status: 'PENDIENTE' };
    orders.set(order.id, order);
    console.log(`[pedidos] ${order.id}: saga iniciada`);
    await runSaga(order, body.failConfirmation === true);
    return json(res, 201, order);
  }
  return json(res, 404, { error: 'Ruta desconocida' });
}

if (!['pedidos', 'inventario', 'pagos'].includes(role) || !port) throw new Error('Configurar ROLE y PORT');
http.createServer((req, res) => {
  handle(req, res).catch((error) => {
    console.error(`[${role}] ${error.message}`);
    if (!res.headersSent) json(res, 400, { error: error.message });
  });
}).listen(port, '0.0.0.0', () => console.log(`[${role}] escuchando puerto=${port}`));
