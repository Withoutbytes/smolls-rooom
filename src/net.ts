import * as THREE from 'three'
import { clock, state, WS_URL, shared } from './state'
import { loadVisitorModel, createVisitor, visitorReady, HEIGHT } from './visitor'

// Multiplayer: manda a posição ~15x/s e desenha os outros jogadores (corpo simples + nome). Sem servidor, segue single player.
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
  const others = new Map<string, { g: THREE.Group; x: number; y: number; z: number; yaw: number; v: ReturnType<typeof createVisitor>; speed: number; parts: THREE.Object3D[]; name: string; sit?: boolean; en?: number; c?: boolean }>()
  let seenEmote = 0, selfV: ReturnType<typeof createVisitor> = null, selfG: THREE.Group | null = null, lastX = 0, lastZ = 0, selfSpeed = 0
  loadVisitorModel() // modelo realista dos visitantes; até carregar (ou se faltar o arquivo) usa o boneco simples
  let ws: WebSocket | null = null, self = '', sendT = 0, lastMsg = '', lastAt = 0
  const open = () => {
    try { ws = new WebSocket(WS_URL) } catch { return }
    ws.onmessage = (e) => {
      const m = JSON.parse(e.data)
      if (m.h !== undefined) { clock.h = m.h; clock.at = performance.now() } // hora do servidor
      if (m.t === 'hi') { self = m.id; for (const [k, v] of Object.entries(m.sh ?? {})) applyShared(k, v); return } // quem entra depois recebe o mundo como está
      if (m.t === 'sh') { applyShared(m.k, m.v); return }
      if (m.t === 'cmd') { state.cmd(m.c); return } // pedido de outro jogador pro Smoll (só o anfitrião recebe)
      state.smollHost = m.hid === self; state.smollRemote = m.sm ?? null
      const seen = new Set<string>(), taken = new Set<string>()
      for (const q of m.p as { id: string; x: number; y?: number; z: number; yaw: number; name: string; sit?: string; e?: string; en?: number; c?: number }[]) {
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
          others.set(q.id, (o = { g, x: q.x, y: q.y ?? 0, z: q.z, yaw: q.yaw, v, speed: 0, parts, name: q.name }))
        }
        o.x = q.x; o.y = q.y ?? 0; o.z = q.z; o.yaw = q.yaw
        o.sit = !!q.sit; o.c = !!q.c; if (q.sit) taken.add(q.sit)
        if (q.en !== undefined && q.en !== o.en) { if (o.en !== undefined && q.e) o.v?.emote(q.e); o.en = q.en } // gesto novo
      }
      state.takenSeats = taken
      for (const [id, o] of others) if (!seen.has(id)) { scene.remove(o.g); others.delete(id) }
    }
    ws.onclose = () => { state.smollHost = true; state.smollRemote = null; others.forEach((o) => scene.remove(o.g)); others.clear(); setTimeout(open, 3000) } // tenta reconectar
  }
  const applyShared = (k: string, v: unknown) => { const s = shared.get(k); if (s) { s.last = v; if (s.get() !== v) s.set(v) } }
  state.smollCmd = (c) => { if (ws?.readyState === 1) ws.send(JSON.stringify({ cmd: c })) }
  let shT = 0
  open()
  return {
    update(dt: number, p: { x: number; y: number; z: number; yaw: number; crouch?: number }) {
      // avatar do próprio jogador (invisível; o espelho liga ele só na hora de desenhar o reflexo)
      if (!selfV && visitorReady()) { selfV = createVisitor(); if (selfV) { selfG = new THREE.Group(); selfG.add(selfV.object); selfG.visible = false; scene.add(selfG); state.avatar = selfG } }
      if (selfV && selfG) {
        selfSpeed += (Math.hypot(p.x - lastX, p.z - lastZ) / Math.max(dt, 1e-3) - selfSpeed) * Math.min(1, dt * 8); lastX = p.x; lastZ = p.z
        selfG.position.set(p.x, p.y, p.z); selfG.rotation.y = p.yaw
        if (state.myEmote.n !== seenEmote) { seenEmote = state.myEmote.n; selfV.emote(state.myEmote.id) } // seu gesto aparece no espelho
        selfV.update(dt, performance.now() / 1000, selfSpeed > 0.15 && selfSpeed < 8 ? selfSpeed : 0, !!state.seat, (p.crouch ?? 0) > 0.5)
      }
      if (ws?.readyState === 1 && (shT += dt) > 0.2) { // vigia mudanças locais no mundo e manda
        shT = 0
        for (const [k, s] of shared) { const v = s.get(); if (v !== s.last) { s.last = v; ws.send(JSON.stringify({ sh: { k, v } })) } }
      }
      if (ws?.readyState === 1 && (sendT += dt) > 0.066) {
        sendT = 0
        const msg = JSON.stringify({ sm: state.smollHost ? state.smollOut : undefined, x: +p.x.toFixed(2), y: +p.y.toFixed(2), z: +p.z.toFixed(2), yaw: +p.yaw.toFixed(2), name, sit: state.seat?.key ?? '', e: state.myEmote.id, en: state.myEmote.n, c: (p.crouch ?? 0) > 0.5 })
        const now = performance.now()
        if (msg !== lastMsg || now - lastAt > 1000) { lastMsg = msg; lastAt = now; ws.send(msg) } // parado: só 1 msg/s
      }
      for (const o of others.values()) { // suaviza entre as mensagens
        const k = Math.min(1, dt * 12), px = o.g.position.x, pz = o.g.position.z
        o.g.position.x += (o.x - px) * k; o.g.position.z += (o.z - pz) * k; o.g.position.y += (o.y - o.g.position.y) * k; o.g.rotation.y += (o.yaw - o.g.rotation.y) * k
        o.speed += (Math.hypot(o.g.position.x - px, o.g.position.z - pz) / Math.max(dt, 1e-3) - o.speed) * Math.min(1, dt * 8) // m/s suavizado
        if (!o.v && visitorReady()) { // o modelo terminou de carregar depois do jogador entrar: troca o boneco simples pelo soldado rigado
          const v = createVisitor()
          if (v) { o.parts.forEach((m) => o.g.remove(m)); o.g.scale.setScalar(1); o.g.add(v.object, nameTag(o.name, HEIGHT + 0.3)); o.v = v }
        }
        o.v?.update(dt, performance.now() / 1000, o.speed > 0.15 ? o.speed : 0, !!o.sit, !!o.c)
      }
    },
  }
}
