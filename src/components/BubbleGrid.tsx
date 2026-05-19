"use client";

import { AnimatePresence, motion } from "framer-motion";
import { useCallback, useMemo, useState } from "react";
import {
  canShrinkBubble,
  countBubbleCells,
  growBubble,
  shrinkBubble,
} from "@/lib/bubbleGrid/gridLogic";
import {
  getBubbleCentroid,
  getBubbleOutlinePaths,
} from "@/lib/bubbleGrid/bubbleOutline";
import { INITIAL_LAYOUT } from "@/lib/bubbleGrid/initialLayout";
import { buildPixelMap, getCellCenter } from "@/lib/bubbleGrid/pixelMap";
import {
  BUBBLES,
  BubbleId,
  COLS,
  ROWS,
  SUBDIVISION,
} from "@/lib/bubbleGrid/types";

const CELL_SIZE = 24;
const GRID_RADIUS = CELL_SIZE / 2;
const SVG_WIDTH = COLS * CELL_SIZE;
const SVG_HEIGHT = ROWS * CELL_SIZE;
const GOO_BLUR = CELL_SIZE * (10 / 72);
/** ViewBox bleed for goo blur — not added to layout size */
const FILTER_BLEED = Math.ceil(GOO_BLUR + 4);
const VIEW_BOX = `${-FILTER_BLEED} ${-FILTER_BLEED} ${SVG_WIDTH + FILTER_BLEED * 2} ${SVG_HEIGHT + FILTER_BLEED * 2}`;

const GOO_FILTER_PROPS = {
  x: "-20%",
  y: "-20%",
  width: "140%",
  height: "140%",
} as const;

const cellMotion = {
  initial: { opacity: 0, scale: 0.88 },
  animate: { opacity: 1, scale: 1 },
  exit: { opacity: 0, scale: 0.88 },
  transition: { duration: 0.38, ease: [0.4, 0, 0.2, 1] as const },
};

function GooFilter({ id, blur }: { id: string; blur: number }) {
  return (
    <filter
      id={id}
      {...GOO_FILTER_PROPS}
      colorInterpolationFilters="sRGB"
    >
      <feGaussianBlur in="SourceGraphic" stdDeviation={blur} result="blur" />
      <feColorMatrix
        in="blur"
        mode="matrix"
        values="1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  0 0 0 22 -10"
        result="goo"
      />
      <feComposite in="SourceGraphic" in2="goo" operator="atop" />
    </filter>
  );
}

type BubbleLayerProps = {
  bubbleId: BubbleId;
  color: string;
  cells: Array<{ col: number; row: number }>;
  grid: Record<string, BubbleId>;
};

function BubbleLayer({ bubbleId, color, cells, grid }: BubbleLayerProps) {
  const filterId = `goo-${bubbleId}`;
  const paths = useMemo(
    () => getBubbleOutlinePaths(grid, bubbleId, cells, CELL_SIZE),
    [grid, bubbleId, cells]
  );
  const centroid = useMemo(
    () => getBubbleCentroid(cells, CELL_SIZE),
    [cells]
  );

  return (
    <div
      className="pointer-events-none absolute inset-0"
      data-bubble={bubbleId}
    >
      <svg
        width={SVG_WIDTH}
        height={SVG_HEIGHT}
        viewBox={VIEW_BOX}
        className="block h-full w-full"
        aria-hidden
      >
        <defs>
          <GooFilter id={filterId} blur={GOO_BLUR} />
        </defs>
        <g filter={`url(#${filterId})`} fill={color}>
          <AnimatePresence mode="sync">
            {paths.map((d, i) => (
              <motion.path
                key={`${bubbleId}-${i}`}
                d={d}
                initial={cellMotion.initial}
                animate={cellMotion.animate}
                exit={cellMotion.exit}
                transition={cellMotion.transition}
                style={{
                  transformOrigin: `${centroid.x}px ${centroid.y}px`,
                  transformBox: "fill-box",
                }}
              />
            ))}
          </AnimatePresence>
        </g>
      </svg>
    </div>
  );
}

export default function BubbleGrid() {
  const [grid, setGrid] = useState<Record<string, BubbleId>>(() => ({
    ...INITIAL_LAYOUT,
  }));

  const pixelMap = useMemo(
    () => buildPixelMap(grid, SVG_WIDTH, SVG_HEIGHT, CELL_SIZE),
    [grid]
  );

  const cellCounts = useMemo(
    () =>
      BUBBLES.reduce(
        (acc, bubble) => {
          acc[bubble.id] = countBubbleCells(grid, bubble.id);
          return acc;
        },
        {} as Record<BubbleId, number>
      ),
    [grid]
  );

  const handleGrow = useCallback((bubbleId: BubbleId) => {
    setGrid((current) => growBubble(current, bubbleId) ?? current);
  }, []);

  const handleShrink = useCallback((bubbleId: BubbleId) => {
    setGrid((current) => shrinkBubble(current, bubbleId) ?? current);
  }, []);

  return (
    <div className="flex flex-col items-center gap-8 p-8">
      <div
        className="relative overflow-hidden rounded-2xl bg-[#f7f4ef] shadow-inner"
        style={{ width: SVG_WIDTH, height: SVG_HEIGHT }}
        aria-label="Bubble grid"
      >
        <svg
          width={SVG_WIDTH}
          height={SVG_HEIGHT}
          viewBox={VIEW_BOX}
          className="block h-full w-full"
          aria-hidden
        >
            <defs>
              <pattern
                id="gridCircles"
                width={CELL_SIZE}
                height={CELL_SIZE}
                patternUnits="userSpaceOnUse"
              >
                <circle
                  cx={CELL_SIZE / 2}
                  cy={CELL_SIZE / 2}
                  r={GRID_RADIUS}
                  fill="none"
                  stroke="#d9d2c7"
                  strokeWidth={0.75}
                />
              </pattern>
            </defs>
            <rect
              x={0}
              y={0}
              width={SVG_WIDTH}
              height={SVG_HEIGHT}
              fill="url(#gridCircles)"
              opacity={0.85}
            />
            {Array.from({ length: ROWS }).map((_, row) =>
              Array.from({ length: COLS }).map((_, col) => (
                <circle
                  key={`grid-${col}-${row}`}
                  cx={getCellCenter(col, row, CELL_SIZE).x}
                  cy={getCellCenter(col, row, CELL_SIZE).y}
                  r={GRID_RADIUS}
                  fill="none"
                  stroke="#cfc6b8"
                  strokeWidth={0.5}
                  opacity={0.45}
                />
              ))
            )}
        </svg>

        {BUBBLES.map((bubble) => (
          <BubbleLayer
            key={bubble.id}
            bubbleId={bubble.id}
            color={bubble.color}
            cells={pixelMap.cellsByBubble[bubble.id]}
            grid={grid}
          />
        ))}
      </div>

      <div className="flex flex-wrap justify-center gap-3 max-w-xl">
        {BUBBLES.map((bubble) => (
          <div
            key={bubble.id}
            className="flex items-center gap-2 rounded-full border border-neutral-200 bg-white px-3 py-2 shadow-sm"
          >
            <span
              className="h-3 w-3 rounded-full"
              style={{ backgroundColor: bubble.color }}
            />
            <span className="text-sm font-medium text-neutral-700 min-w-[4.5rem]">
              {bubble.label}
            </span>
            <span
              className="text-xs tabular-nums text-neutral-400 w-6 text-center"
              title={`${cellCounts[bubble.id]} fine cells`}
            >
              {Math.round(cellCounts[bubble.id] / (SUBDIVISION * SUBDIVISION))}
            </span>
            <button
              type="button"
              onClick={() => handleShrink(bubble.id)}
              disabled={!canShrinkBubble(grid, bubble.id)}
              className="flex h-7 w-7 items-center justify-center rounded-full bg-neutral-100 text-neutral-600 transition hover:bg-neutral-200 active:scale-95 disabled:opacity-40 disabled:pointer-events-none disabled:cursor-not-allowed"
              aria-label={`Decrease ${bubble.label} bubble`}
            >
              −
            </button>
            <button
              type="button"
              onClick={() => handleGrow(bubble.id)}
              className="flex h-7 w-7 items-center justify-center rounded-full bg-neutral-900 text-white transition hover:bg-neutral-700 active:scale-95"
              aria-label={`Increase ${bubble.label} bubble`}
            >
              +
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
