import type { SideSettings } from '../types';
import { defaultSide } from '../generator/presets';
import { Chip, NumberField, Section, Segmented, Slider, Toggle } from './ui';

/** stored side settings merged with the defaults (older projects have none) */
export function resolveSide(side: Partial<SideSettings> | undefined): SideSettings {
  const d = defaultSide();
  return { ...d, ...side, hazards: { ...d.hazards, ...side?.hazards } };
}

const HAZARDS: { id: keyof SideSettings['hazards']; label: string }[] = [
  { id: 'abyss', label: 'Abgrund' },
  { id: 'water', label: 'Wasser' },
  { id: 'lava', label: 'Lava' },
  { id: 'spikes', label: 'Stacheln' },
];

/** Settings of a side-scroller level – used in the setup wizard and in the generator panel. */
export function SideFields({
  side,
  onChange,
  boss,
  onBoss,
  deco,
  onDeco,
}: {
  side: SideSettings;
  onChange: (patch: Partial<SideSettings>) => void;
  boss: boolean;
  onBoss: (v: boolean) => void;
  deco: number;
  onDeco: (v: number) => void;
}) {
  return (
    <>
      <Section title="Level">
        <div className="field">
          <label>Umgebung</label>
          <Segmented
            label="Umgebung"
            value={side.style}
            options={[
              { value: 'outdoor', label: 'Draußen' },
              { value: 'cave', label: 'Höhle' },
            ]}
            onChange={(style) => onChange({ style })}
          />
        </div>
        <div className="grid-2">
          <NumberField label="Sprunghöhe" value={side.jumpHeight} min={1} max={6} suffix="Tiles" onChange={(v) => onChange({ jumpHeight: v })} />
          <NumberField label="Sprungweite" value={side.jumpWidth} min={2} max={8} suffix="Tiles" onChange={(v) => onChange({ jumpWidth: v })} />
        </div>
        <p className="hint">So hoch und weit kommt deine Figur. 3 / 4 passt zur Platformer-Figur aus dem Figuren-Export.</p>
      </Section>

      <Section title="Gelände">
        <Slider label="Hügel & Stufen" value={side.hills} unit=" %" hint={['Flach', 'Bergig']} onChange={(v) => onChange({ hills: v })} />
        <Slider label="Gruben" value={side.gaps} unit=" %" hint={['Selten', 'Oft']} onChange={(v) => onChange({ gaps: v })} />
        <Slider label="Plattformen" value={side.platforms} unit=" %" hint={['Wenige', 'Viele']} onChange={(v) => onChange({ platforms: v })} />
        <Toggle label="Leitern" description="Hohe Stufen mit Leiter nach oben" checked={side.ladders} onChange={(ladders) => onChange({ ladders })} />
        <Toggle label="Aufzüge" description="Plattformen, die zu hohen Kanten hoch- und runterfahren" checked={side.lifts !== false} onChange={(lifts) => onChange({ lifts })} />
        <div className="field">
          <label>In den Gruben</label>
          <div className="chips">
            {HAZARDS.map((h) => (
              <Chip
                key={h.id}
                active={side.hazards[h.id]}
                onClick={() => {
                  const next = { ...side.hazards, [h.id]: !side.hazards[h.id] };
                  if (Object.values(next).some(Boolean)) onChange({ hazards: next });
                }}
              >
                {h.label}
              </Chip>
            ))}
          </div>
        </div>
      </Section>

      <Section title="Inhalt">
        <Slider label="Gegner" value={side.enemies} unit=" %" hint={['Keine', 'Viele']} onChange={(v) => onChange({ enemies: v })} />
        <Slider label="Belohnungen" value={side.loot} unit=" %" hint={['Wenige', 'Viele']} onChange={(v) => onChange({ loot: v })} />
        <Toggle label="Boss-Arena vor dem Ziel" checked={boss} onChange={onBoss} />
        <Slider label="Deko" value={deco} unit=" %" onChange={onDeco} />
      </Section>
    </>
  );
}
