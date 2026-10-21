import * as THREE from 'three'
import { state, setGate, toast, pick } from './state'

// objeto interagível = qualquer Object3D com userData.act; a mira (centro da tela) escolhe
export type Act = { label: string | (() => string); fn: () => void }
export const act = (o: THREE.Object3D, label: Act['label'], fn: () => void) => { o.userData.act = { label, fn } as Act }

export const dialog = { open: false }
const $ = (id: string) => document.getElementById(id)!
const ray = new THREE.Raycaster(); ray.far = 2.0
let target: Act | null = null, tick = 0

export function updateInteract(scene: THREE.Scene, camera: THREE.Camera) {
  const tip = $('tip')
  if (dialog.open) { tip.style.display = 'none'; return }
  if (++tick % 3 === 0) {
    ray.setFromCamera(new THREE.Vector2(0, 0), camera)
    const hit = ray.intersectObjects(scene.children, true).find((h) => h.object.visible)
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
    { t: 'Faz uma dancinha', fn: () => { cmd('dance'); show({ say: 'Bora! Ninguém filma, por favor.', opts: [back] }) } },
    { t: 'Conta uma piada', fn: () => { cmd('laugh'); show({ say: pick(['Por que o programador confunde Halloween com Natal? Porque 31 OCT = 25 DEC.', 'São dois bugs num bar. O terceiro é o barman: não reproduz.', 'Funciona na minha máquina. Vamos enviar a minha máquina então.']), opts: [back] }) } },
    { t: 'Pede um café pra mim', fn: () => { cmd('sip'); state.drinks++; show({ say: 'Peguei dois. Um pra mim e um pra você. Tá na sua conta.', opts: [back] }); toast(`+1 bebida 🥤 (${state.drinks})`) } },
    { t: 'Manda o Smoll dormir', fn: () => { const ok = cmd('sleep') !== false; show({ say: ok ? 'Ah, finalmente. Só cinco minutinhos... Zzz.' : 'Agora não, tô no meio de uma coisa.', opts: [back] }) } },
    { t: 'Tchau', fn: () => { cmd('wave'); closeDialog() } },
  ],
})
const back: Opt = { t: 'Voltar', go: root }
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
  show({ say: pick(['Toma. Não fui eu que te dei.', 'Feito. Isso nunca aconteceu.', 'Rodei aqui, deve funcionar. Deve.']), code, opts: [back] })
  toast(msg)
}

let cur: Node
function show(n: Node) {
  cur = n; dialog.open = true
  $('dialog').style.display = 'block'
  $('dialog').innerHTML = `<b>Smoll</b><p>${n.say}</p>${n.code ? `<pre>${n.code}</pre>` : ''}` +
    n.opts.map((o, i) => `<div>${i + 1} · ${o.t}</div>`).join('')
}
export function openTalk() { show(root()) }
export function closeDialog() { dialog.open = false; $('dialog').style.display = 'none' }

addEventListener('keydown', (e) => {
  if (state.editing) return
  if (e.code === 'KeyE' && !dialog.open && target) target.fn()
  else if (dialog.open) {
    if (e.code === 'Escape') closeDialog()
    const o = cur.opts[+e.key - 1]
    if (o) { if (o.fn) o.fn(); if (o.go) show(o.go()) }
  }
})
