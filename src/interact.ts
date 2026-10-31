import * as THREE from 'three'
import { state, setGate, toast, pick, world } from './state'

// objeto interagível = qualquer Object3D com userData.act; a mira (centro da tela) escolhe
// use: o que acontece ao clicar com um item na mão olhando pra isto (true = tratou, 'consume' = tratou e gastou 1 do item)
// touch: E SEGURADO (0,45 s) — o verbo de contato; E curto continua sendo fn()
// smoll: marca o alvo como o Smoll (gestos dirigidos em social.ts, fala contextual em smoll.ts)
export type Act = { label: string | (() => string); fn: () => void; use?: (id: string, kind: string) => boolean | 'consume' | void; touch?: () => void; smoll?: boolean }
export const act = (o: THREE.Object3D, label: Act['label'], fn: () => void, use?: Act['use'], extra?: { touch?: () => void; smoll?: boolean }) => {
  o.userData.act = { label, fn, use, touch: extra?.touch, smoll: extra?.smoll } as Act
}
export const getTarget = () => target

export const dialog = { open: false }
const $ = (id: string) => document.getElementById(id)!
const ray = new THREE.Raycaster(); ray.far = 2.0
let target: Act | null = null, tick = 0

export function updateInteract(scene: THREE.Scene, camera: THREE.Camera) {
  const tip = $('tip')
  if (dialog.open) { tip.style.display = 'none'; return }
  if (++tick % 3 === 0) {
    ray.setFromCamera(new THREE.Vector2(0, 0), camera)
    const hit = ray.intersectObjects(scene.children, true).find((h) => { let v: THREE.Object3D | null = h.object; while (v && v.visible) v = v.parent; return !v })
    let o: THREE.Object3D | null = hit?.object ?? null
    target = null
    for (; o; o = o.parent) if (o.userData.act) { target = o.userData.act; break }
  }
  tip.style.display = target ? 'block' : 'none'
  if (target) tip.textContent = `[E] ${typeof target.label === 'function' ? target.label() : target.label}`
}

// ---------- diálogo com o Smoll ----------
type Opt = { t: string; i?: string; go?: () => Node; fn?: () => void } // i = nome da thumbnail em public/img/act (tools/act-icons.html)
type Node = { say: string; code?: string; opts: Opt[] }

const timed = (ms: number, apply: () => void) => { apply(); state.until = performance.now() + ms }
const cmd = (c: string) => state.cmd(c)
const root = (): Node => ({
  say: pick(['Fala, mano. Tô debugando um negócio que só quebra em produção.', 'Opa. Não mexe na minha cadeira, por favor.', 'Um minuto, tô compilando. Mentira, tô no YouTube.']),
  opts: [
    { t: 'O que você tá fazendo?', i: 'gest-point', fn: () => { cmd('point'); show({ say: pick(['Refatorando o que eu mesmo escrevi ontem. Não recomendo.', 'Esse bug tem mais camadas que cebola. Já chorei duas vezes.', 'Tô fazendo um jogo. Sobre mim. Em primeira pessoa. Pensa na ironia.']), opts: [back] }) } },
    { t: 'Me passa um código aí', i: 'codes', go: codes },
    { t: 'Faz um bypass pra mim', i: 'bypass', go: bypass },
    { t: state.smollStanding ? 'Senta de volta' : 'Levanta aí', i: state.smollStanding ? 'sit' : 'stand', fn: () => { const up = cmd('stand'); show({ say: up ? 'Levantando. Minha coluna agradece.' : 'Voltando pro PC. O bug não vai se resolver sozinho.', opts: [back] }) } },
    { t: state.smollShorts ? 'Troca a bermuda por uma calça' : 'Troca a calça por uma bermuda', i: 'roupa', fn: () => { const to = cmd('shorts'); show({ say: to ? 'Tá calor mesmo. Fecha o olho aí que eu vou trocar. Já volto.' : 'Vou botar a calça. Deixa eu ir ali.', opts: [back] }) } },
    { t: state.smollRed ? 'Manda ele se vestir' : 'Pede pra ele ficar de calcinha vermelha', i: 'roupa', fn: () => { const to = cmd('red'); show({ say: to ? 'Quê?! Tá bom… mas ninguém tira foto.' : 'Obrigado. Eu também tava com vergonha.', opts: [back] }) } },
    { t: 'Pede pra ele fazer algo…', i: 'gest-thumbs', go: tasks },
    { t: '🛏️ Poses na cama', i: 'pose-normal', go: poses },
    { t: 'Faz uma dancinha', i: 'gest-dance', fn: () => { cmd('dance'); show({ say: 'Bora! Ninguém filma, por favor.', opts: [back] }) } },
    { t: 'Conta uma piada', i: 'gest-laugh', fn: () => { cmd('laugh'); show({ say: pick(['Por que o programador confunde Halloween com Natal? Porque 31 OCT = 25 DEC.', 'São dois bugs num bar. O terceiro é o barman: não reproduz.', 'Funciona na minha máquina. Vamos enviar a minha máquina então.']), opts: [back] }) } },
    { t: 'Pede um café pra mim', i: 'gest-sip', fn: () => { cmd('sip'); state.drinks++; show({ say: `Peguei dois. Um pra mim e um pra você. Tá na sua conta. (+1 bebida 🥤 ${state.drinks})`, opts: [back] }) } },
    { t: 'Manda o Smoll dormir', i: 'sleep', fn: () => { const ok = cmd('sleep') !== false; show({ say: ok ? 'Ah, finalmente. Só cinco minutinhos... Zzz.' : 'Agora não, tô no meio de uma coisa.', opts: [back] }) } },
    { t: 'Tchau', i: 'gest-wave', fn: () => { cmd('wave'); closeDialog(); toast('Smoll: Até mais! Não esquece de fechar o portão.') } },
  ],
})
const inBed = () => state.smollMode === 'sleep' || state.smollMode === 'falling'
const back: Opt = { t: 'Voltar', go: () => (inBed() ? bedTalk() : root()) }
// pedidos: o Smoll levanta, vai até o objeto, usa de verdade e volta pro PC
const ask = (c: string, ok: string[]): Opt['fn'] => () => { const r = cmd(c); show({ say: r === false ? 'Agora não dá, tô no meio de uma coisa.' : pick(ok), opts: [back] }) }
const tasks = (): Node => {
  return {
    say: 'Pedido especial? Cobro em Kuat.',
    opts: [
      { t: '📺 Liga/desliga a TV', i: 'task-tv', fn: ask('task:tv', ['Já vou lá. Não muda de canal!', 'Tá, tá, vou levantar.']) },
      { t: '💡 Acende/apaga a luz da sala', i: 'task-luz', fn: ask('task:luz', ['Já vou. Economia de energia, né.', 'Sempre sobra pra mim.']) },
      { t: '🌀 Liga/desliga o ventilador do quarto', i: 'task-vent', fn: ask('task:vent', ['Calor mesmo. Vou lá.', 'Ventilador, o melhor amigo do dev.']) },
      { t: '🥤 Pega uma Kuat pra ele', i: 'task-kuat', fn: ask('task:kuat', ['Boa ideia, tô com sede.', 'Já volto com a Kuat.']) },
      { t: '🥤 Traz uma Kuat pra mim', i: 'task-kuat-voce', fn: ask('task:kuat-voce', ['Tá, vou buscar. Fica aí.', 'Garçom Smoll a caminho.']) },
      { t: '🛋️ Vem assistir TV comigo', i: 'task-assistir', fn: ask('task:assistir', ['Bora! Mas eu escolho o filme.', 'Já vou. Separa um lugar pra mim.']) },
      { t: '☕ Faz um café', i: 'task-cafe', fn: ask('task:cafe', ['Café, a melhor invenção.', 'Vou passar um agora.']) },
      { t: '🍜 Cozinha alguma coisa', i: 'task-cozinhar', fn: ask('task:cozinhar', ['Miojo de novo? Tá bom.', 'Vou lá no fogão.']) },
      { t: '🧽 Lava a louça', i: 'task-louca', fn: ask('task:louca', ['Eu lavo… mas depois.', 'A pilha tá virando monumento.']) },
      { t: '🍛 Almoça de verdade (prato e talher)', i: 'task-almocar', fn: ask('task:almocar', ['Prato, garfo e faca. Até parece gente.', 'Almoço sentado? Que luxo.']) },
      { t: '🛍️ Guarda a compra na geladeira', i: 'task-guardar', fn: ask('task:guardar', ['Vou guardar. O leite fica na frente.', 'Já vou, mas quem pagou foi você.']) },
      { t: '🍽️ Vai comer', i: 'task-comer', fn: ask('task:comer', ['Tô morrendo de fome.', 'Almoço!']) },
      { t: '🎸 Toca violão', i: 'task-violao', fn: ask('task:violao', ['Vou tocar a única música que eu sei.', 'Preparando o show…']) },
      { t: '🚿 Vai tomar banho', i: 'task-banho', fn: ask('task:banho', ['Tô precisando mesmo.', 'Vou lá. Não olha o histórico.']) },
      { t: '🎮 Joga videogame comigo', i: 'task-jogar', fn: ask('task:jogar', ['Bora! Mas o controle bom é o meu.', 'Vou ganhar de você no jogo da velha.']) },
      { t: '🔧 Conserta o ventilador da oficina', i: 'task-consertar', fn: ask('task:consertar', ['É só apertar um parafuso. Tá, achar a chave é o difícil.', 'Já vou com a chave de fenda.']) },
      { t: '🌱 Rega a horta', i: 'task-regar', fn: ask('task:regar', ['Vou lá. O sol de Rondônia não perdoa.', 'Eu rego, mas quem colhe é você.']) },
      { t: '🍖 Faz um churrasco', i: 'task-churrasco', fn: ask('task:churrasco', ['Churrasco! Já separo a picanha.', 'Deixa o carvão comigo.']) },
      { t: '🎸 Toca violão na varanda', i: 'task-violaovaranda', fn: ask('task:violaovaranda', ['Vou tocar na varanda, o som fica melhor.', 'A mesma música de sempre, mas ao vivo.']) },
      back,
    ],
  }
}
// poses na cama: ele vai até a cama (se ainda tá no PC), se deita e faz a pose.
const poses = (): Node => ({
  say: 'Na cama? Então escolhe. E chega mais perto, eu não mordo — pelo menos não hoje.',
  opts: [
    { t: '😴 Deitado de costas', i: 'pose-normal', fn: ask('pose:normal', ['Mãos na barriga, olhando o teto. Clássico.', 'Deitado. É o que eu faço melhor.']) },
    { t: '🦵 Pernas abertas', i: 'pose-spread', fn: ask('pose:spread', ['Joelho dobrado e tudo à mostra. Você pediu.', 'Aberto. Se tá calor, a culpa não é minha.']) },
    { t: '🎯 Pernas pra cima', i: 'pose-legsup', fn: ask('pose:legsUp', ['Uma perna no ar, a outra apoiada. Assimetria é arte.', 'Circulação, dizem. Eu digo outra coisa.']) },
    { t: '✂️ Tesoura', i: 'pose-scissors', fn: ask('pose:scissors', ['As canelas cruzadas. Equilíbrio e falta de vergonha.', 'Tesoura. Não pergunta, só olha.']) },
    { t: '🌉 Ponte', i: 'pose-bridge', fn: ask('pose:bridge', ['Bacia no alto, mão no colchão. Minha coluna faz isso desde que eu era dev.', 'Ponte. Engenharia de corpo.']) },
    { t: '🐾 De quatro', i: 'pose-quatro', fn: ask('pose:quatro', ['De quatro, olhando pra você. Não é pose de cachorro, é pose de gente.', 'Aqui. E sim, eu sei o que você tá pensando.']) },
    { t: '👶 Fetal', i: 'pose-curl', fn: ask('pose:curl', ['De lado, recolhido. O colchão entende.', 'Fetal. Todo mundo dorme assim, ninguém admite.']) },
    { t: '😏 De lado, te encarando', i: 'pose-curl', fn: ask('pose:side', ['De lado, cabeça na mão, olhando pra você. E aí?', 'Essa aqui é a que eu faço quando quero que você fique.']) },
    { t: '🫂 Colado em você', i: 'pose-curl', fn: ask('pose:junto', ['Colado. Cabeça no seu ombro. Não me acorda.', 'Junto. Só isso.']) },
    { t: '🪑 Sentado na quina da cama', i: 'pose-normal', fn: ask('pose:edge', ['Sento na quina. Os pés quase encostam no chão.', 'Aqui de cima eu vejo o quarto todo. E você.']) },
    { t: 'Levanta da cama', i: 'stand', fn: () => { const up = cmd('wake'); show({ say: up ? 'Levantando. O bug não vai se resolver sozinho.' : 'Agora não, tô no PC.', opts: [back] }) } },
    back,
  ],
})
// ---------- conversa na cama: a árvore dele quando está deitado ----------
// O menu do PC ("faz um bypass", "levanta aí") não faz sentido com ele deitado — esta é a árvore dele.
const bond = (d: number) => { state.smollBond = Math.max(0, Math.min(100, state.smollBond + d)) }
const mo = (m: Record<string, string[]>): string => pick(m[state.smollMood] ?? m.neutro)
export function bedTalk(): Node {
  return {
    say: mo({
      neutro: ['Tô aqui deitado. Não é convite, mas também não é convite pra sair.', 'Você de novo. Senta aí, o colchão é firme.'],
      contido: ['…hã. Tô tentando descansar.', 'Pode falar, mas rápido.'],
      provocando: ['Chegou perto. Agora eu decido se deixo.', 'Tá olhando muito pra minha cara pra quem diz que só veio ver a cama.'],
      entregue: ['Fica mais um pouco. Só mais um pouco.', 'Vem. Mas tira o tênis.'],
      irritado: ['O que foi.', 'Agora não, por favor.'],
    }),
    opts: [
      { t: '🖐️ Tocar nele', fn: () => { bond(4); show({ say: mo({
        neutro: ['Tocou. Tá me testando ou tá com frio?', 'Hum. Tudo bem, continua.'],
        contido: ['Ei. Devagar, tá?', 'Não… ainda não.'],
        provocando: ['Assim você não me deixa descansar, sabia?', 'Só isso? Achei que você tinha coragem de mais.'],
        entregue: ['Não para.', 'Fica com a mão aí. Um pouco mais.'],
        irritado: ['Para.', 'Tira a mão.'],
      }), opts: [back] }) } },
      { t: '🛏️ Chega mais…', fn: () => {
        const quente = state.smollMood === 'provocando' || state.smollMood === 'entregue'
        bond(3)
        const r = quente ? cmd('pose:junto') : false
        show({ say: quente && r !== false ? 'Venha. Mas devagar, que eu tô de olho em você.' : mo({
          neutro: ['Calma. Um passo de cada vez.', 'Nem tão perto assim… tá bom, um pouco.'],
          contido: ['Não. Ainda não.', 'Hoje não, tá?'],
          provocando: ['Você é apressado, hein.', 'Ainda não. Quero ver você insistir.'],
          entregue: ['Vem logo.', 'Tô esperando.'],
          irritado: ['Chega.'],
        }), opts: [back] })
      } },
      { t: '🛏️ Mudar de pose', go: poses },
      { t: '😌 "Tá confortável aí?"', fn: () => { bond(2); show({ say: mo({
        neutro: ['Confortável. O travesseiro é melhor que o da minha cadeira.', 'Tô. Só com a cabeça cheia.'],
        contido: ['Tô. Sozinho é melhor.', 'Tô bem. Pode ir.'],
        provocando: ['Ficaria mais se você deitasse.', 'Confortável. Curioso?'],
        entregue: ['Tô melhor agora.', 'Com você aqui, sim.'],
        irritado: ['Tava.'],
      }), opts: [back] }) } },
      { t: '💬 "O que você tá pensando?"', fn: () => { bond(2); show({ say: mo({
        neutro: ['Num bug que só aparece em produção, e num colchão que afunda do lado esquerdo.', 'Que eu devia ter dormido mais cedo.'],
        contido: ['Em nada. Em você. Em nada.', 'Que eu devia ter fechado a porta.'],
        provocando: ['Você. Quer saber o que exatamente, ou posso deixar no ar?', 'Em quanto tempo você vai demorar pra chegar mais perto.'],
        entregue: ['Que eu queria que essa noite durasse mais.', 'Em você ficar.'],
        irritado: ['Em levantar.'],
      }), opts: [back] }) } },
      { t: '🛏️ Deitar do lado dele', fn: () => {
        bond(3); const ok = world.deitarNaCama(); closeDialog()
        toast(ok === false ? 'Smoll: Aqui não cabe mais ninguém, olha o tamanho da cama.' : 'Deitou do lado dele. WASD ou espaço levanta · segure E pra tocar nele.')
      } },
      { t: 'Levanta da cama', i: 'stand', fn: () => { const up = cmd('wake'); closeDialog(); toast(up !== false ? 'Smoll: Levantando. A cama é boa demais, isso é um problema.' : 'Smoll: Agora não.') } },
      { t: 'Tchau', i: 'gest-wave', fn: () => { cmd('wave'); closeDialog(); toast('Smoll: Vai lá. Eu fico.') } },
    ],
  }
}
const codes = (): Node => ({
  say: 'Tenho uns snippets aqui. Por sua conta e risco.',
  opts: [
    { t: 'turbo.ts  (correr mais, 20s)', fn: () => { timed(20000, () => (state.speed = 1.8)); give('// turbo.ts\nplayer.speed *= 1.8  // 20s, depois volta', 'Turbo ativado!') } },
    { t: 'gigante.ts  (altura 1,9 m, 20s)', fn: () => { timed(20000, () => (state.eye = 1.9)); give('// gigante.ts\ncamera.y = 1.9  // cuidado com o ventilador', 'Modo gigante!') } },
    { t: 'smoll.ts  (altura 0,6 m, 20s)', fn: () => { timed(20000, () => { state.eye = 0.6; state.speed = 1.2 }); give('// smoll.ts\ncamera.y = 0.6  // o nome do jogo é esse', 'Modo smoll!') } },
    back,
  ],
})
const bypass = (): Node => ({
  say: 'Bypass de quê? Escolhe aí.',
  opts: [
    { t: 'Portão da garagem', fn: () => { setGate(true); give('gate.auth = "admin"  // a senha era 1234\ngate.open = true', 'Portão liberado.') } },
    { t: 'Geladeira (grátis)', fn: () => { state.drinks += 3; give('fridge.price = 0\nplayer.drinks += 3', '+3 Kuat. Cobrança bypassada.') } },
    { t: 'O muro da frente', fn: () => { state.tp(34, 12); give('player.clip(wall)  // só atalho, sem noclip\nplayer.pos = street', 'Teleportou pra rua.') } },
    { t: 'O PC do Smoll', go: () => (cmd('facepalm'), { say: 'Nem tenta. A senha tem 14 caracteres e um emoji.', code: 'if (user === "você") throw new Error("nice try")', opts: [back] }) },
    back,
  ],
})
function give(code: string, msg: string) {
  show({ say: `${pick(['Toma. Não fui eu que te dei.', 'Feito. Isso nunca aconteceu.', 'Rodei aqui, deve funcionar. Deve.'])} (${msg})`, code, opts: [back] })
}

// menu clicável. Escolher uma ação fecha o menu e o Smoll responde com uma fala na tela; só os submenus (códigos, bypass) ficam abertos
let cur: Node
function show(n: Node) {
  if (n.opts.length === 1 && n.opts[0] === back) { closeDialog(); toast(`Smoll: ${n.say}${n.code ? '\n' + n.code : ''}`, 5000); return } // resposta simples: fala e fecha
  cur = n; dialog.open = true; document.exitPointerLock?.()
  $('dialog').style.display = 'block'
  $('dialog').innerHTML = `<b>Smoll</b><p>${n.say}</p>${n.code ? `<pre>${n.code}</pre>` : ''}<div class="opts">` +
    n.opts.map((o, i) => `<button data-i="${i}">${o.i ? `<img src="/img/act/${o.i}.png" alt="" aria-hidden="true">` : ''}${o.t}</button>`).join('') + '</div>'
}
export function openTalk() { show(inBed() ? bedTalk() : root()) }
export function closeDialog() {
  dialog.open = false; $('dialog').style.display = 'none'
  document.querySelector('canvas')?.requestPointerLock?.() // volta pro jogo (funciona quando veio de um clique)
}
$('dialog').addEventListener('click', (e) => {
  const b = (e.target as HTMLElement).closest('button'); if (!b) return
  const o = cur.opts[+b.dataset.i!]
  if (o.fn) o.fn()
  if (o.go) show(o.go())
})

// E curto = falar/agir; E SEGURADO (0,45 s) = tocar. Só existe "tocar" onde o alvo registrou touch().
let eDown = false, holdAct: Act | null = null, holdT = 0
const fireHold = () => {
  const a = holdAct; holdAct = null; eDown = false
  if (a?.touch) a.touch()
  else a?.fn()
}
addEventListener('keydown', (e) => {
  if (state.editing) return
  if (e.code === 'KeyE' && !dialog.open && target && !e.repeat) {
    eDown = true
    if (target.touch) { holdAct = target; holdT = performance.now() } else target.fn()
  } else if (dialog.open && e.code === 'Escape') closeDialog()
})
addEventListener('keyup', (e) => {
  if (e.code !== 'KeyE' || !eDown) return
  if (holdAct && performance.now() - holdT < 450) { const a = holdAct; holdAct = null; eDown = false; a.fn() } // toque curto = ação normal
  else if (holdAct) fireHold()
  else eDown = false
})
// VR dispara keydown sem keyup: o laço de update resolve o segurar (ver main.ts, gatilho)
export const tickHold = () => { if (holdAct && eDown && performance.now() - holdT > 450) fireHold() }
