import { useBusy } from '../store/busy';
import { Icon } from './icons';

/** big, centred loading notice for everything that takes a moment (see store/busy) */
export function BusyOverlay() {
  const job = useBusy((s) => s.jobs[s.jobs.length - 1]);
  if (!job) return null;
  return (
    <div className="busy-overlay" role="status" aria-live="polite">
      <div className={`busy-card${job.ai ? ' is-ai' : ''}`}>
        <Loader ai={job.ai} />
        <div className="busy-text">
          {job.ai && <span className="busy-badge">KI</span>}
          <strong>{job.title}</strong>
          {job.detail && <small>{job.detail}</small>}
        </div>
      </div>
    </div>
  );
}

/** the loading animation: three pixel blocks hopping (a spark for the AI) */
export function Loader({ ai, small }: { ai?: boolean; small?: boolean }) {
  return (
    <span className={`loader${small ? ' is-small' : ''}${ai ? ' is-ai' : ''}`} aria-hidden="true">
      {ai && (
        <span className="loader-spark">
          <Icon.Spark size={small ? 14 : 22} />
        </span>
      )}
      <span className="loader-dots">
        <i />
        <i />
        <i />
      </span>
    </span>
  );
}
