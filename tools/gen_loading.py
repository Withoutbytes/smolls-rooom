"""Gera a arte de fundo da tela de carregamento com o Codex CLI e os sprites pequenos do Smoll dançando.
Uso: python tools/gen_loading.py            (gera public/img/loading_bg.jpg e public/img/smoll_a.png / smoll_b.png)"""
import glob, os, re, shutil, subprocess, time
from PIL import Image

HERE = os.path.dirname(os.path.abspath(__file__))
RAW = os.path.join(HERE, 'raw'); OUT = os.path.join(HERE, '..', 'public', 'img')
CODEX = os.path.expanduser('~/.codex/packages/standalone/current/bin/codex.exe')
GEN = os.path.expanduser('~/.codex/generated_images')
REF = os.path.join(HERE, '..', 'public', 'sprites', 'smoll_em_pe.png')
os.makedirs(RAW, exist_ok=True); os.makedirs(OUT, exist_ok=True)

# sprites pequenos pro Smoll dançar na tela de carregamento (os originais têm ~1 MB; esses ficam com poucas dezenas de KB)
for src, dst in (('smoll_em_pe', 'smoll_a'), ('smoll_rindo', 'smoll_b')):
    im = Image.open(os.path.join(HERE, '..', 'public', 'sprites', src + '.png')).convert('RGBA')
    h = 320; im = im.resize((int(im.width * h / im.height), h), Image.LANCZOS)
    im.save(os.path.join(OUT, dst + '.png'), optimize=True)

PROMPT = ("Use your image generation tool to create exactly ONE image and nothing else (do not write code, do not edit files).\n\n"
          "A wide 16:9 cinematic loading-screen background illustration for a game called Smoll's Room, in the same hand-painted stylized cartoon art style as the attached character reference "
          "(rich colors, bold clean outlines, soft shading, lots of small details). Scene: a warm golden-hour sunset over a quiet street in Ariquemes, Rondonia, Brazil: a white brick house with a red clay-tile hip roof "
          "and a sliding gate, a big leafy mango tree full of ripe mangoes, red dirt road and sidewalks, concrete utility poles with tangled power lines, a caramel mutt dog sleeping on the sidewalk, "
          "a red motorcycle parked in the garage, string lights, orange-pink sky with soft clouds and a few birds. Keep the CENTER of the image calm and slightly darker (empty space) because a character and a progress bar will be placed over it. "
          "No people, no text, no letters, no logos, no border.\n")
pf = os.path.join(RAW, 'loading_bg.txt'); log = os.path.join(RAW, 'loading_bg.log'); open(pf, 'w', encoding='utf-8').write(PROMPT)
t = time.time()
with open(pf, encoding='utf-8') as f, open(log, 'w', encoding='utf-8') as lf:
    subprocess.run([CODEX, 'exec', '--skip-git-repo-check', '-C', RAW, '-i', REF, '-'], stdin=f, stdout=lf, stderr=subprocess.STDOUT, timeout=900)
m = re.search(r'session id: ([0-9a-f-]+)', open(log, encoding='utf-8', errors='ignore').read())
fs = sorted(glob.glob(os.path.join(GEN, m.group(1), '*.png')), key=os.path.getmtime) if m else []
if not fs:
    print('FAILED'); raise SystemExit(1)
shutil.copy(fs[-1], os.path.join(RAW, 'loading_bg_raw.png'))
im = Image.open(fs[-1]).convert('RGB'); im = im.resize((1280, int(im.height * 1280 / im.width)), Image.LANCZOS)
im.save(os.path.join(OUT, 'loading_bg.jpg'), quality=80, optimize=True)
print(f'ok ({time.time() - t:.0f}s)')
