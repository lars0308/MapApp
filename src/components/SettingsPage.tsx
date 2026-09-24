import { SettingsPanel } from './SettingsPanel';
import { BackupSection } from '../persistence/BackupSection';
import { AiSection, RelaySection } from '../api/AiSection';
import { AiModeSection } from './AiModeSection';

export function SettingsPage({ desktop }: { desktop: boolean }) {
  return (
    <div className="page page-settings">
      <div className="page-inner">
        <h1 className="page-title">Einstellungen</h1>
        <AiModeSection />
        <BackupSection />
        <RelaySection />
        <AiSection />
        <SettingsPanel desktop={desktop} />
      </div>
    </div>
  );
}
