import { BubbleId, COLS, ROWS, cellKey, parseCellKey } from "./types";
import { BUBBLES } from "./types";

const BUBBLE_INDEX: Record<BubbleId, number> = {
  orange: 1,
  yellow: 2,
  blue: 3,
  purple: 4,
  green: 5,
};

export type PixelMap = {
  width: number;
  height: number;
  /** owner per cell key from grid (source of truth for SVG circles) */
  cellsByBubble: Record<BubbleId, Array<{ col: number; row: number }>>;
};

export const getCellCenter = (
  col: number,
  row: number,
  cellSize: number
) => ({
  x: (col + 0.5) * cellSize,
  y: (row + 0.5) * cellSize,
});

/** Build per-bubble cell lists and rasterize ownership onto an offscreen canvas. */
export function buildPixelMap(
  grid: Record<string, BubbleId>,
  width: number,
  height: number,
  cellSize: number
): PixelMap {
  const cellsByBubble = BUBBLES.reduce(
    (acc, bubble) => {
      acc[bubble.id] = [];
      return acc;
    },
    {} as Record<BubbleId, Array<{ col: number; row: number }>>
  );

  for (const key of Object.keys(grid)) {
    const owner = grid[key];
    if (!owner) continue;
    cellsByBubble[owner].push(parseCellKey(key));
  }

  if (typeof document !== "undefined") {
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (ctx) {
      ctx.clearRect(0, 0, width, height);
      const radius = cellSize / 2;

      for (let row = 0; row < ROWS; row++) {
        for (let col = 0; col < COLS; col++) {
          const owner = grid[cellKey(col, row)];
          if (!owner) continue;

          const index = BUBBLE_INDEX[owner];
          const { x, y } = getCellCenter(col, row, cellSize);

          ctx.beginPath();
          ctx.arc(x, y, radius, 0, Math.PI * 2);
          ctx.closePath();
          ctx.fillStyle = `rgb(${index}, 0, 0)`;
          ctx.fill();
        }
      }
    }
  }

  return { width, height, cellsByBubble };
}
