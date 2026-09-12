import { useRef, useState, type CSSProperties, type KeyboardEvent } from 'react';
import type { BoardDefinition, GameState } from '../core/types';
import { Piece } from './Piece';
import styles from './Board.module.css';

interface Props {
  board: BoardDefinition;
  state?: GameState;
  editable?: boolean;
  changes?: number[];
  uncertain?: number[];
  extraPlayers?: number[];
  selected?: number[];
  onCell?: (cell: number) => void;
  won?: boolean;
  miniature?: boolean;
  label?: string;
}

export function Board({
  board,
  state,
  editable,
  changes = [],
  uncertain = [],
  extraPlayers = [],
  selected = [],
  onCell,
  won,
  miniature,
  label = 'Puzzle board',
}: Props) {
  const buttons = useRef<Array<HTMLButtonElement | null>>([]);
  const [focusedCell, setFocusedCell] = useState(0);
  const player = state?.player ?? board.player;
  const crates = state?.crates ?? board.crates;
  function navigate(event: KeyboardEvent<HTMLButtonElement>, cell: number) {
    if (!editable) return;
    const offset: Record<string, number> = {
      ArrowRight: 1,
      ArrowLeft: -1,
      ArrowDown: board.width,
      ArrowUp: -board.width,
    };
    if (!(event.key in offset)) return;
    event.preventDefault();
    event.stopPropagation();
    if (
      (event.key === 'ArrowLeft' && cell % board.width === 0) ||
      (event.key === 'ArrowRight' && cell % board.width === board.width - 1)
    )
      return;
    const next = cell + offset[event.key];
    if (next >= 0 && next < board.terrain.length) buttons.current[next]?.focus();
  }
  return (
    <div className={`${styles.boardWrap} ${miniature ? styles.miniature : ''}`}>
      {!miniature && (
        <div
          className={styles.columnLabels}
          style={{ gridTemplateColumns: `repeat(${board.width}, 1fr)` }}
          aria-hidden="true"
        >
          {Array.from({ length: board.width }, (_, x) => (
            <span key={x}>{String.fromCharCode(65 + x)}</span>
          ))}
        </div>
      )}
      <div
        className={`${styles.board} ${won ? styles.won : ''}`}
        role="group"
        aria-label={label}
        style={{ '--columns': board.width, '--rows': board.height } as CSSProperties}
      >
        {board.terrain.map((terrain, cell) => {
          const occupant =
            player === cell || extraPlayers.includes(cell)
              ? 'player'
              : crates.includes(cell)
                ? 'crate'
                : null;
          const collected = terrain === 'key' && state?.hasKey;
          const names = [
            `${String.fromCharCode(65 + (cell % board.width))}${Math.floor(cell / board.width) + 1}`,
            collected ? 'floor, key collected' : terrain,
            occupant,
          ]
            .filter(Boolean)
            .join(', ');
          if (miniature)
            return (
              <div
                key={cell}
                className={`${styles.cell} ${terrain === 'wall' ? styles.wallCell : ''}`}
                aria-hidden="true"
              >
                <span className={styles.terrain}>
                  <Piece kind={collected ? 'floor' : terrain} unlocked={state?.hasKey} />
                </span>
                {occupant && (
                  <span className={styles.occupant}>
                    <Piece kind={occupant} />
                  </span>
                )}
              </div>
            );
          return (
            <button
              key={cell}
              ref={(el) => {
                buttons.current[cell] = el;
              }}
              type="button"
              className={`${styles.cell} ${terrain === 'wall' ? styles.wallCell : ''} ${changes.includes(cell) ? styles.changed : ''} ${uncertain.includes(cell) ? styles.uncertain : ''} ${selected.includes(cell) ? styles.selected : ''}`}
              aria-label={`${names}${changes.includes(cell) ? ', changed' : ''}${uncertain.includes(cell) ? ', needs review' : ''}`}
              tabIndex={cell === Math.min(focusedCell, board.terrain.length - 1) ? 0 : -1}
              onFocus={() => setFocusedCell(cell)}
              onClick={() => onCell?.(cell)}
              onKeyDown={(e) => navigate(e, cell)}
            >
              <span className={styles.terrain}>
                <Piece kind={collected ? 'floor' : terrain} unlocked={state?.hasKey} />
              </span>
              {occupant && (
                <span className={styles.occupant}>
                  <Piece kind={occupant} />
                </span>
              )}
              {occupant && ['key', 'exit'].includes(terrain) && !collected && (
                <span className={styles.covered}>
                  <Piece kind={terrain} />
                </span>
              )}
              {uncertain.includes(cell) && <span className={styles.question}>?</span>}
              {changes.includes(cell) && !uncertain.includes(cell) && (
                <span className={styles.changeMarker} aria-hidden="true">
                  <svg viewBox="0 0 16 16">
                    <path d="m8 3 5 5-5 5-5-5Z" fill="currentColor" />
                  </svg>
                </span>
              )}
              {!miniature && cell % board.width === 0 && (
                <span className={styles.rowLabel} aria-hidden="true">
                  {Math.floor(cell / board.width) + 1}
                </span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
