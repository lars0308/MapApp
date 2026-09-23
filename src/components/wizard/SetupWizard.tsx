import { useEffect, useRef, useState } from 'react';
import type { GeneratorSettings, MapSettings, Perspective, ProjectMode, RoomShape, SpecialRoomType, TerrainSet, Tileset } from '../../types';
import { PERSPECTIVES } from '../../types';
import { DEFAULT_MAP, defaultGenerator, defaultTerrainSets } from '../../generator/presets';
import { TerrainFields } from '../TerrainFields';
import { PERSPECTIVE_INFO, requiredRooms } from '../../generator/perspective';
import { randomSeed } from '../../generator/rng';
import { COMMON_TILE_SIZES } from '../../tilesets/slicing';
import { createProject, useProject } from '../../store/projectStore';
import { useEditor } from '../../store/editorStore';
import { saveNow } from '../../persistence/autosave';
import { Button, Chip, IconButton, NumberField, Segmented, Slider, Toggle } from '../ui';
import { Icon } from '../icons';
import { PerspectivePreview } from './PerspectivePreview';
import { RoomCountGuard } from '../RoomCountGuard';
import { SHAPES, CORRIDOR_OPTS, SPECIALS } from '../generatorOptions';
import { TilesStep, type TilesChoice } from './TilesStep';
import { listLibraryTilesets, type LibraryTileset } from '../../persistence/db';
import { TilePools } from '../../tilesets/tilePools';
import { Rng } from '../../generator/rng';

type StepId = 'mode' | 'perspective' | 'tiles' | 'map' | 'rooms' | 'paths' | 'specials' | 'terrain' | 'equip' | 'summary';

const STEP_LABEL: Record<StepId, string> = {
  mode: 'Modus',
  perspective: 'Perspektive',
  tiles: 'Tiles',
  map: 'Map',
  rooms: 'Räume',
  paths: 'Wege',
  specials: 'Spezialräume',
  terrain: 'Gelände',
  equip: 'Ausstattung',
  summary: 'Zusammenfassung',
};

/** automatic: tiles → generator settings → map; manual: tiles → finish → build kit (editor) */
const FLOW: Record<ProjectMode, StepId[]> = {
  generate: ['mode', 'perspective', 'tiles', 'map', 'rooms', 'paths', 'specials', 'terrain', 'equip', 'summary'],
  manual: ['mode', 'perspective', 'tiles', 'map', 'summary'],
};

const SPECIAL_HINT: Record<SpecialRoomType, string> = {
  start: 'Startpunkt des Spielers',
  end: 'Ziel / Ausgang, weit vom Start',
  boss: 'Großer Raum nahe dem Ende',
  treasure: 'Belohnung in einer Sackgasse',
  merchant: 'Auf halber Strecke',
  quest: 'Raum für eine Aufgabe',
  arena: 'Größter freier Raum',
  secret: 'Kleiner, abgelegener Raum',
  puzzle: 'Raum für ein Rätsel',
};

interface Draft {
  mode: ProjectMode;
  tiles: TilesChoice;
  name: string;
  map: MapSettings;
  gen: GeneratorSettings;
  terrains: TerrainSet[];
}

function freshDraft(): Draft {
  return {
    mode: 'generate',
    tiles: { source: 'demo', selected: [] },
    name: 'Neues Projekt',
    map: { ...DEFAULT_MAP, perspective: 'low_top_down', shadows: true },
    gen: defaultGenerator(randomSeed()),
    terrains: defaultTerrainSets(),
  };
}

export function SetupWizard() {
  const open = useEditor((s) => s.wizardOpen);
  if (!open) return null;
  return <WizardDialog />;
}

function WizardDialog() {
  const firstRun = useEditor((s) => s.wizardFirstRun);
  const { closeWizard, toast, setView } = useEditor.getState();
  const [step, setStep] = useState(0);
  const [draft, setDraft] = useState<Draft>(freshDraft);
  const [busy, setBusy] = useState(false);
  const [library, setLibrary] = useState<LibraryTileset[] | null>(null);
  const [upload, setUpload] = useState<Tileset | null>(null);
  const bodyRef = useRef<HTMLDivElement>(null);
  const steps = FLOW[draft.mode];
  const id = steps[Math.min(step, steps.length - 1)];

  const reloadLibrary = async () => {
    const list = await listLibraryTilesets().catch(() => []);
    setLibrary(list);
    return list;
  };
  useEffect(() => {
    void reloadLibrary();
  }, []);

  const setMap = (patch: Partial<MapSettings>) => setDraft((d) => ({ ...d, map: { ...d.map, ...patch } }));
  const setGen = (patch: Partial<GeneratorSettings>) => setDraft((d) => ({ ...d, gen: { ...d.gen, ...patch } }));

  useEffect(() => bodyRef.current?.scrollTo({ top: 0 }), [step]);

  const cancel = async () => {
    closeWizard();
    // first start: never leave the user with an empty editor
    if (firstRun) {
      await useProject.getState().runGenerate();
      await saveNow();
    }
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && void cancel();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  const create = async () => {
    setBusy(true);
    let gen = draft.gen;
    const need = requiredRooms(gen.specials);
    if (gen.roomCount < need) {
      gen = { ...gen, roomCount: need };
      toast(`Raumanzahl automatisch auf ${need} erhöht`);
    }
    const lib = draft.tiles.source === 'library' ? (library ?? []).filter((e) => draft.tiles.selected.includes(e.id)) : [];
    try {
      // keep the current project, except the untouched placeholder on first start
      if (!firstRun) await saveNow();
      const store = useProject.getState();
      store.loadProject(
        createProject(draft.name.trim() || 'Neues Projekt', {
          map: draft.map,
          generator: gen,
          terrains: draft.terrains,
          mode: draft.mode,
          library: lib,
          // own tilesets chosen → demo tiles only serve as fallback for missing roles
          demoActive: lib.length === 0,
        }),
      );
      if (draft.mode === 'generate') await useProject.getState().runGenerate();
      else prepareBuildKit();
      await saveNow();
      closeWizard();
      setView('map');
      toast(draft.mode === 'generate' ? 'Map erstellt' : 'Baukasten geöffnet – Boden malen legt Räume und Wege an, Wände entstehen automatisch', 'success');
    } finally {
      setBusy(false);
    }
  };

  const last = id === 'summary';
  const blocked =
    id === 'tiles' && draft.tiles.source === 'library' && !draft.tiles.selected.length
      ? 'Mindestens ein Tileset auswählen'
      : id === 'tiles' && draft.tiles.source === 'upload'
        ? upload
          ? 'Tileset erst in der Bibliothek speichern'
          : 'PNG hochladen oder andere Option wählen'
        : null;
  const { map, gen } = draft;

  return (
    <div className="wizard-backdrop" role="presentation">
      <div className="wizard" role="dialog" aria-modal="true" aria-labelledby="wizard-title">
        <header className="wizard-head">
          <div className="wizard-title">
            <h2 id="wizard-title">Neues Projekt</h2>
            <span className="muted">
              Schritt {step + 1} von {steps.length} · {STEP_LABEL[id]}
            </span>
          </div>
          <IconButton label="Assistent schließen" onClick={() => void cancel()}>
            <Icon.Close size={20} />
          </IconButton>
        </header>

        <ol className="wizard-steps" aria-label="Fortschritt">
          {steps.map((sid, i) => (
            <li key={sid} className={i === step ? 'is-current' : i < step ? 'is-done' : ''}>
              <button type="button" onClick={() => setStep(i)} aria-current={i === step ? 'step' : undefined}>
                <span className="step-num">{i < step ? <Icon.Check size={13} /> : i + 1}</span>
                <span className="step-label">{STEP_LABEL[sid]}</span>
              </button>
            </li>
          ))}
        </ol>

        <div className="wizard-body" ref={bodyRef}>
          {id === 'mode' && (
            <StepSection title="Wie möchtest du deine Map bauen?">
              <div className="choice-grid" role="radiogroup" aria-label="Modus">
                {(
                  [
                    ['generate', 'Automatisch generieren', 'Räume, Wege, Gelände und Ausstattung werden aus deinen Einstellungen erzeugt – danach frei bearbeitbar.', <Icon.Spark size={22} key="i" />],
                    ['manual', 'Manuell bauen', 'Leere Map als Baukasten: Räume und Wege selbst mit dem Boden-Pinsel anlegen, Wände entstehen automatisch.', <Icon.Brush size={22} key="i" />],
                  ] as const
                ).map(([m, title, text, icon]) => (
                  <button
                    key={m}
                    type="button"
                    role="radio"
                    aria-checked={draft.mode === m}
                    className={`choice-card${draft.mode === m ? ' is-selected' : ''}`}
                    onClick={() => setDraft((d) => ({ ...d, mode: m }))}
                  >
                    <span className="choice-icon">{icon}</span>
                    <span className="choice-text">
                      <strong>{title}</strong>
                      <small>{text}</small>
                    </span>
                  </button>
                ))}
              </div>
            </StepSection>
          )}

          {id === 'perspective' && (
            <StepSection title="Wie soll deine Map dargestellt werden?">
              <div className="persp-grid" role="radiogroup" aria-label="Perspektive">
                {PERSPECTIVES.map((p) => (
                  <PerspectiveCard key={p} id={p} selected={map.perspective === p} onSelect={() => setMap({ perspective: p })} />
                ))}
              </div>
              <Toggle
                label="Schatten anzeigen"
                description="Subtile Schatten unter Wänden, eigener Layer „Schatten“"
                checked={map.shadows}
                onChange={(v) => setMap({ shadows: v })}
              />
              {map.perspective === 'isometric_45' && (
                <p className="note">
                  Die 45°-Ansicht bleibt ein 2D-Raster: Wandfronten werden doppelt hoch und Seitenwände sichtbar. Für echte Wirkung brauchst du Tiles mit
                  den Rollen Wandfront (Tags <code>base</code>/<code>upper</code>) und Seitenwände (Tag <code>side</code>).
                </p>
              )}
            </StepSection>
          )}

          {id === 'tiles' && (
            <StepSection title="Welche Tiles möchtest du verwenden?">
              <TilesStep
                perspective={map.perspective}
                value={draft.tiles}
                onChange={(tiles) => setDraft((d) => ({ ...d, tiles }))}
                library={library}
                reloadLibrary={reloadLibrary}
                upload={upload}
                setUpload={setUpload}
              />
            </StepSection>
          )}

          {id === 'map' && (
            <StepSection title="Wie groß soll die Map werden?">
              <div className="grid-2">
                <NumberField label="Breite" value={map.width} min={16} max={256} suffix="Tiles" onChange={(v) => setMap({ width: v })} />
                <NumberField label="Höhe" value={map.height} min={16} max={256} suffix="Tiles" onChange={(v) => setMap({ height: v })} />
              </div>
              <div className="field">
                <label>Tilegröße</label>
                <Segmented
                  label="Tilegröße"
                  value={COMMON_TILE_SIZES.includes(map.tileSize) ? String(map.tileSize) : 'custom'}
                  options={[...COMMON_TILE_SIZES.map((s) => ({ value: String(s), label: `${s} px` })), { value: 'custom', label: 'Frei' }]}
                  onChange={(v) => setMap({ tileSize: v === 'custom' ? (COMMON_TILE_SIZES.includes(map.tileSize) ? 24 : map.tileSize) : Number(v) })}
                />
              </div>
              {!COMMON_TILE_SIZES.includes(map.tileSize) && (
                <NumberField label="Freie Tilegröße" value={map.tileSize} min={4} max={256} suffix="px" onChange={(v) => setMap({ tileSize: v })} />
              )}
              <div className="derived big">
                <span>
                  {map.width} × {map.height} Tiles · {map.tileSize} px
                </span>
                <strong>
                  = {map.width * map.tileSize} × {map.height * map.tileSize} Pixel
                </strong>
              </div>
              <div className="field">
                <label htmlFor="wiz-seed">Seed</label>
                <div className="seed-row">
                  <input id="wiz-seed" className="input mono" value={gen.seed} onChange={(e) => setGen({ seed: e.target.value.slice(0, 40) })} />
                  <IconButton label="Zufälliger Seed" onClick={() => setGen({ seed: randomSeed() })}>
                    <Icon.Dice size={18} />
                  </IconButton>
                </div>
              </div>
            </StepSection>
          )}

          {id === 'rooms' && (
            <StepSection title="Räume">
              <Slider label="Anzahl Räume" value={gen.roomCount} min={2} max={60} onChange={(v) => setGen({ roomCount: v })} />
              <div className="grid-2">
                <NumberField label="Min. Breite" value={gen.roomMinW} min={3} max={gen.roomMaxW} onChange={(v) => setGen({ roomMinW: v })} />
                <NumberField label="Max. Breite" value={gen.roomMaxW} min={gen.roomMinW} max={60} onChange={(v) => setGen({ roomMaxW: v })} />
                <NumberField label="Min. Höhe" value={gen.roomMinH} min={3} max={gen.roomMaxH} onChange={(v) => setGen({ roomMinH: v })} />
                <NumberField label="Max. Höhe" value={gen.roomMaxH} min={gen.roomMinH} max={60} onChange={(v) => setGen({ roomMaxH: v })} />
              </div>
              <Slider label="Mindestabstand" value={gen.roomSpacing} min={1} max={12} unit="Tiles" onChange={(v) => setGen({ roomSpacing: v })} />
              <div className="field">
                <label>Raumformen</label>
                <div className="chips">
                  {SHAPES.map((sh) => (
                    <Chip
                      key={sh.id}
                      active={gen.shapes[sh.id]}
                      onClick={() => {
                        const next = { ...gen.shapes, [sh.id]: !gen.shapes[sh.id] } as Record<RoomShape, boolean>;
                        if (Object.values(next).some(Boolean)) setGen({ shapes: next });
                      }}
                    >
                      {sh.label}
                    </Chip>
                  ))}
                </div>
              </div>
              <Slider label="Regelmäßigkeit" value={gen.irregularity} unit="%" hint={['Sauber / rechteckig', 'Unregelmäßig']} onChange={(v) => setGen({ irregularity: v })} />
            </StepSection>
          )}

          {id === 'paths' && (
            <StepSection title="Wege & Gänge">
              <div className="grid-3">
                <NumberField
                  label="Gangbreite"
                  value={gen.corridorWidth}
                  min={1}
                  max={6}
                  onChange={(v) => setGen({ corridorWidth: v, corridorMinWidth: Math.min(gen.corridorMinWidth, v), corridorMaxWidth: Math.max(gen.corridorMaxWidth, v) })}
                />
                <NumberField label="Min." value={gen.corridorMinWidth} min={1} max={gen.corridorMaxWidth} onChange={(v) => setGen({ corridorMinWidth: v })} />
                <NumberField label="Max." value={gen.corridorMaxWidth} min={gen.corridorMinWidth} max={6} onChange={(v) => setGen({ corridorMaxWidth: v })} />
              </div>
              <div className="chips">
                {CORRIDOR_OPTS.map((o) => (
                  <Chip key={o.id} active={gen.corridor[o.id]} onClick={() => setGen({ corridor: { ...gen.corridor, [o.id]: !gen.corridor[o.id] } })}>
                    {o.label}
                  </Chip>
                ))}
              </div>
              <Slider label="Verwinkelung" value={gen.twistiness} unit="%" hint={['Direkt', 'Verwinkelt']} onChange={(v) => setGen({ twistiness: v })} />
              {/* stored as directness (100 = direct); shown as "Direkt ↔ Umwege" */}
              <Slider label="Direktheit" value={100 - gen.directness} unit="%" hint={['Direkt', 'Umwege']} onChange={(v) => setGen({ directness: 100 - v })} />
              <Slider label="Vernetzung" value={gen.connectivity} unit="%" hint={['Linear', 'Vernetzt']} onChange={(v) => setGen({ connectivity: v })} />
            </StepSection>
          )}

          {id === 'specials' && (
            <StepSection title="Welche Spezialräume soll es geben?">
              <div className="special-grid">
                {SPECIALS.map((sp) => {
                  const on = gen.specials[sp.id];
                  return (
                    <button
                      key={sp.id}
                      type="button"
                      className={`special-card${on ? ' is-on' : ''}`}
                      aria-pressed={on}
                      onClick={() => setGen({ specials: { ...gen.specials, [sp.id]: !on } })}
                    >
                      <span className="chip-dot" style={{ background: sp.color }} />
                      <span className="special-text">
                        <strong>{sp.label}</strong>
                        <small>{SPECIAL_HINT[sp.id]}</small>
                      </span>
                      <span className="special-check">{on && <Icon.Check size={16} />}</span>
                    </button>
                  );
                })}
              </div>
              <RoomCountGuard specials={gen.specials} roomCount={gen.roomCount} onFix={(n) => setGen({ roomCount: n })} />
            </StepSection>
          )}

          {id === 'terrain' && (
            <StepSection title="Gelände">
              <div className="field">
                <label>Terrain-Sets für Räume</label>
                <div className="chips">
                  {draft.terrains.map((t) => (
                    <Chip
                      key={t.id}
                      color={t.color}
                      active={t.active}
                      onClick={() => {
                        const next = draft.terrains.map((x) => (x.id === t.id ? { ...x, active: !x.active } : x));
                        if (next.some((x) => x.active)) setDraft((d) => ({ ...d, terrains: next }));
                      }}
                    >
                      {t.name}
                    </Chip>
                  ))}
                </div>
              </div>
              <TerrainFields value={gen.terrain} onChange={(terrain) => setGen({ terrain })} />
            </StepSection>
          )}

          {id === 'equip' && (
            <StepSection
              title="Ausstattung"
              aside={
                <Button variant="ghost" onClick={() => setStep(steps.indexOf('summary'))}>
                  Später konfigurieren
                </Button>
              }
            >
              <Slider label="Boden-Varianten" value={gen.floorVariation} unit="%" onChange={(v) => setGen({ floorVariation: v })} />
              <Slider label="Deko" value={gen.decoDensity} unit="%" onChange={(v) => setGen({ decoDensity: v })} />
              <Slider label="Kleine Hindernisse" value={gen.obstacleDensity} unit="%" onChange={(v) => setGen({ obstacleDensity: v })} />
              <Slider label="Bäume" value={gen.objects.trees} unit="%" onChange={(v) => setGen({ objects: { ...gen.objects, trees: v } })} />
              <Slider label="Große Felsen" value={gen.objects.rocks} unit="%" onChange={(v) => setGen({ objects: { ...gen.objects, rocks: v } })} />
              <Slider label="Torbögen" value={gen.objects.arches} unit="%" onChange={(v) => setGen({ objects: { ...gen.objects, arches: v } })} />
              <Toggle label="Säulen in großen Hallen" checked={gen.objects.pillars} onChange={(pillars) => setGen({ objects: { ...gen.objects, pillars } })} />
            </StepSection>
          )}

          {id === 'summary' && (
            <Summary draft={draft} library={library} onName={(name) => setDraft((d) => ({ ...d, name }))} onFixRooms={(n) => setGen({ roomCount: n })} />
          )}
        </div>

        {blocked && (
          <p className="wizard-hint" role="status">
            {blocked}
          </p>
        )}
        <footer className="wizard-foot">
          <Button variant="secondary" disabled={step === 0 || busy} onClick={() => setStep(step - 1)} icon={<Icon.Undo size={16} />}>
            Zurück
          </Button>
          {last ? (
            <button type="button" className="btn btn-primary btn-create" disabled={busy} onClick={() => void create()}>
              <Icon.Spark size={18} />
              <span>{busy ? 'Erstelle …' : draft.mode === 'generate' ? 'Map erstellen' : 'Baukasten öffnen'}</span>
            </button>
          ) : (
            <Button variant="primary" className="btn-next" disabled={!!blocked} title={blocked ?? undefined} onClick={() => setStep(step + 1)}>
              Weiter
            </Button>
          )}
        </footer>
      </div>
    </div>
  );
}

function StepSection({ title, children, aside }: { title: string; children: React.ReactNode; aside?: React.ReactNode }) {
  return (
    <section className="wizard-step">
      <div className="wizard-step-head">
        <h3>{title}</h3>
        {aside}
      </div>
      {children}
    </section>
  );
}

function PerspectiveCard({ id, selected, onSelect }: { id: Perspective; selected: boolean; onSelect: () => void }) {
  const info = PERSPECTIVE_INFO[id];
  return (
    <button type="button" role="radio" aria-checked={selected} className={`persp-card${selected ? ' is-selected' : ''}`} onClick={onSelect}>
      <PerspectivePreview perspective={id} />
      <span className="persp-text">
        <strong>{info.label}</strong>
        <small>{info.short}</small>
        <ul>
          {info.points.map((p) => (
            <li key={p}>{p}</li>
          ))}
        </ul>
      </span>
    </button>
  );
}

function Summary({ draft, library, onName, onFixRooms }: { draft: Draft; library: LibraryTileset[] | null; onName: (n: string) => void; onFixRooms: (n: number) => void }) {
  const { map, gen } = draft;
  const specials = SPECIALS.filter((s) => gen.specials[s.id]).map((s) => s.label);
  const shapes = SHAPES.filter((s) => gen.shapes[s.id]).map((s) => s.label);
  const t = gen.terrain;
  const terrainList =
    [
      t.water.enabled && `Wasser ${t.water.amount} %`,
      t.lava.enabled && `Lava ${t.lava.amount} %`,
      t.abyss.enabled && `Abgründe ${t.abyss.amount} %`,
      t.cliffs.enabled && `Klippen ${t.cliffs.amount} %`,
      t.bridges && 'Brücken',
    ]
      .filter(Boolean)
      .join(', ') || 'nur Boden';
  const tiles =
    draft.tiles.source === 'library'
      ? (library ?? [])
          .filter((e) => draft.tiles.selected.includes(e.id))
          .map((e) => e.name)
          .join(', ') + ' (+ Demo-Tiles als Ersatz)'
      : 'Demo-Tiles';
  const base: [string, string][] = [
    ['Modus', draft.mode === 'generate' ? 'Automatisch generieren' : 'Manuell bauen (Baukasten)'],
    ['Perspektive', PERSPECTIVE_INFO[map.perspective].label + (map.shadows ? ' · mit Schatten' : '')],
    ['Tiles', tiles],
    ['Map', `${map.width} × ${map.height} Tiles`],
    ['Tilegröße', `${map.tileSize} px (${map.width * map.tileSize} × ${map.height * map.tileSize} px)`],
  ];
  const generatorRows: [string, string][] = [
    ['Räume', String(gen.roomCount)],
    ['Raumgröße', `${gen.roomMinW}–${gen.roomMaxW} × ${gen.roomMinH}–${gen.roomMaxH} Tiles`],
    ['Raumformen', shapes.join(', ')],
    ['Gangbreite', gen.corridorMinWidth === gen.corridorMaxWidth ? `${gen.corridorWidth} Tiles` : `${gen.corridorMinWidth}–${gen.corridorMaxWidth} Tiles (meist ${gen.corridorWidth})`],
    ['Spezialräume', specials.join(', ') || 'keine'],
    ['Verwinkelung', `${gen.twistiness} %`],
    ['Direktheit', `${100 - gen.directness} % Umwege`],
    ['Vernetzung', `${gen.connectivity} %`],
    ['Gelände', terrainList],
    ['Terrains', draft.terrains.filter((x) => x.active).map((x) => x.name).join(', ')],
    ['Ausstattung', `Deko ${gen.decoDensity} % · Bäume ${gen.objects.trees} % · Felsen ${gen.objects.rocks} %`],
    ['Seed', gen.seed],
  ];
  const rows = draft.mode === 'generate' ? [...base, ...generatorRows] : base;
  return (
    <StepSection title="Zusammenfassung">
      <div className="field">
        <label htmlFor="wiz-name">Projektname</label>
        <input id="wiz-name" className="input" value={draft.name} onChange={(e) => onName(e.target.value)} />
      </div>
      <dl className="summary">
        {rows.map(([k, v]) => (
          <div key={k}>
            <dt>{k}</dt>
            <dd>{v}</dd>
          </div>
        ))}
      </dl>
      {draft.mode === 'generate' && <RoomCountGuard specials={gen.specials} roomCount={gen.roomCount} onFix={onFixRooms} />}
    </StepSection>
  );
}

/** Manual mode: floor layer active, brush with a floor tile of the chosen tiles. */
function prepareBuildKit() {
  const p = useProject.getState().project;
  const floor = p.layers.find((l) => l.role === 'floor');
  if (floor) useProject.getState().setActiveLayer(floor.id);
  const gid = new TilePools(p.tilesets, p.map.perspective).pickPref(new Rng(1), ['floor']);
  const editor = useEditor.getState();
  if (gid) editor.selectTile(gid);
  editor.setTool('brush');
}
