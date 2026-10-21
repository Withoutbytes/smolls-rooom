import * as THREE from 'three'
import { act } from './interact'
import { PLACE } from './place'
import { gifTexture } from './gifTexture'
import { state, toast, sleep, pick, setGate } from './state'

type Rect = [number, number, number, number] // x0, z0, x1, z1

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
const H = 2.6

export function buildProps(scene: THREE.Scene) {
  const roofs: THREE.Object3D[] = [] // somem na vista do mapa
  const swing: { pivot: THREE.Object3D; phase: number }[] = [] // roupas balançando no varal
  let clock = 0
  let root: THREE.Object3D = scene, ox = 0 // raiz e deslocamento em x usados pelo bloco da rua (que mora num Group deslocado)
  const fans: THREE.Object3D[] = []
  const block = (x0: number, z0: number, x1: number, z1: number) => blockers.push([x0 + ox, z0, x1 + ox, z1])
  const lm = (c: number) => new THREE.MeshLambertMaterial({ color: c })
  const bm = (c: number) => new THREE.MeshBasicMaterial({ color: c })

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
    block(cx - w / 2, cz - d / 2, cx + w / 2, cz + d / 2)
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
  light(0xffd9a0, 6, 9, 4, 2.0, 3.5)

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
  return car
  }

  // ---------- GARAGEM ABERTA (carport na frente da casa, x 20–28, z 1–6) com portão de correr ----------
  const car = makeCar(0xb22222); car.rotation.y = Math.PI; car.position.set(23.8, 0, 3.4); scene.add(car) // focinho pro portão
  block(21.7, 2.5, 25.9, 4.3)
  for (const px of [20.4, 24, 27.6]) { cyl(0.1, 2.6, 0xd8d8d0, px, 0, 5.85); block(px - 0.1, 5.75, px + 0.1, 5.95) } // pilares do telhado
  box(8, 0.2, 0.25, 0x8a3b1f, 24, 2.45, 5.95)                                                                      // viga da frente
  box(0.01, 0.4, 0.01, 0x111111, 24, 2.2, 3.5)
  const gb = new THREE.Mesh(new THREE.SphereGeometry(0.09), bm(0xfff2c0)); gb.position.set(24, 2.15, 3.5); scene.add(gb)
  light(0xffd9a0, 5, 8, 24, 2.1, 3.5)
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
  box(0.05, 0.32, 0.22, 0xdddddd, 29.03, 1.4, 8.4); box(0.02, 0.1, 0.1, 0x88aacc, 29.06, 1.55, 8.4) // caixa do medidor
  box(0.05, 0.18, 0.22, 0x111111, 29.03, 1.35, 11.2)                                                 // caixa de correio
  wallPlane(0.34, 0.17, tex(128, 64, (g, w, h) => { g.fillStyle = '#f2efe6'; g.fillRect(0, 0, w, h); g.strokeStyle = '#2b2b2b'; g.lineWidth = 3; g.strokeRect(2, 2, w - 4, h - 4); g.fillStyle = '#111'; g.font = 'bold 38px sans-serif'; g.textAlign = 'center'; if (PLACE.number) g.fillText(PLACE.number, w / 2, 45) }), 29.03, 1.85, 10.0, Math.PI / 2) // número da casa

  // bancada + painel de ferramentas (parede norte)
  box(3.5, 0.08, 0.7, 0x8b6b43, 4.75, 0.85, 1.4)
  for (const lx of [3.05, 6.45]) for (const lz of [1.1, 1.7]) box(0.07, 0.85, 0.07, 0x444444, lx, 0, lz)
  box(3.4, 0.05, 0.6, 0x6e5435, 4.75, 0.3, 1.4)
  act(box(0.5, 0.25, 0.25, 0xc0392b, 3.6, 0.93, 1.4), 'Abrir caixa de ferramentas', () => toast(pick(['Achou: 1 chave de fenda, 3 parafusos sem porca.', 'Falta a chave 10. Sempre falta.', 'Só tem fita isolante e um pacote de bolacha.'])))
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
  block(3.0, 1.0, 6.5, 1.75)

  // estante (parede sul, oeste da porta)
  box(2.4, 2.0, 0.04, 0x6e5435, 2.5, 0, 5.97)
  for (const sx of [1.3, 3.7]) box(0.04, 2.0, 0.5, 0x6e5435, sx, 0, 5.72)
  const items = [0xc0392b, 0x2a5db0, 0xf1c40f, 0x3a7d44, 0xe67e22, 0x8e44ad]
  for (const sy of [0.02, 0.5, 1.0, 1.5, 1.96]) {
    box(2.4, 0.04, 0.5, 0x6e5435, 2.5, sy, 5.72)
    if (sy < 1.9) for (let i = 0; i < 5; i++) box(0.3 + (i % 2) * 0.1, 0.25 + (i % 3) * 0.08, 0.3, items[(i + Math.round(sy * 3)) % 6], 1.55 + i * 0.45, sy + 0.04, 5.72)
  }
  block(1.3, 5.45, 3.7, 6)

  // geladeira velha
  act(box(0.7, 1.7, 0.7, 0xdcdcdc, 6.5, 0, 5.6), 'Abrir geladeira velha', () => { if (Math.random() < 0.3) { state.drinks++; toast('Achou uma Kuat esquecida! 🥤') } else toast(pick(['Só água e um pote de pequi.', 'Cheiro de peixe. Fecha isso.', 'Vazia. Tem uma lâmpada queimada lá dentro.'])) })
  box(0.02, 0.02, 0.7, 0x555555, 6.5, 1.1, 5.6)
  box(0.04, 0.4, 0.04, 0x333333, 6.17, 1.15, 5.45); box(0.04, 0.4, 0.04, 0x333333, 6.17, 0.55, 5.45)
  box(0.5, 0.15, 0.01, 0x8a3b1f, 6.5, 0, 5.25) // barro
  block(6.15, 5.25, 6.85, 5.95)

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
  const mm = new THREE.Mesh(new THREE.PlaneGeometry(1.2, 1.74), new THREE.MeshBasicMaterial({ map: manta }))
  mm.rotation.x = -Math.PI / 2; mm.position.set(13.7, 0.66, 13); scene.add(mm)
  box(1.2, 0.12, 1.74, 0x3d5a80, 13.7, 0.54, 13)
  box(0.45, 0.14, 0.7, 0xffffff, 12.5, 0.65, 12.35); box(0.45, 0.14, 0.7, 0xffffff, 12.5, 0.65, 13.65)
  block(12, 12.05, 14.2, 13.95)
  // criado-mudo + abajur
  box(0.5, 0.5, 0.45, 0x5a3a22, 12.27, 0, 11.5)
  cyl(0.05, 0.2, 0x222222, 12.27, 0.5, 11.5)
  const shade = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.17, 0.2, 12), bm(0xffe2a8)); shade.position.set(12.27, 0.82, 11.5); scene.add(shade)
  const lamp = light(0xffc880, 3, 5, 12.4, 0.95, 11.7)
  act(shade, () => (lamp.intensity ? 'Apagar abajur' : 'Acender abajur'), () => { lamp.intensity = lamp.intensity ? 0 : 3; (shade.material as THREE.MeshBasicMaterial).color.set(lamp.intensity ? 0xffe2a8 : 0x6b5e4a) })
  block(12, 11.27, 12.55, 11.75)
  // guarda-roupa (parede sul)
  cabinet(16.5, 0, 14.7, 2.0, 2.1, 0.6, -1, 0x7a5a3a, ['Só moletom preto. Todos iguais.', 'Achou uma camiseta do tempo da faculdade.', 'Uma meia sozinha. Como sempre.'])
  // quadro com o GIF animado (ícone do servidor do Discord) e moldura de madeira, na parede norte do quarto
  const quadro = gifTexture('/img/quadro.gif')
  wallPlane(0.9, 0.9, quadro.texture, 17.5, 1.6, 11.01, 0)
  for (const [w, h, x, y] of [[1.0, 0.06, 17.5, 2.08], [1.0, 0.06, 17.5, 1.12], [0.06, 0.96, 16.99, 1.6], [0.06, 0.96, 18.01, 1.6]]) box(w, h, 0.05, 0x5a3a22, x, y - h / 2, 11.03)
  // área da mesa do Smoll (sprite em main.ts)
  block(17.6, 11.4, 19, 14.6)

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
  act(box(2.6, 0.4, 0.9, 0x4b4f5c, 10.5, 0, 1.55), 'Sentar no sofá', () => toast('Sentou. Levantar é opcional.')); box(2.6, 0.5, 0.2, 0x3b3f4a, 10.5, 0.4, 1.15)
  box(0.25, 0.65, 0.9, 0x3b3f4a, 9.35, 0, 1.55); box(0.25, 0.65, 0.9, 0x3b3f4a, 11.65, 0, 1.55)
  box(0.95, 0.12, 0.65, 0x5d6272, 10.05, 0.4, 1.6); box(0.95, 0.12, 0.65, 0x5d6272, 10.95, 0.4, 1.6)
  box(0.35, 0.35, 0.12, 0xe0a458, 9.8, 0.5, 1.3)
  block(9.2, 1.1, 11.8, 2.0)
  // rack + TV (sul)
  box(1.6, 0.45, 0.4, 0x3a2a1a, 11.95, 0, 5.75)
  const tvBody = box(1.2, 0.7, 0.06, 0x111111, 11.95, 0.55, 5.75)
  const tvScreen = tex(128, 80, (g, w, h) => {
    const gr = g.createLinearGradient(0, 0, w, h); gr.addColorStop(0, '#1d4ed8'); gr.addColorStop(1, '#7c3aed')
    g.fillStyle = gr; g.fillRect(0, 0, w, h)
  })
  const tvPlane = wallPlane(1.12, 0.62, tvScreen, 11.95, 0.9, 5.71, Math.PI)
  const tvLight = light(0x6688ff, 2.5, 4, 11.95, 1.0, 5.2)
  const tvToggle = () => { const on = tvLight.intensity > 0; tvLight.intensity = on ? 0 : 2.5; (tvPlane.material as THREE.MeshBasicMaterial).color.set(on ? 0x000000 : 0xffffff) }
  for (const o of [tvBody, tvPlane]) act(o, () => (tvLight.intensity ? 'Desligar TV' : 'Ligar TV'), tvToggle)
  block(11.15, 5.55, 12.75, 5.95)

  // ---------- COZINHA (x 14–19, z 1–6) ----------
  act(box(0.7, 1.8, 0.7, 0xe6e6e6, 18.55, 0, 1.5), 'Abrir geladeira', () => { state.drinks++; toast(`Pegou uma Kuat gelada 🥤 (${state.drinks})`) }); box(0.02, 0.02, 0.7, 0x888888, 18.55, 1.2, 1.5)
  box(0.04, 0.5, 0.04, 0x444444, 18.2, 1.25, 1.3)
  box(0.6, 0.9, 0.6, 0xd0d0d0, 18.6, 0, 2.5)
  for (const [bx, bz] of [[18.45, 2.35], [18.75, 2.35], [18.45, 2.65], [18.75, 2.65]]) cyl(0.07, 0.02, 0x111111, bx, 0.9, bz)
  block(18.2, 1.15, 19, 2.85)
  cabinet(14.85, 0, 1.3, 1.4, 0.9, 0.6, 1, 0xa0522d, ['Café, açúcar e bolacha maizena.', 'Panelas. Muitas panelas.', 'Um pote de farinha e saudade.'])
  cabinet(14.85, 1.5, 1.15, 1.4, 0.7, 0.3, 1, 0xa0522d, ['Copos, só copos.', 'Achou uma garrafa térmica esquecida.'])
  cyl(0.6, 0.06, 0x8b6b43, 16.5, 0.72, 3.8); cyl(0.07, 0.72, 0x444444, 16.5, 0, 3.8)
  for (const [cx, cz] of [[15.7, 3.8], [17.3, 3.8], [16.5, 3.0], [16.5, 4.6]]) {
    box(0.4, 0.05, 0.4, 0xa0522d, cx, 0.45, cz); box(0.04, 0.45, 0.04, 0x444444, cx, 0, cz)
  }
  cyl(0.08, 0.14, 0xf1c40f, 16.5, 0.78, 3.8) // fruteira/vaso
  block(15.8, 3.1, 17.2, 4.5)

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
  act(redeMesh, 'Balançar na rede', () => toast('Aaaaah. Vida de rondoniense.'))
  cyl(0.05, 1.5, 0x5a3a22, 1.8, 0, 11.45); cyl(0.05, 1.5, 0x5a3a22, 1.8, 0, 14.15)
  block(1.4, 11.6, 2.2, 14.0)

  // ---------- QUINTAL (céu aberto, junto da garagem: x 20–28, z 6–16, no máximo do tamanho da casa) ----------
  const ball = (r: number, c: number, x: number, y: number, z: number) => {
    const m = new THREE.Mesh(new THREE.SphereGeometry(r, 10, 8), lm(c)); m.position.set(x, y, z); scene.add(m)
    return m
  }
  const manga = () => { state.mangas++; toast(`Pegou uma manga 🥭 (${state.mangas})`) }
  const mangueira = (x: number, z: number, s: number) => {
    cyl(0.2 * s, 1.8 * s, 0x5a3a22, x, 0, z)
    for (const [ox, oy, oz, r] of [[0, 2.5, 0, 1.2], [0.8, 2.2, 0.3, 0.9], [-0.8, 2.3, -0.2, 1.0], [0.2, 3.2, -0.5, 0.8], [-0.3, 2.1, 0.9, 0.8]]) act(ball(r * s, 0x2f6b2f, x + ox * s, oy * s, z + oz * s), 'Pegar manga', manga)
    for (let i = 0; i < 9; i++) act(ball(0.1, 0xf0a020, x + Math.cos(i * 2.4) * 1.2 * s, (1.7 + (i % 3) * 0.4) * s, z + Math.sin(i * 2.4) * 1.2 * s), 'Pegar manga', manga) // mangas
    block(x - 0.3, z - 0.3, x + 0.3, z + 0.3)
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
    ['shirt', '#d64532', 0.55, 0.6], ['briefs', '#f2f2ee', 0.3, 0.26], ['shorts', '#2f7fc1', 0.42, 0.5], ['bra', '#f06ea9', 0.36, 0.24], ['shirt', '#e0b21c', 0.55, 0.6],
    ['briefs', '#3fae5a', 0.3, 0.26], ['shorts', '#b7a27a', 0.42, 0.5], ['bra', '#222222', 0.36, 0.24], ['shirt', '#f2f2ee', 0.55, 0.6], ['briefs', '#2f7fc1', 0.3, 0.26],
  ]
  LINE.forEach(([kind, color, w, h], i) => {
    const pivot = new THREE.Group(); pivot.position.set(21.45 + i * 0.5, 1.94, 7.4); scene.add(pivot)       // gira em torno da linha
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ map: garment(kind, color), transparent: true, alphaTest: 0.4, side: THREE.DoubleSide }))
    m.position.y = -h / 2 - 0.02; pivot.add(m)
    for (const dx of [-w * 0.3, w * 0.3]) box(0.03, 0.07, 0.03, 0xc8a165, dx, -0.06, 0.012, pivot)             // prendedores
    swing.push({ pivot, phase: i * 1.7 })
  })
  // tanque de lavar roupa + torneira (junto do muro leste)
  act(box(0.6, 0.85, 0.9, 0xbfc4c8, 27.45, 0, 15.2), 'Abrir a torneira', () => toast('Água quente. É Rondônia, mano.')); box(0.4, 0.05, 0.7, 0x4a5a63, 27.45, 0.8, 15.2)
  cyl(0.02, 0.3, 0xcccccc, 27.2, 1.0, 15.2)
  block(27.1, 14.75, 27.8, 15.65)
  // churrasqueira (muro sul)
  box(1.1, 0.9, 0.55, 0xa0522d, 26.2, 0, 15.65); const coal = box(0.95, 0.04, 0.4, 0x222222, 26.2, 0.9, 15.65)
  const fire = light(0xff6a20, 0, 5, 26.2, 1.3, 15.3)
  act(coal, () => (fire.intensity ? 'Apagar o carvão' : 'Acender o carvão'), () => { fire.intensity = fire.intensity ? 0 : 4; (coal.material as THREE.MeshLambertMaterial).color.set(fire.intensity ? 0xff4a10 : 0x222222); if (fire.intensity) toast('Cheiro de churrasco. Cadê a carne?') })
  box(0.25, 1.4, 0.25, 0xa0522d, 26.2, 0, 15.85)
  block(25.6, 15.3, 26.8, 15.95)
  // mesa e cadeiras de plástico
  cyl(0.55, 0.05, 0xffffff, 24.3, 0.72, 13.6); cyl(0.05, 0.72, 0xdddddd, 24.3, 0, 13.6)
  for (const [cx, cz] of [[23.5, 13.6], [25.1, 13.6], [24.3, 12.8]]) { box(0.42, 0.04, 0.42, 0xffffff, cx, 0.45, cz); box(0.04, 0.45, 0.04, 0xdddddd, cx, 0, cz) }
  block(23.1, 12.5, 25.5, 14.7)
  // horta (canteiros com terra vermelha)
  for (const hx of [22.4, 23.7]) { box(1.0, 0.25, 0.6, 0x7a3b22, hx, 0, 15.6); for (let i = 0; i < 4; i++) ball(0.14, 0x3fa34d, hx - 0.35 + i * 0.23, 0.38, 15.6) }
  block(21.8, 15.2, 24.2, 16)
  // caixa d'água
  cyl(0.6, 1.2, 0x1e6fb8, 26.8, 0, 9.0); block(26.2, 8.4, 27.4, 9.6)
  // muro de fundos do vizinho (as janelas dos fundos da casa dão pra ele)
  box(30, 2.2, 0.3, 0xd8cdb8, 5.5, 0, 17.2)

  // ---------- PORTA DA FRENTE (célula 19,8) ----------
  const door = new THREE.Group(); door.position.set(19.5, 0, 8.03); scene.add(door)
  const dm = box(0.06, 2.1, 0.94, 0x6b3a1e, 0, 0, 0.47, door)
  box(0.05, 0.05, 0.05, 0xc9b037, -0.05, 1.0, 0.85, door)
  act(dm, () => (state.doorOpen ? 'Fechar porta' : 'Abrir porta'), () => (state.doorOpen = !state.doorOpen))

  // ---------- RUA (deslocada 9 m: calçada x 29–31, asfalto 31–37, calçada 37–39; paredes invisíveis depois) ----------
  const streetG = new THREE.Group(); streetG.position.x = 9; scene.add(streetG)
  root = streetG; ox = 9
  box(6, 0.01, 200, 0x8d8c86, 25, -0.015, 11); box(2, 0.01, 200, 0xb8b8b0, 21, -0.015, 11); box(2, 0.01, 200, 0xb8b8b0, 29, -0.015, 11)
  box(0.2, 0.1, 200, 0xc9c6bc, 21.9, 0, 11); box(0.2, 0.1, 200, 0xc9c6bc, 28.1, 0, 11) // meio-fio
  // rua transversal (esquina): asfalto z 25–31, calçadas z 23–25 e 31–33
  box(300, 0.01, 6, 0x8d8c86, 25, -0.015, 28); box(300, 0.01, 2, 0xb8b8b0, 25, -0.015, 24); box(300, 0.01, 2, 0xb8b8b0, 25, -0.015, 32)
  const poste = (x: number, z: number) => {
    cyl(0.07, 5, 0x666666, x, 0, z); box(0.9, 0.06, 0.06, 0x666666, x + (x < 25 ? 0.4 : -0.4), 4.9, z)
    const l = new THREE.Mesh(new THREE.SphereGeometry(0.13), bm(0xfff2c0)); l.position.set(x + (x < 25 ? 0.8 : -0.8), 4.85, z); root.add(l)
    block(x - 0.1, z - 0.1, x + 0.1, z + 0.1)
  }
  for (const z of [4, 12, 20]) { poste(21.4, z); poste(28.6, z + 4) }
  const park = (c: number, x: number, z: number, rot: number) => { const k = makeCar(c); k.position.set(x, 0, z); k.rotation.y = rot; root.add(k); block(x - 1, z - 2.1, x + 1, z + 2.1) }
  park(0x2a5db0, 23.3, 15, Math.PI / 2); park(0xdddddd, 27, 6, -Math.PI / 2)
  // casa de vizinho genérica: frente virada pra +x no espaço local, girada por `rot`
  const pastel = [0xf2d7a1, 0xc9e0b3, 0xf0b6a8, 0xb8d4e8, 0xe8e0c8]
  type CasaOpt = { solar?: boolean; body?: number; wall?: number; gate?: 'rust' | 'chevron' | 'white' | 'galv'; roof?: number; tank?: boolean; mail?: boolean; meter?: boolean; tree?: boolean }
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
  const hipRoof = (g: THREE.Object3D, w: number, d: number, color: number) => {
    const hx = d / 2 + 0.25, hz = w / 2 + 0.25, y0 = 3.2, y1 = 4.5
    const c1 = [-hx, y0, -hz], c2 = [hx, y0, -hz], c3 = [hx, y0, hz], c4 = [-hx, y0, hz]
    const alongX = hx >= hz, r = Math.abs(hx - hz)
    const r1 = alongX ? [-r, y1, 0] : [0, y1, -r], r2 = alongX ? [r, y1, 0] : [0, y1, r]
    const tri = (...v: number[][]) => v.flat()
    const pos = alongX
      ? [...tri(c4, c3, r2, c4, r2, r1), ...tri(c2, c1, r1, c2, r1, r2), ...tri(c1, c4, r1), ...tri(c3, c2, r2)]
      : [...tri(c2, c3, r2, c2, r2, r1), ...tri(c4, c1, r1, c4, r1, r2), ...tri(c1, c2, r1), ...tri(c3, c4, r2)]
    const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); geo.computeVertexNormals()
    g.add(new THREE.Mesh(geo, new THREE.MeshLambertMaterial({ color, side: THREE.DoubleSide })))
  }
  const casa = (x: number, z: number, w: number, d: number, rot: number, i: number, o: CasaOpt = {}) => {
    const g = new THREE.Group(); g.position.set(x, 0, z); g.rotation.y = rot; root.add(g)
    box(d, 3.2, w, o.body ?? pastel[i % 5], 0, 0, 0, g); hipRoof(g, w, d, o.roof ?? [0x55585c, 0x6e7176, 0x4a4d52, 0xb04a28][i % 4])                       // corpo + telhado de quatro águas
    if (d > w && (o.solar ?? i % 3 === 1)) { const sp = box(Math.min(2.6, d * 0.4), 0.06, 1.2, 0x1b3a73, 0, 3.95, w * 0.17, g); sp.rotation.x = Math.atan(1.3 / (w / 2 + 0.25)) } // placa solar no telhado
    const wx = d / 2 + 0.7                                                                                         // linha do muro
    box(0.25, 2.0, w + 0.6, o.wall ?? 0xd8cdb8, wx, 0, 0, g)
    const gp = new THREE.Mesh(new THREE.PlaneGeometry(2.4, 1.7), o.gate ? gateMat(o.gate) : lm(0x4b5a63)); gp.position.set(wx - 0.14, 0.9, w * 0.1); gp.rotation.y = Math.PI / 2; g.add(gp)
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
      if (rot === Math.PI) block(x - tx - 0.3, z - tz - 0.3, x - tx + 0.3, z - tz + 0.3)
    }
  }
  const N = Math.PI / 2
  // do outro lado da rua (viradas pra -x) — só até a esquina
  const EAST: CasaOpt[] = [
    { body: 0x8e9aa8, wall: 0xb9ab92, gate: 'white', roof: 0x77736f, tree: true, mail: true },
    { body: 0x35c2b5, wall: 0x35c2b5, gate: 'galv', roof: 0x8a3b1f, tree: true },
    { body: 0xe8e0c8, wall: 0xd8cdb8, gate: 'rust', roof: 0xb04a28, mail: true, tree: true },
  ]
  for (let i = 0, z0 = -60; z0 < 20; z0 += 7.5, i++) casa(33.3, z0, 5.4, 5, Math.PI, i, EAST[i % 3])
  for (let i = 0, z0 = 61; z0 < 90; z0 += 7.5, i++) casa(33.3, z0, 5.4, 5, Math.PI, i + 2, EAST[(i + 1) % 3])
  // Centro Municipal de Educação Infantil, na esquina da R. Palomas (do outro lado da rua): prédio colorido com telhado de cerâmica
  const escolaTex = tex(512, 128, (g, w, h) => { ['#2a6fc9', '#f08a24', '#f4f1e8', '#2a6fc9', '#f08a24', '#f4f1e8', '#2a6fc9', '#f08a24'].forEach((c, i) => { g.fillStyle = c; g.fillRect(i * 64, 0, 64, h) }) })
  const sg = new THREE.Group(); sg.position.set(49, 0, 50); root.add(sg)
  box(14, 3.2, 18, new THREE.MeshLambertMaterial({ map: escolaTex }), 0, 0, 0, sg); hipRoof(sg, 18, 14, 0xb04a28)
  box(0.25, 1.2, 20, 0xf08a24, -8.8, 0, 0, sg)                                                              // muro baixo colorido
  box(0.06, 2.2, 1.6, 0x2a6fc9, -7.01, 0, 0, sg)                                                            // portão de entrada
  for (const dz of [-6, -3.5, 3.5, 6]) box(0.06, 1.1, 1.4, 0x9fd0e8, -7.01, 1.1, dz, sg)                    // janelas
  const escolaPlaca = tex(512, 96, (g, w, h) => { g.fillStyle = '#f4f1e8'; g.fillRect(0, 0, w, h); g.fillStyle = '#2a6fc9'; g.font = 'bold 30px sans-serif'; g.textAlign = 'center'; g.fillText('Centro Municipal de', w / 2, 38); g.fillText('Educação Infantil', w / 2, 76) })
  const placaE = new THREE.Mesh(new THREE.PlaneGeometry(3.4, 0.64), new THREE.MeshBasicMaterial({ map: escolaPlaca })); placaE.position.set(-7.02, 2.7, 0); placaE.rotation.y = -Math.PI / 2; sg.add(placaE)
  // placas da esquina
  const plate = (text: string, y: number, c: string, sub?: string) => {
    const t = tex(256, 64, (g, w, h) => { g.fillStyle = c; g.fillRect(0, 0, w, h); g.fillStyle = '#fff'; g.textAlign = 'center'; g.font = `bold ${sub ? 28 : 30}px sans-serif`; g.fillText(text, w / 2, sub ? 32 : 42); if (sub) { g.font = '15px sans-serif'; g.fillText(sub, w / 2, 54) } })
    for (const [rot, dz] of [[0, 0.03], [Math.PI, -0.03]]) { // um plano pra cada lado, senão o texto sai espelhado
      const m = new THREE.Mesh(new THREE.PlaneGeometry(1.1, 0.28), new THREE.MeshBasicMaterial({ map: t })); m.position.set(21.4, y, 23.6 + dz); m.rotation.y = rot; root.add(m)
    }
  }
  cyl(0.04, 2.7, 0x666666, 21.4, 0, 23.6); plate(PLACE.street, 2.5, '#1e6fb8', PLACE.sector); plate(PLACE.cross, 2.15, '#2e8b57')
  const pare = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.3, 0.03, 8), bm(0xc0202a)); pare.rotation.x = Math.PI / 2; pare.rotation.z = Math.PI / 8; pare.position.set(29.6, 2.0, 23.4); root.add(pare)
  cyl(0.04, 2.0, 0x666666, 29.6, 0, 23.4)
  const roadText = tex(512, 128, (g, w, h) => { g.fillStyle = 'rgba(240,240,236,0.85)'; g.font = 'bold 88px sans-serif'; g.textAlign = 'center'; g.fillText(PLACE.street.replace('Rua ', 'R. '), w / 2, 98) })
  const rt = new THREE.Group(); rt.position.set(25, 0.012, 11); rt.rotation.y = Math.PI / 2; root.add(rt)           // nome da rua pintado no chão
  const rtm = new THREE.Mesh(new THREE.PlaneGeometry(6, 1.5), new THREE.MeshBasicMaterial({ map: roadText, transparent: true, depthWrite: false })); rtm.rotation.x = -Math.PI / 2; rt.add(rtm)
  const speed = tex(128, 128, (g, w, h) => { g.fillStyle = '#fff'; g.beginPath(); g.arc(64, 64, 62, 0, 7); g.fill(); g.strokeStyle = '#d02020'; g.lineWidth = 12; g.beginPath(); g.arc(64, 64, 56, 0, 7); g.stroke(); g.fillStyle = '#111'; g.font = 'bold 56px sans-serif'; g.textAlign = 'center'; g.fillText('20', 64, 84) })
  cyl(0.04, 2.4, 0x666666, 29.4, 0, 17)
  for (const [r0, dx] of [[0, -0.03], [Math.PI, 0.03]]) { const sp = new THREE.Mesh(new THREE.CircleGeometry(0.3, 20), new THREE.MeshBasicMaterial({ map: speed, transparent: true })); sp.position.set(29.4 + dx, 2.3, 17); sp.rotation.y = r0 + Math.PI / 2; root.add(sp) }
  block(29.3, 16.9, 29.5, 17.1)
  root = scene; ox = 0
  // vizinhos do mesmo lado da rua (coordenadas do mundo): norte (2 m de vão pras janelas), oeste (viela) e do outro lado da transversal
  const NORTH: CasaOpt[] = [
    { body: 0xa98ad1, wall: 0xa5a8a6, roof: 0x7a2e24, gate: 'rust', mail: true, meter: true },   // lilás, muro cinza, caixa de correio branca
    { body: 0xd9c8a8, wall: 0x8a5a5c, roof: 0x6e6a66, gate: 'galv', mail: true },               // muro mauve
    { body: 0x8da0b5, wall: 0xb9ab92, roof: 0x77736f, gate: 'white', meter: true },
  ]
  for (let i = 0, z0 = -6; z0 > -60; z0 -= 9, i++) { casa(21, z0, 8, 14, 0, i, NORTH[i % 3]); if (!i) casa(5, z0, 8, 14, 0, 2) }
  for (let i = 0, z0 = -42; z0 < 14; z0 += 9, i++) casa(-10, z0, 8, 14, 0, i + 1)
  for (let i = 0, x0 = -60; x0 < 140; x0 += 9, i++) if (x0 + 4 < 28.5 || x0 - 4 > 39.5) casa(x0, 40, 8, 12, N, i + 3)
  for (let i = 0, x0 = -30; x0 > -64; x0 -= 9, i++) casa(x0, 18.9, 8, 6, -Math.PI / 2, i + 1)   // lado norte da transversal (oeste)
  for (let i = 0, x0 = 54; x0 < 124; x0 += 9, i++) casa(x0, 18.9, 8, 6, -Math.PI / 2, i + 2)    // lado norte da transversal (leste)
  casa(21, 20.4, 5, 14, 0, 4, { body: 0xc9a97d, wall: 0x3b3836, gate: 'chevron', roof: 0x6b3a22, tank: true, meter: true }); casa(5, 20.4, 5, 14, 0, 1) // vizinhos do sul, depois do fim do lote (z 17–23)

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
  const zs = [-30, -17, -4, 9, 22, 35, 48]
  for (const z of zs) pole(30.2, z)
  for (const z of [-30, -4, 22, 48]) pole(38.4, z)
  for (let i = 0; i < zs.length - 1; i++) for (const dx of [-0.7, 0, 0.7]) wire(30.2 + dx, zs[i], 30.2 + dx, zs[i + 1])
  for (const dx of [-0.7, 0, 0.7]) { wire(30.2 + dx, 9, 38.4 + dx, 9, 7.4, 0.9); wire(30.2 + dx, 22, 38.4 + dx, 22, 7.4, 0.9) }
  // banquinho de concreto com vaso na frente do muro, montinho de areia na calçada
  box(0.5, 0.3, 0.7, 0xaaa9a2, 29.4, 0, 10.6); cyl(0.12, 0.2, 0xd9825b, 29.4, 0.3, 10.6); block(29.1, 10.2, 29.7, 11)
  const sand = new THREE.Mesh(new THREE.ConeGeometry(1.1, 0.55, 12), lm(0xd2b48c)); sand.position.set(30, 0.27, 18.8); scene.add(sand); block(29.2, 18, 30.8, 19.6)
  // telhado de cerâmica em quatro águas com beirada branca e vermelha (a casa fica branca com telha vermelha)
  const roofMat = new THREE.MeshLambertMaterial({ color: 0xb04a28, side: THREE.DoubleSide })
  const [x0, x1, z0, z1, rx0, rx1, rz, y0, y1] = [-0.6, 20.6, -0.6, 16.6, 5, 15, 8, 2.6, 4.3]
  const tri = (...v: number[][]) => v.flat()
  const roofGeo = new THREE.BufferGeometry()
  roofGeo.setAttribute('position', new THREE.Float32BufferAttribute([
    ...tri([x0, y0, z1], [x1, y0, z1], [rx1, y1, rz], [x0, y0, z1], [rx1, y1, rz], [rx0, y1, rz]),   // sul
    ...tri([x1, y0, z0], [x0, y0, z0], [rx0, y1, rz], [x1, y0, z0], [rx0, y1, rz], [rx1, y1, rz]),   // norte
    ...tri([x0, y0, z0], [x0, y0, z1], [rx0, y1, rz]), ...tri([x1, y0, z1], [x1, y0, z0], [rx1, y1, rz]), // oeste, leste
  ], 3))
  roofGeo.computeVertexNormals()
  const roof = new THREE.Mesh(roofGeo, roofMat); scene.add(roof); roofs.push(roof)
  for (const [w, d, x, z] of [[21.2, 0.12, 10, z0], [21.2, 0.12, 10, z1], [0.12, 17.2, x0, 8], [0.12, 17.2, x1, 8]]) {
    roofs.push(box(w, 0.18, d, 0xf4f0e6, x, 2.5, z), box(w, 0.05, d, 0xb04a28, x, 2.45, z))
  }
  roofs.push(box(10, 0.08, 0.2, 0x7a2e14, 10, 4.3, 8))
  roofs.push(box(8.4, 0.14, 5.6, 0xf2efe6, 24.1, 2.6, 3.5), box(8.4, 0.05, 0.12, 0xb04a28, 24.1, 2.74, 6.25)) // laje da garagem

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

  return {
    roofs,
    update(dt: number) {
      fans.forEach((f) => { if (f.userData.on) f.rotation.y += dt * 9 })
      quadro.update(dt)
      clock += dt; swing.forEach((w) => (w.pivot.rotation.z = Math.sin(clock * 1.3 + w.phase) * 0.07))
      doors.forEach((d) => (d.g.rotation.y += (d.a - d.g.rotation.y) * Math.min(1, dt * 6)))
      gate.position.z += ((state.gateOpen ? 5.1 : 0) - gate.position.z) * Math.min(1, dt * 3)
      door.rotation.y += ((state.doorOpen ? 1.6 : 0) - door.rotation.y) * Math.min(1, dt * 5)
    },
  }
}
