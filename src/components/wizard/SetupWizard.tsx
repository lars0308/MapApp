import { useEffect, useRef, useState } from 'react';
import type { GeneratorSettings, MapSettings, Perspective, RoomShape, SpecialRoomType } from '../../types';
import { PERSPECTIVES } from '../../types';
import { DEFAULT_MAP, defaultGenerator } from '../../generator/presets';
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

const STEPS = ['Ansicht', 'Map', 'Räume', 'Wege', 'Spezialräume', 'Ausstattung', 'Zusammenfassung'] as const;

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
  name: string;
  map: MapSettings;
  gen: GeneratorSettings;
}

function freshDraft(): Draft {
  return { name: 'Neues Projekt', map: { ...DEFAULT_MAP, perspective: 'top_down', shadows: true }, gen: defaultGenerator(randomSeed()) };
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
  const bodyRef = useRef<HTMLDivElement>(null);

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
    try {
      // keep the current project, except the untouched placeholder on first start
      if (!firstRun) await saveNow();
      const store = useProject.getState();
      store.loadProject(createProject(draft.name.trim() || 'Neues Projekt', { map: draft.map, generator: gen }));
      await useProject.getState().runGenerate();
      await saveNow();
      closeWizard();
      setView('map');
      toast('Map erstellt', 'success');
    } finally {
      setBusy(false);
    }
  };

  const last = step === STEPS.length - 1;
  const { map, gen } = draft;

  return (
    <div className="wizard-backdrop" role="presentation">
      <div className="wizard" role="dialog" aria-modal="true" aria-labelledby="wizard-title">
        <header className="wizard-head">
          <div className="wizard-title">
            <h2 id="wizard-title">Neues Projekt</h2>
            <span className="muted">
              Schritt {step + 1} von {STEPS.length} · {STEPS[step]}
            </span>
          </div>
          <IconButton label="Assistent schließen" onClick={() => void cancel()}>
            <Icon.Close size={20} />
          </IconButton>
        </header>

        <ol className="wizard-steps" aria-label="Fortschritt">
          {STEPS.map((label, i) => (
            <li key={label} className={i === step ? 'is-current' : i < step ? 'is-done' : ''}>
              <button type="button" onClick={() => setStep(i)} aria-current={i === step ? 'step' : undefined}>
                <span className="step-num">{i < step ? <Icon.Check size={13} /> : i + 1}</span>
                <span className="step-label">{label}</span>
              </button>
            </li>
          ))}
        </ol>

        <div className="wizard-body" ref={bodyRef}>
          {step === 0 && (
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

          {step === 1 && (
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

          {step === 2 && (
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

          {step === 3 && (
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

          {step === 4 && (
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

          {step === 5 && (
            <StepSection
              title="Ausstattung"
              aside={
                <Button variant="ghost" onClick={() => setStep(6)}>
                  Später konfigurieren
                </Button>
              }
            >
              <Slider label="Boden-Varianten" value={gen.floorVariation} unit="%" onChange={(v) => setGen({ floorVariation: v })} />
              <Slider label="Deko" value={gen.decoDensity} unit="%" onChange={(v) => setGen({ decoDensity: v })} />
              <Slider label="Hindernisse" value={gen.obstacleDensity} unit="%" onChange={(v) => setGen({ obstacleDensity: v })} />
              <Toggle label="Lava" checked={gen.lava} onChange={(v) => setGen({ lava: v })} />
              <Toggle label="Wasser" checked={gen.water} onChange={(v) => setGen({ water: v })} />
              {(gen.lava || gen.water) && <Slider label="Menge Lava / Wasser" value={gen.hazards} unit="%" onChange={(v) => setGen({ hazards: v })} />}
            </StepSection>
          )}

          {step === 6 && <Summary draft={draft} onName={(name) => setDraft((d) => ({ ...d, name }))} onFixRooms={(n) => setGen({ roomCount: n })} />}
        </div>

        <footer className="wizard-foot">
          <Button variant="secondary" disabled={step === 0 || busy} onClick={() => setStep(step - 1)} icon={<Icon.Undo size={16} />}>
            Zurück
          </Button>
          {last ? (
            <button type="button" className="btn btn-primary btn-create" disabled={busy} onClick={() => void create()}>
              <Icon.Spark size={18} />
              <span>{busy ? 'Erstelle …' : 'Map erstellen'}</span>
            </button>
          ) : (
            <Button variant="primary" className="btn-next" onClick={() => setStep(step + 1)}>
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

function Summary({ draft, onName, onFixRooms }: { draft: Draft; onName: (n: string) => void; onFixRooms: (n: number) => void }) {
  const { map, gen } = draft;
  const specials = SPECIALS.filter((s) => gen.specials[s.id]).map((s) => s.label);
  const shapes = SHAPES.filter((s) => gen.shapes[s.id]).map((s) => s.label);
  const hazards = [gen.lava && 'Lava', gen.water && 'Wasser'].filter(Boolean).join(', ') || 'keine';
  const rows: [string, string][] = [
    ['Perspektive', PERSPECTIVE_INFO[map.perspective].label + (map.shadows ? ' · mit Schatten' : '')],
    ['Map', `${map.width} × ${map.height} Tiles`],
    ['Tilegröße', `${map.tileSize} px (${map.width * map.tileSize} × ${map.height * map.tileSize} px)`],
    ['Räume', String(gen.roomCount)],
    ['Raumgröße', `${gen.roomMinW}–${gen.roomMaxW} × ${gen.roomMinH}–${gen.roomMaxH} Tiles`],
    ['Raumformen', shapes.join(', ')],
    ['Gangbreite', gen.corridorMinWidth === gen.corridorMaxWidth ? `${gen.corridorWidth} Tiles` : `${gen.corridorMinWidth}–${gen.corridorMaxWidth} Tiles (meist ${gen.corridorWidth})`],
    ['Spezialräume', specials.join(', ') || 'keine'],
    ['Verwinkelung', `${gen.twistiness} %`],
    ['Direktheit', `${100 - gen.directness} % Umwege`],
    ['Vernetzung', `${gen.connectivity} %`],
    ['Ausstattung', `Deko ${gen.decoDensity} % · Hindernisse ${gen.obstacleDensity} % · ${hazards}`],
    ['Seed', gen.seed],
  ];
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
      <RoomCountGuard specials={gen.specials} roomCount={gen.roomCount} onFix={onFixRooms} />
    </StepSection>
  );
}
