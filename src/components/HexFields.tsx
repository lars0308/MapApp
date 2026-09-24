import type { HexSettings } from '../types';
import { defaultHex } from '../generator/presets';
import { NumberField, Section, Segmented, Slider, Toggle } from './ui';

export function resolveHex(hex: Partial<HexSettings> | undefined): HexSettings {
  return { ...defaultHex(), ...hex };
}

/** Settings of a hex world – used in the setup wizard and in the generator panel. */
export function HexFields({ hex, onChange }: { hex: HexSettings; onChange: (patch: Partial<HexSettings>) => void }) {
  return (
    <>
      <Section title="Welt">
        <div className="field">
          <label>Landform</label>
          <Segmented
            label="Landform"
            value={hex.shape}
            options={[
              { value: 'continent', label: 'Kontinent' },
              { value: 'islands', label: 'Inseln' },
            ]}
            onChange={(shape) => onChange({ shape })}
          />
        </div>
        <div className="field">
          <label>Klima</label>
          <Segmented
            label="Klima"
            value={hex.climate}
            options={[
              { value: 'cold', label: 'Kalt' },
              { value: 'temperate', label: 'Gemäßigt' },
              { value: 'hot', label: 'Heiß' },
            ]}
            onChange={(climate) => onChange({ climate })}
          />
        </div>
        <Slider label="Wasser" value={hex.water} unit=" %" hint={['Viel Land', 'Viel Meer']} onChange={(v) => onChange({ water: v })} />
        <Slider label="Gebirge & Hügel" value={hex.mountains} unit=" %" hint={['Flach', 'Bergig']} onChange={(v) => onChange({ mountains: v })} />
        <Slider label="Wälder" value={hex.forests} unit=" %" onChange={(v) => onChange({ forests: v })} />
        <Slider label="Flüsse" value={hex.rivers} unit=" %" onChange={(v) => onChange({ rivers: v })} />
      </Section>
      <Section title="Völker & Orte">
        <div className="grid-2">
          <NumberField label="Spieler" value={hex.players} min={0} max={6} onChange={(v) => onChange({ players: v })} />
          <NumberField label="Siedlungen" value={hex.towns} min={0} max={40} onChange={(v) => onChange({ towns: v })} />
        </div>
        <p className="hint">Jeder Spieler bekommt eine Hauptstadt (Burg + Fahne), möglichst weit von den anderen entfernt.</p>
        <Toggle label="Straßen" description="Verbinden alle Siedlungen – über das günstigste Gelände" checked={hex.roads} onChange={(roads) => onChange({ roads })} />
        <Slider label="Rohstoffe" value={hex.resources} unit=" %" hint={['Wenige', 'Viele']} onChange={(v) => onChange({ resources: v })} />
        <p className="hint">Minen in Bergen, Felder bei Städten, Ruinen in Wüste und Wald.</p>
      </Section>
    </>
  );
}
