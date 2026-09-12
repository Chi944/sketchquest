import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type ReactNode,
} from 'react';
import {
  ArrowDown,
  ArrowLeft,
  ArrowRight,
  ArrowUp,
  BookOpen,
  Camera,
  Check,
  CheckCheck,
  ChevronDown,
  ChevronRight,
  CircleHelp,
  Copy,
  Download,
  Eraser,
  Flag,
  FolderOpen,
  History,
  Keyboard,
  LoaderCircle,
  Maximize2,
  MousePointer2,
  Pause,
  Pencil,
  Play,
  Plus,
  Redo2,
  RotateCcw,
  Share2,
  ShieldCheck,
  SkipBack,
  SkipForward,
  Undo2,
  Upload,
  WandSparkles,
  X,
} from 'lucide-react';
import { Board } from './components/Board';
import { Piece } from './components/Piece';
import {
  applyCellEdits,
  boardHash,
  changedCells,
  emptyBoard,
  paintCell,
  parseBoard,
  resizeBoard,
  validateBoard,
} from './core/board';
import { DEMO_LONGER_EDITS, EXAMPLES } from './core/examples';
import { initialState, isWon, replay, transition } from './core/rules';
import type {
  BoardDefinition,
  Direction,
  Interpretation,
  PlaySession,
  ProposalResponse,
  Revision,
  SolverResult,
  Tool,
} from './core/types';
import { PhotoImport } from './image/PhotoImport';
import { apiJson, postJson, type ServiceStatus } from './state/api';
import { runSolver } from './state/solver-client';
import {
  downloadJson,
  loadWorkspace,
  saveWorkspace,
  type DraftReview,
  type ParkedDraft,
  type SavedWorkspace,
} from './state/storage';
import s from './App.module.css';

type Mode = 'play' | 'draw' | 'remix';
type Modal = 'photo' | 'examples' | 'revisions' | 'share' | 'help' | null;
type EditEntry = { board: BoardDefinition; review: DraftReview | null };
type Verified = { hash: string; result: SolverResult };
const NEW_ID = () => crypto.randomUUID();
const coord = (cell: number, width: number) =>
  `${String.fromCharCode(65 + (cell % width))}${Math.floor(cell / width) + 1}`;
const DIRECTION_ICON = { up: ArrowUp, right: ArrowRight, down: ArrowDown, left: ArrowLeft };
const TOOL_INFO: Array<{ tool: Tool; label: string; shortcut: string }> = [
  { tool: 'wall', label: 'Wall', shortcut: '1' },
  { tool: 'player', label: 'Player', shortcut: '2' },
  { tool: 'crate', label: 'Crate', shortcut: '3' },
  { tool: 'key', label: 'Key', shortcut: '4' },
  { tool: 'door', label: 'Door', shortcut: '5' },
  { tool: 'exit', label: 'Exit', shortcut: '6' },
  { tool: 'erase', label: 'Erase', shortcut: '7' },
  { tool: 'floor', label: 'Floor', shortcut: '8' },
];

function revisionFor(
  board: BoardDefinition,
  title: string,
  source: Revision['source'],
  parentId: string | null,
): Revision {
  return {
    id: NEW_ID(),
    parentId,
    board: structuredClone(board),
    title: title.trim() || 'Untitled adventure',
    createdAt: new Date().toISOString(),
    source,
  };
}
const firstRevision = revisionFor(EXAMPLES[0].board, EXAMPLES[0].title, 'example', null);

function Dialog({
  title,
  onClose,
  children,
  wide = false,
  header = true,
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
  wide?: boolean;
  header?: boolean;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const dialog = ref.current;
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    dialog?.showModal();
    return () => {
      dialog?.close();
      if (opener?.isConnected) opener.focus({ preventScroll: true });
    };
  }, []);
  return (
    <dialog
      ref={ref}
      className={`${s.dialog} ${wide ? s.dialogWide : ''}`}
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      aria-label={title}
    >
      {header && (
        <div className={s.dialogHeader}>
          <h2>{title}</h2>
          <button className={s.iconButton} onClick={onClose} aria-label="Close dialog">
            <X size={21} />
          </button>
        </div>
      )}
      {children}
    </dialog>
  );
}

export default function App() {
  const [revisions, setRevisions] = useState<Revision[]>([firstRevision]);
  const [activeId, setActiveId] = useState(firstRevision.id);
  const [sessions, setSessions] = useState<Record<string, PlaySession>>({});
  const [draft, setDraft] = useState<BoardDefinition | null>(null);
  const [draftTitle, setDraftTitle] = useState(firstRevision.title);
  const [review, setReview] = useState<DraftReview | null>(null);
  const [editHistory, setEditHistory] = useState<EditEntry[]>([]);
  const [editCursor, setEditCursor] = useState(-1);
  const [mode, setMode] = useState<Mode>('play');
  const [tool, setTool] = useState<Tool>('wall');
  const [selectedCells, setSelectedCells] = useState<number[]>([]);
  const [modal, setModal] = useState<Modal>(null);
  const [notice, setNotice] = useState('');
  const [hydrated, setHydrated] = useState(false);
  const [storageDisabled, setStorageDisabled] = useState(false);
  const [saveLabel, setSaveLabel] = useState('Opening notebook…');
  const [services, setServices] = useState<ServiceStatus>({
    aiEnabled: false,
    sharingEnabled: false,
    model: '',
    message: 'Checking the connection…',
  });
  const [verified, setVerified] = useState<Verified | null>(null);
  const [solving, setSolving] = useState(false);
  const [solveRefresh, setSolveRefresh] = useState(0);
  const [playback, setPlayback] = useState<{
    moves: Direction[];
    cursor: number;
    running: boolean;
  } | null>(null);
  const [speed, setSpeed] = useState(450);
  const [prompt, setPrompt] = useState('');
  const [aiBusy, setAiBusy] = useState(false);
  const [aiProgress, setAiProgress] = useState('');
  const [sourcePreview, setSourcePreview] = useState<string | null>(null);
  const [shareUrl, setShareUrl] = useState('');
  const [shareBusy, setShareBusy] = useState(false);
  const [sharedSnapshot, setSharedSnapshot] = useState<{
    title: string;
    board: BoardDefinition;
  } | null>(null);
  const [parkedDrafts, setParkedDrafts] = useState<ParkedDraft[]>([]);
  const [sharedView, setSharedView] = useState(location.pathname.startsWith('/s/'));
  const [sharedLoading, setSharedLoading] = useState(location.pathname.startsWith('/s/'));
  const [sharedError, setSharedError] = useState('');
  const solveAbort = useRef<AbortController | null>(null);
  const aiAbort = useRef<AbortController | null>(null);
  const operationVersion = useRef(0);
  const fileInput = useRef<HTMLInputElement>(null);
  const saveQueue = useRef(Promise.resolve());
  const active = revisions.find((r) => r.id === activeId) ?? revisions[0];
  const session = sessions[active.id] ?? { revisionId: active.id, moves: [], cursor: 0 };
  const showingDraft = mode !== 'play' && !!draft;
  const board = showingDraft ? draft! : active.board;
  const hash = boardHash(board);
  const activeHash = boardHash(active.board);
  const issues = useMemo(() => validateBoard(board), [hash]);
  const result = verified?.hash === hash ? verified.result : null;
  const ownRun = useMemo(
    () => replay(active.board, session.moves.slice(0, session.cursor)),
    [active, session.moves, session.cursor],
  );
  const replayRun = useMemo(
    () => (playback ? replay(board, playback.moves.slice(0, playback.cursor)) : null),
    [hash, playback],
  );
  const gameState = mode === 'play' ? (replayRun?.state ?? ownRun.state) : undefined;
  const won = mode === 'play' && isWon(board, gameState ?? initialState(board));
  const differences = showingDraft ? changedCells(active.board, board) : [];

  const invalidateAI = useCallback(() => {
    operationVersion.current++;
    aiAbort.current?.abort();
    setAiBusy(false);
    setAiProgress('');
  }, []);

  useEffect(() => {
    let disposed = false;
    loadWorkspace()
      .then((saved) => {
        if (!saved || disposed || location.pathname.startsWith('/s/')) return;
        setRevisions(saved.revisions);
        setActiveId(saved.activeRevisionId);
        setSessions(saved.sessions);
        setDraft(saved.draft);
        setDraftTitle(saved.draftTitle);
        setReview(saved.draftReview ?? null);
        setParkedDrafts(saved.parkedDrafts ?? []);
        if (saved.draft) {
          setEditHistory([{ board: saved.draft, review: saved.draftReview ?? null }]);
          setEditCursor(0);
          setMode('draw');
        }
      })
      .catch((error) => {
        if (!disposed) {
          setNotice(error.message);
          setStorageDisabled(true);
          setSaveLabel('Autosave unavailable · export a backup');
        }
      })
      .finally(() => {
        if (!disposed) setHydrated(true);
      });
    apiJson<ServiceStatus>('/api/status')
      .then((value) => {
        if (!disposed) setServices(value);
      })
      .catch(() => {
        if (!disposed)
          setServices({
            aiEnabled: false,
            sharingEnabled: false,
            model: '',
            message: 'AI is offline. Your manual tools still work.',
          });
      });
    return () => {
      disposed = true;
    };
  }, []);

  useEffect(() => {
    const match = location.pathname.match(/^\/s\/([^/]+)$/);
    if (!match) return;
    const abort = new AbortController();
    apiJson<{ id: string; title: string; board: BoardDefinition }>(
      '/api/shares/' + encodeURIComponent(match[1]),
      { signal: abort.signal },
    )
      .then((value) => {
        const valid = parseBoard(value.board);
        const next = revisionFor(valid, value.title, 'import', null);
        if (abort.signal.aborted) return;
        setRevisions([next]);
        setActiveId(next.id);
        setSessions({});
        setDraftTitle(value.title);
        setDraft(null);
        setReview(null);
        setMode('play');
        setSharedLoading(false);
      })
      .catch((error) => {
        if (!abort.signal.aborted) {
          setSharedError(error.message);
          setSharedLoading(false);
        }
      });
    return () => abort.abort();
  }, []);

  useEffect(() => {
    if (!hydrated || storageDisabled || sharedView) return;
    const value: SavedWorkspace = {
      version: 1,
      revisions,
      activeRevisionId: activeId,
      sessions,
      draft,
      draftTitle,
      draftReview: review,
      parkedDrafts,
      savedAt: new Date().toISOString(),
    };
    setSaveLabel('Saving…');
    const persist = () => {
      saveQueue.current = saveQueue.current
        .catch(() => undefined)
        .then(() => saveWorkspace(value))
        .then(() => setSaveLabel('Saved in this browser'))
        .catch(() => {
          setSaveLabel('Could not save · export a backup');
          setNotice('Browser storage is unavailable or full. Export your puzzle before closing.');
        });
    };
    const timeout = setTimeout(persist, 300);
    const onHidden = () => {
      if (document.visibilityState === 'hidden') {
        clearTimeout(timeout);
        persist();
      }
    };
    document.addEventListener('visibilitychange', onHidden);
    return () => {
      clearTimeout(timeout);
      document.removeEventListener('visibilitychange', onHidden);
    };
  }, [
    revisions,
    activeId,
    sessions,
    draft,
    draftTitle,
    review,
    parkedDrafts,
    hydrated,
    storageDisabled,
    sharedView,
  ]);

  useEffect(() => {
    solveAbort.current?.abort();
    setVerified(null);
    setSolving(false);
    setPlayback(null);
    if (issues.length || sharedLoading || sharedError) return;
    const abort = new AbortController();
    solveAbort.current = abort;
    const timer = setTimeout(() => {
      setSolving(true);
      runSolver(board, activeId, abort.signal)
        .then((value) => {
          if (abort.signal.aborted) return;
          if (value.status === 'solved') {
            const proof = replay(board, value.solution);
            if (
              !proof.valid ||
              !proof.won ||
              proof.moves !== value.moves ||
              proof.pushes !== value.pushes
            )
              throw new Error(
                'The solution did not replay correctly. This board has not been verified.',
              );
          }
          setVerified({ hash, result: value });
        })
        .catch((error) => {
          if (!abort.signal.aborted) setNotice(error.message);
        })
        .finally(() => {
          if (!abort.signal.aborted) setSolving(false);
        });
    }, 220);
    return () => {
      clearTimeout(timer);
      abort.abort();
    };
  }, [hash, activeId, solveRefresh, sharedLoading, sharedError]);

  useEffect(() => {
    if (!playback?.running) return;
    const timer = setInterval(
      () =>
        setPlayback((value) =>
          value
            ? {
                ...value,
                cursor: Math.min(value.cursor + 1, value.moves.length),
                running: value.cursor + 1 < value.moves.length,
              }
            : null,
        ),
      speed,
    );
    return () => clearInterval(timer);
  }, [playback?.running, speed]);
  useEffect(
    () => () => {
      aiAbort.current?.abort();
      solveAbort.current?.abort();
    },
    [],
  );
  useEffect(
    () => () => {
      if (sourcePreview) URL.revokeObjectURL(sourcePreview);
    },
    [sourcePreview],
  );

  function setSession(next: PlaySession) {
    setSessions((value) => ({ ...value, [active.id]: next }));
  }
  function move(direction: Direction) {
    if (mode !== 'play' || playback || sharedLoading || sharedError) return;
    const outcome = transition(active.board, ownRun.state, direction);
    if (!outcome.ok) {
      setNotice(outcome.reason);
      return;
    }
    setNotice(outcome.won ? 'You found the way out. Nicely explored!' : '');
    const moves = [...session.moves.slice(0, session.cursor), direction];
    setSession({ revisionId: active.id, moves, cursor: moves.length });
  }
  function restart() {
    setPlayback(null);
    setSession({ revisionId: active.id, moves: [], cursor: 0 });
    setNotice('A fresh start. Your puzzle is unchanged.');
  }
  function setEdit(next: BoardDefinition, nextReview: DraftReview | null = review) {
    if (nextReview?.source === 'text' && boardHash(next) !== hash) {
      nextReview = {
        ...nextReview,
        objective: 'edit',
        baselineMoves: undefined,
        explanation:
          'You adjusted the proposal by hand. Review the updated board and its new solution.',
        notes: ['The earlier route comparison no longer applies to this edited board.'],
      };
    }
    invalidateAI();
    setDraft(next);
    setReview(nextReview);
    const history = [
      ...editHistory.slice(0, editCursor + 1),
      { board: next, review: nextReview },
    ].slice(-100);
    setEditHistory(history);
    setEditCursor(history.length - 1);
  }
  function paint(cell: number) {
    if (mode === 'remix' || tool === 'select') {
      setSelectedCells((value) =>
        value.includes(cell) ? value.filter((c) => c !== cell) : [...value, cell],
      );
      return;
    }
    if (mode !== 'draw') return;
    const next = paintCell(board, cell, tool);
    const nextReview = review
      ? {
          ...review,
          corrections: review.corrections + 1,
          uncertain: review.uncertain.filter((c) => c !== cell),
          extraPlayers: tool === 'player' ? [] : review.extraPlayers.filter((c) => c !== cell),
        }
      : null;
    setEdit(next, nextReview);
  }
  function resizeDraft(width: number, height: number) {
    if (width === board.width && height === board.height) return;
    const next = resizeBoard(board, width, height);
    const remap = (cell: number) => {
      const column = cell % board.width,
        row = Math.floor(cell / board.width);
      return column < width && row < height ? row * width + column : -1;
    };
    const resizeNote =
      'Grid size changed. Check every cell against the sketch again; earlier notes refer to the original grid.';
    const nextReview = review
      ? {
          ...review,
          uncertain:
            review.source === 'image'
              ? Array.from({ length: width * height }, (_, cell) => cell)
              : review.uncertain.map(remap).filter((cell) => cell >= 0),
          extraPlayers: review.extraPlayers.map(remap).filter((cell) => cell >= 0),
          notes:
            review.source === 'image'
              ? [resizeNote, ...review.notes.filter((note) => note !== resizeNote)]
              : review.notes,
          corrections: review.corrections + 1,
        }
      : null;
    setSelectedCells([]);
    setEdit(next, nextReview);
  }
  function undoEdit(delta: number) {
    const cursor = editCursor + delta;
    if (cursor < 0 || cursor >= editHistory.length) return;
    invalidateAI();
    setEditCursor(cursor);
    setDraft(editHistory[cursor].board);
    setReview(editHistory[cursor].review);
  }
  function switchMode(next: Mode) {
    invalidateAI();
    setPlayback(null);
    setMode(next);
    setSelectedCells([]);
    setNotice('');
    if (next === 'draw' && !draft) {
      const value = structuredClone(active.board);
      setDraft(value);
      setDraftTitle(active.title);
      setReview(null);
      setEditHistory([{ board: value, review: null }]);
      setEditCursor(0);
    }
  }
  function navigateModeTabs(event: ReactKeyboardEvent<HTMLDivElement>) {
    if (event.key === 'ArrowUp' || event.key === 'ArrowDown') {
      event.stopPropagation();
      return;
    }
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
    event.preventDefault();
    event.stopPropagation();
    const modes: Mode[] = sharedView ? ['play'] : ['play', 'draw', 'remix'];
    const current = modes.indexOf(mode);
    const index =
      event.key === 'Home'
        ? 0
        : event.key === 'End'
          ? modes.length - 1
          : (current + (event.key === 'ArrowRight' ? 1 : -1) + modes.length) % modes.length;
    switchMode(modes[index]);
    document.getElementById(`mode-tab-${modes[index]}`)?.focus({ preventScroll: true });
  }
  function newDraft() {
    parkCurrentDraft();
    invalidateAI();
    const next = emptyBoard(6, 6);
    setDraft(next);
    setDraftTitle('My little adventure');
    setReview(null);
    setSourcePreview(null);
    setEditHistory([{ board: next, review: null }]);
    setEditCursor(0);
    setMode('draw');
    setPlayback(null);
    setSelectedCells([]);
    setModal(null);
    setNotice('A blank page. Place a few obstacles and see where it leads.');
  }
  function acceptBoard() {
    if (!draft || validateBoard(draft).length) return;
    if (review?.uncertain.length || review?.extraPlayers.length) {
      setNotice('Check every highlighted cell before applying this interpretation.');
      return;
    }
    if (review?.source === 'text' && result?.status !== 'solved') {
      setNotice('This proposed edit needs a verified solution before it can be accepted.');
      return;
    }
    if (
      review?.objective === 'longer' &&
      (result?.status !== 'solved' ||
        review.baselineMoves == null ||
        result.moves <= review.baselineMoves)
    ) {
      setNotice('This board has not been verified to have a longer shortest solution.');
      return;
    }
    if (review && review.baseHash !== activeHash) {
      setNotice('The starting revision changed. Request a fresh proposal.');
      return;
    }
    const next = revisionFor(draft, draftTitle, review?.source ?? 'manual', active.id);
    setRevisions((value) => [...value, next]);
    setActiveId(next.id);
    setSessions((value) => ({
      ...value,
      [next.id]: { revisionId: next.id, moves: [], cursor: 0 },
    }));
    setDraft(null);
    setReview(null);
    setSourcePreview(null);
    setMode('play');
    setPlayback(null);
    setSelectedCells([]);
    setNotice('New revision saved. Your previous adventure is in the notebook.');
    invalidateAI();
  }
  function discardDraft() {
    invalidateAI();
    setDraft(null);
    setReview(null);
    setSourcePreview(null);
    setMode('play');
    setPlayback(null);
    setNotice('Back to your current puzzle.');
  }
  function chooseExample(index: number) {
    parkCurrentDraft();
    const example = EXAMPLES[index];
    const next = revisionFor(example.board, example.title, 'example', active.id);
    invalidateAI();
    setRevisions((value) => [...value, next]);
    setActiveId(next.id);
    setDraft(null);
    setReview(null);
    setSourcePreview(null);
    setDraftTitle(next.title);
    setMode('play');
    setPlayback(null);
    setModal(null);
    setNotice(example.description);
  }
  function restoreRevision(revision: Revision) {
    parkCurrentDraft();
    const next = revisionFor(revision.board, revision.title, 'manual', active.id);
    invalidateAI();
    setRevisions((value) => [...value, next]);
    setActiveId(next.id);
    setDraft(null);
    setReview(null);
    setDraftTitle(next.title);
    setSourcePreview(null);
    setMode('play');
    setPlayback(null);
    setModal(null);
    setNotice('Restored as a new revision. All earlier revisions are preserved.');
  }

  function parkCurrentDraft() {
    if (draft && (boardHash(draft) !== activeHash || draftTitle !== active.title || review))
      setParkedDrafts((value) => [
        ...value,
        { baseRevisionId: active.id, board: draft, title: draftTitle, review },
      ]);
  }
  function restoreDraft(index: number) {
    const parked = parkedDrafts[index];
    if (!parked) return;
    const others = parkedDrafts.filter((_, item) => item !== index);
    if (draft && (boardHash(draft) !== activeHash || draftTitle !== active.title || review))
      others.push({ baseRevisionId: active.id, board: draft, title: draftTitle, review });
    invalidateAI();
    setParkedDrafts(others);
    setActiveId(parked.baseRevisionId);
    setDraft(parked.board);
    setDraftTitle(parked.title);
    setReview(parked.review);
    setSourcePreview(null);
    setEditHistory([{ board: parked.board, review: parked.review }]);
    setEditCursor(0);
    setMode('draw');
    setPlayback(null);
    setSelectedCells([]);
    setModal(null);
    setNotice('Your unfinished draft is back on the workbench.');
  }

  useEffect(() => {
    const handle = (event: KeyboardEvent) => {
      if (
        !hydrated ||
        modal ||
        (event.target instanceof HTMLElement &&
          (['INPUT', 'TEXTAREA', 'SELECT'].includes(event.target.tagName) ||
            event.target.isContentEditable))
      )
        return;
      if (mode === 'draw' && (event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'z') {
        event.preventDefault();
        undoEdit(event.shiftKey ? 1 : -1);
        return;
      }
      if (mode === 'draw') {
        const found = TOOL_INFO.find((info) => info.shortcut === event.key);
        if (found) setTool(found.tool);
        return;
      }
      const key: Record<string, Direction> = {
        ArrowUp: 'up',
        w: 'up',
        ArrowRight: 'right',
        d: 'right',
        ArrowDown: 'down',
        s: 'down',
        ArrowLeft: 'left',
        a: 'left',
      };
      if (mode === 'play' && key[event.key] && !event.ctrlKey && !event.metaKey && !event.altKey) {
        event.preventDefault();
        move(key[event.key]);
      }
    };
    window.addEventListener('keydown', handle);
    return () => window.removeEventListener('keydown', handle);
  });

  function photoResult(value: {
    requestId: string;
    interpretation: Interpretation;
    previewUrl: string;
    metrics?: { latencyMs: number };
  }) {
    const interpretation = value.interpretation;
    if (
      !interpretation.width ||
      !interpretation.height ||
      interpretation.status !== 'interpreted'
    ) {
      const guidance =
        interpretation.status === 'unsupported'
          ? 'Use a sketch with a player, an exit, and a grid from 4×4 to 8×8, or build the puzzle with the drawing tools.'
          : 'Choose “I know the grid size” and set the rows and columns, crop to the puzzle, or explain unclear symbols in the legend, then try again.';
      // PhotoImport catches callback errors inside its dialog and retains the editable photo.
      // It still owns this preview URL until this callback returns successfully.
      throw new Error([interpretation.notes.join(' '), guidance].filter(Boolean).join(' '));
    }
    const next: BoardDefinition = {
      schemaVersion: 1,
      rulesVersion: 1,
      width: interpretation.width,
      height: interpretation.height,
      terrain: Array(interpretation.width * interpretation.height).fill('floor'),
      player: -1,
      crates: [],
    };
    const players: number[] = [];
    interpretation.cells.forEach((cell) => {
      if (cell.cell < 0 || cell.cell >= next.terrain.length) return;
      next.terrain[cell.cell] = cell.terrain;
      if (cell.occupant === 'player') players.push(cell.cell);
      if (cell.occupant === 'crate') next.crates.push(cell.cell);
    });
    next.player = players[0] ?? -1;
    const notes = [
      ...interpretation.notes,
      ...interpretation.cells
        .filter((c) => c.uncertain || c.note)
        .map(
          (c) =>
            `${coord(c.cell, next.width)}: ${c.note || 'Check this symbol.'}${c.alternatives.length ? ' Could be: ' + c.alternatives.join(', ') + '.' : ''}`,
        ),
    ];
    if (players.length > 1)
      notes.push(
        'More than one player was detected. Use the Player tool to choose the starting cell.',
      );
    const nextReview: DraftReview = {
      source: 'image',
      baseHash: activeHash,
      explanation:
        'Here is what the drawing looks like as a puzzle. Check the grid and the highlighted cells.',
      notes,
      uncertain: [
        ...new Set([
          ...interpretation.cells.filter((c) => c.uncertain).map((c) => c.cell),
          ...players.slice(1),
        ]),
      ],
      extraPlayers: players.slice(1),
      objective: 'edit',
      corrections: 0,
    };
    parkCurrentDraft();
    invalidateAI();
    setDraft(next);
    setReview(nextReview);
    setDraftTitle('From my sketch');
    setEditHistory([{ board: next, review: nextReview }]);
    setEditCursor(0);
    setSourcePreview(value.previewUrl);
    setModal(null);
    setMode('draw');
    setNotice('Interpretation ready to review. Nothing has changed in your current puzzle.');
  }

  async function propose(prepared = false) {
    if (aiBusy || (!prepared && !prompt.trim())) return;
    invalidateAI();
    const version = operationVersion.current;
    const abort = new AbortController();
    aiAbort.current = abort;
    setAiBusy(true);
    setAiProgress('Checking the starting puzzle…');
    setNotice('');
    const base = active.board;
    const baseId = active.id;
    const baseHash = boardHash(base);
    const fresh = () => !abort.signal.aborted && version === operationVersion.current;
    try {
      let response: ProposalResponse;
      if (prepared) {
        if (baseHash !== boardHash(EXAMPLES[0].board))
          throw new Error('Open the first example puzzle to try its prepared change.');
        response = {
          requestId: NEW_ID(),
          baseRevisionId: baseId,
          baseHash,
          status: 'proposed',
          objective: 'longer',
          message: 'A prepared example, checked live by the solver.',
          candidates: [
            {
              explanation: 'A small detour gives this adventure a longer shortest solution.',
              edits: DEMO_LONGER_EDITS,
            },
          ],
        };
      } else {
        setAiProgress('Thinking about your request…');
        const requestId = NEW_ID();
        response = await postJson<ProposalResponse>(
          '/api/propose',
          { requestId, baseRevisionId: baseId, baseHash, board: base, prompt, selectedCells },
          abort.signal,
        );
        if (response.requestId !== requestId)
          throw new Error('The change response did not match this request. Please try again.');
      }
      if (!fresh()) return;
      if (response.baseHash !== baseHash || response.baseRevisionId !== baseId)
        throw new Error(
          'That response belongs to an older revision. Please request a fresh change.',
        );
      if (response.status !== 'proposed') throw new Error(response.message);
      setAiProgress('Finding the shortest route before the change…');
      const baseline = await runSolver(base, baseId, abort.signal);
      if (!fresh()) return;
      if (response.objective === 'longer' && baseline.status !== 'solved')
        throw new Error(
          'The current puzzle needs a verified shortest solution before we can compare route lengths.',
        );
      const successes: Array<{
        board: BoardDefinition;
        explanation: string;
        result: Extract<SolverResult, { status: 'solved' }>;
        changed: number;
      }> = [];
      for (let index = 0; index < Math.min(response.candidates.length, 3); index++) {
        if (!fresh()) return;
        setAiProgress(`Checking proposed route ${index + 1} of ${response.candidates.length}…`);
        const candidate = response.candidates[index];
        const next = applyCellEdits(base, candidate.edits);
        if (validateBoard(next).length) continue;
        const solution = await runSolver(next, baseId, abort.signal);
        if (solution.status !== 'solved' || !replay(next, solution.solution).won) continue;
        if (
          response.objective === 'longer' &&
          (baseline.status !== 'solved' || solution.moves <= baseline.moves)
        )
          continue;
        successes.push({
          board: next,
          explanation: candidate.explanation,
          result: solution,
          changed: changedCells(base, next).length,
        });
      }
      if (!fresh()) return;
      if (!successes.length)
        throw new Error(
          'No proposed change met the request with a verified solution. Your current puzzle is unchanged. Try selecting a cell or requesting a smaller edit.',
        );
      successes.sort((a, b) => a.changed - b.changed || b.result.moves - a.result.moves);
      const best = successes[0];
      const comparison =
        baseline.status === 'solved'
          ? `Shortest solution: ${baseline.moves} → ${best.result.moves} moves. ${best.result.pushes} ${best.result.pushes === 1 ? 'push' : 'pushes'} in the new route.`
          : `${best.result.moves} moves in the verified shortest solution.`;
      const nextReview: DraftReview = {
        source: 'text',
        baseHash,
        explanation: best.explanation,
        notes: [
          comparison,
          'Shortest-move length is one difficulty proxy, not a measure of how hard people will find the puzzle.',
        ],
        uncertain: [],
        extraPlayers: [],
        objective: response.objective,
        baselineMoves: baseline.status === 'solved' ? baseline.moves : undefined,
        corrections: 0,
        prepared,
      };
      parkCurrentDraft();
      setDraft(best.board);
      setDraftTitle(active.title);
      setReview(nextReview);
      setEditHistory([{ board: best.board, review: nextReview }]);
      setEditCursor(0);
      setMode('remix');
      setSelectedCells([]);
      setSourcePreview(null);
      setNotice('Proposal ready. Inspect the outlined cells before accepting.');
    } catch (error) {
      if (fresh())
        setNotice(error instanceof Error ? error.message : 'The change could not be proposed.');
    } finally {
      if (fresh()) {
        setAiBusy(false);
        setAiProgress('');
      }
    }
  }

  async function share() {
    setShareBusy(true);
    setNotice('');
    const snapshot = { board: structuredClone(active.board), title: active.title };
    try {
      const response = await postJson<{ id: string; url: string }>('/api/shares', snapshot);
      const url = new URL(response.url, location.origin);
      if (url.origin !== location.origin || !url.pathname.startsWith('/s/'))
        throw new Error('The service returned an invalid share link.');
      setShareUrl(url.href);
      setSharedSnapshot(snapshot);
      setModal('share');
    } catch (error) {
      setNotice(
        error instanceof Error
          ? error.message
          : 'Sharing is unavailable. Export the puzzle instead.',
      );
    } finally {
      setShareBusy(false);
    }
  }
  async function importBoard(file?: File) {
    if (!file) return;
    try {
      if (file.size > 32768) throw new Error('Choose a puzzle JSON file smaller than 32 KB.');
      const raw = JSON.parse(await file.text());
      const next = parseBoard(raw.board ?? raw);
      parkCurrentDraft();
      invalidateAI();
      setDraft(next);
      setDraftTitle(typeof raw.title === 'string' ? raw.title.slice(0, 80) : 'Imported adventure');
      setReview(null);
      setSourcePreview(null);
      setEditHistory([{ board: next, review: null }]);
      setEditCursor(0);
      setMode('draw');
      setNotice('Imported as a draft. Review before applying.');
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'This is not a valid puzzle file.');
    }
  }
  async function forkShared() {
    if (sharedLoading || sharedError) return;
    try {
      const saved = await loadWorkspace();
      const copy = revisionFor(active.board, active.title, 'import', null);
      const parked = [...(saved?.parkedDrafts ?? [])];
      if (saved?.draft)
        parked.push({
          baseRevisionId: saved.activeRevisionId,
          board: saved.draft,
          title: saved.draftTitle,
          review: saved.draftReview ?? null,
        });
      setRevisions([...(saved?.revisions ?? []), copy]);
      setActiveId(copy.id);
      setSessions(saved?.sessions ?? {});
      setParkedDrafts(parked);
      setDraft(null);
      setReview(null);
      setSourcePreview(null);
      setDraftTitle(copy.title);
      setMode('play');
      setPlayback(null);
      history.replaceState(null, '', '/');
      setSharedView(false);
      setSharedError('');
      setNotice(
        'Your own copy is ready. Earlier revisions and unfinished drafts are safe in your notebook.',
      );
    } catch (error) {
      setNotice(
        error instanceof Error
          ? error.message
          : 'Your saved notebook could not be opened. Export this puzzle to keep a copy.',
      );
    }
  }
  const solverText = issues.length
    ? 'Needs a little fixing'
    : solving
      ? 'Exploring every route…'
      : result?.status === 'solved'
        ? 'Verified solvable'
        : result?.status === 'unsolvable'
          ? 'No route to the exit'
          : result?.status === 'inconclusive'
            ? result.reason === 'cancelled'
              ? 'Search cancelled'
              : 'Search budget reached'
            : 'Ready to check';
  const movesCount = playback ? (replayRun?.moves ?? 0) : ownRun.moves;
  const pushesCount = playback ? (replayRun?.pushes ?? 0) : ownRun.pushes;

  if (!hydrated && !sharedView)
    return (
      <div className={s.app}>
        <main className={s.main}>
          <div className={s.emptyState} role="status">
            <LoaderCircle className={s.spin} size={32} />
            <h1>Opening your notebook…</h1>
            <p>Your saved puzzles will be ready in a moment.</p>
          </div>
        </main>
      </div>
    );

  return (
    <div className={s.app}>
      <header className={s.header}>
        <a className={s.brand} href="/" aria-label="SketchQuest home">
          <span className={s.brandMark}>
            <Pencil size={23} strokeWidth={2.2} />
          </span>
          <span>
            Sketch<span className={s.brandQuest}>Quest</span>
            <span className={s.brandDot}>.</span>
          </span>
        </a>
        <div className={s.headerRight}>
          <span className={s.freeTag}>
            <span />
            Free to make. Free to play.
          </span>
          <button className={s.textButton} onClick={() => setModal('help')}>
            <CircleHelp size={17} />
            How to play
          </button>
          {!sharedView && (
            <button className={s.notebookButton} onClick={() => setModal('revisions')}>
              <BookOpen size={17} />
              My notebook<span>{revisions.length}</span>
            </button>
          )}
        </div>
      </header>

      <main className={s.main}>
        {!sharedView ? (
          <section className={s.intro}>
            <div>
              <h1>
                Little drawings.
                <br className={s.mobileBreak} />{' '}
                <span>
                  Big adventures.
                  <svg viewBox="0 0 310 13" preserveAspectRatio="none" aria-hidden="true">
                    <path
                      d="M3 9Q120 0 304 6M16 12Q155 5 291 10"
                      fill="none"
                      stroke="#efc84d"
                      strokeWidth="4"
                      strokeLinecap="round"
                    />
                  </svg>
                </span>
              </h1>
              <p>Draw a puzzle. Find your way out. Then ask “what if?”</p>
            </div>
            <button className={s.uploadButton} onClick={() => setModal('photo')}>
              <Camera size={21} />
              <span>
                Start with a sketch<small>Upload or take a photo</small>
              </span>
              <ArrowUp className={s.uploadArrow} size={18} />
            </button>
          </section>
        ) : (
          <section className={s.sharedIntro}>
            <div>
              <span className={s.eyebrow}>An adventure, passed along</span>
              <h1>{active.title}</h1>
              <p>Find the key, find your way. No sign-in needed.</p>
            </div>
            <button
              className={s.secondaryButton}
              disabled={sharedLoading || !!sharedError}
              onClick={() => void forkShared()}
            >
              <Pencil size={17} />
              Make your own version
            </button>
          </section>
        )}

        {sharedError ? (
          <div className={s.emptyState}>
            <FolderOpen size={38} />
            <h2>This adventure couldn’t be opened</h2>
            <p>{sharedError}</p>
            <a className={s.primaryButton} href="/">
              Make a puzzle
            </a>
          </div>
        ) : (
          <div className={`${s.workbench} ${sharedView ? s.sharedWorkbench : ''}`}>
            <section className={s.paper} aria-label="Puzzle workbench">
              <div className={s.paperTop}>
                <div
                  className={s.tabs}
                  role="tablist"
                  aria-label="Puzzle mode"
                  onKeyDown={navigateModeTabs}
                >
                  {(sharedView ? ['play'] : (['play', 'draw', 'remix'] as Mode[])).map((value) => {
                    const item = value as Mode;
                    const Icon = item === 'play' ? Play : item === 'draw' ? Pencil : WandSparkles;
                    return (
                      <button
                        key={item}
                        id={`mode-tab-${item}`}
                        role="tab"
                        aria-selected={mode === item}
                        aria-controls="puzzle-mode-panel"
                        tabIndex={mode === item ? 0 : -1}
                        onClick={() => switchMode(item)}
                        className={mode === item ? s.activeTab : ''}
                      >
                        <Icon size={16} />
                        {item === 'play' ? 'Play' : item === 'draw' ? 'Draw' : 'Remix'}
                        {item === 'draw' && draft && <i />}
                      </button>
                    );
                  })}
                </div>
                <button
                  className={s.iconButton}
                  onClick={() => setModal('help')}
                  aria-label="Puzzle rules"
                >
                  <CircleHelp size={18} />
                </button>
              </div>
              <div
                id="puzzle-mode-panel"
                role="tabpanel"
                aria-labelledby={`mode-tab-${mode}`}
                tabIndex={0}
              >
                <div className={s.boardHeading}>
                  <div>
                    <div className={s.boardHeadingLine}>
                      {showingDraft ? (
                        <>
                          <h2 className="sr-only">
                            Edit puzzle: {draftTitle || 'Untitled adventure'}
                          </h2>
                          <input
                            className={s.titleInput}
                            aria-label="Puzzle title"
                            value={draftTitle}
                            maxLength={80}
                            onChange={(e) => {
                              invalidateAI();
                              setDraftTitle(e.target.value);
                            }}
                          />
                        </>
                      ) : (
                        <h2>{active.title}</h2>
                      )}
                      <span className={showingDraft ? s.proposedPill : s.currentPill}>
                        {showingDraft ? (review ? 'Proposed' : 'Draft') : 'Current'}
                      </span>
                    </div>
                    <p>
                      {board.width} × {board.height} grid<span>·</span>
                      {showingDraft ? 'Make it your own' : 'A small puzzle with a way through'}
                    </p>
                  </div>
                  {mode === 'play' && (
                    <div className={s.counters}>
                      <div>
                        <strong>{movesCount}</strong>
                        <span>moves</span>
                      </div>
                      <div>
                        <strong>{pushesCount}</strong>
                        <span>pushes</span>
                      </div>
                    </div>
                  )}
                </div>
                <div className={s.boardArea}>
                  {sharedLoading ? (
                    <div className={s.loadingBoard}>
                      <LoaderCircle className={s.spin} />
                      <p>Opening your adventure…</p>
                    </div>
                  ) : (
                    <Board
                      board={board}
                      state={gameState}
                      editable={mode !== 'play'}
                      changes={differences}
                      uncertain={showingDraft ? review?.uncertain : []}
                      extraPlayers={showingDraft ? review?.extraPlayers : []}
                      selected={selectedCells}
                      onCell={mode !== 'play' ? paint : undefined}
                      won={won}
                      label={showingDraft ? 'Proposed puzzle board' : 'Current puzzle board'}
                    />
                  )}
                </div>
                {mode === 'play' ? (
                  <>
                    {playback ? (
                      <div className={s.playback}>
                        <span>
                          <Play size={14} />
                          Solution replay
                        </span>
                        <div>
                          <button
                            className={s.iconButton}
                            aria-label="Previous solution step"
                            disabled={playback.cursor === 0}
                            onClick={() =>
                              setPlayback({
                                ...playback,
                                cursor: playback.cursor - 1,
                                running: false,
                              })
                            }
                          >
                            <SkipBack size={18} />
                          </button>
                          <button
                            className={s.playbackPlay}
                            aria-label={playback.running ? 'Pause solution' : 'Play solution'}
                            onClick={() =>
                              setPlayback({
                                ...playback,
                                cursor:
                                  playback.cursor === playback.moves.length ? 0 : playback.cursor,
                                running: !playback.running,
                              })
                            }
                          >
                            {playback.running ? <Pause size={18} /> : <Play size={18} />}
                          </button>
                          <button
                            className={s.iconButton}
                            aria-label="Next solution step"
                            disabled={playback.cursor === playback.moves.length}
                            onClick={() =>
                              setPlayback({
                                ...playback,
                                cursor: playback.cursor + 1,
                                running: false,
                              })
                            }
                          >
                            <SkipForward size={18} />
                          </button>
                          <strong>
                            {playback.cursor} / {playback.moves.length}
                          </strong>
                          <select
                            aria-label="Playback speed"
                            value={speed}
                            onChange={(e) => setSpeed(Number(e.target.value))}
                          >
                            <option value={750}>Slow</option>
                            <option value={450}>Normal</option>
                            <option value={180}>Fast</option>
                          </select>
                          <button
                            className={s.iconButton}
                            onClick={() => setPlayback(null)}
                            aria-label="Exit solution replay"
                          >
                            <X size={17} />
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div className={s.playControls}>
                        <div className={s.keyboardTip}>
                          <Keyboard size={18} />
                          <span>
                            Arrow keys or <kbd>W</kbd>
                            <kbd>A</kbd>
                            <kbd>S</kbd>
                            <kbd>D</kbd>
                          </span>
                        </div>
                        <div className={s.dpad} aria-label="Touch movement controls">
                          {(['left', 'up', 'down', 'right'] as Direction[]).map((dir) => {
                            const Icon = DIRECTION_ICON[dir];
                            return (
                              <button
                                key={dir}
                                onClick={() => move(dir)}
                                aria-label={`Move ${dir}`}
                                disabled={won}
                              >
                                <Icon size={20} />
                              </button>
                            );
                          })}
                        </div>
                        <button className={s.textButton} onClick={restart}>
                          <RotateCcw size={16} />
                          Restart
                        </button>
                      </div>
                    )}
                    {won && (
                      <div className={s.winMessage}>
                        <Flag size={18} />
                        <strong>Found your way!</strong>
                        <span>
                          {playback
                            ? 'Every step checked by the game rules.'
                            : `${ownRun.moves} moves, ${ownRun.pushes} pushes. Ready for another twist?`}
                        </span>
                      </div>
                    )}
                  </>
                ) : (
                  <div className={s.editorBottom}>
                    <div className={s.editActions}>
                      <button
                        className={s.iconButton}
                        aria-label="Undo edit"
                        disabled={editCursor <= 0}
                        onClick={() => undoEdit(-1)}
                      >
                        <Undo2 size={18} />
                      </button>
                      <button
                        className={s.iconButton}
                        aria-label="Redo edit"
                        disabled={editCursor >= editHistory.length - 1}
                        onClick={() => undoEdit(1)}
                      >
                        <Redo2 size={18} />
                      </button>
                      <span>
                        {differences.length} changed {differences.length === 1 ? 'cell' : 'cells'}
                      </span>
                    </div>
                    <span className={s.editorHint}>
                      {mode === 'remix'
                        ? review && showingDraft
                          ? 'Outlined cells are proposed changes'
                          : 'Tap a cell to give your request context'
                        : 'Pick a symbol. Tap a square.'}
                    </span>
                  </div>
                )}
                <div className={s.paperFooter}>
                  <span className={s.saveStatus}>
                    <CheckCheck size={14} />
                    {sharedView ? 'Shared puzzle · original photo stays private' : saveLabel}
                  </span>
                  {!sharedView && (
                    <button
                      className={s.textButton}
                      onClick={() =>
                        downloadJson('sketchquest-puzzle.json', {
                          title: showingDraft ? draftTitle : active.title,
                          board,
                        })
                      }
                    >
                      <Download size={14} />
                      <span>Export</span>
                    </button>
                  )}
                </div>
              </div>
            </section>

            <aside className={s.sidebar} aria-label="Puzzle tools">
              {mode === 'play' && (
                <>
                  <div className={s.mission}>
                    <span className={s.missionIcon}>
                      <Flag size={22} />
                    </span>
                    <div>
                      <h3>Your little quest</h3>
                      <p>
                        Reach the green exit. Pick up the key to unlock the door. Crates can be
                        pushed, one at a time.
                      </p>
                    </div>
                    <div className={s.missionPath} aria-hidden="true">
                      <span>
                        <Piece kind="player" />
                      </span>
                      <i />
                      <span>
                        <Piece kind="key" />
                      </span>
                      <i />
                      <span>
                        <Piece kind="exit" />
                      </span>
                    </div>
                  </div>
                  <div className={s.solverCard}>
                    <div className={s.solverHeading}>
                      {solving ? (
                        <LoaderCircle className={s.spin} size={19} />
                      ) : (
                        <ShieldCheck size={20} />
                      )}
                      <h3>{solverText}</h3>
                      {result?.status === 'solved' && <Check className={s.green} size={17} />}
                    </div>
                    <p>
                      {result?.status === 'solved' ? (
                        <>
                          The shortest way out takes <strong>{result.moves} moves.</strong> Every
                          step has been checked.
                        </>
                      ) : result?.status === 'unsolvable' ? (
                        'Every reachable state was explored. Try moving an obstacle in Draw.'
                      ) : result?.status === 'inconclusive' ? (
                        'This is not proof that the puzzle is impossible. You can run the search again.'
                      ) : (
                        'A complete search checks the puzzle using the same rules you play with.'
                      )}
                    </p>
                    {result?.status === 'solved' ? (
                      <button
                        className={s.secondaryButton}
                        onClick={() =>
                          setPlayback({ moves: result.solution, cursor: 0, running: true })
                        }
                      >
                        <Play size={16} />
                        Watch solution<span>{result.moves} steps</span>
                      </button>
                    ) : solving ? (
                      <button
                        className={s.textButton}
                        onClick={() => {
                          solveAbort.current?.abort();
                          setSolving(false);
                          setVerified({
                            hash,
                            result: {
                              status: 'inconclusive',
                              reason: 'cancelled',
                              stats: { explored: 0, elapsedMs: 0 },
                            },
                          });
                        }}
                      >
                        Cancel search
                      </button>
                    ) : (
                      <button
                        className={s.secondaryButton}
                        disabled={!!issues.length}
                        onClick={() => setSolveRefresh((x) => x + 1)}
                      >
                        Find a solution
                      </button>
                    )}
                    {result && (
                      <details className={s.searchDetails}>
                        <summary>
                          Search details
                          <ChevronDown size={12} />
                        </summary>
                        <p>
                          {result.stats.explored.toLocaleString()} states explored ·{' '}
                          {Math.round(result.stats.elapsedMs)} ms
                          <br />
                          Breadth-first search · 5 s / 250,000 states
                          <br />
                          Shortest moves; pushes are not optimized.
                        </p>
                      </details>
                    )}
                  </div>
                  <div className={s.historyCard}>
                    <div className={s.sectionHeader}>
                      <h3>
                        <History size={16} />
                        Your trail
                      </h3>
                      <span>{session.cursor} moves</span>
                    </div>
                    {session.moves.length ? (
                      <div className={s.moveTrail}>
                        <button
                          onClick={() => {
                            setPlayback(null);
                            setSession({ ...session, cursor: 0 });
                          }}
                          aria-label="Return to starting position"
                          className={session.cursor === 0 ? s.currentMove : ''}
                        >
                          <span>Start</span>
                        </button>
                        {session.moves.slice(0, 150).map((dir, index) => {
                          const Icon = DIRECTION_ICON[dir];
                          return (
                            <button
                              key={index}
                              onClick={() => {
                                setPlayback(null);
                                setSession({ ...session, cursor: index + 1 });
                              }}
                              aria-label={`Go to move ${index + 1}: ${dir}`}
                              className={
                                index + 1 === session.cursor
                                  ? s.currentMove
                                  : index + 1 > session.cursor
                                    ? s.futureMove
                                    : ''
                              }
                            >
                              <Icon size={15} />
                            </button>
                          );
                        })}
                      </div>
                    ) : (
                      <p className={s.muted}>Every adventure begins with one move.</p>
                    )}
                    <div className={s.historyActions}>
                      <button
                        className={s.textButton}
                        disabled={session.cursor === 0}
                        onClick={() => {
                          setPlayback(null);
                          setSession({ ...session, cursor: session.cursor - 1 });
                        }}
                      >
                        <Undo2 size={14} />
                        Step back
                      </button>
                      <button
                        className={s.textButton}
                        disabled={session.cursor === session.moves.length}
                        onClick={() => {
                          setPlayback(null);
                          setSession({ ...session, cursor: session.cursor + 1 });
                        }}
                      >
                        Step forward
                        <Redo2 size={14} />
                      </button>
                    </div>
                  </div>
                  {!sharedView && (
                    <button className={s.remixCta} onClick={() => switchMode('remix')}>
                      <span className={s.remixCtaIcon}>
                        <WandSparkles size={21} />
                      </span>
                      <span>
                        <strong>What if it were a little different?</strong>
                        <small>Change your puzzle with words</small>
                      </span>
                      <ArrowRight size={18} />
                    </button>
                  )}
                </>
              )}

              {mode === 'draw' && (
                <>
                  <div className={s.paletteCard}>
                    <div className={s.sectionHeader}>
                      <h3>Your drawing kit</h3>
                      <span>1–8 shortcuts</span>
                    </div>
                    <div className={s.palette}>
                      {TOOL_INFO.map((item) => (
                        <button
                          key={item.tool}
                          aria-pressed={tool === item.tool}
                          className={tool === item.tool ? s.selectedTool : ''}
                          onClick={() => setTool(item.tool)}
                          title={`${item.label} (${item.shortcut})`}
                        >
                          <span>
                            {item.tool === 'erase' ? (
                              <Eraser size={27} />
                            ) : (
                              <Piece kind={item.tool as 'wall'} />
                            )}
                          </span>
                          {item.label}
                          <small>{item.shortcut}</small>
                        </button>
                      ))}
                    </div>
                    <div className={s.dimensions}>
                      <Maximize2 size={15} />
                      <span>Grid size</span>
                      <label>
                        <span className="sr-only">Grid width</span>
                        <select
                          aria-label="Grid width"
                          value={board.width}
                          onChange={(e) => resizeDraft(Number(e.target.value), board.height)}
                        >
                          {[4, 5, 6, 7, 8].map((n) => (
                            <option key={n}>{n}</option>
                          ))}
                        </select>
                      </label>
                      <span>×</span>
                      <select
                        aria-label="Grid height"
                        value={board.height}
                        onChange={(e) => resizeDraft(board.width, Number(e.target.value))}
                      >
                        {[4, 5, 6, 7, 8].map((n) => (
                          <option key={n}>{n}</option>
                        ))}
                      </select>
                    </div>
                    <p className={s.finePrint}>
                      Player, key, door and exit tools move the existing symbol. Erase removes a
                      piece first, then its terrain.
                    </p>
                  </div>
                  <div className={s.validation}>
                    <h3>
                      {solving ? (
                        <LoaderCircle className={s.spin} size={17} />
                      ) : (
                        <ShieldCheck size={17} />
                      )}{' '}
                      {solverText}
                    </h3>
                    {issues.length ? (
                      <ul>
                        {issues.map((issue, index) => (
                          <li key={index}>{issue.message}</li>
                        ))}
                      </ul>
                    ) : (
                      <p>
                        {result?.status === 'solved'
                          ? `The shortest route is ${result.moves} moves. Your board is ready to play.`
                          : result?.status === 'unsolvable'
                            ? 'This board is valid, but the exit cannot be reached. You can keep editing or save this revision.'
                            : 'Board structure is valid. The solver will check whether there is a way out.'}
                      </p>
                    )}
                  </div>
                </>
              )}

              {mode === 'remix' && !(showingDraft && review) && (
                <div className={s.remixPanel}>
                  <span className={s.sparkleMark}>
                    <WandSparkles size={24} />
                  </span>
                  <h3>A new twist, in your words.</h3>
                  <p>
                    Tell your puzzle what to become. You’ll see every change before it becomes real.
                  </p>
                  <label className={s.promptLabel} htmlFor="change-request">
                    What would you change?
                  </label>
                  <textarea
                    id="change-request"
                    value={prompt}
                    maxLength={600}
                    onChange={(e) => setPrompt(e.target.value)}
                    placeholder="Make the shortest solution longer…"
                    rows={4}
                  />
                  {selectedCells.length > 0 && (
                    <div className={s.selectionNote}>
                      <MousePointer2 size={13} />
                      Referring to{' '}
                      {selectedCells.map((c) => coord(c, active.board.width)).join(', ')}
                      <button
                        className={s.iconButton}
                        onClick={() => setSelectedCells([])}
                        aria-label="Clear selected cells"
                      >
                        <X size={13} />
                      </button>
                    </div>
                  )}
                  <div className={s.promptChips}>
                    {[
                      'Make the shortest solution longer',
                      'Add a crate',
                      'Remove this obstacle',
                    ].map((text) => (
                      <button key={text} onClick={() => setPrompt(text)}>
                        {text}
                      </button>
                    ))}
                  </div>
                  <button
                    className={s.primaryButton}
                    disabled={!services.aiEnabled || aiBusy || !prompt.trim()}
                    onClick={() => void propose()}
                  >
                    {aiBusy ? (
                      <LoaderCircle className={s.spin} size={17} />
                    ) : (
                      <WandSparkles size={17} />
                    )}
                    Propose a change
                  </button>
                  {aiBusy && (
                    <div className={s.aiProgress} role="status">
                      <span>{aiProgress}</span>
                      <button onClick={invalidateAI}>Cancel</button>
                    </div>
                  )}
                  {!services.aiEnabled && (
                    <div className={s.connectionNote}>
                      <p>
                        Live AI isn’t connected here yet. You can draw any change yourself, or
                        explore a prepared example.
                      </p>
                      {activeHash === boardHash(EXAMPLES[0].board) ? (
                        <button
                          className={s.textButton}
                          disabled={aiBusy}
                          onClick={() => void propose(true)}
                        >
                          Try a prepared change
                          <ArrowRight size={14} />
                        </button>
                      ) : (
                        <button className={s.textButton} onClick={() => chooseExample(0)}>
                          Open the prepared example
                          <ArrowRight size={14} />
                        </button>
                      )}
                    </div>
                  )}
                  <div className={s.proofPromise}>
                    <ShieldCheck size={15} />
                    <span>Every accepted AI edit gets a verified solution.</span>
                  </div>
                </div>
              )}

              {showingDraft && (
                <div className={s.reviewPanel}>
                  <div className={s.sectionHeader}>
                    <h3>{review ? 'Review the proposal' : 'Ready for a test run?'}</h3>
                    {review?.prepared && <span>Prepared example</span>}
                  </div>
                  {review && (
                    <>
                      <p>{review.explanation}</p>
                      {review.source === 'text' &&
                        review.baselineMoves != null &&
                        result?.status === 'solved' && (
                          <div className={s.comparison}>
                            <ShieldCheck size={18} />
                            <div>
                              <small>Shortest solution</small>
                              <strong>
                                {review.baselineMoves} → {result.moves} moves
                              </strong>
                            </div>
                          </div>
                        )}
                      {sourcePreview && (
                        <img
                          className={s.sourcePreview}
                          src={sourcePreview}
                          alt="Your prepared sketch, kept private"
                        />
                      )}
                      {review.notes.length > 0 && (
                        <ul className={s.reviewNotes}>
                          {review.notes.map((note, i) => (
                            <li key={i}>{note}</li>
                          ))}
                        </ul>
                      )}
                      {review.uncertain.length > 0 && (
                        <div className={s.uncertainNotice}>
                          <strong>
                            {review.uncertain.length}{' '}
                            {review.uncertain.length === 1 ? 'cell needs' : 'cells need'} a second
                            look
                          </strong>
                          <p>
                            Edit the amber cells, or confirm that their symbols are correct. These
                            are model suggestions, not calibrated confidence scores.
                          </p>
                          <button
                            className={s.secondaryButton}
                            disabled={review.extraPlayers.length > 0}
                            onClick={() => setReview({ ...review, uncertain: [] })}
                          >
                            <Check size={15} />I checked these cells
                          </button>
                        </div>
                      )}
                      {differences.length > 0 && (
                        <details className={s.diffDetails}>
                          <summary>
                            {differences.length} changed{' '}
                            {differences.length === 1 ? 'cell' : 'cells'}
                            <ChevronDown size={13} />
                          </summary>
                          <ul>
                            {differences.map((cell) => (
                              <li key={cell}>
                                <strong>{coord(cell, board.width)}</strong>{' '}
                                {cellDescription(active.board, cell)} <ArrowRight size={12} />{' '}
                                {cellDescription(board, cell)}
                              </li>
                            ))}
                          </ul>
                        </details>
                      )}
                    </>
                  )}
                  <button
                    className={s.primaryButton}
                    onClick={acceptBoard}
                    disabled={
                      issues.length > 0 ||
                      !!review?.uncertain.length ||
                      !!review?.extraPlayers.length ||
                      (review?.source === 'text' && result?.status !== 'solved')
                    }
                  >
                    <Check size={17} />
                    {review ? 'Accept & play' : 'Apply board & play'}
                  </button>
                  <div className={s.reviewActions}>
                    {mode !== 'draw' && (
                      <button className={s.textButton} onClick={() => switchMode('draw')}>
                        <Pencil size={14} />
                        Adjust by hand
                      </button>
                    )}
                    <button className={s.textButton} onClick={discardDraft}>
                      Keep current puzzle
                    </button>
                  </div>
                  <p className={s.finePrint}>
                    Starts a fresh play session. The previous revision stays in your notebook.
                  </p>
                </div>
              )}
            </aside>
          </div>
        )}

        {notice && (
          <div className={s.notice} role="status">
            <span>{notice}</span>
            <button
              className={s.iconButton}
              aria-label="Dismiss message"
              onClick={() => setNotice('')}
            >
              <X size={16} />
            </button>
          </div>
        )}
        {!sharedView && (
          <section className={s.bottomBar}>
            <div className={s.moreWays}>
              <span>Every puzzle starts somewhere.</span>
              <button className={s.textButton} onClick={() => setModal('examples')}>
                <FolderOpen size={16} />
                Try an example
              </button>
              <button className={s.textButton} onClick={newDraft}>
                <Plus size={16} />
                Blank canvas
              </button>
              <button className={s.textButton} onClick={() => fileInput.current?.click()}>
                <Upload size={16} />
                Import
              </button>
              <input
                ref={fileInput}
                hidden
                type="file"
                accept=".json,application/json"
                onChange={(e) => {
                  void importBoard(e.target.files?.[0]);
                  e.target.value = '';
                }}
              />
            </div>
            <button
              className={s.shareButton}
              disabled={shareBusy || !services.sharingEnabled}
              onClick={() => void share()}
            >
              {shareBusy ? <LoaderCircle className={s.spin} size={16} /> : <Share2 size={16} />}
              Share current puzzle
            </button>
          </section>
        )}
        {!sharedView && (
          <section className={s.explainer}>
            <div>
              <span className={s.stepNumber}>1</span>
              <span>
                <strong>Sketch something</strong>
                <small>A photo, a doodle, a blank page.</small>
              </span>
            </div>
            <ChevronRight className={s.stepArrow} size={18} />
            <div>
              <span className={s.stepNumber}>2</span>
              <span>
                <strong>Find your way</strong>
                <small>A tiny world. A real puzzle.</small>
              </span>
            </div>
            <ChevronRight className={s.stepArrow} size={18} />
            <div>
              <span className={s.stepNumber}>3</span>
              <span>
                <strong>Make it a “what if”</strong>
                <small>Change it. Check it. Pass it on.</small>
              </span>
            </div>
            <svg className={s.doodleArrow} viewBox="0 0 100 70" aria-hidden="true">
              <path
                d="M6 18c40-25 84 25 57 37-23 10-14-20 26-28m-8-8 10 8-10 10"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
              />
            </svg>
          </section>
        )}
      </main>
      <footer className={s.footer}>
        <span>A small playground for big ideas.</span>
        <span>
          Made with imagination & a little graph theory<span className={s.footerDot}>·</span>
          <a href="https://www.llama.com/" target="_blank" rel="noreferrer">
            Built with Llama
          </a>
        </span>
      </footer>

      {modal === 'photo' && (
        <Dialog title="A sketch becomes a quest" wide header={false} onClose={() => setModal(null)}>
          <PhotoImport
            aiEnabled={services.aiEnabled}
            onResult={photoResult}
            onClose={() => setModal(null)}
          />
        </Dialog>
      )}
      {modal === 'examples' && (
        <Dialog title="Pick a little adventure" wide onClose={() => setModal(null)}>
          <p className={s.dialogIntro}>
            Three original puzzles. Every one checked with the same rules you play.
          </p>
          <div className={s.exampleGrid}>
            {EXAMPLES.map((example, index) => (
              <button key={example.id} className={s.example} onClick={() => chooseExample(index)}>
                <Board board={example.board} miniature />
                <h3>{example.title}</h3>
                <p>{example.description}</p>
                <span>
                  Play this puzzle
                  <ArrowRight size={15} />
                </span>
              </button>
            ))}
          </div>
        </Dialog>
      )}
      {modal === 'revisions' && (
        <Dialog title="Your puzzle notebook" onClose={() => setModal(null)}>
          <p className={s.dialogIntro}>
            Every accepted board has its own page. Restoring makes a fresh revision.
          </p>
          <div className={s.revisionList}>
            {parkedDrafts.map((parked, index) => (
              <div className={s.revisionRow} key={`draft-${index}`}>
                <span className={s.revisionNumber}>
                  <Pencil size={15} />
                </span>
                <div>
                  <strong>{parked.title}</strong>
                  <small>Unfinished draft · preserved in this browser</small>
                </div>
                <button className={s.textButton} onClick={() => restoreDraft(index)}>
                  Continue draft
                </button>
              </div>
            ))}
            {[...revisions].reverse().map((revision, index) => (
              <div className={s.revisionRow} key={revision.id}>
                <span className={s.revisionNumber}>{revisions.length - index}</span>
                <div>
                  <strong>{revision.title}</strong>
                  <small>
                    {revision.source} ·{' '}
                    {new Date(revision.createdAt).toLocaleString([], {
                      dateStyle: 'medium',
                      timeStyle: 'short',
                    })}
                  </small>
                </div>
                {revision.id === active.id ? (
                  <span className={s.currentPill}>Current</span>
                ) : (
                  <button className={s.textButton} onClick={() => restoreRevision(revision)}>
                    Restore
                  </button>
                )}
              </div>
            ))}
          </div>
        </Dialog>
      )}
      {modal === 'share' && (
        <Dialog title="Pass the adventure along" onClose={() => setModal(null)}>
          <div className={s.sharePreview}>
            <Board board={sharedSnapshot?.board ?? active.board} miniature />
            <h3>{sharedSnapshot?.title ?? active.title}</h3>
            <p>
              This link holds a fixed copy of your puzzle. Your photo and notebook stay private.
            </p>
          </div>
          <div className={s.shareField}>
            <input readOnly aria-label="Shared puzzle link" value={shareUrl} />
            <button
              className={s.primaryButton}
              onClick={() => {
                navigator.clipboard
                  .writeText(shareUrl)
                  .then(() => setNotice('Puzzle link copied.'))
                  .catch(() => setNotice('Select the link and copy it manually.'));
              }}
            >
              <Copy size={16} />
              Copy
            </button>
          </div>
          <a className={s.openShared} href={shareUrl} target="_blank" rel="noreferrer">
            Open shared puzzle
            <ArrowRight size={16} />
          </a>
        </Dialog>
      )}
      {modal === 'help' && (
        <Dialog title="Small world. Simple rules." onClose={() => setModal(null)}>
          <div className={s.rulesList}>
            {[
              ['player', 'This is you', 'Move up, down, left or right. Reach the exit to finish.'],
              ['wall', 'A little roadblock', 'Walls and board edges stop you and your crates.'],
              [
                'crate',
                'Give it a push',
                'Push one crate into a free square. No pulling or pushing two at once.',
              ],
              [
                'key',
                'Keep the key',
                'Stepping onto the key unlocks the door permanently. Crates can cover keys, but cannot collect them.',
              ],
              [
                'door',
                'A locked way through',
                'You and your crates need the key before entering a door.',
              ],
              [
                'exit',
                'Your way home',
                'Only you can finish the quest. A crate on the exit does not win.',
              ],
            ].map(([piece, title, text]) => (
              <div key={piece}>
                <span>
                  <Piece kind={piece as 'player'} />
                </span>
                <div>
                  <h3>{title}</h3>
                  <p>{text}</p>
                </div>
              </div>
            ))}
          </div>
          <p className={s.helpFoot}>
            Use the arrow keys, WASD, or the touch arrows. A push is one move and one push. The
            solver finds the fewest moves, not necessarily the fewest pushes.
          </p>
        </Dialog>
      )}
    </div>
  );
}

function cellDescription(board: BoardDefinition, cell: number) {
  if (cell >= board.terrain.length) return 'outside grid';
  const occupant = board.player === cell ? 'player' : board.crates.includes(cell) ? 'crate' : '';
  return [board.terrain[cell], occupant].filter(Boolean).join(' + ');
}
