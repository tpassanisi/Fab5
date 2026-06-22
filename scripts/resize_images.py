#!/usr/bin/env python3
"""
Batch resize and compress card images.
Usage: python3 scripts/resize_images.py

Resizes all PNGs in public/images/cards/ to max 400px wide,
converts to optimized PNG with reduced quality.
Originals are backed up to public/images/cards/originals/
"""

import os
from pathlib import Path

try:
    from PIL import Image
except ImportError:
    print("Pillow not installed. Run: pip3 install Pillow")
    exit(1)

CARDS_DIR = Path(__file__).parent.parent / "public" / "images" / "cards"
BACKUP_DIR = CARDS_DIR / "originals"
MAX_WIDTH = 400
MAX_HEIGHT = 500

def resize_images():
    BACKUP_DIR.mkdir(exist_ok=True)

    files = sorted(CARDS_DIR.glob("*.png"))
    if not files:
        print("No PNG files found in", CARDS_DIR)
        return

    total_before = 0
    total_after = 0

    for f in files:
        before_size = f.stat().st_size
        total_before += before_size

        # Backup original
        backup_path = BACKUP_DIR / f.name
        if not backup_path.exists():
            import shutil
            shutil.copy2(f, backup_path)

        img = Image.open(f)
        w, h = img.size

        # Resize if needed
        if w > MAX_WIDTH or h > MAX_HEIGHT:
            ratio = min(MAX_WIDTH / w, MAX_HEIGHT / h)
            new_w = int(w * ratio)
            new_h = int(h * ratio)
            img = img.resize((new_w, new_h), Image.LANCZOS)

        # Convert to RGB if RGBA with no transparency
        if img.mode == "RGBA":
            bg = Image.new("RGB", img.size, (10, 10, 15))
            bg.paste(img, mask=img.split()[3])
            img = bg

        # Save optimized
        img.save(f, "PNG", optimize=True)

        after_size = f.stat().st_size
        total_after += after_size
        reduction = (1 - after_size / before_size) * 100 if before_size > 0 else 0
        print(f"  {f.name}: {before_size // 1024}KB -> {after_size // 1024}KB ({reduction:.0f}% smaller)")

    print(f"\nTotal: {total_before // 1024}KB -> {total_after // 1024}KB ({(1 - total_after / total_before) * 100:.0f}% reduction)")
    print(f"Originals backed up to: {BACKUP_DIR}")

if __name__ == "__main__":
    resize_images()
