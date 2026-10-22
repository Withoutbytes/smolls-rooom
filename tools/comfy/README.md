# Pipeline de arte 2D → 3D no ComfyUI local

Tudo roda na máquina (RTX 5070 Ti, 16 GB). Nada de nuvem, nada de custo.

## Arquivos

| Arquivo | O que faz |
|---|---|
| `skin_red_faithful.json` | **Versão usada**: recorte Birefnet + fundo branco + upscale 4x, sem difusão (preserva o rosto) |
| `skin_red_pipeline.json` | Versão antiga, com RealVisXL `denoise 0.35` — recria o rosto, não usar para a skin |
| `skin_red_hunyuan3d.json` | Transforma a imagem limpa em um `.glb` de forma (Hunyuan3D 2.0) e reduz a malha |
| `skin_red_trellis2.json` | Transforma a imagem limpa em um `.glb` texturizado (TRELLIS.2) |
| `skin_red_front.json`, `skin_red_inpaint.json` | Tentativas anteriores (img2img / inpaint do corpo), deixadas como referência |

## Como rodar

1. Colocar a foto da skin em `tools/ref/` e copiar para a pasta de input do ComfyUI:
   `C:\Users\mutecb\AppData\Local\Comfy-Desktop\ComfyUI-Shared\input\`
2. Abrir o JSON no ComfyUI e apertar **Run**. Ou, pela CLI:
   `comfy run-template` não serve aqui — use `comfy run --workflow tools/comfy/skin_red_faithful.json` (ou abra o arquivo na interface).

## O que o `skin_red_faithful.json` faz, passo a passo

1. **LoadImage** — a foto da skin.
2. **RemoveBackground (Birefnet)** — pega a silhueta do corpo como máscara.
3. **InvertMask → MaskToImage → ImageCompositeMasked** — cola o personagem sobre fundo branco puro. Sem difusão, o rosto e a roupa continuam os pixels originais.
4. **4x-UltraSharp** (`ImageUpscaleWithModel`) — upscale real, não stretch: 1520x3512.
5. **ImageScale lanczos 640x1472** — versão menor para projetar cor sobre a malha.
6. **MaskToImage** da máscara do corpo → `smoll_skin_red_mask` (380x878), que serve de alpha exato.

Salva três PNGs: `smoll_skin_red_faithful` (1520x3512), `smoll_skin_red_faithful_640` (640x1472) e `smoll_skin_red_mask`.

O `skin_red_pipeline.json` antigo tem um **KSampler denoise 0.35** (RealVisXL V5.0) que recria o rosto — outro personagem, outro tipo de cara. Não use para a skin.

Para o sprite transparente, `key_white()` do `gen_assets.py` deixa um halo branco: o flood-fill parte dos cantos e não atravessa a borda escura do recorte. Use a máscara do Birefnet como alpha:

```
python -c "import sys; sys.path.insert(0,'tools'); from gen_assets import key_mask; key_mask('tools/raw/smoll_skin_red_faithful.png','tools/raw/smoll_skin_red_mask.png','public/sprites/smoll_skin_red.png')"
```

## O que o `skin_red_trellis2.json` faz

TRELLIS.2 (modelo instalado: `trellis_2_int8_convrot.safetensors`, 5 GB) gera forma + textura PBR a partir de uma única imagem:

1. Recorta a imagem no bounding box do corpo, 1024x1024, fundo preto.
2. **Trellis2Conditioning** com DINOv3 (`dino_v3_L_naf_fp32.safetensors`).
3. Estágio de estrutura → **VaeDecodeStructureTrellis2** (voxel 32³).
4. Estágio de forma → **Trellis2UpsampleStage** (1024) → **VaeDecodeShapeTrellis** (malha).
5. Estágio de textura → **VaeDecodeTextureTrellis** (cores por voxel).
6. **RemeshMesh → DecimateMesh (50k faces) → UnwrapMesh → PaintMesh → SaveGLB**.

VRAM: o upsample em 1024 é o ponto pesado. Se faltar memória, baixe `target_resolution` para 1024 (mínimo aceitado) e `RemeshMesh.resolution` para 256.

## O que o `skin_red_hunyuan3d.json` faz

Hunyuan3D 2.0 (`hunyuan3d-dit-v2_fp16.safetensors`, 4.6 GB) no ComfyUI base, sem nós customizados:

1. **LoadImage** — precisa de uma **entrada quadrada**: `CLIPVisionEncode` tem `crop: center`, então um retrato 640x1472 recorta só o tronco e o corpo sai deformado. Use `tools/3d/square_input.py` para centralizar o personagem num 1024x1024 branco.
2. **Hunyuan3Dv2Conditioning** + **EmptyLatentHunyuan3Dv2** (resolution 3072) + **KSampler** (20 passos, cfg 8, euler).
3. **VAEDecodeHunyuan3D** (`octree_resolution 512`) → **VoxelToMesh** → **DecimateMesh** (QEM, 30 mil faces) → **SaveGLB**.

A malha sai **cinza, sem textura**: os nós Hunyuan3D do ComfyUI base só fazem forma. Para colorir, projeta a foto sobre a malha:

```
python tools/3d/paint_from_photo.py <glb_sem_textura> tools/raw/smoll_skin_red_640.png public/models/smoll_skin_red_hunyuan.glb
```

O script alinha pela altura e pela silhueta do personagem, cola as laterais na borda da silhueta (o corpo veste ao redor) e escurece levemente o lado de trás. Escreve `COLOR_0` por vértice — o Three.js mostra isso com `material.vertexColors = true`.

## Modelos usados (já baixados)

- `realvisxlV50_v50Bakedvae_703211.safetensors` — SDXL realista
- `4x-UltraSharp.pth` — upscale
- `birefnet.safetensors` — recorte de fundo
- `hunyuan3d-dit-v2_fp16.safetensors` — Hunyuan3D 2.0 (só forma)
- `dino_v3_L_naf_fp32.safetensors` — visão do TRELLIS
- `trellis_2_int8_convrot.safetensors`, `trellis_2_shape_vae_bf16.safetensors`, `trellis_2_texture_vae_bf16.safetensors` — TRELLIS.2
