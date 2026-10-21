# Smoll's Room — Plano

Jogo em primeira pessoa, casa do Smoll em Rondônia. Visual 2D (sprites) dentro de um mundo 3D simples. Single player agora, multiplayer depois.

## 1. Stack

| Peça | Escolha | Por quê |
|---|---|---|
| Build | **Vite + TypeScript** | pedido |
| Render | **Three.js** | paredes/chão são caixas, móveis e Smoll são planos com sprite (billboard). Sem modelo 3D. |
| Input | Pointer Lock + WASD, `E` interage | nativo do browser |
| Colisão | grade 2D (mapa em array) | casa é retangular, não precisa de física |
| Multiplayer (fase 4) | **WebSocket (`ws`) + Node** | servidor autoritativo mínimo |
| Assets | PNG transparente gerado pelo Codex | sem 3D por enquanto |

Pulei: engine de física, ECS, Colyseus/PartyKit. Entram só se o multiplayer pedir.

## 2. Por que Three.js e não raycaster estilo Doom

Raycaster dá mais trabalho (sprites, portas, altura) e trava para sempre em 2.5D. Three.js com planos dá o mesmo visual e depois aceita modelo 3D real trocando o sprite por `.glb`. É o caminho de menos retrabalho.

## 3. Estrutura

```
smolls-rooom/
  index.html
  src/
    main.ts          # loop, câmera, input
    world.ts         # lê map.ts e monta paredes/chão/teto
    map.ts           # grade da casa + lista de objetos
    sprites.ts       # cria billboards/planos a partir de PNG
    interact.ts      # raycast do centro da tela + tecla E
    smoll.ts         # NPC: estados + diálogo
    net.ts           # (fase 4) cliente WebSocket
  public/sprites/    # PNGs do Codex
  server/index.ts    # (fase 4)
```

Regra para o multiplayer ficar fácil: **todo estado do jogo (posição do jogador, estado do Smoll, objetos usados) vive num único objeto `state`**, e a renderização só lê dele.

## 4. A casa (grade, 1 célula = 1 m, fonte da verdade: `src/map.ts`)

```
+---------+---------+----------+
| GARAGEM | SALA    | COZINHA  |   norte (teto, janelas)
| (portão)|         |          |
+---------+----+----+----------+
|        CORREDOR (3 m)        |   largo, 3 m
+-------------+-------+--------+
| VARANDA     |BANHEIRO| QUARTO |
| (rede)      |        | do SMOLL|
+---+---------+--------+--------+
    | porta pro quintal
+------------------------------+
|   QUINTAL (céu aberto)       |   mangueira, varal, horta,
|   muro baixo de 1,8 m        |   churrasqueira, mesa, caixa d'água
+------------------------------+
```

- **Garagem**: portão de grade, carro/moto, bancada de ferramentas, geladeira velha.
- **Sala**: sofá, TV, ventilador de teto, quadro.
- **Cozinha**: geladeira, fogão, garrafa de café, mesa.
- **Banheiro**: pia, chuveiro, espelho.
- **Quarto do Smoll**: setup do PC (monitor duplo, teclado RGB, cadeira gamer), cama, ventilador. **Smoll sentado no PC de costas/lado**.
- **Varanda**: rede, porta pro quintal.
- **Quintal** (céu aberto, sol, terra vermelha e grama): 2 mangueiras com mangas, varal, tanque de lavar, churrasqueira, mesa de plástico, horta, caixa d'água, muro baixo.
- Clima de Rondônia: calor, ventilador girando, luz alaranjada de fim de tarde pela janela, cigarra de som ambiente.

## 4.1 Pipeline de arte: 2D primeiro, 3D depois (método do aethercore)

Mesmo caminho do `aethercore/docs/modelos-3d.md`:

1. **2D (agora)**: `python tools/gen_assets.py [nome ...]` pede ao **Codex CLI** uma imagem limpa de cada objeto (vista frontal, fundo branco) e salva o original em `tools/raw/<nome>_raw.png`. O script tira o fundo e grava `public/sprites/<nome>.png`. PNG existente é pulado; apague pra refazer.
2. **Smoll**: as poses usam `aethercore/apps/game/public/heroes/smoll.png` como referência de rosto e estilo (`-i`), vestido de moletom. Poses: `smoll_costas`, `smoll_virado`, `smoll_em_pe`, `smoll_rindo`. Animações = trocar de pose/frame (spritesheet em fila, como `gen_heroes.py`).
3. **3D (depois)**: o `tools/raw/<nome>_raw.png` (fundo branco) é a entrada do Hunyuan3D-2.1 no Colab A100 (`aethercore/tools/3d/run_hq.py`), que gera um `.glb` de ~40 mil faces com textura. Trocar sprite por `.glb` é só carregar o modelo no lugar do plano.
4. **Props procedurais** (`src/props.ts`): caixas e cilindros do Three.js servem de fallback enquanto o sprite não chega.

Itens a gerar (`ITEMS` em `tools/gen_assets.py`): portão, carro, bancada, estante, geladeira velha, cama, janela, guarda-roupa, criado-mudo, setup do PC (2 monitores), sofá, TV com rack, mesa da cozinha, ventilador, e as 4 poses do Smoll. Faltam para o quintal: mangueira, rede, varal, churrasqueira, cachorro caramelo.

## 4.2 Modelo 3D realista do Smoll (Colab, Hunyuan3D-2.1)

Referência pronta: `tools/raw/smoll_real_raw.png` (corpo inteiro, A-pose, fundo branco, 1024x1536, gerada pelo Codex a partir de `tools/ref/smoll_foto.png`). Como já passa de 700 px, o script pula o upscale.

1. Abrir um notebook novo em colab.research.google.com, **Ambiente de execução → Alterar o tipo**: GPU **A100** e **versão do ambiente 2025.07** (obrigatório, o runtime mais novo quebra as dependências).
2. Enviar para `/content` (painel Arquivos): `tools/3d/run_hq.py` e `tools/raw/smoll_real_raw.png`.
3. Numa célula: `!python -u /content/run_hq.py smoll_real 2>&1 | grep -v Warning`. Leva uns 25 min (8–10 só instalando).
4. Esperar `PRONTO smoll_real`, baixar `/content/smoll_real_hq.glb` e salvar em `public/models/smoll_real_hq.glb`.
5. **Ambiente de execução → Desconectar e excluir ambiente** (para de gastar unidades).

Depois do GLB: carregar com `GLTFLoader` no lugar do Smoll de primitivas, normalizar a altura (~1,75 m), calcular normais se faltarem, e decidir a pose. O modelo sai em A-pose em pé; para ele sentado no PC, ou rodar um rig simples (como o `RIGS` do aethercore) ou usar o Smoll em pé como NPC que levanta da cadeira.

## 4.3 Interações implementadas (`src/interact.ts`)

Mira no objeto → `[E] ação`. Armários e guarda-roupa abrem, geladeiras (+bebida), caixa de ferramentas, TV, ventilador, abajur, cama (soneca), rede, mangas na mangueira, torneira, churrasqueira, portão da garagem e porta da frente. **Smoll**: menu por teclas 1–5 com "o que você tá fazendo", **códigos** (turbo, gigante, smoll mode, 20 s) e **bypass** (portão da garagem, geladeira grátis, teleporte pro quintal, "o PC do Smoll" ele recusa).

## 5. Smoll (personagem)

- Sprite base: rosto, cabelo preto e barba da referência, **roupa casual de programador** (camiseta/moletom). Só o visual do rosto vale da imagem, o cenário e a roupa dela não entram.
- Poses (spritesheet simples, 1 PNG por pose):
  1. sentado no PC, de costas
  2. sentado, virado pra você (cadeira girou)
  3. em pé, parado
  4. em pé, falando/gesto
  5. rindo
- Estados: `digitando → notou_jogador → virou → conversando → volta_digitando`.
- Interações (tecla `E` olhando pra ele): conversar (menu de falas), pedir café, mostrar a tela do PC, chamar pra jogar, irritar (ele reclama "tô codando!"). Cada fala é uma linha em `dialogos.json`.

## 6. Fases

**Fase 1 — Esqueleto (1ª sessão)**
- Vite + TS + Three.js, pointer lock, WASD, colisão na grade.
- Casa com paredes coloridas placeholders, sem sprites.
- ✅ Pronto quando: dá pra andar pela casa inteira sem atravessar parede.

**Fase 2 — Sprites e casa completa**
- Gerar PNGs no Codex (lista abaixo), `sprites.ts` cria os planos.
- Smoll sentado no PC no quarto, móveis em todos os cômodos, garagem.
- ✅ Pronto quando: todos os cômodos mobiliados e o Smoll visível.

**Fase 3 — Interações**
- Raycast no centro da tela, tooltip "[E] conversar", caixa de diálogo, máquina de estados do Smoll, interagir com objetos (ligar TV, ventilador, portão da garagem, PC).
- ✅ Pronto quando: dá pra conversar com o Smoll e ele reage.

**Fase 4 — Multiplayer**
- Servidor Node + `ws`, 20 msgs/s com posição, sala única.
- Outros jogadores = billboard simples com nome. Smoll controlado pelo servidor (todos veem o mesmo estado).
- Chat de texto + emotes.
- ✅ Pronto quando: 2 abas veem uma à outra e o mesmo Smoll.

**Fase 5 — Polimento**
- Áudio (ventilador, cigarra, teclado), iluminação por cômodo, mais falas, mais interações.

## 7. Sprites para gerar no Codex

Estilo único em todos (pixel art 64x64 ou ilustração chapada, escolher um e repetir no prompt). Fundo transparente, vista frontal, luz neutra.

| Grupo | Itens |
|---|---|
| Smoll | 5 poses acima |
| Quarto | PC setup, cadeira gamer, cama, guarda-roupa, ventilador, pôster |
| Sala | sofá, TV, estante, quadro, ventilador de teto |
| Cozinha | geladeira, fogão, mesa, cadeiras, cafeteira |
| Garagem | carro ou moto, bancada, portão de grade, caixas |
| Fora | rede, mangueira, planta, muro, céu (skybox plano) |
| Texturas | parede, piso cerâmica, teto, terra vermelha, grama (tileáveis) |

Template de prompt: `"<item>, front view, [estilo escolhido], transparent background, flat lighting, game asset"`.

## 8. Riscos

- **Sprite 2D visto de ângulo**: móveis como planos "somem" de lado. Solução: billboard que sempre encara a câmera (já previsto) e móveis grandes (cama, sofá) como caixas com textura nas faces.
- **Consistência de estilo nos sprites**: fixar o prompt de estilo e gerar tudo na mesma sessão.
- **Multiplayer**: começar com sala única, sem login. Contas e salas só se o jogo pegar.
