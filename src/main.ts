import * as THREE from 'three'
import { MAP, FLOOR, WALL, WALL_H, OUTDOOR, solid } from './map'
import { state, gateWalls, toast } from './state'
import { updateInteract, dialog } from './interact'
import { buildProps, blockers, mosaicMat } from './props'
import { PLACE } from './place'
import { connectNet } from './net'
import { buildSmoll } from './smoll'

const H = 2.6
const R = 0.2
const scene = new THREE.Scene()
scene.fog = new THREE.Fog(0xdfeaf5, 60, 170) // névoa de distância: esconde o fim do mundo
const ceilings: THREE.Object3D[] = [] // somem na vista do mapa
scene.background = new THREE.Color(0x8cc4f2)
const camera = new THREE.PerspectiveCamera(70, innerWidth / innerHeight, 0.05, 200)
const renderer = new THREE.WebGLRenderer({ antialias: true })
renderer.setSize(innerWidth, innerHeight)
document.body.appendChild(renderer.domElement)

scene.add(new THREE.AmbientLight(0xffffff, 1.4))
const monitorLight = new THREE.PointLight(0x66aaff, 1.2, 5)
monitorLight.position.set(18.7, 1.3, 13)
scene.add(monitorLight)

// chão, paredes e teto a partir do mapa (teto só nos cômodos; o quintal fica de céu aberto)
const floorGeo = new THREE.PlaneGeometry(1, 1)
const wallMat: Record<string, THREE.Material> = {}
const geo: Record<string, THREE.BoxGeometry> = {}
const ceilMat = new THREE.MeshLambertMaterial({ color: 0xf2efe6 })
const glassMat = new THREE.MeshLambertMaterial({ color: 0xcfe8ff, transparent: true, opacity: 0.2, side: THREE.DoubleSide, depthWrite: false })
const frameMat = new THREE.MeshLambertMaterial({ color: 0xf5f5f5 })
const wm = (c: string) => (wallMat[c] ??= c === 'T' ? mosaicMat() : new THREE.MeshLambertMaterial({ color: WALL[c] }))
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

MAP.forEach((row, z) => [...row].forEach((c, x) => {
  if (c === 'X') return // parede invisível (só colisão)
  if (c === 'w') return windowCell(x, z)
  if (c in WALL) {
    const h = WALL_H[c]
    const m = new THREE.Mesh(geo[c] ??= new THREE.BoxGeometry(1, h, 1), wm(c))
    m.position.set(x + 0.5, h / 2, z + 0.5)
    scene.add(m)
    if (c === 'P') gateWalls.push(m)
    return
  }
  const out = OUTDOOR.includes(c)
  // quintal: manchas de grama e terra vermelha
  const color = c === 'Y' ? (Math.sin(x * 12.9 + z * 78.2) * 43758 % 1 > -0.3 ? (Math.sin(x * 3.1 + z * 5.7) > 0 ? 0x5c8a3a : 0x4f7d33) : 0x9c4a2f) : FLOOR[c] ?? FLOOR.H
  const f = new THREE.Mesh(floorGeo, new THREE.MeshLambertMaterial({ color }))
  f.rotation.x = -Math.PI / 2
  f.position.set(x + 0.5, 0, z + 0.5)
  scene.add(f)
  if (c === 'F') { // verga sobre a porta da frente
    const l = new THREE.Mesh(new THREE.BoxGeometry(1, 0.5, 1), wm('#')); l.position.set(x + 0.5, 2.35, z + 0.5); scene.add(l)
  }
  if (!out) {
    const t = new THREE.Mesh(floorGeo, ceilMat)
    t.rotation.x = Math.PI / 2
    t.position.set(x + 0.5, H, z + 0.5)
    scene.add(t)
    ceilings.push(t)
  }
}))

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
const sky = new THREE.Mesh(new THREE.SphereGeometry(80, 24, 16), new THREE.MeshBasicMaterial({ map: skyTex, side: THREE.BackSide, fog: false }))
sky.position.set(30, 0, 11)
scene.add(sky)
const dirt = new THREE.Mesh(new THREE.PlaneGeometry(400, 400), new THREE.MeshLambertMaterial({ color: 0x9c4a2f }))
dirt.rotation.x = -Math.PI / 2; dirt.position.set(20, -0.02, 11)
scene.add(dirt)
const sun = new THREE.Mesh(new THREE.SphereGeometry(3), new THREE.MeshBasicMaterial({ color: 0xfff3c4, fog: false }))
sun.position.set(-40, 45, 70)
scene.add(sun)
const sunLight = new THREE.DirectionalLight(0xfff0d0, 1.2)
sunLight.position.set(-40, 45, 70)
scene.add(sunLight)

const props = buildProps(scene)
const smoll = buildSmoll(scene)
const net = connectNet(scene)
ceilings.push(...props.roofs) // telhados também somem na vista do mapa

// jogador
const p = { x: 15.5, z: 8.5, yaw: Math.PI, pitch: 0 }
;(window as any).__p = p // debug: teleporta no console
const keys = new Set<string>()
addEventListener('keydown', (e) => { if (!state.editing) keys.add(e.code) })
addEventListener('keyup', (e) => keys.delete(e.code))
const hud = document.getElementById('hud')!
const labels = document.getElementById('labels')!
// mapa visto de cima: ESC solta o mouse e abre; clicar volta pro jogo
const mapCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 300)
mapCam.position.set(19, 80, 11.5); mapCam.up.set(0, 0, -1); mapCam.lookAt(19, 0, 11.5)
const fitMap = () => {
  const a = innerWidth / innerHeight, hh = Math.max(14, 23 / a) // meia-altura que cabe casa + rua
  mapCam.left = -hh * a; mapCam.right = hh * a; mapCam.top = hh; mapCam.bottom = -hh; mapCam.updateProjectionMatrix()
}
fitMap()
const marker = new THREE.Group()
const cone = new THREE.Mesh(new THREE.ConeGeometry(0.6, 1.8, 12), new THREE.MeshBasicMaterial({ color: 0xff4422 })); cone.rotation.x = -Math.PI / 2
marker.add(cone); marker.position.y = 4; marker.visible = false; scene.add(marker)
const ROOMS: [string, number, number][] = [['Oficina', 4, 3.5], ['Sala', 10.5, 3.5], ['Cozinha', 16.5, 3.5], ['Corredor', 10, 8.5], ['Varanda', 3.5, 13], ['Banheiro', 9, 13], ['Quarto do Smoll', 15.5, 13], ['Garagem', 24, 3.5], ['Quintal', 24, 10.5], ['Rua', 34, 11]]
labels.innerHTML = ROOMS.map(([n]) => `<span>${n}</span>`).join('')
let mapMode = false, everLocked = false
;(window as any).__map = (on: boolean) => setMap(on) // debug
const setMap = (on: boolean) => {
  mapMode = on
  ceilings.forEach((c) => (c.visible = !on)); marker.visible = on
  labels.style.display = on ? 'block' : 'none'
  hud.textContent = on ? `Mapa — ${PLACE.street} · ${PLACE.sector}, ${PLACE.city} — clique para voltar ao jogo` : ''
}
renderer.domElement.addEventListener('click', () => renderer.domElement.requestPointerLock())
document.addEventListener('pointerlockchange', () => {
  const locked = !!document.pointerLockElement
  if (locked) everLocked = true
  hud.style.display = locked || state.editing ? 'none' : everLocked ? 'grid' : hud.style.display || 'grid'
  if (everLocked && !state.editing) setMap(!locked)
})
addEventListener('mousemove', (e) => {
  if (!document.pointerLockElement) return
  p.yaw -= e.movementX * 0.002
  p.pitch = Math.max(-1.3, Math.min(1.3, p.pitch - e.movementY * 0.002))
})
addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix(); fitMap(); renderer.setSize(innerWidth, innerHeight)
})

const hit = (x: number, z: number) => blockers.some(([a, b, c, d]) => x > a - R && x < c + R && z > b - R && z < d + R)
state.tp = (x, z) => { p.x = x; p.z = z }
const free = (x: number, z: number) =>
  !solid(x - R, z - R) && !solid(x + R, z - R) && !solid(x - R, z + R) && !solid(x + R, z + R) && !hit(x, z)

let last = performance.now()
renderer.setAnimationLoop((now) => {
  const dt = Math.min((now - last) / 1000, 0.05); last = now
  const lock = dialog.open ? 0 : 1
  const f = lock * (+keys.has('KeyW') - +keys.has('KeyS')), s = lock * (+keys.has('KeyD') - +keys.has('KeyA'))
  const sp = (keys.has('ShiftLeft') ? 3.2 : 1.8) * state.speed * dt // passos menores combinam com o corpo menor
  const dx = (-Math.sin(p.yaw) * f + Math.cos(p.yaw) * s) * sp
  const dz = (-Math.cos(p.yaw) * f - Math.sin(p.yaw) * s) * sp
  if (free(p.x + dx, p.z)) p.x += dx // eixos separados = desliza na parede
  if (free(p.x, p.z + dz)) p.z += dz
  if (!free(p.x, p.z)) { // preso (ex.: a porta ou o portão fechou em cima de você): vai pro ponto livre mais próximo
    out: for (let r = 0.1; r <= 1.6; r += 0.1) for (let k = 0; k < 16; k++) {
      const nx = p.x + Math.cos((k * Math.PI) / 8) * r, nz = p.z + Math.sin((k * Math.PI) / 8) * r
      if (free(nx, nz)) { p.x = nx; p.z = nz; break out }
    }
  }
  if (state.until && now > state.until) { state.until = 0; state.speed = 1; state.eye = 1.07; toast('O efeito do código acabou.') }
  camera.position.set(p.x, state.eye, p.z)
  camera.rotation.set(p.pitch, p.yaw, 0, 'YXZ')
  props.update(dt)
  net.update(dt, p)
  if (!mapMode) updateInteract(scene, camera)
  smoll.update(dt, now / 1000, p.x, p.z)
  if (mapMode) {
    marker.position.x = p.x; marker.position.z = p.z; marker.rotation.y = p.yaw
    ROOMS.forEach(([, x, z], i) => { // rótulos HTML sobre o mapa
      const v = new THREE.Vector3(x, 0, z).project(mapCam)
      const el = labels.children[i] as HTMLElement
      el.style.left = `${(v.x * 0.5 + 0.5) * 100}%`; el.style.top = `${(-v.y * 0.5 + 0.5) * 100}%`
    })
  }
  renderer.render(scene, mapMode ? mapCam : camera)
})
