import { useProject } from '../store/projectStore';
import type { TerrainSet } from '../types';
import { Button, IconButton, Section, Slider, Toggle } from './ui';
import { Icon } from './icons';
import { TerrainFields } from './TerrainFields';
import { uid } from '../utils/id';
import { LAYER_COLORS } from '../layers/defaults';

/** Terrain options + reusable terrain sets (stored in the project). */
export function TerrainPanel() {
  const terrain = useProject((s) => s.project.generator.terrain);
  const sets = useProject((s) => s.project.terrains);
  const update = useProject((s) => s.updateGenerator);
  const setTerrains = useProject((s) => s.setTerrains);
  const change = (id: string, patch: Partial<TerrainSet>) => setTerrains(sets.map((t) => (t.id === id ? { ...t, ...patch } : t)));
  const perspective = useProject((s) => s.project.map.perspective);

  if (perspective === 'side_view' || perspective === 'hex')
    return (
      <div className="panel-scroll">
        <p className="hint side-intro">
          {perspective === 'hex'
            ? 'Bei Hex-Karten stellst du Wasser, Gebirge, Wälder, Flüsse und Klima direkt im Panel „Generator“ ein.'
            : 'In der Seitenansicht stellst du Gruben, Wasser, Lava, Stacheln, Plattformen und Leitern direkt im Panel „Generator“ ein.'}
        </p>
      </div>
    );

  return (
    <div className="panel-scroll">
      <Section title="Gelände">
        <TerrainFields value={terrain} onChange={(t) => update({ terrain: t })} />
      </Section>
      <Section title="Terrain-Sets">
        <p className="hint">Räume bekommen ein Terrain nach Gewichtung. Böden mit dem passenden Tag werden dafür verwendet (z. B. Tag „wood“).</p>
        {sets.map((t) => (
          <div key={t.id} className={`terrain-set${t.active ? ' is-on' : ''}`}>
            <div className="terrain-set-head">
              <input type="color" className="color-dot" value={t.color} aria-label="Farbe" onChange={(e) => change(t.id, { color: e.target.value })} />
              <input className="input input-plain" value={t.name} aria-label="Name" onChange={(e) => change(t.id, { name: e.target.value })} />
              <IconButton label="Terrain-Set löschen" disabled={sets.length <= 1} onClick={() => setTerrains(sets.filter((x) => x.id !== t.id))}>
                <Icon.Trash size={18} />
              </IconButton>
            </div>
            <div className="field">
              <label>Tile-Tag</label>
              <input className="input mono" value={t.tag} onChange={(e) => change(t.id, { tag: e.target.value.trim().toLowerCase() })} />
            </div>
            <Toggle label="Aktiv" checked={t.active} onChange={(v) => change(t.id, { active: v })} />
            {t.active && <Slider label="Gewichtung" value={t.weight} onChange={(v) => change(t.id, { weight: v })} />}
          </div>
        ))}
        <Button
          icon={<Icon.Plus size={18} />}
          onClick={() =>
            setTerrains([...sets, { id: uid('terrain'), name: `Terrain ${sets.length + 1}`, tag: 'stone', color: LAYER_COLORS[sets.length % LAYER_COLORS.length], weight: 20, active: true }])
          }
        >
          Terrain-Set hinzufügen
        </Button>
      </Section>
    </div>
  );
}

/** reusable terrain sets (floor materials per room) – inside the generator panel */
export function TerrainSets() {
  const sets = useProject((s) => s.project.terrains);
  const setTerrains = useProject((s) => s.setTerrains);
  const change = (id: string, patch: Partial<TerrainSet>) => setTerrains(sets.map((t) => (t.id === id ? { ...t, ...patch } : t)));
  return (
    <>
        <p className="hint">Räume bekommen ein Terrain nach Gewichtung. Böden mit dem passenden Tag werden dafür verwendet (z. B. Tag „wood“).</p>
        {sets.map((t) => (
          <div key={t.id} className={`terrain-set${t.active ? ' is-on' : ''}`}>
            <div className="terrain-set-head">
              <input type="color" className="color-dot" value={t.color} aria-label="Farbe" onChange={(e) => change(t.id, { color: e.target.value })} />
              <input className="input input-plain" value={t.name} aria-label="Name" onChange={(e) => change(t.id, { name: e.target.value })} />
              <IconButton label="Terrain-Set löschen" disabled={sets.length <= 1} onClick={() => setTerrains(sets.filter((x) => x.id !== t.id))}>
                <Icon.Trash size={18} />
              </IconButton>
            </div>
            <div className="field">
              <label>Tile-Tag</label>
              <input className="input mono" value={t.tag} onChange={(e) => change(t.id, { tag: e.target.value.trim().toLowerCase() })} />
            </div>
            <Toggle label="Aktiv" checked={t.active} onChange={(v) => change(t.id, { active: v })} />
            {t.active && <Slider label="Gewichtung" value={t.weight} onChange={(v) => change(t.id, { weight: v })} />}
          </div>
        ))}
        <Button
          icon={<Icon.Plus size={18} />}
          onClick={() =>
            setTerrains([...sets, { id: uid('terrain'), name: `Terrain ${sets.length + 1}`, tag: 'stone', color: LAYER_COLORS[sets.length % LAYER_COLORS.length], weight: 20, active: true }])
          }
        >
          Terrain-Set hinzufügen
        </Button>
    </>
  );
}
