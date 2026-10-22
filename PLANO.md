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

## 4.3 Skin nova: cueca vermelha (2D local + 3D no Colab)

O Smoll tem duas skins: a casual (moletom, `smoll_real`) e a de cueca vermelha (tanque vermelho, cueca, ligas e meias até o joelho), a partir de `tools/ref/smoll_skin_red.png`.

Pipeline 2D na máquina (RTX 5070 Ti), 3D de qualidade no Colab:

1. **Limpar a foto** — `tools/comfy/skin_red_faithful.json`: Birefnet recorta o corpo, o personagem é colado sobre fundo branco puro e `4x-UltraSharp` faz o upscale real. **Sem difusão**: uma passada de RealVisXL com `denoise 0.35` (`skin_red_pipeline.json`) recriava o rosto e dava outro personagem — por isso a versão final não usa KSampler.
   - Saída: `tools/raw/smoll_skin_red_faithful.png` (1520x3512) e `tools/raw/smoll_skin_red_faithful_640.png` (640x1472). O arquivo `tools/raw/smoll_skin_red_raw.png` é o fiel, que é o que vai para o Colab.
2. **Sprite do jogo** — `key_white()` do `gen_assets.py` transforma o fundo branco em transparente e recorta: `public/sprites/smoll_skin_red.png` (1039x3318 RGBA).
3. **3D de protótipo (local)** — `tools/comfy/skin_red_hunyuan3d.json` usa o Hunyuan3D 2.0 do ComfyUI (`hunyuan3d-dit-v2_fp16.safetensors`, `octree_resolution 512`) e `DecimateMesh` (QEM, 30 mil faces): `public/models/smoll_skin_red_hunyuan.glb` (14.829 vértices, 29.564 triângulos, 700 KB).
   - **Entrada quadrada obrigatória**: o `CLIPVisionEncode` faz `crop: center`, então um retrato 640x1472 recorta só o tronco e o corpo sai deformado. `tools/3d/square_input.py` centraliza o personagem num quadrado 1024x1024 (`tools/raw/smoll_skin_red_sq.png`).
   - Os nós Hunyuan3D do ComfyUI base são **só de forma** (malha cinza, sem textura). `tools/3d/paint_from_photo.py` projeta a foto sobre a malha (alinhado pela altura e pela silhueta; as laterais e o traseiro pegam a cor da borda da silhueta) e escreve `COLOR_0` no GLB.
4. **Ver no navegador** — `viewer.html` (raiz do projeto, servido pelo Vite em `/viewer.html`) alterna Hunyuan3D / TRELLIS.2 / modelo do moletom, com girar, arame e vista de lado.
5. **3D final (Colab A100)** — `tools/3d/run_hq.py` + `tools/raw/smoll_skin_red_raw.png` no `/content`, e `python -u run_hq.py smoll_skin_red`. Dá forma 2.1 com octree 512, 50 passos, e textura PBR multiview (Real-ESRGAN) → `smoll_skin_red_hq.glb`.

Por que não rodar o Hunyuan3D-2.1 local: o pack `visualbruno/ComfyUI-Hunyuan3d-2-1` exige compilar `custom_rasterizer` (CUDA) e `DifferentiableRenderer`, e o `torch` do ComfyUI Desktop não traz headers C++ (`torch/include` não existe) — a compilação falha em `'torch/extension.h': No such file or directory`. Os wheels pré-compilados do pack são cp310–cp312 e a venv do Desktop é Python 3.13. Além disso, a etapa de textura pede ~21 GB de VRAM. Detalhes dos nós em `tools/comfy/README.md`.

## 4.4 Interações implementadas (`src/interact.ts`)

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

## 9. Mundo aberto, casas e física (decisão do usuário)

O mundo **não é limitado** à vizinhança da casa do Smoll: o usuário quer poder explorar o bairro, entrar em outras casas e, depois, em faculdades e outros lugares. A ideia é crescer aos poucos, com cada lugar entrável sendo um interior próprio (porta com `E`, fade, spawn), carregado sob demanda e com sala própria no multiplayer.

**Física (feita)**: gravidade, pulo (espaço) e colisão **com altura**: cada objeto tem uma caixa com topo e base (`block(x0, z0, x1, z1, topo, base)` em `props.ts`). Dá pra subir em cama (0,66 m), mesas (0,77 m), bancada, balcão, sofá, capô do carro, etc.; objetos mais altos bloqueiam. Chega de paredes invisíveis dentro da casa. As paredes invisíveis que sobram ficam só nas bordas do mundo.

Próximos passos: interiores das outras casas (zonas), faculdade (salas, laboratório com PCs que rodam o editor de código do Smoll) e sincronizar o Smoll/portões pelo servidor.

## 10. Expansão de conteúdo da casa do Smoll (planejamento)

Princípio: **tudo que tem forma de objeto deve ter pelo menos uma resposta** (olhar, abrir, pegar, usar item, ligar). Os blocos de código que já existem e devem ser reaproveitados: `act(obj, label, fn, use?)` (interação + reação a item), `thing()` (item pegável que vai pro inventário), `openPanel()` / `openChest()` (menu e baú, `src/menu.ts`), `defineItem()` / `give()` (`src/inventory.ts`), `ticks` (animações), `energy` (consumo de luz) e o relógio do jogo (`gameHour()`).

### 10.1 Sistemas novos (fazer antes de encher os cômodos)
1. **Receitas / bancada de trabalho**: combinar itens (ex.: Kuat + manga = "Kuat de manga"; café + leite = cappuccino). Painel com 2 slots + resultado, na cozinha e na oficina.
2. **Necessidades do jogador (opcional, leve)**: sede, fome e sono como barras discretas. Kuat/picolé/manga recuperam; cama dá sono; banheiro tem sua função. Só efeito cômico, sem morrer.
3. **Humor do Smoll** (`mood`): sobe com comida, Kuat e presentes; cai com campainha, itens suspeitos e apagão. Muda falas, animação ociosa e o que ele aceita. Já existe a escalada da campainha como protótipo.
4. **Rotina do Smoll pelo relógio**: de manhã café na cozinha, meio-dia sofá/TV, tarde PC, noite jogo, madrugada cama. Ele anda pelos cômodos usando os mesmos waypoints da animação da cama.
5. **Missões/pedidos**: o Smoll pede coisas ("traz uma Kuat gelada", "acha o controle da TV") e dá recompensa (item raro, acesso a lugar). Lista no menu `J`.
6. **Som espacial de verdade** (Web Audio com `PannerNode`): TV (sem o iframe), ventiladores, chuveiro, geladeira, campainha, passos, cachorro. Volume e panorâmica pela distância e direção.
7. **Sincronia no servidor**: portão, luzes, TV, Smoll, itens pegos (respawn global), hora do jogo.

### 10.2 Conteúdo por cômodo
**Sala** (já tem TV, sofá, estante, tapete): console de videogame (jogar um mini-jogo 2D na TV), caixas de som/bluetooth que mudam a música, estante com livros pegáveis (cada um com texto), vitrine com troféus e action figures, mesa de centro com controle remoto e controles de videogame, janela com cortina que abre, gaveta com garantias e cabos, quadro de fotos que conta a história do Smoll.
**Cozinha** (geladeira, bancada, armários): fogão com 4 bocas (cozinhar: miojo, ovo, cuscuz, café, com tempo e risco de queimar), micro-ondas (esquentar e explodir o que não devia), cafeteira, liquidificador, pia com louça acumulada (lavar), lixeira com reciclagem, despensa com mantimentos, mesa de jantar com cadeiras, filtro de água, relógio de parede, imã de geladeira com lista de compras.
**Corredor**: quadro de disjuntores (mesmo painel do relógio de luz, por cômodo), porta-chaves com chaves de moto e carro, sapateira, espelho de corpo inteiro, cabideiro, extintor, rodapé com tomadas (carregar celular).
**Quarto**: guarda-roupa por dentro (trocar de roupa de verdade, não só a bermuda), criado-mudo com gavetas, cama com cobertor que dobra, celular do Smoll (lê mensagens engraçadas), despertador, varal de LED, poster com easter egg, janela com persiana, cesto de roupa suja, halteres esquecidos, violão (tocar notas), mochila pegável com itens aleatórios.
**Banheiro**: já tem privada, pia, chuveiro, espelho e armário. Falta: toalha que molha, balança (peso comicamente variável), cesto, ralo que entope, vapor no espelho, pia que enche, luz de emergência.
**Oficina (ex-garagem)**: bancada com ferramentas pegáveis (chave de fenda, martelo, multímetro), gavetas de parafusos, impressora 3D que imprime brinquedos, osciloscópio, solda (mini-jogo), prateleira com peças de PC, caixas etiquetadas, quadro de ideias.
**Varanda**: rede (deitar e balançar), vasos que regam, tapete, cadeira de balanço, gaiola de passarinho, churrasqueira portátil, vista da rua, varal pequeno.
**Garagem/quintal**: carro e moto já são dirigíveis; falta capô/porta-malas abrindo, ferramentas, galão de gasolina (abastecer), mangueira com água de verdade (regar plantas que crescem), horta, mangueira (árvore) que dá manga por hora do dia, galinheiro, tanque de lavar roupa funcionando, cachorro no quintal, piscina de plástico, trampolim, rede de vôlei, varal que seca roupas de fato.
**Calçada**: relógio de luz (feito), caixa de correio (feita), campainha escalonada (feita), cachorro, lixeira, carrinho de picolé, cadeira. Falta: ponto de ônibus, orelhão, vendedor ambulante que passa em horários, entregador, motoboy, coleta de lixo que passa de manhã, vizinhos NPC que cumprimentam.

### 10.3 Itens (cada um com ícone, modelo 3D na mão e reação)
Comida: ovo, miojo pronto, pão, cuscuz, café, leite, suco de manga. Ferramentas: chave de fenda, martelo, lanterna (usa luz de verdade na mão), multímetro. Eletrônicos: celular, controle da TV, fone, pendrive com pistas, cabo USB. Chaves: carro, moto, portão, armário trancado. Roupas: chapéu, óculos, moletom, chinelo (usar muda o visual do jogador). Quest: diário (páginas), foto antiga, mapa do bairro, ingresso. Cada item novo = uma linha em `defineItem` + reações em `use` dos objetos.

### 10.4 Interações ricas (padrões)
- **Containers com menu** (feito: caixa de correio): geladeira, gavetas, guarda-roupa, mochila, caixa de ferramentas.
- **Painéis** (feito: relógio de luz, controle da TV, desktop do PC): disjuntores, console, fogão, cafeteira, celular, balança, computador da oficina.
- **Item na mão em objeto**: chave abre porta, lanterna ilumina o armário escuro, comida pro cachorro, ferramenta conserta a torneira, pano limpa o espelho.
- **Reações em cadeia**: apagão desliga TV, ventilador, geladeira (leite estraga); campainha irrita o Smoll; Kuat demais deixa ele agitado.
- **Mini-jogos curtos**: fliperama, tiro ao alvo no quintal, digitação, memória com os itens do armário.

### 10.5 Ordem sugerida
1. Itens/receitas + fogão e cozinha viva (rápido, usa o que já existe). 2. Guarda-roupa e troca de roupa visual do jogador. 3. Humor e rotina do Smoll com o relógio. 4. Som espacial real. 5. Quintal vivo (horta, manga por hora, mangueira). 6. Missões e menu `J`. 7. Mini-jogos e console na sala. 8. Sincronização no servidor de tudo que muda estado. 9. Entrar nas casas dos vizinhos reutilizando os mesmos helpers.


## 11. Vida social e cômodos vazios (planejamento)

Estado atual: **quarto, cozinha, banheiro, quintal da frente e calçada** já têm bastante interação. **Sala, varanda, oficina, corredor, garagem e quintal dos fundos** estão quase vazios (a sala tem TV com YouTube, sofá, estante e tapete; o resto é cenário). Objetivo: cada cômodo ter um **papel social** (onde os jogadores se juntam, fazem algo juntos e chamam o Smoll), e a casa funcionar como ponto de encontro do multiplayer.

### 11.1 Sistemas novos (base pra tudo abaixo)
1. **Assentos** (`seat(obj, pose, offset)`): E num sofá/cadeira/banco/rede senta, a câmera desce e vira pra frente do móvel, WASD levanta. Cada assento guarda quem está sentado (1 jogador por lugar). No multiplayer o servidor guarda `seats: {id → playerId}` e o corpo do visitante usa a pose sentada (já existe a pose `SIT` do Smoll em `smollAnim.ts`, reaproveitar no rig do visitante).
2. **Emotes e gestos dos jogadores**: acenar, apontar, rir, dançar, sentar-se de qualquer jeito, aplaudir (tecla `B` abre roda de emotes). Os visitantes já têm gestos ociosos; falta disparar sob comando e sincronizar pelo servidor.
3. **Convidar o Smoll** (`state.cmd('task:...')` já anda e usa objetos): novas tarefas "senta comigo", "vem assistir", "vamos jogar", "vem pro quintal". Ele escolhe um lugar livre (assento mais perto do jogador), senta e fica reagindo ao que passa na TV.
4. **Eventos da casa** (`houseEvent`): atividades coletivas com início/fim, início anunciado no chat e participantes registrados: sessão de filme, noite de jogos, churrasco, festa, estudo. Cada evento liga os objetos certos (TV, som, luz, churrasqueira), muda o humor do Smoll e pode dar item raro no final.
5. **Chat de texto e de voz por proximidade**: balão de fala curto sobre a cabeça + log. Voz com WebRTC se couber, volume pela distância (casa com o som espacial do item 10.1.6).
6. **Humor e relacionamento do Smoll** (`mood`, `friendship[playerId]`): sobe com presentes, convites e eventos; desbloqueia falas, itens e tarefas. Já temos o protótipo da campainha irritando ele.
7. **Persistência** (localStorage + servidor): inventário, amizade com o Smoll, itens da casa que mudaram de lugar.

### 11.2 Sala (maior prioridade: é o ponto de encontro)
- **Sofá de 3 lugares + poltrona + puffs**: sentar (sistema de assentos). Quem senta vira "plateia" da TV: os visitantes sentados ganham a mesma câmera voltada pra TV.
- **TV como evento**: "Sessão de filme" com votação (cada um escolhe entre 4 vídeos do YouTube via o controle) e **sincronia no servidor** (mesmo vídeo, mesmo tempo pra todo mundo). Smoll comenta no meio ("esse final é ruim") e dá pipoca.
- **Videogame**: console no rack com 2 controles pegáveis; mini-jogos 2D na própria tela da TV (pong, corrida, jogo da velha, quiz) pra 1–2 jogadores; Smoll joga contra você e perde de propósito às vezes.
- **Mesa de centro**: pipoca, copos, Kuat, controles (pegáveis, vão pra mesa de volta); "preparar pipoca" no micro-ondas.
- **Som**: caixa bluetooth e vitrola com playlist (gerada por Web Audio ou links). Volume por distância, tema muda o humor.
- **Estante/vitrine**: livros pegáveis (cada um com um texto curto), action figures, troféus, jogo de tabuleiro (abre mini-jogo), álbum de fotos (mostra as fotos tiradas com o celular).
- **Janela com cortina** que abre e fecha; **ar-condicionado/ventilador** com controle; **quadro de aviso** com recados dos jogadores.

### 11.3 Varanda
- **Rede** de verdade: deitar e balançar (assento especial), 2 lugares.
- **Cadeira de balanço**, mesinha com tereré/café e baralho: jogo de cartas (truco) com 2–4 jogadores.
- **Vasos que regam** (mangueira/regador pegáveis) e crescem; gaiola de passarinho que canta de dia; vista da rua com **binóculos** (zoom nos vizinhos e passantes).
- **Cadeira de praia + violão** (o violão do quarto pode vir pra cá): "show" com o Smoll tocando e os jogadores batendo palma.

### 11.4 Oficina (ex-garagem fechada)
- **Bancada**: ferramentas pegáveis (chave de fenda, martelo, multímetro, solda); **consertar** objetos quebrados da casa (torneira, ventilador, controle) como pequena missão.
- **Impressora 3D**: escolhe um brinquedo, imprime em 30 s e vira item.
- **Bancada de PC**: montar/desmontar peças (mini-quebra-cabeça), osciloscópio, prateleiras etiquetadas, quadro de ideias onde jogadores deixam post-its (persistente).
- **Moto na oficina**: trocar óleo, encher pneu, ligar (já é pilotável).

### 11.5 Corredor e entrada
- **Quadro de disjuntores** por cômodo (já existe o disjuntor geral no relógio de luz); **porta-chaves** (chaves da moto, do carro, do portão); **sapateira** (tirar o calçado ao entrar, o Smoll reclama se não tirar); **espelho de corpo inteiro** (usa o avatar já pronto no reflexo); **cabideiro** com chapéus/óculos/moletom que mudam o visual do jogador.
- **Interfone/câmera da porta**: ver quem toca a campainha, liberar o portão de dentro.

### 11.6 Garagem e quintal
- **Churrasco**: churrasqueira que acende de verdade (já tem o carvão), carnes pegáveis, ponto da carne, mesa com cadeiras de plástico, som e cooler com bebida (vira o evento "Churrasco" com vários jogadores).
- **Horta e mangueira**: plantar, regar, colher mangas por hora do dia; galinheiro; cachorro caramelo que segue quem tem comida.
- **Esportes**: bola de futebol (chutar/arremessar com a física já pronta de itens soltos), rede de vôlei, trampolim, piscina de plástico (nadar/boiar).
- **Garagem**: carro e moto dirigíveis com passageiros (convidar amigos), capô/porta-malas abrindo, galão de gasolina, lavar o carro com a mangueira.

### 11.7 Quarto e banheiro (completar)
- **Quarto**: guarda-roupa por dentro (trocar de roupa de verdade, visual do jogador e do Smoll), cama pra 2 (deitar lado a lado), celular do Smoll (já temos), cesto de roupa, janela com persiana, pôster-segredo.
- **Banheiro**: toalha que molha, balança, vapor no espelho depois do banho, ralo que entope, pia que enche.

### 11.8 Visitantes (multiplayer) e Smoll anfitrião
- **Chegada**: tocar a campainha já aciona o Smoll (escalada de irritação). Falta ele **receber** o jogador na porta (anda até o portão, acena, "entra aí") quando ele está acordado e de bom humor.
- **Anfitrião**: Smoll oferece bebida/lanche aos visitantes, convida pra sentar, comenta o que cada um carrega, reage a itens suspeitos.
- **Tarefas em dupla**: "ajuda a carregar", "segura aqui", "entrega isso pro Smoll" (missões cooperativas pequenas).
- **Estados da casa sincronizados**: luzes, TV, portão, itens soltos, assentos, evento atual. O servidor vira o dono desse estado (hoje manda só posição e hora).

### 11.9 Ordem sugerida
1. **Assentos + sofá/poltrona/puffs + emotes** (destrava a parte social). 2. **Sessão de filme sincronizada** + pipoca + convidar o Smoll pra assistir. 3. **Rede e varanda** (assentos especiais + truco). 4. **Churrasco no quintal** (evento completo). 5. **Videogame na sala** com mini-jogos. 6. **Guarda-roupa** e visual do jogador. 7. **Oficina viva** (ferramentas, consertos, impressora). 8. **Anfitrião e amizade com o Smoll**. 9. **Voz/chat por proximidade** e persistência no servidor.

## 12. Cozinha mais interativa (planejamento)
Objetivo: a cozinha vira um lugar de fazer coisas de verdade (cozinhar, guardar, lavar, jogar fora), reaproveitando `thing`, `act(..., use)`, `openPanel/openChest`, `ticks` e as tarefas do Smoll.

**Ordem de trabalho (cada bloco termina com `vite build`)**
1. **Panelas no fogão**: panela e frigideira ficam sobre as bocas (E pega, clique com a peça na mão devolve); ao cozinhar a peça certa fica no fogão com a comida dentro e é só servir. Suporte de utensílios na parede (concha, espátula, pano de prato) e gaveta de talheres (garfo, faca, colher de sopa).
2. **Mais itens nos armários e na geladeira**: arroz, feijão, macarrão, sal, óleo, pimenta no armário; queijo, presunto, legumes (tomate, cenoura), congelador (carne, sorvete, gelo) e molho na porta. Ímã com lista de compras (mostra o que falta).
3. **Receitas novas**: arroz, feijão, bife, macarronada, pão com ovo (fogão); sanduíche (tábua) e vitamina de manga com leite + manga (liquidificador). Temperos não gastam.
4. **Lixeira, pano e pia**: resíduos de verdade (casca de ovo/banana/laranja, miolo de maçã, embalagens, comida queimada); lixeira com tampa que enche e esvazia; pano de prato (limpa a mesa); pia lava peça específica (panela e frigideira ficam sujas depois de cozinhar; prato avulso).
5. **Fruteira e bancada leste**: fruteira (banana, maçã, laranja, manga), cesta de pão, porta-copos, forninho elétrico, relógio de parede com a hora do jogo.
6. **Smoll**: "Almoça de verdade" (usa prato limpo, garfo e faca, deixa louça suja) e "Guarda a compra" (sacola aparece na mesa quando falta coisa na geladeira; guardar repõe tudo).

**Fora desta rodada**: lavar prato específico pelo Smoll, forninho que assa de verdade, mais bebidas, compras de verdade (sair de casa), persistência dos estados da cozinha no servidor.

## 13. Resultado: cômodos preenchidos
Feito (tudo em `props.ts`, bloco "CÔMODOS PREENCHIDOS"; sons em `sfx.ts`; `inventory.ts` ganhou `kick` e `zoomCam`):
- **Oficina**: ferramentas pegáveis na bancada, caixa de ferramentas e gaveteiro (baús), prateleira com caixas etiquetadas, bancada de eletrônica (osciloscópio animado, ferro de solda com fumaça, multímetro, RAM), quadro de ideias com post-its salvos em localStorage, impressora 3D (4 brinquedos, 20 s, vira item), ventilador quebrado (conserta com a chave de fenda), bicicleta com pneu furado (fita isolante + encher), extintor.
- **Sala**: estante com 8 livros (texto ao pegar/ler), videogame com jogo da velha contra o Smoll (precisa de controle), mesa de centro (pipoca, Kuat, copo, controles, tabuleiro "Corrida dos Bugs"), vitrola com 3 faixas geradas em Web Audio (volume pela distância), janela com cortina, quadro de fotos, vitrine de action figures, relógio, lixeirinha, planta que cresce.
- **Varanda**: cadeira de balanço sentável que balança, mesinha com 21 contra o Smoll, baralho e binóculos (zoom 4 s), vasos que crescem, regador, gaiola que canta, varal pequeno, tapete, chinelos.
- **Corredor**: quadro de disjuntores por cômodo (desarma luz/ventilador do cômodo), porta-chaves (a chave do portão funciona), sapateira, cabideiro (chapéu, óculos, moletom: vestir aparece no reflexo), espelho de corpo inteiro, interfone com histórico de quem tocou, extintor, tapetes.
- **Garagem/quintal**: prateleira com galão e ferramentas, bola de futebol (E chuta com física), rede de vôlei, ferramentas de jardim, piscina de plástico (boiar), trampolim, galinheiro (ovos e 3 galinhas), horta com 8 plantas que crescem regadas e colhem, mangueira (rega e enche copo), tanque que lava roupa (volta "lavado" em 5 s), churrasqueira com ponto da carne (cru, ponto, passada, queimou) e caixa de isopor.
- **Smoll**: 5 tarefas novas no menu "Pede pra ele fazer algo": videogame, consertar ventilador, regar horta, churrasco (entrega picanha), violão na varanda (novos nós/arestas: oficina, quintal, varanda).

Pendente: Smoll jogando de verdade no console (hoje só aparece "no controle 2"), trampolim sem impulso real do jogador, truco (só 21), roupas no Smoll, persistência de plantas e post-its no servidor, sincronia multiplayer destes objetos, mini-jogo de solda, sons espaciais além da vitrola/passarinho. Nada disso foi testado no navegador (só `vite build`).
