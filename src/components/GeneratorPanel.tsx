import { useProject } from '../store/projectStore';
import { useEditor } from '../store/editorStore';
import { PRESETS } from '../generator/presets';
import { deriveConfig } from '../profiles';
import { lookOf, type MapLook, type Perspective, type RoomShape, type SideSettings } from '../types';
import { CORRIDOR_OPTS, DISTRIBUTIONS, SHAPES, SPECIALS } from './generatorOptions';
import { PERSPECTIVE_INFO } from '../generator/perspective';
import { RoomCountGuard } from './RoomCountGuard';
import { Button, Chip, IconButton, NumberField, Section, Segmented, Slider, Toggle } from './ui';
import { Icon } from './icons';
import { copyText } from '../utils/clipboard';
import { randomSeed } from '../generator/rng';
import { COMMON_TILE_SIZES } from '../tilesets/slicing';
import { Stats } from './Stats';
import { TerrainFields } from './TerrainFields';
import { TerrainSets } from './TerrainPanel';
import { SideFields, resolveSide } from './SideFields';
import { HexFields, resolveHex } from './HexFields';
import { AiRefineCard } from './AiRefineCard';

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

const SIZES = [
  { label: 'Klein', n: 40 },
  { label: 'Mittel', n: 64 },
  { label: 'Groß', n: 96 },
  { label: 'Riesig', n: 160 },
];

/** exact size, tile size (and the seed) – folded away, the quick choices cover most cases */
export function MapSettingsFields({ seed = true }: { seed?: boolean }) {
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
      {seed && <SeedField />}
    </>
  );
}

/** "Karte": size (quick choice), view, shadows; exact values folded away */
export function MapSection({ manual = false }: { manual?: boolean }) {
  const map = useProject((s) => s.project.map);
  const setMapSize = useProject((s) => s.setMapSize);
  const setMapOptions = useProject((s) => s.setMapOptions);
  const profile = useProject((s) => s.project.profile);
  // only the perspectives of the chosen game type (top-down family, side view …)
  const offered = deriveConfig(profile).perspectives;
  const perspectives: Perspective[] = offered.includes(map.perspective) ? offered : [map.perspective, ...offered];
  const side = map.perspective === 'side_view';
  return (
    <Section title="Karte">
      {!side && (
        <div className="field">
          <label>Größe</label>
          <div className="chips">
            {SIZES.map((z) => (
              <Chip key={z.n} active={map.width === z.n && map.height === z.n} onClick={() => setMapSize(z.n, z.n)}>
                {z.label}
              </Chip>
            ))}
          </div>
        </div>
      )}
      {perspectives.length > 1 && (
        <div className="field">
          <label>Ansicht</label>
          <Segmented
            label="Ansicht"
            value={map.perspective}
            options={perspectives.map((p: Perspective) => ({ value: p, label: PERSPECTIVE_INFO[p].label.replace(' / Isometric-like', '') }))}
            onChange={(perspective) => setMapOptions({ perspective })}
          />
        </div>
      )}
      {!side && map.perspective !== 'hex' && map.perspective !== 'isometric' && <Toggle label="Schatten" description="Wände werfen Schatten" checked={map.shadows} onChange={(shadows) => setMapOptions({ shadows })} />}
      <details className="more" open={side}>
        <summary>{manual ? 'Genaue Größe und Tilegröße' : 'Genaue Größe, Tilegröße, Seed'}</summary>
        <MapSettingsFields seed={!manual} />
      </details>
    </Section>
  );
}

const ROOM_SIZES = [
  { id: 'small', label: 'Klein', v: { roomMinW: 4, roomMaxW: 7, roomMinH: 4, roomMaxH: 7 } },
  { id: 'medium', label: 'Mittel', v: { roomMinW: 6, roomMaxW: 12, roomMinH: 6, roomMaxH: 10 } },
  { id: 'large', label: 'Groß', v: { roomMinW: 10, roomMaxW: 18, roomMinH: 8, roomMaxH: 14 } },
];

export function GeneratorPanel() {
  const g = useProject((s) => s.project.generator);
  const update = useProject((s) => s.updateGenerator);
  const applyPreset = useProject((s) => s.applyPreset);

  const side = useProject((s) => s.project.map.perspective === 'side_view');
  const hex = useProject((s) => s.project.map.perspective === 'hex');
  const manual = useProject((s) => s.project.mode === 'manual');

  const setShape = (id: RoomShape) => {
    const next = { ...g.shapes, [id]: !g.shapes[id] };
    if (!Object.values(next).some(Boolean)) return; // at least one shape
    update({ shapes: next });
  };

  // manual build: only what the build kit needs – the generator settings would do nothing
  if (manual)
    return (
      <div className="panel-scroll">
        <BuildModeCard />
        <MapSection manual />
        <LookSection manual />
      </div>
    );
  if (side) return <SidePanel />;
  if (hex) return <HexPanel />;

  const roomSize = ROOM_SIZES.find((r) => r.v.roomMinW === g.roomMinW && r.v.roomMaxW === g.roomMaxW && r.v.roomMinH === g.roomMinH && r.v.roomMaxH === g.roomMaxH)?.id ?? 'custom';
  const natural = g.layout === 'cave' || g.layout === 'outdoor' || g.layout === 'village' || g.layout === 'island';

  return (
    <div className="panel-scroll">
      <AiRefineCard />
      <MapSection />

      <Section title="Aufbau">
        <div className="layout-cards" role="radiogroup" aria-label="Aufbau">
          {LAYOUTS.map((l) => (
            <button key={l.id} type="button" role="radio" aria-checked={(g.layout ?? 'rooms') === l.id} className={`layout-card${(g.layout ?? 'rooms') === l.id ? ' is-active' : ''}`} onClick={() => update({ layout: l.id })}>
              <strong>{l.label}</strong>
              <small>{l.text}</small>
            </button>
          ))}
        </div>
        {natural && <Slider label="Zerklüftung" value={g.caveRoughness ?? (g.layout === 'cave' ? 60 : 45)} unit=" %" hint={['Glatt', 'Zerklüftet']} onChange={(v) => update({ caveRoughness: v })} />}
        {(g.layout === 'outdoor' || g.layout === 'village' || g.layout === 'island') && (
          <Segmented label="Flüsse" value={String(g.rivers ?? 0)} options={[{ value: '0', label: 'Keine' }, { value: '1', label: '1 Fluss' }, { value: '2', label: '2 Flüsse' }]} onChange={(v) => update({ rivers: Number(v) })} />
        )}
        {(g.layout === 'outdoor' || g.layout === 'island') && <Toggle label="Häuser" description="Häuser an den Lichtungen, wie im Dorf" checked={!!g.houses} onChange={(houses) => update({ houses })} />}
        {(g.layout === 'outdoor' || g.layout === 'village' || g.layout === 'island') && <p className="hint">Braucht Gras-Böden (Tag „grass“) – die Demo-Tiles haben welche.</p>}
        <div className="field">
          <label>Stil (setzt die Werte unten)</label>
          <div className="chips">
            {PRESETS.map((p) => (
              <Chip key={p.id} active={false} onClick={() => applyPreset(p.id)}>
                {p.label}
              </Chip>
            ))}
          </div>
        </div>
      </Section>

      <Section title={natural ? 'Lichtungen & Wege' : 'Räume & Wege'}>
        <Slider label={natural ? 'Anzahl Bereiche' : 'Anzahl Räume'} value={g.roomCount} min={1} max={60} onChange={(v) => update({ roomCount: v })} />
        <div className="field">
          <label>Raumgröße</label>
          <Segmented
            label="Raumgröße"
            value={roomSize}
            options={[...ROOM_SIZES.map((r) => ({ value: r.id, label: r.label })), ...(roomSize === 'custom' ? [{ value: 'custom', label: 'Eigene' }] : [])]}
            onChange={(v) => {
              const r = ROOM_SIZES.find((x) => x.id === v);
              if (r) update(r.v);
            }}
          />
        </div>
        <Slider label="Gangbreite" value={g.corridorWidth} min={1} max={6} unit=" Tiles" onChange={(v) => update({ corridorWidth: v, corridorMinWidth: Math.min(g.corridorMinWidth, v), corridorMaxWidth: Math.max(g.corridorMaxWidth, v) })} />
        <Slider label="Verwinkelung" value={g.twistiness} unit=" %" hint={['Gerade', 'Verwinkelt']} onChange={(v) => update({ twistiness: v })} />
        <Slider label="Vernetzung" value={g.connectivity} unit=" %" hint={['Ein Weg', 'Viele Rundwege']} onChange={(v) => update({ connectivity: v })} />
        <details className="more">
          <summary>Feineinstellungen: Maße, Formen, Verteilung, Gänge</summary>
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
          {!natural && (
            <div className="field">
              <label>Raumformen</label>
              <div className="chips">
                {SHAPES.map((sh) => (
                  <Chip key={sh.id} active={g.shapes[sh.id]} onClick={() => setShape(sh.id)}>
                    {sh.label}
                  </Chip>
                ))}
              </div>
            </div>
          )}
          {!natural && g.shapes.irregular ? <Slider label="Unregelmäßigkeit" value={g.irregularity} unit=" %" hint={['Leicht zerklüftet', 'Stark zerklüftet']} onChange={(v) => update({ irregularity: v })} /> : null}
          <div className="grid-2">
            <NumberField label="Gang min." value={g.corridorMinWidth} min={1} max={g.corridorMaxWidth} onChange={(v) => update({ corridorMinWidth: v })} />
            <NumberField label="Gang max." value={g.corridorMaxWidth} min={g.corridorMinWidth} max={6} onChange={(v) => update({ corridorMaxWidth: v })} />
          </div>
          <Slider label="Umwege" value={100 - g.directness} unit=" %" hint={['Direkt', 'Umwege']} onChange={(v) => update({ directness: 100 - v })} />
          <div className="chips">
            {CORRIDOR_OPTS.map((o) => (
              <Chip key={o.id} active={g.corridor[o.id]} onClick={() => update({ corridor: { ...g.corridor, [o.id]: !g.corridor[o.id] } })}>
                {o.label}
              </Chip>
            ))}
          </div>
        </details>
      </Section>

      <Section title="Spezialräume">
        <div className="chips">
          {SPECIALS.map((sp) => (
            <Chip key={sp.id} color={sp.color} active={g.specials[sp.id]} onClick={() => update({ specials: { ...g.specials, [sp.id]: !g.specials[sp.id] } })}>
              {sp.label}
            </Chip>
          ))}
        </div>
        <RoomCountGuard specials={g.specials} roomCount={g.roomCount} onFix={(n) => update({ roomCount: n })} />
      </Section>

      <Section title="Gelände" defaultOpen={false}>
        <TerrainFields value={g.terrain} onChange={(t) => update({ terrain: t })} />
        <details className="more">
          <summary>Boden-Materialien (Terrain-Sets)</summary>
          <p className="hint">Räume bekommen ein Material nach Gewichtung. Böden mit dem passenden Tag werden dafür verwendet (z. B. Tag „wood“).</p>
          <TerrainSets />
        </details>
      </Section>

      <Section title="Gegner & Ausstattung" defaultOpen={false}>
        <Slider label="Gegner" value={g.population?.enemies ?? 0} unit=" %" onChange={(v) => update({ population: { loot: g.population?.loot ?? 0, enemies: v } })} />
        <Slider label="Beute (Truhen)" value={g.population?.loot ?? 0} unit=" %" onChange={(v) => update({ population: { enemies: g.population?.enemies ?? 0, loot: v } })} />
        <Slider label="Deko" value={g.decoDensity} unit=" %" onChange={(v) => update({ decoDensity: v })} />
        <details className="more">
          <summary>Objekte und Boden-Varianten</summary>
          <Slider label="Boden-Varianten" value={g.floorVariation} unit=" %" onChange={(v) => update({ floorVariation: v })} />
          <Slider label="Kleine Hindernisse" value={g.obstacleDensity} unit=" %" onChange={(v) => update({ obstacleDensity: v })} />
          <Slider label="Bäume" value={g.objects.trees} unit=" %" onChange={(v) => update({ objects: { ...g.objects, trees: v } })} />
          <Slider label="Große Felsen" value={g.objects.rocks} unit=" %" onChange={(v) => update({ objects: { ...g.objects, rocks: v } })} />
          <Slider label="Torbögen" value={g.objects.arches} unit=" %" onChange={(v) => update({ objects: { ...g.objects, arches: v } })} />
          <Toggle label="Säulen in großen Hallen" checked={g.objects.pillars} onChange={(pillars) => update({ objects: { ...g.objects, pillars } })} />
        </details>
        <p className="hint">Gegner werden weiter vom Start mehr und stärker, der Startraum bleibt frei.</p>
      </Section>

      <LookSection />

      <Section title="Werte der Karte" defaultOpen={false}>
        <Stats />
      </Section>
    </div>
  );
}

const LAYOUTS: { id: 'rooms' | 'cave' | 'outdoor' | 'village' | 'island'; label: string; text: string }[] = [
  { id: 'rooms', label: 'Räume', text: 'Gebaute Räume und Gänge' },
  { id: 'cave', label: 'Höhle', text: 'Natürliche Kammern' },
  { id: 'outdoor', label: 'Außen', text: 'Lichtungen im Wald' },
  { id: 'village', label: 'Dorf', text: 'Häuser und Brunnen' },
  { id: 'island', label: 'Insel', text: 'Land im Meer mit Stränden' },
];

const SIDE_PRESETS: { id: string; label: string; text: string; side: Partial<SideSettings>; boss?: boolean }[] = [
  { id: 'easy', label: 'Leicht', text: 'Wenige Gruben, kaum Gegner', side: { hills: 30, gaps: 20, platforms: 30, enemies: 15, hazards: { abyss: true, water: true, lava: false, spikes: false } } },
  { id: 'normal', label: 'Normal', text: 'Ausgewogen', side: { hills: 50, gaps: 40, platforms: 50, enemies: 40, hazards: { abyss: true, water: true, lava: false, spikes: true } } },
  { id: 'hard', label: 'Schwer', text: 'Viele Sprünge, Lava und Stacheln', side: { hills: 70, gaps: 75, platforms: 75, enemies: 70, hazards: { abyss: true, water: false, lava: true, spikes: true } }, boss: true },
  { id: 'cave', label: 'Höhle', text: 'Decke, Kristalle, Leitern', side: { style: 'cave', hills: 60, gaps: 45, platforms: 60, ladders: true, enemies: 45, hazards: { abyss: true, water: true, lava: true, spikes: true } } },
];

/** Settings of the side-scroller generator (perspective side_view). */
/** switchable finishing touches – for every top-down map kind (rooms, cave, outdoor, village, island) */
function LookSection({ manual = false }: { manual?: boolean }) {
  const g = useProject((s) => s.project.generator);
  const update = useProject((s) => s.updateGenerator);
  const look = lookOf(g);
  const set = (patch: Partial<MapLook>) => update({ look: { ...look, ...patch } });
  return (
    <Section title="Aussehen" defaultOpen={false}>
      <Toggle
        label="Runde Wege und Ufer"
        description={manual ? 'Gemalte Erdwege und Wasser bekommen weiche Ränder' : 'Erdwege und Wasser mit weichen Rändern, Strand oder Steinrand'}
        checked={look.softEdges}
        onChange={(softEdges) => set({ softEdges })}
      />
      {!manual && (
        <>
          <Toggle label="Boden in Flecken" description="Abnutzung und Moos zusammenhängend statt einzeln verstreut" checked={look.floorPatches} onChange={(floorPatches) => set({ floorPatches })} />
          <Toggle label="Deko an Rändern" description="An Wänden, in Ecken, am Waldrand und am Wasser statt gleichmäßig verteilt" checked={look.smartDeco} onChange={(smartDeco) => set({ smartDeco })} />
          <Toggle label="Glatte Raumränder" description="Unregelmäßige Räume ohne einzelne Kerben" checked={look.smoothRooms} onChange={(smoothRooms) => set({ smoothRooms })} />
          <p className="hint">Wirkt beim nächsten Generieren.</p>
        </>
      )}
    </Section>
  );
}

function SidePanel() {
  const g = useProject((s) => s.project.generator);
  const update = useProject((s) => s.updateGenerator);
  const run = useProject((s) => s.runGenerate);
  const side = resolveSide(g.side);
  const set = (patch: Partial<SideSettings>) => update({ side: { ...side, ...patch } });
  return (
    <div className="panel-scroll">
      <AiRefineCard />
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

      <MapSection />

      <SideFields side={side} onChange={set} boss={g.specials.boss} onBoss={(boss) => update({ specials: { ...g.specials, boss } })} deco={g.decoDensity} onDeco={(v) => update({ decoDensity: v })} />
      <Section title="Werte der Karte" defaultOpen={false}>
        <Stats />
      </Section>
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
      <AiRefineCard />
      <p className="hint side-intro">Weltkarte aus Sechsecken: Gelände nach Höhe, Feuchtigkeit und Klima, Flüsse fließen bergab ins Meer, Straßen verbinden die Siedlungen. Alles lässt sich danach übermalen.</p>
      <MapSection />
      <HexFields hex={hex} onChange={(patch) => update({ hex: { ...hex, ...patch } })} />
      <Section title="Ausstattung" defaultOpen={false}>
        <Slider label="Deko" value={g.decoDensity} unit=" %" onChange={(v) => update({ decoDensity: v })} />
      </Section>
      <Section title="Werte der Karte" defaultOpen={false}>
        <Stats />
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
      <button type="button" className="btn btn-primary btn-generate" disabled={busy} onClick={() => run({ newSeed: true })} title="Neue Karte mit den aktuellen Einstellungen (jedes Mal eine andere)">
        <Icon.Spark size={18} />
        <span>{busy ? 'Generiere …' : 'Generieren'}</span>
      </button>
      {!compact && (
        <button
          type="button"
          className="btn btn-secondary btn-newseed"
          disabled={busy}
          onClick={() => run()}
          title="Dieselbe Karte (gleicher Seed) mit den geänderten Einstellungen neu bauen"
          aria-label="Gleiche Karte neu bauen"
        >
          <Icon.Rotate size={18} />
          <span>Gleiche Karte</span>
        </button>
      )}
    </div>
  );
}
