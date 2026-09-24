import { useState } from 'react';
import { useAi, DEFAULT_AI_URL } from './bridge';
import { relayAddress, useRelay } from './relay';
import { useEditor } from '../store/editorStore';
import { useApp } from '../store/appStore';
import { Icon } from '../components/icons';

/** Einstellungen → "KI-Verbindung": lets an AI work with the app through the MCP server. */
export function AiSection() {
  const { enabled, url, status, error, last, count, setEnabled, setUrl } = useAi();
  const state = !enabled ? 'Aus' : status === 'connected' ? `Verbunden${count ? ` · ${count} Befehle, zuletzt „${last}“` : ''}` : 'Suche den KI-Server …';
  return (
    <section className="backup-box ai-box" aria-labelledby="ai-title">
      <div className="backup-head">
        <Icon.Spark size={20} />
        <div>
          <h3 id="ai-title">KI auf diesem Computer (MCP)</h3>
          <p>
            Eine KI (z. B. Claude, Cursor oder ein eigenes Programm) kann MapForge über den <b>MapForge-KI-Server</b> bedienen: Karten erzeugen, malen, Objekte setzen, Figuren bauen, Bilder ansehen und als Godot-Paket exportieren. Du siehst ihr hier live zu und kannst alles rückgängig machen.
          </p>
        </div>
      </div>
      <label className="ai-toggle">
        <input type="checkbox" checked={enabled} onChange={(e) => setEnabled(e.target.checked)} />
        <span>KI darf diese App steuern</span>
      </label>
      <p className={`backup-state${enabled && status !== 'connected' ? ' is-warn' : ''}`} data-ai-status={status}>
        {state}
      </p>
      {enabled && status !== 'connected' && error && <p className="hint">{error}</p>}
      <details className="ai-details">
        <summary>So richtest du es ein</summary>
        <ol>
          <li>
            Im MapForge-Ordner einmal <code>cd mcp && npm install</code>.
          </li>
          <li>
            In der KI (MCP-Einstellungen) den Server eintragen:
            <pre>{`{
  "mcpServers": {
    "mapforge": {
      "command": "node",
      "args": ["<Pfad>/MapApp/mcp/server.mjs"]
    }
  }
}`}</pre>
          </li>
          <li>Hier den Schalter einschalten – die KI verbindet sich mit diesem Tab. Ohne offenen Tab startet der Server MapForge selbst unsichtbar im Hintergrund (Playwright).</li>
          <li>Andere Programme ohne MCP: <code>POST http://127.0.0.1:8765/command</code> mit <code>{'{"command":"status","args":{}}'}</code>.</li>
        </ol>
        <label className="field">
          <span>Adresse des KI-Servers</span>
          <input className="input" value={url} onChange={(e) => setUrl(e.target.value)} placeholder={DEFAULT_AI_URL} spellCheck={false} />
        </label>
        <p className="hint">Nur einschalten, wenn du der KI vertraust. Die Verbindung läuft nur auf deinem Rechner (localhost).</p>
      </details>
    </section>
  );
}

/** "KI von überall": any AI (claude.ai on the phone, Claude Desktop, Cursor …) via the online relay */
export function RelaySection() {
  const r = useRelay();
  const toast = useEditor((s) => s.toast);
  const [advanced, setAdvanced] = useState(false);
  const address = relayAddress(r);
  const configured = !!(r.url && r.key);
  const state = !r.enabled ? 'Aus' : r.status === 'connected' ? `Bereit${r.count ? ` · ${r.count} Befehle, zuletzt „${r.last}“` : ''}` : r.status === 'error' ? 'Nicht eingerichtet' : 'Verbinde …';
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(address);
      toast('Adresse kopiert', 'success');
    } catch {
      toast('Kopieren nicht möglich – Adresse bitte markieren', 'error');
    }
  };
  return (
    <section className="backup-box ai-box" aria-labelledby="relay-title">
      <div className="backup-head">
        <Icon.Spark size={20} />
        <div>
          <h3 id="relay-title">KI von überall (auch am Handy)</h3>
          <p>
            Die KI arbeitet in <b>dieser</b> App – egal ob am Handy, Tablet oder PC, und egal wo die KI läuft (z. B. Claude in der App oder auf claude.ai). Sie ruft eine Adresse im Internet auf, die ihre Befehle an diese App weitergibt.
          </p>
        </div>
      </div>
      <label className="ai-toggle">
        <input type="checkbox" checked={r.enabled} disabled={!configured} onChange={(e) => r.setEnabled(e.target.checked)} />
        <span>KI von überall erlauben</span>
      </label>
      <p className={`backup-state${r.enabled && r.status !== 'connected' ? ' is-warn' : ''}`} data-relay-status={r.status}>
        {configured ? state : 'Der Vermittler ist noch nicht eingerichtet (siehe unten).'}
      </p>
      {r.enabled && r.error && <p className="hint">{r.error}</p>}
      {configured && (
        <>
          <label className="field">
            <span>Adresse für die KI (MCP-Connector)</span>
            <div className="ai-address">
              <input className="input mono" readOnly value={address} onFocus={(e) => e.target.select()} aria-label="MCP-Adresse" />
              <button type="button" className="btn btn-secondary" onClick={() => void copy()}>
                Kopieren
              </button>
            </div>
          </label>
          <p className="hint">
            In Claude: <b>Einstellungen → Connectors → Eigenen Connector hinzufügen</b> und diese Adresse einfügen. Die Adresse ist wie ein Passwort – wer sie hat, kann diese App steuern, solange der Schalter an ist.{' '}
            <button type="button" className="link-btn" onClick={r.newCode}>
              Neue Adresse erzeugen
            </button>{' '}
            (die alte hört dann auf zu funktionieren). Die App muss offen sein, während die KI arbeitet; exportierte ZIP-Dateien landen auf diesem Gerät.
          </p>
        </>
      )}
      <details className="ai-details" open={!configured || advanced} onToggle={(e) => setAdvanced((e.target as HTMLDetailsElement).open)}>
        <summary>Vermittler (Supabase)</summary>
        <p className="hint">
          Der Vermittler ist eine kleine Funktion in einem Supabase-Projekt (<code>supabase/functions/mapforge-mcp</code>, Anleitung in <code>mcp/README.md</code>). Hier dessen Adresse und öffentlichen Schlüssel (anon / publishable) eintragen.
        </p>
        <label className="field">
          <span>Supabase-Adresse</span>
          <input className="input mono" value={r.url} placeholder="https://xxxx.supabase.co" onChange={(e) => r.setServer(e.target.value, r.key)} spellCheck={false} />
        </label>
        <label className="field">
          <span>Öffentlicher Schlüssel</span>
          <input className="input mono" value={r.key} placeholder="eyJ… oder sb_publishable_…" onChange={(e) => r.setServer(r.url, e.target.value)} spellCheck={false} />
        </label>
      </details>
    </section>
  );
}

/** small "KI" badge in the header while an AI is connected */
export function AiBadge() {
  const local = useAi((s) => s.status);
  const remote = useRelay((s) => s.status);
  const last = useAi((s) => s.last) ?? useRelay.getState().last;
  if (local !== 'connected' && remote !== 'connected') return null;
  return (
    <button type="button" className="ai-badge" title={last ? `KI verbunden – zuletzt: ${last}` : 'KI verbunden'} onClick={() => useApp.getState().goTo('settings')}>
      <Icon.Spark size={13} /> KI
    </button>
  );
}
