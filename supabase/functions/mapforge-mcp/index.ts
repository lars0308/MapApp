// MapForge MCP relay (Supabase Edge Function) – lets an AI anywhere (claude.ai on the phone,
// Claude Desktop, Cursor …) work in MapForge – with or without an open MapForge tab.
//
//   AI ⇄ MCP (streamable HTTP) ⇄ this function ⇄ Supabase Realtime ⇄ MapForge tab (phone, PC …)
//                                              ⇘ no tab answers: MapForge in the cloud (Vercel, api/cloud.js)
//
// Address: https://<project>.supabase.co/functions/v1/mapforge-mcp/<pairing code>
// The pairing code comes from MapForge (Einstellungen → KI-Verbindung → „KI von überall“) and is
// the secret: the app only listens on the channel of its own code, the cloud workspace belongs to
// the code. Deploy with verify_jwt = false (AI clients cannot send a Supabase key).
//
// <address>/store  GET ?since=<ms>  maps of the cloud workspace changed after <since> (+ builder state)
//                  POST {projects, local?, current?}  store maps (newer wins) – used by the app and the cloud runner

import { createClient } from 'npm:@supabase/supabase-js@2';
import spec from './spec.json' with { type: 'json' };

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const KEY = Deno.env.get('SUPABASE_ANON_KEY')!;
const SERVICE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
/** MapForge deployment with the cloud runner (api/cloud.js) */
const CLOUD = (Deno.env.get('MAPFORGE_CLOUD_URL') ?? 'https://map-app-omega-five.vercel.app').replace(/\/$/, '');
const TIMEOUT = 45_000;
/** an open tab answers „ack“ right away; if not, the cloud takes over */
const ACK = 3_000;
const BUCKET = 'mapforge-exports';

const db = createClient(SUPABASE_URL, SERVICE, { auth: { persistSession: false } });

const cors = {
  'access-control-allow-origin': '*',
  'access-control-allow-headers': 'content-type, authorization, mcp-session-id, mcp-protocol-version',
  'access-control-allow-methods': 'POST, GET, OPTIONS',
};
const json = (data: unknown, status = 200) => new Response(JSON.stringify(data), { status, headers: { ...cors, 'content-type': 'application/json' } });

type AppResult = { ok: boolean; error?: string; text?: string; data?: unknown; binary?: { kind: string; mime: string; name: string; base64: string } };

/** run one command in the MapForge tab that listens on the code's channel; null = no tab there */
async function relay(code: string, command: string, args: unknown, timeout = TIMEOUT): Promise<AppResult | null> {
  const sb = createClient(SUPABASE_URL, KEY, { auth: { persistSession: false } });
  const ch = sb.channel(`mapforge-${code}`, { config: { broadcast: { self: false } } });
  const id = crypto.randomUUID();
  const parts: string[] = [];
  let got = 0;
  try {
    return await new Promise<AppResult | null>((resolve) => {
      let acked = false;
      const ackTimer = setTimeout(() => {
        if (acked) return;
        // no tab (or a sleeping one): tell it to leave the command, the cloud does it
        void ch.send({ type: 'broadcast', event: 'cancel', payload: { id } });
        clearTimeout(timer);
        resolve(null);
      }, ACK);
      const timer = setTimeout(() => resolve({ ok: false, error: 'MapForge antwortet nicht (Zeitüberschreitung).' }), timeout);
      ch.on('broadcast', { event: 'ack' }, ({ payload }) => {
        if (payload?.id === id) (acked = true), clearTimeout(ackTimer);
      });
      // results come in pieces (Realtime messages are limited in size)
      ch.on('broadcast', { event: 'result' }, ({ payload }) => {
        if (payload?.id !== id) return;
        acked = true;
        clearTimeout(ackTimer);
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

/** run the command in MapForge in the cloud (no tab open) */
async function cloud(code: string, command: string, args: unknown, origin: string): Promise<AppResult> {
  // switched off in the app (or replaced by a new address): no cloud either
  const { data: meta } = await db.from('cloud_meta').select('enabled').eq('code', code).maybeSingle();
  if (meta && meta.enabled === false) return { ok: false, error: 'MapForge ist nicht offen, und „KI von überall“ ist in der App ausgeschaltet – dort unter Einstellungen → KI-Verbindung einschalten.' };
  // one-time ticket: the runner only starts a browser for calls that really come from here
  const { data: t, error } = await db.from('cloud_tickets').insert({ code }).select('ticket').single();
  if (error || !t) return { ok: false, error: `MapForge in der Cloud: ${error?.message ?? 'kein Ticket'}` };
  try {
    const r = await fetch(`${CLOUD}/api/cloud`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ code, command, args, ticket: t.ticket, store: `${origin}/functions/v1/mapforge-mcp/${code}/store` }),
      signal: AbortSignal.timeout(140_000),
    });
    const text = await r.text();
    try {
      return JSON.parse(text);
    } catch {
      return { ok: false, error: `MapForge in der Cloud: HTTP ${r.status} ${text.slice(0, 200)}` };
    }
  } catch (e) {
    return { ok: false, error: `MapForge in der Cloud nicht erreichbar: ${(e as Error).message}` };
  }
}

/** files (ZIP …) cannot go through MCP: store them and give a download link (7 days) */
async function withLinks(code: string, r: AppResult): Promise<AppResult> {
  if (!r?.ok || r.binary?.kind !== 'file') return r;
  const path = `${code}/${Date.now()}-${r.binary.name.replace(/[^\w.-]+/g, '_')}`;
  const bytes = Uint8Array.from(atob(r.binary.base64), (c) => c.charCodeAt(0));
  const up = await db.storage.from(BUCKET).upload(path, bytes, { contentType: r.binary.mime, upsert: true });
  if (up.error) return { ok: true, text: `${r.text ?? r.binary.name} (Datei konnte nicht abgelegt werden: ${up.error.message})`, data: r.data };
  const signed = await db.storage.from(BUCKET).createSignedUrl(path, 7 * 24 * 3600, { download: r.binary.name });
  return { ok: true, text: `${r.text ?? r.binary.name}\nDownload (7 Tage gültig): ${signed.data?.signedUrl ?? '–'}`, data: r.data };
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

/** newest command list: from the open tab, else from the deployed app, else the copy here */
async function commands(code: string): Promise<typeof spec.commands> {
  const live = await relay(code, '__spec', {}, 4000);
  if (live?.ok && Array.isArray((live.data as typeof spec)?.commands)) return (live.data as typeof spec).commands;
  try {
    const r = await fetch(`${CLOUD}/mapforge-spec.json`, { signal: AbortSignal.timeout(4000) });
    const s = await r.json();
    if (Array.isArray(s?.commands)) return s.commands;
  } catch {
    // fall back
  }
  return spec.commands;
}

type Rpc = { jsonrpc: '2.0'; id?: string | number | null; method: string; params?: Record<string, unknown> };

async function handle(code: string, m: Rpc, origin: string) {
  const reply = (result: unknown) => ({ jsonrpc: '2.0', id: m.id, result });
  switch (m.method) {
    case 'initialize':
      return reply({
        protocolVersion: (m.params?.protocolVersion as string) ?? '2025-03-26',
        capabilities: { tools: { listChanged: false } },
        serverInfo: { name: 'mapforge', version: spec.version },
        instructions: `${spec.about} If MapForge is open with "KI von überall" switched on (phone or computer), commands run there and the user watches live. Otherwise they run in MapForge in the cloud on the same maps; the user sees them the next time the app is opened. Exported files come as download links.`,
      });
    case 'ping':
      return reply({});
    case 'tools/list':
      return reply({ tools: (await commands(code)).map((c) => ({ name: c.name, description: c.description, inputSchema: c.input })) });
    case 'tools/call': {
      const name = String(m.params?.name ?? '');
      const args = m.params?.arguments ?? {};
      // unknown commands are answered by the app itself
      const r = (await relay(code, name, args)) ?? (await cloud(code, name, args, origin));
      return reply(toMcp(await withLinks(code, r)));
    }
    default:
      // notifications (no id) need no answer
      if (m.id === undefined || m.id === null) return null;
      return { jsonrpc: '2.0', id: m.id, error: { code: -32601, message: `Method not found: ${m.method}` } };
  }
}

/* ------------------------------------------------------------------ cloud workspace */

type StoredProject = { id: string; name?: string; ai?: boolean; updated_at: number; data: string };

async function storeGet(code: string, since: number, ticket: string | null) {
  if (ticket !== null) {
    // the cloud runner shows its ticket before it starts a browser (used once, 3 minutes)
    const { data } = await db.from('cloud_tickets').delete().eq('ticket', ticket).eq('code', code).gt('created_at', new Date(Date.now() - 180_000).toISOString()).select('ticket');
    if (!data?.length) return json({ error: 'Ticket ungültig' }, 403);
    await db.from('cloud_tickets').delete().lt('created_at', new Date(Date.now() - 600_000).toISOString());
  }
  const { data: projects, error } = await db.from('cloud_projects').select('id, name, ai, updated_at, data').eq('code', code).gt('updated_at', since).order('updated_at');
  if (error) return json({ error: error.message }, 500);
  const { data: meta } = await db.from('cloud_meta').select('current_id, local').eq('code', code).maybeSingle();
  return json({ projects: projects ?? [], current: meta?.current_id ?? null, local: meta?.local ?? {} });
}

async function storePost(code: string, body: { projects?: StoredProject[]; local?: Record<string, string>; current?: string | null; enabled?: boolean }) {
  const list = (body.projects ?? []).filter((p) => p && typeof p.id === 'string' && typeof p.data === 'string' && Number.isFinite(p.updated_at));
  let stored = 0;
  if (list.length) {
    // newer wins: never overwrite a map with an older version
    const { data: have } = await db.from('cloud_projects').select('id, updated_at').eq('code', code).in('id', list.map((p) => p.id));
    const known = new Map((have ?? []).map((h) => [h.id, Number(h.updated_at)]));
    const rows = list.filter((p) => !(known.get(p.id)! >= p.updated_at)).map((p) => ({ code, id: p.id, name: String(p.name ?? ''), ai: !!p.ai, updated_at: p.updated_at, data: p.data }));
    if (rows.length) {
      const { error } = await db.from('cloud_projects').upsert(rows);
      if (error) return json({ error: error.message }, 500);
    }
    stored = rows.length;
  }
  if (body.local || body.current !== undefined || typeof body.enabled === 'boolean') {
    const row: Record<string, unknown> = { code, updated_at: new Date().toISOString() };
    if (typeof body.enabled === 'boolean') row.enabled = body.enabled;
    if (body.local && typeof body.local === 'object') row.local = body.local;
    if (body.current !== undefined) row.current_id = body.current;
    const { error } = await db.from('cloud_meta').upsert(row);
    if (error) return json({ error: error.message }, 500);
  }
  return json({ stored });
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: cors });
  const url = new URL(req.url);
  const parts = url.pathname.split('/').filter(Boolean);
  const store = parts[parts.length - 1] === 'store';
  const code = (store ? parts[parts.length - 2] : parts[parts.length - 1]) ?? '';
  if (!/^[A-Za-z0-9]{16,64}$/.test(code)) return json({ error: 'Kopplungscode fehlt – die Adresse in MapForge unter Einstellungen → KI-Verbindung kopieren.' }, 404);
  // public address of this function (for the cloud runner)
  const origin = SUPABASE_URL.replace(/\/$/, '');

  if (store) {
    if (req.method === 'GET') return storeGet(code, Number(url.searchParams.get('since')) || 0, url.searchParams.get('ticket'));
    if (req.method === 'POST') {
      try {
        return await storePost(code, await req.json());
      } catch {
        return json({ error: 'Ungültige Daten' }, 400);
      }
    }
    return json({ error: 'GET oder POST' }, 405);
  }

  if (req.method !== 'POST') return new Response('MapForge MCP relay – MCP streamable HTTP (POST).', { status: 405, headers: { ...cors, allow: 'POST, OPTIONS' } });
  let body: Rpc | Rpc[];
  try {
    body = await req.json();
  } catch {
    return json({ jsonrpc: '2.0', id: null, error: { code: -32700, message: 'Parse error' } }, 400);
  }
  if (Array.isArray(body)) {
    const out = (await Promise.all(body.map((m) => handle(code, m, origin)))).filter(Boolean);
    return out.length ? json(out) : new Response(null, { status: 202, headers: cors });
  }
  const r = await handle(code, body, origin);
  return r ? json(r) : new Response(null, { status: 202, headers: cors });
});
