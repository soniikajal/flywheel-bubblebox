import { BubbleId, COLS, ROWS, cellKey } from "./types";

const CORNER_RADIUS = 22;

type CornerRadii = {
  tl: number;
  tr: number;
  br: number;
  bl: number;
};

const variableRoundedRectPath = (
  x: number,
  y: number,
  w: number,
  h: number,
  r: CornerRadii
): string => {
  const rtl = Math.min(r.tl, w / 2, h / 2);
  const rtr = Math.min(r.tr, w / 2, h / 2);
  const rbr = Math.min(r.br, w / 2, h / 2);
  const rbl = Math.min(r.bl, w / 2, h / 2);

  return [
    `M ${x + rtl} ${y}`,
    `H ${x + w - rtr}`,
    rtr > 0 ? `A ${rtr} ${rtr} 0 0 1 ${x + w} ${y + rtr}` : `L ${x + w} ${y}`,
    `V ${y + h - rbr}`,
    rbr > 0 ? `A ${rbr} ${rbr} 0 0 1 ${x + w - rbr} ${y + h}` : `L ${x + w} ${y + h}`,
    `H ${x + rbl}`,
    rbl > 0 ? `A ${rbl} ${rbl} 0 0 1 ${x} ${y + h - rbl}` : `L ${x} ${y + h}`,
    `V ${y + rtl}`,
    rtl > 0 ? `A ${rtl} ${rtl} 0 0 1 ${x + rtl} ${y}` : `L ${x} ${y}`,
    "Z",
  ].join(" ");
};

const getOwner = (
  grid: Record<string, BubbleId>,
  col: number,
  row: number
): BubbleId | null => {
  if (col < 0 || col >= COLS || row < 0 || row >= ROWS) return null;
  return grid[cellKey(col, row)] ?? null;
};

/** Corner is rounded only when it lies on the blob boundary (not interior grid junction). */
const cornerRadiiForCell = (
  grid: Record<string, BubbleId>,
  bubbleId: BubbleId,
  col: number,
  row: number
): CornerRadii => {
  const same = (c: number, r: number) => getOwner(grid, c, r) === bubbleId;

  const sameTop = same(col, row - 1);
  const sameBottom = same(col, row + 1);
  const sameLeft = same(col - 1, row);
  const sameRight = same(col + 1, row);

  return {
    tl: sameTop && sameLeft ? 0 : CORNER_RADIUS,
    tr: sameTop && sameRight ? 0 : CORNER_RADIUS,
    br: sameBottom && sameRight ? 0 : CORNER_RADIUS,
    bl: sameBottom && sameLeft ? 0 : CORNER_RADIUS,
  };
};

export const getBubbleCellPath = (
  grid: Record<string, BubbleId>,
  bubbleId: BubbleId,
  col: number,
  row: number,
  cellSize: number,
  pad = 3
): string => {
  const x = col * cellSize - pad;
  const y = row * cellSize - pad;
  const w = cellSize + pad * 2;
  const h = cellSize + pad * 2;
  const corners = cornerRadiiForCell(grid, bubbleId, col, row);

  return variableRoundedRectPath(x, y, w, h, corners);
};

export const getBubbleCellCenter = (
  col: number,
  row: number,
  cellSize: number
) => ({
  x: (col + 0.5) * cellSize,
  y: (row + 0.5) * cellSize,
});
