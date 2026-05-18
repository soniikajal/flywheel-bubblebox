import { BubbleId, COLS, ROWS, cellKey, parseCellKey } from "./types";

const NEIGHBOR_OFFSETS = [
  [0, -1],
  [1, 0],
  [0, 1],
  [-1, 0],
];

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
      candidates.push({
        cell: { col: nc, row: nr },
        neighborId,
        neighborSize: countBubbleCells(grid, neighborId),
      });
    }
  }

  if (candidates.length === 0) return null;

  const minSize = Math.min(...candidates.map((c) => c.neighborSize));
  const eligible = candidates.filter((c) => c.neighborSize === minSize);
  eligible.sort((a, b) => a.cell.row - b.cell.row || a.cell.col - b.cell.col);
  const chosen = eligible[0];

  const next = { ...grid };
  next[cellKey(chosen.cell.col, chosen.cell.row)] = bubbleId;
  return next;
};

export const shrinkBubble = (
  grid: Record<string, BubbleId>,
  bubbleId: BubbleId
): Record<string, BubbleId> | null => {
  const cells = getBubbleCells(grid, bubbleId);
  if (cells.length <= 1) return null;

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
  const eligible = candidates.filter((c) => c.neighborSize === maxSize);
  eligible.sort((a, b) => a.cell.row - b.cell.row || a.cell.col - b.cell.col);
  const chosen = eligible[0];

  const next = { ...grid };
  next[cellKey(chosen.cell.col, chosen.cell.row)] = chosen.neighborId;
  return next;
};
