"""Pinta um .glb sem textura (Hunyuan3D) projetando a foto da skin sobre a malha.

Uso: python tools/3d/paint_from_photo.py <modelo.glb> <foto.png> <saida.glb>

Projecao ortografica frontal: cada vertice pega a cor do pixel correspondente
na imagem, alinhada pelo bounding box do personagem (nao da imagem inteira).
"""
import json
import struct
import sys

from PIL import Image


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
    import json

    return json.loads(data[json_off : json_off + json_len]), data[bin_off : bin_off + bin_len]


def subject_bbox(img):
    """Caixa do personagem: pixels que nao sao perto do branco do fundo."""
    w, h = img.size
    xs, ys = [], []
    px = img.load()
    for y in range(0, h, 2):
        for x in range(0, w, 2):
            r, g, b = px[x, y][:3]
            if r < 235 or g < 235 or b < 235:
                xs.append(x)
                ys.append(y)
    return min(xs), min(ys), max(xs), max(ys)


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
    x0, x1 = min(xs), max(xs)
    y0, y1 = min(ys), max(ys)

    img = Image.open(img_path).convert("RGB")
    sx0, sy0, sx1, sy1 = subject_bbox(img)
    sw, sh = sx1 - sx0, sy1 - sy0
    print(f"mesh bbox x[{x0:.3f},{x1:.3f}] y[{y0:.3f},{y1:.3f}]  subject bbox na foto: {sw}x{sh}")

    # alinha pela altura e mantem a proporcao real da foto (o modelo 3D e mais largo que a silhueta)
    scale = sh / (y1 - y0)
    cx = (x0 + x1) / 2.0
    img_cx = (sx0 + sx1) / 2.0
    colors = bytearray()
    for i in range(0, len(verts), 3):
        px = int(img_cx + (verts[i] - cx) * scale)
        py = int(sy0 + (1.0 - (verts[i + 1] - y0) / (y1 - y0)) * (sh - 1))
        px = min(img.width - 1, max(0, px))
        py = min(img.height - 1, max(0, py))
        c = img.getpixel((px, py))
        colors += struct.pack("<fff", c[0] / 255.0, c[1] / 255.0, c[2] / 255.0)

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
