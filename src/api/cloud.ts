import { listProjects, loadProject, saveProject } from '../persistence/db';
import { deserializeProject, serializeProject } from '../persistence/projectFile';
import { saveNow } from '../persistence/autosave';
import { localEntries } from '../persistence/backup';
import { useProject } from '../store/projectStore';

// MapForge in the cloud (api/cloud.js on Vercel): when no tab of the user is open, the relay runs
// the AI's command in a hidden browser there. That browser starts empty – the runner hands it the
// workspace of the pairing code (maps; builder state goes into localStorage before the app starts),
// runs the command and takes the changed maps back.

/** the page was opened by the cloud runner (no relay, no service worker, no start dialogs) */
export const isCloud = (() => {
  try {
    return new URLSearchParams(location.search).get('cloud') === '1';
  } catch {
    return false;
  }
})();

export interface CloudProject {
  id: string;
  name: string;
  ai: boolean;
  updated_at: number;
  data: string;
}

/** maps as they came from the cloud (id → updatedAt): only what changed goes back */
const base = new Map<string, number>();

export async function cloudLoad(projects: CloudProject[], currentId: string | null): Promise<number> {
  for (const c of projects) {
    const p = deserializeProject(c.data, true);
    await saveProject(p);
    base.set(p.id, p.updatedAt);
  }
  const cur = currentId ? await loadProject(currentId) : null;
  if (cur) useProject.getState().loadProject(cur);
  return projects.length;
}

export async function cloudSave(): Promise<{ projects: CloudProject[]; current: string | null; local: Record<string, string> }> {
  await saveNow();
  const out: CloudProject[] = [];
  for (const s of await listProjects()) {
    // the empty start project of the fresh browser is not part of the workspace
    if (!s.ai && !base.has(s.id)) continue;
    if (base.get(s.id) === s.updatedAt) continue;
    const p = await loadProject(s.id);
    if (p) out.push({ id: p.id, name: p.name, ai: p.createdBy === 'ai', updated_at: p.updatedAt, data: serializeProject(p) });
  }
  const cur = useProject.getState().project;
  return { projects: out, current: base.has(cur.id) || cur.createdBy === 'ai' ? cur.id : null, local: localEntries() };
}
