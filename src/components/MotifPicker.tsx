import { MOTIFS, type Motif } from '../generator/motifs';
import { DEFAULT_MAP } from '../generator/presets';
import { randomSeed } from '../generator/rng';
import { createProject, useProject } from '../store/projectStore';
import { useEditor } from '../store/editorStore';
import { useApp } from '../store/appStore';
import { saveNow } from '../persistence/autosave';
import { IconButton } from './ui';
import { Icon } from './icons';

/** the motif cards (small things instead of a whole map) */
export function MotifGrid({ onPick, current }: { onPick: (m: Motif) => void; current?: string }) {
  return (
    <div className="motif-grid" role="list">
      {MOTIFS.map((m) => (
        <button key={m.id} type="button" role="listitem" className={`motif-card${current === m.id ? ' is-active' : ''}`} onClick={() => onPick(m)}>
          <span className="motif-icon" aria-hidden="true">
            {m.icon}
          </span>
          <strong>{m.label}</strong>
          <small>{m.text}</small>
          <span className="motif-size">
            {m.width} × {m.height}
          </span>
        </button>
      ))}
    </div>
  );
}

/** a new project with just this motif (start page) */
export async function createMotif(m: Motif) {
  await saveNow();
  const project = createProject(m.label, { map: { ...DEFAULT_MAP, width: m.width, height: m.height, perspective: 'top_down' }, generator: m.settings(randomSeed()) });
  useProject.getState().loadProject(project);
  await useProject.getState().runGenerate();
  await saveNow();
  useApp.getState().goTo('map');
  useEditor.getState().toast(`„${m.label}“ erstellt – mit Generieren bekommst du eine neue Variante`, 'success');
}

/** the current map becomes this motif (Aufbau panel) – keeps tilesets and view */
export async function applyMotif(m: Motif) {
  const st = useProject.getState();
  st.setMapSize(m.width, m.height);
  st.updateGenerator(m.settings(randomSeed()));
  await useProject.getState().runGenerate();
  useEditor.getState().toast(`„${m.label}“ gebaut – mit Generieren bekommst du eine neue Variante`, 'success');
}

/** start page dialog: pick a motif, it is created right away */
export function MotifDialog({ onClose }: { onClose: () => void }) {
  return (
    <div className="quick-pick-backdrop" role="presentation" onClick={onClose}>
      <div className="quick-pick motif-dialog" role="dialog" aria-label="Kleines Motiv erstellen" onClick={(e) => e.stopPropagation()}>
        <header className="quick-pick-head">
          <div>
            <strong>Kleines Motiv</strong>
            <span className="quick-pick-current">Nur ein Teil statt einer ganzen Karte – antippen, fertig. Alles bleibt danach änderbar.</span>
          </div>
          <IconButton label="Schließen" onClick={onClose}>
            <Icon.Close size={18} />
          </IconButton>
        </header>
        <div className="quick-pick-body">
          <MotifGrid
            onPick={(m) => {
              onClose();
              void createMotif(m);
            }}
          />
        </div>
      </div>
    </div>
  );
}
