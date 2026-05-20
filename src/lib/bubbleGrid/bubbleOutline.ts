import { getSubCellGap, type BubblePercentOffsets } from "./adjustments";
import { peekNextGrow } from "./gridLogic";
import { BubbleId, BUBBLES, COLS, ROWS, cellKey } from "./types";

type Point = { x: number; y: number };
type GridCell = { col: number; row: number };
type Rect = { x0: number; y0: number; x1: number; y1: number };

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

const cellRect = (col: number, row: number, cellSize: number): Rect => {
  const x0 = col * cellSize;
  const y0 = row * cellSize;
  return { x0, y0, x1: x0 + cellSize, y1: y0 + cellSize };
};

const rectsOverlap = (a: Rect, b: Rect) =>
  !(a.x1 <= b.x0 || a.x0 >= b.x1 || a.y1 <= b.y0 || a.y0 >= b.y1);

/** Strip of `target` cell taken from the side touching `owner` (grow preview). */
const partialGrowRect = (
  owner: GridCell,
  target: GridCell,
  t: number,
  cellSize: number
): Rect | null => {
  const dc = target.col - owner.col;
  const dr = target.row - owner.row;
  const x0 = target.col * cellSize;
  const y0 = target.row * cellSize;
  const x1 = x0 + cellSize;
  const y1 = y0 + cellSize;
  const d = t * cellSize;

  if (dc === 1) return { x0, y0, x1: x0 + d, y1 };
  if (dc === -1) return { x0: x1 - d, y0, x1, y1 };
  if (dr === 1) return { x0, y0, x1, y1: y0 + d };
  if (dr === -1) return { x0, y0: y1 - d, x1, y1 };
  return null;
};

/** `owner` minus the strip that partialGrowRect(from, owner, t) would add (shared-edge shrink). */
const ownerKeepRect = (
  owner: GridCell,
  from: GridCell,
  t: number,
  cellSize: number
): Rect | null => {
  const dc = owner.col - from.col;
  const dr = owner.row - from.row;
  const x0 = owner.col * cellSize;
  const y0 = owner.row * cellSize;
  const x1 = x0 + cellSize;
  const y1 = y0 + cellSize;
  const d = t * cellSize;

  if (dc === 1) return { x0: x0 + d, y0, x1, y1 };
  if (dc === -1) return { x0, y0, x1: x1 - d, y1 };
  if (dr === 1) return { x0, y0: y0 + d, x1, y1 };
  if (dr === -1) return { x0, y0, x1, y1: y1 - d };
  return null;
};

const fractionalGrowGap = (
  grid: Record<string, BubbleId>,
  baseline: Record<string, BubbleId>,
  offsets: BubblePercentOffsets,
  bubbleId: BubbleId,
  focusId?: BubbleId
): number => {
  const gap = getSubCellGap(grid, baseline, offsets, bubbleId, focusId);
  if (gap < 0.008 || gap >= 1 - 1e-6) return 0;
  return Math.min(gap, 1 - 1e-6);
};

type EdgeAdjustment = { from: GridCell; t: number };

/** Other bubbles growing into our cells — shrink the same shared edge by their t. */
const neighborEdgeAdjustments = (
  grid: Record<string, BubbleId>,
  bubbleId: BubbleId,
  baseline: Record<string, BubbleId>,
  offsets: BubblePercentOffsets,
  focusId?: BubbleId
): Map<string, EdgeAdjustment> => {
  const out = new Map<string, EdgeAdjustment>();

  for (const { id: otherId } of BUBBLES) {
    if (otherId === bubbleId) continue;

    const t = fractionalGrowGap(grid, baseline, offsets, otherId, focusId);
    if (t <= 0) continue;

    const move = peekNextGrow(grid, otherId);
    if (!move) continue;

    const invaded = cellKey(move.target.col, move.target.row);
    if (grid[invaded] !== bubbleId) continue;

    const prev = out.get(invaded);
    if (!prev || t > prev.t) out.set(invaded, { from: move.owner, t });
  }

  return out;
};

const edgeKey = (a: Point, b: Point) => {
  const ak = ptKey(a);
  const bk = ptKey(b);
  return ak < bk ? `${ak}|${bk}` : `${bk}|${ak}`;
};

/** Exterior loop of a union of axis-aligned rectangles (orthogonal only). */
const traceBoundaryFromRects = (rects: Rect[]): Point[] | null => {
  if (rects.length === 0) return null;

  const edgeCount = new Map<string, number>();
  const edgeEnds = new Map<string, [Point, Point]>();

  for (const rect of rects) {
    const tl: Point = { x: rect.x0, y: rect.y0 };
    const tr: Point = { x: rect.x1, y: rect.y0 };
    const br: Point = { x: rect.x1, y: rect.y1 };
    const bl: Point = { x: rect.x0, y: rect.y1 };
    const corners = [tl, tr, br, bl];

    for (let i = 0; i < 4; i++) {
      const a = corners[i]!;
      const b = corners[(i + 1) % 4]!;
      const k = edgeKey(a, b);
      edgeCount.set(k, (edgeCount.get(k) ?? 0) + 1);
      edgeEnds.set(k, [a, b]);
    }
  }

  const next = new Map<string, Point>();
  for (const [k, n] of edgeCount) {
    if (n !== 1) continue;
    const [a, b] = edgeEnds.get(k)!;
    const fk = ptKey(a);
    if (!next.has(fk)) next.set(fk, b);
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

const cellFilledFromRects = (rects: Rect[], c: number, r: number, cellSize: number) => {
  const cell = cellRect(c, r, cellSize);
  return rects.some((rect) => rectsOverlap(rect, cell));
};

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

type FractionalPreview = {
  grow?: { owner: GridCell; target: GridCell; t: number };
};

/**
 * Sub-cell grow strip: visual area = discrete cells + gap (continuous target).
 * Only when 0 < gap < 1 (whole extra cells are handled by the grid).
 * Never shrink below owned cells (avoids white gaps).
 */
const getFractionalPreview = (
  grid: Record<string, BubbleId>,
  bubbleId: BubbleId,
  baseline: Record<string, BubbleId>,
  offsets: BubblePercentOffsets,
  focusId?: BubbleId
): FractionalPreview | null => {
  const t = fractionalGrowGap(grid, baseline, offsets, bubbleId, focusId);
  if (t <= 0) return null;

  const move = peekNextGrow(grid, bubbleId);
  if (!move) return null;
  return { grow: { ...move, t } };
};

const rectsForComponent = (
  component: Set<string>,
  cellSize: number,
  preview: FractionalPreview | null,
  edgeAdjust: Map<string, EdgeAdjustment>
): Rect[] => {
  const rects: Rect[] = [];

  for (const key of component) {
    const [col, row] = key.split(",").map(Number);
    const owner: GridCell = { col, row };
    const adj = edgeAdjust.get(key);

    if (adj) {
      const kept = ownerKeepRect(owner, adj.from, adj.t, cellSize);
      if (kept) {
        rects.push(kept);
        continue;
      }
    }

    rects.push(cellRect(col, row, cellSize));
  }

  if (preview?.grow) {
    const strip = partialGrowRect(
      preview.grow.owner,
      preview.grow.target,
      preview.grow.t,
      cellSize
    );
    if (strip) rects.push(strip);
  }

  return rects;
};

export const getBubbleOutlinePaths = (
  grid: Record<string, BubbleId>,
  bubbleId: BubbleId,
  cells: Array<{ col: number; row: number }>,
  cellSize: number,
  baseline?: Record<string, BubbleId>,
  offsets?: BubblePercentOffsets,
  focusId?: BubbleId
): string[] => {
  if (cells.length === 0) return [];

  const preview =
    baseline && offsets
      ? getFractionalPreview(grid, bubbleId, baseline, offsets, focusId)
      : null;

  const edgeAdjust =
    baseline && offsets
      ? neighborEdgeAdjustments(
          grid,
          bubbleId,
          baseline,
          offsets,
          focusId
        )
      : new Map<string, EdgeAdjustment>();

  const cornerRadius = Math.min(cellSize * 0.31, cellSize * 0.5 - 1);
  const paths: string[] = [];

  for (const component of splitConnectedComponents(cells)) {
    const rects = rectsForComponent(
      component,
      cellSize,
      preview,
      edgeAdjust
    );
    const loop = traceBoundaryFromRects(rects);
    if (!loop) continue;

    const filled = (c: number, r: number) => {
      if (c < 0 || c >= COLS || r < 0 || r >= ROWS) return false;
      return cellFilledFromRects(rects, c, r, cellSize);
    };

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
