import { BubbleId, COLS, ROWS, cellKey } from "./types";

type CornerRadii = {
  tl: number;
  tr: number;
  br: number;
  bl: number;
};

type EdgePads = {
  top: number;
  right: number;
  bottom: number;
  left: number;
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

/** Corner is rounded only on the blob boundary (sharp at interior junctions). */
const cornerRadiiForCell = (
  grid: Record<string, BubbleId>,
  bubbleId: BubbleId,
  col: number,
  row: number,
  cornerRadius: number
): CornerRadii => {
  const same = (c: number, r: number) => getOwner(grid, c, r) === bubbleId;

  const sameTop = same(col, row - 1);
  const sameBottom = same(col, row + 1);
  const sameLeft = same(col - 1, row);
  const sameRight = same(col + 1, row);

  return {
    tl: sameTop && sameLeft ? 0 : cornerRadius,
    tr: sameTop && sameRight ? 0 : cornerRadius,
    br: sameBottom && sameRight ? 0 : cornerRadius,
    bl: sameBottom && sameLeft ? 0 : cornerRadius,
  };
};

/** Shared sides use tiny overlap (goo merge); exterior sides use full bleed. */
const edgePadsForCell = (
  grid: Record<string, BubbleId>,
  bubbleId: BubbleId,
  col: number,
  row: number,
  outerPad: number,
  innerPad = 1
): EdgePads => {
  const same = (c: number, r: number) => getOwner(grid, c, r) === bubbleId;

  return {
    top: same(col, row - 1) ? innerPad : outerPad,
    right: same(col + 1, row) ? innerPad : outerPad,
    bottom: same(col, row + 1) ? innerPad : outerPad,
    left: same(col - 1, row) ? innerPad : outerPad,
  };
};

export const getBubbleCellPath = (
  grid: Record<string, BubbleId>,
  bubbleId: BubbleId,
  col: number,
  row: number,
  cellSize: number,
  outerPad = Math.max(2, Math.round(cellSize * (3 / 36)))
): string => {
  const cornerRadius = Math.min(cellSize * 0.31, cellSize / 2 - 1);
  const innerPad = Math.max(1, Math.round(cellSize / 24));
  const pads = edgePadsForCell(
    grid,
    bubbleId,
    col,
    row,
    outerPad,
    innerPad
  );
  const corners = cornerRadiiForCell(
    grid,
    bubbleId,
    col,
    row,
    cornerRadius
  );

  const x = col * cellSize - pads.left;
  const y = row * cellSize - pads.top;
  const w = cellSize + pads.left + pads.right;
  const h = cellSize + pads.top + pads.bottom;

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
