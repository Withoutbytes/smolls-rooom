#!/usr/bin/env python3
"""Corta a grade renderada por tools/act-icons.html em public/img/act/<name>.png.

1. abra http://localhost:5173/tools/act-icons.html e capture a tela (o MCP do chrome faz isso)
2. python tools/act-icons.py caminho-da-print.png

O fundo magenta do render vira transparente; o emoji no canto é o emblema da tarefa.
"""
import json
import sys
from pathlib import Path
from PIL import Image
import numpy as np

CELL, COLS = 128, 8
TOL = 90  # distância até (255,0,255) pra considerar "fundo"


def main():
    src = Path(sys.argv[1] if len(sys.argv) > 1 else "act-grid.png")
    acts = json.loads(Path("tools/act-icons.json").read_text(encoding="utf-8"))
    im = np.array(Image.open(src).convert("RGBA"))
    rows = (len(acts) + COLS - 1) // COLS
    if im.shape[1] < COLS * CELL or im.shape[0] < rows * CELL:
        sys.exit(f"print {im.shape[1]}x{im.shape[0]} menor que a grade {COLS*CELL}x{rows*CELL}")

    fundo = (im[..., 0] > 255 - TOL) & (im[..., 1] < TOL) & (im[..., 2] > 255 - TOL)
    im[..., 3] = np.where(fundo, 0, 255)
    im = Image.fromarray(im)

    out = Path("public/img/act")
    out.mkdir(parents=True, exist_ok=True)
    for i, a in enumerate(acts):
        x, y = (i % COLS) * CELL, (i // COLS) * CELL
        im.crop((x, y, x + CELL, y + CELL)).save(out / f"{a['name']}.png")
    print(f"{len(acts)} thumbnails em {out}")


if __name__ == "__main__":
    main()
