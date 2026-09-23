import { useState } from 'react';
import { useProject } from '../store/projectStore';
import { useEditor } from '../store/editorStore';
import { Button, Section, Segmented, SelectField, Toggle } from '../components/ui';
import { Icon } from '../components/icons';
import { exportGodotPackage, exportGodotScript, exportJson, exportPng, exportProjectFile } from './actions';
import { pngSize, pngTooLarge } from './pngExport';
import { ProjectSection } from '../persistence/ProjectSection';

export function ExportPanel() {
  const project = useProject((s) => s.project);
  const toast = useEditor((s) => s.toast);
  const [busy, setBusy] = useState<string | null>(null);
  const [pngLayers, setPngLayers] = useState<string>('visible');
  const [pngGrid, setPngGrid] = useState(false);
  const [pngBg, setPngBg] = useState(true);
  const [pngScale, setPngScale] = useState<'1' | '0.5' | '0.25'>('1');

  const tilePx = Math.max(1, Math.round(project.map.tileSize * Number(pngScale)));
  const size = pngSize(project, tilePx);
  const tooLarge = pngTooLarge(project, tilePx);

  const run = async (key: string, fn: () => Promise<void> | void, done: string) => {
    setBusy(key);
    try {
      await fn();
      toast(done, 'success');
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Export fehlgeschlagen', 'error');
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="panel-scroll">
      <ProjectSection />

      <Section title="Export">
        <div className="export-list">
          <ExportItem
            title="Projektdatei"
            meta=".mapforge.json · vollständig wieder importierbar"
            busy={busy === 'project'}
            onClick={() => run('project', () => exportProjectFile(project), 'Projektdatei exportiert')}
          />
          <ExportItem
            title="JSON"
            meta="Map-Daten für Godot, Tilesets eingebettet"
            busy={busy === 'json'}
            onClick={() => run('json', () => exportJson(project), 'JSON exportiert')}
          />
          <ExportItem
            title="Godot-Paket"
            meta="ZIP: map.json, Tileset-PNGs, Loader-Script"
            busy={busy === 'godot'}
            onClick={() => run('godot', () => exportGodotPackage(project), 'Godot-Paket exportiert')}
          />
          <ExportItem
            title="GDScript"
            meta="mapforge_loader.gd · TileMapLayer-Beispiel"
            busy={busy === 'gd'}
            onClick={() => run('gd', () => exportGodotScript(), 'Script exportiert')}
          />
        </div>
      </Section>

      <Section title="PNG">
        <SelectField
          label="Inhalt"
          value={pngLayers}
          onChange={setPngLayers}
          options={[{ value: 'visible', label: 'Alle sichtbaren Layer' }, ...project.layers.map((l) => ({ value: l.id, label: `Nur ${l.name}` }))]}
        />
        <div className="field">
          <label>Maßstab</label>
          <Segmented
            label="Maßstab"
            value={pngScale}
            onChange={setPngScale}
            options={[
              { value: '1', label: '100 %' },
              { value: '0.5', label: '50 %' },
              { value: '0.25', label: '25 %' },
            ]}
          />
        </div>
        <Toggle label="Raster" checked={pngGrid} onChange={setPngGrid} />
        <Toggle label="Hintergrund" description="Aus = transparent" checked={pngBg} onChange={setPngBg} />
        <div className="derived">
          <span>Ausgabe</span>
          <strong>
            {size.w} × {size.h} px
          </strong>
        </div>
        {tooLarge && <p className="warning">Zu groß für den Browser – Maßstab verringern.</p>}
        <Button
          variant="primary"
          block
          icon={<Icon.Download size={18} />}
          disabled={tooLarge || busy === 'png'}
          onClick={() => run('png', () => exportPng(project, { layers: pngLayers, grid: pngGrid, background: pngBg, tilePx }), 'PNG exportiert')}
        >
          {busy === 'png' ? 'Rendere …' : 'PNG exportieren'}
        </Button>
      </Section>
    </div>
  );
}

function ExportItem({ title, meta, onClick, busy }: { title: string; meta: string; onClick: () => void; busy: boolean }) {
  return (
    <button type="button" className="export-item" onClick={onClick} disabled={busy}>
      <span>
        <strong>{title}</strong>
        <small>{meta}</small>
      </span>
      {busy ? <span className="spinner" /> : <Icon.Download size={18} />}
    </button>
  );
}
