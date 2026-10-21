import * as THREE from 'three'
import { state, toast, updateCounts } from './state'
import { dialog, getTarget, act } from './interact'

// Inventário: 9 slots de hotbar (teclas 1–9 ou roda do mouse) + 27 de mochila (tecla I ou botão 🎒). O item da hotbar selecionada vai pra mão (modelo 3D na frente da câmera);
// clique esquerdo usa o item: nas coisas que reagem a ele (Smoll, cachorro, lixeira, privada…) ou em você mesmo (beber, comer, vestir).
export type Kind = 'drink' | 'food' | 'wear' | 'junk'
export type ItemDef = { name: string; icon: string; img?: string; kind: Kind; build?: (g: THREE.Group) => void; scale?: number; use?: () => void } // use: ferramenta (controle, celular): clique esquerdo chama isso
type Stack = { id: string; n: number }
export const ITEMS: Record<string, ItemDef> = {}
const SLOTS = 36, HOT = 9, MAX = 16
export const slots: (Stack | null)[] = Array(SLOTS).fill(null)
let sel = 0

// ícone e tipo pelo nome do item
const LOOK: [RegExp, string, Kind][] = [
  [/p[oó] de caf/i, '☕', 'junk'], [/ovo frito/i, '🍳', 'food'], [/miojo pronto/i, '🍜', 'food'], [/cuscuz/i, '🌽', 'food'], [/queimada/i, '🔥', 'junk'], [/copo de [aá]gua/i, '💧', 'drink'],
  [/energ[eé]tico/i, '⚡', 'drink'], [/vasinho|planta/i, '🪴', 'junk'], [/headset/i, '🎧', 'wear'], [/mouse/i, '🖱️', 'junk'],
  [/prato/i, '🍽️', 'junk'], [/copo/i, '🥛', 'junk'], [/panela/i, '🍲', 'junk'], [/frigideira/i, '🍳', 'junk'], [/colher/i, '🥄', 'junk'], [/^ovo$/i, '🥚', 'food'], [/leite/i, '🥛', 'drink'], [/miojo/i, '🍜', 'junk'], [/floc[aã]o/i, '🌽', 'junk'],
  [/kuat/i, '🥤', 'drink'], [/caf[eé]/i, '☕', 'drink'], [/manga/i, '🥭', 'food'], [/picol[eé]/i, '🍦', 'food'],
  [/shampoo|condicionador|hidratante|creme/i, '🧴', 'junk'], [/sabonete/i, '🧼', 'junk'], [/perfume/i, '🌸', 'junk'], [/escova de cabelo/i, '🪮', 'junk'], [/absorvente/i, '🩹', 'junk'],
  [/controle/i, '🎮', 'junk'], [/celular/i, '📱', 'junk'], [/halter/i, '🏋️', 'junk'], [/senha/i, '📝', 'junk'],
  [/carta|convite/i, '✉️', 'junk'], [/panfleto|boleto|conta de|cupom|revista|leitura/i, '📄', 'junk'],
  [/pasta de dente/i, '🪥', 'junk'], [/rem[eé]dio/i, '💊', 'junk'], [/fio dental/i, '🧵', 'junk'], [/salto/i, '👠', 'wear'], [/bolsa/i, '👜', 'wear'], [/peruca/i, '💇', 'wear'],
  [/vestido/i, '👗', 'wear'], [/caixa/i, '📦', 'junk'], [/calcinha/i, '🩲', 'wear'], [/suti[aã]/i, '👙', 'wear'], [/batom/i, '💄', 'junk'], [/meia/i, '🧦', 'wear'],
  [/coelh/i, '🐰', 'wear'], [/maquiagem/i, '🎨', 'junk'], [/di[aá]rio/i, '📔', 'junk'], [/toalha/i, '🧻', 'junk'], [/papel/i, '🧻', 'junk'],
]
/** registra um item (id = nome em slug); devolve o id */
export function defineItem(name: string, build?: ItemDef['build'], scale = 0.9): string {
  const id = name.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
  if (!ITEMS[id]) { const [, icon, kind] = LOOK.find(([re]) => re.test(name)) ?? [0, '🎁', 'junk' as Kind]; ITEMS[id] = { name, icon, kind, build, scale } }
  return id
}
export const count = (id: string) => slots.reduce((s, x) => s + (x?.id === id ? x.n : 0), 0)
const refreshCounts = () => { state.mangas = count('manga'); state.drinks = count('kuat'); updateCounts() }

/** guarda o item (empilha igual, senão primeiro slot vazio: hotbar primeiro). false = mochila cheia */
export function give(id: string, n = 1): boolean {
  const same = slots.find((s) => s && s.id === id && s.n < MAX)
  if (same) same.n += n
  else { const i = slots.findIndex((s) => !s); if (i < 0) { toast('Mochila cheia!'); return false } slots[i] = { id, n } }
  changed(); return true
}
/** tira 1 do item (primeira pilha que tiver); false se não tem */
export function takeItem(id: string): boolean { const i = slots.findIndex((s) => s?.id === id); if (i < 0) return false; takeOne(i); return true }
const takeOne = (i: number) => { const s = slots[i]; if (!s) return; if (--s.n <= 0) slots[i] = null; changed() }

// ---------- ícones 3D: cada item é renderizado uma vez, a 45°, num canvas pequeno (cache em dataURL) ----------
let iconR: THREE.WebGLRenderer | null = null, iconScene: THREE.Scene | null = null
const iconCache: Record<string, string> = {}
function iconOf(id: string): string {
  if (iconCache[id]) return iconCache[id]
  const d = ITEMS[id]; if (!d) return ''
  try {
    if (!iconR) {
      iconR = new THREE.WebGLRenderer({ alpha: true, antialias: true, preserveDrawingBuffer: true }); iconR.setSize(96, 96); iconR.setClearColor(0, 0)
      iconScene = new THREE.Scene(); iconScene.add(new THREE.AmbientLight(0xffffff, 2.4)); const l = new THREE.DirectionalLight(0xffffff, 2.5); l.position.set(2, 4, 3); iconScene.add(l)
    }
    const holder = new THREE.Group(), g = new THREE.Group()
    if (d.build) d.build(g)
    else { const m = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.1, 0.1), new THREE.MeshLambertMaterial({ color: 0xcccccc })); m.position.y = 0.05; g.add(m) }
    const box = new THREE.Box3().setFromObject(g), c = box.getCenter(new THREE.Vector3()), sz = box.getSize(new THREE.Vector3())
    g.position.sub(c); holder.add(g)
    holder.rotation.set(0.5, Math.PI / 4, 0) // 45° em Y e inclinado pra cima: vista isométrica
    iconScene!.add(holder)
    const r = Math.max(sz.x, sz.y, sz.z) * 0.62 + 1e-4
    const cam = new THREE.OrthographicCamera(-r, r, r, -r, 0.01, 10); cam.position.set(0, 0, 3); cam.lookAt(0, 0, 0)
    iconR.render(iconScene!, cam)
    iconCache[id] = iconR.domElement.toDataURL()
    iconScene!.remove(holder)
  } catch { iconCache[id] = '' }
  return iconCache[id]
}
export const iconHtml = (id: string) => { if (ITEMS[id]?.img) return `<img src="${ITEMS[id].img}" width="46" height="46" style="object-fit:cover;border-radius:4px;pointer-events:none">`; const u = iconOf(id); return u ? `<img src="${u}" width="44" height="44" draggable="false" style="pointer-events:none">` : ITEMS[id].icon }

// ---------- persistência (só o que o navegador deixar) ----------
const KEY = 'smollInv'
const save = () => { try { localStorage[KEY] = JSON.stringify(slots) } catch { /* sem storage: segue sem salvar */ } }
export function loadInventory() {
  try { const v = JSON.parse(localStorage[KEY] ?? '[]'); v.forEach((s: Stack | null, i: number) => { if (i < SLOTS && s && ITEMS[s.id]) slots[i] = s }) } catch { /* ignora */ }
  changed()
}

// ---------- interface ----------
const css = document.createElement('style')
css.textContent = `
#hotbar{position:fixed;left:50%;bottom:2.5%;transform:translateX(-50%);display:flex;gap:4px;z-index:10;pointer-events:none}
.slot{width:52px;height:52px;box-sizing:border-box;background:#4a4f5fcc;border:2px solid #555;border-radius:6px;position:relative;display:grid;place-items:center;font-size:26px;color:#fff;user-select:none}
.slot.sel{border-color:#ffd54a;background:#000c}.slot .n{position:absolute;right:3px;bottom:0;font:bold 12px sans-serif;text-shadow:0 1px 2px #000}.slot .k{position:absolute;left:3px;top:0;font:11px sans-serif;opacity:.7}
#bagbtn{position:fixed;left:12px;top:10px;z-index:10;background:#000a;color:#fff;border:1px solid #555;border-radius:8px;padding:6px 10px;font:14px sans-serif;cursor:pointer}
#inv{position:fixed;inset:0;display:none;place-items:center;z-index:25;background:#0008}
#inv .box{background:#15171d;border:1px solid #444;border-radius:12px;padding:16px;color:#eee;font:14px sans-serif;width:max-content;max-width:96vw}
#inv .grid{display:grid;grid-template-columns:repeat(9,52px);gap:4px;margin:6px 0}#inv .slot{cursor:pointer;pointer-events:auto}#inv .slot:hover{border-color:#8f8}#inv .slot.pick{border-color:#f66}
#inv .info{min-height:22px;margin-top:6px;opacity:.85}#inv button{background:#2d2d38;color:#eee;border:0;border-radius:6px;padding:6px 10px;cursor:pointer;margin-right:6px}
`
document.head.appendChild(css)
const hot = document.createElement('div'); hot.id = 'hotbar'
const bag = document.createElement('button'); bag.id = 'bagbtn'; bag.textContent = '🎒 Inventário (I)'
const invEl = document.createElement('div'); invEl.id = 'inv'
invEl.innerHTML = '<div class="box"><b>🎒 Mochila</b> <span style="opacity:.6">— clique num item e depois num slot pra mover; os 9 de baixo são a hotbar (1–9)</span><div class="grid main"></div><b>Hotbar</b><div class="grid hot"></div><div class="info"></div><div><button class="drop">🗑️ Descartar item</button><button class="close">Fechar (I / Esc)</button></div></div>'
document.body.append(hot, bag, invEl)

let held: number | null = null // slot "na mão do mouse" dentro do inventário
const slotHtml = (i: number, key = false) => { const s = slots[i], d = s && ITEMS[s.id]; return `<div class="slot${i === sel && key ? ' sel' : ''}${held === i ? ' pick' : ''}" data-i="${i}" title="${d?.name ?? ''}">${key ? `<span class="k">${i + 1}</span>` : ''}${d ? iconHtml(s!.id) : ''}${s && s.n > 1 ? `<span class="n">${s.n}</span>` : ''}</div>` }
const render = () => {
  hot.innerHTML = Array.from({ length: HOT }, (_, i) => slotHtml(i, true)).join('')
  if (invEl.style.display === 'grid') {
    invEl.querySelector('.main')!.innerHTML = Array.from({ length: SLOTS - HOT }, (_, i) => slotHtml(i + HOT)).join('')
    invEl.querySelector('.hot')!.innerHTML = Array.from({ length: HOT }, (_, i) => slotHtml(i, true)).join('')
    const s = held !== null ? slots[held] : slots[sel]
    invEl.querySelector('.info')!.textContent = s ? `${ITEMS[s.id].name} ×${s.n}` : ''
  }
}
function changed() { refreshCounts(); save(); render(); rebuildHeld() }

export const invOpen = () => invEl.style.display === 'grid'
function openInv() { document.exitPointerLock?.(); state.editing = true; held = null; invEl.style.display = 'grid'; render() }
function closeInv() { invEl.style.display = 'none'; state.editing = false; held = null; render(); document.querySelector('canvas')?.requestPointerLock?.() }
bag.addEventListener('click', () => (invOpen() ? closeInv() : openInv()))
invEl.querySelector('.close')!.addEventListener('click', closeInv)
invEl.addEventListener('mousedown', (e) => { if (e.target === invEl) closeInv() })
invEl.querySelector('.drop')!.addEventListener('click', () => { const i = held ?? sel; if (slots[i]) { toast(`Descartou ${ITEMS[slots[i]!.id].name}.`); slots[i] = null; held = null; changed() } })
invEl.addEventListener('click', (e) => {
  const el = (e.target as HTMLElement).closest('.slot') as HTMLElement | null; if (!el) return
  const i = +el.dataset.i!
  if (held === null) { if (slots[i]) held = i; else sel = Math.min(i, HOT - 1) === i ? i : sel }
  else if (held === i) held = null
  else { // move / troca / junta pilhas
    const a = slots[held], b = slots[i]
    if (a && b && a.id === b.id) { const m = Math.min(MAX - b.n, a.n); b.n += m; a.n -= m; if (a.n <= 0) slots[held] = null }
    else { slots[held] = b; slots[i] = a }
    held = null
  }
  if (i < HOT && held === null) sel = i
  changed()
})
const selectSlot = (i: number) => { sel = ((i % HOT) + HOT) % HOT; render(); rebuildHeld() }
addEventListener('keydown', (e) => {
  if (e.code === 'KeyI' && !(e.target instanceof HTMLInputElement) && !(e.target instanceof HTMLTextAreaElement) && (!state.editing || invOpen())) { invOpen() ? closeInv() : openInv(); return }
  if (invOpen() && e.code === 'Escape') { closeInv(); return }
  if (state.editing || dialog.open) return
  if (/^Digit[1-9]$/.test(e.code)) selectSlot(+e.code.slice(5) - 1)
  if (e.code === 'KeyQ') dropHeld(false)
  if (e.code === 'KeyG') dropHeld(true)
})
addEventListener('wheel', (e) => { if (document.pointerLockElement && !state.editing && !dialog.open) selectSlot(sel + Math.sign(e.deltaY)) })

// ---------- item na mão (modelo 3D preso na câmera) ----------
const handG = new THREE.Group()
let handId = '', swing = 0, bob = 0
// ---------- soltar (Q) e arremessar (G ou botão direito): o item vira um objeto no mundo que dá pra pegar de novo ----------
type Phys = { ground: (x: number, z: number, y: number) => number; free: (x: number, z: number, y: number) => boolean }
type Drop = { g: THREE.Group; v: THREE.Vector3; rest: boolean }
const drops: Drop[] = []
let world: { camera: THREE.Camera; scene: THREE.Scene; phys: Phys } | null = null
function dropHeld(throwIt: boolean) {
  const s = slots[sel]; if (!s || !world) return
  const d = ITEMS[s.id], { camera, scene } = world
  const dir = new THREE.Vector3(); camera.getWorldDirection(dir)
  const g = new THREE.Group()
  if (d.build) d.build(g)
  else { const m = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.1, 0.1), new THREE.MeshLambertMaterial({ color: 0xcccccc })); m.position.y = 0.05; g.add(m) }
  g.position.copy(camera.position).addScaledVector(dir, 0.5); g.position.y -= 0.15
  const id = s.id
  act(g, `Pegar ${d.name}`, () => { if (!give(id)) return; scene.remove(g); drops.splice(drops.findIndex((x) => x.g === g), 1) })
  scene.add(g)
  drops.push({ g, v: dir.multiplyScalar(throwIt ? 7 : 1.3).add(new THREE.Vector3(0, throwIt ? 1.5 : 0.8, 0)), rest: false })
  takeOne(sel); swing = 1
  toast(throwIt ? `Arremessou ${d.name}!` : `Soltou ${d.name}.`)
}
function updateDrops(dt: number) {
  const ph = world!.phys
  for (const o of drops) {
    if (o.rest) continue
    const p = o.g.position, v = o.v
    v.y -= 9.8 * dt
    const nx = p.x + v.x * dt, nz = p.z + v.z * dt
    if (ph.free(nx, nz, p.y + 0.05)) { p.x = nx; p.z = nz } else { v.x *= -0.3; v.z *= -0.3 }
    p.y += v.y * dt
    const gy = ph.ground(p.x, p.z, p.y)
    if (p.y <= gy + 0.01 && v.y < 0) {
      p.y = gy
      if (v.y < -1.5) { v.y *= -0.3; v.x *= 0.6; v.z *= 0.6 } else { o.rest = true; o.g.rotation.x = 0; o.g.rotation.z = 0 }
    } else { o.g.rotation.x += dt * 9; o.g.rotation.z += dt * 5 } // gira no ar
  }
}
export function initHeld(camera: THREE.Camera, scene: THREE.Scene, phys: Phys) { world = { camera, scene, phys }; scene.add(camera); camera.add(handG); handG.position.set(0.24, -0.2, -0.5) }
function rebuildHeld() {
  const id = slots[sel]?.id ?? ''
  if (id === handId) return
  handId = id; handG.clear()
  const d = ITEMS[id]; if (!d) return
  const g = new THREE.Group()
  if (d.build) d.build(g)
  else { const m = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.1, 0.1), new THREE.MeshLambertMaterial({ color: 0xcccccc })); m.position.y = 0.05; g.add(m) }
  g.scale.setScalar(d.scale ?? 1.6); g.rotation.set(0.2, -0.6, 0)
  g.traverse((o) => { const m = o as THREE.Mesh; if (m.isMesh) { m.material = (m.material as THREE.Material).clone(); m.material.depthTest = false; m.renderOrder = 999; m.frustumCulled = false } })
  handG.add(g)
}
export function updateHeld(dt: number, moving: boolean) {
  if (world) updateDrops(dt)
  bob += dt * (moving ? 9 : 2); swing = Math.max(0, swing - dt * 3)
  const k = Math.sin(swing * Math.PI)
  handG.position.set(0.24 - k * 0.12, -0.2 + Math.sin(bob) * (moving ? 0.012 : 0.004) - k * 0.03, -0.5 - k * 0.15)
  handG.visible = !state.driving
}

// ---------- usar o item (clique esquerdo) ----------
const SELF: Record<Kind, (name: string, id: string) => string | null> = {
  drink: (n, id) => { if (id === 'kuat' || id === 'energetico') { state.speed = 1.35; state.until = performance.now() + 12000 } return `Glub glub. ${n} acabou.${id === 'kuat' || id === 'energetico' ? ' Energia! (corre mais por 12 s)' : ''}` },
  food: (n) => `Nhac. ${n} devorado.`,
  wear: (n) => { toast(`Você colocou ${n}. Se sentiu… diferente.`); return null },
  junk: (n) => { toast(`${n}: você não sabe o que fazer com isso. Ainda.`); return null },
}
addEventListener('mousedown', (e) => {
  if (!document.pointerLockElement || state.editing || dialog.open) return
  if (e.button === 2) { dropHeld(true); return } // botão direito arremessa
  if (e.button !== 0) return
  const s = slots[sel]; if (!s) return
  const d = ITEMS[s.id]; swing = 1
  if (d.use) { d.use(); return } // ferramenta: tem uso próprio (controle da TV, celular)
  const t = getTarget()
  const r = t?.use?.(s.id, d.kind)
  if (r) { if (r === 'consume') takeOne(sel); return }
  const msg = SELF[d.kind](d.name, s.id)
  if (msg) { toast(msg); if (d.kind === 'drink' || d.kind === 'food') takeOne(sel) }
})
