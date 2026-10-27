import {
  BRIGHTNESS_MAX,
  BRIGHTNESS_MIN,
  CROP_SIZE,
  DEVICE_BLUR_THRESHOLD,
  cropRect,
  frameScores,
  frameVerdict,
  grayFromRgba,
  laplacianVariance,
} from '../utils/frameQuality';

function checkerboard(w: number, h: number, lo: number, hi: number): Float64Array {
  const g = new Float64Array(w * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) g[y * w + x] = (x + y) % 2 ? hi : lo;
  return g;
}

function flat(w: number, h: number, v: number): Float64Array {
  return new Float64Array(w * h).fill(v);
}

describe('laplacianVariance (same kernel as the backend: cv2.Laplacian, ksize 1)', () => {
  it('is 0 for a flat image', () => {
    expect(laplacianVariance(flat(8, 8, 120), 8, 8)).toBe(0);
  });

  it('is 0 for a linear ramp, which has no edges', () => {
    const w = 8;
    const ramp = new Float64Array(w * w).map((_, i) => (i % w) * 10);
    expect(laplacianVariance(ramp, w, w)).toBe(0);
  });

  it('matches OpenCV on the same pixels (value from cv2.Laplacian, interior)', () => {
    // prettier-ignore
    const a = [12,40,200,180,90,30, 55,210,15,60,240,120, 100,5,90,250,35,75,
      220,130,60,10,190,45, 80,175,230,140,20,95, 33,66,99,132,165,198];
    expect(laplacianVariance(Float64Array.from(a), 6, 6)).toBeCloseTo(252648.15234375, 6);
  });

  it('is 1020² for a one-pixel 0/255 checkerboard', () => {
    // Every interior pixel scores ±4×255, so the mean is 0 and the variance 1020².
    expect(laplacianVariance(checkerboard(8, 8, 0, 255), 8, 8)).toBe(1020 * 1020);
  });
});

describe('grayFromRgba', () => {
  it('uses the BT.601 weights OpenCV uses', () => {
    const rgba = new Uint8Array([255, 0, 0, 255, 0, 255, 0, 255, 0, 0, 255, 255]);
    const gray = grayFromRgba(rgba, 3, 1);
    expect(Array.from(gray).map((v) => Math.round(v))).toEqual([76, 150, 29]);
  });
});

describe('cropRect', () => {
  it('centres a CROP_SIZE square on the point', () => {
    expect(cropRect(4032, 3024, [0.5, 0.5])).toEqual({
      originX: 2016 - CROP_SIZE / 2,
      originY: 1512 - CROP_SIZE / 2,
      width: CROP_SIZE,
      height: CROP_SIZE,
    });
  });

  it('stays inside the photo near an edge', () => {
    const r = cropRect(500, 500, [0.3, 0.3]);
    expect(r.originX).toBeGreaterThanOrEqual(0);
    expect(r.originX + r.width).toBeLessThanOrEqual(500);
  });

  it('shrinks to the photo when it is smaller than a crop', () => {
    expect(cropRect(200, 300, [0.5, 0.5])).toEqual({
      originX: 0,
      originY: 0,
      width: 200,
      height: 300,
    });
  });
});

describe('frameVerdict', () => {
  const size = 16;
  const crop = (gray: Float64Array) => ({ gray, width: size, height: size });

  it('is ok for a sharp, well-lit view', () => {
    expect(frameVerdict([crop(checkerboard(size, size, 60, 200))])).toBe('ok');
  });

  it('is blurry when no crop has enough detail', () => {
    expect(frameVerdict([crop(flat(size, size, 128)), crop(flat(size, size, 140))])).toBe('blurry');
  });

  it('lets the sharpest crop decide, so blank paper in one crop is fine', () => {
    expect(
      frameVerdict([crop(flat(size, size, 230)), crop(checkerboard(size, size, 60, 200))]),
    ).toBe('ok');
  });

  it('says dark before blurry, since a dark frame also reads blurry', () => {
    expect(frameVerdict([crop(flat(size, size, BRIGHTNESS_MIN - 10))])).toBe('dark');
  });

  it('says bright for a washed-out view', () => {
    expect(frameVerdict([crop(flat(size, size, BRIGHTNESS_MAX + 2))])).toBe('bright');
  });

  it('puts the blur threshold between the calibrated sharp and blurry crops', () => {
    // scripts/calibrate-device-blur.py: the backend accepts crops scoring 1151+
    // and rejects 723 and below.
    expect(DEVICE_BLUR_THRESHOLD).toBeGreaterThan(723);
    expect(DEVICE_BLUR_THRESHOLD).toBeLessThan(1151);
  });
});

describe('frameScores', () => {
  it('gives the sharpest crop and the mean brightness over all crops', () => {
    const size = 8;
    const scores = frameScores([
      { gray: flat(size, size, 100), width: size, height: size },
      { gray: checkerboard(size, size, 0, 255), width: size, height: size },
    ]);
    expect(scores.sharpest).toBe(1020 * 1020);
    expect(scores.brightness).toBeCloseTo((100 + 127.5) / 2, 6);
  });

  it('is zero for no crops', () => {
    expect(frameScores([])).toEqual({ sharpest: 0, brightness: 0 });
  });
});
