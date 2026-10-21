import * as THREE from 'three'
import { loadVisitorModel, createVisitor, visitorReady, HEIGHT } from './visitor'

// Multiplayer: manda a posição ~15x/s e desenha os outros jogadores (corpo simples + nome). Sem servidor, segue single player.
const PORT = 8080
const SCALE = 0.6 // tamanho do boneco simples (1 = 1,7 m); o visitante rigado usa HEIGHT de visitor.ts
const color = (id: string) => new THREE.Color().setHSL(((+id * 0.37) % 1 + 1) % 1, 0.6, 0.5)

function nameTag(name: string, y = 1.95) {
  const c = document.createElement('canvas'); c.width = 256; c.height = 64
  const g = c.getContext('2d')!
  g.fillStyle = '#000a'; g.fillRect(0, 8, 256, 48); g.fillStyle = '#fff'; g.font = 'bold 28px sans-serif'; g.textAlign = 'center'; g.fillText(name, 128, 44)
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(c), depthTest: false })); s.scale.set(0.8, 0.2, 1); s.position.y = y
  return s
}

export function connectNet(scene: THREE.Scene) {
  const name = (() => { try { return (localStorage.smollName ??= 'Visitante' + (100 + Math.floor(Math.random() * 900))) } catch { return 'Visitante' } })()
  const others = new Map<string, { g: THREE.Group; x: number; z: number; yaw: number; v: ReturnType<typeof createVisitor>; speed: number; parts: THREE.Object3D[]; name: string }>()
  loadVisitorModel() // modelo realista dos visitantes; até carregar (ou se faltar o arquivo) usa o boneco simples
  let ws: WebSocket | null = null, self = '', sendT = 0
  const open = () => {
    try { ws = new WebSocket(`ws://${location.hostname}:${PORT}`) } catch { return }
    ws.onmessage = (e) => {
      const m = JSON.parse(e.data)
      if (m.t === 'hi') { self = m.id; return }
      const seen = new Set<string>()
      for (const q of m.p as { id: string; x: number; z: number; yaw: number; name: string }[]) {
        if (q.id === self) continue
        seen.add(q.id)
        let o = others.get(q.id)
        if (!o) {
          const g = new THREE.Group()
          const v = createVisitor()
          const parts: THREE.Object3D[] = []
          if (v) { g.add(v.object, nameTag(q.name, HEIGHT + 0.3)) }
          else {
            const body = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.26, 1.1, 12), new THREE.MeshLambertMaterial({ color: color(q.id) })); body.position.y = 0.75
            const head = new THREE.Mesh(new THREE.SphereGeometry(0.17, 12, 10), new THREE.MeshLambertMaterial({ color: 0xc68e65 })); head.position.y = 1.52
            const tag = nameTag(q.name); parts.push(body, head, tag); g.add(body, head, tag); g.scale.setScalar(SCALE)
          }
          g.position.set(q.x, 0, q.z); scene.add(g)
          others.set(q.id, (o = { g, x: q.x, z: q.z, yaw: q.yaw, v, speed: 0, parts, name: q.name }))
        }
        o.x = q.x; o.z = q.z; o.yaw = q.yaw
      }
      for (const [id, o] of others) if (!seen.has(id)) { scene.remove(o.g); others.delete(id) }
    }
    ws.onclose = () => { others.forEach((o) => scene.remove(o.g)); others.clear(); setTimeout(open, 3000) } // tenta reconectar
  }
  open()
  return {
    update(dt: number, p: { x: number; z: number; yaw: number }) {
      if (ws?.readyState === 1 && (sendT += dt) > 0.066) { sendT = 0; ws.send(JSON.stringify({ x: p.x, z: p.z, yaw: p.yaw, name })) }
      for (const o of others.values()) { // suaviza entre as mensagens
        const k = Math.min(1, dt * 12), px = o.g.position.x, pz = o.g.position.z
        o.g.position.x += (o.x - px) * k; o.g.position.z += (o.z - pz) * k; o.g.rotation.y += (o.yaw - o.g.rotation.y) * k
        o.speed += (Math.hypot(o.g.position.x - px, o.g.position.z - pz) / Math.max(dt, 1e-3) - o.speed) * Math.min(1, dt * 8) // m/s suavizado
        if (!o.v && visitorReady()) { // o modelo terminou de carregar depois do jogador entrar: troca o boneco simples pelo soldado rigado
          const v = createVisitor()
          if (v) { o.parts.forEach((m) => o.g.remove(m)); o.g.scale.setScalar(1); o.g.add(v.object, nameTag(o.name, HEIGHT + 0.3)); o.v = v }
        }
        o.v?.update(dt, performance.now() / 1000, o.speed > 0.15 ? o.speed : 0)
      }
    },
  }
}
