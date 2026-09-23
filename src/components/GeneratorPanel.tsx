import { useProject } from '../store/projectStore';
import { useEditor } from '../store/editorStore';
import { PRESETS } from '../generator/presets';
import type { Distribution, GeneratorSettings, RoomShape, SpecialRoomType } from '../types';
import { Chip, IconButton, NumberField, Section, Segmented, Slider } from './ui';
import { Icon } from './icons';
import { copyText } from '../utils/clipboard';
import { randomSeed } from '../generator/rng';
import { COMMON_TILE_SIZES } from '../tilesets/slicing';
import { Stats } from './Stats';

const SHAPES: { id: RoomShape; label: string }[] = [
  { id: 'rect', label: 'Rechteck' },
  { id: 'l', label: 'L-Form' },
  { id: 't', label: 'T-Form' },
  { id: 'cross', label: 'Kreuz' },
  { id: 'irregular', label: 'Unregelmäßig' },
  { id: 'hall', label: 'Große Halle' },
];

const DISTRIBUTIONS: { value: Distribution; label: string }[] = [
  { value: 'even', label: 'Gleichmäßig' },
  { value: 'random', label: 'Zufällig' },
  { value: 'cluster', label: 'Cluster' },
  { value: 'center', label: 'Zentrum' },
  { value: 'spread', label: 'Weit verteilt' },
];

const CORRIDOR_OPTS: { id: keyof GeneratorSettings['corridor']; label: string }[] = [
  { id: 'straight', label: 'Gerade Wege' },
  { id: 'curves', label: 'Kurven' },
  { id: 'branches', label: 'Abzweigungen' },
  { id: 'deadEnds', label: 'Sackgassen' },
  { id: 'loops', label: 'Schleifen' },
  { id: 'alternatives', label: 'Alternative Verbindungen' },
];

export const SPECIALS: { id: SpecialRoomType; label: string; color: string }[] = [
  { id: 'start', label: 'Start', color: '#7fc59a' },
  { id: 'end', label: 'Ende', color: '#6fa6d6' },
  { id: 'boss', label: 'Boss', color: '#d0616b' },
  { id: 'treasure', label: 'Schatz', color: '#d9b45b' },
  { id: 'secret', label: 'Geheim', color: '#8a8595' },
  { id: 'merchant', label: 'Händler', color: '#c89078' },
  { id: 'quest', label: 'Quest', color: '#b48ad6' },
  { id: 'arena', label: 'Arena', color: '#e0875a' },
  { id: 'puzzle', label: 'Rätsel', color: '#5fb8b0' },
];

export function SeedField() {
  const seed = useProject((s) => s.project.generator.seed);
  const update = useProject((s) => s.updateGenerator);
  const toast = useEditor((s) => s.toast);
  return (
    <div className="field">
      <label htmlFor="seed-input">Seed</label>
      <div className="seed-row">
        <input
          id="seed-input"
          className="input mono"
          value={seed}
          spellCheck={false}
          autoComplete="off"
          onChange={(e) => update({ seed: e.target.value.slice(0, 40) })}
        />
        <IconButton
          label="Seed kopieren"
          onClick={async () => toast((await copyText(seed)) ? 'Seed kopiert' : 'Kopieren nicht möglich', 'success')}
        >
          <Icon.Copy size={18} />
        </IconButton>
        <IconButton label="Zufälliger Seed" onClick={() => update({ seed: randomSeed() })}>
          <Icon.Dice size={18} />
        </IconButton>
      </div>
    </div>
  );
}

export function MapSettingsFields() {
  const map = useProject((s) => s.project.map);
  const setMapSize = useProject((s) => s.setMapSize);
  const setTileSize = useProject((s) => s.setTileSize);
  const custom = !COMMON_TILE_SIZES.includes(map.tileSize);
  return (
    <>
      <div className="grid-2">
        <NumberField label="Breite" value={map.width} min={16} max={256} step={1} suffix="Tiles" onChange={(w) => setMapSize(w, map.height)} />
        <NumberField label="Höhe" value={map.height} min={16} max={256} step={1} suffix="Tiles" onChange={(h) => setMapSize(map.width, h)} />
      </div>
      <div className="field">
        <label>Tilegröße</label>
        <Segmented
          label="Tilegröße"
          value={custom ? 'custom' : String(map.tileSize)}
          options={[...COMMON_TILE_SIZES.map((s) => ({ value: String(s), label: String(s) })), { value: 'custom', label: 'Frei' }]}
          onChange={(v) => setTileSize(v === 'custom' ? (custom ? map.tileSize : 24) : Number(v))}
        />
      </div>
      {custom && <NumberField label="Freie Tilegröße" value={map.tileSize} min={4} max={256} suffix="px" onChange={setTileSize} />}
      <div className="derived">
        <span>
          {map.width} × {map.height} Tiles · {map.tileSize} px
        </span>
        <strong>
          {map.width * map.tileSize} × {map.height * map.tileSize} px
        </strong>
      </div>
    </>
  );
}

export function GeneratorPanel() {
  const g = useProject((s) => s.project.generator);
  const update = useProject((s) => s.updateGenerator);
  const applyPreset = useProject((s) => s.applyPreset);

  const setShape = (id: RoomShape) => {
    const next = { ...g.shapes, [id]: !g.shapes[id] };
    if (!Object.values(next).some(Boolean)) return; // at least one shape
    update({ shapes: next });
  };

  return (
    <div className="panel-scroll">
      <Stats />
      <Section title="Presets">
        <div className="chips">
          {PRESETS.map((p) => (
            <Chip key={p.id} active={false} onClick={() => applyPreset(p.id)}>
              {p.label}
            </Chip>
          ))}
        </div>
      </Section>

      <Section title="Map">
        <SeedField />
        <MapSettingsFields />
      </Section>

      <Section title="Räume">
        <Slider label="Anzahl" value={g.roomCount} min={2} max={60} onChange={(v) => update({ roomCount: v })} />
        <div className="grid-2">
          <NumberField label="Min. Breite" value={g.roomMinW} min={3} max={g.roomMaxW} onChange={(v) => update({ roomMinW: v })} />
          <NumberField label="Max. Breite" value={g.roomMaxW} min={g.roomMinW} max={60} onChange={(v) => update({ roomMaxW: v })} />
          <NumberField label="Min. Höhe" value={g.roomMinH} min={3} max={g.roomMaxH} onChange={(v) => update({ roomMinH: v })} />
          <NumberField label="Max. Höhe" value={g.roomMaxH} min={g.roomMinH} max={60} onChange={(v) => update({ roomMaxH: v })} />
        </div>
        <Slider label="Mindestabstand" value={g.roomSpacing} min={1} max={12} unit=" Tiles" onChange={(v) => update({ roomSpacing: v })} />
        <div className="field">
          <label>Verteilung</label>
          <div className="chips">
            {DISTRIBUTIONS.map((d) => (
              <Chip key={d.value} active={g.distribution === d.value} onClick={() => update({ distribution: d.value })}>
                {d.label}
              </Chip>
            ))}
          </div>
        </div>
        <div className="field">
          <label>Raumformen</label>
          <div className="chips">
            {SHAPES.map((s) => (
              <Chip key={s.id} active={g.shapes[s.id]} onClick={() => setShape(s.id)}>
                {s.label}
              </Chip>
            ))}
          </div>
        </div>
        <Slider
          label="Unregelmäßigkeit"
          value={g.irregularity}
          unit=" %"
          hint={['Sauber', 'Unregelmäßig']}
          onChange={(v) => update({ irregularity: v })}
        />
      </Section>

      <Section title="Wege">
        <div className="grid-3">
          <NumberField label="Breite" value={g.corridorWidth} min={1} max={6} onChange={(v) => update({ corridorWidth: v, corridorMinWidth: Math.min(g.corridorMinWidth, v), corridorMaxWidth: Math.max(g.corridorMaxWidth, v) })} />
          <NumberField label="Min." value={g.corridorMinWidth} min={1} max={g.corridorMaxWidth} onChange={(v) => update({ corridorMinWidth: v })} />
          <NumberField label="Max." value={g.corridorMaxWidth} min={g.corridorMinWidth} max={6} onChange={(v) => update({ corridorMaxWidth: v })} />
        </div>
        <Slider label="Verwinkelung" value={g.twistiness} unit=" %" hint={['Direkt', 'Verwinkelt']} onChange={(v) => update({ twistiness: v })} />
        <Slider label="Direktheit" value={g.directness} unit=" %" hint={['Umwege', 'Direkt']} onChange={(v) => update({ directness: v })} />
        <div className="chips">
          {CORRIDOR_OPTS.map((o) => (
            <Chip key={o.id} active={g.corridor[o.id]} onClick={() => update({ corridor: { ...g.corridor, [o.id]: !g.corridor[o.id] } })}>
              {o.label}
            </Chip>
          ))}
        </div>
      </Section>

      <Section title="Vernetzung">
        <Slider label="Linear ↔ Vernetzt" value={g.connectivity} unit=" %" hint={['Linear', 'Vernetzt']} onChange={(v) => update({ connectivity: v })} />
      </Section>

      <Section title="Spezialräume">
        <div className="chips">
          {SPECIALS.map((s) => (
            <Chip key={s.id} color={s.color} active={g.specials[s.id]} onClick={() => update({ specials: { ...g.specials, [s.id]: !g.specials[s.id] } })}>
              {s.label}
            </Chip>
          ))}
        </div>
      </Section>

      <Section title="Ausstattung" defaultOpen={false}>
        <Slider label="Boden-Varianten" value={g.floorVariation} unit=" %" onChange={(v) => update({ floorVariation: v })} />
        <Slider label="Deko" value={g.decoDensity} unit=" %" onChange={(v) => update({ decoDensity: v })} />
        <Slider label="Hindernisse" value={g.obstacleDensity} unit=" %" onChange={(v) => update({ obstacleDensity: v })} />
        <Slider label="Lava / Wasser" value={g.hazards} unit=" %" onChange={(v) => update({ hazards: v })} />
      </Section>
    </div>
  );
}

export function GenerateButtons({ compact }: { compact?: boolean }) {
  const run = useProject((s) => s.runGenerate);
  const busy = useProject((s) => s.generating);
  return (
    <div className={`generate-row${compact ? ' is-compact' : ''}`}>
      <button type="button" className="btn btn-primary btn-generate" disabled={busy} onClick={() => run()}>
        <Icon.Spark size={18} />
        <span>{busy ? 'Generiere …' : 'Generieren'}</span>
      </button>
      <button type="button" className="btn btn-secondary btn-newseed" disabled={busy} onClick={() => run({ newSeed: true })} title="Neuer Seed und generieren" aria-label="Neuer Seed">
        <Icon.Dice size={18} />
        <span>Neuer Seed</span>
      </button>
    </div>
  );
}
