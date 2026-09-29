import { useAgent, stopAgent } from '../api/agent';
import { Loader } from './BusyOverlay';

/** what the AI is doing right now – big, so it is clear whether it reads, thinks or builds */
export function AgentBanner() {
  const { running, step, steps, phase } = useAgent();
  if (!running) return null;
  return (
    <div className={`agent-banner is-${phase}`} role="status" aria-live="polite">
      <Loader ai />
      <span className="agent-banner-text">
        <span className="agent-banner-phase">{phase === 'read' ? 'KI liest & versteht' : phase === 'think' ? 'KI denkt nach' : 'KI baut'}</span>
        <strong>{step}</strong>
        {steps > 0 && <small>Schritt {steps}</small>}
      </span>
      <button type="button" className="btn btn-secondary agent-banner-stop" onClick={stopAgent}>
        Stopp
      </button>
    </div>
  );
}
