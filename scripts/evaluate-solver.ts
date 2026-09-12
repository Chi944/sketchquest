import process from 'node:process';
import { applyCellEdits, boardFromAscii, emptyBoard } from '../src/core/board';
import { DEMO_LONGER_EDITS, EXAMPLES } from '../src/core/examples';
import { replay } from '../src/core/rules';
import { solve } from '../src/solver/search';

const isolatedExit = emptyBoard(8, 8);
isolatedExit.terrain.fill('floor');
isolatedExit.terrain[0] = 'exit';
isolatedExit.terrain[1] = 'wall';
isolatedExit.terrain[8] = 'wall';
isolatedExit.terrain[63] = 'key';
isolatedExit.crates = [19, 27];

const fixtures = [
  ...EXAMPLES.map((example) => ({ id: example.id, board: example.board })),
  { id: 'prepared-longer-route', board: applyCellEdits(EXAMPLES[0].board, DEMO_LONGER_EDITS) },
  { id: 'disconnected-exit', board: boardFromAscii(['P.#E', '..#.', '..#.', '..#.']) },
  { id: 'open-eight-by-eight', board: { ...emptyBoard(8, 8), crates: [19, 27] } },
  { id: 'crate-blocked-corridor', board: boardFromAscii(['PC#E', '####', '....', '....']) },
  { id: 'open-room-isolated-exit', board: isolatedExit },
];
const maxStates = 250_000;
const maxMs = 5_000;
const results = [];
for (const fixture of fixtures) {
  const result = await solve(fixture.board, { maxStates, maxMs });
  const checked = result.status === 'solved' ? replay(fixture.board, result.solution) : null;
  if (checked && (!checked.valid || !checked.won))
    throw new Error(`Replay failed for ${fixture.id}.`);
  results.push({
    id: fixture.id,
    width: fixture.board.width,
    height: fixture.board.height,
    crates: fixture.board.crates.length,
    ...result,
    replayVerified: checked ? checked.valid && checked.won : null,
  });
}
console.log(
  JSON.stringify(
    {
      evaluationVersion: 1,
      engine: 'breadth-first search, complete state, move-optimal',
      runtime: process.version,
      platform: process.platform,
      architecture: process.arch,
      budgets: { maxStates, maxMs },
      caveat:
        'Runtime varies by machine; these are authored fixtures, not a representative performance distribution.',
      results,
    },
    null,
    2,
  ),
);
