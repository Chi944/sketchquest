import { UnlockKeyhole } from 'lucide-react';
import type { CSSProperties } from 'react';
import type { Terrain } from '../core/types';
import s from './Piece.module.css';

// Decorative photographs share one transparent 3 × 2 atlas.
// The containing board cell supplies the accessible name.
const positions = {
  player: ['0%', '0%'],
  wall: ['50%', '0%'],
  crate: ['100%', '0%'],
  key: ['0%', '100%'],
  door: ['50%', '100%'],
  exit: ['100%', '100%'],
} as const;
export function Piece({
  kind,
  unlocked = false,
}: {
  kind: Terrain | 'player' | 'crate';
  unlocked?: boolean;
}) {
  if (kind === 'floor') return <span className={s.floor} aria-hidden="true" />;
  if (['water', 'bridge', 'ice', 'relic'].includes(kind))
    return (
      <span className={`${s.material} ${s[kind]}`} aria-hidden="true">
        <i />
        <b />
      </span>
    );
  const [x, y] = positions[kind as keyof typeof positions];
  return (
    <span
      className={`${s.piece} ${kind === 'player' ? s.player : ''}`}
      aria-hidden="true"
      style={{ '--sprite-x': x, '--sprite-y': y } as CSSProperties}
    >
      {kind === 'door' && unlocked && (
        <span className={s.unlocked}>
          <UnlockKeyhole size={16} strokeWidth={2.5} />
        </span>
      )}
    </span>
  );
}
