import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import { decode } from 'jpeg-js';

import {
  CROP_POINTS,
  cropRect,
  frameScores,
  grayFromRgba,
  verdictFromScores,
  type FrameVerdict,
  type GrayCrop,
} from '../utils/frameQuality';
import { deleteQuietly } from './pendingImageFiles';

/** The part of expo-camera's CameraView the sampler uses. */
export interface SamplingCamera {
  takePictureAsync(options: {
    quality: number;
    shutterSound: boolean;
    skipProcessing: boolean;
  }): Promise<{ uri: string; width: number; height: number } | undefined>;
}

function base64ToBytes(base64: string): Uint8Array {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

/**
 * Judge an image already on disk: crop each point at full resolution, decode
 * in JS, score (see frameQuality.ts). Deletes its temporary crops, never the
 * image itself. Returns null when no crop could be read.
 */
export async function scoreImage(
  uri: string,
  width: number,
  height: number,
): Promise<FrameVerdict | null> {
  const crops: GrayCrop[] = [];
  for (const point of CROP_POINTS) {
    const image = await ImageManipulator.manipulate(uri)
      .crop(cropRect(width, height, point))
      .renderAsync();
    const saved = await image.saveAsync({ base64: true, format: SaveFormat.JPEG, compress: 1 });
    deleteQuietly(saved.uri);
    if (!saved.base64) continue;
    const decoded = decode(base64ToBytes(saved.base64), {
      useTArray: true,
      formatAsRGBA: true,
    });
    crops.push({
      gray: grayFromRgba(decoded.data, decoded.width, decoded.height),
      width: decoded.width,
      height: decoded.height,
    });
  }
  if (crops.length === 0) return null;
  const scores = frameScores(crops);
  const verdict = verdictFromScores(scores);
  if (__DEV__) {
    // Calibrates DEVICE_BLUR_THRESHOLD on a real phone; see
    // scripts/calibrate-device-blur.py. Scores only, never pixels.
    // eslint-disable-next-line no-console
    console.log(
      `[FrameQuality] blur=${Math.round(scores.sharpest)} brightness=${Math.round(scores.brightness)} verdict=${verdict}`,
    );
  }
  return verdict;
}

/**
 * Take a silent, low-quality sample photo and judge it with scoreImage. The
 * sample is deleted afterwards. Returns null when the camera gives no photo.
 */
export async function sampleFrame(camera: SamplingCamera): Promise<FrameVerdict | null> {
  const photo = await camera.takePictureAsync({
    quality: 0.3,
    shutterSound: false,
    skipProcessing: true,
  });
  if (!photo?.uri) return null;

  try {
    return await scoreImage(photo.uri, photo.width, photo.height);
  } finally {
    deleteQuietly(photo.uri);
  }
}
