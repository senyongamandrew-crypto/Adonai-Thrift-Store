#!/usr/bin/env python3
"""Create modern image variants for the public storefront assets.

Drop the source images (PNG/JPEG) into ``public/images/source`` and run:

    python3 scripts/optimize_images.py

Every source image gets a ``.webp`` next to it, plus an ``.avif`` when the
installed Pillow build has AVIF support (``pip install pillow``; AVIF needs
Pillow 11.3+ compiled with libavif).

Variants are skipped when they are newer than their source, so the script can
run repeatedly (for example from a deploy hook) without rewriting files.
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

SOURCE_SUFFIXES = {".png", ".jpg", ".jpeg", ".webp"}
WEBP_QUALITY = 82
AVIF_QUALITY = 60


def pillow_supports_avif() -> bool:
    """Return True when the installed Pillow can write AVIF files."""
    try:
        from PIL import features
    except ImportError:  # pragma: no cover
        return False
    return bool(features.check("avif"))


def is_stale(source: Path, variant: Path) -> bool:
    """True when the variant is missing or older than the source image."""
    if not variant.exists():
        return True
    return variant.stat().st_mtime < source.stat().st_mtime


def human_size(path: Path) -> str:
    return f"{path.stat().st_size / 1024:.1f} KB"


def convert(source: Path, directory: Path, with_avif: bool) -> list[Path]:
    written: list[Path] = []
    with Image.open(source) as image:
        image = image.convert("RGBA" if image.mode in ("P", "LA") else image.mode)

        webp_target = directory / f"{source.stem}.webp"
        if is_stale(source, webp_target):
            image.save(webp_target, format="WEBP", quality=WEBP_QUALITY, method=6)
            written.append(webp_target)

        if with_avif:
            avif_target = directory / f"{source.stem}.avif"
            if is_stale(source, avif_target):
                try:
                    image.save(avif_target, format="AVIF", quality=AVIF_QUALITY)
                    written.append(avif_target)
                except Exception as error:  # noqa: BLE001 - reported, not fatal
                    print(f"  avif skipped for {source.name}: {error}", file=sys.stderr)

    return written


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "directory",
        nargs="?",
        default="public/images/source",
        help="directory holding the source images (default: public/images/source)",
    )
    args = parser.parse_args()

    directory = Path(args.directory)
    if not directory.is_dir():
        print(f"No source directory at {directory}. Nothing to do.")
        return 0

    with_avif = pillow_supports_avif()
    if not with_avif:
        print("AVIF support is not available in this Pillow build; writing WebP only.")

    sources = sorted(
        path
        for path in directory.iterdir()
        if path.is_file() and path.suffix.lower() in SOURCE_SUFFIXES
    )
    if not sources:
        print(f"No images found in {directory}.")
        return 0

    total = 0
    for source in sources:
        written = convert(source, directory, with_avif)
        if written:
            total += len(written)
            for path in written:
                print(f"{path} ({human_size(path)}) from {source.name}")
        else:
            print(f"{source.name}: variants already up to date")

    print(f"Done. {total} file(s) written.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
