import type { TerrainSettings } from '../types';
import { Slider, Toggle, NumberField } from './ui';

/** Terrain options (shared by the setup wizard and the terrain panel). */
export function TerrainFields({ value: t, onChange }: { value: TerrainSettings; onChange: (t: TerrainSettings) => void }) {
  const set = <K extends keyof TerrainSettings>(k: K, v: TerrainSettings[K]) => onChange({ ...t, [k]: v });
  return (
    <div className="terrain-fields">
      <div className="terrain-card is-fixed">
        <div className="terrain-static">
          <span>
            Normaler Boden
            <small>Böden der aktiven Terrain-Sets</small>
          </span>
          <span className="badge">immer</span>
        </div>
      </div>

      <div className={`terrain-card${t.water.enabled ? ' is-on' : ''}`}>
        <Toggle label="Wasser" description="Nicht begehbar, Brücken möglich" checked={t.water.enabled} onChange={(v) => set('water', { ...t.water, enabled: v })} />
        {t.water.enabled && <Slider label="Anteil" value={t.water.amount} unit="%" onChange={(v) => set('water', { ...t.water, amount: v })} />}
      </div>

      <div className={`terrain-card${t.lava.enabled ? ' is-on' : ''}`}>
        <Toggle label="Lava" description="Nicht begehbar, Brücken möglich" checked={t.lava.enabled} onChange={(v) => set('lava', { ...t.lava, enabled: v })} />
        {t.lava.enabled && <Slider label="Anteil" value={t.lava.amount} unit="%" onChange={(v) => set('lava', { ...t.lava, amount: v })} />}
      </div>

      <div className={`terrain-card${t.abyss.enabled ? ' is-on' : ''}`}>
        <Toggle label="Abgründe verwenden" description="Nicht begehbar – Start und Räume bleiben erreichbar" checked={t.abyss.enabled} onChange={(v) => set('abyss', { ...t.abyss, enabled: v })} />
        {t.abyss.enabled && (
          <>
            <Slider label="Anteil" value={t.abyss.amount} unit="%" onChange={(v) => set('abyss', { ...t.abyss, amount: v })} />
            <div className="grid-2">
              <NumberField label="Min. Größe" value={t.abyss.minSize} min={3} max={t.abyss.maxSize} suffix="Tiles" onChange={(v) => set('abyss', { ...t.abyss, minSize: v })} />
              <NumberField label="Max. Größe" value={t.abyss.maxSize} min={t.abyss.minSize} max={60} suffix="Tiles" onChange={(v) => set('abyss', { ...t.abyss, maxSize: v })} />
            </div>
            <Toggle label="Inseln erlauben" description="Ringförmige Abgründe mit Insel" checked={t.abyss.islands} onChange={(v) => set('abyss', { ...t.abyss, islands: v })} />
            <Toggle label="Brücken erlauben" description="Sonst werden trennende Abgründe weggelassen" checked={t.abyss.bridges} onChange={(v) => set('abyss', { ...t.abyss, bridges: v })} />
            <Toggle label="Abgründe in Räumen" checked={t.abyss.inRooms} onChange={(v) => set('abyss', { ...t.abyss, inRooms: v })} />
            <Toggle label="Abgründe zwischen Räumen" description="Schlucht quer über einem Gang, mit Brücke" checked={t.abyss.betweenRooms} onChange={(v) => set('abyss', { ...t.abyss, betweenRooms: v })} />
          </>
        )}
      </div>

      <div className={`terrain-card${t.cliffs.enabled ? ' is-on' : ''}`}>
        <Toggle label="Klippen / erhöhte Flächen" description="Plateaus mit Klippenkanten und Treppe" checked={t.cliffs.enabled} onChange={(v) => set('cliffs', { ...t.cliffs, enabled: v })} />
        {t.cliffs.enabled && <Slider label="Anteil" value={t.cliffs.amount} unit="%" onChange={(v) => set('cliffs', { ...t.cliffs, amount: v })} />}
      </div>

      <div className={`terrain-card${t.bridges ? ' is-on' : ''}`}>
        <Toggle label="Brücken" description="Über Wasser / Lava, wenn ein Weg sonst getrennt wäre" checked={t.bridges} onChange={(v) => set('bridges', v)} />
      </div>

      <div className={`terrain-card${t.transitions.enabled ? ' is-on' : ''}`}>
        <Toggle label="Übergangsflächen" description="An Raumeingängen und zwischen Terrains" checked={t.transitions.enabled} onChange={(v) => set('transitions', { ...t.transitions, enabled: v })} />
        {t.transitions.enabled && <Slider label="Anteil" value={t.transitions.amount} unit="%" onChange={(v) => set('transitions', { ...t.transitions, amount: v })} />}
      </div>
    </div>
  );
}
