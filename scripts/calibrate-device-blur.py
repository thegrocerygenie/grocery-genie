"""Calibrate the on-device blur threshold (mobile frameQuality.ts) against the
backend check (backend/app/image/preprocessor.py).

Backend: variance of the 4-neighbour Laplacian of the full-resolution gray
photo; blurry below 100. Device: the same score on CROP-px squares cut at full
pixel scale from a JPEG sample saved at quality Q, max over five crop points.
Renders synthetic receipts, blurs them by increasing amounts, and prints the
device threshold whose verdict agrees with the backend, plus the score ranges.

Run: backend/.venv/bin/python -I scripts/calibrate-device-blur.py [CROP] [Q]
Defaults: 384 30, as the app uses. Re-run with real receipts when
backend/tests/llm_validation/receipts has them.
"""
import io
import random
import sys

import cv2
import numpy as np
from PIL import Image, ImageDraw, ImageFilter, ImageFont

SMALL_W = int(sys.argv[1]) if len(sys.argv) > 1 else 384
Q = int(sys.argv[2]) if len(sys.argv) > 2 else 30
BACKEND_T = 100.0


def receipt(seed: int, w=3024, h=4032) -> Image.Image:
    rnd = random.Random(seed)
    img = Image.new("L", (w, h), 40 + rnd.randint(0, 30))  # dark table
    paper = Image.new("L", (int(w * 0.62), int(h * 0.82)), 235 + rnd.randint(-15, 10))
    d = ImageDraw.Draw(paper)
    size = rnd.choice([48, 56, 64, 72])
    try:
        font = ImageFont.truetype("/System/Library/Fonts/Menlo.ttc", size)
    except OSError:
        font = ImageFont.load_default()
    y = 80
    while y < paper.height - 100:
        text = "".join(rnd.choice("ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789 .$") for _ in range(rnd.randint(8, 22)))
        d.text((60, y), text, fill=20 + rnd.randint(0, 40), font=font)
        y += int(size * 1.6)
    img.paste(paper, (int(w * 0.19), int(h * 0.09)))
    arr = np.array(img, dtype=np.float32)
    arr += np.random.default_rng(seed).normal(0, 2.0, arr.shape)  # sensor noise
    return Image.fromarray(np.clip(arr, 0, 255).astype(np.uint8))


def lap_var(gray: np.ndarray) -> float:
    return float(cv2.Laplacian(gray, cv2.CV_64F).var())



def small_metric(img: Image.Image) -> float:
    # Device: a sample photo saved at JPEG quality Q, then a SMALL_W-px square
    # crop from the center at full pixel scale (no resize).
    buf = io.BytesIO()
    img.save(buf, "JPEG", quality=Q)
    sample = Image.open(io.BytesIO(buf.getvalue()))
    # Five crops: center and the four points a quarter of the way in. The
    # sharpest one decides: any crisp text in view means the lens is focused.
    best = 0.0
    for fx, fy in [(0.5, 0.5), (0.3, 0.3), (0.7, 0.3), (0.3, 0.7), (0.7, 0.7)]:
        cx, cy = int(sample.width * fx), int(sample.height * fy)
        crop = sample.crop((cx - SMALL_W // 2, cy - SMALL_W // 2, cx + SMALL_W // 2, cy + SMALL_W // 2))
        small = np.array(crop, dtype=np.float64)
        lap = small[1:-1, :-2] + small[1:-1, 2:] + small[:-2, 1:-1] + small[2:, 1:-1] - 4 * small[1:-1, 1:-1]
        best = max(best, float(lap.var()))
    return best


rows = []
for seed in range(6):
    base = receipt(seed)
    for sigma in [0, 0.5, 0.8, 1, 1.2, 1.5, 2, 3, 4, 6, 10]:
        img = base.filter(ImageFilter.GaussianBlur(sigma)) if sigma else base
        full = lap_var(np.array(img))
        rows.append((seed, sigma, full, small_metric(img), full < BACKEND_T))

best = None
for t in sorted({r[3] for r in rows} | {x / 2 for x in range(1, 400)}):
    agree = sum((r[3] < t) == r[4] for r in rows)
    if best is None or agree > best[1]:
        best = (t, agree)
print(f"crop={SMALL_W} q={Q}: best device threshold {best[0]:.1f} agrees {best[1]}/{len(rows)}")
for sigma in [0, 0.5, 0.8, 1, 1.2, 1.5, 2, 3]:
    sel = [r for r in rows if r[1] == sigma]
    print(f"  sigma {sigma:>4}: backend blurry {sum(r[4] for r in sel)}/{len(sel)}  full {min(r[2] for r in sel):8.1f}..{max(r[2] for r in sel):8.1f}  small {min(r[3] for r in sel):7.1f}..{max(r[3] for r in sel):7.1f}")
