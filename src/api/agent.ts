import { create } from 'zustand';
import { runCommand } from './commands';
import { shrinkImage } from './describe';
import { saveNow } from '../persistence/autosave';

// The building AI: api/agent.js asks Claude (Vercel AI Gateway) what to do next; the tools it
// picks are MapForge commands and run right here in the app (runCommand, same as the MCP bridge).
// Results – text and pictures of the map – go back to the model until it is done.

type Block =
  | { type: 'text'; text: string }
  | { type: 'image'; source: { type: 'base64'; media_type: string; data: string } }
  | { type: 'tool_use'; id: string; name: string; input: Record<string, unknown> }
  | { type: 'tool_result'; tool_use_id: string; content: Block[] | string; is_error?: boolean };
interface Message {
  role: 'user' | 'assistant';
  content: Block[];
}

const STEP: Record<string, string> = {
  status: 'Schaut sich das Projekt an',
  new_map: 'Legt die Karte an',
  generate: 'Generiert die Karte',
  get_generator: 'Liest die Einstellungen',
  set_generator: 'Ändert die Einstellungen',
  list_tiles: 'Sucht passende Tiles',
  tileset_list: 'Schaut sich die Tilesets an',
  tileset_render: 'Schaut sich dein Tileset an',
  tileset_assign: 'Ordnet Tiles zu',
  tileset_auto_assign: 'Ordnet Tiles automatisch zu',
  tileset_update: 'Stellt ein Tileset ein',
  tileset_recut: 'Schneidet das Tileset neu',
  tileset_mark_room: 'Baut einen Raum aus dem Tileset',
  list_layers: 'Schaut sich die Layer an',
  get_map: 'Liest die Karte',
  paint: 'Malt',
  fill: 'Füllt eine Fläche',
  clear_area: 'Räumt eine Fläche frei',
  copy_paste: 'Kopiert einen Bereich',
  list_objects: 'Schaut sich die Objekte an',
  place_object: 'Setzt ein Objekt',
  remove_object: 'Entfernt ein Objekt',
  set_layer: 'Stellt einen Layer ein',
  undo: 'Macht einen Schritt rückgängig',
  redo: 'Stellt einen Schritt wieder her',
  render: 'Prüft das Ergebnis',
  figure_new: 'Legt eine neue Figur an',
  figure_parts: 'Schaut sich die Bauteile an',
  figure_status: 'Schaut sich die Figur an',
  figure_set_part: 'Setzt ein Bauteil ein',
  figure_color: 'Wählt die Farben',
  figure_draw: 'Zeichnet Pixel',
  figure_grid: 'Liest die Pixel',
  figure_render: 'Prüft die Figur',
  figure_save: 'Speichert die Figur',
  figure_to_map: 'Stellt eine Figur auf die Karte',
  figure_use_as_player: 'Macht die Figur zur Spielfigur',
};
const stepLabel = (name: string) => STEP[name] ?? (name.startsWith('figure_') ? 'Baut eine Figur' : name);

interface AgentState {
  running: boolean;
  step: string;
  steps: number;
  stop: boolean;
}
export const useAgent = create<AgentState>(() => ({ running: false, step: '', steps: 0, stop: false }));
export const stopAgent = () => useAgent.setState({ stop: true, step: 'Wird gestoppt …' });

const MAX_TURNS = 20;
/** figures take more careful steps (draw, look, improve) */
const MAX_TURNS_FIGURES = 32;

/** Einstellungen → KI: "standard" (Claude Sonnet, gründlich) or "sparsam" (Claude Haiku, about half the price) */
export type AiMode = 'standard' | 'sparsam';
export function aiMode(): AiMode {
  try {
    return localStorage.getItem('mapforge.aiMode') === 'sparsam' ? 'sparsam' : 'standard';
  } catch {
    return 'standard';
  }
}
export function setAiMode(mode: AiMode) {
  try {
    localStorage.setItem('mapforge.aiMode', mode);
  } catch {
    // not remembered
  }
}
/** "≈ 12 ct" for a cost in US$ (shown after a run) */
export const formatCost = (usd: number) => (usd < 0.005 ? '< 1 ct' : `≈ ${Math.max(1, Math.round(usd * 100))} ct`);
const MAX_TEXT = 6000;

async function imageBlock(dataUrl: string, max = 1024): Promise<Block> {
  const small = await shrinkImage(dataUrl, max, 'image/jpeg');
  const [, mime, data] = /^data:([^;]+);base64,(.+)$/.exec(small) ?? [];
  return { type: 'image', source: { type: 'base64', media_type: mime ?? 'image/jpeg', data: data ?? '' } };
}

/** older pictures leave the history (keeps requests small); the first message keeps its references */
function prune(messages: Message[]) {
  let kept = 0;
  for (let m = messages.length - 1; m > 0; m--)
    for (const b of messages[m].content)
      if (b.type === 'tool_result' && Array.isArray(b.content) && b.content.some((c) => c.type === 'image')) {
        if (kept++ < 1) continue;
        b.content = b.content.map((c) => (c.type === 'image' ? { type: 'text', text: '[älteres Bild entfernt]' } : c));
      }
}

async function step(messages: Message[], focus?: 'figures'): Promise<{ content: Block[]; stop_reason: string; cost: number }> {
  let r: Response;
  try {
    r = await fetch('/api/agent', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ messages, mode: aiMode(), focus }) });
  } catch {
    throw new Error('Keine Verbindung zum Server – bist du online?');
  }
  const out = (await r.json().catch(() => null)) as { ok: boolean; content?: Block[]; stop_reason?: string; cost?: number; error?: string } | null;
  if (!out) throw new Error(r.status === 404 ? 'Die KI gibt es nur in der veröffentlichten App (Vercel)' : `Serverfehler (${r.status})`);
  if (!out.ok) throw new Error(out.error ?? 'Die KI hat nicht geantwortet');
  return { content: out.content ?? [], stop_reason: out.stop_reason ?? 'end_turn', cost: out.cost ?? 0 };
}

/**
 * Let the AI build: `task` in words, `images` as references (reference picture, own tileset …).
 * Returns the AI's closing words. Progress in useAgent (banner with a stop button).
 */
export async function runAgent(task: string, images: { label: string; dataUrl: string }[] = [], opts: { focus?: 'figures' } = {}): Promise<{ text: string; cost: number; stopped: boolean }> {
  if (useAgent.getState().running) throw new Error('Die KI baut gerade schon');
  useAgent.setState({ running: true, step: 'Die KI überlegt …', steps: 0, stop: false });
  const first: Block[] = [];
  for (const im of images) first.push({ type: 'text', text: `${im.label}:` }, await imageBlock(im.dataUrl, 768));
  first.push({ type: 'text', text: task });
  const messages: Message[] = [{ role: 'user', content: first }];
  let summary = '';
  let cost = 0;
  try {
    for (let turn = 0; turn < (opts.focus === 'figures' ? MAX_TURNS_FIGURES : MAX_TURNS); turn++) {
      if (useAgent.getState().stop) break;
      const { content, stop_reason, cost: c } = await step(messages, opts.focus);
      cost += c;
      messages.push({ role: 'assistant', content });
      summary = content.filter((b): b is Extract<Block, { type: 'text' }> => b.type === 'text').map((b) => b.text).join('\n').trim() || summary;
      const calls = content.filter((b): b is Extract<Block, { type: 'tool_use' }> => b.type === 'tool_use');
      if (stop_reason !== 'tool_use' || !calls.length) break;
      const results: Block[] = [];
      for (const call of calls) {
        if (useAgent.getState().stop) {
          results.push({ type: 'tool_result', tool_use_id: call.id, content: 'Vom Nutzer gestoppt', is_error: true });
          continue;
        }
        useAgent.setState((s) => ({ step: stepLabel(call.name), steps: s.steps + 1 }));
        const res = await runCommand(call.name, call.input ?? {});
        const parts: Block[] = [];
        if (!res.ok) parts.push({ type: 'text', text: res.error });
        else {
          const text = [res.text, res.data !== undefined ? JSON.stringify(res.data) : ''].filter(Boolean).join('\n');
          if (text) parts.push({ type: 'text', text: text.length > MAX_TEXT ? `${text.slice(0, MAX_TEXT)} … (gekürzt)` : text });
          // pictures cost tokens: maps small (the AI can zoom into an area), tilesets readable
          if (res.binary?.kind === 'image') parts.push(await imageBlock(`data:${res.binary.mime};base64,${res.binary.base64}`, call.name === 'tileset_render' || call.name === 'figure_render' ? 1100 : 768));
          if (!parts.length) parts.push({ type: 'text', text: 'ok' });
        }
        results.push({ type: 'tool_result', tool_use_id: call.id, content: parts, is_error: !res.ok || undefined });
      }
      messages.push({ role: 'user', content: results });
      prune(messages);
    }
    await saveNow();
    return { text: summary, cost, stopped: useAgent.getState().stop };
  } finally {
    useAgent.setState({ running: false, step: '', stop: false });
  }
}
