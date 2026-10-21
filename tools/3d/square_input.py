"""Prepara uma entrada quadrada para o Hunyuan3D (CLIP faz crop central, entao
um retrato alto perde cabeca e pernas). Centraliza o personagem num quadrado branco.

Uso: python tools/3d/square_input.py <entrada.png> <saida.png> [lado]
"""
import sys

from PIL import Image


def main():
    if len(sys.argv) < 3:
        print(__doc__)
        return 1
    src, dst = sys.argv[1], sys.argv[2]
    side = int(sys.argv[3]) if len(sys.argv) > 3 else 1024

    img = Image.open(src).convert("RGB")
    w, h = img.size

    # caixa do personagem (pixels longe do branco)
    px = img.load()
    xs, ys = [], []
    for y in range(0, h, 2):
        for x in range(0, w, 2):
            r, g, b = px[x, y]
            if r < 235 or g < 235 or b < 235:
                xs.append(x)
                ys.append(y)
    x0, y0, x1, y1 = min(xs), min(ys), max(xs), max(ys)
    crop = img.crop((x0, y0, x1 + 1, y1 + 1))
    cw, ch = crop.size

    # margem de 5% em torno do personagem dentro do quadrado
    target = int(side * 0.92)
    scale = min(target / cw, target / ch)
    nw, nh = max(1, int(cw * scale)), max(1, int(ch * scale))
    crop = crop.resize((nw, nh), Image.LANCZOS)

    canvas = Image.new("RGB", (side, side), (255, 255, 255))
    canvas.paste(crop, ((side - nw) // 2, (side - nh) // 2))
    canvas.save(dst)
    print(f"personagem {cw}x{ch} -> {nw}x{nh} em quadrado {side}x{side}: {dst}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
