import type { BubblePercentOffsets } from "./adjustments";
import {
  RASTER_SCALE,
  computeOwnershipField,
  type OwnershipField,
} from "./weightedField";
import { contoursFromMask } from "./marchingSquares";
import { BubbleId, BUBBLES } from "./types";

export const BLUR_RADIUS = 7;
export const MASK_THRESHOLD = 0.5;

export type BubbleMaskPaths = Record<BubbleId, string[]>;

const gaussianKernel = (radius: number): number[] => {
  const sigma = radius / 2;
  const size = radius * 2 + 1;
  const kernel: number[] = [];
  let sum = 0;
  for (let i = 0; i < size; i++) {
    const x = i - radius;
    const v = Math.exp(-(x * x) / (2 * sigma * sigma));
    kernel.push(v);
    sum += v;
  }
  return kernel.map((v) => v / sum);
};

const blurHorizontal = (
  src: Float32Array,
  dst: Float32Array,
  w: number,
  h: number,
  kernel: number[]
) => {
  const r = (kernel.length - 1) / 2;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let sum = 0;
      for (let k = -r; k <= r; k++) {
        const sx = Math.min(w - 1, Math.max(0, x + k));
        sum += src[y * w + sx] * kernel[k + r]!;
      }
      dst[y * w + x] = sum;
    }
  }
};

const blurVertical = (
  src: Float32Array,
  dst: Float32Array,
  w: number,
  h: number,
  kernel: number[]
) => {
  const r = (kernel.length - 1) / 2;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let sum = 0;
      for (let k = -r; k <= r; k++) {
        const sy = Math.min(h - 1, Math.max(0, y + k));
        sum += src[sy * w + x] * kernel[k + r]!;
      }
      dst[y * w + x] = sum;
    }
  }
};

const blurField = (field: Float32Array, w: number, h: number): Float32Array => {
  const kernel = gaussianKernel(Math.round(BLUR_RADIUS / RASTER_SCALE) || 1);
  const tmp = new Float32Array(field.length);
  const out = new Float32Array(field.length);
  blurHorizontal(field, tmp, w, h, kernel);
  blurVertical(tmp, out, w, h, kernel);
  return out;
};

const maskForBubble = (
  field: OwnershipField,
  bubbleId: BubbleId
): Float32Array => {
  const { width, height, owners } = field;
  const mask = new Float32Array(width * height);
  for (let i = 0; i < owners.length; i++) {
    mask[i] = owners[i] === bubbleId ? 1 : 0;
  }
  return blurField(mask, width, height);
};

export const pathsFromOwnership = (
  field: OwnershipField,
  scale: number
): BubbleMaskPaths => {
  const cellW = scale;
  const cellH = scale;

  return BUBBLES.reduce(
    (acc, { id }) => {
      const blurred = maskForBubble(field, id);
      acc[id] =
        contoursFromMask(
          blurred,
          field.width,
          field.height,
          cellW,
          cellH,
          MASK_THRESHOLD
        ) ?? [];
      return acc;
    },
    {} as BubbleMaskPaths
  );
};

export const renderBubblePaths = (
  screenWidth: number,
  screenHeight: number,
  offsets: BubblePercentOffsets,
  baseline: Record<string, BubbleId>
): { paths: BubbleMaskPaths; field: OwnershipField } => {
  const field = computeOwnershipField(
    screenWidth,
    screenHeight,
    offsets,
    baseline
  );
  const paths = pathsFromOwnership(field, RASTER_SCALE);
  return { paths, field };
};
