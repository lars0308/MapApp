import { useRef, useState } from 'react';
import { Button } from '../components/ui';
import { Icon } from '../components/icons';
import { useEditor } from '../store/editorStore';
import { createBackup, daysSinceBackup, restoreBackup } from './backup';
import { readFileAsText } from '../utils/download';

/** "Sicherung": everything in one file – and back. */
export function BackupSection() {
  const toast = useEditor((s) => s.toast);
  const [busy, setBusy] = useState(false);
  const [days, setDays] = useState(daysSinceBackup());
  const fileRef = useRef<HTMLInputElement>(null);

  const backup = async () => {
    setBusy(true);
    try {
      const i = await createBackup();
      setDays(0);
      toast(`Gesichert: ${i.projects} Karten, ${i.tilesets} Tilesets, ${i.figures} Figuren`, 'success');
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Sichern fehlgeschlagen', 'error');
    } finally {
      setBusy(false);
    }
  };
  const restore = async (f: File | undefined) => {
    if (!f) return;
    setBusy(true);
    try {
      const i = await restoreBackup(await readFileAsText(f));
      toast(`Wiederhergestellt: ${i.projects} Karten, ${i.tilesets} Tilesets, ${i.figures} Figuren – lädt neu …`, 'success');
      setTimeout(() => location.reload(), 1200);
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Wiederherstellen fehlgeschlagen', 'error');
      setBusy(false);
    } finally {
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  return (
    <section className="backup-box" aria-labelledby="backup-title">
      <div className="backup-head">
        <Icon.Save size={20} />
        <div>
          <h3 id="backup-title">Sicherung</h3>
          <p>Alles in einer Datei: alle Karten, Tilesets, Figuren, Kreaturen, Objekte, Paletten und die Spielfigur. Damit ist nichts verloren, wenn der Browser-Speicher gelöscht wird – und du kannst auf einem anderen Gerät weitermachen.</p>
        </div>
      </div>
      <p className={`backup-state${days === null || days > 7 ? ' is-warn' : ''}`}>{days === null ? 'Noch nie gesichert.' : days === 0 ? 'Heute gesichert.' : `Letzte Sicherung vor ${days} Tag${days === 1 ? '' : 'en'}.`}</p>
      <div className="button-row">
        <Button variant="primary" icon={<Icon.Download size={16} />} disabled={busy} onClick={() => void backup()}>
          Alles sichern
        </Button>
        <Button icon={<Icon.Upload size={16} />} disabled={busy} onClick={() => fileRef.current?.click()}>
          Sicherung laden
        </Button>
      </div>
      <p className="hint">Beim Laden werden gleiche Projekte ersetzt, alle anderen bleiben erhalten.</p>
      <input ref={fileRef} type="file" accept=".json,application/json" hidden onChange={(e) => void restore(e.target.files?.[0])} />
    </section>
  );
}
