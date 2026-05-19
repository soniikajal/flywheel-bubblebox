import { BubbleId, SUBDIVISION, cellKey } from "./types";

type LogicalCell = { col: number; row: number; bubbleId: BubbleId };

const LOGICAL_CELLS: LogicalCell[] = [
  { col: 0, row: 0, bubbleId: "orange" },
  { col: 1, row: 0, bubbleId: "orange" },
  { col: 0, row: 1, bubbleId: "orange" },

  { col: 2, row: 0, bubbleId: "yellow" },
  { col: 3, row: 0, bubbleId: "yellow" },
  { col: 1, row: 1, bubbleId: "yellow" },
  { col: 2, row: 1, bubbleId: "yellow" },
  { col: 3, row: 1, bubbleId: "yellow" },
  { col: 1, row: 2, bubbleId: "yellow" },

  { col: 0, row: 2, bubbleId: "purple" },
  { col: 0, row: 3, bubbleId: "purple" },
  { col: 1, row: 3, bubbleId: "purple" },
  { col: 0, row: 4, bubbleId: "purple" },

  { col: 2, row: 2, bubbleId: "blue" },
  { col: 3, row: 2, bubbleId: "blue" },
  { col: 2, row: 3, bubbleId: "blue" },
  { col: 3, row: 3, bubbleId: "blue" },
  { col: 1, row: 4, bubbleId: "blue" },
  { col: 2, row: 4, bubbleId: "blue" },

  { col: 3, row: 4, bubbleId: "green" },
  { col: 0, row: 5, bubbleId: "green" },
  { col: 1, row: 5, bubbleId: "green" },
  { col: 2, row: 5, bubbleId: "green" },
  { col: 3, row: 5, bubbleId: "green" },
];

/** Fine grid: each logical cell becomes SUBDIVISION² fine cells. */
export const INITIAL_LAYOUT: Record<string, BubbleId> = (() => {
  const layout: Record<string, BubbleId> = {};
  for (const { col, row, bubbleId } of LOGICAL_CELLS) {
    for (let dr = 0; dr < SUBDIVISION; dr++) {
      for (let dc = 0; dc < SUBDIVISION; dc++) {
        layout[cellKey(col * SUBDIVISION + dc, row * SUBDIVISION + dr)] =
          bubbleId;
      }
    }
  }
  return layout;
})();
