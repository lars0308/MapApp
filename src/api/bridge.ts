import { create } from 'zustand';
import { COMMANDS, runCommand, spec, type Args } from './commands';
import { useEditor } from '../store/editorStore';
import { listProjects, loadProject, saveProject } from '../persistence/db';
import { deserializeProject, serializeProject } from '../persistence/projectFile';
import { saveNow } from '../persistence/autosave';

// Connection to the MapForge MCP server (mcp/server.mjs) on this computer: the server gives an
// AI tools, the tools arrive here over a WebSocket and run in this tab – the user watches the
// AI work. Only on when the user switches it on (settings) or opens the app with ?ai=ws://….

export const DEFAULT_AI_URL = 'ws://127.0.0.1:8765';
const KEY = 'mapforge.ai';

type Status = 'off' | 'connecting' | 'connected';

interface AiState {
  enabled: boolean;
  url: string;
  status: Status;
  /** last command the AI ran (shown in the badge) */
  last: string | null;
  count: number;
  error: string | null;
  setEnabled: (v: boolean) => void;
  setUrl: (url: string) => void;
}

function readStored(): { enabled: boolean; url: string } {
  // ?ai=ws://127.0.0.1:8765 (or ?ai=1) switches it on for this visit – the MCP server opens the app like this
  try {
    const q = new URLSearchParams(location.search).get('ai');
    if (q) return { enabled: true, url: q.startsWith('ws') ? q : DEFAULT_AI_URL };
    const s = JSON.parse(localStorage.getItem(KEY) ?? 'null');
    if (s && typeof s.url === 'string') return { enabled: !!s.enabled, url: s.url };
  } catch {
    // ignore
  }
  return { enabled: false, url: DEFAULT_AI_URL };
}

const store = (s: { enabled: boolean; url: string }) => {
  try {
    localStorage.setItem(KEY, JSON.stringify(s));
  } catch {
    // not stored
  }
};

export const useAi = create<AiState>((set, get) => ({
  ...readStored(),
  status: 'off',
  last: null,
  count: 0,
  error: null,
  setEnabled: (enabled) => {
    set({ enabled, error: null });
    store({ enabled, url: get().url });
    connect();
  },
  setUrl: (url) => {
    set({ url: url.trim() || DEFAULT_AI_URL });
    store({ enabled: get().enabled, url: get().url });
    if (get().enabled) connect();
  },
}));

/** the MCP server's own invisible browser (opened with &hidden=1) */
const isHidden = (() => {
  try {
    return new URLSearchParams(location.search).get('hidden') === '1';
  } catch {
    return false;
  }
})();

async function exportProjects() {
  await saveNow();
  const all = await listProjects();
  const projects: string[] = [];
  for (const s of all) {
    // only the AI's own maps (not the empty start project of the hidden browser)
    const p = s.ai ? await loadProject(s.id) : null;
    if (p) projects.push(serializeProject(p));
  }
  return { ok: true, data: { projects } };
}

async function importProjects(texts: string[]) {
  let added = 0;
  for (const t of texts) {
    try {
      const p = deserializeProject(t, true);
      const have = await loadProject(p.id);
      if (have && have.updatedAt >= p.updatedAt) continue;
      await saveProject(p);
      added++;
    } catch {
      // skip broken entries
    }
  }
  if (added) useEditor.getState().toast(`${added} Karte(n) der KI übernommen – unter Karte → „Gespeicherte Karten“`, 'success');
  return { ok: true, data: { added } };
}

let ws: WebSocket | null = null;
let retry = 0;
let started = false;

function connect() {
  clearTimeout(retry);
  if (ws) {
    ws.onclose = null;
    ws.close();
    ws = null;
  }
  const { enabled, url } = useAi.getState();
  if (!enabled) {
    useAi.setState({ status: 'off' });
    return;
  }
  useAi.setState({ status: 'connecting' });
  let sock: WebSocket;
  try {
    sock = new WebSocket(url);
  } catch (e) {
    useAi.setState({ status: 'connecting', error: (e as Error).message });
    retry = window.setTimeout(connect, 3000);
    return;
  }
  ws = sock;
  sock.onopen = () => {
    useAi.setState({ status: 'connected', error: null });
    sock.send(JSON.stringify({ type: 'hello', app: 'mapforge', version: spec.version, commands: COMMANDS, hidden: isHidden }));
    useEditor.getState().toast('KI verbunden – sie kann jetzt Karten und Figuren bearbeiten', 'success');
  };
  sock.onmessage = async (ev) => {
    let msg: { id?: string | number; command?: string; args?: Args };
    try {
      msg = JSON.parse(String(ev.data));
    } catch {
      return;
    }
    if (!msg.command) return;
    // server-internal: hand the maps of the hidden browser over to the tab the user sees
    if (msg.command === '__export_projects' || msg.command === '__import_projects') {
      const result = await (msg.command === '__export_projects' ? exportProjects() : importProjects((msg.args?.projects as string[]) ?? []));
      if (sock.readyState === WebSocket.OPEN) sock.send(JSON.stringify({ id: msg.id, result }));
      return;
    }
    useAi.setState({ last: msg.command, count: useAi.getState().count + 1 });
    const result = await runCommand(msg.command, msg.args ?? {});
    if (sock.readyState === WebSocket.OPEN) sock.send(JSON.stringify({ id: msg.id, result }));
  };
  sock.onclose = () => {
    if (ws !== sock) return;
    ws = null;
    const was = useAi.getState().status === 'connected';
    useAi.setState({ status: useAi.getState().enabled ? 'connecting' : 'off' });
    if (was) useEditor.getState().toast('KI-Verbindung getrennt – versuche es weiter');
    // the server may start later: keep trying while switched on
    if (useAi.getState().enabled) retry = window.setTimeout(connect, 3000);
  };
  sock.onerror = () => {
    useAi.setState({ error: `Kein KI-Server unter ${url} – läuft der MapForge-KI-Server (node mcp/server.mjs)?` });
  };
}

/** start once at app start (connects only when switched on) */
export function startAiBridge() {
  if (started) return;
  started = true;
  connect();
  // console / other scripts: window.mapforge.run('status')
  (window as unknown as Record<string, unknown>).mapforge = { run: runCommand, commands: COMMANDS, spec };
}
