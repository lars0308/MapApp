import { useMemo, useState } from 'react';
import { SLOTS, compose, partById, fitContext, toPng, useSprites } from './store';
import { CHANNEL_LABEL, CHANNELS, RAMP_PRESETS, hexToRgb, rgbToHex, type Channel, type Ramp } from './palette';
import { channelsUsed } from './painter';
import type { SpriteKind, SpriteLayer } from './types';
import { Icon } from '../components/icons';
import { Button, IconButton } from '../components/ui';
import { useEditor } from '../store/editorStore';

// ---------------------------------------------------------------- layers

function LayerThumb({ layer, size }: { layer: SpriteLayer; size: number }) {
  const rev = useSprites((s) => s.rev);
  const src = useMemo(() => toPng(layer.data, size), [layer, size, rev]);
  return <img className="layer-thumb" src={src} alt="" />;
}

export function LayersList({ kind, onSavePart }: { kind: SpriteKind; onSavePart: (layerId: string | null) => void }) {
  const doc = useSprites((s) => s[kind].doc);
  const active = useSprites((s) => s[kind].active);
  const { setActive, toggleLayer, moveLayer, removeLayer, flipLayer, addLayer } = useSprites.getState();
  const slotLabel = (id: string | null) => SLOTS[kind].find((s) => s.id === id)?.label ?? '';
  const layers = [...doc.layers].reverse();
  return (
    <div className="sprite-layers">
      <div className="sprite-layers-head">
        <p className="hint">Oben = vorne. Gezeichnet wird auf der markierten Ebene.</p>
        <Button icon={<Icon.Plus size={16} />} onClick={() => addLayer(kind)}>
          Ebene
        </Button>
      </div>
      <ul>
        {layers.map((l) => {
          const i = doc.layers.indexOf(l);
          return (
            <li key={l.id} className={`${l.id === active ? 'is-active' : ''}${l.visible ? '' : ' is-hidden'}`}>
              <IconButton label={l.visible ? 'Ausblenden' : 'Einblenden'} onClick={() => toggleLayer(kind, l.id)}>
                {l.visible ? <Icon.Eye size={16} /> : <Icon.EyeOff size={16} />}
              </IconButton>
              <button type="button" className="sprite-layer-name" onClick={() => setActive(kind, l.id)} aria-pressed={l.id === active}>
                <LayerThumb layer={l} size={doc.size} />
                <span>
                  <strong>{l.name}</strong>
                  <small>
                    {slotLabel(l.slot)}
                    {l.partId && !l.edited ? ' · Baukasten' : l.partId ? ' · bearbeitet' : ''}
                  </small>
                </span>
              </button>
              <div className="sprite-layer-actions">
                <IconButton label="Nach vorne" disabled={i === doc.layers.length - 1} onClick={() => moveLayer(kind, l.id, 1)}>
                  <Icon.Up size={15} />
                </IconButton>
                <IconButton label="Nach hinten" disabled={i === 0} onClick={() => moveLayer(kind, l.id, -1)}>
                  <Icon.Down size={15} />
                </IconButton>
                <IconButton label="Spiegeln" onClick={() => flipLayer(kind, l.id)}>
                  <Icon.Mirror size={15} />
                </IconButton>
                <IconButton label="Als Teil speichern" onClick={() => onSavePart(l.id)}>
                  <Icon.Save size={15} />
                </IconButton>
                <IconButton label="Ebene löschen" onClick={() => removeLayer(kind, l.id)}>
                  <Icon.Trash size={15} />
                </IconButton>
              </div>
            </li>
          );
        })}
        {!layers.length && <li className="muted small">Leer – Teile hinzufügen oder einfach losmalen.</li>}
      </ul>
    </div>
  );
}

// ---------------------------------------------------------------- colours

/** light / dark shades derived from one base colour */
function rampFrom(hex: string): Ramp {
  const [r, g, b] = hexToRgb(hex);
  const mix = (t: number, to: number) => Math.round(to + (t - to) * 0.72);
  const light = rgbToHex(mix(r, 255), mix(g, 255), mix(b, 255));
  const dark = rgbToHex(Math.round(r * 0.66), Math.round(g * 0.62), Math.round(b * 0.7));
  return [light, hex, dark];
}

export function ColorsPanel({ kind }: { kind: SpriteKind }) {
  const doc = useSprites((s) => s[kind].doc);
  const locks = useSprites((s) => s[kind].locks);
  const { setRamp, toggleLock } = useSprites.getState();
  const used = useMemo(() => {
    const ctx = fitContext(doc);
    const set = new Set<Channel>();
    for (const l of doc.layers) {
      const p = partById(l.partId);
      if (p) for (const c of channelsUsed(p.paint(ctx))) set.add(c);
    }
    return CHANNELS.filter((c) => set.has(c));
  }, [doc]);
  const [showAll, setShowAll] = useState(false);
  const list = showAll || !used.length ? CHANNELS : used;
  return (
    <div className="sprite-colors">
      <label className="slot-lock">
        <input type="checkbox" checked={!!locks.colors} onChange={() => toggleLock(kind, 'colors')} />
        Farben bei Zufall behalten
      </label>
      {list.map((ch) => {
        const cur = doc.ramps[ch];
        return (
          <section key={ch} className="ramp-row">
            <h4>{CHANNEL_LABEL[ch]}</h4>
            <div className="ramp-swatches">
              {RAMP_PRESETS[ch].map((r, i) => {
                const on = r.join() === cur.join();
                return (
                  <button key={i} type="button" className={`ramp${on ? ' is-active' : ''}`} aria-label={`${CHANNEL_LABEL[ch]} Farbe ${i + 1}`} aria-pressed={on} onClick={() => setRamp(kind, ch, r)}>
                    {r.map((c) => (
                      <span key={c} style={{ background: c }} />
                    ))}
                  </button>
                );
              })}
              <label className="ramp ramp-custom" title="Eigene Farbe">
                <input type="color" value={cur[1]} onChange={(e) => setRamp(kind, ch, rampFrom(e.target.value))} aria-label={`${CHANNEL_LABEL[ch]} eigene Farbe`} />
                <Icon.Pencil size={14} />
              </label>
            </div>
          </section>
        );
      })}
      {used.length > 0 && used.length < CHANNELS.length && (
        <button type="button" className="btn btn-ghost btn-sm" onClick={() => setShowAll(!showAll)}>
          {showAll ? 'Nur benutzte Farben' : 'Alle Farbgruppen zeigen'}
        </button>
      )}
      <p className="hint">Farbwechsel färben alle Ebenen um – auch selbst gemalte Pixel in diesen Farbtönen.</p>
    </div>
  );
}

// ---------------------------------------------------------------- gallery

export function GalleryPanel({ kind }: { kind: SpriteKind }) {
  const gallery = useSprites((s) => s.gallery).filter((g) => g.doc.kind === kind);
  const cur = useSprites((s) => s[kind].doc.id);
  const { saveToGallery, openFromGallery, deleteFromGallery } = useSprites.getState();
  const toast = useEditor((s) => s.toast);
  const [confirm, setConfirm] = useState<string | null>(null);
  return (
    <div className="sprite-gallery">
      <Button
        variant="primary"
        icon={<Icon.Save size={16} />}
        onClick={() => {
          const ok = saveToGallery(kind);
          toast(ok ? `In „Meine ${kind === 'character' ? 'Charaktere' : 'Objekte'}“ gespeichert` : 'Speicher voll – ältere Einträge löschen', ok ? 'success' : 'error');
        }}
      >
        Aktuellen speichern
      </Button>
      <ul className="gallery-grid">
        {gallery.map((g) => (
          <li key={g.doc.id} className={g.doc.id === cur ? 'is-current' : ''}>
            <button type="button" className="gallery-open" onClick={() => openFromGallery(kind, g.doc.id)} title={`${g.doc.name} öffnen`}>
              <img src={g.thumb} alt="" />
              <span>{g.doc.name}</span>
            </button>
            {confirm === g.doc.id ? (
              <button type="button" className="part-del is-confirm" onClick={() => (deleteFromGallery(g.doc.id), setConfirm(null))}>
                Löschen?
              </button>
            ) : (
              <IconButton label="Aus Galerie löschen" className="part-del" onClick={() => setConfirm(g.doc.id)}>
                <Icon.Trash size={14} />
              </IconButton>
            )}
          </li>
        ))}
      </ul>
      {!gallery.length && <p className="muted small">Noch nichts gespeichert. Gespeicherte {kind === 'character' ? 'Charaktere' : 'Objekte'} bleiben in diesem Browser.</p>}
    </div>
  );
}

export { compose };
