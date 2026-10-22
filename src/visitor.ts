import * as THREE from 'three'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import { buildRig, restPose, clonePose, lerpPose, type SkelSpec, type Pose, type V3 } from './rig'
import { walkPose } from './walk'

// Modelo dos visitantes (jogadores remotos): Hunyuan3D de `public/models/visitante_real_hq.glb`, mesmo método de rig do Smoll.
// Juntas medidas na malha (espaço nativo do GLB). Se o arquivo não existir, net.ts usa o boneco simples.
export const VISITOR_SKEL: SkelSpec = {
  name: 'visitante', k: 1, hand: [0.30, 0.33, 0.05, 0.2, -0.45, -0.3],   // medido na malha: braços abertos ~25°, colete e camuflagem
  JL: {
    sh: [0.31, 0.50, 0.0], el: [0.405, 0.15, 0.0], wr: [0.395, -0.06, 0.02], ha: [0.385, -0.17, 0.03],
    hp: [0.14, -0.17, -0.02], kn: [0.18, -0.58, -0.03], an: [0.20, -0.90, -0.05], to: [0.22, -0.98, 0.14],
  },
  core: { hips: [0, -0.15, 0], spine: [0, -0.03, 0], chest: [0, 0.25, 0], neck: [0, 0.6, 0], head: [0, 0.67, 0.03] },
}
export const HEIGHT = 1.15  // altura do visitante em metros (os olhos do jogador ficam a 1,07 m; o Smoll tem 1,75 m)
const NATIVE_H = 1.987 // altura da malha nativa (y de -0,999 a 0,988)

let geometry: THREE.BufferGeometry | null = null
let map: THREE.Texture | null = null
let loading: Promise<boolean> | null = null
export const visitorReady = () => !!geometry

export function loadVisitorModel() {
  return (loading ??= new Promise<boolean>((res) => {
    new GLTFLoader().load('/models/visitante_real_hq.glb', (gltf) => {
      let src: THREE.Mesh | undefined
      gltf.scene.traverse((o) => { if (!src && (o as THREE.Mesh).isMesh) src = o as THREE.Mesh })
      if (!src) return res(false)
      src.geometry.computeVertexNormals() // o GLB do Hunyuan vem sem normais
      geometry = src.geometry; map = (src.material as THREE.MeshStandardMaterial).map
      res(true)
    }, undefined, () => res(false))
  }))
}

const REST = restPose(VISITOR_SKEL)
const mix = (a: V3, b: V3, k: number): V3 => [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k, a[2] + (b[2] - a[2]) * k]
const sm = (k: number) => { k = Math.min(1, Math.max(0, k)); return k * k * (3 - 2 * k) }
// o braço do visitante é separado do tronco, então dá pra fazer gestos grandes parado
type Idle = 'olhar' | 'coçar' | 'acenar' | 'cintura' | 'alongar' | 'celular' | 'balançar' | 'aplaudir' | 'dançar' | 'rir' | 'apontar'
const IDLES: Idle[] = ['olhar', 'coçar', 'acenar', 'cintura', 'alongar', 'celular', 'balançar']
const DUR: Record<Idle, number> = { olhar: 3.5, coçar: 2.6, acenar: 2.6, cintura: 3.5, alongar: 3, celular: 4.5, balançar: 3.5, aplaudir: 3.2, dançar: 5, rir: 2.6, apontar: 2.6 }
const EMOTES: Record<string, Idle> = { acenar: 'acenar', aplaudir: 'aplaudir', dancar: 'dançar', rir: 'rir', apontar: 'apontar' } // nomes que vêm da rede
function idleMod(c: Idle, t: number, p: Pose) {
  const d = DUR[c], k = sm(Math.min(t / 0.5, (d - t) / 0.5, 1)), L = p.L, R = p.R // R = braço direito do personagem (x negativo)
  switch (c) {
    case 'olhar': p.hy += Math.sin(t * 1.8) * 0.8 * k; p.hp += Math.sin(t * 1.1) * 0.1 * k; break
    case 'coçar': R.u = mix(R.u, [-0.3, -0.55, 0.6], k); R.f = mix(R.f, [0.35 + Math.sin(t * 14) * 0.12, 0.95, 0.3], k); R.h = R.f; p.hr += 0.1 * k; break
    case 'acenar': R.u = mix(R.u, [-0.85, 0.25, 0.25], k); R.f = mix(R.f, [-0.2 + Math.sin(t * 9) * 0.55, 0.95, 0.1], k); R.h = R.f; p.hy += 0.2 * k; break
    case 'cintura': L.u = mix(L.u, [0.5, -0.75, 0.1], k); L.f = mix(L.f, [-0.55, -0.45, 0.35], k); R.u = mix(R.u, [-0.5, -0.75, 0.1], k); R.f = mix(R.f, [0.55, -0.45, 0.35], k); p.hy += Math.sin(t * 1.5) * 0.4 * k; p.lean -= 0.05 * k; break
    case 'alongar': L.u = mix(L.u, [0.3, 1, 0.1], k); R.u = mix(R.u, [-0.3, 1, 0.1], k); L.f = mix(L.f, [0.1, 1, 0], k); R.f = mix(R.f, [-0.1, 1, 0], k); L.h = L.f; R.h = R.f; p.lean -= 0.15 * k; p.hp -= 0.25 * k; break
    case 'celular': L.u = mix(L.u, [0.2, -0.9, 0.35], k); L.f = mix(L.f, [-0.55, 0.2, 0.9], k); R.u = mix(R.u, [-0.2, -0.9, 0.35], k); R.f = mix(R.f, [0.55, 0.2, 0.9], k); L.h = L.f; R.h = R.f; p.hp += 0.4 * k; p.lean += 0.08 * k; break
    case 'aplaudir': { const c = Math.sin(t * 16) * 0.5 + 0.5; L.u = mix(L.u, [0.25, -0.3, 0.9], k); L.f = mix(L.f, [-0.95 + c * 0.4, 0.1, 0.35], k); R.u = mix(R.u, [-0.25, -0.3, 0.9], k); R.f = mix(R.f, [0.95 - c * 0.4, 0.1, 0.35], k); L.h = L.f; R.h = R.f; break }
    case 'dançar': { const s = Math.sin(t * 6); p.rx += s * 0.04; p.side += s * 0.2; p.hr += s * 0.1; L.u = mix(L.u, [0.6, 0.7 + s * 0.3, 0.2], k); L.f = mix(L.f, [0.4, 1, 0.1], k); R.u = mix(R.u, [-0.6, 0.7 - s * 0.3, 0.2], k); R.f = mix(R.f, [-0.4, 1, 0.1], k); L.h = L.f; R.h = R.f; break }
    case 'rir': p.lean -= (0.15 + Math.sin(t * 18) * 0.04) * k; p.hp -= 0.2 * k; L.u = mix(L.u, [0.4, -0.7, 0.3], k); L.f = mix(L.f, [-0.5, -0.4, 0.5], k); R.u = mix(R.u, [-0.4, -0.7, 0.3], k); R.f = mix(R.f, [0.5, -0.4, 0.5], k); break
    case 'apontar': R.u = mix(R.u, [-0.1, 0.05, 1], k); R.f = mix(R.f, [-0.05, 0, 1], k); R.h = R.f; p.hy -= 0.2 * k; break
    case 'balançar': p.rx += Math.sin(t * 1.7) * 0.03 * k; p.side += Math.sin(t * 1.7) * 0.05 * k; p.hr += Math.sin(t * 1.7) * 0.05 * k; break
  }
}
// sentado (sofá, cadeira, banco): bacia mais baixa, coxas pra frente, canelas pra baixo, mãos no colo
const SIT_V = (() => {
  const p = clonePose(REST)
  p.ry = -0.25; p.lean = 0.05
  p.TL = [0.08, -0.1, 1]; p.SL = [0.02, -1, 0.08]; p.FL = [0, -0.2, 1]; p.TR = [-0.08, -0.1, 1]; p.SR = [-0.02, -1, 0.08]; p.FR = [0, -0.2, 1]
  p.L.u = [0.18, -0.9, 0.3]; p.L.f = [-0.2, -0.4, 0.9]; p.L.h = p.L.f; p.R.u = [-0.18, -0.9, 0.3]; p.R.f = [0.2, -0.4, 0.9]; p.R.h = p.R.f
  return p
})()
// agachado (Shift): bacia baixa, coxas pra frente e pra baixo, canelas dobradas pra trás (os pés ficam no chão), tronco inclinado, braços um pouco à frente
const CROUCH_V = (() => {
  const p = clonePose(REST)
  p.ry = -0.3; p.lean = 0.22; p.hp = -0.12
  p.TL = [0.04, -0.42, 0.91]; p.SL = [0.02, -0.8, -0.6]; p.TR = [-0.04, -0.42, 0.91]; p.SR = [-0.02, -0.8, -0.6]
  p.L.u = [0.2, -0.85, 0.45]; p.L.f = [-0.15, -0.55, 0.8]; p.L.h = p.L.f; p.R.u = [-0.2, -0.85, 0.45]; p.R.f = [0.15, -0.55, 0.8]; p.R.h = p.R.f
  return p
})()
export function createVisitor() {
  if (!geometry) return null
  const rig = buildRig(geometry, new THREE.MeshLambertMaterial({ map }), VISITOR_SKEL)
  const holder = new THREE.Group(); holder.rotation.y = Math.PI           // o modelo olha pra +z; o grupo olha pra -z (yaw 0)
  const s = HEIGHT / NATIVE_H
  const mw = new THREE.Group(); mw.scale.setScalar(s); mw.position.y = 0.999 * s; mw.add(rig.mesh); holder.add(mw)
  const cur = clonePose(REST)
  let crAmt = 0, phase = 0, idle: Idle | null = null, idleT = 0, nextIdle = 2 + Math.random() * 4, forced = false
  return {
    object: holder,
    /** speed em m/s; chamado todo frame */
    /** gesto vindo da rede ('acenar' | 'aplaudir' | 'dancar' | 'rir' | 'apontar') */
    emote(name: string) { const k = EMOTES[name]; if (k) { idle = k; idleT = 0; forced = true } },
    update(dt: number, t: number, speed: number, sitting = false, crouching = false) {
      crAmt += ((crouching && !sitting ? 1 : 0) - crAmt) * Math.min(1, dt * 9)
      const amp = Math.min(1, speed / 2.2)
      phase += dt * (2 + speed * 2.2)
      const pose = sitting ? clonePose(SIT_V) : walkPose(REST, phase, amp * (1 - 0.55 * crAmt), t)
      if (crAmt > 0.01) lerpPose(pose, CROUCH_V, crAmt) // agachado: a pose de agachar domina, o passo fica curto
      if (forced && idle) { // gesto escolhido pelo jogador: roda até o fim, andando ou parado
        idleT += dt; idleMod(idle, idleT, pose); if (idleT > DUR[idle]) { idle = null; forced = false; nextIdle = 3 + Math.random() * 6 }
      } else if (sitting) {
        pose.lean += Math.sin(t * 1.3) * 0.01
      } else if (amp < 0.05) { // parado: de tempos em tempos faz algo (olha em volta, coça a cabeça, mexe no celular...)
        if (!idle && (nextIdle -= dt) <= 0) { idle = IDLES[Math.floor(Math.random() * IDLES.length)]; idleT = 0 }
        if (idle) { idleT += dt; idleMod(idle, idleT, pose); if (idleT > DUR[idle]) { idle = null; nextIdle = 3 + Math.random() * 6 } }
        pose.lean += Math.sin(t * 1.3) * 0.01; pose.side += Math.sin(t * 0.8) * 0.012 // respira e balança de leve
      } else { idle = null; nextIdle = 2 + Math.random() * 4 }
      lerpPose(cur, pose, 1 - Math.exp(-dt * 8))
      rig.apply(cur)
    },
  }
}
