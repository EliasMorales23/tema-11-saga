import http from 'node:http';
import { randomUUID } from 'node:crypto';

const role = process.env.ROLE;
const port = Number(process.env.PORT);
const address = (key, fallback) => process.env[key] ?? fallback;
const canal = address('CANAL_URL', 'http://127.0.0.1:8081');
const subscribers = [
  ['notificaciones', address('NOTIFICACIONES_URL', 'http://127.0.0.1:8082')],
  ['estadisticas', address('ESTADISTICAS_URL', 'http://127.0.0.1:8083')],
];

const orders = new Map();
const messages = new Map();
const counted = new Set();
const deliveries = [];

function json(res, status, value) {
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(value));
}

async function readJson(req) {
  let data = '';
  for await (const chunk of req) {
    data += chunk;
    if (data.length > 20_000) throw new Error('Mensaje demasiado grande');
  }
  try { return JSON.parse(data); } catch { throw new Error('JSON inválido'); }
}

async function post(url, payload) {
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(1500),
  });
  const body = await response.json();
  if (!response.ok) throw new Error(body.error ?? `HTTP ${response.status}`);
  return body;
}

async function handle(req, res) {
  const path = new URL(req.url, 'http://localhost').pathname;
  if (req.method === 'GET' && path === '/estado') {
    if (role === 'pedidos') return json(res, 200, { pedidos: [...orders.values()] });
    if (role === 'canal') return json(res, 200, { entregas: deliveries });
    if (role === 'notificaciones') return json(res, 200, { mensajes: [...messages.values()] });
    return json(res, 200, { pedidosCreados: counted.size, idsProcesados: [...counted] });
  }
  if (req.method !== 'POST') return json(res, 404, { error: 'Ruta desconocida' });
  const body = await readJson(req);

  if (role === 'pedidos' && path === '/pedidos') {
    if (typeof body.email !== 'string' || !body.email.includes('@')) {
      return json(res, 400, { error: 'Se requiere email válido' });
    }
    const order = { id: randomUUID(), email: body.email, estado: 'CREADO' };
    orders.set(order.id, order);
    const event = { id: randomUUID(), type: 'PedidoCreado', pedidoId: order.id, email: order.email };
    console.log(`[pedidos] creado=${order.id} publicado=${event.type} evento=${event.id}`);
    try {
      const delivery = await post(`${canal}/publicar`, event);
      return json(res, 201, { pedido: order, evento: event, entregas: delivery.entregas });
    } catch (error) {
      console.error(`[pedidos] publicación fallida: ${error.message}`);
      return json(res, 503, { pedido: order, error: 'Pedido creado, pero el canal no recibió el evento' });
    }
  }

  if (role === 'canal' && path === '/publicar') {
    if (!body.id || body.type !== 'PedidoCreado' || !body.pedidoId) {
      return json(res, 400, { error: 'Evento PedidoCreado inválido' });
    }
    console.log(`[canal] recibido=${body.type} evento=${body.id}`);
    // Copia el mismo evento a cada consumidor; las entregas son independientes.
    const attempts = await Promise.allSettled(subscribers.map(([, url]) => post(`${url}/evento`, body)));
    const result = attempts.map((attempt, index) => ({
      consumidor: subscribers[index][0],
      estado: attempt.status === 'fulfilled' ? 'OK' : 'ERROR',
    }));
    deliveries.push({ eventoId: body.id, entregas: result });
    for (const item of result) console.log(`[canal] evento=${body.id} consumidor=${item.consumidor} estado=${item.estado}`);
    return json(res, 200, { entregas: result });
  }

  if (role === 'notificaciones' && path === '/evento') {
    if (body.type !== 'PedidoCreado') return json(res, 400, { error: 'Tipo desconocido' });
    if (!messages.has(body.id)) {
      messages.set(body.id, { eventoId: body.id, pedidoId: body.pedidoId, texto: `Aviso para ${body.email}` });
      console.log(`[notificaciones] aviso registrado para pedido=${body.pedidoId}`);
    }
    return json(res, 200, { procesado: true });
  }

  if (role === 'estadisticas' && path === '/evento') {
    if (body.type !== 'PedidoCreado') return json(res, 400, { error: 'Tipo desconocido' });
    if (!counted.has(body.id)) {
      counted.add(body.id);
      console.log(`[estadisticas] pedido creado=${body.pedidoId}; total=${counted.size}`);
    }
    return json(res, 200, { procesado: true });
  }
  return json(res, 404, { error: 'Ruta desconocida' });
}

if (!['pedidos', 'canal', 'notificaciones', 'estadisticas'].includes(role) || !port) {
  throw new Error('Configurar ROLE y PORT');
}
http.createServer((req, res) => {
  handle(req, res).catch((error) => {
    console.error(`[${role}] ${error.message}`);
    if (!res.headersSent) json(res, 400, { error: error.message });
  });
}).listen(port, '0.0.0.0', () => console.log(`[${role}] escuchando puerto=${port}`));
