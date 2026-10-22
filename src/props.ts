import * as THREE from 'three'
import { Reflector } from 'three/examples/jsm/objects/Reflector.js'
import { act } from './interact'
import { PLACE } from './place'
import { gifTexture } from './gifTexture'
import { tv, openRemote } from './tv'
import { chime, bark, strum, sizzle, clink, tweet, cluck, musicPlay, musicStop, musicVol, musicTrack, TRACKS } from './sfx'
import { defineItem, give as giveItem, takeItem, count as invCount, ITEMS, leftovers, kick, zoomCam } from './inventory'
import { openPanel, openChest } from './menu'
import { pcState } from './code'
import { openPhone } from './phone'
import { UM, JOIN, MAC, PAL, BAR, WORLD } from './bairro'
import { state, world, gameHour, vehicles, type Vehicle, toast, sleep, pick, setGate } from './state'

type Rect = [number, number, number, number, number, number] // x0, z0, x1, z1, topo, base (m): dá pra subir em cima quando topo ≤ altura dos pés + degrau

// muro de pedra mosaico cinza (Voronoi com rejunte claro), 1 m x 2 m, sem emendas
let mosaic: THREE.MeshLambertMaterial | null = null
export function mosaicMat() {
  if (mosaic) return mosaic
  const W = 256, H = 512, NX = 6, NY = 12
  const rnd = (i: number) => (Math.sin(i * 127.1) * 43758.5453) % 1
  const seeds: [number, number, number][] = []
  for (let j = 0; j < NY; j++) for (let i = 0; i < NX; i++) seeds.push([((i + 0.5 + rnd(j * 9 + i) * 0.8) * W) / NX, ((j + 0.5 + rnd(j * 7 + i * 3 + 1) * 0.8) * H) / NY, 105 + Math.abs(rnd(j * 5 + i * 11)) * 95])
  const c = document.createElement('canvas'); c.width = W; c.height = H
  const g = c.getContext('2d')!, img = g.createImageData(W, H)
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    let d1 = 1e9, d2 = 1e9, k = 0
    for (let s = 0; s < seeds.length; s++) {
      let dx = Math.abs(x - seeds[s][0]), dy = Math.abs(y - seeds[s][1]); dx = Math.min(dx, W - dx); dy = Math.min(dy, H - dy)
      const d = Math.hypot(dx, dy); if (d < d1) { d2 = d1; d1 = d; k = s } else if (d < d2) d2 = d
    }
    const o = (y * W + x) * 4, edge = d2 - d1 < 3.2, v = edge ? 200 : seeds[k][2]
    img.data[o] = v; img.data[o + 1] = v; img.data[o + 2] = v + (edge ? -2 : 6); img.data[o + 3] = 255
  }
  g.putImageData(img, 0, 0)
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.wrapS = t.wrapT = THREE.RepeatWrapping
  return (mosaic = new THREE.MeshLambertMaterial({ map: t }))
}
export const blockers: Rect[] = []
// telhados de quatro águas pisáveis: retângulo no mundo + altura da beirada (y0) e da cumeeira (y1); inclinação uniforme como a malha do telhado
export const playerPos = { x: 15, z: 8 } // main.ts atualiza todo quadro; usado pelos sons
export const roofRects: { x0: number; z0: number; x1: number; z1: number; y0: number; y1: number }[] = []
export const roofHeight = (x: number, z: number): number => {
  let best = -1
  for (const r of roofRects) if (x >= r.x0 && x <= r.x1 && z >= r.z0 && z <= r.z1) {
    const d = Math.min(x - r.x0, r.x1 - x, z - r.z0, r.z1 - z), half = Math.min(r.x1 - r.x0, r.z1 - r.z0) / 2
    best = Math.max(best, r.y0 + (r.y1 - r.y0) * Math.min(1, d / half))
  }
  return best
}
const H = 2.6

export function buildProps(scene: THREE.Scene) {
  const roofs: THREE.Object3D[] = [] // somem na vista do mapa
  let mirrorR: THREE.Object3D | null = null // espelho de reflexo real: só liga perto (renderiza a cena de novo)
  const ticks: ((dt: number) => void)[] = [] // animações extras (água do chuveiro)
  const swing: { pivot: THREE.Object3D; phase: number }[] = [] // roupas balançando no varal
  const culls: THREE.Object3D[] = [] // casas dos vizinhos: somem quando estão além da névoa (desempenho)
  let cullT = 0
  let clock = 0
  let root: THREE.Object3D = scene, ox = 0 // raiz e deslocamento em x usados pelo bloco da rua (que mora num Group deslocado)
  const fans: THREE.Object3D[] = []
  const block = (x0: number, z0: number, x1: number, z1: number, top = 2.6, bottom = 0) => blockers.push([x0 + ox, z0, x1 + ox, z1, top, bottom])
  const lm = (c: number) => new THREE.MeshLambertMaterial({ color: c })
  const bm = (c: number) => new THREE.MeshBasicMaterial({ color: c })
  const ghost = (m: THREE.Mesh) => { const mat = m.material as THREE.MeshLambertMaterial; mat.transparent = true; mat.opacity = 0; mat.depthWrite = false; return m } // alvo de clique invisível

  // caixa: centro em x/z, y = base
  const box = (w: number, h: number, d: number, m: number | THREE.Material, x: number, y: number, z: number, parent: THREE.Object3D = root) => {
    const o = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), typeof m === 'number' ? lm(m) : m)
    o.position.set(x, y + h / 2, z)
    parent.add(o)
    return o
  }
  const cyl = (r: number, h: number, m: number | THREE.Material, x: number, y: number, z: number, parent: THREE.Object3D = root) => {
    const o = new THREE.Mesh(new THREE.CylinderGeometry(r, r, h, 16), typeof m === 'number' ? lm(m) : m)
    o.position.set(x, y + h / 2, z)
    parent.add(o)
    return o
  }
  const tex = (w: number, h: number, draw: (g: CanvasRenderingContext2D, w: number, h: number) => void) => {
    const c = document.createElement('canvas'); c.width = w; c.height = h
    draw(c.getContext('2d')!, w, h)
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace
    return t
  }
  // plano numa parede: rot = direção da normal (0 → +z, PI → -z, PI/2 → +x, -PI/2 → -x)
  const wallPlane = (w: number, h: number, t: THREE.Texture, x: number, y: number, z: number, rot: number, transparent = false) => {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ map: t, transparent }))
    m.position.set(x, y, z); m.rotation.y = rot
    scene.add(m)
    return m
  }
  const light = (c: number, i: number, d: number, x: number, y: number, z: number) => {
    const l = new THREE.PointLight(c, i, d); l.position.set(x, y, z); scene.add(l)
    return l
  }

  // armário com portas que abrem (face = lado da frente: +1 → +z, -1 → -z)
  const doors: { g: THREE.Group; a: number }[] = []
  const cabinet = (cx: number, y: number, cz: number, w: number, h: number, d: number, face: 1 | -1, c: number, msgs: string[]) => {
    const t = 0.03
    box(w, h, t, 0x2a1c10, cx, y, cz - face * (d / 2 - t / 2))
    box(t, h, d, c, cx - w / 2 + t / 2, y, cz); box(t, h, d, c, cx + w / 2 - t / 2, y, cz)
    box(w, t, d, c, cx, y + h - t, cz); box(w, t, d, c, cx, y, cz)
    box(w - 2 * t, t, d - t, c, cx, y + h / 2, cz)
    for (let i = 0; i < 3; i++) box(0.18, 0.22, 0.18, [0xc0392b, 0xf1c40f, 0x2a5db0][i], cx - 0.3 + i * 0.3, y + h / 2 + t, cz)
    let open = false
    const mine: typeof doors = []
    for (const s of [-1, 1]) {
      const g = new THREE.Group(); g.position.set(cx + (s * w) / 2, y, cz + (face * d) / 2); scene.add(g)
      const dm = box(w / 2 - 0.01, h - 0.02, t, c, (-s * w) / 4, 0.01, (face * t) / 2, g)
      box(0.03, 0.14, 0.03, 0xc9b037, -s * (w / 2 - 0.07), h / 2 - 0.07, face * 0.04, g)
      const e = { g, a: 0 }; doors.push(e); mine.push(e)
      act(dm, () => (open ? 'Fechar armário' : 'Abrir armário'), () => {
        open = !open
        mine.forEach((m, i) => (m.a = open ? (i ? 1 : -1) * 1.9 * face : 0))
        if (open) toast(pick(msgs))
      })
    }
    block(cx - w / 2, cz - d / 2, cx + w / 2, cz + d / 2, y + h, y) // balcão (0,9 m) dá pra subir; armário aéreo só bate na cabeça de quem está em cima
  }

  defineItem('Kuat', (g) => { cyl(0.033, 0.12, 0x2e9a3c, 0, 0, 0, g); cyl(0.035, 0.04, 0xf4f1e8, 0, 0.04, 0, g) })
  defineItem('Manga', (g) => { const m = new THREE.Mesh(new THREE.SphereGeometry(0.05, 10, 8), lm(0xf0a020)); m.position.y = 0.05; g.add(m) })
  // assentos: E senta (câmera baixa, presa no lugar); WASD/espaço levanta. spots = lugares do móvel; pega o mais próximo que não esteja ocupado (por outro jogador)
  type Spot = { x: number; y: number; z: number; yaw: number }
  const spotKey = (sp: Spot) => `${sp.x.toFixed(1)}_${sp.z.toFixed(1)}`
  const sitAct = (o: THREE.Object3D, spots: Spot[], label: string) => act(o, () => (spots.every((sp) => state.takenSeats.has(spotKey(sp))) ? 'Lugar ocupado' : label), () => {
    const free = spots.filter((sp) => !state.takenSeats.has(spotKey(sp))).sort((a, b) => Math.hypot(a.x - playerPos.x, a.z - playerPos.z) - Math.hypot(b.x - playerPos.x, b.z - playerPos.z))[0]
    if (!free) { toast('Tá lotado! Espera alguém levantar.'); return }
    state.seat = { ...free, key: spotKey(free), ex: free.x - Math.sin(free.yaw) * 0.8, ez: free.z - Math.cos(free.yaw) * 0.8 }
    toast('Sentou. WASD ou espaço levanta · B abre os gestos (aparecem no espelho e pros outros).')
  })
  // item que dá pra pegar (some e volta em 20 s): build monta as peças dentro do grupo, em coordenadas locais com y = 0 na base
  const thing = (x: number, y: number, z: number, label: string, msgs: string[], build: (g: THREE.Group) => void, hold = true) => {
    const g = new THREE.Group(); g.position.set(x, y, z); scene.add(g); build(g)
    const id = defineItem(label.replace(/^(Pegar|Ler)( o| a| os| as| um| uma)? /, '').replace(/^./, (c) => c.toUpperCase()), build)
    act(g, label, () => { if (!giveItem(id)) return; toast(pick(msgs) + ` (+ ${ITEMS[id].name} 🎒)`); g.visible = false; setTimeout(() => (g.visible = true), hold ? 20000 : 30000) })
    return g
  }

  const fridgeStock: THREE.Object3D[] = [] // itens da compra na geladeira da cozinha (userData.nome = nome pra lista)
  // geladeira que abre: carcaça oca com prateleiras e itens (Kuat pegável, leite, ovos, mangas...), porta com garrafinhas e luz interna; frente pro oeste
  const fridge = (cx: number, cz: number, h: number, color: number, stock: 'cozinha' | 'velha') => {
    const g = new THREE.Group(); g.position.set(cx, 0, cz); g.rotation.y = Math.PI; scene.add(g)
    const t = 0.04, W = 0.7, D = 0.7
    box(t, h, W, 0xdedede, -D / 2 + t / 2, 0, 0, g)                                      // fundo
    for (const sz of [-1, 1]) box(D, h, t, color, 0, 0, sz * (W / 2 - t / 2), g)       // laterais
    box(D, t, W, color, 0, h - t, 0, g); box(D, t, W, 0xdedede, 0, 0, 0, g)             // topo e base
    const shelves = [0.45, 0.85, 1.25].filter((y) => y < h - 0.25)
    for (const sy of shelves) box(D - 0.1, 0.02, W - 0.1, 0xcfe8f5, -0.02, sy, 0, g)
    const lightF = light(0xffffff, 0, 2.5, cx - 0.2, h * 0.6, cz)
    const kuat = (x: number, y: number, z: number, big = false) => { // lata ou garrafa verde de Kuat: dá pra pegar, volta depois de 15 s
      const it = new THREE.Group(); it.position.set(x, y, z); g.add(it)
      const r = big ? 0.055 : 0.033, hh = big ? 0.3 : 0.12
      cyl(r, hh, 0x2e9a3c, 0, 0, 0, it); cyl(r + 0.002, hh * 0.35, 0xf4f1e8, 0, hh * 0.3, 0, it); cyl(r * 0.6, 0.02, 0xcccccc, 0, hh, 0, it)
      act(it, big ? 'Pegar a Kuat 2L' : 'Pegar uma Kuat', () => { if (!giveItem('kuat', big ? 2 : 1)) return; toast(`Pegou ${big ? 'a Kuat de 2 litros' : 'uma Kuat gelada'} 🥤`); it.visible = false; setTimeout(() => (it.visible = true), 15000) })
    }
    const ball = (x: number, y: number, z: number, r: number, c: number) => { const m = new THREE.Mesh(new THREE.SphereGeometry(r, 8, 6), lm(c)); m.position.set(x, y + r, z); g.add(m); return m }
    const sy = (i: number) => shelves[i] + 0.02
    const stuff = (x: number, y: number, z: number, id: string, label: string, build: (g: THREE.Group) => void, parent: THREE.Object3D = g) => { // item da compra: some ao pegar e só volta quando guardam a compra
      const it = new THREE.Group(); it.position.set(x, y, z); parent.add(it); build(it)
      act(it, label, () => { if (!giveItem(id)) return; toast(`Pegou: ${ITEMS[id].name}. 🧊`); it.visible = false })
      it.userData.nome = ITEMS[id].name; fridgeStock.push(it); return it
    }
    if (stock === 'cozinha') {
      box(0.5, 0.22, 0.55, 0x9bd1a0, -0.02, t, 0, g)                                      // gaveta de legumes
      kuat(-0.05, sy(0), -0.18, true); kuat(-0.05, sy(0), -0.04, true); cyl(0.04, 0.28, 0x9fd0e8, -0.05, sy(0), 0.14, g) // 2 Kuat de 2 L e água
      for (let i = 0; i < 4; i++) ball(0.1 + (i % 2) * 0.1, sy(0), 0.2 - Math.floor(i / 2) * 0.12, 0.05, 0xf0a020) // mangas do quintal
      if (shelves[1]) {
        for (const zz of [-0.2, -0.1]) act(box(0.1, 0.22, 0.08, 0xf4f4f0, -0.1, sy(1), zz, g), 'Pegar o leite', () => { if (giveItem('leite')) toast('Pegou o leite. 🥛') }) // leite
        box(0.18, 0.05, 0.28, 0xd9c8a0, 0.0, sy(1), 0.12, g)
        for (let i = 0; i < 6; i++) act(ball(-0.04 + (i % 2) * 0.08, sy(1) + 0.05, 0.02 + Math.floor(i / 2) * 0.09, 0.025, 0xf4efe0), 'Pegar um ovo', () => { if (giveItem('ovo')) toast('Pegou um ovo. 🥚') }) // ovos
      }
      if (shelves[2]) for (let i = 0; i < 6; i++) kuat(-0.1 + (i % 3) * 0.1, sy(2), -0.15 + Math.floor(i / 3) * 0.12)
      cyl(0.09, 0.14, 0x8a8f94, 0.12, sy(1), -0.18, g)                                    // pote de sobra
      // compras: queijo e presunto na prateleira de cima, legumes na gaveta, congelador (carne, sorvete, gelo) numa prateleira extra; só voltam quando a compra é guardada
      stuff(-0.05, sy(2), 0.17, 'queijo', 'Pegar o queijo', B_QUEIJO); stuff(0.08, sy(2), 0.22, 'presunto', 'Pegar o presunto', B_PRESUNTO)
      stuff(-0.1, t + 0.22, -0.12, 'tomate', 'Pegar um tomate', B_TOMATE); stuff(0.0, t + 0.22, 0.05, 'cenoura', 'Pegar uma cenoura', B_CENOURA)
      box(D - 0.1, 0.02, W - 0.1, 0xe8f4ff, -0.02, 1.5, 0, g)
      stuff(-0.05, 1.52, -0.18, 'carne', 'Pegar a carne', B_CARNE); stuff(-0.05, 1.52, -0.02, 'carne', 'Pegar a carne', B_CARNE)
      stuff(0.05, 1.52, 0.15, 'sorvete', 'Pegar o sorvete', B_SORVETE); stuff(-0.05, 1.52, 0.24, 'gelo', 'Pegar o gelo', B_GELO)
    } else {
      for (let i = 0; i < 2; i++) cyl(0.03, 0.26, 0x7a4a1e, -0.05, sy(0), -0.1 + i * 0.12, g)    // cervejas
      cyl(0.09, 0.14, 0xe0c040, 0.1, sy(0), 0.12, g)                                         // pote de pequi
      if (shelves[1]) for (let i = 0; i < 3; i++) kuat(-0.05, sy(1), -0.15 + i * 0.12)
    }
    // porta: dobradiça no lado +z (local), abre pra fora
    const door = new THREE.Group(); door.position.set(D / 2, 0, -W / 2); g.add(door) // dobradiça no lado sul: a porta abre pro meio da cozinha, sem bater na bancada
    const panel = box(t, h - 0.02, W, color, 0, 0.01, W / 2, door)
    box(0.03, 0.45, 0.04, 0x444444, 0.035, h * 0.45, W - 0.06, door)                     // puxador
    for (let i = 0; i < (stock === 'cozinha' ? 3 : 4); i++) cyl(0.025, 0.16, [0xc0392b, 0xf1c40f, 0x2ecc71, 0x3498db][i], -0.05, 0.6 + (i % 2) * 0.4, 0.12 + i * 0.14, door) // garrafinhas e molhos na porta
    if (stock === 'cozinha') { // molho de tomate pegável na porta e ímã com a lista de compras (mostra o que falta na geladeira)
      stuff(-0.05, 1.0, 0.54, 'molho-de-tomate', 'Pegar o molho de tomate', B_MOLHO, door)
      const nota = box(0.01, 0.2, 0.14, 0xfffbe0, 0.025, 1.3, 0.35, door); box(0.014, 0.04, 0.04, 0xc0182c, 0.03, 1.42, 0.35, door)
      act(nota, 'Ler a lista de compras', () => { const f = fridgeStock.filter((s) => !s.visible).map((s) => s.userData.nome); toast(f.length ? `Lista de compras: ${[...new Set(f)].join(', ')}.` : 'Lista de compras: tudo em dia. Milagre.', 4500) })
    }
    let open = false
    const e = { g: door, a: 0 }; doors.push(e)
    act(panel, () => (open ? 'Fechar geladeira' : 'Abrir geladeira'), () => {
      open = !open; e.a = open ? (stock === 'cozinha' ? Math.PI : 1.9) : 0; lightF.intensity = open ? 1.6 : 0
      if (open) toast(pick(stock === 'cozinha' ? ['Kuat gelada, leite, ovos e as mangas do quintal.', 'Tem Kuat de sobra. Aproveita.', 'Gelada. Cheira a Kuat e cuscuz.'] : ['Só cerveja, pequi e uma Kuat esquecida.', 'Cheiro de fim de semana.']))
    })
  }

  // ---------- OFICINA (x 1–7, z 1–6, ex-garagem fechada) ----------
  const portao = tex(512, 288, (g, w, h) => {
    g.fillStyle = '#4b5a63'; g.fillRect(0, 0, w, h)
    g.fillStyle = '#3a464d'; for (let y = 0; y < h; y += 24) g.fillRect(0, y, w, 3)  // réguas
    g.fillStyle = '#2b3338'; for (let x = 16; x < w; x += 32) g.fillRect(x, 24, 5, 120) // grade
    g.fillRect(0, 24, w, 6); g.fillRect(0, 138, w, 6)
    g.fillStyle = '#c9b037'; g.fillRect(w - 50, h / 2 + 10, 28, 8) // trinco
    g.fillStyle = '#7a1f1f'; g.fillRect(0, h - 14, w, 14)           // poeira de terra
  })

  // lâmpada pendente
  box(0.01, 0.5, 0.01, 0x111111, 4, 2.1, 3.5)
  const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.09), bm(0xfff2c0)); bulb.position.set(4, 2.05, 3.5); scene.add(bulb)
  const lampOfi = light(0xffd9a0, 6, 9, 4, 2.0, 3.5)

  // carro (frente pro portão, oeste)
  const makeCar = (red: number) => {
  const car = new THREE.Group()
  box(4.2, 0.5, 1.8, red, 0, 0.25, 0, car)
  box(4.22, 0.12, 1.82, 0x8a3b1f, 0, 0.25, 0, car)             // barro vermelho
  box(2.0, 0.45, 1.6, 0x1b2a38, 0.2, 0.75, 0, car)            // vidros
  box(1.9, 0.06, 1.55, red, 0.2, 1.2, 0, car)                 // teto
  for (const [px, pz] of [[-0.78, -0.78], [-0.78, 0.78], [1.18, -0.78], [1.18, 0.78]]) box(0.08, 0.45, 0.08, red, px, 0.75, pz, car)
  box(0.1, 0.2, 1.8, 0x222222, -2.1, 0.2, 0, car); box(0.1, 0.2, 1.8, 0x222222, 2.1, 0.2, 0, car)  // parachoques
  for (const pz of [-0.6, 0.6]) { box(0.06, 0.12, 0.3, bm(0xfff7d0), -2.12, 0.42, pz, car); box(0.06, 0.12, 0.3, bm(0xff2020), 2.12, 0.42, pz, car) } // faróis
  box(0.04, 0.12, 0.4, 0xffffff, -2.12, 0.18, 0, car)         // placa
  for (const [wx, wz] of [[-1.3, -0.9], [-1.3, 0.9], [1.3, -0.9], [1.3, 0.9]]) {
    const w = cyl(0.33, 0.25, 0x151515, wx, 0, wz, car); w.rotation.x = Math.PI / 2; w.position.y = 0.33
    const hc = cyl(0.16, 0.27, 0xaaaaaa, wx, 0, wz, car); hc.rotation.x = Math.PI / 2; hc.position.y = 0.33
  }
  car.scale.setScalar(0.7) // carros do tamanho dos visitantes (1,15 m)
  return car
  }

  // registra o veículo: pega os blockers recém-criados (pra tirar do caminho enquanto dirige) e liga o "Entrar"
  const regVeh = (g: THREE.Object3D, kind: Vehicle['kind'], n0: number, eye: Vehicle['eye'], len: number, wid: number, top: number) => {
    const v: Vehicle = { g, kind, eye, len, wid, top, rects: blockers.slice(n0), ox, v: 0 }
    vehicles.push(v); act(g, kind === 'car' ? 'Entrar no carro' : 'Subir na moto', () => { if (!state.driving) state.enter(v) })
  }
  // ---------- GARAGEM ABERTA (carport na frente da casa, x 20–28, z 1–6) com portão de correr ----------
  const car = makeCar(0xb22222); car.rotation.y = Math.PI; car.position.set(23.8, 0, 3.4); scene.add(car) // focinho pro portão
  let n0 = blockers.length
  block(22.3, 2.6, 25.3, 4.2, 0.56); block(22.8, 2.7, 24.6, 4.1, 0.9); regVeh(car, 'car', n0, [0.15, 0.68, -0.28], 2.95, 1.3, 0.56)     // carro: capô sobe, cabine só pulando
  // moto do Smoll: Honda CB 250 Twister 2014 vermelha, nariz pro portão (oeste), do lado do carro
  const bike = new THREE.Group(); bike.position.set(27, 0, 3.6); bike.scale.setScalar(0.7); scene.add(bike)
  for (const wx of [-0.62, 0.65]) { const w = cyl(0.3, 0.1, 0x151515, wx, 0, 0, bike); w.rotation.x = Math.PI / 2; w.position.y = 0.3; const h = cyl(0.17, 0.12, 0xaaaaaa, wx, 0, 0, bike); h.rotation.x = Math.PI / 2; h.position.y = 0.3 }
  box(1.1, 0.06, 0.08, 0x2a2a2a, 0.0, 0.45, 0, bike)                // chassi
  box(0.5, 0.35, 0.3, 0x3a3a3a, 0.05, 0.25, 0, bike)                // motor
  box(0.55, 0.22, 0.28, 0xc01818, -0.12, 0.78, 0, bike)             // tanque vermelho
  box(0.6, 0.1, 0.26, 0x151515, 0.35, 0.78, 0, bike)                // banco
  box(0.4, 0.14, 0.24, 0xc01818, 0.78, 0.74, 0, bike)               // rabeta vermelha
  box(0.06, 0.65, 0.06, 0xaaaaaa, -0.55, 0.3, 0.1, bike); box(0.06, 0.65, 0.06, 0xaaaaaa, -0.55, 0.3, -0.1, bike) // garfo
  box(0.06, 0.06, 0.7, 0x151515, -0.52, 1.02, 0, bike)              // guidão
  const hl = new THREE.Mesh(new THREE.SphereGeometry(0.1, 10, 8), bm(0xfff7d0)); hl.position.set(-0.66, 0.9, 0); bike.add(hl) // farol
  box(0.9, 0.1, 0.1, 0x8a8f94, 0.45, 0.2, 0.2, bike)                // escapamento
  n0 = blockers.length; block(25.9, 3.3, 28.1, 3.9, 0.7); regVeh(bike, 'bike', n0, [0.2, 1.0, 0], 1.5, 0.5, 0.7)
  for (const px of [20.4, 24, 27.6]) { cyl(0.1, 2.6, 0xd8d8d0, px, 0, 5.85); block(px - 0.1, 5.75, px + 0.1, 5.95) } // pilares do telhado
  box(8, 0.2, 0.25, 0x8a3b1f, 24, 2.45, 5.95)                                                                      // viga da frente
  box(0.01, 0.4, 0.01, 0x111111, 24, 2.2, 3.5)
  const gb = new THREE.Mesh(new THREE.SphereGeometry(0.09), bm(0xfff2c0)); gb.position.set(24, 2.15, 3.5); scene.add(gb)
  const lampGar = light(0xffd9a0, 5, 8, 24, 2.1, 3.5)
  box(0.9, 0.02, 0.6, 0x2a2018, 22.6, 0.001, 3.2)                                                                  // mancha de óleo
  const gateTex = tex(512, 256, (g, w, h) => { // grade de barras verticais enferrujadas, fundo transparente
    const rust = ['#c0431f', '#b5381a', '#cf5a2a']
    for (let x = 4; x < w; x += 16) { g.fillStyle = rust[(x >> 4) % 3]; g.fillRect(x, 0, 7, h) }
    for (const y of [0, 120, h - 14]) { g.fillStyle = '#9c2f12'; g.fillRect(0, y, w, 14) }
    g.fillStyle = '#7a2a12'; for (let i = 0; i < 160; i++) g.fillRect((Math.abs(Math.sin(i * 12.9)) * w) | 0, (Math.abs(Math.sin(i * 7.7)) * h) | 0, 3, 5)
  })
  const gate = new THREE.Group(); scene.add(gate)                                                                  // portão de correr: desliza pro lado (+z)
  const gp = new THREE.Mesh(new THREE.PlaneGeometry(5, 2.0), new THREE.MeshBasicMaterial({ map: gateTex, transparent: true, alphaTest: 0.5, side: THREE.DoubleSide }))
  gp.position.set(27.9, 1.0, 3.5); gp.rotation.y = Math.PI / 2; gate.add(gp)
  act(gp, () => (state.gateOpen ? 'Fechar portão' : 'Abrir portão'), () => setGate(!state.gateOpen))
  for (const z of [0.9, 6.1]) { box(0.5, 2.2, 0.5, mosaicMat(), 28.5, 0, z); box(0.6, 0.08, 0.6, 0x7d7d7a, 28.5, 2.2, z) } // colunas de pedra do portão
  // ferragens do muro (lado da rua)
  const meter = box(0.05, 0.32, 0.22, 0xdddddd, 29.03, 1.4, 8.4); box(0.02, 0.1, 0.1, 0x88aacc, 29.06, 1.55, 8.4) // caixa do medidor
  // relógio de luz: o consumo vem das luzes, ventiladores e TV que estão ligados; o painel mexe no disjuntor geral
  const energy = { rooms: [] as { on: () => boolean; w: number; off: () => void }[], gato: false, kWh: 0, abajurOff: () => {} }
  const breakerOff = new Set<string>() // disjuntores desarmados no quadro do corredor (por cômodo)
  const bellLog: { h: number; who: string; n: number }[] = [] // quem tocou a campainha (interfone do corredor)
  const watts = () => !state.power ? 0 : Math.round((180 + energy.rooms.reduce((a, r) => a + (r.on() ? r.w : 0), 0) + fans.reduce((a, f) => a + (f.userData.on ? 70 : 0), 0) + (tv.on ? 110 : 0)) * (energy.gato ? 0.4 : 1))
  ticks.push((dt) => { energy.kWh += (watts() / 1000) * dt * (72 / 3600) }) // 1 s real = 72 s de jogo
  const killPower = () => { pcState.mode = 'off'; energy.rooms.forEach((r) => r.off()); fans.forEach((f) => (f.userData.on = false)); energy.abajurOff(); tv.setOn(false); tv.sync() }
  act(meter, 'Abrir o relógio de luz', () => openPanel('⚡ Relógio de luz',
    () => `⚡ Consumo agora: <b>${watts()} W</b><br>📈 Gasto desde o amanhecer: <b>${energy.kWh.toFixed(2)} kWh</b><br>💸 Estimativa do mês: <b>R$ ${(energy.kWh * 30 * 0.95).toFixed(2)}</b><br>🔌 Disjuntor geral: <b>${state.power ? 'ligado' : 'DESLIGADO'}</b><br>🏴 Bandeira tarifária: vermelha, patamar 2${energy.gato ? '<br>⚠️ <i>gambiarra detectada (o relógio gira devagar)</i>' : ''}`,
    [
      { t: '🔌 Disjuntor geral', keep: true, fn: () => { state.power = !state.power; if (!state.power) { killPower(); toast('Smoll: QUEM DESLIGOU A LUZ?!'); state.cmd('facepalm') } else toast('A luz voltou. Os aparelhos você liga de novo.') } },
      { t: '🪢 Fazer o gato', keep: true, fn: () => { energy.gato = !energy.gato; toast(energy.gato ? 'Gambiarra feita. O fiscal que não veja.' : 'Gato desfeito. Honestidade acima de tudo.'); if (energy.gato && Math.random() < 0.3) setTimeout(() => toast('O fiscal da Energisa apareceu! Multa de R$ 3.000. 🚨'), 2500) } },
      { t: '📄 Anotar a leitura', fn: () => { const id = defineItem('Leitura do relógio', (g) => box(0.15, 0.01, 0.1, 0xf4f1e8, 0, 0, 0, g)); if (giveItem(id)) toast(`Anotou: ${energy.kWh.toFixed(2)} kWh. 📝`) } },
    ]))
  const mail = box(0.05, 0.18, 0.22, 0x111111, 29.03, 1.35, 11.2)                                    // caixa de correio
  const paper = (g: THREE.Group) => { box(0.15, 0.01, 0.1, 0xf4f1e8, 0, 0, 0, g); box(0.1, 0.012, 0.012, 0xcc4444, 0, 0, 0.02, g) }
  const MAIL = ['Carta do banco', 'Panfleto da pizzaria', 'Conta de luz atrasada', 'Convite de casamento', 'Carta para a Bia', 'Cupom de desconto vencido', 'Revista de fofoca', 'Boleto da internet'].map((n) => defineItem(n, paper))
  let mailStock: { id: string; n: number }[] = [], mailAt = -1e9
  act(mail, 'Abrir a caixa de correio', () => {
    if (performance.now() - mailAt > 120000) { mailAt = performance.now(); mailStock = [...MAIL].sort(() => Math.random() - 0.5).slice(0, 3 + Math.floor(Math.random() * 3)).map((id) => ({ id, n: 1 })) } // chega correio novo a cada 2 min
    openChest('📬 Caixa de correio', mailStock)
  })
  wallPlane(0.34, 0.17, tex(128, 64, (g, w, h) => { g.fillStyle = '#f2efe6'; g.fillRect(0, 0, w, h); g.strokeStyle = '#2b2b2b'; g.lineWidth = 3; g.strokeRect(2, 2, w - 4, h - 4); g.fillStyle = '#111'; g.font = 'bold 38px sans-serif'; g.textAlign = 'center'; if (PLACE.number) g.fillText(PLACE.number, w / 2, 45) }), 29.03, 1.85, 10.0, Math.PI / 2) // número da casa

  // bancada + painel de ferramentas (parede norte)
  box(3.5, 0.08, 0.7, 0x8b6b43, 4.75, 0.85, 1.4)
  for (const lx of [3.05, 6.45]) for (const lz of [1.1, 1.7]) box(0.07, 0.85, 0.07, 0x444444, lx, 0, lz)
  box(3.4, 0.05, 0.6, 0x6e5435, 4.75, 0.3, 1.4)
  const caixaFerr = box(0.5, 0.25, 0.25, 0xc0392b, 3.6, 0.93, 1.4) // vira baú no bloco "OFICINA VIVA"
  box(0.2, 0.2, 0.2, 0x222222, 5.4, 0.93, 1.35)   // morsa
  cyl(0.07, 0.2, 0x3a7d44, 4.4, 0.93, 1.3); cyl(0.07, 0.2, 0x2a5db0, 4.6, 0.93, 1.3) // latas de tinta
  cyl(0.07, 0.12, 0xaaaaaa, 6.0, 0.93, 1.5)
  const painel = tex(300, 120, (g, w, h) => {
    g.fillStyle = '#9a7b4f'; g.fillRect(0, 0, w, h)
    g.fillStyle = '#6b522f'; for (let x = 8; x < w; x += 16) for (let y = 8; y < h; y += 16) g.fillRect(x, y, 2, 2)
    g.fillStyle = '#e8e8e8'; g.fillRect(30, 20, 8, 70); g.fillRect(24, 14, 20, 12)     // chave
    g.fillStyle = '#c0392b'; g.fillRect(90, 30, 40, 12); g.fillStyle = '#6b4a2a'; g.fillRect(105, 42, 8, 50) // martelo
    g.fillStyle = '#f1c40f'; g.fillRect(170, 20, 12, 80); g.fillStyle = '#222'; g.fillRect(170, 90, 12, 16) // chave de fenda
    g.strokeStyle = '#c0c0c0'; g.lineWidth = 5; g.beginPath(); g.arc(240, 50, 24, 0, 7); g.stroke()          // serra
  })
  wallPlane(3.0, 1.2, painel, 4.75, 1.65, 1.01, 0)
  block(3.0, 1.0, 6.5, 1.75, 0.93)                                         // bancada

  // estante (parede sul, oeste da porta)
  box(2.4, 2.0, 0.04, 0x6e5435, 2.5, 0, 5.97)
  for (const sx of [1.3, 3.7]) box(0.04, 2.0, 0.5, 0x6e5435, sx, 0, 5.72)
  const items = [0xc0392b, 0x2a5db0, 0xf1c40f, 0x3a7d44, 0xe67e22, 0x8e44ad]
  for (const sy of [0.02, 0.5, 1.0, 1.5, 1.96]) {
    box(2.4, 0.04, 0.5, 0x6e5435, 2.5, sy, 5.72)
    if (sy < 1.9) for (let i = 0; i < 5; i++) box(0.3 + (i % 2) * 0.1, 0.25 + (i % 3) * 0.08, 0.3, items[(i + Math.round(sy * 3)) % 6], 1.55 + i * 0.45, sy + 0.04, 5.72)
  }
  block(1.3, 5.45, 3.7, 6, 2.0)

  // geladeira velha (abre)
  fridge(6.5, 5.6, 1.7, 0xdcdcdc, 'velha')
  box(0.5, 0.15, 0.01, 0x8a3b1f, 6.5, 0, 5.25) // barro
  block(6.15, 5.25, 6.85, 5.95, 1.7)

  // ---------- BANHEIRO (x 7–11, z 11–15; porta ao norte em x 9–10) ----------
  const lampBan = light(0xffffff, 3, 6, 9, 2.4, 13)
  box(3.9, 0.02, 3.9, 0xcfe3ea, 9, 0.001, 13)                                            // piso de azulejo claro
  // privada na parede oeste: vaso + caixa acoplada com botão de descarga
  const wc = new THREE.Group(); scene.add(wc)
  cyl(0.15, 0.32, 0xf4f4f4, 7.55, 0, 12.2, wc)                                                            // pedestal
  const bowl = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.13, 0.2, 24, 1, true), new THREE.MeshLambertMaterial({ color: 0xffffff, side: THREE.DoubleSide })); bowl.position.set(7.62, 0.42, 12.2); wc.add(bowl) // tigela aberta: dá pra ver o fundo
  const seat = new THREE.Mesh(new THREE.TorusGeometry(0.2, 0.024, 8, 28), lm(0xe8e8e8)); seat.rotation.x = Math.PI / 2; seat.position.set(7.62, 0.54, 12.2); wc.add(seat) // assento
  const wcWater = cyl(0.13, 0.012, 0x7ab0c8, 7.62, 0.4, 12.2, wc)                                          // água no fundo da tigela
  cyl(0.03, 0.004, 0x333333, 7.62, 0.33, 12.2, wc)                                                         // buraco do sifão
  const tank = box(0.22, 0.45, 0.42, 0xf4f4f4, 7.13, 0.4, 12.2); const btn = cyl(0.04, 0.03, 0xbbbbbb, 7.13, 0.85, 12.2)
  // tampa com dobradiça atrás (x ≈ 7.4): fecha por cima do assento ou abre encostada na caixa
  const lidG = new THREE.Group(); lidG.position.set(7.4, 0.57, 12.2); scene.add(lidG)
  cyl(0.24, 0.025, 0xfafafa, 0.22, 0, 0, lidG)
  let lidOpen = false, lidA = 0, flushT = 0
  act(lidG, () => (lidOpen ? 'Fechar a tampa' : 'Abrir a tampa'), () => { lidOpen = !lidOpen; toast(lidOpen ? 'Tampa aberta.' : 'Tampa fechada. Boa educação.') })
  act(wc, 'Usar a privada', () => toast(lidOpen ? pick(['Sentou, pensou na vida e no bug de produção. 🚽', 'Cuidado com o celular, ele cai. Já caiu dois.', 'Missão cumprida. Não esquece de dar descarga.', 'Ficou 40 minutos. Tempo no banheiro não conta como produtividade.']) : 'Abre a tampa antes, mano.'), (id) => { if (!lidOpen) { toast('Abre a tampa antes, mano.'); return true } toast(`Descarga! Adeus, ${ITEMS[id].name}. 🌊`); return 'consume' })
  const flush = () => { flushT = 2.6; toast(pick(['*SHHHHHHH* 🌊', 'Descarga dada. A caixa leva 2 min pra encher.', 'O ralo do Smoll agradece.'])) }
  act(tank, 'Dar descarga', flush); act(btn, 'Dar descarga', flush)
  ticks.push((dt) => {
    lidA += ((lidOpen ? 1.75 : 0) - lidA) * Math.min(1, dt * 7); lidG.rotation.z = lidA
    if (flushT > 0) { flushT -= dt; const k = Math.max(0, flushT) / 2.6; wcWater.rotation.y += dt * 14 * k; wcWater.position.y = 0.406 - 0.05 * Math.sin(Math.min(1, (1 - k) * 4) * Math.PI) } // gira e baixa, depois enche de novo
  })
  block(7, 11.95, 7.8, 12.45, 0.5)
  const roll = cyl(0.055, 0.1, 0xffffff, 7.1, 0.75, 11.4); act(roll, 'Pegar papel higiênico', () => toast(pick(['Pegou papel. O rolo é o último, claro.', 'Só tem o miolo. Mais um clássico.'])))
  // pia com gabinete na parede leste, torneira com água e espelho
  box(0.5, 0.62, 0.7, 0xf0f0f0, 10.72, 0, 12.6)                                                           // gabinete (mais baixo sob a cuba)
  for (const [w, d, x, z] of [[0.06, 0.74, 10.49, 12.6], [0.1, 0.74, 10.93, 12.6], [0.36, 0.17, 10.7, 12.315], [0.36, 0.17, 10.7, 12.885]]) box(w, 0.24, d, 0xffffff, x, 0.62, z) // bancada com buraco no meio
  box(0.36, 0.015, 0.4, 0xbcd4e0, 10.7, 0.62, 12.6); cyl(0.02, 0.005, 0x333333, 10.7, 0.635, 12.6)         // fundo da cuba e ralo
  act(ghost(box(0.34, 0.2, 0.38, 0xffffff, 10.7, 0.65, 12.6)), 'Lavar o rosto', () => toast(pick(['Lavou o rosto. Acordou de vez. Hoje.', 'Água na cara. O código continua com bug.', 'Escovou os dentes e cuspiu na pia. Humano ok.'])))
  const tap = cyl(0.02, 0.18, 0x999999, 10.93, 0.86, 12.6); const spout = box(0.14, 0.025, 0.025, 0x999999, 10.86, 1.03, 12.6)
  const flow = cyl(0.008, 0.36, 0x7ec8ff, 10.8, 0.66, 12.6); flow.visible = false
  let tapOn = 0
  const tapFn = () => {
    flow.visible = !!(tapOn = tapOn ? 0 : 1)
    if (tapOn) { toast(pick(['Lavou a mão. Dessa vez de verdade.', 'Água fria. A Caern mandou um abraço.', 'Escovou os dentes por 8 segundos.'])); setTimeout(() => { flow.visible = false; tapOn = 0 }, 7000) }
  }
  const tapHit = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.3, 0.3), new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false })); tapHit.position.set(10.84, 1.0, 12.6); scene.add(tapHit) // área de clique maior que a torneira fina
  for (const o of [tap, spout, tapHit]) act(o, () => (tapOn ? 'Fechar a torneira' : 'Abrir a torneira'), tapFn)
  block(10.45, 12.25, 11, 12.95, 0.86)
  const mir = new Reflector(new THREE.PlaneGeometry(0.55, 0.8), { textureWidth: 512, textureHeight: 512, color: 0xd6e6ec, clipBias: 0.003 })
  mir.position.set(10.985, 1.3, 12.6); mir.rotation.y = -Math.PI / 2; scene.add(mir); mirrorR = mir
  const mirDraw = mir.onBeforeRender // o Reflector desenha o reflexo aqui: liga o corpo do jogador só durante esse desenho
  mir.onBeforeRender = function (this: THREE.Object3D, ...a: unknown[]) { const av = state.avatar; if (av) av.visible = true; (mirDraw as (...x: unknown[]) => void).apply(this, a); if (av) av.visible = false }
  box(0.02, 0.84, 0.03, 0x5a3a22, 10.99, 0.88, 12.6 - 0.29); box(0.02, 0.84, 0.03, 0x5a3a22, 10.99, 0.88, 12.6 + 0.29)
  box(0.02, 0.03, 0.62, 0x5a3a22, 10.99, 0.88, 12.6); box(0.02, 0.03, 0.62, 0x5a3a22, 10.99, 1.69, 12.6)
  act(mir, 'Olhar no espelho', () => toast(pick(['Tá com cara de quem dormiu 3 horas.', 'Ficou bonito. O espelho mente, mas ficou.', 'Tem uma barba aí. Quando foi a última vez?'])))
  // produtos femininos espalhados: nicho do chuveiro, pia e caixa da privada (o Smoll "mora sozinho")
  box(0.14, 0.03, 0.75, 0xcccccc, 10.92, 1.05, 14.2)
  thing(10.92, 1.08, 13.95, 'Pegar o shampoo', ['Shampoo "Cachos Definidos". O Smoll tem cabelo curtinho.', 'Shampoo de babosa. Metade do frasco já foi, e o Smoll não tem cabelo comprido.'], (g) => { cyl(0.035, 0.2, 0xf06ea9, 0, 0, 0, g); cyl(0.02, 0.03, 0xffffff, 0, 0.2, 0, g) }, false)
  thing(10.92, 1.08, 14.15, 'Pegar o condicionador', ['Condicionador de coco. Smoll diz que é "pro cabelo ficar macio, ué".', 'Creme de pentear pra cachos. Ele não tem cachos.'], (g) => { cyl(0.035, 0.2, 0xb34de0, 0, 0, 0, g); cyl(0.02, 0.03, 0xffffff, 0, 0.2, 0, g) }, false)
  thing(10.92, 1.08, 14.38, 'Pegar o sabonete íntimo', ['Sabonete íntimo de camomila. Smoll jura que é "pra pele sensível".', 'Sabonete íntimo. Segundo ele, o rótulo errou de gênero.'], (g) => { cyl(0.03, 0.14, 0xffffff, 0, 0, 0, g); cyl(0.022, 0.03, 0xf06ea9, 0, 0.14, 0, g) }, false)
  thing(10.92, 1.08, 14.6, 'Pegar o hidratante', ['Creme hidratante com cheiro de morango. Smoll chama de "teste de produto".', 'Hidratante pra pele seca. Tem a marca de um dedo. Do Smoll mesmo.'], (g) => { cyl(0.05, 0.06, 0xf2c4dc, 0, 0, 0, g); cyl(0.052, 0.015, 0xffffff, 0, 0.06, 0, g) }, false)
  thing(10.65, 0.86, 12.95, 'Pegar o sabonete', ['Sabonete de glicerina. Cheiro de rosa. Ninguém explicou.', 'Sabonete quase no fim, mas ainda dá pra lavar o orgulho.'], (g) => { box(0.1, 0.03, 0.06, 0xffd9e8, 0, 0, 0, g) }, false)
  thing(10.8, 0.86, 12.25, 'Pegar o perfume', ['Perfume feminino "Bom Dia Flor". Smoll borrifa antes de sair.', 'Cheiro doce de baunilha. Estranho pra quem mora no PC.'], (g) => { box(0.06, 0.1, 0.05, 0xf8b4cf, 0, 0, 0, g); cyl(0.015, 0.03, 0xd4af37, 0, 0.1, 0, g) }, false)
  thing(10.6, 0.86, 12.3, 'Pegar a escova de cabelo', ['Escova rosa com fios longos presos. Sem comentários.', 'Escova de cabelo cheia de fios. Smoll só tem 2 cm de cabelo.'], (g) => { box(0.18, 0.015, 0.06, 0xe87aa8, 0, 0, 0, g); box(0.08, 0.02, 0.05, 0xe87aa8, -0.13, 0, 0, g) }, false)
  thing(7.13, 0.85, 11.95, 'Pegar o absorvente', ['Pacote de absorvente com abas. Smoll diz que "ficou da visita".', 'Absorvente noturno. Tava no kit de emergência do Smoll.'], (g) => { box(0.14, 0.06, 0.1, 0xff9ec4, 0, 0, 0, g) }, false)
  // armário do banheiro na parede norte (portas abrem pra dentro do banheiro), com coisas dentro
  cabinet(8.0, 1.5, 11.2, 1.2, 0.7, 0.3, 1, 0xe8e8e8, ['Só remédio vencido e um fio dental.', 'Tem mais produto de cabelo do que um homem precisa.', 'Cheiro de hortelã e de coisa que ficou esquecida.'])
  thing(7.5, 1.88, 11.12, 'Pegar a pasta de dente', ['Pasta de dente espremida do meio. Crime.', 'Tá no fim. Smoll só troca quando acaba de vez.'], (g) => { cyl(0.025, 0.14, 0x2e86de, 0, 0, 0, g); cyl(0.02, 0.03, 0xffffff, 0, 0.14, 0, g) })
  thing(7.5, 1.88, 11.3, 'Pegar o remédio', ['Dipirona vencida desde 2023. Smoll toma assim mesmo.', 'Caixa de remédio pra dor de cabeça. Código com bug dá dor de cabeça.'], (g) => { box(0.1, 0.12, 0.05, 0xffffff, 0, 0, 0, g); box(0.04, 0.04, 0.052, 0xc0182c, 0, 0.04, 0, g) })
  thing(8.5, 1.88, 11.12, 'Pegar o creme de barba', ['Creme de barba. Pelo menos esse é do Smoll.', 'Espuma de barbear. A barba do Smoll agradece.'], (g) => { cyl(0.03, 0.16, 0x6a4a2a, 0, 0, 0, g); cyl(0.02, 0.03, 0xdddddd, 0, 0.16, 0, g) })
  thing(8.5, 1.88, 11.3, 'Pegar o fio dental', ['Fio dental. Metade da caixa já foi, o que é suspeito, porque ele nunca usa.', 'Fio dental sabor menta. Nunca usado, na teoria.'], (g) => { cyl(0.04, 0.05, 0x4fb7a5, 0, 0, 0, g) })
  // box do chuveiro no canto sudeste: bandeja, vidro, ducha e gotas
  box(1.45, 0.06, 1.4, 0xdfe8ec, 10.25, 0, 14.25)
  const glass = new THREE.Mesh(new THREE.BoxGeometry(0.03, 1.9, 1.4), new THREE.MeshLambertMaterial({ color: 0xaad4e8, transparent: true, opacity: 0.3 })); glass.position.set(9.5, 0.95, 14.3); scene.add(glass)
  block(9.47, 13.6, 9.53, 15, 1.9)
  box(0.03, 0.4, 0.03, 0x999999, 10.4, 1.65, 14.97); const head = cyl(0.1, 0.03, 0xcccccc, 10.4, 2.0, 14.8); head.rotation.x = Math.PI / 2 - 0.5; box(0.03, 0.03, 0.2, 0x999999, 10.4, 2.0, 14.9)
  const pos = new Float32Array(90 * 3), drops = new THREE.Points(new THREE.BufferGeometry(), new THREE.PointsMaterial({ color: 0x9fd8ff, size: 0.03, transparent: true, opacity: 0.8 }))
  drops.geometry.setAttribute('position', new THREE.BufferAttribute(pos, 3)); drops.frustumCulled = false; drops.visible = false; scene.add(drops)
  const dropSeed = Array.from({ length: 90 }, () => [(Math.random() - 0.5) * 0.4, (Math.random() - 0.5) * 0.3, Math.random()])
  let shower = 0, showerT = 0
  ticks.push((dt) => {
    if (!shower) return
    showerT += dt; if (showerT > 15) { shower = 0; drops.visible = false; return }
    dropSeed.forEach((d, i) => { d[2] = (d[2] + dt * 1.6) % 1; pos[i * 3] = 10.4 + d[0] * (0.3 + d[2]); pos[i * 3 + 1] = 1.95 - 1.9 * d[2] * d[2]; pos[i * 3 + 2] = 14.6 - 0.3 * d[2] + d[1] })
    drops.geometry.attributes.position.needsUpdate = true
  })
  const toggleShower = () => {
    shower = shower ? 0 : 1; showerT = 0; drops.visible = !!shower
    if (shower) toast(pick(['Água gelada! Rondônia não perdoa. 🚿', 'Banho de 40 minutos. A conta de luz que se vire.', 'Cantando no banho. Ninguém ouve, graças a Deus.']))
  }
  world.chuveiro = (on) => { if (!!shower !== on) toggleShower() }
  act(head, () => (shower ? 'Desligar o chuveiro' : 'Ligar o chuveiro'), toggleShower)
  act(glass, () => (shower ? 'Desligar o chuveiro' : 'Ligar o chuveiro'), toggleShower)
  const knob = cyl(0.045, 0.05, 0xd0d0d0, 10.0, 1.1, 14.95); knob.rotation.x = Math.PI / 2; knob.position.z = 14.96 // registro na altura da mão
  act(knob, () => (shower ? 'Fechar o registro' : 'Abrir o registro'), toggleShower)
  const towel = box(0.5, 0.9, 0.03, 0x2a5db0, 7.7, 1.0, 14.95); act(towel, 'Pegar a toalha', () => toast(pick(['Toalha ainda úmida do último banho. Fazer o quê.', 'Cheira a sabão em pó e a promessa de lavar.'])))

  // ---------- QUARTO (x 12–19, z 9–13) ----------
  // cama: cabeceira na parede oeste
  box(0.1, 1.1, 1.9, 0x5a3a22, 12.08, 0, 13)
  box(2.15, 0.35, 1.8, 0x5a3a22, 13.15, 0.05, 13)
  act(box(2.05, 0.25, 1.7, 0xf3efe6, 13.15, 0.4, 13), 'Tirar uma soneca', sleep)
  const manta = tex(256, 256, (g, w, h) => {
    g.fillStyle = '#3d5a80'; g.fillRect(0, 0, w, h)
    g.fillStyle = '#e0a458'; for (let x = 0; x < w; x += 64) g.fillRect(x, 0, 14, h)
    g.fillStyle = '#ee6c4d'; for (let y = 0; y < h; y += 64) g.fillRect(0, y + 28, w, 6)
  })
  const mm = new THREE.Mesh(new THREE.PlaneGeometry(1.2, 1.74), new THREE.MeshBasicMaterial({ map: manta, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }))
  mm.rotation.x = -Math.PI / 2; mm.position.set(13.7, 0.668, 13); scene.add(mm)
  box(1.2, 0.12, 1.74, 0x3d5a80, 13.7, 0.54, 13)
  box(0.45, 0.14, 0.7, 0xffffff, 12.5, 0.65, 12.35); box(0.45, 0.14, 0.7, 0xffffff, 12.5, 0.65, 13.65)
  block(12, 12.05, 14.2, 13.95, 0.66); block(12, 12.05, 12.2, 13.95, 1.1)  // cama (sobe) e cabeceira
  // criado-mudo + abajur
  box(0.5, 0.5, 0.45, 0x5a3a22, 12.27, 0, 11.5)
  cyl(0.05, 0.2, 0x222222, 12.27, 0.5, 11.5)
  const shade = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.17, 0.2, 12), bm(0xffe2a8)); shade.position.set(12.27, 0.82, 11.5); scene.add(shade)
  const lamp = light(0xffc880, 3, 5, 12.4, 0.95, 11.7)
  energy.abajurOff = () => { lamp.intensity = 0; (shade.material as THREE.MeshBasicMaterial).color.set(0x8a6a4a) } // disjuntor desligado apaga o abajur também
  act(shade, () => (lamp.intensity ? 'Apagar abajur' : 'Acender abajur'), () => { lamp.intensity = lamp.intensity ? 0 : 3; (shade.material as THREE.MeshBasicMaterial).color.set(lamp.intensity ? 0xffe2a8 : 0x6b5e4a) })
  block(12, 11.27, 12.55, 11.75, 0.5)
  // guarda-roupa (parede sul)
  cabinet(16.5, 0, 14.7, 2.0, 2.1, 0.6, -1, 0x7a5a3a, ['Só moletom preto. Todos iguais.', 'Achou uma camiseta do tempo da faculdade.', 'Uma meia sozinha. Como sempre.', 'Tem coisa aqui que o Smoll não explicou…'])
  // itens suspeitos escondidos no armário (só aparecem com as portas abertas)
  const SH = 0.03, TOP = 1.08
  thing(15.75, SH, 14.75, 'Pegar o salto alto nº 42', ['Salto alto vermelho, número 42. "É pra um amigo", diz o Smoll.', 'Gasto na ponta. Alguém anda treinando.'], (g) => { box(0.1, 0.05, 0.24, 0xc0182c, 0, 0.03, 0, g); box(0.1, 0.12, 0.06, 0xc0182c, 0, 0.0, 0.1, g); cyl(0.012, 0.1, 0x222222, 0, 0, -0.1, g) })
  thing(16.15, SH, 14.78, 'Pegar a bolsa feminina', ['Bolsa rosa com batom, espelhinho e um recibo de salão. Interessante.', 'Dentro: absorvente, chiclete e a chave da casa de uma tal de Bia.'], (g) => { box(0.28, 0.2, 0.1, 0xe87aa8, 0, 0, 0, g); box(0.18, 0.02, 0.02, 0x7a3a54, 0, 0.2, 0, g) })
  thing(16.7, SH, 14.8, 'Pegar a peruca loira', ['Peruca loira longa. O Smoll jura que é do cosplay.', 'Ainda tem cheiro de laquê. Foi usada recentemente.'], (g) => { const m = new THREE.Mesh(new THREE.SphereGeometry(0.13, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2), lm(0xe8c860)); g.add(m); box(0.2, 0.18, 0.04, 0xe8c860, 0, -0.1, -0.1, g) })
  thing(17.1, SH, 14.78, 'Pegar o vestido floral', ['Vestido floral tamanho M. Não é da mãe, não.', 'Passado e dobrado com carinho. Muito suspeito.'], (g) => { box(0.3, 0.05, 0.25, 0xf2a5c8, 0, 0, 0, g); box(0.3, 0.02, 0.1, 0x8ac27a, 0, 0.05, 0.06, g) })
  thing(17.32, SH, 14.62, 'Pegar a caixa "Nada Suspeito"', ['Caixa escrita "NADA SUSPEITO" com caneta. Dentro: mais uma caixa.', 'Tem um bilhete: "Se alguém achar, é do meu primo".'], (g) => { box(0.3, 0.22, 0.25, 0x9a7048, 0, 0, 0, g); box(0.2, 0.06, 0.01, 0xffffff, 0, 0.08, 0.126, g) })
  thing(15.65, TOP, 14.6, 'Pegar a calcinha de renda', ['Calcinha de renda preta. Pergunta aberta: de quem?', 'O Smoll tenta explicar: "Veio na lavagem errada".'], (g) => { box(0.16, 0.012, 0.12, 0x2a2a30, 0, 0, 0, g); box(0.16, 0.014, 0.02, 0xe87aa8, 0, 0, -0.06, g) })
  thing(15.95, TOP, 14.82, 'Pegar o sutiã de renda', ['Sutiã tamanho 42. O Smoll nega com a cabeça, mas o rosto entrega.', 'Sutiã rosa com bojo. Fica pro dono provar.'], (g) => { for (const dx of [-0.05, 0.05]) { const m = new THREE.Mesh(new THREE.SphereGeometry(0.05, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2), lm(0xe85a98)); m.position.set(dx, 0, 0); g.add(m) } box(0.2, 0.012, 0.012, 0xe85a98, 0, 0.01, 0.03, g) })
  thing(17.0, TOP, 14.55, 'Pegar o batom vermelho', ['Batom vermelho "Paixão Fatal". Nível de uso: 60%.', 'Passou sem querer. Agora tá todo mundo olhando.'], (g) => { cyl(0.018, 0.05, 0xd4af37, 0, 0, 0, g); cyl(0.015, 0.04, 0xc0182c, 0, 0.05, 0, g) })
  thing(17.25, TOP, 14.85, 'Pegar a meia-calça arrastão', ['Meia arrastão. Ninguém sabe a história disso.', 'Tá rasgada num joelho. Foi pro baile funk?'], (g) => { box(0.2, 0.02, 0.1, 0x1c1c22, 0, 0, 0, g); box(0.18, 0.012, 0.08, 0x555560, 0, 0.012, 0, g) })
  thing(15.65, TOP, 14.9, 'Pegar a fantasia de coelhinha', ['Orelhinhas de coelho e uma gola. "Foi no Halloween de 2021".', 'Fantasia completa de coelhinha. O Smoll muda de assunto.'], (g) => { box(0.18, 0.02, 0.04, 0x222222, 0, 0, 0, g); for (const dx of [-0.05, 0.05]) box(0.03, 0.16, 0.012, 0xffffff, dx, 0.02, 0, g) })
  thing(16.95, TOP, 14.9, 'Pegar o kit de maquiagem', ['Paleta de sombras com 24 cores. Metade gasta. Bem gasta.', 'Base, pó e um pincel. O Smoll diz que é pra cobrir o cansaço.'], (g) => { box(0.2, 0.04, 0.14, 0xe87aa8, 0, 0, 0, g); for (let i = 0; i < 4; i++) box(0.03, 0.005, 0.03, [0x7a3a9a, 0x3a7ac2, 0xe8c860, 0xc0182c][i], -0.07 + i * 0.045, 0.042, 0, g) })
  thing(17.42, TOP, 14.7, 'Ler o diário', ['"Querido diário: hoje o Smoll programou 14 horas seguidas…" O resto tá riscado.', 'Cadeado dourado. Alguém arrombou. Qualquer pessoa.'], (g) => { box(0.15, 0.03, 0.2, 0x6a3a8a, 0, 0, 0, g); box(0.02, 0.035, 0.03, 0xd4af37, 0.08, 0, 0, g) })
  // quadro com o GIF animado (ícone do servidor do Discord) e moldura de madeira, na parede norte do quarto
  const quadro = gifTexture('/img/quadro.gif')
  wallPlane(0.9, 0.9, quadro.texture, 17.5, 1.6, 11.01, 0)
  for (const [w, h, x, y] of [[1.0, 0.06, 17.5, 2.08], [1.0, 0.06, 17.5, 1.12], [0.06, 0.96, 16.99, 1.6], [0.06, 0.96, 18.01, 1.6]]) box(w, h, 0.05, 0x5a3a22, x, y - h / 2, 11.03)
  // área da mesa do Smoll (sprite em main.ts)
  block(18.17, 11.9, 19, 14.1, 0.78); block(18.5, 11.7, 18.75, 12.3, 0.47)  // mesa do Smoll (sobe) e o gabinete embaixo

  // ---------- SALA (x 8–13, z 1–6) ----------
  const rug = tex(256, 192, (g, w, h) => {
    g.fillStyle = '#7a2e2e'; g.fillRect(0, 0, w, h)
    g.strokeStyle = '#e0c48a'; g.lineWidth = 6; g.strokeRect(14, 14, w - 28, h - 28)
    g.strokeStyle = '#d9a441'; g.lineWidth = 3; g.strokeRect(34, 34, w - 68, h - 68)
    g.fillStyle = '#e0c48a'; g.beginPath(); g.moveTo(w / 2, 56); g.lineTo(w / 2 + 40, h / 2); g.lineTo(w / 2, h - 56); g.lineTo(w / 2 - 40, h / 2); g.fill()
  })
  const r = new THREE.Mesh(new THREE.PlaneGeometry(3, 2.2), new THREE.MeshBasicMaterial({ map: rug }))
  r.rotation.x = -Math.PI / 2; r.position.set(10.5, 0.01, 3.5); scene.add(r)
  // sofá (norte, abaixo da janela)
  const SOFA: Spot[] = [9.85, 10.5, 11.15].map((x) => ({ x, y: 0.52, z: 1.65, yaw: Math.PI }))
  sitAct(box(2.6, 0.4, 0.9, 0x4b4f5c, 10.5, 0, 1.55), SOFA, 'Sentar no sofá'); box(2.6, 0.5, 0.2, 0x3b3f4a, 10.5, 0.4, 1.15)
  box(0.25, 0.65, 0.9, 0x3b3f4a, 9.35, 0, 1.55); box(0.25, 0.65, 0.9, 0x3b3f4a, 11.65, 0, 1.55)
  sitAct(box(0.95, 0.12, 0.65, 0x5d6272, 10.05, 0.4, 1.6), SOFA, 'Sentar no sofá'); sitAct(box(0.95, 0.12, 0.65, 0x5d6272, 10.95, 0.4, 1.6), SOFA, 'Sentar no sofá') // almofadas
  box(0.35, 0.35, 0.12, 0xe0a458, 9.8, 0.5, 1.3)
  block(9.2, 1.1, 11.8, 2.0, 0.5); block(9.2, 1.1, 11.8, 1.3, 0.9)           // sofá: assento e encosto
  // poltrona (leste) e dois puffs no tapete, todos virados pra TV
  const armchair: Spot[] = [{ x: 12.45, y: 0.5, z: 2.35, yaw: Math.PI + 0.1 }]
  sitAct(box(0.75, 0.4, 0.75, 0x6a4a3a, 12.45, 0, 2.3), armchair, 'Sentar na poltrona'); sitAct(box(0.75, 0.55, 0.15, 0x5a3c2e, 12.45, 0.4, 1.97), armchair, 'Sentar na poltrona')
  for (const dx of [-0.31, 0.31]) box(0.12, 0.3, 0.7, 0x5a3c2e, 12.45 + dx, 0.4, 2.3)
  block(12.05, 1.9, 12.85, 2.7, 0.45); block(12.05, 1.9, 12.85, 2.05, 0.95)
  for (const [px, pz, col] of [[9.4, 4.2, 0xc0392b], [11.6, 4.2, 0x2e86de]] as const) { sitAct(cyl(0.25, 0.32, col, px, 0, pz), [{ x: px, y: 0.34, z: pz, yaw: Math.PI }], 'Sentar no puff'); block(px - 0.25, pz - 0.25, px + 0.25, pz + 0.25, 0.32) }
  // rack + TV (sul)
  box(1.6, 0.45, 0.4, 0x3a2a1a, 11.95, 0, 5.75)
  const tvBody = box(1.2, 0.7, 0.06, 0x111111, 11.95, 0.55, 5.75)
  const tvScreen = tex(128, 80, (g, w, h) => {
    const gr = g.createLinearGradient(0, 0, w, h); gr.addColorStop(0, '#1d4ed8'); gr.addColorStop(1, '#7c3aed')
    g.fillStyle = gr; g.fillRect(0, 0, w, h)
  })
  const tvPlane = wallPlane(1.12, 0.62, tvScreen, 11.95, 0.9, 5.71, Math.PI)
  const tvLight = light(0x6688ff, 2.5, 4, 11.95, 1.0, 5.2)
  const tvOff = new THREE.MeshBasicMaterial({ color: 0x000000 })
  tv.place(11.95, 0.9, 5.71, Math.PI, 1.12); tvPlane.material = tv.hole // começa ligada, passando um vídeo do YouTube
  // 1º E com som mudo → liga o som; depois alterna ligada/desligada
  const tvToggle = () => {
    if (tv.on && tv.muted) { tv.unmute(); toast('Som da TV ligado. 🔊'); return }
    if (!tv.on && state.tvBlocked) { toast('A TV está bloqueada no roteador. 🚫'); return }
    tv.setOn(!tv.on); tvPlane.material = tv.on ? tv.hole : tvOff; tvLight.intensity = tv.on ? 2.5 : 0
    if (tv.on) { tv.muted = true; tv.unmute() }
  }
  tv.sync = () => { tvPlane.material = tv.on ? tv.hole : tvOff; tvLight.intensity = tv.on ? 2.5 : 0 }
  world.tv = () => { if (state.tvBlocked) { toast('A TV está bloqueada no roteador. 🚫'); return } tv.setOn(!tv.on); tvPlane.material = tv.on ? tv.hole : tvOff; tvLight.intensity = tv.on ? 2.5 : 0; if (tv.on) { tv.muted = true; tv.unmute() } }
  for (const o of [tvBody, tvPlane]) act(o, () => (!tv.on ? 'Ligar TV' : tv.muted ? 'Ligar o som da TV' : 'Desligar TV'), tvToggle)
  // controle remoto: pega (vai pra mochila), dá pra soltar (Q) ou arremessar (G); com ele na mão o clique esquerdo abre o controle da TV de até 10 m
  thing(12.62, 0.45, 5.72, 'Pegar o controle da TV', ['Controle da TV. As pilhas são de marcas diferentes, claro.', 'Achou o controle! Alguém vai ficar feliz.'], (g) => { box(0.06, 0.025, 0.2, 0x1a1a1a, 0, 0, 0, g); for (let i = 0; i < 4; i++) box(0.02, 0.006, 0.02, [0xc0182c, 0x2e9a3c, 0xe0c030, 0x2e86de][i], -0.015 + (i % 2) * 0.03, 0.025, -0.05 + Math.floor(i / 2) * 0.04, g) }, false)
  { const rid = defineItem('Controle da TV'); ITEMS[rid].use = () => { if (Math.hypot(playerPos.x - 11.95, playerPos.z - 5.7) > 10) { toast('Muito longe da TV. O sinal do controle não chega.'); return } if (state.tvBlocked) { toast('A TV está bloqueada no roteador.'); return } openRemote() } }
  block(11.15, 5.55, 12.75, 5.95, 0.45); block(11.3, 5.68, 12.6, 5.82, 1.25, 0.55) // rack e a TV por cima

  // ---------- COZINHA (x 14–19, z 1–6) ----------
  // itens da cozinha (definidos antes da geladeira, que dá ovo e leite)
  const plateB = (g: THREE.Group) => { cyl(0.11, 0.015, 0xf4f4f0, 0, 0, 0, g); cyl(0.07, 0.016, 0xdedad0, 0, 0.002, 0, g) }
  const idPrato = defineItem('Prato', plateB), idCopo = defineItem('Copo', (g) => { cyl(0.035, 0.09, 0xcfe8f5, 0, 0, 0, g) })
  const idPanela = defineItem('Panela', (g) => { cyl(0.1, 0.1, 0x9a9ea3, 0, 0, 0, g); box(0.15, 0.015, 0.03, 0x222222, 0.16, 0.07, 0, g) })
  const idFrig = defineItem('Frigideira', (g) => { cyl(0.11, 0.03, 0x222226, 0, 0, 0, g); box(0.2, 0.015, 0.03, 0x222222, 0.2, 0.02, 0, g) })
  const idColher = defineItem('Colher de pau', (g) => { box(0.025, 0.02, 0.22, 0xb98a4e, 0, 0, 0, g); box(0.05, 0.02, 0.06, 0xb98a4e, 0, 0, 0.13, g) })
  const idOvo = defineItem('Ovo', (g) => { const m = new THREE.Mesh(new THREE.SphereGeometry(0.03, 10, 8), lm(0xf4efe0)); m.scale.y = 1.25; m.position.y = 0.037; g.add(m) })
  const idLeite = defineItem('Leite', (g) => { box(0.07, 0.17, 0.07, 0xf4f4f0, 0, 0, 0, g); box(0.07, 0.04, 0.071, 0x2e86de, 0, 0.08, 0, g) })
  const idMiojo = defineItem('Miojo', (g) => { box(0.12, 0.03, 0.09, 0xe0a020, 0, 0, 0, g); box(0.1, 0.005, 0.07, 0xc0182c, 0, 0.03, 0, g) })
  const idPo = defineItem('Pó de café', (g) => { box(0.08, 0.14, 0.05, 0x6a3a1e, 0, 0, 0, g); box(0.07, 0.04, 0.052, 0xd4af37, 0, 0.08, 0, g) })
  const idFlocao = defineItem('Flocão de milho', (g) => { box(0.1, 0.16, 0.05, 0xf0c020, 0, 0, 0, g) })
  const idOvoFrito = defineItem('Ovo frito', (g) => { cyl(0.07, 0.01, 0xf8f4e8, 0, 0, 0, g); cyl(0.025, 0.02, 0xf0b020, 0, 0.01, 0, g) })
  const idMiojoPronto = defineItem('Miojo pronto', (g) => { cyl(0.06, 0.06, 0xf4f4f0, 0, 0, 0, g); cyl(0.05, 0.01, 0xe8c060, 0, 0.06, 0, g) })
  const idCuscuz = defineItem('Cuscuz', (g) => { cyl(0.07, 0.04, 0xf2d06a, 0, 0, 0, g); cyl(0.02, 0.012, 0xf4efe0, 0, 0.04, 0, g) })
  const idCafe = defineItem('Café', (g) => { cyl(0.04, 0.07, 0xffffff, 0, 0, 0, g); cyl(0.036, 0.004, 0x3a1f10, 0, 0.07, 0, g) })
  const idAgua = defineItem('Copo de água', (g) => { cyl(0.035, 0.09, 0xcfe8f5, 0, 0, 0, g); cyl(0.031, 0.06, 0x7ec8ff, 0, 0.01, 0, g) })
  const idQueimada = defineItem('Comida queimada', (g) => { cyl(0.07, 0.03, 0x1a1410, 0, 0, 0, g) })
  // ingredientes, comidas novas e resíduos (a geladeira e os armários usam esses modelos)
  const ball2 = (g: THREE.Group, r: number, c: number, y = 0, sy = 1) => { const m = new THREE.Mesh(new THREE.SphereGeometry(r, 10, 8), lm(c)); m.position.y = y + r * sy; m.scale.y = sy; g.add(m) }
  const B_ARROZ = (g: THREE.Group) => { box(0.09, 0.17, 0.05, 0xf4f1e8, 0, 0, 0, g); box(0.08, 0.05, 0.052, 0x2e9a3c, 0, 0.06, 0, g) }
  const B_FEIJAO = (g: THREE.Group) => { box(0.09, 0.17, 0.05, 0x8a4a22, 0, 0, 0, g); box(0.08, 0.05, 0.052, 0xf4f1e8, 0, 0.06, 0, g) }
  const B_MACARRAO = (g: THREE.Group) => { box(0.1, 0.2, 0.04, 0xe8c040, 0, 0, 0, g); box(0.09, 0.05, 0.042, 0xc0182c, 0, 0.08, 0, g) }
  const B_SAL = (g: THREE.Group) => { cyl(0.035, 0.1, 0xf4f4f0, 0, 0, 0, g); cyl(0.037, 0.02, 0x2e86de, 0, 0.1, 0, g) }
  const B_PIMENTA = (g: THREE.Group) => { cyl(0.025, 0.09, 0xc02020, 0, 0, 0, g); cyl(0.027, 0.02, 0x111111, 0, 0.09, 0, g) }
  const B_OLEO = (g: THREE.Group) => { cyl(0.03, 0.2, 0xe8c030, 0, 0, 0, g); cyl(0.012, 0.04, 0xc0182c, 0, 0.2, 0, g) }
  const B_CARNE = (g: THREE.Group) => { box(0.12, 0.03, 0.09, 0xf4f4f0, 0, 0, 0, g); box(0.1, 0.012, 0.07, 0xb03040, 0, 0.03, 0, g) }
  const B_QUEIJO = (g: THREE.Group) => { box(0.1, 0.04, 0.08, 0xf4d03a, 0, 0, 0, g) }
  const B_PRESUNTO = (g: THREE.Group) => { box(0.1, 0.018, 0.08, 0xe88a96, 0, 0, 0, g) }
  const B_PAO = (g: THREE.Group) => { box(0.14, 0.05, 0.07, 0xc98a3a, 0, 0, 0, g); box(0.12, 0.02, 0.06, 0xdda55a, 0, 0.05, 0, g) }
  const B_BANANA = (g: THREE.Group) => { box(0.15, 0.03, 0.035, 0xf2d030, 0, 0, 0, g); box(0.02, 0.03, 0.03, 0x5a4a1a, 0.08, 0, 0, g) }
  const B_MACA = (g: THREE.Group) => ball2(g, 0.04, 0xc02828), B_LARANJA = (g: THREE.Group) => ball2(g, 0.045, 0xf08a20), B_TOMATE = (g: THREE.Group) => ball2(g, 0.04, 0xd0302a)
  const B_CENOURA = (g: THREE.Group) => { cyl(0.018, 0.14, 0xf08a20, 0, 0, 0, g); cyl(0.012, 0.03, 0x3fa34d, 0, 0.14, 0, g) }
  const B_SORVETE = (g: THREE.Group) => { cyl(0.06, 0.1, 0xf0a0c0, 0, 0, 0, g); cyl(0.062, 0.02, 0xffffff, 0, 0.1, 0, g) }
  const B_GELO = (g: THREE.Group) => { box(0.1, 0.03, 0.08, 0xcfe8f5, 0, 0, 0, g) }
  const B_MOLHO = (g: THREE.Group) => { cyl(0.03, 0.12, 0xc0392b, 0, 0, 0, g); cyl(0.032, 0.02, 0xf4f4f0, 0, 0.12, 0, g) }
  const B_PANO = (g: THREE.Group) => { box(0.22, 0.01, 0.15, 0x3a6fc0, 0, 0, 0, g); box(0.22, 0.012, 0.03, 0xf4f4f0, 0, 0, 0, g) }
  const B_CONCHA = (g: THREE.Group) => { cyl(0.008, 0.25, 0x9a9ea3, 0, 0, 0, g); cyl(0.05, 0.03, 0x9a9ea3, 0, -0.02, 0, g) }
  const B_ESPATULA = (g: THREE.Group) => { cyl(0.008, 0.22, 0x222226, 0, 0, 0, g); box(0.07, 0.07, 0.01, 0x222226, 0, -0.06, 0, g) }
  const idArroz = defineItem('Arroz', B_ARROZ), idFeijao = defineItem('Feijão', B_FEIJAO), idMacarrao = defineItem('Macarrão', B_MACARRAO), idSal = defineItem('Sal', B_SAL), idPimenta = defineItem('Pimenta', B_PIMENTA), idOleo = defineItem('Óleo', B_OLEO)
  const idCarne = defineItem('Carne', B_CARNE), idQueijo = defineItem('Queijo', B_QUEIJO), idPresunto = defineItem('Presunto', B_PRESUNTO), idPao = defineItem('Pão', B_PAO), idMolho = defineItem('Molho de tomate', B_MOLHO), idPano = defineItem('Pano de prato', B_PANO)
  defineItem('Banana', B_BANANA); defineItem('Maçã', B_MACA); defineItem('Laranja', B_LARANJA); defineItem('Tomate', B_TOMATE); defineItem('Cenoura', B_CENOURA); defineItem('Sorvete', B_SORVETE); defineItem('Gelo', B_GELO); defineItem('Concha', B_CONCHA); defineItem('Espátula', B_ESPATULA)
  const idGarfo = defineItem('Garfo', (g) => { cyl(0.006, 0.17, 0xcccccc, 0, 0, 0, g); box(0.04, 0.05, 0.005, 0xcccccc, 0, 0.17, 0, g) })
  const idFaca = defineItem('Faca', (g) => { cyl(0.008, 0.08, 0x222226, 0, 0, 0, g); box(0.02, 0.1, 0.004, 0xdddddd, 0, 0.08, 0, g) })
  const idColherS = defineItem('Colher de sopa', (g) => { cyl(0.006, 0.15, 0xcccccc, 0, 0, 0, g); box(0.035, 0.04, 0.008, 0xcccccc, 0, 0.15, 0, g) })
  const idArrozP = defineItem('Arroz soltinho', (g) => { cyl(0.07, 0.03, 0xf4f4f0, 0, 0, 0, g); cyl(0.05, 0.02, 0xfafaf2, 0, 0.03, 0, g) })
  const idFeijaoP = defineItem('Feijão cozido', (g) => { cyl(0.07, 0.03, 0xf4f4f0, 0, 0, 0, g); cyl(0.055, 0.02, 0x5a2e14, 0, 0.03, 0, g) })
  const idBife = defineItem('Bife', (g) => { cyl(0.07, 0.01, 0xf4f4f0, 0, 0, 0, g); box(0.1, 0.02, 0.07, 0x6a3a1e, 0, 0.01, 0, g) })
  const idMacarronada = defineItem('Macarronada', (g) => { cyl(0.07, 0.03, 0xf4f4f0, 0, 0, 0, g); cyl(0.055, 0.02, 0xe8c060, 0, 0.03, 0, g); cyl(0.03, 0.012, 0xc0392b, 0, 0.05, 0, g) })
  const idPaoOvo = defineItem('Pão com ovo', (g) => { box(0.12, 0.03, 0.09, 0xc98a3a, 0, 0, 0, g); cyl(0.035, 0.01, 0xf8f4e8, 0, 0.03, 0, g); cyl(0.014, 0.014, 0xf0b020, 0, 0.04, 0, g) })
  const idSanduiche = defineItem('Sanduíche', (g) => { box(0.12, 0.02, 0.09, 0xc98a3a, 0, 0, 0, g); box(0.11, 0.015, 0.08, 0xf4d03a, 0, 0.02, 0, g); box(0.11, 0.012, 0.08, 0xe88a96, 0, 0.035, 0, g); box(0.12, 0.02, 0.09, 0xdda55a, 0, 0.047, 0, g) })
  const idVitamina = defineItem('Vitamina de manga', (g) => { cyl(0.04, 0.1, 0xf5c542, 0, 0, 0, g); cyl(0.004, 0.06, 0xc0182c, 0.01, 0.06, 0, g) })
  const idCascaOvo = defineItem('Casca de ovo', (g) => { cyl(0.025, 0.02, 0xf4efe0, 0, 0, 0, g) }), idEmbMiojo = defineItem('Embalagem de miojo', (g) => { box(0.12, 0.004, 0.09, 0xe0a020, 0, 0, 0, g) })
  const idEmbMac = defineItem('Embalagem de macarrão', (g) => { box(0.1, 0.004, 0.2, 0xe8c040, 0, 0, 0, g) }), idCascaBanana = defineItem('Casca de banana', (g) => { box(0.14, 0.01, 0.05, 0xd8b830, 0, 0, 0, g) })
  const idMiolo = defineItem('Miolo de maçã', (g) => { cyl(0.012, 0.05, 0xd8c88a, 0, 0, 0, g) }), idCascaLaranja = defineItem('Casca de laranja', (g) => { box(0.08, 0.008, 0.08, 0xf08a20, 0, 0, 0, g) })
  leftovers.banana = idCascaBanana; leftovers.maca = idMiolo; leftovers.laranja = idCascaLaranja
  const TRASH = [idQueimada, idCascaOvo, idEmbMiojo, idEmbMac, idCascaBanana, idMiolo, idCascaLaranja]
  fridge(18.55, 1.5, 1.8, 0xe6e6e6, 'cozinha')                             // geladeira que abre, com Kuat dentro
  const stove = box(0.6, 0.9, 0.6, 0xd0d0d0, 17.9, 0, 5.65)                       // fogão na parede sul (do outro lado da cozinha)
  for (const [bx, bz] of [[17.75, 5.55], [18.05, 5.55], [17.75, 5.78], [18.05, 5.78]]) cyl(0.07, 0.02, 0x111111, bx, 0.9, bz)
  block(18.2, 1.15, 18.9, 1.85, 1.8); block(17.6, 5.35, 18.2, 5.95, 0.9)        // geladeira e fogão
  cabinet(14.85, 0, 1.3, 1.4, 0.9, 0.6, 1, 0xa0522d, ['Café, açúcar e bolacha maizena.', 'Panelas. Muitas panelas.', 'Um pote de farinha e saudade.'])
  cabinet(14.85, 1.5, 1.15, 1.4, 0.7, 0.3, 1, 0xa0522d, ['Copos, só copos.', 'Achou uma garrafa térmica esquecida.'])
  const mesaTop = cyl(0.6, 0.06, 0x8b6b43, 16.5, 0.72, 3.8); cyl(0.07, 0.72, 0x444444, 16.5, 0, 3.8)
  ;([[15.7, 3.8, -Math.PI / 2], [17.3, 3.8, Math.PI / 2], [16.5, 3.0, Math.PI], [16.5, 4.6, 0]] as const).forEach(([cx, cz, yaw]) => { // cadeiras viradas pra mesa
    sitAct(box(0.4, 0.05, 0.4, 0xa0522d, cx, 0.45, cz), [{ x: cx, y: 0.5, z: cz, yaw }], 'Sentar na cadeira'); box(0.04, 0.45, 0.04, 0x444444, cx, 0, cz)
  })
  cyl(0.08, 0.14, 0xf1c40f, 16.5, 0.78, 3.8) // fruteira/vaso
  block(15.8, 3.1, 17.2, 4.5, 0.77)


  // ---------- COZINHA VIVA: despensa, pia com louça, fogão que cozinha, micro-ondas, cafeteira, filtro e mesa posta ----------
  // armários: panelas e louça embaixo, mantimentos em cima (só aparecem com as portas abertas)
  const SHL = 0.48, SHU = 1.88
  thing(14.35, SHL, 1.48, 'Pegar a panela', ['Panela de pressão sem a válvula. Clássico.', 'Panela com o fundo preto de tanta história.'], (g) => { cyl(0.1, 0.1, 0x9a9ea3, 0, 0, 0, g); box(0.15, 0.015, 0.03, 0x222222, 0.16, 0.07, 0, g) }, false)
  thing(14.72, SHL, 1.48, 'Pegar a frigideira', ['Frigideira antiaderente que já aderiu.', 'Frigideira pesada. Dá pra se defender com ela.'], (g) => { cyl(0.11, 0.03, 0x222226, 0, 0, 0, g); box(0.2, 0.015, 0.03, 0x222222, 0.2, 0.02, 0, g) }, false)
  thing(15.05, SHL, 1.48, 'Pegar um prato', ['Prato de cerâmica com uma lasquinha.', 'Prato fundo. Serve pra tudo, inclusive pizza.'], plateB, false)
  thing(15.32, SHL, 1.48, 'Pegar a colher de pau', ['Colher de pau: também serve de arma contra o Smoll.', 'Colher de pau da vó. Intocável.'], (g) => { box(0.025, 0.02, 0.22, 0xb98a4e, 0, 0, 0, g); box(0.05, 0.02, 0.06, 0xb98a4e, 0, 0, 0.13, g) }, false)
  thing(14.4, SHU, 1.26, 'Pegar o miojo', ['Miojo sabor galinha caipira. A dieta do dev.', 'O último pacote. Pensa bem antes de pegar.'], (g) => { box(0.12, 0.03, 0.09, 0xe0a020, 0, 0, 0, g); box(0.1, 0.005, 0.07, 0xc0182c, 0, 0.03, 0, g) }, false)
  thing(14.72, SHU, 1.26, 'Pegar o pó de café', ['Pó de café já pela metade. Smoll toma 6 xícaras por dia.', 'Café forte. Dá pra acordar defunto.'], (g) => { box(0.08, 0.14, 0.05, 0x6a3a1e, 0, 0, 0, g); box(0.07, 0.04, 0.052, 0xd4af37, 0, 0.08, 0, g) }, false)
  thing(15.02, SHU, 1.26, 'Pegar o flocão de milho', ['Flocão de milho. Cuscuz de domingo.', 'Flocão: com ovo vira café da manhã de campeão.'], (g) => { box(0.1, 0.16, 0.05, 0xf0c020, 0, 0, 0, g) }, false)
  thing(15.32, SHU, 1.26, 'Pegar um copo', ['Copo americano, o melhor copo.', 'Copo de requeijão. Todo brasileiro tem.'], (g) => { cyl(0.035, 0.09, 0xcfe8f5, 0, 0, 0, g) }, false)

  // compartimento de baixo do armário aéreo: arroz, feijão, macarrão e temperos (sal, óleo e pimenta não gastam: ficam na mochila)
  const SHM = 1.53
  thing(14.4, SHM, 1.26, 'Pegar o arroz', ['Arroz agulhinha. Base de toda refeição séria.', 'Pacote de 5 kg que dura um mês.'], B_ARROZ, false)
  thing(14.72, SHM, 1.26, 'Pegar o feijão', ['Feijão carioca. Sem ele não é almoço.', 'Feijão de molho desde ontem. Ótimo.'], B_FEIJAO, false)
  thing(15.02, SHM, 1.26, 'Pegar o macarrão', ['Espaguete. Dobra no meio, porque a panela é pequena.', 'Macarrão: a segunda dieta do dev.'], B_MACARRAO, false)
  thing(15.32, SHM, 1.26, 'Pegar o sal', ['Sal grosso. Pitada de cozinheiro é a mão toda.', 'Sal. Serve pra tudo, até pra superstição.'], B_SAL, false)
  thing(14.4, SHM, 1.1, 'Pegar o óleo', ['Óleo de soja. Pra fritar e pra lubrificar a dobradiça.', 'Garrafa de óleo quase no fim.'], B_OLEO, false)
  thing(14.72, SHM, 1.1, 'Pegar a pimenta', ['Pimenta-do-reino moída. Espirra garantido.', 'Pimenta. Pouca, que o Smoll não aguenta.'], B_PIMENTA, false)

  // suporte de utensílios na parede norte (acima da bancada): concha, espátula e o pano de prato
  box(1.5, 0.025, 0.03, 0x888888, 16.5, 1.52, 1.04)
  thing(15.85, 1.26, 1.07, 'Pegar a concha', ['Concha de feijão. Também serve de colher de sopa gigante.', 'Concha pendurada no ganchinho.'], B_CONCHA, false)
  thing(16.35, 1.28, 1.07, 'Pegar a espátula', ['Espátula antiaderente. A frigideira agradece.', 'Espátula de silicone, já meio derretida.'], B_ESPATULA, false)
  thing(17.05, 1.26, 1.07, 'Pegar o pano de prato', ['Pano de prato úmido. Serve pra tudo, menos pra pratos.', 'Pano de prato xadrez. A mãe do Smoll mandou.'], (g) => { const h = new THREE.Group(); B_PANO(h); h.rotation.x = Math.PI / 2; h.position.y = 0.15; g.add(h) }, false)
  // gaveta de talheres na frente da bancada: abre uma lista, dá pra guardar de volta com o item na mão
  const talheres = [{ id: idGarfo, n: 4 }, { id: idFaca, n: 4 }, { id: idColherS, n: 4 }]
  const gaveta = box(0.5, 0.12, 0.02, 0xd9d0bc, 17.1, 0.62, 1.61); box(0.14, 0.02, 0.03, 0x888888, 17.1, 0.7, 1.63)
  act(gaveta, 'Abrir a gaveta de talheres', () => { clink(); openChest('🍴 Gaveta de talheres', talheres) }, (id) => {
    const s = talheres.find((x) => x.id === id); if (!s) { toast('Na gaveta só vão talheres.'); return true }
    s.n++; clink(); toast('Guardou na gaveta.'); return 'consume'
  })

  // bancada leste (entre a geladeira e o fogão): porta-copos, fruteira, cesta de pão, tábua, liquidificador e forninho elétrico
  box(0.6, 0.86, 3.2, 0xe9e4d8, 18.7, 0, 4.35); box(0.62, 0.04, 3.22, 0x6b6b6b, 18.7, 0.86, 4.35); block(18.4, 2.75, 19, 5.95, 0.9)
  cyl(0.07, 0.01, 0x888888, 18.7, 0.9, 3.0); cyl(0.01, 0.2, 0x888888, 18.7, 0.9, 3.0)                       // porta-copos
  for (const [cx, cz] of [[18.58, 2.92], [18.82, 2.92], [18.7, 3.12]]) thing(cx, 0.9, cz, 'Pegar um copo', ['Copo americano do porta-copos.', 'Copo limpo. Raridade.'], (g) => { cyl(0.035, 0.09, 0xcfe8f5, 0, 0, 0, g) }, false)
  cyl(0.17, 0.05, 0x7a4a2a, 18.7, 0.9, 3.55)                                                                 // fruteira
  thing(18.64, 0.95, 3.5, 'Pegar uma banana', ['Banana madura. Cuidado com a casca no chão.', 'Banana prata. A melhor.'], B_BANANA, false)
  thing(18.78, 0.95, 3.5, 'Pegar uma maçã', ['Maçã vermelha. Uma por dia afasta o médico.', 'Maçã argentina. Importada, chique.'], B_MACA, false)
  thing(18.7, 0.95, 3.63, 'Pegar uma laranja', ['Laranja-pera. Suculenta.', 'Laranja doce. Vira suco fácil.'], B_LARANJA, false)
  thing(18.64, 0.95, 3.63, 'Pegar uma manga', ['Manga do quintal. Sem fio, com sorte.', 'Manga rosa madurinha.'], (g) => ball2(g, 0.05, 0xf0a020, 0, 1), false)
  box(0.34, 0.12, 0.3, 0xb98a4e, 18.7, 0.9, 4.0); box(0.3, 0.02, 0.26, 0xe8dcc0, 18.7, 1.02, 4.0)           // cesta de pão
  thing(18.7, 1.04, 4.0, 'Pegar um pão', ['Pão francês de ontem. Crocante, tipo bolacha.', 'Pãozinho quentinho. Mentira, é de ontem.'], B_PAO, false)
  const tabua = box(0.32, 0.025, 0.28, 0xc9a56a, 18.7, 0.9, 4.45)                                           // tábua de corte: monta sanduíche
  const liquid = cyl(0.07, 0.04, 0x222222, 18.7, 0.9, 4.85); cyl(0.065, 0.24, 0xcfe8f5, 18.7, 0.94, 4.85); cyl(0.07, 0.02, 0x222222, 18.7, 1.18, 4.85) // liquidificador
  const forno = box(0.4, 0.26, 0.5, 0x2a2a2e, 18.68, 0.9, 5.45); box(0.01, 0.16, 0.38, 0x8a9aa8, 18.47, 0.95, 5.45); for (let i = 0; i < 2; i++) cyl(0.02, 0.02, 0xaaaaaa, 18.47, 1.0 + i * 0.07, 5.74).rotation.z = Math.PI / 2 // forninho elétrico
  act(forno, 'Usar o forninho elétrico', () => toast(pick(['Forninho a 200°. Cheiro de pão na casa toda.', 'Forninho: o micro-ondas dos chiques.'])), (id, kind) => {
    if (kind === 'food') { toast(`Esquentou ${ITEMS[id].name} no forninho. Ficou crocante. 🔥`); return true }
    toast('Isso não vai no forninho.'); return true
  })
  // relógio de parede (hora do jogo)
  const clockCv = document.createElement('canvas'); clockCv.width = clockCv.height = 128
  const clockTex = new THREE.CanvasTexture(clockCv); clockTex.colorSpace = THREE.SRGBColorSpace
  let clockT = 0
  const drawClock = () => {
    const g = clockCv.getContext('2d')!, h = gameHour(), hh = Math.floor(h), mm = Math.floor((h % 1) * 60)
    g.fillStyle = '#f4f4f0'; g.beginPath(); g.arc(64, 64, 62, 0, 7); g.fill(); g.lineWidth = 6; g.strokeStyle = '#222'; g.stroke()
    g.lineCap = 'round'; g.strokeStyle = '#222'
    for (const [len, w, a] of [[34, 6, ((hh % 12) + mm / 60) / 12], [50, 4, mm / 60]]) { g.lineWidth = w; g.beginPath(); g.moveTo(64, 64); g.lineTo(64 + Math.sin(a * 6.2832) * len, 64 - Math.cos(a * 6.2832) * len); g.stroke() }
    clockTex.needsUpdate = true
  }
  drawClock()
  ticks.push((dt) => { if ((clockT += dt) > 5) { clockT = 0; drawClock() } })
  const relogio = wallPlane(0.32, 0.32, clockTex, 18.97, 1.95, 4.2, -Math.PI / 2)
  act(relogio, 'Ver as horas', () => { const h = gameHour(); toast(`São ${String(Math.floor(h)).padStart(2, '0')}:${String(Math.floor((h % 1) * 60)).padStart(2, '0')}. O relógio da cozinha adianta 5 min, jura.`) })
  // lixeira (canto sudoeste): casca, embalagem e comida queimada de verdade; a tampa abre quando joga
  let lixo = 0, lidT = 0
  const lixeira = cyl(0.15, 0.5, 0x5a6068, 14.45, 0, 5.6)
  const tampa = new THREE.Group(); tampa.position.set(14.45, 0.5, 5.76); scene.add(tampa); cyl(0.16, 0.025, 0x3a3f45, 0, 0, -0.16, tampa)
  ticks.push((dt) => { lidT = Math.max(0, lidT - dt); tampa.rotation.x = lidT > 0 ? 0.9 : 0 })
  for (const o of [lixeira, tampa]) act(o, () => (lixo ? `Esvaziar a lixeira (${lixo} itens)` : 'Lixeira vazia'), () => { if (lixo) { lixo = 0; lidT = 1; toast('Levou o lixo pra fora. Lixeira vazia. 🗑️') } else toast('Nada pra jogar fora. Tá vazia.') }, (id, kind) => {
    if (lixo >= 8) { toast('Lixeira cheia! Esvazia ela primeiro (E).'); return true }
    if (TRASH.includes(id) || kind === 'food' || kind === 'drink') { lixo++; lidT = 1; clink(0.05); toast(`Jogou ${ITEMS[id].name} no lixo. 🗑️`); return 'consume' }
    toast('Isso não é lixo.'); return true
  })
  block(14.28, 5.43, 14.62, 5.77, 0.5)
  // sacola de compras: aparece na mesa quando falta coisa na geladeira (alguém pegou); guardar repõe tudo
  const compra = new THREE.Group(); compra.position.set(16.62, 0.78, 3.62); compra.visible = false; scene.add(compra)
  box(0.16, 0.2, 0.1, 0xe8d8b0, 0, 0, 0, compra); box(0.1, 0.03, 0.11, 0x2e9a3c, 0, 0.2, 0, compra)
  let shopT = 0
  const guardar = () => { const n = fridgeStock.filter((s) => !s.visible).length; fridgeStock.forEach((s) => (s.visible = true)); compra.visible = false; shopT = 0; return n }
  act(compra, 'Guardar a compra na geladeira', () => { guardar(); clink(); toast('Guardou a compra: tudo de volta na geladeira. 🧊') })
  ticks.push((dt) => { if (!compra.visible && fridgeStock.some((s) => !s.visible)) { if ((shopT += dt) > 45) compra.visible = true } else if (!compra.visible) shopT = 0 })
  world.cozinha.guardar = () => toast(guardar() ? 'Smoll guardou a compra na geladeira. 🧊' : 'Smoll abriu a geladeira, nada pra guardar. Fechou de novo.')
  // almoço do Smoll: prato com arroz, feijão e bife + garfo e faca na mesa; depois sobra louça suja
  const lunch = new THREE.Group(); lunch.position.set(16.5, 0.795, 3.42); lunch.visible = false; scene.add(lunch)
  plateB(lunch); cyl(0.04, 0.02, 0xfafaf2, -0.03, 0.015, 0, lunch); cyl(0.035, 0.02, 0x5a2e14, 0.03, 0.015, 0.03, lunch); box(0.07, 0.015, 0.045, 0x6a3a1e, 0.0, 0.015, -0.04, lunch)
  box(0.012, 0.004, 0.16, 0xcccccc, 0.17, 0, 0, lunch); box(0.012, 0.004, 0.16, 0xdddddd, -0.17, 0, 0, lunch)
  world.cozinha.almocar = () => {
    lunch.visible = true; if (clean) { clean--; syncDishes() }
    setTimeout(() => { lunch.visible = false; dirty = Math.min(6, dirty + 1); syncDishes(); clink(0.1); toast('Smoll almoçou e deixou prato, garfo e faca sujos. 🍛') }, 11000)
  }

  // bancada ao longo da parede norte: filtro, cafeteira, pia (com a louça suja), escorredor e micro-ondas
  // móvel em três partes e tampo com um buraco: a cuba (x 16,3–16,8) é funda, de aço, com ralo
  box(0.7, 0.86, 0.6, 0xe9e4d8, 15.95, 0, 1.3); box(0.6, 0.86, 0.6, 0xe9e4d8, 17.1, 0, 1.3); box(0.5, 0.62, 0.6, 0xe9e4d8, 16.55, 0, 1.3)
  for (const [w, d, x, z] of [[0.71, 0.62, 15.955, 1.3], [0.62, 0.62, 17.11, 1.3], [0.5, 0.13, 16.55, 1.545], [0.5, 0.12, 16.55, 1.06]]) box(w, 0.04, d, 0x6b6b6b, x, 0.86, z) // tampo ao redor do buraco
  block(15.6, 1.0, 17.4, 1.6, 0.9)
  box(0.5, 0.02, 0.36, 0x9aa7ad, 16.55, 0.62, 1.3); cyl(0.025, 0.005, 0x222222, 16.55, 0.64, 1.3)           // fundo da cuba e ralo
  box(0.012, 0.28, 0.36, 0x9aa7ad, 16.304, 0.62, 1.3); box(0.012, 0.28, 0.36, 0x9aa7ad, 16.796, 0.62, 1.3); box(0.5, 0.28, 0.012, 0x9aa7ad, 16.55, 0.62, 1.474); box(0.5, 0.28, 0.012, 0x9aa7ad, 16.55, 0.62, 1.126) // paredes da cuba
  box(0.03, 0.25, 0.03, 0x999999, 16.55, 0.9, 1.08); box(0.03, 0.02, 0.2, 0x999999, 16.55, 1.13, 1.18)  // torneira (no tampo de trás)
  const sinkFlow = cyl(0.007, 0.43, 0x7ec8ff, 16.55, 0.7, 1.27); sinkFlow.visible = false
  let dirty = 5, clean = 0, washing = 0
  const dirtyTool = new Set<string>() // panela/frigideira sujas depois de cozinhar (lava na pia com a peça na mão)
  const dirtyPlates = Array.from({ length: 6 }, (_, i) => { const m = cyl(0.1, 0.014, i % 2 ? 0xd8cfb0 : 0xcdbf9c, 16.55 + ((i * 37) % 7 - 3) * 0.012, 0.65 + i * 0.016, 1.3 + ((i * 53) % 5 - 2) * 0.012); return m })
  const rack = new THREE.Group(); rack.position.set(17.05, 0.9, 1.3); scene.add(rack)
  box(0.3, 0.015, 0.2, 0x888888, 0, 0, 0, rack)
  const rackPlates = Array.from({ length: 6 }, (_, i) => box(0.2, 0.2, 0.012, 0xf6f6f2, -0.12 + i * 0.045, 0.02, 0, rack))
  const syncDishes = () => { dirtyPlates.forEach((p, i) => (p.visible = i < dirty)); rackPlates.forEach((p, i) => (p.visible = i < clean)) }; syncDishes()
  const wash = () => {
    if (washing) { toast('Lavando… 🧽'); return }
    if (!dirty) { toast('Não tem louça suja. Milagre!'); return }
    washing = 4; sinkFlow.visible = true; toast('Lavando a louça… 🧽')
  }
  ticks.push((dt) => { if (washing > 0 && (washing -= dt) <= 0) { sinkFlow.visible = false; clean = Math.min(6, clean + dirty); dirty = 0; syncDishes(); toast('Louça lavada! Ficou brilhando. ✨') } })
  const sinkHit = box(0.55, 0.3, 0.4, 0xffffff, 16.55, 0.9, 1.3); (sinkHit.material as THREE.MeshLambertMaterial).transparent = true; (sinkHit.material as THREE.MeshLambertMaterial).opacity = 0; (sinkHit.material as THREE.MeshLambertMaterial).depthWrite = false
  act(sinkHit, () => (dirty ? `Lavar a louça (${dirty} peças sujas)` : 'Pia limpa'), wash, (id) => {
    if (id === idPanela || id === idFrig) { toast(dirtyTool.delete(id) ? `${ITEMS[id].name} lavada. Brilhando. ✨` : `${ITEMS[id].name} já tava limpa.`); clink(); return true }
    if (id === idPrato) { if (dirty) { dirty--; clean = Math.min(6, clean + 1); syncDishes(); clink(); toast('Lavou um prato da pilha e foi pro escorredor. 🧽') } else toast('Não tem prato sujo na pia.'); return true }
    if (id === idPano) { toast('Molhou o pano de prato. Agora tá úmido.'); return true }
    if ([idCopo, idColher, idGarfo, idFaca, idColherS].includes(id)) { clink(); toast(`${ITEMS[id].name} lavado(a). Brilhando. ✨`); return true }
    toast('Isso não é pra lavar.'); return true
  })
  act(rack, () => (clean ? `Pegar um prato limpo (${clean})` : 'Escorredor vazio'), () => { if (clean && giveItem(idPrato)) { clean--; syncDishes(); toast('Pegou um prato limpo. 🍽️') } else toast('Não tem prato limpo. Lava a louça!') })
  // filtro de água
  const filtro = cyl(0.08, 0.3, 0xd8e4ea, 15.72, 0.9, 1.3); cyl(0.09, 0.03, 0x2e86de, 15.72, 1.2, 1.3); cyl(0.012, 0.04, 0x222222, 15.72, 0.93, 1.45).rotation.x = Math.PI / 2
  act(filtro, 'Beber água do filtro', () => toast(pick(['Água gelada do filtro. A melhor da casa.', 'Glub. O filtro tá com mais limo que o normal.'])), (id) => {
    if (id === idCopo) { takeItem(idCopo); giveItem(idAgua); toast('Encheu o copo de água. 💧'); return true }
    toast('O filtro só enche copo.'); return true
  })
  // cafeteira: gasta pó de café, passa em 6 s e dá um café
  const cafeBase = box(0.18, 0.04, 0.18, 0x222222, 16.02, 0.9, 1.3); box(0.18, 0.28, 0.04, 0x222222, 16.02, 0.94, 1.19); box(0.2, 0.04, 0.2, 0x222222, 16.02, 1.18, 1.3)
  const pot = cyl(0.06, 0.16, 0xcfe8f5, 16.02, 0.94, 1.32); const led = new THREE.Mesh(new THREE.SphereGeometry(0.01, 6, 4), bm(0xc02020)); led.position.set(16.1, 0.97, 1.4); scene.add(led)
  const potFill = cyl(0.055, 0.001, 0x3a1f10, 16.02, 0.95, 1.32)
  let brew = 0, coffeeReady = false
  const startBrew = () => { brew = 6; coffeeReady = false; potFill.scale.y = 1; toast('Cafeteira ligada… o cheiro já vem. ☕') }
  ticks.push((dt) => {
    if (brew > 0) { brew -= dt; potFill.scale.y = 1 + (1 - brew / 6) * 120; potFill.position.y = 0.95 + (potFill.scale.y * 0.001) / 2; (led.material as THREE.MeshBasicMaterial).color.set(0xe0a020); if (brew <= 0) { coffeeReady = true; (led.material as THREE.MeshBasicMaterial).color.set(0x30e060); toast('Café pronto! ☕') } }
  })
  act(cafeBase, () => (coffeeReady ? 'Servir o café' : brew > 0 ? 'Cafeteira passando…' : 'Fazer café (gasta pó de café)'), () => {
    if (coffeeReady) { if (giveItem(idCafe)) { coffeeReady = false; potFill.scale.y = 1; (led.material as THREE.MeshBasicMaterial).color.set(0xc02020); toast('Serviu um café fresquinho. ☕') } return }
    if (brew > 0) return
    if (takeItem(idPo)) startBrew(); else toast('Sem pó de café. Procura no armário de cima.')
  })
  // micro-ondas: esquenta comida e bebida
  const micro = box(0.5, 0.3, 0.36, 0xdadada, 14.85, 0.9, 1.3); box(0.3, 0.2, 0.01, 0x15151a, 14.77, 0.95, 1.485); for (let i = 0; i < 3; i++) box(0.03, 0.03, 0.01, 0x888888, 15.0, 1.0 + i * 0.05, 1.485)
  act(micro, 'Usar o micro-ondas', () => toast(pick(['Micro-ondas: 1:00, apitou 3 vezes e ninguém foi tirar.', 'Esquentou o ar. Eficiência zero.'])), (id, kind) => {
    if (kind === 'food' || kind === 'drink') { toast(`Esquentou ${ITEMS[id].name} por 1 min. Tá pelando. 🔥`); return true }
    toast(id === idPrato || id === idCopo ? 'Prato vazio no micro-ondas? Pra quê?' : 'Metal e eletrônicos no micro-ondas dão faísca. Melhor não.'); return true
  })
  // fogão: panela e frigideira ficam nas bocas (E pega, clique com a peça na mão devolve); a comida pronta fica dentro e é só servir
  const flames = [[17.75, 5.55], [18.05, 5.55], [17.75, 5.78], [18.05, 5.78]].map(([fx, fz]) => { const f = new THREE.Mesh(new THREE.ConeGeometry(0.05, 0.1, 8), bm(0xff8a20)); f.position.set(fx, 0.93, fz); f.visible = false; scene.add(f); return f })
  let cooking = 0, ft = 0
  ticks.push((dt) => { if (cooking > 0) { cooking -= dt; ft += dt; flames.forEach((f, i) => { f.visible = true; f.scale.y = 0.8 + Math.sin(ft * 20 + i) * 0.3 }) } else flames.forEach((f) => (f.visible = false)) })
  type Pan = { g: THREE.Group; on: boolean; ready: string; food: THREE.Mesh }
  const pans: Record<string, Pan> = {}
  const mkPan = (id: string, x: number, z: number, rot: number, nome: string, top: number) => {
    const g = new THREE.Group(); g.position.set(x, 0.92, z); g.rotation.y = rot; scene.add(g); ITEMS[id].build!(g)
    const p: Pan = { g, on: true, ready: '', food: cyl(0.075, 0.02, 0xf2d06a, 0, top, 0, g) }; p.food.visible = false; pans[id] = p
    act(g, () => (p.ready ? `Servir ${ITEMS[p.ready].name}` : `Pegar ${nome}${dirtyTool.has(id) ? ' (suja)' : ''}`), () => {
      if (p.ready) { if (giveItem(p.ready)) { toast(`Serviu ${ITEMS[p.ready].name}. 🍽️`); p.ready = ''; p.food.visible = false } return }
      if (cooking > 0) { toast('Tá fervendo! Espera acabar de cozinhar.'); return }
      if (giveItem(id)) { p.on = false; g.visible = false; clink(); toast(`Pegou ${nome}${dirtyTool.has(id) ? '. Tá suja, hein.' : '.'} Clica no fogão com ela na mão pra devolver.`) }
    })
  }
  mkPan(idPanela, 17.75, 5.55, Math.PI, 'a panela', 0.1); mkPan(idFrig, 18.05, 5.55, 0, 'a frigideira', 0.03)
  type Recipe = { name: string; need: string[]; cond?: string[]; tool?: string; out: string; msg: string; col: number; trash?: string[] } // cond = temperos (não gastam); sem tool = bancada
  const RECIPES: Recipe[] = [
    { name: '🍳 Ovo frito', need: [idOvo], tool: idFrig, out: idOvoFrito, msg: 'Ovo frito perfeito. A gema ficou mole.', col: 0xf8f4e8, trash: [idCascaOvo] },
    { name: '🍜 Miojo', need: [idMiojo], tool: idPanela, out: idMiojoPronto, msg: 'Miojo pronto. Só que de verdade, em 3 minutos.', col: 0xe8c060, trash: [idEmbMiojo] },
    { name: '🌽 Cuscuz com ovo', need: [idFlocao, idOvo], tool: idPanela, out: idCuscuz, msg: 'Cuscuz com ovo. Café da manhã de campeão.', col: 0xf2d06a, trash: [idCascaOvo] },
    { name: '☕ Café na panela', need: [idPo], tool: idPanela, out: idCafe, msg: 'Café coado na panela. O cheiro invade a casa.', col: 0x3a1f10 },
    { name: '🍚 Arroz', need: [idArroz], cond: [idSal, idOleo], tool: idPanela, out: idArrozP, msg: 'Arroz soltinho, cada grão no seu lugar.', col: 0xfafaf2 },
    { name: '🫘 Feijão', need: [idFeijao], cond: [idSal], tool: idPanela, out: idFeijaoP, msg: 'Feijão cozido com caldo grosso. Cheiro de domingo.', col: 0x5a2e14 },
    { name: '🥩 Bife', need: [idCarne], cond: [idSal, idPimenta], tool: idFrig, out: idBife, msg: 'Bife no ponto. Chiou bonito.', col: 0x6a3a1e },
    { name: '🍝 Macarronada', need: [idMacarrao, idMolho], cond: [idSal], tool: idPanela, out: idMacarronada, msg: 'Macarronada com molho. Faltou só o queijo ralado.', col: 0xe8c060, trash: [idEmbMac] },
    { name: '🥪 Pão com ovo', need: [idPao, idOvo], tool: idFrig, out: idPaoOvo, msg: 'Pão com ovo na frigideira. Clássico de madrugada.', col: 0xc98a3a, trash: [idCascaOvo] },
  ]
  const SANDUBA: Recipe = { name: 'Sanduíche', need: [idPao, idQueijo, idPresunto], out: idSanduiche, msg: 'Sanduíche de queijo e presunto montado. Caprichou.', col: 0 }
  const VITAMINA: Recipe = { name: 'Vitamina de manga', need: ['manga', idLeite], out: idVitamina, msg: 'Vitamina de manga batida no liquidificador. Barulho infernal, resultado ótimo.', col: 0 }
  const hasTool = (id?: string) => !id || pans[id].on || invCount(id) > 0
  const missing = (r: Recipe) => [...(hasTool(r.tool) ? [] : [r.tool!]), ...[...r.need, ...(r.cond ?? [])].filter((id) => !invCount(id))].map((id) => ITEMS[id].name)
  const cook = (r: Recipe) => {
    const p = r.tool ? pans[r.tool] : null
    if (p && cooking > 0) { toast('O fogão já tá ocupado.'); return }
    if (p?.ready) { toast(`Serve ${ITEMS[p.ready].name} que tá na ${ITEMS[r.tool!].name.toLowerCase()} primeiro.`); return }
    const m = missing(r); if (m.length) { toast(`Faltando: ${m.join(', ')}`); return }
    r.need.forEach((id) => takeItem(id)); r.trash?.forEach((id) => giveItem(id))
    if (!p) { if (giveItem(r.out)) { clink(); toast(r.msg) } return }
    if (!p.on) { takeItem(r.tool!); p.on = true; p.g.visible = true }
    cooking = 4; sizzle(0.1, 4); toast(`Cozinhando ${r.name}… 🔥`); p.food.visible = true; (p.food.material as THREE.MeshLambertMaterial).color.set(r.col)
    setTimeout(() => {
      const burnt = Math.random() < 0.15; dirty = Math.min(6, dirty + 1); syncDishes(); dirtyTool.add(r.tool!)
      if (burnt) { p.ready = idQueimada; (p.food.material as THREE.MeshLambertMaterial).color.set(0x1a1410); toast('Queimou! Fumaça pra tudo que é lado. Smoll: "NÃO É MEU!" 🔥') } else { p.ready = r.out; toast(`${r.msg} (E na panela pra servir)`) }
    }, 4000)
  }
  const nomes = (r: Recipe) => [...(r.tool ? [r.tool] : []), ...r.need, ...(r.cond ?? [])].map((id) => `${invCount(id) || pans[id]?.on ? '' : '<s>'}${ITEMS[id].name}${invCount(id) || pans[id]?.on ? '' : '</s>'}`).join(' + ')
  act(stove, 'Usar o fogão', () => openPanel('🍳 Fogão', () => RECIPES.map((r) => `${missing(r).length ? '❌' : '✅'} <b>${r.name}</b> — ${nomes(r)}`).join('<br>') + '<br><br><i>Panela e frigideira ficam no fogão e não gastam; sal, óleo e pimenta também não. A comida pronta fica na panela: E nela pra servir.</i>',
    RECIPES.map((r) => ({ t: r.name, fn: () => cook(r) }))), (id) => { // devolver panela/frigideira
    const p = pans[id]; if (!p) return
    if (p.on) { toast('Já tem uma dessas no fogão.'); return true }
    p.on = true; p.g.visible = true; clink(); toast(`${ITEMS[id].name} de volta no fogão.`); return 'consume'
  })
  act(tabua, () => `Montar sanduíche (${nomes(SANDUBA)})`, () => cook(SANDUBA))
  act(liquid, () => `Bater vitamina de manga (${nomes(VITAMINA)})`, () => cook(VITAMINA))
  world.cozinha.cozinhar = () => { cooking = 4; sizzle(0.1, 4); dirty = Math.min(6, dirty + 1); dirtyTool.add(idPanela); syncDishes(); toast('Smoll botou um miojo no fogo e já tá fuçando no celular. 🍜') }
  world.cozinha.louca = () => wash()
  world.cozinha.cafe = () => { if (!brew && !coffeeReady) { startBrew() } setTimeout(() => { toast('Smoll tomou o café inteiro. ☕'); coffeeReady = false; potFill.scale.y = 1; (led.material as THREE.MeshBasicMaterial).color.set(0xc02020) }, 7000) }
  // mesa posta: pratos e copos pegáveis; comer na mesa
  for (const [px, pz] of [[16.12, 3.8], [16.88, 3.8], [16.5, 3.42], [16.5, 4.18]]) thing(px, 0.78, pz, 'Pegar o prato', ['Prato da mesa. Ainda tem farelo da janta.', 'Prato quase limpo. Quase.'], plateB, false)
  for (const [px, pz] of [[16.3, 3.55], [16.78, 4.05]]) thing(px, 0.78, pz, 'Pegar o copo', ['Copo da mesa, cheio de Kuat velha.', 'Copo americano. Todo mundo tem.'], (g) => { cyl(0.035, 0.09, 0xcfe8f5, 0, 0, 0, g) }, false)
  act(mesaTop, 'Sentar e comer na mesa', () => toast('Mesa redonda com 4 cadeiras. O Smoll nunca teve visita pra ocupar.'), (id, kind) => {
    if (id === idPano) { toast('Passou o pano na mesa. Cheirinho de limpeza. 🧼'); return true }
    if (kind === 'food') { toast(`Comeu ${ITEMS[id].name} na mesa, sentado e tudo. Que luxo. 🍽️`); return 'consume' }
    if (kind === 'drink') { toast(`Bebeu ${ITEMS[id].name} na mesa. Saúde!`); return 'consume' }
    toast('Isso não se come.'); return true
  })

  // ---------- VARANDA: rede (x 1–6, z 11–15) ----------
  const rede = tex(64, 64, (g, w, h) => {
    g.fillStyle = '#c0392b'; g.fillRect(0, 0, w, h)
    g.fillStyle = '#f1c40f'; for (let x = 0; x < w; x += 16) g.fillRect(x, 0, 6, h)
    g.fillStyle = '#ffffff'; for (let x = 8; x < w; x += 16) g.fillRect(x, 0, 2, h)
  })
  const rg = new THREE.PlaneGeometry(0.8, 2.4, 2, 16); rg.rotateX(-Math.PI / 2)
  const rp = rg.attributes.position
  for (let i = 0; i < rp.count; i++) { const t = rp.getZ(i) / 1.2; rp.setY(i, 1.25 - 0.55 * (1 - t * t) + Math.abs(rp.getX(i)) * 0.25) } // curva da rede
  rg.computeVertexNormals()
  const redeMesh = new THREE.Mesh(rg, new THREE.MeshBasicMaterial({ map: rede, side: THREE.DoubleSide })); redeMesh.position.set(1.8, 0, 12.8); scene.add(redeMesh)
  sitAct(redeMesh, [{ x: 1.8, y: 0.72, z: 12.8, yaw: -Math.PI / 2 }], 'Deitar na rede')
  cyl(0.05, 1.5, 0x5a3a22, 1.8, 0, 11.45); cyl(0.05, 1.5, 0x5a3a22, 1.8, 0, 14.15)
  block(1.4, 11.6, 2.2, 14.0, 0.7)

  // ---------- QUINTAL (céu aberto, junto da garagem: x 20–28, z 6–16, no máximo do tamanho da casa) ----------
  const ball = (r: number, c: number, x: number, y: number, z: number) => {
    const m = new THREE.Mesh(new THREE.SphereGeometry(r, 10, 8), lm(c)); m.position.set(x, y, z); scene.add(m)
    return m
  }
  const manga = () => { if (giveItem('manga')) toast('Pegou uma manga 🥭') }
  const mangueira = (x: number, z: number, s: number) => {
    cyl(0.2 * s, 1.8 * s, 0x5a3a22, x, 0, z)
    for (const [ox, oy, oz, r] of [[0, 2.5, 0, 1.2], [0.8, 2.2, 0.3, 0.9], [-0.8, 2.3, -0.2, 1.0], [0.2, 3.2, -0.5, 0.8], [-0.3, 2.1, 0.9, 0.8]]) act(ball(r * s, 0x2f6b2f, x + ox * s, oy * s, z + oz * s), 'Pegar manga', manga)
    for (let i = 0; i < 9; i++) act(ball(0.1, 0xf0a020, x + Math.cos(i * 2.4) * 1.2 * s, (1.7 + (i % 3) * 0.4) * s, z + Math.sin(i * 2.4) * 1.2 * s), 'Pegar manga', manga) // mangas
    block(x - 0.3, z - 0.3, x + 0.3, z + 0.3, 3)
  }
  mangueira(25.6, 9.2, 1.2); mangueira(21.3, 14.8, 1)
  // varal (ao lado da garagem): camisas, bermudas, cuecas e sutiãs pendurados com prendedor, sem colisão
  for (const px of [21, 26.5]) cyl(0.04, 2.0, 0x777777, px, 0, 7.4)
  box(5.5, 0.015, 0.015, 0xdddddd, 23.75, 1.95, 7.4)
  const garment = (kind: 'shirt' | 'shorts' | 'briefs' | 'bra', color: string) => tex(128, 128, (g) => {
    const poly = (pts: number[][]) => { g.beginPath(); pts.forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y))); g.closePath(); g.fill(); g.stroke() }
    g.fillStyle = color; g.strokeStyle = 'rgba(0,0,0,0.35)'; g.lineWidth = 3
    if (kind === 'shirt') { poly([[20, 8], [46, 8], [64, 22], [82, 8], [108, 8], [126, 40], [104, 58], [92, 46], [92, 122], [36, 122], [36, 46], [24, 58], [2, 40]]); g.fillStyle = 'rgba(0,0,0,0.18)'; g.beginPath(); g.ellipse(64, 12, 18, 11, 0, 0, Math.PI); g.fill() }
    else if (kind === 'shorts') { poly([[22, 8], [106, 8], [118, 104], [72, 104], [64, 56], [56, 104], [10, 104]]); g.fillStyle = 'rgba(0,0,0,0.2)'; g.fillRect(22, 8, 84, 12) }
    else if (kind === 'briefs') { poly([[10, 28], [118, 28], [104, 76], [78, 108], [50, 108], [24, 76]]); g.fillStyle = 'rgba(0,0,0,0.2)'; g.fillRect(10, 28, 108, 10) }
    else { // sutiã: duas conchas, faixa e alças
      g.lineWidth = 4; g.strokeStyle = color; g.beginPath(); g.moveTo(34, 62); g.lineTo(46, 12); g.moveTo(94, 62); g.lineTo(82, 12); g.stroke()
      g.strokeStyle = 'rgba(0,0,0,0.35)'; g.lineWidth = 3
      for (const cx of [38, 90]) { g.beginPath(); g.arc(cx, 70, 26, 0, Math.PI); g.closePath(); g.fillStyle = color; g.fill(); g.stroke() }
      g.fillStyle = color; g.fillRect(2, 62, 124, 8); g.strokeRect(2, 62, 124, 8)
    }
  })
  const LINE: ['shirt' | 'shorts' | 'briefs' | 'bra', string, number, number][] = [ // tipo, cor, largura, altura (m)
    ['shirt', '#d64532', 0.45, 0.5], ['briefs', '#f06ea9', 0.3, 0.26], ['shorts', '#2f7fc1', 0.4, 0.46], ['bra', '#f06ea9', 0.36, 0.24], ['briefs', '#222222', 0.3, 0.26], ['shirt', '#e0b21c', 0.45, 0.5],
    ['bra', '#b34de0', 0.36, 0.24], ['briefs', '#c0182c', 0.3, 0.26], ['shorts', '#b7a27a', 0.4, 0.46], ['bra', '#222222', 0.36, 0.24], ['briefs', '#f2f2ee', 0.3, 0.26], ['shirt', '#f2f2ee', 0.45, 0.5], ['bra', '#f2c4dc', 0.36, 0.24],
  ]
  LINE.forEach(([kind, color, w, h], i) => {
    const pivot = new THREE.Group(); pivot.position.set(21.4 + i * 0.4, 1.94, 7.4); scene.add(pivot)       // gira em torno da linha
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ map: garment(kind, color), transparent: true, alphaTest: 0.4, side: THREE.DoubleSide }))
    m.position.y = -h / 2 - 0.02; pivot.add(m)
    for (const dx of [-w * 0.3, w * 0.3]) box(0.03, 0.07, 0.03, 0xc8a165, dx, -0.06, 0.012, pivot)             // prendedores
    swing.push({ pivot, phase: i * 1.7 })
  })
  // tanque de lavar roupa + torneira (junto do muro leste)
  const tanque = box(0.6, 0.85, 0.9, 0xbfc4c8, 27.45, 0, 15.2); box(0.4, 0.05, 0.7, 0x4a5a63, 27.45, 0.8, 15.2) // tanque: lava roupa no bloco "QUINTAL VIVO"
  cyl(0.02, 0.3, 0xcccccc, 27.2, 1.0, 15.2)
  block(27.1, 14.75, 27.8, 15.65, 0.85)
  // churrasqueira (muro sul)
  box(1.1, 0.9, 0.55, 0xa0522d, 26.2, 0, 15.65); const coal = box(0.95, 0.04, 0.4, 0x222222, 26.2, 0.9, 15.65)
  const fire = light(0xff6a20, 0, 5, 26.2, 1.3, 15.3)
  box(0.25, 1.4, 0.25, 0xa0522d, 26.2, 0, 15.85)
  block(25.6, 15.3, 26.8, 15.95, 0.9)
  // mesa e cadeiras de plástico
  cyl(0.55, 0.05, 0xffffff, 24.3, 0.72, 13.6); cyl(0.05, 0.72, 0xdddddd, 24.3, 0, 13.6)
  for (const [cx, cz] of [[23.5, 13.6], [25.1, 13.6], [24.3, 12.8]]) { box(0.42, 0.04, 0.42, 0xffffff, cx, 0.45, cz); box(0.04, 0.45, 0.04, 0xdddddd, cx, 0, cz) }
  block(23.1, 12.5, 25.5, 14.7, 0.77)
  // horta (canteiros com terra vermelha)
  for (const hx of [22.4, 23.7]) box(1.0, 0.25, 0.6, 0x7a3b22, hx, 0, 15.6) // as plantas ficam no bloco "QUINTAL VIVO"
  block(21.8, 15.2, 24.2, 16, 0.3)
  // caixa d'água
  cyl(0.6, 1.2, 0x1e6fb8, 26.8, 0, 9.0); block(26.2, 8.4, 27.4, 9.6, 1.2)
  // muro de fundos do vizinho (as janelas dos fundos da casa dão pra ele)
  box(30, 2.2, 0.3, 0xd8cdb8, 5.5, 0, 17.2)

  // ---------- PORTA DA FRENTE (célula 19,8) ----------
  const door = new THREE.Group(); door.position.set(19.5, 0, 8.03); scene.add(door)
  const dm = box(0.06, 2.1, 0.94, 0x6b3a1e, 0, 0, 0.47, door)
  box(0.05, 0.05, 0.05, 0xc9b037, -0.05, 1.0, 0.85, door)
  act(dm, () => (state.doorOpen ? 'Fechar porta' : 'Abrir porta'), () => (state.doorOpen = !state.doorOpen))

  // ---------- BAIRRO (planta em bairro.ts, a partir da foto de satélite): ruas, casas dos vizinhos, escola, postes ----------
  const ASPH = 0x8d8c86, WALK = 0xb8b8b0, CURB = 0xc9c6bc
  // trecho de rua: asfalto de 6 m com calçadas de 2 m (as calçadas ficam mais baixas, o asfalto cobre os cruzamentos)
  const rua = (axis: 'z' | 'x', c: number, a: number, b: number) => {
    const L = b - a, m = (a + b) / 2
    if (axis === 'z') { box(6, 0.01, L, ASPH, c, -0.012, m); box(2, 0.01, L, WALK, c - 4, -0.016, m); box(2, 0.01, L, WALK, c + 4, -0.016, m) }
    else { box(L, 0.01, 6, ASPH, m, -0.012, c); box(L, 0.01, 2, WALK, m, -0.016, c - 4); box(L, 0.01, 2, WALK, m, -0.016, c + 4) }
  }
  const curbs = (axis: 'z' | 'x', off: number, from: number, to: number, cuts: [number, number][]) => { // meio-fio, interrompido nos cruzamentos
    const seg = (a: number, b: number) => { if (b > a) axis === 'z' ? box(0.2, 0.1, b - a, CURB, off, 0, (a + b) / 2) : box(b - a, 0.1, 0.2, CURB, (a + b) / 2, 0, off) }
    let q = from
    for (const [c0, c1] of [...cuts].sort((x, y) => x[0] - y[0])) { seg(q, c0); q = c1 }
    seg(q, to)
  }
  rua('z', UM, WORLD.z0, WORLD.z1); rua('z', MAC, WORLD.z0, WORLD.z1); rua('z', JOIN, PAL - 5, WORLD.z1)
  rua('x', PAL, UM, WORLD.x1); rua('x', BAR, WORLD.x0, WORLD.x1)
  const BARc: [number, number] = [BAR - 5, BAR + 5], PALc: [number, number] = [PAL - 5, PAL + 5]
  const UMc: [number, number] = [UM - 5, UM + 5], MACc: [number, number] = [MAC - 5, MAC + 5], JOINc: [number, number] = [JOIN - 5, JOIN + 5]
  curbs('z', UM - 3.1, WORLD.z0, WORLD.z1, [BARc]); curbs('z', UM + 3.1, WORLD.z0, WORLD.z1, [PALc, BARc])
  curbs('z', MAC - 3.1, WORLD.z0, WORLD.z1, [BARc]); curbs('z', MAC + 3.1, WORLD.z0, WORLD.z1, [BARc])
  curbs('z', JOIN - 3.1, PAL + 5, WORLD.z1, [BARc]); curbs('z', JOIN + 3.1, PAL + 5, WORLD.z1, [BARc])
  curbs('x', PAL - 3.1, UM + 5, WORLD.x1, []); curbs('x', PAL + 3.1, UM + 5, WORLD.x1, [JOINc])
  curbs('x', BAR - 3.1, WORLD.x0, WORLD.x1, [MACc, UMc, JOINc]); curbs('x', BAR + 3.1, WORLD.x0, WORLD.x1, [MACc, UMc, JOINc])
  const poste = (x: number, z: number, dir: number) => { // poste de luz com braço pra rua
    cyl(0.07, 5, 0x666666, x, 0, z); box(0.9, 0.06, 0.06, 0x666666, x + dir * 0.4, 4.9, z)
    const l = new THREE.Mesh(new THREE.SphereGeometry(0.13), bm(0xfff2c0)); l.position.set(x + dir * 0.8, 4.85, z); scene.add(l)
    block(x - 0.1, z - 0.1, x + 0.1, z + 0.1, 5)
  }
  for (let z = WORLD.z0 + 10; z < WORLD.z1 - 10; z += 26) { if (Math.abs(z - BAR) > 8) poste(30.4, z, 1); if (Math.abs(z + 13 - BAR) > 8 && Math.abs(z + 13 - PAL) > 8) poste(37.6, z + 13, -1) }
  const park = (c: number, x: number, z: number, rot: number) => { const k = makeCar(c); k.position.set(x, 0, z); k.rotation.y = rot; scene.add(k); const n0 = blockers.length; block(x - 0.65, z - 1.5, x + 0.65, z + 1.5, 0.56); block(x - 0.55, z - 0.8, x + 0.55, z + 0.8, 0.9); regVeh(k, 'car', n0, [0.15, 0.68, -0.28], 2.95, 1.3, 0.56) }
  park(0x2a5db0, 32.3, 15, Math.PI / 2); park(0xdddddd, 36, 6, -Math.PI / 2); park(0xb8b8b8, 36, 52, -Math.PI / 2); park(0x8a3b1f, 32.3, 70, Math.PI / 2)
  // nome da rua pintado no asfalto
  const roadText = tex(512, 128, (g, w, h) => { g.fillStyle = 'rgba(240,240,236,0.85)'; g.font = 'bold 88px sans-serif'; g.textAlign = 'center'; g.fillText(PLACE.street.replace('Rua ', 'R. '), w / 2, 98) })
  for (const rz of [11, -60, 90, 170]) {
    const rt = new THREE.Group(); rt.position.set(UM, 0.012, rz); rt.rotation.y = Math.PI / 2; scene.add(rt)
    const rtm = new THREE.Mesh(new THREE.PlaneGeometry(6, 1.5), new THREE.MeshBasicMaterial({ map: roadText, transparent: true, depthWrite: false })); rtm.rotation.x = -Math.PI / 2; rt.add(rtm)
  }
  // placas de rua (um plano pra cada lado, senão o texto sai espelhado) e placa de 20 km/h
  const plate = (px: number, pz: number, text: string, y: number, c: string, sub?: string) => {
    const t = tex(256, 64, (g, w, h) => { g.fillStyle = c; g.fillRect(0, 0, w, h); g.fillStyle = '#fff'; g.textAlign = 'center'; g.font = `bold ${sub ? 28 : 30}px sans-serif`; g.fillText(text, w / 2, sub ? 32 : 42); if (sub) { g.font = '15px sans-serif'; g.fillText(sub, w / 2, 54) } })
    for (const [rot, dz] of [[0, 0.03], [Math.PI, -0.03]]) { const m = new THREE.Mesh(new THREE.PlaneGeometry(1.1, 0.28), new THREE.MeshBasicMaterial({ map: t })); m.position.set(px, y, pz + dz); m.rotation.y = rot; scene.add(m) }
  }
  cyl(0.04, 2.7, 0x666666, 38.6, 0, PAL + 6.2); plate(38.6, PAL + 6.2, PLACE.street, 2.5, '#1e6fb8', PLACE.sector); plate(38.6, PAL + 6.2, PLACE.cross, 2.15, '#2e8b57')   // esquina da Palomas
  cyl(0.04, 2.7, 0x666666, 30.6, 0, BAR - 5.8); plate(30.6, BAR - 5.8, PLACE.street, 2.5, '#1e6fb8', PLACE.sector); plate(30.6, BAR - 5.8, 'R. Barreiras', 2.15, '#2e8b57')  // esquina da Barreiras
  const speed = tex(128, 128, (g, w, h) => { g.fillStyle = '#fff'; g.beginPath(); g.arc(64, 64, 62, 0, 7); g.fill(); g.strokeStyle = '#d02020'; g.lineWidth = 12; g.beginPath(); g.arc(64, 64, 56, 0, 7); g.stroke(); g.fillStyle = '#111'; g.font = 'bold 56px sans-serif'; g.textAlign = 'center'; g.fillText('20', 64, 84) })
  cyl(0.04, 2.4, 0x666666, 29.4, 0, 26)
  for (const [r0, dx] of [[0, -0.03], [Math.PI, 0.03]]) { const sp = new THREE.Mesh(new THREE.CircleGeometry(0.3, 20), new THREE.MeshBasicMaterial({ map: speed, transparent: true })); sp.position.set(29.4 + dx, 2.3, 26); sp.rotation.y = r0 + Math.PI / 2; scene.add(sp) }
  block(29.3, 25.9, 29.5, 26.1)

  // casa de vizinho genérica: frente virada pra +x no espaço local, girada por `rot`; `simple` = só corpo, telhado, muro e portão (casas longe)
  const pastel = [0xf2d7a1, 0xc9e0b3, 0xf0b6a8, 0xb8d4e8, 0xe8e0c8]
  type CasaOpt = { simple?: boolean; solar?: boolean; body?: number; wall?: number; gate?: 'rust' | 'chevron' | 'white' | 'galv'; roof?: number; tank?: boolean; mail?: boolean; meter?: boolean; tree?: boolean }
  const gateMats: Record<string, THREE.Material> = {}
  const gateMat = (k: string) => (gateMats[k] ??= new THREE.MeshBasicMaterial({
    side: THREE.DoubleSide, transparent: k === 'white' || k === 'rust', alphaTest: k === 'white' || k === 'rust' ? 0.5 : 0,
    map: tex(128, 64, (g, w, h) => {
      if (k === 'white') { g.fillStyle = '#eceff1'; for (let x = 2; x < w; x += 12) g.fillRect(x, 0, 4, h); g.fillRect(0, 2, w, 5); g.fillRect(0, h / 2, w, 4); g.fillRect(0, h - 7, w, 5) }
      else if (k === 'rust') { g.fillStyle = '#b5381a'; for (let x = 2; x < w; x += 12) g.fillRect(x, 0, 5, h); g.fillRect(0, 2, w, 6); g.fillRect(0, h - 8, w, 6) }
      else if (k === 'galv') { for (let x = 0; x < w; x += 6) { g.fillStyle = (x / 6) % 2 ? '#a3a7ab' : '#bfc2c6'; g.fillRect(x, 0, 6, h) } }
      else { // chevron: metade de cima escura com ripas em V, metade de baixo madeira enferrujada
        g.fillStyle = '#3a2a22'; g.fillRect(0, 0, w, h / 2); g.strokeStyle = '#c28f5a'; g.lineWidth = 3
        for (let x = 0; x < w; x += 16) { g.beginPath(); g.moveTo(x, h / 2 - 2); g.lineTo(x + 8, 4); g.lineTo(x + 16, h / 2 - 2); g.stroke() }
        g.fillStyle = '#7a4a2a'; g.fillRect(0, h / 2, w, h / 2); g.fillStyle = '#5a3418'; for (let x = 0; x < w; x += 10) g.fillRect(x, h / 2, 2, h / 2)
        g.fillStyle = '#a0522d'; for (let i = 0; i < 40; i++) g.fillRect((Math.abs(Math.sin(i * 12.9)) * w) | 0, h / 2 + ((Math.abs(Math.sin(i * 7.7)) * h) / 2 | 0), 3, 2)
      }
    }),
  }))
  const hipRoof = (g: THREE.Object3D, w: number, d: number, color: number, y0 = 3.2, y1 = 4.5) => {
    const hx = d / 2 + 0.25, hz = w / 2 + 0.25
    const c1 = [-hx, y0, -hz], c2 = [hx, y0, -hz], c3 = [hx, y0, hz], c4 = [-hx, y0, hz]
    const alongX = hx >= hz, r = Math.abs(hx - hz)
    const r1 = alongX ? [-r, y1, 0] : [0, y1, -r], r2 = alongX ? [r, y1, 0] : [0, y1, r]
    const tri = (...v: number[][]) => v.flat()
    const pos = alongX
      ? [...tri(c4, c3, r2, c4, r2, r1), ...tri(c2, c1, r1, c2, r1, r2), ...tri(c1, c4, r1), ...tri(c3, c2, r2)]
      : [...tri(c2, c3, r2, c2, r2, r1), ...tri(c4, c1, r1, c4, r1, r2), ...tri(c1, c2, r1), ...tri(c3, c4, r2)]
    const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); geo.computeVertexNormals()
    const mesh = new THREE.Mesh(geo, roofMats[color] ??= new THREE.MeshLambertMaterial({ color, side: THREE.DoubleSide })); g.add(mesh)
    const sw = Math.abs(Math.sin(g.rotation.y)) > 0.5, ex = sw ? hz : hx, ez = sw ? hx : hz // o telhado vira superfície pisável
    roofRects.push({ x0: g.position.x - ex, x1: g.position.x + ex, z0: g.position.z - ez, z1: g.position.z + ez, y0, y1 })
    return mesh
  }
  // retângulo no mundo de uma caixa local (lx, lz) de meia-largura (hx, hz) num grupo girado de 0, ±90° ou 180°
  const wrect = (x: number, z: number, rot: number, lx: number, lz: number, hx: number, hz: number): [number, number, number, number] => {
    const c = Math.cos(rot), sn = Math.sin(rot), cx = x + lx * c + lz * sn, cz = z - lx * sn + lz * c, sw = Math.abs(sn) > 0.5
    const ex = sw ? hz : hx, ez = sw ? hx : hz
    return [cx - ex, cz - ez, cx + ex, cz + ez]
  }
  const roofMats: Record<number, THREE.Material> = {}
  const casa = (x: number, z: number, w: number, d: number, rot: number, i: number, o: CasaOpt = {}) => {
    const g = new THREE.Group(); g.position.set(x, 0, z); g.rotation.y = rot; scene.add(g); culls.push(g)
    box(d, 3.2, w, o.body ?? pastel[i % 5], 0, 0, 0, g); hipRoof(g, w, d, o.roof ?? [0x55585c, 0x6e7176, 0x4a4d52, 0x5d6065, 0x484b50, 0x6a6d72, 0xb04a28][Math.floor(Math.abs(Math.sin(x * 12.9898 + z * 78.233) * 43758.5453) % 1 * 7)])                       // corpo + telhado de quatro águas
    const wx = d / 2 + 0.7                                                                                         // linha do muro
    box(0.25, 2.0, w + 0.6, o.wall ?? 0xd8cdb8, wx, 0, 0, g)
    block(...wrect(x, z, rot, 0, 0, d / 2, w / 2), 3.2); block(...wrect(x, z, rot, wx, 0, 0.125, (w + 0.6) / 2), 2.0) // casa e muro: sólidos, dá pra subir (muro 2 m → casa 3,2 m → telhado)
    const gp = new THREE.Mesh(new THREE.PlaneGeometry(2.4, 1.7), o.gate ? gateMat(o.gate) : lm(0x4b5a63)); gp.position.set(wx - 0.14, 0.9, w * 0.1); gp.rotation.y = Math.PI / 2; g.add(gp)
    if (Math.abs(Math.sin(x * 3.1 + z * 5.7)) > 0.6) { cyl(0.12, 1.6, 0x5a3a22, -d / 2 - 3, 0, 0.5, g); const cr = new THREE.Mesh(new THREE.SphereGeometry(1.5, 8, 6), lm(0x2f6b2f)); cr.position.set(-d / 2 - 3, 2.6, 0.5); g.add(cr) } // árvore no quintal
    if (o.simple) return                                                                                           // casas longe: sem detalhes
    if (d > w && (o.solar ?? i % 3 === 1)) { const sp = box(Math.min(2.6, d * 0.4), 0.06, 1.2, 0x1b3a73, 0, 3.95, w * 0.17, g); sp.rotation.x = Math.atan(1.3 / (w / 2 + 0.25)) } // placa solar no telhado
    box(0.06, 2.1, 0.95, 0x6b3a1e, d / 2 + 0.01, 0, -w * 0.28, g)                                                   // porta
    for (const dz of [w * 0.12, w * 0.3]) box(0.06, 1.0, 0.9, 0x9fd0e8, d / 2 + 0.01, 1.1, dz, g)                    // janelas da frente
    for (const sx of [-1, 1]) for (const dx of [-d / 4, d / 4]) box(0.9, 1.0, 0.06, 0x9fd0e8, dx, 1.1, sx * (w / 2 + 0.01), g) // janelas laterais
    if (o.mail) box(0.18, 0.25, 0.3, 0xf4f4f0, wx + 0.2, 1.1, -w * 0.32, g)                                          // caixa de correio branca
    if (o.meter) box(0.06, 0.3, 0.22, 0xdddddd, wx + 0.15, 1.4, w * 0.36, g)                                         // caixa do medidor
    if (o.tank) { box(1.2, 1.1, 1.2, 0xcdbb9a, -d / 2 + 1, 3.2, -w * 0.2, g); cyl(0.55, 0.9, 0x2a5db0, -d / 2 + 1, 4.3, -w * 0.2, g) } // caixa d'água azul
    if (o.tree) { // árvore de copa redonda na calçada (casas de frente viradas pra -x)
      const tx = d / 2 + 2.6, tz = w * 0.3
      cyl(0.12, 1.8, 0x5a3a22, tx, 0, tz, g)
      for (const [dx, dy, dz, rr] of [[0, 2.6, 0, 1.2], [0.5, 2.2, 0.4, 0.9], [-0.5, 2.3, -0.3, 0.9]]) { const m = new THREE.Mesh(new THREE.SphereGeometry(rr, 10, 8), lm(0x2f6b2f)); m.position.set(tx + dx, dy, tz + dz); g.add(m) }
      if (rot === Math.PI) block(x - tx - 0.3, z - tz - 0.3, x - tx + 0.3, z - tz + 0.3, 3)
    }
  }
  const PRESETS: CasaOpt[] = [
    { body: 0xf2d7a1, wall: 0xd8cdb8, gate: 'rust' }, { body: 0x8e9aa8, wall: 0xb9ab92, gate: 'white', mail: true }, { body: 0x35c2b5, wall: 0x35c2b5, gate: 'galv' },
    { body: 0xe8e0c8, wall: 0xa5a8a6, gate: 'rust', meter: true }, { body: 0xc9e0b3, wall: 0xd8cdb8, gate: 'white' }, { body: 0xf0b6a8, wall: 0x8a5a5c, gate: 'galv', mail: true },
    { body: 0xb8d4e8, wall: 0xb9ab92, gate: 'chevron' }, { body: 0xc9a97d, wall: 0x3b3836, gate: 'chevron', tank: true }, { body: 0xa98ad1, wall: 0xa5a8a6, gate: 'rust', mail: true, meter: true },
  ]
  const near = (x: number, z: number) => Math.hypot(x - 20, z - 8) < 55 // detalhes (portas, janelas...) só perto da casa; longe, casas simples
  // fileira de casas ao longo de uma rua N–S: lado 'W' (de frente pro leste) ou 'E' (de frente pro oeste), lotes de ~9 m
  const lotsNS = (c: number, side: 'W' | 'E', a: number, b: number, seed: number, skip: (z: number) => boolean = () => false) => {
    for (let z = a, i = 0; z <= b; z += 12, i++) {
      if (skip(z) || Math.abs(z - BAR) < 8) continue
      const d = [14, 18, 12, 16, 20][(i + seed) % 5], w = 8.4 + (((i * 7 + seed) % 3) * 0.8)
      const cx = side === 'W' ? c - 6 - d / 2 : c + 6 + d / 2
      casa(cx, z, w, d, side === 'W' ? 0 : Math.PI, i + seed, { ...PRESETS[(i * 3 + seed) % PRESETS.length], tree: side === 'E' && i % 2 === 0, simple: !near(cx, z), solar: Math.abs(Math.sin(i * 5.3 + seed)) > 0.55 })
    }
  }
  // fileira ao longo de uma rua E–W: side +1 = lado sul (de frente pro norte), −1 = lado norte (de frente pro sul)
  const lotsEW = (c: number, side: 1 | -1, a: number, b: number, seed: number, streets: number[]) => {
    for (let x = a, i = 0; x <= b; x += 12, i++) {
      if (streets.some((st) => Math.abs(x - st) < 8)) continue
      const d = [12, 14, 13][(i + seed) % 3], w = 8.4 + (((i * 5 + seed) % 3) * 0.8), cz = c + side * (6 + d / 2)
      casa(x, cz, w, d, side === 1 ? Math.PI / 2 : -Math.PI / 2, i + seed, { ...PRESETS[(i * 2 + seed) % PRESETS.length], simple: true, solar: Math.abs(Math.sin(i * 4.1 + seed)) > 0.6 })
    }
  }
  // loja de bairro da foto: prédio largo com vitrine, toldo e placa
  const loja = (x: number, z: number, rot: number, w: number, d: number, nome: string, sub: string, cor: string, corTxt = '#fff') => {
    const g = new THREE.Group(); g.position.set(x, 0, z); g.rotation.y = rot; scene.add(g)
    box(d, 3.4, w, 0xe8e2d4, 0, 0, 0, g); hipRoof(g, w, d, 0x5d6065); block(...wrect(x, z, rot, 0, 0, d / 2, w / 2), 3.4)
    const fx = d / 2 + 0.02
    box(0.08, 2.4, w - 2, 0x8fc4dd, fx, 0.2, 0, g)                                          // vitrine de vidro
    box(0.8, 0.12, w - 1, cor === '#1e3a8a' ? 0x1e3a8a : 0xc0392b, fx + 0.4, 2.7, 0, g)     // toldo
    const tp = tex(512, 128, (gc, ww, hh) => { gc.fillStyle = cor; gc.fillRect(0, 0, ww, hh); gc.fillStyle = corTxt; gc.textAlign = 'center'; gc.font = 'bold 54px sans-serif'; gc.fillText(nome, ww / 2, 62); gc.font = '30px sans-serif'; gc.fillText(sub, ww / 2, 104) })
    const pl = new THREE.Mesh(new THREE.PlaneGeometry(Math.min(w - 1, 7), 1.7), new THREE.MeshBasicMaterial({ map: tp })); pl.position.set(fx + 0.06, 3.0, 0); pl.rotation.y = Math.PI / 2; g.add(pl)
    box(0.06, 2.1, 1.1, 0x333333, fx + 0.02, 0, w * 0.32, g)                                // porta
  }
  loja(MAC + 6 + 7.5, 14, Math.PI, 12, 15, 'Moda Exata', 'Loja de Roupa', '#1e3a8a')            // atrás da casa, de frente pra Macaúbas
  loja(MAC + 6 + 7.5, 111, Math.PI, 12, 15, 'LAGO', 'Advocacia e Assessoria Jurídica', '#111827')   // perto da esquina com a Barreiras
  // os vizinhos reais da casa (Street View): lilás com muro cinza ao norte; muro escuro, portão de madeira e caixa d'água azul ao sul
  casa(21, -6, 8, 14, 0, 0, { body: 0xa98ad1, wall: 0xa5a8a6, roof: 0x7a2e24, gate: 'rust', mail: true, meter: true })
  casa(21, 20.4, 5, 14, 0, 4, { body: 0xc9a97d, wall: 0x3b3836, gate: 'chevron', roof: 0x6b3a22, tank: true, meter: true })
  lotsNS(UM, 'W', WORLD.z0, WORLD.z1, 1, (z) => z > -13 && z < 27)                                     // Umuarama, lado da casa
  lotsNS(UM, 'E', WORLD.z0, WORLD.z1, 2, (z) => z < PAL + 8)                                            // Umuarama, do outro lado (a escola ocupa o trecho ao norte da Palomas)
  lotsNS(JOIN, 'W', PAL + 8, WORLD.z1, 3); lotsNS(JOIN, 'E', PAL + 8, WORLD.z1, 4)                      // Joinville (começa na Palomas)
  lotsNS(MAC, 'E', WORLD.z0, WORLD.z1, 5, (z) => Math.abs(z - 14) < 9 || Math.abs(z - 111) < 9)         // Macaúbas, atrás da casa (menos onde ficam as lojas)
  lotsNS(MAC, 'W', WORLD.z0, WORLD.z1, 7)
  lotsEW(BAR, 1, WORLD.x0, WORLD.x1, 1, [UM, MAC, JOIN]); lotsEW(BAR, -1, WORLD.x0, WORLD.x1, 2, [UM, MAC, JOIN])  // Barreiras, dois lados
  lotsEW(PAL, 1, JOIN + 8, WORLD.x1, 4, []); lotsEW(PAL, -1, JOIN + 8, WORLD.x1, 6, [])                // Palomas além da Joinville

  // Centro Municipal de Educação Infantil: do outro lado da Umuarama, ao norte da Palomas; prédios coloridos de telha vermelha
  const escolaTex = tex(512, 128, (g, w, h) => { ['#2a6fc9', '#f08a24', '#f4f1e8', '#2a6fc9', '#f08a24', '#f4f1e8', '#2a6fc9', '#f08a24'].forEach((c, i) => { g.fillStyle = c; g.fillRect(i * 64, 0, 64, h) }) })
  const escolaM = new THREE.MeshLambertMaterial({ map: escolaTex })
  const ala = (cx: number, cz: number, dx: number, dz: number) => { const g = new THREE.Group(); g.position.set(cx, 0, cz); scene.add(g); box(dx, 3.2, dz, escolaM, 0, 0, 0, g); hipRoof(g, dz, dx, 0xb04a28); block(cx - dx / 2, cz - dz / 2, cx + dx / 2, cz + dz / 2, 3.2) }
  ala(50, -66, 18, 64); ala(80, -52, 42, 16)                                                                      // duas alas em L, como na foto (a escola tem ~70 × 75 m)
  const pátio = new THREE.Mesh(new THREE.PlaneGeometry(70, 76), lm(0x6a8f4a)); pátio.rotation.x = -Math.PI / 2; pátio.position.set(75.5, 0.004, -68); scene.add(pátio)
  box(0.25, 1.5, 76, 0xf08a24, 40.4, 0, -68); box(72, 1.5, 0.25, 0xf08a24, 76, 0, -30.8); block(40.27, -106, 40.53, -30, 1.5); block(40, -30.93, 112, -30.67, 1.5)                           // muros baixos (Umuarama e Palomas)
  box(0.1, 2, 3.2, 0x2a6fc9, 40.4, 0, -66)                                                                         // portão de entrada
  for (let wz = -96; wz <= -38; wz += 4) box(0.06, 1.1, 1.4, 0x9fd0e8, 40.97, 1.1, wz)                              // janelas
  const escolaPlaca = tex(512, 96, (g, w, h) => { g.fillStyle = '#f4f1e8'; g.fillRect(0, 0, w, h); g.fillStyle = '#2a6fc9'; g.font = 'bold 30px sans-serif'; g.textAlign = 'center'; g.fillText('Centro Municipal de', w / 2, 38); g.fillText('Educação Infantil', w / 2, 76) })
  const placaE = new THREE.Mesh(new THREE.PlaneGeometry(3.4, 0.64), new THREE.MeshBasicMaterial({ map: escolaPlaca })); placaE.position.set(40.45, 2.7, -66); placaE.rotation.y = -Math.PI / 2; scene.add(placaE)
  const quadra = tex(256, 128, (g, w, h) => { g.fillStyle = '#2a5db0'; g.fillRect(0, 0, w, h); g.strokeStyle = '#fff'; g.lineWidth = 4; g.strokeRect(8, 8, w - 16, h - 16); g.beginPath(); g.moveTo(w / 2, 8); g.lineTo(w / 2, h - 8); g.stroke(); g.beginPath(); g.arc(w / 2, h / 2, 22, 0, 7); g.stroke() })
  const qd = new THREE.Mesh(new THREE.PlaneGeometry(16, 8), new THREE.MeshBasicMaterial({ map: quadra })); qd.rotation.x = -Math.PI / 2; qd.position.set(98, 0.008, -40); scene.add(qd)  // quadra
  for (const [tx2, tz2] of [[46, -100], [62, -88], [78, -90], [96, -80], [104, -98], [62, -38], [90, -36], [106, -60]]) { cyl(0.15, 2, 0x5a3a22, tx2, 0, tz2); const cr = new THREE.Mesh(new THREE.SphereGeometry(1.5, 10, 8), lm(0x2f6b2f)); cr.position.set(tx2, 3, tz2); scene.add(cr) }


  // ---------- FRENTE DA CASA (referência: foto do Street View) ----------
  // poste de concreto na calçada com travessa, isoladores e fios atravessando a rua
  const pole = (x: number, z: number) => {
    cyl(0.11, 8, 0xb9b6ad, x, 0, z); box(1.8, 0.1, 0.1, 0x5a3a22, x, 7.3, z); box(0.3, 0.45, 0.25, 0x666666, x + 0.2, 5.2, z)
    for (const dx of [-0.7, 0, 0.7]) cyl(0.03, 0.12, 0xdddddd, x + dx, 7.4, z)
    block(x - 0.15, z - 0.15, x + 0.15, z + 0.15)
  }
  const wire = (ax: number, az: number, bx: number, bz: number, y = 7.5, sag = 0.5) => {
    const pts: THREE.Vector3[] = []
    for (let i = 0; i <= 14; i++) { const t = i / 14; pts.push(new THREE.Vector3(ax + (bx - ax) * t, y - sag * 4 * t * (1 - t), az + (bz - az) * t)) }
    scene.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), new THREE.LineBasicMaterial({ color: 0x1a1a1a })))
  }
  const zs: number[] = []
  for (let z = 9 - 13 * 9; z <= WORLD.z1 - 6; z += 13) if (z < BAR - 6 || z > BAR + 6) zs.push(z)
  for (const z of zs) pole(30.2, z)
  const east = zs.filter((_, i) => i % 2 === 0)
  for (const z of east) pole(38.4, z)
  for (let i = 0; i < zs.length - 1; i++) if (Math.abs(zs[i + 1] - zs[i]) < 14) for (const dx of [-0.7, 0, 0.7]) wire(30.2 + dx, zs[i], 30.2 + dx, zs[i + 1])
  for (let i = 0; i < east.length - 1; i++) if (Math.abs(east[i + 1] - east[i]) < 27) for (const dx of [-0.7, 0, 0.7]) wire(38.4 + dx, east[i], 38.4 + dx, east[i + 1])
  for (const z of east) for (const dx of [-0.7, 0, 0.7]) wire(30.2 + dx, z, 38.4 + dx, z, 7.4, 0.9) // fios atravessando a rua
  // banquinho de concreto com vaso na frente do muro, montinho de areia na calçada
  sitAct(box(0.5, 0.3, 0.7, 0xaaa9a2, 29.4, 0, 10.6), [{ x: 29.4, y: 0.3, z: 10.9, yaw: -Math.PI / 2 }], 'Sentar no banquinho'); cyl(0.12, 0.2, 0xd9825b, 29.4, 0.3, 10.6); block(29.1, 10.2, 29.7, 11, 0.5)
  const sand = new THREE.Mesh(new THREE.ConeGeometry(1.1, 0.55, 12), lm(0xd2b48c)); sand.position.set(30, 0.27, 18.8); scene.add(sand); block(29.2, 18, 30.8, 19.6, 0.5)
  // telhado de cerâmica em quatro águas com beirada branca e vermelha (a casa fica branca com telha vermelha)
  const [x0, x1, z0, z1] = [-0.6, 20.6, -0.6, 16.6]
  const roofG = new THREE.Group(); roofG.position.set(10, 0, 8); scene.add(roofG)
  roofs.push(hipRoof(roofG, 16.7, 20.7, 0xb04a28, 2.6, 4.3))                                                       // telhado de quatro águas, pisável (a beirada fica na altura das paredes)
  for (const [w, d, x, z] of [[21.2, 0.12, 10, z0], [21.2, 0.12, 10, z1], [0.12, 17.2, x0, 8], [0.12, 17.2, x1, 8]]) {
    roofs.push(box(w, 0.18, d, 0xf4f0e6, x, 2.5, z), box(w, 0.05, d, 0xb04a28, x, 2.45, z))
  }
  roofs.push(box(4, 0.08, 0.2, 0x7a2e14, 10, 4.3, 8))
  roofs.push(box(8.4, 0.14, 5.6, 0xf2efe6, 24.1, 2.6, 3.5), box(8.4, 0.05, 0.12, 0xb04a28, 24.1, 2.74, 6.25)) // laje da garagem
  roofRects.push({ x0: 19.9, z0: 0.7, x1: 28.3, z1: 6.3, y0: 2.74, y1: 2.74 })                                    // e dá pra andar nela

  const oficinaBulb = bulb
  // ---------- VENTILADORES DE TETO ----------
  for (const [fx, fz] of [[10.5, 3.5], [15.5, 13]]) {
    const f = new THREE.Group(); f.position.set(fx, H - 0.25, fz); scene.add(f)
    cyl(0.03, 0.25, 0x333333, 0, 0.0, 0, f)
    cyl(0.12, 0.08, 0xdddddd, 0, -0.08, 0, f)
    for (let i = 0; i < 4; i++) {
      const arm = new THREE.Group(); arm.rotation.y = (i * Math.PI) / 2; f.add(arm)
      box(0.6, 0.015, 0.15, 0x9c7a4d, 0.45, -0.05, 0, arm)
    }
    f.userData.on = true
    act(f, () => (f.userData.on ? 'Desligar ventilador' : 'Ligar ventilador'), () => (f.userData.on = !f.userData.on))
    fans.push(f)
  }

  // ---------- CALÇADA DO SMOLL: campainha, lixeira, cachorro, cadeira, picolé… ----------
  // campainha no muro, ao lado do portão: toca dentro da casa (volume cai com a distância) e o Smoll abre o portão de longe
  const bell = box(0.04, 0.12, 0.08, 0xdddddd, 29.03, 1.25, 6.5); const bellBtn = box(0.03, 0.05, 0.05, 0xe0c030, 29.06, 1.29, 6.5)
  act(bell, 'Tocar a campainha', () => ringBell()); act(bellBtn, 'Tocar a campainha', () => ringBell())
  // quanto mais você toca, mais o Smoll se irrita; no décimo toque ele arranca a campainha da parede (volta em 45 s)
  let rings = 0, lastRing = -1e9, bellOffAt = 0
  const SAY: Record<number, [string, string?]> = {
    1: ['"JÁ VAI!" — o Smoll, sem levantar da cadeira.'], 2: ['"Calma aí, já vou!"'], 3: ['"Tô indo, tô indo…" (não tá)'], 4: ['"QUEM É?! PARA DE TOCAR!"', 'facepalm'],
    5: ['"Se tocar mais uma vez eu…"', 'point'], 6: ['"Eu vou ficar bravo, hein."'], 7: ['"PAROU! Vou chamar a polícia!"', 'shrug'], 8: ['"ISSO É ASSÉDIO DE CAMPAINHA!"', 'facepalm'], 9: ['O Smoll tá a ponto de explodir…'],
  }
  const ringBell = () => {
    const now = performance.now()
    if (bellOffAt > now) { toast('A campainha foi arrancada da parede. Só sobrou o fio.'); return }
    rings = now - lastRing > 40000 ? 1 : rings + 1; lastRing = now
    if (rings === 1) bellLog.unshift({ h: gameHour(), who: pick(['Entregador do iFood', 'Vizinho pedindo açúcar', 'Testemunha de Jeová', 'Moleque do tereré', 'Cobrador (de novo)', 'Carteiro com um pacote', 'Alguém com cara de pegadinha']), n: 1 }); else if (bellLog[0]) bellLog[0].n = rings
    bellLog.length = Math.min(bellLog.length, 6)
    chime(Math.max(0.03, Math.min(0.35, 0.45 - Math.hypot(playerPos.x - 18, playerPos.z - 8) / 60)))
    const asleep = state.cmd('wave') === false
    if (asleep && rings < 4) { toast(`Ding-dong! 🔔 Ninguém atende (o Smoll tá dormindo). [${rings}]`); return }
    if (asleep && rings === 4) { state.cmd('wake'); toast('O Smoll acordou com cara de poucos amigos. 😠') ; return }
    if (rings >= 10) {
      bellOffAt = now + 45000; bell.visible = bellBtn.visible = false
      toast('Smoll: ENTRA LOGO E SOME! O Smoll arrancou a campainha da parede. 🔔💥'); state.cmd('stand')
      setTimeout(() => { setGate(true); setTimeout(() => setGate(false), 12000) }, 1500)
      setTimeout(() => { bell.visible = bellBtn.visible = true; rings = 0; toast('O Smoll reinstalou a campainha (contra a vontade).') }, 45000); return
    }
    const [line, anim] = SAY[rings] ?? ['"…"']
    toast(`Ding-dong! 🔔 [${rings}]  ${line}`); if (anim) state.cmd(anim)
    if (rings === 1) { setTimeout(() => { setGate(true); toast('O Smoll abriu o portão de longe, pelo controle. 🚪') }, 3800); setTimeout(() => setGate(false), 15000) }
  }
  // lixeira verde com tampa que abre
  const bin = new THREE.Group(); bin.position.set(29.55, 0, 12.5); scene.add(bin)
  cyl(0.27, 0.75, 0x2f7d46, 0, 0, 0, bin)
  const lid = new THREE.Group(); lid.position.set(0.27, 0.75, 0); bin.add(lid); cyl(0.29, 0.05, 0x256338, -0.27, 0, 0, lid)
  block(29.25, 12.2, 29.85, 12.8, 0.8)
  let binOpen = false, binA = 0
  const binFn = () => { binOpen = !binOpen; if (binOpen) toast(pick(['Latas de Kuat. Muitas. Todas vazias.', 'Caixa de pizza e embalagem de miojo. Dieta do dev.', 'Uma peruca loira?! Melhor não perguntar.', 'Sacola de supermercado cheia de cabos USB quebrados.'])) }
  act(bin, () => (binOpen ? 'Fechar a lixeira' : 'Abrir a lixeira'), binFn, (id) => { binOpen = true; toast(`${ITEMS[id].name} foi pro lixo. 🗑️`); return 'consume' })
  ticks.push((dt) => { binA += ((binOpen ? -1.9 : 0) - binA) * Math.min(1, dt * 6); lid.rotation.z = binA })
  // cachorro caramelo deitado: faz carinho e o rabo balança (e ele late)
  const dog = new THREE.Group(); dog.position.set(30.4, 0, 14.0); dog.rotation.y = 0.5; scene.add(dog)
  box(0.62, 0.22, 0.26, 0xc9964f, 0, 0.03, 0, dog); box(0.26, 0.22, 0.22, 0xc9964f, 0.38, 0.1, 0, dog); box(0.12, 0.09, 0.14, 0x3a2a1c, 0.54, 0.12, 0, dog)
  for (const zz of [-0.1, 0.1]) { box(0.08, 0.14, 0.06, 0xa8763a, 0.33, 0.22, zz, dog); box(0.25, 0.08, 0.07, 0xc9964f, 0.25, 0, zz * 1.7, dog) }
  const tail = new THREE.Group(); tail.position.set(-0.32, 0.18, 0); dog.add(tail); box(0.3, 0.06, 0.07, 0xc9964f, -0.15, 0, 0, tail)
  let wag = 0, t2 = 0
  const pet = () => { wag = 3; bark(Math.max(0.03, 0.25 - Math.hypot(playerPos.x - 30.4, playerPos.z - 14) / 40)); toast(pick(['O caramelo rolou de barriga pra cima. Missão cumprida.', 'Ele late: "AU!" (traduzindo: mais carinho).', 'Caramelo não tem dono: tem família.', 'O cachorro lambeu sua mão. Agora é amigo pra vida.'])) }
  act(dog, 'Fazer carinho no caramelo', pet, (id, kind) => {
    if (kind === 'food') { wag = 4; bark(0.15); toast(`O caramelo devorou ${ITEMS[id].name}. Amigo pra vida.`); return 'consume' }
    wag = 1.5; toast('O caramelo cheirou e perdeu o interesse.'); return true
  })
  ticks.push((dt) => { t2 += dt; wag = Math.max(0, wag - dt); tail.rotation.y = Math.sin(t2 * (wag > 0 ? 22 : 2.2)) * (wag > 0 ? 0.7 : 0.2); dog.position.y = wag > 0 ? Math.abs(Math.sin(t2 * 11)) * 0.03 : 0 })
  // cadeira de plástico da calçada e um copo de tereré
  const chair = new THREE.Group(); chair.position.set(29.6, 0, 15.3); chair.rotation.y = -0.4; scene.add(chair)
  box(0.42, 0.04, 0.42, 0xf4f4f0, 0, 0.42, 0, chair); box(0.04, 0.42, 0.04, 0xf4f4f0, 0.18, 0, 0.18, chair); box(0.04, 0.42, 0.04, 0xf4f4f0, 0.18, 0, -0.18, chair); box(0.04, 0.42, 0.04, 0xf4f4f0, -0.18, 0, 0.18, chair); box(0.04, 0.42, 0.04, 0xf4f4f0, -0.18, 0, -0.18, chair); box(0.04, 0.45, 0.42, 0xf4f4f0, -0.2, 0.45, 0, chair)
  sitAct(chair, [{ x: 29.6, y: 0.46, z: 15.3, yaw: -Math.PI / 2 }], 'Sentar na cadeira de calçada')
  block(29.35, 15.1, 29.85, 15.6, 0.45)
  // carrinho de picolé com guarda-sol (ponto na esquina da casa)
  const cart = new THREE.Group(); cart.position.set(30.4, 0, 16.9); scene.add(cart)
  box(0.9, 0.55, 0.5, 0xf2f2ee, 0, 0.3, 0, cart); box(0.92, 0.06, 0.52, 0x2e86de, 0, 0.85, 0, cart); box(0.06, 0.6, 0.06, 0x888888, 0.35, 0.9, 0.18, cart)
  const umb = new THREE.Mesh(new THREE.ConeGeometry(0.75, 0.3, 8), lm(0xe84a5f)); umb.position.set(0, 1.55, 0); cart.add(umb); cyl(0.02, 0.7, 0xaaaaaa, 0, 0.9, 0, cart)
  for (const w of [-0.3, 0.3]) { const wh = cyl(0.12, 0.05, 0x222222, w, 0, 0.28, cart); wh.rotation.x = Math.PI / 2 }
  const picoleId = defineItem('Picolé', (g) => { cyl(0.02, 0.1, 0xf2c4dc, 0, 0.05, 0, g); box(0.02, 0.06, 0.006, 0xc9a06a, 0, 0, 0, g) })
  act(cart, 'Comprar um picolé', () => { if (giveItem(picoleId)) toast(pick(['Picolé de coco, R$ 3. Pagou no Pix imaginário.', 'Picolé de uva derretendo na mão antes da primeira lambida.', 'Tinha de manga. Claro que tinha.']) + ' 🍦') })
  block(29.9, 16.6, 30.9, 17.2, 0.9)
  // placa no muro
  wallPlane(0.5, 0.3, tex(256, 150, (g, w, h) => { g.fillStyle = '#f7d23a'; g.fillRect(0, 0, w, h); g.strokeStyle = '#222'; g.lineWidth = 6; g.strokeRect(4, 4, w - 8, h - 8); g.fillStyle = '#222'; g.font = 'bold 26px sans-serif'; g.textAlign = 'center'; g.fillText('CUIDADO COM', w / 2, 50); g.fillText('O CACHORRO', w / 2, 82); g.font = '18px sans-serif'; g.fillText('(ele é medroso)', w / 2, 118) }), 29.03, 1.55, 13.4, Math.PI / 2)

  // ---------- QUARTO: roteador, celular, despertador, violão e halter ----------
  // roteador Wi-Fi na prateleira da parede norte: painel com velocidade, dispositivos, reiniciar (cai a internet e a TV), trocar a senha e bloquear a TV
  box(0.9, 0.04, 0.22, 0x5a3a22, 13.9, 1.55, 11.12)
  const router = new THREE.Group(); router.position.set(13.9, 1.59, 11.14); scene.add(router)
  box(0.3, 0.04, 0.17, 0x1a1a22, 0, 0, 0, router)
  for (const [ax, rz] of [[-0.12, -0.25], [0, 0], [0.12, 0.25]] as const) { const an = box(0.012, 0.2, 0.012, 0x222222, ax, 0.02, 0.03, router); an.rotation.z = rz }
  const leds = [0x30e060, 0x30e060, 0x30a0ff, 0xe0c030].map((c, i) => { const m = new THREE.Mesh(new THREE.SphereGeometry(0.008, 6, 4), new THREE.MeshBasicMaterial({ color: c })); m.position.set(-0.09 + i * 0.045, 0.026, -0.086); router.add(m); return m })
  let wifiPass = 'ariquemes1234', rebootT = 0
  const WPASS = ['batata2024', 'naoeasenha', 'kuat1234', 'smollgamer', 'senha123', 'vizinhonaopega']
  ticks.push((dt) => {
    if (rebootT > 0) { rebootT -= dt; leds.forEach((l) => (l.visible = false)); if (rebootT <= 0) { state.internet = true; leds.forEach((l) => (l.visible = true)); toast('A internet voltou. 📶') } return }
    leds.forEach((l, i) => (l.visible = i < 2 || Math.random() < 0.6))   // piscando
  })
  const rebootRouter = () => {
    state.internet = false; rebootT = 8
    const was = tv.on; if (was) { tv.setOn(false); tv.sync() }
    toast('Smoll: A INTERNET CAIU! EU TAVA NO MEIO DA PARTIDA!'); state.cmd('facepalm')
    setTimeout(() => { if (was && !state.tvBlocked) { tv.setOn(true); tv.sync() } }, 8500)
  }
  const routerAct = () => openPanel('📶 Roteador Smoll_5G_NãoRoube',
    () => `📶 Rede: <b>Smoll_5G_NãoRoube</b><br>🔑 Senha: <b>${wifiPass}</b><br>${state.internet ? `⬇️ <b>${(180 + Math.random() * 40).toFixed(0)} Mbps</b> &nbsp; ⬆️ <b>${(90 + Math.random() * 20).toFixed(0)} Mbps</b> &nbsp; ping <b>${(8 + Math.random() * 6).toFixed(0)} ms</b>` : '❌ <b>Sem internet (reiniciando…)</b>'}<br>💻 Conectados: PC do Smoll, celular do Smoll, ${state.tvBlocked ? '<s>TV da sala</s> (bloqueada)' : 'TV da sala'}, geladeira do vizinho (?)`,
    [
      { t: '🔁 Reiniciar', fn: rebootRouter },
      { t: '🔑 Trocar a senha', keep: true, fn: () => { wifiPass = WPASS[Math.floor(Math.random() * WPASS.length)]; toast(`Nova senha: ${wifiPass}`) } },
      { t: '📝 Anotar a senha', fn: () => { const id = defineItem('Senha do Wi-Fi', (g) => box(0.07, 0.005, 0.07, 0xf4e04d, 0, 0, 0, g)); if (giveItem(id)) toast(`Post-it com a senha: ${wifiPass}`) } },
      { t: '🚫 Bloquear / liberar a TV', keep: true, fn: () => { state.tvBlocked = !state.tvBlocked; if (state.tvBlocked && tv.on) { tv.setOn(false); tv.sync() } toast(state.tvBlocked ? 'TV bloqueada. O Smoll ri sozinho.' : 'TV liberada.') } },
    ])
  act(router, 'Abrir o roteador', routerAct)
  // celular do Smoll no criado-mudo: pegável, e na mão abre as mensagens
  const phonePanel = () => openPhone()
  thing(12.3, 0.5, 11.38, 'Pegar o celular do Smoll', ['Celular do Smoll. A bateria tá em 3%.', 'Tela quebrada, mas funciona. O mundo é assim.'], (g) => { box(0.07, 0.01, 0.14, 0x111118, 0, 0, 0, g); box(0.06, 0.002, 0.12, 0x2e86de, 0, 0.01, 0, g) })
  ITEMS[defineItem('Celular do Smoll')].use = phonePanel
  const alarm = box(0.09, 0.07, 0.04, 0xd8d8d0, 12.45, 0.5, 11.62); act(alarm, 'Ver o despertador', () => { const h = gameHour(); toast(`⏰ ${String(Math.floor(h)).padStart(2, '0')}:${String(Math.floor((h % 1) * 60)).padStart(2, '0')} — "5 minutinhos" (alarme de 6h, soneca ×7)`) })
  // violão encostado na parede oeste: tudo emendado (corpo de dois bojos, braço, cabeça), com boca e cordas
  const guitar = new THREE.Group(); guitar.position.set(12.07, 0, 14.55); guitar.rotation.y = Math.PI / 2; scene.add(guitar) // frente (+z local) pra dentro do quarto (+x)
  const gm = (geo: THREE.BufferGeometry, c: number, x: number, y: number, z: number) => { const m = new THREE.Mesh(geo, lm(c)); m.position.set(x, y, z); guitar.add(m); return m }
  gm(new THREE.CylinderGeometry(0.17, 0.17, 0.07, 20), 0xc07a30, 0, 0.3, 0).rotation.x = Math.PI / 2   // bojo de baixo
  gm(new THREE.CylinderGeometry(0.125, 0.125, 0.07, 20), 0xc07a30, 0, 0.55, 0).rotation.x = Math.PI / 2 // bojo de cima (se sobrepõe ao de baixo)
  gm(new THREE.CylinderGeometry(0.045, 0.045, 0.075, 14), 0x1a1208, 0, 0.42, 0).rotation.x = Math.PI / 2 // boca
  gm(new THREE.BoxGeometry(0.05, 0.62, 0.03), 0x5a3a22, 0, 0.88, 0)                                       // braço (do bojo de cima até a cabeça)
  gm(new THREE.BoxGeometry(0.07, 0.15, 0.025), 0x3a2a1c, 0, 1.24, 0)                                      // cabeça
  gm(new THREE.BoxGeometry(0.1, 0.012, 0.075), 0x2a1c10, 0, 0.27, 0.01)                                   // cavalete
  for (let i = -2; i <= 2; i++) gm(new THREE.BoxGeometry(0.004, 0.98, 0.004), 0xdddddd, i * 0.009, 0.77, 0.02) // cordas
  act(guitar, 'Tocar o violão', () => { strum(); toast(pick(['Dedilhou o Do maior. Ele já tava desafinado há 2 anos.', 'Tocou "Evidências". O vizinho agradece (não).', 'Cordas soltas. Soa como o início de uma banda de garagem.'])) })
  const dumbbell = (x: number, z: number) => thing(x, 0, z, 'Pegar o halter', ['Halter de 5 kg. Usado como peso de papel.', 'Pesado. Smoll não levanta isso há meses.'], (g) => {
    // barra e anilhas no mesmo eixo (x) e na mesma altura: o halter apoia nas anilhas, no chão
    const part = (r: number, h: number, c: number, x: number) => { const m = new THREE.Mesh(new THREE.CylinderGeometry(r, r, h, 14), lm(c)); m.rotation.z = Math.PI / 2; m.position.set(x, 0.05, 0); g.add(m) }
    part(0.02, 0.3, 0x777777, 0); for (const dx of [-0.12, 0.12]) part(0.05, 0.05, 0x222222, dx)
  })
  dumbbell(18.4, 14.55); dumbbell(18.4, 14.8)
  ITEMS[defineItem('Halter')].use = () => toast(pick(['Você levantou o halter. 3 repetições e desistiu.', 'Treino de braço concluído (1 rep).', 'O halter te venceu.']))

  // ================= CÔMODOS PREENCHIDOS: oficina, sala, varanda, corredor, garagem e quintal =================
  type Kd = 'food' | 'wear' | 'drink' | 'junk'
  const item = (name: string, build: (g: THREE.Group) => void, kind?: Kd, use?: () => void) => { const id = defineItem(name, build); if (kind) ITEMS[id].kind = kind; if (use) ITEMS[id].use = use; return id }
  const sph = (r: number, c: number, x: number, y: number, z: number, g: THREE.Object3D, sy = 1) => { const m = new THREE.Mesh(new THREE.SphereGeometry(r, 10, 8), lm(c)); m.position.set(x, y, z); m.scale.y = sy; g.add(m); return m }
  const hit = (w: number, h: number, d: number, x: number, y: number, z: number) => ghost(box(w, h, d, 0xffffff, x, y, z)) // alvo de clique invisível
  const lab = (text: string, x: number, y: number, z: number, rot: number, w = 0.22, bg = '#f4f1e8') => wallPlane(w, w * 0.32, tex(160, 52, (g, cw, ch) => { g.fillStyle = bg; g.fillRect(0, 0, cw, ch); g.fillStyle = '#222'; g.font = 'bold 26px sans-serif'; g.textAlign = 'center'; g.fillText(text, cw / 2, 35) }), x, y, z, rot)
  /** guarda de volta num baú (clique com o item na mão): ok = ids aceitos (vazio = qualquer um) */
  const stash = (stock: { id: string; n: number }[], ok: string[] = []) => (id: string) => {
    if (ok.length && !ok.includes(id)) { toast('Isso não vai aqui.'); return true }
    const s = stock.find((x) => x.id === id); if (s) s.n++; else stock.push({ id, n: 1 }); clink(); toast(`Guardou ${ITEMS[id].name}.`); return 'consume'
  }
  const hasPower = () => { if (state.power) return true; toast('Sem energia. Alguém desligou o disjuntor.'); return false }

  // plantas que crescem em 4 estágios enquanto estão molhadas (regador, copo de água ou mangueira); no estágio 4 dá pra colher
  const idRegador = item('Regador', (g) => { cyl(0.07, 0.14, 0x2e9a3c, 0, 0, 0, g); box(0.02, 0.02, 0.16, 0x2e9a3c, 0, 0.1, 0.12, g); box(0.02, 0.1, 0.02, 0x2e9a3c, 0, 0.14, -0.08, g) })
  const idAlface = item('Alface', (g) => { sph(0.06, 0x7ccf5a, 0, 0.05, 0, g, 0.8) }, 'food'), idFlor = item('Flor', (g) => { cyl(0.006, 0.12, 0x3f8f3f, 0, 0, 0, g); sph(0.035, 0xe84a8a, 0, 0.13, 0, g) })
  const CROP: Record<string, [string, number, string]> = { flor: ['a flor', 0xe84a8a, idFlor], tomate: ['o tomate', 0xd0302a, 'tomate'], cenoura: ['a cenoura', 0xf08a20, 'cenoura'], alface: ['a alface', 0x7ccf5a, idAlface], pimenta: ['a pimenta', 0xc02020, idPimenta] } as never
  type Plant = { x: number; z: number; wet: number; grow: number }
  const plants: Plant[] = []
  const waterPlants = (x: number, z: number, r: number) => { let n = 0; for (const p of plants) if (Math.hypot(p.x - x, p.z - z) <= r) { p.wet = Math.min(120, p.wet + 60); n++ } return n }
  const mkPlant = (x: number, y: number, z: number, kind: keyof typeof CROP, pot: boolean) => {
    const [nome, col, out] = CROP[kind], g = new THREE.Group(); g.position.set(x, y, z); scene.add(g)
    if (pot) cyl(0.13, 0.2, 0xb5651d, 0, 0, 0, g)
    const sg = new THREE.Group(); sg.position.y = pot ? 0.2 : 0; g.add(sg); cyl(0.012, 0.4, 0x3f8f3f, 0, 0, 0, sg)
    for (const [lx, ly, lz] of [[0.07, 0.2, 0], [-0.06, 0.28, 0.03], [0, 0.36, -0.06], [0.03, 0.14, 0.07]]) sph(0.07, 0x3fa34d, lx, ly, lz, sg, 0.6)
    const fruits = [[0.08, 0.16, 0.05], [-0.07, 0.24, -0.04], [0.02, 0.33, 0.07]].map(([fx, fy, fz]) => sph(0.04, col, fx, fy, fz, sg))
    const p: Plant = { x, z, wet: 0, grow: 0 }; plants.push(p)
    const stage = () => (p.grow >= 70 ? 3 : p.grow >= 35 ? 2 : p.grow >= 12 ? 1 : 0)
    let shown = -1
    const show = () => { const s = stage(); if (s === shown) return; shown = s; sg.scale.setScalar([0.3, 0.55, 0.8, 1][s]); fruits.forEach((f) => (f.visible = s === 3)) }
    show(); ticks.push((dt) => { if (p.wet > 0) { p.wet -= dt; p.grow += dt } show() })
    act(g, () => (stage() === 3 ? `Colher ${nome}` : p.wet > 0 ? `${nome[0].toUpperCase() + nome.slice(1)}: crescendo (${stage() + 1}/4)` : `${nome[0].toUpperCase() + nome.slice(1)} (${stage() + 1}/4): com sede`), () => {
      if (stage() === 3) { if (giveItem(out)) { p.grow = 35; toast(`Colheu ${nome}! 🌱 (+ ${ITEMS[out].name})`) } return }
      toast(p.wet > 0 ? 'Tá crescendo bem. Agora é esperar.' : 'Tá murchinha. Rega com o regador, um copo de água ou a mangueira.')
    }, (id) => { if (id === idRegador) { p.wet = Math.min(120, p.wet + 60); toast('Regou. As folhas agradecem. 💧'); return true } if (id === idAgua) { p.wet = Math.min(120, p.wet + 30); toast('Regou com o copo de água. 💧'); return 'consume' } toast('Isso não é adubo.'); return true })
    return g
  }

  // ---------- OFICINA VIVA (x 1–7, z 1–6) ----------
  const idChave = item('Chave de fenda', (g) => { box(0.02, 0.02, 0.09, 0xf1c40f, 0, 0, 0, g); box(0.008, 0.008, 0.07, 0xcccccc, 0, 0.006, -0.075, g) })
  const idMartelo = item('Martelo', (g) => { box(0.02, 0.02, 0.2, 0x6b4a2a, 0, 0, 0, g); box(0.09, 0.04, 0.04, 0x555a60, 0, 0, -0.11, g) })
  const idAlicate = item('Alicate', (g) => { box(0.02, 0.012, 0.12, 0xc0392b, -0.012, 0, 0, g); box(0.02, 0.012, 0.12, 0xc0392b, 0.012, 0, 0, g); box(0.05, 0.012, 0.04, 0x888888, 0, 0, -0.08, g) })
  const idFita = item('Fita isolante', (g) => { cyl(0.035, 0.025, 0x111111, 0, 0, 0, g); cyl(0.02, 0.027, 0x888888, 0, 0, 0, g) })
  const idMulti = item('Multímetro', (g) => { box(0.07, 0.03, 0.13, 0xf1c40f, 0, 0, 0, g); box(0.05, 0.005, 0.04, 0x9fe0a0, 0, 0.03, -0.035, g); cyl(0.015, 0.006, 0x222222, 0, 0.03, 0.02, g) })
  const idSolda = item('Ferro de solda', (g) => { cyl(0.012, 0.14, 0x222222, 0, 0, 0, g).rotation.x = Math.PI / 2; cyl(0.004, 0.05, 0xcccccc, 0, 0, -0.095, g).rotation.x = Math.PI / 2 })
  const idParafuso = item('Parafuso', (g) => { cyl(0.006, 0.03, 0xaaaaaa, 0, 0, 0, g); cyl(0.012, 0.006, 0xaaaaaa, 0, 0.03, 0, g) })
  const idPorca = item('Porca', (g) => { cyl(0.015, 0.012, 0x8a8f94, 0, 0, 0, g) })
  const idPrego = item('Prego', (g) => { cyl(0.003, 0.06, 0x777777, 0, 0, 0, g) })
  const idCabo = item('Cabo USB', (g) => { box(0.01, 0.01, 0.2, 0x111111, 0, 0, 0, g); box(0.02, 0.01, 0.025, 0xcccccc, 0, 0, -0.11, g) })
  const idLampada = item('Lâmpada', (g) => { sph(0.04, 0xfff2c0, 0, 0.07, 0, g); cyl(0.02, 0.035, 0xaaaaaa, 0, 0, 0, g) })
  const idPilha = item('Pilha', (g) => { cyl(0.013, 0.05, 0x2e9a3c, 0, 0, 0, g); cyl(0.006, 0.008, 0xcccccc, 0, 0.05, 0, g) })
  const idRam = defineItem('Pente de RAM', (g) => { box(0.13, 0.03, 0.004, 0x1a1a22, 0, 0.015, 0, g); box(0.12, 0.012, 0.005, 0x30e0a0, 0, 0.02, 0.003, g) })
  const idExt = item('Extintor', (g) => { cyl(0.05, 0.28, 0xc0182c, 0, 0, 0, g); cyl(0.015, 0.05, 0x222222, 0, 0.28, 0, g); box(0.07, 0.015, 0.015, 0x222222, 0.03, 0.31, 0, g) })
  const B_EXT = (g: THREE.Group) => ITEMS[idExt].build!(g)
  // ferramentas na bancada (voltam sozinhas) e a caixa de ferramentas de verdade
  thing(3.95, 0.93, 1.62, 'Pegar a chave de fenda', ['Chave de fenda de ponta amarela. A única que serve.', 'Chave Phillips: a mais perdida da casa.'], ITEMS[idChave].build!)
  thing(4.95, 0.93, 1.6, 'Pegar o alicate', ['Alicate de bico. Pega firme e arranha tudo.', 'Alicate universal. Universal até demais.'], ITEMS[idAlicate].build!)
  thing(5.2, 0.93, 1.66, 'Pegar a fita isolante', ['Fita isolante preta. Conserta tudo, inclusive o que não devia.', 'Fita quase no fim. Sempre.'], ITEMS[idFita].build!)
  thing(5.7, 0.93, 1.55, 'Pegar o martelo', ['Martelo de unha. Resolve o problema do jeito que dá.', 'Martelo: o botão de reiniciar da oficina.'], ITEMS[idMartelo].build!)
  thing(6.2, 0.93, 1.35, 'Pegar o ferro de solda', ['Ferro de solda desligado. Ainda bem.', 'Ponta suja de estanho. Dá pra queimar o dedo mesmo frio.'], ITEMS[idSolda].build!)
  const toolStock = [{ id: idChave, n: 1 }, { id: idMartelo, n: 1 }, { id: idAlicate, n: 1 }, { id: idFita, n: 2 }, { id: idParafuso, n: 8 }]
  act(caixaFerr, 'Abrir caixa de ferramentas', () => { clink(); openChest('🧰 Caixa de ferramentas', toolStock) }, stash(toolStock, [idChave, idMartelo, idAlicate, idFita, idParafuso, idPorca, idMulti, idSolda]))
  // gaveteiro de parafusos (4 gavetas que abrem) ao lado da prateleira
  box(0.65, 0.9, 0.45, 0x7a5a3a, 2.625, 0, 1.275); block(2.3, 1.05, 2.95, 1.5, 0.9)
  const gavs: [string, { id: string; n: number }[]][] = [['Parafusos', [{ id: idParafuso, n: 14 }]], ['Porcas e arruelas', [{ id: idPorca, n: 10 }]], ['Pregos', [{ id: idPrego, n: 20 }]], ['Cabos e fita', [{ id: idCabo, n: 3 }, { id: idFita, n: 1 }]]]
  gavs.forEach(([nome, st], i) => {
    const d = box(0.6, 0.19, 0.02, 0xa0764a, 2.625, 0.06 + i * 0.215, 1.51); box(0.14, 0.02, 0.03, 0xc9b037, 2.625, 0.15 + i * 0.215, 1.53)
    act(d, `Abrir gaveta: ${nome}`, () => { clink(); openChest(`🗄️ Gaveta: ${nome}`, st) }, stash(st))
  })
  // prateleiras etiquetadas com caixas que abrem
  box(1.1, 1.6, 0.03, 0x6e5435, 1.65, 0, 1.015); for (const px of [1.1, 2.2]) box(0.04, 1.6, 0.35, 0x6e5435, px, 0, 1.175)
  for (const sy of [0.02, 0.5, 0.95, 1.4]) box(1.1, 0.04, 0.35, 0x6e5435, 1.65, sy, 1.175)
  const caixas: [number, number, string, number, { id: string; n: number }[]][] = [
    [1.4, 0.54, 'PEÇAS PC', 0x2e86de, [{ id: idRam, n: 2 }, { id: idCabo, n: 1 }]], [1.82, 0.54, 'CABOS', 0x555555, [{ id: idCabo, n: 4 }]],
    [1.4, 0.99, 'LÂMPADAS', 0xf1c40f, [{ id: idLampada, n: 2 }]], [1.82, 0.99, 'PILHAS', 0x2e9a3c, [{ id: idPilha, n: 6 }]], [1.6, 1.44, 'SUCATA', 0x8a5a3a, [{ id: idPorca, n: 3 }, { id: idMulti, n: 1 }]],
  ]
  for (const [cx, cy, nome, col, st] of caixas) {
    const b = box(0.32, 0.22, 0.28, col, cx, cy, 1.18); lab(nome, cx, cy + 0.11, 1.321, 0, 0.26)
    act(b, `Abrir a caixa ${nome}`, () => { clink(); openChest(`📦 ${nome}`, st) }, stash(st))
  }
  block(1.1, 1.0, 2.2, 1.35, 1.5)
  // bancada de eletrônica (parede oeste): osciloscópio, ferro de solda com fumaça, multímetro e RAM
  box(0.7, 0.06, 1.6, 0x4a5a63, 1.35, 0.84, 2.8); for (const [lx, lz] of [[1.1, 2.1], [1.6, 2.1], [1.1, 3.5], [1.6, 3.5]]) box(0.04, 0.84, 0.04, 0x444444, lx, 0, lz)
  block(1.0, 2.0, 1.7, 3.6, 0.9)
  const scope = box(0.3, 0.22, 0.3, 0x3a3f45, 1.35, 0.9, 2.45); let scopeOn = false
  const scopeCv = document.createElement('canvas'); scopeCv.width = 128; scopeCv.height = 80
  const scopeTex = new THREE.CanvasTexture(scopeCv); scopeTex.colorSpace = THREE.SRGBColorSpace
  const scopeDraw = () => {
    const c = scopeCv.getContext('2d')!; c.fillStyle = scopeOn ? '#06210f' : '#050505'; c.fillRect(0, 0, 128, 80)
    if (!scopeOn) { scopeTex.needsUpdate = true; return }
    c.strokeStyle = '#0f4a25'; c.lineWidth = 1; for (let i = 0; i <= 8; i++) { c.beginPath(); c.moveTo(i * 16, 0); c.lineTo(i * 16, 80); c.stroke() } for (let i = 0; i <= 5; i++) { c.beginPath(); c.moveTo(0, i * 16); c.lineTo(128, i * 16); c.stroke() }
    c.strokeStyle = '#3dff7a'; c.lineWidth = 2; c.beginPath(); for (let x = 0; x < 128; x++) { const y = 40 + Math.sin(x * 0.18 + clock * 6) * 22 + Math.sin(x * 0.5 + clock * 11) * 4; x ? c.lineTo(x, y) : c.moveTo(x, y) } c.stroke(); scopeTex.needsUpdate = true
  }
  scopeDraw(); wallPlane(0.22, 0.14, scopeTex, 1.505, 1.0, 2.45, Math.PI / 2); box(0.04, 0.04, 0.04, 0xcc3333, 1.52, 0.93, 2.35); box(0.04, 0.04, 0.04, 0x3333cc, 1.52, 0.93, 2.55)
  let scopeT = 0; ticks.push((dt) => { if (scopeOn && (scopeT += dt) > 0.1 && Math.hypot(playerPos.x - 1.4, playerPos.z - 2.5) < 6) { scopeT = 0; scopeDraw() } })
  act(scope, () => (scopeOn ? 'Desligar o osciloscópio' : 'Ligar o osciloscópio'), () => { if (!scopeOn && !hasPower()) return; scopeOn = !scopeOn; scopeDraw(); if (scopeOn) toast(pick(['Onda senoidal linda. Ninguém sabe o que ela mede.', 'O sinal tem mais ruído que a reunião de segunda.'])) }, (id) => {
    if (id === idMulti) { toast(`Multímetro na ponta de prova: ${(4.9 + Math.random() * 0.2).toFixed(2)} V. Tá certinho. 📟`); return true }
    toast('Não dá pra medir isso.'); return true
  })
  const solBase = box(0.1, 0.02, 0.15, 0x222222, 1.3, 0.9, 2.95); cyl(0.012, 0.12, 0x555555, 1.3, 0.92, 2.9); const tip = sph(0.014, 0x555555, 1.3, 1.07, 2.9, scene)
  let solT = 0
  const smoke = Array.from({ length: 6 }, () => { const m = new THREE.Mesh(new THREE.SphereGeometry(0.03, 6, 4), new THREE.MeshBasicMaterial({ color: 0xcccccc, transparent: true, opacity: 0.5, depthWrite: false })); m.visible = false; scene.add(m); return m })
  ticks.push((dt) => {
    if (solT > 0) { solT -= dt; smoke.forEach((m, i) => { const k = (clock * 0.45 + i / 6) % 1; m.visible = true; m.position.set(1.3 + Math.sin(i * 2 + clock) * 0.05 * k, 1.1 + k * 0.5, 2.9); m.scale.setScalar(1 + k * 2.5); (m.material as THREE.MeshBasicMaterial).opacity = 0.5 * (1 - k) }); if (solT <= 0) { (tip.material as THREE.MeshLambertMaterial).color.set(0x555555); toast('O ferro de solda esfriou.') } }
    else smoke.forEach((m) => (m.visible = false))
  })
  act(solBase, () => (solT > 0 ? 'Ferro de solda quente (fumaça!)' : 'Ligar o ferro de solda'), () => { if (solT > 0) { toast('Quente! Cuidado com o dedo.'); return } if (!hasPower()) return; solT = 12; (tip.material as THREE.MeshLambertMaterial).color.set(0xff4a10); toast('Ferro esquentando… cheiro de estanho e de coragem. 🔥') }, (id) => {
    if (id === idExt) { solT = Math.min(solT, 0.1); toast('Você apagou um ferro de solda com um extintor. Exagero nível Smoll. 🧯'); return true }
    toast('Nada pra soldar com isso.'); return true
  })
  thing(1.3, 0.9, 3.2, 'Pegar o multímetro', ['Multímetro com a bateria fraca. Mede 5 V e dúvidas.', 'Multímetro amarelo. Já salvou a casa de um curto.'], ITEMS[idMulti].build!)
  thing(1.45, 0.9, 3.45, 'Pegar o pente de RAM', ['Pente de RAM DDR5 sobrando. O PC do Smoll agradece.', 'RAM nova, ainda na embalagem antiestática.'], ITEMS[idRam].build!)
  // quadro de ideias com post-its (o texto fica salvo no navegador)
  const NK = 'smollPostits', POST = ['#fff176', '#ffab91', '#a5d6a7', '#90caf9', '#f48fb1', '#ce93d8']
  const loadNotes = (): string[] => { try { return JSON.parse(localStorage[NK]) } catch { return ['Comprar Kuat', 'TODO: dormir', 'o portão é bug ou feature?'] } }
  let notes = loadNotes()
  const pCv = document.createElement('canvas'); pCv.width = 256; pCv.height = 192
  const pTex = new THREE.CanvasTexture(pCv); pTex.colorSpace = THREE.SRGBColorSpace
  const pDraw = () => {
    const c = pCv.getContext('2d')!; c.fillStyle = '#b08a55'; c.fillRect(0, 0, 256, 192); c.strokeStyle = '#6b4a2a'; c.lineWidth = 8; c.strokeRect(0, 0, 256, 192)
    c.fillStyle = '#fff'; c.font = 'bold 14px sans-serif'; c.fillText('IDEIAS', 10, 20)
    notes.slice(-8).forEach((t, i) => { const x = 8 + (i % 4) * 61, y = 30 + Math.floor(i / 4) * 78; c.fillStyle = POST[i % 6]; c.fillRect(x, y, 56, 70); c.fillStyle = '#222'; c.font = '10px sans-serif'; t.match(/.{1,9}(\s|$)|\S+/g)?.slice(0, 5).forEach((l, j) => c.fillText(l.trim(), x + 4, y + 14 + j * 12)) })
    pTex.needsUpdate = true
  }
  pDraw()
  const quadroIdeias = wallPlane(1.1, 0.82, pTex, 1.015, 1.5, 4.7, Math.PI / 2)
  act(quadroIdeias, 'Ler o quadro de ideias', () => openPanel('📌 Quadro de ideias', () => `<small>Fica salvo no seu navegador.</small><br>${notes.length ? notes.map((t, i) => `<span style="background:${POST[i % 6]};color:#222;padding:2px 6px;border-radius:3px;margin:2px;display:inline-block">${t.replace(/</g, '&lt;')}</span>`).join('') : '<i>Quadro vazio.</i>'}`, [
    { t: '✍️ Escrever post-it', keep: true, fn: () => { const t = prompt('Escreva o post-it (até 40 letras):'); if (t?.trim()) { notes.push(t.trim().slice(0, 40)); notes = notes.slice(-12); try { localStorage[NK] = JSON.stringify(notes) } catch { /* sem storage */ } pDraw() } } },
    { t: '🗑️ Arrancar o último', keep: true, fn: () => { notes.pop(); try { localStorage[NK] = JSON.stringify(notes) } catch { /* sem storage */ } pDraw() } },
  ]))
  // impressora 3D: escolhe o brinquedo, imprime em 20 s e vira item
  const dinoB = (g: THREE.Group) => { box(0.12, 0.07, 0.05, 0x3fa34d, 0, 0.03, 0, g); box(0.05, 0.06, 0.045, 0x3fa34d, 0.08, 0.09, 0, g); box(0.1, 0.03, 0.03, 0x3fa34d, -0.1, 0.05, 0, g); box(0.025, 0.04, 0.025, 0x2e7d32, -0.03, 0, 0.02, g); box(0.025, 0.04, 0.025, 0x2e7d32, 0.03, 0, -0.02, g) }
  const fogB = (g: THREE.Group) => { cyl(0.03, 0.14, 0xe8e8e8, 0, 0, 0, g); const n = new THREE.Mesh(new THREE.ConeGeometry(0.03, 0.06, 10), lm(0xc0182c)); n.position.y = 0.17; g.add(n); box(0.1, 0.02, 0.01, 0xc0182c, 0, 0.02, 0, g); box(0.01, 0.02, 0.1, 0xc0182c, 0, 0.02, 0, g) }
  const robB = (g: THREE.Group) => { box(0.08, 0.1, 0.05, 0x8a9aa8, 0, 0.03, 0, g); box(0.06, 0.05, 0.05, 0xb8c4cc, 0, 0.14, 0, g); cyl(0.004, 0.04, 0x333333, 0, 0.19, 0, g); sph(0.012, 0xff4040, 0, 0.21, 0, g); box(0.025, 0.07, 0.025, 0x8a9aa8, -0.055, 0.03, 0, g); box(0.025, 0.07, 0.025, 0x8a9aa8, 0.055, 0.03, 0, g) }
  const patB = (g: THREE.Group) => { sph(0.05, 0xf2d030, 0, 0.05, 0, g, 0.85); sph(0.03, 0xf2d030, 0.04, 0.11, 0, g); box(0.03, 0.012, 0.025, 0xf08a20, 0.075, 0.11, 0, g) }
  const TOYS: [string, string, (g: THREE.Group) => void][] = [['Dinossauro 3D', '🦖', dinoB], ['Foguete 3D', '🚀', fogB], ['Robozinho 3D', '🤖', robB], ['Patinho 3D', '🦆', patB]]
  const toyIds = TOYS.map(([n, , b]) => item(n, b, undefined, () => toast(pick(['Você fez "pew pew". O brinquedo não respondeu.', 'Brincou de dinossauro vs. foguete. Empate.', 'O brinquedo cheira a plástico quente.']))))
  box(0.65, 0.05, 0.75, 0x6e5435, 6.58, 0.75, 2.4); for (const lx of [6.3, 6.86]) for (const lz of [2.07, 2.73]) box(0.04, 0.75, 0.04, 0x444444, lx, 0, lz)
  box(0.4, 0.03, 0.4, 0x222222, 6.58, 0.8, 2.4); for (const lx of [6.4, 6.76]) box(0.03, 0.42, 0.03, 0xc0392b, lx, 0.8, 2.22); box(0.38, 0.03, 0.03, 0xc0392b, 6.58, 1.2, 2.22)
  const phead = new THREE.Group(); phead.position.set(6.58, 1.05, 2.25); scene.add(phead); box(0.08, 0.05, 0.05, 0x333333, 0, 0, 0, phead); cyl(0.008, 0.04, 0xf1c40f, 0, -0.04, 0, phead)
  const toyG = new THREE.Group(); toyG.position.set(6.58, 0.83, 2.4); scene.add(toyG)
  const job = { toy: -1, t: 0, done: false }
  const printer = hit(0.6, 0.5, 0.6, 6.58, 0.8, 2.4)
  ticks.push((dt) => {
    if (job.toy < 0) return
    if (!job.done && state.power) { job.t += dt; toyG.scale.set(1, Math.max(0.05, job.t / 20), 1); phead.position.x = 6.58 + Math.sin(clock * 6) * 0.12; phead.position.y = 0.86 + (job.t / 20) * 0.1; if (job.t >= 20) { job.done = true; clink(0.2); toast('Impressora 3D: impressão concluída! 🖨️') } }
  })
  const startPrint = (i: number) => { if (job.toy >= 0) { toast('A impressora já tá ocupada.'); return } if (!hasPower()) return; job.toy = i; job.t = 0; job.done = false; toyG.clear(); TOYS[i][2](toyG); toyG.scale.set(1, 0.05, 1); toast(`Imprimindo ${TOYS[i][0]}… (20 s) 🖨️`) }
  const printerFn = () => {
    if (job.done) { if (giveItem(toyIds[job.toy])) { toast(`Pegou o ${TOYS[job.toy][0]} ainda quentinho. 🎁`); job.toy = -1; toyG.clear() } return }
    openPanel('🖨️ Impressora 3D', () => job.toy < 0 ? 'Escolhe o brinquedo. Leva 20 segundos e sai quentinho.' : `Imprimindo <b>${TOYS[job.toy][0]}</b>…<div style="background:#333;border-radius:4px;margin-top:6px"><div style="background:#2ecc71;height:10px;border-radius:4px;width:${Math.min(100, job.t * 5)}%"></div></div>${job.done ? 'Pronto! Fecha e aperta E na impressora.' : state.power ? '' : '⚠️ Sem energia.'}`, TOYS.map(([n, ic], i) => ({ t: `${ic} ${n.replace(' 3D', '')}`, fn: () => startPrint(i) })))
  }
  act(printer, () => (job.done ? 'Pegar o brinquedo impresso' : job.toy >= 0 ? 'Impressora 3D (imprimindo…)' : 'Usar a impressora 3D'), printerFn)
  // ventilador de mesa quebrado: conserta com a chave de fenda na mão
  const vf = new THREE.Group(); vf.position.set(5.9, 0, 4.8); scene.add(vf)
  cyl(0.18, 0.03, 0x333333, 0, 0, 0, vf); cyl(0.025, 0.75, 0x888888, 0, 0.03, 0, vf); box(0.14, 0.14, 0.2, 0x444444, 0, 0.78, 0, vf)
  const blades = new THREE.Group(); blades.position.set(-0.12, 0.85, 0); vf.add(blades); for (let i = 0; i < 4; i++) { const arm = new THREE.Group(); arm.rotation.x = (i * Math.PI) / 2; blades.add(arm); box(0.015, 0.15, 0.06, 0x9fd0e8, 0, 0.09, 0, arm) }
  box(0.01, 0.44, 0.44, 0xaaaaaa, -0.2, 0.63, -0.22, vf).visible = false
  const vfan = { broken: true, on: false }
  ticks.push((dt) => { if (vfan.on && state.power && !vfan.broken) blades.rotation.x += dt * 20 })
  act(vf, () => (vfan.broken ? 'Ventilador de mesa (quebrado)' : vfan.on ? 'Desligar o ventilador' : 'Ligar o ventilador'), () => {
    if (vfan.broken) { toast(pick(['Não liga. Tem um parafuso solto na base. (Pega a chave de fenda e clica nele.)', 'Quebrado. O Smoll diz que "é só apertar um parafuso".'])); return }
    if (!hasPower()) return; vfan.on = !vfan.on
  }, (id) => {
    if (id === idChave && vfan.broken) { vfan.broken = false; vfan.on = true; clink(0.2); toast('Apertou o parafuso e… consertou! O ventilador voltou à vida. 🌀🔧'); return true }
    toast(vfan.broken ? 'Isso não resolve. Procura a chave de fenda.' : 'Já tá funcionando. Não mexe.'); return true
  })
  block(5.7, 4.6, 6.1, 5.0, 0.9)
  world.acao.consertar = () => { if (vfan.broken) { vfan.broken = false; vfan.on = true; toast('Smoll apertou o parafuso e consertou o ventilador. 🔧') } else { vfan.on = !vfan.on; toast('Smoll não tinha nada pra consertar, então mexeu no ventilador. 🌀') } }
  // bicicleta no cavalete: pneu da frente furado → remendo com fita isolante → enche
  const bikeG = new THREE.Group(); bikeG.position.set(2.6, 0, 3.9); scene.add(bikeG)
  const wheel = (z: number) => { const m = new THREE.Mesh(new THREE.TorusGeometry(0.28, 0.025, 8, 22), lm(0x151515)); m.rotation.y = Math.PI / 2; m.position.set(0, 0.3, z); bikeG.add(m); return m }
  const wheelF = wheel(-0.5), wheelB = wheel(0.5); void wheelB
  box(0.03, 0.03, 0.8, 0xc0182c, 0, 0.58, 0, bikeG); const dt1 = box(0.03, 0.03, 0.55, 0xc0182c, 0, 0.3, 0.2, bikeG); dt1.rotation.x = 0.7; box(0.03, 0.3, 0.03, 0x222222, 0, 0.55, 0.3, bikeG); box(0.1, 0.03, 0.18, 0x222222, 0, 0.84, 0.3, bikeG)
  box(0.03, 0.5, 0.03, 0x888888, 0, 0.3, -0.45, bikeG); box(0.4, 0.03, 0.03, 0x222222, 0, 0.82, -0.45, bikeG); box(0.5, 0.03, 0.04, 0x555555, 0, 0, -0.5, bikeG); box(0.5, 0.03, 0.04, 0x555555, 0, 0, 0.5, bikeG)
  const bk = { st: 0 } // 0 furado, 1 remendado, 2 cheio
  wheelF.scale.y = 0.82
  act(bikeG, () => ['Bicicleta (pneu da frente furado)', 'Bicicleta (remendo feito: falta encher)', 'Bicicleta (pneu cheio)'][bk.st], () => {
    if (bk.st === 0) toast('Pneu furado. Remenda com fita isolante (clica com ela na mão).')
    else if (bk.st === 1) { bk.st = 2; wheelF.scale.y = 1; toast('Encheu o pneu na bomba de pé. Tá redondinho. 🚲') } else toast(pick(['Rodou a roda. Ela gira pra sempre (no cavalete).', 'Plim-plim! A campainha da bike funciona.']))
  }, (id) => { if (id === idFita && bk.st === 0) { bk.st = 1; toast('Colou a fita no furo. Gambiarra nota 10. (agora é só encher: E)'); return true } toast('Isso não conserta pneu.'); return true })
  block(2.35, 3.3, 2.85, 4.5, 0.7)
  thing(5.75, 0, 5.75, 'Pegar o extintor', ['Extintor de pó químico, validade 2022. Vamos torcer.', 'Extintor pesado. Serve pra fogo e pra se sentir seguro.'], B_EXT)
  // ---------- SALA VIVA (x 8–13, z 1–6) ----------
  // estante de livros (parede oeste): cada livro vira item; ler (clique com ele na mão) mostra o texto
  box(0.03, 1.8, 1.4, 0x6e5435, 8.015, 0, 5.2); for (const sz of [4.5, 5.9]) box(0.4, 1.8, 0.04, 0x6e5435, 8.2, 0, sz)
  for (const sy of [0.02, 0.45, 0.9, 1.35, 1.78]) box(0.4, 0.04, 1.4, 0x6e5435, 8.2, sy, 5.2)
  block(8.0, 4.5, 8.4, 5.9, 1.8)
  const LIVROS: [string, number, string][] = [
    ['Clean Code', 0x2e86de, '"Dê nomes que revelem a intenção." O Smoll tem uma variável chamada "x2_final_NOVO".'],
    ['Como Fazer Amigos Sem Sair de Casa', 0xe67e22, 'Capítulo 1: baixe um jogo online. Capítulo 2: não jogue contra eles. Fim.'],
    ['Miojo Gourmet', 0xf1c40f, 'Receita 1: miojo. Receita 2: miojo com ovo. Receita 3: miojo com ovo e orgulho.'],
    ['Git Para Quem Tem Medo', 0x555555, '"Nunca faça force push." A última página está rasgada e suja de café.'],
    ['O Pequeno Dev', 0x3a7d44, '"O essencial é invisível aos olhos"… e ao linter também.'],
    ['Rondônia: Guia de Sobrevivência', 0xc0392b, 'Dica 1: hidrate. Dica 2: manga. Dica 3: o sol não é uma sugestão.'],
    ['Meu Primeiro Bug', 0x8e44ad, 'Foi na linha 42. Está lá até hoje. Já tem nome e CPF.'],
    ['Manual da Rede', 0x1abc9c, 'Passo 1: deitar. Passo 2: balançar. Passo 3: não levantar nunca mais.'],
  ]
  LIVROS.forEach(([t, col, txt], i) => {
    const bb = (g: THREE.Group) => { box(0.12, 0.2, 0.04, col, 0, 0, 0, g); box(0.122, 0.02, 0.042, 0xf4f1e8, 0, 0.09, 0, g) }
    item(`Livro ${t}`, bb, undefined, () => toast(`📖 ${t}: ${txt}`, 6000))
    thing(8.2, [0.06, 0.49, 0.94][Math.floor(i / 3)], 4.72 + (i % 3) * 0.25, `Ler o livro ${t}`, [txt], bb)
  })
  // videogame no rack + controles na mesa de centro + jogo da velha contra o Smoll
  const idCtrl = item('Controle de videogame', (g) => { box(0.14, 0.03, 0.07, 0x2a2a30, 0, 0, 0, g); cyl(0.015, 0.012, 0x888888, -0.04, 0.03, 0, g); cyl(0.015, 0.012, 0x888888, 0.03, 0.03, 0, g) })
  const consolinha = box(0.25, 0.04, 0.14, 0x222226, 11.4, 0.45, 5.64); box(0.02, 0.02, 0.01, 0x30e060, 11.5, 0.47, 5.565)
  let tt: string[] = Array(9).fill(''), ttOver = '', gameUntil = 0; const placar = { v: 0, d: 0, e: 0 }
  const LN = [[0, 1, 2], [3, 4, 5], [6, 7, 8], [0, 3, 6], [1, 4, 7], [2, 5, 8], [0, 4, 8], [2, 4, 6]]
  const venceu = (p: string) => LN.some((l) => l.every((i) => tt[i] === p))
  const fim = () => { if (venceu('X')) { placar.v++; return 'Você ganhou! Smoll: "Tava deixando…"' } if (venceu('O')) { placar.d++; return 'Smoll ganhou. Ele comemora sentado.' } if (tt.every(Boolean)) { placar.e++; return 'Deu velha. Empate!' } return '' }
  const jogaSmoll = () => {
    const livre = tt.map((c, i) => (c ? -1 : i)).filter((i) => i >= 0), tenta = (p: string) => livre.find((i) => { tt[i] = p; const w = venceu(p); tt[i] = ''; return w })
    const m = Math.random() < 0.25 ? pick(livre) : tenta('O') ?? tenta('X') ?? (tt[4] ? pick(livre) : 4)
    tt[m] = 'O'
  }
  const jogaVelha = () => openPanel(`🎮 Jogo da velha — você (X) vs Smoll (O)${Date.now() < gameUntil ? ' · 👾 Smoll no controle 2' : ''}`,
    () => `<div style="display:grid;grid-template-columns:repeat(3,64px);gap:4px;margin:auto;width:204px">${tt.map((c, i) => `<div data-c="${i}" style="height:64px;background:#222;border-radius:6px;display:grid;place-items:center;font-size:32px;cursor:pointer;color:${c === 'X' ? '#6cf' : '#fc6'}">${c}</div>`).join('')}</div><p style="text-align:center">${ttOver || 'Sua vez.'}<br>Placar: você ${placar.v} · Smoll ${placar.d} · empates ${placar.e}</p>`,
    [{ t: '🔄 Nova partida', keep: true, fn: () => { tt = Array(9).fill(''); ttOver = '' } }],
    (t) => { const c = t.closest('[data-c]') as HTMLElement | null; if (!c || ttOver) return; const i = +c.dataset.c!; if (tt[i]) return; tt[i] = 'X'; ttOver = fim(); if (!ttOver) { jogaSmoll(); ttOver = fim() } jogaVelha() })
  act(consolinha, 'Ligar o videogame', () => { if (!hasPower()) return; if (!invCount(idCtrl)) { toast('Falta o controle! Tem dois na mesa de centro.'); return } jogaVelha() })
  world.acao.jogar = () => { gameUntil = Date.now() + 40000; toast('Smoll pegou o controle 2: "Joga comigo no videogame!" 🎮') }
  // mesa de centro: pipoca, Kuat, copo, controles e o jogo de tabuleiro
  box(1.3, 0.04, 0.6, 0x6a4a3a, 10.5, 0.34, 3.5); for (const [lx, lz] of [[9.92, 3.25], [11.08, 3.25], [9.92, 3.75], [11.08, 3.75]]) box(0.05, 0.34, 0.05, 0x4a3224, lx, 0, lz)
  block(9.85, 3.2, 11.15, 3.8, 0.38)
  const idPipoca = item('Tigela de pipoca', (g) => { cyl(0.07, 0.05, 0xc0392b, 0, 0, 0, g); for (let i = 0; i < 7; i++) sph(0.025, 0xfff1b8, Math.cos(i * 1.9) * 0.04, 0.06 + (i % 3) * 0.015, Math.sin(i * 1.9) * 0.04, g) }, 'food')
  thing(10.95, 0.38, 3.38, 'Pegar a pipoca', ['Tigela de pipoca amanteigada. Metade já sumiu.', 'Pipoca de micro-ondas, queimou duas.'], ITEMS[idPipoca].build!)
  thing(10.12, 0.38, 3.35, 'Pegar a Kuat', ['Kuat esquecida na mesa de centro. Ainda tá gelada. Milagre.'], ITEMS.kuat.build!)
  thing(10.12, 0.38, 3.68, 'Pegar um copo', ['Copo com um dedo de refrigerante.'], ITEMS[idCopo].build!)
  thing(10.85, 0.38, 3.7, 'Pegar o controle de videogame', ['Controle do videogame. O analógico tem desvio.', 'Controle 1, o preferido do Smoll.'], ITEMS[idCtrl].build!)
  thing(11.0, 0.38, 3.72, 'Pegar o controle de videogame', ['Controle 2, com uma tecla pegajosa de Kuat.'], ITEMS[idCtrl].build!)
  const tab = box(0.4, 0.015, 0.4, 0xf4e3b0, 10.5, 0.38, 3.5); for (let i = 0; i < 4; i++) box(0.18, 0.016, 0.18, [0xc0392b, 0x2e86de, 0x3a7d44, 0xf1c40f][i], 10.4 + (i % 2) * 0.2, 0.38, 3.4 + Math.floor(i / 2) * 0.2)
  const corr = { v: 0, s: 0, msg: '' }
  const EVT: Record<number, [string, number]> = { 4: ['Caiu num bug em produção: volta 2 casas.', -2], 8: ['Achou uma Kuat gelada: avança 2 casas.', 2], 12: ['O deploy deu certo na sexta! Avança 1.', 1], 15: ['Reunião que podia ser e-mail: volta 3.', -3] }
  const rola = (who: 'v' | 's') => { const d = 1 + Math.floor(Math.random() * 6); corr[who] = Math.min(20, corr[who] + d); const e = EVT[corr[who]]; let m = `${who === 'v' ? 'Você' : 'Smoll'} tirou ${d}.`; if (e && corr[who] < 20) { corr[who] = Math.max(0, corr[who] + e[1]); m += ' ' + e[0] } return m }
  act(tab, 'Jogar o tabuleiro "Corrida dos Bugs"', () => openPanel('🎲 Corrida dos Bugs (chegue na casa 20)', () => {
    const faixa = (n: number, ic: string) => `<div style="background:#333;border-radius:4px;margin:4px 0;height:18px;position:relative"><div style="position:absolute;left:${n * 4.5}%;font-size:14px">${ic}</div></div>`
    return `${faixa(corr.v, '🧑')}${faixa(corr.s, '👾')}<p>${corr.msg || 'Role o dado.'}</p><small>Casas especiais: 4, 8, 12 e 15.</small>`
  }, [{ t: '🎲 Rolar o dado', keep: true, fn: () => {
    if (corr.v >= 20 || corr.s >= 20) { corr.v = corr.s = 0; corr.msg = 'Nova corrida! Role o dado.'; return }
    corr.msg = rola('v'); if (corr.v < 20) corr.msg += ' · ' + rola('s'); corr.msg += corr.v >= 20 ? ' 🏆 VOCÊ GANHOU!' : corr.s >= 20 ? ' 👾 O Smoll ganhou.' : ''
  } }]))
  // vitrola e caixa de som: 3 faixas geradas na hora, o volume cai com a distância
  box(0.5, 0.6, 0.8, 0x5a3a22, 12.7, 0, 4.8); block(12.45, 4.4, 12.95, 5.2, 0.6)
  box(0.4, 0.1, 0.35, 0x8b5a2b, 12.7, 0.6, 4.8); const disco = cyl(0.14, 0.012, 0x111111, 12.7, 0.7, 4.8); cyl(0.03, 0.014, 0xc0182c, 12.7, 0.7, 4.8); box(0.02, 0.01, 0.15, 0xcccccc, 12.85, 0.72, 4.72)
  const caixaSom = box(0.2, 0.35, 0.2, 0x222226, 12.7, 0.6, 5.1); cyl(0.06, 0.01, 0x444444, 12.59, 0.78, 5.1).rotation.z = Math.PI / 2
  for (const o of [disco, caixaSom]) act(o, () => (musicTrack() < 0 ? 'Ligar a vitrola' : `Trocar a música (tocando: ${TRACKS[musicTrack()].name})`), () => {
    if (!hasPower()) return; const n = musicTrack() + 1 > 2 ? -1 : musicTrack() + 1; musicPlay(n); toast(n < 0 ? 'Desligou a vitrola. Silêncio de biblioteca.' : `🎵 Tocando: ${TRACKS[n].name}`)
  })
  ticks.push((dt) => {
    if (musicTrack() < 0) return
    if (!state.power) { musicStop(); return }
    disco.rotation.y += dt * 3; musicVol(Math.max(0.03, Math.min(0.9, 1.1 - Math.hypot(playerPos.x - 12.7, playerPos.z - 4.8) / 16)))
  })
  // janela com cortina que abre e fecha (parede norte, acima do sofá)
  box(1.6, 1.0, 0.012, 0x9fd0ee, 10.5, 1.15, 1.006); for (const [w, h, x, y] of [[1.7, 0.05, 10.5, 2.15], [1.7, 0.05, 10.5, 1.1], [0.05, 1.1, 9.67, 1.1], [0.05, 1.1, 11.33, 1.1]]) box(w, h, 0.04, 0xf4f0e6, x, y, 1.03)
  const cortinas = [-1, 1].map((sx) => { const g = new THREE.Group(); g.position.set(10.5 + sx * 0.8, 1.0, 1.08); scene.add(g); box(0.8, 1.35, 0.03, 0xb03a4a, -sx * 0.4, 0, 0, g); return g })
  box(1.9, 0.03, 0.03, 0x5a3a22, 10.5, 2.35, 1.08)
  let cortAberta = false; ticks.push((dt) => cortinas.forEach((c) => (c.scale.x += ((cortAberta ? 0.25 : 1) - c.scale.x) * Math.min(1, dt * 4))))
  for (const c of cortinas) act(c, () => (cortAberta ? 'Fechar a cortina' : 'Abrir a cortina'), () => { cortAberta = !cortAberta; toast(cortAberta ? 'Abriu a cortina. A luz do sol entrou e a TV ficou ruim de ver.' : 'Fechou a cortina. Modo caverna.') })
  // quadro de fotos
  const FOTOS = ['Smoll e a moto, 2014. Os dois novinhos.', 'O caramelo filhote. Já era medroso.', 'Aniversário do Smoll: 1 vela, 0 amigos, 1 bolo.']
  let fotoI = 0
  const fotos = wallPlane(0.95, 0.34, tex(285, 102, (g, w, h) => { g.fillStyle = '#5a3a22'; g.fillRect(0, 0, w, h); FOTOS.forEach((_, i) => { g.fillStyle = ['#bcd9ea', '#e8d8a8', '#f1c0c0'][i]; g.fillRect(8 + i * 93, 8, 84, 86); g.fillStyle = '#333'; g.beginPath(); g.arc(50 + i * 93, 42, 14, 0, 7); g.fill(); g.fillRect(36 + i * 93, 58, 28, 30) }) }), 8.015, 1.55, 2.0, Math.PI / 2)
  act(fotos, 'Ver o quadro de fotos', () => toast(`📷 ${FOTOS[fotoI++ % FOTOS.length]}`))
  // vitrine de action figures (parede norte, canto leste) e relógio
  box(0.8, 1.7, 0.03, 0x6e5435, 12.55, 0, 1.015); for (const sx of [12.15, 12.95]) box(0.04, 1.7, 0.4, 0x6e5435, sx, 0, 1.2)
  for (const sy of [0.02, 0.55, 1.0, 1.4, 1.7]) box(0.8, 0.03, 0.4, 0x6e5435, 12.55, sy, 1.2)
  block(12.15, 1.0, 12.95, 1.4, 1.7)
  const figB = (c: number) => (g: THREE.Group) => { box(0.03, 0.07, 0.03, c, -0.015, 0, 0, g); box(0.03, 0.07, 0.03, c, 0.015, 0, 0, g); box(0.07, 0.08, 0.035, c, 0, 0.07, 0, g); sph(0.03, 0xc68e65, 0, 0.18, 0, g) }
  for (const [n, c, x, y, txt] of [['Smoll', 0x3b3b44, 12.3, 0.58, 'Action figure do Smoll, edição limitada: vem com bug e sem barba.'], ['Bia', 0xe87aa8, 12.6, 0.58, 'Action figure da Bia. Ninguém sabe quem é. O Smoll muda de assunto.'], ['Kuat-Man', 0x2e9a3c, 12.45, 1.03, 'Kuat-Man, o herói gelado. Poder: sede eterna.']] as [string, number, number, number, string][])
    thing(x, y, 1.2, `Pegar o action figure ${n}`, [txt], figB(c))
  for (const [x, y] of [[12.3, 1.03], [12.7, 1.43], [12.3, 1.43]]) { cyl(0.04, 0.02, 0x7a5a1a, x, y, 1.2); cyl(0.025, 0.12, 0xd4af37, x, y + 0.02, 1.2) } // troféus
  const relSala = wallPlane(0.3, 0.3, clockTex, 12.55, 2.1, 1.01, 0)
  act(relSala, 'Ver as horas', () => { const h = gameHour(); toast(`São ${String(Math.floor(h)).padStart(2, '0')}:${String(Math.floor((h % 1) * 60)).padStart(2, '0')}. O relógio da sala atrasa 10 min, jura.`) })
  // lixeirinha e planta
  const lixinho = cyl(0.13, 0.35, 0x5a6068, 8.35, 0, 1.35); block(8.2, 1.2, 8.5, 1.5, 0.35)
  act(lixinho, 'Lixeirinha da sala', () => toast('Tem uma embalagem de pipoca e um guardanapo. Pequena, mas fiel.'), (id, kind) => {
    if (kind === 'food' || kind === 'drink' || /casca|embalagem|miolo|papel|panfleto|carta|boleto|conta de|revista|cupom|queimada/i.test(ITEMS[id].name)) { clink(0.05); toast(`${ITEMS[id].name} foi pro lixo. 🗑️`); return 'consume' }
    toast('Isso não é lixo.'); return true
  })
  mkPlant(8.4, 0, 2.5, 'flor', true)
  // ---------- roupas e acessórios: item 'wear' na mão → clique veste/tira; o reflexo dos espelhos mostra (frente do avatar = -z) ----------
  const worn = new Set<string>(), accs: Record<string, THREE.Object3D> = {}, ACC: Record<string, (g: THREE.Group) => void> = {}
  const wearable = (name: string, build: (g: THREE.Group) => void, acc: ((g: THREE.Group) => void) | null, msg: string) => {
    const id: string = item(name, build, 'wear', () => { if (worn.delete(id)) { toast(`Tirou: ${name}.`); return } worn.add(id); toast(msg + (acc ? ' (olha no espelho!)' : '')) })
    if (acc) ACC[id] = acc
    return id
  }
  ticks.push(() => {
    const av = state.avatar as unknown as THREE.Object3D | null; if (!av) return
    for (const id of Object.keys(ACC)) { if (!accs[id]) { const g = new THREE.Group(); ACC[id](g); av.add(g); accs[id] = g } accs[id].visible = worn.has(id) }
  })
  const idChapeu = wearable('Chapéu de palha', (g) => { cyl(0.1, 0.012, 0xe0c070, 0, 0, 0, g); cyl(0.055, 0.05, 0xe0c070, 0, 0.012, 0, g); cyl(0.057, 0.012, 0xc0392b, 0, 0.02, 0, g) }, (g) => { cyl(0.17, 0.012, 0xe0c070, 0, 1.1, 0, g); cyl(0.09, 0.08, 0xe0c070, 0, 1.11, 0, g); cyl(0.093, 0.015, 0xc0392b, 0, 1.12, 0, g) }, 'Colocou o chapéu de palha. Agora você é fazendeiro.')
  const idOculos = wearable('Óculos escuros', (g) => { box(0.05, 0.03, 0.01, 0x111111, -0.03, 0, 0, g); box(0.05, 0.03, 0.01, 0x111111, 0.03, 0, 0, g); box(0.02, 0.008, 0.01, 0x111111, 0, 0.01, 0, g) }, (g) => { box(0.07, 0.04, 0.02, 0x111111, -0.045, 1.03, -0.1, g); box(0.07, 0.04, 0.02, 0x111111, 0.045, 1.03, -0.1, g) }, 'Botou os óculos escuros. Dentro de casa. Atitude.')
  const idMoletom = wearable('Moletom do Smoll', (g) => { box(0.25, 0.3, 0.04, 0x3b3b44, 0, 0, 0, g); box(0.09, 0.2, 0.04, 0x3b3b44, -0.17, 0.08, 0, g); box(0.09, 0.2, 0.04, 0x3b3b44, 0.17, 0.08, 0, g) }, (g) => { box(0.3, 0.34, 0.2, 0x3b3b44, 0, 0.45, 0, g) }, 'Vestiu o moletom preto. Cheira a café e a deploy.')
  const idTenis = wearable('Tênis', (g) => { box(0.09, 0.05, 0.22, 0xf4f4f0, 0, 0, 0, g); box(0.09, 0.015, 0.22, 0xc0182c, 0, 0, 0, g) }, null, 'Calçou o tênis. Dá vontade de correr (não dá).')
  const idChinelo = wearable('Chinelo', (g) => { box(0.09, 0.02, 0.22, 0x2e86de, 0, 0, 0, g); box(0.09, 0.012, 0.05, 0xf4f4f0, 0, 0.02, -0.03, g) }, null, 'Calçou o chinelo. Rondônia aprova.')
  const idBota = wearable('Bota', (g) => { box(0.09, 0.14, 0.12, 0x4a3020, 0, 0, 0.04, g); box(0.09, 0.05, 0.22, 0x4a3020, 0, 0, 0, g) }, null, 'Calçou a bota. Pisa forte.')

  // ---------- VARANDA VIVA (x 1–6, z 11–15) ----------
  { const rm = new THREE.Mesh(new THREE.PlaneGeometry(1.6, 1.0), new THREE.MeshBasicMaterial({ map: tex(128, 80, (g, w, h) => { g.fillStyle = '#3a7d8c'; g.fillRect(0, 0, w, h); g.fillStyle = '#f1c40f'; for (let x = 8; x < w; x += 24) g.fillRect(x, 0, 8, h); g.strokeStyle = '#fff'; g.lineWidth = 4; g.strokeRect(2, 2, w - 4, h - 4) }) })); rm.rotation.x = -Math.PI / 2; rm.position.set(3.7, 0.012, 12.9); scene.add(rm) }
  // cadeira de balanço: senta e balança (a cadeira e a câmera)
  const rk = new THREE.Group(); rk.position.set(5.3, 0, 12.3); scene.add(rk)
  box(0.5, 0.05, 0.5, 0x8a5a2b, 0, 0.4, 0, rk); box(0.04, 0.5, 0.5, 0x8a5a2b, 0.25, 0.4, 0, rk); for (const rz of [-0.27, 0.27]) { box(0.04, 0.2, 0.5, 0x6a4a2a, 0, 0.4, rz, rk); box(0.7, 0.03, 0.04, 0x6a4a2a, 0, 0.05, rz, rk); box(0.04, 0.35, 0.04, 0x6a4a2a, -0.2, 0.05, rz, rk); box(0.04, 0.35, 0.04, 0x6a4a2a, 0.2, 0.05, rz, rk) }
  const rkSpot = { x: 5.3, y: 0.5, z: 12.3, yaw: Math.PI / 2 }
  sitAct(rk, [rkSpot], 'Sentar na cadeira de balanço'); block(5.0, 12.0, 5.6, 12.6, 0.45)
  ticks.push(() => { const me = state.seat?.key === spotKey(rkSpot); rk.rotation.z += ((me ? Math.sin(clock * 2.2) * 0.1 : 0) - rk.rotation.z) * 0.1; if (me && state.seat) state.seat.y = rkSpot.y + Math.sin(clock * 2.2) * 0.03 })
  // mesinha com baralho (21 contra o Smoll), dois banquinhos, binóculos e tereré
  const mesinha = box(0.7, 0.04, 0.7, 0x8a5a2b, 4.0, 0.6, 14.2); for (const [lx, lz] of [[3.7, 13.9], [4.3, 13.9], [3.7, 14.5], [4.3, 14.5]]) box(0.04, 0.6, 0.04, 0x6a4a2a, lx, 0, lz)
  block(3.65, 13.85, 4.35, 14.55, 0.64)
  for (const [bx, yw] of [[3.25, -Math.PI / 2], [4.75, Math.PI / 2]] as const) { sitAct(box(0.32, 0.4, 0.32, 0xb5651d, bx, 0, 14.2), [{ x: bx, y: 0.45, z: 14.2, yaw: yw }], 'Sentar no banquinho'); block(bx - 0.16, 14.04, bx + 0.16, 14.36, 0.4) }
  const CARTAS = [2, 3, 4, 5, 6, 7, 8, 9, 10, 10, 10, 10, 11]
  let bj = { p: [] as number[], s: [] as number[], fim: '' }; const bjPlacar = { v: 0, d: 0 }
  const soma = (a: number[]) => { let t = a.reduce((x, y) => x + y, 0), as = a.filter((c) => c === 11).length; while (t > 21 && as-- > 0) t -= 10; return t }
  const bjNova = () => { bj = { p: [pick(CARTAS), pick(CARTAS)], s: [pick(CARTAS), pick(CARTAS)], fim: '' } }
  const bjFim = (msg: string, v: boolean | null) => { bj.fim = msg; if (v === true) bjPlacar.v++; else if (v === false) bjPlacar.d++ }
  const bjPara = () => { while (soma(bj.s) < 17) bj.s.push(pick(CARTAS)); const p = soma(bj.p), s = soma(bj.s); if (s > 21 || p > s) bjFim('Você ganhou! 🎉', true); else if (p === s) bjFim('Empate.', null); else bjFim('O Smoll ganhou. "Sorte de principiante… minha."', false) }
  const carta = (c: number) => `<span style="background:#f4f1e8;color:#222;border-radius:4px;padding:2px 6px;margin:2px;display:inline-block">${c === 11 ? 'A' : c}</span>`
  act(mesinha, 'Jogar 21 com o Smoll', () => { if (!bj.p.length || bj.fim) bjNova(); openPanel('🃏 Vinte-e-um contra o Smoll', () => `Você: ${bj.p.map(carta).join('')} = <b>${soma(bj.p)}</b><br>Smoll: ${bj.fim ? bj.s.map(carta).join('') + ` = <b>${soma(bj.s)}</b>` : carta(bj.s[0]) + carta(0).replace('>0<', '>?<')}<p>${bj.fim || 'Chegue perto de 21 sem passar. Pedir ou parar?'}<br>Placar: você ${bjPlacar.v} · Smoll ${bjPlacar.d}</p>`, [
    { t: '➕ Pedir carta', keep: true, fn: () => { if (bj.fim) return; bj.p.push(pick(CARTAS)); if (soma(bj.p) > 21) bjFim('Estourou! O Smoll ri. 💥', false) } },
    { t: '✋ Parar', keep: true, fn: () => { if (!bj.fim) bjPara() } },
    { t: '🔄 Nova mão', keep: true, fn: bjNova },
  ]) })
  const idBaralho = item('Baralho', (g) => { box(0.07, 0.025, 0.1, 0xf4f4f0, 0, 0, 0, g); box(0.06, 0.026, 0.09, 0xc0182c, 0, 0, 0, g) })
  thing(3.85, 0.64, 14.0, 'Pegar o baralho', ['Baralho com 51 cartas. O Smoll jura que sempre foram 51.', 'Baralho de truco, manchado de tereré.'], ITEMS[idBaralho].build!)
  const idBino = item('Binóculos', (g) => { cyl(0.025, 0.1, 0x222222, -0.03, 0, 0, g).rotation.x = Math.PI / 2; cyl(0.025, 0.1, 0x222222, 0.03, 0, 0, g).rotation.x = Math.PI / 2; box(0.04, 0.02, 0.04, 0x444444, 0, 0, 0, g) }, undefined, () => { zoomCam(4000); toast('Olhou pelos binóculos. Tudo ficou bem de pertinho. 🔭') })
  thing(4.2, 0.64, 14.4, 'Pegar os binóculos', ['Binóculos do Smoll. Ele diz que é pra ver passarinho.'], ITEMS[idBino].build!)
  cyl(0.05, 0.14, 0x2e86de, 3.8, 0.64, 14.4); cyl(0.02, 0.1, 0x9fd0e8, 3.8, 0.78, 14.4) // garrafa de tereré
  // vasos que crescem, regador e gaiola de passarinho
  mkPlant(5.7, 0, 14.65, 'flor', true); mkPlant(5.7, 0, 11.45, 'flor', true); mkPlant(2.6, 0, 14.65, 'pimenta', true)
  thing(5.45, 0, 14.2, 'Pegar o regador', ['Regador verde. A rosa dele entope toda semana.', 'Regador cheio pela metade. Meio vazio, dependendo do humor.'], ITEMS[idRegador].build!)
  box(0.006, 0.7, 0.006, 0x222222, 5.35, 1.95, 13.4); const gaiola = new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.13, 0.28, 12, 1, true), new THREE.MeshBasicMaterial({ color: 0xc9b037, wireframe: true })); gaiola.position.set(5.35, 1.8, 13.4); scene.add(gaiola)
  cyl(0.13, 0.015, 0x8a5a2b, 5.35, 1.66, 13.4); sph(0.04, 0xf2d030, 5.35, 1.74, 13.4, scene); sph(0.025, 0xf2d030, 5.38, 1.79, 13.4, scene)
  const gaiolaHit = hit(0.34, 0.4, 0.34, 5.35, 1.65, 13.4); let cantaT = 4
  act(gaiolaHit, 'Conversar com o passarinho', () => { tweet(0.09); toast(pick(['Piu piu! (traduzindo: cadê o milho?)', 'O passarinho cantou o início de "Evidências".', 'Ele inclinou a cabeça e te julgou.'])) }, (id, kind) => {
    if (kind === 'food') { tweet(0.1); toast(`O passarinho bicou ${ITEMS[id].name} e cantou de felicidade. 🐦`); return 'consume' } toast('Ele não quer isso.'); return true
  })
  ticks.push((dt) => { if ((cantaT -= dt) > 0) return; cantaT = 7 + Math.random() * 8; const d = Math.hypot(playerPos.x - 5.35, playerPos.z - 13.4), h = gameHour(); if (d < 10 && h > 5.5 && h < 18.5) tweet(0.07 * (1 - d / 10)) })
  // varal pequeno e chinelos na porta
  for (const pz of [13.0, 14.1]) cyl(0.03, 1.9, 0x777777, 5.85, 0, pz); box(0.015, 0.015, 1.1, 0xdddddd, 5.85, 1.88, 13.55)
  ;(['shirt', 'briefs', 'shorts'] as const).forEach((kd, i) => { const pv = new THREE.Group(); pv.position.set(5.85, 1.87, 13.25 + i * 0.3); pv.rotation.y = Math.PI / 2; scene.add(pv); const m = new THREE.Mesh(new THREE.PlaneGeometry(0.26, 0.3), new THREE.MeshBasicMaterial({ map: garment(kd, ['#e0b21c', '#2f7fc1', '#d64532'][i]), transparent: true, alphaTest: 0.4, side: THREE.DoubleSide })); m.position.y = -0.17; pv.add(m); swing.push({ pivot: pv, phase: i * 2.1 }) })
  thing(4.3, 0, 11.55, 'Pegar o chinelo', ['Chinelo azul de dedo. Um pé só, claro.', 'Chinelo da varanda, gasto no calcanhar.'], ITEMS[idChinelo].build!)
  thing(4.5, 0, 11.65, 'Pegar o chinelo', ['Chinelo do outro pé. Milagre, achou o par.'], ITEMS[idChinelo].build!)

  // ---------- CORREDOR VIVO (x 1–19, z 7–10) ----------
  const runner = (x: number, w: number) => { const m = new THREE.Mesh(new THREE.PlaneGeometry(w, 0.8), new THREE.MeshBasicMaterial({ map: tex(256, 48, (g, cw, ch) => { g.fillStyle = '#7a2e2e'; g.fillRect(0, 0, cw, ch); g.strokeStyle = '#e0c48a'; g.lineWidth = 4; g.strokeRect(4, 4, cw - 8, ch - 8); g.fillStyle = '#e0c48a'; for (let i = 24; i < cw; i += 32) g.fillRect(i, 20, 12, 8) }) })); m.rotation.x = -Math.PI / 2; m.position.set(x, 0.011, 8.5); scene.add(m) }
  runner(5.5, 3.4); runner(14, 3.4)
  // quadro de disjuntores: um painel por cômodo
  box(0.5, 0.7, 0.08, 0x8a9096, 7.5, 0.95, 7.04); box(0.4, 0.6, 0.02, 0x5a6066, 7.5, 1.0, 7.09); for (let i = 0; i < 8; i++) box(0.04, 0.07, 0.025, [0x30e060, 0xc0182c][i % 2], 7.36 + (i % 4) * 0.09, 1.12 - Math.floor(i / 4) * 0.2, 7.105)
  const quadroDisj = hit(0.55, 0.75, 0.2, 7.5, 0.95, 7.1)
  act(quadroDisj, 'Abrir o quadro de disjuntores', () => openPanel('⚡ Quadro de disjuntores', () => ROOMS.map((r, i) => `<b>${r}</b>: ${energy.rooms[i]?.on() ? '💡 luz acesa' : 'luz apagada'} · ${breakerOff.has(r) ? '🔴 <b>DESARMADO</b>' : '🟢 armado'}`).join('<br>') + `<br><br>🔌 Disjuntor geral: ${state.power ? 'ligado' : 'DESLIGADO'}`, [
    ...ROOMS.map((r, i) => ({ t: `${breakerOff.has(r) ? '🟢 Armar' : '🔴 Desarmar'} ${r}`, keep: true, fn: () => {
      if (breakerOff.delete(r)) { toast(`Disjuntor ${r} armado.`); return }
      breakerOff.add(r); energy.rooms[i]?.off(); if (r === 'sala') fans[0].userData.on = false; if (r === 'quarto') fans[1].userData.on = false
      toast(r === 'quarto' ? 'Smoll: QUEM DESARMOU O MEU QUARTO?! (o PC dele também…)' : `Disjuntor ${r} desarmado. Escuro lá.`)
    } })),
    { t: '🟢 Armar todos', keep: true, fn: () => { breakerOff.clear(); toast('Todos os disjuntores armados.') } },
  ]))
  // quadro, extintor, sapateira, cabideiro, porta-chaves e interfone
  const fotoBebe = wallPlane(0.42, 0.32, tex(128, 96, (g, w, h) => { g.fillStyle = '#5a3a22'; g.fillRect(0, 0, w, h); g.fillStyle = '#e8d8a8'; g.fillRect(8, 8, w - 16, h - 16); g.fillStyle = '#c68e65'; g.beginPath(); g.arc(64, 48, 22, 0, 7); g.fill(); g.fillStyle = '#222'; g.fillRect(52, 42, 6, 6); g.fillRect(70, 42, 6, 6) }), 8.8, 1.5, 7.015, 0)
  act(fotoBebe, 'Ver a foto na parede', () => toast(pick(['Smoll bebê. Já tinha cara de quem ia debugar a vida.', 'Foto de formatura: ele sorriu, é raro.'])))
  box(0.1, 0.35, 0.04, 0x333333, 5.45, 0.45, 7.03); thing(5.45, 0.5, 7.12, 'Pegar o extintor', ['Extintor do corredor. Sempre à vista, nunca usado.'], B_EXT)
  box(1.4, 0.9, 0.03, 0x6e5435, 13.0, 0, 7.015); for (const sx of [12.3, 13.7]) box(0.04, 0.9, 0.35, 0x6e5435, sx, 0, 7.18); for (const sy of [0.02, 0.3, 0.58, 0.88]) box(1.4, 0.03, 0.35, 0x6e5435, 13.0, sy, 7.18)
  block(12.3, 7.0, 13.7, 7.37, 0.9)
  thing(12.6, 0.05, 7.2, 'Pegar o tênis', ['Tênis branco sujo de barro vermelho. Rondônia deixa marca.'], ITEMS[idTenis].build!)
  thing(13.2, 0.05, 7.2, 'Pegar o tênis', ['Tênis de corrida que nunca correu.'], ITEMS[idTenis].build!)
  thing(12.7, 0.33, 7.2, 'Pegar o chinelo', ['Chinelo de dedo da entrada.'], ITEMS[idChinelo].build!)
  thing(13.2, 0.61, 7.2, 'Pegar a bota', ['Bota de trabalho. Pesa mais que o Smoll.'], ITEMS[idBota].build!)
  box(1.4, 0.08, 0.03, 0x5a3a22, 6.7, 1.7, 9.985); for (const hx of [6.2, 6.7, 7.2]) box(0.02, 0.1, 0.06, 0xc9b037, hx, 1.45, 9.94)
  thing(6.2, 1.5, 9.93, 'Pegar o chapéu de palha', ['Chapéu de palha do cabideiro. Protege do sol e da vergonha.'], ITEMS[idChapeu].build!)
  thing(6.7, 1.52, 9.93, 'Pegar os óculos escuros', ['Óculos escuros. Smoll só usa pra fingir que dormiu bem.'], ITEMS[idOculos].build!)
  thing(7.2, 1.2, 9.93, 'Pegar o moletom do Smoll', ['Moletom do Smoll, pendurado. Tem mais cheiro de café do que de sabão.'], ITEMS[idMoletom].build!)
  const idChaveM = item('Chave da moto', (g) => { cyl(0.02, 0.01, 0xd4af37, 0, 0, 0, g); box(0.012, 0.012, 0.06, 0xcccccc, 0, 0, -0.04, g) }, undefined, () => toast('Chave da moto. Vá até a moto e aperte E: ela já liga sem chave, o Smoll nunca fechou o contato.'))
  const idChaveC = item('Chave do carro', (g) => { cyl(0.02, 0.01, 0x333333, 0, 0, 0, g); box(0.012, 0.012, 0.06, 0xcccccc, 0, 0, -0.04, g) }, undefined, () => toast('Chave do carro. Tá sem bateria no controle, mas o carro abre no braço.'))
  const idChaveP = item('Chave do portão', (g) => { box(0.03, 0.012, 0.04, 0x2e86de, 0, 0, 0, g); cyl(0.004, 0.012, 0xcccccc, 0, 0.012, 0, g) }, undefined, () => { if (Math.hypot(playerPos.x - 28, playerPos.z - 3.5) > 14) { toast('Longe demais do portão. O controle não alcança.'); return } setGate(!state.gateOpen); toast(state.gateOpen ? 'Portão abrindo… 🔓' : 'Portão fechando… 🔒') })
  box(0.4, 0.3, 0.03, 0x5a3a22, 17.4, 1.05, 9.985); for (const kx of [17.27, 17.4, 17.53]) box(0.015, 0.03, 0.04, 0xc9b037, kx, 1.3, 9.95)
  thing(17.27, 1.1, 9.93, 'Pegar a chave da moto', ['Chave da moto, com chaveiro da Honda.'], ITEMS[idChaveM].build!)
  thing(17.4, 1.1, 9.93, 'Pegar a chave do carro', ['Chave do carro, com um chaveiro de manga.'], ITEMS[idChaveC].build!)
  thing(17.53, 1.1, 9.93, 'Pegar a chave do portão', ['Controle do portão. Aperta e a garagem obedece (ou não).'], ITEMS[idChaveP].build!)
  box(0.18, 0.26, 0.04, 0x222222, 18.4, 1.27, 9.975); box(0.12, 0.09, 0.01, 0x103a2a, 18.4, 1.38, 9.945); box(0.04, 0.04, 0.012, 0xe0c030, 18.4, 1.3, 9.945)
  const interfone = hit(0.24, 0.32, 0.12, 18.4, 1.27, 9.95)
  const hhmm = (h: number) => `${String(Math.floor(h)).padStart(2, '0')}:${String(Math.floor((h % 1) * 60)).padStart(2, '0')}`
  act(interfone, 'Usar o interfone', () => openPanel('📹 Interfone / câmera da porta', () => `Portão: <b>${state.gateOpen ? 'aberto' : 'fechado'}</b><br><b>Quem tocou a campainha:</b><br>${bellLog.length ? bellLog.map((b) => `${hhmm(b.h)} — ${b.who}${b.n > 1 ? ` (tocou ${b.n}x, irritante)` : ''}`).join('<br>') : '<i>Ninguém tocou ainda. Que paz.</i>'}`, [
    { t: '📣 "Quem é?"', keep: true, fn: () => toast(pick(['"É o iFood!" (ninguém pediu)', '"É amigo!" (ninguém tem)', '"Entrega pro Smoll." (suspeito)', 'Só chiado e um cachorro latindo.'])) },
    { t: '🔓 Abrir o portão', fn: () => { setGate(true); toast('Portão aberto pelo interfone. (fecha sozinho em 12 s)'); setTimeout(() => setGate(false), 12000) } },
    { t: '🔒 Fechar o portão', fn: () => setGate(false) },
  ]))
  // espelho de corpo inteiro: mostra o seu avatar e as roupas que você vestiu
  const mir2 = new Reflector(new THREE.PlaneGeometry(0.7, 1.5), { textureWidth: 512, textureHeight: 768, color: 0xd6e6ec, clipBias: 0.003 })
  mir2.position.set(12.5, 1.05, 9.985); mir2.rotation.y = Math.PI; scene.add(mir2)
  const mir2Draw = mir2.onBeforeRender
  mir2.onBeforeRender = function (this: THREE.Object3D, ...a: unknown[]) { const av = state.avatar; if (av) av.visible = true; (mir2Draw as (...x: unknown[]) => void).apply(this, a); if (av) av.visible = false }
  for (const [w, h, x, y] of [[0.78, 0.04, 12.5, 1.8], [0.78, 0.04, 12.5, 0.28], [0.04, 1.56, 12.11, 0.28], [0.04, 1.56, 12.89, 0.28]]) box(w, h, 0.04, 0x5a3a22, x, y, 9.975)
  ticks.push(() => { mir2.visible = Math.hypot(playerPos.x - 12.5, playerPos.z - 9) < 6 })
  act(mir2, 'Olhar no espelho de corpo inteiro', () => toast(worn.size ? `Você está usando: ${[...worn].map((id) => ITEMS[id].name).join(', ')}. Ficou ${pick(['ótimo', 'duvidoso', 'a cara do Smoll'])}.` : pick(['Corpo inteiro. Falta vestir alguma coisa pra ficar interessante.', 'O espelho mostra o seu avatar. Tá bonito.'])))
  // ---------- GARAGEM VIVA (x 20–28, z 1–6) ----------
  box(2.0, 1.6, 0.03, 0x6e5435, 22, 0, 1.015); for (const sx of [21.0, 23.0]) box(0.04, 1.6, 0.35, 0x6e5435, sx, 0, 1.2)
  for (const sy of [0.02, 0.5, 0.95, 1.4]) box(2.0, 0.04, 0.35, 0x6e5435, 22, sy, 1.2)
  block(21.0, 1.0, 23.0, 1.4, 1.6)
  const idGalao = item('Galão de gasolina', (g) => { box(0.16, 0.22, 0.08, 0xc0182c, 0, 0, 0, g); cyl(0.025, 0.04, 0x222222, 0.04, 0.22, 0, g) }, undefined, () => toast('Galão de gasolina. Cheiro forte, bem longe da churrasqueira.'))
  thing(21.4, 0.54, 1.2, 'Pegar o galão de gasolina', ['Galão com meio litro. O resto o Smoll "emprestou" pra moto.'], ITEMS[idGalao].build!)
  thing(22.0, 0.54, 1.2, 'Pegar a lata de óleo', ['Lata de óleo de motor 20W50. Pra moto e pra dor de cabeça.'], (g) => { cyl(0.05, 0.12, 0x2a5db0, 0, 0, 0, g); cyl(0.052, 0.02, 0xf1c40f, 0, 0.06, 0, g) })
  { const pn = new THREE.Mesh(new THREE.TorusGeometry(0.2, 0.06, 8, 18), lm(0x151515)); pn.position.set(22.3, 1.08, 1.2); pn.rotation.x = Math.PI / 2; scene.add(pn); pn.rotation.x = 0.3 } // pneu velho na prateleira
  thing(21.5, 1.0, 1.2, 'Pegar o martelo', ['Mais um martelo. Esse o Smoll jura que é "o bom".'], ITEMS[idMartelo].build!)
  // bola de futebol: E chuta na direção do olhar (vira objeto solto com física, dá pra pegar de novo)
  const idBola = item('Bola de futebol', (g) => { sph(0.11, 0xf4f4f0, 0, 0.11, 0, g); for (const [bx, by, bz] of [[0.1, 0.11, 0], [-0.1, 0.11, 0], [0, 0.21, 0], [0, 0.11, 0.1], [0, 0.11, -0.1]]) sph(0.035, 0x111111, bx, by, bz, g) }, undefined, () => toast(pick(['Quicou a bola. Toc toc toc.', 'Você fez embaixadinha: 1. (Dois, só se ninguém contar.)'])))
  const bolaProp = new THREE.Group(); bolaProp.position.set(22.8, 0, 8.7); scene.add(bolaProp); ITEMS[idBola].build!(bolaProp)
  act(bolaProp, 'Chutar a bola', () => { kick(idBola, new THREE.Vector3(bolaProp.position.x, 0.4, bolaProp.position.z), 7, 3.5); bolaProp.visible = false; setTimeout(() => (bolaProp.visible = true), 25000); toast(pick(['GOOOOL! (na casa do vizinho)', 'Chutou lá no alto. Vai buscar!', 'Bicuda! A bola foi longe. 🥅'])) })
  thing(21.6, 0.96, 1.2, 'Pegar a bola de futebol', ['Bola murcha, mas ainda rola.', 'Bola do Smoll, assinada por ninguém.'], ITEMS[idBola].build!)
  // ---------- QUINTAL VIVO (x 20–28, z 6–16) ----------
  // rede de vôlei e ferramentas de jardim encostadas na parede da casa
  for (const pz of [8.8, 12.2]) cyl(0.04, 2.3, 0x777777, 20.5, 0, pz)
  const redeV = new THREE.Mesh(new THREE.PlaneGeometry(3.4, 0.9), new THREE.MeshBasicMaterial({ map: tex(128, 40, (g, w, h) => { g.strokeStyle = '#eee'; g.lineWidth = 2; for (let x = 0; x < w; x += 8) { g.beginPath(); g.moveTo(x, 0); g.lineTo(x, h); g.stroke() } for (let y = 0; y < h; y += 8) { g.beginPath(); g.moveTo(0, y); g.lineTo(w, y); g.stroke() } g.fillStyle = '#eee'; g.fillRect(0, 0, w, 5) }), transparent: true, side: THREE.DoubleSide, alphaTest: 0.3 }))
  redeV.position.set(20.5, 1.85, 10.5); redeV.rotation.y = Math.PI / 2; scene.add(redeV)
  act(redeV, 'Jogar vôlei', () => toast(pick(['Sem bola e sem time. Mas a rede tá armada.', 'O Smoll diria "bora" e voltaria pro PC em 3 minutos.'])), (id) => { if (id === idBola) { toast('Você bateu a bola por cima da rede. Ace! 🏐'); return true } toast('Isso não é bola.'); return true })
  for (const [nome, z, hh] of [['a enxada', 13.4, 0.9], ['a pá', 13.7, 0.85], ['o rastelo', 14.0, 0.9]] as [string, number, number][]) {
    const tb = (g: THREE.Group) => { cyl(0.012, hh, 0x8a5a2b, 0, 0, 0, g); box(0.14, 0.02, 0.06, 0x777777, 0, hh, 0, g) }
    item(nome.replace(/^(a|o) /, '').replace(/^./, (c) => c.toUpperCase()), tb, undefined, () => toast('Ferramenta de jardim. Bonita, mas a horta se regada resolve mais.'))
    thing(20.25, 0, z, `Pegar ${nome}`, ['Ferramenta de jardim. Ainda tem terra vermelha do último uso.'], tb)
  }
  // piscina de plástico (boiar) e trampolim
  { const rg = new THREE.Mesh(new THREE.CylinderGeometry(1.0, 1.0, 0.3, 24, 1, true), new THREE.MeshLambertMaterial({ color: 0x2e86de, side: THREE.DoubleSide })); rg.position.set(22.4, 0.15, 10.3); scene.add(rg) }
  const agua = new THREE.Mesh(new THREE.CylinderGeometry(0.96, 0.96, 0.02, 24), new THREE.MeshLambertMaterial({ color: 0x6ec6ff, transparent: true, opacity: 0.8 })); agua.position.set(22.4, 0.22, 10.3); scene.add(agua)
  sitAct(agua, [{ x: 22.4, y: 0.3, z: 10.3, yaw: Math.PI / 2 }], 'Boiar na piscina')
  const tramp = new THREE.Group(); tramp.position.set(25.2, 0, 11.3); scene.add(tramp)
  cyl(0.8, 0.04, 0x1a1a1a, 0, 0.42, 0, tramp); for (let i = 0; i < 6; i++) cyl(0.03, 0.42, 0x888888, Math.cos(i * 1.047) * 0.75, 0, Math.sin(i * 1.047) * 0.75, tramp)
  let bT = 0; ticks.push((dt) => { bT = Math.max(0, bT - dt); tramp.children[0].position.y = 0.44 - Math.sin(Math.min(1, (1 - bT / 0.8) * 3) * Math.PI) * 0.06 * (bT > 0 ? 1 : 0) })
  act(tramp, 'Pular no trampolim', () => { bT = 0.8; toast(pick(['Boing! Você subiu até a copa da mangueira (na imaginação).', 'Pulou 10 vezes. O Smoll olhou da janela e achou que era terremoto.', 'Boing boing! A cintura reclamou.'])) })
  // galinheiro: ovos pegáveis e três galinhas passeando
  box(0.9, 0.8, 1.1, 0x9a6b3a, 27.5, 0.2, 11.6); box(1.0, 0.06, 1.2, 0x7a2e14, 27.5, 1.0, 11.6); box(0.4, 0.06, 1.0, 0x8a5a2b, 27.15, 0.2, 11.6); for (const lz of [11.1, 12.1]) box(0.04, 0.2, 0.04, 0x6a4a2a, 27.0, 0, lz)
  block(26.95, 11.0, 28, 12.2, 1.0)
  for (const ez of [11.3, 11.6, 11.9]) thing(27.1, 0.26, ez, 'Pegar o ovo', ['Ovo fresquinho, ainda quentinho da galinha.', 'Ovo caipira de gema bem alaranjada.'], ITEMS[idOvo].build!)
  const galinhas = [0xf4f1e8, 0xb5651d, 0xf4d9a8].map((c, i) => {
    const g = new THREE.Group(); g.position.set(26.5 + i * 0.5, 0, 10.8 + i * 0.5); scene.add(g)
    sph(0.1, c, 0, 0.17, 0, g, 0.85); sph(0.05, c, -0.1, 0.27, 0, g); box(0.04, 0.02, 0.02, 0xf08a20, -0.16, 0.26, 0, g); box(0.02, 0.025, 0.02, 0xc0182c, -0.1, 0.33, 0, g); box(0.1, 0.1, 0.03, c, 0.1, 0.2, 0, g); box(0.012, 0.1, 0.012, 0xf08a20, 0, 0.0, 0.03, g); box(0.012, 0.1, 0.012, 0xf08a20, 0, 0.0, -0.03, g)
    const o = { g, tx: g.position.x, tz: g.position.z, w: Math.random() * 3 }
    act(g, 'Fazer carinho na galinha', () => { cluck(0.1); toast(pick(['Có có có! (Ela quer milho.)', 'A galinha ciscou seu pé. Respeito.', 'Ela botou um olhar de desprezo e foi embora.'])) }, (id, kind) => {
      if (kind === 'food') { cluck(0.12); if (Math.random() < 0.5 && giveItem(idOvo)) toast(`A galinha comeu ${ITEMS[id].name} e botou um ovo na hora! 🥚`); else toast(`A galinha bicou ${ITEMS[id].name}. Satisfeita.`); return 'consume' }
      toast('Ela não quer isso.'); return true
    })
    return o
  })
  ticks.push((dt) => galinhas.forEach((h, i) => {
    if ((h.w -= dt) <= 0) { h.w = 2 + Math.random() * 4; h.tx = 26.2 + Math.random() * 1.6; h.tz = 10.4 + Math.random() * 2.4; if (Math.abs(h.tx - 27.4) < 0.7 && Math.abs(h.tz - 11.6) < 0.7) h.tx = 26.3 }
    const dx = h.tx - h.g.position.x, dz = h.tz - h.g.position.z, d = Math.hypot(dx, dz)
    if (d > 0.05) { h.g.position.x += (dx / d) * 0.35 * dt; h.g.position.z += (dz / d) * 0.35 * dt; h.g.rotation.y = Math.atan2(-dz, dx) + Math.PI; h.g.position.y = Math.abs(Math.sin(clock * 9 + i)) * 0.015 }
  }))
  // horta: 8 plantas em dois canteiros, regador, mangueira em carretel
  ;([[22.4, ['tomate', 'cenoura', 'tomate', 'cenoura']], [23.7, ['alface', 'pimenta', 'alface', 'pimenta']]] as [number, string[]][]).forEach(([hx, ks]) => ks.forEach((k, i) => mkPlant(hx - 0.25 + (i % 2) * 0.5, 0.25, 15.45 + Math.floor(i / 2) * 0.3, k as keyof typeof CROP, false)))
  thing(24.45, 0, 15.0, 'Pegar o regador', ['Regador da horta, com o furinho da rosa quebrado.'], ITEMS[idRegador].build!)
  cyl(0.2, 0.12, 0x2e9a3c, 20.2, 0.4, 15.4).rotation.z = Math.PI / 2; box(0.1, 0.2, 0.2, 0x555555, 20.1, 0.1, 15.4)
  const spray = new THREE.Points(new THREE.BufferGeometry(), new THREE.PointsMaterial({ color: 0x9fd8ff, size: 0.04, transparent: true, opacity: 0.8 })); const spPos = new Float32Array(50 * 3)
  spray.geometry.setAttribute('position', new THREE.BufferAttribute(spPos, 3)); spray.frustumCulled = false; spray.visible = false; scene.add(spray)
  let sprayT = 0
  ticks.push((dt) => {
    if (sprayT <= 0) return
    sprayT -= dt; spray.visible = sprayT > 0
    for (let i = 0; i < 50; i++) { const t = ((clock * 1.4 + i / 50) % 1); spPos[i * 3] = 20.5 + t * 3.4; spPos[i * 3 + 1] = 0.7 + t * 0.9 - t * t * 1.5; spPos[i * 3 + 2] = 15.4 + Math.sin(i * 7) * 0.12 * t }
    spray.geometry.attributes.position.needsUpdate = true
    if (sprayT <= 0) { const n = waterPlants(22.6, 15.5, 3); toast(n ? `A mangueira molhou a horta (${n} plantas). 💦` : 'A mangueira molhou o chão. 💦') }
  })
  const hoseHit = hit(0.5, 0.5, 0.5, 20.3, 0.1, 15.4)
  act(hoseHit, () => (sprayT > 0 ? 'A mangueira tá aberta' : 'Abrir a mangueira (rega a horta)'), () => { if (sprayT > 0) return; sprayT = 6; toast('Abriu a mangueira. Cuidado pra não molhar o vizinho. 💦') }, (id) => {
    if (id === idCopo) { takeItem(idCopo); giveItem(idAgua); toast('Encheu o copo na mangueira. Água com gosto de borracha. 💧'); return true }
    toast('Só dá pra encher copo ou lavar a mão.'); return true
  })
  world.acao.regar = () => { sprayT = 6; waterPlants(22.6, 15.5, 3); toast('Smoll abriu a mangueira e regou a horta. 🌱💦') }
  // tanque de lavar roupa: clique com uma roupa na mão e ela volta lavada em 5 s
  const tFlow = cyl(0.01, 0.2, 0x7ec8ff, 27.2, 0.8, 15.2); tFlow.visible = false; let lavando = 0
  act(tanque, () => (lavando ? 'Lavando roupa…' : 'Abrir a torneira do tanque'), () => { tFlow.visible = true; setTimeout(() => (tFlow.visible = lavando > 0), 3000); toast('Água quente. É Rondônia, mano. Pra lavar roupa, clica com a roupa na mão.') }, (id, kind) => {
    if (kind !== 'wear') { toast('O tanque é pra roupa. Cara, isso aí não.'); return true }
    if (/lavad/i.test(ITEMS[id].name)) { toast('Essa já tá limpinha.'); return true }
    const nm = ITEMS[id].name, nid = item(`${nm} (lavado)`, ITEMS[id].build!, 'wear', ITEMS[id].use)
    lavando++; tFlow.visible = true; toast(`Ensaboando ${nm}… (5 s) 🧼`)
    setTimeout(() => { lavando--; tFlow.visible = lavando > 0; if (giveItem(nid)) toast(`${nm} lavado e cheiroso. 🧺`) }, 5000)
    return 'consume'
  })
  // churrasqueira de verdade: carnes no carvão, ponto da carne (cru → ponto → passada → queimou)
  const mkMeat = (n: string, c: number, nc: number, w: number) => item(n, (g) => { box(w, 0.03, 0.07, c, 0, 0, 0, g); box(w * 0.9, 0.012, 0.05, nc, 0, 0.03, 0, g) })
  const RAW: Record<string, string> = {
    [mkMeat('Picanha', 0xf4f4f0, 0xb03040, 0.12)]: item('Picanha no ponto', (g) => { box(0.12, 0.03, 0.07, 0x7a4a2a, 0, 0, 0, g) }, 'food'),
    [mkMeat('Linguiça', 0xe8a090, 0xd07060, 0.14)]: item('Linguiça no ponto', (g) => { box(0.14, 0.03, 0.05, 0x8a4a2a, 0, 0, 0, g) }, 'food'),
    [mkMeat('Espetinho', 0xe0d0b0, 0xb03040, 0.15)]: item('Espetinho no ponto', (g) => { box(0.15, 0.02, 0.03, 0x8a4a2a, 0, 0, 0, g); box(0.18, 0.006, 0.006, 0xcccccc, 0, 0.02, 0, g) }, 'food'),
    [idCarne]: idBife,
  }
  const idPassada = item('Carne passada', (g) => { box(0.12, 0.03, 0.07, 0x3a2418, 0, 0, 0, g) }, 'food')
  const grelha: ({ m: THREE.Mesh; t: number; id: string } | null)[] = [null, null, null, null], GX = [25.85, 26.07, 26.33, 26.55]
  const flamas = [0, 1, 2, 3, 4].map((i) => { const f = new THREE.Mesh(new THREE.ConeGeometry(0.05, 0.12, 8), bm(0xff8a20)); f.position.set(25.85 + i * 0.18, 0.99, 15.5 + (i % 2) * 0.15); f.visible = false; scene.add(f); return f })
  const setFire = (on: boolean) => { fire.intensity = on ? 4 : 0; (coal.material as THREE.MeshLambertMaterial).color.set(on ? 0xff4a10 : 0x222222) }
  const poe = (id: string, t0 = 0) => { const i = grelha.indexOf(null); if (i < 0) return false; const m = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.04, 0.07), lm(0xd8707a)); m.position.set(GX[i], 0.96, 15.65); scene.add(m); grelha[i] = { m, t: t0, id }; return true }
  const resultado = (s: { t: number; id: string }) => (s.t < 8 ? s.id : s.t < 20 ? RAW[s.id] : s.t < 30 ? idPassada : idQueimada)
  ticks.push((dt) => {
    flamas.forEach((f, i) => { f.visible = fire.intensity > 0; f.scale.y = 0.8 + Math.sin(clock * 18 + i * 2) * 0.3 })
    if (!fire.intensity) return
    grelha.forEach((s, i) => {
      if (!s) return
      const t0 = s.t; s.t += dt
      ;(s.m.material as THREE.MeshLambertMaterial).color.set(s.t < 8 ? 0xd8707a : s.t < 20 ? 0x8a4a2a : s.t < 30 ? 0x3a2418 : 0x111111)
      if (t0 < 8 && s.t >= 8) { chime(0.05); toast('A carne chegou no PONTO! 🥩 Tira do fogo (E no carvão).') }
      if (t0 < 20 && s.t >= 20) toast('Passou do ponto… vai ficar torradinha. 🔥')
      if (t0 < 30 && s.t >= 30) toast('Queimou! Fumaça e cheiro de carvão. 💨')
      void i
    })
  })
  act(coal, () => (grelha.some(Boolean) ? 'Tirar a carne do fogo' : fire.intensity ? 'Apagar o carvão' : 'Acender o carvão'), () => {
    const i = grelha.findIndex(Boolean)
    if (i >= 0) { const s = grelha[i]!, out = resultado(s); if (giveItem(out)) { scene.remove(s.m); grelha[i] = null; toast(`Tirou: ${ITEMS[out].name}. ${out === RAW[s.id] ? 'No ponto! Chef de churrasco. 🏆' : out === s.id ? 'Ainda tá crua! Volta ela pro fogo.' : ''}`) } return }
    setFire(!fire.intensity); if (fire.intensity) toast('Cheiro de churrasco. Cadê a carne? (tem na caixa de isopor ao lado)')
  }, (id) => {
    if (id === idExt) { if (fire.intensity) { setFire(false); toast('Pssshhh! Você apagou o carvão com um extintor. Eficiente. Sem churrasco hoje. 🧯') } else toast('Já tá apagado.'); return true }
    if (!(id in RAW)) { toast('Isso não vai na churrasqueira.'); return true }
    if (!fire.intensity) { toast('Acende o carvão primeiro (E no carvão).'); return true }
    if (!poe(id)) { toast('A grelha tá cheia (4 peças).'); return true }
    toast(`Pôs ${ITEMS[id].name} na grelha. Espera chegar no ponto (~10 s).`); sizzle(0.08, 3); return 'consume'
  })
  const isopor = box(0.5, 0.3, 0.35, 0xe8e8e8, 25.2, 0, 15.45); box(0.52, 0.05, 0.37, 0x2e86de, 25.2, 0.3, 15.45)
  const geladeiraBox = [...Object.keys(RAW).filter((k) => k !== idCarne).map((id) => ({ id, n: 3 })), { id: 'kuat', n: 3 }]
  act(isopor, 'Abrir a caixa de isopor', () => { clink(); openChest('🧊 Caixa de isopor (churrasco)', geladeiraBox) }, stash(geladeiraBox))
  block(24.95, 15.25, 25.45, 15.65, 0.35)
  world.acao.churrasco = () => { setFire(true); poe(Object.keys(RAW)[0]); poe(Object.keys(RAW)[1]); toast('Smoll acendeu o carvão e pôs picanha e linguiça. 🔥🥩') }
  world.acao.churrascoFim = () => { grelha.forEach((s, i) => { if (s) { scene.remove(s.m); grelha[i] = null } }); setFire(false); if (giveItem(RAW[Object.keys(RAW)[0]])) toast('Smoll te passou uma picanha no ponto! 🥩 (mochila)') }

  // ---------- LUZES E INTERRUPTORES ----------
  // cada cômodo tem lâmpada(s) de teto e um interruptor na parede (ventilador tem o seu ao lado). Começam apagadas: de dia a casa já está clara.
  type Lamp = { set(on: boolean): void }
  const pl = (l: THREE.PointLight, i: number, bulbMesh?: THREE.Mesh): Lamp => ({ set(on) { l.intensity = on ? i : 0; (bulbMesh?.material as THREE.MeshBasicMaterial | undefined)?.color.set(on ? 0xfff2c0 : 0x555555) } })
  const ceil = (x: number, z: number, i = 3.5, d = 8): Lamp => {
    const l = light(0xffe6b0, 0, d, x, H - 0.25, z)
    const b = new THREE.Mesh(new THREE.SphereGeometry(0.09, 8, 6), bm(0x555555)); b.position.set(x, H - 0.1, z); scene.add(b)
    return pl(l, i, b)
  }
  const wallSwitch = (px: number, py: number, pz: number, nx: number, nz: number, label: () => string, fn: () => void) => {
    const base = box(nx ? 0.025 : 0.1, 0.14, nx ? 0.1 : 0.025, 0xf2f2ee, px, py, pz)
    const key = box(nx ? 0.03 : 0.04, 0.06, nx ? 0.04 : 0.03, 0xd0d0c6, px + nx * 0.012, py + 0.04, pz + nz * 0.012)
    for (const o of [base, key]) act(o, label, fn)
  }
  // (px, pz) = centro da placa na parede; (nx, nz) = direção pra onde a parede olha (dentro do cômodo)
  // places = onde ficam as placas (uma ao lado de cada porta do cômodo); todas mexem nas mesmas lâmpadas
  type Place = [number, number, number, number]
  const ROOMS = ['oficina', 'sala', 'cozinha', 'corredor', 'varanda', 'banheiro', 'quarto', 'garagem']; let roomIdx = 0 // mesma ordem das chamadas abaixo
  const switchRoom = (places: Place[], lamps: Lamp[], fan?: THREE.Object3D) => {
    let on = false; lamps.forEach((l) => l.set(false))
    const rname = ROOMS[roomIdx++]
    world.luz[rname] = () => { if (!state.power || breakerOff.has(rname)) return; on = !on; lamps.forEach((l) => l.set(on)) }
    if (fan) world.ventilador[rname] = () => { if (state.power && !breakerOff.has(rname)) fan.userData.on = !fan.userData.on }
    energy.rooms.push({ on: () => on, w: 60 * lamps.length, off: () => { on = false; lamps.forEach((l) => l.set(false)) } })
    const noPower = () => { if (state.power && !breakerOff.has(rname)) return false; toast(state.power ? 'Sem energia aqui. O disjuntor deste cômodo está desarmado (quadro do corredor).' : 'Sem energia. Alguém desligou o disjuntor.'); return true }
    for (const [px, pz, nx, nz] of places) {
      wallSwitch(px, 1.2, pz, nx, nz, () => (on ? 'Apagar a luz' : 'Acender a luz'), () => { if (noPower()) return; on = !on; lamps.forEach((l) => l.set(on)) })
      if (fan) wallSwitch(px + (nz ? 0.15 : 0), 1.2, pz + (nx ? 0.15 : 0), nx, nz, () => (fan.userData.on ? 'Desligar o ventilador' : 'Ligar o ventilador'), () => { if (noPower()) return; fan.userData.on = !fan.userData.on })
    }
  }
  switchRoom([[6.97, 4.35, -1, 0], [5.5, 5.99, 0, -1]], [pl(lampOfi, 6, oficinaBulb)])                         // oficina: ao lado das duas portas
  switchRoom([[8.03, 4.35, 1, 0], [11.5, 5.99, 0, -1]], [ceil(10.5, 3.5)], fans[0])                            // sala + ventilador
  switchRoom([[14.03, 4.35, 1, 0], [17.5, 5.99, 0, -1]], [ceil(16.5, 3.5)])                                    // cozinha
  switchRoom([[11.5, 7.01, 0, 1], [18.99, 9.4, -1, 0], [4.6, 9.99, 0, -1]], [ceil(5, 8), ceil(11, 8), ceil(17, 8)]) // corredor: perto da porta da sala, da porta da frente e da varanda
  switchRoom([[4.6, 11.03, 0, 1]], [ceil(3, 12.5)])                                                             // varanda (ao lado da porta)
  switchRoom([[10.6, 11.03, 0, 1]], [pl(lampBan, 3)])                                                           // banheiro (ao lado da porta)
  switchRoom([[16.45, 11.03, 0, 1]], [ceil(15.5, 12.5)], fans[1])                                               // quarto + ventilador (ao lado da porta)
  switchRoom([[20.03, 2.0, 1, 0]], [pl(lampGar, 5)])                                                            // garagem (na parede da casa)

  return {
    roofs,
    update(dt: number, px = 20, pz = 8, all = false) {
      if ((cullT += dt) > 0.4) { cullT = 0; for (const c of culls) c.visible = all || Math.hypot(c.position.x - px, c.position.z - pz) < 170 } // a névoa esconde o que está além de 170 m
      fans.forEach((f) => { if (f.userData.on) f.rotation.y += dt * 9 })
      quadro.update(dt); ticks.forEach((t) => t(dt)); if (mirrorR) mirrorR.visible = Math.hypot(px - 10.5, pz - 12.6) < 6
      clock += dt; swing.forEach((w) => (w.pivot.rotation.z = Math.sin(clock * 1.3 + w.phase) * 0.07))
      doors.forEach((d) => (d.g.rotation.y += (d.a - d.g.rotation.y) * Math.min(1, dt * 6)))
      gate.position.z += ((state.gateOpen ? 5.1 : 0) - gate.position.z) * Math.min(1, dt * 3)
      door.rotation.y += ((state.doorOpen ? 1.6 : 0) - door.rotation.y) * Math.min(1, dt * 5)
    },
  }
}
