import { encode } from 'jpeg-js';

import { CROP_POINTS, CROP_SIZE } from '../utils/frameQuality';
import { sampleFrame } from '../services/frameSampler';

/** A real JPEG, as the image manipulator would return it. */
function jpegBase64(fill: (x: number, y: number) => number, size = 64): string {
  const data = Buffer.alloc(size * size * 4);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const v = fill(x, y);
      const i = (y * size + x) * 4;
      data[i] = v;
      data[i + 1] = v;
      data[i + 2] = v;
      data[i + 3] = 255;
    }
  }
  return encode({ data, width: size, height: size }, 95).data.toString('base64');
}

const SHARP = jpegBase64((x, y) => ((Math.floor(x / 4) + Math.floor(y / 4)) % 2 ? 220 : 40));
const FLAT = jpegBase64(() => 160);
const DARK = jpegBase64(() => 12);

let mockCropB64 = SHARP;
const mockCrops: unknown[] = [];
jest.mock('expo-image-manipulator', () => ({
  SaveFormat: { JPEG: 'jpeg' },
  ImageManipulator: {
    manipulate: () => {
      const context = {
        crop(rect: unknown) {
          mockCrops.push(rect);
          return context;
        },
        renderAsync: async () => ({
          saveAsync: async () => ({ uri: 'file:///cache/crop.jpg', base64: mockCropB64 }),
        }),
      };
      return context;
    },
  },
}));
const mockDeleted: string[] = [];
jest.mock('../services/pendingImageFiles', () => ({
  deleteQuietly: (uri: string) => mockDeleted.push(uri),
}));

const takePictureAsync = jest.fn();
const camera = { takePictureAsync };

beforeEach(() => {
  mockCrops.length = 0;
  mockDeleted.length = 0;
  takePictureAsync.mockReset().mockResolvedValue({
    uri: 'file:///cache/sample.jpg',
    width: 4032,
    height: 3024,
  });
});

describe('sampleFrame', () => {
  it('takes a silent, cheap sample photo', async () => {
    await sampleFrame(camera);
    expect(takePictureAsync).toHaveBeenCalledWith({
      quality: 0.3,
      shutterSound: false,
      skipProcessing: true,
    });
  });

  it('crops each point at full scale and says ok for a sharp view', async () => {
    mockCropB64 = SHARP;
    expect(await sampleFrame(camera)).toBe('ok');
    expect(mockCrops).toHaveLength(CROP_POINTS.length);
    expect(mockCrops[0]).toMatchObject({ width: CROP_SIZE, height: CROP_SIZE });
  });

  it('says blurry for a view with no detail', async () => {
    mockCropB64 = FLAT;
    expect(await sampleFrame(camera)).toBe('blurry');
  });

  it('says dark for a dark view', async () => {
    mockCropB64 = DARK;
    expect(await sampleFrame(camera)).toBe('dark');
  });

  it('deletes the sample photo and every crop', async () => {
    await sampleFrame(camera);
    expect(mockDeleted).toContain('file:///cache/sample.jpg');
    expect(mockDeleted.filter((u) => u === 'file:///cache/crop.jpg')).toHaveLength(
      CROP_POINTS.length,
    );
  });

  describe('dev score log, for calibrating DEVICE_BLUR_THRESHOLD on a phone', () => {
    const dev = __DEV__;
    const setDev = (on: boolean) => {
      (globalThis as unknown as { __DEV__: boolean }).__DEV__ = on;
    };
    let log: jest.SpyInstance;
    beforeEach(() => {
      log = jest.spyOn(console, 'log').mockImplementation(() => {});
    });
    afterEach(() => {
      log.mockRestore();
      setDev(dev);
    });

    it('logs the blur score, brightness, and verdict of each sample in dev', async () => {
      setDev(true);
      mockCropB64 = FLAT;
      await sampleFrame(camera);
      expect(log).toHaveBeenCalledTimes(1);
      expect(log.mock.calls[0][0]).toMatch(
        /^\[FrameQuality\] blur=\d+ brightness=\d+ verdict=blurry$/,
      );
    });

    it('logs nothing in a release build', async () => {
      setDev(false);
      await sampleFrame(camera);
      expect(log).not.toHaveBeenCalled();
    });
  });

  it('returns null when the camera gives no photo', async () => {
    takePictureAsync.mockResolvedValue(undefined);
    expect(await sampleFrame(camera)).toBeNull();
  });
});
