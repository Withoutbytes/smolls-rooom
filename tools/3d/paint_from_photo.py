"""Pinta um .glb sem textura (Hunyuan3D) projetando a foto da skin sobre a malha.

Uso: python tools/3d/paint_from_photo.py <modelo.glb> <foto.png> <saida.glb>

A foto e uma vista frontal, entao:
- a frente pega o pixel correspondente (projecao ortografica, alinhada pela altura
  e pelo centro do personagem, nao pela caixa da imagem);
- as laterais e a parte de tras ficam fora da silhueta na foto: a cor e pinçada da
  borda da silhueta naquela linha (o corpo veste ao redor, entao isso funciona);
- o vao entre as pernas e entre braco e tronco tambem pega o pixel de corpo mais
  proximo da linha, senão a malha sai com manchas brancas;
- o tras recebe um sombreamento leve para dar profundidade.
"""
import json
import struct
import sys

from PIL import Image

WHITE = 235


def read_glb(path):
    data = open(path, "rb").read()
    off = 12
    json_off = json_len = bin_off = bin_len = None
    while off < len(data):
        clen, ctype = struct.unpack("<II", data[off : off + 8])
        name = struct.pack("<I", ctype).decode()
        if name == "JSON":
            json_off, json_len = off + 8, clen
        else:
            bin_off, bin_len = off + 8, clen
        off += 8 + clen
    return json.loads(data[json_off : json_off + json_len]), data[bin_off : bin_off + bin_len]


def silhouette(img):
    """Para cada linha y, a coluna mais a esquerda e mais a direita do corpo."""
    w, h = img.size
    px = img.load()
    left = [None] * h
    right = [None] * h
    for y in range(h):
        for x in range(w):
            r, g, b = px[x, y]
            if r < WHITE or g < WHITE or b < WHITE:
                if left[y] is None:
                    left[y] = x
                right[y] = x
    return left, right


def nearest_body(img):
    """Para cada (y, x), a coluna do pixel de corpo mais proximo na mesma linha.

    Serve para os vortices que caem no vao entre as pernas ou entre braco e tronco:
    la a foto e fundo branco, e sem isso a malha sai com manchas brancas.
    """
    w, h = img.size
    px = img.load()
    near = [None] * h
    for y in range(h):
        row = [None] * w
        last = None
        for x in range(w):
            r, g, b = px[x, y]
            if r < WHITE or g < WHITE or b < WHITE:
                last = x
            row[x] = last
        nxt = None
        for x in range(w - 1, -1, -1):
            r, g, b = px[x, y]
            if r < WHITE or g < WHITE or b < WHITE:
                nxt = x
            if nxt is not None and (row[x] is None or abs(x - nxt) < abs(x - row[x])):
                row[x] = nxt
        near[y] = row
    return near


def main():
    if len(sys.argv) != 4:
        print(__doc__)
        return 1
    glb_path, img_path, out_path = sys.argv[1:4]

    j, bin_data = read_glb(glb_path)
    prim = j["meshes"][0]["primitives"][0]
    pos_acc = j["accessors"][prim["attributes"]["POSITION"]]
    bv = j["bufferViews"][pos_acc["bufferView"]]
    verts = struct.unpack(
        "<" + "f" * (pos_acc["count"] * 3),
        bin_data[bv["byteOffset"] : bv["byteOffset"] + bv["byteLength"]],
    )

    xs = [verts[i] for i in range(0, len(verts), 3)]
    ys = [verts[i + 1] for i in range(0, len(verts), 3)]
    zs = [verts[i + 2] for i in range(0, len(verts), 3)]
    x0, x1 = min(xs), max(xs)
    y0, y1 = min(ys), max(ys)
    z0, z1 = min(zs), max(zs)

    img = Image.open(img_path).convert("RGB")
    w, h = img.size
    left, right = silhouette(img)
    near = nearest_body(img)
    rows = [y for y in range(h) if left[y] is not None]
    sy0, sy1 = min(rows), max(rows)
    sx0, sx1 = min(left[y] for y in rows), max(right[y] for y in rows)
    print(
        f"mesh x[{x0:.3f},{x1:.3f}] y[{y0:.3f},{y1:.3f}] z[{z0:.3f},{z1:.3f}]  "
        f"silhueta na foto: {sx1 - sx0}x{sy1 - sy0}"
    )

    # alinha pela altura e mantem a proporcao real da foto
    scale = (sy1 - sy0) / (y1 - y0)
    cx = (x0 + x1) / 2.0
    img_cx = (sx0 + sx1) / 2.0
    z_front, z_back = z1, z0
    getpixel = img.getpixel
    colors = bytearray()
    outside = 0
    for i in range(0, len(verts), 3):
        vx, vy, vz = verts[i], verts[i + 1], verts[i + 2]
        py = int(sy0 + (1.0 - (vy - y0) / (y1 - y0)) * (sy1 - sy0))
        py = min(h - 1, max(0, py))
        px = int(img_cx + (vx - cx) * scale)
        l, r = left[py], right[py]
        if l is not None and (px < l or px > r):
            # fora da silhueta (ombros, quadril, parte de tras): pega o pixel de corpo
            # mais proximo da mesma linha, em vez de um pixel qualquer da borda
            col = near[py][px]
            if col is not None:
                px = col
                outside += 1
        px = min(w - 1, max(0, px))
        c = getpixel((px, py))
        if c[0] >= 200 and c[1] >= 200 and c[2] >= 200:
            col = near[py][px]
            if col is not None:
                c = getpixel((col, py))
        # profundidade: o lado de tras fica um pouco mais escuro
        t = (vz - z_back) / max(1e-6, z_front - z_back)
        shade = 0.82 + 0.18 * min(1.0, max(0.0, t))
        colors += struct.pack(
            "<fff", c[0] / 255.0 * shade, c[1] / 255.0 * shade, c[2] / 255.0 * shade
        )
    print(f"{outside} vertices fora da silhueta (colados na borda)")

    new_bin = bin_data + bytes(colors)
    j["buffers"][0]["byteLength"] = len(new_bin)
    new_bv = len(j["bufferViews"])
    j["bufferViews"].append(
        {"buffer": 0, "byteOffset": len(bin_data), "byteLength": len(colors), "target": 34962}
    )
    new_acc = len(j["accessors"])
    j["accessors"].append(
        {"bufferView": new_bv, "componentType": 5126, "type": "VEC3", "count": pos_acc["count"]}
    )
    prim["attributes"]["COLOR_0"] = new_acc

    json_bytes = json.dumps(j, separators=(",", ":")).encode()
    if len(json_bytes) % 4:
        json_bytes += b" " * (4 - len(json_bytes) % 4)
    if len(new_bin) % 4:
        new_bin += b"\x00" * (4 - len(new_bin) % 4)

    with open(out_path, "wb") as f:
        f.write(struct.pack("<III", 0x46546C67, 2, 12 + 8 + len(json_bytes) + 8 + len(new_bin)))
        f.write(struct.pack("<II", len(json_bytes), 0x4E4F534A))
        f.write(json_bytes)
        f.write(struct.pack("<II", len(new_bin), 0x004E4942))
        f.write(new_bin)
    print("salvo", out_path)
    return 0


if __name__ == "__main__":
    sys.exit(main())
