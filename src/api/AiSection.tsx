import { useAi, DEFAULT_AI_URL } from './bridge';
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
          <h3 id="ai-title">KI-Verbindung</h3>
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

/** small "KI" badge in the header while an AI is connected */
export function AiBadge() {
  const status = useAi((s) => s.status);
  const last = useAi((s) => s.last);
  if (status !== 'connected') return null;
  return (
    <button type="button" className="ai-badge" title={last ? `KI verbunden – zuletzt: ${last}` : 'KI verbunden'} onClick={() => useApp.getState().goTo('settings')}>
      <Icon.Spark size={13} /> KI
    </button>
  );
}
