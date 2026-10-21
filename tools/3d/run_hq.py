# Imagem -> GLB 3D texturizado (Hunyuan3D-2.1) no Colab A100, runtime 2025.07. Uso: python -u run_hq.py <nome>  (precisa de /content/<nome>_raw.png). Veja docs/modelos-3d.md
import os, sys, subprocess, sysconfig, types
def sh(c, cwd=None): subprocess.check_call(c, shell=True, cwd=cwd)
R='/content/Hunyuan3D-2.1'
NAMES=sys.argv[1:]  # varios nomes: carrega cada pipeline uma vez e gera um GLB por nome
if not os.path.exists(R): sh('git clone -q https://github.com/Tencent-Hunyuan/Hunyuan3D-2.1.git', '/content')
if not os.path.exists('/content/.deps_ok'):
    sh('pip install -q ninja pybind11 transformers==4.46.0 diffusers==0.30.0 accelerate==1.1.1 huggingface-hub==0.30.2 pytorch-lightning==1.9.5 safetensors einops opencv-python-headless imageio scikit-image rembg onnxruntime pymeshlab pygltflib xatlas trimesh==4.4.7 omegaconf pyyaml configargparse timm torchdiffeq torchmetrics pydantic==2.10.6 psutil tqdm addict future lmdb yapf fast-simplification open3d')
    sh('pip install -q basicsr-fixed realesrgan --no-deps')
    sh('pip install -q -e . --no-build-isolation', R+'/hy3dpaint/custom_rasterizer')
    D=R+'/hy3dpaint/DifferentiableRenderer'
    sh('bash compile_mesh_painter.sh', D)
    inc=subprocess.check_output([sys.executable,'-m','pybind11','--includes']).decode().strip()
    sh(f'c++ -O3 -shared -std=c++11 -fPIC {inc} mesh_inpaint_processor.cpp -o mesh_inpaint_processor{sysconfig.get_config_var("EXT_SUFFIX")}', D)
    sh('wget -q https://github.com/xinntao/Real-ESRGAN/releases/download/v0.1.0/RealESRGAN_x4plus.pth -P hy3dpaint/ckpt', R)
    open('/content/.deps_ok','w').write('1')
    print('deps+compile ok', flush=True)
os.chdir(R)
sys.modules['bpy']=types.ModuleType('bpy')
sys.path[:0]=['./hy3dshape','./hy3dpaint',R+'/hy3dpaint/custom_rasterizer']
import numpy as np, torch
from PIL import Image
def upscale(name):  # sprite pequeno: upscale 4x com Real-ESRGAN antes do 3D
    SRC,IMG=f'/content/{name}_raw.png',f'/content/{name}_up.png'
    if os.path.exists(IMG): return IMG
    raw=Image.open(SRC).convert('RGB')
    if raw.width >= 700:  # already big (generated images): no upscale needed
        raw.save(IMG)
        return IMG
    try:
        from basicsr.archs.rrdbnet_arch import RRDBNet
        from realesrgan import RealESRGANer
        net=RRDBNet(num_in_ch=3,num_out_ch=3,num_feat=64,num_block=23,num_grow_ch=32,scale=4)
        up=RealESRGANer(scale=4,model_path=R+'/hy3dpaint/ckpt/RealESRGAN_x4plus.pth',model=net,half=True)
        out,_=up.enhance(np.array(raw)[:,:,::-1],outscale=4); Image.fromarray(out[:,:,::-1]).save(IMG)
    except Exception as e:
        print('realesrgan falhou, usando lanczos:',e); raw.resize((raw.width*4,raw.height*4),Image.LANCZOS).save(IMG)
    print('upscale ok',name,flush=True); return IMG
from hy3dshape.rembg import BackgroundRemover
from hy3dshape.pipelines import Hunyuan3DDiTFlowMatchingPipeline
try:
    from torchvision_fix import apply_fix; apply_fix()
except Exception as e: print('torchvision_fix:', e)
imgs={n:upscale(n) for n in NAMES}
todo=[n for n in NAMES if not os.path.exists(f'shape_{n}.glb')]
if todo:
    shape=Hunyuan3DDiTFlowMatchingPipeline.from_pretrained('tencent/Hunyuan3D-2.1'); rm=BackgroundRemover()
    for n in todo:
        mesh=shape(image=rm(Image.open(imgs[n]).convert('RGB')), octree_resolution=512, num_inference_steps=50, num_chunks=20000)[0]
        mesh.export(f'shape_{n}.glb'); print('forma ok',n,flush=True)
    del shape; torch.cuda.empty_cache()
from textureGenPipeline import Hunyuan3DPaintPipeline, Hunyuan3DPaintConfig
import trimesh
conf=Hunyuan3DPaintConfig(9, 768)
conf.realesrgan_ckpt_path='hy3dpaint/ckpt/RealESRGAN_x4plus.pth'
conf.multiview_cfg_path='hy3dpaint/cfgs/hunyuan-paint-pbr.yaml'
conf.custom_pipeline='hy3dpaint/hunyuanpaintpbr'
paint=Hunyuan3DPaintPipeline(conf)
for n in NAMES:
    paint(mesh_path=f'shape_{n}.glb', image_path=imgs[n], output_mesh_path=f'{n}.obj', save_glb=False)
    trimesh.load(f'{n}.obj', force='scene').export(f'/content/{n}_hq.glb')
    print('PRONTO',n,flush=True)
