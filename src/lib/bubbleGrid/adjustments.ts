import {
  countBubbleCells,
  growBubble,
  listGrowCandidates,
  listShrinkCandidates,
  shrinkBubble,
  type GrowCandidate,
  type ShrinkCandidate,
  MIN_BUBBLE_CELLS,
} from "./gridLogic";
import { BubbleId, BUBBLES, COLS, ROWS, cellKey } from "./types";

/** Percent change from initial layout, e.g. 20 = 20% larger than baseline. */
export type BubblePercentOffsets = Partial<Record<BubbleId, number>>;

const BUBBLE_IDS = new Set<BubbleId>(BUBBLES.map((b) => b.id));
const TOTAL_CELLS = COLS * ROWS;
const MAX_STEPS = TOTAL_CELLS * 8;

const ALIASES: Record<string, BubbleId> = {
  orange: "orange",
  red: "orange",
  yellow: "yellow",
  blue: "blue",
  purple: "purple",
  green: "green",
};

export const parseBubbleOffsets = (
  raw: Record<string, number>
): BubblePercentOffsets => {
  const result: BubblePercentOffsets = {};
  for (const [key, percent] of Object.entries(raw)) {
    const id = ALIASES[key.toLowerCase()] ?? (key as BubbleId);
    if (!BUBBLE_IDS.has(id)) continue;
    if (!Number.isFinite(percent) || percent === 0) continue;
    result[id] = percent;
  }
  return result;
};

export const getBaselineCellCounts = (
  baseline: Record<string, BubbleId>
): Record<BubbleId, number> =>
  BUBBLES.reduce(
    (acc, { id }) => {
      acc[id] = countBubbleCells(baseline, id);
      return acc;
    },
    {} as Record<BubbleId, number>
  );

/**
 * When one bubble gains `delta` %, spread −delta across others by baseline share
 * so the offset budget stays zero-sum.
 */
export const redistributeOffsets = (
  offsets: BubblePercentOffsets,
  bubbleId: BubbleId,
  delta: number,
  baselineCounts: Record<BubbleId, number>
): BubblePercentOffsets => {
  const next: BubblePercentOffsets = { ...offsets };
  const updated = (next[bubbleId] ?? 0) + delta;

  if (Math.abs(updated) < 0.001) delete next[bubbleId];
  else next[bubbleId] = Math.round(updated * 10) / 10;

  const others = BUBBLES.filter((b) => b.id !== bubbleId);
  const baseSum = others.reduce((s, b) => s + baselineCounts[b.id], 0);

  if (baseSum <= 0) return next;

  let assigned = 0;
  others.forEach((b, i) => {
    const isLast = i === others.length - 1;
    const share = baselineCounts[b.id] / baseSum;
    const deduction = isLast ? delta - assigned : delta * share;
    assigned += deduction;

    const v = (next[b.id] ?? 0) - deduction;
    if (Math.abs(v) < 0.001) delete next[b.id];
    else next[b.id] = Math.round(v * 10) / 10;
  });

  return next;
};

/** Effective % area change from actual cell count vs baseline. */
export const getEffectivePercent = (
  grid: Record<string, BubbleId>,
  baseline: Record<string, BubbleId>,
  bubbleId: BubbleId
): number => {
  const base = countBubbleCells(baseline, bubbleId);
  if (base <= 0) return 0;
  const actual = countBubbleCells(grid, bubbleId);
  return ((actual / base) - 1) * 100;
};

/** Largest-remainder apportionment so targets sum to `total`. */
const apportionInteger = (total: number, weights: number[]): number[] => {
  const sum = weights.reduce((a, b) => a + b, 0);
  if (sum <= 0) {
    const even = Math.floor(total / weights.length);
    const out = weights.map(() => even);
    for (let i = 0; i < total - even * weights.length; i++) out[i]++;
    return out;
  }

  const exact = weights.map((w) => (w / sum) * total);
  const floors = exact.map((e) => Math.floor(e));
  const remaining = total - floors.reduce((a, b) => a + b, 0);
  const order = exact
    .map((e, i) => ({ i, remainder: e - floors[i] }))
    .sort((a, b) => b.remainder - a.remainder);

  const result = [...floors];
  for (let k = 0; k < remaining; k++) {
    result[order[k % order.length].i]++;
  }
  return result;
};

const enforceMinAndTotal = (
  targets: number[],
  total: number,
  min: number
): number[] => {
  const t = [...targets];

  for (let i = 0; i < t.length; i++) {
    if (t[i] < min) t[i] = min;
  }

  let sum = t.reduce((a, b) => a + b, 0);

  while (sum > total) {
    const idx = t.reduce(
      (best, n, i) => (n > t[best] && n > min ? i : best),
      0
    );
    if (t[idx] <= min) break;
    t[idx]--;
    sum--;
  }

  while (sum < total) {
    const idx = t.indexOf(Math.min(...t));
    t[idx]++;
    sum++;
  }

  return t;
};

/**
 * Zero-sum cell targets from continuous area shares (largest-remainder apportion).
 * Focus bubble is capped at floor(exact area) so extra growth shows as a sub-cell strip.
 */
export const computeZeroSumTargets = (
  baseline: Record<string, BubbleId>,
  offsets: BubblePercentOffsets,
  focusId?: BubbleId
): Record<BubbleId, number> => {
  const baselineCounts = getBaselineCellCounts(baseline);
  const exact = BUBBLES.map(({ id }) =>
    getContinuousZeroSumCount(baseline, offsets, id)
  );
  const targets = apportionInteger(TOTAL_CELLS, exact);

  if (focusId && (offsets[focusId] ?? 0) > 0.001) {
    const fi = BUBBLES.findIndex((b) => b.id === focusId);
    const focusExact =
      baselineCounts[focusId] * (1 + (offsets[focusId] ?? 0) / 100);
    const cap = Math.max(MIN_BUBBLE_CELLS, Math.floor(focusExact));
    if (targets[fi]! > cap) {
      let spare = targets[fi]! - cap;
      targets[fi]! = cap;
      const receivers = BUBBLES.map((b, i) => ({ i, w: exact[i]! }))
        .filter((r) => r.i !== fi)
        .sort((a, b) => b.w - a.w);
      for (const r of receivers) {
        if (spare <= 0) break;
        targets[r.i]!++;
        spare--;
      }
    }
  }

  const balanced = enforceMinAndTotal(targets, TOTAL_CELLS, MIN_BUBBLE_CELLS);

  return BUBBLES.reduce(
    (acc, { id }, i) => {
      acc[id] = balanced[i];
      return acc;
    },
    {} as Record<BubbleId, number>
  );
};

const allAtTargets = (
  grid: Record<string, BubbleId>,
  targets: Record<BubbleId, number>
) =>
  BUBBLES.every(
    ({ id }) => countBubbleCells(grid, id) === targets[id]
  );

/** True when discrete cell counts match zero-sum targets for these offsets. */
export const areOffsetsApplied = (
  grid: Record<string, BubbleId>,
  baseline: Record<string, BubbleId>,
  offsets: BubblePercentOffsets
): boolean => allAtTargets(grid, computeZeroSumTargets(baseline, offsets));

const l1ToTargets = (
  grid: Record<string, BubbleId>,
  targets: Record<BubbleId, number>
) =>
  BUBBLES.reduce(
    (s, b) => s + Math.abs(targets[b.id] - countBubbleCells(grid, b.id)),
    0
  );

const maxAbsErrorToTargets = (
  grid: Record<string, BubbleId>,
  targets: Record<BubbleId, number>
) =>
  Math.max(
    ...BUBBLES.map((b) =>
      Math.abs(targets[b.id] - countBubbleCells(grid, b.id))
    )
  );

/** Lex order of per-bubble absolute errors (stable tie-break). */
const absErrorVector = (
  grid: Record<string, BubbleId>,
  targets: Record<BubbleId, number>
): number[] =>
  BUBBLES.map((b) => Math.abs(targets[b.id] - countBubbleCells(grid, b.id)));

/** Compare candidates: lower L1, then lower max error, then lex smaller abs-error vector, then grid key. */
const compareGridCandidates = (
  a: Record<string, BubbleId>,
  b: Record<string, BubbleId>,
  targets: Record<BubbleId, number>
): number => {
  const l1a = l1ToTargets(a, targets);
  const l1b = l1ToTargets(b, targets);
  if (l1a !== l1b) return l1a - l1b;
  const ma = maxAbsErrorToTargets(a, targets);
  const mb = maxAbsErrorToTargets(b, targets);
  if (ma !== mb) return ma - mb;
  const ea = absErrorVector(a, targets);
  const eb = absErrorVector(b, targets);
  for (let i = 0; i < ea.length; i++) {
    if (ea[i] !== eb[i]) return ea[i] - eb[i];
  }
  return gridSortKey(a).localeCompare(gridSortKey(b));
};

const gridSortKey = (grid: Record<string, BubbleId>): string =>
  Object.keys(grid)
    .sort()
    .map((k) => `${k}:${grid[k]}`)
    .join("|");

const applyGrowCandidate = (
  grid: Record<string, BubbleId>,
  bubbleId: BubbleId,
  cand: GrowCandidate
): Record<string, BubbleId> => {
  const next = { ...grid };
  next[cellKey(cand.target.col, cand.target.row)] = bubbleId;
  return next;
};

const applyShrinkCandidate = (
  grid: Record<string, BubbleId>,
  cand: ShrinkCandidate
): Record<string, BubbleId> => {
  const next = { ...grid };
  next[cellKey(cand.owner.col, cand.owner.row)] = cand.neighborId;
  return next;
};

const enumerateOneCellMoves = (
  current: Record<string, BubbleId>,
  targets: Record<BubbleId, number>
): Record<string, BubbleId>[] => {
  const candidates: Record<string, BubbleId>[] = [];

  for (const { id } of BUBBLES) {
    if (countBubbleCells(current, id) >= targets[id]) continue;
    for (const gc of listGrowCandidates(current, id)) {
      candidates.push(applyGrowCandidate(current, id, gc));
    }
  }

  for (const { id } of BUBBLES) {
    if (countBubbleCells(current, id) <= targets[id]) continue;
    for (const sc of listShrinkCandidates(current, id)) {
      candidates.push(applyShrinkCandidate(current, sc));
    }
  }

  return candidates;
};

const stepTowardTargets = (
  current: Record<string, BubbleId>,
  targets: Record<BubbleId, number>,
  stepIndex = 0
): { grid: Record<string, BubbleId>; changed: boolean } => {
  if (allAtTargets(current, targets)) {
    return { grid: current, changed: false };
  }

  const candidates = enumerateOneCellMoves(current, targets);
  if (candidates.length === 0) {
    return { grid: current, changed: false };
  }

  const curL1 = l1ToTargets(current, targets);
  const minL = Math.min(...candidates.map((c) => l1ToTargets(c, targets)));
  if (minL > curL1) {
    return { grid: current, changed: false };
  }

  const pool = candidates
    .filter((c) => l1ToTargets(c, targets) === minL)
    .sort((a, b) => compareGridCandidates(a, b, targets));

  const n = pool.length;
  for (let k = 0; k < n; k++) {
    const pick = pool[(stepIndex + k) % n]!;
    if (gridSortKey(pick) !== gridSortKey(current)) {
      return { grid: pick, changed: true };
    }
  }

  return { grid: current, changed: false };
};

/** One cell transfer per call — moves a single shared edge, not the whole perimeter. */
export const applyOneStepTowardTargets = (
  current: Record<string, BubbleId>,
  baseline: Record<string, BubbleId>,
  offsets: BubblePercentOffsets
): Record<string, BubbleId> => {
  const targets = computeZeroSumTargets(baseline, offsets);
  return stepTowardTargets(current, targets, 0).grid;
};

/**
 * Move the grid only when continuous zero-sum share differs from discrete
 * count by a full cell. Keeps sub-cell smoothness in the outline without
 * early integer apportionment jumps (e.g. yellow 7th cell at +13%).
 */
export const reconcileGridToContinuous = (
  current: Record<string, BubbleId>,
  baseline: Record<string, BubbleId>,
  offsets: BubblePercentOffsets
): Record<string, BubbleId> => {
  let grid = current;

  for (let step = 0; step < MAX_STEPS; step++) {
    let changed = false;

    const shrinking = BUBBLES.map(({ id }) => ({
      id,
      gap: countBubbleCells(grid, id) - getContinuousZeroSumCount(baseline, offsets, id),
    }))
      .filter((b) => b.gap >= 1 - 1e-6)
      .sort((a, b) => b.gap - a.gap);

    for (const { id } of shrinking) {
      const next = shrinkBubble(grid, id);
      if (next) {
        grid = next;
        changed = true;
        break;
      }
    }
    if (changed) continue;

    const growing = BUBBLES.map(({ id }) => ({
      id,
      gap: getContinuousZeroSumCount(baseline, offsets, id) - countBubbleCells(grid, id),
    }))
      .filter((b) => b.gap >= 1 - 1e-6)
      .sort((a, b) => b.gap - a.gap);

    for (const { id } of growing) {
      const next = growBubble(grid, id);
      if (next) {
        grid = next;
        changed = true;
        break;
      }
    }

    if (!changed) break;
  }

  return grid;
};

const pickGrowCandidate = (
  grid: Record<string, BubbleId>,
  bubbleId: BubbleId,
  baseline: Record<string, BubbleId>,
  offsets: BubblePercentOffsets
): GrowCandidate | null => {
  const candidates = listGrowCandidates(grid, bubbleId);
  if (candidates.length === 0) return null;

  return candidates
    .map((cand) => ({
      cand,
      surplus:
        countBubbleCells(grid, cand.neighborId) -
        getContinuousZeroSumCount(baseline, offsets, cand.neighborId),
    }))
    .sort((a, b) => b.surplus - a.surplus)[0]!.cand;
};

const pickShrinkCandidate = (
  grid: Record<string, BubbleId>,
  bubbleId: BubbleId,
  targets: Record<BubbleId, number>
): ShrinkCandidate | null => {
  const candidates = listShrinkCandidates(grid, bubbleId);
  if (candidates.length === 0) return null;

  const scored = candidates.map((cand) => ({
    cand,
    deficit:
      targets[cand.neighborId] - countBubbleCells(grid, cand.neighborId),
  }));
  const needy = scored.filter((s) => s.deficit > 0);
  const pool = needy.length > 0 ? needy : scored;
  return pool.sort((a, b) => b.deficit - a.deficit)[0]!.cand;
};

/** Grow or shrink `bubbleId` by one cell toward its target count. */
const stepOneBubbleTowardTarget = (
  grid: Record<string, BubbleId>,
  bubbleId: BubbleId,
  target: number,
  targets: Record<BubbleId, number>,
  baseline: Record<string, BubbleId>,
  offsets: BubblePercentOffsets
): { grid: Record<string, BubbleId>; changed: boolean } => {
  const count = countBubbleCells(grid, bubbleId);

  if (count < target) {
    const cand = pickGrowCandidate(grid, bubbleId, baseline, offsets);
    if (!cand) return { grid, changed: false };
    return { grid: applyGrowCandidate(grid, bubbleId, cand), changed: true };
  }

  if (count > target) {
    const cand = pickShrinkCandidate(grid, bubbleId, targets);
    if (!cand) return { grid, changed: false };
    return { grid: applyShrinkCandidate(grid, cand), changed: true };
  }

  return { grid, changed: false };
};

/** Sync the focused bubble first so its cell count tracks % monotonically. */
const syncFocusBubbleFirst = (
  start: Record<string, BubbleId>,
  targets: Record<BubbleId, number>,
  focusId: BubbleId,
  baseline: Record<string, BubbleId>,
  offsets: BubblePercentOffsets
): Record<string, BubbleId> => {
  let grid = { ...start };
  const target = targets[focusId];

  for (let step = 0; step < MAX_STEPS; step++) {
    if (countBubbleCells(grid, focusId) === target) break;
    const { grid: next, changed } = stepOneBubbleTowardTarget(
      grid,
      focusId,
      target,
      targets,
      baseline,
      offsets
    );
    if (!changed) break;
    grid = next;
  }

  return grid;
};

/** Greedy per-bubble steps until counts match targets (or no valid move). */
const syncAllBubblesGreedy = (
  start: Record<string, BubbleId>,
  targets: Record<BubbleId, number>,
  baseline: Record<string, BubbleId>,
  offsets: BubblePercentOffsets,
  priorityId?: BubbleId
): Record<string, BubbleId> => {
  if (allAtTargets(start, targets)) return start;

  const order: BubbleId[] = priorityId
    ? [priorityId, ...BUBBLES.map((b) => b.id).filter((id) => id !== priorityId)]
    : BUBBLES.map((b) => b.id);

  let grid = { ...start };

  for (let step = 0; step < MAX_STEPS; step++) {
    if (allAtTargets(grid, targets)) return grid;

    let changed = false;
    for (const id of order) {
      if (countBubbleCells(grid, id) === targets[id]) continue;
      const next = stepOneBubbleTowardTarget(
        grid,
        id,
        targets[id],
        targets,
        baseline,
        offsets
      );
      if (next.changed) {
        grid = next.grid;
        changed = true;
        break;
      }
    }
    if (!changed) break;
  }

  return grid;
};

const syncGridToTargets = (
  start: Record<string, BubbleId>,
  targets: Record<BubbleId, number>,
  baseline: Record<string, BubbleId>,
  offsets: BubblePercentOffsets,
  focusId?: BubbleId
): Record<string, BubbleId> => {
  const afterFocus =
    focusId !== undefined
      ? syncFocusBubbleFirst(start, targets, focusId, baseline, offsets)
      : start;

  const greedy = syncAllBubblesGreedy(
    afterFocus,
    targets,
    baseline,
    offsets,
    focusId
  );
  if (allAtTargets(greedy, targets)) return greedy;

  let bestGrid = greedy;
  let bestL1 = l1ToTargets(greedy, targets);
  if (bestL1 === 0) return greedy;

  const RESTARTS = 8;
  for (let seed = 0; seed < RESTARTS; seed++) {
    let trial = syncAllBubblesGreedy(
      focusId !== undefined
        ? syncFocusBubbleFirst(
            { ...start },
            targets,
            focusId,
            baseline,
            offsets
          )
        : { ...start },
      targets,
      baseline,
      offsets,
      focusId
    );

    for (let step = 0; step < MAX_STEPS; step++) {
      const { grid, changed } = stepTowardTargets(
        trial,
        targets,
        step + seed * 9973
      );
      trial = grid;
      if (!changed || allAtTargets(trial, targets)) break;
    }

    if (allAtTargets(trial, targets)) return trial;

    const l1 = l1ToTargets(trial, targets);
    if (l1 < bestL1) {
      bestL1 = l1;
      bestGrid = trial;
    }
    if (bestL1 === 0) return bestGrid;
  }

  return bestGrid;
};

/** Sub-cell gap vs continuous zero-sum area (positive = grow strip, negative = shrink strip). */
export const getSubCellGap = (
  grid: Record<string, BubbleId>,
  baseline: Record<string, BubbleId>,
  offsets: BubblePercentOffsets,
  bubbleId: BubbleId,
  focusId?: BubbleId
): number => {
  const discrete = countBubbleCells(grid, bubbleId);
  const exact = getContinuousZeroSumCount(baseline, offsets, bubbleId);
  return exact - discrete;
};

/** Visual cell count = discrete cells + fractional grow strip on the outline. */
export const getVisualCellCount = (
  grid: Record<string, BubbleId>,
  baseline: Record<string, BubbleId>,
  offsets: BubblePercentOffsets,
  bubbleId: BubbleId,
  focusId?: BubbleId
): number => {
  const discrete = countBubbleCells(grid, bubbleId);
  const gap = getSubCellGap(grid, baseline, offsets, bubbleId, focusId);
  if (gap > 0.008 && gap < 1) return discrete + gap;
  return discrete;
};

/** % change vs baseline from visual area (cells + sub-cell strip). */
export const getEffectivePercentVisual = (
  grid: Record<string, BubbleId>,
  baseline: Record<string, BubbleId>,
  offsets: BubblePercentOffsets,
  bubbleId: BubbleId,
  focusId?: BubbleId
): number => {
  const base = countBubbleCells(baseline, bubbleId);
  if (base <= 0) return 0;

  const visual = getVisualCellCount(
    grid,
    baseline,
    offsets,
    bubbleId,
    focusId
  );
  return ((visual / base) - 1) * 100;
};

/** Rebuild from initial layout (backend / cold start). */
export const applyPercentOffsetsFromBaseline = (
  baseline: Record<string, BubbleId>,
  offsets: BubblePercentOffsets,
  focusId?: BubbleId
): Record<string, BubbleId> => {
  const targets = computeZeroSumTargets(baseline, offsets, focusId);
  return syncGridToTargets({ ...baseline }, targets, baseline, offsets, focusId);
};

/** Catch up from the current grid without resetting layout. */
export const syncGridToOffsets = (
  current: Record<string, BubbleId>,
  baseline: Record<string, BubbleId>,
  offsets: BubblePercentOffsets,
  focusId?: BubbleId
): Record<string, BubbleId> => {
  const targets = computeZeroSumTargets(baseline, offsets, focusId);
  return syncGridToTargets(current, targets, baseline, offsets, focusId);
};

/**
 * Apply percent offsets from baseline: sync discrete grid to zero-sum targets,
 * then outline adds sub-cell strips for 0 < gap < 1.
 */
export const applyOffsetsToGrid = (
  _current: Record<string, BubbleId>,
  baseline: Record<string, BubbleId>,
  offsets: BubblePercentOffsets,
  focusId?: BubbleId
): Record<string, BubbleId> => {
  const targets = computeZeroSumTargets(baseline, offsets, focusId);
  return syncGridToTargets({ ...baseline }, targets, baseline, offsets, focusId);
};

/** Exact fractional cell share from zero-sum weights (before rounding). */
export const getContinuousZeroSumCount = (
  baseline: Record<string, BubbleId>,
  offsets: BubblePercentOffsets,
  bubbleId: BubbleId
): number => {
  const baselineCounts = getBaselineCellCounts(baseline);
  const adjusted = BUBBLES.filter(
    ({ id }) => Math.abs(offsets[id] ?? 0) > 0.001
  );

  if (adjusted.length === 0) return baselineCounts[bubbleId];

  if (adjusted.length === 1) {
    const { id: focusId } = adjusted[0]!;
    const focusExact =
      baselineCounts[focusId] * (1 + (offsets[focusId] ?? 0) / 100);
    const remaining = TOTAL_CELLS - focusExact;
    const otherBase = BUBBLES.filter((b) => b.id !== focusId).reduce(
      (s, b) => s + baselineCounts[b.id],
      0
    );
    if (bubbleId === focusId) return focusExact;
    if (otherBase <= 0) return baselineCounts[bubbleId];
    return (baselineCounts[bubbleId] / otherBase) * remaining;
  }

  const weights = BUBBLES.map(({ id }) => {
    const percent = offsets[id] ?? 0;
    return baselineCounts[id] * (1 + percent / 100);
  });
  const sum = weights.reduce((a, b) => a + b, 0);
  const idx = BUBBLES.findIndex((b) => b.id === bubbleId);
  if (sum <= 0) return baselineCounts[bubbleId];
  return (weights[idx] / sum) * TOTAL_CELLS;
};
