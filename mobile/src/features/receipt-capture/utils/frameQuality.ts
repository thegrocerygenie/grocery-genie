/**
 * RC-01 AC 2: judge a camera frame before capture, the way the backend judges
 * the photo after it (backend/app/image/preprocessor.py), so the warning shows
 * before the user takes a photo the server would reject.
 *
 * Blur is the variance of the 4-neighbour Laplacian, as in cv2.Laplacian.
 * That score depends on pixel scale, so it runs on crops at the photo's full
 * resolution, never on a shrunk frame (a shrunk frame hides blur). The
 * sharpest crop decides: any crisp text in view means the lens is focused.
 * DEVICE_BLUR_THRESHOLD comes from scripts/calibrate-device-blur.py.
 */

export const CROP_SIZE = 384;

/** Centre, and the four points a quarter of the way in from each corner. */
export const CROP_POINTS: readonly (readonly [number, number])[] = [
  [0.5, 0.5],
  [0.3, 0.3],
  [0.7, 0.3],
  [0.3, 0.7],
  [0.7, 0.7],
];

/** Calibrated: the backend accepts crops scoring 1151+ and rejects 723 and below. */
export const DEVICE_BLUR_THRESHOLD = 900;

/** The backend's brightness bounds (mean gray, 0–255). */
export const BRIGHTNESS_MIN = 40;
export const BRIGHTNESS_MAX = 250;

export type FrameVerdict = 'ok' | 'blurry' | 'dark' | 'bright';

export interface GrayCrop {
  gray: Float64Array;
  width: number;
  height: number;
}

/** RGBA bytes to gray, with the BT.601 weights cv2.cvtColor uses. */
export function grayFromRgba(rgba: Uint8Array, width: number, height: number): Float64Array {
  const gray = new Float64Array(width * height);
  for (let i = 0; i < gray.length; i++) {
    gray[i] = 0.299 * rgba[i * 4] + 0.587 * rgba[i * 4 + 1] + 0.114 * rgba[i * 4 + 2];
  }
  return gray;
}

/** Variance of the 4-neighbour Laplacian over the interior pixels. */
export function laplacianVariance(gray: Float64Array, width: number, height: number): number {
  let sum = 0;
  let sumSq = 0;
  let n = 0;
  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      const i = y * width + x;
      const lap = gray[i - 1] + gray[i + 1] + gray[i - width] + gray[i + width] - 4 * gray[i];
      sum += lap;
      sumSq += lap * lap;
      n++;
    }
  }
  if (n === 0) return 0;
  const mean = sum / n;
  return sumSq / n - mean * mean;
}

/** A CROP_SIZE square centred on a point (fractions of the photo), kept inside it. */
export function cropRect(
  photoWidth: number,
  photoHeight: number,
  [fx, fy]: readonly [number, number],
): { originX: number; originY: number; width: number; height: number } {
  const width = Math.min(CROP_SIZE, photoWidth);
  const height = Math.min(CROP_SIZE, photoHeight);
  const clamp = (v: number, max: number) => Math.max(0, Math.min(v, max));
  return {
    originX: clamp(Math.round(photoWidth * fx - width / 2), photoWidth - width),
    originY: clamp(Math.round(photoHeight * fy - height / 2), photoHeight - height),
    width,
    height,
  };
}

export interface FrameScores {
  /** Laplacian variance of the sharpest crop. */
  sharpest: number;
  /** Mean gray over all crops. */
  brightness: number;
}

export function frameScores(crops: GrayCrop[]): FrameScores {
  let total = 0;
  let pixels = 0;
  let sharpest = 0;
  for (const { gray, width, height } of crops) {
    for (let i = 0; i < gray.length; i++) total += gray[i];
    pixels += gray.length;
    sharpest = Math.max(sharpest, laplacianVariance(gray, width, height));
  }
  return { sharpest, brightness: pixels > 0 ? total / pixels : 0 };
}

/**
 * Light first: a dark or washed-out frame also scores as blurry, and "find
 * more light" is the advice that fixes it.
 */
export function frameVerdict(crops: GrayCrop[]): FrameVerdict {
  return verdictFromScores(frameScores(crops));
}

export function verdictFromScores({ sharpest, brightness }: FrameScores): FrameVerdict {
  if (brightness < BRIGHTNESS_MIN) return 'dark';
  if (brightness > BRIGHTNESS_MAX) return 'bright';
  if (sharpest < DEVICE_BLUR_THRESHOLD) return 'blurry';
  return 'ok';
}
