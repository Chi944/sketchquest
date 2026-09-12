import {
  ArrowUp,
  Compass,
  Footprints,
  Gem,
  KeyRound,
  LockKeyhole,
  ShieldCheck,
  TriangleAlert,
} from 'lucide-react';
import { collectedRelicCount, isRelicCollected, relicCells } from '../core/rules';
import { cellAhead, COMPASS } from '../core/navigation';
import type { BoardDefinition, Direction, GameState } from '../core/types';
import s from './ExplorerHUD.module.css';

export interface ExplorerFeedback {
  id: number;
  title: string;
  detail: string;
  kind: 'pickup' | 'gate' | 'blocked' | 'danger' | 'exit';
}

export function ExplorerHUD({
  board,
  state,
  facing,
  won,
  feedback,
  disabled,
  onForward,
}: {
  board: BoardDefinition;
  state: GameState;
  facing: Direction;
  won: boolean;
  feedback: ExplorerFeedback | null;
  disabled: boolean;
  onForward: () => void;
}) {
  const target = cellAhead(board, state.player, facing);
  const terrain = target === null ? 'wall' : board.terrain[target];
  const relics = relicCells(board).length;
  const found = collectedRelicCount(board, state);
  const modern = board.rulesVersion === 3;
  const gateOpen = modern ? !!state.doorOpened : state.hasKey;
  let label = 'Walk forward';
  let detail = 'One step. Your next choice.';
  let danger = false;
  let blocked = false;
  if (terrain === 'wall') {
    label = 'Stone wall';
    detail = 'Turn or strafe to find a route.';
    blocked = true;
  } else if (terrain === 'water') {
    label = modern ? 'Deep water · fatal' : 'Deep water';
    detail = modern
      ? 'You cannot swim. Keys and boots will not protect you.'
      : 'Find a bridge to cross.';
    danger = modern;
    blocked = !modern;
  } else if (terrain === 'spikes') {
    label = state.hasBoots ? 'Cross the spikes' : 'Spikes · fatal without boots';
    detail = state.hasBoots
      ? 'Your iron soles protect your feet.'
      : 'Find the iron boots before stepping here.';
    danger = !state.hasBoots;
  } else if (terrain === 'door' && !gateOpen) {
    label = state.hasKey ? 'Use key & open gate' : 'Locked gate';
    detail = state.hasKey
      ? 'The key stays in the lock. This passage stays open.'
      : 'Find the brass key to open this passage.';
    blocked = !state.hasKey;
  } else if (terrain === 'key' && !state.hasKey && !state.doorOpened) {
    label = 'Take brass key';
    detail = 'Carry it to the matching locked gate.';
  } else if (terrain === 'boots' && !state.hasBoots) {
    label = 'Put on iron boots';
    detail = 'Reinforced soles let you cross spikes. Avoid water.';
  } else if (terrain === 'relic' && target !== null && !isRelicCollected(board, state, target)) {
    label = 'Collect relic';
    detail = `${relics - found} still needed to power the exit.`;
  } else if (terrain === 'exit') {
    label = found === relics ? 'Enter the awakened arch' : 'Dormant exit';
    detail =
      found === relics
        ? 'Your route home is ready.'
        : `Collect ${relics - found} more relic${relics - found === 1 ? '' : 's'} to awaken it.`;
  } else if (terrain === 'ice') {
    label = 'Slide forward';
    detail = 'You keep sliding until solid ground or an obstacle. Check the landing.';
  } else if (terrain === 'bridge') {
    label = 'Cross the bridge';
    detail = 'Solid timber keeps you above the deep water.';
  }
  if (target !== null && state.crates.includes(target)) {
    label = 'Push the crate';
    detail = 'One square forward. You need clear, safe ground behind it.';
    blocked = false;
    danger = false;
  }
  const position = `${String.fromCharCode(65 + (state.player % board.width))}${Math.floor(state.player / board.width) + 1}`;
  return (
    <div className={`${s.hud} ${state.dead ? s.dead : ''}`}>
      <div className={s.topline}>
        <span className={s.location}>
          EXPLORER VIEW <b>{position}</b>
        </span>
        <span className={s.compass} aria-label={`Facing ${COMPASS[facing]}`}>
          <Compass size={15} />
          <strong>{COMPASS[facing]}</strong>
          <span>Q ↶ · ↷ E</span>
        </span>
      </div>
      <span className={s.reticle} aria-hidden="true" />
      {feedback && !state.dead && !won && (
        <div key={feedback.id} className={`${s.feedback} ${s[feedback.kind]}`} role="status">
          <strong>{feedback.title}</strong>
          <span>{feedback.detail}</span>
        </div>
      )}
      <div className={s.bottomline}>
        {!state.dead && !won && (
          <button
            className={`${s.interaction} ${danger ? s.danger : ''}`}
            onClick={onForward}
            disabled={disabled || blocked}
            aria-label={label}
          >
            {danger ? (
              <TriangleAlert size={20} />
            ) : blocked ? (
              <LockKeyhole size={19} />
            ) : (
              <ArrowUp size={21} />
            )}
            <span>
              <strong>{label}</strong>
              <small>{detail}</small>
            </span>
            {!blocked && <kbd>W</kbd>}
          </button>
        )}
        <div className={s.inventory} role="group" aria-label="Explorer inventory">
          {board.terrain.includes('key') && (
            <span
              data-active={state.hasKey || gateOpen}
              aria-label={
                gateOpen ? 'Gate open' : state.hasKey ? 'Carrying brass key' : 'Brass key not found'
              }
            >
              {gateOpen ? <ShieldCheck size={18} /> : <KeyRound size={18} />}
              <strong>{gateOpen ? 'Gate open' : state.hasKey ? 'Key held' : 'Find key'}</strong>
            </span>
          )}
          {board.terrain.includes('boots') && (
            <span
              data-active={state.hasBoots}
              aria-label={state.hasBoots ? 'Iron boots equipped' : 'Iron boots not found'}
            >
              <Footprints size={18} />
              <strong>{state.hasBoots ? 'Boots on' : 'Find boots'}</strong>
            </span>
          )}
          <span
            data-active={found === relics}
            aria-label={`Exit ${found === relics ? 'ready' : 'dormant'}, ${found} of ${relics} relics`}
          >
            <Gem size={18} />
            <strong>{relics ? `${found} / ${relics} relics` : 'Exit ready'}</strong>
          </span>
        </div>
      </div>
    </div>
  );
}
