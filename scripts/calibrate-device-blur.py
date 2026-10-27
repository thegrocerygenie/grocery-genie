"""Calibrate the on-device blur check (mobile frameQuality.ts).

The device scores a frame the way frameSampler.ts takes it: a photo saved as
JPEG at quality 30, five CROP-px squares cut from it at full pixel scale
(cropRect), each saved at JPEG quality 100 and decoded, BT.601 gray, then the
variance of the 4-neighbour Laplacian. The sharpest crop decides. Brightness is
the mean gray over all five crops. This script repeats each step.

Real photos (the calibration that counts):

    backend/.venv/bin/python -I scripts/calibrate-device-blur.py --photos DIR

DIR holds sharp/ and blurry/ subfolders of iPhone photos (HEIC or JPEG, 12 MP:
the size expo-camera takes). Deeper folders are tags, for example
sharp/thermal/ or blurry/dim/, and the report breaks scores down by tag. Keep
DIR outside the repo: receipts carry personal data. The report shows scores
only, by index; DIR/scores.csv maps each index to its file.

Synthetic receipts (no photos needed; agreement with the backend check,
backend/app/image/preprocessor.py, which rejects a full photo below 100):

    backend/.venv/bin/python -I scripts/calibrate-device-blur.py
"""

import argparse
import csv
import io
import math
import random
from pathlib import Path

import cv2
import numpy as np
from PIL import Image, ImageDraw, ImageFilter, ImageFont, ImageOps

CROP_SIZE = 384  # frameQuality.ts CROP_SIZE
SAMPLE_QUALITY = 30  # frameSampler.ts takePictureAsync quality 0.3
CROP_QUALITY = 100  # frameSampler.ts saveAsync compress 1
CROP_POINTS = [(0.5, 0.5), (0.3, 0.3), (0.7, 0.3), (0.3, 0.7), (0.7, 0.7)]
DEVICE_THRESHOLD = 900.0  # frameQuality.ts DEVICE_BLUR_THRESHOLD
BRIGHTNESS_MIN, BRIGHTNESS_MAX = 40.0, 250.0
BACKEND_T = 100.0
EXPO_CAMERA_LONG_SIDE = 4032
PHOTO_EXTS = {".heic", ".heif", ".jpg", ".jpeg", ".png"}


def js_round(v: float) -> int:
    return math.floor(v + 0.5)  # Math.round, not Python's banker's rounding


def crop_rect(w: int, h: int, fx: float, fy: float) -> tuple[int, int, int, int]:
    cw, ch = min(CROP_SIZE, w), min(CROP_SIZE, h)
    x = max(0, min(js_round(w * fx - cw / 2), w - cw))
    y = max(0, min(js_round(h * fy - ch / 2), h - ch))
    return x, y, cw, ch


def jpeg(img: Image.Image, quality: int) -> Image.Image:
    buf = io.BytesIO()
    img.save(buf, "JPEG", quality=quality)
    return Image.open(io.BytesIO(buf.getvalue())).convert("RGB")


def gray(img: Image.Image) -> np.ndarray:
    rgb = np.asarray(img, dtype=np.float64)
    return 0.299 * rgb[..., 0] + 0.587 * rgb[..., 1] + 0.114 * rgb[..., 2]


def lap_var(g: np.ndarray) -> float:
    lap = g[1:-1, :-2] + g[1:-1, 2:] + g[:-2, 1:-1] + g[2:, 1:-1] - 4 * g[1:-1, 1:-1]
    return float(lap.var())


def device_score(img: Image.Image) -> tuple[float, float]:
    """(sharpest crop's Laplacian variance, mean brightness), as the app scores."""
    sample = jpeg(img.convert("RGB"), SAMPLE_QUALITY)
    sharpest, total, pixels = 0.0, 0.0, 0
    for fx, fy in CROP_POINTS:
        x, y, cw, ch = crop_rect(sample.width, sample.height, fx, fy)
        g = gray(jpeg(sample.crop((x, y, x + cw, y + ch)), CROP_QUALITY))
        sharpest = max(sharpest, lap_var(g))
        total += float(g.sum())
        pixels += g.size
    return sharpest, total / pixels


def verdict(sharpest: float, brightness: float, threshold: float) -> str:
    if brightness < BRIGHTNESS_MIN:
        return "dark"
    if brightness > BRIGHTNESS_MAX:
        return "bright"
    return "blurry" if sharpest < threshold else "ok"


def backend_blurry(img: Image.Image) -> bool:
    g = cv2.cvtColor(np.asarray(img.convert("RGB")), cv2.COLOR_RGB2GRAY)
    return float(cv2.Laplacian(g, cv2.CV_64F).var()) < BACKEND_T


# ---- real photos -----------------------------------------------------------


def load_photos(root: Path) -> list[dict]:
    try:
        from pillow_heif import register_heif_opener

        register_heif_opener()
    except ImportError:
        pass
    rows = []
    for label in ("sharp", "blurry"):
        for path in sorted((root / label).rglob("*")):
            if path.suffix.lower() not in PHOTO_EXTS:
                continue
            img = ImageOps.exif_transpose(Image.open(path))
            sharpest, brightness = device_score(img)
            rel = path.parent.relative_to(root / label)
            rows.append(
                {
                    "index": len(rows) + 1,
                    "file": str(path.relative_to(root)),
                    "label": label,
                    "tag": "" if str(rel) == "." else str(rel),
                    "size": f"{img.width}x{img.height}",
                    "score": round(sharpest, 1),
                    "brightness": round(brightness, 1),
                    "backend_blurry": backend_blurry(img),
                }
            )
    return rows


def confusion(rows: list[dict], threshold: float) -> dict[str, dict[str, int]]:
    m = {
        label: {"ok": 0, "blurry": 0, "dark": 0, "bright": 0}
        for label in ("sharp", "blurry")
    }
    for r in rows:
        m[r["label"]][verdict(r["score"], r["brightness"], threshold)] += 1
    return m


def print_confusion(rows: list[dict], threshold: float) -> None:
    m = confusion(rows, threshold)
    print(f"  threshold {threshold:.0f}:   app says ok  blurry  dark  bright")
    for label in ("sharp", "blurry"):
        c = m[label]
        print(
            f"    labelled {label:<6}  {c['ok']:>9}  {c['blurry']:>6}  {c['dark']:>4}  {c['bright']:>6}"
        )


def recommend(rows: list[dict]) -> float | None:
    """The threshold that catches the most blurry photos while flagging at most
    5% of sharp ones as blurry, set midway (geometric) between neighbouring scores."""
    lit = [r for r in rows if BRIGHTNESS_MIN <= r["brightness"] <= BRIGHTNESS_MAX]
    sharp = sorted(r["score"] for r in lit if r["label"] == "sharp")
    blurry = sorted(r["score"] for r in lit if r["label"] == "blurry")
    if not sharp or not blurry:
        return None
    allowed = math.floor(0.05 * len(sharp))
    ceiling = sharp[allowed]  # threshold <= this keeps false "blurry" within budget
    below = [s for s in sharp[:allowed] + blurry if s < ceiling]
    floor_ = max(below) if below else ceiling / 2
    return math.sqrt(floor_ * ceiling)


def report_photos(root: Path) -> None:
    rows = load_photos(root)
    if not rows:
        raise SystemExit(f"No photos in {root}/sharp or {root}/blurry")
    with open(root / "scores.csv", "w", newline="") as f:
        w = csv.DictWriter(f, fieldnames=list(rows[0]))
        w.writeheader()
        w.writerows(rows)

    off_size = [
        r["index"]
        for r in rows
        if max(map(int, r["size"].split("x"))) != EXPO_CAMERA_LONG_SIDE
    ]
    if off_size:
        print(
            f"WARNING: {len(off_size)} photos are not 12 MP (long side {EXPO_CAMERA_LONG_SIDE}): {off_size}"
        )
        print(
            "  Scores depend on pixel scale. Set Camera > Formats > Photo Mode to 12 MP and reshoot.\n"
        )

    print(" idx  label   tag             score  bright  backend")
    for r in sorted(rows, key=lambda r: r["score"]):
        print(
            f"{r['index']:>4}  {r['label']:<6}  {r['tag'][:14]:<14} {r['score']:>7.0f}  {r['brightness']:>6.0f}"
            f"  {'blurry' if r['backend_blurry'] else 'ok'}"
        )

    print("\nScore range by label and tag:")
    groups: dict[tuple[str, str], list[float]] = {}
    for r in rows:
        groups.setdefault((r["label"], r["tag"] or "-"), []).append(r["score"])
    for (label, tag), scores in sorted(groups.items()):
        print(
            f"  {label:<6} {tag:<14} n={len(scores):>3}  {min(scores):>7.0f} .. {max(scores):>7.0f}"
        )

    sharp = [r["score"] for r in rows if r["label"] == "sharp"]
    blurry = [r["score"] for r in rows if r["label"] == "blurry"]
    if sharp and blurry:
        overlap = sum(s <= max(blurry) for s in sharp) + sum(
            b >= min(sharp) for b in blurry
        )
        print(f"\nOverlap: {overlap} photos sit inside the other label's score range.")

    print("\nConfusion matrix (rows: your label, columns: the app's verdict):")
    print_confusion(rows, DEVICE_THRESHOLD)
    t = recommend(rows)
    if t is not None:
        print(f"\nRecommended threshold (<=5% of sharp photos flagged blurry): {t:.0f}")
        print_confusion(rows, t)
    print(f"\nPer-photo scores and file names: {root / 'scores.csv'}")


# ---- synthetic receipts ----------------------------------------------------


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
        text = "".join(
            rnd.choice("ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789 .$")
            for _ in range(rnd.randint(8, 22))
        )
        d.text((60, y), text, fill=20 + rnd.randint(0, 40), font=font)
        y += int(size * 1.6)
    img.paste(paper, (int(w * 0.19), int(h * 0.09)))
    arr = np.array(img, dtype=np.float32)
    arr += np.random.default_rng(seed).normal(0, 2.0, arr.shape)  # sensor noise
    return Image.fromarray(np.clip(arr, 0, 255).astype(np.uint8))


def report_synthetic() -> None:
    rows = []
    for seed in range(6):
        base = receipt(seed)
        for sigma in [0, 0.5, 0.8, 1, 1.2, 1.5, 2, 3, 4, 6, 10]:
            img = base.filter(ImageFilter.GaussianBlur(sigma)) if sigma else base
            full = lap_var(np.asarray(img, dtype=np.float64))
            rows.append((sigma, full, device_score(img)[0], full < BACKEND_T))
    best = None
    for t in sorted({r[2] for r in rows} | {x / 2 for x in range(1, 400)}):
        agree = sum((r[2] < t) == r[3] for r in rows)
        if best is None or agree > best[1]:
            best = (t, agree)
    print(
        f"synthetic: best device threshold {best[0]:.1f} agrees with the backend {best[1]}/{len(rows)}"
    )
    for sigma in [0, 0.5, 0.8, 1, 1.2, 1.5, 2, 3]:
        sel = [r for r in rows if r[0] == sigma]
        print(
            f"  sigma {sigma:>4}: backend blurry {sum(r[3] for r in sel)}/{len(sel)}"
            f"  full {min(r[1] for r in sel):8.1f}..{max(r[1] for r in sel):8.1f}"
            f"  device {min(r[2] for r in sel):7.1f}..{max(r[2] for r in sel):7.1f}"
        )


if __name__ == "__main__":
    parser = argparse.ArgumentParser(
        description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter
    )
    parser.add_argument(
        "--photos", type=Path, help="folder with sharp/ and blurry/ subfolders"
    )
    args = parser.parse_args()
    if args.photos:
        report_photos(args.photos.expanduser())
    else:
        report_synthetic()
