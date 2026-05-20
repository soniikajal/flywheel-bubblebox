import {
  getContinuousZeroSumCount,
  type BubblePercentOffsets,
} from "./adjustments";
import {
  BASELINE_SUBCELL_COUNTS,
  BUBBLE_SEEDS,
  SUBDIV,
  type BubbleSeedSet,
} from "./seeds";
import { BubbleId, BUBBLES, COLS, ROWS } from "./types";

/** Raster resolution factor (2 ≈ half-pixel steps; still resolves ~1% area). */
export const RASTER_SCALE = 2;

/** Coarser grid for weight calibration only (keeps UI responsive). */
const CALIBRATE_SCALE = 4;

const EPS = 0.5;
const TOTAL_SUBCELLS = COLS * ROWS * SUBDIV * SUBDIV;

/** Scale so typical seed distances (~20–40px) interact with unit weights. */
const DIST_WEIGHT = 1 / 32;

/**
 * Additive weighted Voronoi score (argmax wins).
 * Behaves like weight/distance for growth direction but actually moves boundaries.
 */
export const scoreAt = (weight: number, dist: number): number =>
  weight - Math.max(dist, EPS) * DIST_WEIGHT;

/** Minimum multiplier so a bubble never vanishes (~one sub-cell of area). */
export const minWeightMultiplier = (bubbleId: BubbleId): number =>
  1 / BASELINE_SUBCELL_COUNTS[bubbleId];

export const weightMultiplierFromPercent = (
  bubbleId: BubbleId,
  percent: number
): number => {
  const mult = 1 + percent / 100;
  return Math.max(mult, minWeightMultiplier(bubbleId));
};

export const weightsFromOffsets = (
  offsets: BubblePercentOffsets
): Record<BubbleId, number> =>
  BUBBLES.reduce(
    (acc, { id }) => {
      acc[id] =
        BUBBLE_SEEDS.find((s) => s.id === id)!.initialWeight *
        weightMultiplierFromPercent(id, offsets[id] ?? 0);
      return acc;
    },
    {} as Record<BubbleId, number>
  );

const targetAreaShares = (
  baseline: Record<string, BubbleId>,
  offsets: BubblePercentOffsets
): Record<BubbleId, number> =>
  BUBBLES.reduce(
    (acc, { id }) => {
      acc[id] = getContinuousZeroSumCount(baseline, offsets, id) / TOTAL_SUBCELLS;
      return acc;
    },
    {} as Record<BubbleId, number>
  );

/** Iteratively tune weights so raster shares match zero-sum fractional targets. */
export const calibrateWeights = (
  width: number,
  height: number,
  baseline: Record<string, BubbleId>,
  offsets: BubblePercentOffsets,
  scale: number = RASTER_SCALE
): Record<BubbleId, number> => {
  const targets = targetAreaShares(baseline, offsets);
  const weights = { ...weightsFromOffsets(offsets) };

  for (let iter = 0; iter < 10; iter++) {
    const shares = measureAreaShares(
      computeOwnershipFieldWithWeights(
        width,
        height,
        weights,
        CALIBRATE_SCALE
      )
    );

    let maxErr = 0;
    for (const { id } of BUBBLES) {
      const target = targets[id];
      const actual = shares[id];
      maxErr = Math.max(maxErr, Math.abs(actual - target));
      if (target < 1e-9) continue;
      const ratio = target / Math.max(actual, 1e-12);
      weights[id] = Math.max(
        weights[id] * Math.pow(ratio, 0.4),
        BUBBLE_SEEDS.find((s) => s.id === id)!.initialWeight *
          minWeightMultiplier(id)
      );
    }
    if (maxErr < 0.0008) break;
  }

  return weights;
};

type BucketKey = string;

const bucketKey = (bx: number, by: number) => `${bx},${by}`;

const buildSeedBuckets = (
  sets: BubbleSeedSet[],
  bucketSize: number
): Map<BucketKey, Array<{ bubbleId: BubbleId; seed: { x: number; y: number } }>> => {
  const buckets = new Map<
    BucketKey,
    Array<{ bubbleId: BubbleId; seed: { x: number; y: number } }>
  >();

  for (const { id, seeds } of sets) {
    for (const seed of seeds) {
      const bx = Math.floor(seed.x / bucketSize);
      const by = Math.floor(seed.y / bucketSize);
      const key = bucketKey(bx, by);
      const list = buckets.get(key) ?? [];
      list.push({ bubbleId: id, seed });
      buckets.set(key, list);
    }
  }

  return buckets;
};

const minDistToBubble = (
  px: number,
  py: number,
  bubbleId: BubbleId,
  buckets: Map<
    BucketKey,
    Array<{ bubbleId: BubbleId; seed: { x: number; y: number } }>
  >,
  bucketSize: number
): number => {
  const bx = Math.floor(px / bucketSize);
  const by = Math.floor(py / bucketSize);
  let min = Infinity;

  for (let dy = -1; dy <= 1; dy++) {
    for (let dx = -1; dx <= 1; dx++) {
      const entries = buckets.get(bucketKey(bx + dx, by + dy));
      if (!entries) continue;
      for (const entry of entries) {
        if (entry.bubbleId !== bubbleId) continue;
        const d = Math.hypot(px - entry.seed.x, py - entry.seed.y);
        if (d < min) min = d;
      }
    }
  }

  if (min !== Infinity) return min;

  const set = BUBBLE_SEEDS.find((s) => s.id === bubbleId);
  if (!set) return Infinity;
  for (const seed of set.seeds) {
    const d = Math.hypot(px - seed.x, py - seed.y);
    if (d < min) min = d;
  }
  return min;
};

export type OwnershipField = {
  width: number;
  height: number;
  /** Row-major owner per raster cell. */
  owners: BubbleId[];
};

const computeOwnershipFieldWithWeights = (
  width: number,
  height: number,
  weights: Record<BubbleId, number>,
  scale: number
): OwnershipField => {
  const rw = Math.ceil(width / scale);
  const rh = Math.ceil(height / scale);
  const bucketSize = 24;
  const buckets = buildSeedBuckets(BUBBLE_SEEDS, bucketSize);
  const owners: BubbleId[] = new Array(rw * rh);

  for (let ry = 0; ry < rh; ry++) {
    for (let rx = 0; rx < rw; rx++) {
      const px = (rx + 0.5) * scale;
      const py = (ry + 0.5) * scale;

      let bestId: BubbleId = BUBBLES[0]!.id;
      let bestScore = -Infinity;

      for (const { id } of BUBBLES) {
        const dist = minDistToBubble(px, py, id, buckets, bucketSize);
        const s = scoreAt(weights[id], dist);
        if (s > bestScore) {
          bestScore = s;
          bestId = id;
        }
      }

      owners[ry * rw + rx] = bestId;
    }
  }

  return { width: rw, height: rh, owners };
};

/** Weighted Voronoi with calibrated zero-sum fractional areas. */
export const computeOwnershipField = (
  width: number,
  height: number,
  offsets: BubblePercentOffsets,
  baseline: Record<string, BubbleId>,
  scale: number = RASTER_SCALE
): OwnershipField => {
  const weights = calibrateWeights(width, height, baseline, offsets, scale);
  return computeOwnershipFieldWithWeights(width, height, weights, scale);
};

export const measureAreaShares = (
  field: OwnershipField
): Record<BubbleId, number> => {
  const counts = BUBBLES.reduce(
    (acc, { id }) => {
      acc[id] = 0;
      return acc;
    },
    {} as Record<BubbleId, number>
  );

  for (const id of field.owners) {
    counts[id]++;
  }

  const total = field.owners.length;
  return BUBBLES.reduce(
    (acc, { id }) => {
      acc[id] = counts[id] / total;
      return acc;
    },
    {} as Record<BubbleId, number>
  );
};

/** Effective % area vs baseline layout from the fractional ownership field. */
export const getEffectivePercentFromField = (
  width: number,
  height: number,
  baseline: Record<string, BubbleId>,
  offsets: BubblePercentOffsets,
  bubbleId: BubbleId
): number => {
  const field = computeOwnershipField(width, height, offsets, baseline);
  const shares = measureAreaShares(field);
  const baseShare = BASELINE_SUBCELL_COUNTS[bubbleId] / TOTAL_SUBCELLS;
  if (baseShare <= 0) return 0;
  return ((shares[bubbleId] / baseShare) - 1) * 100;
};
