import * as THREE from 'three'
import './loading'
import { MAP, WALL, WALL_H, OUTDOOR, topAt } from './map'
import { state, gateWalls, toast, gameHour, clock, type Vehicle } from './state'
import { updateInteract, dialog, tickHold } from './interact'
import { buildProps, blockers, roofHeight, playerPos } from './props'
import { PLACE } from './place'
import { UM, JOIN, MAC, PAL, BAR } from './bairro'
import { connectNet } from './net'
import { buildSmoll } from './smoll'
import { loadInventory, initHeld, updateHeld } from './inventory'
import { initPhone } from './phone'
import './social'
import { tv, cssR } from './tv'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import { initFx } from './fx'
import { pbr, FLOOR_TEX } from './tex'
import { VRButton } from 'three/examples/jsm/webxr/VRButton.js'

const H = 2.6
const R = 0.2
const scene = new THREE.Scene()
scene.fog = new THREE.Fog(0x8d98a0, 18, 110) // névoa de distância: esconde o fim do mundo
const ceilings: THREE.Object3D[] = [] // somem na vista do mapa
scene.background = new THREE.Color(0x8cc4f2)
const camera = new THREE.PerspectiveCamera(70, innerWidth / innerHeight, 0.05, 200)
const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true }) // alpha: o "buraco" da TV deixa ver o iframe do YouTube por trás
renderer.setSize(innerWidth, innerHeight)
renderer.xr.enabled = true; renderer.xr.setFoveation(1)
renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFShadowMap
renderer.domElement.style.cssText = 'position:fixed;inset:0;z-index:1'
document.body.append(cssR.domElement, renderer.domElement)
;(window as any).__info = renderer.info // debug: chamadas de desenho e triângulos
;(window as any).__scene = scene // debug

const ambient = new THREE.AmbientLight(0xffffff, 1.4); scene.add(ambient)
const monitorLight = new THREE.PointLight(0x66aaff, 1.2, 5)
monitorLight.position.set(18.7, 1.3, 13)
scene.add(monitorLight)

// chão, paredes e teto a partir do mapa (teto só nos cômodos; o quintal fica de céu aberto)
const floorGeo = new THREE.PlaneGeometry(1, 1)
const wallMat: Record<string, THREE.Material> = {}
const geo: Record<string, THREE.BoxGeometry> = {}
const ceilMat = Object.assign(pbr('beige_wall_001', 0xf2efe6), { polygonOffset: true, polygonOffsetFactor: 2, polygonOffsetUnits: 2 }) // empurrado pra trás: a laje da garagem (props.ts) tem a base na mesma altura e brigava no z-buffer
const glassMat = new THREE.MeshLambertMaterial({ color: 0xcfe8ff, transparent: true, opacity: 0.2, side: THREE.DoubleSide, depthWrite: false })
const frameMat = new THREE.MeshLambertMaterial({ color: 0xf5f5f5 })
const wm = (c: string) => (wallMat[c] ??= c === 'T' ? pbr('castle_wall_slates') : c === 'M' ? pbr('beige_wall_001', 0xd8cdb8) : pbr('beige_wall_001'))
const isWall = (x: number, z: number) => ['#', 'w', 'M'].includes(MAP[z]?.[x])

// janela de verdade: parede com buraco (peitoril + verga), vidro transparente e esquadria
function windowCell(x: number, z: number) {
  const along = isWall(x - 1, z) && isWall(x + 1, z) // parede corre em x
  const cx = x + 0.5, cz = z + 0.5
  const part = (w: number, h: number, d: number, mat: THREE.Material, px: number, py: number, pz: number) => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat); m.position.set(px, py, pz); scene.add(m)
  }
  part(1, 0.9, 1, wm('#'), cx, 0.45, cz); part(1, 0.6, 1, wm('#'), cx, 2.3, cz)
  // esquadria no centro da espessura: (comprimento, altura, profundidade) trocados conforme a orientação
  const fr = (l: number, h: number, d: number, off: number, py: number) => along ? part(l, h, d, frameMat, cx + off, py, cz) : part(d, h, l, frameMat, cx, py, cz + off)
  fr(1, 0.05, 0.08, 0, 2.0); fr(1, 0.05, 0.08, 0, 0.9); fr(0.05, 1.1, 0.08, -0.475, 1.45); fr(0.05, 1.1, 0.08, 0.475, 1.45)
  fr(0.04, 1.1, 0.06, 0, 1.45); fr(1, 0.04, 0.06, 0, 1.45)
  const pane = new THREE.Mesh(new THREE.PlaneGeometry(1, 1.1), glassMat)
  pane.position.set(cx, 1.45, cz); if (!along) pane.rotation.y = Math.PI / 2
  scene.add(pane)
}

// chão, parede e teto do mapa são centenas de caixas iguais: em vez de um objeto por metro, juntamos tudo por material (poucas chamadas de desenho)
const batch = new Map<THREE.Material, { ms: THREE.Mesh[]; cast: boolean }>()
const queue = (m: THREE.Mesh, cast: boolean) => { m.updateMatrix(); const k = m.material as THREE.Material; if (!batch.has(k)) batch.set(k, { ms: [], cast }); batch.get(k)!.ms.push(m) }
// caixa de parede com UV em metros: a textura não estica na altura
const wallGeo = (h: number) => { const g = new THREE.BoxGeometry(1, h, 1), uv = g.attributes.uv; for (let i = 0; i < uv.count; i++) if (i < 8 || i >= 16) uv.setY(i, uv.getY(i) * h); return g }

MAP.forEach((row, z) => [...row].forEach((c, x) => {
  if (c === 'X') return // parede invisível (só colisão)
  if (c === 'w') return windowCell(x, z)
  if (c in WALL) {
    const h = WALL_H[c]
    const m = new THREE.Mesh(geo[c] ??= wallGeo(h), wm(c))
    m.position.set(x + 0.5, h / 2, z + 0.5)
    if (c === 'P') { scene.add(m); gateWalls.push(m) } else queue(m, true) // o portão fica solto: ele se move
    return
  }
  const out = OUTDOOR.includes(c)
  // quintal: manchas de grama e terra vermelha
  const dirtPatch = Math.sin(x * 12.9 + z * 78.2) * 43758 % 1 <= -0.3
  const mat = c === 'Y' ? (dirtPatch ? pbr('red_laterite_soil_stones') : pbr('grass_path_2', Math.sin(x * 3.1 + z * 5.7) > 0 ? 0xffffff : 0xd8e4c0)) : pbr(FLOOR_TEX[c] ?? FLOOR_TEX.H)
  const f = new THREE.Mesh(floorGeo, mat)
  f.rotation.x = -Math.PI / 2
  f.position.set(x + 0.5, 0, z + 0.5)
  queue(f, false)
  if (c === 'F') { // verga sobre a porta da frente
    const l = new THREE.Mesh(new THREE.BoxGeometry(1, 0.5, 1), wm('#')); l.position.set(x + 0.5, 2.35, z + 0.5); queue(l, true)
  }
  if (!out) {
    const t = new THREE.Mesh(floorGeo, ceilMat)
    t.rotation.x = Math.PI / 2
    t.position.set(x + 0.5, H, z + 0.5)
    queue(t, true)
  }
}))

for (const [mat, { ms, cast }] of batch) {
  const mesh = new THREE.Mesh(mergeGeometries(ms.map((m) => m.geometry.clone().applyMatrix4(m.matrix)))!, mat)
  mesh.userData.sh = 1; mesh.receiveShadow = true; mesh.castShadow = cast; scene.add(mesh)
  if (mat === ceilMat) ceilings.push(mesh) // somem na vista do mapa
}

// céu: esfera com gradiente + terra vermelha até o horizonte + sol
const skyTex = (() => {
  const c = document.createElement('canvas'); c.width = 1024; c.height = 256
  const g2 = c.getContext('2d')!
  const gr = g2.createLinearGradient(0, 0, 0, 256)
  gr.addColorStop(0, '#2f6fc9'); gr.addColorStop(0.5, '#8cc4f2'); gr.addColorStop(1, '#f6d9a8')
  g2.fillStyle = gr; g2.fillRect(0, 0, 1024, 256)
  for (let i = 0; i < 20; i++) { // nuvens de cúmulo (bolinhas brancas macias)
    const cx = (Math.sin(i * 12.9898) * 43758.5453 % 1 + 1) % 1 * 1024, cy = 35 + ((Math.sin(i * 78.233) * 12345.678 % 1 + 1) % 1) * 75, r = 22 + ((Math.sin(i * 3.7) * 999 % 1 + 1) % 1) * 40
    for (let k = 0; k < 5; k++) { const x = cx + (k - 2) * r * 0.6, y = cy + Math.sin(k * 2.1 + i) * r * 0.25, rg = g2.createRadialGradient(x, y, 0, x, y, r); rg.addColorStop(0, 'rgba(255,255,255,0.95)'); rg.addColorStop(1, 'rgba(255,255,255,0)'); g2.fillStyle = rg; g2.fillRect(x - r, y - r, r * 2, r * 2) }
  }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace
  return t
})()
const sky = new THREE.Mesh(new THREE.SphereGeometry(180, 24, 16), new THREE.MeshBasicMaterial({ map: skyTex, side: THREE.BackSide, fog: false }))
sky.position.set(30, 0, 11)
scene.add(sky)
const dirt = new THREE.Mesh(new THREE.PlaneGeometry(2400, 2400), pbr('red_laterite_soil_stones', 0xffffff, 800))
dirt.rotation.x = -Math.PI / 2; dirt.position.set(20, -0.02, 11)
scene.add(dirt)
const sun = new THREE.Mesh(new THREE.SphereGeometry(3), new THREE.MeshBasicMaterial({ color: 0xfff3c4, fog: false }))
sun.position.set(-40, 45, 70)
scene.add(sun)
const sunLight = new THREE.DirectionalLight(0xfff0d0, 1.2)
sunLight.position.set(-40, 45, 70)
sunLight.castShadow = true; sunLight.shadow.mapSize.set(1024, 1024); sunLight.shadow.bias = -0.0004; sunLight.shadow.normalBias = 0.03
Object.assign(sunLight.shadow.camera, { left: -28, right: 28, top: 28, bottom: -28, near: 1, far: 320 })
scene.add(sunLight, sunLight.target)
const fx = new URLSearchParams(location.search).get('fx') === '0' ? null : initFx(renderer, scene, camera) // ?fx=0 desliga o pós-processamento (celular fraco)
// sombras: só o que é iluminado e opaco projeta/recebe; chão (plano virado pra cima) só recebe. Rodado de tempos em tempos pra pegar o que carrega depois (Smoll, itens)
const shade = () => scene.traverse((o) => {
  const m = o as THREE.Mesh; if (!m.isMesh || m.userData.sh) return; m.userData.sh = 1
  const mat = m.material as THREE.Material; if (Array.isArray(mat) || mat.transparent || !((mat as any).isMeshLambertMaterial || (mat as any).isMeshStandardMaterial)) return
  const g = m.geometry; if (!g.boundingSphere) g.computeBoundingSphere()
  m.receiveShadow = true; m.castShadow = g.boundingSphere!.radius * Math.max(...m.getWorldScale(cv).toArray()) > 0.7 && !(g.type === 'PlaneGeometry' && m.rotation.x < 0) // objeto pequeno não projeta sombra: cada projetor custa um desenho a mais
})
// longe demais (além da neblina) não desenha: esconde o que está a mais de 115 m; volta quando o jogador chega perto
const cs = new THREE.Sphere()
const cull = (px: number, pz: number, map: boolean) => scene.traverse((o) => {
  const m = o as THREE.Mesh; if (!m.isMesh || (m as THREE.SkinnedMesh).isSkinnedMesh) return
  const g = m.geometry; if (!g.boundingSphere) g.computeBoundingSphere()
  cs.copy(g.boundingSphere!).applyMatrix4(m.matrixWorld); if (cs.radius > 25) return // céu, chão infinito e o mapa mesclado ficam sempre
  if (!map && Math.hypot(cs.center.x - px, cs.center.z - pz) - cs.radius > 115) { if (m.visible) { m.visible = false; m.userData.far = 1 } } else if (m.userData.far) { m.visible = true; m.userData.far = 0 }
})
let shadeT = 0, cullT = 0, frame = 0
const cv = new THREE.Vector3()
renderer.shadowMap.autoUpdate = false // a sombra é redesenhada a cada 2 quadros (ver o loop)
// FPS no canto (F2 liga/desliga os efeitos pra comparar o custo)
const fpsEl = document.createElement('div'); fpsEl.style.cssText = 'position:fixed;left:8px;bottom:8px;z-index:50;font:12px monospace;color:#9f9;background:#000a;padding:3px 6px;border-radius:4px;pointer-events:none'
document.body.append(fpsEl)
let fpsN = 0, fpsT = 0, fpsLast = performance.now()
addEventListener('keydown', (e) => { if (e.code === 'F2' && fx) { e.preventDefault(); fx.toggle() } if (e.code === 'F3' && fx) { e.preventDefault(); fx.toggleAo() } })

// lua e estrelas (aparecem de noite)
const moon = new THREE.Mesh(new THREE.SphereGeometry(2.2), new THREE.MeshBasicMaterial({ color: 0xdfe8ff, fog: false })); scene.add(moon)
const starGeo = new THREE.BufferGeometry()
starGeo.setAttribute('position', new THREE.BufferAttribute((() => { const a = new Float32Array(450 * 3); for (let i = 0; i < 450; i++) { const th = Math.random() * Math.PI * 2, y = 0.05 + Math.random() * 0.95, r = Math.sqrt(1 - y * y) * 170; a.set([r * Math.cos(th), y * 170, r * Math.sin(th)], i * 3) } return a })(), 3))
const stars = new THREE.Points(starGeo, new THREE.PointsMaterial({ color: 0xffffff, size: 2, sizeAttenuation: false, fog: false, transparent: true })); scene.add(stars)
const cDay = new THREE.Color(0.5, 0.57, 0.66), cNight = new THREE.Color(0.04, 0.06, 0.16), cDusk = new THREE.Color(1, 0.6, 0.4), cTmp = new THREE.Color(), fogBase = new THREE.Color(0xa9b3ba)
const clockEl = document.getElementById('clock')!
let clockT = 0
const applyTime = (h: number, px: number, pz: number) => {
  const a = ((h - 6) / 12) * Math.PI, s = Math.sin(a), day = THREE.MathUtils.smoothstep(s, -0.12, 0.3)
  const dusk = Math.max(0, 1 - Math.abs(s - 0.04) / 0.3)             // perto do horizonte: tom alaranjado
  cTmp.copy(cNight).lerp(cDay, day).lerp(cDusk, dusk * 0.5)
  ;(sky.material as THREE.MeshBasicMaterial).color.copy(cTmp)
  scene.fog!.color.copy(fogBase).multiply(cTmp)
  ambient.intensity = 0.35 + 1.0 * day; ambient.color.setRGB(0.55 + 0.3 * day, 0.62 + 0.28 * day, 1)
  sunLight.intensity = 1.7 * day; sunLight.color.setRGB(0.85, 0.9 - 0.3 * dusk, 0.95 - 0.5 * dusk) // céu encoberto: sol frio e mais fraco
  const ox = Math.cos(a) * 100, oy = s * 90 + 4, oz = 25                 // nasce no leste (+x) e se põe no oeste
  sunLight.position.set(px + ox, Math.max(oy, 5), pz + oz); sunLight.target.position.set(px, 0, pz); sunLight.castShadow = day > 0.03 // a sombra segue o jogador
  sun.position.set(px + ox, oy, pz + oz); sun.visible = s > -0.15
  ;(sun.material as THREE.MeshBasicMaterial).color.setRGB(1, 0.95 - 0.25 * dusk, 0.77 - 0.45 * dusk)
  moon.position.set(px - ox, -oy, pz - oz); moon.visible = s < 0.1
  stars.position.set(px, 0, pz); (stars.material as THREE.PointsMaterial).opacity = Math.max(0, 1 - day * 1.6); stars.visible = day < 0.6
}

const props = buildProps(scene)
const smoll = buildSmoll(scene)
const net = connectNet(scene)
loadInventory()
ceilings.push(...props.roofs) // telhados também somem na vista do mapa

// jogador
const p = { x: 15.5, y: 0, z: 8.5, yaw: Math.PI, pitch: 0, crouch: 0 } // crouch: 0 em pé → 1 agachado (Shift); vai pra rede e pro avatar
;(window as any).__p = p // debug: teleporta no console
;(window as any).__clock = clock // debug: muda a hora do jogo
;(window as any).__state = state // debug: estado compartilhado
const keys = new Set<string>()
addEventListener('keydown', (e) => { if (!state.editing) keys.add(e.code) })
addEventListener('keyup', (e) => keys.delete(e.code))
const hud = document.getElementById('hud')!
const labels = document.getElementById('labels')!
// mapa visto de cima: ESC solta o mouse e abre; clicar volta pro jogo
const mapCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 300)
mapCam.position.set(19, 80, 11.5); mapCam.up.set(0, 0, -1); mapCam.lookAt(19, 0, 11.5)
let mapZoom = 1 // roda do mouse no mapa: 1 = casa e rua; maior = mais longe (segue o jogador)
const fitMap = () => {
  const a = innerWidth / innerHeight, hh = Math.max(14, 23 / a) * mapZoom // meia-altura que cabe casa + rua
  mapCam.left = -hh * a; mapCam.right = hh * a; mapCam.top = hh; mapCam.bottom = -hh; mapCam.updateProjectionMatrix()
}
fitMap()
const marker = new THREE.Group()
const cone = new THREE.Mesh(new THREE.ConeGeometry(0.6, 1.8, 12), new THREE.MeshBasicMaterial({ color: 0xff4422 })); cone.rotation.x = -Math.PI / 2
marker.add(cone); marker.position.y = 4; marker.visible = false; scene.add(marker)
const NEAR: [string, number, number][] = [['Oficina', 4, 3.5], ['Sala', 10.5, 3.5], ['Cozinha', 16.5, 3.5], ['Corredor', 10, 8.5], ['Varanda', 3.5, 13], ['Banheiro', 9, 13], ['Quarto do Smoll', 15.5, 13], ['Garagem', 24, 3.5], ['Quintal', 24, 10.5]]
const FAR: [string, number, number][] = [['R. Umuarama', UM, 50], ['R. Umuarama', UM, -60], ['R. Umuarama', UM, 120], ['R. Umuarama', UM, 190], ['R. Palomas', 135, PAL], ['R. Joinville', JOIN, 70], ['R. Joinville', JOIN, 170], ['R. Macaúbas', MAC, 60], ['R. Macaúbas', MAC, 180], ['R. Macaúbas', MAC, -50], ['R. Barreiras', -10, BAR], ['R. Barreiras', 70, BAR], ['R. Barreiras', 140, BAR], ['Centro Municipal de Educação Infantil', 76, -68], ['Moda Exata', MAC + 13, 14], ['LAGO Advocacia', MAC + 13, 111], ['Casa do Smoll', 10, 8]]
const ROOMS: [string, number, number, number, number][] = [...NEAR.map(([n, x, z]) => [n, x, z, 0, 2.2] as [string, number, number, number, number]), ['Rua', 34, 11, 0, 1.6], ...FAR.map(([n, x, z]) => [n, x, z, 1.4, 99] as [string, number, number, number, number])]
labels.innerHTML = ROOMS.map(([n]) => `<span>${n}</span>`).join('')
let mapMode = false, everLocked = false
addEventListener('wheel', (e) => { if (mapMode) { mapZoom = Math.min(16, Math.max(0.6, mapZoom * (e.deltaY > 0 ? 1.15 : 0.87))); fitMap() } })
;(window as any).__map = (on: boolean) => setMap(on) // debug
const setMap = (on: boolean) => {
  mapMode = on
  ceilings.forEach((c) => (c.visible = !on)); marker.visible = on
  labels.style.display = on ? 'block' : 'none'
  hud.textContent = on ? `Mapa — ${PLACE.street} · ${PLACE.sector}, ${PLACE.city} — roda do mouse: zoom — M para voltar ao jogo` : ''
  hud.style.display = on || !document.pointerLockElement ? 'grid' : 'none'
}
addEventListener('keydown', (e) => { if (e.code === 'KeyM' && !state.editing && !dialog.open) setMap(!mapMode) })
renderer.domElement.addEventListener('click', () => renderer.domElement.requestPointerLock())
document.addEventListener('pointerlockchange', () => {
  const locked = !!document.pointerLockElement
  if (locked) everLocked = true
  hud.style.display = locked || state.editing ? 'none' : everLocked ? 'grid' : hud.style.display || 'grid'
})
addEventListener('mousemove', (e) => {
  if (!document.pointerLockElement) return
  p.yaw -= e.movementX * 0.002
  p.pitch = Math.max(-1.3, Math.min(1.3, p.pitch - e.movementY * 0.002))
})
addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix(); fitMap(); renderer.setSize(innerWidth, innerHeight); fx?.resize(innerWidth, innerHeight)
})

// Física: gravidade, pulo (espaço), colisão com altura e agarrar de borda. O que tem topo ≤ pés + degrau não bloqueia (sobe nele); acima, bloqueia.
// Muros, paredes (grade do mapa), objetos (caixas) e telhados (superfície inclinada) têm altura; só a borda do mundo é parede invisível.
const STEP = 0.32, BODY = 1.2, GRAV = 9.8, JUMP = 4.2, REACH = 1.5 // corpo de 1,2 m; pulo de ~0,9 m + alcance dos braços de 1,5 m: dá pra subir num muro de 2 m
const corners = (x: number, z: number): [number, number][] => [[x, z], [x - R, z - R], [x + R, z - R], [x - R, z + R], [x + R, z + R]]
const blockTop = (x: number, z: number, y: number) => { // topo mais alto entre o que bloqueia o corpo aqui (0 = livre; Infinity = parede invisível)
  let t = 0
  for (const [cx, cz] of corners(x, z)) { const w = topAt(cx, cz); if (w > y + STEP && w > t) t = w }
  for (const [a, b, c, d, top, bot] of blockers) if (x > a - R && x < c + R && z > b - R && z < d + R && top > y + STEP && bot < y + BODY && top > t) t = top
  return t
}
const free = (x: number, z: number, y: number) => blockTop(x, z, y) === 0
const groundAt = (x: number, z: number, y: number) => { // superfície mais alta que dá pra pisar (0 = chão)
  const lim = y + STEP + 0.01
  let g = 0
  for (const [cx, cz] of corners(x, z)) { const w = topAt(cx, cz); if (w <= lim && w > g) g = w }
  for (const [a, b, c, d, top] of blockers) if (x > a - R && x < c + R && z > b - R && z < d + R && top <= lim && top > g) g = top
  const rh = roofHeight(x, z); if (rh >= 0 && rh <= lim && rh > g) g = rh
  return g
}
state.tp = (x, z) => { p.x = x; p.z = z; p.y = 0; vy = 0 }
let vy = 0, grounded = true
// teto: dentro da casa e da garagem a cabeça bate em 2,6 m (na verga da porta da frente, em 2,1 m); a céu aberto, por cima das paredes e nos telhados, não há limite
const ceilAt = (x: number, z: number) => {
  const c = MAP[Math.floor(z)]?.[Math.floor(x)]
  return c === undefined || c === 'X' || OUTDOOR.includes(c) || c === '#' || c === 'w' || c === 'M' || c === 'T' || c === 'P' ? Infinity : c === 'F' ? 2.1 : H
}
const ceilingOver = (x: number, z: number) => Math.min(ceilAt(x, z), ceilAt(x - R, z - R), ceilAt(x + R, z - R), ceilAt(x - R, z + R), ceilAt(x + R, z + R))
// agarrar de borda: no ar, andando contra algo cujo topo está ao alcance dos braços, sobe nele (muro, mureta, beirada do telhado)
const tryMantle = (nx: number, nz: number, moving: boolean) => {
  if (grounded || !moving) return
  const t = blockTop(nx, nz, p.y)
  if (isFinite(t) && t > p.y + STEP && t <= p.y + REACH && t + BODY <= ceilingOver(nx, nz)) { p.y = t; vy = 0 }
}

// ---------- dirigir: entra no carro/moto, W/S acelera, A/D vira, espaço freia, F sai. Os blockers do veículo saem do mundo enquanto ele anda ----------
let drv: Vehicle | null = null
let seatApplied: typeof state.seat = null
addEventListener('keydown', (e) => { // levantar do assento
  if (state.seat && !state.editing && ['KeyW', 'KeyA', 'KeyS', 'KeyD', 'Space'].includes(e.code)) { const s = state.seat; state.seat = null; seatApplied = null; p.x = s.ex; p.z = s.ez; p.y = 0; vy = 0 }
})
state.enter = (v) => {
  drv = v; state.driving = true; v.v = 0
  for (const r of v.rects) { const i = blockers.indexOf(r as never); if (i >= 0) blockers.splice(i, 1) }
  p.yaw = v.g.rotation.y + Math.PI / 2; p.pitch = 0
  toast(`${v.kind === 'car' ? 'Dirigindo' : 'Pilotando'}: W/S acelera, A/D vira, espaço freia, F sai`)
}
const exitVeh = () => {
  const v = drv!, g = v.g.position, th = v.g.rotation.y, c = Math.cos(th), sn = Math.sin(th)
  let spot: [number, number] | null = null
  for (const lz of [v.wid / 2 + 0.5, -(v.wid / 2 + 0.5), v.wid / 2 + 1.2, -(v.wid / 2 + 1.2)]) { const x = g.x + lz * sn, z = g.z + lz * c; if (free(x, z, 0)) { spot = [x, z]; break } }
  const hx = Math.abs(c) * v.len / 2 + Math.abs(sn) * v.wid / 2, hz = Math.abs(sn) * v.len / 2 + Math.abs(c) * v.wid / 2
  v.rects = [[g.x - hx + v.ox, g.z - hz, g.x + hx + v.ox, g.z + hz, v.top, 0]]; blockers.push(...(v.rects as never[]))
  p.x = spot ? spot[0] : g.x; p.z = spot ? spot[1] : g.z; p.y = 0; vy = 0; drv = null; state.driving = false
}
addEventListener('keydown', (e) => { if (e.code === 'KeyF' && drv && !state.editing) exitVeh() })
const driveStep = (dt: number) => {
  const v = drv!, g = v.g, car = v.kind === 'car', vmax = car ? 7 : 10
  const acc = (+keys.has('KeyW') - +keys.has('KeyS')) * (car ? 5 : 7)
  v.v += acc * dt
  if (!acc || keys.has('Space')) v.v -= Math.sign(v.v) * Math.min(Math.abs(v.v), (keys.has('Space') ? 8 : 2.5) * dt) // atrito e freio
  v.v = Math.max(-vmax / 3, Math.min(vmax, v.v))
  const dth = (+keys.has('KeyA') - +keys.has('KeyD')) * (car ? 1.5 : 2.2) * (v.v / vmax) * dt
  g.rotation.y += dth; p.yaw += dth
  const th = g.rotation.y, c = Math.cos(th), sn = Math.sin(th), d = v.v * dt
  const nx = g.position.x - c * d, nz = g.position.z + sn * d, ah = Math.sign(v.v) * v.len / 2 // ponto da frente (ou da traseira, de ré)
  if (free(nx, nz, 0) && free(nx - c * ah, nz + sn * ah, 0)) { g.position.x = nx; g.position.z = nz } else v.v = 0
  const [lx, ly, lz] = v.eye, sx = g.position.x + lx * c + lz * sn, sz = g.position.z - lx * sn + lz * c
  p.x = sx; p.z = sz; p.y = 0; vy = 0
  camera.position.set(sx, ly, sz)
}

initHeld(camera, scene, { ground: groundAt, free })
// VR: o headset sobrescreve a pose da câmera, então ela vira filha de um "rig" que fica nos pés do jogador. Analógico esq. anda, dir. gira (estalos de 30°), gatilho = E
const rig = new THREE.Group(); scene.add(rig); rig.add(camera)
navigator.xr?.isSessionSupported('immersive-vr').then((ok) => { // só mostra o botão se houver VR; canto inferior direito, discreto
  if (!ok) return
  const b = VRButton.createButton(renderer); b.style.cssText += ';left:auto;right:14px;bottom:14px;transform:none;width:auto;padding:6px 12px;opacity:.7;z-index:10'
  document.body.append(b)
}).catch(() => {})
let xrTurn = 0, snapReady = true, trigPrev = false
const xrInput = () => {
  let lx = 0, ly = 0, rx = 0, trig = false
  for (const src of renderer.xr.getSession()?.inputSources ?? []) {
    const a = src.gamepad?.axes; if (!a) continue
    if (src.handedness === 'left') { lx = a[2] ?? 0; ly = a[3] ?? 0 } else { rx = a[2] ?? 0; trig ||= !!src.gamepad!.buttons[0]?.pressed }
  }
  if (Math.abs(rx) < 0.6) snapReady = true; else if (snapReady) { snapReady = false; xrTurn -= Math.sign(rx) * Math.PI / 6 }
  if (trig && !trigPrev) { dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyE' })); setTimeout(() => dispatchEvent(new KeyboardEvent('keyup', { code: 'KeyE' })), 90) } // gatilho = E (curto: fala)
  trigPrev = trig
  return [Math.abs(ly) > 0.15 ? -ly : 0, Math.abs(lx) > 0.15 ? lx : 0] // [frente, lado]
}
initPhone(camera, p)
addEventListener('contextmenu', (e) => e.preventDefault())
let last = performance.now(), inK = 0 // inK: 0 fora, 1 dentro de casa (suavizado)
const warm = new THREE.Color(0xffe0bd)
renderer.setAnimationLoop((now) => {
  // __fast: debug pra acelerar o tempo em máquina sem GPU (1 = normal). Ver tools/pose-audit.html
  const dt = Math.min((now - last) / 1000, 0.05) * ((window as any).__fast ?? 1); last = now
  const lock = dialog.open || drv || mapMode || state.seat ? 0 : 1
  const xr = renderer.xr.isPresenting
  const [xf, xs] = xr ? xrInput() : [0, 0]
  if (xr) { p.yaw = xrTurn + camera.rotation.y; p.pitch = 0 } // anda na direção em que a cabeça olha
  const f = lock * (+keys.has('KeyW') - +keys.has('KeyS') + xf), s = lock * (+keys.has('KeyD') - +keys.has('KeyA') + xs)
  const wantCrouch = (keys.has('ShiftLeft') || keys.has('ShiftRight')) && !drv && !state.seat && !!lock
  p.crouch += ((wantCrouch ? 1 : 0) - p.crouch) * Math.min(1, dt * 10)
  const sp = (keys.has('KeyR') ? 3.2 : 1.8 - 0.9 * p.crouch) * state.speed * dt // R corre, Shift agacha (anda devagar); passos menores combinam com o corpo menor
  const dx = (-Math.sin(p.yaw) * f + Math.cos(p.yaw) * s) * sp
  const dz = (-Math.cos(p.yaw) * f - Math.sin(p.yaw) * s) * sp
  const moving = f !== 0 || s !== 0
  if (free(p.x + dx, p.z, p.y)) p.x += dx; else tryMantle(p.x + dx, p.z, moving) // eixos separados = desliza na parede
  if (free(p.x, p.z + dz, p.y)) p.z += dz; else tryMantle(p.x, p.z + dz, moving)
  // vertical: cai com a gravidade, pousa em cima de caixas, pula com espaço
  vy -= GRAV * dt; p.y += vy * dt
  const gnd = groundAt(p.x, p.z, p.y)
  const onGround = p.y <= gnd + 0.002
  grounded = onGround
  if (p.y < gnd) { p.y = gnd; vy = 0 }
  if (onGround && lock && keys.has('Space')) vy = JUMP
  const ceil = ceilingOver(p.x, p.z)
  if (p.y < ceil && p.y + BODY > ceil) { p.y = Math.max(gnd, ceil - BODY); if (vy > 0) vy = 0 } // bate a cabeça no teto
  if (p.y < -5) { p.y = 0; vy = 0 }
  state.py = p.y
  if (!state.seat && !free(p.x, p.z, p.y)) { // preso (ex.: a porta ou o portão fechou em cima de você): vai pro ponto livre mais próximo
    out: for (let r = 0.1; r <= 1.6; r += 0.1) for (let k = 0; k < 16; k++) {
      const nx = p.x + Math.cos((k * Math.PI) / 8) * r, nz = p.z + Math.sin((k * Math.PI) / 8) * r
      if (free(nx, nz, p.y)) { p.x = nx; p.z = nz; break out }
    }
  }
  if (state.until && now > state.until) { state.until = 0; state.speed = 1; state.eye = 1.07; toast('O efeito do código acabou.') }
  if (drv) driveStep(dt)
  else if (state.seat) { // sentado: preso no assento, câmera baixa, vira pra frente do móvel na primeira vez
    const s = state.seat; if (seatApplied !== s) { seatApplied = s; p.yaw = s.yaw; p.pitch = 0 }
    p.x = s.x; p.z = s.z; p.y = s.y - 0.32; vy = 0
    // deitado: o olho fica a ~13 cm do colchão (não a 60 cm de quem está sentado num banco)
    camera.position.set(s.x, s.y + (s.lie ? 0.13 + 0.02 * Math.sin(now / 2400) : 0.6), s.z)
  } else if (!xr) camera.position.set(p.x, p.y + state.eye * (1 - 0.42 * p.crouch), p.z) // agachado: olhos 42% mais baixos
  if (xr) { rig.position.set(p.x, p.y, p.z); rig.rotation.y = xrTurn } else { rig.position.set(0, 0, 0); rig.rotation.y = 0; camera.rotation.set(p.pitch, p.yaw, state.seat?.roll ?? 0, 'YXZ') } // roll = cabeça deitada
  if (!xr) { // a cena "fecha" quando você chega perto dele na cama (state.bedFocus vem do smoll.ts)
    // deitado na cama o olho fica a 13 cm do colchão: abre o campo pra cena não virar um close do rosto dele
    const fovWant = 70 - 7 * state.bedFocus + (state.seat?.lie ? 12 : 0)
    if (Math.abs(camera.fov - fovWant) > 0.01) { camera.fov = fovWant; camera.updateProjectionMatrix() }
  }
  sky.position.set(p.x, 0, p.z); dirt.position.set(p.x, -0.02, p.z) // céu e chão acompanham o jogador: o mundo agora tem mais de 300 m
  props.update(dt, p.x, p.z, mapMode)
  net.update(dt, p)
  tickHold() // VR não manda keyup: resolve o "segurar E" pelo tempo
  if (!mapMode) updateInteract(scene, camera)
  smoll.update(dt, now / 1000, p.x, p.z)
  if (mapMode) {
    marker.position.x = p.x; marker.position.z = p.z; marker.rotation.y = p.yaw; marker.scale.setScalar(Math.max(1, mapZoom))
    const cx = mapZoom > 1.3 ? p.x : 19, cz = mapZoom > 1.3 ? p.z : 11.5 // com zoom longe a câmera segue o jogador
    mapCam.position.set(cx, 80, cz); mapCam.lookAt(cx, 0, cz)
    ROOMS.forEach(([, x, z, z0, z1], i) => { // rótulos HTML sobre o mapa
      const v = new THREE.Vector3(x, 0, z).project(mapCam)
      const el = labels.children[i] as HTMLElement
      el.style.display = mapZoom >= z0 && mapZoom <= z1 && Math.abs(v.x) < 1.1 && Math.abs(v.y) < 1.1 ? 'block' : 'none'
      el.style.left = `${(v.x * 0.5 + 0.5) * 100}%`; el.style.top = `${(-v.y * 0.5 + 0.5) * 100}%`
    })
  }
  tv.update(p.x, p.z, dt)
  updateHeld(dt, !!(keys.has('KeyW') || keys.has('KeyA') || keys.has('KeyS') || keys.has('KeyD')))
  playerPos.x = p.x; playerPos.z = p.z
  { const h = gameHour(); applyTime(h, p.x, p.z)
    inK += ((isFinite(ceilingOver(p.x, p.z)) ? 1 : 0) - inK) * Math.min(1, dt * 3) // dentro de casa: luz mais quente e cor menos dessaturada; fora, o frio do Village
    ambient.intensity += 0.55 * inK; ambient.color.lerp(warm, 0.65 * inK); fx?.grade(0.62 + 0.28 * inK)
    if ((clockT += dt) > 0.5) { clockT = 0; clockEl.textContent = `🕒 ${String(Math.floor(h)).padStart(2, '0')}:${String(Math.floor((h % 1) * 60)).padStart(2, '0')}` } }
  if ((shadeT -= dt) < 0) { shadeT = 2; shade() }
  if ((cullT -= dt) < 0) { cullT = 0.5; cull(p.x, p.z, mapMode) }
  if ((frame++ & 1) === 0) renderer.shadowMap.needsUpdate = true
  if ((fpsT += (now - fpsLast) / 1000, fpsLast = now, ++fpsN, fpsT >= 0.5)) { fpsEl.textContent = `${Math.round(fpsN / fpsT)} fps · fx ${fx ? (fx.on ? 'on' : 'off') : 'x'} (F2) · ao ${fx?.ao ? 'on' : 'off'} (F3)`; fpsN = fpsT = 0 }
  if (fx?.on && !mapMode && !xr) fx.render(now); else renderer.render(scene, mapMode ? mapCam : camera)
  if (state.photoReq) { const f = state.photoReq; state.photoReq = null; f(renderer.domElement.toDataURL('image/jpeg', 0.75)) } // foto do celular
  if (!mapMode) tv.render(camera)
})
