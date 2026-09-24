import { SettingsPanel } from './SettingsPanel';
import { BackupSection } from '../persistence/BackupSection';
import { AiSection } from '../api/AiSection';

export function SettingsPage({ desktop }: { desktop: boolean }) {
  return (
    <div className="page page-settings">
      <div className="page-inner">
        <h1 className="page-title">Einstellungen</h1>
        <BackupSection />
        <AiSection />
        <SettingsPanel desktop={desktop} />
      </div>
    </div>
  );
}
