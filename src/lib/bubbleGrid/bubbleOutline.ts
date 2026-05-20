import { BubbleId, COLS, ROWS, cellKey } from "./types";

import type { BubblePercentOffsets } from "./adjustments";

type Point = { x: number; y: number };

const ptKey = (p: Point) => `${p.x},${p.y}`;

const parseKey = (key: string): Point => {
  const [x, y] = key.split(",").map(Number);
  return { x, y };
};

const isCollinear = (a: Point, b: Point, c: Point) =>
  (a.x === b.x && b.x === c.x) || (a.y === b.y && b.y === c.y);

const simplifyOrthogonal = (points: Point[]): Point[] => {
  if (points.length < 3) return points;

  const result: Point[] = [];
  const n = points.length;
  for (let i = 0; i < n; i++) {
    const prev = points[(i - 1 + n) % n];
    const curr = points[i];
    const next = points[(i + 1) % n];
    if (!isCollinear(prev, curr, next)) result.push(curr);
  }
  return result.length >= 3 ? result : points;
};

const signedArea = (points: Point[]) => {
  let sum = 0;
  for (let i = 0; i < points.length; i++) {
    const a = points[i];
    const b = points[(i + 1) % points.length];
    sum += a.x * b.y - b.x * a.y;
  }
  return sum / 2;
};

/** Convex exterior corner of a rectilinear blob (one filled quadrant at grid corner). */
const isConvexExteriorCorner = (
  cornerCol: number,
  cornerRow: number,
  filled: (c: number, r: number) => boolean
): boolean => {
  const count = [
    filled(cornerCol, cornerRow),
    filled(cornerCol - 1, cornerRow),
    filled(cornerCol, cornerRow - 1),
    filled(cornerCol - 1, cornerRow - 1),
  ].filter(Boolean).length;
  return count === 1;
};

const cornerGridCoords = (p: Point, cellSize: number) => ({
  col: Math.round(p.x / cellSize),
  row: Math.round(p.y / cellSize),
});

const filletPoints = (
  prev: Point,
  corner: Point,
  next: Point,
  radius: number
): { start: Point; end: Point; r: number; sweep: number } | null => {
  const inDx = corner.x - prev.x;
  const inDy = corner.y - prev.y;
  const outDx = next.x - corner.x;
  const outDy = next.y - corner.y;
  const inLen = Math.hypot(inDx, inDy);
  const outLen = Math.hypot(outDx, outDy);
  if (inLen < 1e-6 || outLen < 1e-6) return null;

  const r = Math.min(radius, inLen / 2 - 0.01, outLen / 2 - 0.01);
  if (r <= 0) return null;

  const cross = inDx * outDy - inDy * outDx;
  return {
    start: {
      x: corner.x - (inDx / inLen) * r,
      y: corner.y - (inDy / inLen) * r,
    },
    end: {
      x: corner.x + (outDx / outLen) * r,
      y: corner.y + (outDy / outLen) * r,
    },
    r,
    sweep: cross > 0 ? 1 : 0,
  };
};

const buildRoundedPath = (
  points: Point[],
  cellSize: number,
  cornerRadius: number,
  filled: (c: number, r: number) => boolean
): string => {
  const n = points.length;
  if (n < 3) return "";

  const parts: string[] = [];
  let pen: Point | null = null;

  const moveOrLine = (p: Point) => {
    if (!pen) parts.push(`M ${p.x} ${p.y}`);
    else if (pen.x !== p.x || pen.y !== p.y) parts.push(`L ${p.x} ${p.y}`);
    pen = p;
  };

  for (let i = 0; i < n; i++) {
    const prev = points[(i - 1 + n) % n];
    const curr = points[i];
    const next = points[(i + 1) % n];
    const { col, row } = cornerGridCoords(curr, cellSize);

    if (isConvexExteriorCorner(col, row, filled)) {
      const fillet = filletPoints(prev, curr, next, cornerRadius);
      if (fillet) {
        moveOrLine(fillet.start);
        parts.push(
          `A ${fillet.r} ${fillet.r} 0 0 ${fillet.sweep} ${fillet.end.x} ${fillet.end.y}`
        );
        pen = fillet.end;
        continue;
      }
    }

    moveOrLine(curr);
  }

  parts.push("Z");
  return parts.join(" ");
};

/** Trace clockwise exterior boundary of a cell set. */
const traceBoundaryLoop = (
  cells: Set<string>,
  cellSize: number
): Point[] | null => {
  const next = new Map<string, Point>();

  const addEdge = (from: Point, to: Point) => {
    const fk = ptKey(from);
    if (next.has(fk)) return;
    next.set(fk, to);
  };

  const has = (c: number, r: number) => cells.has(cellKey(c, r));

  for (const key of Array.from(cells)) {
    const [col, row] = key.split(",").map(Number);
    const x0 = col * cellSize;
    const y0 = row * cellSize;
    const x1 = x0 + cellSize;
    const y1 = y0 + cellSize;

    if (!has(col, row - 1)) addEdge({ x: x0, y: y0 }, { x: x1, y: y0 });
    if (!has(col + 1, row)) addEdge({ x: x1, y: y0 }, { x: x1, y: y1 });
    if (!has(col, row + 1)) addEdge({ x: x1, y: y1 }, { x: x0, y: y1 });
    if (!has(col - 1, row)) addEdge({ x: x0, y: y1 }, { x: x0, y: y0 });
  }

  if (next.size === 0) return null;

  const startKey = next.keys().next().value!;
  const loop: Point[] = [];
  let current = startKey;

  for (let i = 0; i <= next.size; i++) {
    loop.push(parseKey(current));
    const n = next.get(current);
    if (!n) break;
    const nk = ptKey(n);
    if (nk === startKey && loop.length > 2) break;
    current = nk;
  }

  if (loop.length < 3) return null;

  if (signedArea(loop) < 0) loop.reverse();
  return simplifyOrthogonal(loop);
};

const splitConnectedComponents = (
  cells: Array<{ col: number; row: number }>
): Array<Set<string>> => {
  const remaining = new Set(cells.map((c) => cellKey(c.col, c.row)));
  const components: Array<Set<string>> = [];

  while (remaining.size > 0) {
    const start = remaining.values().next().value!;
    const component = new Set<string>();
    const queue = [start];
    remaining.delete(start);

    while (queue.length > 0) {
      const key = queue.pop()!;
      component.add(key);
      const col = Number(key.split(",")[0]);
      const row = Number(key.split(",")[1]);
      for (const [dc, dr] of [
        [0, -1],
        [1, 0],
        [0, 1],
        [-1, 0],
      ] as const) {
        const nk = cellKey(col + dc, row + dr);
        if (remaining.has(nk)) {
          remaining.delete(nk);
          queue.push(nk);
        }
      }
    }
    components.push(component);
  }

  return components;
};

export const getBubbleOutlinePaths = (
  grid: Record<string, BubbleId>,
  bubbleId: BubbleId,
  cells: Array<{ col: number; row: number }>,
  cellSize: number,
  _baseline?: Record<string, BubbleId>,
  _offsets?: BubblePercentOffsets
): string[] => {
  if (cells.length === 0) return [];

  const filled = (c: number, r: number) => {
    if (c < 0 || c >= COLS || r < 0 || r >= ROWS) return false;
    return grid[cellKey(c, r)] === bubbleId;
  };

  const cornerRadius = Math.min(cellSize * 0.31, cellSize * 0.5 - 1);

  const paths: string[] = [];

  for (const component of splitConnectedComponents(cells)) {
    let loop = traceBoundaryLoop(component, cellSize);
    if (!loop) continue;

    const d = buildRoundedPath(loop, cellSize, cornerRadius, filled);
    if (d) paths.push(d);
  }

  return paths;
};

export const getBubbleCentroid = (
  cells: Array<{ col: number; row: number }>,
  cellSize: number
): Point => {
  if (cells.length === 0) return { x: 0, y: 0 };
  let sx = 0;
  let sy = 0;
  for (const { col, row } of cells) {
    sx += (col + 0.5) * cellSize;
    sy += (row + 0.5) * cellSize;
  }
  return { x: sx / cells.length, y: sy / cells.length };
};
