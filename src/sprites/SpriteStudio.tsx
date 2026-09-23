import { useEffect, useMemo, useRef, useState } from 'react';
import { SIZES, SLOTS, compose, composeView, deserialize, serialize, toPng, useSprites, type SpriteTool } from './store';
import { SpriteCanvas } from './SpriteCanvas';
import { PartsPanel } from './PartsPanel';
import { ColorsPanel, GalleryPanel, LayersList, PalettePanel } from './SidePanels';
import { PALETTE_PRESETS } from './palette';
import { VIEWS, type SpriteKind } from './types';
import { Icon } from '../components/icons';
import { Button, IconButton, Segmented } from '../components/ui';
import { useEditor } from '../store/editorStore';
import { dataUrlToBytes, downloadBlob, downloadText, readFileAsDataUrl, readFileAsText, safeFileName } from '../utils/download';

async function imageDataFromFile(file: File): Promise<ImageData> {
  const url = await readFileAsDataUrl(file);
  const img = await new Promise<HTMLImageElement>((res, rej) => {
    const i = new Image();
    i.onload = () => res(i);
    i.onerror = () => rej(new Error('Bild konnte nicht gelesen werden'));
    i.src = url;
  });
  const c = document.createElement('canvas');
  c.width = img.naturalWidth;
  c.height = img.naturalHeight;
  const g = c.getContext('2d', { willReadFrequently: true })!;
  g.drawImage(img, 0, 0);
  // crop transparent margins so the own sprite sits right
  const d = g.getImageData(0, 0, c.width, c.height);
  let x0 = c.width,
    y0 = c.height,
    x1 = -1,
    y1 = -1;
  for (let y = 0; y < c.height; y++)
    for (let x = 0; x < c.width; x++)
      if (d.data[(y * c.width + x) * 4 + 3] > 0) {
        x0 = Math.min(x0, x);
        y0 = Math.min(y0, y);
        x1 = Math.max(x1, x);
        y1 = Math.max(y1, y);
      }
  if (x1 < 0) throw new Error('Das Bild ist leer (nur transparent)');
  return g.getImageData(x0, y0, x1 - x0 + 1, y1 - y0 + 1);
}

const TOOLS: { id: SpriteTool; label: string; key: string; icon: (p: { size?: number }) => React.ReactElement }[] = [
  { id: 'pen', label: 'Stift', key: 'B', icon: Icon.Pencil },
  { id: 'eraser', label: 'Radierer', key: 'E', icon: Icon.Eraser },
  { id: 'fill', label: 'Füllen', key: 'G', icon: Icon.Fill },
  { id: 'pipette', label: 'Pipette', key: 'I', icon: Icon.Pipette },
  { id: 'line', label: 'Linie', key: 'L', icon: Icon.Line },
  { id: 'rect', label: 'Rechteck', key: 'R', icon: Icon.Rect },
  { id: 'move', label: 'Ebene verschieben', key: 'M', icon: Icon.Move },
  { id: 'dither', label: 'Dithering (Schachbrett)', key: 'D', icon: Icon.Dither },
  { id: 'replace', label: 'Farbe ersetzen (ganze Ebene)', key: 'F', icon: Icon.Swap },
  { id: 'lighten', label: 'Aufhellen', key: 'U', icon: Icon.Sun },
  { id: 'darken', label: 'Abdunkeln', key: 'J', icon: Icon.Moon },
  { id: 'hand', label: 'Ansicht verschieben (Leertaste)', key: 'H', icon: Icon.Hand },
];

type Tab = 'parts' | 'layers' | 'colors' | 'palette' | 'gallery';
const TABS: { id: Tab; label: string }[] = [
  { id: 'parts', label: 'Teile' },
  { id: 'layers', label: 'Ebenen' },
  { id: 'colors', label: 'Farben' },
  { id: 'palette', label: 'Palette' },
  { id: 'gallery', label: 'Galerie' },
];

/** "Charakter bauen" / "Objekt bauen": plug-and-play parts + free pixel drawing. */
export function SpriteStudio({ kind, desktop }: { kind: SpriteKind; desktop: boolean }) {
  const loaded = useSprites((s) => s.loaded[kind]);
  const [tab, setTab] = useState<Tab>('parts');
  const [savePart, setSavePart] = useState<{ layerId: string | null } | null>(null);

  useEffect(() => {
    void useSprites.getState().load(kind);
  }, [kind]);

  // shortcuts of this page (the map editor ignores keys on other pages)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable)) return;
      const st = useSprites.getState();
      const mod = e.ctrlKey || e.metaKey;
      const key = e.key.toLowerCase();
      if (mod && key === 'z') {
        e.preventDefault();
        if (e.shiftKey) st.redo(kind);
        else st.undo(kind);
      } else if (mod && key === 'y') {
        e.preventDefault();
        st.redo(kind);
      } else if (!mod && !e.altKey) {
        const tool = TOOLS.find((x) => x.key.toLowerCase() === key);
        if (tool) st.setTool(tool.id);
        else if (key === 'x') st.setMirror(!st.mirror);
        else if (key === '[' || key === ']') st.setBrush(Math.max(1, Math.min(8, st.brush + (key === ']' ? 1 : -1))));
        else if (key === '0') st.setView({ zoom: 1, pan: { x: 0, y: 0 } });
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [kind]);

  const panel = (
    <>
      <div className="sprite-tabs" role="tablist" aria-label="Bereiche">
        {TABS.map((t) => (
          <button key={t.id} type="button" role="tab" aria-selected={tab === t.id} className={tab === t.id ? 'is-active' : ''} onClick={() => setTab(t.id)}>
            {t.label}
          </button>
        ))}
      </div>
      <div className="sprite-tab-body">
        {tab === 'parts' && <PartsPanel kind={kind} />}
        {tab === 'layers' && <LayersList kind={kind} onSavePart={(layerId) => setSavePart({ layerId })} />}
        {tab === 'colors' && <ColorsPanel kind={kind} />}
        {tab === 'palette' && <PalettePanel kind={kind} />}
        {tab === 'gallery' && <GalleryPanel kind={kind} />}
      </div>
    </>
  );

  return (
    <div className={`sprite-studio kind-${kind}${desktop ? ' is-desktop' : ' is-mobile'}`}>
      <StudioBar kind={kind} onSavePart={() => setSavePart({ layerId: null })} />
      <div className="sprite-work">
        {/* phones: canvas + tools stay on screen while the parts list scrolls below */}
        <div className="sprite-main">
          <ToolRail />
          <div className="sprite-stage">
            <ViewHint kind={kind} />
            {loaded ? <SpriteCanvas kind={kind} /> : <div className="sprite-canvas" />}
            <Preview kind={kind} />
          </div>
        </div>
        <aside className="sprite-side">{panel}</aside>
      </div>
      {savePart && <SavePartDialog kind={kind} layerId={savePart.layerId} onClose={() => setSavePart(null)} />}
    </div>
  );
}

function StudioBar({ kind, onSavePart }: { kind: SpriteKind; onSavePart: () => void }) {
  const doc = useSprites((s) => s[kind].doc);
  const canUndo = useSprites((s) => s[kind].undo.length > 0);
  const canRedo = useSprites((s) => s[kind].redo.length > 0);
  const { undo, redo, randomize, renameDoc, setSize, reset } = useSprites.getState();
  const view = useSprites((s) => s.view);
  const [newOpen, setNewOpen] = useState(false);
  const [exportOpen, setExportOpen] = useState(false);
  const [ioOpen, setIoOpen] = useState(false);
  const [fileMode, setFileMode] = useState<'layer' | 'new' | 'file'>('layer');
  const fileRef = useRef<HTMLInputElement>(null);
  const pick = (m: 'layer' | 'new' | 'file') => {
    setFileMode(m);
    setTimeout(() => fileRef.current?.click(), 0);
  };
  const exportFile = () => {
    downloadText(JSON.stringify({ format: 'mapforge-sprite', version: 1, doc: serialize(doc) }), `${safeFileName(doc.name)}.mapforge-sprite.json`);
    toast('Figur-Datei gespeichert – enthält Ebenen, Ansichten, bearbeitete Bilder und eigene Animationen', 'success');
  };
  const onFile = async (file: File | undefined) => {
    if (!file) return;
    try {
      const st = useSprites.getState();
      if (fileMode === 'file') {
        const json = JSON.parse(await readFileAsText(file));
        if (json?.format !== 'mapforge-sprite' || !json.doc?.layers) throw new Error('Keine MapForge-Figur-Datei');
        const loaded = await deserialize(json.doc);
        if (loaded.kind !== kind) toast(`Datei ist ein${loaded.kind === 'object' ? ' Objekt' : loaded.kind === 'creature' ?'e Kreatur' : ' Charakter'} – hier als ${kind === 'object' ? 'Objekt' : kind === 'creature' ? 'Kreatur' : 'Charakter'} geöffnet`);
        st.setDocument(kind, loaded);
        toast(`„${loaded.name}“ geöffnet`, 'success');
      } else {
        const img = await imageDataFromFile(file);
        const name = file.name.replace(/\.[^.]+$/, '');
        if (fileMode === 'layer') st.importImageLayer(kind, img, name);
        else st.newFromImage(kind, img, name);
        toast(fileMode === 'layer' ? `„${name}“ als Ebene eingefügt – mit „Ebene verschieben“ platzieren` : `„${name}“ als neue ${kind === 'object' ? 'Objekt' : 'Figur'} geöffnet (${img.width} × ${img.height} px)`, 'success');
      }
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Datei konnte nicht geöffnet werden', 'error');
    } finally {
      if (fileRef.current) fileRef.current.value = '';
    }
  };
  const toast = useEditor((s) => s.toast);

  const exportPng = (scale: number) => {
    const url = toPng(compose(doc), doc.size, scale);
    downloadBlob(new Blob([dataUrlToBytes(url) as BlobPart], { type: 'image/png' }), `${safeFileName(doc.name)}${scale > 1 ? `@${scale}x` : ''}.png`);
    setExportOpen(false);
    toast('PNG exportiert', 'success');
  };

  return (
    <div className="studio-bar">
      <input className="input studio-name" value={doc.name} aria-label="Name" onChange={(e) => renameDoc(kind, e.target.value.slice(0, 40))} />
      <Segmented
        label="Ansicht"
        value={view}
        onChange={(v) => useSprites.getState().setViewDir(v)}
        options={VIEWS.map((v) => ({ value: v.id, label: v.label }))}
      />
      <select className="input studio-size" value={doc.size} aria-label="Größe in Pixeln" onChange={(e) => setSize(kind, Number(e.target.value))} title="Größe in Pixeln (Baukasten-Teile sind für 32 px gezeichnet)">
        {SIZES.map((s) => (
          <option key={s} value={s}>
            {s} × {s}
          </option>
        ))}
      </select>
      <div className="studio-actions">
        <IconButton label="Rückgängig" disabled={!canUndo} onClick={() => undo(kind)}>
          <Icon.Undo size={19} />
        </IconButton>
        <IconButton label="Wiederholen" disabled={!canRedo} onClick={() => redo(kind)}>
          <Icon.Redo size={19} />
        </IconButton>
        <button type="button" className="btn btn-secondary studio-random" onClick={() => randomize(kind)} title="Zufällige Teile und Farben – gesperrte Gruppen bleiben">
          <Icon.Dice size={17} />
          <span>Zufall</span>
        </button>
        <div className="studio-menu-wrap">
          <button type="button" className="btn btn-ghost" aria-expanded={newOpen} onClick={() => (setNewOpen(!newOpen), setExportOpen(false), setIoOpen(false))}>
            <Icon.Plus size={16} />
            <span>Neu</span>
          </button>
          {newOpen && (
            <div className="studio-menu" role="menu">
              <button type="button" role="menuitem" onClick={() => (reset(kind, false), setNewOpen(false))}>
                Mit Baukasten-Teilen
              </button>
              <button type="button" role="menuitem" onClick={() => (reset(kind, true), setNewOpen(false))}>
                Leere Zeichenfläche
              </button>
            </div>
          )}
        </div>
        <div className="studio-menu-wrap">
          <button type="button" className="btn btn-ghost" aria-expanded={ioOpen} onClick={() => (setIoOpen(!ioOpen), setNewOpen(false), setExportOpen(false))} title="Eigene Bilder und Figur-Dateien">
            <Icon.Upload size={16} />
            <span>Import</span>
          </button>
          {ioOpen && (
            <div className="studio-menu" role="menu">
              <button type="button" role="menuitem" onClick={() => (setIoOpen(false), pick('layer'))}>
                Bild als neue Ebene …
              </button>
              <button type="button" role="menuitem" onClick={() => (setIoOpen(false), pick('new'))}>
                Bild als neue {kind === 'object' ? 'Objekt' : 'Figur'} …
              </button>
              <button type="button" role="menuitem" onClick={() => (setIoOpen(false), pick('file'))}>
                Figur-Datei öffnen (.mapforge-sprite.json) …
              </button>
              <button type="button" role="menuitem" onClick={() => (setIoOpen(false), exportFile())}>
                Figur-Datei speichern
              </button>
            </div>
          )}
          <input ref={fileRef} type="file" hidden accept={fileMode === 'file' ? '.json,application/json' : 'image/png,image/gif,image/webp,image/jpeg'} onChange={(e) => void onFile(e.target.files?.[0])} />
        </div>
        <button type="button" className="btn btn-ghost" onClick={onSavePart} title="Ganze Figur als Teil speichern – taucht rechts in der Auswahl auf">
          <Icon.Save size={16} />
          <span>Als Teil</span>
        </button>
        <div className="studio-menu-wrap">
          <button type="button" className="btn btn-primary" aria-expanded={exportOpen} onClick={() => (setExportOpen(!exportOpen), setNewOpen(false))}>
            <Icon.Download size={16} />
            <span>PNG</span>
          </button>
          {exportOpen && (
            <div className="studio-menu is-right" role="menu">
              {[1, 2, 4, 8].map((s) => (
                <button key={s} type="button" role="menuitem" onClick={() => exportPng(s)}>
                  {s === 1 ? `Original (${doc.size} px)` : `${s}× vergrößert (${doc.size * s} px)`}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function ToolRail() {
  const tool = useSprites((s) => s.tool);
  const color = useSprites((s) => s.color);
  const mirror = useSprites((s) => s.mirror);
  const brush = useSprites((s) => s.brush);
  const palettes = useSprites((s) => s.palettes);
  const activePalette = useSprites((s) => s.activePalette);
  const { setTool, setColor, setMirror, setBrush, setActivePalette, editPalette } = useSprites.getState();
  const pal = [...PALETTE_PRESETS, ...palettes].find((p) => p.id === activePalette) ?? PALETTE_PRESETS[0];
  return (
    <div className="sprite-tools">
      <div className="sprite-tool-buttons" role="toolbar" aria-label="Zeichenwerkzeuge">
        {TOOLS.map((t) => (
          <IconButton key={t.id} label={`${t.label} (${t.key})`} active={tool === t.id} onClick={() => setTool(t.id)}>
            <t.icon size={19} />
          </IconButton>
        ))}
        <IconButton label="Spiegeln beim Zeichnen (X)" active={mirror} onClick={() => setMirror(!mirror)}>
          <Icon.Mirror size={19} />
        </IconButton>
      </div>
      {['pen', 'eraser', 'dither', 'lighten', 'darken'].includes(tool) && (
        <div className="sprite-brush" role="radiogroup" aria-label="Pinselgröße">
          {[1, 2, 3, 4].map((n) => (
            <button key={n} type="button" role="radio" aria-checked={brush === n} className={brush === n ? 'is-active' : ''} onClick={() => setBrush(n)} title={`${n} × ${n} px ( [ / ] )`}>
              {n}
            </button>
          ))}
        </div>
      )}
      <select className="input sprite-palette-select" value={activePalette} aria-label="Palette" onChange={(e) => setActivePalette(e.target.value)}>
        {[...PALETTE_PRESETS, ...palettes].map((p) => (
          <option key={p.id} value={p.id}>
            {p.name}
          </option>
        ))}
      </select>
      <div className="sprite-swatches" aria-label="Farben">
        <label className="swatch-current" title="Eigene Farbe wählen" style={{ background: color }}>
          <input type="color" value={color} onChange={(e) => setColor(e.target.value)} aria-label="Zeichenfarbe" />
        </label>
        {pal.colors.map((c, i) => (
          <button key={c + i} type="button" className={`swatch${c === color ? ' is-active' : ''}`} style={{ background: c }} aria-label={`Farbe ${c}`} title={c} onClick={() => setColor(c)} />
        ))}
        {!pal.colors.includes(color) && (
          <button type="button" className="swatch swatch-add" title="Aktuelle Farbe zur Palette hinzufügen" aria-label="Farbe zur Palette hinzufügen" onClick={() => editPalette(pal.id, (p) => ({ ...p, colors: [...p.colors, color] }))}>
            <Icon.Plus size={14} />
          </button>
        )}
      </div>
    </div>
  );
}

/** Real-size preview (1×, 2×) on a floor-like background. */
function Preview({ kind }: { kind: SpriteKind }) {
  const doc = useSprites((s) => s[kind].doc);
  const rev = useSprites((s) => s.rev);
  const view = useSprites((s) => s.view);
  const src = useMemo(() => toPng(composeView(doc, view), doc.size), [doc, rev, view]);
  return (
    <div className="sprite-preview" aria-label="Vorschau">
      <img src={src} alt="" style={{ width: doc.size, height: doc.size }} />
      <img src={src} alt="" style={{ width: doc.size * 2, height: doc.size * 2 }} />
    </div>
  );
}

function SavePartDialog({ kind, layerId, onClose }: { kind: SpriteKind; layerId: string | null; onClose: () => void }) {
  const doc = useSprites((s) => s[kind].doc);
  const layer = doc.layers.find((l) => l.id === layerId);
  const slots = SLOTS[kind];
  const [slot, setSlot] = useState(layer?.slot && layer.slot !== 'shadow' ? layer.slot : 'extra');
  const [name, setName] = useState(layer ? layer.name : doc.name);
  const toast = useEditor((s) => s.toast);
  const save = () => {
    useSprites.getState().saveAsPart(kind, slot, name, layerId);
    toast(`„${name.trim() || 'Eigenes Teil'}“ unter ${slots.find((s) => s.id === slot)?.label} gespeichert`, 'success');
    onClose();
  };
  return (
    <div className="quick-pick-backdrop" role="presentation" onClick={onClose}>
      <div className="save-part-dialog" role="dialog" aria-label="Als Teil speichern" onClick={(e) => e.stopPropagation()}>
        <h3>{layer ? `Ebene „${layer.name}“` : 'Ganze Figur'} als Teil speichern</h3>
        <p className="hint">Das Teil erscheint rechts unter „Teile“ in der gewählten Gruppe und lässt sich in jede Figur ziehen.</p>
        <div className="field">
          <label htmlFor="part-name">Name</label>
          <input id="part-name" className="input" value={name} onChange={(e) => setName(e.target.value.slice(0, 30))} autoFocus />
        </div>
        <div className="field">
          <label htmlFor="part-slot">Gruppe</label>
          <select id="part-slot" className="input" value={slot} onChange={(e) => setSlot(e.target.value)}>
            {slots.map((s) => (
              <option key={s.id} value={s.id}>
                {s.label}
              </option>
            ))}
          </select>
        </div>
        <div className="button-row">
          <Button variant="ghost" onClick={onClose}>
            Abbrechen
          </Button>
          <Button variant="primary" icon={<Icon.Save size={16} />} onClick={save}>
            Speichern
          </Button>
        </div>
      </div>
    </div>
  );
}

/** side / back view: explain where the pixels come from, reset own pixels */
function ViewHint({ kind }: { kind: SpriteKind }) {
  const view = useSprites((s) => s.view);
  const doc = useSprites((s) => s[kind].doc);
  if (view === 'front') return null;
  const own = doc.layers.some((l) => l.views?.[view]);
  return (
    <div className="view-hint">
      <span>
        {view === 'side' ? 'Seitenansicht' : 'Rückansicht'}: automatisch aus den Teilen. Was du hier malst, gilt nur für diese Ansicht.
      </span>
      {own && (
        <button
          type="button"
          className="btn btn-ghost btn-sm"
          onClick={() => {
            const st = useSprites.getState();
            st.checkpoint(kind);
            st.setDocument(kind, { ...doc, layers: doc.layers.map((l) => ({ ...l, views: l.views ? { ...l.views, [view]: undefined } : undefined })) });
          }}
        >
          Ansicht zurücksetzen
        </button>
      )}
    </div>
  );
}
