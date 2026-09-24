import { create } from 'zustand';
import type { RealtimeChannel, SupabaseClient } from '@supabase/supabase-js';
import { runCommand, spec, type Result } from './commands';
import { useEditor } from '../store/editorStore';
import { downloadBlob } from '../utils/download';

// "KI von überall": the app listens on a Supabase Realtime channel of its own pairing code; the
// MapForge relay (supabase/functions/mapforge-mcp) forwards MCP tool calls from any AI there.
// Works on the phone as well – nothing has to run on a computer.

/** relay project (public URL + publishable anon key – safe to ship in the app) */
const DEFAULT_URL = (import.meta.env.VITE_MAPFORGE_RELAY_URL as string | undefined) ?? 'https://uqimzsputtnajpsficao.supabase.co';
const DEFAULT_KEY =
  (import.meta.env.VITE_MAPFORGE_RELAY_KEY as string | undefined) ??
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVxaW16c3B1dHRuYWpwc2ZpY2FvIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTAyMzg0MjQsImV4cCI6MjEwNTgxNDQyNH0.IgQD8hUHjR4OeMF3w-4QrTEQfLNNNZnqN7zXBYV-TY0';
const KEY = 'mapforge.relay';
/** result pieces stay below the Realtime message limit (256 KB on free projects) */
const CHUNK = 150_000;

type Status = 'off' | 'connecting' | 'connected' | 'error';

interface RelayState {
  enabled: boolean;
  code: string;
  url: string;
  key: string;
  status: Status;
  error: string | null;
  last: string | null;
  count: number;
  setEnabled: (v: boolean) => void;
  newCode: () => void;
  setServer: (url: string, key: string) => void;
}

const makeCode = () => {
  const a = new Uint8Array(15);
  crypto.getRandomValues(a);
  const abc = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789';
  return Array.from(a, (b) => abc[b % abc.length]).join('') + Array.from(a.slice(0, 5), (b) => abc[(b * 7) % abc.length]).join('');
};

function read(): Pick<RelayState, 'enabled' | 'code' | 'url' | 'key'> {
  try {
    const s = JSON.parse(localStorage.getItem(KEY) ?? 'null');
    if (s?.code) return { enabled: !!s.enabled, code: s.code, url: s.url || DEFAULT_URL, key: s.key || DEFAULT_KEY };
  } catch {
    // ignore
  }
  return { enabled: false, code: makeCode(), url: DEFAULT_URL, key: DEFAULT_KEY };
}
const save = (s: Pick<RelayState, 'enabled' | 'code' | 'url' | 'key'>) => {
  try {
    localStorage.setItem(KEY, JSON.stringify({ enabled: s.enabled, code: s.code, url: s.url === DEFAULT_URL ? '' : s.url, key: s.key === DEFAULT_KEY ? '' : s.key }));
  } catch {
    // not stored
  }
};

export const useRelay = create<RelayState>((set, get) => ({
  ...read(),
  status: 'off',
  error: null,
  last: null,
  count: 0,
  setEnabled: (enabled) => {
    set({ enabled, error: null });
    save(get());
    void connect();
  },
  newCode: () => {
    set({ code: makeCode() });
    save(get());
    if (get().enabled) void connect();
  },
  setServer: (url, key) => {
    set({ url: url.trim(), key: key.trim() });
    save(get());
    if (get().enabled) void connect();
  },
}));

/** MCP address to enter in the AI (claude.ai → Connectors, Claude Desktop, Cursor …) */
export function relayAddress(s: Pick<RelayState, 'url' | 'code'> = useRelay.getState()): string {
  return s.url ? `${s.url.replace(/\/$/, '')}/functions/v1/mapforge-mcp/${s.code}` : '';
}
export const relayConfigured = () => !!(useRelay.getState().url && useRelay.getState().key);

let client: SupabaseClient | null = null;
let channel: RealtimeChannel | null = null;

/** a file (ZIP) cannot travel to a remote AI – it is saved on this device instead */
function localise(r: Result): Result {
  if (!r.ok || r.binary?.kind !== 'file') return r;
  const bytes = Uint8Array.from(atob(r.binary.base64), (c) => c.charCodeAt(0));
  downloadBlob(new Blob([bytes], { type: r.binary.mime }), r.binary.name);
  return { ok: true, text: `${r.text ?? r.binary.name} – auf dem Gerät mit MapForge heruntergeladen (${r.binary.name})`, data: r.data };
}

async function connect() {
  const s = useRelay.getState();
  if (channel && client) {
    await client.removeChannel(channel);
    channel = null;
  }
  if (!s.enabled) return useRelay.setState({ status: 'off' });
  if (!s.url || !s.key) return useRelay.setState({ status: 'error', error: 'Kein KI-Vermittler eingerichtet (Adresse und Schlüssel fehlen).' });
  useRelay.setState({ status: 'connecting', error: null });
  const { createClient } = await import('@supabase/supabase-js');
  client ??= createClient(s.url, s.key, { auth: { persistSession: false } });
  const ch = client.channel(`mapforge-${s.code}`, { config: { broadcast: { self: false } } });
  channel = ch;
  ch.on('broadcast', { event: 'call' }, async ({ payload }) => {
    const { id, command, args } = payload as { id: string; command: string; args: Record<string, unknown> };
    useRelay.setState({ last: command, count: useRelay.getState().count + 1 });
    // __spec: the relay asks for the current command list
    const text = JSON.stringify(command === '__spec' ? { ok: true, data: spec } : localise(await runCommand(command, args ?? {})));
    const n = Math.max(1, Math.ceil(text.length / CHUNK));
    for (let i = 0; i < n; i++) await ch.send({ type: 'broadcast', event: 'result', payload: { id, i, n, data: text.slice(i * CHUNK, (i + 1) * CHUNK) } });
  });
  ch.subscribe((status, err) => {
    if (channel !== ch) return;
    if (status === 'SUBSCRIBED') {
      useRelay.setState({ status: 'connected', error: null });
      useEditor.getState().toast('KI von überall bereit – die KI kann jetzt in dieser App arbeiten', 'success');
    } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') useRelay.setState({ status: 'connecting', error: `Keine Verbindung zum Vermittler – Internet prüfen, es wird weiter versucht${err?.message ? ` (${err.message})` : ''}.` });
    else if (status === 'CLOSED' && useRelay.getState().enabled) useRelay.setState({ status: 'connecting' });
  });
}

let started = false;
export function startRelay() {
  if (started) return;
  started = true;
  if (useRelay.getState().enabled) void connect();
  // phones pause background tabs: reconnect when the app comes back
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' && useRelay.getState().enabled && useRelay.getState().status !== 'connected') void connect();
  });
}
