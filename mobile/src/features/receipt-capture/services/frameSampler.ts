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
 * Take a silent, low-quality sample photo and judge it (see frameQuality.ts).
 * Crops are cut at full resolution, decoded in JS, and every temporary file
 * is deleted. Returns null when the camera gives no photo.
 */
export async function sampleFrame(camera: SamplingCamera): Promise<FrameVerdict | null> {
  const photo = await camera.takePictureAsync({
    quality: 0.3,
    shutterSound: false,
    skipProcessing: true,
  });
  if (!photo?.uri) return null;

  try {
    const crops: GrayCrop[] = [];
    for (const point of CROP_POINTS) {
      const image = await ImageManipulator.manipulate(photo.uri)
        .crop(cropRect(photo.width, photo.height, point))
        .renderAsync();
      const saved = await image.saveAsync({ base64: true, format: SaveFormat.JPEG, compress: 1 });
      deleteQuietly(saved.uri);
      if (!saved.base64) continue;
      const { data, width, height } = decode(base64ToBytes(saved.base64), {
        useTArray: true,
        formatAsRGBA: true,
      });
      crops.push({ gray: grayFromRgba(data, width, height), width, height });
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
  } finally {
    deleteQuietly(photo.uri);
  }
}
