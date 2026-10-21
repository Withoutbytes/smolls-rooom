import * as THREE from 'three'
import { act } from './interact'
import { toast, pick } from './state'
import { codeState } from './code'
import { openEditor } from './editor'

// Setup do Smoll: mesa, 2 monitores (editor + navegador/terminal), teclado RGB, mousepad XL, mouse, caixas de som,
// headset no suporte, gabinete com lateral de vidro e hardware por dentro, cabos e energéticos. Frente = -x (lado do jogador).
const lm = (c: number) => new THREE.MeshLambertMaterial({ color: c })
const bm = (c: number) => new THREE.MeshBasicMaterial({ color: c })

// "k:const |v:smoll |p:= ..." -> segmentos coloridos (estilo editor escuro)
const COLORS: Record<string, string> = { k: '#569cd6', v: '#9cdcfe', t: '#4ec9b0', s: '#ce9178', c: '#6a9955', p: '#d4d4d4', f: '#dcdcaa', n: '#b5cea8' }
const LINES = [
  'k:import |p:{ |v:Scene |p:} |k:from |s:\'three\'',
  'k:const |v:smoll |p:= |k:new |t:Dev|p:(|s:\'rondonia\'|p:)',
  'c:// TODO: multiplayer',
  'k:export function |f:update|p:(|v:dt|p:) {',
  'p:  |v:player|p:.|f:move|p:(|v:dt|p:)',
  'p:  |k:if |p:(|v:bug|p:) |f:fixLater|p:()',
  'p:  |f:render|p:(|v:scene|p:, |v:camera|p:)',
  'p:}',
  'k:const |v:SPEED |p:= |n:2.5',
  'k:while |p:(|v:alive|p:) |f:tick|p:()',
  'k:await |f:deploy|p:(|s:\'prod\'|p:) |c:// sexta 18h',
  't:Room|p:.|f:open|p:(|v:door|p:)',
  'c:// não mexe, funciona',
  'k:return |v:smoll|p:.|f:sentFor|p:(|n:8|p:)',
]
const FILES = ['smolls-room', '  src', '   main.ts', '   props.ts', '   smoll.ts', '   pc.ts', '   map.ts', '  public']

function drawEditor(c: CanvasRenderingContext2D, w: number, h: number, now: number) {
  c.fillStyle = '#1e1e1e'; c.fillRect(0, 0, w, h)
  c.fillStyle = '#333'; c.fillRect(0, 0, 26, h); for (let i = 0; i < 5; i++) { c.fillStyle = i ? '#777' : '#ddd'; c.fillRect(7, 12 + i * 28, 12, 12) }
  c.fillStyle = '#252526'; c.fillRect(26, 0, 118, h)
  c.font = '10px monospace'
  FILES.forEach((f, i) => { c.fillStyle = i === 4 ? '#fff' : '#bbb'; if (i === 4) { c.fillStyle = '#37373d'; c.fillRect(26, 29 + i * 15 - 11, 118, 15); c.fillStyle = '#fff' } c.fillText(f, 32, 36 + i * 15) })
  c.fillStyle = '#2d2d2d'; c.fillRect(144, 0, w - 144, 22)
  c.fillStyle = '#1e1e1e'; c.fillRect(144, 0, 80, 22); c.fillStyle = '#fff'; c.fillText('smoll.ts', 156, 15); c.fillStyle = '#999'; c.fillText('pc.ts', 240, 15)
  c.font = '12px monospace'
  const off = codeState.edited ? 0 : Math.floor(now * 1.5), L = codeState.lines
  const TOK = /(\/\/.*$)|(['"`][^'"`]*['"`])|(\b\d+(?:\.\d+)?\b)|(\b(?:const|let|var|if|else|while|for|return|function|export|import|from|new|await|async|class)\b)|(\b[A-Za-z_]\w*(?=\())|(\s+|.)/g
  const COL = ['', '#6a9955', '#ce9178', '#b5cea8', '#569cd6', '#dcdcaa', '#d4d4d4']
  for (let i = 0; i < 14 && i < L.length; i++) {
    const ln = L[(i + off) % L.length]
    c.fillStyle = '#6b6b6b'; c.fillText(String(1 + ((i + off) % L.length)).padStart(3), 150, 40 + i * 16)
    let x = 182
    for (const m of ln.matchAll(TOK)) { const k = m.slice(1).findIndex(Boolean) + 1; c.fillStyle = COL[k] || '#d4d4d4'; c.fillText(m[0], x, 40 + i * 16); x += c.measureText(m[0]).width }
  }
  if (Math.floor(now * 2) % 2) { c.fillStyle = '#fff'; c.fillRect(300, 28 + (7 * 16), 2, 13) }
  c.fillStyle = '#d4d4d4'; for (let i = 0; i < 20; i++) c.fillRect(w - 46, 28 + i * 7, 20 + ((i * 7 + off) % 18), 2) // minimap
  c.fillStyle = '#007acc'; c.fillRect(0, h - 16, w, 16); c.fillStyle = '#fff'; c.font = '10px monospace'; c.fillText('⎇ main   TypeScript   Ln 42, Col 9   UTF-8', 8, h - 5)
}

function drawBrowser(c: CanvasRenderingContext2D, w: number, h: number, now: number) {
  c.fillStyle = '#202124'; c.fillRect(0, 0, w, h)
  c.fillStyle = '#35363a'; c.fillRect(0, 0, w, 24); c.fillStyle = '#202124'; c.fillRect(8, 4, 110, 20)
  c.fillStyle = '#e8eaed'; c.font = '10px monospace'; c.fillText("Smoll's Room", 16, 17)
  c.fillStyle = '#35363a'; c.fillRect(0, 24, w, 22); c.fillStyle = '#202124'; c.fillRect(40, 28, 300, 14); c.fillStyle = '#9aa0a6'; c.fillText('localhost:5173', 50, 39)
  // viewport do jogo (mini casa em primeira pessoa)
  const vy = 46, vh = 150
  const sky = c.createLinearGradient(0, vy, 0, vy + vh / 2); sky.addColorStop(0, '#2f6fc9'); sky.addColorStop(1, '#8cc4f2')
  c.fillStyle = sky; c.fillRect(0, vy, w, vh / 2); c.fillStyle = '#a0522d'; c.fillRect(0, vy + vh / 2, w, vh / 2)
  c.fillStyle = '#e8dcc0'; c.fillRect(120, vy + 20, 260, 90); c.fillStyle = '#6b3a1e'; c.fillRect(220, vy + 50, 40, 60)
  c.fillStyle = '#9fd0e8'; c.fillRect(140, vy + 45, 50, 35); c.fillRect(300, vy + 45, 50, 35)
  c.fillStyle = '#8a3b1f'; c.fillRect(110, vy + 10, 280, 12)
  c.fillStyle = '#fff8'; c.fillRect(w / 2 - 8, vy + vh / 2, 16, 1); c.fillRect(w / 2, vy + vh / 2 - 8, 1, 16)
  // terminal
  c.fillStyle = '#0c0c0c'; c.fillRect(0, vy + vh, w, h - vy - vh)
  c.font = '10px monospace'
  const log = codeState.term.slice(-5)
  for (let i = 0; i < log.length; i++) { c.fillStyle = log[i].startsWith('>') ? '#7ee787' : log[i].startsWith('smoll@') ? '#7ee787' : '#bbb'; c.fillText(log[i].slice(0, 62), 8, vy + vh + 14 + i * 12) }
  if (Math.floor(now * 2) % 2) { c.fillStyle = '#fff'; c.fillRect(8 + Math.min(62, (log[log.length - 1] ?? '').length) * 6.05, vy + vh + 14 + (log.length - 1) * 12 - 8, 5, 9) }
}

function drawTower(c: CanvasRenderingContext2D, w: number, h: number, now: number) {
  const hue = (a: number) => `hsl(${(a + now * 90) % 360} 100% 55%)`
  c.fillStyle = '#07070c'; c.fillRect(0, 0, w, h)
  const fan = (cx: number, cy: number, r: number, a0: number) => {
    c.strokeStyle = hue(a0); c.lineWidth = 4; c.beginPath(); c.arc(cx, cy, r, 0, 7); c.stroke()
    c.fillStyle = '#111'; c.beginPath(); c.arc(cx, cy, r - 3, 0, 7); c.fill()
    c.strokeStyle = '#2a2a33'; c.lineWidth = 6
    for (let i = 0; i < 7; i++) { const a = now * 9 + (i * Math.PI * 2) / 7; c.beginPath(); c.moveTo(cx, cy); c.lineTo(cx + Math.cos(a) * (r - 6), cy + Math.sin(a) * (r - 6)); c.stroke() }
    c.fillStyle = hue(a0 + 60); c.beginPath(); c.arc(cx, cy, 5, 0, 7); c.fill()
  }
  for (let i = 0; i < 3; i++) fan(30, 40 + i * 78, 32, i * 70)                     // ventoinhas frontais
  c.fillStyle = '#0d1a14'; c.fillRect(70, 30, 180, 190)                             // placa-mãe
  c.strokeStyle = '#1f3d2e'; c.lineWidth = 1; for (let i = 0; i < 9; i++) { c.beginPath(); c.moveTo(74, 40 + i * 20); c.lineTo(160 + (i % 3) * 30, 40 + i * 20); c.stroke() }
  c.fillStyle = '#222'; c.fillRect(70, 8, 180, 16); fan(105, 16, 11, 200); fan(160, 16, 11, 240); fan(215, 16, 11, 280) // radiador do AIO
  c.fillStyle = '#16161c'; c.beginPath(); c.arc(130, 80, 24, 0, 7); c.fill(); c.strokeStyle = hue(120); c.lineWidth = 3; c.stroke() // bloco da CPU
  c.fillStyle = '#fff'; c.font = 'bold 12px monospace'; c.fillText('S', 126, 85)
  c.strokeStyle = '#111'; c.lineWidth = 5; c.beginPath(); c.moveTo(118, 58); c.lineTo(100, 24); c.moveTo(142, 58); c.lineTo(175, 24); c.stroke() // mangueiras
  for (let i = 0; i < 4; i++) { c.fillStyle = '#111'; c.fillRect(190 + i * 12, 40, 8, 90); c.fillStyle = hue(i * 40 + 30); c.fillRect(192 + i * 12, 40, 4, 90) } // memórias RAM
  c.fillStyle = '#17171d'; c.fillRect(66, 142, 190, 38)                              // placa de vídeo
  c.fillStyle = hue(300); c.fillRect(66, 178, 190, 2)
  for (let i = 0; i < 3; i++) { const cx = 100 + i * 60; c.fillStyle = '#0a0a0e'; c.beginPath(); c.arc(cx, 161, 15, 0, 7); c.fill(); c.strokeStyle = '#333'; c.lineWidth = 3; const a = now * 12 + i; c.beginPath(); c.moveTo(cx, 161); c.lineTo(cx + Math.cos(a) * 12, 161 + Math.sin(a) * 12); c.stroke() }
  c.fillStyle = '#111'; c.fillRect(66, 196, 190, 6)                                  // slot/cabo PCIe
  c.fillStyle = '#101014'; c.fillRect(0, 222, w, 40)                                 // PSU shroud
  c.fillStyle = hue(0); c.fillRect(0, 222, w, 2); c.fillStyle = '#8a8a96'; c.font = '11px monospace'; c.fillText('SMOLL', 200, 246)
}

export function buildPC(scene: THREE.Scene) {
  const box = (w: number, h: number, d: number, c: number | THREE.Material, x: number, y: number, z: number, p: THREE.Object3D = scene) => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), typeof c === 'number' ? lm(c) : c); m.position.set(x, y + h / 2, z); p.add(m); return m
  }
  const cyl = (r: number, h: number, c: number, x: number, y: number, z: number, p: THREE.Object3D = scene) => {
    const m = new THREE.Mesh(new THREE.CylinderGeometry(r, r, h, 14), lm(c)); m.position.set(x, y + h / 2, z); p.add(m); return m
  }
  const tex = (w: number, h: number) => { const cv = document.createElement('canvas'); cv.width = w; cv.height = h; const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace; return { cv, ctx: cv.getContext('2d')!, t } }

  // ---- mesa ----
  box(0.8, 0.05, 2.2, 0x1d1d20, 18.6, 0.72, 13)                                  // tampo (topo em y 0,77)
  box(0.02, 0.05, 2.2, 0x6b4a2a, 18.19, 0.72, 13)                                // frisos de madeira na frente
  box(0.02, 0.4, 2.0, 0x111114, 18.96, 0.32, 13)                                 // painel traseiro
  for (const z of [11.95, 14.05]) { box(0.06, 0.72, 0.06, 0x111111, 18.2, 0, z); box(0.06, 0.72, 0.06, 0x111111, 18.95, 0, z) }
  box(0.04, 0.04, 2.1, 0x111111, 18.2, 0.62, 13)
  const strip = new THREE.Mesh(new THREE.BoxGeometry(0.012, 0.012, 2.1), bm(0xff00ff)); strip.position.set(18.18, 0.7, 13); scene.add(strip) // LED sob a mesa

  // ---- mousepad XL + teclado + mouse ----
  const pad = tex(128, 464)
  { const c = pad.ctx; c.fillStyle = '#15151a'; c.fillRect(0, 0, 128, 464); c.strokeStyle = '#2ecc71'; c.lineWidth = 3; c.strokeRect(6, 6, 116, 452)
    c.strokeStyle = '#f1c40f'; c.lineWidth = 2; for (let i = 0; i < 6; i++) { c.beginPath(); c.moveTo(0, 40 + i * 80); c.lineTo(128, i * 80 - 10); c.stroke() }
    c.save(); c.translate(64, 430); c.rotate(-Math.PI / 2); c.fillStyle = '#2ecc71'; c.font = 'bold 22px sans-serif'; c.textAlign = 'center'; c.fillText('SMOLL', 0, 8); c.restore(); pad.t.needsUpdate = true }
  box(0.4, 0.008, 1.4, 0x15151a, 18.5, 0.77, 13.1)
  const padTop = new THREE.Mesh(new THREE.PlaneGeometry(0.4, 1.4), new THREE.MeshBasicMaterial({ map: pad.t })); padTop.rotation.x = -Math.PI / 2; padTop.position.set(18.5, 0.779, 13.1); scene.add(padTop)
  box(0.1, 0.02, 0.4, 0x202024, 18.33, 0.778, 13.0)                              // descanso de pulso
  const kb = new THREE.Group(); kb.position.set(18.5, 0.778, 13.0); kb.rotation.y = Math.PI / 2; scene.add(kb)
  box(0.43, 0.02, 0.17, 0x16161a, 0, 0, 0, kb)
  const keys = tex(256, 100)
  const kmat = new THREE.MeshBasicMaterial({ map: keys.t })
  const ktop = new THREE.Mesh(new THREE.PlaneGeometry(0.42, 0.16), kmat); ktop.rotation.x = -Math.PI / 2; ktop.position.y = 0.0215; kb.add(ktop)
  const drawKeys = (now: number) => {
    const c = keys.ctx; c.fillStyle = '#0b0b0e'; c.fillRect(0, 0, 256, 100)
    for (let r = 0; r < 5; r++) for (let k = 0; k < 15; k++) {
      c.fillStyle = `hsl(${(k * 24 + r * 20 + now * 140) % 360} 100% 50%)`; c.fillRect(2 + k * 16.9, 3 + r * 19, 15, 17) // brilho RGB
      c.fillStyle = '#1b1b21'; c.fillRect(4 + k * 16.9, 4 + r * 19, 11, 12)                                              // tecla
    }
    keys.t.needsUpdate = true
  }
  const mouse = box(0.07, 0.03, 0.11, 0x141418, 18.5, 0.778, 13.4)
  const mglow = new THREE.Mesh(new THREE.BoxGeometry(0.072, 0.004, 0.012), bm(0xff00ff)); mglow.position.set(18.5, 0.782, 13.45); scene.add(mglow)
  box(0.012, 0.012, 0.02, 0x555555, 18.5, 0.806, 13.37)                           // scroll
  box(0.5, 0.006, 0.006, 0x111111, 18.75, 0.779, 13.35)                            // cabo do mouse
  act(mouse, 'Olhar o mouse', () => toast('Mouse gamer 12000 DPI. Ele só usa pra abrir o terminal.'))

  // ---- monitores (editor e navegador) em braços ----
  const screens = [12.5, 13.5].map((z, i) => {
    const t = tex(512, 288)
    const g = new THREE.Group(); g.position.set(18.88, 0, z); g.rotation.y = i ? 0.2 : -0.2; scene.add(g)
    act(g, 'Editar o código do Smoll', openEditor)
    box(0.05, 0.01, 0.2, 0x151515, 0.02, 0.77, 0, g); cyl(0.015, 0.2, 0x222222, 0.05, 0.78, 0, g)  // base e braço
    box(0.03, 0.04, 0.08, 0x222222, 0.04, 0.96, 0, g)
    box(0.035, 0.38, 0.68, 0x0a0a0a, 0, 0.93, 0, g)                                              // moldura fina
    box(0.012, 0.03, 0.2, 0x0a0a0a, 0.0, 0.915, 0, g)
    const s = new THREE.Mesh(new THREE.PlaneGeometry(0.64, 0.36), new THREE.MeshBasicMaterial({ map: t.t })); s.position.set(-0.019, 1.12, 0); s.rotation.y = -Math.PI / 2; g.add(s)
    for (let k = 0; k < 3; k++) box(0.003, 0.04, 0.04, 0xf4e04d, -0.019, 0.935, -0.2 + k * 0.05 + i * 0.1, g) // post-its na moldura
    return { ...t, draw: i ? drawBrowser : drawEditor }
  })
  box(0.03, 0.02, 0.5, bm(0xfff4d6), 18.86, 1.32, 13) // barra de luz sobre os monitores
  const cam = box(0.05, 0.025, 0.07, 0x111111, 18.85, 1.31, 12.5); cam.rotation.y = -0.2
  const lens = new THREE.Mesh(new THREE.SphereGeometry(0.009, 8, 6), bm(0x335588)); lens.position.set(18.82, 1.33, 12.5); scene.add(lens)

  // ---- caixas de som, headset no suporte, latas, caneca, planta ----
  for (const z of [11.98, 14.02]) { box(0.1, 0.2, 0.1, 0x1b1b1b, 18.78, 0.77, z); box(0.005, 0.07, 0.07, 0x050505, 18.727, 0.84, z); box(0.005, 0.03, 0.03, 0x050505, 18.727, 0.79, z) }
  cyl(0.05, 0.01, 0x222222, 18.7, 0.77, 13.95); cyl(0.01, 0.22, 0x333333, 18.7, 0.78, 13.95)
  const band = new THREE.Mesh(new THREE.TorusGeometry(0.09, 0.015, 8, 16, Math.PI), lm(0x111111)); band.position.set(18.7, 0.99, 13.95); band.rotation.y = Math.PI / 2; scene.add(band)
  for (const dz of [-0.09, 0.09]) { const cup = cyl(0.04, 0.03, 0xc0202a, 18.7, 0.97, 13.95 + dz); cup.rotation.x = Math.PI / 2 }
  for (const [z, c] of [[12.2, 0x2ecc40], [12.3, 0x1e90ff], [12.1, 0xff8c00]] as const) cyl(0.035, 0.12, c, 18.82, 0.77, z)   // energéticos
  cyl(0.035, 0.08, 0xffffff, 18.36, 0.778, 12.15); cyl(0.03, 0.005, 0x3a1f10, 18.36, 0.856, 12.15)                          // caneca de café
  cyl(0.035, 0.07, 0xa0522d, 18.8, 0.77, 12.9)                                                                                // vasinho
  for (let i = 0; i < 5; i++) { const l = new THREE.Mesh(new THREE.SphereGeometry(0.03, 6, 5), lm(0x3fa34d)); l.position.set(18.8 + Math.cos(i * 1.3) * 0.02, 0.87 + (i % 2) * 0.03, 12.9 + Math.sin(i * 1.3) * 0.02); scene.add(l) }

  // ---- gabinete com lateral de vidro (hardware por dentro) ----
  box(0.21, 0.47, 0.45, 0x0c0c0e, 18.62, 0, 12.0)
  const tw = tex(256, 262)
  const glass = new THREE.Mesh(new THREE.PlaneGeometry(0.43, 0.45), new THREE.MeshBasicMaterial({ map: tw.t })); glass.position.set(18.514, 0.235, 12.0); glass.rotation.y = -Math.PI / 2; scene.add(glass)
  box(0.012, 0.47, 0.012, 0x050505, 18.512, 0, 11.775); box(0.012, 0.47, 0.012, 0x050505, 18.512, 0, 12.225)
  box(0.012, 0.012, 0.45, 0x050505, 18.512, 0.468, 12.0); box(0.012, 0.012, 0.45, 0x050505, 18.512, 0, 12.0)
  act(glass, 'Olhar o PC do Smoll', () => toast(pick(['Ryzen 9, RTX, 64 GB de RAM. Roda tudo, menos o Chrome com 40 abas.', 'Water cooler com RGB. A temperatura continua 70°C. Rondônia.', 'O PC da casa mais barulhenta do bairro.'])))
  const pcLight = new THREE.PointLight(0xaa44ff, 3, 3); pcLight.position.set(18.2, 0.25, 11.95); scene.add(pcLight)
  // cabos e régua de tomadas
  for (const z of [12.5, 13.5]) box(0.01, 0.72, 0.01, 0x111111, 18.975, 0.04, z)
  box(0.01, 0.01, 0.9, 0x111111, 18.9, 0.005, 12.4)
  box(0.05, 0.03, 0.3, 0xdddddd, 18.88, 0, 12.7); box(0.04, 0.005, 0.01, bm(0x2ecc71), 18.88, 0.03, 12.75)
  box(0.012, 0.012, 0.3, 0x111111, 18.8, 0.003, 12.2)

  let acc = 0, accF = 0
  const redraw = (now: number) => screens.forEach((s) => { s.draw(s.ctx, 512, 288, now); s.t.needsUpdate = true })
  redraw(0); drawKeys(0); drawTower(tw.ctx, 256, 262, 0); tw.t.needsUpdate = true
  return {
    update(now: number, dt: number) {
      const hsl = (now * 0.3) % 1
      strip.material.color.setHSL(hsl, 1, 0.55); mglow.material.color.setHSL(hsl, 1, 0.55); pcLight.color.setHSL((hsl + 0.7) % 1, 1, 0.55)
      if ((accF += dt) > 0.1) { accF = 0; drawKeys(now); drawTower(tw.ctx, 256, 262, now); tw.t.needsUpdate = true }
      if ((acc += dt) > 0.25) { acc = 0; redraw(now) }
    },
  }
}
