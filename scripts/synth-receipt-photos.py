"""Render labelled 12 MP receipt "photos" for scripts/calibrate-device-blur.py.

A stand-in for real iPhone photos, not a replacement: every effect below is a
model. Each photo goes through the steps a phone camera takes, in order:

  scene    receipt (text, totals, barcode) on a table; thermal fade, crumple
           (warp + shading), perspective tilt, long receipts held further away
  light    uneven light, soft shadow, specular glare on glossy paper
  optics   lens PSF; for blurry photos, defocus (a disk) and/or hand shake
           (a line), sized against the text height
  sensor   shot and read noise for the light level, auto-exposure gain
  ISP      noise reduction (stronger in dim light), unsharp-mask sharpening,
           sRGB gamma, JPEG quality 90, 4032x3024 portrait

Labels: sharp photos get only the lens PSF and at most 2 px of shake. Blurry
photos get blur of 15-40% of the text height (defocus radius) or 35-100%
(shake length), so the text is visibly soft. The ambiguous band between is
left out, as a person labelling real photos would leave it out.

Run: backend/.venv/bin/python -I scripts/synth-receipt-photos.py OUT [PER_TAG]
Writes OUT/sharp/<tag>/NN.jpg and OUT/blurry/<tag>/NN.jpg (default 6 per tag).
"""

import math
import random
import sys
from multiprocessing import Pool
from pathlib import Path

import cv2
import numpy as np
from PIL import Image, ImageDraw, ImageFont

W, H = 3024, 4032
TAGS = ["daylight", "indoor", "dim", "thermal", "crumpled", "long", "glossy"]
FONTS = [
    "/System/Library/Fonts/Menlo.ttc",
    "/System/Library/Fonts/Monaco.ttf",
    "/System/Library/Fonts/Supplemental/Courier New.ttf",
    "/System/Library/Fonts/Supplemental/Andale Mono.ttf",
]
ITEMS = [
    "MILK 2% GAL", "BANANAS", "EGGS LG 12CT", "WHEAT BREAD", "CHEDDAR BLK",
    "CHICKEN BRST", "APPLES GALA", "OJ 52OZ", "RICE 5LB", "PASTA PENNE",
    "TOMATO SAUCE", "YOGURT GRK", "BUTTER UNSLT", "COFFEE GRND", "SPINACH BAG",
    "ONIONS YLW", "CEREAL OAT", "PEANUT BUTR", "TORTILLAS", "ICE CREAM",
]


def smooth_noise(rng: np.random.Generator, h: int, w: int, cells: int) -> np.ndarray:
    small = rng.standard_normal((cells, max(2, int(cells * w / h)))).astype(np.float32)
    return cv2.resize(small, (w, h), interpolation=cv2.INTER_CUBIC)


def render_receipt(rnd: random.Random, pw: int, ph: int, ink: float) -> np.ndarray:
    """Paper reflectance (1 = white), text in `ink`."""
    img = Image.new("L", (pw, ph), 255)
    d = ImageDraw.Draw(img)
    cols = 40
    char_w = pw * 0.9 / cols
    size = max(10, int(char_w / 0.6))
    font = ImageFont.truetype(rnd.choice(FONTS), size)
    big = ImageFont.truetype(rnd.choice(FONTS), int(size * 1.7))
    fill = int(255 * ink)
    margin, line = int(pw * 0.05), int(size * 1.45)
    y = margin
    for text, f in [("FRESH MART #" + str(rnd.randint(100, 999)), big),
                    (f"{rnd.randint(10, 9999)} MAIN ST", font),
                    (f"10/{rnd.randint(1, 28):02d}/26  {rnd.randint(7, 21):02d}:{rnd.randint(0, 59):02d}", font),
                    ("", font)]:
        d.text((margin, y), text, fill=fill, font=f)
        y += int(line * (1.6 if f is big else 1))
    total = 0.0
    while y < ph - line * 9:
        price = rnd.randint(49, 1599) / 100
        total += price
        name = rnd.choice(ITEMS)
        d.text((margin, y), f"{name:<{cols - 10}}{price:>8.2f}", fill=fill, font=font)
        y += line
    for label, v in [("SUBTOTAL", total), ("TAX", total * 0.07), ("TOTAL", total * 1.07)]:
        d.text((margin, y), f"{label:<{cols - 10}}{v:>8.2f}", fill=fill, font=font)
        y += line
    d.text((margin, y), "VISA ************" + str(rnd.randint(1000, 9999)), fill=fill, font=font)
    y += int(line * 1.5)
    x = margin
    while x < pw - margin and y + line * 2 < ph:  # barcode
        bw = rnd.choice([2, 3, 5, 7]) * max(1, size // 20)
        if rnd.random() < 0.55:
            d.rectangle((x, y, x + bw, y + line * 2), fill=fill)
        x += bw
    return np.asarray(img, dtype=np.float32) / 255.0


def crumple(rng: np.random.Generator, paper: np.ndarray) -> tuple[np.ndarray, np.ndarray]:
    """Warp the paper over a creased height field; return (paper, shading)."""
    ph, pw = paper.shape
    hgt = smooth_noise(rng, ph, pw, 8) * 30
    yy, xx = np.mgrid[0:ph, 0:pw].astype(np.float32)
    for _ in range(rng.integers(3, 8)):  # sharp folds
        a = rng.uniform(0, math.pi)
        c = rng.uniform(-0.5, 0.5) * pw
        dist = (xx - pw / 2) * math.cos(a) + (yy - ph / 2) * math.sin(a) - c
        hgt += rng.uniform(-25, 25) * np.exp(-np.abs(dist) / rng.uniform(40, 200))
    gy, gx = np.gradient(hgt)
    warped = cv2.remap(paper, xx + gx * 6, yy + gy * 6, cv2.INTER_LINEAR, borderMode=cv2.BORDER_REPLICATE)
    lx, ly = rng.uniform(-1, 1), rng.uniform(-1, 1)
    shade = np.clip(1 + 0.6 * (gx * lx + gy * ly), 0.55, 1.25).astype(np.float32)
    return warped, shade


def background(rng: np.random.Generator) -> np.ndarray:
    kind = rng.integers(0, 4)
    base = [(0.42, 0.28, 0.16), (0.78, 0.78, 0.75), (0.10, 0.10, 0.11), (0.35, 0.35, 0.36)][kind]
    tex = smooth_noise(rng, H, W, 12) * 0.05
    if kind == 0:  # wood grain
        yy, xx = np.mgrid[0:H, 0:W].astype(np.float32)
        tex += 0.06 * np.sin(xx / rng.uniform(15, 40) + 4 * smooth_noise(rng, H, W, 6))
    if kind == 3:  # granite speckle
        tex += rng.standard_normal((H, W)).astype(np.float32) * 0.04
    return np.clip(np.stack([np.full((H, W), c, np.float32) for c in base], -1) * (1 + tex[..., None]), 0, 1)


def blur_kernel(defocus_r: float, shake_len: float, angle: float) -> np.ndarray | None:
    k = None
    if defocus_r > 0.5:
        r = int(math.ceil(defocus_r))
        yy, xx = np.mgrid[-r : r + 1, -r : r + 1]
        k = (xx**2 + yy**2 <= defocus_r**2).astype(np.float32)
        k = cv2.GaussianBlur(k, (0, 0), 0.6)
    if shake_len > 1:
        n = int(math.ceil(shake_len)) | 1
        line = np.zeros((n, n), np.float32)
        c = n // 2
        dx, dy = math.cos(angle) * shake_len / 2, math.sin(angle) * shake_len / 2
        cv2.line(line, (round(c - dx), round(c - dy)), (round(c + dx), round(c + dy)), 1.0, 1, cv2.LINE_AA)
        k = line if k is None else cv2.filter2D(np.pad(k, n), -1, line)
    return None if k is None else k / k.sum()


def make_photo(job: tuple[str, str, int]) -> str:
    label, tag, i = job
    seed = (TAGS.index(tag) * 1000 + i) * 2 + (label == "blurry")
    rnd, rng = random.Random(seed), np.random.default_rng(seed)

    # Scene
    if tag == "long":
        pw = rnd.randint(650, 900)
        ph = int(min(H * 0.98, pw * rnd.uniform(4.5, 6.5)))
    else:
        pw = rnd.randint(1150, 1750)
        ph = int(pw * rnd.uniform(1.8, 2.7))
    ink = rnd.uniform(0.35, 0.6) if tag == "thermal" else rnd.uniform(0.05, 0.2)
    paper = render_receipt(rnd, pw, ph, ink)
    shade = np.ones_like(paper)
    if tag == "crumpled" or rnd.random() < 0.2:
        paper, shade = crumple(rng, paper)
    tint = np.array([rnd.uniform(0.9, 0.97), rnd.uniform(0.9, 0.96), rnd.uniform(0.85, 0.94)], np.float32)
    layer = paper[..., None] * tint * shade[..., None]

    cx, cy = W / 2 + rnd.uniform(-150, 150), H / 2 + rnd.uniform(-150, 150)
    j = pw * 0.05
    src = np.float32([[0, 0], [pw, 0], [pw, ph], [0, ph]])
    dst = np.float32([[cx - pw / 2, cy - ph / 2], [cx + pw / 2, cy - ph / 2], [cx + pw / 2, cy + ph / 2], [cx - pw / 2, cy + ph / 2]])
    dst += np.float32([[rnd.uniform(-j, j), rnd.uniform(-j, j)] for _ in range(4)])
    m = cv2.getPerspectiveTransform(src, dst)
    warped = cv2.warpPerspective(layer, m, (W, H), flags=cv2.INTER_LINEAR)
    mask = cv2.warpPerspective(np.ones((ph, pw), np.float32), m, (W, H), flags=cv2.INTER_LINEAR)[..., None]
    scene = warped * mask + background(rng) * (1 - mask)

    # Light
    yy, xx = np.mgrid[0:H, 0:W].astype(np.float32)
    a = rnd.uniform(0, 2 * math.pi)
    grad = ((xx / W - 0.5) * math.cos(a) + (yy / H - 0.5) * math.sin(a)) * rnd.uniform(0.1, 0.5)
    light = 1 - grad
    if tag in ("indoor", "dim") or rnd.random() < 0.25:  # soft shadow of a hand or phone
        sx, sy, sr = rnd.uniform(0, W), rnd.uniform(0, H), rnd.uniform(500, 1400)
        light *= 1 - rnd.uniform(0.2, 0.5) * np.exp(-((xx - sx) ** 2 + (yy - sy) ** 2) / (2 * sr**2))
    scene = scene * light[..., None]
    if tag == "glossy":
        gx_, gy_, gr = cx + rnd.uniform(-pw / 3, pw / 3), cy + rnd.uniform(-ph / 3, ph / 3), rnd.uniform(150, 450)
        spec = rnd.uniform(0.6, 1.6) * np.exp(-((xx - gx_) ** 2 + (yy - gy_) ** 2) / (2 * gr**2))
        scene = scene + (spec * mask[..., 0])[..., None]

    # Optics
    font_px = pw * 0.9 / 40 / 0.6
    lens = rnd.uniform(0.5, 0.9)
    scene = cv2.GaussianBlur(scene, (0, 0), lens)
    if label == "blurry":
        mode = rnd.choice(["defocus", "shake", "both"])
        r = font_px * rnd.uniform(0.15, 0.4) if mode != "shake" else 0
        s = font_px * rnd.uniform(0.35, 1.0) if mode != "defocus" else 0
        if mode == "both":
            r, s = r * 0.7, s * 0.7
        k = blur_kernel(r, s, rnd.uniform(0, math.pi))
    else:
        k = blur_kernel(0, rnd.uniform(0, 2), rnd.uniform(0, math.pi))
    if k is not None:
        scene = cv2.filter2D(scene, -1, k, borderType=cv2.BORDER_REFLECT)

    # Sensor: photons per pixel at reflectance 1
    photons = {"daylight": 20000, "dim": rnd.uniform(150, 400)}.get(tag, rnd.uniform(1500, 5000))
    sig = np.clip(scene, 0, None)
    noisy = sig + rng.standard_normal(sig.shape).astype(np.float32) * np.sqrt(sig / photons + (3 / photons) ** 2)
    # Auto-exposure puts the paper near white, or short of it in dim light.
    white = rnd.uniform(0.3, 0.45) if tag == "dim" else rnd.uniform(0.6, 0.85)
    paper_level = float(np.percentile(noisy[mask[..., 0] > 0.5], 75))
    noisy *= white / max(1e-4, paper_level)

    # ISP
    nr = {"daylight": 0.0, "dim": rnd.uniform(1.0, 1.6)}.get(tag, rnd.uniform(0.4, 0.8))
    if nr:
        noisy = cv2.GaussianBlur(noisy, (0, 0), nr)
    amount = rnd.uniform(0.5, 1.0)
    out = noisy + amount * (noisy - cv2.GaussianBlur(noisy, (0, 0), 1.3))
    out = np.clip(out, 0, 1) ** (1 / 2.2)
    path = OUT / label / tag / f"{i:02d}.jpg"
    path.parent.mkdir(parents=True, exist_ok=True)
    Image.fromarray((out * 255 + 0.5).astype(np.uint8)).save(path, "JPEG", quality=90)
    return str(path.relative_to(OUT))


OUT = Path(sys.argv[1]).expanduser() if len(sys.argv) > 1 else Path("synth-photos")

if __name__ == "__main__":
    per_tag = int(sys.argv[2]) if len(sys.argv) > 2 else 6
    jobs = [(label, tag, i) for label in ("sharp", "blurry") for tag in TAGS for i in range(per_tag)]
    with Pool() as pool:
        for done in pool.imap_unordered(make_photo, jobs):
            print(done, flush=True)
