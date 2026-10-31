# Plano — interação jogador ↔ Smoll

> Complemento de [PLANO-POSES-CAMA.md](PLANO-POSES-CAMA.md). Aquele documento conserta **o que o Smoll faz sozinho**; este conserta **o que acontece entre ele e você**.
> Referências de código conferidas: `interact.ts`, `smoll.ts`, `state.ts`, `props.ts`, `main.ts`, `inventory.ts`, `social.ts`, `menu.ts`, `net.ts`.

---

## 0. O problema real

O Smoll hoje tem **três verbos** e nenhum deles depende de você:

| verbo | como | o que ele faz |
|---|---|---|
| falar | mirar nele + `E` | abre um menu fixo de opções |
| dar item | item na mão + clique com a mira | um clipe de 2 s (`drink`/`food`/`wear`/`outro`) |
| comandar | `state.cmd('pose:...')` via menu ou tela do PC | executa |

Nada disso sabe **onde você está**, **há quanto tempo**, **o que ele está fazendo**, **o que você fez antes** ou **como ele está se sentindo**. `near = dist < 5 && mode === 'desk'` (`smoll.ts:327`) é a única percepção do jogo inteiro: e ela só move a cabeça dele, e só quando ele está sentado no PC.

Conclusão: **o Smoll é um móvel que responde a comandos**. Trocar as poses não resolve isso, porque o problema não está no vocabulário do corpo — está na ausência de gramática.

Princípio que organiza todo o plano:

> **Interação = o Smoll tem um estado interno que muda por causa de você, e você percebe a mudança.**
> Se você faz algo e nada muda nele, não houve interação — houve animação.

---

## 1. Inventário: o que já existe e serve de alicerce

Não é preciso inventar quase nada de infraestrutura. Já está no jogo:

| peça | onde | para que serve aqui |
|---|---|---|
| `act(o, label, fn, use)` com **`label` função** | `interact.ts:7` | prompt **contextual** (`[E] Sentar ao lado dele`) — já suportado, `smoll.ts:144` já usa |
| `ray.far = 2.0` | `interact.ts:12` | o alcance do braço. É a régua para separar "colado" de "longe" |
| assento com `state.seat` + `sitAct` | `props.ts:141`, `main.ts:373-376` | **14 assentos** no jogo (sofá, poltrona, puffs, rede, cadeiras, banquinhos, piscina) — **nenhum na cama** |
| `takenSeats` sincronizado | `state.ts:19`, `net.ts:54` | ocupação — mas só conta **jogadores**, o Smoll não ocupa lugar nenhum |
| `openPanel(title, body, btns)` | `menu.ts:20` | painel pronto para um "roda de interação" contextual |
| `handG` (item na 1ª pessoa) | `inventory.ts:208, 221-227` | já existe um objeto na mão da câmera — mas **sem modelo de mão/braço** |
| `EMOTES` + tecla `B` | `social.ts` | gestos do jogador, hoje **sem alvo** |
| sistema de `idleMod` do visitante (11 idles) | `visitor.ts:45-60` | é o motor de reação que o Smoll não tem — dá para portar |
| `state.smollOut` / `smollCmd` | `state.ts:29-32`, `net.ts` | qualquer estado novo (humor, ocupação da cama) chega nos outros jogadores |

---

## 2. A peça que falta: memória

Sem memória, toda interação é one-shot e o jogador aprende que nada do que ele faz importa.

```ts
// state.ts
smollBond: 0,               // 0..100  vínculo: sobe com atenção, cai com desprezo
smollMood: 'neutro' as 'neutro' | 'contido' | 'provocando' | 'entregue' | 'irritado',
smollPatience: 1,           // 0..1  cai quando você insiste ou ignora; se zera, ele se fecha
smollSees: { dist: 99, ang: 0, stare: 0, seat: '', held: '', hour: 8 },
```

O que o humor muda, concretamente:

| humor | fala | pose disponível | aceita toque? | inicia conversa? |
|---|---|---|---|---|
| `neutro` | piada seca | as 3 mais neutras | hesita | raramente |
| `contido` | monossílabo, cara fechada | nenhuma íntima | não (recua) | não |
| `provocando` | duplo sentido, provocação | todas menos as íntimas | provoca e desvia | sim |
| `entregue` | baixo, direto | todas, inclusive as novas | sim, e pede mais | sim |
| `irritado` | curto e cortante | só `normal` | não | não |

Regras de transição (valores iniciais, ajustáveis):

- estar a menos de 2 m por 10 s: `bond += 1`
- tocar (verbos da §4): `bond += 4`; toque repetido em menos de 6 s: `patience -= 0.3`
- escolher uma pose íntima: `bond += 2`
- ignorar uma fala dele (não responder em 20 s): `bond -= 2`, `patience -= 0.2`
- mandar levantar quando ele está entregue: `bond -= 5`
- `bond > 60` → `provocando`; `> 85` → `entregue`; `patience === 0` → `irritado` por 60 s

---

## 3. Camada 1 — percepção (`smollPerceive()`)

Hoje `smoll.update(dt, now, px, pz)` (`smoll.ts:249`) recebe **só duas coordenadas**. Precisa receber o jogador inteiro (ou um struct). Um bloco de ~40 linhas, rodando 4×/s:

```ts
dist  = hypot(px - M.x, pz - M.z)                       // já existe
ang   = ângulo entre a FRENTE do Smoll e o jogador       // novo: ele sabe se você está atrás dele
seen  = dist < 6 && |ang| < 1.0                          // cone de visão de ~115°
stare = tempo com getTarget() === o act dele             // novo: você está mirando nele?
seat  = state.seat?.key ?? ''                            // sentado? deitado? em qual spot?
held  = slots[sel]?.id ?? ''                             // o que você tem na mão (exportar de inventory.ts)
hour  = gameHour()                                       // state.ts:46
look  = direção da câmera (p.yaw/p.pitch) → vetor       // novo
```

Três coisas que isso destrava de graça e que hoje não existem:

1. **Ele te vê chegar.** `seen && dist < 3` → vira a cabeça, para o que está fazendo, comenta.
2. **Ele sabe que você está olhando.** `stare > 4 s` → reage (`provocando`: provoca; `contido`: cobre-se/desvia; `entregue`: não desvia).
3. **Ele sabe que você sentou do lado.** `seat` → muda a pose dele para a versão de par (§5).

> Isso também conserta o `near` do [plano das poses](PLANO-POSES-CAMA.md#3-as-sete-causas-raiz-e-onde-consertar) (defeito 6). É o mesmo conserto: hoje `near` é `dist < 5 && mode === 'desk'`; passa a ser `seen`.

---

## 4. Camada 2 — os verbos, por alcance

O `ray.far = 2.0` já define a fronteira. O plano organiza os verbos em 4 faixas, e **cada faixa tem uma affordance diferente** — o jogador não precisa de tutorial.

### A. Colado (0 – 1,2 m, mirando nele) — TOCAR
O verbo novo mais importante e o mais barato.

- **Segurar `E` por 0,5 s** → `act.touch` (hoje `E` é só `keydown`, `interact.ts:142-148`; precisa de `keyup` para cancelar).
- **Alvo do toque** escolhido pela parte do Smoll mais próxima do centro da mira: cabeça, ombro, mão, quadril, coxa.
- **Reação**: 1 s de animação + 1 fala curta + som. Cada parte do corpo reage diferente e o humor filtra (em `contido` ele recua com `lean -= 0.1`; em `entregue` ele procura a mão).
- **Mão em 1ª pessoa**: `handG` (`inventory.ts:208`) já vive na câmera, mas só carrega item. Um braço + mão low-poly (5 primitivas, mesmo estilo do corpo fallback de `smoll.ts:41-70`) que sobe até o alvo e volta: ~30 linhas. Sem isso, "tocar" é uma câmera que treme.

### B. Perto (1,2 – 2 m, mirando) — o alcance atual
- `E` → **diálogo contextual**: o menu muda conforme humor, lugar (PC / cama / sofá / cozinha) e o que você acabou de fazer.
- Item na mão + clique → dar. **Novo**: ele **aceita ou recusa** pelo humor (`contido` recusa bebida: "agora não"; `entregue` aceita e comenta). Hoje `smoll.ts:144-151` sempre aceita e sempre faz o mesmo clipe.
- **Novo**: `F` (usado no carro, livre a pé) = **convidar** ("vem pra cama", "vem ver a TV"). Ele aceita ou não pelo humor — e se aceitar, anda até lá de verdade (a máquina de `TASKS`/`route()` já faz isso).

### C. Longe (2 – 6 m, sem mirar) — ele reage sozinho
- `seen && dist < 4` → olha, acena, comenta. Sem tecla, sem menu. É o que faz o jogo parecer vivo quando você só entra no quarto.

### D. Assento — SENTAR/DEITAR JUNTO
A faixa mais transformadora. Ver §5.

### E. Gesto dirigido (`B` mirando nele)
`social.ts` dispara um emote do jogador, mas **sem alvo** (`emote(id)`). Passar `getTarget()` e uma identidade (`o.userData.act.smoll === true`) faz o gesto virar dirigido: acenar → ele acena de volta; mandar beijo → reage pelo humor; aplaudir → ele faz uma reverência (o clipe `dance` já existe). É o verbo mais barato de todos: ~20 linhas.

---

## 5. Camada 3 — a cama como lugar de dois

Hoje **não existe assento na cama**. Todos os 14 `sitAct` estão em outros móveis. Sem um lugar para o jogador, "interagir com ele na cama" é impossível por construção.

### 5.1 Os spots
```ts
// props.ts, junto da cama (linha ~459)
const CAMA = [{ x: 13.40, y: 0.66, z: 12.55, yaw:  Math.PI / 2 },   // lado esquerdo dele
              { x: 13.40, y: 0.66, z: 13.45, yaw: -Math.PI / 2 }]   // lado direito
sitAct(manta, CAMA, 'Deitar na cama')
```
- O spot **central** (onde ele deita, z ≈ 13,00) tem que ser bloqueado enquanto ele está na cama — hoje `state.takenSeats` só recebe jogadores (`net.ts:54`). Duas linhas: `smoll.ts` registra `state.takenSeats.add('13.0_13.0')` ao deitar e remove ao levantar.
- O `label` do `sitAct` vira função: sem ele na cama → `'Deitar na cama'`; com ele → `'Deitar ao lado dele'`.

### 5.2 Câmera deitada (o que vende a cena)
Hoje `main.ts:375` faz `camera.position.set(s.x, s.y + 0.6, s.z)` e `main.ts:377` trava o roll em 0 (`camera.rotation.set(p.pitch, p.yaw, 0, 'YXZ')`). Deitado precisa de:

- `state.seat` ganha `lie?: number` (0 sentado → 1 deitado) e `roll?: number`.
- altura da câmera: `s.y + 0.6` → `s.y + 0.22` (deitado o olho fica a ~22 cm do colchão).
- `camera.rotation.set(p.pitch, p.yaw, s.roll ?? 0, 'YXZ')` — com `roll = ±π/2` você fica deitado de lado, vendo o teto e ele ao mesmo tempo.
- levantar com WASD continua igual (`main.ts:282`) — só o ponto de saída (`ex/ez`) tem de ser recalculado para o lado da cama, não para dentro dela.

**Só isso já muda a cena inteira.** Deitado, o Smoll passa a ser visto a 30 cm, de baixo; o quarto fica pequeno; a luz do abajur entra rasante. Nenhuma pose nova é necessária para sentir diferença.

### 5.3 Poses de par (`BED_PAIR`)
O Smoll precisa de poses **relativas ao jogador**, não absolutas. Duas entram no `BED` de [PLANO-POSES-CAMA.md](PLANO-POSES-CAMA.md):

| pose | quando | corpo |
|---|---|---|
| `deLado` | jogador deitado ao lado | `roll = π/2`, de lado, virado pra você, cabeça apoiada na mão, quadril à mostra |
| `junto` | humor `entregue` | de lado, colado, cabeça no seu ombro, mão no seu peito |

O eixo de espelhamento depende de **qual spot** você escolheu (esquerda/direita) — o `bedPose` precisa receber o lado e espelhar em x, senão ele fica de costas para você.

### 5.4 O corpo do jogador
Em 1ª pessoa ele não tem corpo: `state.avatar` só aparece no espelho (`props.ts:410`). Deitado, isso significa que o Smoll **não tem em quem encostar**. Duas opções, ambas baratas:

1. **Mínimo (recomendado):** braço + mão em 1ª pessoa (§4-A) e a câmera deitada. O contato é vendido pela mão, pelo olhar dele, pelo som e pela respiração. Não precisa de corpo inteiro.
2. **Completo:** ligar o `selfV` (`net.ts:66`) no modo cama, com uma pose de deitar. Custa a sincronização do avatar e 1 dia a mais — só vale se você quiser câmera em 3ª pessoa ou espelho no quarto.

---

## 6. Camada 4 — ele toma iniciativa

Um agendador `smollTalk` de 20–90 s, ativo quando `seen && dist < 5` e ele está livre. Escolhe por prioridade de contexto:

| gatilho | fala | clipe |
|---|---|---|
| madrugada (h < 5 ou h > 23) | "ainda acordado?" | `stretch` |
| você segurando bebida | "essa aí é minha?" | `point` |
| você olhando > 5 s sem agir | "tá gostando do vista?" | `think` ou pose |
| silêncio > 90 s com você perto | te chama pelo nome | `wave` |
| `bond > 85` | pede algo ("fica mais um pouco") | `thumbs` |
| você ignorou a última fala | "…tá, entendi" | `shrug` |

Tudo isso usa o que já existe: `toast('Smoll: …')`, `anim.play(clip)`, e o `pick()` de `state.ts`. Zero infraestrutura nova.

**Isso é o que separa "NPC de loja" de "personagem".** Hoje ele nunca fala sem você pedir: o jogador aprende em 2 minutos que a conversa é um menu.

---

## 7. Fases

| fase | entrega | arquivos | esforço |
|---|---|---|---|
| **M0** | memória + percepção + **prompt contextual na mira** | `state.ts`, `smoll.ts` | 0,5 dia |
| **M1** | assento na cama + câmera deitada + Smoll ocupando o centro | `props.ts`, `state.ts`, `main.ts` | 1 dia |
| **M2** | toque (segurar E) + braço/mão em 1ª pessoa + reações | `interact.ts`, `inventory.ts`, `smoll.ts` | 1,5 dia |
| **M3** | diálogo contextual por humor e por lugar (cama, PC, sofá) | `interact.ts` | 1,5 dia |
| **M4** | gestos dirigidos + dar item com aceite/recusa | `social.ts`, `smoll.ts` | 1 dia |
| **M5** | ele inicia (`smollTalk`) + consequência de ignorar | `smoll.ts` | 1 dia |
| **M6** | rede: `bond`/`mood`/ocupação da cama em `smollOut` | `state.ts`, `net.ts` | 0,5 dia |

**Total ≈ 7 dias**, somados aos ~8 do [plano das poses](PLANO-POSES-CAMA.md) → **~15 dias** para o conjunto.

Ordem recomendada: **M0 → M1 → M5 → M2 → M3 → M4 → M6**.
M0 e M1 são 1,5 dia e mudam mais a sensação do que as 2 semanas de pose sozinhas — porque sem eles o jogador nem consegue chegar perto. E M5 (ele iniciar) é o que faz o jogo parecer vivo com o código que já existe.

---

## 8. Riscos e decisões abertas

1. **Onde fica o teto do conteúdo.** O sistema aqui é neutro: os mesmos verbos (tocar, sentar junto, deitar junto, convidar) funcionam para uma cena afetuosa ou para o caminho adulto que você quer. A diferença é a tabela de falas + o filtro de humor + a pose. Recomendo implementar a mecânica inteira primeiro e calibrar o tom depois — trocar texto é barato, refazer mecânica não é.
2. **`E` está sobrecarregado.** Hoje `E` é a única tecla de interação, e VR mapeia o gatilho nela (`main.ts:331`). Adicionar "segurar E para tocar" muda o timing de tudo — mitigar: `E` curto = falar, `E` segurado = tocar, com 0,4 s de buffer.
3. **A mira é o único canal.** Mirar nele para tocar é estranho quando os dois estão deitados. No modo cama, trocar a mira por "o que está mais perto do centro da tela" **e** priorizar o Smoll sempre que ele estiver a menos de 1 m.
4. **O Smoll não tem braço livre.** `rig.ts:153` documenta que o braço é casca aberta; abdução > 50° vira "asa". O toque **do jogador** não sofre disso (a mão é primitiva nova); o **abraço do Smoll** sofre. Ver a nota do modelo do visitante em `visitor.ts:40`: aquele GLB tem braço separado — é a prova de que o pipeline consegue gerar o Smoll assim.
5. **Multiplayer.** `bond`/`mood` são por jogador ou por mundo? Se forem por jogador e só o host roda a IA, dois jogadores vão brigar pela mesma memória. Recomendo: **mundo único, host manda** (`smollOut`), e a cama só aceita um jogador por spot (o `takenSeats` já resolve).
6. **Mobile/VR.** `segurar E` não existe em VR (o gatilho é um clique). Precisa de um verbo alternativo: apontar a mão e apertar (raycast da controladora) — `xrInput` já dispara `KeyE` (`main.ts:331`), então o "segurar" tem de ser simulado com 2 toques.

---

## 9. Resumo em uma frase

As poses dão **vocabulário**; falta a **gramática** — perceber, lembrar, reagir, aceitar, recusar e tomar iniciativa. Comece por **M0 (percepção + prompt contextual)** e **M1 (sentar/deitar na cama)**: são 1,5 dia, não dependem de nenhuma pose nova e são o que transforma o Smoll de móvel em personagem.
