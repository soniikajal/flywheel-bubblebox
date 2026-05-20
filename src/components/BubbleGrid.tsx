"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import {
  applyOffsetsToGrid,
  applyPercentOffsetsFromBaseline,
  type BubblePercentOffsets,
  getBaselineCellCounts,
  getContinuousZeroSumCount,
  parseBubbleOffsets,
  redistributeOffsets,
} from "@/lib/bubbleGrid/adjustments";
import { getBubbleOutlinePaths } from "@/lib/bubbleGrid/bubbleOutline";
import { countBubbleCells } from "@/lib/bubbleGrid/gridLogic";
import { INITIAL_LAYOUT } from "@/lib/bubbleGrid/initialLayout";
import { getCellCenter } from "@/lib/bubbleGrid/pixelMap";
import { BUBBLES, BubbleId, COLS, ROWS } from "@/lib/bubbleGrid/types";

const CELL_SIZE = 72;
const GRID_RADIUS = CELL_SIZE / 2;
const SVG_WIDTH = COLS * CELL_SIZE;
const SVG_HEIGHT = ROWS * CELL_SIZE;
const GOO_BLUR = 7;
const FILTER_BLEED = Math.ceil(GOO_BLUR + 4);
const VIEW_BOX = `${-FILTER_BLEED} ${-FILTER_BLEED} ${SVG_WIDTH + FILTER_BLEED * 2} ${SVG_HEIGHT + FILTER_BLEED * 2}`;

const BASELINE_COUNTS = getBaselineCellCounts(INITIAL_LAYOUT);

const GOO_FILTER_PROPS = {
  x: "-20%",
  y: "-20%",
  width: "140%",
  height: "140%",
} as const;

function GooFilter({ id }: { id: string }) {
  return (
    <filter
      id={id}
      {...GOO_FILTER_PROPS}
      colorInterpolationFilters="sRGB"
    >
      <feGaussianBlur in="SourceGraphic" stdDeviation={GOO_BLUR} result="blur" />
      <feColorMatrix
        in="blur"
        mode="matrix"
        values="1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  0 0 0 22 -10"
        result="goo"
      />
    </filter>
  );
}

type BubbleLayerProps = {
  bubbleId: BubbleId;
  color: string;
  cells: Array<{ col: number; row: number }>;
  grid: Record<string, BubbleId>;
  offsets: BubblePercentOffsets;
};

function BubbleLayer({
  bubbleId,
  color,
  cells,
  grid,
  offsets,
}: BubbleLayerProps) {
  const filterId = `goo-${bubbleId}`;
  const paths = useMemo(
    () =>
      getBubbleOutlinePaths(
        grid,
        bubbleId,
        cells,
        CELL_SIZE,
        INITIAL_LAYOUT,
        offsets
      ),
    [bubbleId, cells, grid, offsets]
  );
  if (paths.length === 0) return null;

  return (
    <div
      className="pointer-events-none absolute inset-0"
      data-bubble={bubbleId}
    >
      <svg
        width={SVG_WIDTH}
        height={SVG_HEIGHT}
        viewBox={VIEW_BOX}
        className="block h-full w-full will-change-auto"
        aria-hidden
      >
        <defs>
          <GooFilter id={filterId} />
        </defs>
        <g filter={`url(#${filterId})`} fill={color}>
          {paths.map((d, i) => (
            <path key={`${bubbleId}-${i}`} d={d} />
          ))}
        </g>
      </svg>
    </div>
  );
}

/** Invisible reference grid — defines cell centers for logic (opacity 0). */
function ReferenceGrid() {
  return (
    <svg
      width={SVG_WIDTH}
      height={SVG_HEIGHT}
      viewBox={VIEW_BOX}
      className="pointer-events-none absolute inset-0"
      aria-hidden
      data-reference-grid
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
            stroke="#000"
            strokeWidth={1}
            opacity={0}
          />
        </pattern>
      </defs>
      <rect
        x={0}
        y={0}
        width={SVG_WIDTH}
        height={SVG_HEIGHT}
        fill="url(#gridCircles)"
        opacity={0}
      />
      {Array.from({ length: ROWS }).map((_, row) =>
        Array.from({ length: COLS }).map((_, col) => (
          <circle
            key={`ref-${col}-${row}`}
            data-grid-col={col}
            data-grid-row={row}
            cx={getCellCenter(col, row, CELL_SIZE).x}
            cy={getCellCenter(col, row, CELL_SIZE).y}
            r={GRID_RADIUS}
            fill="none"
            stroke="#000"
            strokeWidth={1}
            opacity={0}
          />
        ))
      )}
    </svg>
  );
}

export type { BubblePercentOffsets as BubblePercentAdjustments };
export {
  applyPercentOffsetsFromBaseline as applyBubbleAdjustments,
  parseBubbleOffsets as parseBubbleAdjustments,
};

export type BubbleGridProps = {
  adjustments?: BubblePercentOffsets;
};

export default function BubbleGrid({ adjustments }: BubbleGridProps = {}) {
  const [offsets, setOffsets] = useState<BubblePercentOffsets>({});
  const [grid, setGrid] = useState<Record<string, BubbleId>>(() => ({
    ...INITIAL_LAYOUT,
  }));
  const lastAdjustmentsKey = useRef<string | null>(null);
  const [selectedBubbleId, setSelectedBubbleId] = useState<BubbleId>(
    BUBBLES[0]!.id
  );
  const [percentField, setPercentField] = useState("0");

  const applyOffsets = useCallback((nextOffsets: BubblePercentOffsets) => {
    setOffsets(nextOffsets);
    setGrid((current) =>
      applyOffsetsToGrid(current, INITIAL_LAYOUT, nextOffsets)
    );
  }, []);

  const cellsByBubble = useMemo(() => {
    const map = BUBBLES.reduce(
      (acc, bubble) => {
        acc[bubble.id] = [] as Array<{ col: number; row: number }>;
        return acc;
      },
      {} as Record<BubbleId, Array<{ col: number; row: number }>>
    );

    for (const [key, owner] of Object.entries(grid)) {
      const [col, row] = key.split(",").map(Number);
      map[owner].push({ col, row });
    }
    return map;
  }, [grid]);

  const formatOffsetForField = useCallback((id: BubbleId) => {
    const v = offsets[id] ?? 0;
    const rounded = Math.round(v * 10) / 10;
    if (Math.abs(rounded) < 0.05) return "0";
    return String(rounded);
  }, [offsets]);

  const handleBubbleChange = useCallback(
    (id: BubbleId) => {
      setSelectedBubbleId(id);
      setPercentField(formatOffsetForField(id));
    },
    [formatOffsetForField]
  );

  const applyTargetPercent = useCallback(() => {
    const normalized = percentField.trim().replace(",", ".");
    const parsed = parseFloat(normalized);
    if (!Number.isFinite(parsed)) return;

    const target = Math.round(parsed * 10) / 10;

    setOffsets((prev) => {
      const current = prev[selectedBubbleId] ?? 0;
      const delta = Math.round((target - current) * 10) / 10;
      if (Math.abs(delta) < 0.001) return prev;
      const next = redistributeOffsets(
        prev,
        selectedBubbleId,
        delta,
        BASELINE_COUNTS
      );
      setGrid((g) => applyOffsetsToGrid(g, INITIAL_LAYOUT, next));
      return next;
    });
    setPercentField(
      Math.abs(target) < 0.05 ? "0" : String(target)
    );
  }, [percentField, selectedBubbleId]);

  const handleFormSubmit = useCallback(
    (e: FormEvent<HTMLFormElement>) => {
      e.preventDefault();
      applyTargetPercent();
    },
    [applyTargetPercent]
  );

  useEffect(() => {
    if (!adjustments || Object.keys(adjustments).length === 0) return;
    const key = JSON.stringify(adjustments);
    if (key === lastAdjustmentsKey.current) return;
    lastAdjustmentsKey.current = key;
    const parsed = parseBubbleOffsets(adjustments as Record<string, number>);
    applyOffsets(parsed);
    const v = parsed[selectedBubbleId] ?? 0;
    setPercentField(Math.abs(v) < 0.05 ? "0" : String(Math.round(v * 10) / 10));
  }, [adjustments, applyOffsets, selectedBubbleId]);

  const formatRequestedPercent = (bubbleId: BubbleId) => {
    const value = offsets[bubbleId] ?? 0;
    if (Math.abs(value) < 0.05) return "0%";
    const rounded = Math.round(value * 10) / 10;
    const s = Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1);
    return `${rounded > 0 ? "+" : ""}${s}%`;
  };

  const formatEffectivePercent = (bubbleId: BubbleId) => {
    const base = BASELINE_COUNTS[bubbleId];
    const continuous = getContinuousZeroSumCount(
      INITIAL_LAYOUT,
      offsets,
      bubbleId
    );
    const pct = base > 0 ? ((continuous / base) - 1) * 100 : 0;
    const rounded = Math.round(pct * 10) / 10;
    if (Math.abs(rounded) < 0.05) return "0%";
    const s = Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1);
    return `${rounded > 0 ? "+" : ""}${s}%`;
  };

  return (
    <div className="flex flex-col items-center gap-8 p-8">
      <div
        className="relative isolate overflow-hidden rounded-2xl bg-[#f7f4ef] shadow-inner [contain:paint]"
        style={{ width: SVG_WIDTH, height: SVG_HEIGHT }}
        aria-label="Bubble grid"
      >
        <ReferenceGrid />

        {BUBBLES.map((bubble) => (
          <BubbleLayer
            key={bubble.id}
            bubbleId={bubble.id}
            color={bubble.color}
            cells={cellsByBubble[bubble.id]}
            grid={grid}
            offsets={offsets}
          />
        ))}
      </div>

      <form
        onSubmit={handleFormSubmit}
        className="flex w-full max-w-md flex-col gap-4 rounded-xl border border-neutral-200 bg-white p-5 shadow-sm"
      >
        <div className="flex flex-col gap-1.5">
          <label
            htmlFor="bubble-color-select"
            className="text-sm font-medium text-neutral-800"
          >
            Color
          </label>
          <select
            id="bubble-color-select"
            value={selectedBubbleId}
            onChange={(e) =>
              handleBubbleChange(e.target.value as BubbleId)
            }
            className="rounded-lg border border-neutral-200 bg-white px-3 py-2 text-sm text-neutral-900 shadow-sm outline-none ring-neutral-300 focus:ring-2"
          >
            {BUBBLES.map((b) => (
              <option key={b.id} value={b.id}>
                {b.label}
              </option>
            ))}
          </select>
        </div>

        <div className="flex flex-col gap-1.5">
          <label
            htmlFor="area-change-percent"
            className="text-sm font-medium text-neutral-800"
          >
            Area change vs initial layout (%)
          </label>
          <p className="text-xs leading-snug text-neutral-500">
            Sets how much larger or smaller this color is than the starting
            layout. Positive increases its area (others shift automatically);
            negative shrinks it.
          </p>
          <input
            id="area-change-percent"
            type="number"
            step="0.1"
            inputMode="decimal"
            value={percentField}
            onChange={(e) => setPercentField(e.target.value)}
            className="w-full rounded-lg border border-neutral-200 px-3 py-2 text-sm text-neutral-900 tabular-nums shadow-sm outline-none ring-neutral-300 focus:ring-2"
            placeholder="0"
          />
        </div>

        <button
          type="submit"
          className="rounded-lg bg-neutral-900 px-4 py-2.5 text-sm font-medium text-white shadow-sm transition hover:bg-neutral-800 active:scale-[0.99]"
        >
          Apply
        </button>
      </form>

      <div className="flex flex-wrap justify-center gap-2 max-w-xl text-center">
        <p className="w-full text-xs font-medium uppercase tracking-wide text-neutral-500">
          Actual area change vs initial (target in tooltip)
        </p>
        {BUBBLES.map((bubble) => (
          <div
            key={bubble.id}
            className={`flex items-center gap-2 rounded-full border px-3 py-1.5 text-sm shadow-sm ${
              bubble.id === selectedBubbleId
                ? "border-neutral-900 bg-neutral-50"
                : "border-neutral-200 bg-white"
            }`}
          >
            <span
              className="h-2.5 w-2.5 rounded-full shrink-0"
              style={{ backgroundColor: bubble.color }}
            />
            <span className="text-neutral-700">{bubble.label}</span>
            <span
              className="tabular-nums text-neutral-500"
              title={`Target ${formatRequestedPercent(bubble.id)} · ${countBubbleCells(grid, bubble.id)} / ${BASELINE_COUNTS[bubble.id]} cells`}
            >
              {formatEffectivePercent(bubble.id)}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
