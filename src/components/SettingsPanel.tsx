import { useEditor } from '../store/editorStore';
import { useProject } from '../store/projectStore';
import type { Perspective } from '../types';
import { deriveConfig } from '../profiles';
import { PERSPECTIVE_INFO } from '../generator/perspective';
import { Button, Section, Segmented, Toggle } from './ui';
import { Icon } from './icons';
import { startPlaytest } from '../playtest/controller';
import { useLayout } from '../store/layoutStore';
import { useState } from 'react';
import { forgetLearned, learnedCount } from '../tilesets/learning';

/** View / editor settings (mobile sheet, desktop: tab of the left panel). */
export function SettingsPanel({ desktop = false }: { desktop?: boolean }) {
  const e = useEditor();
  const map = useProject((s) => s.project.map);
  const setMapOptions = useProject((s) => s.setMapOptions);
  const profile = useProject((s) => s.project.profile);
  return (
    <div className="panel-scroll">
      <Section title="Ansicht">
        <Toggle label="Raster" checked={e.showGrid} onChange={() => e.toggleGrid()} />
        <Toggle label="Koordinaten" checked={e.showCoords} onChange={() => e.toggleCoords()} />
        <Toggle label="Kollisionen anzeigen" description="Nicht begehbare Felder rot markieren" checked={e.showCollision} onChange={(v) => e.setFlag('showCollision', v)} />
        <Toggle label="Sortierpunkte anzeigen" description="Y-Sort-Ursprung von Objekten und Charakter" checked={e.showSortPoints} onChange={(v) => e.setFlag('showSortPoints', v)} />
      </Section>
      <Section title="Bearbeiten">
        <Toggle
          label="Auto-Wände"
          description="Boden malen/löschen oder Tür setzen passt Wände, Ecken und Kollision automatisch an"
          checked={e.autoWalls}
          onChange={(v) => e.setFlag('autoWalls', v)}
        />
      </Section>
      <ClearMap />
      {map.perspective !== 'side_view' && (
        <Section title="Perspektive">
          <Segmented
            label="Perspektive"
            value={map.perspective}
            options={deriveConfig(profile)
              .perspectives.filter((p) => p !== 'side_view')
              .map((p: Perspective) => ({ value: p, label: PERSPECTIVE_INFO[p].label.replace(' / Isometric-like', '') }))}
            onChange={(perspective) => setMapOptions({ perspective })}
          />
          <Toggle label="Schatten" checked={map.shadows} onChange={(shadows) => setMapOptions({ shadows })} />
          <p className="hint">Wirkt beim nächsten Generieren.</p>
        </Section>
      )}
      {desktop && (
        <Section title="Arbeitsbereich">
          <p className="hint">
            Panels über die Symbole oben rechts ein-/ausblenden, am Rand ziehen für die Breite, zwischen Layer und Tiles ziehen für die Höhe (Doppelklick = Standardgröße), ↗ maximiert
            einen Bereich (Esc stellt wieder her). Die Anordnung wird in diesem Browser gespeichert.
          </p>
          <Button variant="secondary" block onClick={() => useLayout.getState().resetAll()}>
            Panel-Layout zurücksetzen
          </Button>
        </Section>
      )}
      <LearningSection />
      <Section title="Test">
        <Button variant="primary" block icon={<Icon.Play size={16} />} onClick={() => startPlaytest()}>
          Playtest starten
        </Button>
      </Section>
    </div>
  );
}

/** What the tile detection has learned from the user's assignments. */
function LearningSection() {
  const [count, setCount] = useState(() => learnedCount());
  return (
    <Section title="Tile-Erkennung">
      <p className="hint">
        Die App lernt aus jeder Zuordnung, die du triffst oder bestätigst (auch gespiegelt: eine korrigierte Ecke gilt für alle vier). Neue Tilesets werden dann zuerst mit dem Gelernten
        verglichen.
      </p>
      <div className="learn-row">
        <span>
          <strong>{count}</strong> gelernte Beispiele
        </span>
        <Button
          variant="ghost"
          disabled={!count}
          onClick={() => {
            forgetLearned();
            setCount(0);
          }}
        >
          Gelerntes vergessen
        </Button>
      </div>
    </Section>
  );
}

/** Clear the whole map (all unlocked layers, objects, structure) – one undo step. */
function ClearMap() {
  const [confirm, setConfirm] = useState(false);
  return (
    <Section title="Map leeren">
      <p className="hint">Tipp: Radierer → ▭ → „Alle Layer“ löscht einen beliebigen Bereich. Gesperrte Layer bleiben erhalten; Rückgängig ist möglich.</p>
      {confirm ? (
        <div className="learn-row">
          <span>Wirklich alles löschen?</span>
          <Button
            variant="danger"
            onClick={() => {
              const p = useProject.getState().project;
              useProject.getState().clearArea({ x: 0, y: 0, w: p.map.width, h: p.map.height });
              useEditor.getState().toast('Map geleert – Rückgängig ist möglich');
              setConfirm(false);
            }}
          >
            Löschen
          </Button>
          <Button variant="ghost" onClick={() => setConfirm(false)}>
            Abbrechen
          </Button>
        </div>
      ) : (
        <Button variant="secondary" block onClick={() => setConfirm(true)}>
          Ganze Map leeren
        </Button>
      )}
    </Section>
  );
}
