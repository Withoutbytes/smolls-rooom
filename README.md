# Smoll's Room

Jogo web em primeira pessoa passado na casa do Smoll, um programador de Rondônia. Você anda pela casa, garagem, quintal e rua do bairro, usa o PC, a TV e o celular, e pode jogar com outras pessoas na mesma sala.

Feito com **Vite + TypeScript + Three.js**. Roda no navegador e também em VR (WebXR).

## Rodando

Precisa de Node 22+.

```bash
npm install
npm run dev      # jogo em http://localhost:5173
npm run server   # (opcional) servidor multiplayer em ws://localhost:8080
npm run build    # build de produção em dist/
```

O servidor local aceita `PORT=xxxx` para trocar a porta.

## Controles

| Tecla | Ação |
|---|---|
| `WASD` / setas | andar |
| Mouse | olhar (pointer lock) |
| `E` | interagir (segurar = tocar) |
| `I` | inventário |
| `Q` / `G` | soltar / jogar o item na mão |
| `M` | mapa de cima |
| `F` | sair do veículo |
| `F2` / `F3` | liga/desliga efeitos gráficos (debug de FPS) |
| `Esc` | menu / fechar |

## Estrutura

```
src/        jogo (cliente)
  main.ts       loop, câmera, entrada
  map.ts        mapa em grade e colisão
  place.ts      casa, quintal, rua
  props.ts      móveis e objetos
  smoll.ts, rig.ts, smollAnim.ts   o Smoll: modelo GLB, rig de 17 ossos e poses
  pc.ts, pcgui.ts, desktop.ts      o PC e o sistema dentro dele
  tv.ts, phone.ts, social.ts       TV, celular e rede social do jogo
  vr.ts         suporte a VR
  net.ts        cliente multiplayer
  fx.ts, tex.ts efeitos (pós-processamento) e materiais PBR
server/     servidor WebSocket (Node + ws): posições a 15 Hz, relógio do dia
worker/     versão Cloudflare Worker + Durable Object do mesmo servidor
tools/      geração de assets (sprites 2D, GLB via Colab) e páginas de debug de poses
public/     modelos .glb, sprites, texturas
```

Detalhes de design e decisões ficam em [`PLANO.md`](PLANO.md), [`PLANO-INTERACAO-SMOLL.md`](PLANO-INTERACAO-SMOLL.md) e [`PLANO-POSES-CAMA.md`](PLANO-POSES-CAMA.md) (em português).

## Deploy

Push na `main` dispara `.github/workflows/deploy.yml`, que builda e publica no Cloudflare Workers com `wrangler`. Para fazer o seu próprio:

1. Troque `name` e o domínio em `wrangler.jsonc`.
2. Crie os secrets `CLOUDFLARE_API_TOKEN` e `CLOUDFLARE_ACCOUNT_ID` no repositório.

## Assets e créditos

- Texturas PBR em `public/tex`: [Poly Haven](https://polyhaven.com) (CC0).
- Sprites 2D: gerados com IA (`tools/gen_assets.py`).
- Modelos 3D (`public/models`): gerados com Hunyuan3D a partir de imagens (`tools/3d`).
- Three.js, Vite e ws: licenças próprias de cada projeto.

## Contribuindo

Issues e PRs são bem-vindos. Mantenha simples: sem frameworks novos, sem dependências para o que dá pra fazer em poucas linhas. Teste no navegador antes de abrir o PR (`window.__p` e `window.__map` ajudam a depurar).

## Licença

Veja o arquivo `LICENSE`.
