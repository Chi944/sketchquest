import {
  Component,
  lazy,
  Suspense,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent,
  type ReactNode,
} from 'react';
import type { BoardDefinition, Direction, GameState } from '../core/types';
import { isRelicCollected } from '../core/rules';
import { Box, Eye, Grid2X2 } from 'lucide-react';
import { Piece } from './Piece';
import styles from './Board.module.css';

const BoardScene = lazy(() => import('./BoardScene'));
export type BoardView = 'first-person' | 'overview' | '2d';
export function readBoardView(): BoardView {
  try {
    const value = localStorage.getItem('sketchquest-view');
    return value === '2d' || value === 'overview' ? value : 'first-person';
  } catch {
    return 'first-person';
  }
}
class SceneBoundary extends Component<
  { children: ReactNode; onUnavailable: () => void },
  { failed: boolean }
> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  componentDidCatch() {
    this.props.onUnavailable();
  }
  render() {
    return this.state.failed ? null : this.props.children;
  }
}

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
  theme?: 'forest' | 'coast' | 'frost';
  view?: BoardView;
  onViewChange?: (view: BoardView) => void;
  facing?: Direction;
  motionCue?: { id: number; kind: 'blocked' | 'turn' };
  overlay?: ReactNode;
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
  theme = 'forest',
  view: controlledView,
  onViewChange,
  facing,
  motionCue,
  overlay,
}: Props) {
  const buttons = useRef<Array<HTMLButtonElement | null>>([]);
  const [focusedCell, setFocusedCell] = useState(0);
  const [localView, setView] = useState<BoardView>(readBoardView);
  const view = controlledView ?? localView;
  const [unavailable, setUnavailable] = useState(false);
  const threeDimensional = !miniature && !editable && view !== '2d' && !unavailable;
  function changeView(value: BoardView) {
    setView(value);
    onViewChange?.(value);
    try {
      localStorage.setItem('sketchquest-view', value);
    } catch {
      /* View still works without storage. */
    }
  }
  function fallback() {
    setUnavailable(true);
    onViewChange?.('2d');
  }
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
    <div
      className={`${styles.boardWrap} ${miniature ? styles.miniature : ''} ${threeDimensional ? styles.worldView : ''}`}
      data-theme={theme}
    >
      {!miniature && !editable && (
        <div className={styles.viewBar}>
          <span>
            {threeDimensional
              ? view === 'first-person'
                ? 'Step inside your adventure'
                : 'Plan your next step'
              : unavailable
                ? 'Grid view · 3D unavailable'
                : 'Your puzzle, from above'}
          </span>
          <div role="group" aria-label="Board view">
            <button
              type="button"
              aria-label="First-person view"
              aria-pressed={threeDimensional && view === 'first-person'}
              disabled={unavailable}
              onClick={() => changeView('first-person')}
            >
              <Eye size={14} />
              Explore
            </button>
            <button
              type="button"
              aria-label="3D world view"
              aria-pressed={threeDimensional && view === 'overview'}
              disabled={unavailable}
              onClick={() => changeView('overview')}
            >
              <Box size={14} />
              Map
            </button>
            <button
              type="button"
              aria-label="2D grid view"
              aria-pressed={!threeDimensional}
              onClick={() => changeView('2d')}
            >
              <Grid2X2 size={14} />
              Grid
            </button>
          </div>
        </div>
      )}
      {threeDimensional && (
        <div className={styles.sceneFrame}>
          <SceneBoundary onUnavailable={fallback}>
            <Suspense
              fallback={
                <div className={styles.sceneLoading} role="status">
                  Opening your little world…
                </div>
              }
            >
              <BoardScene
                board={board}
                state={state}
                won={won}
                theme={theme}
                perspective={view === 'overview' ? 'overview' : 'first-person'}
                facing={facing}
                motionCue={motionCue}
                onUnavailable={fallback}
              />
            </Suspense>
          </SceneBoundary>
          {view === 'first-person' && overlay}
        </div>
      )}
      <div className={threeDimensional ? styles.semanticGrid : undefined}>
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
            const collected =
              (terrain === 'key' && (state?.hasKey || state?.doorOpened)) ||
              (terrain === 'boots' && state?.hasBoots) ||
              (terrain === 'relic' && state && isRelicCollected(board, state, cell));
            const names = [
              `${String.fromCharCode(65 + (cell % board.width))}${Math.floor(cell / board.width) + 1}`,
              collected ? `floor, ${terrain} collected` : terrain,
              occupant === 'player' && state?.dead
                ? `player, fallen in ${state.deathCause}`
                : occupant,
            ]
              .filter(Boolean)
              .join(', ');
            if (miniature)
              return (
                <div
                  key={cell}
                  className={`${styles.cell} ${terrain === 'wall' ? styles.wallCell : ''} ${styles[terrain] ?? ''}`}
                  aria-hidden="true"
                >
                  <span className={styles.terrain}>
                    <Piece
                      kind={collected ? 'floor' : terrain}
                      unlocked={board.rulesVersion === 3 ? state?.doorOpened : state?.hasKey}
                    />
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
                className={`${styles.cell} ${terrain === 'wall' ? styles.wallCell : ''} ${styles[terrain] ?? ''} ${changes.includes(cell) ? styles.changed : ''} ${uncertain.includes(cell) ? styles.uncertain : ''} ${selected.includes(cell) ? styles.selected : ''} ${occupant === 'player' && state?.dead ? styles.fallen : ''}`}
                aria-label={`${names}${changes.includes(cell) ? ', changed' : ''}${uncertain.includes(cell) ? ', needs review' : ''}`}
                tabIndex={
                  !threeDimensional && cell === Math.min(focusedCell, board.terrain.length - 1)
                    ? 0
                    : -1
                }
                onFocus={() => setFocusedCell(cell)}
                onClick={() => onCell?.(cell)}
                onKeyDown={(e) => navigate(e, cell)}
              >
                <span className={styles.terrain}>
                  <Piece
                    kind={collected ? 'floor' : terrain}
                    unlocked={board.rulesVersion === 3 ? state?.doorOpened : state?.hasKey}
                  />
                </span>
                {occupant && (
                  <span className={styles.occupant}>
                    <Piece kind={occupant} />
                  </span>
                )}
                {occupant && ['key', 'exit', 'relic'].includes(terrain) && !collected && (
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
    </div>
  );
}
