import { z } from 'zod';
import { TERRAINS } from '../src/core/types.js';

export const MIN_GRID = 4;
export const MAX_GRID = 8;
export const gridSize = z.number().int().min(MIN_GRID).max(MAX_GRID);
const terrain = z.enum(TERRAINS);
const occupant = z.enum(['none', 'player', 'crate']);
export const cellEdit = z
  .object({
    cell: z
      .number()
      .int()
      .min(0)
      .max(MAX_GRID * MAX_GRID - 1),
    terrain,
    occupant,
  })
  .strict();

export const interpretationSchema = z
  .object({
    status: z.enum(['interpreted', 'needs_clarification', 'unsupported']),
    width: gridSize.nullable(),
    height: gridSize.nullable(),
    cells: z
      .array(
        cellEdit
          .extend({
            uncertain: z.boolean(),
            alternatives: z.array(z.string().max(80)).max(4),
            note: z.string().max(160),
          })
          .strict(),
      )
      .max(MAX_GRID * MAX_GRID),
    notes: z.array(z.string().max(300)).max(6),
  })
  .strict();

export const modelProposalSchema = z
  .object({
    status: z.enum(['proposed', 'needs_clarification', 'unsupported']),
    objective: z.enum(['longer', 'edit']),
    message: z.string().max(500),
    candidates: z
      .array(
        z
          .object({
            explanation: z.string().max(500),
            edits: z.array(cellEdit).min(1).max(6),
          })
          .strict(),
      )
      .max(3),
  })
  .strict();

export const requestIdSchema = z.uuid();
export const proposalRequestSchema = z
  .object({
    requestId: requestIdSchema,
    baseRevisionId: z.string().min(1).max(100),
    baseHash: z.string().min(1).max(2048),
    board: z.unknown(),
    prompt: z.string().trim().min(1).max(600),
    selectedCells: z
      .array(
        z
          .number()
          .int()
          .min(0)
          .max(MAX_GRID * MAX_GRID - 1),
      )
      .max(MAX_GRID * MAX_GRID),
  })
  .strict();

export const shareRequestSchema = z
  .object({
    board: z.unknown(),
    title: z.string().trim().min(1).max(80),
  })
  .strict();
