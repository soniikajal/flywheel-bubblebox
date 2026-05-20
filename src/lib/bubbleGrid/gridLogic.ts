import { BubbleId, COLS, ROWS, cellKey, parseCellKey } from "./types";

export const MIN_BUBBLE_CELLS = 1;

const NEIGHBOR_OFFSETS = [
  [0, -1],
  [1, 0],
  [0, 1],
  [-1, 0],
] as const;

export const countBubbleCells = (
  grid: Record<string, BubbleId>,
  bubbleId: BubbleId
): number => Object.values(grid).filter((id) => id === bubbleId).length;

export const getBubbleCells = (
  grid: Record<string, BubbleId>,
  bubbleId: BubbleId
): Array<{ col: number; row: number }> =>
  Object.entries(grid)
    .filter(([, id]) => id === bubbleId)
    .map(([key]) => parseCellKey(key));

/** True when all cells of a bubble share one connected component (4-neighbor). */
export const isContiguous = (
  grid: Record<string, BubbleId>,
  bubbleId: BubbleId,
  exclude?: { col: number; row: number }
): boolean => {
  let cells = getBubbleCells(grid, bubbleId);
  if (exclude) {
    cells = cells.filter(
      (c) => !(c.col === exclude.col && c.row === exclude.row)
    );
  }
  if (cells.length <= 1) return true;

  const keys = new Set(cells.map((c) => cellKey(c.col, c.row)));
  const visited = new Set<string>();
  const queue = [cells[0]];

  while (queue.length > 0) {
    const { col, row } = queue.shift()!;
    const key = cellKey(col, row);
    if (visited.has(key)) continue;
    visited.add(key);

    for (const [dc, dr] of NEIGHBOR_OFFSETS) {
      const nk = cellKey(col + dc, row + dr);
      if (keys.has(nk) && !visited.has(nk)) {
        queue.push({ col: col + dc, row: row + dr });
      }
    }
  }

  return visited.size === keys.size;
};

export const canShrinkBubble = (
  grid: Record<string, BubbleId>,
  bubbleId: BubbleId
): boolean => {
  if (countBubbleCells(grid, bubbleId) <= MIN_BUBBLE_CELLS) return false;
  return shrinkBubble(grid, bubbleId) !== null;
};

const isBoundaryCell = (
  grid: Record<string, BubbleId>,
  col: number,
  row: number,
  bubbleId: BubbleId
): boolean => {
  for (const [dc, dr] of NEIGHBOR_OFFSETS) {
    const nc = col + dc;
    const nr = row + dr;
    if (nc < 0 || nc >= COLS || nr < 0 || nr >= ROWS) return true;
    const neighbor = grid[cellKey(nc, nr)];
    if (neighbor !== bubbleId) return true;
  }
  return false;
};

export type GridCell = { col: number; row: number };

export type GrowCandidate = {
  owner: GridCell;
  target: GridCell;
  neighborId: BubbleId;
};

const adjacentSameBubbleCount = (
  grid: Record<string, BubbleId>,
  col: number,
  row: number,
  bubbleId: BubbleId
): number => {
  let n = 0;
  for (const [dc, dr] of NEIGHBOR_OFFSETS) {
    const nc = col + dc;
    const nr = row + dr;
    if (nc < 0 || nc >= COLS || nr < 0 || nr >= ROWS) continue;
    if (grid[cellKey(nc, nr)] === bubbleId) n++;
  }
  return n;
};

/** All valid one-cell expansion moves, stable sort — rotation picks among these. */
export const listGrowCandidates = (
  grid: Record<string, BubbleId>,
  bubbleId: BubbleId
): GrowCandidate[] => {
  const boundaryCells = getBubbleCells(grid, bubbleId).filter(({ col, row }) =>
    isBoundaryCell(grid, col, row, bubbleId)
  );

  if (boundaryCells.length === 0) return [];

  type Candidate = {
    owner: GridCell;
    target: GridCell;
    neighborId: BubbleId;
    neighborSize: number;
  };

  const candidates: Candidate[] = [];

  for (const owner of boundaryCells) {
    for (const [dc, dr] of NEIGHBOR_OFFSETS) {
      const nc = owner.col + dc;
      const nr = owner.row + dr;
      if (nc < 0 || nc >= COLS || nr < 0 || nr >= ROWS) continue;
      const neighborId = grid[cellKey(nc, nr)];
      if (neighborId === bubbleId) continue;

      const neighborSize = countBubbleCells(grid, neighborId);
      if (neighborSize <= MIN_BUBBLE_CELLS) continue;

      if (!isContiguous(grid, neighborId, { col: nc, row: nr })) continue;

      candidates.push({
        owner,
        target: { col: nc, row: nr },
        neighborId,
        neighborSize,
      });
    }
  }

  if (candidates.length === 0) return [];

  const minSize = Math.min(...candidates.map((c) => c.neighborSize));
  const eligible = candidates
    .filter((c) => c.neighborSize === minSize)
    .sort((a, b) => {
      // Prefer cells that touch more of the growing blob — fewer “notches” and diagonal-looking bites.
      const ta = adjacentSameBubbleCount(
        grid,
        a.target.col,
        a.target.row,
        bubbleId
      );
      const tb = adjacentSameBubbleCount(
        grid,
        b.target.col,
        b.target.row,
        bubbleId
      );
      if (tb !== ta) return tb - ta;
      return a.target.row - b.target.row || a.target.col - b.target.col;
    });

  const out: GrowCandidate[] = [];
  for (const chosen of eligible) {
    const next = { ...grid };
    next[cellKey(chosen.target.col, chosen.target.row)] = bubbleId;
    if (isContiguous(next, bubbleId) && isContiguous(next, chosen.neighborId)) {
      out.push({
        owner: chosen.owner,
        target: chosen.target,
        neighborId: chosen.neighborId,
      });
    }
  }

  return out;
};

const findGrowCandidate = (
  grid: Record<string, BubbleId>,
  bubbleId: BubbleId
): GrowCandidate | null => {
  const list = listGrowCandidates(grid, bubbleId);
  return list[0] ?? null;
};

export type ShrinkCandidate = {
  owner: GridCell;
  target: GridCell;
  neighborId: BubbleId;
};

/** All valid one-cell contraction moves — rotation picks among these. */
export const listShrinkCandidates = (
  grid: Record<string, BubbleId>,
  bubbleId: BubbleId
): ShrinkCandidate[] => {
  const cells = getBubbleCells(grid, bubbleId);
  if (cells.length <= MIN_BUBBLE_CELLS) return [];

  const boundaryCells = cells.filter(({ col, row }) =>
    isBoundaryCell(grid, col, row, bubbleId)
  );

  if (boundaryCells.length === 0) return [];

  type Candidate = {
    owner: GridCell;
    target: GridCell;
    neighborId: BubbleId;
    neighborSize: number;
  };

  const candidates: Candidate[] = [];

  for (const owner of boundaryCells) {
    if (!isContiguous(grid, bubbleId, owner)) continue;

    const adjacentNeighbors = new Set<BubbleId>();
    for (const [dc, dr] of NEIGHBOR_OFFSETS) {
      const nc = owner.col + dc;
      const nr = owner.row + dr;
      if (nc < 0 || nc >= COLS || nr < 0 || nr >= ROWS) continue;
      const neighborId = grid[cellKey(nc, nr)];
      if (neighborId !== bubbleId) adjacentNeighbors.add(neighborId);
    }

    for (const neighborId of Array.from(adjacentNeighbors)) {
      for (const [dc, dr] of NEIGHBOR_OFFSETS) {
        const nc = owner.col + dc;
        const nr = owner.row + dr;
        if (grid[cellKey(nc, nr)] !== neighborId) continue;
        candidates.push({
          owner,
          target: { col: nc, row: nr },
          neighborId,
          neighborSize: countBubbleCells(grid, neighborId),
        });
      }
    }
  }

  if (candidates.length === 0) return [];

  const maxSize = Math.max(...candidates.map((c) => c.neighborSize));
  const eligible = candidates
    .filter((c) => c.neighborSize === maxSize)
    .sort((a, b) => {
      // Remove “tips” first (fewer same-color neighbors) so the blob stays compact when shrinking.
      const sa = adjacentSameBubbleCount(
        grid,
        a.owner.col,
        a.owner.row,
        bubbleId
      );
      const sb = adjacentSameBubbleCount(
        grid,
        b.owner.col,
        b.owner.row,
        bubbleId
      );
      if (sa !== sb) return sa - sb;
      return a.owner.row - b.owner.row || a.owner.col - b.owner.col;
    });

  const out: ShrinkCandidate[] = [];
  for (const chosen of eligible) {
    const next = { ...grid };
    next[cellKey(chosen.owner.col, chosen.owner.row)] = chosen.neighborId;
    if (isContiguous(next, bubbleId) && isContiguous(next, chosen.neighborId)) {
      out.push({
        owner: chosen.owner,
        target: chosen.target,
        neighborId: chosen.neighborId,
      });
    }
  }

  return out;
};

const findShrinkCandidate = (
  grid: Record<string, BubbleId>,
  bubbleId: BubbleId
): ShrinkCandidate | null => {
  const list = listShrinkCandidates(grid, bubbleId);
  return list[0] ?? null;
};

/** Next cell this bubble would take on grow (for fractional edge preview). */
export const peekNextGrow = (
  grid: Record<string, BubbleId>,
  bubbleId: BubbleId
): { owner: GridCell; target: GridCell } | null => {
  const c = findGrowCandidate(grid, bubbleId);
  return c ? { owner: c.owner, target: c.target } : null;
};

/** Next cell this bubble would lose on shrink (for fractional edge preview). */
export const peekNextShrink = (
  grid: Record<string, BubbleId>,
  bubbleId: BubbleId
): { owner: GridCell; target: GridCell } | null => {
  const c = findShrinkCandidate(grid, bubbleId);
  return c ? { owner: c.owner, target: c.target } : null;
};

export const peekNextShrinkWithReceiver = (
  grid: Record<string, BubbleId>,
  bubbleId: BubbleId
): { owner: GridCell; target: GridCell; receiverId: BubbleId } | null => {
  const c = findShrinkCandidate(grid, bubbleId);
  return c
    ? { owner: c.owner, target: c.target, receiverId: c.neighborId }
    : null;
};

/** Our cell that shares an edge with `cell` (for complementary boundary motion). */
export const findAdjacentOwnedCell = (
  grid: Record<string, BubbleId>,
  bubbleId: BubbleId,
  cell: GridCell
): GridCell | null => {
  for (const [dc, dr] of NEIGHBOR_OFFSETS) {
    const nc = cell.col + dc;
    const nr = cell.row + dr;
    if (nc < 0 || nc >= COLS || nr < 0 || nr >= ROWS) continue;
    if (grid[cellKey(nc, nr)] === bubbleId) return { col: nc, row: nr };
  }
  return null;
};

export const growBubble = (
  grid: Record<string, BubbleId>,
  bubbleId: BubbleId
): Record<string, BubbleId> | null => {
  const chosen = findGrowCandidate(grid, bubbleId);
  if (!chosen) return null;

  const next = { ...grid };
  next[cellKey(chosen.target.col, chosen.target.row)] = bubbleId;
  return next;
};

export const shrinkBubble = (
  grid: Record<string, BubbleId>,
  bubbleId: BubbleId
): Record<string, BubbleId> | null => {
  const chosen = findShrinkCandidate(grid, bubbleId);
  if (!chosen) return null;

  const next = { ...grid };
  next[cellKey(chosen.owner.col, chosen.owner.row)] = chosen.neighborId;
  return next;
};
