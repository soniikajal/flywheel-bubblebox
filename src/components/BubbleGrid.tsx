"use client";

import { useCallback, useMemo, useState } from "react";
import { countBubbleCells, growBubble, shrinkBubble } from "@/lib/bubbleGrid/gridLogic";
import { INITIAL_LAYOUT } from "@/lib/bubbleGrid/initialLayout";
import { buildPixelMap, getCellCenter } from "@/lib/bubbleGrid/pixelMap";
import {
  BUBBLES,
  BubbleId,
  COLS,
  ROWS,
} from "@/lib/bubbleGrid/types";

const CELL_SIZE = 72;
const RADIUS = CELL_SIZE / 2;
const SVG_WIDTH = COLS * CELL_SIZE;
const SVG_HEIGHT = ROWS * CELL_SIZE;

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
      >
        <svg
          width={SVG_WIDTH}
          height={SVG_HEIGHT}
          viewBox={`0 0 ${SVG_WIDTH} ${SVG_HEIGHT}`}
          className="block"
          aria-label="Bubble grid"
        >
          <defs>
            <filter
              id="goo"
              x="-50%"
              y="-50%"
              width="200%"
              height="200%"
              colorInterpolationFilters="sRGB"
            >
              <feGaussianBlur in="SourceGraphic" stdDeviation="8" result="blur" />
              <feColorMatrix
                in="blur"
                mode="matrix"
                values="1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  0 0 0 18 -7"
                result="goo"
              />
            </filter>
            <pattern
              id="gridCircles"
              width={CELL_SIZE}
              height={CELL_SIZE}
              patternUnits="userSpaceOnUse"
            >
              <circle
                cx={CELL_SIZE / 2}
                cy={CELL_SIZE / 2}
                r={RADIUS}
                fill="none"
                stroke="#d9d2c7"
                strokeWidth={1}
              />
            </pattern>
          </defs>

          <rect
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
                r={RADIUS}
                fill="none"
                stroke="#cfc6b8"
                strokeWidth={0.75}
                opacity={0.55}
              />
            ))
          )}

          {BUBBLES.map((bubble) => {
            const cells = pixelMap.cellsByBubble[bubble.id];
            return (
              <g
                key={bubble.id}
                filter="url(#goo)"
                fill={bubble.color}
                data-bubble={bubble.id}
              >
                {cells.map(({ col, row }) => {
                  const { x, y } = getCellCenter(col, row, CELL_SIZE);
                  return (
                    <circle
                      key={`${bubble.id}-${col}-${row}`}
                      cx={x}
                      cy={y}
                      r={RADIUS}
                      className="transition-[r,opacity] duration-300 ease-out"
                    />
                  );
                })}
              </g>
            );
          })}
        </svg>
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
              className="flex h-7 w-7 items-center justify-center rounded-full bg-neutral-100 text-neutral-600 transition hover:bg-neutral-200 active:scale-95"
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
