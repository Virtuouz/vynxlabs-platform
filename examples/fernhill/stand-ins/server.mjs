// Stand-ins for the outside systems Fernhill connects to:
//
//   TextLine   the SMS gateway           /textline/messages
//   VetSupply  the stock supplier        /vetsupply/catalog/:sku, /vetsupply/orders
//
// Open http://127.0.0.1:4020/ to see every text and order the platform sent.
// POST /control/outage {"on": true} makes TextLine answer 503, to see a run fail.
import { createServer } from "node:http";

const PORT = Number(process.env.PORT ?? 4020);
const TOKENS = {
  textline: process.env.TEXTLINE_TOKEN ?? "tl_demo_7f3a9c",
  vetsupply: process.env.VETSUPPLY_TOKEN ?? "vs_demo_51be22",
};
const PRICES = {
  "VAC-DHPP": 820,
  "VAC-LEPTO": 640,
  "VAC-FEL": 710,
  "VAC-RHD2": 1150,
  "MED-MELOX": 960,
  "MED-AMOX": 1480,
  "MED-INSUL": 4350,
  "ANA-ISO": 6200,
  "ANA-PROP": 1890,
  "SUP-GLOVE": 690,
  "SUP-SUTURE": 5400,
  "SUP-SYR": 850,
  "FOOD-RENAL": 3150,
  "FOOD-GI": 5620,
};

const messages = [];
const orders = [];
const placed = new Map();
let outage = false;

const send = (response, status, body) => {
  response.statusCode = status;
  response.setHeader("content-type", "application/json");
  response.end(JSON.stringify(body));
};
const authorized = (request, token) => request.headers.authorization === `Bearer ${token}`;
const escapeHtml = (text) =>
  String(text).replace(
    /[&<>"]/g,
    (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c],
  );

function page() {
  const rows = (list, cells) =>
    list
      .slice(-100)
      .reverse()
      .map(
        (item) =>
          `<tr>${cells(item)
            .map((cell) => `<td>${escapeHtml(cell)}</td>`)
            .join("")}</tr>`,
      )
      .join("");
  return `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width">
<title>Fernhill's outside systems</title>
<meta http-equiv="refresh" content="10">
<style>body{font:14px system-ui;margin:24px;max-width:1100px}table{border-collapse:collapse;width:100%;margin-bottom:28px}td,th{border-bottom:1px solid #ddd;padding:6px 8px;text-align:left;vertical-align:top}th{color:#555;font-weight:600}code{background:#f3f3f3;padding:1px 4px}</style>
<h1>Fernhill's outside systems</h1>
<p>TextLine is ${outage ? "<strong>down</strong>" : "up"}. Refreshes every 10 seconds.</p>
<h2>TextLine: ${messages.length} texts</h2>
<table><tr><th>When</th><th>To</th><th>Status</th><th>Text</th></tr>${rows(messages, (m) => [m.at, m.to, m.status, m.text])}</table>
<h2>VetSupply: ${orders.length} orders</h2>
<table><tr><th>When</th><th>Reference</th><th>Account</th><th>SKU</th><th>Quantity</th></tr>${rows(orders, (o) => [o.at, o.reference, o.account, o.sku, o.quantity])}</table>`;
}

createServer((request, response) => {
  let raw = "";
  request.on("data", (chunk) => {
    raw += chunk;
  });
  request.on("end", () => {
    const url = new URL(request.url ?? "/", "http://stand-in");
    const body = raw ? JSON.parse(raw) : {};
    const at = new Date().toISOString().slice(0, 19).replace("T", " ");
    const done = (status, payload) => {
      console.log(at, request.method, url.pathname, status);
      if (typeof payload === "string") {
        response.statusCode = status;
        response.setHeader("content-type", "text/html; charset=utf-8");
        response.end(payload);
      } else send(response, status, payload);
    };

    if (url.pathname === "/") return done(200, page());
    if (url.pathname === "/control/outage" && request.method === "POST") {
      outage = Boolean(body.on);
      return done(200, { outage });
    }

    if (url.pathname === "/textline/messages" && request.method === "POST") {
      if (!authorized(request, TOKENS.textline)) return done(401, { error: "Unknown API token." });
      if (outage) return done(503, { error: "TextLine is having an outage." });
      if (!body.to || !body.text) return done(400, { error: "to and text are required." });
      // 555-0199 is a landline, so some reminders are refused.
      if (String(body.to).replace(/\D/g, "").endsWith("5550199")) {
        messages.push({ at, to: body.to, text: body.text, status: "refused" });
        return done(422, { error: "That number cannot receive texts." });
      }
      const id = `tl_${Math.random().toString(36).slice(2, 10)}`;
      messages.push({ at, to: body.to, text: body.text, status: "sent" });
      return done(201, { id });
    }

    const item = /^\/vetsupply\/catalog\/([A-Z0-9-]+)$/.exec(url.pathname);
    if (item && request.method === "GET") {
      if (!authorized(request, TOKENS.vetsupply)) return done(401, { error: "Unknown API token." });
      const price = PRICES[item[1]];
      if (!price) return done(404, { error: `No product ${item[1]}.` });
      // Buying more than 50 earns a tenth off.
      const quantity = Number(url.searchParams.get("quantity") ?? 1);
      return done(200, {
        unit_price: quantity > 50 ? Math.round(price * 0.9) : price,
        lead_days: 2,
      });
    }
    if (url.pathname === "/vetsupply/orders" && request.method === "POST") {
      if (!authorized(request, TOKENS.vetsupply)) return done(401, { error: "Unknown API token." });
      const key = request.headers["idempotency-key"];
      if (key && placed.has(key)) return done(200, placed.get(key));
      if (!PRICES[body.sku]) return done(422, { error: `No product ${body.sku}.` });
      const order = { reference: `VSD-${900000 + orders.length}` };
      orders.push({ at, ...order, account: body.account, sku: body.sku, quantity: body.quantity });
      if (key) placed.set(key, order);
      return done(201, order);
    }
    return done(404, { error: "Not found." });
  });
}).listen(PORT, "127.0.0.1", () =>
  console.log(`Fernhill's outside systems on http://127.0.0.1:${PORT}/`),
);
