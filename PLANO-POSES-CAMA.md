# Plano — poses na cama: de manequim a cena

> Análise feita lendo `src/smollAnim.ts`, `src/rig.ts`, `src/smoll.ts`, `src/props.ts`, `src/interact.ts` e **medindo as juntas em mundo** (7 poses, 17 ossos) em `tools/pose-audit.html` e `tools/pose-bones.html`.
> **Escopo:** este documento trata do Smoll **sozinho**. A interação entre o jogador e ele (tocar, sentar do lado, deitar junto, ele tomar iniciativa) está em [PLANO-INTERACAO-SMOLL.md](PLANO-INTERACAO-SMOLL.md) — sem ela, pose melhor não muda a sensação.
> Referência de mundo: colchão topo **y = 0,65 m**, cobertor **0,66**, travesseiro **0,79**; cama **x 12,10–14,20 / z 12,10–13,90**; Smoll deitado com cabeça em **x ≈ 12,71**, quadril **13,45**, pés **14,09**.

---

## 0. Veredito

As 7 poses não são 7 cenas — são **7 variações de vetores de perna em cima da MESMA pose deitada**. Quadril, tronco, cabeça e braços não mudam em 6 das 7 (`normal`, `spread`, `legsUp`, `scissors`, `bridge`, `curl` têm exatamente os mesmos `L`/`R` do `LYING`). Sem encenação no corpo, sem contato, sem movimento, sem olhar, sem som, sem luz, sem câmera e sem diálogo próprio — o resultado lê como **manequim de fisioterapia**, não como cena íntima.

Três coisas explicam ~90% da sensação de "não é isso":

1. **A base `LYING` está quebrada**: os punhos ficam **y = 1,10 m**, ou seja **44 cm acima do colchão** e ~10 cm acima da barriga. Os braços "de mãos na barriga" do comentário são, na verdade, **antebraços em pé no ar**. Isso contamina 6 das 7 poses.
2. **Nenhum membro toca o colchão** (exceção: as mãos do `quatro`). Só o tronco encosta. Sem contato não existe peso, e sem peso não existe corpo.
3. **A pose é só a pose**: `anim.update` anima a cama com uma única linha de respiração (`lean += sin(t*1.8)*0.01`), o `near` é desligado na cama (ele **nunca olha pra você deitado**) e o `openTalk` abre o menu **do PC** enquanto ele está deitado.

---

## 1. Como a pose chega na tela (cadeia atual)

```
interact.ts  menu "Poses na cama"  →  state.cmd('pose:spread')
   → smoll.ts: gotoBed() (anda até a cama, 3 waypoints) → mode 'falling'
   → anim.loco.bed = { sit, lie }  (transição: em pé → sentado na quina → deitado)
   → anim.loco.pose = 'spread'
smollAnim.ts bedPose(sit, lie, pose)
   → clone(STAND) → lerp(SIT_EDGE) → lerp(LYING) → lerp(BED[pose], min(1,lie))
   → anim.update: lerpPose(cur, p, 1-exp(-dt*7))  ← 0,14 s, morfa seco
rig.ts  apply(pose): bacia (só translação + roll), 2 ossos de tronco com o MESMO lean,
        1 osso de cabeça x3, braços e pernas por "aim" (direção alvo por segmento)
```

O `Pose` tem **translação** de bacia (`rx, ry, rz`), **twist** (`roll`) e **inclinação** de tronco (`lean`), mas **não tem pitch de bacia nem curvatura de coluna independente**. Empinar o quadril hoje é traduzido em "sobe a bacia e inclina a coluna inteira" — por isso o `bridge` e o `quatro` parecem rígidos.

---

## 2. Diagnóstico medido (alturas em metros, colchão = 0,65)

| pose | cabeça | quadril | joelho | tornozelo | mão (punho) | o que lê hoje |
|---|---|---|---|---|---|---|
| `normal` | 0,86 | 0,83 | 0,81 | 0,80 | **1,10** | tronco ok, braço no ar |
| `spread` | 0,86 | 0,83 | 0,81 | 0,83 | **1,10** | pernas retas e planas, 45° de abertura |
| `legsUp` | 0,86 | 0,83 | 1,14 | 1,41 | **1,10** | as duas pernas retas, verticais e juntas |
| `scissors` | 0,86 | 0,83 | 1,16 / 0,81 | 1,44 / 0,85 | **1,10** | alongamento de uma perna |
| `bridge` | 0,79 | 1,05 | 1,03 | 0,69 | **1,10** | ponte correta, mas **sem mãos de apoio** |
| `quatro` | **1,25** | 1,02 | **1,04** | 0,70 | 0,66 | apoio em **mão + pé**, joelho no ar |
| `curl` | 0,86 | 0,83 | 1,02 | 0,82 | **1,10** | abdominal com joelho no ar, não fetal |

Observações que a medição deixa claras:

- O **tronco está certo**: dorso em y ≈ 0,65–0,66, encostado. O erro é só nos membros e na cabeça (0,86 contra travesseiro em 0,79 → **7 cm de ar embaixo da nuca**).
- `spread` abre só **~45°** (dedo em z ±0,52) com o joelho **plano no colchão** — não é "pernas abertas", é estrela do mar.
- `legsUp` é um **V estreito reto** (joelho 1,14 → tornozelo 1,41, z simétrico em ±0,26): exercício abdominal.
- `quatro`: o comentário do código diz que `-z` local é 'pra baixo', mas com `roll = π` o "pra baixo" é **`+z`**. As coxas apontam pro lado errado e o joelho fica **34 cm no ar** — o que você vê é um agachamento com a bunda pra cima, não um de quatro.

---

## 3. As sete causas raiz (e onde consertar)

| # | defeito | arquivo | conserto |
|---|---|---|---|
| 1 | `LYING` com antebraço vertical (punho 1,10) | `smollAnim.ts:23` | antebraço deitado sobre o abdômen, punho a 1–2 cm da superfície |
| 2 | poses só trocam `TL/SL/FL/TR/SR/FR` | `smollAnim.ts:40-86` | toda pose define também `L/R`, `lean`, `arch`, `ptilt`, `hy/hp/hr` |
| 3 | `Pose` sem pitch de bacia nem curva de coluna | `rig.ts:9-16` | campos `ptilt` e `arch` (2 linhas em `apply`) |
| 4 | sem contato: nada encosta, nada afunda | autorado à mão | regra de projeto + validação numérica no `pose-audit.html` |
| 5 | cama com 1 linha de respiração | `smollAnim.ts:189-190` | motor de micro-animação por pose (§5.3) |
| 6 | `near` só no PC → ele nunca te olha deitado | `smoll.ts:327` | `near = dist < 4` também na cama, com `hy` limitado |
| 7 | `openTalk` abre o menu do PC quando ele está na cama | `smoll.ts:144` | `openBedTalk()` com árvore própria (posição, elogio, pedir pra mudar, mandar levantar) |

---

## 4. Regras de design (o que faz uma pose "ler" como cena)

Toda pose tem que passar em 6 testes. Sem os 6, volta pro manequim.

1. **Dois contatos com o colchão, um deles pesado.** Ou os dois pés, ou joelho + mão, ou quadril + ombro. Nada de corpo flutuando.
2. **Uma curva em S visível na silhueta.** A coluna não é uma tábua: peito arqueado (`arch`) e quadril empinado (`ptilt`) com sinais opostos.
3. **Assimetria intencional.** Pose simétrica é pose de catálogo. Uma perna mais recolhida que a outra, uma mão a mais que a outra, cabeça jogada pra um lado.
4. **As mãos têm um trabalho.** Segurar o colchão, segurar o próprio joelho/coxa, apoiar a cabeça, cobrir a boca. Mão solta no ar = manequim.
5. **A cabeça não é um bloco.** Sempre `hy` (giro pra você) + `hp` (queixo pra cima/baixo) + `hr` (jogada), e ela deve **olhar o jogador** quando ele chega perto.
6. **Ritmo.** Silêncio e imobilidade matam mais que malha ruim. Respiração, tremor, quadril rolando, lençol.

Regra de ouro técnica que vem de `rig.ts:153` ("o braço é uma casca aberta colada ao tronco"): **braço só em flexão** (pra frente/pra cima, junto do corpo). **Abdução lateral acima de ~50° revela a casca como "asa"** — então "mãos atrás da cabeça" e "braços abertos" estão fora, a não ser que a malha seja corrigida.

---

## 5. Plano por fases

### Fase 0 — instrumentação (0,5 dia)
- [x] `tools/pose-audit.html` — as 7 poses × 3 câmeras (olho do jogador a 1,07 m, lado e planta) com a **cama real** de `props.ts`. É aqui que a pose se aprova ou se rejeita.
- [x] `tools/pose-bones.html` — despeja a **posição de mundo de todos os 17 ossos** por pose. É o que produziu a tabela do §2.
- [ ] Adicionar no `pose-audit.html` um validador automático por pose: `min(y)` de membro (não pode ser < 0,63), punho máximo (não pode passar de 1,02 em pose não-bridge), e "quantos contatos < 0,70". Serve de teste de regressão quando alguém mexer num vetor.

### Fase 1 — consertar o rig e a base (1 dia)
1. `rig.ts`: dois campos novos no `Pose` e duas linhas no `apply`:
```ts
ptilt: number   // anteversão da bacia: empina o quadril sem esticar a coluna
arch: number    // curvatura do tórax em relação à coluna (a curva em S)
...
wq.hips = e(p.ptilt, p.roll || 0, 0)
place('chest', 'spine', e(p.lean * 0.5 + p.arch, p.twist * 0.5, p.side * 0.5))
```
   `restPose()` retorna 0 para os dois e o `lerpPose` já interpola sozinho (é numérico).
2. `smollAnim.ts`: reescrever `LYING` — antebraço **deitado** sobre o abdômen (alvo de punho em x 13,50–13,62 / y ≈ 1,00 / z ≈ 13,00), cotovelo encostado na cintura. Aceite: punho ≤ 1,02 e a mão a menos de 3 cm da superfície do tronco.
3. `smollAnim.ts`: `LYING` passa a **afundar 2 cm** (`ry -= 0.02`) — o corpo comprime o colchão e para de "flutuar por cima".
4. Cabeça no travesseiro: `hp` de `LYING` levemente pra trás (−0,12) para a nuca tocar 0,79.

### Fase 2 — reescrever as 7 poses + 2 novas (2 dias)
Cada pose é autorada no `pose-audit.html` e só entra quando bate as metas do §6.

| pose | o que muda |
|---|---|
| `normal` | mãos na barriga de verdade; quadril relaxado; cabeça virada pra você |
| `spread` | joelhos elevados e abertos (~80°, dedo em z ±0,72), **pés apoiados**, quadril em anteversão (ptilt 0,25), mãos nos joelhos |
| `legsUp` | **assimétrica**: uma perna reta a 20° da vertical, a outra dobrada com o pé no colchão; quadril empinado; mãos atrás da coxa |
| `scissors` | canelas **cruzadas de verdade** (tornozelos no mesmo z), mãos no colchão segurando o lençol |
| `bridge` | **mãos no colchão** (0,66), cabeça apoiada, uma perna estendida no ar |
| `quatro` | joelhos **no colchão** (0,70), tornozelos atrás, peito baixo (0,85), bunda alta (1,00), cabeça erguida (1,05) **olhando o jogador** |
| `curl` | deitar **de lado** (`roll = π/2`), joelho da frente encostado, braços abraçando o travesseiro |
| **nova** `side` | de lado, quadril à mostra, cotovelo no colchão e cabeça na mão — a pose mais "te olhando" de todas |
| **nova** `edge` | sentado na quina (`SIT_EDGE` já existe, é usado só na transição e nunca é exibido) com as pernas penduradas |

> O `quatro` inverte os sinais de x porque o `roll = π` espelha a origem dos membros (o próprio comentário do código avisa). Vale criar um helper `prone(pose)` que já espelha e documenta, senão toda edição futura vai cruzar os membros de novo.

### Fase 3 — movimento (1,5 dia)
Só depois que a forma estiver certa. Tabela de micro-animação, em `anim.update`, ativa quando `loco.bed`/`lying`:

| efeito | como | custo |
|---|---|---|
| respiração | `arch += sin(t*1.1)*0.02; rz += sin(t*1.1)*0.005` | 2 linhas |
| ofegante (poses quentes) | frequência 1,1 → 2,2 Hz e amplitude ×2 | 3 linhas |
| tremor de perna | `SL/FL += sin(t*17)*0.006` | 2 linhas |
| mão que desliza | `f = mix(f, alvo, 0.5 + 0.5*sin(t*0.35))` | 3 linhas |
| cabeça viva | `hy += sin(t*0.4)*0.06; hp += sin(t*0.7)*0.03` | 2 linhas |
| entrada/saída de pose | `lerpPose(cur, p, 1-exp(-dt*3))` na cama (hoje `*7` = 0,14 s, morfa seco) | 1 linha |
| "se ajeitando" na troca de pose | 0,6 s de `lean` + `rz` + `roll` extra antes de aplicar a nova | 10 linhas |

### Fase 4 — encenação: olhar, câmera, luz, coberta, som (1,5 dia)
- **Olhar** (`smoll.ts:327`): `near` também na cama (`dist < 4`), com `hy` limitado a ±0,7 e `hp` compensando o `lean`. Ele **precisa** te encarar deitado.
- **Câmera**: `inventory.ts:179-181` já tem o padrão de "socarrão de FOV" (`c.fov = f0/3`). Reaproveitar para um push suave 70 → 63 quando ele está na cama e você chega a menos de 2,5 m. Opcional: enquadrar de baixo (o jogador já tem olho a 1,07 m, abaixo do colchão — a câmera **já** olha ele por baixo, é um ativo da cena; só falta fechar o plano).
- **Luz**: `world.luz.quarto` (props.ts:1840) e o abajur (`lamp`, props.ts:476-477). Quando ele está na cama e a luz do quarto está apagada: abajur em intensidade baixa + tom quente. É o que mais "vende" a cena por metro de código.
- **Cobertor**: hoje o cobertor é uma caixa fixa (`box(1.2,0.12,1.74, 13.7, 0.54, 13)`). Criar um segundo plano que **sobe até a cintura** nas poses `normal`/`curl` e **recua** nas outras — coberta pela metade é o maior sinal de intimidade que existe.
- **Roupa**: `red` (cueca) casa com `spread`/`quatro`; `shorts` com `legsUp`. O menu deve oferecer a combinação em vez de deixar o jogador descobrir.
- **Som**: `sfx.ts` é 100% procedural (Web Audio). Um `breath(vol, dur)` é ruído com `lowpass` ~600 Hz + envelope (copiar a estrutura de `sizzle`, linha 17) e um `sheet()` (ruído curto com `bandpass`). Toca a cada 2–4 s enquanto ele está na cama, volume caindo com a distância.

### Fase 5 — diálogo e menu (1 dia)
- **`openBedTalk()`** (novo, em `interact.ts`): enquanto ele está na cama, o `act(M, ...)` abre uma árvore própria — não o menu do PC. Opções: "Tá confortável?", "Fica assim", "Muda de pose →", "Senta na quina", "Levanta". Hoje o `openTalk` abre o `root()` com "Levanta aí", "Pede um café" e "Faz um bypass" **com ele deitado** — quebra a cena inteira.
- **Falas**: as 14 falas atuais (2 por pose) são piada. Precisa de 3 camadas: (a) fala da pose; (b) **reação à aproximação** (você chegou perto → ele vira a cabeça e fala); (c) reação a **ficar parado olhando** (5 s sem menu → uma fala provocando).
- **Progressão**: um `state.bedMood` (`tímido → provocando → entregue`) que sobe com poses mantidas e cai ao levantar. O que faz a cena sexual não é a pose — é a **progressão**. Hoje todas as poses têm o mesmo peso dramático, então escolher "pernas abertas" e "fetal" dá no mesmo.

### Fase 6 — verificação (0,5 dia)
- Rodar `npm run dev`, abrir `/tools/pose-audit.html` e aprovar as 9 poses nas 3 câmeras.
- In-game: entrar no quarto, ficar a 1 m da cama, trocar de pose 3 vezes, mandar levantar; conferir que nada atravessa o colchão nem cruza o tronco.
- Conferir rede: `state.smollOut` já publica `bp` (pose) e `bd` (transição) — as poses novas entram de graça, mas o **humor** (`bedMood`) precisa ir junto em `state.ts`/`net.ts` se quiser que os outros jogadores vejam.

---

## 6. Checklist por pose (metas numéricas, colchão 0,65)

Validar no `pose-bones.html` (alturas de juntas em mundo):

| pose | contatos | quadril | mão | cabeça | aceite |
|---|---|---|---|---|---|
| `normal` | ombro + quadril + 2 pés | 0,83 | 1,00 (±2 cm do abdômen) | 0,80 (no travesseiro) | punho ≤ 1,02 |
| `spread` | 2 pés + quadril | 0,86 | nos joelhos (≈0,88) | 0,86 | dedo \|z−13\| ≥ 0,70; joelho ≥ 0,86 |
| `legsUp` | ombro + quadril | 0,90 | atrás da coxa (≈1,05) | 0,86 | uma perna ≥ 1,30, outra ≤ 0,85 |
| `scissors` | quadril + pé de baixo | 0,83 | no colchão (0,67) | 0,86 | tornozelos no mesmo z (±0,05) |
| `bridge` | 2 mãos + 1 pé | **1,05** | **0,66** | 0,75 | punho ≤ 0,70 (apoio) |
| `quatro` | 2 mãos + 2 joelhos | 1,00 | 0,66 | 1,05 | joelho ≤ 0,73; ângulo do tronco ~45° |
| `curl` | ombro + quadril + joelho | 0,80 | no travesseiro | 0,80 | `roll ≈ π/2` |
| `side` | quadril + ombro + cotovelo | 0,80 | 0,95 (na cabeça) | 0,90 | `roll ≈ π/2` |
| `edge` | ísquios + pés | 0,70 | nos joelhos | 1,10 | pés em 0,10 |

---

## 7. Ferramentas criadas nesta análise

```
npm run dev
# http://localhost:5173/tools/pose-audit.html   → 7 poses × 3 câmeras, com a cama real
# http://localhost:5173/tools/pose-bones.html   → alturas/x/z de todos os ossos (o "teste")
# http://localhost:5173/tools/pose-preview.html?pose=spread   (já existia, 2 câmeras)
```

---

## 8. Limites técnicos que o plano não resolve sozinho

1. **Malha em A-pose com o braço como casca aberta** (`rig.ts:153`): abdução lateral > ~50° mostra a "asa". Isso proíbe mãos atrás da cabeça e braços abertos. Conserto real = gerar um GLB com braço fechado/T-pose (já existe pipeline em `tools/3d/` + `tools/comfy/`) **ou** aceitar e desenhar poses só em flexão.
2. **17 ossos, sem dedos, sem IK**: não existe "mão agarrando o lençol" nem "coluna em S real". Tudo é aproximação por direção-alvo. O que salva é o ângulo de câmera e o movimento.
3. **Sem clamp de colchão**: nada impede um pé de atravessar a cama. Sem IK, a garantia é o teste numérico da Fase 0.
4. **Uma malha só, sem morph targets**: "boca entreaberta", "olhos fechados" não existem. Expressão tem que ser vendida por pose de cabeça + fala + som.

---

## 9. Ordem recomendada

| ordem | fase | entrega visível |
|---|---|---|
| **1º** | Fase 1 + Fase 2 | a pose para de parecer errada. **É o que você está sentindo hoje.** |
| 2º | Fase 3 | a pose para de parecer congelada |
| 3º | Fase 5 | ele para de falar como um NPC de tutorial em cima da cama |
| 4º | Fase 4 | o quarto passa a ser cena, não cenário |
| 5º | Fase 6 | garantia de que nada regrediu |

**Esforço:** Fase 1 = 1 dia · Fase 2 = 2 dias · Fase 3 = 1,5 · Fase 4 = 1,5 · Fase 5 = 1 · Fase 6 = 0,5 · **total ≈ 8 dias**, sendo que as duas primeiras (3 dias) já mudam a leitura de forma radical.

---

## STATUS (executado)

- **Fase 0/1/2**: rig ganhou `ptilt` (pitch da bacia, com a coluna contra-rotacionada pra o tronco não subir) e `arch`; `apply()` corrigido. As 10 poses da cama foram reescritas com o helper `W(x,y,z)` (direção em coordenadas de MUNDO, não da malha) e verificadas em `tools/pose-bones.html` (altura de cada osso em cm acima do colchão).
- **Corpo**: `M.position.y` deitado = 0,78 (antes 0,84 — o corpo flutuava 17 cm); quadril/peito a 11 cm do colchão, cabeça apoiada no travesseiro, mãos a 2–20 cm.
- **Fase 3**: `bedMod` (respiração, tremor de perna, mão deslizando) + `bedHeat` por pose + olhar (`loco.gaze/aside`) e `touch()` reativo.
- **Fase 4**: FOV 70→63 perto da cama, coberta que sobe até a cintura (só nas poses de pernas esticadas), luz cálida baixa na cama e `breath()`/`sheet()` em `sfx.ts`.
- **Fase 5**: `bedTalk()` no lugar do menu do PC; humor (`Mood`) por vínculo/paciência; iniciativa (ele fala sozinho e cobra resposta).
- **Fase 6**: auditado em `tools/pose-audit.html` (3 câmeras × 10 poses) e in-game.
