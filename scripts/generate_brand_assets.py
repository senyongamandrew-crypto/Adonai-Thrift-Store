#!/usr/bin/env python3
"""Rebuild the Adonai Thrift Store brand assets from the primary logo.

    python3 scripts/generate_brand_assets.py            # icons + favicon
    python3 scripts/generate_brand_assets.py --og       # also refresh the OG image

Input:  public/assets/primary-logo-light.png
Output: public/icons/icon-192.png, public/icons/icon-512.png, public/favicon.ico
        public/images/og/adonai-storefront.png          (only with --og)

The designed Open Graph artwork ships with the repository, so it is only
rewritten when ``--og`` is passed. Use ``--out-dir`` to render into a scratch
directory instead of touching the committed files.
"""

from __future__ import annotations

import argparse
import sys
from pathlib import Path

try:
    from PIL import Image
except ImportError:  # pragma: no cover - depends on the local environment
    print("Pillow is required: python3 -m pip install pillow", file=sys.stderr)
    raise SystemExit(1)

CANVAS = (248, 248, 251)  # brand canvas #F8F8FB
LAVENDER = (243, 240, 255)  # brand lavender #F3F0FF
LOGO = Path("public/assets/primary-logo-light.png")
ICON_SIZES = (192, 512)
FAVICON_SIZES = (16, 32, 48)
OG_SIZE = (1200, 630)


def contain(image: Image.Image, box: tuple[int, int], padding: float) -> Image.Image:
    """Scale the logo to fit inside ``box`` keeping the aspect ratio."""
    inner = (int(box[0] * (1 - padding)), int(box[1] * (1 - padding)))
    ratio = min(inner[0] / image.width, inner[1] / image.height)
    return image.resize(
        (max(1, int(image.width * ratio)), max(1, int(image.height * ratio))),
        Image.LANCZOS,
    )


def on_canvas(logo: Image.Image, size: tuple[int, int], background) -> Image.Image:
    canvas = Image.new("RGB", size, background)
    scaled = contain(logo, size, 0.16)
    position = ((size[0] - scaled.width) // 2, (size[1] - scaled.height) // 2)
    canvas.paste(scaled, position, scaled if scaled.mode == "RGBA" else None)
    return canvas


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--out-dir", default="public", help="output root (default: public)")
    parser.add_argument("--logo", default=str(LOGO), help="source logo file")
    parser.add_argument("--og", action="store_true", help="also rewrite the Open Graph image")
    args = parser.parse_args()

    logo_path = Path(args.logo)
    if not logo_path.is_file():
        print(f"Missing source logo: {logo_path}", file=sys.stderr)
        return 1

    out_dir = Path(args.out_dir)
    icons_dir = out_dir / "icons"
    og_dir = out_dir / "images" / "og"
    icons_dir.mkdir(parents=True, exist_ok=True)

    with Image.open(logo_path) as source:
        logo = source.convert("RGBA")

        icon_512: Image.Image | None = None
        for size in ICON_SIZES:
            icon = on_canvas(logo, (size, size), CANVAS)
            if size == 512:
                icon_512 = icon
            target = icons_dir / f"icon-{size}.png"
            icon.save(target, format="PNG", optimize=True)
            print(f"wrote {target} ({size}x{size})")

        favicon_source = icon_512 or on_canvas(logo, (512, 512), CANVAS)
        favicon = out_dir / "favicon.ico"
        favicon_source.save(favicon, format="ICO", sizes=[(s, s) for s in FAVICON_SIZES])
        print(f"wrote {favicon} {FAVICON_SIZES}")

        if args.og:
            og_dir.mkdir(parents=True, exist_ok=True)
            canvas = Image.new("RGB", OG_SIZE, LAVENDER)
            card = contain(logo, (int(OG_SIZE[0] * 0.7), int(OG_SIZE[1] * 0.6)), 0.05)
            canvas.paste(
                card,
                ((OG_SIZE[0] - card.width) // 2, (OG_SIZE[1] - card.height) // 2),
                card if card.mode == "RGBA" else None,
            )
            target = og_dir / "adonai-storefront.png"
            canvas.save(target, format="PNG", optimize=True)
            print(f"wrote {target} ({OG_SIZE[0]}x{OG_SIZE[1]})")

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
