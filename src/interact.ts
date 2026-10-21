import * as THREE from 'three'
import { state, setGate, toast, pick } from './state'

// objeto interagível = qualquer Object3D com userData.act; a mira (centro da tela) escolhe
// use: o que acontece ao clicar com um item na mão olhando pra isto (true = tratou, 'consume' = tratou e gastou 1 do item)
export type Act = { label: string | (() => string); fn: () => void; use?: (id: string, kind: string) => boolean | 'consume' | void }
export const act = (o: THREE.Object3D, label: Act['label'], fn: () => void, use?: Act['use']) => { o.userData.act = { label, fn, use } as Act }
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
type Opt = { t: string; go?: () => Node; fn?: () => void }
type Node = { say: string; code?: string; opts: Opt[] }

const timed = (ms: number, apply: () => void) => { apply(); state.until = performance.now() + ms }
const cmd = (c: string) => state.cmd(c)
const root = (): Node => ({
  say: pick(['Fala, mano. Tô debugando um negócio que só quebra em produção.', 'Opa. Não mexe na minha cadeira, por favor.', 'Um minuto, tô compilando. Mentira, tô no YouTube.']),
  opts: [
    { t: 'O que você tá fazendo?', fn: () => { cmd('point'); show({ say: pick(['Refatorando o que eu mesmo escrevi ontem. Não recomendo.', 'Esse bug tem mais camadas que cebola. Já chorei duas vezes.', 'Tô fazendo um jogo. Sobre mim. Em primeira pessoa. Pensa na ironia.']), opts: [back] }) } },
    { t: 'Me passa um código aí', go: codes },
    { t: 'Faz um bypass pra mim', go: bypass },
    { t: state.smollStanding ? 'Senta de volta' : 'Levanta aí', fn: () => { const up = cmd('stand'); show({ say: up ? 'Levantando. Minha coluna agradece.' : 'Voltando pro PC. O bug não vai se resolver sozinho.', opts: [back] }) } },
    { t: state.smollShorts ? 'Troca a bermuda por uma calça' : 'Troca a calça por uma bermuda', fn: () => { const to = cmd('shorts'); show({ say: to ? 'Tá calor mesmo. Fecha o olho aí que eu vou trocar. Já volto.' : 'Vou botar a calça. Deixa eu ir ali.', opts: [back] }) } },
    { t: 'Pede pra ele fazer algo…', go: tasks },
    { t: 'Faz uma dancinha', fn: () => { cmd('dance'); show({ say: 'Bora! Ninguém filma, por favor.', opts: [back] }) } },
    { t: 'Conta uma piada', fn: () => { cmd('laugh'); show({ say: pick(['Por que o programador confunde Halloween com Natal? Porque 31 OCT = 25 DEC.', 'São dois bugs num bar. O terceiro é o barman: não reproduz.', 'Funciona na minha máquina. Vamos enviar a minha máquina então.']), opts: [back] }) } },
    { t: 'Pede um café pra mim', fn: () => { cmd('sip'); state.drinks++; show({ say: `Peguei dois. Um pra mim e um pra você. Tá na sua conta. (+1 bebida 🥤 ${state.drinks})`, opts: [back] }) } },
    { t: 'Manda o Smoll dormir', fn: () => { const ok = cmd('sleep') !== false; show({ say: ok ? 'Ah, finalmente. Só cinco minutinhos... Zzz.' : 'Agora não, tô no meio de uma coisa.', opts: [back] }) } },
    { t: 'Tchau', fn: () => { cmd('wave'); closeDialog(); toast('Smoll: Até mais! Não esquece de fechar o portão.') } },
  ],
})
const back: Opt = { t: 'Voltar', go: root }
// pedidos: o Smoll levanta, vai até o objeto, usa de verdade e volta pro PC
const tasks = (): Node => {
  const ask = (c: string, ok: string[]): Opt['fn'] => () => { const r = cmd(c); show({ say: r === false ? 'Agora não dá, tô no meio de uma coisa.' : pick(ok), opts: [back] }) }
  return {
    say: 'Pedido especial? Cobro em Kuat.',
    opts: [
      { t: '📺 Liga/desliga a TV', fn: ask('task:tv', ['Já vou lá. Não muda de canal!', 'Tá, tá, vou levantar.']) },
      { t: '💡 Acende/apaga a luz da sala', fn: ask('task:luz', ['Já vou. Economia de energia, né.', 'Sempre sobra pra mim.']) },
      { t: '🌀 Liga/desliga o ventilador do quarto', fn: ask('task:vent', ['Calor mesmo. Vou lá.', 'Ventilador, o melhor amigo do dev.']) },
      { t: '🥤 Pega uma Kuat pra ele', fn: ask('task:kuat', ['Boa ideia, tô com sede.', 'Já volto com a Kuat.']) },
      { t: '🥤 Traz uma Kuat pra mim', fn: ask('task:kuat-voce', ['Tá, vou buscar. Fica aí.', 'Garçom Smoll a caminho.']) },
      { t: '🛋️ Vem assistir TV comigo', fn: ask('task:assistir', ['Bora! Mas eu escolho o filme.', 'Já vou. Separa um lugar pra mim.']) },
      { t: '☕ Faz um café', fn: ask('task:cafe', ['Café, a melhor invenção.', 'Vou passar um agora.']) },
      { t: '🍜 Cozinha alguma coisa', fn: ask('task:cozinhar', ['Miojo de novo? Tá bom.', 'Vou lá no fogão.']) },
      { t: '🧽 Lava a louça', fn: ask('task:louca', ['Eu lavo… mas depois.', 'A pilha tá virando monumento.']) },
      { t: '🍛 Almoça de verdade (prato e talher)', fn: ask('task:almocar', ['Prato, garfo e faca. Até parece gente.', 'Almoço sentado? Que luxo.']) },
      { t: '🛍️ Guarda a compra na geladeira', fn: ask('task:guardar', ['Vou guardar. O leite fica na frente.', 'Já vou, mas quem pagou foi você.']) },
      { t: '🍽️ Vai comer', fn: ask('task:comer', ['Tô morrendo de fome.', 'Almoço!']) },
      { t: '🎸 Toca violão', fn: ask('task:violao', ['Vou tocar a única música que eu sei.', 'Preparando o show…']) },
      { t: '🚿 Vai tomar banho', fn: ask('task:banho', ['Tô precisando mesmo.', 'Vou lá. Não olha o histórico.']) },
      back,
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
    n.opts.map((o, i) => `<button data-i="${i}">${o.t}</button>`).join('') + '</div>'
}
export function openTalk() { show(root()) }
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

addEventListener('keydown', (e) => {
  if (state.editing) return
  if (e.code === 'KeyE' && !dialog.open && target) target.fn()
  else if (dialog.open) {
    if (e.code === 'Escape') closeDialog()
  }
})
