import { useMemo, useRef, useState } from 'react';
import { SLOTS, compose, partById, fitContext, toPng, useSprites } from './store';
import { CHANNEL_LABEL, CHANNELS, PALETTE_PRESETS, RAMP_PRESETS, hexToRgb, parsePaletteText, rgbToHex, type Channel, type Ramp } from './palette';
import { downloadText, readFileAsText, safeFileName } from '../utils/download';
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
  const { setActive, toggleLayer, moveLayer, removeLayer, flipLayer, addLayer, duplicateLayer, mergeDown, outlineLayer } = useSprites.getState();
  const [menu, setMenu] = useState<string | null>(null);
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
                <IconButton label="Weitere Aktionen" active={menu === l.id} onClick={() => setMenu(menu === l.id ? null : l.id)}>
                  <Icon.More size={15} />
                </IconButton>
              </div>
              {menu === l.id && (
                <div className="sprite-layer-menu" role="menu">
                  <button type="button" role="menuitem" onClick={() => (duplicateLayer(kind, l.id), setMenu(null))}>
                    Duplizieren
                  </button>
                  <button type="button" role="menuitem" disabled={i === 0} onClick={() => (mergeDown(kind, l.id), setMenu(null))}>
                    Mit Ebene darunter zusammenführen
                  </button>
                  <button type="button" role="menuitem" onClick={() => (outlineLayer(kind, l.id, '#1b1420'), setMenu(null))}>
                    Umriss hinzufügen
                  </button>
                  <button type="button" role="menuitem" onClick={() => (onSavePart(l.id), setMenu(null))}>
                    Als Teil speichern
                  </button>
                  <button type="button" role="menuitem" className="is-danger" onClick={() => (removeLayer(kind, l.id), setMenu(null))}>
                    Löschen
                  </button>
                </div>
              )}
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

// ---------------------------------------------------------------- drawing palettes

export function PalettePanel({ kind }: { kind: SpriteKind }) {
  const palettes = useSprites((s) => s.palettes);
  const activeId = useSprites((s) => s.activePalette);
  const color = useSprites((s) => s.color);
  const doc = useSprites((s) => s[kind].doc);
  const { setActivePalette, editPalette, createPalette, deletePalette, setColor, applyPalette } = useSprites.getState();
  const toast = useEditor((s) => s.toast);
  const [editing, setEditing] = useState(false);
  const [confirmDel, setConfirmDel] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const all = [...PALETTE_PRESETS, ...palettes];
  const pal = all.find((p) => p.id === activeId) ?? PALETTE_PRESETS[0];

  const fromSprite = () => {
    const img = compose(doc);
    const set = new Set<string>();
    for (let i = 0; i < img.length && set.size < 64; i += 4) if (img[i + 3] > 128) set.add(rgbToHex(img[i], img[i + 1], img[i + 2]));
    createPalette(`${doc.name} – Farben`, [...set]);
    toast(`${set.size} Farben als neue Palette übernommen`, 'success');
  };
  const importFile = async (f: File | undefined) => {
    if (!f) return;
    const colors = parsePaletteText(await readFileAsText(f));
    if (!colors.length) toast('Keine Farben gefunden (erwartet: .hex, .txt, .gpl mit #rrggbb)', 'error');
    else {
      createPalette(f.name.replace(/\.[^.]+$/, ''), colors);
      toast(`${colors.length} Farben importiert`, 'success');
    }
    if (fileRef.current) fileRef.current.value = '';
  };

  return (
    <div className="palette-panel">
      <div className="palette-list" role="listbox" aria-label="Paletten">
        {all.map((p) => (
          <button key={p.id} type="button" role="option" aria-selected={p.id === pal.id} className={`palette-item${p.id === pal.id ? ' is-active' : ''}`} onClick={() => (setActivePalette(p.id), setEditing(false))}>
            <span className="palette-strip">
              {p.colors.slice(0, 16).map((c, i) => (
                <span key={i} style={{ background: c }} />
              ))}
            </span>
            <span className="palette-name">
              {p.name}
              <small>{p.colors.length} Farben{p.preset ? '' : ' · eigene'}</small>
            </span>
          </button>
        ))}
      </div>

      <section className="palette-edit">
        <div className="palette-edit-head">
          {pal.preset ? (
            <strong>{pal.name}</strong>
          ) : (
            <input className="input" value={pal.name} aria-label="Name der Palette" onChange={(e) => editPalette(pal.id, (p) => ({ ...p, name: e.target.value.slice(0, 30) }))} />
          )}
          <button type="button" className={`btn btn-ghost btn-sm${editing ? ' is-active' : ''}`} onClick={() => setEditing(!editing)}>
            {editing ? 'Fertig' : 'Bearbeiten'}
          </button>
        </div>
        {pal.preset && editing && <p className="hint">Vorlagen bleiben unverändert – beim ersten Ändern entsteht automatisch „Meine {pal.name}“.</p>}
        <div className={`palette-colors${editing ? ' is-editing' : ''}`}>
          {pal.colors.map((c, i) => (
            <button
              key={c + i}
              type="button"
              className={`swatch${c === color ? ' is-active' : ''}`}
              style={{ background: c }}
              title={editing ? `${c} entfernen` : c}
              aria-label={editing ? `Farbe ${c} entfernen` : `Farbe ${c}`}
              onClick={() => (editing ? editPalette(pal.id, (p) => ({ ...p, colors: p.colors.filter((_, k) => k !== i) })) : setColor(c))}
            >
              {editing && <Icon.Close size={12} />}
            </button>
          ))}
        </div>
        <div className="button-row">
          <Button icon={<Icon.Plus size={16} />} disabled={pal.colors.includes(color)} onClick={() => editPalette(pal.id, (p) => ({ ...p, colors: [...p.colors, color] }))}>
            Aktuelle Farbe
          </Button>
          <Button onClick={() => applyPalette(kind, pal.colors)} title="Alle Pixel der Figur auf die nächstliegende Palettenfarbe setzen">
            Figur auf Palette
          </Button>
        </div>
      </section>

      <div className="button-row palette-actions">
        <Button onClick={() => createPalette('Neue Palette', [color])}>Neue Palette</Button>
        <Button onClick={fromSprite}>Aus Figur übernehmen</Button>
        <Button icon={<Icon.Upload size={16} />} onClick={() => fileRef.current?.click()}>
          Importieren
        </Button>
        <Button icon={<Icon.Download size={16} />} onClick={() => downloadText(pal.colors.map((c) => c.slice(1)).join('\n'), `${safeFileName(pal.name)}.hex`, 'text/plain')}>
          .hex
        </Button>
        {!pal.preset &&
          (confirmDel ? (
            <Button variant="danger" onClick={() => (deletePalette(pal.id), setConfirmDel(false))}>
              Wirklich löschen
            </Button>
          ) : (
            <Button variant="ghost" icon={<Icon.Trash size={16} />} onClick={() => setConfirmDel(true)}>
              Löschen
            </Button>
          ))}
      </div>
      <input ref={fileRef} type="file" accept=".hex,.txt,.gpl,.pal" hidden onChange={(e) => importFile(e.target.files?.[0])} />
      <p className="hint">Import im Lospec-Format (.hex, .gpl). Paletten werden im Browser gespeichert.</p>
    </div>
  );
}
