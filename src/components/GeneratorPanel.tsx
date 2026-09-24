import { useProject } from '../store/projectStore';
import { useEditor } from '../store/editorStore';
import { PRESETS } from '../generator/presets';
import { deriveConfig } from '../profiles';
import type { Perspective, RoomShape, SideSettings } from '../types';
import { CORRIDOR_OPTS, DISTRIBUTIONS, SHAPES, SPECIALS } from './generatorOptions';
import { PERSPECTIVE_INFO } from '../generator/perspective';
import { RoomCountGuard } from './RoomCountGuard';
import { Button, Chip, IconButton, NumberField, Section, Segmented, Slider, Toggle } from './ui';
import { Icon } from './icons';
import { copyText } from '../utils/clipboard';
import { randomSeed } from '../generator/rng';
import { COMMON_TILE_SIZES } from '../tilesets/slicing';
import { Stats } from './Stats';
import { SideFields, resolveSide } from './SideFields';
import { HexFields, resolveHex } from './HexFields';

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
  const setMapOptions = useProject((s) => s.setMapOptions);
  const profile = useProject((s) => s.project.profile);
  const custom = !COMMON_TILE_SIZES.includes(map.tileSize);
  // only the perspectives of the chosen game type (top-down family, side view …)
  const offered = deriveConfig(profile).perspectives;
  const perspectives: Perspective[] = offered.includes(map.perspective) ? offered : [map.perspective, ...offered];
  const side = map.perspective === 'side_view';
  return (
    <>
      {perspectives.length > 1 && (
        <div className="field">
          <label>Perspektive</label>
          <Segmented
            label="Perspektive"
            value={map.perspective}
            options={perspectives.map((p: Perspective) => ({ value: p, label: PERSPECTIVE_INFO[p].label.replace(' / Isometric-like', '') }))}
            onChange={(perspective) => setMapOptions({ perspective })}
          />
        </div>
      )}
      {!side && map.perspective !== 'hex' && <Toggle label="Schatten" description="Wandschatten in den Layer „Schatten“ generieren" checked={map.shadows} onChange={(shadows) => setMapOptions({ shadows })} />}
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

  const side = useProject((s) => s.project.map.perspective === 'side_view');
  const hex = useProject((s) => s.project.map.perspective === 'hex');

  const setShape = (id: RoomShape) => {
    const next = { ...g.shapes, [id]: !g.shapes[id] };
    if (!Object.values(next).some(Boolean)) return; // at least one shape
    update({ shapes: next });
  };

  if (side) return <SidePanel />;
  if (hex) return <HexPanel />;

  return (
    <div className="panel-scroll">
      <BuildModeCard />
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
        <Segmented
          label="Aufbau"
          value={g.layout ?? 'rooms'}
          onChange={(v) => update({ layout: v })}
          options={[
            { value: 'rooms', label: 'Gebaute Räume' },
            { value: 'cave', label: 'Natürliche Höhle' },
          ]}
        />
        {g.layout === 'cave' && (
          <>
            <Slider label="Zerklüftung" value={g.caveRoughness ?? 60} unit=" %" onChange={(v) => update({ caveRoughness: v })} />
            <p className="hint">Räume und Gänge werden zu Höhlen mit unregelmäßigen Wänden, Nischen und Felssäulen – ohne Türen. Alle Kammern bleiben erreichbar.</p>
          </>
        )}
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
        {g.shapes.irregular ? (
          <Slider label="Unregelmäßigkeit" value={g.irregularity} unit=" %" hint={['Leicht zerklüftet', 'Stark zerklüftet']} onChange={(v) => update({ irregularity: v })} />
        ) : null}
        <p className="hint">Rechteck, L, T, Kreuz und Halle werden exakt gebaut; gewählte Formen kommen gleich häufig vor. Die Unregelmäßigkeit gilt nur für die Form „Unregelmäßig“.</p>
      </Section>

      <Section title="Wege">
        <div className="grid-3">
          <NumberField label="Breite" value={g.corridorWidth} min={1} max={6} onChange={(v) => update({ corridorWidth: v, corridorMinWidth: Math.min(g.corridorMinWidth, v), corridorMaxWidth: Math.max(g.corridorMaxWidth, v) })} />
          <NumberField label="Min." value={g.corridorMinWidth} min={1} max={g.corridorMaxWidth} onChange={(v) => update({ corridorMinWidth: v })} />
          <NumberField label="Max." value={g.corridorMaxWidth} min={g.corridorMinWidth} max={6} onChange={(v) => update({ corridorMaxWidth: v })} />
        </div>
        <Slider label="Verwinkelung" value={g.twistiness} unit=" %" hint={['Direkt', 'Verwinkelt']} onChange={(v) => update({ twistiness: v })} />
        <Slider label="Direktheit" value={100 - g.directness} unit=" %" hint={['Direkt', 'Umwege']} onChange={(v) => update({ directness: 100 - v })} />
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
        <RoomCountGuard specials={g.specials} roomCount={g.roomCount} onFix={(n) => update({ roomCount: n })} />
      </Section>

      <Section title="Ausstattung" defaultOpen={false}>
        <Slider label="Boden-Varianten" value={g.floorVariation} unit=" %" onChange={(v) => update({ floorVariation: v })} />
        <Slider label="Deko" value={g.decoDensity} unit=" %" onChange={(v) => update({ decoDensity: v })} />
        <Slider label="Kleine Hindernisse" value={g.obstacleDensity} unit=" %" onChange={(v) => update({ obstacleDensity: v })} />
        <Slider label="Bäume" value={g.objects.trees} unit=" %" onChange={(v) => update({ objects: { ...g.objects, trees: v } })} />
        <Slider label="Große Felsen" value={g.objects.rocks} unit=" %" onChange={(v) => update({ objects: { ...g.objects, rocks: v } })} />
        <Slider label="Torbögen" value={g.objects.arches} unit=" %" onChange={(v) => update({ objects: { ...g.objects, arches: v } })} />
        <Toggle label="Säulen in großen Hallen" checked={g.objects.pillars} onChange={(pillars) => update({ objects: { ...g.objects, pillars } })} />
        <Slider label="Gegner" value={g.population?.enemies ?? 0} unit=" %" onChange={(v) => update({ population: { loot: g.population?.loot ?? 0, enemies: v } })} />
        <Slider label="Beute (Truhen)" value={g.population?.loot ?? 0} unit=" %" onChange={(v) => update({ population: { enemies: g.population?.enemies ?? 0, loot: v } })} />
        <p className="hint">Gegner und Truhen werden nach Entfernung zum Start verteilt: der Startraum bleibt frei, weiter hinten mehr und stärkere Gegner (Stufe 1–5), Truhen in Schatzräumen und Sackgassen. Sie stehen als Spawnpunkte im Godot-Export.</p>
        <p className="hint">Wasser, Lava, Abgründe, Klippen und Brücken: Panel „Terrain“.</p>
      </Section>
    </div>
  );
}

const SIDE_PRESETS: { id: string; label: string; text: string; side: Partial<SideSettings>; boss?: boolean }[] = [
  { id: 'easy', label: 'Leicht', text: 'Wenige Gruben, kaum Gegner', side: { hills: 30, gaps: 20, platforms: 30, enemies: 15, hazards: { abyss: true, water: true, lava: false, spikes: false } } },
  { id: 'normal', label: 'Normal', text: 'Ausgewogen', side: { hills: 50, gaps: 40, platforms: 50, enemies: 40, hazards: { abyss: true, water: true, lava: false, spikes: true } } },
  { id: 'hard', label: 'Schwer', text: 'Viele Sprünge, Lava und Stacheln', side: { hills: 70, gaps: 75, platforms: 75, enemies: 70, hazards: { abyss: true, water: false, lava: true, spikes: true } }, boss: true },
  { id: 'cave', label: 'Höhle', text: 'Decke, Kristalle, Leitern', side: { style: 'cave', hills: 60, gaps: 45, platforms: 60, ladders: true, enemies: 45, hazards: { abyss: true, water: true, lava: true, spikes: true } } },
];

/** Settings of the side-scroller generator (perspective side_view). */
function SidePanel() {
  const g = useProject((s) => s.project.generator);
  const update = useProject((s) => s.updateGenerator);
  const run = useProject((s) => s.runGenerate);
  const side = resolveSide(g.side);
  const set = (patch: Partial<SideSettings>) => update({ side: { ...side, ...patch } });
  return (
    <div className="panel-scroll">
      <BuildModeCard />
      <Stats />
      <p className="hint side-intro">Das Level läuft von links (Start) nach rechts (Ziel). Es wird nur so gebaut, dass alles mit der eingestellten Sprunghöhe und -weite schaffbar ist.</p>
      <Section title="Schwierigkeit">
        <div className="chips">
          {SIDE_PRESETS.map((p) => (
            <Chip
              key={p.id}
              active={false}
              onClick={() => {
                update({ side: { ...side, ...p.side, hazards: { ...side.hazards, ...p.side.hazards } }, specials: { ...g.specials, boss: !!p.boss } });
                void run();
              }}
            >
              {p.label}
            </Chip>
          ))}
        </div>
      </Section>

      <Section title="Map">
        <SeedField />
        <MapSettingsFields />
      </Section>

      <SideFields side={side} onChange={set} boss={g.specials.boss} onBoss={(boss) => update({ specials: { ...g.specials, boss } })} deco={g.decoDensity} onDeco={(v) => update({ decoDensity: v })} />
    </div>
  );
}

/** Settings of the hex world generator (perspective hex). */
function HexPanel() {
  const g = useProject((s) => s.project.generator);
  const update = useProject((s) => s.updateGenerator);
  const hex = resolveHex(g.hex);
  return (
    <div className="panel-scroll">
      <BuildModeCard />
      <Stats />
      <p className="hint side-intro">Weltkarte aus Sechsecken: Gelände nach Höhe, Feuchtigkeit und Klima, Flüsse fließen bergab ins Meer, Straßen verbinden die Siedlungen. Alles lässt sich danach übermalen.</p>
      <Section title="Map">
        <SeedField />
        <MapSettingsFields />
      </Section>
      <HexFields hex={hex} onChange={(patch) => update({ hex: { ...hex, ...patch } })} />
      <Section title="Ausstattung" defaultOpen={false}>
        <Slider label="Deko" value={g.decoDensity} unit=" %" onChange={(v) => update({ decoDensity: v })} />
      </Section>
    </div>
  );
}

/** Manual build mode: explains the build kit and lets the user switch to the generator. */
function BuildModeCard() {
  const mode = useProject((s) => s.project.mode);
  const setMode = useProject((s) => s.setMode);
  if (mode !== 'manual') return null;
  return (
    <div className="build-card">
      <strong>Manueller Baukasten</strong>
      <p>
        Räume und Wege mit dem Boden-Pinsel (Layer „Boden“) malen – mit Auto-Wände entstehen Wände, Ecken und Fronten automatisch. Türen auf Wände setzen öffnet sie, Objekte
        unter Tiles → Objekte, Abgründe/Wasser/Brücken über ihre Tiles.
      </p>
      <Button variant="secondary" onClick={() => setMode('generate')}>
        Automatische Generierung aktivieren
      </Button>
      <p className="hint">Danach erzeugt „Generieren“ eine komplette Map nach den Einstellungen unten (Rückgängig möglich).</p>
    </div>
  );
}

export function GenerateButtons({ compact }: { compact?: boolean }) {
  const run = useProject((s) => s.runGenerate);
  const busy = useProject((s) => s.generating);
  const manual = useProject((s) => s.project.mode === 'manual');
  // manual build mode: nothing is generated automatically (switch in the generator panel)
  if (manual) return null;
  return (
    <div className={`generate-row${compact ? ' is-compact' : ''}`}>
      <button type="button" className="btn btn-primary btn-generate" disabled={busy} onClick={() => run()} title="Map mit den aktuellen Einstellungen neu erzeugen">
        <Icon.Spark size={18} />
        <span>{busy ? 'Generiere …' : 'Generieren'}</span>
      </button>
      <button
        type="button"
        className="btn btn-secondary btn-newseed"
        disabled={busy}
        onClick={() => run({ newSeed: true })}
        title="Neue Variante: gleiche Einstellungen, neuer Zufallswert (Seed) – ergibt eine andere Map"
        aria-label="Neue Variante"
      >
        <Icon.Dice size={18} />
        {!compact && <span>Neue Variante</span>}
      </button>
    </div>
  );
}
