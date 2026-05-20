type Point = { x: number; y: number };

const lerp = (a: Point, b: Point, t: number): Point => ({
  x: a.x + (b.x - a.x) * t,
  y: a.y + (b.y - a.y) * t,
});

/**
 * Extract SVG path strings from a binary mask (marching squares).
 * `values` is row-major; 1 = inside the bubble.
 */
export const contoursFromMask = (
  values: Float32Array,
  width: number,
  height: number,
  cellW: number,
  cellH: number,
  threshold = 0.5
): string[] => {
  const segments: Array<[Point, Point]> = [];

  const sample = (x: number, y: number) => {
    if (x < 0 || y < 0 || x >= width || y >= height) return 0;
    return values[y * width + x];
  };

  for (let y = 0; y < height - 1; y++) {
    for (let x = 0; x < width - 1; x++) {
      const x0 = x * cellW;
      const y0 = y * cellH;
      const x1 = x0 + cellW;
      const y1 = y0 + cellH;

      const tl = sample(x, y);
      const tr = sample(x + 1, y);
      const br = sample(x + 1, y + 1);
      const bl = sample(x, y + 1);

      const tlB = tl >= threshold ? 1 : 0;
      const trB = tr >= threshold ? 1 : 0;
      const brB = br >= threshold ? 1 : 0;
      const blB = bl >= threshold ? 1 : 0;
      const idx = tlB | (trB << 1) | (brB << 2) | (blB << 3);
      if (idx === 0 || idx === 15) continue;

      const topLeft: Point = { x: x0, y: y0 };
      const topRight: Point = { x: x1, y: y0 };
      const bottomRight: Point = { x: x1, y: y1 };
      const bottomLeft: Point = { x: x0, y: y1 };

      const tTop = tl === tr ? 0.5 : (threshold - tl) / (tr - tl);
      const tRight = tr === br ? 0.5 : (threshold - tr) / (br - tr);
      const tBottom = br === bl ? 0.5 : (threshold - br) / (bl - br);
      const tLeft = bl === tl ? 0.5 : (threshold - bl) / (tl - bl);

      const topM = lerp(topLeft, topRight, tTop);
      const rightM = lerp(topRight, bottomRight, tRight);
      const bottomM = lerp(bottomRight, bottomLeft, tBottom);
      const leftM = lerp(bottomLeft, topLeft, tLeft);

      const push = (a: Point, b: Point) => segments.push([a, b]);

      switch (idx) {
        case 1:
          push(leftM, bottomM);
          break;
        case 2:
          push(bottomM, rightM);
          break;
        case 3:
          push(leftM, rightM);
          break;
        case 4:
          push(topM, rightM);
          break;
        case 5:
          push(leftM, topM);
          push(bottomM, rightM);
          break;
        case 6:
          push(topM, bottomM);
          break;
        case 7:
          push(leftM, topM);
          break;
        case 8:
          push(leftM, topM);
          break;
        case 9:
          push(topM, bottomM);
          break;
        case 10:
          push(leftM, bottomM);
          push(topM, rightM);
          break;
        case 11:
          push(topM, rightM);
          break;
        case 12:
          push(leftM, rightM);
          break;
        case 13:
          push(bottomM, rightM);
          break;
        case 14:
          push(leftM, bottomM);
          break;
        default:
          break;
      }
    }
  }

  return joinSegments(segments);
};

const ptKey = (p: Point) => `${p.x.toFixed(2)},${p.y.toFixed(2)}`;

const joinSegments = (segments: Array<[Point, Point]>): string[] => {
  if (segments.length === 0) return [];

  const next = new Map<string, Point[]>();
  for (const [a, b] of segments) {
    const ak = ptKey(a);
    const bk = ptKey(b);
    const la = next.get(ak) ?? [];
    la.push(b);
    next.set(ak, la);
    const lb = next.get(bk) ?? [];
    lb.push(a);
    next.set(bk, lb);
  }

  const used = new Set<string>();
  const paths: string[] = [];

  const segKey = (a: Point, b: Point) => `${ptKey(a)}|${ptKey(b)}`;

  for (const [start, end] of segments) {
    const key = segKey(start, end);
    if (used.has(key)) continue;

    const loop: Point[] = [start];
    used.add(key);
    let prev = start;
    let curr = end;

    for (let guard = 0; guard < segments.length + 4; guard++) {
      loop.push(curr);
      const candidates = (next.get(ptKey(curr)) ?? []).filter(
        (p) => ptKey(p) !== ptKey(prev)
      );
      if (candidates.length === 0) break;

      let found: Point | null = null;
      for (const cand of candidates) {
        const k = segKey(curr, cand);
        if (!used.has(k)) {
          used.add(k);
          found = cand;
          break;
        }
      }

      if (!found) break;
      if (ptKey(found) === ptKey(start) && loop.length > 2) break;

      prev = curr;
      curr = found;
    }

    if (loop.length < 3) continue;
    const d =
      `M ${loop[0].x} ${loop[0].y} ` +
      loop
        .slice(1)
        .map((p) => `L ${p.x} ${p.y}`)
        .join(" ") +
      " Z";
    paths.push(d);
  }

  return paths;
};
