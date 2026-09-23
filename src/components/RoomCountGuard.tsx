import type { SpecialRoomType } from '../types';
import { requiredRooms } from '../generator/perspective';
import { Button } from './ui';

/** Warns when more special rooms are enabled than rooms exist, with a one-tap fix. */
export function RoomCountGuard({
  specials,
  roomCount,
  onFix,
}: {
  specials: Record<SpecialRoomType, boolean>;
  roomCount: number;
  onFix: (count: number) => void;
}) {
  const need = requiredRooms(specials);
  if (roomCount >= need) return null;
  return (
    <div className="guard" role="alert">
      <p>
        Für diese Auswahl werden mindestens <strong>{need} Räume</strong> benötigt (aktuell {roomCount}).
      </p>
      <Button variant="primary" onClick={() => onFix(need)}>
        Raumanzahl auf {need} erhöhen
      </Button>
    </div>
  );
}
