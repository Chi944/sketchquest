import { mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { validateBoard } from '../src/core/board';
import type { BoardDefinition, Terrain } from '../src/core/types';
import { REJECTED_SKETCHES, VALID_SKETCHES } from './fixtures';

const directory = fileURLToPath(new URL('.', import.meta.url));
await mkdir(resolve(directory, 'images'), { recursive: true });

/** Annotation reader is separate from boardFromAscii: expected cells come from the authored tables. */
function annotate(ascii: readonly string[]) {
  const width = ascii[0].length;
  if (ascii.some((row) => row.length !== width))
    throw new Error('Annotation rows must be rectangular.');
  const terrain: Terrain[] = [];
  const players: number[] = [];
  const crates: number[] = [];
  const lookup: Record<string, Terrain> = {
    '.': 'floor',
    '#': 'wall',
    K: 'key',
    D: 'door',
    E: 'exit',
    P: 'floor',
    C: 'floor',
    '@': 'floor',
  };
  for (const [cell, glyph] of [...ascii.join('')].entries()) {
    if (!(glyph in lookup)) throw new Error(`Unknown annotation glyph ${glyph}.`);
    terrain.push(lookup[glyph]);
    if (glyph === 'P' || glyph === '@') players.push(cell);
    if (glyph === 'C' || glyph === '@') crates.push(cell);
  }
  const board: BoardDefinition = {
    schemaVersion: 1,
    rulesVersion: 1,
    width,
    height: ascii.length,
    terrain,
    player: players[0] ?? -1,
    crates,
  };
  const errors = validateBoard(board).map((issue) => issue.code);
  if (players.length > 1) errors.push('multiple_player_glyphs');
  return { board, errors };
}

const palette = {
  ink: '#243852',
  wall: '#657c90',
  crate: '#b47946',
  key: '#bd8f18',
  door: '#816a99',
  player: '#2583a8',
  exit: '#45977c',
};
function symbol(glyph: string): string {
  switch (glyph) {
    case '#':
      return `<path d="M-20 -20 L19 -19 L20 20 L-19 19 Z" fill="${palette.wall}"/><path d="M-17 -11 L15 -10 M-16 0 L17 1 M-16 12 L17 11" stroke="#c7d1d9" stroke-width="2"/>`;
    case 'P':
      return `<g stroke="${palette.player}" fill="none"><circle cy="-9" r="9"/><path d="M-17 19 Q-16 4 0 4 Q16 4 17 19 Z" fill="#dceff5"/></g>`;
    case 'C':
      return `<g stroke="${palette.crate}" fill="#f4e4cf"><path d="M-17 -17 L17 -16 L18 17 L-17 17 Z"/><path d="M-14 -13 L14 13 M13 -13 L-14 13"/></g>`;
    case 'K':
      return `<g stroke="${palette.key}" fill="none" transform="rotate(-25)"><circle cx="-10" r="9"/><path d="M-1 0 L20 0 M12 0 L12 8 M19 0 L19 7"/></g>`;
    case 'D':
      return `<g stroke="${palette.door}" fill="#ede5f3"><path d="M-17 20 L-17 -7 Q-16 -22 0 -22 Q16 -22 17 -7 L17 20 Z"/><rect x="-7" y="-1" width="14" height="12" rx="2"/><path d="M-4 -1 L-4 -6 Q0 -12 4 -6 L4 -1" fill="none"/></g>`;
    case 'E':
      return `<g stroke="${palette.exit}" fill="#d6eee4"><path d="M-15 21 L-15 -21 M-15 -20 L19 -9 L-15 2 Z"/><path d="M-22 21 L-7 21"/></g>`;
    case '@':
      return symbol('C') + symbol('P');
    default:
      return '';
  }
}

function drawing(id: string, ascii: readonly string[], seed: number) {
  const columns = ascii[0].length;
  const rows = ascii.length;
  const grid = 64;
  const margin = 24;
  const width = Math.max(columns * grid + margin * 2, 420);
  const height = rows * grid + margin * 2 + 94;
  let randomState = seed;
  const random = () => {
    randomState = (Math.imul(randomState, 1664525) + 1013904223) >>> 0;
    return randomState / 4294967296;
  };
  const strokes: string[] = [];
  const gridWidth = columns * grid;
  const left = (width - gridWidth) / 2;
  for (let x = 0; x <= columns; x += 1)
    strokes.push(
      `<path d="M${left + x * grid} ${margin} Q${left + x * grid + (random() - 0.5) * 2} ${margin + (rows * grid) / 2} ${left + x * grid} ${margin + rows * grid}"/>`,
    );
  for (let y = 0; y <= rows; y += 1)
    strokes.push(
      `<path d="M${left} ${margin + y * grid} Q${left + gridWidth / 2} ${margin + y * grid + (random() - 0.5) * 2} ${left + gridWidth} ${margin + y * grid}"/>`,
    );
  const glyphs = [...ascii.join('')]
    .map((glyph, cell) => {
      const x = left + ((cell % columns) + 0.5) * grid + (random() - 0.5) * 3;
      const y = margin + (Math.floor(cell / columns) + 0.5) * grid + (random() - 0.5) * 3;
      return `<g transform="translate(${x.toFixed(2)} ${y.toFixed(2)}) rotate(${((random() - 0.5) * 5).toFixed(2)})">${symbol(glyph)}</g>`;
    })
    .join('');
  const legend = [
    ['#', 'wall'],
    ['P', 'player'],
    ['C', 'crate'],
    ['K', 'key'],
    ['D', 'door'],
    ['E', 'exit'],
  ]
    .map(
      ([glyph, title], index) =>
        `<g transform="translate(${(width * (index + 0.5)) / 6} ${height - 50})"><g transform="scale(.42)">${symbol(glyph)}</g><text y="27" text-anchor="middle" fill="${palette.ink}" stroke="none" font-family="sans-serif" font-size="11">${title}</text></g>`,
    )
    .join('');
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}"><title>Synthetic authored vector sketch: ${id}</title><desc>Original procedural illustration, not human handwriting or a photograph.</desc><rect width="100%" height="100%" fill="#fffdf8"/><g fill="none" stroke="#d3d8db" stroke-width="1.4">${strokes.join('')}</g><g stroke="${palette.ink}" stroke-width="3" stroke-linecap="round" stroke-linejoin="round">${glyphs}${legend}</g></svg>\n`;
}

const samples = [];
const content = new Set<string>();
const tables: string[] = [
  '# Independently authored annotation tables',
  '',
  '**SYNTHETIC authored vector sketches. These are not human handwriting or photographs.**',
  '',
  'Legend: `.` floor, `#` wall, `P` player, `C` crate, `K` key, `D` locked door, `E` exit, `@` conflicting player + crate.',
  '',
  'Each ASCII cell is the ground-truth annotation. A separate annotation reader maps these tables to board data, then the production validator checks board constraints. This structural check is not an independent human review or evidence of extraction accuracy.',
  '',
];
for (const [index, fixture] of VALID_SKETCHES.entries()) {
  const annotated = annotate(fixture.ascii);
  if (annotated.errors.length) throw new Error(`${fixture.id}: ${annotated.errors.join(', ')}`);
  const identity = JSON.stringify([fixture.ascii[0].length, fixture.ascii]);
  if (content.has(identity)) throw new Error(`Duplicate source board ${fixture.id}.`);
  content.add(identity);
  const path = `images/${fixture.id}.svg`;
  await writeFile(resolve(directory, path), drawing(fixture.id, fixture.ascii, 10_000 + index));
  samples.push({
    id: fixture.id,
    sourceBoardId: fixture.id,
    split: fixture.split,
    kind: 'board',
    image: path,
    ascii: fixture.ascii,
    expectedBoard: annotated.board,
    provenance: {
      kind: 'synthetic-authored-vector',
      rights: 'Original procedural graphics dedicated under CC0-1.0',
    },
  });
  tables.push(
    `## ${fixture.id} (${fixture.split})`,
    '',
    '```text',
    ...fixture.ascii,
    '```',
    '',
    `Validation: ${annotated.errors.length} structural issues.`,
    '',
  );
}
for (const [index, fixture] of REJECTED_SKETCHES.entries()) {
  const annotated = annotate(fixture.ascii);
  if (!annotated.errors.length)
    throw new Error(`Rejection fixture ${fixture.id} unexpectedly passed validation.`);
  const path = `images/${fixture.id}.svg`;
  await writeFile(resolve(directory, path), drawing(fixture.id, fixture.ascii, 20_000 + index));
  samples.push({
    id: fixture.id,
    sourceBoardId: fixture.id,
    split: 'rejection',
    kind: 'rejection',
    image: path,
    ascii: fixture.ascii,
    expectedStatus: 'reject_or_clarify',
    reason: fixture.reason,
    annotationErrors: annotated.errors,
    provenance: {
      kind: 'synthetic-authored-vector',
      rights: 'Original procedural graphics dedicated under CC0-1.0',
    },
  });
  tables.push(
    `## ${fixture.id} (rejection)`,
    '',
    '```text',
    ...fixture.ascii,
    '```',
    '',
    fixture.reason,
    '',
    `Annotation errors: ${annotated.errors.join(', ')}.`,
    '',
  );
}
await writeFile(
  resolve(directory, 'dataset.json'),
  JSON.stringify(
    {
      schemaVersion: 1,
      name: 'SketchQuest synthetic authored vector corpus',
      description:
        '24 distinct source boards: 12 dev, 12 held out; 6 additional rejection fixtures. No model outputs or real handwriting measurements are included.',
      license: 'CC0-1.0',
      samples,
    },
    null,
    2,
  ) + '\n',
);
await writeFile(resolve(directory, 'ANNOTATIONS.md'), tables.join('\n'));
console.log(
  `Wrote ${samples.length} synthetic SVG sketches and annotations. No network or model calls were made.`,
);
