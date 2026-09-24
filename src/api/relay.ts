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
    // the cloud follows the switch
    void setCloud(get(), enabled);
  },
  newCode: () => {
    // the old address stops working in the cloud too
    void setCloud(get(), false);
    set({ code: makeCode() });
    save(get());
    if (get().enabled) {
      void connect();
      void setCloud(get(), true);
    }
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
/** switch the cloud workspace of a code on / off */
async function setCloud(s: Pick<RelayState, 'url' | 'code'>, enabled: boolean) {
  if (!s.url) return;
  try {
    await fetch(`${relayAddress(s)}/store`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ enabled }) });
  } catch {
    // offline: the next sync is not affected
  }
}
export const relayConfigured = () => !!(useRelay.getState().url && useRelay.getState().key);

let client: SupabaseClient | null = null;
const canceled = new Set<string>();
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
  ch.on('broadcast', { event: 'cancel' }, ({ payload }) => {
    canceled.add(String((payload as { id: string }).id));
  });
  ch.on('broadcast', { event: 'call' }, async ({ payload }) => {
    const { id, command, args } = payload as { id: string; command: string; args: Record<string, unknown> };
    // "I am here" at once – without it the relay runs the command in the cloud instead
    await ch.send({ type: 'broadcast', event: 'ack', payload: { id } });
    await new Promise((r) => setTimeout(r, 0));
    if (canceled.delete(id)) return; // answered too late (sleeping tab): the cloud does it
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
      void syncCloud();
    } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') useRelay.setState({ status: 'connecting', error: `Keine Verbindung zum Vermittler – Internet prüfen, es wird weiter versucht${err?.message ? ` (${err.message})` : ''}.` });
    else if (status === 'CLOSED' && useRelay.getState().enabled) useRelay.setState({ status: 'connecting' });
  });
}

/* ------------------------------------------------------------------ cloud workspace sync
 * While no MapForge tab is open, the AI works in MapForge in the cloud (api/cloud.js) on the
 * workspace of the pairing code. The app brings the AI's maps here and sends its own maps (and
 * figures) there, so both sides see the same maps. Newest version of a map wins. */

const SYNC_KEY = 'mapforge.relay.sync';
interface SyncState {
  code: string;
  /** newest cloud change already taken */
  pulled: number;
  /** map id → updatedAt known to be in the cloud */
  sent: Record<string, number>;
  /** figures etc.: hash per stored entry at the last sync (base of the three-way merge) */
  localHashes?: Record<string, string>;
  /** older versions */
  localSig?: string;
}
const readSync = (code: string): SyncState => {
  try {
    const s = JSON.parse(localStorage.getItem(SYNC_KEY) ?? 'null') as SyncState | null;
    if (s?.code === code) return s;
  } catch {
    // ignore
  }
  return { code, pulled: 0, sent: {}, localHashes: {} };
};
const writeSync = (s: SyncState) => {
  try {
    localStorage.setItem(SYNC_KEY, JSON.stringify(s));
  } catch {
    // not stored
  }
};

const GALLERY_KEY = 'mapforge.sprite.gallery.v1';

/** short content hash (FNV-1a + length) – only to see whether an entry changed */
function hashText(v: string | undefined): string {
  if (v === undefined) return '';
  let h = 0x811c9dc5;
  for (let i = 0; i < v.length; i++) h = Math.imul(h ^ v.charCodeAt(i), 0x01000193);
  return `${v.length}:${(h >>> 0).toString(36)}`;
}

/** gallery changed on both sides: keep every figure (same id → this device's version) */
function mergeGallery(local: string | undefined, cloud: string): string {
  try {
    const mine = JSON.parse(local ?? '[]') as { doc: { id: string } }[];
    const theirs = JSON.parse(cloud) as { doc: { id: string } }[];
    const ids = new Set(mine.map((g) => g.doc.id));
    return JSON.stringify([...mine, ...theirs.filter((g) => !ids.has(g.doc.id))]);
  } catch {
    return local ?? cloud;
  }
}

let syncing = false;
export async function syncCloud(): Promise<void> {
  const r = useRelay.getState();
  if (syncing || !r.enabled || !r.url) return;
  syncing = true;
  try {
    const base = `${relayAddress(r)}/store`;
    const st = readSync(r.code);
    const [{ listProjects, loadProject, saveProject }, { deserializeProject, serializeProject }, { localEntries }, { useProject }] = await Promise.all([
      import('../persistence/db'),
      import('../persistence/projectFile'),
      import('../persistence/backup'),
      import('../store/projectStore'),
    ]);
    // 1. the AI's maps from the cloud
    const res = await fetch(`${base}?since=${st.pulled}`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const got = (await res.json()) as { projects: { id: string; updated_at: number; data: string }[] };
    let added = 0;
    for (const c of got.projects ?? []) {
      st.pulled = Math.max(st.pulled, c.updated_at);
      st.sent[c.id] = c.updated_at;
      const have = await loadProject(c.id);
      if (have && have.updatedAt >= c.updated_at) continue;
      const p = deserializeProject(c.data, true);
      await saveProject(p);
      added++;
      // the open map changed in the cloud: show the new version
      if (useProject.getState().project.id === p.id) useProject.getState().loadProject(p);
    }
    if (added) useEditor.getState().toast(`${added} Karte(n) von der KI aus der Cloud übernommen – unter Karte → „Gespeicherte Karten“`, 'success');
    // 2. own maps (new or changed) to the cloud, one per request
    for (const s of await listProjects()) {
      if (st.sent[s.id] === s.updatedAt) continue;
      const p = await loadProject(s.id);
      // an empty start project is nothing to work on
      if (!p || (p.mode === 'generate' && !p.result && !p.objects.length && p.layers.every((l) => !l.data.some(Boolean)))) continue;
      const body = JSON.stringify({ projects: [{ id: p.id, name: p.name, ai: p.createdBy === 'ai', updated_at: p.updatedAt, data: serializeProject(p) }] });
      const put = await fetch(base, { method: 'POST', headers: { 'content-type': 'application/json' }, body });
      if (!put.ok) throw new Error(`HTTP ${put.status}`);
      st.sent[s.id] = s.updatedAt;
    }
    // 3. figures and builder state (gallery, parts, palettes, open figures): three-way merge with
    //    the state of the last sync – changed only in the cloud (the AI) → here, changed only here →
    //    there, changed on both sides → the gallery is merged, otherwise this device wins
    const cloud = (got as { local?: Record<string, string> }).local ?? {};
    const local = localEntries();
    const baseHashes = st.localHashes ?? {};
    const merged: Record<string, string> = { ...local };
    let fromCloud = 0;
    for (const key of new Set([...Object.keys(local), ...Object.keys(cloud)])) {
      const lv = local[key];
      const cv = cloud[key];
      if (lv === cv || cv === undefined) continue;
      const localChanged = hashText(lv) !== (baseHashes[key] ?? '');
      const cloudChanged = hashText(cv) !== (baseHashes[key] ?? '');
      if (cloudChanged && !localChanged) {
        merged[key] = cv;
        fromCloud++;
      } else if (cloudChanged && key === GALLERY_KEY) {
        merged[key] = mergeGallery(lv, cv);
        if (merged[key] !== lv) fromCloud++;
      }
    }
    if (fromCloud) {
      for (const [k, v] of Object.entries(merged)) if (local[k] !== v) localStorage.setItem(k, v);
      const { reloadSpritesFromStorage } = await import('../sprites/store');
      reloadSpritesFromStorage();
      useEditor.getState().toast('Figuren-Änderungen der KI übernommen', 'success');
    }
    const hashes = Object.fromEntries(Object.entries(merged).map(([k, v]) => [k, hashText(v)]));
    const cloudSame = Object.keys(merged).length === Object.keys(cloud).length && Object.entries(merged).every(([k, v]) => cloud[k] === v);
    if (!cloudSame) {
      const put = await fetch(base, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ projects: [], local: merged, current: useProject.getState().project.id }) });
      if (put.ok) st.localHashes = hashes;
    } else st.localHashes = hashes;
    writeSync(st);
  } catch (e) {
    console.warn('MapForge: Cloud-Abgleich fehlgeschlagen', e);
  } finally {
    syncing = false;
  }
}

let started = false;
export function startRelay() {
  if (started) return;
  started = true;
  if (useRelay.getState().enabled) void connect();
  // phones pause background tabs: reconnect when the app comes back (and fetch what the AI did meanwhile)
  document.addEventListener('visibilitychange', () => {
    if (!useRelay.getState().enabled) return;
    if (document.visibilityState === 'visible' && useRelay.getState().status !== 'connected') void connect();
    else void syncCloud();
  });
  // keep the cloud copy fresh while the app is open
  setInterval(() => {
    if (useRelay.getState().status === 'connected') void syncCloud();
  }, 120_000);
}
