# Public image assets

- `images/og/adonai-storefront.png` is the default Open Graph preview image.
- Product and ad images should live on the configured media volume, not in Git.
- Run `python3 scripts/optimize_images.py` after adding source images to
  `public/images/source/`. The script creates WebP versions and attempts AVIF
  when the installed Pillow build supports it.
