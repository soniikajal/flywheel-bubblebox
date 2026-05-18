"use client";

import { useCallback, useMemo, useState } from "react";
import {
  canShrinkBubble,
  countBubbleCells,
  growBubble,
  shrinkBubble,
} from "@/lib/bubbleGrid/gridLogic";
import { INITIAL_LAYOUT } from "@/lib/bubbleGrid/initialLayout";
import { buildPixelMap, getCellCenter } from "@/lib/bubbleGrid/pixelMap";
import {
  BUBBLES,
  BubbleId,
  COLS,
  ROWS,
} from "@/lib/bubbleGrid/types";

const CELL_SIZE = 72;
/** Grid circles use exact radius; goo circles overlap slightly so blur bridges gaps. */
const GRID_RADIUS = CELL_SIZE / 2;
const GOO_RADIUS = GRID_RADIUS + 4;
const SVG_WIDTH = COLS * CELL_SIZE;
const SVG_HEIGHT = ROWS * CELL_SIZE;
/** Padding so Gaussian blur is not clipped by SVG or parent overflow. */
const FILTER_PAD = 28;

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

  const viewBox = `${-FILTER_PAD} ${-FILTER_PAD} ${SVG_WIDTH + FILTER_PAD * 2} ${SVG_HEIGHT + FILTER_PAD * 2}`;

  return (
    <div className="flex flex-col items-center gap-8 p-8">
      <div
        className="rounded-2xl bg-[#f7f4ef] p-3 shadow-inner"
        style={{
          width: SVG_WIDTH + FILTER_PAD * 2,
          height: SVG_HEIGHT + FILTER_PAD * 2,
        }}
      >
        <div
          className="relative"
          style={{ width: SVG_WIDTH, height: SVG_HEIGHT, margin: FILTER_PAD }}
          aria-label="Bubble grid"
        >
          {/* Background grid */}
          <svg
            width={SVG_WIDTH}
            height={SVG_HEIGHT}
            viewBox={viewBox}
            overflow="visible"
            className="absolute left-0 top-0 block"
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
                  strokeWidth={1}
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
                  strokeWidth={0.75}
                  opacity={0.55}
                />
              ))
            )}
          </svg>

          {/* One isolated goo layer per bubble */}
          {BUBBLES.map((bubble) => {
            const cells = pixelMap.cellsByBubble[bubble.id];
            const filterId = `goo-${bubble.id}`;

            return (
              <div
                key={bubble.id}
                className="pointer-events-none absolute left-0 top-0 overflow-visible"
                style={{ width: SVG_WIDTH, height: SVG_HEIGHT }}
                data-bubble={bubble.id}
              >
                <svg
                  width={SVG_WIDTH}
                  height={SVG_HEIGHT}
                  viewBox={viewBox}
                  overflow="visible"
                  className="block overflow-visible"
                  style={{ overflow: "visible" }}
                  aria-hidden
                >
                  <defs>
                    <filter
                      id={filterId}
                      x="-20%"
                      y="-20%"
                      width="140%"
                      height="140%"
                      colorInterpolationFilters="sRGB"
                    >
                      <feGaussianBlur
                        in="SourceGraphic"
                        stdDeviation="12"
                        result="blur"
                      />
                      <feColorMatrix
                        in="blur"
                        mode="matrix"
                        values="1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  0 0 0 20 -9"
                        result="goo"
                      />
                      <feComposite
                        in="SourceGraphic"
                        in2="goo"
                        operator="atop"
                      />
                    </filter>
                  </defs>
                  <g filter={`url(#${filterId})`} fill={bubble.color}>
                    {cells.map(({ col, row }) => {
                      const { x, y } = getCellCenter(col, row, CELL_SIZE);
                      return (
                        <circle
                          key={`${bubble.id}-${col}-${row}`}
                          cx={x}
                          cy={y}
                          r={GOO_RADIUS}
                          className="transition-[r,opacity] duration-300 ease-out"
                        />
                      );
                    })}
                  </g>
                </svg>
              </div>
            );
          })}
        </div>
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
            <span className="text-xs tabular-nums text-neutral-400 w-6 text-center">
              {cellCounts[bubble.id]}
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
