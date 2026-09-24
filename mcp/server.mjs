#!/usr/bin/env node
// MapForge MCP server – gives an AI tools to work with MapForge.
//
//   AI  ⇄ (MCP, stdio) ⇄ this server ⇄ (WebSocket) ⇄ MapForge in a browser tab
//
// The tools run inside the real app, so everything the app can do works: the user switches on
// "Einstellungen → KI-Verbindung" in MapForge and watches the AI work. Without an open tab the
// server starts MapForge itself in a hidden browser (needs the built app in ../dist and a Chrome /
// Chromium – see README). The server also serves the app on http://127.0.0.1:8765/ and takes
// plain HTTP calls: POST /command {"command": "status", "args": {}}.
//
// Options (environment): MAPFORGE_PORT (8765), MAPFORGE_URL (app address for the hidden browser,
// default: the app served here), MAPFORGE_CHROME (path to a Chrome / Chromium), MAPFORGE_HEADLESS=0
// (never start a hidden browser), MAPFORGE_EXPORTS (folder for exported files).
// Flag --no-stdio: only HTTP / WebSocket (for programs without MCP).

import http from 'node:http';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { WebSocketServer } from 'ws';

const here = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.MAPFORGE_PORT || 8765);
const HOST = '127.0.0.1';
const DIST = path.resolve(here, '..', 'dist');
const EXPORTS = process.env.MAPFORGE_EXPORTS || path.join(os.homedir(), 'MapForge-Exporte');
const spec = JSON.parse(fs.readFileSync(path.resolve(here, '..', 'src', 'api', 'spec.json'), 'utf8'));
const log = (...a) => console.error('[mapforge-mcp]', ...a); // stdout belongs to MCP

// ------------------------------------------------------------------ app connection

/** connected MapForge tabs, newest last */
const apps = [];
const pending = new Map();
let nextId = 1;
/** another server already runs on the port → forward calls there */
let forwardTo = null;

function currentApp() {
  for (let i = apps.length - 1; i >= 0; i--) if (apps[i].readyState === 1) return apps[i];
  return null;
}

function waitForApp(ms) {
  return new Promise((resolve) => {
    const t0 = Date.now();
    const tick = () => {
      const a = currentApp();
      if (a || Date.now() - t0 > ms) return resolve(a);
      setTimeout(tick, 150);
    };
    tick();
  });
}

let browser = null;
let starting = null;
/** start MapForge in a hidden browser (only when no tab is connected) */
async function startHiddenApp() {
  if (process.env.MAPFORGE_HEADLESS === '0') return false;
  if (starting) return starting;
  starting = (async () => {
    let pw;
    try {
      pw = await import('playwright-core');
    } catch {
      log('playwright-core not installed – cannot start a hidden browser');
      return false;
    }
    const url = `${process.env.MAPFORGE_URL || `http://${HOST}:${PORT}/`}${(process.env.MAPFORGE_URL || '').includes('?') ? '&' : '?'}ai=ws://${HOST}:${PORT}`;
    const profile = path.join(os.homedir(), '.mapforge-mcp', 'browser');
    fs.mkdirSync(profile, { recursive: true });
    const tries = [];
    if (process.env.MAPFORGE_CHROME) tries.push({ executablePath: process.env.MAPFORGE_CHROME });
    tries.push({ channel: 'chrome' }, { channel: 'msedge' }, {});
    for (const t of tries) {
      try {
        browser = await pw.chromium.launchPersistentContext(profile, { headless: true, viewport: { width: 1280, height: 800 }, ...t });
        const page = browser.pages()[0] ?? (await browser.newPage());
        page.on('pageerror', (e) => log('app error:', e.message));
        await page.goto(url);
        log('hidden MapForge started:', url);
        return true;
      } catch (e) {
        log('browser start failed', JSON.stringify(t), String(e.message).split('\n')[0]);
      }
    }
    return false;
  })();
  const ok = await starting;
  if (!ok) starting = null;
  return ok;
}

const NO_APP =
  'MapForge ist nicht verbunden. Öffne MapForge im Browser und schalte „Einstellungen → KI-Verbindung“ ein ' +
  `(oder öffne http://${HOST}:${PORT}/?ai=1). Für den unsichtbaren Start: im MapForge-Ordner „npm run build“ und Chrome/Chromium installieren.`;

/** run a command in the app → { ok, data?, text?, binary? } | { ok: false, error } */
async function call(command, args = {}) {
  if (forwardTo) {
    const r = await fetch(`${forwardTo}/command`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ command, args }) });
    return r.json();
  }
  let app = currentApp() ?? (await waitForApp(800));
  if (!app && (await startHiddenApp())) app = await waitForApp(25000);
  if (!app) return { ok: false, error: NO_APP };
  const id = nextId++;
  return new Promise((resolve) => {
    const timer = setTimeout(() => {
      pending.delete(id);
      resolve({ ok: false, error: `Keine Antwort von MapForge auf „${command}“ (Zeitüberschreitung)` });
    }, 180000);
    pending.set(id, (result) => {
      clearTimeout(timer);
      resolve(result);
    });
    app.send(JSON.stringify({ id, command, args }));
  });
}

// ------------------------------------------------------------------ HTTP + WebSocket

const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.svg': 'image/svg+xml', '.woff2': 'font/woff2', '.webmanifest': 'application/manifest+json', '.ico': 'image/x-icon' };

function serveApp(req, res) {
  const u = new URL(req.url, `http://${HOST}`);
  let file = path.normalize(path.join(DIST, decodeURIComponent(u.pathname)));
  if (!file.startsWith(DIST)) return res.writeHead(403).end();
  if (!fs.existsSync(file) || fs.statSync(file).isDirectory()) file = path.join(DIST, 'index.html');
  if (!fs.existsSync(file)) {
    res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' });
    return res.end('MapForge ist noch nicht gebaut: im MapForge-Ordner "npm install && npm run build" ausführen.');
  }
  res.writeHead(200, { 'content-type': MIME[path.extname(file)] || 'application/octet-stream' });
  fs.createReadStream(file).pipe(res);
}

const server = http.createServer(async (req, res) => {
  const cors = { 'access-control-allow-origin': '*', 'access-control-allow-headers': 'content-type' };
  if (req.method === 'OPTIONS') return res.writeHead(204, cors).end();
  if (req.url === '/spec') return res.writeHead(200, { ...cors, 'content-type': 'application/json' }).end(JSON.stringify(spec));
  if (req.url === '/health') return res.writeHead(200, { ...cors, 'content-type': 'application/json' }).end(JSON.stringify({ ok: true, connected: !!currentApp() }));
  if (req.method === 'POST' && req.url === '/command') {
    let body = '';
    for await (const c of req) body += c;
    let msg;
    try {
      msg = JSON.parse(body || '{}');
    } catch {
      return res.writeHead(400, cors).end('invalid JSON');
    }
    const result = await call(String(msg.command || ''), msg.args || {});
    return res.writeHead(200, { ...cors, 'content-type': 'application/json' }).end(JSON.stringify(result));
  }
  serveApp(req, res);
});

const wss = new WebSocketServer({ server });
wss.on('connection', (sock, req) => {
  // only pages from this computer (localhost / file) or known MapForge hosts may connect – any
  // website could otherwise try to reach the port
  const origin = req.headers.origin || '';
  sock.on('message', (raw) => {
    let msg;
    try {
      msg = JSON.parse(String(raw));
    } catch {
      return;
    }
    if (msg.type === 'hello') {
      apps.push(sock);
      log(`MapForge connected (${origin || 'no origin'}), ${msg.commands?.length ?? 0} commands`);
      return;
    }
    const done = pending.get(msg.id);
    if (done) {
      pending.delete(msg.id);
      done(msg.result);
    }
  });
  sock.on('close', () => {
    const i = apps.indexOf(sock);
    if (i >= 0) apps.splice(i, 1);
  });
});

server.on('error', (e) => {
  if (e.code === 'EADDRINUSE') {
    // e.g. a second AI client: use the server that already runs
    forwardTo = `http://${HOST}:${PORT}`;
    log(`port ${PORT} busy – forwarding to the MapForge server already running there`);
  } else log('server error', e.message);
});
server.listen(PORT, HOST, () => log(`listening on http://${HOST}:${PORT}/ (app, /command, WebSocket)`));

// ------------------------------------------------------------------ MCP (stdio)

function saveFile(bin, wanted) {
  const target = wanted ? path.resolve(String(wanted)) : path.join(EXPORTS, bin.name);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, Buffer.from(bin.base64, 'base64'));
  return target;
}

/** app result → MCP tool result */
function toMcp(result, args) {
  if (!result || !result.ok) return { isError: true, content: [{ type: 'text', text: result?.error || 'Unbekannter Fehler' }] };
  const content = [];
  if (result.binary?.kind === 'image') content.push({ type: 'image', data: result.binary.base64, mimeType: result.binary.mime });
  if (result.binary?.kind === 'file') {
    const where = saveFile(result.binary, args?.path);
    content.push({ type: 'text', text: `${result.text ?? result.binary.name} – gespeichert unter ${where}` });
  } else if (result.text) content.push({ type: 'text', text: result.text });
  if (result.data !== undefined) content.push({ type: 'text', text: JSON.stringify(result.data, null, 1) });
  if (!content.length) content.push({ type: 'text', text: 'OK' });
  return { content };
}

async function startMcp() {
  const { Server } = await import('@modelcontextprotocol/sdk/server/index.js');
  const { StdioServerTransport } = await import('@modelcontextprotocol/sdk/server/stdio.js');
  const { ListToolsRequestSchema, CallToolRequestSchema } = await import('@modelcontextprotocol/sdk/types.js');
  const mcp = new Server({ name: 'mapforge', version: spec.version }, { capabilities: { tools: {} }, instructions: spec.about });
  mcp.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: spec.commands.map((c) => ({ name: c.name, description: c.description, inputSchema: c.input })),
  }));
  mcp.setRequestHandler(CallToolRequestSchema, async (req) => {
    const name = req.params.name;
    const args = req.params.arguments ?? {};
    if (!spec.commands.some((c) => c.name === name)) return { isError: true, content: [{ type: 'text', text: `Unbekanntes Tool ${name}` }] };
    return toMcp(await call(name, args), args);
  });
  await mcp.connect(new StdioServerTransport());
  log('MCP ready (stdio)');
}

if (!process.argv.includes('--no-stdio')) await startMcp();

const shutdown = async () => {
  try {
    await browser?.close();
  } catch {
    // ignore
  }
  process.exit(0);
};
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
process.stdin.on('close', () => {
  if (!process.argv.includes('--no-stdio')) void shutdown();
});
