import { BubbleId, COLS, ROWS, SUBDIVISION, cellKey, parseCellKey } from "./types";

/** Minimum footprint ≈ one logical circle on the coarse grid. */
export const MIN_BUBBLE_CELLS = SUBDIVISION * SUBDIVISION;

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

const compareCandidates = (
  a: { cell: { col: number; row: number }; neighborSize: number },
  b: { cell: { col: number; row: number }; neighborSize: number }
) => a.cell.row - b.cell.row || a.cell.col - b.cell.col;

export const growBubble = (
  grid: Record<string, BubbleId>,
  bubbleId: BubbleId
): Record<string, BubbleId> | null => {
  const boundaryCells = getBubbleCells(grid, bubbleId).filter(({ col, row }) =>
    isBoundaryCell(grid, col, row, bubbleId)
  );

  if (boundaryCells.length === 0) return null;

  type Candidate = {
    cell: { col: number; row: number };
    neighborId: BubbleId;
    neighborSize: number;
  };

  const candidates: Candidate[] = [];

  for (const cell of boundaryCells) {
    for (const [dc, dr] of NEIGHBOR_OFFSETS) {
      const nc = cell.col + dc;
      const nr = cell.row + dr;
      if (nc < 0 || nc >= COLS || nr < 0 || nr >= ROWS) continue;
      const key = cellKey(nc, nr);
      const neighborId = grid[key];
      if (neighborId === bubbleId) continue;

      const neighborSize = countBubbleCells(grid, neighborId);
      if (neighborSize <= MIN_BUBBLE_CELLS) continue;

      if (!isContiguous(grid, neighborId, { col: nc, row: nr })) continue;

      candidates.push({
        cell: { col: nc, row: nr },
        neighborId,
        neighborSize,
      });
    }
  }

  if (candidates.length === 0) return null;

  const minSize = Math.min(...candidates.map((c) => c.neighborSize));
  const eligible = candidates
    .filter((c) => c.neighborSize === minSize)
    .sort(compareCandidates);

  for (const chosen of eligible) {
    const next = { ...grid };
    next[cellKey(chosen.cell.col, chosen.cell.row)] = bubbleId;

    if (
      isContiguous(next, bubbleId) &&
      isContiguous(next, chosen.neighborId)
    ) {
      return next;
    }
  }

  return null;
};

export const shrinkBubble = (
  grid: Record<string, BubbleId>,
  bubbleId: BubbleId
): Record<string, BubbleId> | null => {
  const cells = getBubbleCells(grid, bubbleId);
  if (cells.length <= MIN_BUBBLE_CELLS) return null;

  const boundaryCells = cells.filter(({ col, row }) =>
    isBoundaryCell(grid, col, row, bubbleId)
  );

  if (boundaryCells.length === 0) return null;

  type Candidate = {
    cell: { col: number; row: number };
    neighborId: BubbleId;
    neighborSize: number;
  };

  const candidates: Candidate[] = [];

  for (const cell of boundaryCells) {
    if (!isContiguous(grid, bubbleId, cell)) continue;

    const adjacentNeighbors = new Set<BubbleId>();
    for (const [dc, dr] of NEIGHBOR_OFFSETS) {
      const nc = cell.col + dc;
      const nr = cell.row + dr;
      if (nc < 0 || nc >= COLS || nr < 0 || nr >= ROWS) continue;
      const neighborId = grid[cellKey(nc, nr)];
      if (neighborId !== bubbleId) adjacentNeighbors.add(neighborId);
    }
    for (const neighborId of Array.from(adjacentNeighbors)) {
      candidates.push({
        cell,
        neighborId,
        neighborSize: countBubbleCells(grid, neighborId),
      });
    }
  }

  if (candidates.length === 0) return null;

  const maxSize = Math.max(...candidates.map((c) => c.neighborSize));
  const eligible = candidates
    .filter((c) => c.neighborSize === maxSize)
    .sort(compareCandidates);

  for (const chosen of eligible) {
    const next = { ...grid };
    next[cellKey(chosen.cell.col, chosen.cell.row)] = chosen.neighborId;

    if (isContiguous(next, bubbleId) && isContiguous(next, chosen.neighborId)) {
      return next;
    }
  }

  return null;
};
