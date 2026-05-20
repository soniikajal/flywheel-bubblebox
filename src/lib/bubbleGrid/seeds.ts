import { INITIAL_LAYOUT } from "./initialLayout";
import { BubbleId, BUBBLES, COLS, ROWS, cellKey } from "./types";

export type Seed = { x: number; y: number };

export type BubbleSeedSet = {
  id: BubbleId;
  seeds: Seed[];
  /** Unit weight at 0% offset (one multiplier per bubble). */
  initialWeight: number;
};

/** Matches BubbleGrid CELL_SIZE — one coarse grid cell in pixels. */
export const COARSE_CELL_PX = 72;

/**
 * Sub-cells per coarse side (~1% of smallest bubble ≈ 0.03 coarse cells → ~1.5 sub-cells).
 */
export const SUBDIV = 7;

const FINE_CELL_PX = COARSE_CELL_PX / SUBDIV;

/** Fixed seed lattice: SUBDIV×SUBDIV points per coarse cell (ownership from initial layout). */
export const BUBBLE_SEEDS: BubbleSeedSet[] = (() => {
  const byBubble = BUBBLES.reduce(
    (acc, { id }) => {
      acc[id] = [] as Seed[];
      return acc;
    },
    {} as Record<BubbleId, Seed[]>
  );

  for (let row = 0; row < ROWS; row++) {
    for (let col = 0; col < COLS; col++) {
      const id = INITIAL_LAYOUT[cellKey(col, row)];
      if (!id) continue;
      const x0 = col * COARSE_CELL_PX;
      const y0 = row * COARSE_CELL_PX;
      for (let sy = 0; sy < SUBDIV; sy++) {
        for (let sx = 0; sx < SUBDIV; sx++) {
          byBubble[id].push({
            x: x0 + (sx + 0.5) * FINE_CELL_PX,
            y: y0 + (sy + 0.5) * FINE_CELL_PX,
          });
        }
      }
    }
  }

  return BUBBLES.map(({ id }) => ({
    id,
    seeds: byBubble[id],
    initialWeight: 1,
  }));
})();

/** Sub-cell count per bubble at 0% offset (used for min weight / area baselines). */
export const BASELINE_SUBCELL_COUNTS = BUBBLE_SEEDS.reduce(
  (acc, { id, seeds }) => {
    acc[id] = seeds.length;
    return acc;
  },
  {} as Record<BubbleId, number>
);
