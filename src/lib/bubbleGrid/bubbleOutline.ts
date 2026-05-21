import { cellKey } from "./types";

type Point = { x: number; y: number };
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
  for (const [k, n] of Array.from(edgeCount.entries())) {
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

/** Convex vertex on a CCW orthogonal loop (exterior 90° turn — gets a fillet). */
const isConvexLoopCorner = (
  prev: Point,
  curr: Point,
  next: Point
): boolean => {
  const ax = curr.x - prev.x;
  const ay = curr.y - prev.y;
  const bx = next.x - curr.x;
  const by = next.y - curr.y;
  if (ax === 0 && ay === 0) return false;
  if (bx === 0 && by === 0) return false;
  return ax * by - ay * bx > 1e-6;
};

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
  _cellSize: number,
  cornerRadius: number
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

    if (isConvexLoopCorner(prev, curr, next)) {
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

const rectsForComponent = (
  component: Set<string>,
  cellSize: number
): Rect[] =>
  Array.from(component).map((key) => {
    const [col, row] = key.split(",").map(Number);
    return cellRect(col, row, cellSize);
  });

export const getBubbleOutlinePaths = (
  cells: Array<{ col: number; row: number }>,
  cellSize: number
): string[] => {
  if (cells.length === 0) return [];

  const cornerRadius = Math.min(cellSize * 0.31, cellSize * 0.5 - 1);
  const paths: string[] = [];

  for (const component of splitConnectedComponents(cells)) {
    const rects = rectsForComponent(component, cellSize);
    const loop = traceBoundaryFromRects(rects);
    if (!loop) continue;

    const d = buildRoundedPath(loop, cellSize, cornerRadius);
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
