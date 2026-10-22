"""Gera tools/3d/smoll_skin_red_hq.ipynb: um notebook unico para rodar no Colab.

A imagem da skin vai embutida em base64, entao basta subir o .ipynb e apertar
"Executar tudo". O GLB sai em /content/smoll_skin_red_hq.glb.

Uso: python tools/3d/make_colab_notebook.py
"""
import base64
import io
import json
import os

from PIL import Image

HERE = os.path.dirname(os.path.abspath(__file__))
RAW = os.path.join(HERE, "..", "raw", "smoll_skin_red_raw.png")
OUT = os.path.join(HERE, "smoll_skin_red_hq.ipynb")
NAME = "smoll_skin_red"

CODE = r'''# 1) instala e compila (8-10 min, só na primeira vez)
import os, subprocess, sys, sysconfig, types
def sh(c, cwd=None): subprocess.check_call(c, shell=True, cwd=cwd)
R = '/content/Hunyuan3D-2.1'
if not os.path.exists(R):
    sh('git clone -q https://github.com/Tencent-Hunyuan/Hunyuan3D-2.1.git', '/content')
if not os.path.exists('/content/.deps_ok'):
    sh('pip install -q ninja pybind11 transformers==4.46.0 diffusers==0.30.0 accelerate==1.1.1 huggingface-hub==0.30.2 pytorch-lightning==1.9.5 safetensors einops opencv-python-headless imageio scikit-image rembg onnxruntime pymeshlab pygltflib xatlas trimesh==4.4.7 omegaconf pyyaml configargparse timm torchdiffeq torchmetrics pydantic==2.10.6 psutil tqdm addict future lmdb yapf fast-simplification open3d')
    sh('pip install -q basicsr-fixed realesrgan --no-deps')
    sh('pip install -q -e . --no-build-isolation', R + '/hy3dpaint/custom_rasterizer')
    D = R + '/hy3dpaint/DifferentiableRenderer'
    sh('bash compile_mesh_painter.sh', D)
    inc = subprocess.check_output([sys.executable, '-m', 'pybind11', '--includes']).decode().strip()
    sh(f'c++ -O3 -shared -std=c++11 -fPIC {inc} mesh_inpaint_processor.cpp -o mesh_inpaint_processor{sysconfig.get_config_var("EXT_SUFFIX")}', D)
    sh('wget -q https://github.com/xinntao/Real-ESRGAN/releases/download/v0.1.0/RealESRGAN_x4plus.pth -P hy3dpaint/ckpt', R)
    open('/content/.deps_ok', 'w').write('1')
    print('deps + compile ok', flush=True)

# 2) forma (Hunyuan3D-2.1 DiT, octree 512, 50 passos)
os.chdir(R)
sys.modules['bpy'] = types.ModuleType('bpy')
sys.path[:0] = ['./hy3dshape', './hy3dpaint', R + '/hy3dpaint/custom_rasterizer']
import torch
from hy3dshape.rembg import BackgroundRemover
from hy3dshape.pipelines import Hunyuan3DDiTFlowMatchingPipeline
try:
    from torchvision_fix import apply_fix; apply_fix()
except Exception as e:
    print('torchvision_fix:', e)

name = 'smoll_skin_red'
img = '/content/' + name + '_raw.png'
if not os.path.exists('shape_' + name + '.glb'):
    shape = Hunyuan3DDiTFlowMatchingPipeline.from_pretrained('tencent/Hunyuan3D-2.1')
    mesh = shape(image=BackgroundRemover()(Image.open(img).convert('RGB')),
                 octree_resolution=512, num_inference_steps=50, num_chunks=20000)[0]
    mesh.export('shape_' + name + '.glb')
    print('forma ok', flush=True)
    del shape; torch.cuda.empty_cache()

# 3) textura PBR multiview. view_size 512 cabe em 16 GB; na A100 pode subir para 768.
from textureGenPipeline import Hunyuan3DPaintPipeline, Hunyuan3DPaintConfig
conf = Hunyuan3DPaintConfig(6, 512)
conf.realesrgan_ckpt_path = 'hy3dpaint/ckpt/RealESRGAN_x4plus.pth'
conf.multiview_cfg_path = 'hy3dpaint/cfgs/hunyuan-paint-pbr.yaml'
conf.custom_pipeline = 'hy3dpaint/hunyuanpaintpbr'
paint = Hunyuan3DPaintPipeline(conf)
paint(mesh_path='shape_' + name + '.glb', image_path=img,
      output_mesh_path=name + '.obj', save_glb=False)

import trimesh
trimesh.load(name + '.obj', force='scene').export('/content/' + name + '_hq.glb')
print('PRONTO -> /content/' + name + '_hq.glb', flush=True)
'''


def cell(kind, source):
    return {"cell_type": kind, "execution_count": None, "metadata": {}, "source": source}


def main():
    im = Image.open(RAW).convert("RGB")
    if im.width > 1024:
        im = im.resize((1024, round(im.height * 1024 / im.width)), Image.LANCZOS)
    buf = io.BytesIO()
    im.save(buf, "PNG", optimize=True)
    b64 = base64.b64encode(buf.getvalue()).decode()
    lines = [b64[i:i + 100] for i in range(0, len(b64), 100)]
    embedded = "\n".join('    "%s"' % ln for ln in lines)

    image_cell = (
        "# a imagem da skin vem embutida: nao precisa subir arquivo nenhum\n"
        "import base64, io\nfrom PIL import Image\n"
        "B64 = (\n" + embedded + "\n)\n"
        "img = Image.open(io.BytesIO(base64.b64decode(B64)))\n"
        "img.save('/content/smoll_skin_red_raw.png')\n"
        "print('imagem:', img.size)\n"
    )

    nb = {
        "nbformat": 4,
        "nbformat_minor": 0,
        "metadata": {
            "colab": {"name": "smoll_skin_red_hq.ipynb", "gpuType": "T4"},
            "kernelspec": {"name": "python3", "display_name": "Python 3"},
        },
        "cells": [
            cell(
                "markdown",
                "# Skin cueca vermelha -> GLB texturado\n\n"
                "1. **Ambiente de execução → Alterar o tipo**: GPU **A100** e **versão do ambiente 2025.07** "
                "(o runtime mais novo quebra as dependências).\n"
                "2. Subir este `.ipynb` e apertar **Executar tudo** (~25 min; 8-10 só instalando).\n"
                "3. No painel **Arquivos** aparece `/content/smoll_skin_red_hq.glb` — baixar e salvar em "
                "`public/models/smoll_skin_red_hq.glb`.\n"
                "4. **Ambiente de execução → Desconectar e excluir** para parar de gastar unidades.\n",
            ),
            cell("code", image_cell),
            cell("code", CODE),
        ],
    }
    with open(OUT, "w", encoding="utf-8") as f:
        json.dump(nb, f, ensure_ascii=False)
    print("gerado", OUT, "com imagem", im.size, "(%.1f MB de base64)" % (len(b64) / 1e6))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
