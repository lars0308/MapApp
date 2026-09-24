import { useAgent, stopAgent } from '../api/agent';
import { Icon } from './icons';

/** while the AI builds: what it is doing right now, and a stop button */
export function AgentBanner() {
  const { running, step, steps } = useAgent();
  if (!running) return null;
  return (
    <div className="agent-banner" role="status" aria-live="polite">
      <span className="agent-banner-icon" aria-hidden="true">
        <Icon.Spark size={16} />
      </span>
      <span className="agent-banner-text">
        <strong>KI baut</strong>
        <small>
          {step}
          {steps > 0 ? ` · Schritt ${steps}` : ''}
        </small>
      </span>
      <button type="button" className="btn btn-secondary agent-banner-stop" onClick={stopAgent}>
        Stopp
      </button>
    </div>
  );
}
