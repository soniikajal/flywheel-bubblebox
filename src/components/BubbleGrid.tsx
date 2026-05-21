"use client";

import { motion, useAnimation } from "framer-motion";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
} from "react";
import {
  applyOffsetsToGrid,
  applyPercentOffsetsFromBaseline,
  type BubblePercentOffsets,
  getBaselineCellCounts,
  getEffectivePercentVisual,
  parseBubbleOffsets,
} from "@/lib/bubbleGrid/adjustments";
import {
  getBubbleCentroid,
  getBubbleOutlinePaths,
} from "@/lib/bubbleGrid/bubbleOutline";
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

/** Decaying squish + slight twist — reads as goo, not a discrete snap. */
const JELLY_WOBBLE = {
  scaleX: [1, 1.068, 0.978, 1.03, 0.994, 1.003, 1.001, 1] as number[],
  scaleY: [1, 0.934, 1.055, 0.972, 1.008, 0.997, 0.999, 1] as number[],
  rotate: [0, 0.65, -0.48, 0.28, -0.1, 0.04, 0.012, 0] as number[],
  transition: {
    duration: 0.82,
    times: [0, 0.1, 0.26, 0.42, 0.56, 0.68, 0.84, 1],
    ease: [
      [0.22, 0.55, 0.36, 1],
      [0.34, 1.15, 0.55, 1],
      [0.25, 0.85, 0.4, 1],
      [0.33, 1, 0.68, 1],
      [0.22, 0.85, 0.36, 1],
      [0.25, 0.55, 0.25, 1],
      [0.22, 0.35, 0.25, 1],
    ] as [number, number, number, number][],
  },
};

function bubbleGridSignature(
  grid: Record<string, BubbleId>,
  bubbleId: BubbleId
): string {
  const keys: string[] = [];
  for (const [key, owner] of Object.entries(grid)) {
    if (owner === bubbleId) keys.push(key);
  }
  return keys.sort().join("|");
}

function useJellyWobble(pulse: number) {
  const wobble = useAnimation();

  useEffect(() => {
    if (pulse === 0) return;

    let cancelled = false;
    const run = async () => {
      if (cancelled) return;
      await wobble.start(JELLY_WOBBLE);
    };

    void run();
    return () => {
      cancelled = true;
    };
  }, [pulse, wobble]);

  return wobble;
}

type JellyPathsProps = {
  paths: string[];
  idPrefix: string;
  fill: string;
  filterId?: string;
  centroid: { x: number; y: number };
  wobble: ReturnType<typeof useAnimation>;
  outlineEpoch: number;
  topologySignature: string;
};

/** Static paths only — morphing `d` across topologies causes glitches. */
function JellyPaths({
  paths,
  idPrefix,
  fill,
  filterId,
  centroid,
  wobble,
  outlineEpoch,
  topologySignature,
}: JellyPathsProps) {
  const lastPathsRef = useRef<string[]>([]);
  const lastSigRef = useRef(topologySignature);
  const lastEpochRef = useRef(outlineEpoch);
  if (
    outlineEpoch !== lastEpochRef.current ||
    topologySignature !== lastSigRef.current
  ) {
    lastEpochRef.current = outlineEpoch;
    lastSigRef.current = topologySignature;
    lastPathsRef.current = [];
  }
  const canFallback =
    paths.length === 0 &&
    lastPathsRef.current.length > 0 &&
    topologySignature === lastSigRef.current;
  const displayPaths =
    paths.length > 0 ? paths : canFallback ? lastPathsRef.current : [];
  if (paths.length > 0) {
    lastPathsRef.current = paths;
    lastSigRef.current = topologySignature;
  }

  if (displayPaths.length === 0) return null;

  const origin = `${centroid.x}px ${centroid.y}px`;
  const pathsContent = displayPaths.map((d, i) => (
    <path key={`${idPrefix}-${i}`} d={d} />
  ));

  const group = (
    <motion.g
      initial={{ scaleX: 1, scaleY: 1, rotate: 0 }}
      animate={wobble}
      style={{ transformOrigin: origin, transformBox: "fill-box" }}
    >
      {pathsContent}
    </motion.g>
  );

  if (filterId) {
    return (
      <g filter={`url(#${filterId})`} fill={fill}>
        {group}
      </g>
    );
  }

  return <g fill={fill}>{group}</g>;
}

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
  paths: string[];
  cells: Array<{ col: number; row: number }>;
  jellyPulse: number;
  outlineEpoch: number;
  topologySignature: string;
};

function BubbleLayer({
  bubbleId,
  color,
  paths,
  cells,
  jellyPulse,
  outlineEpoch,
  topologySignature,
}: BubbleLayerProps) {
  const filterId = `goo-${bubbleId}`;
  const centroid = useMemo(() => getBubbleCentroid(cells, CELL_SIZE), [cells]);
  const wobble = useJellyWobble(jellyPulse);

  if (paths.length === 0 && cells.length === 0) return null;

  return (
    <div
      className="pointer-events-none absolute inset-0 overflow-hidden"
      data-bubble={bubbleId}
    >
      <svg
        width={SVG_WIDTH}
        height={SVG_HEIGHT}
        viewBox={VIEW_BOX}
        overflow="hidden"
        className="block h-full w-full"
        aria-hidden
      >
        <defs>
          <GooFilter id={filterId} />
        </defs>
        <JellyPaths
          paths={paths}
          idPrefix={bubbleId}
          fill={color}
          filterId={filterId}
          centroid={centroid}
          wobble={wobble}
          outlineEpoch={outlineEpoch}
          topologySignature={topologySignature}
        />
      </svg>
    </div>
  );
}

/** Rounded underlay (same geometry as goo layers) — fills gaps without square corners. */
function CoverageUnderlay({
  cellsByBubble,
}: {
  cellsByBubble: Record<BubbleId, Array<{ col: number; row: number }>>;
}) {
  const layers = useMemo(
    () =>
      BUBBLES.map((bubble) => ({
        id: bubble.id,
        color: bubble.color,
        paths: getBubbleOutlinePaths(cellsByBubble[bubble.id], CELL_SIZE),
      })).filter((l) => l.paths.length > 0),
    [cellsByBubble]
  );

  if (layers.length === 0) return null;

  return (
    <svg
      width={SVG_WIDTH}
      height={SVG_HEIGHT}
      viewBox={VIEW_BOX}
      className="pointer-events-none absolute inset-0"
      aria-hidden
    >
      {layers.map((layer) => (
        <g key={`underlay-${layer.id}`} fill={layer.color}>
          {layer.paths.map((d, i) => (
            <path key={`${layer.id}-${i}`} d={d} />
          ))}
        </g>
      ))}
    </svg>
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
  /** Bubble used for cell-first sync on last Apply — not the dropdown selection. */
  const [layoutFocusId, setLayoutFocusId] = useState<BubbleId>(BUBBLES[0]!.id);
  const [percentField, setPercentField] = useState("0");
  const [wigglePulse, setWigglePulse] = useState<
    Partial<Record<BubbleId, number>>
  >({});
  const [outlineEpoch, setOutlineEpoch] = useState(0);

  const triggerJellyWobble = useCallback((focusId: BubbleId) => {
    setOutlineEpoch((e) => e + 1);
    setWigglePulse((prev) => ({
      ...prev,
      [focusId]: (prev[focusId] ?? 0) + 1,
    }));
  }, []);

  const applyOffsets = useCallback(
    (nextOffsets: BubblePercentOffsets, focusId?: BubbleId) => {
      const focus = focusId ?? layoutFocusId;
      setOffsets(nextOffsets);
      setLayoutFocusId(focus);
      setGrid(
        applyOffsetsToGrid(
          { ...INITIAL_LAYOUT },
          INITIAL_LAYOUT,
          nextOffsets,
          focus
        )
      );
      triggerJellyWobble(focus);
    },
    [layoutFocusId, triggerJellyWobble]
  );

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

  const visualPaths = useMemo(() => {
    const out = {} as Record<BubbleId, string[]>;
    for (const { id } of BUBBLES) {
      out[id] = getBubbleOutlinePaths(cellsByBubble[id], CELL_SIZE);
    }
    return out;
  }, [cellsByBubble]);

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
    const current = offsets[selectedBubbleId] ?? 0;
    if (Math.abs(target - current) < 0.001) return;

    const next: BubblePercentOffsets = { ...offsets };
    if (Math.abs(target) < 0.001) delete next[selectedBubbleId];
    else next[selectedBubbleId] = target;

    setOffsets(next);
    setLayoutFocusId(selectedBubbleId);
    setGrid(
      applyOffsetsToGrid(
        { ...INITIAL_LAYOUT },
        INITIAL_LAYOUT,
        next,
        selectedBubbleId
      )
    );
    triggerJellyWobble(selectedBubbleId);
    setPercentField(Math.abs(target) < 0.05 ? "0" : String(target));
  }, [percentField, selectedBubbleId, offsets, triggerJellyWobble]);

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
    const pct = getEffectivePercentVisual(
      grid,
      INITIAL_LAYOUT,
      offsets,
      bubbleId
    );
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
        <CoverageUnderlay cellsByBubble={cellsByBubble} />

        <ReferenceGrid />

        {BUBBLES.map((bubble) => (
          <BubbleLayer
            key={bubble.id}
            bubbleId={bubble.id}
            color={bubble.color}
            paths={visualPaths[bubble.id]}
            cells={cellsByBubble[bubble.id]}
            jellyPulse={
              bubble.id === layoutFocusId ? (wigglePulse[bubble.id] ?? 0) : 0
            }
            outlineEpoch={outlineEpoch}
            topologySignature={bubbleGridSignature(grid, bubble.id)}
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
