import { useEffect, useRef, useState } from 'react';
import type { GeneratorSettings, MapSettings, Perspective, ProjectMode, RoomShape, SpecialRoomType, TerrainSet, Tileset } from '../../types';
import { PERSPECTIVES } from '../../types';
import { DEFAULT_MAP, defaultGenerator, defaultTerrainSets } from '../../generator/presets';
import { TerrainFields } from '../TerrainFields';
import { PERSPECTIVE_INFO, requiredRooms } from '../../generator/perspective';
import { SideFields, resolveSide } from '../SideFields';
import { HexFields, resolveHex } from '../HexFields';
import { randomSeed } from '../../generator/rng';
import { COMMON_TILE_SIZES } from '../../tilesets/slicing';
import { createProject, useProject } from '../../store/projectStore';
import { useEditor } from '../../store/editorStore';
import { useApp } from '../../store/appStore';
import { DEFAULT_PROFILE, EFFORTS, GENRES, VIEWS, applyProfile, deriveConfig, genreInfo, profileLabel, type GameProfile } from '../../profiles';
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

type StepId = 'game' | 'perspective' | 'tiles' | 'map' | 'content' | 'summary';

const STEP_LABEL: Record<StepId, string> = {
  game: 'Spiel',
  perspective: 'Ansicht',
  tiles: 'Tiles',
  map: 'Karte',
  content: 'Inhalt',
  summary: 'Fertig',
};

/**
 * Few steps: game (+ mode) → view (only if there is a choice) → tiles → map (size + layout; side
 * view: level, hex: world) → content (special rooms, terrain, enemies; top-down only) → finish.
 * Manual building needs no generator settings.
 */
function flowFor(mode: ProjectMode, kind: 'rooms' | 'side' | 'hex', choosePerspective: boolean): StepId[] {
  const steps: StepId[] = ['game', ...(choosePerspective ? (['perspective'] as StepId[]) : []), 'tiles', 'map'];
  if (mode === 'generate' && kind === 'rooms') steps.push('content');
  steps.push('summary');
  return steps;
}

const ROOM_SIZES = [
  { id: 'small', label: 'Klein', v: { roomMinW: 4, roomMaxW: 7, roomMinH: 4, roomMaxH: 7 } },
  { id: 'medium', label: 'Mittel', v: { roomMinW: 6, roomMaxW: 12, roomMinH: 6, roomMaxH: 10 } },
  { id: 'large', label: 'Groß', v: { roomMinW: 10, roomMaxW: 18, roomMinH: 8, roomMaxH: 14 } },
];
const MAP_SIZES = [
  { label: 'Klein', n: 40 },
  { label: 'Mittel', n: 64 },
  { label: 'Groß', n: 96 },
  { label: 'Riesig', n: 160 },
];
const LAYOUTS: { id: 'rooms' | 'cave' | 'outdoor' | 'village'; label: string; text: string }[] = [
  { id: 'rooms', label: 'Räume', text: 'Gebaute Räume und Gänge' },
  { id: 'cave', label: 'Höhle', text: 'Natürliche Kammern' },
  { id: 'outdoor', label: 'Außen', text: 'Lichtungen im Wald' },
  { id: 'village', label: 'Dorf', text: 'Häuser und Brunnen' },
];

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
  profile: GameProfile;
  mode: ProjectMode;
  tiles: TilesChoice;
  name: string;
  map: MapSettings;
  gen: GeneratorSettings;
  terrains: TerrainSet[];
}

/** new answers → sliders and map size start from the profile (seed and tile size stay) */
function withProfile(d: Draft, patch: Partial<GameProfile>): Draft {
  const profile = { ...d.profile, ...patch };
  if (!genreInfo(profile.genre).views.includes(profile.view)) profile.genre = profile.view === 'side_scroller' ? 'platformer' : profile.view === 'hexagonal' ? 'strategy' : 'other';
  const { gen, map } = applyProfile(profile, defaultGenerator(d.gen.seed), DEFAULT_MAP);
  const allowed = deriveConfig(profile).perspectives;
  return { ...d, profile, gen, map: { ...d.map, ...map, perspective: allowed.includes(d.map.perspective) ? d.map.perspective : allowed[allowed.length - 1] } };
}

function freshDraft(): Draft {
  return {
    profile: DEFAULT_PROFILE,
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
  const [draft, setDraft] = useState<Draft>(() => {
    // "Neue Karte → Side-Scroller …": start with that view (still changeable in step 1)
    const d = freshDraft();
    const view = useEditor.getState().wizardView;
    return view ? withProfile(d, { view, genre: view === 'hexagonal' ? 'strategy' : view === 'side_scroller' ? 'platformer' : d.profile.genre }) : d;
  });
  const [busy, setBusy] = useState(false);
  const [library, setLibrary] = useState<LibraryTileset[] | null>(null);
  const [upload, setUpload] = useState<Tileset | null>(null);
  const bodyRef = useRef<HTMLDivElement>(null);
  const sideView = draft.map.perspective === 'side_view';
  const hexView = draft.map.perspective === 'hex';
  const steps = flowFor(draft.mode, sideView ? 'side' : hexView ? 'hex' : 'rooms', deriveConfig(draft.profile).perspectives.length > 1);
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
  /** new answers → sliders and map size start from the profile (seed and tile size stay) */
  const setProfile = (patch: Partial<GameProfile>) => setDraft((d) => withProfile(d, patch));
  const allowedPerspectives = deriveConfig(draft.profile).perspectives;

  // braces matter: newer Chrome returns a Promise from scrollTo(), React would call it as cleanup
  useEffect(() => {
    bodyRef.current?.scrollTo({ top: 0 });
  }, [step]);

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
    if (!sideView && !hexView && gen.roomCount < need) {
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
          profile: draft.profile,
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
      useApp.getState().goTo('map');
      toast(
        draft.mode === 'generate'
          ? sideView
            ? 'Level erstellt – mit ▶ gleich testen'
            : hexView
              ? 'Welt erstellt – Gelände, Flüsse und Straßen lassen sich übermalen'
              : 'Map erstellt'
          : sideView
            ? 'Baukasten geöffnet – festen Boden malen, Gras und Kanten entstehen automatisch'
            : hexView
              ? 'Baukasten geöffnet – Gelände-Hexe malen; Flüsse und Straßen verbinden sich selbst'
            : 'Baukasten geöffnet – Boden malen legt Räume und Wege an, Wände entstehen automatisch',
        'success',
      );
    } catch (e) {
      console.error(e);
      toast(`Projekt konnte nicht erstellt werden: ${e instanceof Error ? e.message : String(e)}`, 'error');
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
          {id === 'game' && <GameStep draft={draft} onChange={setProfile} onMode={(mode) => setDraft((d) => ({ ...d, mode }))} />}

          {id === 'perspective' && (
            <StepSection title="Wie soll deine Map dargestellt werden?">
              <div className="persp-grid" role="radiogroup" aria-label="Perspektive">
                {PERSPECTIVES.filter((p) => allowedPerspectives.includes(p)).map((p) => (
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
            <StepSection title={draft.mode === 'manual' ? 'Wie groß soll die Karte werden?' : sideView ? 'Wie soll dein Level aussehen?' : hexView ? 'Wie soll deine Welt aussehen?' : 'Wie soll die Karte aufgebaut sein?'}>
              {!sideView && (
                <div className="field">
                  <label>Größe</label>
                  <div className="chips">
                    {MAP_SIZES.map((z) => (
                      <Chip key={z.n} active={map.width === z.n && map.height === z.n} onClick={() => setMap({ width: z.n, height: z.n })}>
                        {z.label} ({z.n} × {z.n})
                      </Chip>
                    ))}
                  </div>
                </div>
              )}
              <details className="more" open={sideView}>
                <summary>Genaue Größe, Tilegröße, Seed</summary>
                <div className="grid-2">
                  <NumberField label="Breite" value={map.width} min={16} max={256} suffix="Tiles" onChange={(v) => setMap({ width: v })} />
                  <NumberField label="Höhe" value={map.height} min={16} max={256} suffix="Tiles" onChange={(v) => setMap({ height: v })} />
                </div>
                <div className="field">
                  <label>Tilegröße</label>
                  <Segmented
                    label="Tilegröße"
                    value={COMMON_TILE_SIZES.includes(map.tileSize) ? String(map.tileSize) : 'custom'}
                    options={[...COMMON_TILE_SIZES.map((sz) => ({ value: String(sz), label: `${sz} px` })), { value: 'custom', label: 'Frei' }]}
                    onChange={(v) => setMap({ tileSize: v === 'custom' ? (COMMON_TILE_SIZES.includes(map.tileSize) ? 24 : map.tileSize) : Number(v) })}
                  />
                </div>
                {!COMMON_TILE_SIZES.includes(map.tileSize) && <NumberField label="Freie Tilegröße" value={map.tileSize} min={4} max={256} suffix="px" onChange={(v) => setMap({ tileSize: v })} />}
                <div className="derived">
                  <span>
                    {map.width} × {map.height} Tiles · {map.tileSize} px
                  </span>
                  <strong>
                    = {map.width * map.tileSize} × {map.height * map.tileSize} Pixel
                  </strong>
                </div>
                {draft.mode === 'generate' && (
                  <div className="field">
                    <label htmlFor="wiz-seed">Seed</label>
                    <div className="seed-row">
                      <input id="wiz-seed" className="input mono" value={gen.seed} onChange={(e) => setGen({ seed: e.target.value.slice(0, 40) })} />
                      <IconButton label="Zufälliger Seed" onClick={() => setGen({ seed: randomSeed() })}>
                        <Icon.Dice size={18} />
                      </IconButton>
                    </div>
                  </div>
                )}
              </details>

              {draft.mode === 'generate' && sideView && (
                <>
                  <p className="hint side-intro">Das Level läuft von links (Start) nach rechts (Ziel). Es wird nur so gebaut, dass alles mit der eingestellten Sprunghöhe und -weite schaffbar ist.</p>
                  <SideFields
                    side={resolveSide(gen.side)}
                    onChange={(patch) => setGen({ side: { ...resolveSide(gen.side), ...patch } })}
                    boss={gen.specials.boss}
                    onBoss={(boss) => setGen({ specials: { ...gen.specials, boss } })}
                    deco={gen.decoDensity}
                    onDeco={(v) => setGen({ decoDensity: v })}
                  />
                </>
              )}
              {draft.mode === 'generate' && hexView && <HexFields hex={resolveHex(gen.hex)} onChange={(patch) => setGen({ hex: { ...resolveHex(gen.hex), ...patch } })} />}

              {draft.mode === 'generate' && !sideView && !hexView && (
                <>
                  <div className="field">
                    <label>Aufbau</label>
                    <div className="layout-cards" role="radiogroup" aria-label="Aufbau">
                      {LAYOUTS.map((l) => (
                        <button key={l.id} type="button" role="radio" aria-checked={(gen.layout ?? 'rooms') === l.id} className={`layout-card${(gen.layout ?? 'rooms') === l.id ? ' is-active' : ''}`} onClick={() => setGen({ layout: l.id })}>
                          <strong>{l.label}</strong>
                          <small>{l.text}</small>
                        </button>
                      ))}
                    </div>
                  </div>
                  {gen.layout && gen.layout !== 'rooms' && <Slider label="Zerklüftung" value={gen.caveRoughness ?? (gen.layout === 'cave' ? 60 : 45)} unit="%" hint={['Glatt', 'Zerklüftet']} onChange={(v) => setGen({ caveRoughness: v })} />}
                  <Slider label="Anzahl Räume" value={gen.roomCount} min={2} max={60} onChange={(v) => setGen({ roomCount: v })} />
                  <div className="field">
                    <label>Raumgröße</label>
                    <Segmented
                      label="Raumgröße"
                      value={ROOM_SIZES.find((r) => r.v.roomMinW === gen.roomMinW && r.v.roomMaxW === gen.roomMaxW && r.v.roomMinH === gen.roomMinH && r.v.roomMaxH === gen.roomMaxH)?.id ?? 'custom'}
                      options={[
                        ...ROOM_SIZES.map((r) => ({ value: r.id, label: r.label })),
                        ...(ROOM_SIZES.some((r) => r.v.roomMinW === gen.roomMinW && r.v.roomMaxW === gen.roomMaxW && r.v.roomMinH === gen.roomMinH && r.v.roomMaxH === gen.roomMaxH) ? [] : [{ value: 'custom', label: 'Eigene' }]),
                      ]}
                      onChange={(v) => {
                        const r = ROOM_SIZES.find((x) => x.id === v);
                        if (r) setGen(r.v);
                      }}
                    />
                  </div>
                  <Slider label="Gangbreite" value={gen.corridorWidth} min={1} max={6} unit="Tiles" onChange={(v) => setGen({ corridorWidth: v, corridorMinWidth: Math.min(gen.corridorMinWidth, v), corridorMaxWidth: Math.max(gen.corridorMaxWidth, v) })} />
                  <Slider label="Verwinkelung" value={gen.twistiness} unit="%" hint={['Gerade', 'Verwinkelt']} onChange={(v) => setGen({ twistiness: v })} />
                  <Slider label="Vernetzung" value={gen.connectivity} unit="%" hint={['Ein Weg', 'Viele Rundwege']} onChange={(v) => setGen({ connectivity: v })} />
                  <details className="more">
                    <summary>Feineinstellungen: Maße, Formen, Gänge</summary>
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
                    {gen.shapes.irregular && <Slider label="Unregelmäßigkeit" value={gen.irregularity} unit="%" hint={['Leicht zerklüftet', 'Stark zerklüftet']} onChange={(v) => setGen({ irregularity: v })} />}
                    <Slider label="Umwege" value={100 - gen.directness} unit="%" hint={['Direkt', 'Umwege']} onChange={(v) => setGen({ directness: 100 - v })} />
                    <div className="chips">
                      {CORRIDOR_OPTS.map((o) => (
                        <Chip key={o.id} active={gen.corridor[o.id]} onClick={() => setGen({ corridor: { ...gen.corridor, [o.id]: !gen.corridor[o.id] } })}>
                          {o.label}
                        </Chip>
                      ))}
                    </div>
                  </details>
                </>
              )}
              {draft.mode === 'manual' && <p className="hint">Du baust die Karte selbst: Boden malen legt Räume und Wege an. Im Baukasten schaltest du „Auto-Wände“ bei Bedarf ein.</p>}
            </StepSection>
          )}

          {id === 'content' && (
            <StepSection title="Was soll in der Karte sein?">
              <div className="field">
                <label>Spezialräume</label>
                <div className="special-grid">
                  {SPECIALS.map((sp) => {
                    const on = gen.specials[sp.id];
                    return (
                      <button key={sp.id} type="button" className={`special-card${on ? ' is-on' : ''}`} aria-pressed={on} onClick={() => setGen({ specials: { ...gen.specials, [sp.id]: !on } })}>
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
              </div>
              <Slider label="Gegner" value={gen.population?.enemies ?? 0} unit="%" onChange={(v) => setGen({ population: { loot: gen.population?.loot ?? 0, enemies: v } })} />
              <Slider label="Beute (Truhen)" value={gen.population?.loot ?? 0} unit="%" onChange={(v) => setGen({ population: { enemies: gen.population?.enemies ?? 0, loot: v } })} />
              <Slider label="Deko" value={gen.decoDensity} unit="%" onChange={(v) => setGen({ decoDensity: v })} />
              <details className="more">
                <summary>Gelände: Wasser, Lava, Abgründe, Klippen, Brücken</summary>
                <TerrainFields value={gen.terrain} onChange={(terrain) => setGen({ terrain })} />
                <div className="field">
                  <label>Boden-Materialien</label>
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
              </details>
              <details className="more">
                <summary>Objekte und Boden-Varianten</summary>
                <Slider label="Boden-Varianten" value={gen.floorVariation} unit="%" onChange={(v) => setGen({ floorVariation: v })} />
                <Slider label="Kleine Hindernisse" value={gen.obstacleDensity} unit="%" onChange={(v) => setGen({ obstacleDensity: v })} />
                <Slider label="Bäume" value={gen.objects.trees} unit="%" onChange={(v) => setGen({ objects: { ...gen.objects, trees: v } })} />
                <Slider label="Große Felsen" value={gen.objects.rocks} unit="%" onChange={(v) => setGen({ objects: { ...gen.objects, rocks: v } })} />
                <Slider label="Torbögen" value={gen.objects.arches} unit="%" onChange={(v) => setGen({ objects: { ...gen.objects, arches: v } })} />
                <Toggle label="Säulen in großen Hallen" checked={gen.objects.pillars} onChange={(pillars) => setGen({ objects: { ...gen.objects, pillars } })} />
              </details>
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
    ['Spiel', profileLabel(draft.profile)],
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
  const sd = resolveSide(gen.side);
  const sideRows: [string, string][] = [
    ['Umgebung', sd.style === 'cave' ? 'Höhle' : 'Draußen'],
    ['Sprung', `${sd.jumpHeight} hoch · ${sd.jumpWidth} weit`],
    ['Gelände', `Hügel ${sd.hills} % · Gruben ${sd.gaps} % · Plattformen ${sd.platforms} %${sd.ladders ? ' · Leitern' : ''}`],
    ['Gefahren', [sd.hazards.abyss && 'Abgrund', sd.hazards.water && 'Wasser', sd.hazards.lava && 'Lava', sd.hazards.spikes && 'Stacheln'].filter(Boolean).join(', ')],
    ['Inhalt', `Gegner ${sd.enemies} % · Belohnungen ${sd.loot} %${gen.specials.boss ? ' · Boss-Arena' : ''}`],
    ['Seed', gen.seed],
  ];
  const hx = resolveHex(gen.hex);
  const hexRows: [string, string][] = [
    ['Welt', `${hx.shape === 'islands' ? 'Inseln' : 'Kontinent'} · ${hx.climate === 'cold' ? 'kalt' : hx.climate === 'hot' ? 'heiß' : 'gemäßigt'}`],
    ['Gelände', `Wasser ${hx.water} % · Gebirge ${hx.mountains} % · Wald ${hx.forests} % · Flüsse ${hx.rivers} %`],
    ['Völker & Orte', `${hx.players} Spieler · ${hx.towns} Siedlungen${hx.roads ? ' · Straßen' : ''} · Rohstoffe ${hx.resources} %`],
    ['Seed', gen.seed],
  ];
  const side = map.perspective === 'side_view';
  const hex = map.perspective === 'hex';
  const plain = side || hex;
  const rows =
    draft.mode === 'generate'
      ? [...(plain ? base.map(([k, v]) => [k, k === 'Perspektive' ? PERSPECTIVE_INFO[map.perspective].label : v] as [string, string]) : base), ...(side ? sideRows : hex ? hexRows : generatorRows)]
      : base;
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
      {draft.mode === 'generate' && !plain && <RoomCountGuard specials={gen.specials} roomCount={gen.roomCount} onFix={onFixRooms} />}
    </StepSection>
  );
}

/** Manual mode: floor layer active, brush with a floor tile of the chosen tiles. */
export function prepareBuildKit() {
  const p = useProject.getState().project;
  const side = p.map.perspective === 'side_view';
  const hex = p.map.perspective === 'hex';
  const floor = p.layers.find((l) => l.role === (side ? 'walls' : 'floor'));
  if (floor) useProject.getState().setActiveLayer(floor.id);
  const pools = new TilePools(p.tilesets, p.map.perspective);
  const gid = side ? pools.pickRole(new Rng(1), 'ground_top', ['side', 'grass']) : hex ? pools.pickTagged(new Rng(1), 'floor', 'grass') : pools.pickPref(new Rng(1), ['floor']);
  const editor = useEditor.getState();
  if (gid) editor.selectTile(gid);
  editor.setTool('hand'); // tile ready, drawing starts with the brush (no accidental strokes)
}

/** Step 1: what kind of game – view, genre, effort. Changes the start values of all later steps. */
function GameStep({ draft, onChange, onMode }: { draft: Draft; onChange: (p: Partial<GameProfile>) => void; onMode: (m: ProjectMode) => void }) {
  const { profile, gen, map } = draft;
  const genres = GENRES.filter((g) => g.views.includes(profile.view));
  const specials = SPECIALS.filter((s) => gen.specials[s.id]).map((s) => s.label);
  return (
    <StepSection title="Was für ein Spiel baust du?">
      <div className="field">
        <label>Ansicht</label>
        <div className="choice-grid game-views" role="radiogroup" aria-label="Ansicht">
          {VIEWS.map((v) => (
            <button
              key={v.id}
              type="button"
              role="radio"
              aria-checked={profile.view === v.id}
              disabled={!v.available}
              className={`choice-card${profile.view === v.id ? ' is-selected' : ''}${v.available ? '' : ' is-soon'}`}
              onClick={() => onChange({ view: v.id })}
            >
              <span className="choice-text">
                <strong>
                  {v.label}
                  {!v.available && <span className="badge">bald</span>}
                </strong>
                <small>{v.text}</small>
              </span>
            </button>
          ))}
        </div>
      </div>
      <div className="field">
        <label>Genre / Art des Spiels</label>
        <div className="choice-grid game-genres" role="radiogroup" aria-label="Genre">
          {genres.map((g) => (
            <button key={g.id} type="button" role="radio" aria-checked={profile.genre === g.id} className={`choice-card${profile.genre === g.id ? ' is-selected' : ''}`} onClick={() => onChange({ genre: g.id })}>
              <span className="choice-text">
                <strong>{g.label}</strong>
                <small>{g.text}</small>
              </span>
            </button>
          ))}
        </div>
      </div>
      <div className="field">
        <label>Wie aufwendig?</label>
        <div className="choice-grid game-effort" role="radiogroup" aria-label="Aufwand">
          {EFFORTS.map((e) => (
            <button
              key={e.id}
              type="button"
              role="radio"
              aria-checked={(profile.effort ?? 'medium') === e.id}
              className={`choice-card${(profile.effort ?? 'medium') === e.id ? ' is-selected' : ''}`}
              onClick={() => onChange({ effort: e.id })}
            >
              <span className="choice-text">
                <strong>{e.label}</strong>
                <small>{e.text}</small>
              </span>
            </button>
          ))}
        </div>
      </div>
      <div className="field">
        <label>Wie möchtest du bauen?</label>
        <div className="choice-grid game-effort" role="radiogroup" aria-label="Modus">
          {(
            [
              ['generate', 'Automatisch generieren', 'Die Karte wird nach deinen Einstellungen erzeugt – danach frei bearbeitbar.'],
              ['manual', 'Selbst bauen (Baukasten)', 'Leere Karte: Räume und Wege selbst malen.'],
            ] as const
          ).map(([m, title, text]) => (
            <button key={m} type="button" role="radio" aria-checked={draft.mode === m} className={`choice-card${draft.mode === m ? ' is-selected' : ''}`} onClick={() => onMode(m)}>
              <span className="choice-text">
                <strong>{title}</strong>
                <small>{text}</small>
              </span>
            </button>
          ))}
        </div>
      </div>
      <p className="note game-summary">
        Voreingestellt: <strong>{map.width} × {map.height} Tiles</strong> · <strong>{gen.roomCount} Räume</strong> ({gen.roomMinW}–{gen.roomMaxW} Tiles breit) · Deko {gen.decoDensity} % ·
        Spezialräume: {specials.join(', ') || 'keine'}. Alles lässt sich im nächsten Schritt oder später links unter „Aufbau“ ändern.
      </p>
    </StepSection>
  );
}
