"""Gera os sprites 2D do Smoll's Room com o Codex CLI (mesmo método do aethercore, ver PLANO.md).
Uso: python tools/gen_assets.py [nome ...]   (sem nomes = todos; PNG existente é pulado, apague para refazer)
Saída: public/sprites/<nome>.png (fundo removido) e tools/raw/<nome>_raw.png (original, fundo branco = entrada do Hunyuan3D)."""
import glob, os, re, shutil, subprocess, sys, time
from concurrent.futures import ThreadPoolExecutor
from PIL import Image, ImageDraw

HERE = os.path.dirname(os.path.abspath(__file__))
RAW = os.path.join(HERE, 'raw')
OUT = os.path.join(HERE, '..', 'public', 'sprites')
CODEX = os.path.expanduser('~/.codex/packages/standalone/current/bin/codex.exe')
GEN = os.path.expanduser('~/.codex/generated_images')
SMOLL_REF = os.path.join(HERE, '..', '..', 'aethercore', 'apps', 'game', 'public', 'heroes', 'smoll.png')  # arte do SmoLL
for d in (RAW, OUT): os.makedirs(d, exist_ok=True)

BASE = ("Use your image generation tool to create exactly ONE image and nothing else (do not write code, do not edit files).\n\n"
        "The image shows ONE single game asset for a first-person game set inside a brick house in Rondonia, Brazil (hot Amazon climate, "
        "red dirt everywhere). Stylized hand-painted cartoon game art (rich colors, bold clean outlines, soft shading, lots of small realistic "
        "details like wear, dust, stickers, cables), seen straight from the FRONT, flat and orthographic, centered, filling most of the frame, "
        "completely in focus, nothing cropped. No ground, no cast shadow, no text, no frame, no border. "
        "Background: a perfectly flat solid pure white (#FFFFFF) fill, nothing else.\n\n")

ITEMS = {
    # garagem
    'portao': "The asset: a wide sliding garage gate of a Brazilian house, dark blue-gray painted metal with horizontal slats in the lower half and a vertical-bar grille in the upper half, rusty edges, red dust stains at the bottom, a small padlock latch.",
    'carro': "The asset: a small old red Brazilian hatchback car, seen from the SIDE (profile view, nose pointing left), dusty with red mud splashes on the lower body, a tiny dent, black wheels with silver hubcaps, dark tinted windows, a sticker on the rear window.",
    'bancada': "The asset: a garage workbench against a wall: a thick worn wood top on a steel frame, a red toolbox, a bench vise, paint cans, screwdrivers and a hammer lying on top, and above it a pegboard full of hanging tools (wrenches, saw, pliers) with tool outlines painted on it.",
    'estante': "The asset: a tall metal and wood garage shelving unit with four shelves full of cardboard boxes, paint buckets, bottles, extension cords, a deflated football and old tools.",
    'geladeira_velha': "The asset: an old cream-white refrigerator kept in the garage, rust spots, magnets and stickers on the door, a dented corner, dusty with red dirt.",
    # quarto
    'cama': "The asset: a double bed seen from the front (foot of the bed toward the viewer): dark wooden headboard, white sheets, a colorful blue and orange striped blanket folded at the foot, two fluffy pillows, one slightly messy.",
    'janela': "The asset: a white aluminum window with a sliding glass pane, a thin mosquito screen, beige curtains tied to the sides, a small plant on the sill; through the glass a warm late-afternoon orange sky and a mango tree on red dirt ground.",
    'guarda_roupa': "The asset: a brown wooden two-door wardrobe, one door slightly open showing hanging clothes (t-shirts and hoodies), small gold handles, a sticker on the door.",
    'criado_mudo': "The asset: a small wooden bedside table with a lit table lamp with a warm yellow shade, a glass of water, a phone charging and a tiny cactus.",
    'setup_pc': "The asset: a gamer programmer desk seen from the front, NO person: a black desk with TWO monitors side by side showing colorful code editors, an RGB mechanical keyboard glowing, a mouse on a big mousepad, a PC tower with a glass side and RGB fans under the desk, a headset hanging on a monitor, energy drink cans, sticky notes, a black gamer chair pushed in.",
    # sala e cozinha
    'sofa': "The asset: a three-seat gray fabric sofa with armrests and a couple of colorful cushions, a crocheted blanket on one arm.",
    'tv_rack': "The asset: a TV on a dark wood rack: flat TV showing a blue game menu, a game console and controller on the rack, a small potted plant beside it.",
    'mesa_cozinha': "The asset: a small round wooden kitchen table with four chairs, a fruit bowl with mangoes and bananas, a thermos and two cups.",
    # quintal
    'mangueira': "The asset: a big leafy mango tree seen from the front, thick brown trunk, dense dark-green canopy full of ripe orange-yellow mangoes, a few fallen mangoes at the base, red dirt around the roots.",
    'rede': "The asset: a colorful striped hammock (rede) tied between two wooden posts, sagging in the middle, red, yellow and white stripes with crocheted fringes, a flip-flop on the floor beneath.",
    'varal': "The asset: a backyard clothesline between two metal poles with colorful clothes hanging (t-shirts, shorts, a towel with stripes), clothespins.",
    'churrasqueira': "The asset: a Brazilian brick barbecue grill (churrasqueira) with a chimney, glowing charcoal, skewers of meat (espetinhos) on the grill, a bag of charcoal and a cold beer bottle on the side.",
    'cachorro': "The asset: a friendly caramel-colored mutt dog (vira-lata caramelo) sitting and smiling, tongue out, a red collar, side view.",
    'ventilador':"The asset: a ceiling fan with four wooden blades seen from below at a slight angle, a small light kit in the center.",
}

# modelo realista: entrada do Hunyuan3D (ver PLANO.md, "Modelo 3D realista do Smoll")
SMOLL_FOTO = os.path.join(HERE, 'ref', 'smoll_foto.png')
REAL = {
    'smoll_real': ("The asset: a PHOTOREALISTIC full-body image of the man in the attached reference photo (second image: keep his face exactly recognizable: dark thick wavy voluminous hair swept up, strong eyebrows, brown eyes, full curved mustache joined to a trimmed dark beard with a goatee, olive skin). "
                   "He stands straight facing the camera in a relaxed A-pose, arms slightly away from the body, legs slightly apart, feet visible, wearing a plain dark gray crew-neck t-shirt, dark blue jeans and plain black sneakers. "
                   "Realistic skin texture, soft even studio lighting, face large and sharp and well lit, no objects in his hands, no shadow on the floor, whole body fully visible head to feet, centered."),
}
REAL['smoll_bermuda'] = (REAL['smoll_real'].replace("wearing a plain dark gray crew-neck t-shirt, dark blue jeans and plain black sneakers.",
                         "wearing a plain dark gray crew-neck t-shirt, plain navy-blue knee-length bermuda shorts (NO jeans, NO long pants) and simple plain black flip-flop slippers (chinelo) with bare feet and bare ankles clearly visible, bare shins and calves visible."))
REAL['visitante_real'] = ("The asset: a PHOTOREALISTIC full-body image of the man in the attached reference photo (second image: keep his face exactly recognizable: short dark swept-back hair, thick dark eyebrows, brown eyes, trimmed brown beard with a goatee, light skin). "
                          "He stands straight facing the camera in a relaxed A-pose, arms slightly away from the body, hands open with fingers slightly apart, legs slightly apart, feet visible, wearing a MODERN Brazilian Army style combat uniform: "
                          "a long-sleeve field shirt and trousers in green digital-pixel camouflage, a plain olive-green tactical vest, black combat boots, and a plain olive-green beret held at his side or none. "
                          "Contemporary tactical look. No historical uniforms, no shoulder boards, no medals, no badges, no emblems, no flags, no text of any kind. "
                          "Realistic skin texture, soft even studio lighting, face large and sharp and well lit, nothing in his hands, no shadow on the floor, whole body fully visible head to feet, centered.")
REAL_REF = {'visitante_real': os.path.join(HERE, 'ref', 'visitante_foto.png')}
# Smoll: usa a arte existente como referência de rosto e estilo
SMOLL = ("The character is SmoLL: an adult Brazilian man in his thirties, programmer from Rondonia, thick voluminous wavy black hair swept back and up with one loose lock over the forehead, "
         "strong dark thick eyebrows, brown eyes, a full curved dark mustache joined to a neatly trimmed full dark beard with a goatee, NO glasses, medium lean build. "
         "Match the face and art style of the attached reference image, but dressed casually: a dark gray oversized hoodie, regular blue jeans (long pants down to the ankles) and closed black sneakers with laces (NO shorts, NO slippers, NO flip-flops, NO bare legs). ")
SMOLL_POSES = {
    'smoll_costas': "Pose: seated on a black gamer chair, seen from BEHIND, hands up as if typing, head slightly tilted toward the screens. Show only the character and the chair.",
    'smoll_virado': "Pose: seated on a black gamer chair that has swung around to face the viewer, one arm over the backrest, a relaxed ironic half-smile, looking at the viewer. Show only the character and the chair.",
    'smoll_em_pe': "Pose: standing, full body, front view, arms relaxed, friendly ironic half-smile.",
    'smoll_rindo': "Pose: standing, full body, front view, laughing, one hand on his belly, the other holding a can of guarana soda.",
}


def newest_png(session):
    fs = sorted(glob.glob(os.path.join(GEN, session, '*.png')), key=os.path.getmtime)
    return fs[-1] if fs else None


def key_white(src, dest):
    """fundo branco ligado às bordas -> transparente (não apaga o branco de dentro do objeto), recorta no objeto."""
    im = Image.open(src).convert('RGB')
    w, h = im.size
    for pt in ((0, 0), (w - 1, 0), (0, h - 1), (w - 1, h - 1)):
        ImageDraw.floodfill(im, pt, (255, 0, 255), thresh=40)
    a = im.convert('RGBA')
    px = a.load()
    for y in range(h):
        for x in range(w):
            if px[x, y][:3] == (255, 0, 255): px[x, y] = (0, 0, 0, 0)
    a = a.crop(a.getchannel('A').getbbox())
    a.save(dest)


def key_mask(src, mask_path, dest):
    """Recorte exato pela silhueta do Birefnet (sem o halo branco do flood-fill)."""
    im = Image.open(src).convert('RGB')
    mask = Image.open(mask_path).convert('L').resize(im.size, Image.LANCZOS)
    a = im.convert('RGBA')
    a.putalpha(mask)
    a = a.crop(a.getchannel('A').getbbox())
    a.save(dest)


def run(name):
    dest = os.path.join(OUT, f'{name}.png')
    raw = os.path.join(RAW, f'{name}_raw.png')
    if os.path.exists(dest):
        return
    if not os.path.exists(raw):
        prompt = BASE + (SMOLL + SMOLL_POSES[name] if name in SMOLL_POSES else REAL[name] if name in REAL else ITEMS[name]) + '\n'
        pf = os.path.join(RAW, f'{name}.txt'); log = os.path.join(RAW, f'{name}.log')
        open(pf, 'w', encoding='utf-8').write(prompt)
        cmd = [CODEX, 'exec', '--skip-git-repo-check', '-C', RAW] + (['-i', SMOLL_REF] if name in SMOLL_POSES else ['-i', REAL_REF.get(name, SMOLL_FOTO)] if name in REAL else []) + ['-']
        t = time.time()
        with open(pf, encoding='utf-8') as f, open(log, 'w', encoding='utf-8') as lf:
            subprocess.run(cmd, stdin=f, stdout=lf, stderr=subprocess.STDOUT, timeout=900)
        m = re.search(r'session id: ([0-9a-f-]+)', open(log, encoding='utf-8', errors='ignore').read())
        img = newest_png(m.group(1)) if m else None
        if not img:
            print(f'FAILED {name}', flush=True); return
        shutil.copy(img, raw)
        print(f'ok {name} ({time.time() - t:.0f}s)', flush=True)
    key_white(raw, dest)


if __name__ == '__main__':
    names = sys.argv[1:] or list(ITEMS) + list(SMOLL_POSES)
    with ThreadPoolExecutor(max_workers=5) as ex:
        list(ex.map(run, names))
    print('done', flush=True)
