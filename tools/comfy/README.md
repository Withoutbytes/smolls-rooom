# Pipeline de arte 2D → 3D no ComfyUI local

Tudo roda na máquina (RTX 5070 Ti, 16 GB). Nada de nuvem, nada de custo.

## Arquivos

| Arquivo | O que faz |
|---|---|
| `skin_red_pipeline.json` | Receita a foto da skin, tira o fundo, melhora o detalhe e salva em alta resolução |
| `skin_red_trellis2.json` | Transforma a imagem limpa em um `.glb` texturizado (TRELLIS.2) |
| `skin_red_front.json`, `skin_red_inpaint.json` | Tentativas anteriores (img2img / inpaint do corpo), deixadas como referência |

## Como rodar

1. Colocar a foto da skin em `tools/ref/` e copiar para a pasta de input do ComfyUI:
   `C:\Users\mutecb\AppData\Local\Comfy-Desktop\ComfyUI-Shared\input\`
2. Abrir o JSON no ComfyUI e apertar **Run**. Ou, pela CLI:
   `comfy run-template` não serve aqui — use `comfy run --workflow tools/comfy/skin_red_pipeline.json` (ou abra o arquivo na interface).

## O que o `skin_red_pipeline.json` faz, passo a passo

1. **LoadImage** — a foto da skin.
2. **RemoveBackground (Birefnet)** — pega a silhueta do corpo como máscara.
3. **InvertMask → MaskToImage → ImageCompositeMasked** — cola o personagem sobre fundo branco puro. Não usa difusão para o fundo, então o rosto e a roupa não mudam.
4. **ImageScale 640x1536** — tamanho que o SDXL trabalha bem.
5. **KSampler denoise 0.35** (RealVisXL V5.0) — só uma passada de detalhe: pele, tecido, costuras. A pose e o rosto ficam iguais.
6. **4x-UltraSharp** → **ImageScale 1024x2368** — upscale real, não stretch.
7. Salva dois PNGs: `smoll_skin_red_clean` (640x1472, entrada do 3D) e `smoll_skin_red_hi` (1024x2368, sprite).

Para o sprite transparente do jogo, `tools/gen_assets.py` já tem a função `key_white()` que transforma o fundo branco em transparente e recorta no objeto:

```
python -c "import sys; sys.path.insert(0,'tools'); from gen_assets import key_white; key_white('tools/raw/smoll_skin_red_raw.png','public/sprites/smoll_skin_red.png')"
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

## Modelos usados (já baixados)

- `realvisxlV50_v50Bakedvae_703211.safetensors` — SDXL realista
- `4x-UltraSharp.pth` — upscale
- `birefnet.safetensors` — recorte de fundo
- `dino_v3_L_naf_fp32.safetensors` — visão do TRELLIS
- `trellis_2_int8_convrot.safetensors`, `trellis_2_shape_vae_bf16.safetensors`, `trellis_2_texture_vae_bf16.safetensors` — TRELLIS.2
