import { BubbleId, cellKey } from "./types";

export const INITIAL_LAYOUT: Record<string, BubbleId> = {
  [cellKey(0, 0)]: "orange",
  [cellKey(1, 0)]: "orange",
  [cellKey(0, 1)]: "orange",
  [cellKey(0, 2)]: "orange",
  [cellKey(0, 3)]: "orange",

  [cellKey(2, 0)]: "yellow",
  [cellKey(3, 0)]: "yellow",
  [cellKey(4, 0)]: "yellow",
  [cellKey(4, 1)]: "yellow",
  [cellKey(1, 1)]: "yellow",
  [cellKey(2, 1)]: "yellow",
  [cellKey(3, 1)]: "yellow",
  [cellKey(1, 2)]: "yellow",
  [cellKey(2, 2)]: "yellow",
  [cellKey(1, 3)]: "yellow",

  [cellKey(3, 2)]: "blue",
  [cellKey(4, 2)]: "blue",
  [cellKey(2, 3)]: "blue",
  [cellKey(3, 3)]: "blue",
  [cellKey(4, 3)]: "blue",
  [cellKey(2, 4)]: "blue",
  [cellKey(3, 4)]: "blue",
  [cellKey(1, 4)]: "blue",
  [cellKey(2, 5)]: "blue",
  [cellKey(3, 5)]: "blue",
  [cellKey(4, 4)]: "blue",

  [cellKey(0, 4)]: "purple",
  [cellKey(1, 5)]: "purple",
  [cellKey(0, 5)]: "purple",
  [cellKey(0, 6)]: "purple",
  [cellKey(1, 6)]: "purple",

  [cellKey(4, 5)]: "green",
  [cellKey(2, 6)]: "green",
  [cellKey(3, 6)]: "green",
  [cellKey(4, 6)]: "green",
};
