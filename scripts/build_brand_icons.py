#!/usr/bin/env python3
"""Derive ARCHEON Windows/web icons from the spatial-assembly mark."""
from __future__ import annotations

from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
SRC_CANDIDATES = [
    ROOT / "assets" / "brand" / "archeon-source.png",
    ROOT / "assets" / "brand" / "archeon-source.jpg",
]
BRAND = ROOT / "assets" / "brand"
PUBLIC = ROOT / "apps" / "workstation" / "public"
API_ASSETS = ROOT / "crates" / "archeon-api" / "assets"


def load_mark() -> Image.Image:
    src = next((p for p in SRC_CANDIDATES if p.exists()), None)
    if src is None:
        raise SystemExit("missing assets/brand/archeon-source.png or .jpg")
    im = Image.open(src).convert("RGBA")
    w, h = im.size
    # Pull the rings up so 16px/32px still read as an assembly, not a navy tile.
    margin = int(min(w, h) * 0.14)
    return im.crop((margin, margin, w - margin, h - margin))


def resize(im: Image.Image, size: int) -> Image.Image:
    return im.resize((size, size), Image.Resampling.LANCZOS)


def save_png(im: Image.Image, path: Path, size: int | None = None) -> None:
    out = resize(im, size) if size else im
    path.parent.mkdir(parents=True, exist_ok=True)
    out.save(path, format="PNG", optimize=True)


def main() -> None:
    mark = load_mark()
    BRAND.mkdir(parents=True, exist_ok=True)
    PUBLIC.mkdir(parents=True, exist_ok=True)
    API_ASSETS.mkdir(parents=True, exist_ok=True)

    save_png(mark, BRAND / "archeon.png", 1024)

    ico_sizes = [16, 24, 32, 48, 64, 128, 256]
    ico_images = [resize(mark, s) for s in ico_sizes]
    ico_path = BRAND / "archeon.ico"
    ico_images[-1].save(
        ico_path,
        format="ICO",
        sizes=[(s, s) for s in ico_sizes],
        append_images=ico_images[:-1],
    )
    (API_ASSETS / "archeon.ico").write_bytes(ico_path.read_bytes())

    for size in (16, 32, 48, 64, 128, 256, 512):
        save_png(mark, BRAND / f"archeon-{size}.png", size)

    save_png(mark, PUBLIC / "archeon.png", 512)
    save_png(mark, PUBLIC / "archeon-256.png", 256)
    save_png(mark, PUBLIC / "apple-touch-icon.png", 180)
    (PUBLIC / "favicon.ico").write_bytes(ico_path.read_bytes())
    save_png(mark, PUBLIC / "favicon-32.png", 32)

    print(f"wrote {ico_path}")
    print(f"wrote {API_ASSETS / 'archeon.ico'}")
    print(f"wrote favicons under {PUBLIC}")


if __name__ == "__main__":
    main()
