export type BubbleId = "orange" | "yellow" | "blue" | "purple" | "green";

export type Cell = { col: number; row: number };

export type BubbleConfig = {
  id: BubbleId;
  color: string;
  label: string;
};

/** Logical grid is 4×6; each cell is subdivided for finer grow/shrink steps. */
export const SUBDIVISION = 3;
export const LOGICAL_COLS = 4;
export const LOGICAL_ROWS = 6;
export const COLS = LOGICAL_COLS * SUBDIVISION;
export const ROWS = LOGICAL_ROWS * SUBDIVISION;

export const BUBBLES: BubbleConfig[] = [
  { id: "orange", color: "#FF6B35", label: "Orange" },
  { id: "yellow", color: "#FFD166", label: "Yellow" },
  { id: "blue", color: "#84C5F4", label: "Blue" },
  { id: "purple", color: "#C9B1FF", label: "Purple" },
  { id: "green", color: "#A8D835", label: "Green" },
];

export const cellKey = (col: number, row: number) => `${col},${row}`;

export const parseCellKey = (key: string): Cell => {
  const [col, row] = key.split(",").map(Number);
  return { col, row };
};
