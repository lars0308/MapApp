// MapForge MCP relay (Supabase Edge Function) – lets an AI anywhere (claude.ai on the phone,
// Claude Desktop, Cursor …) work in MapForge running on any device (phone, tablet, PC).
//
//   AI ⇄ MCP (streamable HTTP) ⇄ this function ⇄ Supabase Realtime (broadcast) ⇄ MapForge tab
//
// Address: https://<project>.supabase.co/functions/v1/mapforge-mcp/<pairing code>
// The pairing code comes from MapForge (Einstellungen → KI-Verbindung → „KI von überall“) and is
// the secret: the app only listens on the channel of its own code. Deploy with verify_jwt = false
// (AI clients cannot send a Supabase key).

import { createClient } from 'npm:@supabase/supabase-js@2';
import spec from './spec.json' with { type: 'json' };

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const KEY = Deno.env.get('SUPABASE_ANON_KEY')!;
const TIMEOUT = 45_000;

const cors = {
  'access-control-allow-origin': '*',
  'access-control-allow-headers': 'content-type, authorization, mcp-session-id, mcp-protocol-version',
  'access-control-allow-methods': 'POST, GET, OPTIONS',
};
const json = (data: unknown, status = 200) => new Response(JSON.stringify(data), { status, headers: { ...cors, 'content-type': 'application/json' } });

type AppResult = { ok: boolean; error?: string; text?: string; data?: unknown; binary?: { kind: string; mime: string; name: string; base64: string } };

/** run one command in the MapForge tab that listens on the code's channel */
async function relay(code: string, command: string, args: unknown): Promise<AppResult> {
  const sb = createClient(SUPABASE_URL, KEY, { auth: { persistSession: false } });
  const ch = sb.channel(`mapforge-${code}`, { config: { broadcast: { self: false } } });
  const id = crypto.randomUUID();
  const parts: string[] = [];
  let got = 0;
  try {
    return await new Promise<AppResult>((resolve) => {
      const timer = setTimeout(
        () => resolve({ ok: false, error: 'MapForge antwortet nicht. Ist die App offen (auch am Handy) und unter Einstellungen → KI-Verbindung „KI von überall“ eingeschaltet – mit diesem Kopplungscode?' }),
        TIMEOUT,
      );
      // results come in pieces (Realtime messages are limited in size)
      ch.on('broadcast', { event: 'result' }, ({ payload }) => {
        if (payload?.id !== id) return;
        if (parts[payload.i] === undefined) got++;
        parts[payload.i] = String(payload.data);
        if (got === payload.n) {
          clearTimeout(timer);
          try {
            resolve(JSON.parse(parts.join('')));
          } catch {
            resolve({ ok: false, error: 'Antwort von MapForge unvollständig' });
          }
        }
      });
      ch.subscribe((status) => {
        if (status === 'SUBSCRIBED') void ch.send({ type: 'broadcast', event: 'call', payload: { id, command, args } });
      });
    });
  } finally {
    await sb.removeChannel(ch);
  }
}

function toMcp(r: AppResult) {
  if (!r?.ok) return { isError: true, content: [{ type: 'text', text: r?.error ?? 'Unbekannter Fehler' }] };
  const content: unknown[] = [];
  if (r.binary?.kind === 'image') content.push({ type: 'image', data: r.binary.base64, mimeType: r.binary.mime });
  if (r.text) content.push({ type: 'text', text: r.text });
  if (r.data !== undefined) content.push({ type: 'text', text: JSON.stringify(r.data, null, 1) });
  if (!content.length) content.push({ type: 'text', text: 'OK' });
  return { content };
}

type Rpc = { jsonrpc: '2.0'; id?: string | number | null; method: string; params?: Record<string, unknown> };

async function handle(code: string, m: Rpc) {
  const reply = (result: unknown) => ({ jsonrpc: '2.0', id: m.id, result });
  switch (m.method) {
    case 'initialize':
      return reply({
        protocolVersion: (m.params?.protocolVersion as string) ?? '2025-03-26',
        capabilities: { tools: { listChanged: false } },
        serverInfo: { name: 'mapforge', version: spec.version },
        instructions: `${spec.about} MapForge must be open (phone or computer) with "KI von überall" switched on. Exported files are downloaded on that device.`,
      });
    case 'ping':
      return reply({});
    case 'tools/list':
      return reply({ tools: spec.commands.map((c) => ({ name: c.name, description: c.description, inputSchema: c.input })) });
    case 'tools/call': {
      const name = String(m.params?.name ?? '');
      if (!spec.commands.some((c) => c.name === name)) return reply({ isError: true, content: [{ type: 'text', text: `Unbekanntes Tool ${name}` }] });
      return reply(toMcp(await relay(code, name, m.params?.arguments ?? {})));
    }
    default:
      // notifications (no id) need no answer
      if (m.id === undefined || m.id === null) return null;
      return { jsonrpc: '2.0', id: m.id, error: { code: -32601, message: `Method not found: ${m.method}` } };
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: cors });
  const code = new URL(req.url).pathname.split('/').filter(Boolean).pop() ?? '';
  if (!/^[A-Za-z0-9]{16,64}$/.test(code)) return json({ error: 'Kopplungscode fehlt – die Adresse in MapForge unter Einstellungen → KI-Verbindung kopieren.' }, 404);
  if (req.method !== 'POST') return new Response('MapForge MCP relay – MCP streamable HTTP (POST).', { status: 405, headers: { ...cors, allow: 'POST, OPTIONS' } });
  let body: Rpc | Rpc[];
  try {
    body = await req.json();
  } catch {
    return json({ jsonrpc: '2.0', id: null, error: { code: -32700, message: 'Parse error' } }, 400);
  }
  if (Array.isArray(body)) {
    const out = (await Promise.all(body.map((m) => handle(code, m)))).filter(Boolean);
    return out.length ? json(out) : new Response(null, { status: 202, headers: cors });
  }
  const r = await handle(code, body);
  return r ? json(r) : new Response(null, { status: 202, headers: cors });
});
